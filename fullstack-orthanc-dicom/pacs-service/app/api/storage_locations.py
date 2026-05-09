"""
Storage Locations API
Get storage locations for studies
"""

import logging
from typing import Optional, List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.middleware.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/storage-locations", tags=["storage-locations"])


class StudyStorageLocationResponse(BaseModel):
    """Response for study storage location"""
    study_instance_uid: str
    tenant_id: UUID
    storage_backend_id: Optional[UUID]
    storage_backend_name: Optional[str]
    storage_type: Optional[str]
    is_current: bool
    is_legacy: bool
    study_date: Optional[str]
    patient_name: Optional[str]


@router.get("", response_model=List[StudyStorageLocationResponse])
async def get_study_storage_locations(
    tenant_id: UUID,
    patient_id: Optional[str] = None,
    study_uid: Optional[str] = None,
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Get storage locations for studies.
    
    This endpoint shows which storage contains each study,
    useful for determining if data is in legacy storage.
    """
    if current_user.get("role") != "SUPERADMIN":
        if current_user.get("tenant_id") != tenant_id:
            raise HTTPException(status_code=403, detail="Forbidden")
    
    from app.models.study import Study
    from app.models.storage_backend import StorageBackend
    
    # Build query
    query = db.query(
        Study.study_instance_uid,
        Study.tenant_id,
        Study.storage_id,
        Study.study_date,
        Study.patient_name,
        StorageBackend.name.label("storage_backend_name"),
        StorageBackend.type.label("storage_type")
    ).outerjoin(
        StorageBackend,
        Study.storage_id == StorageBackend.id
    ).filter(
        Study.tenant_id == tenant_id
    )
    
    if patient_id:
        query = query.filter(Study.patient_id == patient_id)
    if study_uid:
        query = query.filter(Study.study_instance_uid == study_uid)
    
    results = query.limit(limit).all()
    
    return [
        StudyStorageLocationResponse(
            study_instance_uid=r.study_instance_uid,
            tenant_id=r.tenant_id,
            storage_backend_id=r.storage_id,
            storage_backend_name=r.storage_backend_name,
            storage_type=r.storage_type,
            is_current=r.storage_id is not None,
            is_legacy=r.storage_id is None,
            study_date=str(r.study_date) if r.study_date else None,
            patient_name=r.patient_name
        )
        for r in results
    ]
