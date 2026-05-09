"""
Storage Stats Model
Storage statistics tracking for monitoring and alerting
"""

from sqlalchemy import Column, Integer, BigInteger, Numeric, DateTime, String, Boolean
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID
import uuid

from app.database import Base


class StorageStats(Base):
    """
    Storage Statistics Model - Current snapshot of storage usage
    Used for real-time monitoring dashboard
    """
    
    __tablename__ = "pacs_storage_stats"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    total_bytes = Column(BigInteger, default=0, comment="Total storage capacity in bytes")
    used_bytes = Column(BigInteger, default=0, comment="Used storage in bytes")
    available_bytes = Column(BigInteger, default=0, comment="Available storage in bytes")
    usage_percentage = Column(Numeric(5, 2), default=0.00, comment="Usage percentage (0-100)")
    total_studies = Column(Integer, default=0)
    total_series = Column(Integer, default=0)
    total_instances = Column(Integer, default=0)
    recorded_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    
    def __repr__(self):
        return f"<StorageStats(used={self.used_bytes}, total={self.total_bytes}, usage={self.usage_percentage}%)>"
    
    def to_dict(self) -> dict:
        """Convert to dictionary"""
        return {
            "id": str(self.id),
            "total_bytes": self.total_bytes,
            "used_bytes": self.used_bytes,
            "available_bytes": self.available_bytes,
            "usage_percentage": float(self.usage_percentage) if self.usage_percentage else 0.0,
            "total_studies": self.total_studies,
            "total_series": self.total_series,
            "total_instances": self.total_instances,
            "recorded_at": self.recorded_at.isoformat() if self.recorded_at else None
        }


class StorageHistory(Base):
    """
    Storage History Model - Historical storage usage data
    Used for trend analysis and capacity planning
    """
    
    __tablename__ = "pacs_storage_history"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    total_bytes = Column(BigInteger, default=0, comment="Total storage capacity in bytes")
    used_bytes = Column(BigInteger, default=0, comment="Used storage in bytes")
    available_bytes = Column(BigInteger, default=0, comment="Available storage in bytes")
    usage_percentage = Column(Numeric(5, 2), default=0.00, comment="Usage percentage (0-100)")
    total_studies = Column(Integer, default=0)
    total_series = Column(Integer, default=0)
    total_instances = Column(Integer, default=0)
    recorded_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    
    def __repr__(self):
        return f"<StorageHistory(date={self.recorded_at}, usage={self.usage_percentage}%)>"
    
    def to_dict(self) -> dict:
        """Convert to dictionary"""
        return {
            "id": str(self.id),
            "total_bytes": self.total_bytes,
            "used_bytes": self.used_bytes,
            "available_bytes": self.available_bytes,
            "usage_percentage": float(self.usage_percentage) if self.usage_percentage else 0.0,
            "total_studies": self.total_studies,
            "total_series": self.total_series,
            "total_instances": self.total_instances,
            "recorded_at": self.recorded_at.isoformat() if self.recorded_at else None
        }


class StorageByModality(Base):
    """
    Storage By Modality Model - Storage usage breakdown by modality
    Used for analytics and capacity planning per modality type
    """
    
    __tablename__ = "pacs_storage_by_modality"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    modality = Column(String(16), nullable=False, index=True, comment="DICOM modality code (CT, MR, US, etc.)")
    study_count = Column(Integer, default=0)
    series_count = Column(Integer, default=0)
    instance_count = Column(Integer, default=0)
    total_size_bytes = Column(BigInteger, default=0, comment="Total storage used by this modality")
    recorded_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    
    def __repr__(self):
        return f"<StorageByModality(modality={self.modality}, size={self.total_size_bytes})>"
    
    def to_dict(self) -> dict:
        """Convert to dictionary"""
        return {
            "id": str(self.id),
            "modality": self.modality,
            "study_count": self.study_count,
            "series_count": self.series_count,
            "instance_count": self.instance_count,
            "total_size_bytes": self.total_size_bytes,
            "recorded_at": self.recorded_at.isoformat() if self.recorded_at else None
        }


class StorageAlert(Base):
    """
    Storage Alert Model - Alerts for storage thresholds
    Used for notification and monitoring
    """
    
    __tablename__ = "pacs_storage_alerts"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    alert_type = Column(String(50), nullable=False, index=True, comment="warning, critical")
    threshold_percentage = Column(Numeric(5, 2), nullable=False, comment="Threshold that triggered alert")
    current_percentage = Column(Numeric(5, 2), nullable=False, comment="Current usage when alert triggered")
    message = Column(String(500), nullable=False)
    is_active = Column(Boolean, default=True, index=True)
    acknowledged_at = Column(DateTime(timezone=True), nullable=True)
    acknowledged_by = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    
    def __repr__(self):
        return f"<StorageAlert(type={self.alert_type}, current={self.current_percentage}%)>"
    
    def to_dict(self) -> dict:
        """Convert to dictionary"""
        return {
            "id": str(self.id),
            "alert_type": self.alert_type,
            "threshold_percentage": float(self.threshold_percentage) if self.threshold_percentage else 0.0,
            "current_percentage": float(self.current_percentage) if self.current_percentage else 0.0,
            "message": self.message,
            "is_active": self.is_active,
            "acknowledged_at": self.acknowledged_at.isoformat() if self.acknowledged_at else None,
            "acknowledged_by": self.acknowledged_by,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }
