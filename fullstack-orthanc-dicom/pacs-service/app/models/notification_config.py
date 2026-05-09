"""
Notification Configuration Model
"""

from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import JSONB
from app.database import Base


class NotificationConfig(Base):
    """Notification configuration settings"""
    __tablename__ = "notification_config"

    id = Column(Integer, primary_key=True, index=True)
    config_key = Column(String(255), unique=True, nullable=False, index=True)
    config_value = Column(Text, nullable=False)
    description = Column(Text)
    is_sensitive = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    updated_by = Column(String(255))
    enabled = Column(Boolean, default=True, index=True)

    def __repr__(self):
        return f"<NotificationConfig(key={self.config_key}, enabled={self.enabled})>"


class NotificationAuditLog(Base):
    """Notification audit log"""
    __tablename__ = "notification_audit_log"

    id = Column(Integer, primary_key=True, index=True)
    notification_type = Column(String(100), nullable=False, index=True)
    channel = Column(String(50), nullable=False, index=True)
    recipient = Column(String(255))
    status = Column(String(50), nullable=False)
    message_preview = Column(Text)
    error_message = Column(Text)
    metadata_json = Column("metadata", JSONB)
    created_at = Column(DateTime, server_default=func.now(), index=True)
    response_time_ms = Column(Integer)

    def __repr__(self):
        return f"<NotificationAuditLog(type={self.notification_type}, channel={self.channel}, status={self.status})>"
