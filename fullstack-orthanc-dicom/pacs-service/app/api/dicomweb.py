"""
DICOMweb STOW-RS (Store Over the Web by RESTful Services) API
Implements DICOM Part 18 - Web Services for DICOM file upload
"""

import logging
import tempfile
import os
import re
from typing import List, Optional
from fastapi import APIRouter, File, UploadFile, Depends, HTTPException, Request, Query, Header
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session
import pydicom
from pydicom.dataset import Dataset
from datetime import datetime
from app.database import get_db
from app.services.dicom_storage import DicomStorageService
from app.services.dicom_query import DicomQueryService
from fastapi.responses import JSONResponse

class DICOMJSONResponse(JSONResponse):
    """DICOMweb JSON Response with specific formatting"""
    media_type = "application/dicom+json"

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/dicomweb", tags=["dicomweb"])


def parse_qido_parameters(parameters: dict) -> Dataset:
    """Parse QIDO-RS query parameters into DICOM dataset"""
    ds = Dataset()
    for key, value in parameters.items():
        # Convert QIDO-RS parameters to DICOM tags
        if key.lower() == 'patientname':
            ds.PatientName = value
        elif key.lower() == 'studyinstanceuid':
            ds.StudyInstanceUID = value
        elif key.lower() == 'seriesinstanceuid':
            ds.SeriesInstanceUID = value
        elif key.lower() == 'sopinstanceuid':
            ds.SOPInstanceUID = value
        # ... tambahkan parameter lainnya
    return ds


# Enhanced QIDO-RS Implementation
def validate_qido_parameters(params: dict):
    """Validate QIDO-RS query parameters"""
    if 'study_date' in params and params['study_date']:
        try:
            parse_date_range(params['study_date'])
        except ValueError:
            raise ValueError("Invalid StudyDate format, use YYYYMMDD or YYYYMMDD-YYYYMMDD")

