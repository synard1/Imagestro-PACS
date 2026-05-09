"""
Signature Model
Digital Signature Tracking with Revocation Support
"""

from sqlalchemy import Column, String, Text, DateTime, ForeignKey, CheckConstraint, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID
import uuid

from app.database import Base


class ReportSignature(Base):
    """Report Signature Model with Revocation Tracking"""
    
    __tablename__ = "report_signatures"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    report_id = Column(UUID(as_uuid=True), ForeignKey("reports.id", ondelete="CASCADE"), nullable=False, index=True)
    signature_hash = Column(String(16), nullable=False, unique=True, index=True)
    
    # Radiologist Info
    radiologist_id = Column(String(100), nullable=False, index=True)
    radiologist_name = Column(String(255), nullable=True)
    license_number = Column(String(50), nullable=True)
    
    # Signature Details
    signature_method = Column(String(20), nullable=False)  # password, pad, qrcode
    signature_data = Column(JSON, nullable=True)  # Full signature info
    
    # Timestamps
    signed_at = Column(DateTime(timezone=True), nullable=False)
    
    # Status Tracking
    status = Column(String(20), default='active', index=True)  # active, revoked
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    revoked_by = Column(String(100), nullable=True)
    revocation_reason = Column(Text, nullable=True)
    
    # Audit
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    report = relationship("Report", backref="signatures")
    
    # Constraints
    __table_args__ = (
        CheckConstraint(
            "status IN ('active', 'revoked')",
            name="chk_signature_status"
        ),
        CheckConstraint(
            "signature_method IN ('password', 'pad', 'qrcode')",
            name="chk_signature_method"
        ),
    )
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            "id": str(self.id),
            "report_id": str(self.report_id),
            "signature_hash": self.signature_hash,
            "radiologist_id": self.radiologist_id,
            "radiologist_name": self.radiologist_name,
            "license_number": self.license_number,
            "signature_method": self.signature_method,
            "signed_at": self.signed_at.isoformat() if self.signed_at else None,
            "status": self.status,
            "revoked_at": self.revoked_at.isoformat() if self.revoked_at else None,
            "revoked_by": self.revoked_by,
            "revocation_reason": self.revocation_reason,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
    
    def __repr__(self):
        return f"<ReportSignature(hash={self.signature_hash}, status={self.status})>"


class SignatureAuditLog(Base):
    """Signature Audit Log Model"""
    
    __tablename__ = "signature_audit_log"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    signature_id = Column(UUID(as_uuid=True), ForeignKey("report_signatures.id", ondelete="CASCADE"), nullable=False, index=True)
    signature_hash = Column(String(16), nullable=False, index=True)
    action = Column(String(50), nullable=False, index=True)  # created, verified, revoked
    performed_by = Column(String(100), nullable=True)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(Text, nullable=True)
    details = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    
    # Relationships
    signature = relationship("ReportSignature", backref="audit_logs")
    
    def __repr__(self):
        return f"<SignatureAuditLog(hash={self.signature_hash}, action={self.action})>"
