"""
Worklist Service
Business logic for worklist management
"""
from typing import Optional, List, Dict, Any
from datetime import datetime, date, time
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func
import uuid

from app.models.worklist import WorklistItem, WorklistHistory, ScheduleSlot
from app.utils.logger import get_logger
from app.services.order_notification_service import OrderNotificationService

logger = get_logger(__name__)


class WorklistService:
    """Service for managing worklist items"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def get_worklist(
        self,
        modality: Optional[str] = None,
        ae_title: Optional[str] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        sps_status: Optional[str] = None,
        patient_name: Optional[str] = None,
        patient_id: Optional[str] = None,
        is_active: bool = True,
        limit: int = 100,
        offset: int = 0
    ) -> Dict[str, Any]:
        """
        Query worklist items with filters
        
        Args:
            modality: Filter by modality type
            ae_title: Filter by AE title
            date_from: Filter from date
            date_to: Filter to date
            sps_status: Filter by SPS status
            patient_name: Filter by patient name (partial match)
            patient_id: Filter by patient ID
            is_active: Filter active items only
            limit: Maximum results
            offset: Pagination offset
            
        Returns:
            Dictionary with items and total count
        """
        query = self.db.query(WorklistItem)
        
        # Apply filters
        if is_active:
            query = query.filter(WorklistItem.is_active == True)
        
        if modality:
            query = query.filter(WorklistItem.modality == modality)
        
        if ae_title:
            query = query.filter(WorklistItem.scheduled_station_ae_title == ae_title)
        
        if date_from:
            query = query.filter(WorklistItem.scheduled_procedure_step_start_date >= date_from)
        
        if date_to:
            query = query.filter(WorklistItem.scheduled_procedure_step_start_date <= date_to)
        
        if sps_status:
            query = query.filter(WorklistItem.sps_status == sps_status)
        
        if patient_name:
            query = query.filter(WorklistItem.patient_name.ilike(f'%{patient_name}%'))
        
        if patient_id:
            query = query.filter(WorklistItem.patient_id == patient_id)
        
        # Get total count
        total = query.count()
        
        # Apply pagination and ordering
        items = query.order_by(
            WorklistItem.scheduled_procedure_step_start_date,
            WorklistItem.scheduled_procedure_step_start_time
        ).limit(limit).offset(offset).all()
        
        return {
            'items': [item.to_dict() for item in items],
            'total': total,
            'limit': limit,
            'offset': offset
        }
    
    def get_worklist_item(self, item_id: str) -> Optional[WorklistItem]:
        """Get worklist item by ID"""
        return self.db.query(WorklistItem).filter(
            WorklistItem.id == uuid.UUID(item_id)
        ).first()
    
    def get_worklist_item_by_order(self, order_id: str) -> Optional[WorklistItem]:
        """Get worklist item by order ID"""
        return self.db.query(WorklistItem).filter(
            WorklistItem.order_id == uuid.UUID(order_id),
            WorklistItem.is_active == True
        ).first()
    
    def create_worklist_item(self, data: Dict[str, Any]) -> WorklistItem:
        """
        Create new worklist item
        
        Args:
            data: Worklist item data
            
        Returns:
            Created worklist item
        """
        # Generate UIDs if not provided
        if 'study_instance_uid' not in data:
            data['study_instance_uid'] = self._generate_study_uid()
        
        if 'sps_id' not in data:
            data['sps_id'] = f"SPS-{uuid.uuid4().hex[:12].upper()}"
        
        # Create item
        item = WorklistItem(**data)
        self.db.add(item)
        self.db.commit()
        self.db.refresh(item)
        
        logger.info(f"Created worklist item: {item.id}")
        
        # Send notification for new worklist item (which represents a scheduled order)
        try:
            notifier = OrderNotificationService(self.db)
            notifier.notify_order_scheduled(
                order_id=item.order_id,
                context={
                    "order_id": item.order_id,
                    "patient_name": item.patient_name,
                    "patient_id": item.patient_id,
                    "modality": item.modality,
                    "procedure_name": item.procedure_name,
                    "scheduled_date": item.scheduled_start_date,
                    "scheduled_time": item.scheduled_start_time,
                    "sps_status": item.sps_status
                }
            )
        except Exception as e:
            logger.error(f"Failed to send notification for worklist item {item.id}: {e}")
            # Don't fail the worklist creation if notification fails
        
        return item
    
    def update_worklist_item(
        self,
        item_id: str,
        data: Dict[str, Any],
        changed_by: Optional[str] = None
    ) -> WorklistItem:
        """
        Update worklist item
        
        Args:
            item_id: Worklist item ID
            data: Update data
            changed_by: User making the change
            
        Returns:
            Updated worklist item
        """
        item = self.get_worklist_item(item_id)
        if not item:
            raise ValueError(f"Worklist item not found: {item_id}")
        
        # Track status change
        old_status = item.sps_status
        
        # Update fields
        for key, value in data.items():
            if hasattr(item, key):
                setattr(item, key, value)
        
        self.db.commit()
        self.db.refresh(item)
        
        # Log status change
        if 'sps_status' in data and data['sps_status'] != old_status:
            self._log_status_change(
                item,
                old_status,
                data['sps_status'],
                changed_by
            )
        
        logger.info(f"Updated worklist item: {item_id}")
        return item
    
    def update_sps_status(
        self,
        item_id: str,
        new_status: str,
        changed_by: Optional[str] = None,
        reason: Optional[str] = None
    ) -> WorklistItem:
        """
        Update SPS status
        
        Args:
            item_id: Worklist item ID
            new_status: New SPS status
            changed_by: User making the change
            reason: Reason for change
            
        Returns:
            Updated worklist item
        """
        item = self.get_worklist_item(item_id)
        if not item:
            raise ValueError(f"Worklist item not found: {item_id}")
        
        old_status = item.sps_status
        
        # Validate status transition
        if not self._is_valid_status_transition(old_status, new_status):
            raise ValueError(f"Invalid status transition: {old_status} -> {new_status}")
        
        # Update status
        item.sps_status = new_status
        
        # Mark as completed if status is COMPLETED
        if new_status == 'COMPLETED':
            item.completed_at = datetime.now()
        
        self.db.commit()
        self.db.refresh(item)
        
        # Log change
        self._log_status_change(item, old_status, new_status, changed_by, reason)
        
        logger.info(f"Updated SPS status: {item_id} {old_status} -> {new_status}")
        return item
    
    def deactivate_worklist_item(self, item_id: str) -> WorklistItem:
        """Deactivate worklist item"""
        item = self.get_worklist_item(item_id)
        if not item:
            raise ValueError(f"Worklist item not found: {item_id}")
        
        item.is_active = False
        self.db.commit()
        self.db.refresh(item)
        
        logger.info(f"Deactivated worklist item: {item_id}")
        return item
    
    def get_worklist_history(self, item_id: str) -> List[WorklistHistory]:
        """Get history for worklist item"""
        return self.db.query(WorklistHistory).filter(
            WorklistHistory.worklist_item_id == uuid.UUID(item_id)
        ).order_by(WorklistHistory.changed_at.desc()).all()
    
    def get_worklist_summary(
        self,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None
    ) -> List[Dict[str, Any]]:
        """
        Get worklist summary by modality and status
        
        Args:
            date_from: Filter from date
            date_to: Filter to date
            
        Returns:
            List of summary records
        """
        query = self.db.query(
            WorklistItem.modality,
            WorklistItem.scheduled_procedure_step_start_date,
            WorklistItem.sps_status,
            func.count(WorklistItem.id).label('count')
        ).filter(WorklistItem.is_active == True)
        
        if date_from:
            query = query.filter(WorklistItem.scheduled_procedure_step_start_date >= date_from)
        
        if date_to:
            query = query.filter(WorklistItem.scheduled_procedure_step_start_date <= date_to)
        
        results = query.group_by(
            WorklistItem.modality,
            WorklistItem.scheduled_procedure_step_start_date,
            WorklistItem.sps_status
        ).order_by(
            WorklistItem.scheduled_procedure_step_start_date,
            WorklistItem.modality
        ).all()
        
        return [
            {
                'modality': r.modality,
                'date': r.scheduled_procedure_step_start_date.isoformat(),
                'status': r.sps_status,
                'count': r.count
            }
            for r in results
        ]
    
    def _generate_study_uid(self) -> str:
        """Generate Study Instance UID"""
        timestamp = datetime.now().timestamp()
        random_id = uuid.uuid4().hex[:12]
        return f"1.2.840.113619.{int(timestamp)}.{random_id}"
    
    def _is_valid_status_transition(self, old_status: str, new_status: str) -> bool:
        """Validate status transition"""
        valid_transitions = {
            'SCHEDULED': ['ARRIVED', 'STARTED', 'DISCONTINUED'],
            'ARRIVED': ['STARTED', 'DISCONTINUED'],
            'STARTED': ['COMPLETED', 'DISCONTINUED'],
            'COMPLETED': [],
            'DISCONTINUED': []
        }
        
        return new_status in valid_transitions.get(old_status, [])
    
    def _log_status_change(
        self,
        item: WorklistItem,
        old_status: str,
        new_status: str,
        changed_by: Optional[str] = None,
        reason: Optional[str] = None
    ):
        """Log status change to history"""
        history = WorklistHistory(
            worklist_item_id=item.id,
            order_id=item.order_id,
            action='STATUS_CHANGE',
            previous_status=old_status,
            new_status=new_status,
            change_reason=reason,
            changed_by=changed_by
        )
        self.db.add(history)
        self.db.commit()


class ScheduleService:
    """Service for managing schedule slots"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def get_available_slots(
        self,
        modality_id: Optional[str] = None,
        modality_type: Optional[str] = None,
        slot_date: Optional[date] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None
    ) -> List[ScheduleSlot]:
        """
        Get available schedule slots
        
        Args:
            modality_id: Filter by modality ID
            modality_type: Filter by modality type
            slot_date: Filter by specific date
            date_from: Filter from date
            date_to: Filter to date
            
        Returns:
            List of available slots
        """
        query = self.db.query(ScheduleSlot).filter(
            ScheduleSlot.is_available == True,
            ScheduleSlot.is_blocked == False
        )
        
        if modality_id:
            query = query.filter(ScheduleSlot.modality_id == uuid.UUID(modality_id))
        
        if modality_type:
            query = query.filter(ScheduleSlot.modality_type == modality_type)
        
        if slot_date:
            query = query.filter(ScheduleSlot.slot_date == slot_date)
        elif date_from and date_to:
            query = query.filter(
                ScheduleSlot.slot_date >= date_from,
                ScheduleSlot.slot_date <= date_to
            )
        
        return query.order_by(
            ScheduleSlot.slot_date,
            ScheduleSlot.slot_start_time
        ).all()
    
    def get_slot(self, slot_id: str) -> Optional[ScheduleSlot]:
        """Get schedule slot by ID"""
        return self.db.query(ScheduleSlot).filter(
            ScheduleSlot.id == uuid.UUID(slot_id)
        ).first()
    
    def create_slot(self, data: Dict[str, Any]) -> ScheduleSlot:
        """Create new schedule slot"""
        slot = ScheduleSlot(**data)
        self.db.add(slot)
        self.db.commit()
        self.db.refresh(slot)
        
        logger.info(f"Created schedule slot: {slot.id}")
        return slot
    
    def book_slot(self, slot_id: str, order_id: str) -> ScheduleSlot:
        """
        Book a schedule slot
        
        Args:
            slot_id: Slot ID
            order_id: Order ID
            
        Returns:
            Booked slot
        """
        slot = self.get_slot(slot_id)
        if not slot:
            raise ValueError(f"Slot not found: {slot_id}")
        
        if slot.is_full:
            raise ValueError(f"Slot is full: {slot_id}")
        
        if not slot.is_available or slot.is_blocked:
            raise ValueError(f"Slot is not available: {slot_id}")
        
        # Book slot
        slot.current_bookings += 1
        slot.order_id = uuid.UUID(order_id)
        
        # Mark as unavailable if full
        if slot.is_full:
            slot.is_available = False
        
        self.db.commit()
        self.db.refresh(slot)
        
        logger.info(f"Booked slot: {slot_id} for order: {order_id}")
        return slot
    
    def release_slot(self, slot_id: str) -> ScheduleSlot:
        """Release a booked slot"""
        slot = self.get_slot(slot_id)
        if not slot:
            raise ValueError(f"Slot not found: {slot_id}")
        
        if slot.current_bookings > 0:
            slot.current_bookings -= 1
        
        slot.order_id = None
        slot.is_available = True
        
        self.db.commit()
        self.db.refresh(slot)
        
        logger.info(f"Released slot: {slot_id}")
        return slot
    
    def block_slot(self, slot_id: str, reason: str) -> ScheduleSlot:
        """Block a schedule slot"""
        slot = self.get_slot(slot_id)
        if not slot:
            raise ValueError(f"Slot not found: {slot_id}")
        
        slot.is_blocked = True
        slot.is_available = False
        slot.block_reason = reason
        
        self.db.commit()
        self.db.refresh(slot)
        
        logger.info(f"Blocked slot: {slot_id}")
        return slot
    
    def unblock_slot(self, slot_id: str) -> ScheduleSlot:
        """Unblock a schedule slot"""
        slot = self.get_slot(slot_id)
        if not slot:
            raise ValueError(f"Slot not found: {slot_id}")
        
        slot.is_blocked = False
        slot.block_reason = None
        
        # Make available if not full
        if not slot.is_full:
            slot.is_available = True
        
        self.db.commit()
        self.db.refresh(slot)
        
        logger.info(f"Unblocked slot: {slot_id}")
        return slot


def get_worklist_service(db: Session) -> WorklistService:
    """Get worklist service instance"""
    return WorklistService(db)


def get_schedule_service(db: Session) -> ScheduleService:
    """Get schedule service instance"""
    return ScheduleService(db)
