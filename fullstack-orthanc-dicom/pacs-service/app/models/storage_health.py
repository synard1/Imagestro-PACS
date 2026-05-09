from sqlalchemy import Column, String, UUID, Integer, Text, DateTime, ForeignKey, Numeric, Index
from sqlalchemy.dialects.postgresql import JSONB
from app.database import Base
import uuid
from datetime import datetime

class StorageBackendHealth(Base):
    __tablename__ = 'storage_backend_health'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    backend_id = Column(UUID(as_uuid=True), ForeignKey('storage_backends.id', ondelete="CASCADE"), nullable=False)

    # Health metrics
    status = Column(String(20))  # healthy, warning, critical, offline, unknown
    latency_ms = Column(Integer)  # Round-trip time for health check (ms)
    success_rate = Column(Numeric(5, 2))  # Last 24h success rate (%)
    last_check = Column(DateTime, default=datetime.utcnow)
    last_error = Column(Text, nullable=True)

    # Check details
    check_type = Column(String(50), default='connectivity')  # connectivity, read, write
    details = Column(JSONB)  # Additional metadata: {"free_space_gb": 100, "response_time_p99": 150}

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('idx_backend_health_backend_id', 'backend_id'),
        Index('idx_backend_health_last_check', 'last_check'),
    )
