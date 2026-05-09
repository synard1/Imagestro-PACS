"""
HL7 Parser Service
Parses HL7 v2.x messages using hl7apy library
"""

import logging
from typing import Dict, Any, Optional, Tuple
from datetime import datetime
from hl7apy.parser import parse_message
from hl7apy.exceptions import HL7apyException, UnsupportedVersion
from hl7apy.core import Message

logger = logging.getLogger(__name__)


class HL7ParserService:
    """Service for parsing HL7 v2.x messages"""

    def __init__(self):
        """Initialize HL7 parser service"""
        self.supported_versions = ['2.3', '2.4', '2.5', '2.6']
        self.supported_message_types = {
            'ADT': ['A01', 'A04', 'A05', 'A08', 'A11', 'A13', 'A31', 'A40'],  # Patient Administration
            'ORM': ['O01'],  # Order Message
            'ORU': ['R01'],  # Observation Result
        }

    def parse(self, raw_message: str, validate: bool = True) -> Tuple[Message, Dict[str, Any]]:
        """
        Parse raw HL7 message into structured format

        Args:
            raw_message: Raw HL7 message string
            validate: Whether to validate message structure

        Returns:
            Tuple of (parsed_message_object, extracted_data_dict)

        Raises:
            HL7apyException: If message format is invalid
            UnsupportedVersion: If HL7 version is not supported
        """
        try:
            # Parse the message
            message = parse_message(raw_message, validation_level=2 if validate else 0)

            # Extract structured data
            extracted_data = self._extract_data(message)

            logger.info(
                f"Successfully parsed HL7 message: {extracted_data.get('message_type')}^{extracted_data.get('message_trigger')}, "
                f"Control ID: {extracted_data.get('message_control_id')}"
            )

            return message, extracted_data

        except UnsupportedVersion as e:
            logger.error(f"Unsupported HL7 version: {str(e)}")
            raise
        except HL7apyException as e:
            logger.error(f"Invalid HL7 message format: {str(e)}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error parsing HL7 message: {str(e)}")
            raise HL7apyException(f"Failed to parse message: {str(e)}")

    def _extract_data(self, message: Message) -> Dict[str, Any]:
        """
        Extract structured data from parsed HL7 message

        Args:
            message: Parsed HL7 message object

        Returns:
            Dictionary containing extracted data
        """
        data = {}

        # MSH Segment (Message Header) - Always present
        msh = message.MSH
        data['message_type'] = str(msh.msh_9.msh_9_1.value) if msh.msh_9.msh_9_1.value else None
        data['message_trigger'] = str(msh.msh_9.msh_9_2.value) if msh.msh_9.msh_9_2.value else None
        data['message_control_id'] = str(msh.msh_10.value) if msh.msh_10.value else None
        data['message_version'] = str(msh.msh_12.value) if msh.msh_12.value else '2.5'
        data['sending_application'] = str(msh.msh_3.value) if msh.msh_3.value else None
        data['sending_facility'] = str(msh.msh_4.value) if msh.msh_4.value else None
        data['receiving_application'] = str(msh.msh_5.value) if msh.msh_5.value else None
        data['receiving_facility'] = str(msh.msh_6.value) if msh.msh_6.value else None
        data['message_datetime'] = self._parse_datetime(str(msh.msh_7.value)) if msh.msh_7.value else None

        # PID Segment (Patient Identification) - Present in most messages
        if hasattr(message, 'PID') and message.PID:
            pid = message.PID
            data['patient_id'] = str(pid.pid_3.pid_3_1.value) if pid.pid_3.pid_3_1.value else None
            data['patient_mrn'] = str(pid.pid_2.value) if pid.pid_2.value else data.get('patient_id')

            # Patient Name (PID-5)
            if pid.pid_5:
                family_name = str(pid.pid_5.pid_5_1.value) if pid.pid_5.pid_5_1.value else ''
                given_name = str(pid.pid_5.pid_5_2.value) if pid.pid_5.pid_5_2.value else ''
                middle_name = str(pid.pid_5.pid_5_3.value) if pid.pid_5.pid_5_3.value else ''
                data['patient_name'] = f"{family_name}^{given_name}^{middle_name}".strip('^')

            data['patient_birth_date'] = str(pid.pid_7.value) if pid.pid_7.value else None
            data['patient_gender'] = str(pid.pid_8.value) if pid.pid_8.value else None

        # Extract message-type specific data
        message_type = data.get('message_type')

        if message_type == 'ADT':
            data.update(self._extract_adt_data(message))
        elif message_type == 'ORM':
            data.update(self._extract_orm_data(message))
        elif message_type == 'ORU':
            data.update(self._extract_oru_data(message))

        return data

    def _extract_adt_data(self, message: Message) -> Dict[str, Any]:
        """Extract ADT-specific data"""
        data = {}

        # PV1 Segment (Patient Visit)
        if hasattr(message, 'PV1') and message.PV1:
            pv1 = message.PV1
            data['visit_number'] = str(pv1.pv1_19.value) if pv1.pv1_19.value else None
            data['patient_class'] = str(pv1.pv1_2.value) if pv1.pv1_2.value else None
            data['admission_type'] = str(pv1.pv1_4.value) if pv1.pv1_4.value else None
            data['assigned_patient_location'] = str(pv1.pv1_3.value) if pv1.pv1_3.value else None

            # Attending Doctor (PV1-7)
            if pv1.pv1_7:
                data['attending_doctor_id'] = str(pv1.pv1_7.pv1_7_1.value) if pv1.pv1_7.pv1_7_1.value else None
                data['attending_doctor_name'] = str(pv1.pv1_7.pv1_7_2.value) if pv1.pv1_7.pv1_7_2.value else None

        # EVN Segment (Event Type)
        if hasattr(message, 'EVN') and message.EVN:
            evn = message.EVN
            data['event_occurred'] = self._parse_datetime(str(evn.evn_6.value)) if evn.evn_6.value else None

        return data

    def _extract_orm_data(self, message: Message) -> Dict[str, Any]:
        """Extract ORM-specific data"""
        data = {}

        # ORC Segment (Common Order)
        if hasattr(message, 'ORC') and message.ORC:
            orc = message.ORC
            data['order_control'] = str(orc.orc_1.value) if orc.orc_1.value else None
            data['placer_order_number'] = str(orc.orc_2.value) if orc.orc_2.value else None
            data['filler_order_number'] = str(orc.orc_3.value) if orc.orc_3.value else None
            data['order_status'] = str(orc.orc_5.value) if orc.orc_5.value else None
            data['quantity_timing'] = str(orc.orc_7.value) if orc.orc_7.value else None

            # Ordering Provider (ORC-12)
            if orc.orc_12:
                data['ordering_provider_id'] = str(orc.orc_12.orc_12_1.value) if orc.orc_12.orc_12_1.value else None
                family_name = str(orc.orc_12.orc_12_2.value) if orc.orc_12.orc_12_2.value else ''
                given_name = str(orc.orc_12.orc_12_3.value) if orc.orc_12.orc_12_3.value else ''
                data['ordering_provider_name'] = f"{family_name}^{given_name}".strip('^')

            data['order_effective_datetime'] = self._parse_datetime(str(orc.orc_15.value)) if orc.orc_15.value else None
            data['entering_organization'] = str(orc.orc_17.value) if orc.orc_17.value else None

        # OBR Segment (Observation Request)
        if hasattr(message, 'OBR') and message.OBR:
            obr = message.OBR
            data['accession_number'] = str(obr.obr_18.value) if obr.obr_18.value else None
            data['universal_service_id'] = str(obr.obr_4.value) if obr.obr_4.value else None
            data['procedure_code'] = str(obr.obr_4.obr_4_1.value) if obr.obr_4.obr_4_1.value else None
            data['procedure_name'] = str(obr.obr_4.obr_4_2.value) if obr.obr_4.obr_4_2.value else None
            data['order_priority'] = str(obr.obr_5.value) if obr.obr_5.value else None
            data['requested_datetime'] = self._parse_datetime(str(obr.obr_6.value)) if obr.obr_6.value else None
            data['modality'] = str(obr.obr_24.value) if obr.obr_24.value else None

        # IPC Segment (Imaging Procedure Control) - if present
        if hasattr(message, 'IPC') and message.IPC:
            ipc = message.IPC
            data['study_instance_uid'] = str(ipc.ipc_3.value) if ipc.ipc_3.value else None

        return data

    def _extract_oru_data(self, message: Message) -> Dict[str, Any]:
        """Extract ORU-specific data"""
        data = {}

        # OBR Segment (Observation Request)
        if hasattr(message, 'OBR') and message.OBR:
            obr = message.OBR
            data['accession_number'] = str(obr.obr_18.value) if obr.obr_18.value else None
            data['filler_order_number'] = str(obr.obr_3.value) if obr.obr_3.value else None
            data['placer_order_number'] = str(obr.obr_2.value) if obr.obr_2.value else None
            data['universal_service_id'] = str(obr.obr_4.value) if obr.obr_4.value else None
            data['observation_datetime'] = self._parse_datetime(str(obr.obr_7.value)) if obr.obr_7.value else None
            data['results_status'] = str(obr.obr_25.value) if obr.obr_25.value else None

        # OBX Segments (Observation/Result) - can be multiple
        if hasattr(message, 'OBX') and message.OBX:
            observations = []
            for obx in message.OBX:
                observation = {
                    'value_type': str(obx.obx_2.value) if obx.obx_2.value else None,
                    'observation_id': str(obx.obx_3.value) if obx.obx_3.value else None,
                    'observation_value': str(obx.obx_5.value) if obx.obx_5.value else None,
                    'units': str(obx.obx_6.value) if obx.obx_6.value else None,
                    'abnormal_flags': str(obx.obx_8.value) if obx.obx_8.value else None,
                    'observation_status': str(obx.obx_11.value) if obx.obx_11.value else None,
                }
                observations.append(observation)
            data['observations'] = observations

        return data

    def _parse_datetime(self, dt_str: str) -> Optional[str]:
        """
        Parse HL7 datetime format (YYYYMMDDHHMMSS) to ISO format

        Args:
            dt_str: HL7 datetime string

        Returns:
            ISO formatted datetime string or None
        """
        if not dt_str:
            return None

        try:
            # HL7 datetime format: YYYYMMDDHHMMSS[.SSSS][+/-ZZZZ]
            # Clean the string
            dt_str = dt_str.strip()

            # Handle different lengths
            if len(dt_str) >= 14:
                # Full datetime
                dt = datetime.strptime(dt_str[:14], '%Y%m%d%H%M%S')
            elif len(dt_str) >= 8:
                # Date only
                dt = datetime.strptime(dt_str[:8], '%Y%m%d')
            else:
                return None

            return dt.isoformat()
        except Exception as e:
            logger.warning(f"Failed to parse datetime '{dt_str}': {str(e)}")
            return None

    def validate_message_type(self, message_type: str, message_trigger: str) -> bool:
        """
        Validate if message type and trigger are supported

        Args:
            message_type: HL7 message type (ADT, ORM, ORU)
            message_trigger: HL7 message trigger (A01, O01, R01, etc.)

        Returns:
            True if supported, False otherwise
        """
        if message_type not in self.supported_message_types:
            return False

        return message_trigger in self.supported_message_types[message_type]

    def to_json(self, message: Message) -> Dict[str, Any]:
        """
        Convert parsed HL7 message to JSON format

        Args:
            message: Parsed HL7 message object

        Returns:
            JSON-serializable dictionary
        """
        try:
            return message.to_json()
        except Exception as e:
            logger.error(f"Failed to convert message to JSON: {str(e)}")
            return {}
