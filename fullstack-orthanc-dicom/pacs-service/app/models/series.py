"""
Series Model
DICOM Series-level metadata
"""

from sqlalchemy import Column, String, Integer, BigInteger, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class Series(Base):
    """PACS Series Model"""
    
    __tablename__ = "pacs_series"
    
    series_instance_uid = Column(String(64), primary_key=True)
    study_instance_uid = Column(String(64), ForeignKey("pacs_studies.study_instance_uid", ondelete="CASCADE"), nullable=False, index=True)
    series_number = Column(Integer, nullable=True)
    series_description = Column(String(255), nullable=True)
    modality = Column(String(16), nullable=True, index=True)
    body_part_examined = Column(String(16), nullable=True, index=True)
    number_of_instances = Column(Integer, default=0)
    storage_size = Column(BigInteger, default=0)
    orthanc_id = Column(String(64), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relationships
    study = relationship("Study", back_populates="series")
    instances = relationship("Instance", back_populates="series", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Series(uid={self.series_instance_uid}, study={self.study_instance_uid})>"
