"""
Study Model
DICOM Study-level metadata
"""

from sqlalchemy import Column, String, Date, Time, Integer, BigInteger, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
from typing import Optional
import uuid

from app.database import Base


class Study(Base):
    """PACS Study Model"""

    __tablename__ = "pacs_studies"

    # Primary Key
    study_instance_uid = Column(String(64), primary_key=True)

    # Study Information
    study_id = Column(String(16), nullable=True)
    study_date = Column(Date, nullable=True, index=True)
    study_time = Column(Time, nullable=True)
    study_description = Column(String(255), nullable=True)
    accession_number = Column(String(16), nullable=True, index=True)

    # Patient Information
    patient_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    patient_name = Column(String(255), nullable=True, index=True)
    patient_birth_date = Column(Date, nullable=True)
    patient_gender = Column(String(1), nullable=True)
    patient_medical_record_number = Column(String(50), nullable=True, index=True)

    # Order Integration
    order_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    
    # Clinical Information
    referring_physician = Column(String(255), nullable=True)
    
    # Modality
    modality = Column(String(16), nullable=True, index=True)
    
    # Counts
    number_of_series = Column(Integer, default=0)
    number_of_instances = Column(Integer, default=0)
    storage_size = Column(BigInteger, default=0)
    
    # Orthanc Reference
    orthanc_id = Column(String(64), nullable=True, index=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    deleted_at = Column(DateTime(timezone=True), nullable=True, index=True)
    deleted_by = Column(String(36), nullable=True)
    archived_at = Column(DateTime(timezone=True), nullable=True, index=True)

    # DLM (Data Lifecycle Management) Tracking
    last_accessed_at = Column(DateTime(timezone=True), nullable=True, server_default=func.now())
    view_count = Column(Integer, default=0)
    storage_tier = Column(String(16), default='hot')  # 'hot', 'warm', 'cold', 'archive'

    # Thumbnail Information
    thumbnail_series_uid = Column(String(64), nullable=True)
    thumbnail_instance_uid = Column(String(64), nullable=True)
    tenant_id = Column(UUID(as_uuid=True), nullable=True)
    storage_id = Column(UUID(as_uuid=True), ForeignKey("storage_backends.id", ondelete="SET NULL"), nullable=True)

    # Relationships

    series = relationship("Series", back_populates="study", cascade="all, delete-orphan")
    storage = relationship("StorageBackend", back_populates="studies")
    # Note: Reports link to studies via study_id (string), not a foreign key relationship
    
    def __repr__(self):
        return f"<Study(uid={self.study_instance_uid}, patient={self.patient_name}, date={self.study_date})>"
    
    @property
    def is_deleted(self) -> bool:
        """Check if study is soft-deleted"""
        return self.deleted_at is not None
    
    def soft_delete(self):
        """Soft delete the study"""
        self.deleted_at = datetime.utcnow()
    
    def restore(self):
        """Restore soft-deleted study"""
        self.deleted_at = None
    
    def to_dict(self) -> dict:
        """Convert to dictionary"""
        return {
            "study_instance_uid": self.study_instance_uid,
            "study_id": self.study_id,
            "study_date": self.study_date.isoformat() if self.study_date else None,
            "study_time": self.study_time.isoformat() if self.study_time else None,
            "study_description": self.study_description,
            "accession_number": self.accession_number,
            "patient_id": self.patient_id,
            "patient_name": self.patient_name,
            "patient_birth_date": self.patient_birth_date.isoformat() if self.patient_birth_date else None,
            "patient_gender": self.patient_gender,
            "patient_medical_record_number": self.patient_medical_record_number,
            "order_id": self.order_id,
            "referring_physician": self.referring_physician,
            "modality": self.modality,
            "number_of_series": self.number_of_series,
            "number_of_instances": self.number_of_instances,
            "storage_size": self.storage_size,
            "orthanc_id": self.orthanc_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "deleted_at": self.deleted_at.isoformat() if self.deleted_at else None,
            "thumbnail_series_uid": self.thumbnail_series_uid,
            "thumbnail_instance_uid": self.thumbnail_instance_uid,
            "storage_id": str(self.storage_id) if self.storage_id else None,
            "tenant_id": str(self.tenant_id) if self.tenant_id else None
        }
