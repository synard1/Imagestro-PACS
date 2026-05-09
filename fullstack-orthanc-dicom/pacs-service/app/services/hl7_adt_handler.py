"""
HL7 ADT Handler Service
Handles ADT (Admission, Discharge, Transfer) messages
"""

import logging
from typing import Dict, Any, Optional, Tuple
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import text
from hl7apy.core import Message

from app.services.hl7_parser import HL7ParserService
from app.services.hl7_ack_builder import HL7AckBuilderService
from app.services.hl7_error_handler import HL7ErrorHandlerService
from app.models.hl7_message import HL7Message
from app.models.fhir_resource import FHIRConfig

logger = logging.getLogger(__name__)


class HL7ADTHandlerService:
    """Service for handling ADT messages"""

    # Supported ADT trigger events
    SUPPORTED_TRIGGERS = {
        'A01': 'Admit/Visit Notification',
        'A04': 'Register a Patient',
        'A05': 'Pre-admit a Patient',
        'A08': 'Update Patient Information',
        'A11': 'Cancel Admit/Visit Notification',
        'A13': 'Cancel Discharge/End Visit',
        'A31': 'Update Person Information',
        'A40': 'Merge Patient',
    }

    def __init__(self, db: Session):
        """
        Initialize ADT handler service

        Args:
            db: Database session
        """
        self.db = db
        self.parser = HL7ParserService()
        self.ack_builder = HL7AckBuilderService()
        self.error_handler = HL7ErrorHandlerService(db)

    async def process_adt_message(
        self,
        raw_message: str,
        http_context: Optional[Dict[str, Any]] = None
    ) -> Tuple[HL7Message, str]:
        """
        Process ADT message

        Args:
            raw_message: Raw HL7 ADT message
            http_context: HTTP request context (method, path, client_ip, etc.)

        Returns:
            Tuple of (HL7Message object, ACK message string)

        Raises:
            Exception: If processing fails critically
        """
        hl7_message = None
        message_data = {}

        try:
            # Step 1: Parse the message
            parsed_message, message_data = self.parser.parse(raw_message, validate=True)

            # Step 2: Validate it's an ADT message
            if message_data.get('message_type') != 'ADT':
                raise ValueError(f"Not an ADT message: {message_data.get('message_type')}")

            trigger = message_data.get('message_trigger')
            if trigger not in self.SUPPORTED_TRIGGERS:
                raise ValueError(f"Unsupported ADT trigger: {trigger}")

            # Step 3: Store message in audit table
            hl7_message = await self._store_message(raw_message, message_data, http_context)

            # Step 4: Process ADT-specific logic
            await self._process_adt_logic(hl7_message, parsed_message, message_data)

            # Step 5: Update message status
            hl7_message.status = 'PROCESSED'
            hl7_message.processing_completed_at = datetime.now()
            self.db.commit()

            # Step 6: Generate success ACK
            ack_message = self.ack_builder.build_success_ack(
                message_type=message_data.get('message_type'),
                message_trigger=message_data.get('message_trigger'),
                message_control_id=message_data.get('message_control_id'),
                sending_application=message_data.get('sending_application'),
                sending_facility=message_data.get('sending_facility'),
                hl7_version=message_data.get('message_version', '2.5')
            )

            # Store ACK
            hl7_message.ack_message = ack_message
            hl7_message.ack_code = 'AA'
            hl7_message.ack_sent_at = datetime.now()
            self.db.commit()

            logger.info(
                f"Successfully processed ADT message: {message_data.get('message_control_id')}, "
                f"Trigger: {trigger}, Patient: {message_data.get('patient_id')}"
            )

            # Trigger FHIR conversion if enabled
            self._trigger_fhir_conversion(hl7_message, message_data)

            return hl7_message, ack_message

        except Exception as e:
            logger.error(f"Failed to process ADT message: {str(e)}")

            # Handle error
            if hl7_message:
                await self.error_handler.handle_error(
                    hl7_message_id=str(hl7_message.id),
                    error_code=self._get_error_code(e),
                    error_message=str(e),
                    exception=e
                )

            # Generate error ACK
            ack_message = self.ack_builder.build_error_ack(
                message_type=message_data.get('message_type', 'ADT'),
                message_trigger=message_data.get('message_trigger', 'A01'),
                message_control_id=message_data.get('message_control_id', 'UNKNOWN'),
                sending_application=message_data.get('sending_application', 'UNKNOWN'),
                sending_facility=message_data.get('sending_facility', 'UNKNOWN'),
                error_message=str(e),
                error_code=self._get_error_code(e),
                hl7_version=message_data.get('message_version', '2.5')
            )

            if hl7_message:
                hl7_message.ack_message = ack_message
                hl7_message.ack_code = 'AE'
                hl7_message.ack_sent_at = datetime.now()
                self.db.commit()

            return hl7_message, ack_message

    async def _store_message(
        self,
        raw_message: str,
        message_data: Dict[str, Any],
        http_context: Optional[Dict[str, Any]]
    ) -> HL7Message:
        """Store HL7 message in database"""
        try:
            hl7_message = HL7Message(
                # Message identification
                message_control_id=message_data.get('message_control_id'),
                message_type=message_data.get('message_type'),
                message_trigger=message_data.get('message_trigger'),
                message_version=message_data.get('message_version', '2.5'),

                # Message content
                raw_message=raw_message,
                parsed_message=message_data,

                # Status
                status='PROCESSING',
                processing_started_at=datetime.now(),

                # Patient context
                patient_id=message_data.get('patient_id'),
                patient_name=message_data.get('patient_name'),
                patient_mrn=message_data.get('patient_mrn'),

                # Source information
                sending_application=message_data.get('sending_application'),
                sending_facility=message_data.get('sending_facility'),
                receiving_application=message_data.get('receiving_application'),
                receiving_facility=message_data.get('receiving_facility'),
            )

            # Add HTTP context if available
            if http_context:
                hl7_message.http_method = http_context.get('method')
                hl7_message.http_path = http_context.get('path')
                hl7_message.http_status = http_context.get('status')
                hl7_message.client_ip = http_context.get('client_ip')
                hl7_message.user_agent = http_context.get('user_agent')

            self.db.add(hl7_message)
            self.db.commit()
            self.db.refresh(hl7_message)

            return hl7_message

        except Exception as e:
            logger.error(f"Failed to store HL7 message: {str(e)}")
            self.db.rollback()
            raise

    async def _process_adt_logic(
        self,
        hl7_message: HL7Message,
        parsed_message: Message,
        message_data: Dict[str, Any]
    ) -> None:
        """
        Process ADT-specific business logic

        Args:
            hl7_message: Stored HL7 message
            parsed_message: Parsed HL7 message object
            message_data: Extracted message data
        """
        trigger = message_data.get('message_trigger')

        # Process based on trigger event
        if trigger in ['A01', 'A04', 'A05']:
            # Admit/Register patient
            await self._handle_admit_patient(hl7_message, message_data)

        elif trigger == 'A08':
            # Update patient information
            await self._handle_update_patient(hl7_message, message_data)

        elif trigger in ['A11', 'A13']:
            # Cancel admit/discharge
            await self._handle_cancel_event(hl7_message, message_data)

        elif trigger == 'A31':
            # Update person information
            await self._handle_update_person(hl7_message, message_data)

        elif trigger == 'A40':
            # Merge patient
            await self._handle_merge_patient(hl7_message, message_data)

        else:
            logger.warning(f"No specific handler for ADT trigger: {trigger}")

    async def _handle_admit_patient(
        self,
        hl7_message: HL7Message,
        message_data: Dict[str, Any]
    ) -> None:
        """Handle patient admission (A01, A04, A05)"""
        try:
            patient_id = message_data.get('patient_id')
            patient_name = message_data.get('patient_name')
            visit_number = message_data.get('visit_number')

            logger.info(
                f"Processing patient admission: Patient ID={patient_id}, "
                f"Visit={visit_number}, Trigger={message_data.get('message_trigger')}"
            )

            # Check if patient already exists
            query = text("""
                SELECT COUNT(*) as count
                FROM hl7_messages
                WHERE patient_id = :patient_id
                  AND message_type = 'ADT'
                  AND status = 'PROCESSED'
            """)

            result = self.db.execute(query, {'patient_id': patient_id}).fetchone()
            existing_count = result[0] if result else 0

            # Store patient demographics in parsed_message for future reference
            hl7_message.parsed_message['processing_notes'] = {
                'action': 'admit_patient',
                'is_new_patient': existing_count == 0,
                'visit_number': visit_number,
                'patient_class': message_data.get('patient_class'),
                'admission_type': message_data.get('admission_type'),
                'assigned_location': message_data.get('assigned_patient_location'),
                'attending_doctor': message_data.get('attending_doctor_name'),
            }

            logger.info(
                f"Patient admission processed: {patient_id}, "
                f"New patient: {existing_count == 0}"
            )

        except Exception as e:
            logger.error(f"Failed to handle admit patient: {str(e)}")
            raise

    async def _handle_update_patient(
        self,
        hl7_message: HL7Message,
        message_data: Dict[str, Any]
    ) -> None:
        """Handle patient information update (A08)"""
        try:
            patient_id = message_data.get('patient_id')

            logger.info(f"Processing patient update: Patient ID={patient_id}")

            # Find previous patient record
            query = text("""
                SELECT id, parsed_message
                FROM hl7_messages
                WHERE patient_id = :patient_id
                  AND message_type = 'ADT'
                  AND status = 'PROCESSED'
                ORDER BY created_at DESC
                LIMIT 1
            """)

            result = self.db.execute(query, {'patient_id': patient_id}).fetchone()

            hl7_message.parsed_message['processing_notes'] = {
                'action': 'update_patient',
                'has_previous_record': result is not None,
                'updated_fields': ['patient_name', 'patient_demographics'],
            }

            logger.info(f"Patient update processed: {patient_id}")

        except Exception as e:
            logger.error(f"Failed to handle update patient: {str(e)}")
            raise

    async def _handle_cancel_event(
        self,
        hl7_message: HL7Message,
        message_data: Dict[str, Any]
    ) -> None:
        """Handle cancel event (A11, A13)"""
        try:
            patient_id = message_data.get('patient_id')
            trigger = message_data.get('message_trigger')

            logger.info(f"Processing cancel event: Patient ID={patient_id}, Trigger={trigger}")

            hl7_message.parsed_message['processing_notes'] = {
                'action': 'cancel_event',
                'cancel_type': 'admit' if trigger == 'A11' else 'discharge',
            }

            logger.info(f"Cancel event processed: {patient_id}, Type={trigger}")

        except Exception as e:
            logger.error(f"Failed to handle cancel event: {str(e)}")
            raise

    async def _handle_update_person(
        self,
        hl7_message: HL7Message,
        message_data: Dict[str, Any]
    ) -> None:
        """Handle person information update (A31)"""
        try:
            patient_id = message_data.get('patient_id')

            logger.info(f"Processing person update: Patient ID={patient_id}")

            hl7_message.parsed_message['processing_notes'] = {
                'action': 'update_person',
                'scope': 'person_demographics',
            }

            logger.info(f"Person update processed: {patient_id}")

        except Exception as e:
            logger.error(f"Failed to handle update person: {str(e)}")
            raise

    async def _handle_merge_patient(
        self,
        hl7_message: HL7Message,
        message_data: Dict[str, Any]
    ) -> None:
        """Handle patient merge (A40)"""
        try:
            patient_id = message_data.get('patient_id')

            logger.warning(f"Patient merge requested: {patient_id} - MANUAL REVIEW REQUIRED")

            hl7_message.parsed_message['processing_notes'] = {
                'action': 'merge_patient',
                'requires_manual_review': True,
                'warning': 'Patient merge requires manual intervention',
            }

            logger.info(f"Patient merge logged for review: {patient_id}")

        except Exception as e:
            logger.error(f"Failed to handle merge patient: {str(e)}")
            raise

    def _get_error_code(self, exception: Exception) -> str:
        """Get error code based on exception type"""
        exception_type = type(exception).__name__

        if 'InvalidHL7Message' in exception_type:
            return self.error_handler.ERROR_INVALID_FORMAT
        elif 'UnsupportedVersion' in exception_type:
            return self.error_handler.ERROR_UNSUPPORTED_VERSION
        elif 'ValueError' in exception_type:
            return self.error_handler.ERROR_VALIDATION_FAILED
        else:
            return self.error_handler.ERROR_PROCESSING_FAILED

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

        # PV1 Segment - Patient Visit
        pv1_fields = {}
        for key in ['visit_id', 'visit_number', 'patient_class', 'admission_type',
                    'assigned_patient_location', 'attending_doctor_id', 'attending_doctor_name']:
            if key in message_data:
                pv1_fields[key] = message_data[key]

        if pv1_fields:
            restructured['PV1'] = pv1_fields

        # MSH Segment - Message Header (metadata)
        msh_fields = {}
        for key in ['message_type', 'message_trigger', 'message_control_id', 'message_version',
                    'sending_application', 'sending_facility', 'receiving_application',
                    'receiving_facility', 'message_datetime']:
            if key in message_data:
                msh_fields[key] = message_data[key]

        if msh_fields:
            restructured['MSH'] = msh_fields

        # EVN Segment - Event Type
        evn_fields = {}
        for key in ['event_occurred']:
            if key in message_data:
                evn_fields[key] = message_data[key]

        if evn_fields:
            restructured['EVN'] = evn_fields

        return restructured

    def _trigger_fhir_conversion(
        self,
        hl7_message: HL7Message,
        message_data: Dict[str, Any]
    ) -> None:
        """
        Trigger FHIR conversion for processed ADT message

        Args:
            hl7_message: Processed HL7 message
            message_data: Parsed message data
        """
        try:
            # Check if FHIR auto-conversion is enabled
            config = self.db.query(FHIRConfig).filter(
                FHIRConfig.config_key == 'fhir.auto_convert_hl7'
            ).first()

            if config and config.get_typed_value():
                # Import here to avoid circular imports
                from app.tasks.fhir_tasks import convert_adt_to_fhir_async

                # Restructure flattened data into segmented format
                restructured_data = self._restructure_for_fhir(message_data)

                # Trigger async FHIR conversion
                convert_adt_to_fhir_async.delay(
                    parsed_data=restructured_data,
                    hl7_message_id=str(hl7_message.id)
                )

                logger.info(f"Triggered FHIR conversion for ADT message: {hl7_message.id}")

        except Exception as e:
            # Don't fail the main process if FHIR conversion fails
            logger.warning(f"Failed to trigger FHIR conversion: {str(e)}")

    async def get_patient_adt_history(
        self,
        patient_id: str,
        limit: int = 20
    ) -> list:
        """
        Get ADT message history for a patient

        Args:
            patient_id: Patient ID
            limit: Maximum number of records

        Returns:
            List of ADT messages
        """
        try:
            messages = self.db.query(HL7Message).filter(
                HL7Message.patient_id == patient_id,
                HL7Message.message_type == 'ADT',
                HL7Message.status == 'PROCESSED'
            ).order_by(
                HL7Message.created_at.desc()
            ).limit(limit).all()

            return [msg.to_list_dict() for msg in messages]

        except Exception as e:
            logger.error(f"Failed to get patient ADT history: {str(e)}")
            return []
