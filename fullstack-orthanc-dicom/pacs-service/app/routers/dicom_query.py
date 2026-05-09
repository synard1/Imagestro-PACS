"""
DICOM Query API (C-FIND)
REST API for querying remote PACS OR local database
"""

import logging
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional, List
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.dicom_node import DicomNode
from app.services.dicom_find import get_find_service
from app.services.local_find_service import LocalFindService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/dicom/query", tags=["DICOM Query"])


# Request/Response Models
class StudyQueryRequest(BaseModel):
    """Study query request"""
    remote_node_id: Optional[str] = Field(None, description="Remote node ID (UUID). If None, queries LOCAL database.")
    remote_ae: Optional[str] = Field(None, description="Remote AE title")
    remote_host: Optional[str] = Field(None, description="Remote host")
    remote_port: Optional[int] = Field(None, description="Remote port")
    patient_id: Optional[str] = None
    patient_name: Optional[str] = None
    study_date: Optional[str] = Field(None, description="YYYYMMDD or YYYYMMDD-YYYYMMDD")
    modality: Optional[str] = None
    study_description: Optional[str] = None
    accession_number: Optional[str] = None
    timeout: int = Field(30, ge=5, le=300)


class StudyQueryResponse(BaseModel):
    """Study query response"""
    study_instance_uid: str
    study_date: str
    study_time: str
    study_description: str
    accession_number: str
    patient_id: str
    patient_name: str
    patient_birth_date: str
    patient_gender: str
    modality: str
    number_of_series: int
    number_of_instances: int


class SeriesQueryRequest(BaseModel):
    """Series query request"""
    remote_node_id: Optional[str] = None
    remote_ae: Optional[str] = None
    remote_host: Optional[str] = None
    remote_port: Optional[int] = None
    study_uid: str = Field(..., description="Study Instance UID")
    modality: Optional[str] = None
    timeout: int = Field(30, ge=5, le=300)


class SeriesQueryResponse(BaseModel):
    """Series query response"""
    series_instance_uid: str
    series_number: str
    series_description: str
    modality: str
    series_date: str
    series_time: str
    number_of_instances: int


# API Endpoints
@router.post("/studies", response_model=List[StudyQueryResponse])
def query_studies(
    request: StudyQueryRequest,
    db: Session = Depends(get_db)
):
    """
    Query studies from remote PACS using C-FIND OR from Local DB
    
    If `remote_node_id` and `remote_ae` are NOT provided, queries the LOCAL database.
    """
    
    # Check if this is a local query
    is_local = not request.remote_node_id and not (request.remote_ae and request.remote_host)
    
    if is_local:
        logger.info("Querying LOCAL database")
        try:
            local_service = LocalFindService(db)
            results = local_service.query_studies(
                patient_id=request.patient_id,
                patient_name=request.patient_name,
                study_date=request.study_date,
                modality=request.modality,
                study_description=request.study_description,
                accession_number=request.accession_number
            )
            logger.info(f"Found {len(results)} studies in local database")
            return results
        except Exception as e:
            logger.error(f"Local query failed: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Local query failed: {str(e)}")

    # Remote Query Logic
    if request.remote_node_id:
        # Get from database
        node = db.query(DicomNode).filter(DicomNode.id == request.remote_node_id).first()
        if not node:
            raise HTTPException(status_code=404, detail="Remote node not found")
        
        remote_ae = node.ae_title
        remote_host = node.host
        remote_port = node.port
    elif request.remote_ae and request.remote_host and request.remote_port:
        # Use provided values
        remote_ae = request.remote_ae
        remote_host = request.remote_host
        remote_port = request.remote_port
    else:
        raise HTTPException(
            status_code=400,
            detail="Must provide either remote_node_id or (remote_ae + remote_host + remote_port)"
        )
    
    # Query studies from remote PACS
    find_service = get_find_service()
    
    try:
        results = find_service.query_studies(
            remote_ae=remote_ae,
            remote_host=remote_host,
            remote_port=remote_port,
            patient_id=request.patient_id,
            patient_name=request.patient_name,
            study_date=request.study_date,
            modality=request.modality,
            study_description=request.study_description,
            timeout=request.timeout
        )
        
        return results
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")


@router.post("/series", response_model=List[SeriesQueryResponse])
def query_series(
    request: SeriesQueryRequest,
    db: Session = Depends(get_db)
):
    """
    Query series for a study using C-FIND OR from Local DB
    """
    
    # Check if this is a local query
    is_local = not request.remote_node_id and not (request.remote_ae and request.remote_host)
    
    if is_local:
        logger.info(f"Querying LOCAL database for series: {request.study_uid}")
        try:
            local_service = LocalFindService(db)
            results = local_service.query_series(
                study_uid=request.study_uid,
                modality=request.modality
            )
            logger.info(f"Found {len(results)} series in local database")
            return results
        except Exception as e:
            logger.error(f"Local series query failed: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Local query failed: {str(e)}")
    
    # Remote Query Logic
    if request.remote_node_id:
        node = db.query(DicomNode).filter(DicomNode.id == request.remote_node_id).first()
        if not node:
            raise HTTPException(status_code=404, detail="Remote node not found")
        
        remote_ae = node.ae_title
        remote_host = node.host
        remote_port = node.port
    elif request.remote_ae and request.remote_host and request.remote_port:
        remote_ae = request.remote_ae
        remote_host = request.remote_host
        remote_port = request.remote_port
    else:
        raise HTTPException(
            status_code=400,
            detail="Must provide either remote_node_id or (remote_ae + remote_host + remote_port)"
        )
    
    # Query series from remote PACS
    find_service = get_find_service()
    
    try:
        results = find_service.query_series(
            remote_ae=remote_ae,
            remote_host=remote_host,
            remote_port=remote_port,
            study_uid=request.study_uid,
            modality=request.modality,
            timeout=request.timeout
        )
        
        return results
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")


@router.get("/test")
def test_query_endpoint():
    """Test endpoint to verify query API is working"""
    return {
        "status": "ok",
        "message": "DICOM Query API is ready (supports LOCAL and REMOTE queries)",
        "endpoints": {
            "query_studies": "POST /api/dicom/query/studies",
            "query_series": "POST /api/dicom/query/series"
        },
        "note": "Leave remote_node_id empty to query LOCAL database"
    }
