"""
HL7 ORU Handler Service
Processes ORU (Observation Result, Unsolicited) messages
"""

import logging
from datetime import datetime
from typing import Optional, Dict, Any, Tuple, List
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.services.hl7_parser import HL7ParserService
from app.services.hl7_ack_builder import HL7AckBuilderService
from app.services.hl7_error_handler import HL7ErrorHandlerService
from app.models.hl7_message import HL7Message
from app.models.fhir_resource import FHIRConfig
from app.services.order_notification_service import OrderNotificationService

logger = logging.getLogger(__name__)


class HL7ORUHandlerService:
    """
    Handler for HL7 ORU (Observation Result, Unsolicited) messages
    Supports R01 (Unsolicited transmission of observation message)
    """

    # Supported ORU trigger events
    SUPPORTED_TRIGGERS = ['R01']

    # Observation result status mapping
    RESULT_STATUS_MAP = {
        'F': 'FINAL',           # Final results
        'P': 'PRELIMINARY',     # Preliminary results
        'C': 'CORRECTED',       # Corrected results
        'X': 'CANCELLED',       # Cancelled
        'I': 'IN_PROGRESS',     # In progress
        'S': 'PARTIAL'          # Partial results
    }

    def __init__(self, db: Session):
        self.db = db
        self.parser = HL7ParserService()
        self.ack_builder = HL7AckBuilderService()
        self.error_handler = HL7ErrorHandlerService(db)

    async def process_oru_message(
        self,
        raw_message: str,
        http_context: Optional[Dict[str, Any]] = None
    ) -> Tuple[Optional[HL7Message], str]:
        """
        Process ORU message and update order/study with results

        Args:
            raw_message: Raw HL7 ORU message
            http_context: HTTP request context

        Returns:
            Tuple of (HL7Message object, ACK message string)
        """
        hl7_message = None
        processing_started_at = datetime.now()

        try:
            logger.info("Processing ORU message")

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
            if message_type != 'ORU':
                error_msg = f"Invalid message type: {message_type}, expected ORU"
                logger.error(error_msg)
                ack_message = self.ack_builder.build_ack(
                    parsed_message, 'AE', error_msg
                )
                return None, ack_message

            # Validate trigger event
            if message_trigger not in self.SUPPORTED_TRIGGERS:
                error_msg = f"Unsupported ORU trigger: {message_trigger}"
                logger.error(error_msg)
                ack_message = self.ack_builder.build_ack(
                    parsed_message, 'AE', error_msg
                )
                return None, ack_message

            # Extract patient and order info
            patient_id = parsed_data.get('PID', {}).get('patient_id')
            patient_name = parsed_data.get('PID', {}).get('patient_name', '')

            # Get accession number and placer order number
            obr = parsed_data.get('OBR', {})
            accession_number = obr.get('filler_order_number', '')
            placer_order_number = parsed_data.get('ORC', {}).get('placer_order_number', '')

            # Get observation result status
            result_status_code = obr.get('result_status', 'F')
            result_status = self.RESULT_STATUS_MAP.get(result_status_code, 'FINAL')

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

            # Extract observation results
            observations = self._extract_observations(parsed_data)

            # Update order with results
            order_updated = await self._update_order_with_results(
                hl7_message_id=str(hl7_message.id),
                accession_number=accession_number,
                placer_order_number=placer_order_number,
                result_status=result_status,
                observations=observations,
                obr_data=obr
            )

            if order_updated:
                # Update HL7 message status to PROCESSED
                hl7_message.status = 'PROCESSED'
                hl7_message.ack_code = 'AA'
                hl7_message.processing_completed_at = datetime.now()

                self.db.commit()

                # Build ACK message
                ack_message = self.ack_builder.build_ack(
                    parsed_message,
                    'AA',
                    f"Observation results ({result_status}) processed successfully"
                )

                logger.info(f"ORU message processed successfully: {message_control_id}")

                # Trigger FHIR conversion if enabled
                self._trigger_fhir_conversion(hl7_message, parsed_data)

                return hl7_message, ack_message

            else:
                # Order not found or update failed
                error_msg = f"Order not found or update failed: {accession_number or placer_order_number}"
                logger.warning(error_msg)

                hl7_message.status = 'PROCESSED_WITH_WARNINGS'
                hl7_message.ack_code = 'AA'
                hl7_message.error_message = error_msg
                hl7_message.processing_completed_at = datetime.now()

                self.db.commit()

                ack_message = self.ack_builder.build_ack(
                    parsed_message,
                    'AA',
                    f"Results received but order not found: {error_msg}"
                )

                return hl7_message, ack_message

        except Exception as e:
            error_msg = f"Failed to process ORU message: {str(e)}"
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

    def _extract_observations(self, parsed_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Extract OBX (observation) segments from parsed data

        Args:
            parsed_data: Parsed HL7 message data

        Returns:
            List of observations
        """
        observations = []

        # Check if OBX is a list (multiple observations) or dict (single observation)
        obx_data = parsed_data.get('OBX')

        if obx_data:
            if isinstance(obx_data, list):
                # Multiple OBX segments
                for obx in obx_data:
                    obs = self._parse_obx_segment(obx)
                    if obs:
                        observations.append(obs)
            elif isinstance(obx_data, dict):
                # Single OBX segment
                obs = self._parse_obx_segment(obx_data)
                if obs:
                    observations.append(obs)

        return observations

    def _parse_obx_segment(self, obx: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Parse single OBX segment

        Args:
            obx: OBX segment data

        Returns:
            Parsed observation dict
        """
        try:
            return {
                'set_id': obx.get('set_id'),
                'value_type': obx.get('value_type', 'TX'),  # TX=Text, FT=Formatted Text, etc.
                'observation_identifier': obx.get('observation_identifier'),
                'observation_sub_id': obx.get('observation_sub_id'),
                'observation_value': obx.get('observation_value'),
                'units': obx.get('units'),
                'reference_range': obx.get('reference_range'),
                'abnormal_flags': obx.get('abnormal_flags'),
                'observation_result_status': obx.get('observation_result_status', 'F'),
                'observation_datetime': obx.get('observation_datetime')
            }
        except Exception as e:
            logger.error(f"Failed to parse OBX segment: {str(e)}")
            return None

    async def _update_order_with_results(
        self,
        hl7_message_id: str,
        accession_number: Optional[str],
        placer_order_number: Optional[str],
        result_status: str,
        observations: List[Dict[str, Any]],
        obr_data: Dict[str, Any]
    ) -> bool:
        """
        Update order with observation results

        Args:
            hl7_message_id: HL7 message ID
            accession_number: Accession number
            placer_order_number: Placer order number
            result_status: Result status (FINAL, PRELIMINARY, etc.)
            observations: List of observations
            obr_data: OBR segment data

        Returns:
            True if successful, False otherwise
        """
        try:
            # Build search condition
            if not accession_number and not placer_order_number:
                logger.error("Neither accession_number nor placer_order_number provided")
                return False

            # Prepare observation text for clinical_notes
            observation_text = self._format_observations_text(observations)

            # Extract additional OBR fields
            observation_datetime = obr_data.get('observation_datetime')
            ordering_provider = obr_data.get('ordering_provider_name')
            technician = obr_data.get('technician')
            principal_result_interpreter = obr_data.get('principal_result_interpreter')

            # Build dynamic query based on available identifiers
            where_clause = []
            params = {
                'hl7_message_id': hl7_message_id,
                'result_status': result_status,
                'observation_text': observation_text,
                'observation_datetime': observation_datetime,
                'ordering_provider': ordering_provider
            }

            if accession_number:
                where_clause.append("accession_number = :accession_number")
                params['accession_number'] = accession_number

            if placer_order_number:
                where_clause.append("placer_order_number = :placer_order_number")
                params['placer_order_number'] = placer_order_number

            where_sql = " OR ".join(where_clause)

            # Map result status to order status
            order_status_map = {
                'FINAL': 'COMPLETED',
                'PRELIMINARY': 'IN_PROGRESS',
                'CORRECTED': 'COMPLETED',
                'CANCELLED': 'CANCELLED',
                'IN_PROGRESS': 'IN_PROGRESS',
                'PARTIAL': 'IN_PROGRESS'
            }
            new_order_status = order_status_map.get(result_status, 'COMPLETED')
            params['new_order_status'] = new_order_status

            # Update query
            query = text(f"""
                UPDATE orders
                SET
                    order_status = :new_order_status,
                    worklist_status = CASE
                        WHEN :result_status = 'FINAL' THEN 'REPORTED'
                        WHEN :result_status = 'PRELIMINARY' THEN 'IN_PROGRESS'
                        ELSE worklist_status
                    END,
                    imaging_status = CASE
                        WHEN :result_status IN ('FINAL', 'PRELIMINARY', 'CORRECTED') THEN 'COMPLETED'
                        ELSE imaging_status
                    END,
                    clinical_notes = CASE
                        WHEN clinical_notes IS NULL OR clinical_notes = '' THEN :observation_text
                        ELSE clinical_notes || E'\\n\\n--- HL7 ORU Results ---\\n' || :observation_text
                    END,
                    hl7_message_id = :hl7_message_id,
                    hl7_processed_at = NOW(),
                    hl7_sync_status = 'SYNCED',
                    ordering_physician_name = COALESCE(:ordering_provider, ordering_physician_name),
                    updated_at = NOW()
                WHERE ({where_sql})
                RETURNING id, accession_number, order_number
            """)

            result = self.db.execute(query, params)
            row = result.fetchone()

            if row:
                self.db.commit()
                logger.info(f"Order updated with ORU results: {row[1]} (ID: {row[0]})")

                # Notify completion/finalization
                try:
                    notifier = OrderNotificationService(self.db)
                    notifier.notify_order_completed(
                        order_id=str(row[0]),
                        context={
                            "accession_number": row[1],
                            "order_number": row[2],
                            "result_status": result_status,
                            "observation_count": len(observations),
                            "observation_datetime": observation_datetime,
                            "placer_order_number": placer_order_number
                        }
                    )
                except Exception as notify_error:
                    logger.warning(f"Completion notification failed: {notify_error}")

                return True
            else:
                logger.warning(f"No order found to update: accession={accession_number}, placer={placer_order_number}")
                return False

        except Exception as e:
            logger.error(f"Failed to update order with results: {str(e)}")
            self.db.rollback()
            return False

    def _format_observations_text(self, observations: List[Dict[str, Any]]) -> str:
        """
        Format observations into readable text

        Args:
            observations: List of observations

        Returns:
            Formatted text
        """
        if not observations:
            return ""

        lines = []
        for i, obs in enumerate(observations, 1):
            identifier = obs.get('observation_identifier', f'Observation {i}')
            value = obs.get('observation_value', '')
            units = obs.get('units', '')
            abnormal = obs.get('abnormal_flags', '')

            line = f"{identifier}: {value}"
            if units:
                line += f" {units}"
            if abnormal:
                line += f" [{abnormal}]"

            lines.append(line)

        return "\n".join(lines)

    async def get_results_history(
        self,
        accession_number: str,
        limit: int = 20
    ) -> list:
        """
        Get ORU message history for a specific study

        Args:
            accession_number: Accession number
            limit: Maximum number of records

        Returns:
            List of HL7 messages for the study
        """
        try:
            messages = self.db.query(HL7Message).filter(
                HL7Message.message_type == 'ORU',
                HL7Message.accession_number == accession_number
            ).order_by(
                HL7Message.created_at.desc()
            ).limit(limit).all()

            return [msg.to_list_dict() for msg in messages]

        except Exception as e:
            logger.error(f"Failed to get results history: {str(e)}")
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
                    'order_status', 'ordering_provider_id', 'ordering_provider_name']:
            if key in message_data:
                orc_fields[key] = message_data[key]

        if orc_fields:
            restructured['ORC'] = orc_fields

        # OBR Segment - Observation Request
        obr_fields = {}
        for key in ['accession_number', 'filler_order_number', 'placer_order_number',
                    'universal_service_id', 'observation_datetime', 'results_status',
                    'procedure_code', 'procedure_name']:
            if key in message_data:
                obr_fields[key] = message_data[key]

        if obr_fields:
            restructured['OBR'] = obr_fields

        # OBX Segment - Observations (can be multiple)
        if 'observations' in message_data:
            restructured['OBX'] = message_data['observations']

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
        parsed_data: Dict[str, Any]
    ) -> None:
        """
        Trigger FHIR conversion for processed ORU message

        Args:
            hl7_message: Processed HL7 message
            parsed_data: Parsed message data
        """
        try:
            # Check if FHIR auto-conversion is enabled
            config = self.db.query(FHIRConfig).filter(
                FHIRConfig.config_key == 'fhir.auto_convert_hl7'
            ).first()

            if config and config.get_typed_value():
                # Import here to avoid circular imports
                from app.tasks.fhir_tasks import convert_oru_to_fhir_async

                # Find order_id if available
                order_id = None
                accession_number = parsed_data.get('accession_number') or parsed_data.get('filler_order_number')
                if accession_number:
                    # Try to find order by accession number
                    result = self.db.execute(
                        text("SELECT id FROM orders WHERE accession_number = :acc LIMIT 1"),
                        {'acc': accession_number}
                    ).first()
                    if result:
                        order_id = str(result[0])

                # Restructure flattened data into segmented format
                restructured_data = self._restructure_for_fhir(parsed_data)

                # Trigger async FHIR conversion
                convert_oru_to_fhir_async.delay(
                    parsed_data=restructured_data,
                    hl7_message_id=str(hl7_message.id),
                    order_id=order_id
                )

                logger.info(f"Triggered FHIR conversion for ORU message: {hl7_message.id}")

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
            f"MSH|^~\\&|PACS|RADIOLOGY|HIS|HOSPITAL|{timestamp}||ACK^R01|ACK{timestamp}|P|2.5\r"
            f"MSA|{ack_code}|UNKNOWN|{error_message}\r"
        )
