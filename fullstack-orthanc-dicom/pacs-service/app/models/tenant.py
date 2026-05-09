from sqlalchemy import Column, String, Integer, Boolean, DateTime, JSON, Text, Float, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base
import uuid
from datetime import datetime


class Tenant(Base):
    """Tenant/Hospital/Facility for multi-tenancy"""

    __tablename__ = "tenants"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    code = Column(String, unique=True, nullable=False)
    type = Column(String, default="hospital")  # hospital, clinic, lab, network

    # Contact information
    address = Column(Text)
    city = Column(String)
    province = Column(String)
    country = Column(String, default="Indonesia")
    phone = Column(String)
    email = Column(String)
    website = Column(String)

    # Administrative
    contact_person = Column(String)
    contact_email = Column(String)
    tax_id = Column(String)  # NPWP

    # Integration
    external_system_code = Column(String)  # Link to ExternalSystem
    satusehat_org_id = Column(String)  # Satu Sehat organization ID
    irc_id = Column(String)  # IHS number

    # Settings
    settings = Column(JSON, default=dict)

    # Status
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    verification_at = Column(DateTime)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    subscriptions = relationship(
        "Subscription", back_populates="tenant", lazy="dynamic"
    )
    usage_records = relationship("UsageRecord", back_populates="tenant", lazy="dynamic")
    feature_flags = relationship("FeatureFlag", back_populates="tenant", lazy="dynamic")
    invoices = relationship("Invoice", back_populates="tenant", lazy="dynamic")


class TenantInvitation(Base):
    """Invitation codes for new tenants"""

    __tablename__ = "tenant_invitations"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String, ForeignKey("tenants.id"))
    email = Column(String, nullable=False)
    role = Column(String, default="ADMIN")  # ADMIN, USER

    token = Column(String, unique=True, nullable=False)
    expires_at = Column(DateTime)
    used_at = Column(DateTime)
    is_used = Column(Boolean, default=False)

    created_at = Column(DateTime, default=datetime.utcnow)
