"""
FHIR Resource Models

SQLAlchemy models for FHIR R4 resources storage
"""

from sqlalchemy import Column, String, Integer, Boolean, DateTime, Text, ForeignKey, TIMESTAMP, UUID, Numeric
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import uuid


class FHIRResource(Base):
    """
    FHIR Resource Model
    Stores FHIR R4 resources with versioning support
    """
    __tablename__ = "fhir_resources"

    # Primary Key
    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # FHIR Resource Metadata
    resource_type = Column(String(50), nullable=False, index=True)
    resource_id = Column(String(64), nullable=False, index=True)
    version_id = Column(Integer, default=1, nullable=False)

    # Resource Content
    resource_json = Column(JSONB, nullable=False)

    # Timestamps
    last_updated = Column(TIMESTAMP, default=func.now(), onupdate=func.now())
    created_at = Column(TIMESTAMP, default=func.now())

    # Status
    is_deleted = Column(Boolean, default=False, index=True)

    # Integration Links
    hl7_message_id = Column(PG_UUID(as_uuid=True), ForeignKey('hl7_messages.id', ondelete='SET NULL'), nullable=True, index=True)
    # Keep order_id as reference without ORM FK to avoid missing table metadata issues
    order_id = Column(PG_UUID(as_uuid=True), nullable=True, index=True)
    patient_external_id = Column(String(100), nullable=True, index=True)

    # Metadata
    author = Column(String(100), nullable=True)
    source_system = Column(String(50), nullable=True)

    # Relationships
    search_params = relationship("FHIRSearchParam", back_populates="resource", cascade="all, delete-orphan")
    source_links = relationship("FHIRResourceLink", foreign_keys="FHIRResourceLink.source_resource_id", back_populates="source_resource", cascade="all, delete-orphan")
    target_links = relationship("FHIRResourceLink", foreign_keys="FHIRResourceLink.target_resource_id", back_populates="target_resource", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<FHIRResource(type={self.resource_type}, id={self.resource_id}, version={self.version_id})>"

    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': str(self.id),
            'resourceType': self.resource_type,
            'resourceId': self.resource_id,
            'versionId': self.version_id,
            'resource': self.resource_json,
            'lastUpdated': self.last_updated.isoformat() if self.last_updated else None,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'isDeleted': self.is_deleted,
            'author': self.author,
            'sourceSystem': self.source_system
        }

    def to_fhir_json(self):
        """
        Return the FHIR resource JSON with meta information
        """
        resource = dict(self.resource_json) if self.resource_json else {}

        # Add FHIR meta information
        if 'meta' not in resource:
            resource['meta'] = {}

        resource['meta']['versionId'] = str(self.version_id)
        resource['meta']['lastUpdated'] = self.last_updated.isoformat() if self.last_updated else None

        # Ensure resourceType and id are set
        resource['resourceType'] = self.resource_type
        resource['id'] = self.resource_id

        return resource


class FHIRSearchParam(Base):
    """
    FHIR Search Parameters Model
    Stores extracted search parameters for efficient FHIR searches
    """
    __tablename__ = "fhir_search_params"

    # Primary Key
    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Link to Resource
    resource_fhir_id = Column(PG_UUID(as_uuid=True), ForeignKey('fhir_resources.id', ondelete='CASCADE'), nullable=False, index=True)

    # Search Parameter Details
    param_name = Column(String(100), nullable=False, index=True)
    param_value = Column(Text, nullable=True)
    param_type = Column(String(20), nullable=False, index=True)  # string, token, reference, date, number

    # For reference parameters
    reference_type = Column(String(50), nullable=True)
    reference_id = Column(String(64), nullable=True)

    # For date parameters
    date_value = Column(TIMESTAMP, nullable=True, index=True)

    # For number parameters
    number_value = Column(Numeric(20, 6), nullable=True, index=True)

    # Timestamps
    created_at = Column(TIMESTAMP, default=func.now())

    # Relationships
    resource = relationship("FHIRResource", back_populates="search_params")

    def __repr__(self):
        return f"<FHIRSearchParam(name={self.param_name}, value={self.param_value}, type={self.param_type})>"

    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': str(self.id),
            'resourceId': str(self.resource_fhir_id),
            'paramName': self.param_name,
            'paramValue': self.param_value,
            'paramType': self.param_type,
            'referenceType': self.reference_type,
            'referenceId': self.reference_id,
            'dateValue': self.date_value.isoformat() if self.date_value else None,
            'numberValue': float(self.number_value) if self.number_value else None,
            'createdAt': self.created_at.isoformat() if self.created_at else None
        }


class FHIRResourceLink(Base):
    """
    FHIR Resource Links Model
    Stores relationships between FHIR resources
    """
    __tablename__ = "fhir_resource_links"

    # Primary Key
    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Source Resource
    source_resource_id = Column(PG_UUID(as_uuid=True), ForeignKey('fhir_resources.id', ondelete='CASCADE'), nullable=False, index=True)
    source_resource_type = Column(String(50), nullable=False)

    # Target Resource
    target_resource_id = Column(PG_UUID(as_uuid=True), ForeignKey('fhir_resources.id', ondelete='CASCADE'), nullable=False, index=True)
    target_resource_type = Column(String(50), nullable=False)

    # Link Type
    link_type = Column(String(100), nullable=False, index=True)  # e.g., "subject", "encounter", "performer"

    # Timestamps
    created_at = Column(TIMESTAMP, default=func.now())

    # Relationships
    source_resource = relationship("FHIRResource", foreign_keys=[source_resource_id], back_populates="source_links")
    target_resource = relationship("FHIRResource", foreign_keys=[target_resource_id], back_populates="target_links")

    def __repr__(self):
        return f"<FHIRResourceLink({self.source_resource_type}/{self.source_resource_id} --{self.link_type}--> {self.target_resource_type}/{self.target_resource_id})>"

    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': str(self.id),
            'sourceResourceId': str(self.source_resource_id),
            'sourceResourceType': self.source_resource_type,
            'targetResourceId': str(self.target_resource_id),
            'targetResourceType': self.target_resource_type,
            'linkType': self.link_type,
            'createdAt': self.created_at.isoformat() if self.created_at else None
        }


class FHIRConfig(Base):
    """
    FHIR Configuration Model
    Stores FHIR server configuration settings
    """
    __tablename__ = "fhir_config"

    # Primary Key
    id = Column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Configuration
    config_key = Column(String(100), nullable=False, unique=True, index=True)
    config_value = Column(Text, nullable=True)
    config_type = Column(String(20), default='string')  # string, number, boolean, json
    description = Column(Text, nullable=True)

    # Timestamps
    created_at = Column(TIMESTAMP, default=func.now())
    updated_at = Column(TIMESTAMP, default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<FHIRConfig(key={self.config_key}, value={self.config_value})>"

    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': str(self.id),
            'configKey': self.config_key,
            'configValue': self.config_value,
            'configType': self.config_type,
            'description': self.description,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None
        }

    def get_typed_value(self):
        """
        Get configuration value with proper type conversion
        """
        if self.config_type == 'number':
            try:
                if '.' in self.config_value:
                    return float(self.config_value)
                return int(self.config_value)
            except (ValueError, TypeError):
                return None
        elif self.config_type == 'boolean':
            return self.config_value.lower() in ('true', '1', 'yes', 'on') if self.config_value else False
        elif self.config_type == 'json':
            try:
                import json
                return json.loads(self.config_value)
            except (ValueError, TypeError):
                return None
        else:  # string
            return self.config_value
