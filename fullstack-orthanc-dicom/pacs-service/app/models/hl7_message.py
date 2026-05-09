"""
HL7 Message Models
SQLAlchemy models for HL7 v2.x message processing and audit
"""
from sqlalchemy import Column, String, Integer, Text, DateTime, CheckConstraint, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
import uuid

from app.database import Base


class HL7Message(Base):
    """HL7 v2.x Message Audit Trail"""
    __tablename__ = 'hl7_messages'

    # Primary Key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Message Identification
    message_control_id = Column(String(199), nullable=False, index=True)
    message_type = Column(String(10), nullable=False, index=True)  # ADT, ORM, ORU
    message_trigger = Column(String(10), nullable=False, index=True)  # A01, A08, O01, R01
    message_version = Column(String(10), default='2.5')

    # Message Content (Raw and Parsed)
    raw_message = Column(Text, nullable=False)
    parsed_message = Column(JSONB)

    # Processing Status
    status = Column(String(20), nullable=False, default='RECEIVED', index=True)
    processing_started_at = Column(DateTime(timezone=True))
    processing_completed_at = Column(DateTime(timezone=True))

    # Acknowledgment
    ack_message = Column(Text)
    ack_code = Column(String(2))  # AA (accept), AE (error), AR (reject)
    ack_sent_at = Column(DateTime(timezone=True))

    # Patient Context (for quick lookup)
    patient_id = Column(String(64), index=True)
    patient_name = Column(String(255))
    patient_mrn = Column(String(50), index=True)

    # Order Context (for linking)
    accession_number = Column(String(50), index=True)
    order_id = Column(UUID(as_uuid=True), index=True)
    placer_order_number = Column(String(50))
    filler_order_number = Column(String(50))

    # Study Context (for linking to DICOM)
    study_instance_uid = Column(String(64), index=True)

    # Source Information (HL7 Header fields)
    sending_application = Column(String(100), index=True)
    sending_facility = Column(String(100))
    receiving_application = Column(String(100), default='PACS')
    receiving_facility = Column(String(100))

    # HTTP Request Context
    http_method = Column(String(10))
    http_path = Column(String(255))
    http_status = Column(Integer)
    client_ip = Column(String(45))
    user_agent = Column(Text)

    # Error Handling
    error_message = Column(Text)
    error_details = Column(JSONB)
    error_code = Column(String(50))
    retry_count = Column(Integer, default=0)
    max_retries = Column(Integer, default=3)

    # Audit Fields
    created_by = Column(String(100))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Constraints
    __table_args__ = (
        CheckConstraint(
            status.in_(['RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'REJECTED', 'DEAD_LETTER']),
            name='hl7_messages_status_check'
        ),
    )

    # Relationships
    processing_queue = relationship("HL7ProcessingQueue", back_populates="hl7_message", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<HL7Message(id={self.id}, type={self.message_type}_{self.message_trigger}, status={self.status}, patient={self.patient_id})>"

    def to_list_dict(self):
        """Convert to simplified dictionary for list view"""
        return {
            'id': str(self.id),
            'message_control_id': self.message_control_id,
            'message_type': self.message_type,
            'message_trigger': self.message_trigger,
            'status': self.status,
            'ack_code': self.ack_code,
            'patient_id': self.patient_id,
            'patient_name': self.patient_name,
            'accession_number': self.accession_number,
            'sending_application': self.sending_application,
            'error_message': self.error_message,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': str(self.id),
            'message_control_id': self.message_control_id,
            'message_type': self.message_type,
            'message_trigger': self.message_trigger,
            'message_version': self.message_version,
            'raw_message': self.raw_message,
            'parsed_message': self.parsed_message,
            'status': self.status,
            'processing_started_at': self.processing_started_at.isoformat() if self.processing_started_at else None,
            'processing_completed_at': self.processing_completed_at.isoformat() if self.processing_completed_at else None,
            'ack_message': self.ack_message,
            'ack_code': self.ack_code,
            'ack_sent_at': self.ack_sent_at.isoformat() if self.ack_sent_at else None,
            'patient_id': self.patient_id,
            'patient_name': self.patient_name,
            'patient_mrn': self.patient_mrn,
            'accession_number': self.accession_number,
            'order_id': str(self.order_id) if self.order_id else None,
            'placer_order_number': self.placer_order_number,
            'filler_order_number': self.filler_order_number,
            'study_instance_uid': self.study_instance_uid,
            'sending_application': self.sending_application,
            'sending_facility': self.sending_facility,
            'receiving_application': self.receiving_application,
            'receiving_facility': self.receiving_facility,
            'http_method': self.http_method,
            'http_path': self.http_path,
            'http_status': self.http_status,
            'client_ip': self.client_ip,
            'user_agent': self.user_agent,
            'error_message': self.error_message,
            'error_details': self.error_details,
            'error_code': self.error_code,
            'retry_count': self.retry_count,
            'max_retries': self.max_retries,
            'created_by': self.created_by,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

    @property
    def is_processed(self):
        """Check if message has been successfully processed"""
        return self.status == 'PROCESSED'

    @property
    def is_failed(self):
        """Check if message processing failed"""
        return self.status in ['FAILED', 'DEAD_LETTER']

    @property
    def can_retry(self):
        """Check if message can be retried"""
        return self.status == 'FAILED' and self.retry_count < self.max_retries

    @property
    def message_type_full(self):
        """Get full message type (e.g., ADT_A01)"""
        return f"{self.message_type}_{self.message_trigger}"


class HL7ProcessingQueue(Base):
    """HL7 Message Processing Queue for Async Processing"""
    __tablename__ = 'hl7_processing_queue'

    # Primary Key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Foreign Keys
    hl7_message_id = Column(UUID(as_uuid=True), ForeignKey('hl7_messages.id'), nullable=False, index=True)

    # Queue Management
    queue_name = Column(String(50), nullable=False)  # hl7_adt, hl7_orm, hl7_oru
    priority = Column(Integer, default=5)  # 1-10 (1=highest, 10=lowest)
    status = Column(String(20), nullable=False, default='QUEUED', index=True)

    # Celery Integration
    celery_task_id = Column(String(255), index=True)
    celery_worker = Column(String(100))

    # Scheduling
    scheduled_at = Column(DateTime(timezone=True), server_default=func.now())
    started_at = Column(DateTime(timezone=True))
    completed_at = Column(DateTime(timezone=True))

    # Retry Management
    retry_count = Column(Integer, default=0)
    max_retries = Column(Integer, default=3)
    next_retry_at = Column(DateTime(timezone=True), index=True)
    last_error = Column(Text)

    # Audit
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Constraints
    __table_args__ = (
        CheckConstraint(
            status.in_(['QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'DEAD_LETTER', 'CANCELLED']),
            name='hl7_queue_status_check'
        ),
    )

    # Relationships
    hl7_message = relationship("HL7Message", back_populates="processing_queue")

    def __repr__(self):
        return f"<HL7ProcessingQueue(id={self.id}, queue={self.queue_name}, status={self.status}, message={self.hl7_message_id})>"

    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': str(self.id),
            'hl7_message_id': str(self.hl7_message_id),
            'queue_name': self.queue_name,
            'priority': self.priority,
            'status': self.status,
            'celery_task_id': self.celery_task_id,
            'celery_worker': self.celery_worker,
            'scheduled_at': self.scheduled_at.isoformat() if self.scheduled_at else None,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'retry_count': self.retry_count,
            'max_retries': self.max_retries,
            'next_retry_at': self.next_retry_at.isoformat() if self.next_retry_at else None,
            'last_error': self.last_error,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

    @property
    def is_completed(self):
        """Check if queue item has been completed"""
        return self.status == 'COMPLETED'

    @property
    def is_failed(self):
        """Check if queue item has failed"""
        return self.status in ['FAILED', 'DEAD_LETTER']

    @property
    def can_retry(self):
        """Check if queue item can be retried"""
        return self.status == 'FAILED' and self.retry_count < self.max_retries


class HL7Config(Base):
    """HL7 System Configuration"""
    __tablename__ = 'hl7_config'

    # Primary Key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Configuration
    config_key = Column(String(100), nullable=False, unique=True, index=True)
    config_value = Column(Text, nullable=False)
    config_type = Column(String(20), default='STRING')  # STRING, INT, BOOL, JSON
    description = Column(Text)
    is_encrypted = Column(String(10), default='false')
    is_active = Column(String(10), default='true', index=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<HL7Config(key={self.config_key}, value={self.config_value}, type={self.config_type})>"

    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': str(self.id),
            'config_key': self.config_key,
            'config_value': self.config_value,
            'config_type': self.config_type,
            'description': self.description,
            'is_encrypted': self.is_encrypted,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

    @property
    def value_as_bool(self):
        """Get value as boolean"""
        if self.config_type == 'BOOL':
            return self.config_value.lower() in ['true', '1', 'yes', 'on']
        return None

    @property
    def value_as_int(self):
        """Get value as integer"""
        if self.config_type == 'INT':
            try:
                return int(self.config_value)
            except ValueError:
                return None
        return None
