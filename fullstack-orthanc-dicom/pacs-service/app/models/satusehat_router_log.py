"""
Audit log for DICOM sends to the SatuSehat DICOM Router.
"""

from sqlalchemy import Column, String, Integer, Text, DateTime, Boolean
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
import uuid

from app.database import Base


class SatusehatRouterLog(Base):
    """Audit record for C-STORE transmissions to the SatuSehat DICOM Router."""

    __tablename__ = "satusehat_router_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Filters used for the send operation
    study_uid = Column(String(128), index=True, nullable=True)
    series_uid = Column(String(128), index=True, nullable=True)
    sop_instance_uid = Column(String(128), index=True, nullable=True)
    imaging_study_id = Column(String(128), index=True, nullable=True)

    # Router configuration used
    router_host = Column(String(255), nullable=False)
    router_port = Column(Integer, nullable=False)
    router_ae_title = Column(String(64), nullable=False)
    calling_ae_title = Column(String(64), nullable=False)

    # Result summary
    total = Column(Integer, nullable=False)
    sent = Column(Integer, nullable=False)
    failed = Column(Integer, nullable=False)
    success = Column(Boolean, nullable=False, default=False)
    error = Column(Text, nullable=True)

    # Raw payloads for audit/debug
    request_payload = Column(JSONB, nullable=True)
    response_details = Column(JSONB, nullable=True)

    requested_by = Column(String(255), nullable=True)
    client_ip = Column(String(45), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    def __repr__(self):
        return f"<SatusehatRouterLog success={self.success} sent={self.sent} failed={self.failed}>"
