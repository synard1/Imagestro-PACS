"""
Worklist Models
SQLAlchemy models for worklist management
"""
from sqlalchemy import Column, String, Integer, Boolean, DateTime, Date, Time, Text, ForeignKey, DECIMAL, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime, date, time
import uuid

from app.database import Base


class WorklistItem(Base):
    """DICOM Modality Worklist Item"""
    __tablename__ = 'worklist_items'
    
    # Primary Key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Foreign Keys
    # Temporarily disabled ForeignKey until Order model is properly defined
    # order_id = Column(UUID(as_uuid=True), ForeignKey('orders.id', ondelete='CASCADE'))
    order_id = Column(UUID(as_uuid=True), nullable=True)
    
    # DICOM Identifiers
    study_instance_uid = Column(String(64), unique=True, nullable=False, index=True)
    accession_number = Column(String(50), nullable=False, index=True)
    sps_id = Column(String(50), unique=True, nullable=False, index=True)
    sps_status = Column(String(20), default='SCHEDULED', index=True)
    
    # Scheduled Procedure Step
    scheduled_procedure_step_start_date = Column(Date, nullable=False, index=True)
    scheduled_procedure_step_start_time = Column(Time, nullable=False)
    scheduled_procedure_step_description = Column(String(255))
    
    # Modality
    modality = Column(String(20), nullable=False, index=True)
    scheduled_station_ae_title = Column(String(50), index=True)
    scheduled_station_name = Column(String(100))
    
    # Patient Demographics (denormalized)
    patient_id = Column(String(64), nullable=False, index=True)
    patient_name = Column(String(255), nullable=False, index=True)
    patient_birth_date = Column(Date)
    patient_gender = Column(String(1))
    patient_weight = Column(DECIMAL(5, 2))
    patient_size = Column(DECIMAL(5, 2))
    
    # Procedure
    requested_procedure_id = Column(String(50))
    requested_procedure_description = Column(String(255))
    requested_procedure_code_sequence = Column(JSONB)
    study_id = Column(String(50))
    study_description = Column(String(255))
    
    # Referring Physician
    referring_physician_name = Column(String(255))
    
    # Additional Info
    admission_id = Column(String(50))
    current_patient_location = Column(String(100))
    patient_state = Column(String(50))
    pregnancy_status = Column(String(20))
    medical_alerts = Column(Text)
    contrast_allergies = Column(Text)
    special_needs = Column(Text)
    
    # Priority
    priority = Column(String(20), default='ROUTINE')
    
    # Metadata
    dicom_attributes = Column(JSONB)
    
    # Status
    is_active = Column(Boolean, default=True, index=True)
    completed_at = Column(DateTime)
    
    # Timestamps
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    
    # Constraints
    __table_args__ = (
        CheckConstraint(
            sps_status.in_(['SCHEDULED', 'ARRIVED', 'STARTED', 'COMPLETED', 'DISCONTINUED']),
            name='chk_sps_status'
        ),
    )
    
    # Relationships
    # order = relationship("Order", back_populates="worklist_items")
    history = relationship("WorklistHistory", back_populates="worklist_item", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<WorklistItem(id={self.id}, patient={self.patient_name}, modality={self.modality}, status={self.sps_status})>"
    
    def to_list_dict(self):
        """Convert to simplified dictionary for list view"""
        return {
            'id': str(self.id),
            'order_id': str(self.order_id) if self.order_id else None,
            'accession_number': self.accession_number,
            'sps_status': self.sps_status,
            'scheduled_date': self.scheduled_procedure_step_start_date.isoformat() if self.scheduled_procedure_step_start_date else None,
            'scheduled_time': self.scheduled_procedure_step_start_time.isoformat() if self.scheduled_procedure_step_start_time else None,
            'modality': self.modality,
            'patient_name': self.patient_name,
            'patient_id': self.patient_id,
            'procedure_description': self.scheduled_procedure_step_description,
            'priority': self.priority
        }

    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': str(self.id),
            'order_id': str(self.order_id) if self.order_id else None,
            'study_instance_uid': self.study_instance_uid,
            'accession_number': self.accession_number,
            'sps_id': self.sps_id,
            'sps_status': self.sps_status,
            'scheduled_date': self.scheduled_procedure_step_start_date.isoformat() if self.scheduled_procedure_step_start_date else None,
            'scheduled_time': self.scheduled_procedure_step_start_time.isoformat() if self.scheduled_procedure_step_start_time else None,
            'scheduled_datetime': f"{self.scheduled_procedure_step_start_date} {self.scheduled_procedure_step_start_time}" if self.scheduled_procedure_step_start_date and self.scheduled_procedure_step_start_time else None,
            'procedure_description': self.scheduled_procedure_step_description,
            'modality': self.modality,
            'ae_title': self.scheduled_station_ae_title,
            'station_name': self.scheduled_station_name,
            'patient_id': self.patient_id,
            'patient_name': self.patient_name,
            'patient_birth_date': self.patient_birth_date.isoformat() if self.patient_birth_date else None,
            'patient_gender': self.patient_gender,
            'patient_weight': float(self.patient_weight) if self.patient_weight else None,
            'patient_size': float(self.patient_size) if self.patient_size else None,
            'requested_procedure_id': self.requested_procedure_id,
            'requested_procedure_description': self.requested_procedure_description,
            'requested_procedure_code_sequence': self.requested_procedure_code_sequence,
            'study_id': self.study_id,
            'study_description': self.study_description,
            'referring_physician_name': self.referring_physician_name,
            'admission_id': self.admission_id,
            'current_patient_location': self.current_patient_location,
            'patient_state': self.patient_state,
            'pregnancy_status': self.pregnancy_status,
            'medical_alerts': self.medical_alerts,
            'contrast_allergies': self.contrast_allergies,
            'special_needs': self.special_needs,
            'priority': self.priority,
            'dicom_attributes': self.dicom_attributes,
            'is_active': self.is_active,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class WorklistHistory(Base):
    """Worklist Change History"""
    __tablename__ = 'worklist_history'
    
    # Primary Key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Foreign Keys
    worklist_item_id = Column(UUID(as_uuid=True), ForeignKey('worklist_items.id', ondelete='CASCADE'), index=True)
    # Temporarily disabled ForeignKey until Order model is properly defined
    # order_id = Column(UUID(as_uuid=True), ForeignKey('orders.id', ondelete='CASCADE'), index=True)
    order_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    
    # Change Information
    action = Column(String(50), nullable=False, index=True)
    previous_status = Column(String(20))
    new_status = Column(String(20))
    previous_scheduled_time = Column(DateTime)
    new_scheduled_time = Column(DateTime)
    
    # Details
    change_reason = Column(Text)
    change_details = Column(JSONB)
    
    # User Information
    changed_by = Column(String(100))
    changed_by_role = Column(String(50))
    
    # Timestamp
    changed_at = Column(DateTime, default=func.now(), index=True)
    
    # Relationships
    worklist_item = relationship("WorklistItem", back_populates="history")
    
    def __repr__(self):
        return f"<WorklistHistory(id={self.id}, action={self.action}, changed_by={self.changed_by})>"
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': str(self.id),
            'worklist_item_id': str(self.worklist_item_id) if self.worklist_item_id else None,
            'order_id': str(self.order_id) if self.order_id else None,
            'action': self.action,
            'previous_status': self.previous_status,
            'new_status': self.new_status,
            'previous_scheduled_time': self.previous_scheduled_time.isoformat() if self.previous_scheduled_time else None,
            'new_scheduled_time': self.new_scheduled_time.isoformat() if self.new_scheduled_time else None,
            'change_reason': self.change_reason,
            'change_details': self.change_details,
            'changed_by': self.changed_by,
            'changed_by_role': self.changed_by_role,
            'changed_at': self.changed_at.isoformat() if self.changed_at else None
        }


