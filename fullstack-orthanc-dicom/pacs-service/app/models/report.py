"""
Report Models
SQLAlchemy models for radiology reporting system
"""

from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, CheckConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
from app.database import Base


class Report(Base):
    """
    Radiology Report Model
    Stores report content, workflow status, and metadata
    """
    __tablename__ = "reports"
    
    # Primary key (UUID for better scalability)
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    report_id = Column(String(50), unique=True, nullable=False, index=True)
    
    # Study and patient info
    study_id = Column(String(100), nullable=False, index=True)
    patient_id = Column(String(50), nullable=False, index=True)
    patient_name = Column(String(200), nullable=False)
    
    # Report content
    template_id = Column(String(50), nullable=False)
    modality = Column(String(20))
    body_part = Column(String(100))
    
    # Report sections
    clinical_history = Column(Text)
    technique = Column(Text)
    comparison = Column(Text)
    findings = Column(Text, nullable=False)
    impression = Column(Text, nullable=False)
    recommendation = Column(Text)
    
    # Workflow
    status = Column(String(20), nullable=False, default='draft', index=True)
    
    # Metadata
    created_by = Column(String(100), nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    updated_by = Column(String(100))
    updated_at = Column(DateTime)
    finalized_by = Column(String(100))
    finalized_at = Column(DateTime, index=True)
    
    # Signature
    signature_id = Column(String(100))
    signature_method = Column(String(20))
    signature_data = Column(Text)
    signature_timestamp = Column(DateTime)
    
    # Versioning
    version = Column(Integer, nullable=False, default=1)
    parent_report_id = Column(String(50))
    
    # Soft delete
    deleted = Column(Boolean, default=False, index=True)
    deleted_at = Column(DateTime)
    deleted_by = Column(String(100))
    
    # Relationships (using report_id as foreign key since it's the business key)
    history = relationship(
        "ReportHistory",
        foreign_keys="[ReportHistory.report_id]",
        primaryjoin="Report.report_id == ReportHistory.report_id",
        back_populates="report",
        cascade="all, delete-orphan"
    )
    attachments = relationship(
        "ReportAttachment",
        foreign_keys="[ReportAttachment.report_id]",
        primaryjoin="Report.report_id == ReportAttachment.report_id",
        back_populates="report",
        cascade="all, delete-orphan"
    )
    
    # Constraints
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft', 'preliminary', 'final', 'amended', 'cancelled')",
            name='chk_status'
        ),
    )
    
    def to_dict(self):
        """Convert model to dictionary"""
        return {
            'report_id': self.report_id,
            'study_id': self.study_id,
            'patient_id': self.patient_id,
            'patient_name': self.patient_name,
            'template_id': self.template_id,
            'modality': self.modality,
            'body_part': self.body_part,
            'clinical_history': self.clinical_history,
            'technique': self.technique,
            'comparison': self.comparison,
            'findings': self.findings,
            'impression': self.impression,
            'recommendation': self.recommendation,
            'status': self.status,
            'created_by': self.created_by,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_by': self.updated_by,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'finalized_by': self.finalized_by,
            'finalized_at': self.finalized_at.isoformat() if self.finalized_at else None,
            'signature_id': self.signature_id,
            'signature_method': self.signature_method,
            'version': self.version,
            'parent_report_id': self.parent_report_id
        }


class ReportHistory(Base):
    """
    Report History Model
    Stores historical versions of reports for audit trail
    """
    __tablename__ = "report_history"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    report_id = Column(String(50), nullable=False, index=True)
    version = Column(Integer, nullable=False)
    
    # Snapshot
    report_data = Column(JSONB, nullable=False)
    
    # Change tracking
    changed_by = Column(String(100), nullable=False)
    changed_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    change_reason = Column(Text)
    
    # Relationships (using report_id to link to Report)
    report = relationship(
        "Report",
        foreign_keys="[ReportHistory.report_id]",
        primaryjoin="Report.report_id == ReportHistory.report_id",
        back_populates="history"
    )
    
    def to_dict(self):
        """Convert model to dictionary"""
        return {
            'id': str(self.id),  # Convert UUID to string
            'report_id': self.report_id,
            'version': self.version,
            'report_data': self.report_data,
            'changed_by': self.changed_by,
            'changed_at': self.changed_at.isoformat() if self.changed_at else None,
            'change_reason': self.change_reason
        }


class ReportAttachment(Base):
    """
    Report Attachment Model
    Stores attachments associated with reports (PDFs, signatures, etc.)
    """
    __tablename__ = "report_attachments"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    report_id = Column(String(50), nullable=False, index=True)
    attachment_type = Column(String(50), nullable=False)
    
    file_name = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_size = Column(Integer)
    mime_type = Column(String(100))
    
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    created_by = Column(String(100), nullable=False)
    
    # Relationships (using report_id to link to Report)
    report = relationship(
        "Report",
        foreign_keys="[ReportAttachment.report_id]",
        primaryjoin="Report.report_id == ReportAttachment.report_id",
        back_populates="attachments"
    )
    
    def to_dict(self):
        """Convert model to dictionary"""
        return {
            'id': str(self.id),  # Convert UUID to string
            'report_id': self.report_id,
            'attachment_type': self.attachment_type,
            'file_name': self.file_name,
            'file_path': self.file_path,
            'file_size': self.file_size,
            'mime_type': self.mime_type,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'created_by': self.created_by
        }
