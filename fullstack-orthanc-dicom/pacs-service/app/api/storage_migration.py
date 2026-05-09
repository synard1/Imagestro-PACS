"""
Storage Migration API
Handles storage data migration between backends
"""

import logging
from typing import Optional, List
from datetime import datetime
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
import uuid

from app.database import get_db
from app.middleware.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/storage-migrations", tags=["storage-migration"])


# ============== SCHEMAS ==============

class StorageMigrationCreate(BaseModel):
    """Request to create a storage migration"""
    tenant_id: UUID
    from_storage_id: UUID
    to_storage_id: UUID
    scope: str = "tenant"  # 'tenant', 'patient', 'study', 'date_range'
    scope_filter: Optional[dict] = None


class StorageMigrationResponse(BaseModel):
    """Storage migration response"""
    id: UUID
    tenant_id: UUID
    from_storage_id: UUID
    to_storage_id: UUID
    scope: str
    scope_filter: Optional[dict] = None
    status: str
    items_total: int
    items_completed: int
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime


# ============== ENDPOINTS ==============

@router.post("", response_model=StorageMigrationResponse)
async def create_storage_migration(
    data: StorageMigrationCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Create a new storage migration job.
    
    Scope options:
    - tenant: Migrate all data for a tenant
    - patient: Migrate data for a specific patient
    - study: Migrate a specific study
    - date_range: Migrate data within date range
    """
    if current_user.get("role") != "SUPERADMIN":
        raise HTTPException(status_code=403, detail="Only superadmin can manage migrations")
    
    # Verify source and target storage exist
    from app.models.storage_backend import StorageBackend
    
    from_backend = db.query(StorageBackend).filter(StorageBackend.id == data.from_storage_id).first()
    to_backend = db.query(StorageBackend).filter(StorageBackend.id == data.to_storage_id).first()
    
    if not from_backend:
        raise HTTPException(status_code=404, detail="Source storage backend not found")
    if not to_backend:
        raise HTTPException(status_code=404, detail="Target storage backend not found")
    
    # Count items to migrate based on scope
    from app.models.study import Study
    
    query = db.query(Study).filter(Study.storage_id == data.from_storage_id)
    
    # Apply scope filter
    if data.scope == "tenant":
        query = query.filter(Study.tenant_id == data.tenant_id)
    elif data.scope == "patient" and data.scope_filter:
        patient_id = data.scope_filter.get("patient_id")
        if patient_id:
            query = query.filter(Study.patient_id == patient_id)
    elif data.scope == "study" and data.scope_filter:
        study_uid = data.scope_filter.get("study_instance_uid")
        if study_uid:
            query = query.filter(Study.study_instance_uid == study_uid)
    elif data.scope == "date_range" and data.scope_filter:
        date_from = data.scope_filter.get("date_from")
        date_to = data.scope_filter.get("date_to")
        if date_from:
            query = query.filter(Study.study_date >= date_from)
        if date_to:
            query = query.filter(Study.study_date <= date_to)
    
    items_total = query.count()
    
    # Create migration record
    from app.models.storage_migration import StorageMigration
    
    migration = StorageMigration(
        tenant_id=data.tenant_id,
        from_storage_id=data.from_storage_id,
        to_storage_id=data.to_storage_id,
        scope=data.scope,
        scope_filter=data.scope_filter,
        status="pending",
        items_total=items_total,
        items_completed=0,
        created_at=datetime.now()
    )
    
    db.add(migration)
    db.commit()
    db.refresh(migration)

    # Trigger the background task
    from app.tasks.storage_migration import execute_provider_migration
    execute_provider_migration.delay(str(migration.id))

    return migration


@router.get("", response_model=List[StorageMigrationResponse])
async def list_storage_migrations(
    tenant_id: Optional[UUID] = None,
    status: Optional[str] = None,
    limit: int = Query(50, le=100),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """List storage migrations"""
    if current_user.get("role") != "SUPERADMIN":
        raise HTTPException(status_code=403, detail="Only superadmin can view migrations")
    
    from app.models.storage_migration import StorageMigration
    
    query = db.query(StorageMigration)
    
    if tenant_id:
        query = query.filter(StorageMigration.tenant_id == tenant_id)
    if status:
        query = query.filter(StorageMigration.status == status)
        
    return query.order_by(StorageMigration.created_at.desc()).limit(limit).all()


@router.get("/{migration_id}", response_model=StorageMigrationResponse)
async def get_storage_migration(
    migration_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Get storage migration by ID"""
    if current_user.get("role") != "SUPERADMIN":
        raise HTTPException(status_code=403, detail="Only superadmin can view migrations")
    
    from app.models.storage_migration import StorageMigration
    
    migration = db.query(StorageMigration).filter(StorageMigration.id == migration_id).first()
    if not migration:
        raise HTTPException(status_code=404, detail="Migration not found")
        
    return migration


@router.post("/{migration_id}/cancel")
async def cancel_storage_migration(
    migration_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Cancel a running storage migration"""
    if current_user.get("role") != "SUPERADMIN":
        raise HTTPException(status_code=403, detail="Only superadmin can cancel migrations")
    
    from app.models.storage_migration import StorageMigration
    
    migration = db.query(StorageMigration).filter(StorageMigration.id == migration_id).first()
    if not migration:
        raise HTTPException(status_code=404, detail="Migration not found")
        
    if migration.status not in ["pending", "running"]:
        raise HTTPException(status_code=400, detail=f"Cannot cancel migration in status {migration.status}")
        
    migration.status = "cancelled"
    migration.completed_at = datetime.now()
    db.commit()
    
    return {"status": "success", "message": f"Migration {migration_id} cancelled"}
