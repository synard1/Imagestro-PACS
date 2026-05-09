"""
FHIR DiagnosticReport Service

Handles FHIR R4 DiagnosticReport resource creation and conversion from HL7 ORU messages
"""

from typing import Dict, Any, Optional, List
from sqlalchemy.orm import Session
from datetime import datetime
import logging

from app.services.fhir.fhir_base_service import FHIRBaseService
from app.models.fhir_resource import FHIRResource
from fhir.resources.diagnosticreport import DiagnosticReport
from fhir.resources.identifier import Identifier
from fhir.resources.reference import Reference
from fhir.resources.codeableconcept import CodeableConcept
from fhir.resources.coding import Coding
from fhir.resources.attachment import Attachment

logger = logging.getLogger(__name__)


class FHIRDiagnosticReportService:
    """
    Service for FHIR DiagnosticReport resource operations
    Handles conversion from HL7 ORU messages to FHIR DiagnosticReport resources
    """

    def __init__(self, db: Session):
        self.db = db
        self.base_service = FHIRBaseService(db)

    def create_diagnostic_report_from_hl7(
        self,
        obr_data: Dict[str, Any],
        obx_data: List[Dict[str, Any]],
        patient_fhir_id: Optional[str] = None,
        service_request_fhir_id: Optional[str] = None,
        hl7_message_id: Optional[str] = None,
        order_id: Optional[str] = None,
        source_system: Optional[str] = "HL7_ORU"
    ) -> Optional[FHIRResource]:
        """
        Create FHIR DiagnosticReport resource from HL7 OBR and OBX segments

        Args:
            obr_data: Parsed OBR segment data
            obx_data: List of parsed OBX segment data
            patient_fhir_id: FHIR Patient resource ID (database UUID)
            service_request_fhir_id: FHIR ServiceRequest resource ID (database UUID)
            hl7_message_id: Link to source HL7 message
            order_id: Link to orders table
            source_system: Source system identifier

        Returns:
            Created FHIRResource or None
        """
        try:
            # Extract identifiers
            identifiers = self._extract_identifiers(obr_data)

            # Extract status
            status = self._map_status(obr_data.get('result_status'))

            # Extract code (type of report)
            code = self._extract_code(obr_data)

            # Extract subject (patient reference)
            subject = None
            if patient_fhir_id:
                patient_resource = self.base_service.get_resource_by_db_id(patient_fhir_id)
                if patient_resource:
                    subject = Reference(
                        reference=f"Patient/{patient_resource.resource_id}",
                        display=self._get_patient_display(patient_resource)
                    )

            # Extract based-on (ServiceRequest reference)
            based_on = None
            if service_request_fhir_id:
                sr_resource = self.base_service.get_resource_by_db_id(service_request_fhir_id)
                if sr_resource:
                    based_on = [Reference(
                        reference=f"ServiceRequest/{sr_resource.resource_id}"
                    )]

            # Extract effective datetime
            effective_datetime = self._parse_datetime(obr_data.get('observation_date_time'))

            # Extract issued datetime
            issued = self._parse_datetime(obr_data.get('results_rpt_status_chng_date_time') or obr_data.get('observation_date_time'))

            # Extract performer
            performer = self._extract_performer(obr_data)

            # Extract conclusion
            conclusion = obr_data.get('technician_comments') or obr_data.get('clinical_info')

            # Extract category (imaging, laboratory, etc.)
            category = self._extract_category(obr_data)

            # Extract presented form (text report)
            presented_form = self._extract_presented_form(obr_data, obx_data)

            # Build FHIR DiagnosticReport resource
            diagnostic_report = DiagnosticReport(
                identifier=identifiers if identifiers else None,
                status=status,
                category=category if category else None,
                code=code,
                subject=subject,
                basedOn=based_on,
                effectiveDateTime=effective_datetime,
                issued=issued,
                performer=performer if performer else None,
                conclusion=conclusion,
                presentedForm=presented_form if presented_form else None
            )

            # Convert to dict
            diagnostic_report_dict = diagnostic_report.dict(exclude_none=True)

            # Get accession number
            accession_number = obr_data.get('filler_order_number') or obr_data.get('placer_order_number')

            # Check if DiagnosticReport already exists
            existing_dr = None
            if accession_number:
                existing_dr = self.base_service.search_by_identifier(
                    resource_type="DiagnosticReport",
                    identifier_system="http://hospital.example.org/accession",
                    identifier_value=accession_number
                )

            if existing_dr:
                # Update existing DiagnosticReport
                logger.info(f"Updating existing DiagnosticReport: {existing_dr.resource_id}")
                fhir_resource = self.base_service.update_resource(
                    resource_type="DiagnosticReport",
                    resource_id=existing_dr.resource_id,
                    resource_json=diagnostic_report_dict,
                    author=source_system
                )
            else:
                # Create new DiagnosticReport
                fhir_resource = self.base_service.create_resource(
                    resource_type="DiagnosticReport",
                    resource_json=diagnostic_report_dict,
                    author=source_system,
                    source_system=source_system,
                    hl7_message_id=hl7_message_id,
                    order_id=order_id
                )

            # Create links
            if patient_fhir_id and fhir_resource:
                self.base_service.create_resource_link(
                    source_resource_id=str(fhir_resource.id),
                    source_resource_type="DiagnosticReport",
                    target_resource_id=patient_fhir_id,
                    target_resource_type="Patient",
                    link_type="subject"
                )

            if service_request_fhir_id and fhir_resource:
                self.base_service.create_resource_link(
                    source_resource_id=str(fhir_resource.id),
                    source_resource_type="DiagnosticReport",
                    target_resource_id=service_request_fhir_id,
                    target_resource_type="ServiceRequest",
                    link_type="basedOn"
                )

            # Extract and store search parameters
            self._extract_search_params(fhir_resource, diagnostic_report_dict)

            self.db.commit()

            logger.info(f"Created/Updated FHIR DiagnosticReport: {fhir_resource.resource_id}")
            return fhir_resource

        except Exception as e:
            logger.error(f"Failed to create DiagnosticReport from HL7: {str(e)}")
            self.db.rollback()
            return None

    def _extract_identifiers(self, obr_data: Dict[str, Any]) -> List[Identifier]:
        """Extract identifiers from OBR data"""
        identifiers = []

        # Placer Order Number (OBR-2)
        if obr_data.get('placer_order_number'):
            identifiers.append(Identifier(
                system="http://hospital.example.org/placer-order",
                value=str(obr_data['placer_order_number']),
                type={
                    "coding": [{
                        "system": "http://terminology.hl7.org/CodeSystem/v2-0203",
                        "code": "PLAC",
                        "display": "Placer Identifier"
                    }]
                }
            ))

        # Filler Order Number (OBR-3) - Accession Number
        if obr_data.get('filler_order_number'):
            identifiers.append(Identifier(
                system="http://hospital.example.org/accession",
                value=str(obr_data['filler_order_number']),
                use="official",
                type={
                    "coding": [{
                        "system": "http://terminology.hl7.org/CodeSystem/v2-0203",
                        "code": "ACSN",
                        "display": "Accession Number"
                    }]
                }
            ))

        return identifiers

    def _map_status(self, result_status: Optional[str]) -> str:
        """
        Map HL7 Result Status to FHIR DiagnosticReport status

        Args:
            result_status: HL7 OBR-25 value (F, P, C, X, etc.)

        Returns:
            FHIR status (registered, partial, preliminary, final, amended, corrected, appended, cancelled, entered-in-error, unknown)
        """
        if not result_status:
            return "registered"

        status_map = {
            'O': 'registered',      # Order received; specimen not yet received
            'I': 'registered',      # No results available; specimen received, procedure incomplete
            'S': 'registered',      # No results available; procedure scheduled, but not done
            'A': 'partial',         # Some results available
            'P': 'preliminary',     # Preliminary: preliminary (verified)
            'F': 'final',          # Final results
            'C': 'corrected',      # Correction to results
            'R': 'preliminary',     # Results stored; not yet verified
            'X': 'cancelled',      # No results available; Order cancelled
            'Y': 'cancelled',      # No order on record for this test
            'Z': 'cancelled'       # No record of this patient
        }

        return status_map.get(result_status.upper(), 'registered')

    def _extract_code(self, obr_data: Dict[str, Any]) -> CodeableConcept:
        """Extract procedure/exam code from OBR-4"""
        universal_service_id = obr_data.get('universal_service_identifier')
        procedure_code = obr_data.get('procedure_code')
        procedure_text = obr_data.get('procedure_text')

        codings = []

        # Add procedure code
        if procedure_code:
            codings.append(Coding(
                system="http://loinc.org",
                code=procedure_code,
                display=procedure_text
            ))

        # Add universal service ID
        if universal_service_id and universal_service_id != procedure_code:
            codings.append(Coding(
                system="http://hospital.example.org/services",
                code=universal_service_id,
                display=procedure_text
            ))

        return CodeableConcept(
            coding=codings if codings else None,
            text=procedure_text or "Diagnostic Report"
        )

    def _extract_category(self, obr_data: Dict[str, Any]) -> Optional[List[CodeableConcept]]:
        """Extract report category based on modality or exam type"""
        modality = obr_data.get('modality')

        # Default to imaging for radiology
        category_code = "RAD"
        category_display = "Radiology"

        if modality:
            # All imaging modalities
            category_code = "RAD"
            category_display = "Radiology"
        else:
            # Could be laboratory or other
            category_code = "LAB"
            category_display = "Laboratory"

        return [CodeableConcept(
            coding=[Coding(
                system="http://terminology.hl7.org/CodeSystem/v2-0074",
                code=category_code,
                display=category_display
            )],
            text=category_display
        )]

    def _extract_performer(self, obr_data: Dict[str, Any]) -> Optional[List[Reference]]:
        """Extract performing technician/radiologist"""
        performers = []

        # Technician (OBR-34)
        if obr_data.get('technician'):
            performers.append(Reference(
                reference=f"Practitioner/{obr_data['technician']}",
                display=obr_data['technician']
            ))

        # Principal Result Interpreter (OBR-32)
        if obr_data.get('principal_result_interpreter'):
            performers.append(Reference(
                reference=f"Practitioner/{obr_data['principal_result_interpreter']}",
                display=obr_data['principal_result_interpreter']
            ))

        return performers if performers else None

    def _extract_presented_form(
        self,
        obr_data: Dict[str, Any],
        obx_data: List[Dict[str, Any]]
    ) -> Optional[List[Attachment]]:
        """
        Extract presented form (text report) from OBR and OBX data

        Args:
            obr_data: OBR segment data
            obx_data: List of OBX segment data

        Returns:
            List of Attachment objects
        """
        attachments = []

        # Combine all text observations
        report_text = []

        # Add OBR comments
        if obr_data.get('technician_comments'):
            report_text.append(f"Technician Comments:\n{obr_data['technician_comments']}\n")

        if obr_data.get('clinical_info'):
            report_text.append(f"Clinical Information:\n{obr_data['clinical_info']}\n")

        # Add OBX observations
        if obx_data:
            report_text.append("\nFindings:\n")
            for obx in obx_data:
                value_type = obx.get('value_type', 'TX')
                observation_value = obx.get('observation_value', '')
                observation_identifier = obx.get('observation_identifier', '')

                if value_type in ['TX', 'FT', 'ST']:
                    # Text observations
                    if observation_identifier:
                        report_text.append(f"{observation_identifier}: {observation_value}")
                    else:
                        report_text.append(observation_value)

        if report_text:
            full_text = "\n".join(report_text)
            attachments.append(Attachment(
                contentType="text/plain",
                data=full_text.encode('utf-8').hex(),  # Base64-like encoding
                title="Diagnostic Report"
            ))

        return attachments if attachments else None

    def _parse_datetime(self, hl7_datetime: Optional[str]) -> Optional[str]:
        """Parse HL7 datetime to FHIR instant format"""
        if not hl7_datetime:
            return None

        try:
            # Remove non-numeric characters except + and -
            datetime_str = ''.join(c for c in hl7_datetime if c.isdigit() or c in ['+', '-'])

            if len(datetime_str) >= 14:
                # Full datetime: YYYYMMDDHHmmss
                year = datetime_str[0:4]
                month = datetime_str[4:6]
                day = datetime_str[6:8]
                hour = datetime_str[8:10]
                minute = datetime_str[10:12]
                second = datetime_str[12:14]
                return f"{year}-{month}-{day}T{hour}:{minute}:{second}Z"
            elif len(datetime_str) >= 8:
                # Date only: YYYYMMDD
                year = datetime_str[0:4]
                month = datetime_str[4:6]
                day = datetime_str[6:8]
                return f"{year}-{month}-{day}T00:00:00Z"

        except Exception as e:
            logger.warning(f"Failed to parse datetime: {hl7_datetime}, error: {str(e)}")

        return None

    def _get_patient_display(self, patient_resource: FHIRResource) -> Optional[str]:
        """Get patient display name from resource"""
        try:
            patient_json = patient_resource.resource_json
            if patient_json and patient_json.get('name'):
                name = patient_json['name'][0]
                family = name.get('family', '')
                given = ' '.join(name.get('given', []))
                return f"{given} {family}".strip()
        except Exception:
            pass

        return None

    def _extract_search_params(self, fhir_resource: FHIRResource, dr_dict: Dict[str, Any]):
        """Extract and store search parameters"""
        try:
            resource_id = str(fhir_resource.id)

            # Extract identifiers
            if dr_dict.get('identifier'):
                for identifier in dr_dict['identifier']:
                    if isinstance(identifier, dict):
                        system = identifier.get('system')
                        value = identifier.get('value')
                        if value:
                            self.base_service.create_search_param(
                                resource_fhir_id=resource_id,
                                param_name="identifier",
                                param_value=f"{system}|{value}" if system else value,
                                param_type="token"
                            )

            # Extract status
            if dr_dict.get('status'):
                self.base_service.create_search_param(
                    resource_fhir_id=resource_id,
                    param_name="status",
                    param_value=dr_dict['status'],
                    param_type="token"
                )

            # Extract code
            if dr_dict.get('code') and dr_dict['code'].get('coding'):
                for coding in dr_dict['code']['coding']:
                    if isinstance(coding, dict):
                        system = coding.get('system')
                        code = coding.get('code')
                        if code:
                            self.base_service.create_search_param(
                                resource_fhir_id=resource_id,
                                param_name="code",
                                param_value=f"{system}|{code}" if system else code,
                                param_type="token"
                            )

            # Extract subject reference
            if dr_dict.get('subject') and dr_dict['subject'].get('reference'):
                ref = dr_dict['subject']['reference']
                if '/' in ref:
                    ref_type, ref_id = ref.split('/', 1)
                    self.base_service.create_search_param(
                        resource_fhir_id=resource_id,
                        param_name="subject",
                        param_value=ref,
                        param_type="reference",
                        reference_type=ref_type,
                        reference_id=ref_id
                    )

            # Extract issued date
            if dr_dict.get('issued'):
                try:
                    issued_dt = datetime.fromisoformat(dr_dict['issued'].replace('Z', '+00:00'))
                    self.base_service.create_search_param(
                        resource_fhir_id=resource_id,
                        param_name="issued",
                        param_value=dr_dict['issued'],
                        param_type="date",
                        date_value=issued_dt
                    )
                except ValueError:
                    logger.warning(f"Failed to parse issued date: {dr_dict['issued']}")

        except Exception as e:
            logger.error(f"Failed to extract search params: {str(e)}")

    def search_diagnostic_reports(
        self,
        identifier: Optional[str] = None,
        status: Optional[str] = None,
        subject: Optional[str] = None,
        code: Optional[str] = None,
        limit: int = 20,
        offset: int = 0
    ) -> tuple[List[FHIRResource], int]:
        """Search DiagnosticReport resources"""
        params = {}
        if identifier:
            params['identifier'] = identifier
        if status:
            params['status'] = status
        if subject:
            params['subject'] = subject
        if code:
            params['code'] = code

        return self.base_service.search_resources(
            resource_type="DiagnosticReport",
            params=params,
            limit=limit,
            offset=offset
        )
