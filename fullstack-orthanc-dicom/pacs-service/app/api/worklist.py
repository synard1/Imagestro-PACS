"""
Worklist API Endpoints
RESTful API for worklist management
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import date, datetime
from pydantic import BaseModel, Field

from app.database import get_db
from app.services.worklist_service import get_worklist_service, get_schedule_service
from app.utils.logger import get_logger
from app.middleware.rbac import require_permission

logger = get_logger(__name__)
router = APIRouter(prefix="/api/worklist", tags=["worklist"])


# ============================================================================
# Pydantic Schemas
# ============================================================================

class WorklistItemListResponse(BaseModel):
    """Worklist item list response (simplified for list view)"""
    id: str
    order_id: Optional[str]
    accession_number: str
    sps_status: str
    scheduled_date: str
    scheduled_time: str
    modality: str
    patient_name: str
    patient_id: str
    procedure_description: Optional[str]
    priority: str

    class Config:
        from_attributes = True


class WorklistItemResponse(BaseModel):
    """Worklist item response (full details)"""
    id: str
    order_id: Optional[str]
    study_instance_uid: str
    accession_number: str
    sps_id: str
    sps_status: str
    scheduled_date: str
    scheduled_time: str
    scheduled_datetime: Optional[str]
    procedure_description: Optional[str]
    modality: str
    ae_title: Optional[str]
    station_name: Optional[str]
    patient_id: str
    patient_name: str
    patient_birth_date: Optional[str]
    patient_gender: Optional[str]
    priority: str
    is_active: bool

    class Config:
        from_attributes = True


class WorklistItemCreate(BaseModel):
    """Create worklist item"""
    order_id: Optional[str]
    accession_number: str
    scheduled_date: date
    scheduled_time: str
    procedure_description: str
    modality: str
    ae_title: Optional[str]
    patient_id: str
    patient_name: str
    patient_birth_date: Optional[date]
    patient_gender: Optional[str]
    priority: str = "ROUTINE"


class WorklistItemUpdate(BaseModel):
    """Update worklist item"""
    scheduled_date: Optional[date]
    scheduled_time: Optional[str]
    procedure_description: Optional[str]
    ae_title: Optional[str]
    priority: Optional[str]
    medical_alerts: Optional[str]
    contrast_allergies: Optional[str]
    special_needs: Optional[str]


class SPSStatusUpdate(BaseModel):
    """Update SPS status"""
    status: str = Field(..., description="New SPS status")
    changed_by: Optional[str] = Field(None, description="User making the change")
    reason: Optional[str] = Field(None, description="Reason for change")


class WorklistHistoryResponse(BaseModel):
    """Worklist history response"""
    id: str
    action: str
    previous_status: Optional[str]
    new_status: Optional[str]
    change_reason: Optional[str]
    changed_by: Optional[str]
    changed_at: str
    
    class Config:
        from_attributes = True


class ScheduleSlotResponse(BaseModel):
    """Schedule slot response"""
    id: str
    modality_id: Optional[str]
    modality_type: str
    slot_date: str
    slot_start_time: str
    slot_end_time: str
    duration_minutes: int
    max_capacity: int
    current_bookings: int
    is_available: bool
    is_blocked: bool
    
    class Config:
        from_attributes = True


class ScheduleSlotCreate(BaseModel):
    """Create schedule slot"""
    modality_id: str
    modality_type: str
    slot_date: date
    slot_start_time: str
    slot_end_time: str
    duration_minutes: int
    max_capacity: int = 1


class BookSlotRequest(BaseModel):
    """Book slot request"""
    order_id: str


class BlockSlotRequest(BaseModel):
    """Block slot request"""
    reason: str


# ============================================================================
# Worklist Endpoints
# ============================================================================

@router.get("/", response_model=dict)
async def get_worklist(
    modality: Optional[str] = Query(None, description="Filter by modality"),
    ae_title: Optional[str] = Query(None, description="Filter by AE title"),
    date_from: Optional[date] = Query(None, description="Filter from date"),
    date_to: Optional[date] = Query(None, description="Filter to date"),
    sps_status: Optional[str] = Query(None, description="Filter by SPS status"),
    patient_name: Optional[str] = Query(None, description="Filter by patient name"),
    patient_id: Optional[str] = Query(None, description="Filter by patient ID"),
    is_active: bool = Query(True, description="Filter active items"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum results"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("worklist:view"))
):
    """
    Get worklist items with filters
    
    Query parameters:
    - modality: Filter by modality type (CT, MRI, etc.)
    - ae_title: Filter by AE title
    - date_from: Filter from date (YYYY-MM-DD)
    - date_to: Filter to date (YYYY-MM-DD)
    - sps_status: Filter by SPS status (SCHEDULED, ARRIVED, etc.)
    - patient_name: Filter by patient name (partial match)
    - patient_id: Filter by patient ID
    - is_active: Filter active items only
    - limit: Maximum number of results
    - offset: Pagination offset
    """
    try:
        service = get_worklist_service(db)
        result = service.get_worklist(
            modality=modality,
            ae_title=ae_title,
            date_from=date_from,
            date_to=date_to,
            sps_status=sps_status,
            patient_name=patient_name,
            patient_id=patient_id,
            is_active=is_active,
            limit=limit,
            offset=offset
        )
        return result
    except Exception as e:
        logger.error(f"Error getting worklist: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/today", response_model=dict)
async def get_today_worklist(
    modality: Optional[str] = Query(None, description="Filter by modality"),
    ae_title: Optional[str] = Query(None, description="Filter by AE title"),
    sps_status: Optional[str] = Query(None, description="Filter by SPS status"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("worklist:view"))
):
    """Get today's worklist"""
    try:
        service = get_worklist_service(db)
        today = date.today()
        result = service.get_worklist(
            modality=modality,
            ae_title=ae_title,
            date_from=today,
            date_to=today,
            sps_status=sps_status,
            is_active=True
        )
        return result
    except Exception as e:
        logger.error(f"Error getting today's worklist: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/summary", response_model=List[dict])
