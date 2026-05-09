"""
Measurement Model
Store DICOM viewer measurements (Length, Angle, ROI, etc.)
"""

from sqlalchemy import Column, String, Integer, Float, DateTime, Text, JSON, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
import uuid

from app.database import Base


class Measurement(Base):
    """PACS Measurement Model - Stores viewer measurements"""

    __tablename__ = "pacs_measurements"

    # Primary Key
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    # Relationship to Study
    study_instance_uid = Column(String(64), ForeignKey("pacs_studies.study_instance_uid", ondelete="CASCADE"), nullable=False, index=True)
    series_instance_uid = Column(String(64), nullable=True, index=True)
    sop_instance_uid = Column(String(64), nullable=True, index=True)

    # Measurement Information
    annotation_uid = Column(String(64), nullable=False, unique=True, index=True)  # Cornerstone annotation UID
    tool_name = Column(String(64), nullable=False)  # Length, Angle, CobbAngle, RectangleROI, etc.

    # Measurement Data (stored as JSON)
    measurement_data = Column(JSON, nullable=False)  # Full annotation data from Cornerstone

    # Computed Values (for quick access)
    value = Column(Float, nullable=True)  # Numeric value (length, angle, area)
    unit = Column(String(16), nullable=True)  # mm, degrees, mm², etc.
    formatted_value = Column(String(64), nullable=True)  # "12.5 mm", "45.2°", etc.

    # Viewport Information
    viewport_id = Column(String(64), nullable=True)
    image_index = Column(Integer, nullable=True)

    # User Information
    created_by = Column(String(255), nullable=True)  # User who created the measurement

    # Timestamps
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow, server_default=func.now())

    # Soft delete
    deleted_at = Column(DateTime, nullable=True)

    def __repr__(self):
        return f"<Measurement(id={self.id}, tool={self.tool_name}, value={self.formatted_value})>"

    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': self.id,
            'study_instance_uid': self.study_instance_uid,
            'series_instance_uid': self.series_instance_uid,
            'sop_instance_uid': self.sop_instance_uid,
            'annotation_uid': self.annotation_uid,
            'tool_name': self.tool_name,
            'measurement_data': self.measurement_data,
            'value': self.value,
            'unit': self.unit,
            'formatted_value': self.formatted_value,
            'viewport_id': self.viewport_id,
            'image_index': self.image_index,
            'created_by': self.created_by,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
