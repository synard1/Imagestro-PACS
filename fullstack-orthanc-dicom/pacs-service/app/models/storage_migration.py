from sqlalchemy import Column, String, UUID, Integer, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from app.database import Base
import uuid
from datetime import datetime

class StorageMigration(Base):
    __tablename__ = "storage_migrations"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"))
    from_storage_id = Column(UUID(as_uuid=True), ForeignKey("storage_backends.id"))
    to_storage_id = Column(UUID(as_uuid=True), ForeignKey("storage_backends.id"))
    scope = Column(String(20), default="tenant")
    scope_filter = Column(JSONB)
    status = Column(String(20), default="pending")
    items_total = Column(Integer, default=0)
    items_completed = Column(Integer, default=0)
    error_message = Column(Text)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.now)
