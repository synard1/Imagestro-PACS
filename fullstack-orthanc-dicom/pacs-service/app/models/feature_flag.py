from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base
import uuid
from datetime import datetime


class FeatureFlag(Base):
    """Per-tenant feature toggles"""

    __tablename__ = "feature_flags"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String, ForeignKey("tenants.id"), nullable=False)

    feature_key = Column(String, nullable=False)  # e.g., 'satusehat_integration'
    feature_name = Column(String)
    description = Column(String)

    is_enabled = Column(Boolean, default=False)

    # Override from subscription tier
    is_tier_override = Column(Boolean, default=False)

    # Configuration
    config = Column(String, default="{}")  # JSON string for feature config

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    tenant = relationship("Tenant", back_populates="feature_flags")


# Available features catalog
AVAILABLE_FEATURES = {
    "basic_mwl": {
        "name": "Basic Worklist",
        "description": "Basic modality worklist access",
        "category": "core",
    },
    "full_mwl": {
        "name": "Full Worklist",
        "description": "Full DICOM worklist with scheduling",
        "category": "core",
    },
    "basic_orders": {
        "name": "Basic Orders",
        "description": "Basic order management",
        "category": "orders",
    },
    "full_orders": {
        "name": "Full Orders",
        "description": "Advanced order management with analytics",
        "category": "orders",
    },
    "dicom_viewer": {
        "name": "DICOM Viewer",
        "description": "Built-in DICOM image viewer",
        "category": "pacs",
    },
    "advanced_reports": {
        "name": "Advanced Reports",
        "description": "Customizable report templates",
        "category": "reports",
    },
    "satusehat_integration": {
        "name": "Satu Sehat Integration",
        "description": "Indonesian health data exchange",
        "category": "integration",
    },
    "api_access": {
        "name": "REST API Access",
        "description": "Programmatic API access",
        "category": "integration",
    },
    "hl7_integration": {
        "name": "HL7 Integration",
        "description": "HL7 message exchange",
        "category": "integration",
    },
    "multi_modality": {
        "name": "Multi-Modality",
        "description": "Support multiple imaging modalities",
        "category": "core",
    },
    "dedicated_support": {
        "name": "Dedicated Support",
        "description": "Priority support channel",
        "category": "support",
    },
    "email_support": {
        "name": "Email Support",
        "description": "Email-based support",
        "category": "support",
    },
    "priority_support": {
        "name": "Priority Support",
        "description": "24/7 priority support",
        "category": "support",
    },
}
