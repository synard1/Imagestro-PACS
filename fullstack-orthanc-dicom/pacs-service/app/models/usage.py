from sqlalchemy import Column, String, Integer, Boolean, DateTime, JSON, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base
import uuid
from datetime import datetime


class UsageRecord(Base):
    """Daily usage tracking per tenant"""

    __tablename__ = "usage_records"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String, ForeignKey("tenants.id"), nullable=False)

    date = Column(DateTime, default=datetime.utcnow, index=True)
    period = Column(String, default="daily")  # daily, monthly

    # API Usage
    api_calls = Column(Integer, default=0)
    api_calls_limit = Column(Integer)  # From subscription tier

    # R2/S3 Operations Tracking
    class_a_ops = Column(Integer, default=0)  # Mutations (Put, List)
    class_b_ops = Column(Integer, default=0)  # Reads (Get, Head)

    # Storage Usage
    storage_bytes = Column(Integer, default=0)
    storage_bytes_limit = Column(Integer)  # From subscription tier

    # User Usage
    active_users = Column(Integer, default=0)
    user_limit = Column(Integer)  # From subscription tier

    # Additional metrics
    meta_data = Column(JSON, default=dict)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    tenant = relationship("Tenant", back_populates="usage_records")


class UsageAlert(Base):
    """Usagethreshold alerts"""

    __tablename__ = "usage_alerts"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String, ForeignKey("tenants.id"), nullable=False)

    alert_type = Column(String, nullable=False)  # api_limit, storage_limit, user_limit
    threshold_percent = Column(Integer, default=80)  # Alert at X%

    is_enabled = Column(Boolean, default=True)
    is_triggered = Column(Boolean, default=False)
    triggered_at = Column(DateTime)
    acknowledged_at = Column(DateTime)

    created_at = Column(DateTime, default=datetime.utcnow)


class BillingEvent(Base):
    """Billing/webhook events"""

    __tablename__ = "billing_events"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String, ForeignKey("tenants.id"), nullable=False)
    subscription_id = Column(String, ForeignKey("subscriptions.id"))

    event_type = Column(
        String, nullable=False
    )  # subscription_created, subscription_renewed, etc.
    payload = Column(JSON, default=dict)

    webhook_url = Column(String)
    webhook_attempts = Column(Integer, default=0)
    webhook_response = Column(JSON)
    is_delivered = Column(Boolean, default=False)
    delivered_at = Column(DateTime)

    created_at = Column(DateTime, default=datetime.utcnow)
