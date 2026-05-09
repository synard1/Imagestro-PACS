"""
Khanza Integration API Endpoints
RESTful API for SIMRS Khanza integration with PACS
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func
from typing import Optional, List
from datetime import date, datetime
from pydantic import BaseModel, Field
import uuid
import os
import httpx

from app.database import get_db
from app.models.khanza import (
    KhanzaConfig, 
    KhanzaProcedureMapping, 
    KhanzaDoctorMapping, 
    KhanzaImportHistory,
    KhanzaUnmappedProcedure
)
from app.models.unified_integration import (
    ExternalSystem,
    UnifiedProcedureMapping
)
from app.models.worklist import WorklistItem
from app.utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/api/khanza", tags=["khanza"])


# ============================================================================
# Pydantic Schemas
# ============================================================================

# Config Schemas
class KhanzaConfigCreate(BaseModel):
    """Create Khanza configuration"""
    base_url: str = Field(..., min_length=1, description="Khanza API base URL")
    api_key: str = Field(..., min_length=1, description="API key for authentication")
    timeout_ms: int = Field(default=30000, gt=0, description="Request timeout in milliseconds")

class KhanzaConfigUpdate(BaseModel):
    """Update Khanza configuration"""
    base_url: Optional[str] = Field(None, min_length=1)
    api_key: Optional[str] = Field(None, min_length=1)
    timeout_ms: Optional[int] = Field(None, gt=0)
    is_active: Optional[bool] = None

class KhanzaConfigResponse(BaseModel):
    """Khanza configuration response"""
    id: str
    base_url: str
    api_key: str
    timeout_ms: int
    is_active: bool
    created_at: Optional[str]
    updated_at: Optional[str]

    class Config:
        from_attributes = True


# Procedure Mapping Schemas
class ProcedureMappingCreate(BaseModel):
    """Create procedure mapping"""
    khanza_code: str = Field(..., min_length=1, description="Khanza procedure code")
    khanza_name: str = Field(..., min_length=1, description="Khanza procedure name")
    pacs_code: str = Field(..., min_length=1, description="PACS procedure code")
    pacs_name: str = Field(..., min_length=1, description="PACS procedure name")
    modality: Optional[str] = Field(None, description="Modality type (CT, MR, CR, etc.)")
    description: Optional[str] = None

class ProcedureMappingUpdate(BaseModel):
    """Update procedure mapping"""
    khanza_name: Optional[str] = Field(None, min_length=1)
    pacs_code: Optional[str] = Field(None, min_length=1)
    pacs_name: Optional[str] = Field(None, min_length=1)
    modality: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

class ProcedureMappingResponse(BaseModel):
    """Procedure mapping response"""
    id: str
    khanza_code: str
    khanza_name: str
    pacs_code: str
    pacs_name: str
    modality: Optional[str]
    description: Optional[str]
    is_active: bool
    created_at: Optional[str]
    updated_at: Optional[str]
    created_by: Optional[str]
    updated_by: Optional[str]

    class Config:
        from_attributes = True


# Doctor Mapping Schemas
class DoctorMappingCreate(BaseModel):
    """Create doctor mapping"""
    khanza_code: str = Field(..., min_length=1, description="Khanza doctor code")
    khanza_name: str = Field(..., min_length=1, description="Khanza doctor name")
    pacs_doctor_id: Optional[str] = Field(None, description="PACS doctor ID")

class DoctorMappingUpdate(BaseModel):
    """Update doctor mapping"""
    khanza_name: Optional[str] = Field(None, min_length=1)
    pacs_doctor_id: Optional[str] = None

class DoctorMappingResponse(BaseModel):
    """Doctor mapping response"""
    id: str
    khanza_code: str
    khanza_name: str
    pacs_doctor_id: Optional[str]
    auto_created: bool
    created_at: Optional[str]
    updated_at: Optional[str]

    class Config:
        from_attributes = True


# Import Schemas
class ImportOrderRequest(BaseModel):
    """Import order request"""
    noorder: str = Field(..., min_length=1, description="Khanza order number")
    no_rawat: Optional[str] = Field(None, description="Visit/registration number")
    no_rkm_medis: str = Field(..., min_length=1, description="Patient MRN")
    patient_name: str = Field(..., min_length=1, description="Patient name")
    patient_sex: Optional[str] = Field(None, description="Patient sex (L/P)")
    patient_birthdate: Optional[str] = Field(None, description="Patient birthdate")
    patient_address: Optional[str] = Field(None, description="Patient address")
    patient_phone: Optional[str] = Field(None, description="Patient phone")
    kd_jenis_prw: str = Field(..., min_length=1, description="Khanza procedure code")
    nm_perawatan: str = Field(..., min_length=1, description="Procedure name")
    kd_dokter: Optional[str] = Field(None, description="Referring doctor code")
    nm_dokter: Optional[str] = Field(None, description="Referring doctor name")
    tgl_permintaan: str = Field(..., description="Request date (YYYY-MM-DD)")
    jam_permintaan: Optional[str] = Field(None, description="Request time (HH:MM:SS)")
    diagnosa_klinis: Optional[str] = Field(None, description="Clinical diagnosis")
    informasi_tambahan: Optional[str] = Field(None, description="Additional info")
    update_patient_if_different: bool = Field(default=False, description="Update patient if data differs")
    raw_data: Optional[dict] = Field(None, description="Original raw data from Khanza")

class ImportOrderResponse(BaseModel):
    """Import order response"""
    success: bool
    noorder: str
    worklist_item_id: Optional[str]
    patient_created: bool
    patient_updated: bool
    errors: Optional[List[str]]
    warnings: Optional[List[str]]

class ImportHistoryResponse(BaseModel):
    """Import history response"""
    id: str
    noorder: str
    no_rawat: Optional[str]
    no_rkm_medis: Optional[str]
    patient_name: Optional[str]
    procedure_name: Optional[str]
    import_status: str
    worklist_item_id: Optional[str]
    patient_created: bool
    patient_updated: bool
    error_message: Optional[str]
    warnings: Optional[List[str]]
    imported_by: Optional[str]
    imported_at: Optional[str]

    class Config:
        from_attributes = True


class ImportHistoryCreate(BaseModel):
    """Create import history request"""
    noorder: str = Field(..., min_length=1)
    no_rawat: Optional[str] = None
    no_rkm_medis: Optional[str] = None
    patient_name: Optional[str] = None
    procedure_name: Optional[str] = None
    import_status: str = Field(..., pattern="^(success|failed|partial)$")
    worklist_item_id: Optional[str] = None
    patient_created: bool = False
    patient_updated: bool = False
    error_message: Optional[str] = None
    warnings: Optional[List[str]] = None
    raw_data: Optional[dict] = None


# ============================================================================
# Configuration Endpoints
# ============================================================================

@router.get("/config", response_model=dict)
async def get_config(db: Session = Depends(get_db)):
    """Get active Khanza API configuration"""
    try:
        config = db.query(KhanzaConfig).filter(KhanzaConfig.is_active == True).first()
        if not config:
            return {"config": None, "message": "No active configuration found"}
        return {"config": config.to_dict()}
    except Exception as e:
        logger.error(f"Error getting Khanza config: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/config", response_model=dict, status_code=201)
async def create_config(
    data: KhanzaConfigCreate,
    db: Session = Depends(get_db)
):
    """Create or update Khanza API configuration"""
    try:
        # Deactivate existing configs
        db.query(KhanzaConfig).update({KhanzaConfig.is_active: False})
        
        # Create new config
        config = KhanzaConfig(
            base_url=data.base_url,
            api_key=data.api_key,
            timeout_ms=data.timeout_ms,
            is_active=True
        )
        db.add(config)
        db.commit()
        db.refresh(config)
        
        logger.info(f"Created Khanza config: {config.id}")
        return {"config": config.to_dict(), "message": "Configuration saved successfully"}
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating Khanza config: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/config/{config_id}", response_model=dict)
async def update_config(
    config_id: str,
    data: KhanzaConfigUpdate,
    db: Session = Depends(get_db)
):
    """Update Khanza API configuration"""
    try:
        config = db.query(KhanzaConfig).filter(KhanzaConfig.id == config_id).first()
        if not config:
            raise HTTPException(status_code=404, detail="Configuration not found")
        
        update_data = data.dict(exclude_unset=True)
        for key, value in update_data.items():
            setattr(config, key, value)
        
        db.commit()
        db.refresh(config)
        
        logger.info(f"Updated Khanza config: {config.id}")
        return {"config": config.to_dict(), "message": "Configuration updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating Khanza config: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Procedure Mapping Endpoints
# ============================================================================

@router.get("/mappings/procedures", response_model=dict)
async def list_procedure_mappings(
    search: Optional[str] = Query(None, description="Search by code or name"),
    modality: Optional[str] = Query(None, description="Filter by modality"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    limit: int = Query(50, ge=1, le=500, description="Maximum results"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    db: Session = Depends(get_db)
):
    """List procedure mappings with filters"""
    try:
        query = db.query(KhanzaProcedureMapping)
        
        if search:
            search_filter = or_(
                KhanzaProcedureMapping.khanza_code.ilike(f"%{search}%"),
                KhanzaProcedureMapping.khanza_name.ilike(f"%{search}%"),
                KhanzaProcedureMapping.pacs_code.ilike(f"%{search}%"),
                KhanzaProcedureMapping.pacs_name.ilike(f"%{search}%")
            )
            query = query.filter(search_filter)
        
        if modality:
            query = query.filter(KhanzaProcedureMapping.modality == modality)
        
        if is_active is not None:
            query = query.filter(KhanzaProcedureMapping.is_active == is_active)
        
        total = query.count()
        mappings = query.order_by(KhanzaProcedureMapping.khanza_code).offset(offset).limit(limit).all()
        
        return {
            "items": [m.to_dict() for m in mappings],
            "total": total,
            "limit": limit,
            "offset": offset
        }
    except Exception as e:
        logger.error(f"Error listing procedure mappings: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/mappings/procedures/unmapped", response_model=dict)
async def list_unmapped_procedures(
    search: Optional[str] = Query(None, description="Search by code or name"),
    limit: int = Query(50, ge=1, le=500, description="Maximum results"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    db: Session = Depends(get_db)
):
    """List unmapped procedures captured from requests"""
    try:
        query = db.query(KhanzaUnmappedProcedure).filter(
            KhanzaUnmappedProcedure.is_active == True
        )
        
        if search:
            search_filter = or_(
                KhanzaUnmappedProcedure.khanza_code.ilike(f"%{search}%"),
                KhanzaUnmappedProcedure.khanza_name.ilike(f"%{search}%")
            )
            query = query.filter(search_filter)
        
        total = query.count()
        unmapped = query.order_by(KhanzaUnmappedProcedure.last_seen_at.desc()).offset(offset).limit(limit).all()
        
        return {
            "items": [u.to_dict() for u in unmapped],
            "total": total,
            "limit": limit,
            "offset": offset
        }
    except Exception as e:
        logger.error(f"Error listing unmapped procedures: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/mappings/procedures/unmapped/{unmapped_id}", response_model=dict)
async def delete_unmapped_procedure(
    unmapped_id: str,
    db: Session = Depends(get_db)
):
    """Delete (soft delete) unmapped procedure"""
    try:
        unmapped = db.query(KhanzaUnmappedProcedure).filter(
            KhanzaUnmappedProcedure.id == unmapped_id
        ).first()
        
        if not unmapped:
            raise HTTPException(status_code=404, detail="Unmapped procedure not found")
        
        unmapped.is_active = False
        db.commit()
        
        logger.info(f"Soft deleted unmapped procedure: {unmapped.khanza_code}")
        return {"message": "Unmapped procedure deleted", "id": unmapped_id}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting unmapped procedure: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/mappings/procedures/{mapping_id}", response_model=dict)
async def get_procedure_mapping(
    mapping_id: str,
    db: Session = Depends(get_db)
):
    """Get procedure mapping by ID"""
    try:
        mapping = db.query(KhanzaProcedureMapping).filter(
            KhanzaProcedureMapping.id == mapping_id
        ).first()
        if not mapping:
            raise HTTPException(status_code=404, detail="Procedure mapping not found")
        return mapping.to_dict()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting procedure mapping: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/mappings/procedures/by-code/{khanza_code}", response_model=dict)
async def get_procedure_mapping_by_code(
    khanza_code: str,
    khanza_name: Optional[str] = Query(None, description="Khanza procedure name for tracking"),
    db: Session = Depends(get_db)
):
    """Get procedure mapping by Khanza code"""
    logger.info(f"DEBUG: Searching for procedure code: '{khanza_code}'")
    try:
        # 1. Try Legacy Table
        mapping = db.query(KhanzaProcedureMapping).filter(
            and_(
                KhanzaProcedureMapping.khanza_code == khanza_code,
                KhanzaProcedureMapping.is_active == True
            )
        ).first()
        
        if mapping:
            return mapping.to_dict()

        # 2. Try Unified Table (Simplified logic to match diagnosis script)
        # First, find the mapping by code
        unified_mapping = db.query(UnifiedProcedureMapping).filter(
            and_(
                UnifiedProcedureMapping.external_code == khanza_code,
                UnifiedProcedureMapping.is_active == True
            )
        ).first()

        if unified_mapping:
            # Check the external system
            system = db.query(ExternalSystem).filter(
                ExternalSystem.id == unified_mapping.external_system_id
            ).first()
            
            if system and system.is_active and (
                system.provider == 'khanza' or system.type == 'SIMRS'
            ):
                # Convert to legacy format expected by frontend
                return {
                    'id': str(unified_mapping.id),
                    'khanza_code': unified_mapping.external_code,
                    'khanza_name': unified_mapping.external_name,
                    'pacs_code': unified_mapping.pacs_code,
                    'pacs_name': unified_mapping.pacs_name,
                    'modality': unified_mapping.modality,
                    'description': unified_mapping.description,
                    'is_active': unified_mapping.is_active,
                    'created_at': unified_mapping.created_at.isoformat() if unified_mapping.created_at else None,
                    'updated_at': unified_mapping.updated_at.isoformat() if unified_mapping.updated_at else None,
                    'created_by': unified_mapping.created_by,
                    'updated_by': unified_mapping.updated_by,
                    'is_migrated': True
                }

        # 3. Not found - Record as unmapped

        # Try to fetch name from Khanza API if not provided
        if not khanza_name:
            try:
                khanza_api_url = os.getenv("KHANZA_API_URL")
                khanza_api_key = os.getenv("KHANZA_API_KEY")
                
                if khanza_api_url and khanza_api_key:
                    logger.info(f"Fetching procedure name from Khanza API: {khanza_api_url}/api/prosedur/{khanza_code}")
                    async with httpx.AsyncClient() as client:
                        resp = await client.get(
                            f"{khanza_api_url}/api/prosedur/{khanza_code}",
                            headers={"X-API-Key": khanza_api_key},
                            timeout=5.0
                        )
                        if resp.status_code == 200:
                            data = resp.json()
                            if "data" in data and "nm_perawatan" in data["data"]:
                                khanza_name = data["data"]["nm_perawatan"]
                                logger.info(f"Fetched name from Khanza API: {khanza_name}")
            except Exception as e:
                logger.warning(f"Failed to fetch name from Khanza API: {e}")

        try:
            unmapped = db.query(KhanzaUnmappedProcedure).filter(
                KhanzaUnmappedProcedure.khanza_code == khanza_code
            ).first()
            
            if unmapped:
                unmapped.occurrence_count += 1
                unmapped.last_seen_at = func.now()
                # Reactivate if it was deleted
                unmapped.is_active = True
                if khanza_name and not unmapped.khanza_name:
                    unmapped.khanza_name = khanza_name
            else:
                unmapped = KhanzaUnmappedProcedure(
                    khanza_code=khanza_code,
                    khanza_name=khanza_name,
                    is_active=True
                )
                db.add(unmapped)
            
            db.commit()
            logger.info(f"Recorded unmapped procedure: {khanza_code}")
        except Exception as save_err:
            db.rollback()
            logger.error(f"Error saving unmapped procedure: {str(save_err)}")

        raise HTTPException(
            status_code=404, 
            detail=f"Procedure mapping not found for code: {khanza_code}"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting procedure mapping by code: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/mappings/procedures", response_model=dict, status_code=201)
async def create_procedure_mapping(
    data: ProcedureMappingCreate,
    request: Request,
    db: Session = Depends(get_db)
):
    """Create new procedure mapping"""
    try:
        # Check for duplicate khanza_code
        existing = db.query(KhanzaProcedureMapping).filter(
            KhanzaProcedureMapping.khanza_code == data.khanza_code
        ).first()
        if existing:
            raise HTTPException(
                status_code=400, 
                detail=f"Procedure mapping already exists for Khanza code: {data.khanza_code}"
            )
        
        # Get user from request if available
        created_by = getattr(request.state, 'user_id', None) or 'system'
        
        mapping = KhanzaProcedureMapping(
            khanza_code=data.khanza_code,
            khanza_name=data.khanza_name,
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
        
        logger.info(f"Created procedure mapping: {mapping.khanza_code} -> {mapping.pacs_code}")
        return {"mapping": mapping.to_dict(), "message": "Procedure mapping created successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating procedure mapping: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/mappings/procedures/{mapping_id}", response_model=dict)
async def update_procedure_mapping(
    mapping_id: str,
    data: ProcedureMappingUpdate,
    request: Request,
    db: Session = Depends(get_db)
):
    """Update procedure mapping"""
    try:
        mapping = db.query(KhanzaProcedureMapping).filter(
            KhanzaProcedureMapping.id == mapping_id
        ).first()
        if not mapping:
            raise HTTPException(status_code=404, detail="Procedure mapping not found")
        
        # Get user from request if available
        updated_by = getattr(request.state, 'user_id', None) or 'system'
        
        update_data = data.dict(exclude_unset=True)
        update_data['updated_by'] = updated_by
        
        for key, value in update_data.items():
            setattr(mapping, key, value)
        
        db.commit()
        db.refresh(mapping)
        
        logger.info(f"Updated procedure mapping: {mapping.id}")
        return {"mapping": mapping.to_dict(), "message": "Procedure mapping updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating procedure mapping: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/mappings/procedures/{mapping_id}", response_model=dict)
async def delete_procedure_mapping(
    mapping_id: str,
    hard_delete: bool = Query(False, description="Permanently delete instead of soft delete"),
    db: Session = Depends(get_db)
):
    """Delete procedure mapping (soft delete by default)"""
    try:
        mapping = db.query(KhanzaProcedureMapping).filter(
            KhanzaProcedureMapping.id == mapping_id
        ).first()
        if not mapping:
            raise HTTPException(status_code=404, detail="Procedure mapping not found")
        
        if hard_delete:
            db.delete(mapping)
            message = "Procedure mapping permanently deleted"
        else:
            mapping.is_active = False
            message = "Procedure mapping deactivated"
        
        db.commit()
        
        logger.info(f"Deleted procedure mapping: {mapping_id} (hard={hard_delete})")
        return {"message": message, "id": mapping_id}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting procedure mapping: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Doctor Mapping Endpoints
# ============================================================================

@router.get("/mappings/doctors", response_model=dict)
async def list_doctor_mappings(
    search: Optional[str] = Query(None, description="Search by code or name"),
    auto_created: Optional[bool] = Query(None, description="Filter by auto-created status"),
    limit: int = Query(50, ge=1, le=500, description="Maximum results"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    db: Session = Depends(get_db)
):
    """List doctor mappings with filters"""
    try:
        query = db.query(KhanzaDoctorMapping)
        
        if search:
            search_filter = or_(
                KhanzaDoctorMapping.khanza_code.ilike(f"%{search}%"),
                KhanzaDoctorMapping.khanza_name.ilike(f"%{search}%")
            )
            query = query.filter(search_filter)
        
        if auto_created is not None:
            query = query.filter(KhanzaDoctorMapping.auto_created == auto_created)
        
        total = query.count()
        mappings = query.order_by(KhanzaDoctorMapping.khanza_name).offset(offset).limit(limit).all()
        
        return {
            "items": [m.to_dict() for m in mappings],
            "total": total,
            "limit": limit,
            "offset": offset
        }
    except Exception as e:
        logger.error(f"Error listing doctor mappings: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/mappings/doctors/{mapping_id}", response_model=dict)
async def get_doctor_mapping(
    mapping_id: str,
    db: Session = Depends(get_db)
):
    """Get doctor mapping by ID"""
    try:
        mapping = db.query(KhanzaDoctorMapping).filter(
            KhanzaDoctorMapping.id == mapping_id
        ).first()
        if not mapping:
            raise HTTPException(status_code=404, detail="Doctor mapping not found")
        return mapping.to_dict()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting doctor mapping: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/mappings/doctors/by-code/{khanza_code}", response_model=dict)
async def get_doctor_mapping_by_code(
    khanza_code: str,
    db: Session = Depends(get_db)
):
    """Get doctor mapping by Khanza code"""
    try:
        mapping = db.query(KhanzaDoctorMapping).filter(
            KhanzaDoctorMapping.khanza_code == khanza_code
        ).first()
        if not mapping:
            raise HTTPException(
                status_code=404, 
                detail=f"Doctor mapping not found for code: {khanza_code}"
            )
        return mapping.to_dict()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting doctor mapping by code: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/mappings/doctors", response_model=dict, status_code=201)
async def create_doctor_mapping(
    data: DoctorMappingCreate,
    db: Session = Depends(get_db)
):
    """Create new doctor mapping"""
    try:
        # Check for duplicate khanza_code
        existing = db.query(KhanzaDoctorMapping).filter(
            KhanzaDoctorMapping.khanza_code == data.khanza_code
        ).first()
        if existing:
            raise HTTPException(
                status_code=400, 
                detail=f"Doctor mapping already exists for Khanza code: {data.khanza_code}"
            )
        
        mapping = KhanzaDoctorMapping(
            khanza_code=data.khanza_code,
            khanza_name=data.khanza_name,
            pacs_doctor_id=uuid.UUID(data.pacs_doctor_id) if data.pacs_doctor_id else None,
            auto_created=False
        )
        db.add(mapping)
        db.commit()
        db.refresh(mapping)
        
        logger.info(f"Created doctor mapping: {mapping.khanza_code} -> {mapping.pacs_doctor_id}")
        return {"mapping": mapping.to_dict(), "message": "Doctor mapping created successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating doctor mapping: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/mappings/doctors/{mapping_id}", response_model=dict)
async def update_doctor_mapping(
    mapping_id: str,
    data: DoctorMappingUpdate,
    db: Session = Depends(get_db)
):
    """Update doctor mapping"""
    try:
        mapping = db.query(KhanzaDoctorMapping).filter(
            KhanzaDoctorMapping.id == mapping_id
        ).first()
        if not mapping:
            raise HTTPException(status_code=404, detail="Doctor mapping not found")
        
        if data.khanza_name is not None:
            mapping.khanza_name = data.khanza_name
        if data.pacs_doctor_id is not None:
            mapping.pacs_doctor_id = uuid.UUID(data.pacs_doctor_id) if data.pacs_doctor_id else None
        
        db.commit()
        db.refresh(mapping)
        
        logger.info(f"Updated doctor mapping: {mapping.id}")
        return {"mapping": mapping.to_dict(), "message": "Doctor mapping updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating doctor mapping: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/mappings/doctors/{mapping_id}", response_model=dict)
async def delete_doctor_mapping(
    mapping_id: str,
    db: Session = Depends(get_db)
):
    """Delete doctor mapping"""
    try:
        mapping = db.query(KhanzaDoctorMapping).filter(
            KhanzaDoctorMapping.id == mapping_id
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
# Import History Endpoints
# ============================================================================

@router.get("/import-history", response_model=dict)
async def list_import_history(
    search: Optional[str] = Query(None, description="Search by order number or patient name"),
    import_status: Optional[str] = Query(None, description="Filter by status (success, failed, partial)"),
    date_from: Optional[date] = Query(None, description="Filter from date"),
    date_to: Optional[date] = Query(None, description="Filter to date"),
    limit: int = Query(50, ge=1, le=500, description="Maximum results"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    db: Session = Depends(get_db)
):
    """List import history with filters"""
    try:
        query = db.query(KhanzaImportHistory)
        
        if search:
            search_filter = or_(
                KhanzaImportHistory.noorder.ilike(f"%{search}%"),
                KhanzaImportHistory.patient_name.ilike(f"%{search}%"),
                KhanzaImportHistory.no_rkm_medis.ilike(f"%{search}%")
            )
            query = query.filter(search_filter)
        
        if import_status:
            query = query.filter(KhanzaImportHistory.import_status == import_status)
        
        if date_from:
            query = query.filter(KhanzaImportHistory.imported_at >= datetime.combine(date_from, datetime.min.time()))
        
        if date_to:
            query = query.filter(KhanzaImportHistory.imported_at <= datetime.combine(date_to, datetime.max.time()))
        
        total = query.count()
        history = query.order_by(KhanzaImportHistory.imported_at.desc()).offset(offset).limit(limit).all()
        
        return {
            "items": [h.to_dict() for h in history],
            "total": total,
            "limit": limit,
            "offset": offset
        }
    except Exception as e:
        logger.error(f"Error listing import history: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/import-history/{history_id}", response_model=dict)
async def get_import_history_detail(
    history_id: str,
    db: Session = Depends(get_db)
):
    """Get import history detail by ID"""
    try:
        history = db.query(KhanzaImportHistory).filter(
            KhanzaImportHistory.id == history_id
        ).first()
        if not history:
            raise HTTPException(status_code=404, detail="Import history not found")
        return history.to_dict()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting import history: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/import-history/by-order/{noorder}", response_model=dict)
async def get_import_history_by_order(
    noorder: str,
    db: Session = Depends(get_db)
):
    """Get import history by order number"""
    try:
        history = db.query(KhanzaImportHistory).filter(
            KhanzaImportHistory.noorder == noorder
        ).order_by(KhanzaImportHistory.imported_at.desc()).first()
        if not history:
            return {"imported": False, "history": None}
        return {"imported": True, "history": history.to_dict()}
    except Exception as e:
        logger.error(f"Error getting import history by order: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/import-history/check/{noorder}", response_model=dict)
async def check_order_imported(
    noorder: str,
    db: Session = Depends(get_db)
):
    """Check if an order has been imported"""
    try:
        history = db.query(KhanzaImportHistory).filter(
            and_(
                KhanzaImportHistory.noorder == noorder,
                KhanzaImportHistory.import_status == 'success'
            )
        ).first()
        return {
            "noorder": noorder,
            "imported": history is not None,
            "import_id": str(history.id) if history else None,
            "imported_at": history.imported_at.isoformat() if history else None
        }
    except Exception as e:
        logger.error(f"Error checking order import status: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/import-history", response_model=ImportHistoryResponse, status_code=201)
async def create_import_history(
    data: ImportHistoryCreate,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Record import history (audit log)
    Used by frontend to record failed imports or other client-side import events
    """
    try:
        # Get user from request if available
        imported_by = getattr(request.state, 'user_id', None) or 'system'
        
        # Convert worklist_item_id string to UUID if present
        wlid = None
        if data.worklist_item_id:
            try:
                wlid = uuid.UUID(data.worklist_item_id)
                
                # Verify worklist item exists to prevent foreign key violation
                if wlid:
                    worklist_exists = db.query(WorklistItem.id).filter(WorklistItem.id == wlid).first()
                    if not worklist_exists:
                        logger.warning(f"Worklist item {wlid} not found for history record, setting worklist_item_id to None")
                        wlid = None
            except ValueError:
                pass # Ignore invalid UUID
        
        history = KhanzaImportHistory(
            noorder=data.noorder,
            no_rawat=data.no_rawat,
            no_rkm_medis=data.no_rkm_medis,
            patient_name=data.patient_name,
            procedure_name=data.procedure_name,
            import_status=data.import_status,
            worklist_item_id=wlid,
            patient_created=data.patient_created,
            patient_updated=data.patient_updated,
            error_message=data.error_message,
            warnings=data.warnings,
            raw_data=data.raw_data,
            imported_by=imported_by
        )
        
        db.add(history)
        db.commit()
        db.refresh(history)
        
        logger.info(f"Recorded import history for {data.noorder}: {data.import_status}")
        return history.to_dict()
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating import history: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Import Processing Endpoint
# ============================================================================

