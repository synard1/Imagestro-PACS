"""
DICOM Retrieve API (C-MOVE)
REST API for retrieving images from remote PACS
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.dicom_node import DicomNode
from app.services.dicom_move import get_move_service

router = APIRouter(prefix="/api/dicom/retrieve", tags=["DICOM Retrieve"])


# Request/Response Models
class StudyRetrieveRequest(BaseModel):
    """Study retrieve request"""
    remote_node_id: Optional[str] = Field(None, description="Remote node ID")
    remote_ae: Optional[str] = Field(None, description="Remote AE title")
    remote_host: Optional[str] = None
    remote_port: Optional[int] = None
    study_uid: str = Field(..., description="Study Instance UID")
    destination_ae: str = Field("PACS_SCP", description="Destination AE title")
    timeout: int = Field(300, ge=30, le=3600)


class SeriesRetrieveRequest(BaseModel):
    """Series retrieve request"""
    remote_node_id: Optional[str] = None
    remote_ae: Optional[str] = None
    remote_host: Optional[str] = None
    remote_port: Optional[int] = None
    study_uid: str = Field(..., description="Study Instance UID")
    series_uid: str = Field(..., description="Series Instance UID")
    destination_ae: str = Field("PACS_SCP", description="Destination AE title")
    timeout: int = Field(300, ge=30, le=3600)


class RetrieveResponse(BaseModel):
    """Retrieve response"""
    success: bool
    completed: int
    failed: int
    warning: int
    total: int
    error: Optional[str] = None


# API Endpoints
@router.post("/study", response_model=RetrieveResponse)
def retrieve_study(
    request: StudyRetrieveRequest,
    db: Session = Depends(get_db)
):
    """
    Retrieve study from remote PACS using C-MOVE
    
    Images will be sent to the specified destination AE (default: PACS_SCP)
    """
    
    # Get remote node info
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
    
    # Retrieve study
    move_service = get_move_service()
    
    try:
        result = move_service.move_study(
            remote_ae=remote_ae,
            remote_host=remote_host,
            remote_port=remote_port,
            study_uid=request.study_uid,
            destination_ae=request.destination_ae,
            timeout=request.timeout
        )
        
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Retrieve failed: {str(e)}")


@router.post("/series", response_model=RetrieveResponse)
def retrieve_series(
    request: SeriesRetrieveRequest,
    db: Session = Depends(get_db)
):
    """
    Retrieve series from remote PACS using C-MOVE
    """
    
    # Get remote node info
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
    
    # Retrieve series
    move_service = get_move_service()
    
    try:
        result = move_service.move_series(
            remote_ae=remote_ae,
            remote_host=remote_host,
            remote_port=remote_port,
            study_uid=request.study_uid,
            series_uid=request.series_uid,
            destination_ae=request.destination_ae,
            timeout=request.timeout
        )
        
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Retrieve failed: {str(e)}")


@router.get("/test")
def test_retrieve_endpoint():
    """Test endpoint to verify retrieve API is working"""
    return {
        "status": "ok",
        "message": "DICOM Retrieve API is ready",
        "endpoints": {
            "retrieve_study": "POST /api/dicom/retrieve/study",
            "retrieve_series": "POST /api/dicom/retrieve/series"
        }
    }
