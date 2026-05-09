"""
Impersonate Session Model
Stores impersonate session data for superadmin user impersonation feature
"""

from sqlalchemy import Column, String, Text, DateTime, Integer, Boolean
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID
import uuid

from app.database import Base


class ImpersonateSession(Base):
    """Impersonate Session Model"""
    
    __tablename__ = "impersonate_sessions"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    original_user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    target_user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    start_time = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    end_time = Column(DateTime(timezone=True), nullable=True)
    reason = Column(Text, nullable=True)
    status = Column(String(50), nullable=False, default='active', index=True)  # active, completed, timeout, error
    error_message = Column(Text, nullable=True)
    timeout_minutes = Column(Integer, nullable=False, default=30)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    def __repr__(self):
        return f"<ImpersonateSession(original_user={self.original_user_id}, target_user={self.target_user_id}, status={self.status})>"
    
    def duration_seconds(self):
        """Calculate session duration in seconds"""
        if self.end_time:
            return int((self.end_time - self.start_time).total_seconds())
        return None
    
    def is_active(self):
        """Check if session is currently active"""
        return self.status == 'active' and self.end_time is None
    
    def to_dict(self):
        """Convert model to dictionary"""
        return {
            'id': str(self.id),
            'original_user_id': str(self.original_user_id),
            'target_user_id': str(self.target_user_id),
            'start_time': self.start_time.isoformat() if self.start_time else None,
            'end_time': self.end_time.isoformat() if self.end_time else None,
            'reason': self.reason,
            'status': self.status,
            'error_message': self.error_message,
            'timeout_minutes': self.timeout_minutes,
            'duration_seconds': self.duration_seconds(),
            'is_active': self.is_active(),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
