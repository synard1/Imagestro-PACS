"""
HL7 to FHIR Converter Service

Orchestrates conversion of HL7 v2.x messages to FHIR R4 resources
Integrates all FHIR resource services for automatic conversion
"""

from typing import Dict, Any, Optional, List, Tuple
from sqlalchemy.orm import Session
import logging

from app.services.fhir.fhir_patient_service import FHIRPatientService
from app.services.fhir.fhir_service_request_service import FHIRServiceRequestService
from app.services.fhir.fhir_diagnostic_report_service import FHIRDiagnosticReportService
from app.services.fhir.fhir_observation_service import FHIRObservationService
from app.models.fhir_resource import FHIRResource

logger = logging.getLogger(__name__)


class HL7ToFHIRConverter:
    """
    Converts HL7 v2.x messages to FHIR R4 resources
    Handles ADT, ORM, and ORU message types
    """

    def __init__(self, db: Session):
        self.db = db
        self.patient_service = FHIRPatientService(db)
        self.service_request_service = FHIRServiceRequestService(db)
        self.diagnostic_report_service = FHIRDiagnosticReportService(db)
        self.observation_service = FHIRObservationService(db)

    # ========================================================================
    # ADT Message Conversion (Patient Demographics)
    # ========================================================================

    def convert_adt_to_fhir(
        self,
        parsed_data: Dict[str, Any],
        hl7_message_id: Optional[str] = None,
        source_system: Optional[str] = "HL7_ADT"
    ) -> Dict[str, Any]:
        """
        Convert HL7 ADT message to FHIR Patient resource

        Args:
            parsed_data: Parsed HL7 ADT message data (MSH, PID, PV1)
            hl7_message_id: Link to source HL7 message
            source_system: Source system identifier

        Returns:
            Dict with conversion results
        """
        try:
            result = {
                'success': False,
                'message_type': 'ADT',
                'resources_created': [],
                'errors': []
            }

            # Extract PID segment
            pid_data = parsed_data.get('PID', {})
            if not pid_data:
                result['errors'].append("No PID segment found in ADT message")
                return result

            # Create/Update Patient resource
            patient_resource = self.patient_service.create_patient_from_hl7(
                pid_data=pid_data,
                hl7_message_id=hl7_message_id,
                source_system=source_system
            )

            if patient_resource:
                result['resources_created'].append({
                    'resourceType': 'Patient',
                    'id': patient_resource.resource_id,
                    'db_id': str(patient_resource.id),
                    'version': patient_resource.version_id
                })
                result['success'] = True
                result['patient_fhir_id'] = str(patient_resource.id)
                logger.info(f"Successfully converted ADT to FHIR Patient: {patient_resource.resource_id}")
            else:
                result['errors'].append("Failed to create Patient resource")

            return result

        except Exception as e:
            logger.error(f"Failed to convert ADT to FHIR: {str(e)}")
            return {
                'success': False,
                'message_type': 'ADT',
                'resources_created': [],
                'errors': [str(e)]
            }

    # ========================================================================
    # ORM Message Conversion (Orders)
    # ========================================================================

    def convert_orm_to_fhir(
        self,
        parsed_data: Dict[str, Any],
        hl7_message_id: Optional[str] = None,
        order_id: Optional[str] = None,
        source_system: Optional[str] = "HL7_ORM"
    ) -> Dict[str, Any]:
        """
        Convert HL7 ORM message to FHIR Patient and ServiceRequest resources

        Args:
            parsed_data: Parsed HL7 ORM message data (MSH, PID, ORC, OBR)
            hl7_message_id: Link to source HL7 message
            order_id: Link to orders table
            source_system: Source system identifier

        Returns:
            Dict with conversion results
        """
        try:
            result = {
                'success': False,
                'message_type': 'ORM',
                'resources_created': [],
                'errors': []
            }

            # Step 1: Create/Update Patient from PID
            pid_data = parsed_data.get('PID', {})
            patient_fhir_id = None

            if pid_data:
                patient_resource = self.patient_service.create_patient_from_hl7(
                    pid_data=pid_data,
                    hl7_message_id=hl7_message_id,
                    source_system=source_system
                )

                if patient_resource:
                    patient_fhir_id = str(patient_resource.id)
                    result['resources_created'].append({
                        'resourceType': 'Patient',
                        'id': patient_resource.resource_id,
                        'db_id': str(patient_resource.id),
                        'version': patient_resource.version_id
                    })
                    result['patient_fhir_id'] = patient_fhir_id
                else:
                    result['errors'].append("Failed to create Patient resource")

            # Step 2: Create/Update ServiceRequest from ORC and OBR
            orc_data = parsed_data.get('ORC', {})
            obr_data = parsed_data.get('OBR', {})

            if orc_data or obr_data:
                service_request_resource = self.service_request_service.create_service_request_from_hl7(
                    orc_data=orc_data,
                    obr_data=obr_data,
                    patient_fhir_id=patient_fhir_id,
                    hl7_message_id=hl7_message_id,
                    order_id=order_id,
                    source_system=source_system
                )

                if service_request_resource:
                    result['resources_created'].append({
                        'resourceType': 'ServiceRequest',
                        'id': service_request_resource.resource_id,
                        'db_id': str(service_request_resource.id),
                        'version': service_request_resource.version_id
                    })
                    result['service_request_fhir_id'] = str(service_request_resource.id)
                    result['success'] = True
                    logger.info(f"Successfully converted ORM to FHIR: ServiceRequest {service_request_resource.resource_id}")
                else:
                    result['errors'].append("Failed to create ServiceRequest resource")
            else:
                result['errors'].append("No ORC or OBR segment found in ORM message")

            return result

        except Exception as e:
            logger.error(f"Failed to convert ORM to FHIR: {str(e)}")
            return {
                'success': False,
                'message_type': 'ORM',
                'resources_created': [],
                'errors': [str(e)]
            }

    # ========================================================================
    # ORU Message Conversion (Results)
    # ========================================================================

    def convert_oru_to_fhir(
        self,
        parsed_data: Dict[str, Any],
        hl7_message_id: Optional[str] = None,
        order_id: Optional[str] = None,
        source_system: Optional[str] = "HL7_ORU"
    ) -> Dict[str, Any]:
        """
        Convert HL7 ORU message to FHIR Patient, DiagnosticReport, and Observation resources

        Args:
            parsed_data: Parsed HL7 ORU message data (MSH, PID, OBR, OBX)
            hl7_message_id: Link to source HL7 message
            order_id: Link to orders table
            source_system: Source system identifier

        Returns:
            Dict with conversion results
        """
        try:
            result = {
                'success': False,
                'message_type': 'ORU',
                'resources_created': [],
                'errors': []
            }

            # Step 1: Create/Update Patient from PID
            pid_data = parsed_data.get('PID', {})
            patient_fhir_id = None

            if pid_data:
                patient_resource = self.patient_service.create_patient_from_hl7(
                    pid_data=pid_data,
                    hl7_message_id=hl7_message_id,
                    source_system=source_system
                )

                if patient_resource:
                    patient_fhir_id = str(patient_resource.id)
                    result['resources_created'].append({
                        'resourceType': 'Patient',
                        'id': patient_resource.resource_id,
                        'db_id': str(patient_resource.id),
                        'version': patient_resource.version_id
                    })
                    result['patient_fhir_id'] = patient_fhir_id
                else:
                    result['errors'].append("Failed to create Patient resource")

            # Step 2: Find or create ServiceRequest
            obr_data = parsed_data.get('OBR', {})
            service_request_fhir_id = None

            if obr_data:
                # Try to find existing ServiceRequest by accession number
                accession_number = obr_data.get('filler_order_number') or obr_data.get('placer_order_number')
                if accession_number:
                    existing_sr = self.service_request_service.base_service.search_by_identifier(
                        resource_type="ServiceRequest",
                        identifier_system="http://hospital.example.org/accession",
                        identifier_value=accession_number
                    )
                    if existing_sr:
                        service_request_fhir_id = str(existing_sr.id)
                        result['service_request_fhir_id'] = service_request_fhir_id

            # Step 3: Create/Update DiagnosticReport from OBR
            obx_list = parsed_data.get('OBX', [])
            if not isinstance(obx_list, list):
                obx_list = [obx_list] if obx_list else []

            diagnostic_report_fhir_id = None

            if obr_data:
                diagnostic_report_resource = self.diagnostic_report_service.create_diagnostic_report_from_hl7(
                    obr_data=obr_data,
                    obx_data=obx_list,
                    patient_fhir_id=patient_fhir_id,
                    service_request_fhir_id=service_request_fhir_id,
                    hl7_message_id=hl7_message_id,
                    order_id=order_id,
                    source_system=source_system
                )

                if diagnostic_report_resource:
                    diagnostic_report_fhir_id = str(diagnostic_report_resource.id)
                    result['resources_created'].append({
                        'resourceType': 'DiagnosticReport',
                        'id': diagnostic_report_resource.resource_id,
                        'db_id': str(diagnostic_report_resource.id),
                        'version': diagnostic_report_resource.version_id
                    })
                    result['diagnostic_report_fhir_id'] = diagnostic_report_fhir_id
                    logger.info(f"Successfully created DiagnosticReport: {diagnostic_report_resource.resource_id}")
                else:
                    result['errors'].append("Failed to create DiagnosticReport resource")

            # Step 4: Create Observations from OBX segments
            observation_count = 0
            if obx_list and patient_fhir_id:
                for obx_data in obx_list:
                    if not obx_data:
                        continue

                    observation_resource = self.observation_service.create_observation_from_hl7(
                        obx_data=obx_data,
                        patient_fhir_id=patient_fhir_id,
                        diagnostic_report_fhir_id=diagnostic_report_fhir_id,
                        hl7_message_id=hl7_message_id,
                        source_system=source_system
                    )

                    if observation_resource:
                        result['resources_created'].append({
                            'resourceType': 'Observation',
                            'id': observation_resource.resource_id,
                            'db_id': str(observation_resource.id),
                            'version': observation_resource.version_id
                        })
                        observation_count += 1

                logger.info(f"Created {observation_count} Observation resources from OBX segments")

            # Mark as successful if we created at least DiagnosticReport
            if diagnostic_report_fhir_id:
                result['success'] = True
                logger.info(f"Successfully converted ORU to FHIR: {len(result['resources_created'])} resources created")
            else:
                result['errors'].append("No DiagnosticReport created")

            return result

        except Exception as e:
            logger.error(f"Failed to convert ORU to FHIR: {str(e)}")
            return {
                'success': False,
                'message_type': 'ORU',
                'resources_created': [],
                'errors': [str(e)]
            }

    # ========================================================================
    # Generic Converter
    # ========================================================================

    def convert_hl7_message_to_fhir(
        self,
        message_type: str,
        message_trigger: str,
        parsed_data: Dict[str, Any],
        hl7_message_id: Optional[str] = None,
        order_id: Optional[str] = None,
        source_system: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generic converter that routes to appropriate message type handler

        Args:
            message_type: HL7 message type (ADT, ORM, ORU)
            message_trigger: HL7 trigger event (A01, O01, R01, etc.)
            parsed_data: Parsed HL7 message data
            hl7_message_id: Link to source HL7 message
            order_id: Link to orders table
            source_system: Source system identifier

        Returns:
            Dict with conversion results
        """
        try:
            # Determine source system if not provided
            if not source_system:
                source_system = f"HL7_{message_type}"

            logger.info(f"Converting HL7 {message_type}^{message_trigger} to FHIR resources")

            # Route to appropriate converter
            if message_type == 'ADT':
                return self.convert_adt_to_fhir(
                    parsed_data=parsed_data,
                    hl7_message_id=hl7_message_id,
                    source_system=source_system
                )

            elif message_type == 'ORM':
                return self.convert_orm_to_fhir(
                    parsed_data=parsed_data,
                    hl7_message_id=hl7_message_id,
                    order_id=order_id,
                    source_system=source_system
                )

            elif message_type == 'ORU':
                return self.convert_oru_to_fhir(
                    parsed_data=parsed_data,
                    hl7_message_id=hl7_message_id,
                    order_id=order_id,
                    source_system=source_system
                )

            else:
                logger.warning(f"Unsupported message type for FHIR conversion: {message_type}")
                return {
                    'success': False,
                    'message_type': message_type,
                    'resources_created': [],
                    'errors': [f"Unsupported message type: {message_type}"]
                }

        except Exception as e:
            logger.error(f"Failed to convert HL7 message to FHIR: {str(e)}")
            return {
                'success': False,
                'message_type': message_type,
                'resources_created': [],
                'errors': [str(e)]
            }

    # ========================================================================
    # Utility Methods
    # ========================================================================

    def get_conversion_summary(self, conversion_result: Dict[str, Any]) -> str:
        """
        Generate a human-readable summary of conversion results

        Args:
            conversion_result: Result dict from conversion

        Returns:
            Summary string
        """
        if conversion_result.get('success'):
            resources = conversion_result.get('resources_created', [])
            resource_summary = ", ".join([f"{r['resourceType']} ({r['id']})" for r in resources])
            return f"Successfully converted {conversion_result['message_type']} message to {len(resources)} FHIR resources: {resource_summary}"
        else:
            errors = conversion_result.get('errors', [])
            error_summary = "; ".join(errors)
            return f"Failed to convert {conversion_result['message_type']} message: {error_summary}"
