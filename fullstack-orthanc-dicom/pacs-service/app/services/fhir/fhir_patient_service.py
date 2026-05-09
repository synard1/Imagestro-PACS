"""
FHIR Patient Service

Handles FHIR R4 Patient resource creation, updates, and conversion from HL7 ADT messages
"""

from typing import Dict, Any, Optional, List
from sqlalchemy.orm import Session
from datetime import datetime
import json
import logging

from app.services.fhir.fhir_base_service import FHIRBaseService
from app.models.fhir_resource import FHIRResource
from fhir.resources.patient import Patient
from fhir.resources.identifier import Identifier
from fhir.resources.humanname import HumanName
from fhir.resources.contactpoint import ContactPoint
from fhir.resources.address import Address

logger = logging.getLogger(__name__)


class FHIRPatientService:
    """
    Service for FHIR Patient resource operations
    Handles conversion from HL7 ADT messages to FHIR Patient resources
    """

    def __init__(self, db: Session):
        self.db = db
        self.base_service = FHIRBaseService(db)

    def create_patient_from_hl7(
        self,
        pid_data: Dict[str, Any],
        hl7_message_id: Optional[str] = None,
        source_system: Optional[str] = "HL7_ADT"
    ) -> Optional[FHIRResource]:
        """
        Create FHIR Patient resource from HL7 PID segment data

        Args:
            pid_data: Parsed PID segment data from HL7 message
            hl7_message_id: Link to source HL7 message
            source_system: Source system identifier

        Returns:
            Created FHIRResource or None
        """
        try:
            # Extract patient identifiers
            identifiers = self._extract_identifiers(pid_data)

            # Extract patient name
            names = self._extract_names(pid_data)

            # Extract contact points (phone, email)
            telecoms = self._extract_telecoms(pid_data)

            # Extract address
            addresses = self._extract_addresses(pid_data)

            # Extract gender
            gender = self._map_gender(pid_data.get('sex'))

            # Extract birth date
            birth_date = self._parse_date(pid_data.get('date_of_birth'))

            # Build FHIR Patient resource
            patient = Patient(
                identifier=identifiers if identifiers else None,
                name=names if names else None,
                telecom=telecoms if telecoms else None,
                address=addresses if addresses else None,
                gender=gender,
                birthDate=birth_date,
                active=True
            )

            # Convert to plain JSON-serializable dict
            patient_dict = json.loads(patient.json(exclude_none=True))

            # Get patient external ID (use first identifier)
            patient_external_id = None
            if identifiers:
                patient_external_id = identifiers[0].value

            # Check if patient already exists
            existing_patient = None
            if patient_external_id:
                existing_patient = self.base_service.search_by_identifier(
                    resource_type="Patient",
                    identifier_system=identifiers[0].system if identifiers[0].system else None,
                    identifier_value=patient_external_id
                )

            if existing_patient:
                # Update existing patient
                logger.info(f"Updating existing Patient: {existing_patient.resource_id}")
                fhir_resource = self.base_service.update_resource(
                    resource_type="Patient",
                    resource_id=existing_patient.resource_id,
                    resource_json=patient_dict,
                    author=source_system
                )
            else:
                # Create new patient
                fhir_resource = self.base_service.create_resource(
                    resource_type="Patient",
                    resource_json=patient_dict,
                    author=source_system,
                    source_system=source_system,
                    hl7_message_id=hl7_message_id,
                    patient_external_id=patient_external_id
                )

            # Extract and store search parameters
            self._extract_search_params(fhir_resource, patient_dict)

            self.db.commit()

            logger.info(f"Created/Updated FHIR Patient: {fhir_resource.resource_id}")
            return fhir_resource

        except Exception as e:
            logger.error(f"Failed to create Patient from HL7: {str(e)}")
            self.db.rollback()
            return None

    def _extract_identifiers(self, pid_data: Dict[str, Any]) -> List[Identifier]:
        """
        Extract patient identifiers from PID data

        Args:
            pid_data: PID segment data

        Returns:
            List of FHIR Identifier objects
        """
        identifiers = []

        # Patient ID (PID-3)
        if pid_data.get('patient_id'):
            identifiers.append(Identifier(
                system="urn:oid:2.16.840.1.113883.2.9.4.3.2",  # Example: National Patient ID
                value=str(pid_data['patient_id']),
                use="official"
            ))

        # Medical Record Number (PID-2 or PID-3)
        if pid_data.get('mrn'):
            identifiers.append(Identifier(
                system="http://hospital.example.org/mrn",
                value=str(pid_data['mrn']),
                use="usual",
                type={
                    "coding": [{
                        "system": "http://terminology.hl7.org/CodeSystem/v2-0203",
                        "code": "MR",
                        "display": "Medical Record Number"
                    }]
                }
            ))

        # Social Security Number (PID-19)
        if pid_data.get('ssn'):
            identifiers.append(Identifier(
                system="http://hl7.org/fhir/sid/us-ssn",
                value=str(pid_data['ssn']),
                use="official",
                type={
                    "coding": [{
                        "system": "http://terminology.hl7.org/CodeSystem/v2-0203",
                        "code": "SS",
                        "display": "Social Security Number"
                    }]
                }
            ))

        return identifiers

    def _extract_names(self, pid_data: Dict[str, Any]) -> List[HumanName]:
        """
        Extract patient names from PID data

        Args:
            pid_data: PID segment data

        Returns:
            List of FHIR HumanName objects
        """
        names = []

        # Primary name (PID-5)
        family = pid_data.get('family_name')
        given = pid_data.get('given_name')
        middle = pid_data.get('middle_name')

        if family or given:
            given_names = []
            if given:
                given_names.append(given)
            if middle:
                given_names.append(middle)

            names.append(HumanName(
                use="official",
                family=family,
                given=given_names if given_names else None,
                prefix=[pid_data['prefix']] if pid_data.get('prefix') else None,
                suffix=[pid_data['suffix']] if pid_data.get('suffix') else None
            ))

        # Mother's maiden name (PID-6)
        if pid_data.get('mothers_maiden_name'):
            names.append(HumanName(
                use="maiden",
                family=pid_data['mothers_maiden_name']
            ))

        return names

    def _extract_telecoms(self, pid_data: Dict[str, Any]) -> List[ContactPoint]:
        """
        Extract contact points from PID data

        Args:
            pid_data: PID segment data

        Returns:
            List of FHIR ContactPoint objects
        """
        telecoms = []

        # Home phone (PID-13)
        if pid_data.get('home_phone'):
            telecoms.append(ContactPoint(
                system="phone",
                value=pid_data['home_phone'],
                use="home"
            ))

        # Business phone (PID-14)
        if pid_data.get('business_phone'):
            telecoms.append(ContactPoint(
                system="phone",
                value=pid_data['business_phone'],
                use="work"
            ))

        # Email (PID-13 or custom field)
        if pid_data.get('email'):
            telecoms.append(ContactPoint(
                system="email",
                value=pid_data['email'],
                use="home"
            ))

        return telecoms

    def _extract_addresses(self, pid_data: Dict[str, Any]) -> List[Address]:
        """
        Extract addresses from PID data

        Args:
            pid_data: PID segment data

        Returns:
            List of FHIR Address objects
        """
        addresses = []

        # Primary address (PID-11)
        if any([
            pid_data.get('street_address'),
            pid_data.get('city'),
            pid_data.get('state'),
            pid_data.get('zip_code'),
            pid_data.get('country')
        ]):
            line = []
            if pid_data.get('street_address'):
                line.append(pid_data['street_address'])
            if pid_data.get('other_designation'):
                line.append(pid_data['other_designation'])

            addresses.append(Address(
                use="home",
                type="both",
                line=line if line else None,
                city=pid_data.get('city'),
                state=pid_data.get('state'),
                postalCode=pid_data.get('zip_code'),
                country=pid_data.get('country')
            ))

        return addresses

    def _map_gender(self, hl7_gender: Optional[str]) -> Optional[str]:
        """
        Map HL7 gender to FHIR gender

        Args:
            hl7_gender: HL7 gender code (M, F, O, U)

        Returns:
            FHIR gender code (male, female, other, unknown)
        """
        if not hl7_gender:
            return None

        gender_map = {
            'M': 'male',
            'F': 'female',
            'O': 'other',
            'U': 'unknown',
            'A': 'other',  # Ambiguous
            'N': 'unknown'  # Not applicable
        }

        return gender_map.get(hl7_gender.upper(), 'unknown')

    def _parse_date(self, hl7_date: Optional[str]) -> Optional[str]:
        """
        Parse HL7 date to FHIR date format (YYYY-MM-DD)

        Args:
            hl7_date: HL7 date string (YYYYMMDD or YYYYMMDDHHMMSS)

        Returns:
            FHIR date string (YYYY-MM-DD) or None
        """
        if not hl7_date:
            return None

        try:
            # Remove non-numeric characters
            date_str = ''.join(c for c in hl7_date if c.isdigit())

            if len(date_str) >= 8:
                year = date_str[0:4]
                month = date_str[4:6]
                day = date_str[6:8]
                return f"{year}-{month}-{day}"
            elif len(date_str) >= 6:
                year = date_str[0:4]
                month = date_str[4:6]
                return f"{year}-{month}"
            elif len(date_str) >= 4:
                return date_str[0:4]

        except Exception as e:
            logger.warning(f"Failed to parse date: {hl7_date}, error: {str(e)}")

        return None

    def _extract_search_params(self, fhir_resource: FHIRResource, patient_dict: Dict[str, Any]):
        """
        Extract and store search parameters for Patient resource

        Args:
            fhir_resource: Created FHIRResource instance
            patient_dict: Patient resource as dict
        """
        try:
            resource_id = str(fhir_resource.id)

            # Extract identifiers
            if patient_dict.get('identifier'):
                for identifier in patient_dict['identifier']:
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

            # Extract names
            if patient_dict.get('name'):
                for name in patient_dict['name']:
                    if isinstance(name, dict):
                        if name.get('family'):
                            self.base_service.create_search_param(
                                resource_fhir_id=resource_id,
                                param_name="family",
                                param_value=name['family'],
                                param_type="string"
                            )
                        if name.get('given'):
                            for given in name['given']:
                                self.base_service.create_search_param(
                                    resource_fhir_id=resource_id,
                                    param_name="given",
                                    param_value=given,
                                    param_type="string"
                                )

            # Extract gender
            if patient_dict.get('gender'):
                self.base_service.create_search_param(
                    resource_fhir_id=resource_id,
                    param_name="gender",
                    param_value=patient_dict['gender'],
                    param_type="token"
                )

            # Extract birthdate
            if patient_dict.get('birthDate'):
                birth_date_str = patient_dict['birthDate']
                try:
                    birth_date = datetime.strptime(birth_date_str, '%Y-%m-%d')
                    self.base_service.create_search_param(
                        resource_fhir_id=resource_id,
                        param_name="birthdate",
                        param_value=birth_date_str,
                        param_type="date",
                        date_value=birth_date
                    )
                except ValueError:
                    logger.warning(f"Failed to parse birthdate: {birth_date_str}")

        except Exception as e:
            logger.error(f"Failed to extract search params: {str(e)}")

    def get_patient_by_identifier(
        self,
        identifier_system: Optional[str],
        identifier_value: str
    ) -> Optional[FHIRResource]:
        """
        Get Patient by identifier

        Args:
            identifier_system: Identifier system
            identifier_value: Identifier value

        Returns:
            FHIRResource or None
        """
        return self.base_service.search_by_identifier(
            resource_type="Patient",
            identifier_system=identifier_system,
            identifier_value=identifier_value
        )

    def search_patients(
        self,
        family: Optional[str] = None,
        given: Optional[str] = None,
        birthdate: Optional[str] = None,
        gender: Optional[str] = None,
        identifier: Optional[str] = None,
        limit: int = 20,
        offset: int = 0
    ) -> tuple[List[FHIRResource], int]:
        """
        Search patients by common parameters

        Args:
            family: Family name
            given: Given name
            birthdate: Birth date (YYYY-MM-DD)
            gender: Gender (male, female, other, unknown)
            identifier: Identifier value
            limit: Maximum results
            offset: Offset for pagination

        Returns:
            Tuple of (list of FHIRResource, total count)
        """
        params = {}
        if family:
            params['family'] = family
        if given:
            params['given'] = given
        if birthdate:
            params['birthdate'] = birthdate
        if gender:
            params['gender'] = gender
        if identifier:
            params['identifier'] = identifier

        return self.base_service.search_resources(
            resource_type="Patient",
            params=params,
            limit=limit,
            offset=offset
        )
