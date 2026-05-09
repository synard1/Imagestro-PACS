"""
Storage Backend API Endpoints - High Precision Stats
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_, func
from typing import List, Optional
from pydantic import BaseModel
import uuid

from app.database import get_db
from app.models.storage_backend import StorageBackend
from app.models.tenant import Tenant
from app.models.study import Study
from app.middleware.auth import get_current_user
from app.storage.adapter_factory import clear_adapter_cache
from app.services.dicom_storage_service_v2 import SYSTEM_TENANT_ID

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/storage-backends", tags=["storage"])

# (Schema Tetap Sama)
class StorageBackendBase(BaseModel):
    name: str
    type: str
    connection_type: str = 'cloud'
    access_endpoint: Optional[str] = None
    config: dict = {}
    is_active: bool = False
    is_default: bool = False
    tenant_id: Optional[str] = None

class StorageBackendCreate(StorageBackendBase): pass
class StorageBackendUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    connection_type: Optional[str] = None
    access_endpoint: Optional[str] = None
    config: Optional[dict] = None
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None

@router.get("", response_model=List[dict])
async def list_storage_backends(
    tenant_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    query = db.query(StorageBackend)
    if tenant_id: query = query.filter(StorageBackend.tenant_id == tenant_id)
    backends = query.order_by(StorageBackend.is_default.desc(), StorageBackend.name.asc()).all()
    return [b.to_dict() for b in backends]

@router.patch("/{backend_id}", response_model=dict)
async def update_storage_backend(
    backend_id: str,
    data: StorageBackendUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    if current_user.get("role") != "SUPERADMIN": raise HTTPException(status_code=403)
    backend = db.query(StorageBackend).filter(StorageBackend.id == backend_id).first()
    if not backend: raise HTTPException(status_code=404)

    update_data = data.model_dump(exclude_unset=True)

    # Logic: Only 1 Default per scope (System vs Tenant)
    if update_data.get("is_default") is True:
        # Reset other defaults in the same scope
        db.query(StorageBackend).filter(
            and_(StorageBackend.tenant_id == backend.tenant_id, StorageBackend.id != backend.id)
        ).update({"is_default": False})
        # If set as default, it MUST be active
        update_data["is_active"] = True

    for key, value in update_data.items(): setattr(backend, key, value)
    db.commit()
    db.refresh(backend)
    clear_adapter_cache(str(backend.tenant_id) if backend.tenant_id else None)
    return backend.to_dict()

@router.get("/usage-stats")
async def get_storage_usage_stats(db: Session = Depends(get_db)):
    # Calculate stats per tenant
    study_stats = db.query(
        Study.tenant_id,
        func.count(Study.study_instance_uid).label("study_count"),
        func.sum(Study.storage_size).label("total_bytes")
    ).group_by(Study.tenant_id).all()

    result = []
    for s in study_stats:
        bytes_val = int(s.total_bytes or 0)
        # Return high precision float
        gb_val = bytes_val / (1024**3)
        result.append({
            "tenant_id": str(s.tenant_id) if s.tenant_id else SYSTEM_TENANT_ID,
            "study_count": s.study_count,
            "total_bytes": bytes_val,
            "total_gb": gb_val, # Raw float for frontend to format
            "estimated_cost_usd": round(gb_val * 0.015, 4)
        })
    return result

# (Rest of methods: create, delete, details, test-connection remain)
@router.post("", response_model=dict)
async def create_storage_backend(data: StorageBackendCreate, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "SUPERADMIN": raise HTTPException(status_code=403)
    if data.is_default:
        db.query(StorageBackend).filter(and_(StorageBackend.tenant_id == data.tenant_id, StorageBackend.is_default == True)).update({"is_default": False})
    new_backend = StorageBackend(**data.model_dump())
    db.add(new_backend)
    db.commit()
    db.refresh(new_backend)
    return new_backend.to_dict()

@router.delete("/{backend_id}")
async def delete_storage_backend(backend_id: str, db: Session = Depends(get_db), current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "SUPERADMIN": raise HTTPException(status_code=403)
    backend = db.query(StorageBackend).filter(StorageBackend.id == backend_id).first()
    if backend.is_default: raise HTTPException(status_code=400, detail="Cannot delete default")
    db.delete(backend)
    db.commit()
    return {"status": "success"}

@router.get("/{backend_id}/details")
async def get_storage_backend_details(backend_id: str, db: Session = Depends(get_db)):
    backend = db.query(StorageBackend).filter(StorageBackend.id == backend_id).first()
    return backend.to_dict()

@router.post("/test-connection")
async def test_storage_connection(data: dict):
    try:
        adapter_type = data.get('type')
        config = data.get('config', {})

        if not adapter_type:
            raise HTTPException(status_code=400, detail="Missing storage adapter type")

        # Instantiate the adapter
        from app.storage.adapter_factory import StorageAdapterFactory
        adapter = StorageAdapterFactory.create_adapter(adapter_type, config)

        # Execute real I/O check
        stats = await adapter.get_stats()

        if 'error' in stats:
            return {
                "status": "error",
                "message": f"Connection verified but access denied: {stats['error']}",
                "details": stats
            }

        return {
            "status": "success",
            "message": f"Successfully connected to {stats.get('provider', adapter_type)}",
            "stats": stats
        }

    except Exception as e:
        logger.error(f"Storage connection test failed: {str(e)}")
        return {
            "status": "error",
            "message": f"Connection failed: {str(e)}"
        }
