from sqlalchemy import (
    Column,
    String,
    Integer,
    Boolean,
    ForeignKey,
    DateTime,
    JSON,
    Float,
    Text,
)
from sqlalchemy.orm import relationship
from app.database import Base
import uuid
from datetime import datetime


class Product(Base):
    """Subscription tiers/products"""

    __tablename__ = "products"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    code = Column(String, unique=True, nullable=False)
    description = Column(String)
    tier = Column(String, default="free")

    # Pricing
    price = Column(Float, default=0.0)
    currency = Column(String, default="IDR")
    billing_cycle = Column(String, default="monthly")

    # Limits
    max_users = Column(Integer)
    max_storage_gb = Column(Integer)
    max_api_calls_per_day = Column(Integer)

    # Overage Pricing
    overage_storage_price = Column(Float, default=0.0)
    overage_api_price = Column(Float, default=0.0)

    # Features
    features = Column(JSON, default=list)
    spec = Column(JSON, default=dict)

    # Display
    color = Column(String, default="#6b7280")
    is_featured = Column(Boolean, default=False)

    is_active = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    subscriptions = relationship("Subscription", back_populates="product")


class Subscription(Base):
    """Tenant subscriptions with billing"""

    __tablename__ = "subscriptions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String, ForeignKey("tenants.id"), name="hospital_id", nullable=False)
    product_id = Column(String, ForeignKey("products.id"), nullable=False)
    
    # Feature overrides
    features = Column(JSON, nullable=True) # Allows overriding product features

    status = Column(
        String, default="active"
    )  # active, expired, cancelled, trial, suspended

    # Billing
    billing_email = Column(String)
    billing_address = Column(Text)
    tax_id = Column(String)

    # Dates
    trial_started_at = Column(DateTime)
    trial_ends_at = Column(DateTime)
    started_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime)
    cancelled_at = Column(DateTime)
    renewal_at = Column(DateTime)

    # Auto-renewal
    auto_renew = Column(Boolean, default=True)

    # Notes
    notes = Column(Text)

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    product = relationship("Product", back_populates="subscriptions")
    tenant = relationship("Tenant", back_populates="subscriptions")
    invoices = relationship("Invoice", back_populates="subscription")
