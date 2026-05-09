"""
FHIR R4 RESTful API Router

Provides FHIR-compliant RESTful endpoints for healthcare interoperability
Supports Patient, ServiceRequest, DiagnosticReport, and Observation resources
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from typing import Optional, List, Dict, Any
from datetime import datetime
import logging

from app.database import get_db
from app.services.fhir.fhir_base_service import FHIRBaseService
from app.services.fhir.fhir_patient_service import FHIRPatientService
from app.services.fhir.fhir_service_request_service import FHIRServiceRequestService
from app.services.fhir.fhir_diagnostic_report_service import FhirDiagnosticReportService
from app.services.fhir.fhir_observation_service import FhirObservationService
from app.services.fhir.imaging_study_service import ImagingStudyService
from app.services.fhir.hl7_to_fhir_converter import Hl7ToFhirConverter
...
@router.post("/ImagingStudy", response_model=dict)
async def submit_imaging_study(
    resource: dict,
    db: Session = Depends(get_db)
):
    """
    Submit a FHIR ImagingStudy resource to SATUSEHAT.
    """
    try:
        result = await ImagingStudyService.submit_to_satusehat(resource)
        if result.get("success"):
            return result
        else:
            raise HTTPException(status_code=422, detail=result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"ImagingStudy submission failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/fhir",
    tags=["fhir"],
    responses={404: {"description": "Resource not found"}}
)


# ============================================================================
# FHIR Capability Statement
# ============================================================================

@router.get("/metadata", summary="Get FHIR Capability Statement")
async def get_capability_statement(request: Request):
    """
    Return FHIR R4 Capability Statement
    Describes the capabilities of this FHIR server
    """
    base_url = str(request.base_url).rstrip('/') + "/api/fhir"

    capability = {
        "resourceType": "CapabilityStatement",
        "status": "active",
        "date": datetime.now().isoformat(),
        "kind": "instance",
        "fhirVersion": "4.0.1",
        "format": ["json"],
        "rest": [{
            "mode": "server",
            "resource": [
                {
                    "type": "Patient",
                    "interaction": [
                        {"code": "read"},
                        {"code": "vread"},
                        {"code": "update"},
                        {"code": "delete"},
                        {"code": "history-instance"},
                        {"code": "search-type"}
                    ],
                    "searchParam": [
                        {"name": "identifier", "type": "token"},
                        {"name": "family", "type": "string"},
                        {"name": "given", "type": "string"},
                        {"name": "birthdate", "type": "date"},
                        {"name": "gender", "type": "token"}
                    ]
                },
                {
                    "type": "ServiceRequest",
                    "interaction": [
                        {"code": "read"},
                        {"code": "vread"},
                        {"code": "update"},
                        {"code": "delete"},
                        {"code": "history-instance"},
                        {"code": "search-type"}
                    ],
                    "searchParam": [
                        {"name": "identifier", "type": "token"},
                        {"name": "status", "type": "token"},
                        {"name": "subject", "type": "reference"},
                        {"name": "code", "type": "token"}
                    ]
                },
                {
                    "type": "DiagnosticReport",
                    "interaction": [
                        {"code": "read"},
                        {"code": "vread"},
                        {"code": "update"},
                        {"code": "delete"},
                        {"code": "history-instance"},
                        {"code": "search-type"}
                    ],
                    "searchParam": [
                        {"name": "identifier", "type": "token"},
                        {"name": "status", "type": "token"},
                        {"name": "subject", "type": "reference"},
                        {"name": "code", "type": "token"}
                    ]
                },
                {
                    "type": "Observation",
                    "interaction": [
                        {"code": "read"},
                        {"code": "vread"},
                        {"code": "search-type"}
                    ],
                    "searchParam": [
                        {"name": "status", "type": "token"},
                        {"name": "subject", "type": "reference"},
                        {"name": "code", "type": "token"}
                    ]
                },
                {
                    "type": "ImagingStudy",
                    "interaction": [
                        {"code": "read"},
                        {"code": "create"},
                        {"code": "search-type"}
                    ],
                    "searchParam": [
                        {"name": "identifier", "type": "token"},
                        {"name": "patient", "type": "reference"},
                        {"name": "accession", "type": "token"}
                    ]
                }
            ]
        }]
    }

    return JSONResponse(content=capability)


# ============================================================================
# Patient Resource Endpoints
# ============================================================================

@router.get("/Patient", summary="Search Patients")
async def search_patients(
    identifier: Optional[str] = Query(None, description="Patient identifier"),
    family: Optional[str] = Query(None, description="Family name"),
    given: Optional[str] = Query(None, description="Given name"),
    birthdate: Optional[str] = Query(None, description="Birth date (YYYY-MM-DD)"),
    gender: Optional[str] = Query(None, description="Gender (male, female, other, unknown)"),
    _count: int = Query(20, ge=1, le=100, description="Number of results"),
    _offset: int = Query(0, ge=0, description="Offset for pagination"),
    db: Session = Depends(get_db)
):
    """Search for Patient resources"""
    try:
        patient_service = FHIRPatientService(db)
        resources, total = patient_service.search_patients(
            family=family,
            given=given,
            birthdate=birthdate,
            gender=gender,
            identifier=identifier,
            limit=_count,
            offset=_offset
        )

        # Build FHIR Bundle
        bundle = {
            "resourceType": "Bundle",
            "type": "searchset",
            "total": total,
            "entry": [
                {
                    "fullUrl": f"/api/fhir/Patient/{r.resource_id}",
                    "resource": r.to_fhir_json()
                }
                for r in resources
            ]
        }

        return JSONResponse(content=bundle)

    except Exception as e:
        logger.error(f"Failed to search patients: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/Patient/{resource_id}", summary="Read Patient")
async def read_patient(
    resource_id: str,
    db: Session = Depends(get_db)
):
    """Read a specific Patient resource"""
    try:
        base_service = FHIRBaseService(db)
        resource = base_service.get_resource("Patient", resource_id)

        if not resource:
            raise HTTPException(status_code=404, detail="Patient not found")

        return JSONResponse(content=resource.to_fhir_json())

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to read patient: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/Patient/{resource_id}/_history", summary="Get Patient History")
async def get_patient_history(
    resource_id: str,
    _count: int = Query(10, ge=1, le=100),
    _offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """Get version history for a Patient resource"""
    try:
        base_service = FHIRBaseService(db)
        resources, total = base_service.get_resource_history(
            "Patient", resource_id, limit=_count, offset=_offset
        )

        bundle = {
            "resourceType": "Bundle",
            "type": "history",
            "total": total,
            "entry": [
                {
                    "fullUrl": f"/api/fhir/Patient/{r.resource_id}/_history/{r.version_id}",
                    "resource": r.to_fhir_json()
                }
                for r in resources
            ]
        }

        return JSONResponse(content=bundle)

    except Exception as e:
        logger.error(f"Failed to get patient history: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ServiceRequest Resource Endpoints
# ============================================================================

@router.get("/ServiceRequest", summary="Search ServiceRequests")
async def search_service_requests(
    identifier: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    subject: Optional[str] = Query(None, description="Patient reference"),
    code: Optional[str] = Query(None),
    _count: int = Query(20, ge=1, le=100),
    _offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """Search for ServiceRequest resources"""
    try:
        sr_service = FHIRServiceRequestService(db)
        resources, total = sr_service.search_service_requests(
            identifier=identifier,
            status=status,
            subject=subject,
            code=code,
            limit=_count,
            offset=_offset
        )

        bundle = {
            "resourceType": "Bundle",
            "type": "searchset",
            "total": total,
            "entry": [
                {
                    "fullUrl": f"/api/fhir/ServiceRequest/{r.resource_id}",
                    "resource": r.to_fhir_json()
                }
                for r in resources
            ]
        }

        return JSONResponse(content=bundle)

    except Exception as e:
        logger.error(f"Failed to search service requests: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/ServiceRequest/{resource_id}", summary="Read ServiceRequest")
async def read_service_request(
    resource_id: str,
    db: Session = Depends(get_db)
):
    """Read a specific ServiceRequest resource"""
    try:
        base_service = FHIRBaseService(db)
        resource = base_service.get_resource("ServiceRequest", resource_id)

        if not resource:
            raise HTTPException(status_code=404, detail="ServiceRequest not found")

        return JSONResponse(content=resource.to_fhir_json())

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to read service request: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# DiagnosticReport Resource Endpoints
# ============================================================================

@router.get("/DiagnosticReport", summary="Search DiagnosticReports")
async def search_diagnostic_reports(
    identifier: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    subject: Optional[str] = Query(None, description="Patient reference"),
    code: Optional[str] = Query(None),
    _count: int = Query(20, ge=1, le=100),
    _offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """Search for DiagnosticReport resources"""
    try:
        dr_service = FHIRDiagnosticReportService(db)
        resources, total = dr_service.search_diagnostic_reports(
            identifier=identifier,
            status=status,
            subject=subject,
            code=code,
            limit=_count,
            offset=_offset
        )

        bundle = {
            "resourceType": "Bundle",
            "type": "searchset",
            "total": total,
            "entry": [
                {
                    "fullUrl": f"/api/fhir/DiagnosticReport/{r.resource_id}",
                    "resource": r.to_fhir_json()
                }
                for r in resources
            ]
        }

        return JSONResponse(content=bundle)

    except Exception as e:
        logger.error(f"Failed to search diagnostic reports: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/DiagnosticReport/{resource_id}", summary="Read DiagnosticReport")
async def read_diagnostic_report(
    resource_id: str,
    db: Session = Depends(get_db)
):
    """Read a specific DiagnosticReport resource"""
    try:
        base_service = FHIRBaseService(db)
        resource = base_service.get_resource("DiagnosticReport", resource_id)

        if not resource:
            raise HTTPException(status_code=404, detail="DiagnosticReport not found")

        return JSONResponse(content=resource.to_fhir_json())

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to read diagnostic report: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Observation Resource Endpoints
# ============================================================================

@router.get("/Observation", summary="Search Observations")
async def search_observations(
    status: Optional[str] = Query(None),
    subject: Optional[str] = Query(None, description="Patient reference"),
    code: Optional[str] = Query(None),
    _count: int = Query(20, ge=1, le=100),
    _offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """Search for Observation resources"""
    try:
        obs_service = FHIRObservationService(db)
        resources, total = obs_service.search_observations(
            status=status,
            subject=subject,
            code=code,
            limit=_count,
            offset=_offset
        )

        bundle = {
            "resourceType": "Bundle",
            "type": "searchset",
            "total": total,
            "entry": [
                {
                    "fullUrl": f"/api/fhir/Observation/{r.resource_id}",
                    "resource": r.to_fhir_json()
                }
                for r in resources
            ]
        }

        return JSONResponse(content=bundle)

    except Exception as e:
        logger.error(f"Failed to search observations: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/Observation/{resource_id}", summary="Read Observation")
async def read_observation(
    resource_id: str,
    db: Session = Depends(get_db)
):
    """Read a specific Observation resource"""
    try:
        base_service = FHIRBaseService(db)
        resource = base_service.get_resource("Observation", resource_id)

        if not resource:
            raise HTTPException(status_code=404, detail="Observation not found")

        return JSONResponse(content=resource.to_fhir_json())

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to read observation: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Utility Endpoints
# ============================================================================

@router.get("/statistics", summary="Get FHIR Resource Statistics")
async def get_fhir_statistics(
    db: Session = Depends(get_db)
):
    """Get statistics about FHIR resources"""
    try:
        base_service = FHIRBaseService(db)
        stats = base_service.get_statistics()

        return JSONResponse(content={
            "status": "success",
            "timestamp": datetime.now().isoformat(),
            "statistics": stats
        })

    except Exception as e:
        logger.error(f"Failed to get statistics: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health", summary="FHIR Service Health Check")
async def fhir_health_check(
    db: Session = Depends(get_db)
):
    """Check FHIR service health"""
    try:
        base_service = FHIRBaseService(db)

        # Try to get config
        version = base_service.get_config('fhir.version', 'R4')

        # Get statistics
        stats = base_service.get_statistics()

        return JSONResponse(content={
            "status": "healthy",
            "service": "FHIR R4",
            "version": version,
            "timestamp": datetime.now().isoformat(),
            "resources": stats.get('resource_type_counts', {})
        })

    except Exception as e:
        logger.error(f"FHIR health check failed: {str(e)}")
        return JSONResponse(
            status_code=503,
            content={
                "status": "unhealthy",
                "service": "FHIR R4",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
        )


# ============================================================================
# Conversion Endpoints (HL7 to FHIR)
# ============================================================================

@router.post("/convert/hl7", summary="Convert HL7 Message to FHIR")
async def convert_hl7_to_fhir(
    request_body: Dict[str, Any],
    db: Session = Depends(get_db)
):
    """
    Convert HL7 v2.x message to FHIR resources

    Request body:
    {
        "message_type": "ADT|ORM|ORU",
        "message_trigger": "A01|O01|R01|etc",
        "parsed_data": {...},
        "hl7_message_id": "uuid",
        "order_id": "uuid"
    }
    """
    try:
        message_type = request_body.get('message_type')
        message_trigger = request_body.get('message_trigger')
        parsed_data = request_body.get('parsed_data')
        hl7_message_id = request_body.get('hl7_message_id')
        order_id = request_body.get('order_id')

        if not message_type or not parsed_data:
            raise HTTPException(
                status_code=400,
                detail="Missing required fields: message_type and parsed_data"
            )

        converter = HL7ToFHIRConverter(db)
        result = converter.convert_hl7_message_to_fhir(
            message_type=message_type,
            message_trigger=message_trigger,
            parsed_data=parsed_data,
            hl7_message_id=hl7_message_id,
            order_id=order_id
        )

        if result.get('success'):
            return JSONResponse(content=result)
        else:
            raise HTTPException(status_code=422, detail=result)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to convert HL7 to FHIR: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
