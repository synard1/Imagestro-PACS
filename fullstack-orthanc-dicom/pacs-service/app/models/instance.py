"""
Instance Model
DICOM Instance-level metadata
"""

from sqlalchemy import Column, String, Integer, BigInteger, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class Instance(Base):
    """PACS Instance Model"""
    
    __tablename__ = "pacs_instances"
    
    sop_instance_uid = Column(String(64), primary_key=True)
    series_instance_uid = Column(String(64), ForeignKey("pacs_series.series_instance_uid", ondelete="CASCADE"), nullable=False, index=True)
    instance_number = Column(Integer, nullable=True)
    sop_class_uid = Column(String(64), nullable=True, index=True)
    transfer_syntax_uid = Column(String(64), nullable=True)
    file_size = Column(BigInteger, nullable=True)
    file_path = Column(String(512), nullable=True)
    orthanc_id = Column(String(64), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    series = relationship("Series", back_populates="instances")
    
    def __repr__(self):
        return f"<Instance(uid={self.sop_instance_uid}, series={self.series_instance_uid})>"
