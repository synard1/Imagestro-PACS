"""
Unified External Systems Integration API Endpoints
Consolidates SIMRS, HIS, RIS, PACS, LIS, EMR integrations
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from typing import Optional, List
from datetime import date, datetime
from pydantic import BaseModel, Field
import uuid

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.unified_integration import (
    ExternalSystem,
    UnifiedProcedureMapping,
    UnifiedDoctorMapping,
    UnifiedOperatorMapping,
    UnifiedImportHistory
)
from app.utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/api/external-systems", tags=["external-systems"])


# ============================================================================
# Pydantic Schemas
# ============================================================================

class ProcedureMappingCreate(BaseModel):
    """Create procedure mapping"""
    external_code: str = Field(..., min_length=1)
    external_name: str = Field(..., min_length=1)
    pacs_code: str = Field(..., min_length=1)
    pacs_name: str = Field(..., min_length=1)
    modality: Optional[str] = None
    description: Optional[str] = None

class ProcedureMappingUpdate(BaseModel):
    """Update procedure mapping"""
    external_name: Optional[str] = None
    pacs_code: Optional[str] = None
    pacs_name: Optional[str] = None
    modality: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

class DoctorMappingCreate(BaseModel):
    """Create doctor mapping"""
    external_code: str = Field(..., min_length=1)
    external_name: str = Field(..., min_length=1)
    pacs_doctor_id: Optional[str] = None

class DoctorMappingUpdate(BaseModel):
    """Update doctor mapping"""
    external_name: Optional[str] = None
    pacs_doctor_id: Optional[str] = None

class OperatorMappingCreate(BaseModel):
    """Create operator mapping"""
    pacs_user_id: str = Field(..., min_length=1)
    pacs_username: str = Field(..., min_length=1)
    external_operator_code: str = Field(..., min_length=1)
    external_operator_name: str = Field(..., min_length=1)

class OperatorMappingUpdate(BaseModel):
    """Update operator mapping"""
    pacs_username: Optional[str] = None
    external_operator_code: Optional[str] = None
    external_operator_name: Optional[str] = None
    is_active: Optional[bool] = None

class ImportHistoryResponse(BaseModel):
    """Import history response"""
    id: str
    external_system_id: str
    external_order_id: str
    patient_mrn: Optional[str]
    patient_name: Optional[str]
    procedure_name: Optional[str]
    import_status: str
    worklist_item_id: Optional[str]
    patient_created: bool
    patient_updated: bool
    error_message: Optional[str]
    warnings: Optional[dict]
    imported_by: Optional[str]
    operator_name: Optional[str]
    imported_at: Optional[str]

    class Config:
        from_attributes = True


class ExternalSystemCreate(BaseModel):
    """Create external system"""
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=200)
    type: str = Field(..., description="System type: SIMRS, HIS, RIS, PACS, LIS, EMR")
    provider: Optional[str] = Field(default="generic", description="Provider: khanza, gos, generic")
    vendor: Optional[str] = None
    version: Optional[str] = None
    base_url: Optional[str] = None
    auth_type: Optional[str] = Field(default="none", description="Auth type: none, basic, bearer, api_key")
    api_key: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    db_host: Optional[str] = None
    db_name: Optional[str] = None
    db_user: Optional[str] = None
    db_password: Optional[str] = None
    timeout_ms: Optional[int] = Field(default=30000, ge=1000, le=300000)
    health_path: Optional[str] = Field(default="/health")
    capabilities: Optional[dict] = Field(default_factory=dict)
    field_mappings: Optional[dict] = Field(default_factory=dict)
    facility_code: Optional[str] = None
    facility_name: Optional[str] = None
    is_active: Optional[bool] = True
    is_default: Optional[bool] = False


class ExternalSystemUpdate(BaseModel):
    """Update external system"""
    name: Optional[str] = None
    type: Optional[str] = None
    provider: Optional[str] = None
    vendor: Optional[str] = None
    version: Optional[str] = None
    base_url: Optional[str] = None
    auth_type: Optional[str] = None
    api_key: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    db_host: Optional[str] = None
    db_name: Optional[str] = None
    db_user: Optional[str] = None
    db_password: Optional[str] = None
    timeout_ms: Optional[int] = None
    health_path: Optional[str] = None
    capabilities: Optional[dict] = None
    field_mappings: Optional[dict] = None
    facility_code: Optional[str] = None
    facility_name: Optional[str] = None
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None


# ============================================================================
# External Systems CRUD Endpoints (NEW)
# ============================================================================

@router.get("", response_model=dict)
async def list_external_systems(
    search: Optional[str] = Query(None, description="Search by code or name"),
    system_type: Optional[str] = Query(None, alias="type", description="Filter by system type"),
    provider: Optional[str] = Query(None, description="Filter by provider"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    facility_code: Optional[str] = Query(None, description="Filter by facility code"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """List all external systems with filtering and pagination"""
    try:
        query = db.query(ExternalSystem)

        # Enforce tenant isolation
        if current_user.get("role") != "SUPERADMIN":
            query = query.filter(ExternalSystem.tenant_id == current_user.get("tenant_id"))

        # Apply filters
        if search:
            search_filter = or_(
                ExternalSystem.code.ilike(f"%{search}%"),
                ExternalSystem.name.ilike(f"%{search}%")
            )
            query = query.filter(search_filter)

        if system_type:
            query = query.filter(ExternalSystem.type == system_type)

        if provider:
            query = query.filter(ExternalSystem.provider == provider)

        if is_active is not None:
            query = query.filter(ExternalSystem.is_active == is_active)

        if facility_code:
            query = query.filter(ExternalSystem.facility_code == facility_code)

        # Get total count
        total = query.count()

        # Apply pagination
        offset = (page - 1) * page_size
        systems = query.order_by(ExternalSystem.code).offset(offset).limit(page_size).all()

        return {
            "items": [s.to_dict(include_credentials=False) for s in systems],
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (total + page_size - 1) // page_size
        }
    except Exception as e:
        logger.error(f"Error listing external systems: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{system_id}", response_model=dict)
async def get_external_system(
    system_id: str,
    include_credentials: bool = Query(False, description="Include decrypted credentials"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Get external system by ID"""
    try:
        query = db.query(ExternalSystem).filter(ExternalSystem.id == system_id)

        if current_user.get("role") != "SUPERADMIN":
            query = query.filter(ExternalSystem.tenant_id == current_user.get("tenant_id"))

        system = query.first()
        if not system:
            raise HTTPException(status_code=404, detail="External system not found")

        return {"system": system.to_dict(include_credentials=include_credentials)}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting external system {system_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("", response_model=dict, status_code=201)
async def create_external_system(
    data: ExternalSystemCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Create a new external system"""
    try:
        # Resolve tenant_id
        tenant_id = current_user.get("tenant_id")
        if current_user.get("role") == "SUPERADMIN" and hasattr(data, 'tenant_id'):
            # Allow superadmin to specify tenant_id if schema supported it (currently it doesn't)
            pass

        # Check for duplicate code (scoped to tenant)
        query = db.query(ExternalSystem).filter(ExternalSystem.code == data.code)
        if current_user.get("role") != "SUPERADMIN":
            query = query.filter(ExternalSystem.tenant_id == tenant_id)
        
        existing = query.first()
        if existing:
            raise HTTPException(status_code=400, detail=f"External system with code '{data.code}' already exists")
        
        created_by = getattr(request.state, 'user_id', None) or 'system'
        
        from app.utils.crypto import encrypt_value
        
        # Build auth_config from credentials with encryption
        auth_config = {}
        if data.api_key:
            auth_config['api_key'] = encrypt_value(data.api_key)
            logger.info("Encrypted api_key for new system")
        if data.username:
            auth_config['username'] = data.username
        if data.password:
            auth_config['password'] = encrypt_value(data.password)
            logger.info("Encrypted password for new system")
        
        system = ExternalSystem(
            tenant_id=tenant_id,
            code=data.code,
            name=data.name,
            type=data.type,
            provider=data.provider,
            vendor=data.vendor,
            version=data.version,
            base_url=data.base_url,
            auth_type=data.auth_type,
            auth_config=auth_config if auth_config else None,
            db_host=data.db_host,
            db_name=data.db_name,
            db_user=data.db_user,
            db_password=encrypt_value(data.db_password) if data.db_password else None,
            timeout_ms=data.timeout_ms,
            health_path=data.health_path,
            capabilities=data.capabilities or {},
            field_mappings=data.field_mappings or {},
            facility_code=data.facility_code,
            facility_name=data.facility_name,
            is_active=data.is_active,
            is_default=data.is_default,
            created_by=created_by
        )
        db.add(system)
        db.commit()
        db.refresh(system)
        
        logger.info(f"Created external system: {system.code} for tenant: {tenant_id}")
        return {"system": system.to_dict(), "message": "External system created successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating external system: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{system_id}", response_model=dict)
async def update_external_system(
    system_id: str,
    data: ExternalSystemUpdate,
    request: Request,
    db: Session = Depends(get_db)
):
    """Update an existing external system"""
    from app.utils.crypto import encrypt_value
    
    try:
        system = db.query(ExternalSystem).filter(ExternalSystem.id == system_id).first()
        if not system:
            raise HTTPException(status_code=404, detail="External system not found")
        
        updated_by = getattr(request.state, 'user_id', None) or 'system'
        
        update_data = data.dict(exclude_unset=True)
        update_data['updated_by'] = updated_by
        
        logger.info(f"Update data received for system {system_id}")
        
        # Handle auth_config separately with encryption
        auth_fields = ['api_key', 'username', 'password']
        auth_updates = {}
        for field in auth_fields:
            if field in update_data:
                value = update_data.pop(field)
                if value:  # Only update if value is provided
                    # Encrypt sensitive fields
                    if field in ['api_key', 'password']:
                        auth_updates[field] = encrypt_value(value)
                        logger.info(f"Encrypted {field}")
                    else:
                        auth_updates[field] = value
        
        if auth_updates:
            current_auth = system.auth_config or {}
            current_auth.update(auth_updates)
            system.auth_config = current_auth
            logger.info(f"Updated auth_config with {len(auth_updates)} fields")
        
        # Handle db_password separately with encryption
        if 'db_password' in update_data:
            db_password = update_data.pop('db_password')
            if db_password:
                update_data['db_password'] = encrypt_value(db_password)
                logger.info("Encrypted db_password")
        
        for key, value in update_data.items():
            setattr(system, key, value)
        
        db.commit()
        db.refresh(system)
        
        logger.info(f"Updated external system: {system.code}")
        return {
            "system": system.to_dict(include_credentials=True, mask_credentials=True),
            "message": "External system updated successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating external system: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{system_id}", response_model=dict)
async def delete_external_system(
    system_id: str,
    db: Session = Depends(get_db)
):
    """Delete an external system"""
    try:
        system = db.query(ExternalSystem).filter(ExternalSystem.id == system_id).first()
        if not system:
            raise HTTPException(status_code=404, detail="External system not found")
        
        # Check for related mappings
        proc_count = db.query(UnifiedProcedureMapping).filter(
            UnifiedProcedureMapping.external_system_id == system_id
        ).count()
        doc_count = db.query(UnifiedDoctorMapping).filter(
            UnifiedDoctorMapping.external_system_id == system_id
        ).count()
        op_count = db.query(UnifiedOperatorMapping).filter(
            UnifiedOperatorMapping.external_system_id == system_id
        ).count()
        
        if proc_count > 0 or doc_count > 0 or op_count > 0:
            raise HTTPException(
                status_code=400, 
                detail=f"Cannot delete system with existing mappings. Found: {proc_count} procedure, {doc_count} doctor, {op_count} operator mappings"
            )
        
        system_code = system.code
        db.delete(system)
        db.commit()
        
        logger.info(f"Deleted external system: {system_code}")
        return {"message": f"External system '{system_code}' deleted successfully", "id": system_id}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting external system: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Procedure Mapping Endpoints (13.1)
# ============================================================================

@router.get("/{system_id}/mappings/procedures", response_model=dict)
async def list_procedure_mappings(
    system_id: str,
    search: Optional[str] = Query(None),
    modality: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """List procedure mappings for external system"""
    try:
        query = db.query(UnifiedProcedureMapping).filter(
            UnifiedProcedureMapping.external_system_id == system_id
        )
        
        if search:
            search_filter = or_(
                UnifiedProcedureMapping.external_code.ilike(f"%{search}%"),
                UnifiedProcedureMapping.external_name.ilike(f"%{search}%"),
                UnifiedProcedureMapping.pacs_code.ilike(f"%{search}%"),
                UnifiedProcedureMapping.pacs_name.ilike(f"%{search}%")
            )
            query = query.filter(search_filter)
        
        if modality:
            query = query.filter(UnifiedProcedureMapping.modality == modality)
        
        if is_active is not None:
            query = query.filter(UnifiedProcedureMapping.is_active == is_active)
        
        total = query.count()
        mappings = query.order_by(UnifiedProcedureMapping.external_code).offset(offset).limit(limit).all()
        
        return {
            "items": [m.to_dict() for m in mappings],
            "total": total,
            "limit": limit,
            "offset": offset
        }
    except Exception as e:
        logger.error(f"Error listing procedure mappings: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{system_id}/mappings/procedures", response_model=dict, status_code=201)
async def create_procedure_mapping(
    system_id: str,
    data: ProcedureMappingCreate,
    request: Request,
    db: Session = Depends(get_db)
):
    """Create procedure mapping"""
    try:
        # Check system exists
        system = db.query(ExternalSystem).filter(ExternalSystem.id == system_id).first()
        if not system:
            raise HTTPException(status_code=404, detail="External system not found")
        
        # Check for duplicate
        existing = db.query(UnifiedProcedureMapping).filter(
            and_(
                UnifiedProcedureMapping.external_system_id == system_id,
                UnifiedProcedureMapping.external_code == data.external_code
            )
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Procedure mapping already exists")
        
        created_by = getattr(request.state, 'user_id', None) or 'system'
        
        mapping = UnifiedProcedureMapping(
            external_system_id=system_id,
            external_code=data.external_code,
            external_name=data.external_name,
            pacs_code=data.pacs_code,
            pacs_name=data.pacs_name,
            modality=data.modality,
            description=data.description,
            is_active=True,
            created_by=created_by
        )
        db.add(mapping)
        db.commit()
        db.refresh(mapping)
        
        logger.info(f"Created procedure mapping: {mapping.external_code} -> {mapping.pacs_code}")
        return {"mapping": mapping.to_dict(), "message": "Procedure mapping created"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating procedure mapping: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{system_id}/mappings/procedures/{mapping_id}", response_model=dict)
async def update_procedure_mapping(
    system_id: str,
    mapping_id: str,
    data: ProcedureMappingUpdate,
    request: Request,
    db: Session = Depends(get_db)
):
    """Update procedure mapping"""
    try:
        mapping = db.query(UnifiedProcedureMapping).filter(
            and_(
                UnifiedProcedureMapping.id == uuid.UUID(mapping_id),
                UnifiedProcedureMapping.external_system_id == uuid.UUID(system_id)
            )
        ).first()
        if not mapping:
            raise HTTPException(status_code=404, detail="Procedure mapping not found")
        
        updated_by = getattr(request.state, 'user_id', None) or 'system'
        
        update_data = data.dict(exclude_unset=True)
        update_data['updated_by'] = updated_by
        
        for key, value in update_data.items():
            setattr(mapping, key, value)
        
        db.commit()
        db.refresh(mapping)
        
        logger.info(f"Updated procedure mapping: {mapping.id}")
        return {"mapping": mapping.to_dict(), "message": "Procedure mapping updated"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating procedure mapping: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{system_id}/mappings/procedures/{mapping_id}", response_model=dict)
async def delete_procedure_mapping(
    system_id: str,
    mapping_id: str,
    db: Session = Depends(get_db)
):
    """Delete procedure mapping"""
    try:
        mapping = db.query(UnifiedProcedureMapping).filter(
            and_(
                UnifiedProcedureMapping.id == uuid.UUID(mapping_id),
                UnifiedProcedureMapping.external_system_id == uuid.UUID(system_id)
            )
        ).first()
        if not mapping:
            raise HTTPException(status_code=404, detail="Procedure mapping not found")
        
        db.delete(mapping)
        db.commit()
        
        logger.info(f"Deleted procedure mapping: {mapping_id}")
        return {"message": "Procedure mapping deleted", "id": mapping_id}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting procedure mapping: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Doctor Mapping Endpoints (13.1)
# ============================================================================

@router.get("/{system_id}/mappings/doctors", response_model=dict)
async def list_doctor_mappings(
    system_id: str,
    search: Optional[str] = Query(None),
    auto_created: Optional[bool] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """List doctor mappings for external system"""
    try:
        query = db.query(UnifiedDoctorMapping).filter(
            UnifiedDoctorMapping.external_system_id == system_id
        )
        
        if search:
            search_filter = or_(
                UnifiedDoctorMapping.external_code.ilike(f"%{search}%"),
                UnifiedDoctorMapping.external_name.ilike(f"%{search}%")
            )
            query = query.filter(search_filter)
        
        if auto_created is not None:
            query = query.filter(UnifiedDoctorMapping.auto_created == auto_created)
        
        total = query.count()
        mappings = query.order_by(UnifiedDoctorMapping.external_name).offset(offset).limit(limit).all()
        
        return {
            "items": [m.to_dict() for m in mappings],
            "total": total,
            "limit": limit,
            "offset": offset
        }
    except Exception as e:
        logger.error(f"Error listing doctor mappings: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{system_id}/mappings/doctors", response_model=dict, status_code=201)
async def create_doctor_mapping(
    system_id: str,
    data: DoctorMappingCreate,
    request: Request,
    db: Session = Depends(get_db)
):
    """Create doctor mapping"""
    try:
        # Check system exists
        system = db.query(ExternalSystem).filter(ExternalSystem.id == system_id).first()
        if not system:
            raise HTTPException(status_code=404, detail="External system not found")
        
        # Check for duplicate
        existing = db.query(UnifiedDoctorMapping).filter(
            and_(
                UnifiedDoctorMapping.external_system_id == system_id,
                UnifiedDoctorMapping.external_code == data.external_code
            )
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Doctor mapping already exists")
        
        created_by = getattr(request.state, 'user_id', None) or 'system'
        
        mapping = UnifiedDoctorMapping(
            external_system_id=system_id,
            external_code=data.external_code,
            external_name=data.external_name,
            pacs_doctor_id=uuid.UUID(data.pacs_doctor_id) if data.pacs_doctor_id else None,
            auto_created=False,
            created_by=created_by
        )
        db.add(mapping)
        db.commit()
        db.refresh(mapping)
        
        logger.info(f"Created doctor mapping: {mapping.external_code}")
        return {"mapping": mapping.to_dict(), "message": "Doctor mapping created"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating doctor mapping: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{system_id}/mappings/doctors/{mapping_id}", response_model=dict)
async def update_doctor_mapping(
    system_id: str,
    mapping_id: str,
    data: DoctorMappingUpdate,
    request: Request,
    db: Session = Depends(get_db)
):
    """Update doctor mapping"""
    try:
        mapping = db.query(UnifiedDoctorMapping).filter(
            and_(
                UnifiedDoctorMapping.id == uuid.UUID(mapping_id),
                UnifiedDoctorMapping.external_system_id == uuid.UUID(system_id)
            )
        ).first()
        if not mapping:
            raise HTTPException(status_code=404, detail="Doctor mapping not found")
        
        updated_by = getattr(request.state, 'user_id', None) or 'system'
        
        update_data = data.dict(exclude_unset=True)
        update_data['updated_by'] = updated_by
        
        if 'pacs_doctor_id' in update_data and update_data['pacs_doctor_id']:
            update_data['pacs_doctor_id'] = uuid.UUID(update_data['pacs_doctor_id'])
        
        for key, value in update_data.items():
            setattr(mapping, key, value)
        
        db.commit()
        db.refresh(mapping)
        
        logger.info(f"Updated doctor mapping: {mapping.id}")
        return {"mapping": mapping.to_dict(), "message": "Doctor mapping updated"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating doctor mapping: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{system_id}/mappings/doctors/{mapping_id}", response_model=dict)
async def delete_doctor_mapping(
    system_id: str,
    mapping_id: str,
    db: Session = Depends(get_db)
):
    """Delete doctor mapping"""
    try:
        mapping = db.query(UnifiedDoctorMapping).filter(
            and_(
                UnifiedDoctorMapping.id == uuid.UUID(mapping_id),
                UnifiedDoctorMapping.external_system_id == uuid.UUID(system_id)
            )
        ).first()
        if not mapping:
            raise HTTPException(status_code=404, detail="Doctor mapping not found")
        
        db.delete(mapping)
        db.commit()
        
        logger.info(f"Deleted doctor mapping: {mapping_id}")
        return {"message": "Doctor mapping deleted", "id": mapping_id}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting doctor mapping: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Operator Mapping Endpoints (13.1)
# ============================================================================

@router.get("/{system_id}/mappings/operators", response_model=dict)
async def list_operator_mappings(
    system_id: str,
    search: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """List operator mappings for external system"""
    try:
        query = db.query(UnifiedOperatorMapping).filter(
            UnifiedOperatorMapping.external_system_id == system_id
        )
        
        if search:
            search_filter = or_(
                UnifiedOperatorMapping.pacs_username.ilike(f"%{search}%"),
                UnifiedOperatorMapping.external_operator_code.ilike(f"%{search}%"),
                UnifiedOperatorMapping.external_operator_name.ilike(f"%{search}%")
            )
            query = query.filter(search_filter)
        
        if is_active is not None:
            query = query.filter(UnifiedOperatorMapping.is_active == is_active)
        
        total = query.count()
        mappings = query.order_by(UnifiedOperatorMapping.pacs_username).offset(offset).limit(limit).all()
        
        return {
            "items": [m.to_dict() for m in mappings],
            "total": total,
            "limit": limit,
            "offset": offset
        }
    except Exception as e:
        logger.error(f"Error listing operator mappings: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{system_id}/mappings/operators", response_model=dict, status_code=201)
async def create_operator_mapping(
    system_id: str,
    data: OperatorMappingCreate,
    request: Request,
    db: Session = Depends(get_db)
):
    """Create operator mapping"""
    try:
        # Check system exists
        system = db.query(ExternalSystem).filter(ExternalSystem.id == system_id).first()
        if not system:
            raise HTTPException(status_code=404, detail="External system not found")
        
        # Check for duplicate
        existing = db.query(UnifiedOperatorMapping).filter(
            and_(
                UnifiedOperatorMapping.external_system_id == system_id,
                UnifiedOperatorMapping.pacs_user_id == data.pacs_user_id
            )
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Operator mapping already exists for this user")
        
        created_by = getattr(request.state, 'user_id', None) or 'system'
        
        mapping = UnifiedOperatorMapping(
            external_system_id=system_id,
            pacs_user_id=uuid.UUID(data.pacs_user_id),
            pacs_username=data.pacs_username,
            external_operator_code=data.external_operator_code,
            external_operator_name=data.external_operator_name,
            is_active=True,
            created_by=created_by
        )
        db.add(mapping)
        db.commit()
        db.refresh(mapping)
        
        logger.info(f"Created operator mapping: {mapping.pacs_username}")
        return {"mapping": mapping.to_dict(), "message": "Operator mapping created"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating operator mapping: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{system_id}/mappings/operators/{mapping_id}", response_model=dict)
async def update_operator_mapping(
    system_id: str,
    mapping_id: str,
    data: OperatorMappingUpdate,
    request: Request,
    db: Session = Depends(get_db)
):
    """Update operator mapping"""
    try:
        mapping = db.query(UnifiedOperatorMapping).filter(
            and_(
                UnifiedOperatorMapping.id == mapping_id,
                UnifiedOperatorMapping.external_system_id == system_id
            )
        ).first()
        if not mapping:
            raise HTTPException(status_code=404, detail="Operator mapping not found")
        
        updated_by = getattr(request.state, 'user_id', None) or 'system'
        
        update_data = data.dict(exclude_unset=True)
        update_data['updated_by'] = updated_by
        
        for key, value in update_data.items():
            setattr(mapping, key, value)
        
        db.commit()
        db.refresh(mapping)
        
        logger.info(f"Updated operator mapping: {mapping.id}")
        return {"mapping": mapping.to_dict(), "message": "Operator mapping updated"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating operator mapping: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{system_id}/mappings/operators/{mapping_id}", response_model=dict)
async def delete_operator_mapping(
    system_id: str,
    mapping_id: str,
    db: Session = Depends(get_db)
):
    """Delete operator mapping"""
    try:
        mapping = db.query(UnifiedOperatorMapping).filter(
            and_(
                UnifiedOperatorMapping.id == mapping_id,
                UnifiedOperatorMapping.external_system_id == system_id
            )
        ).first()
        if not mapping:
            raise HTTPException(status_code=404, detail="Operator mapping not found")
        
        db.delete(mapping)
        db.commit()
        
        logger.info(f"Deleted operator mapping: {mapping_id}")
        return {"message": "Operator mapping deleted", "id": mapping_id}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting operator mapping: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Import Endpoints (13.2)
# ============================================================================

@router.post("/{system_id}/import", response_model=dict)
async def import_order(
    system_id: str,
    request: Request,
    db: Session = Depends(get_db)
):
    """Import order from external system"""
    try:
        # Check system exists
        system = db.query(ExternalSystem).filter(ExternalSystem.id == system_id).first()
        if not system:
            raise HTTPException(status_code=404, detail="External system not found")
        
        # Get request body
        body = await request.json()
        external_order_id = body.get('external_order_id')
        
        if not external_order_id:
            raise HTTPException(status_code=400, detail="external_order_id is required")
        
        # Check if already imported
        existing = db.query(UnifiedImportHistory).filter(
            and_(
                UnifiedImportHistory.external_system_id == system_id,
                UnifiedImportHistory.external_order_id == external_order_id,
                UnifiedImportHistory.import_status == 'success'
            )
        ).first()
        
        if existing:
            return {
                "success": False,
                "external_order_id": external_order_id,
                "error": "Order already imported"
            }
        
        imported_by = getattr(request.state, 'user_id', None) or 'system'
        
        # Create import history record
        history = UnifiedImportHistory(
            external_system_id=system_id,
            external_order_id=external_order_id,
            external_visit_id=body.get('external_visit_id'),
            patient_mrn=body.get('patient_mrn'),
            patient_name=body.get('patient_name'),
            procedure_code=body.get('procedure_code'),
            procedure_name=body.get('procedure_name'),
            import_status='success',
            worklist_item_id=body.get('worklist_item_id'),
            patient_created=body.get('patient_created', False),
            patient_updated=body.get('patient_updated', False),
            warnings=body.get('warnings'),
            raw_data=body.get('raw_data'),
            imported_by=imported_by,
            operator_name=body.get('operator_name')
        )
        db.add(history)
        db.commit()
        db.refresh(history)
        
        logger.info(f"Imported order {external_order_id} from system {system_id}")
        return {
            "success": True,
            "external_order_id": external_order_id,
            "import_id": str(history.id)
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error importing order: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{system_id}/import-history", response_model=dict)
async def list_import_history(
    system_id: str,
    search: Optional[str] = Query(None),
    import_status: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """List import history for external system"""
    try:
        query = db.query(UnifiedImportHistory).filter(
            UnifiedImportHistory.external_system_id == system_id
        )
        
        if search:
            search_filter = or_(
                UnifiedImportHistory.external_order_id.ilike(f"%{search}%"),
                UnifiedImportHistory.patient_name.ilike(f"%{search}%"),
                UnifiedImportHistory.patient_mrn.ilike(f"%{search}%")
            )
            query = query.filter(search_filter)
        
        if import_status:
            query = query.filter(UnifiedImportHistory.import_status == import_status)
        
        if date_from:
            query = query.filter(UnifiedImportHistory.imported_at >= datetime.combine(date_from, datetime.min.time()))
        
        if date_to:
            query = query.filter(UnifiedImportHistory.imported_at <= datetime.combine(date_to, datetime.max.time()))
        
        total = query.count()
        history = query.order_by(UnifiedImportHistory.imported_at.desc()).offset(offset).limit(limit).all()
        
        return {
            "items": [h.to_dict() for h in history],
            "total": total,
            "limit": limit,
            "offset": offset
        }
    except Exception as e:
        logger.error(f"Error listing import history: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{system_id}/import-history/{history_id}/retry", response_model=dict)
async def retry_import(
    system_id: str,
    history_id: str,
    request: Request,
    db: Session = Depends(get_db)
):
    """Retry failed import"""
    try:
        history = db.query(UnifiedImportHistory).filter(
            and_(
                UnifiedImportHistory.id == history_id,
                UnifiedImportHistory.external_system_id == system_id
            )
        ).first()
        
        if not history:
            raise HTTPException(status_code=404, detail="Import history not found")
        
        if history.import_status == 'success':
            raise HTTPException(status_code=400, detail="Cannot retry successful import")
        
        # Update status to success (in real implementation, would re-process)
        history.import_status = 'success'
        history.imported_by = getattr(request.state, 'user_id', None) or 'system'
        
        db.commit()
        db.refresh(history)
        
        logger.info(f"Retried import: {history_id}")
        return {
            "success": True,
            "history_id": str(history.id),
            "import_status": history.import_status
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error retrying import: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Audit Log Endpoints (13.3)
# ============================================================================

@router.get("/{system_id}/audit-log", response_model=dict)
async def get_system_audit_log(
    system_id: str,
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    user: Optional[str] = Query(None),
    action_type: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """Get audit log for external system"""
    try:
        # Check system exists
        system = db.query(ExternalSystem).filter(ExternalSystem.id == system_id).first()
        if not system:
            raise HTTPException(status_code=404, detail="External system not found")
        
        # Build audit log from import history and mappings
        audit_items = []
        
        # Get import history as audit events
        import_query = db.query(UnifiedImportHistory).filter(
            UnifiedImportHistory.external_system_id == system_id
        )
        
        if date_from:
            import_query = import_query.filter(
                UnifiedImportHistory.imported_at >= datetime.combine(date_from, datetime.min.time())
            )
        if date_to:
            import_query = import_query.filter(
                UnifiedImportHistory.imported_at <= datetime.combine(date_to, datetime.max.time())
            )
        if user:
            import_query = import_query.filter(UnifiedImportHistory.imported_by.ilike(f"%{user}%"))
        
        import_history = import_query.order_by(UnifiedImportHistory.imported_at.desc()).all()
        
        for item in import_history:
            audit_items.append({
                "timestamp": item.imported_at.isoformat() if item.imported_at else None,
                "user": item.imported_by,
                "action": "import",
                "entity": "order",
                "entity_id": item.external_order_id,
                "status": item.import_status,
                "details": {
                    "patient_name": item.patient_name,
                    "procedure_name": item.procedure_name,
                    "error": item.error_message
                }
            })
        
        # Filter by action_type if specified
        if action_type:
            audit_items = [item for item in audit_items if item['action'] == action_type]
        
        # Apply pagination
        total = len(audit_items)
        paginated_items = audit_items[offset:offset + limit]
        
        return {
            "items": paginated_items,
            "total": total,
            "limit": limit,
            "offset": offset
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting audit log: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/audit-log/global", response_model=dict)
async def get_global_audit_log(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    user: Optional[str] = Query(None),
    action_type: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """Get global audit log for all external systems"""
    try:
        # Build audit log from import history
        audit_query = db.query(UnifiedImportHistory)
        
        if date_from:
            audit_query = audit_query.filter(
                UnifiedImportHistory.imported_at >= datetime.combine(date_from, datetime.min.time())
            )
        if date_to:
            audit_query = audit_query.filter(
                UnifiedImportHistory.imported_at <= datetime.combine(date_to, datetime.max.time())
            )
        if user:
            audit_query = audit_query.filter(UnifiedImportHistory.imported_by.ilike(f"%{user}%"))
        
        total = audit_query.count()
        history = audit_query.order_by(UnifiedImportHistory.imported_at.desc()).offset(offset).limit(limit).all()
        
        audit_items = []
        for item in history:
            audit_items.append({
                "timestamp": item.imported_at.isoformat() if item.imported_at else None,
                "user": item.imported_by,
                "action": "import",
                "entity": "order",
                "entity_id": item.external_order_id,
                "system_id": str(item.external_system_id),
                "status": item.import_status,
                "details": {
                    "patient_name": item.patient_name,
                    "procedure_name": item.procedure_name,
                    "error": item.error_message
                }
            })
        
        # Filter by action_type if specified
        if action_type:
            audit_items = [item for item in audit_items if item['action'] == action_type]
        
        return {
            "items": audit_items,
            "total": total,
            "limit": limit,
            "offset": offset
        }
    except Exception as e:
        logger.error(f"Error getting global audit log: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Backup/Restore Endpoints (13.4)
# ============================================================================

@router.get("/export", response_model=dict)
async def export_all_configurations(
    db: Session = Depends(get_db)
):
    """Export all external systems and mappings"""
    try:
        systems = db.query(ExternalSystem).all()
        
        export_data = {
            "version": "1.0",
            "exported_at": datetime.utcnow().isoformat(),
            "external_systems": [],
            "procedure_mappings": [],
            "doctor_mappings": [],
            "operator_mappings": []
        }
        
        for system in systems:
            export_data["external_systems"].append(system.to_dict())
            
            # Get all mappings for this system
            proc_mappings = db.query(UnifiedProcedureMapping).filter(
                UnifiedProcedureMapping.external_system_id == system.id
            ).all()
            export_data["procedure_mappings"].extend([m.to_dict() for m in proc_mappings])
            
            doc_mappings = db.query(UnifiedDoctorMapping).filter(
                UnifiedDoctorMapping.external_system_id == system.id
            ).all()
            export_data["doctor_mappings"].extend([m.to_dict() for m in doc_mappings])
            
            op_mappings = db.query(UnifiedOperatorMapping).filter(
                UnifiedOperatorMapping.external_system_id == system.id
            ).all()
            export_data["operator_mappings"].extend([m.to_dict() for m in op_mappings])
        
        logger.info(f"Exported {len(systems)} external systems")
        return export_data
    except Exception as e:
        logger.error(f"Error exporting configurations: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/import", response_model=dict)
async def import_configurations(
    request: Request,
    db: Session = Depends(get_db)
):
    """Import external systems and mappings from backup"""
    try:
        body = await request.json()
        
        if not body.get('external_systems'):
            raise HTTPException(status_code=400, detail="No external systems in import data")
        
        imported_count = 0
        skipped_count = 0
        errors = []
        
        # Import external systems
        for sys_data in body.get('external_systems', []):
            try:
                # Check if exists
                existing = db.query(ExternalSystem).filter(
                    ExternalSystem.code == sys_data['code']
                ).first()
                
                if existing:
                    skipped_count += 1
                    continue
                
                system = ExternalSystem(
                    code=sys_data['code'],
                    name=sys_data['name'],
                    type=sys_data['type'],
                    provider=sys_data.get('provider', 'generic'),
                    vendor=sys_data.get('vendor'),
                    version=sys_data.get('version'),
                    base_url=sys_data.get('base_url'),
                    auth_type=sys_data.get('auth_type', 'none'),
                    timeout_ms=sys_data.get('timeout_ms', 30000),
                    health_path=sys_data.get('health_path', '/health'),
                    capabilities=sys_data.get('capabilities', {}),
                    field_mappings=sys_data.get('field_mappings', {}),
                    facility_code=sys_data.get('facility_code'),
                    facility_name=sys_data.get('facility_name'),
                    is_active=sys_data.get('is_active', True),
                    is_default=sys_data.get('is_default', False)
                )
                db.add(system)
                db.flush()
                imported_count += 1
            except Exception as e:
                errors.append(f"Error importing system {sys_data.get('code')}: {str(e)}")
        
        # Import procedure mappings
        for mapping_data in body.get('procedure_mappings', []):
            try:
                existing = db.query(UnifiedProcedureMapping).filter(
                    and_(
                        UnifiedProcedureMapping.external_system_id == mapping_data['external_system_id'],
                        UnifiedProcedureMapping.external_code == mapping_data['external_code']
                    )
                ).first()
                
                if existing:
                    continue
                
                mapping = UnifiedProcedureMapping(
                    external_system_id=mapping_data['external_system_id'],
                    external_code=mapping_data['external_code'],
                    external_name=mapping_data['external_name'],
                    pacs_code=mapping_data['pacs_code'],
                    pacs_name=mapping_data['pacs_name'],
                    modality=mapping_data.get('modality'),
                    description=mapping_data.get('description'),
                    is_active=mapping_data.get('is_active', True)
                )
                db.add(mapping)
            except Exception as e:
                errors.append(f"Error importing procedure mapping: {str(e)}")
        
        # Import doctor mappings
        for mapping_data in body.get('doctor_mappings', []):
            try:
                existing = db.query(UnifiedDoctorMapping).filter(
                    and_(
                        UnifiedDoctorMapping.external_system_id == mapping_data['external_system_id'],
                        UnifiedDoctorMapping.external_code == mapping_data['external_code']
                    )
                ).first()
                
                if existing:
                    continue
                
                mapping = UnifiedDoctorMapping(
                    external_system_id=mapping_data['external_system_id'],
                    external_code=mapping_data['external_code'],
                    external_name=mapping_data['external_name'],
                    pacs_doctor_id=uuid.UUID(mapping_data['pacs_doctor_id']) if mapping_data.get('pacs_doctor_id') else None,
                    auto_created=mapping_data.get('auto_created', False)
                )
                db.add(mapping)
            except Exception as e:
                errors.append(f"Error importing doctor mapping: {str(e)}")
        
        # Import operator mappings
        for mapping_data in body.get('operator_mappings', []):
            try:
                existing = db.query(UnifiedOperatorMapping).filter(
                    and_(
                        UnifiedOperatorMapping.external_system_id == mapping_data['external_system_id'],
                        UnifiedOperatorMapping.pacs_user_id == mapping_data['pacs_user_id']
                    )
                ).first()
                
                if existing:
                    continue
                
                mapping = UnifiedOperatorMapping(
                    external_system_id=mapping_data['external_system_id'],
                    pacs_user_id=uuid.UUID(mapping_data['pacs_user_id']),
                    pacs_username=mapping_data['pacs_username'],
                    external_operator_code=mapping_data['external_operator_code'],
                    external_operator_name=mapping_data['external_operator_name'],
                    is_active=mapping_data.get('is_active', True)
                )
                db.add(mapping)
            except Exception as e:
                errors.append(f"Error importing operator mapping: {str(e)}")
        
        db.commit()
        
        logger.info(f"Imported {imported_count} systems, skipped {skipped_count}")
        return {
            "success": True,
            "imported": imported_count,
            "skipped": skipped_count,
            "errors": errors if errors else None
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error importing configurations: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Connection Testing
# ============================================================================

@router.post("/{system_id}/test-connection", response_model=dict)
async def test_system_connection(
    system_id: str,
    db: Session = Depends(get_db)
):
    """Test connection to an external system"""
    import httpx
    
    try:
        system = db.query(ExternalSystem).filter(ExternalSystem.id == system_id).first()
        if not system:
            raise HTTPException(status_code=404, detail="External system not found")
        
        if not system.base_url:
            return {
                "success": False,
                "error": "Base URL is not configured",
                "suggestion": "Please configure the base URL in system settings"
            }
        
        # Get decrypted credentials
        credentials = system.get_decrypted_credentials()
        
        # Build headers based on auth type
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json"
        }
        
        if system.auth_type == "api_key" and credentials.get("api_key"):
            headers["X-API-Key"] = credentials["api_key"]
        elif system.auth_type == "bearer" and credentials.get("api_key"):
            headers["Authorization"] = f"Bearer {credentials['api_key']}"
        
        # Build auth for basic auth
        auth = None
        if system.auth_type == "basic" and credentials.get("username") and credentials.get("password"):
            auth = (credentials["username"], credentials["password"])
        
        # Test connection
        health_url = f"{system.base_url.rstrip('/')}{system.health_path or '/health'}"
        timeout_seconds = (system.timeout_ms or 30000) / 1000
        
        logger.info(f"Testing connection to: {health_url}")
        
        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            response = await client.get(health_url, headers=headers, auth=auth)
            
            if response.status_code == 200:
                return {
                    "success": True,
                    "status_code": response.status_code,
                    "response_time_ms": int(response.elapsed.total_seconds() * 1000),
                    "message": "Connection successful"
                }
            else:
                return {
                    "success": False,
                    "status_code": response.status_code,
                    "error": f"Server returned status {response.status_code}",
                    "response_body": response.text[:500] if response.text else None
                }
    
    except httpx.ConnectError as e:
        return {
            "success": False,
            "error": "Connection refused",
            "suggestion": "Check if the server is running and the URL is correct",
            "details": str(e)
        }
    except httpx.TimeoutException as e:
        return {
            "success": False,
            "error": "Connection timeout",
            "suggestion": "The server took too long to respond. Try increasing the timeout.",
            "details": str(e)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error testing connection: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "suggestion": "Check the system configuration and try again"
        }


# ============================================================================
# Order Listing Endpoints (7.1, 7.2)
# ============================================================================

@router.get("/{system_id}/orders", response_model=dict)
async def list_orders(
    system_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    search: Optional[str] = Query(None, description="Search by order number, patient name, or MRN"),
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    db: Session = Depends(get_db)
):
    """
    List orders from external system with pagination and filtering
    
    Supports:
    - Pagination with page and page_size
    - Search by order number, patient name, or MRN
    - Date range filtering
    
    Returns paginated list of orders from the external system
    """
    try:
        # Get external system
        system = db.query(ExternalSystem).filter(ExternalSystem.id == system_id).first()
        if not system:
            raise HTTPException(status_code=404, detail="External system not found")
        
        # For now, return empty list as this requires integration with external system API
        # In production, this would call the external system's order API
        # This is a placeholder that returns mock data structure
        
        logger.info(f"Listing orders for system {system_id}: page={page}, page_size={page_size}, search={search}")
        
        # Calculate pagination
        offset = (page - 1) * page_size
        
        # Return empty list with proper pagination structure
        # TODO: Implement actual order fetching from external system
        return {
            "items": [],
            "total": 0,
            "page": page,
            "page_size": page_size,
            "total_pages": 0,
            "has_next_page": False,
            "has_previous_page": False
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing orders: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Health Check
# ============================================================================

@router.get("/health")
async def external_systems_health():
    """Health check for external systems service"""
    return {
        "status": "healthy",
        "service": "external-systems",
        "timestamp": datetime.utcnow().isoformat()
    }
