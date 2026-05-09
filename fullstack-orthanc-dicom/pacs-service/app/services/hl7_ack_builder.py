"""
HL7 ACK Builder Service
Builds HL7 ACK (Acknowledgment) messages for HL7 v2.x
"""

import logging
from typing import Optional
from datetime import datetime
from hl7apy.core import Message, Segment

logger = logging.getLogger(__name__)


class HL7AckBuilderService:
    """Service for building HL7 ACK messages"""

    # ACK codes
    ACK_SUCCESS = 'AA'  # Application Accept
    ACK_ERROR = 'AE'    # Application Error
    ACK_REJECT = 'AR'   # Application Reject

    def __init__(self, receiving_application: str = 'PACS', receiving_facility: str = 'HOSPITAL'):
        """
        Initialize HL7 ACK builder service

        Args:
            receiving_application: Receiving application name (becomes sending in ACK)
            receiving_facility: Receiving facility name (becomes sending in ACK)
        """
        self.receiving_application = receiving_application
        self.receiving_facility = receiving_facility

    def build_ack(
        self,
        message_type: str,
        message_trigger: str,
        message_control_id: str,
        sending_application: str,
        sending_facility: str,
        ack_code: str = 'AA',
        error_message: Optional[str] = None,
        error_code: Optional[str] = None,
        hl7_version: str = '2.5'
    ) -> str:
        """
        Build HL7 ACK message

        Args:
            message_type: Original message type (ADT, ORM, ORU)
            message_trigger: Original message trigger (A01, O01, R01)
            message_control_id: Original message control ID (for correlation)
            sending_application: Original sending application (becomes receiving in ACK)
            sending_facility: Original sending facility (becomes receiving in ACK)
            ack_code: ACK code (AA, AE, AR)
            error_message: Error message if ack_code is AE or AR
            error_code: Error code if ack_code is AE or AR
            hl7_version: HL7 version (default: 2.5)

        Returns:
            Raw ACK message string
        """
        try:
            # Create ACK message (base ACK, trigger goes into MSH-9)
            ack = Message("ACK", version=hl7_version)

            # MSH Segment (Message Header)
            msh = ack.MSH
            msh.msh_3 = self.receiving_application  # Sending Application (we are now sending)
            msh.msh_4 = self.receiving_facility      # Sending Facility
            msh.msh_5 = sending_application          # Receiving Application (original sender)
            msh.msh_6 = sending_facility             # Receiving Facility
            msh.msh_7 = self._format_datetime(datetime.now())  # Timestamp
            msh.msh_9 = f"ACK^{message_trigger}"     # Message Type (ACK with trigger)
            msh.msh_10 = self._generate_control_id()  # New control ID for ACK
            msh.msh_11 = 'P'                         # Processing ID (P=Production, T=Test)
            msh.msh_12 = hl7_version                 # HL7 Version

            # MSA Segment (Message Acknowledgment)
            msa = Segment('MSA', version=hl7_version)
            msa.msa_1 = ack_code                     # Acknowledgment Code
            msa.msa_2 = message_control_id           # Original message control ID

            if error_message:
                msa.msa_3 = error_message[:80]       # Text message (max 80 chars in MSA-3)

            ack.add(msa)

            # ERR Segment (Error) - only if there's an error
            if ack_code in [self.ACK_ERROR, self.ACK_REJECT] and error_message:
                err = Segment('ERR', version=hl7_version)

                # ERR-3: HL7 Error Code
                if error_code:
                    err.err_3 = error_code

                # ERR-7: Diagnostic Information (full error message)
                if error_message:
                    err.err_7 = error_message

                ack.add(err)

            # Convert to HL7 string
            ack_message = ack.to_er7()

            logger.info(
                f"Built ACK message: Code={ack_code}, "
                f"Original Control ID={message_control_id}, "
                f"Type={message_type}_{message_trigger}"
            )

            return ack_message

        except Exception as e:
            logger.error(f"Failed to build ACK message: {str(e)}")
            # Return a minimal ACK in case of failure
            return self._build_minimal_ack(
                message_control_id,
                sending_application,
                sending_facility,
                self.ACK_ERROR,
                f"Failed to build ACK: {str(e)}"
            )

    def build_success_ack(
        self,
        message_type: str,
        message_trigger: str,
        message_control_id: str,
        sending_application: str,
        sending_facility: str,
        hl7_version: str = '2.5'
    ) -> str:
        """
        Build successful ACK message (AA code)

        Args:
            message_type: Original message type
            message_trigger: Original message trigger
            message_control_id: Original message control ID
            sending_application: Original sending application
            sending_facility: Original sending facility
            hl7_version: HL7 version

        Returns:
            Raw ACK message string
        """
        return self.build_ack(
            message_type=message_type,
            message_trigger=message_trigger,
            message_control_id=message_control_id,
            sending_application=sending_application,
            sending_facility=sending_facility,
            ack_code=self.ACK_SUCCESS,
            hl7_version=hl7_version
        )

    def build_error_ack(
        self,
        message_type: str,
        message_trigger: str,
        message_control_id: str,
        sending_application: str,
        sending_facility: str,
        error_message: str,
        error_code: Optional[str] = None,
        hl7_version: str = '2.5'
    ) -> str:
        """
        Build error ACK message (AE code)

        Args:
            message_type: Original message type
            message_trigger: Original message trigger
            message_control_id: Original message control ID
            sending_application: Original sending application
            sending_facility: Original sending facility
            error_message: Error message
            error_code: Error code
            hl7_version: HL7 version

        Returns:
            Raw ACK message string
        """
        return self.build_ack(
            message_type=message_type,
            message_trigger=message_trigger,
            message_control_id=message_control_id,
            sending_application=sending_application,
            sending_facility=sending_facility,
            ack_code=self.ACK_ERROR,
            error_message=error_message,
            error_code=error_code,
            hl7_version=hl7_version
        )

    def build_reject_ack(
        self,
        message_type: str,
        message_trigger: str,
        message_control_id: str,
        sending_application: str,
        sending_facility: str,
        error_message: str,
        error_code: Optional[str] = None,
        hl7_version: str = '2.5'
    ) -> str:
        """
        Build reject ACK message (AR code)

        Args:
            message_type: Original message type
            message_trigger: Original message trigger
            message_control_id: Original message control ID
            sending_application: Original sending application
            sending_facility: Original sending facility
            error_message: Rejection reason
            error_code: Error code
            hl7_version: HL7 version

        Returns:
            Raw ACK message string
        """
        return self.build_ack(
            message_type=message_type,
            message_trigger=message_trigger,
            message_control_id=message_control_id,
            sending_application=sending_application,
            sending_facility=sending_facility,
            ack_code=self.ACK_REJECT,
            error_message=error_message,
            error_code=error_code,
            hl7_version=hl7_version
        )

    def _build_minimal_ack(
        self,
        message_control_id: str,
        receiving_application: str,
        receiving_facility: str,
        ack_code: str,
        error_message: str
    ) -> str:
        """
        Build minimal ACK message (fallback for errors)

        This is a simplified ACK that doesn't use hl7apy to avoid
        potential circular errors during ACK generation.

        Args:
            message_control_id: Original message control ID
            receiving_application: Receiving application
            receiving_facility: Receiving facility
            ack_code: ACK code
            error_message: Error message

        Returns:
            Raw minimal ACK message string
        """
        timestamp = self._format_datetime(datetime.now())
        control_id = self._generate_control_id()

        # Build minimal ACK manually
        ack_lines = [
            f"MSH|^~\\&|{self.receiving_application}|{self.receiving_facility}|{receiving_application}|{receiving_facility}|{timestamp}||ACK|{control_id}|P|2.5",
            f"MSA|{ack_code}|{message_control_id}|{error_message[:80]}"
        ]

        return '\r'.join(ack_lines) + '\r'

    def _format_datetime(self, dt: datetime) -> str:
        """
        Format datetime to HL7 format (YYYYMMDDHHMMSS)

        Args:
            dt: Datetime object

        Returns:
            HL7 formatted datetime string
        """
        return dt.strftime('%Y%m%d%H%M%S')

    def _generate_control_id(self) -> str:
        """
        Generate unique message control ID

        Returns:
            Control ID string
        """
        # Format: PACS-YYYYMMDDHHMMSS-MICROSECONDS
        now = datetime.now()
        return f"PACS-{now.strftime('%Y%m%d%H%M%S')}-{now.microsecond:06d}"

    def get_ack_code_description(self, ack_code: str) -> str:
        """
        Get description for ACK code

        Args:
            ack_code: ACK code (AA, AE, AR)

        Returns:
            Human-readable description
        """
        descriptions = {
            'AA': 'Application Accept - Message accepted and processed successfully',
            'AE': 'Application Error - Message accepted but not processed due to error',
            'AR': 'Application Reject - Message rejected due to validation failure',
            'CA': 'Commit Accept - Enhanced acknowledgment (commit)',
            'CE': 'Commit Error - Enhanced acknowledgment (commit error)',
            'CR': 'Commit Reject - Enhanced acknowledgment (commit reject)',
        }
        return descriptions.get(ack_code, f'Unknown ACK code: {ack_code}')
