"""
DICOM Tag Audit Trail Model
Tracks all DICOM tag synchronization operations for compliance and audit
"""

from sqlalchemy import Column, String, Integer, DateTime, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
import uuid

from app.database import Base


class DicomTagAuditLog(Base):
    """
    Audit log for DICOM tag synchronization operations
    Tracks original vs synchronized tags for compliance
    """
    __tablename__ = 'dicom_tag_audit_logs'

    # Primary Key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Foreign Keys
    dicom_file_id = Column(UUID(as_uuid=True), ForeignKey('dicom_files.id', ondelete='SET NULL'), nullable=True, index=True)
    worklist_id = Column(UUID(as_uuid=True), ForeignKey('worklist_items.id', ondelete='SET NULL'), nullable=True, index=True)
    order_id = Column(UUID(as_uuid=True), index=True)

    # DICOM Identifiers
    sop_instance_uid = Column(String(128), index=True)
    study_instance_uid = Column(String(128), index=True)
    series_instance_uid = Column(String(128), index=True)
    accession_number = Column(String(50), index=True)

    # File Paths (for audit trail)
    original_file_path = Column(Text, nullable=False)
    synchronized_file_path = Column(Text, nullable=False)

    # File Information
    original_file_size = Column(Integer)
    synchronized_file_size = Column(Integer)
    original_file_hash = Column(String(64))
    synchronized_file_hash = Column(String(64))

    # Tag Data (JSON)
    original_tags = Column(JSONB, nullable=False)
    synchronized_tags = Column(JSONB, nullable=False)
    tag_changes = Column(JSONB, nullable=False)  # {tag_name: {old: value, new: value}}

    # Patient Information (from worklist)
    patient_id = Column(String(64), index=True)
    patient_name = Column(String(255), index=True)

    # Operation Details
    operation_type = Column(String(50), default='TAG_SYNC')  # TAG_SYNC, MANUAL_EDIT, etc.
    performed_by = Column(String(100))  # User or system
    operation_reason = Column(Text)  # Why synchronization was needed

    # Compliance Flags
    is_bridged = Column(String(20), default='PARTIAL')  # FULL, PARTIAL, NONE (indicates bridge status)
    requires_review = Column(String(1), default='N')  # Y/N flag for manual review
    review_completed_at = Column(DateTime)
    reviewed_by = Column(String(100))

    # Status
    sync_status = Column(String(20), default='SUCCESS')  # SUCCESS, FAILED, PENDING
    error_message = Column(Text)

    # Timestamps
    synchronized_at = Column(DateTime, default=func.now(), index=True)
    created_at = Column(DateTime, default=func.now())

    # Relationships
    # dicom_file = relationship("DicomFile", back_populates="tag_audits")
    # worklist_item = relationship("WorklistItem")

    def __repr__(self):
        return f"<DicomTagAuditLog(id={self.id}, patient={self.patient_name}, sop_uid={self.sop_instance_uid}, status={self.sync_status})>"

    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': str(self.id),
            'dicom_file_id': str(self.dicom_file_id) if self.dicom_file_id else None,
            'worklist_id': str(self.worklist_id) if self.worklist_id else None,
            'order_id': str(self.order_id) if self.order_id else None,
            'sop_instance_uid': self.sop_instance_uid,
            'study_instance_uid': self.study_instance_uid,
            'series_instance_uid': self.series_instance_uid,
            'accession_number': self.accession_number,
            'original_file_path': self.original_file_path,
            'synchronized_file_path': self.synchronized_file_path,
            'original_file_size': self.original_file_size,
            'synchronized_file_size': self.synchronized_file_size,
            'original_tags': self.original_tags,
            'synchronized_tags': self.synchronized_tags,
            'tag_changes': self.tag_changes,
            'patient_id': self.patient_id,
            'patient_name': self.patient_name,
            'operation_type': self.operation_type,
            'performed_by': self.performed_by,
            'operation_reason': self.operation_reason,
            'is_bridged': self.is_bridged,
            'requires_review': self.requires_review,
            'review_completed_at': self.review_completed_at.isoformat() if self.review_completed_at else None,
            'reviewed_by': self.reviewed_by,
            'sync_status': self.sync_status,
            'error_message': self.error_message,
            'synchronized_at': self.synchronized_at.isoformat() if self.synchronized_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

    def get_changes_summary(self) -> str:
        """Get human-readable summary of tag changes"""
        if not self.tag_changes:
            return "No changes"

        changes = []
        for tag, change in self.tag_changes.items():
            old_val = change.get('old', change[0] if isinstance(change, (list, tuple)) else '')
            new_val = change.get('new', change[1] if isinstance(change, (list, tuple)) else '')
            changes.append(f"{tag}: '{old_val}' → '{new_val}'")

        return "; ".join(changes)
