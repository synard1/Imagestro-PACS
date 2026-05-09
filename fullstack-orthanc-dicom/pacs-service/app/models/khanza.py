"""
Khanza Integration Models
SQLAlchemy models for SIMRS Khanza integration
"""
from sqlalchemy import Column, String, Integer, Boolean, DateTime, Text, ForeignKey, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
import uuid

from app.database import Base


class KhanzaConfig(Base):
    """Khanza API Configuration"""
    __tablename__ = 'khanza_config'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    base_url = Column(String(255), nullable=False)
    api_key = Column(String(255), nullable=False)
    timeout_ms = Column(Integer, default=30000)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    
    __table_args__ = (
        CheckConstraint("base_url != ''", name='chk_base_url_not_empty'),
        CheckConstraint("api_key != ''", name='chk_api_key_not_empty'),
        CheckConstraint('timeout_ms > 0', name='chk_timeout_positive'),
    )
    
    def __repr__(self):
        return f"<KhanzaConfig(id={self.id}, base_url={self.base_url})>"
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': str(self.id),
            'base_url': self.base_url,
            'api_key': self.api_key,
            'timeout_ms': self.timeout_ms,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class KhanzaProcedureMapping(Base):
    """Procedure Code Mapping between Khanza and PACS"""
    __tablename__ = 'khanza_procedure_mappings'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    khanza_code = Column(String(50), nullable=False, unique=True)
    khanza_name = Column(String(255), nullable=False)
    pacs_code = Column(String(50), nullable=False)
    pacs_name = Column(String(255), nullable=False)
    modality = Column(String(20))
    description = Column(Text)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    created_by = Column(String(100))
    updated_by = Column(String(100))
    
    __table_args__ = (
        CheckConstraint("khanza_code != ''", name='chk_khanza_code_not_empty'),
        CheckConstraint("pacs_code != ''", name='chk_pacs_code_not_empty'),
    )
    
    def __repr__(self):
        return f"<KhanzaProcedureMapping(khanza_code={self.khanza_code}, pacs_code={self.pacs_code})>"
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': str(self.id),
            'khanza_code': self.khanza_code,
            'khanza_name': self.khanza_name,
            'pacs_code': self.pacs_code,
            'pacs_name': self.pacs_name,
            'modality': self.modality,
            'description': self.description,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'created_by': self.created_by,
            'updated_by': self.updated_by
        }


class KhanzaDoctorMapping(Base):
    """Doctor Mapping between Khanza and PACS"""
    __tablename__ = 'khanza_doctor_mappings'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    khanza_code = Column(String(50), nullable=False, unique=True)
    khanza_name = Column(String(255), nullable=False)
    pacs_doctor_id = Column(UUID(as_uuid=True), nullable=True)  # References doctors table
    auto_created = Column(Boolean, default=False)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    
    __table_args__ = (
        CheckConstraint("khanza_code != ''", name='chk_khanza_doc_code_not_empty'),
    )
    
    def __repr__(self):
        return f"<KhanzaDoctorMapping(khanza_code={self.khanza_code}, khanza_name={self.khanza_name})>"
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': str(self.id),
            'khanza_code': self.khanza_code,
            'khanza_name': self.khanza_name,
            'pacs_doctor_id': str(self.pacs_doctor_id) if self.pacs_doctor_id else None,
            'auto_created': self.auto_created,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class KhanzaImportHistory(Base):
    """Import History/Audit for Khanza Orders"""
    __tablename__ = 'khanza_import_history'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    noorder = Column(String(50), nullable=False)
    no_rawat = Column(String(50))
    no_rkm_medis = Column(String(50))
    patient_name = Column(String(255))
    procedure_name = Column(String(255))
    import_status = Column(String(20), nullable=False)  # 'success', 'failed', 'partial'
    worklist_item_id = Column(UUID(as_uuid=True), nullable=True)  # References worklist_items
    patient_created = Column(Boolean, default=False)
    patient_updated = Column(Boolean, default=False)
    error_message = Column(Text)
    warnings = Column(JSONB)
    raw_data = Column(JSONB)
    imported_by = Column(String(100))
    imported_at = Column(DateTime, default=func.now())
    
    __table_args__ = (
        CheckConstraint("import_status IN ('success', 'failed', 'partial')", name='chk_import_status'),
        CheckConstraint("noorder != ''", name='chk_noorder_not_empty'),
    )
    
    def __repr__(self):
        return f"<KhanzaImportHistory(noorder={self.noorder}, status={self.import_status})>"
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': str(self.id),
            'noorder': self.noorder,
            'no_rawat': self.no_rawat,
            'no_rkm_medis': self.no_rkm_medis,
            'patient_name': self.patient_name,
            'procedure_name': self.procedure_name,
            'import_status': self.import_status,
            'worklist_item_id': str(self.worklist_item_id) if self.worklist_item_id else None,
            'patient_created': self.patient_created,
            'patient_updated': self.patient_updated,
            'error_message': self.error_message,
            'warnings': self.warnings,
            'raw_data': self.raw_data,
            'imported_by': self.imported_by,
            'imported_at': self.imported_at.isoformat() if self.imported_at else None
        }


class KhanzaUnmappedProcedure(Base):
    """Unmapped/Unknown procedures from Khanza"""
    __tablename__ = 'khanza_unmapped_procedures'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    khanza_code = Column(String(50), nullable=False, unique=True)
    khanza_name = Column(String(255))
    first_seen_at = Column(DateTime, default=func.now())
    last_seen_at = Column(DateTime, default=func.now(), onupdate=func.now())
    occurrence_count = Column(Integer, default=1)
    is_active = Column(Boolean, default=True)
    
    __table_args__ = (
        CheckConstraint("khanza_code != ''", name='chk_unmapped_khanza_code_not_empty'),
    )

    def __repr__(self):
        return f"<KhanzaUnmappedProcedure(code={self.khanza_code})>"
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': str(self.id),
            'khanza_code': self.khanza_code,
            'khanza_name': self.khanza_name,
            'first_seen_at': self.first_seen_at.isoformat() if self.first_seen_at else None,
            'last_seen_at': self.last_seen_at.isoformat() if self.last_seen_at else None,
            'occurrence_count': self.occurrence_count,
            'is_active': self.is_active
        }