class ScheduleSlot(Base):
    """Schedule Slot for Modality"""
    __tablename__ = 'schedule_slots'
    
    # Primary Key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Foreign Keys
    # Temporarily disabled ForeignKey until models are properly defined
    # modality_id = Column(UUID(as_uuid=True), ForeignKey('modalities.id', ondelete='CASCADE'), index=True)
    modality_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    # order_id = Column(UUID(as_uuid=True), ForeignKey('orders.id', ondelete='SET NULL'), index=True)
    order_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    
    # Modality
    modality_type = Column(String(20), nullable=False)
    
    # Time Slot
    slot_date = Column(Date, nullable=False, index=True)
    slot_start_time = Column(Time, nullable=False)
    slot_end_time = Column(Time, nullable=False)
    duration_minutes = Column(Integer, nullable=False)
    
    # Capacity
    max_capacity = Column(Integer, default=1)
    current_bookings = Column(Integer, default=0)
    
    # Status
    is_available = Column(Boolean, default=True, index=True)
    is_blocked = Column(Boolean, default=False)
    block_reason = Column(Text)
    
    # Metadata
    notes = Column(Text)
    
    # Timestamps
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    
    # Constraints
    __table_args__ = (
        CheckConstraint('current_bookings <= max_capacity', name='chk_capacity'),
        CheckConstraint('slot_start_time < slot_end_time', name='chk_time_order'),
    )
    
    # Relationships
    # modality = relationship("Modality", back_populates="schedule_slots")
    # order = relationship("Order", back_populates="schedule_slot")
    
    def __repr__(self):
        return f"<ScheduleSlot(id={self.id}, date={self.slot_date}, time={self.slot_start_time}-{self.slot_end_time})>"
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': str(self.id),
            'modality_id': str(self.modality_id) if self.modality_id else None,
            'order_id': str(self.order_id) if self.order_id else None,
            'modality_type': self.modality_type,
            'slot_date': self.slot_date.isoformat() if self.slot_date else None,
            'slot_start_time': self.slot_start_time.isoformat() if self.slot_start_time else None,
            'slot_end_time': self.slot_end_time.isoformat() if self.slot_end_time else None,
            'duration_minutes': self.duration_minutes,
            'max_capacity': self.max_capacity,
            'current_bookings': self.current_bookings,
            'is_available': self.is_available,
            'is_blocked': self.is_blocked,
            'block_reason': self.block_reason,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
    
    @property
    def is_full(self):
        """Check if slot is full"""
        return self.current_bookings >= self.max_capacity
    
    @property
    def available_capacity(self):
        """Get available capacity"""
        return self.max_capacity - self.current_bookings
