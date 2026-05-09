"""
Audit Log Model
Audit trail for PACS operations
"""

from sqlalchemy import Column, String, Text, DateTime, Boolean
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID, JSONB
import uuid

from app.database import Base


class AuditLog(Base):
    """Audit Log Model"""
    
    __tablename__ = "pacs_audit_log"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    username = Column(String(255), nullable=True)
    user_role = Column(String(50), nullable=True)
    action = Column(String(100), nullable=False, index=True)
    resource_type = Column(String(50), nullable=True, index=True)
    resource_id = Column(String(255), nullable=True, index=True)
    details = Column(JSONB, nullable=True)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    # Impersonate-related fields
    is_impersonate_session = Column(Boolean, default=False, index=True)
    impersonate_session_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    original_user_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    target_user_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    
    def __repr__(self):
        return f"<AuditLog(action={self.action}, user={self.username}, resource={self.resource_type}/{self.resource_id})>"
    
    def to_dict(self):
        """Convert model to dictionary"""
        return {
            'id': str(self.id),
            'user_id': str(self.user_id) if self.user_id else None,
            'username': self.username,
            'user_role': self.user_role,
            'action': self.action,
            'resource_type': self.resource_type,
            'resource_id': self.resource_id,
            'details': self.details,
            'ip_address': self.ip_address,
            'user_agent': self.user_agent,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'is_impersonate_session': self.is_impersonate_session,
            'impersonate_session_id': str(self.impersonate_session_id) if self.impersonate_session_id else None,
            'original_user_id': str(self.original_user_id) if self.original_user_id else None,
            'target_user_id': str(self.target_user_id) if self.target_user_id else None,
        }