async def get_worklist_summary(
    date_from: Optional[date] = Query(None, description="Filter from date"),
    date_to: Optional[date] = Query(None, description="Filter to date"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("worklist:view"))
):
    """Get worklist summary by modality and status"""
    try:
        service = get_worklist_service(db)
        summary = service.get_worklist_summary(
            date_from=date_from,
            date_to=date_to
        )
        return summary
    except Exception as e:
        logger.error(f"Error getting worklist summary: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{item_id}", response_model=dict)
async def get_worklist_item(
    item_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("worklist:view"))
):
    """Get worklist item by ID"""
    try:
        service = get_worklist_service(db)
        item = service.get_worklist_item(item_id)
        if not item:
            raise HTTPException(status_code=404, detail="Worklist item not found")
        return item.to_dict()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting worklist item: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/order/{order_id}", response_model=dict)
async def get_worklist_by_order(
    order_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("worklist:view"))
):
    """Get worklist item by order ID"""
    try:
        service = get_worklist_service(db)
        item = service.get_worklist_item_by_order(order_id)
        if not item:
            raise HTTPException(status_code=404, detail="Worklist item not found for order")
        return item.to_dict()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting worklist by order: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/", response_model=dict, status_code=201)
async def create_worklist_item(
    data: WorklistItemCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("worklist:manage"))
):
    """Create new worklist item"""
    try:
        service = get_worklist_service(db)
        item = await service.create_worklist_item(data.dict(), request=request)
        return item.to_dict()
    except Exception as e:
        logger.error(f"Error creating worklist item: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{item_id}", response_model=dict)
async def update_worklist_item(
    item_id: str,
    data: WorklistItemUpdate,
    request: Request,
    changed_by: Optional[str] = Query(None, description="User making the change"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("order:update"))
):
    """Update worklist item"""
    try:
        service = get_worklist_service(db)
        item = await service.update_worklist_item(
            item_id,
            data.dict(exclude_unset=True),
            changed_by=changed_by,
            request=request
        )
        return item.to_dict()
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating worklist item: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{item_id}/status", response_model=dict)
async def update_sps_status(
    item_id: str,
    status_update: SPSStatusUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("order:update"))
):
    """Update SPS status"""
    try:
        service = get_worklist_service(db)
        item = await service.update_sps_status(
            item_id,
            status_update.status,
            changed_by=status_update.changed_by,
            reason=status_update.reason,
            request=request
        )
        return item.to_dict()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating SPS status: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{item_id}", response_model=dict)
