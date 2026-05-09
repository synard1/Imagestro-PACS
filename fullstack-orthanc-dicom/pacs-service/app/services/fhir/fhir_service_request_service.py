"""
FHIR ServiceRequest Service

Handles FHIR R4 ServiceRequest resource creation and conversion from HL7 ORM messages
"""

from typing import Dict, Any, Optional, List
from sqlalchemy.orm import Session
from datetime import datetime
import logging

from app.services.fhir.fhir_base_service import FHIRBaseService
from app.models.fhir_resource import FHIRResource
from fhir.resources.servicerequest import ServiceRequest
from fhir.resources.identifier import Identifier
from fhir.resources.reference import Reference
from fhir.resources.codeableconcept import CodeableConcept
from fhir.resources.coding import Coding

logger = logging.getLogger(__name__)


class FHIRServiceRequestService:
    """
    Service for FHIR ServiceRequest resource operations
    Handles conversion from HL7 ORM messages to FHIR ServiceRequest resources
    """

    def __init__(self, db: Session):
        self.db = db
        self.base_service = FHIRBaseService(db)

    def create_service_request_from_hl7(
        self,
        orc_data: Dict[str, Any],
        obr_data: Dict[str, Any],
        patient_fhir_id: Optional[str] = None,
        hl7_message_id: Optional[str] = None,
        order_id: Optional[str] = None,
        source_system: Optional[str] = "HL7_ORM"
    ) -> Optional[FHIRResource]:
        """
        Create FHIR ServiceRequest resource from HL7 ORC and OBR segments

        Args:
            orc_data: Parsed ORC segment data
            obr_data: Parsed OBR segment data
            patient_fhir_id: FHIR Patient resource ID (database UUID)
            hl7_message_id: Link to source HL7 message
            order_id: Link to orders table
            source_system: Source system identifier

        Returns:
            Created FHIRResource or None
        """
        try:
            # Extract identifiers
            identifiers = self._extract_identifiers(orc_data, obr_data)

            # Extract status
            status = self._map_status(orc_data.get('order_control'))

            # Extract intent
            intent = "order"  # ORM messages are typically orders

            # Extract priority
            priority = self._map_priority(obr_data.get('priority'))

            # Extract code (what is being ordered)
            code = self._extract_code(obr_data)

            # Extract subject (patient reference)
            subject = None
            if patient_fhir_id:
                # Get patient resource
                patient_resource = self.base_service.get_resource_by_db_id(patient_fhir_id)
                if patient_resource:
                    subject = Reference(
                        reference=f"Patient/{patient_resource.resource_id}",
                        display=self._get_patient_display(patient_resource)
                    )

            # Extract authored date
            authored_on = self._parse_datetime(orc_data.get('date_time_of_transaction') or obr_data.get('observation_date_time'))

            # Extract requester
            requester = self._extract_requester(orc_data, obr_data)

            # Extract performer type (modality)
            performer_type = self._extract_performer_type(obr_data)

            # Extract reason
            reason_code = self._extract_reason_code(obr_data)

            # Extract notes
            notes = self._extract_notes(obr_data)

            # Build FHIR ServiceRequest resource
            service_request = ServiceRequest(
                identifier=identifiers if identifiers else None,
                status=status,
                intent=intent,
                priority=priority,
                code=code,
                subject=subject,
                authoredOn=authored_on,
                requester=requester,
                performerType=performer_type,
                reasonCode=reason_code if reason_code else None,
                note=notes if notes else None
            )

            # Convert to dict
            service_request_dict = service_request.dict(exclude_none=True)

            # Get accession number (placer/filler order number)
            accession_number = obr_data.get('placer_order_number') or obr_data.get('filler_order_number')

            # Check if ServiceRequest already exists
            existing_sr = None
            if accession_number:
                existing_sr = self.base_service.search_by_identifier(
                    resource_type="ServiceRequest",
                    identifier_system="http://hospital.example.org/accession",
                    identifier_value=accession_number
                )

            if existing_sr:
                # Update existing ServiceRequest
                logger.info(f"Updating existing ServiceRequest: {existing_sr.resource_id}")
                fhir_resource = self.base_service.update_resource(
                    resource_type="ServiceRequest",
                    resource_id=existing_sr.resource_id,
                    resource_json=service_request_dict,
                    author=source_system
                )
            else:
                # Create new ServiceRequest
                fhir_resource = self.base_service.create_resource(
                    resource_type="ServiceRequest",
                    resource_json=service_request_dict,
                    author=source_system,
                    source_system=source_system,
                    hl7_message_id=hl7_message_id,
                    order_id=order_id
                )

            # Create link to Patient if available
            if patient_fhir_id and fhir_resource:
                self.base_service.create_resource_link(
                    source_resource_id=str(fhir_resource.id),
                    source_resource_type="ServiceRequest",
                    target_resource_id=patient_fhir_id,
                    target_resource_type="Patient",
                    link_type="subject"
                )

            # Extract and store search parameters
            self._extract_search_params(fhir_resource, service_request_dict)

            self.db.commit()

            logger.info(f"Created/Updated FHIR ServiceRequest: {fhir_resource.resource_id}")
            return fhir_resource

        except Exception as e:
            logger.error(f"Failed to create ServiceRequest from HL7: {str(e)}")
            self.db.rollback()
            return None

    def _extract_identifiers(self, orc_data: Dict[str, Any], obr_data: Dict[str, Any]) -> List[Identifier]:
        """Extract identifiers from ORC and OBR data"""
        identifiers = []

        # Placer Order Number (ORC-2, OBR-2)
        placer_order = orc_data.get('placer_order_number') or obr_data.get('placer_order_number')
        if placer_order:
            identifiers.append(Identifier(
                system="http://hospital.example.org/placer-order",
                value=str(placer_order),
                type={
                    "coding": [{
                        "system": "http://terminology.hl7.org/CodeSystem/v2-0203",
                        "code": "PLAC",
                        "display": "Placer Identifier"
                    }]
                }
            ))

        # Filler Order Number (ORC-3, OBR-3) - Accession Number
        filler_order = orc_data.get('filler_order_number') or obr_data.get('filler_order_number')
        if filler_order:
            identifiers.append(Identifier(
                system="http://hospital.example.org/accession",
                value=str(filler_order),
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

    def _map_status(self, order_control: Optional[str]) -> str:
        """
        Map HL7 Order Control to FHIR ServiceRequest status

        Args:
            order_control: HL7 ORC-1 value (NW, CA, DC, etc.)

        Returns:
            FHIR status (draft, active, on-hold, revoked, completed, entered-in-error, unknown)
        """
        if not order_control:
            return "active"

        status_map = {
            'NW': 'active',        # New order
            'OK': 'active',        # Order accepted & OK
            'UA': 'active',        # Unable to accept
            'CA': 'revoked',       # Cancel order request
            'DC': 'revoked',       # Discontinue order request
            'DE': 'revoked',       # Data errors
            'OD': 'on-hold',       # Order discontinued
            'HD': 'on-hold',       # Hold order request
            'HR': 'active',        # On hold released
            'RL': 'active',        # Released previous hold
            'SC': 'active',        # Status changed
            'SN': 'active',        # Send order number
            'SR': 'active',        # Response to send order
            'SS': 'active',        # Send order status
            'XO': 'active',        # Change order
            'XR': 'active',        # Changed as requested
            'RE': 'active',        # Observations to follow
            'RO': 'active',        # Replacement order
            'RP': 'active',        # Order replace request
            'RU': 'active',        # Replaced unsolicited
            'PA': 'active',        # Parent order
            'CH': 'active',        # Child order
            'CN': 'active',        # Combined result
            'NA': 'active',        # Number assigned
            'RF': 'active'         # Refill order request
        }

        return status_map.get(order_control.upper(), 'active')

    def _map_priority(self, hl7_priority: Optional[str]) -> Optional[str]:
        """
        Map HL7 priority to FHIR priority

        Args:
            hl7_priority: HL7 priority code (S, A, R, P, C, T)

        Returns:
            FHIR priority (routine, urgent, asap, stat)
        """
        if not hl7_priority:
            return "routine"

        priority_map = {
            'S': 'stat',      # Stat
            'A': 'asap',      # ASAP
            'R': 'routine',   # Routine
            'P': 'routine',   # Preoperative
            'C': 'routine',   # Callback
            'T': 'routine',   # Timing critical
            'TS': 'stat',     # Timing critical stat
            'UR': 'urgent'    # Urgent
        }

        return priority_map.get(hl7_priority.upper(), 'routine')

    def _extract_code(self, obr_data: Dict[str, Any]) -> Optional[CodeableConcept]:
        """Extract procedure/service code from OBR-4"""
        universal_service_id = obr_data.get('universal_service_identifier')
        procedure_code = obr_data.get('procedure_code')
        procedure_text = obr_data.get('procedure_text')

        if not (universal_service_id or procedure_code):
            return None

        codings = []

        # Add procedure code
        if procedure_code:
            codings.append(Coding(
                system="http://loinc.org",  # Assuming LOINC
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
            text=procedure_text
        )

    def _extract_requester(self, orc_data: Dict[str, Any], obr_data: Dict[str, Any]) -> Optional[Reference]:
        """Extract ordering provider"""
        ordering_provider = orc_data.get('ordering_provider') or obr_data.get('ordering_provider')

        if ordering_provider:
            return Reference(
                reference=f"Practitioner/{ordering_provider}",
                display=ordering_provider
            )

        return None

    def _extract_performer_type(self, obr_data: Dict[str, Any]) -> Optional[List[CodeableConcept]]:
        """Extract modality from OBR data"""
        modality = obr_data.get('modality')

        if modality:
            return [CodeableConcept(
                coding=[Coding(
                    system="http://dicom.nema.org/resources/ontology/DCM",
                    code=modality,
                    display=modality
                )],
                text=modality
            )]

        return None

    def _extract_reason_code(self, obr_data: Dict[str, Any]) -> Optional[List[CodeableConcept]]:
        """Extract reason for exam"""
        reason = obr_data.get('reason_for_study')

        if reason:
            return [CodeableConcept(text=reason)]

        return None

    def _extract_notes(self, obr_data: Dict[str, Any]) -> Optional[List[Dict[str, Any]]]:
        """Extract clinical notes"""
        notes = []

        if obr_data.get('clinical_info'):
            notes.append({
                "text": obr_data['clinical_info']
            })

        if obr_data.get('comments'):
            notes.append({
                "text": obr_data['comments']
            })

        return notes if notes else None

    def _parse_datetime(self, hl7_datetime: Optional[str]) -> Optional[str]:
        """Parse HL7 datetime to FHIR datetime format"""
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
                return f"{year}-{month}-{day}"

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

    def _extract_search_params(self, fhir_resource: FHIRResource, sr_dict: Dict[str, Any]):
        """Extract and store search parameters"""
        try:
            resource_id = str(fhir_resource.id)

            # Extract identifiers
            if sr_dict.get('identifier'):
                for identifier in sr_dict['identifier']:
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
            if sr_dict.get('status'):
                self.base_service.create_search_param(
                    resource_fhir_id=resource_id,
                    param_name="status",
                    param_value=sr_dict['status'],
                    param_type="token"
                )

            # Extract code
            if sr_dict.get('code') and sr_dict['code'].get('coding'):
                for coding in sr_dict['code']['coding']:
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
            if sr_dict.get('subject') and sr_dict['subject'].get('reference'):
                ref = sr_dict['subject']['reference']
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

        except Exception as e:
            logger.error(f"Failed to extract search params: {str(e)}")

    def search_service_requests(
        self,
        identifier: Optional[str] = None,
        status: Optional[str] = None,
        subject: Optional[str] = None,
        code: Optional[str] = None,
        limit: int = 20,
        offset: int = 0
    ) -> tuple[List[FHIRResource], int]:
        """Search ServiceRequest resources"""
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
            resource_type="ServiceRequest",
            params=params,
            limit=limit,
            offset=offset
        )
