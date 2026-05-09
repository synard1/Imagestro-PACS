"""
DICOM File Model
Represents a DICOM file in the storage system
"""

from sqlalchemy import Column, String, Integer, BigInteger, Float, Boolean, Date, Time, DateTime, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from app.database import Base


class DicomFile(Base):
    """DICOM File model"""
    __tablename__ = "dicom_files"
    
    # Primary Key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # DICOM Identifiers
    study_id = Column(String(64), nullable=False, index=True)
    series_id = Column(String(64), nullable=False, index=True)
    instance_id = Column(String(64), nullable=False, index=True)
    sop_class_uid = Column(String(64), nullable=False)
    sop_instance_uid = Column(String(64), nullable=False, unique=True, index=True)
    
    # File Information
    file_path = Column(Text, nullable=False)
    file_size = Column(BigInteger, nullable=False)
    file_hash = Column(String(64), nullable=False)
    storage_tier = Column(String(20), default='hot', index=True)
    storage_location_id = Column(UUID(as_uuid=True), ForeignKey('storage_locations.id'))
    
    # DICOM Metadata
    patient_id = Column(String(64), index=True)
    patient_name = Column(String(255))
    patient_birth_date = Column(Date)
    patient_sex = Column(String(1))
    study_date = Column(Date, index=True)
    study_time = Column(Time)
    study_description = Column(Text)
    modality = Column(String(16), index=True)
    body_part = Column(String(64))
    series_number = Column(Integer)
    instance_number = Column(Integer)
    
    # Image Information
    rows = Column(Integer)
    columns = Column(Integer)
    bits_allocated = Column(Integer)
    bits_stored = Column(Integer)
    number_of_frames = Column(Integer, default=1)
    pixel_spacing = Column(String(50))
    slice_thickness = Column(Float)
    
    # Compression
    transfer_syntax_uid = Column(String(64))
    is_compressed = Column(Boolean, default=False)
    compression_ratio = Column(Float)
    original_size = Column(BigInteger)
    
    # Status and Timestamps
    status = Column(String(20), default='active', index=True)
    created_at = Column(DateTime, default=func.now(), index=True)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    accessed_at = Column(DateTime)
    
    # Additional metadata (flexible JSON storage)
    dicom_metadata = Column(JSONB)
    
    # Relationships
    storage_location = relationship("StorageLocation", back_populates="files")
    
    def __repr__(self):
        return f"<DicomFile(id={self.id}, sop_instance_uid={self.sop_instance_uid}, modality={self.modality})>"
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': str(self.id),
            'study_id': self.study_id,
            'series_id': self.series_id,
            'instance_id': self.instance_id,
            'sop_class_uid': self.sop_class_uid,
            'sop_instance_uid': self.sop_instance_uid,
            'file_path': self.file_path,
            'file_size': self.file_size,
            'file_hash': self.file_hash,
            'storage_tier': self.storage_tier,
            'storage_location_id': str(self.storage_location_id) if self.storage_location_id else None,
            'patient_id': self.patient_id,
            'patient_name': self.patient_name,
            'patient_birth_date': self.patient_birth_date.isoformat() if self.patient_birth_date else None,
            'patient_sex': self.patient_sex,
            'study_date': self.study_date.isoformat() if self.study_date else None,
            'study_time': self.study_time.isoformat() if self.study_time else None,
            'study_description': self.study_description,
            'modality': self.modality,
            'body_part': self.body_part,
            'series_number': self.series_number,
            'instance_number': self.instance_number,
            'rows': self.rows,
            'columns': self.columns,
            'bits_allocated': self.bits_allocated,
            'bits_stored': self.bits_stored,
            'number_of_frames': self.number_of_frames,
            'pixel_spacing': self.pixel_spacing,
            'slice_thickness': self.slice_thickness,
            'transfer_syntax_uid': self.transfer_syntax_uid,
            'is_compressed': self.is_compressed,
            'compression_ratio': self.compression_ratio,
            'original_size': self.original_size,
            'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'accessed_at': self.accessed_at.isoformat() if self.accessed_at else None,
            'dicom_metadata': self.dicom_metadata
        }
    
    @property
    def file_size_mb(self):
        """Get file size in MB"""
        return self.file_size / (1024 * 1024) if self.file_size else 0
    
    @property
    def file_size_gb(self):
        """Get file size in GB"""
        return self.file_size / (1024 * 1024 * 1024) if self.file_size else 0
    
    @property
    def image_dimensions(self):
        """Get image dimensions as string"""
        if self.rows and self.columns:
            return f"{self.rows}x{self.columns}"
        return None
    
    @property
    def is_multiframe(self):
        """Check if image is multiframe"""
        return self.number_of_frames and self.number_of_frames > 1
