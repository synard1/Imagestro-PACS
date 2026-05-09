"""
Storage API Endpoints
API for DICOM file storage and retrieval
"""

import os
import logging
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.storage_location import StorageLocation
from app.models.dicom_file import DicomFile
from app.models.study import Study
from app.models.storage_backend import StorageBackend
from app.services.dicom_storage_service_v2 import get_dicom_storage_service_v2 as get_storage_service_v2
from app.middleware.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/storage", tags=["storage"])

def _resolve_tenant(request: Request, current_user: dict) -> Optional[str]:
    """Helper to resolve tenant_id from user context, header, or token fallback"""
    # 1. Try from X-Tenant-ID header (Highest priority for manual overrides)
    header_tenant = request.headers.get("X-Tenant-ID")
    if header_tenant:
        return str(header_tenant)

    # 2. Try from current_user (FastAPI Dependency)
    t_id = current_user.get("tenant_id")
    if t_id:
        return str(t_id)

    # 3. Try from request state (Middleware)
    if hasattr(request, "state") and hasattr(request.state, "user"):
        t_id = request.state.user.get("tenant_id")
        if t_id:
            return str(t_id)

    logger.debug(f"Tenant ID not found in user context for {current_user.get('username')}")
    return None

@router.post("/upload")
async def upload_dicom(
    request: Request,
    file: UploadFile = File(...),
    tier: str = Query('hot', pattern='^(hot|warm|cold)$'),
    tenant_id: Optional[str] = Query(None), # Allow manual override for Superadmin
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Upload DICOM file
    """
    temp_path = None
    try:
        # 1. Determine target tenant
        target_tenant_id = _resolve_tenant(request, current_user)
        
        # Superadmin can override tenant for testing/migration
        if current_user.get("role") == "SUPERADMIN" and tenant_id:
            target_tenant_id = tenant_id
            logger.info(f"Superadmin overriding target tenant: {target_tenant_id}")

        logger.info(f"Upload request from user={current_user.get('username')}, target_tenant={target_tenant_id}")

        if not file.filename.lower().endswith(('.dcm', '.dicom')):
            raise HTTPException(status_code=400, detail="Invalid file type")
        
        temp_path = f"/tmp/{file.filename}"
        with open(temp_path, "wb") as f:
            content = await file.read()
            f.write(content)
        
        # 2. Store with resolved tenant context
        service = get_storage_service_v2(db, tenant_id=target_tenant_id)
        dicom_file = await service.store_dicom(temp_path, tier)
        
        if not dicom_file:
            raise HTTPException(status_code=500, detail="Failed to store DICOM file")

        return dicom_file.to_dict()
        
    except Exception as e:
        logger.error(f"Upload failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if temp_path and os.path.exists(temp_path):
            try: os.remove(temp_path)
            except: pass


@router.get("/files/{sop_instance_uid}")
async def get_dicom_file(
    request: Request,
    sop_instance_uid: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Get DICOM file metadata
    """
    # 1. Fetch file with system context to find its origin
    service = get_storage_service_v2(db)
    dicom_file = await service.get_dicom(sop_instance_uid)
    
    if not dicom_file:
        raise HTTPException(status_code=404, detail="DICOM file not found")
    
    return dicom_file.to_dict()


@router.get("/files/{sop_instance_uid}/download")
async def download_dicom_file(
    request: Request,
    sop_instance_uid: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Download DICOM file
    """
    # 1. Find the file
    dicom_file = db.query(DicomFile).filter(DicomFile.sop_instance_uid == sop_instance_uid).first()
    if not dicom_file:
        raise HTTPException(status_code=404, detail="DICOM file not found")

    # 2. Resolve tenant_id
    tenant_id = _resolve_tenant(request, current_user)
    
    # Superadmin logic: Resolve from StorageBackend or Study
    if not tenant_id:
        meta = dicom_file.dicom_metadata or {}
        backend_id = meta.get('storage_backend_id')
        
        if backend_id:
            backend = db.query(StorageBackend).filter(StorageBackend.id == backend_id).first()
            if backend:
                tenant_id = str(backend.tenant_id) if backend.tenant_id else None
                logger.info(f"Superadmin resolved tenant_id {tenant_id} from StorageBackend {backend_id}")

        if not tenant_id:
            study = db.query(Study).filter(Study.study_instance_uid == dicom_file.study_id).first()
            if study:
                tenant_id = str(study.tenant_id)
                logger.info(f"Superadmin resolved tenant_id {tenant_id} from Study for file {sop_instance_uid}")

    # 3. Initialize service with resolved tenant context
    service = get_storage_service_v2(db, tenant_id=tenant_id)
    temp_path = await service.retrieve_dicom(dicom_file)
    
    if not temp_path:
        raise HTTPException(status_code=500, detail="Failed to retrieve file from storage")

    return FileResponse(
        temp_path, 
        media_type="application/dicom",
        filename=f"{sop_instance_uid}.dcm"
    )


@router.get("/search")
async def search_dicom_files(
    request: Request,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Search DICOM files
    """
    tenant_id = _resolve_tenant(request, current_user)
    service = get_storage_service_v2(db, tenant_id=tenant_id)
    files = await service.search_dicom(limit=limit, offset=offset)
    
    return {
        "total": len(files),
        "files": [f.to_dict() for f in files]
    }


@router.delete("/files/{sop_instance_uid}")
async def delete_dicom_file(
    request: Request,
    sop_instance_uid: str,
    hard_delete: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Delete DICOM file
    """
    # Resolve tenant similarly to download
    dicom_file = db.query(DicomFile).filter(DicomFile.sop_instance_uid == sop_instance_uid).first()
    if not dicom_file:
        raise HTTPException(status_code=404, detail="DICOM file not found")
        
    tenant_id = _resolve_tenant(request, current_user)
    if not tenant_id:
        meta = dicom_file.dicom_metadata or {}
        backend_id = meta.get('storage_backend_id')
        if backend_id:
            backend = db.query(StorageBackend).filter(StorageBackend.id == backend_id).first()
            if backend: tenant_id = str(backend.tenant_id) if backend.tenant_id else None

    service = get_storage_service_v2(db, tenant_id=tenant_id)
    success = await service.delete_dicom(sop_instance_uid, hard_delete)
    
    if not success:
        raise HTTPException(status_code=404, detail="DICOM file not found")
    
    return {"status": "success", "sop_instance_uid": sop_instance_uid}


@router.get("/stats")
async def get_storage_stats(db: Session = Depends(get_db)):
    service = get_storage_service_v2(db)
    return await service.get_storage_stats()


@router.get("/health")
async def storage_health(db: Session = Depends(get_db)):
    return {"status": "healthy", "service": "DICOM Storage V2"}
