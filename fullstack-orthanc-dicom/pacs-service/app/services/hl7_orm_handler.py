"""
HL7 ORM Handler Service
Processes ORM (Order Management) messages
"""

import logging
from datetime import datetime
from typing import Optional, Dict, Any, Tuple
from sqlalchemy.orm import Session

from app.services.hl7_parser import HL7ParserService
from app.services.hl7_ack_builder import HL7AckBuilderService
from app.services.hl7_error_handler import HL7ErrorHandlerService
from app.services.hl7_order_service import HL7OrderService
from app.models.hl7_message import HL7Message
from app.models.fhir_resource import FHIRConfig

logger = logging.getLogger(__name__)


class HL7ORMHandlerService:
    """
    Handler for HL7 ORM (Order Management) messages
    Supports O01 (Order Message) with various order control codes
    """

    # Supported ORM trigger events
    SUPPORTED_TRIGGERS = ['O01']

    # Supported order control codes
    ORDER_CONTROL_CODES = {
        'NW': 'New Order',
        'CA': 'Cancel Order',
        'DC': 'Discontinue Order',
        'SC': 'Status Changed',
        'OC': 'Order Canceled',
        'XO': 'Change Order'
    }

    def __init__(self, db: Session):
        self.db = db
        self.parser = HL7ParserService()
        self.ack_builder = HL7AckBuilderService()
        self.error_handler = HL7ErrorHandlerService(db)
        self.order_service = HL7OrderService(db)

    async def process_orm_message(
        self,
        raw_message: str,
        http_context: Optional[Dict[str, Any]] = None
    ) -> Tuple[Optional[HL7Message], str]:
        """
        Process ORM message and create/update/cancel order

        Args:
            raw_message: Raw HL7 ORM message
            http_context: HTTP request context

        Returns:
            Tuple of (HL7Message object, ACK message string)
        """
        hl7_message = None
        processing_started_at = datetime.now()

        try:
            logger.info("Processing ORM message")

            # Parse message
            parsed_message, parsed_data = self.parser.parse(raw_message)

            if not parsed_message:
                raise ValueError("Failed to parse HL7 message")

            # Extract message header info from parsed_data
            message_control_id = parsed_data.get('message_control_id')
            message_type = parsed_data.get('message_type')
            message_trigger = parsed_data.get('message_trigger')
            sending_application = parsed_data.get('sending_application')
            sending_facility = parsed_data.get('sending_facility')

            # Validate message type
            if message_type != 'ORM':
                error_msg = f"Invalid message type: {message_type}, expected ORM"
                logger.error(error_msg)
                ack_message = self.ack_builder.build_ack(
                    parsed_message, 'AE', error_msg
                )
                return None, ack_message

            # Validate trigger event
            if message_trigger not in self.SUPPORTED_TRIGGERS:
                error_msg = f"Unsupported ORM trigger: {message_trigger}"
                logger.error(error_msg)
                ack_message = self.ack_builder.build_ack(
                    parsed_message, 'AE', error_msg
                )
                return None, ack_message

            # Extract patient and order info
            patient_id = parsed_data.get('PID', {}).get('patient_id')
            patient_name = parsed_data.get('PID', {}).get('patient_name', '')
            accession_number = parsed_data.get('OBR', {}).get('filler_order_number', '')
            placer_order_number = parsed_data.get('ORC', {}).get('placer_order_number', '')
            order_control = parsed_data.get('ORC', {}).get('order_control', 'NW')

            # Validate order control code
            if order_control not in self.ORDER_CONTROL_CODES:
                error_msg = f"Unsupported order control code: {order_control}"
                logger.error(error_msg)
                ack_message = self.ack_builder.build_ack(
                    parsed_message, 'AE', error_msg
                )
                return None, ack_message

            # Create HL7 message record
            hl7_message = HL7Message(
                message_control_id=message_control_id,
                message_type=message_type,
                message_trigger=message_trigger,
                raw_message=raw_message,
                parsed_message=parsed_data,
                status='PROCESSING',
                sending_application=sending_application,
                sending_facility=sending_facility,
                patient_id=patient_id,
                patient_name=patient_name,
                accession_number=accession_number or placer_order_number,
                processing_started_at=processing_started_at
            )

            # Add HTTP context if available
            if http_context:
                hl7_message.http_method = http_context.get('method')
                hl7_message.http_path = http_context.get('path')

            self.db.add(hl7_message)
            self.db.commit()
            self.db.refresh(hl7_message)

            logger.info(f"Created HL7 message record: {hl7_message.id}")

            # Process based on order control code
            success = False
            order_id = None
            hl7_source_system = f"{sending_application}|{sending_facility}"

            if order_control == 'NW':
                # New Order
                order_id = await self.order_service.create_order_from_hl7(
                    hl7_message_id=str(hl7_message.id),
                    parsed_data=parsed_data,
                    hl7_source_system=hl7_source_system
                )
                success = order_id is not None

            elif order_control in ['SC', 'XO']:
                # Status Change or Change Order
                success = await self.order_service.update_order_from_hl7(
                    hl7_message_id=str(hl7_message.id),
                    parsed_data=parsed_data,
                    hl7_source_system=hl7_source_system
                )

            elif order_control in ['CA', 'DC', 'OC']:
                # Cancel or Discontinue Order
                cancel_reason = parsed_data.get('ORC', {}).get('order_status_modifier')
                success = await self.order_service.cancel_order_from_hl7(
                    hl7_message_id=str(hl7_message.id),
                    parsed_data=parsed_data,
                    reason=cancel_reason
                )

            if success:
                # Update HL7 message status to PROCESSED
                hl7_message.status = 'PROCESSED'
                hl7_message.ack_code = 'AA'
                hl7_message.order_id = order_id
                hl7_message.processing_completed_at = datetime.now()

                self.db.commit()

                # Build ACK message
                ack_message = self.ack_builder.build_ack(
                    parsed_message,
                    'AA',
                    f"Order {self.ORDER_CONTROL_CODES[order_control]} processed successfully"
                )

                logger.info(f"ORM message processed successfully: {message_control_id}")

                # Trigger FHIR conversion if enabled
                self._trigger_fhir_conversion(hl7_message, parsed_data, order_id)

                return hl7_message, ack_message

            else:
                # Processing failed
                error_msg = f"Failed to {self.ORDER_CONTROL_CODES[order_control].lower()}"
                logger.error(f"{error_msg}: {placer_order_number}")

                hl7_message.status = 'FAILED'
                hl7_message.ack_code = 'AE'
                hl7_message.error_message = error_msg
                hl7_message.processing_completed_at = datetime.now()

                self.db.commit()

                ack_message = self.ack_builder.build_ack(
                    parsed_message, 'AE', error_msg
                )

                return hl7_message, ack_message

        except Exception as e:
            error_msg = f"Failed to process ORM message: {str(e)}"
            logger.error(error_msg, exc_info=True)

            if hl7_message:
                hl7_message.status = 'FAILED'
                hl7_message.ack_code = 'AE'
                hl7_message.error_message = str(e)
                hl7_message.error_details = {'exception': str(e), 'type': type(e).__name__}
                hl7_message.processing_completed_at = datetime.now()

                self.db.commit()

                # Log error
                await self.error_handler.handle_error(
                    hl7_message_id=str(hl7_message.id),
                    error_code=self.error_handler.ERROR_PROCESSING_FAILED,
                    error_message=str(e),
                    exception=e
                )

                # Try to build ACK with parsed message
                try:
                    if 'parsed_message' in locals() and parsed_message:
                        ack_message = self.ack_builder.build_ack(
                            parsed_message, 'AE', str(e)
                        )
                    else:
                        ack_message = self._build_fallback_ack('AE', str(e))
                except Exception:
                    ack_message = self._build_fallback_ack('AE', str(e))

                return hl7_message, ack_message

            else:
                # Message couldn't be created, return fallback ACK
                ack_message = self._build_fallback_ack('AE', str(e))
                return None, ack_message

    async def get_order_history(
        self,
        placer_order_number: str,
        limit: int = 20
    ) -> list:
        """
        Get ORM message history for a specific order

        Args:
            placer_order_number: Placer order number
            limit: Maximum number of records

        Returns:
            List of HL7 messages for the order
        """
        try:
            messages = self.db.query(HL7Message).filter(
                HL7Message.message_type == 'ORM',
                HL7Message.parsed_message['ORC']['placer_order_number'].astext == placer_order_number
            ).order_by(
                HL7Message.created_at.desc()
            ).limit(limit).all()

            return [msg.to_list_dict() for msg in messages]

        except Exception as e:
            logger.error(f"Failed to get order history: {str(e)}")
            return []

    def _restructure_for_fhir(self, message_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Restructure flattened message data into segmented format for FHIR converter

        Args:
            message_data: Flattened message data from HL7 parser

        Returns:
            Segmented data structure expected by FHIR converter
        """
        restructured = {}

        # PID Segment - Patient Identification
        pid_fields = {}
        for key in ['patient_id', 'patient_mrn', 'patient_name', 'patient_birth_date',
                    'patient_gender', 'patient_address', 'patient_phone', 'patient_ssn']:
            if key in message_data:
                pid_fields[key] = message_data[key]

        if pid_fields:
            restructured['PID'] = pid_fields

        # ORC Segment - Common Order
        orc_fields = {}
        for key in ['order_control', 'placer_order_number', 'filler_order_number',
                    'order_status', 'quantity_timing', 'ordering_provider_id',
                    'ordering_provider_name', 'order_effective_datetime', 'entering_organization']:
            if key in message_data:
                orc_fields[key] = message_data[key]

        if orc_fields:
            restructured['ORC'] = orc_fields

        # OBR Segment - Observation Request
        obr_fields = {}
        for key in ['accession_number', 'universal_service_id', 'procedure_code',
                    'procedure_name', 'order_priority', 'requested_datetime', 'modality']:
            if key in message_data:
                obr_fields[key] = message_data[key]

        if obr_fields:
            restructured['OBR'] = obr_fields

        # MSH Segment - Message Header
        msh_fields = {}
        for key in ['message_type', 'message_trigger', 'message_control_id', 'message_version',
                    'sending_application', 'sending_facility']:
            if key in message_data:
                msh_fields[key] = message_data[key]

        if msh_fields:
            restructured['MSH'] = msh_fields

        return restructured

    def _trigger_fhir_conversion(
        self,
        hl7_message: HL7Message,
        parsed_data: Dict[str, Any],
        order_id: Optional[str] = None
    ) -> None:
        """
        Trigger FHIR conversion for processed ORM message

        Args:
            hl7_message: Processed HL7 message
            parsed_data: Parsed message data
            order_id: Created/Updated order ID
        """
        try:
            # Check if FHIR auto-conversion is enabled
            config = self.db.query(FHIRConfig).filter(
                FHIRConfig.config_key == 'fhir.auto_convert_hl7'
            ).first()

            if config and config.get_typed_value():
                # Import here to avoid circular imports
                from app.tasks.fhir_tasks import convert_orm_to_fhir_async

                # Restructure flattened data into segmented format
                restructured_data = self._restructure_for_fhir(parsed_data)

                # Trigger async FHIR conversion
                convert_orm_to_fhir_async.delay(
                    parsed_data=restructured_data,
                    hl7_message_id=str(hl7_message.id),
                    order_id=order_id
                )

                logger.info(f"Triggered FHIR conversion for ORM message: {hl7_message.id}")

        except Exception as e:
            # Don't fail the main process if FHIR conversion fails
            logger.warning(f"Failed to trigger FHIR conversion: {str(e)}")

    def _build_fallback_ack(self, ack_code: str, error_message: str) -> str:
        """
        Build fallback ACK message when parsing fails

        Args:
            ack_code: ACK code (AA, AE, AR)
            error_message: Error message

        Returns:
            ACK message string
        """
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
        return (
            f"MSH|^~\\&|PACS|RADIOLOGY|HIS|HOSPITAL|{timestamp}||ACK^O01|ACK{timestamp}|P|2.5\r"
            f"MSA|{ack_code}|UNKNOWN|{error_message}\r"
        )
