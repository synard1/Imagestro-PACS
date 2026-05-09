"""
DICOM Node Model - Represents remote DICOM entities (modalities, PACS)
"""

from sqlalchemy import Column, String, Integer, Boolean, DateTime, Text, BigInteger, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
import uuid
from app.database import Base


class DicomNode(Base):
    """DICOM Network Node (AE Title configuration)"""

    __tablename__ = "pacs_dicom_nodes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Node Information
    ae_title = Column(String(16), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)

    # Network Configuration
    host = Column(String(255), nullable=False)
    port = Column(Integer, nullable=False)

    # Node Type
    node_type = Column(String(20), nullable=False)  # modality, pacs, workstation
    modality = Column(String(16), nullable=True)  # CT, MRI, XR, etc.

    # Capabilities
    supports_c_store = Column(Boolean, default=True)
    supports_c_find = Column(Boolean, default=True)
    supports_c_move = Column(Boolean, default=True)
    supports_c_echo = Column(Boolean, default=True)

    # Security
    require_authentication = Column(Boolean, default=False)
    username = Column(String(100), nullable=True)
    password_hash = Column(String(255), nullable=True)

    # Status
    is_active = Column(Boolean, default=True)
    is_online = Column(Boolean, default=False)
    last_seen = Column(DateTime(timezone=True), nullable=True)
    last_echo = Column(DateTime(timezone=True), nullable=True)

    # Statistics
    total_studies_received = Column(Integer, default=0)
    total_studies_sent = Column(Integer, default=0)
    total_success = Column(Integer, default=0)
    total_failed = Column(Integer, default=0)
    total_bytes_received = Column(BigInteger, default=0)
    total_bytes_sent = Column(BigInteger, default=0)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # hospital_id for multi-tenancy
    hospital_id = Column(String(100), nullable=True)

    # Configuration (JSON)
    config = Column(JSONB, nullable=True)

    def __repr__(self):
        return f"<DicomNode {self.ae_title} ({self.name})>"