@router.get("/studies", response_class=DICOMJSONResponse)
async def qido_studies(
    patient_name: Optional[str] = Query(None, alias="PatientName"),
    patient_id: Optional[str] = Query(None, alias="PatientID"),
    study_date: Optional[str] = Query(None, alias="StudyDate"),
    modalities_in_study: Optional[str] = Query(None, alias="ModalitiesInStudy"),
    accession_number: Optional[str] = Query(None, alias="AccessionNumber"),
    limit: int = Query(100, gt=0, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """QIDO-RS Study Level Search"""
    try:
        # Validate parameters
        validate_qido_parameters(locals())
        
        # Build query
        query_params = {
            "patient_name": patient_name,
            "patient_id": patient_id,
            "study_date": parse_date_range(study_date),
            "modalities": modalities_in_study.split(',') if modalities_in_study else None,
            "accession_number": accession_number,
            "limit": limit,
            "offset": offset
        }
        
        # Execute query
        studies = await DicomQueryService(db).search_studies(**query_params)
        
        return format_qido_response(studies, offset, limit)
        
    except ValueError as e:
        raise HTTPException(400, detail=str(e))
    except Exception as e:
        logger.error(f"QIDO-RS Study Search Error: {str(e)}")
        raise HTTPException(500, detail="Study search failed")

@router.get("/studies/{study_uid}/series", response_class=DICOMJSONResponse)
async def qido_series(
    study_uid: str,
    modality: Optional[str] = Query(None, alias="Modality"),
    series_date: Optional[str] = Query(None, alias="SeriesDate"),
    limit: int = Query(100, gt=0, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """QIDO-RS Series Level Search"""
    try:
        validate_qido_parameters(locals())
        
        series_list = await DicomQueryService(db).search_series(
            study_uid=study_uid,
            modality=modality,
            series_date=parse_date_range(series_date),
            limit=limit,
            offset=offset
        )
        
        return format_qido_series_response(series_list, offset, limit)
        
    except ValueError as e:
        raise HTTPException(400, detail=str(e))
    except Exception as e:
        logger.error(f"QIDO-RS Series Search Error: {str(e)}")
        raise HTTPException(500, detail="Series search failed")

# WADO-RS Implementation with Progressive Loading
@router.get("/studies/{study_uid}/series/{series_uid}/instances/{instance_uid}")
async def wado_retrieve_instance(
    study_uid: str,
    series_uid: str,
    instance_uid: str,
    range_header: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """WADO-RS Instance Retrieval with progressive loading"""
    try:
        storage_service = DicomStorageService(db)
        file_path = await storage_service.get_dicom_path(
            study_uid=study_uid,
            series_uid=series_uid,
            instance_uid=instance_uid
        )
        
        return streaming_response(file_path, range_header, instance_uid)
        
    except Exception as e:
        logger.error(f"WADO-RS Error: {str(e)}")
        raise HTTPException(500, detail="Instance retrieval failed")

# Enhanced STOW-RS Metadata Validation
def enhanced_stow_validation(ds: Dataset):
    """Comprehensive DICOM metadata validation"""
    required_tags = {
        'PatientName': ('PN', 1),
        'PatientID': ('LO', 1),
        'StudyInstanceUID': ('UI', 1),
        'SeriesInstanceUID': ('UI', 1),
        'SOPInstanceUID': ('UI', 1),
        'Modality': ('CS', 1)
    }
    
    for tag, (vr, min_count) in required_tags.items():
        if tag not in ds:
            raise ValueError(f"Missing required tag: {tag}")
        if ds[tag].VR != vr:
            raise ValueError(f"Invalid VR {ds[tag].VR} for {tag}, expected {vr}")
        if len(ds[tag].value) < min_count:
            raise ValueError(f"Tag {tag} requires at least {min_count} value(s)")
            
    if not all(pydicom.uid.is_valid_uid(ds[uid].value) for uid in 
              ['StudyInstanceUID', 'SeriesInstanceUID', 'SOPInstanceUID']):
        raise ValueError("Invalid UID format")

@router.post("/studies")
async def stow_rs_store_instances(
    request: Request,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db)
):
    """
    STOW-RS: Store Instances (DICOM Part 18)
    
    Upload DICOM instances to the PACS.
    Supports multipart/related content type as per DICOM standard.
    
    Args:
        request: FastAPI request object
        files: List of DICOM files to upload
        db: Database session
        
    Returns:
        DICOM JSON response with operation results
    """
    logger.info(f"STOW-RS: Received request to store {len(files)} instance(s)")
    
    stored_instances = []
    failed_instances = []
    warnings = []
    
    storage_service = DicomStorageService(db)
    
    for file in files:
        temp_path = None
        try:
            # Validate file type
            if not file.filename:
                failed_instances.append({
                    "filename": "unknown",
                    "error": "No filename provided"
                })
                continue
                
            # Check file extension
            if not file.filename.lower().endswith(('.dcm', '.dicom', '.dic')):
                warnings.append({
                    "filename": file.filename,
                    "warning": "File extension is not .dcm, .dicom, or .dic - proceeding anyway"
                })
            
            # Save to temporary file
            with tempfile.NamedTemporaryFile(delete=False, suffix='.dcm') as temp_file:
                temp_path = temp_file.name
                content = await file.read()
                temp_file.write(content)
            
            # Validate DICOM file
            try:
                ds = pydicom.dcmread(temp_path, force=True)
                
                # Check required DICOM tags
                required_tags = ['SOPInstanceUID', 'StudyInstanceUID', 'SeriesInstanceUID']
                missing_tags = [tag for tag in required_tags if not hasattr(ds, tag)]
                
                if missing_tags:
                    failed_instances.append({
                        "filename": file.filename,
                        "error": f"Missing required DICOM tags: {', '.join(missing_tags)}"
                    })
                    continue
                    
            except Exception as e:
                failed_instances.append({
                    "filename": file.filename,
                    "error": f"Invalid DICOM file: {str(e)}"
                })
                continue
            
            # Store DICOM file
            try:
                dicom_file = await storage_service.store_dicom(
                    file_path=temp_path,
                    tier='hot'
                )
                
                stored_instances.append({
                    "filename": file.filename,
                    "sop_instance_uid": dicom_file.sop_instance_uid,
                    "study_instance_uid": dicom_file.study_id,
                    "series_instance_uid": dicom_file.series_id,
                    "patient_id": dicom_file.patient_id,
                    "patient_name": dicom_file.patient_name,
                    "modality": dicom_file.modality,
                    "file_size": dicom_file.file_size,
                    "status": "stored"
                })
                
                logger.info(f"✓ Stored: {file.filename} (SOP: {dicom_file.sop_instance_uid})")
                
            except Exception as e:
                logger.error(f"✗ Storage failed for {file.filename}: {str(e)}")
                failed_instances.append({
                    "filename": file.filename,
                    "error": f"Storage failed: {str(e)}"
                })
                
        except Exception as e:
            logger.error(f"✗ Unexpected error processing {file.filename}: {str(e)}")
            failed_instances.append({
                "filename": file.filename,
                "error": f"Processing error: {str(e)}"
            })
            
        finally:
            # Clean up temporary file
            if temp_path and os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except Exception as e:
                    logger.warning(f"Failed to remove temp file {temp_path}: {str(e)}")
    
    # Prepare response according to DICOM Part 18
    total_count = len(files)
    success_count = len(stored_instances)
    failure_count = len(failed_instances)
    
    # Determine HTTP status code
    if success_count == total_count:
        status_code = 200  # All instances stored successfully
    elif success_count > 0:
        status_code = 202  # Some instances stored, some failed
    else:
        status_code = 409  # All instances failed
    
    response_data = {
        "status": "success" if success_count == total_count else "partial" if success_count > 0 else "failed",
        "total_instances": total_count,
        "stored_instances": success_count,
        "failed_instances": failure_count,
        "stored": stored_instances,
        "failed": failed_instances,
        "warnings": warnings
    }
    
    logger.info(f"STOW-RS Summary: {success_count}/{total_count} stored, {failure_count} failed")
    
    return JSONResponse(
        content=response_data,
        status_code=status_code
    )


@router.get("/studies/{study_instance_uid}/metadata")
async def retrieve_study_metadata(
    study_instance_uid: str,
    db: Session = Depends(get_db)
):
    """
    Retrieve metadata for all instances in a study (QIDO-RS compatible)
    
    Args:
        study_instance_uid: Study Instance UID
        db: Database session
        
    Returns:
        List of instance metadata
    """
    storage_service = DicomStorageService(db)
    
    try:
        instances = await storage_service.search_dicom(
            study_id=study_instance_uid,
            limit=10000
        )
        
        if not instances:
            raise HTTPException(
                status_code=404,
                detail=f"No instances found for study {study_instance_uid}"
            )
        
        metadata_list = []
        for instance in instances:
            metadata_list.append({
                "SOPInstanceUID": instance.sop_instance_uid,
                "StudyInstanceUID": instance.study_id,
                "SeriesInstanceUID": instance.series_id,
                "PatientID": instance.patient_id,
                "PatientName": instance.patient_name,
                "Modality": instance.modality,
                "InstanceNumber": instance.instance_number,
                "SOPClassUID": instance.sop_class_uid
            })
        
        return metadata_list
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to retrieve metadata for study {study_instance_uid}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve metadata: {str(e)}"
        )


@router.get("/studies/{study_instance_uid}/series/{series_instance_uid}/metadata")
async def retrieve_series_metadata(
    study_instance_uid: str,
    series_instance_uid: str,
    db: Session = Depends(get_db)
):
    """
    Retrieve metadata for all instances in a series (QIDO-RS compatible)
    
    Args:
        study_instance_uid: Study Instance UID
        series_instance_uid: Series Instance UID
        db: Database session
        
    Returns:
        List of instance metadata
    """
    storage_service = DicomStorageService(db)
    
    try:
        instances = await storage_service.search_dicom(
            study_id=study_instance_uid,
            series_id=series_instance_uid,
            limit=10000
        )
        
        if not instances:
            raise HTTPException(
                status_code=404,
                detail=f"No instances found for series {series_instance_uid}"
            )
        
        metadata_list = []
        for instance in instances:
            metadata_list.append({
                "SOPInstanceUID": instance.sop_instance_uid,
                "StudyInstanceUID": instance.study_id,
                "SeriesInstanceUID": instance.series_id,
                "PatientID": instance.patient_id,
                "PatientName": instance.patient_name,
                "Modality": instance.modality,
                "InstanceNumber": instance.instance_number,
                "SOPClassUID": instance.sop_class_uid
            })
        
        return metadata_list
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to retrieve metadata for series {series_instance_uid}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve metadata: {str(e)}"
        )

def streaming_response(file_path: str, range_header: Optional[str], filename: str):
    """Create streaming response with range support"""
    file_size = os.path.getsize(file_path)
    start, end = 0, file_size - 1
    
    if range_header:
        match = re.search(r"bytes=(\d+)-(\d*)", range_header)
        if not match:
            raise HTTPException(416, detail="Invalid range header")
        start = int(match.group(1))
        end = int(match.group(2)) if match.group(2) else file_size - 1
    
    headers = {
        "Content-Type": "application/dicom",
        "Content-Disposition": f'attachment; filename="{filename}.dcm"',
        "Accept-Ranges": "bytes"
    }
    
    if range_header:
        headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"
        status_code = 206
    else:
        status_code = 200
    
    def file_stream():
        with open(file_path, "rb") as f:
            f.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                chunk_size = min(8192, remaining)
                data = f.read(chunk_size)
                if not data:
                    break
                remaining -= len(data)
                yield data
    
    return StreamingResponse(
        file_stream(),
        headers=headers,
        status_code=status_code
    )

def parse_date_range(date_str: Optional[str]) -> Optional[tuple]:
    """Parse DICOM date range format (YYYYMMDD-YYYYMMDD)"""
    if not date_str:
        return None
    if '-' in date_str:
        start_str, end_str = date_str.split('-')
        return (
            datetime.strptime(start_str, "%Y%m%d"),
            datetime.strptime(end_str, "%Y%m%d")
        )
    return (datetime.strptime(date_str, "%Y%m%d"),)

def format_qido_response(studies, offset, limit):
    """Format QIDO-RS study search response"""
    return {
        "Studies": [{
            "0020000D": {"vr": "UI", "Value": [s.study_uid]},
            "00100010": {"vr": "PN", "Value": [s.patient_name]},
            "00100020": {"vr": "LO", "Value": [s.patient_id]},
            "00080020": {"vr": "DA", "Value": [s.study_date.strftime('%Y%m%d')]},
            "00080030": {"vr": "TM", "Value": [s.study_time.strftime('%H%M%S')]},
            "00080061": {"vr": "CS", "Value": s.modalities.split(',')},
        } for s in studies],
        "Count": len(studies),
        "Offset": offset,
        "Limit": limit
    }

def format_qido_series_response(series_list, offset, limit):
    """Format QIDO-RS series search response"""
    return {
        "Series": [{
            "0020000E": {"vr": "UI", "Value": [s.series_uid]},
            "00080060": {"vr": "CS", "Value": [s.modality]},
            "0008103E": {"vr": "LO", "Value": [s.series_description]},
            "00200011": {"vr": "IS", "Value": [s.series_number]},
        } for s in series_list],
        "Count": len(series_list),
        "Offset": offset,
        "Limit": limit
    }