@router.post("/import", response_model=dict)
async def import_order(
    data: ImportOrderRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Import a radiology order from Khanza to PACS worklist.
    
    This endpoint:
    1. Validates the procedure mapping exists
    2. Creates or updates patient record
    3. Creates worklist entry
    4. Records import history
    """
    errors = []
    warnings = []
    patient_created = False
    patient_updated = False
    worklist_item_id = None
    
    try:
        # Get user from request if available
        imported_by = getattr(request.state, 'user_id', None) or 'system'
        
        # 1. Check if order already imported
        existing_import = db.query(KhanzaImportHistory).filter(
            and_(
                KhanzaImportHistory.noorder == data.noorder,
                KhanzaImportHistory.import_status == 'success'
            )
        ).first()
        
        if existing_import:
            return {
                "success": False,
                "noorder": data.noorder,
                "worklist_item_id": str(existing_import.worklist_item_id) if existing_import.worklist_item_id else None,
                "patient_created": False,
                "patient_updated": False,
                "errors": [f"Order {data.noorder} has already been imported"],
                "warnings": None
            }
        
        # 2. Validate procedure mapping
        procedure_mapping = db.query(KhanzaProcedureMapping).filter(
            and_(
                KhanzaProcedureMapping.khanza_code == data.kd_jenis_prw,
                KhanzaProcedureMapping.is_active == True
            )
        ).first()
        
        if not procedure_mapping:
            error_msg = f"Prosedur {data.nm_perawatan} (kode: {data.kd_jenis_prw}) belum di-mapping ke PACS. Silakan tambahkan mapping di Settings."
            errors.append(error_msg)
            
            # Record failed import
            history = KhanzaImportHistory(
                noorder=data.noorder,
                no_rawat=data.no_rawat,
                no_rkm_medis=data.no_rkm_medis,
                patient_name=data.patient_name,
                procedure_name=data.nm_perawatan,
                import_status='failed',
                error_message=error_msg,
                raw_data=data.raw_data,
                imported_by=imported_by
            )
            db.add(history)
            db.commit()
            
            return {
                "success": False,
                "noorder": data.noorder,
                "worklist_item_id": None,
                "patient_created": False,
                "patient_updated": False,
                "errors": errors,
                "warnings": None
            }
        
        # 3. Handle doctor mapping (auto-create if not exists)
        doctor_name = data.nm_dokter
        if data.kd_dokter:
            doctor_mapping = db.query(KhanzaDoctorMapping).filter(
                KhanzaDoctorMapping.khanza_code == data.kd_dokter
            ).first()
            
            if not doctor_mapping and data.nm_dokter:
                # Auto-create doctor mapping
                doctor_mapping = KhanzaDoctorMapping(
                    khanza_code=data.kd_dokter,
                    khanza_name=data.nm_dokter,
                    auto_created=True
                )
                db.add(doctor_mapping)
                db.flush()
                warnings.append(f"Doctor mapping auto-created for: {data.nm_dokter}")
        
        # 4. Map patient sex (L/P -> M/F)
        patient_gender = None
        if data.patient_sex:
            patient_gender = 'M' if data.patient_sex.upper() == 'L' else 'F' if data.patient_sex.upper() == 'P' else None
        
        # 5. Parse dates
        try:
            scheduled_date = datetime.strptime(data.tgl_permintaan, '%Y-%m-%d').date()
        except ValueError:
            try:
                # Try Indonesian format DD-MM-YYYY
                scheduled_date = datetime.strptime(data.tgl_permintaan, '%d-%m-%Y').date()
            except ValueError:
                scheduled_date = date.today()
                warnings.append(f"Could not parse date {data.tgl_permintaan}, using today's date")
        
        scheduled_time = None
        if data.jam_permintaan:
            try:
                scheduled_time = datetime.strptime(data.jam_permintaan, '%H:%M:%S').time()
            except ValueError:
                try:
                    scheduled_time = datetime.strptime(data.jam_permintaan, '%H:%M').time()
                except ValueError:
                    scheduled_time = datetime.now().time()
                    warnings.append(f"Could not parse time {data.jam_permintaan}, using current time")
        else:
            scheduled_time = datetime.now().time()
        
        # 6. Generate DICOM identifiers
        import uuid as uuid_module
        study_instance_uid = f"1.2.826.0.1.3680043.8.498.{uuid_module.uuid4().int >> 64}"
        accession_number = f"KHZ{data.noorder}"
        sps_id = f"SPS{data.noorder}"
        
        # 7. Create worklist item
        worklist_item = WorklistItem(
            order_id=None,  # External order, no internal order ID
            study_instance_uid=study_instance_uid,
            accession_number=accession_number,
            sps_id=sps_id,
            sps_status='SCHEDULED',
            scheduled_procedure_step_start_date=scheduled_date,
            scheduled_procedure_step_start_time=scheduled_time,
            scheduled_procedure_step_description=procedure_mapping.pacs_name,
            modality=procedure_mapping.modality or 'OT',
            patient_id=data.no_rkm_medis,
            patient_name=data.patient_name,
            patient_birth_date=datetime.strptime(data.patient_birthdate, '%Y-%m-%d').date() if data.patient_birthdate else None,
            patient_gender=patient_gender,
            referring_physician_name=doctor_name,
            requested_procedure_id=procedure_mapping.pacs_code,
            requested_procedure_description=procedure_mapping.pacs_name,
            medical_alerts=data.diagnosa_klinis,
            special_needs=data.informasi_tambahan,
            priority='ROUTINE',
            is_active=True,
            dicom_attributes={
                'khanza_noorder': data.noorder,
                'khanza_no_rawat': data.no_rawat,
                'khanza_kd_jenis_prw': data.kd_jenis_prw,
                'khanza_kd_dokter': data.kd_dokter
            }
        )
        db.add(worklist_item)
        db.flush()
        
        worklist_item_id = str(worklist_item.id)
        
        # 8. Record successful import
        history = KhanzaImportHistory(
            noorder=data.noorder,
            no_rawat=data.no_rawat,
            no_rkm_medis=data.no_rkm_medis,
            patient_name=data.patient_name,
            procedure_name=procedure_mapping.pacs_name,
            import_status='success',
            worklist_item_id=worklist_item.id,
            patient_created=patient_created,
            patient_updated=patient_updated,
            warnings=warnings if warnings else None,
            raw_data=data.raw_data,
            imported_by=imported_by
        )
        db.add(history)
        
        db.commit()
        
        logger.info(f"Successfully imported order {data.noorder} -> worklist {worklist_item_id}")
        
        return {
            "success": True,
            "noorder": data.noorder,
            "worklist_item_id": worklist_item_id,
            "patient_created": patient_created,
            "patient_updated": patient_updated,
            "errors": None,
            "warnings": warnings if warnings else None
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error importing order {data.noorder}: {str(e)}")
        
        # Try to record failed import
        try:
            history = KhanzaImportHistory(
                noorder=data.noorder,
                no_rawat=data.no_rawat,
                no_rkm_medis=data.no_rkm_medis,
                patient_name=data.patient_name,
                procedure_name=data.nm_perawatan,
                import_status='failed',
                error_message=str(e),
                raw_data=data.raw_data,
                imported_by=getattr(request.state, 'user_id', None) or 'system'
            )
            db.add(history)
            db.commit()
        except:
            pass
        
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Batch Import Endpoint
# ============================================================================

@router.post("/import/batch", response_model=dict)
async def import_orders_batch(
    orders: List[ImportOrderRequest],
    request: Request,
    db: Session = Depends(get_db)
):
    """Import multiple orders in batch"""
    results = []
    success_count = 0
    failed_count = 0
    
    for order_data in orders:
        try:
            # Use the single import endpoint logic
            result = await import_order(order_data, request, db)
            results.append(result)
            if result.get('success'):
                success_count += 1
            else:
                failed_count += 1
        except HTTPException as e:
            results.append({
                "success": False,
                "noorder": order_data.noorder,
                "worklist_item_id": None,
                "patient_created": False,
                "patient_updated": False,
                "errors": [str(e.detail)],
                "warnings": None
            })
            failed_count += 1
        except Exception as e:
            results.append({
                "success": False,
                "noorder": order_data.noorder,
                "worklist_item_id": None,
                "patient_created": False,
                "patient_updated": False,
                "errors": [str(e)],
                "warnings": None
            })
            failed_count += 1
    
    return {
        "total": len(orders),
        "success_count": success_count,
        "failed_count": failed_count,
        "results": results
    }


# ============================================================================
# Health Check
# ============================================================================

@router.get("/health")
async def khanza_health():
    """Khanza integration service health check"""
    return {
        "status": "healthy",
        "service": "khanza-integration",
        "timestamp": datetime.now().isoformat()
    }