"""
Storage Backend Model
Represents a storage configuration (Local, S3, etc.) for a tenant or system-wide.
"""

from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from app.database import Base


class StorageBackend(Base):
    """Storage Backend model"""
    __tablename__ = "storage_backends"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)

    name = Column(String(100), nullable=False)
    type = Column(String(50), nullable=False)  # 'local', 's3', 'minio', etc.
    connection_type = Column(String(50), nullable=False, default='cloud')  # 'cloud', 'local', 'remote'
    access_endpoint = Column(Text, nullable=True)
    config = Column(JSONB, nullable=False, default={})
    is_active = Column(Boolean, default=False, index=True)
    is_default = Column(Boolean, default=False, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    tenant = relationship("Tenant", backref="storage_backends")
    studies = relationship("Study", back_populates="storage")

    def __repr__(self):
        return f"<StorageBackend(id={self.id}, name={self.name}, type={self.type}, active={self.is_active}, default={self.is_default})>"

    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': str(self.id),
            'tenant_id': str(self.tenant_id) if self.tenant_id else None,
            'name': self.name,
            'type': self.type,
            'connection_type': self.connection_type,
            'access_endpoint': self.access_endpoint,
            'config': self.config,
            'is_active': self.is_active,
            'is_default': self.is_default,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
