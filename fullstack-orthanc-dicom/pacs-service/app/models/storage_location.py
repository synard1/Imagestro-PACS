"""
Storage Location Model
Represents a physical storage location for DICOM files
"""

from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from app.database import Base


class StorageLocation(Base):
    """Storage Location model"""
    __tablename__ = "storage_locations"
    
    # Primary Key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Location Information
    name = Column(String(100), nullable=False, unique=True)
    path = Column(Text, nullable=False)
    tier = Column(String(20), nullable=False, index=True)  # hot, warm, cold
    adapter_type = Column(String(20))  # local, s3, minio, contabo, wasabi
    provider = Column(String(50))  # filesystem, aws, contabo, wasabi, minio

    # Capacity
    max_size_gb = Column(Integer)
    current_size_gb = Column(Float, default=0)
    current_files = Column(Integer, default=0)
    
    # Status
    is_active = Column(Boolean, default=True, index=True)
    is_online = Column(Boolean, default=True, index=True)
    last_check = Column(DateTime)
    priority = Column(Integer, default=0)  # Higher priority = preferred
    
    # Timestamps
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    
    # Configuration (flexible JSON storage)
    config = Column(JSONB)
    
    # Relationships
    files = relationship("DicomFile", back_populates="storage_location")
    
    def __repr__(self):
        return f"<StorageLocation(id={self.id}, name={self.name}, tier={self.tier})>"
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': str(self.id),
            'name': self.name,
            'path': self.path,
            'tier': self.tier,
            'max_size_gb': self.max_size_gb,
            'current_size_gb': self.current_size_gb,
            'current_files': self.current_files,
            'usage_percentage': self.usage_percentage,
            'available_space_gb': self.available_space_gb,
            'is_active': self.is_active,
            'is_online': self.is_online,
            'last_check': self.last_check.isoformat() if self.last_check else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'config': self.config
        }
    
    @property
    def usage_percentage(self):
        """Calculate usage percentage"""
        if self.max_size_gb and self.max_size_gb > 0:
            return round((self.current_size_gb / self.max_size_gb) * 100, 2)
        return 0
    
    @property
    def available_space_gb(self):
        """Calculate available space in GB"""
        if self.max_size_gb:
            return max(0, self.max_size_gb - self.current_size_gb)
        return None
    
    @property
    def is_full(self):
        """Check if storage is full (>95% usage)"""
        return self.usage_percentage >= 95
    
    @property
    def is_nearly_full(self):
        """Check if storage is nearly full (>80% usage)"""
        return self.usage_percentage >= 80
    
    @property
    def status_color(self):
        """Get status color for UI"""
        if not self.is_online:
            return 'red'
        elif not self.is_active:
            return 'gray'
        elif self.is_full:
            return 'red'
        elif self.is_nearly_full:
            return 'yellow'
        else:
            return 'green'
    
    @property
    def retention_days(self):
        """Get retention days from config"""
        if self.config and 'retention_days' in self.config:
            return self.config['retention_days']
        return None
