"""
FHIR Observation Service

Handles FHIR R4 Observation resource creation and conversion from HL7 OBX segments
"""

from typing import Dict, Any, Optional, List
from sqlalchemy.orm import Session
from datetime import datetime
import logging

from app.services.fhir.fhir_base_service import FHIRBaseService
from app.models.fhir_resource import FHIRResource
from fhir.resources.observation import Observation
from fhir.resources.identifier import Identifier
from fhir.resources.reference import Reference
from fhir.resources.codeableconcept import CodeableConcept
from fhir.resources.coding import Coding
from fhir.resources.quantity import Quantity

logger = logging.getLogger(__name__)


class FHIRObservationService:
    """
    Service for FHIR Observation resource operations
    Handles conversion from HL7 OBX segments to FHIR Observation resources
    """

    def __init__(self, db: Session):
        self.db = db
        self.base_service = FHIRBaseService(db)

    def create_observation_from_hl7(
        self,
        obx_data: Dict[str, Any],
        patient_fhir_id: Optional[str] = None,
        diagnostic_report_fhir_id: Optional[str] = None,
        hl7_message_id: Optional[str] = None,
        source_system: Optional[str] = "HL7_ORU"
    ) -> Optional[FHIRResource]:
        """
        Create FHIR Observation resource from HL7 OBX segment

        Args:
            obx_data: Parsed OBX segment data
            patient_fhir_id: FHIR Patient resource ID (database UUID)
            diagnostic_report_fhir_id: FHIR DiagnosticReport resource ID (database UUID)
            hl7_message_id: Link to source HL7 message
            source_system: Source system identifier

        Returns:
            Created FHIRResource or None
        """
        try:
            # Extract status
            status = self._map_status(obx_data.get('observation_result_status', 'F'))

            # Extract code (what is being observed)
            code = self._extract_code(obx_data)

            # Extract subject (patient reference)
            subject = None
            if patient_fhir_id:
                patient_resource = self.base_service.get_resource_by_db_id(patient_fhir_id)
                if patient_resource:
                    subject = Reference(
                        reference=f"Patient/{patient_resource.resource_id}",
                        display=self._get_patient_display(patient_resource)
                    )

            # Extract effective datetime
            effective_datetime = self._parse_datetime(obx_data.get('date_time_of_observation'))

            # Extract value based on value type
            value_data = self._extract_value(obx_data)

            # Extract interpretation
            interpretation = self._extract_interpretation(obx_data)

            # Extract reference range
            reference_range = self._extract_reference_range(obx_data)

            # Extract note
            note = self._extract_note(obx_data)

            # Build FHIR Observation resource
            observation_dict = {
                "resourceType": "Observation",
                "status": status,
                "code": code.dict(exclude_none=True) if code else None,
                "subject": subject.dict(exclude_none=True) if subject else None,
                "effectiveDateTime": effective_datetime
            }

            # Add value based on type
            if value_data:
                observation_dict.update(value_data)

            # Add interpretation
            if interpretation:
                observation_dict["interpretation"] = [i.dict(exclude_none=True) for i in interpretation]

            # Add reference range
            if reference_range:
                observation_dict["referenceRange"] = reference_range

            # Add note
            if note:
                observation_dict["note"] = note

            # Remove None values
            observation_dict = {k: v for k, v in observation_dict.items() if v is not None}

            # Create FHIR resource
            fhir_resource = self.base_service.create_resource(
                resource_type="Observation",
                resource_json=observation_dict,
                author=source_system,
                source_system=source_system,
                hl7_message_id=hl7_message_id
            )

            # Create links
            if patient_fhir_id and fhir_resource:
                self.base_service.create_resource_link(
                    source_resource_id=str(fhir_resource.id),
                    source_resource_type="Observation",
                    target_resource_id=patient_fhir_id,
                    target_resource_type="Patient",
                    link_type="subject"
                )

            if diagnostic_report_fhir_id and fhir_resource:
                self.base_service.create_resource_link(
                    source_resource_id=diagnostic_report_fhir_id,
                    source_resource_type="DiagnosticReport",
                    target_resource_id=str(fhir_resource.id),
                    target_resource_type="Observation",
                    link_type="result"
                )

            # Extract and store search parameters
            self._extract_search_params(fhir_resource, observation_dict)

            self.db.commit()

            logger.info(f"Created FHIR Observation: {fhir_resource.resource_id}")
            return fhir_resource

        except Exception as e:
            logger.error(f"Failed to create Observation from HL7: {str(e)}")
            self.db.rollback()
            return None

    def _map_status(self, result_status: str) -> str:
        """
        Map HL7 Observation Result Status to FHIR status

        Args:
            result_status: HL7 OBX-11 value

        Returns:
            FHIR status (registered, preliminary, final, amended, corrected, cancelled, entered-in-error, unknown)
        """
        status_map = {
            'C': 'corrected',      # Record coming over is a correction
            'D': 'cancelled',      # Deletes the OBX record
            'F': 'final',          # Final results
            'I': 'registered',     # Specimen in lab; results pending
            'N': 'final',          # Not asked; used to affirmatively document that the observation was not sought
            'O': 'registered',     # Order detail description only (no result)
            'P': 'preliminary',    # Preliminary results
            'R': 'preliminary',    # Results entered -- not verified
            'S': 'registered',     # Partial results
            'U': 'corrected',      # Results status change to final
            'W': 'amended',        # Post original as wrong, e.g., transmitted for wrong patient
            'X': 'cancelled'       # Results cannot be obtained for this observation
        }

        return status_map.get(result_status.upper(), 'final')

    def _extract_code(self, obx_data: Dict[str, Any]) -> Optional[CodeableConcept]:
        """Extract observation code from OBX-3"""
        observation_identifier = obx_data.get('observation_identifier')
        observation_sub_id = obx_data.get('observation_sub_id')
        observation_text = obx_data.get('observation_text')

        if not observation_identifier:
            return None

        codings = [Coding(
            system="http://loinc.org",  # Assuming LOINC
            code=observation_identifier,
            display=observation_text
        )]

        return CodeableConcept(
            coding=codings,
            text=observation_text or observation_identifier
        )

    def _extract_value(self, obx_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Extract observation value based on OBX-2 value type

        Args:
            obx_data: OBX segment data

        Returns:
            Dict with appropriate value field (valueQuantity, valueString, valueCodeableConcept, etc.)
        """
        value_type = obx_data.get('value_type', 'TX')
        observation_value = obx_data.get('observation_value')
        units = obx_data.get('units')

        if not observation_value:
            return None

        # Numeric values (NM)
        if value_type == 'NM':
            try:
                numeric_value = float(observation_value)
                quantity = {
                    "value": numeric_value,
                    "unit": units,
                    "system": "http://unitsofmeasure.org",
                    "code": units
                }
                return {"valueQuantity": quantity}
            except ValueError:
                # Fall back to string
                return {"valueString": str(observation_value)}

        # Coded values (CE, CWE)
        elif value_type in ['CE', 'CWE']:
            return {
                "valueCodeableConcept": {
                    "coding": [{
                        "system": "http://terminology.hl7.org/CodeSystem/v2-0078",
                        "code": str(observation_value),
                        "display": str(observation_value)
                    }],
                    "text": str(observation_value)
                }
            }

        # Text values (TX, FT, ST)
        elif value_type in ['TX', 'FT', 'ST']:
            return {"valueString": str(observation_value)}

        # Date/Time (DT, TM, TS)
        elif value_type in ['DT', 'TM', 'TS']:
            parsed_datetime = self._parse_datetime(str(observation_value))
            if parsed_datetime:
                return {"valueDateTime": parsed_datetime}
            return {"valueString": str(observation_value)}

        # Default to string
        else:
            return {"valueString": str(observation_value)}

    def _extract_interpretation(self, obx_data: Dict[str, Any]) -> Optional[List[CodeableConcept]]:
        """Extract abnormal flags as interpretation"""
        abnormal_flags = obx_data.get('abnormal_flags')

        if not abnormal_flags:
            return None

        interpretation_map = {
            'L': ('L', 'Low'),
            'H': ('H', 'High'),
            'LL': ('LL', 'Critical low'),
            'HH': ('HH', 'Critical high'),
            'N': ('N', 'Normal'),
            'A': ('A', 'Abnormal'),
            'AA': ('AA', 'Critical abnormal'),
            '<': ('L', 'Low'),
            '>': ('H', 'High'),
            'S': ('S', 'Susceptible'),
            'R': ('R', 'Resistant'),
            'I': ('I', 'Intermediate'),
            'MS': ('MS', 'Moderately susceptible'),
            'VS': ('VS', 'Very susceptible')
        }

        code, display = interpretation_map.get(abnormal_flags.upper(), (abnormal_flags, abnormal_flags))

        return [CodeableConcept(
            coding=[Coding(
                system="http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation",
                code=code,
                display=display
            )],
            text=display
        )]

    def _extract_reference_range(self, obx_data: Dict[str, Any]) -> Optional[List[Dict[str, Any]]]:
        """Extract reference range from OBX-7"""
        reference_range = obx_data.get('references_range')

        if not reference_range:
            return None

        # Try to parse range (e.g., "10-20", "<10", ">20")
        range_text = str(reference_range)

        return [{
            "text": range_text
        }]

    def _extract_note(self, obx_data: Dict[str, Any]) -> Optional[List[Dict[str, str]]]:
        """Extract notes from OBX data"""
        notes = []

        if obx_data.get('observation_method'):
            notes.append({
                "text": f"Method: {obx_data['observation_method']}"
            })

        return notes if notes else None

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

    def _extract_search_params(self, fhir_resource: FHIRResource, obs_dict: Dict[str, Any]):
        """Extract and store search parameters"""
        try:
            resource_id = str(fhir_resource.id)

            # Extract status
            if obs_dict.get('status'):
                self.base_service.create_search_param(
                    resource_fhir_id=resource_id,
                    param_name="status",
                    param_value=obs_dict['status'],
                    param_type="token"
                )

            # Extract code
            if obs_dict.get('code') and obs_dict['code'].get('coding'):
                for coding in obs_dict['code']['coding']:
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
            if obs_dict.get('subject') and obs_dict['subject'].get('reference'):
                ref = obs_dict['subject']['reference']
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

            # Extract value (for numeric values)
            if obs_dict.get('valueQuantity'):
                value_qty = obs_dict['valueQuantity']
                if value_qty.get('value'):
                    self.base_service.create_search_param(
                        resource_fhir_id=resource_id,
                        param_name="value-quantity",
                        param_value=str(value_qty['value']),
                        param_type="number",
                        number_value=float(value_qty['value'])
                    )

        except Exception as e:
            logger.error(f"Failed to extract search params: {str(e)}")

    def search_observations(
        self,
        status: Optional[str] = None,
        subject: Optional[str] = None,
        code: Optional[str] = None,
        limit: int = 20,
        offset: int = 0
    ) -> tuple[List[FHIRResource], int]:
        """Search Observation resources"""
        params = {}
        if status:
            params['status'] = status
        if subject:
            params['subject'] = subject
        if code:
            params['code'] = code

        return self.base_service.search_resources(
            resource_type="Observation",
            params=params,
            limit=limit,
            offset=offset
        )