async def deactivate_worklist_item(
    item_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("worklist:manage"))
):
    """Deactivate worklist item"""
    try:
        service = get_worklist_service(db)
        item = await service.deactivate_worklist_item(item_id, request=request)
        return {"message": "Worklist item deactivated", "id": str(item.id)}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error deactivating worklist item: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{item_id}/history", response_model=List[dict])
async def get_worklist_history(
    item_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("worklist:view"))
):
    """Get worklist item history"""
    try:
        service = get_worklist_service(db)
        history = service.get_worklist_history(item_id)
        return [h.to_dict() for h in history]
    except Exception as e:
        logger.error(f"Error getting worklist history: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Schedule Endpoints
# ============================================================================

@router.get("/schedule/slots", response_model=List[dict])
async def get_available_slots(
    modality_id: Optional[str] = Query(None, description="Filter by modality ID"),
    modality_type: Optional[str] = Query(None, description="Filter by modality type"),
    slot_date: Optional[date] = Query(None, description="Filter by date"),
    date_from: Optional[date] = Query(None, description="Filter from date"),
    date_to: Optional[date] = Query(None, description="Filter to date"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("worklist:view"))
):
    """Get available schedule slots"""
    try:
        service = get_schedule_service(db)
        slots = service.get_available_slots(
            modality_id=modality_id,
            modality_type=modality_type,
            slot_date=slot_date,
            date_from=date_from,
            date_to=date_to
        )
        return [slot.to_dict() for slot in slots]
    except Exception as e:
        logger.error(f"Error getting available slots: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/schedule/slots/{slot_id}", response_model=dict)
async def get_schedule_slot(
    slot_id: str,
    db: Session = Depends(get_db)
):
    """Get schedule slot by ID"""
    try:
        service = get_schedule_service(db)
        slot = service.get_slot(slot_id)
        if not slot:
            raise HTTPException(status_code=404, detail="Schedule slot not found")
        return slot.to_dict()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting schedule slot: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/schedule/slots", response_model=dict, status_code=201)
async def create_schedule_slot(
    data: ScheduleSlotCreate,
    db: Session = Depends(get_db)
):
    """Create new schedule slot"""
    try:
        service = get_schedule_service(db)
        slot = service.create_slot(data.dict())
        return slot.to_dict()
    except Exception as e:
        logger.error(f"Error creating schedule slot: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/schedule/slots/{slot_id}/book", response_model=dict)
async def book_schedule_slot(
    slot_id: str,
    booking: BookSlotRequest,
    db: Session = Depends(get_db)
):
    """Book a schedule slot"""
    try:
        service = get_schedule_service(db)
        slot = service.book_slot(slot_id, booking.order_id)
        return slot.to_dict()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error booking slot: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/schedule/slots/{slot_id}/release", response_model=dict)
async def release_schedule_slot(
    slot_id: str,
    db: Session = Depends(get_db)
):
    """Release a booked slot"""
    try:
        service = get_schedule_service(db)
        slot = service.release_slot(slot_id)
        return slot.to_dict()
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error releasing slot: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/schedule/slots/{slot_id}/block", response_model=dict)
async def block_schedule_slot(
    slot_id: str,
    block_request: BlockSlotRequest,
    db: Session = Depends(get_db)
):
    """Block a schedule slot"""
    try:
        service = get_schedule_service(db)
        slot = service.block_slot(slot_id, block_request.reason)
        return slot.to_dict()
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error blocking slot: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/schedule/slots/{slot_id}/unblock", response_model=dict)
async def unblock_schedule_slot(
    slot_id: str,
    db: Session = Depends(get_db)
):
    """Unblock a schedule slot"""
    try:
        service = get_schedule_service(db)
        slot = service.unblock_slot(slot_id)
        return slot.to_dict()
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error unblocking slot: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Health Check
# ============================================================================

@router.get("/health")
async def worklist_health():
    """Worklist service health check"""
    return {
        "status": "healthy",
        "service": "worklist",
        "timestamp": datetime.now().isoformat()
    }
