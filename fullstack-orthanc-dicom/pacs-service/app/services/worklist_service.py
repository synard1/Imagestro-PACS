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
from app.utils.audit_helper import AuditHelper
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
            'items': [item.to_list_dict() for item in items],
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
    
    async def create_worklist_item(self, data: Dict[str, Any], request=None) -> WorklistItem:
        """
        Create new worklist item

        Args:
            data: Worklist item data
            request: Optional FastAPI Request for audit logging

        Returns:
            Created worklist item
        """
        # Generate UIDs if not provided
        if 'study_instance_uid' not in data:
            data['study_instance_uid'] = self._generate_study_uid()

        if 'sps_id' not in data:
            data['sps_id'] = f"SPS-{uuid.uuid4().hex[:12].upper()}"

        # NEW: Generate accession number if missing (Universal Strategy)
        if not data.get('accession_number'):
            try:
                from app.services.accession_helper import get_next_accession
                accession = await get_next_accession(
                    modality=data.get('modality', 'OT'),
                    patient_data=data
                )
                if accession:
                    data['accession_number'] = accession
                    logger.info(f"Generated universal accession number: {accession}")
                else:
                    # Fallback to legacy random generation if API fails
                    data['accession_number'] = f"AN-{uuid.uuid4().hex[:12].upper()}"
                    logger.warning("Accession API failed, fell back to local generation")
            except Exception as e:
                logger.error(f"Error calling accession helper: {e}")
                data['accession_number'] = f"AN-{uuid.uuid4().hex[:12].upper()}"

        # Map API schema fields to database model fields
        model_data = {**data}

        # --- AI SMART TRIAGE START ---
        # If priority is ROUTINE or missing, analyze clinical text to upgrade it
        current_priority = model_data.get('priority', 'ROUTINE')
        if current_priority == 'ROUTINE':
            try:
                from app.services.ai_service import AIService
                
                # Gather text for analysis
                clinical_text = []
                
                # Check procedure description
                proc_desc = model_data.get('procedure_description') or model_data.get('scheduled_procedure_step_description')
                if proc_desc:
                    clinical_text.append(proc_desc)
                
                # Check reason/details
                details = model_data.get('details')
                if details and isinstance(details, dict):
                    reason = details.get('reason')
                    if reason:
                        clinical_text.append(reason)
                
                # Check medical alerts if available
                alerts = model_data.get('medical_alerts')
                if alerts:
                    clinical_text.append(alerts)
                
                if clinical_text:
                    full_text = " ".join(clinical_text)
                    suggested_priority = AIService.analyze_priority(full_text, current_priority)
                    
                    if suggested_priority != current_priority:
                        model_data['priority'] = suggested_priority
                        logger.info(f"AI Smart Triage: Upgraded priority from {current_priority} to {suggested_priority} for patient {model_data.get('patient_name')}")
                        
            except ImportError:
                logger.warning("AIService not found, skipping smart triage")
            except Exception as e:
                logger.error(f"Error during AI Smart Triage: {e}")
        # --- AI SMART TRIAGE END ---

        # Map scheduled_date -> scheduled_procedure_step_start_date
        if 'scheduled_date' in model_data:
            model_data['scheduled_procedure_step_start_date'] = model_data.pop('scheduled_date')

        # Map scheduled_time -> scheduled_procedure_step_start_time
        if 'scheduled_time' in model_data:
            model_data['scheduled_procedure_step_start_time'] = model_data.pop('scheduled_time')

        # Map ae_title -> scheduled_station_ae_title
        if 'ae_title' in model_data:
            model_data['scheduled_station_ae_title'] = model_data.pop('ae_title')

        # Map procedure_description -> scheduled_procedure_step_description
        if 'procedure_description' in model_data:
            model_data['scheduled_procedure_step_description'] = model_data.pop('procedure_description')

        # Remove None/null values to avoid foreign key validation issues
        model_data = {k: v for k, v in model_data.items() if v is not None}

        # Create item with mapped fields
        item = WorklistItem(**model_data)
        self.db.add(item)
        self.db.commit()
        self.db.refresh(item)

        logger.info(f"Created worklist item: {item.id}")

        # AUDIT LOG: Worklist created
        try:
            await AuditHelper.log_worklist_created(
                db=self.db,
                worklist_id=str(item.id),
                request=request,
                details={
                    'accession_number': item.accession_number,
                    'sps_id': item.sps_id,
                    'modality': item.modality,
                    'scheduled_date': item.scheduled_procedure_step_start_date.isoformat() if item.scheduled_procedure_step_start_date else None,
                    'procedure_description': item.scheduled_procedure_step_description,
                    'order_id': str(item.order_id) if item.order_id else None
                },
                patient_id=item.patient_id,
                study_instance_uid=item.study_instance_uid
            )
        except Exception as audit_error:
            logger.warning(f"Audit log failed for worklist creation: {audit_error}")

        # Notify scheduling if linked to an order
        try:
            notifier = OrderNotificationService(self.db)
            notifier.notify_order_scheduled(
                order_id=str(item.order_id) if item.order_id else None,
                context={
                    'accession_number': item.accession_number,
                    'patient_id': item.patient_id,
                    'patient_name': item.patient_name,
                    'procedure_name': item.scheduled_procedure_step_description,
                    'modality': item.modality,
                    'scheduled_date': item.scheduled_procedure_step_start_date,
                    'scheduled_time': item.scheduled_procedure_step_start_time,
                    'order_status': item.sps_status
                }
            )
        except Exception as notify_error:
            logger.warning(f"Worklist scheduled notification failed: {notify_error}")

        return item
    
    async def update_worklist_item(
        self,
        item_id: str,
        data: Dict[str, Any],
        changed_by: Optional[str] = None,
        request=None
    ) -> WorklistItem:
        """
        Update worklist item

        Args:
            item_id: Worklist item ID
            data: Update data
            changed_by: User making the change
            request: Optional FastAPI Request for audit logging

        Returns:
            Updated worklist item
        """
        item = self.get_worklist_item(item_id)
        if not item:
            raise ValueError(f"Worklist item not found: {item_id}")

        # Track status change
        old_status = item.sps_status

        # Map API schema fields to database model fields
        model_data = {**data}

        # Map scheduled_date -> scheduled_procedure_step_start_date
        if 'scheduled_date' in model_data:
            model_data['scheduled_procedure_step_start_date'] = model_data.pop('scheduled_date')

        # Map scheduled_time -> scheduled_procedure_step_start_time
        if 'scheduled_time' in model_data:
            model_data['scheduled_procedure_step_start_time'] = model_data.pop('scheduled_time')

        # Map ae_title -> scheduled_station_ae_title
        if 'ae_title' in model_data:
            model_data['scheduled_station_ae_title'] = model_data.pop('ae_title')

        # Map procedure_description -> scheduled_procedure_step_description
        if 'procedure_description' in model_data:
            model_data['scheduled_procedure_step_description'] = model_data.pop('procedure_description')

        # Update fields
        for key, value in model_data.items():
            if hasattr(item, key):
                setattr(item, key, value)

        self.db.commit()
        self.db.refresh(item)

        # Log status change
        if 'sps_status' in data and data['sps_status'] != old_status:
            await self._log_status_change(
                item,
                old_status,
                data['sps_status'],
                changed_by,
                request=request
            )

        # AUDIT LOG: Worklist updated
        try:
            await AuditHelper.log_worklist_updated(
                db=self.db,
                worklist_id=str(item.id),
                request=request,
                details={
                    'updated_fields': list(data.keys()),
                    'accession_number': item.accession_number,
                    'modality': item.modality,
                    'sps_status': item.sps_status,
                    'changed_by': changed_by
                },
                patient_id=item.patient_id,
                study_instance_uid=item.study_instance_uid
            )
        except Exception as audit_error:
            logger.warning(f"Audit log failed for worklist update: {audit_error}")

        logger.info(f"Updated worklist item: {item_id}")
        return item
    
    async def update_sps_status(
        self,
        item_id: str,
        new_status: str,
        changed_by: Optional[str] = None,
        reason: Optional[str] = None,
        request=None
    ) -> WorklistItem:
        """
        Update SPS status

        Args:
            item_id: Worklist item ID
            new_status: New SPS status
            changed_by: User making the change
            reason: Reason for change
            request: Optional FastAPI Request for audit logging

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

        # Log change (includes audit logging)
        await self._log_status_change(item, old_status, new_status, changed_by, reason, request=request)

        # Notify completion when worklist is finished
        if new_status == 'COMPLETED':
            # NEW: Trigger ImagingStudy submission to SATUSEHAT
            try:
                from app.services.fhir.imaging_study_service import ImagingStudyService
                from app.models.study import Study
                from app.models.dicom_file import DicomFile
                
                # Find associated study and its instances
                study = self.db.query(Study).filter(Study.accession_number == item.accession_number).first()
                if study:
                    instances = self.db.query(DicomFile).filter(DicomFile.study_instance_uid == study.study_instance_uid).all()
                    if instances:
                        logger.info(f"Triggering auto-submission for ImagingStudy: {study.study_instance_uid}")
                        fhir_resource = ImagingStudyService.create_fhir_resource(study, instances)
                        # Fire and forget or await? Better fire and forget for UI responsiveness
                        # For now we await to ensure it works, but in production we might use a task queue
                        await ImagingStudyService.submit_to_satusehat(fhir_resource)
            except Exception as ss_error:
                logger.warning(f"Auto-submission for ImagingStudy failed: {ss_error}")

            if item.order_id:
                try:
                    notifier = OrderNotificationService(self.db)
                    notifier.notify_order_completed(
                        order_id=str(item.order_id),
                        context={
                            'accession_number': item.accession_number,
                            'patient_id': item.patient_id,
                            'patient_name': item.patient_name,
                            'procedure_name': item.scheduled_procedure_step_description,
                            'modality': item.modality,
                            'order_status': item.sps_status,
                            'scheduled_date': item.scheduled_procedure_step_start_date,
                            'scheduled_time': item.scheduled_procedure_step_start_time,
                        }
                    )
                except Exception as notify_error:
                    logger.warning(f"Order completion notification failed: {notify_error}")

        logger.info(f"Updated SPS status: {item_id} {old_status} -> {new_status}")
        return item
    
    async def deactivate_worklist_item(self, item_id: str, request=None) -> WorklistItem:
        """Deactivate worklist item"""
        item = self.get_worklist_item(item_id)
        if not item:
            raise ValueError(f"Worklist item not found: {item_id}")

        item.is_active = False
        self.db.commit()
        self.db.refresh(item)

        logger.info(f"Deactivated worklist item: {item_id}")

        # AUDIT LOG: Worklist deactivated (soft delete)
        try:
            await AuditHelper.log_worklist_deleted(
                db=self.db,
                worklist_id=str(item.id),
                request=request,
                details={
                    'accession_number': item.accession_number,
                    'sps_id': item.sps_id,
                    'modality': item.modality,
                    'sps_status': item.sps_status,
                    'action': 'SOFT_DELETE'
                }
            )
        except Exception as audit_error:
            logger.warning(f"Audit log failed for worklist deactivation: {audit_error}")

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
    
    async def _log_status_change(
        self,
        item: WorklistItem,
        old_status: str,
        new_status: str,
        changed_by: Optional[str] = None,
        reason: Optional[str] = None,
        request=None
    ):
        """Log status change to history and audit log"""
        # Log to worklist_history table (existing functionality)
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

        # AUDIT LOG: Log to pacs_audit_log (new functionality)
        try:
            await AuditHelper.log_worklist_status_changed(
                db=self.db,
                worklist_id=str(item.id),
                old_status=old_status,
                new_status=new_status,
                request=request,
                details={
                    'change_reason': reason,
                    'changed_by': changed_by,
                    'accession_number': item.accession_number,
                    'sps_id': item.sps_id,
                    'modality': item.modality,
                    'scheduled_date': item.scheduled_procedure_step_start_date.isoformat() if item.scheduled_procedure_step_start_date else None
                },
                patient_id=item.patient_id,
                study_instance_uid=item.study_instance_uid
            )
        except Exception as audit_error:
            logger.warning(f"Audit log failed for status change: {audit_error}")


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
        # Note: Notification is sent when worklist item is created, not here to avoid duplicates
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
