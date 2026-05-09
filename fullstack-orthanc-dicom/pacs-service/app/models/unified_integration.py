"""
Unified SIMRS Integration Models
Consolidates external system integrations (Khanza, GOS, Generic, etc.)
"""

from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, JSON, Text, UniqueConstraint, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

from app.database import Base


class IntegrationModule(Base):
    """Global configuration for integration modules (BPJS, SatuSehat, etc.)"""
    __tablename__ = "integration_modules"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code = Column(String(50), nullable=False, unique=True)
    name = Column(String(255), nullable=False)
    icon = Column(String(100), nullable=True)
    provider_type = Column(String(100), nullable=False)  # bpjs, satusehat, generic
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    external_systems = relationship("ExternalSystem", back_populates="module")

    def to_dict(self):
        return {
            'id': str(self.id),
            'code': self.code,
            'name': self.name,
            'icon': self.icon,
            'provider_type': self.provider_type,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


class ExternalSystem(Base):
    """Unified configuration for all external system integrations"""
    __tablename__ = "external_systems"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    module_id = Column(UUID(as_uuid=True), ForeignKey("integration_modules.id", ondelete="SET NULL"), nullable=True, index=True)
    code = Column(String(50), nullable=False)
    name = Column(String(255), nullable=False)
    type = Column(String(50), nullable=False)  # SIMRS, HIS, RIS, PACS, LIS, EMR
    provider = Column(String(100), nullable=False, default='generic')  # khanza, gos, generic
    vendor = Column(String(100), nullable=True)
    version = Column(String(50), nullable=True)
    base_url = Column(String(500), nullable=True)
    auth_type = Column(String(50), nullable=False, default='none')  # none, api_key, basic, bearer, jwt
    auth_config = Column(JSON, nullable=True)  # encrypted credentials
    cons_id = Column(String(255), nullable=True)
    secret_key = Column(String(500), nullable=True)  # encrypted
    db_host = Column(String(255), nullable=True)
    db_name = Column(String(255), nullable=True)
    db_user = Column(String(255), nullable=True)
    db_password = Column(String(500), nullable=True)
    db_port = Column(Integer, default=3306)  # encrypted
    timeout_ms = Column(Integer, nullable=False, default=30000)
    health_path = Column(String(100), nullable=True, default='/health')
    capabilities = Column(JSON, nullable=False, default={})
    field_mappings = Column(JSON, nullable=False, default={})
    facility_code = Column(String(50), nullable=True)
    facility_name = Column(String(255), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    is_default = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(String(100), nullable=True)
    updated_by = Column(String(100), nullable=True)

    # Relationships
    module = relationship("IntegrationModule", back_populates="external_systems")
    procedure_mappings = relationship("UnifiedProcedureMapping", back_populates="external_system", cascade="all, delete-orphan")
    doctor_mappings = relationship("UnifiedDoctorMapping", back_populates="external_system", cascade="all, delete-orphan")
    operator_mappings = relationship("UnifiedOperatorMapping", back_populates="external_system", cascade="all, delete-orphan")
    import_history = relationship("UnifiedImportHistory", back_populates="external_system", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint("code != ''", name="chk_code_not_empty"),
        CheckConstraint("name != ''", name="chk_name_not_empty"),
        CheckConstraint("type IN ('SIMRS', 'HIS', 'RIS', 'PACS', 'LIS', 'EMR')", name="chk_type_valid"),
        CheckConstraint("provider IN ('khanza', 'gos', 'generic')", name="chk_provider_valid"),
        CheckConstraint("timeout_ms > 0", name="chk_timeout_positive"),
    )

    def to_dict(self, include_credentials: bool = False, mask_credentials: bool = True):
        """
        Convert to dictionary.

        Args:
            include_credentials: If True, include credential fields
            mask_credentials: If True, mask sensitive values (default)
        """
        from app.utils.crypto import decrypt_value, mask_value

        # Extract auth credentials from auth_config
        auth_config = self.auth_config or {}

        result = {
            'id': str(self.id),
            'tenant_id': str(self.tenant_id) if self.tenant_id else None,
            'module_id': str(self.module_id) if self.module_id else None,
            'code': self.code,
            'name': self.name,
            'type': self.type,
            'provider': self.provider,
            'vendor': self.vendor,
            'version': self.version,
            'base_url': self.base_url,
            'auth_type': self.auth_type,
            'cons_id': self.cons_id,
            'db_host': self.db_host,
            'db_name': self.db_name,
            'db_user': self.db_user,
            'timeout_ms': self.timeout_ms,
            'health_path': self.health_path,
            'capabilities': self.capabilities,
            'field_mappings': self.field_mappings,
            'facility_code': self.facility_code,
            'facility_name': self.facility_name,
            'is_active': self.is_active,
            'is_default': self.is_default,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'created_by': self.created_by,
            'updated_by': self.updated_by,
        }

        if include_credentials:
            # Decrypt and optionally mask credentials
            api_key = auth_config.get('api_key', '')
            username = auth_config.get('username', '')
            password = auth_config.get('password', '')
            secret_key = self.secret_key or ''
            db_password = self.db_password or ''

            # Decrypt if encrypted
            if api_key:
                api_key = decrypt_value(api_key) or api_key
            if password:
                password = decrypt_value(password) or password
            if secret_key:
                secret_key = decrypt_value(secret_key) or secret_key
            if db_password:
                db_password = decrypt_value(db_password) or db_password

            if mask_credentials:
                result['api_key'] = mask_value(api_key) if api_key else ''
                result['username'] = username  # Username not masked
                result['password'] = mask_value(password) if password else ''
                result['secret_key'] = mask_value(secret_key) if secret_key else ''
                result['db_password'] = mask_value(db_password) if db_password else ''
            else:
                result['api_key'] = api_key
                result['username'] = username
                result['password'] = password
                result['secret_key'] = secret_key
                result['db_password'] = db_password

            # Indicate if credentials are set
            result['has_api_key'] = bool(auth_config.get('api_key'))
            result['has_password'] = bool(auth_config.get('password'))
            result['has_secret_key'] = bool(self.secret_key)
            result['has_db_password'] = bool(self.db_password)
        else:
            # Just indicate if credentials are set
            result['has_api_key'] = bool(auth_config.get('api_key'))
            result['has_password'] = bool(auth_config.get('password'))
            result['has_secret_key'] = bool(self.secret_key)
            result['has_db_password'] = bool(self.db_password)

        return result

    def get_decrypted_credentials(self) -> dict:
        """
        Get decrypted credentials for use in connections.
        This should only be called server-side when making connections.
        """
        from app.utils.crypto import decrypt_value

        auth_config = self.auth_config or {}

        api_key = auth_config.get('api_key', '')
        password = auth_config.get('password', '')
        secret_key = self.secret_key or ''
        db_password = self.db_password or ''

        # Decrypt if encrypted
        if api_key:
            api_key = decrypt_value(api_key) or api_key
        if password:
            password = decrypt_value(password) or password
        if secret_key:
            secret_key = decrypt_value(secret_key) or secret_key
        if db_password:
            db_password = decrypt_value(db_password) or db_password

        return {
            'api_key': api_key,
            'username': auth_config.get('username', ''),
            'password': password,
            'cons_id': self.cons_id,
            'secret_key': secret_key,
            'db_host': self.db_host,
            'db_name': self.db_name,
            'db_user': self.db_user,
            'db_password': db_password,
        }

class UnifiedProcedureMapping(Base):
    """Unified mapping between external system procedure codes and PACS procedure codes"""
    __tablename__ = "unified_procedure_mappings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    external_system_id = Column(UUID(as_uuid=True), ForeignKey("external_systems.id", ondelete="CASCADE"), nullable=False)
    external_code = Column(String(100), nullable=False)
    external_name = Column(String(255), nullable=False)
    pacs_code = Column(String(100), nullable=False)
    pacs_name = Column(String(255), nullable=False)
    modality = Column(String(20), nullable=True)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(String(100), nullable=True)
    updated_by = Column(String(100), nullable=True)

    # Relationships
    external_system = relationship("ExternalSystem", back_populates="procedure_mappings")

    __table_args__ = (
        UniqueConstraint("external_system_id", "external_code", name="uk_unified_proc_map"),
        CheckConstraint("external_code != ''", name="chk_external_code_not_empty"),
        CheckConstraint("pacs_code != ''", name="chk_pacs_code_not_empty"),
    )

    def to_dict(self):
        return {
            'id': str(self.id),
            'external_system_id': str(self.external_system_id),
            'external_code': self.external_code,
            'external_name': self.external_name,
            'pacs_code': self.pacs_code,
            'pacs_name': self.pacs_name,
            'modality': self.modality,
            'description': self.description,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'created_by': self.created_by,
            'updated_by': self.updated_by,
        }


class UnifiedDoctorMapping(Base):
    """Unified mapping between external system doctor codes and PACS doctor IDs"""
    __tablename__ = "unified_doctor_mappings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    external_system_id = Column(UUID(as_uuid=True), ForeignKey("external_systems.id", ondelete="CASCADE"), nullable=False)
    external_code = Column(String(100), nullable=False)
    external_name = Column(String(255), nullable=False)
    pacs_doctor_id = Column(UUID(as_uuid=True), nullable=True)  # References doctors.id
    auto_created = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(String(100), nullable=True)
    updated_by = Column(String(100), nullable=True)

    # Relationships
    external_system = relationship("ExternalSystem", back_populates="doctor_mappings")

    __table_args__ = (
        UniqueConstraint("external_system_id", "external_code", name="uk_unified_doc_map"),
        CheckConstraint("external_code != ''", name="chk_external_doc_code_not_empty"),
    )

    def to_dict(self):
        return {
            'id': str(self.id),
            'external_system_id': str(self.external_system_id),
            'external_code': self.external_code,
            'external_name': self.external_name,
            'pacs_doctor_id': str(self.pacs_doctor_id) if self.pacs_doctor_id else None,
            'auto_created': self.auto_created,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'created_by': self.created_by,
            'updated_by': self.updated_by,
        }


class UnifiedOperatorMapping(Base):
    """Unified mapping between PACS users and external system operators"""
    __tablename__ = "unified_operator_mappings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    external_system_id = Column(UUID(as_uuid=True), ForeignKey("external_systems.id", ondelete="CASCADE"), nullable=False)
    pacs_user_id = Column(UUID(as_uuid=True), nullable=False)  # References users.id
    pacs_username = Column(String(100), nullable=False)
    external_operator_code = Column(String(100), nullable=False)
    external_operator_name = Column(String(255), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    created_by = Column(String(100), nullable=True)
    updated_by = Column(String(100), nullable=True)

    # Relationships
    external_system = relationship("ExternalSystem", back_populates="operator_mappings")

    __table_args__ = (
        UniqueConstraint("external_system_id", "pacs_user_id", name="uk_unified_op_map"),
        CheckConstraint("external_operator_code != ''", name="chk_external_op_code_not_empty"),
        CheckConstraint("pacs_username != ''", name="chk_pacs_username_not_empty"),
    )

    def to_dict(self):
        return {
            'id': str(self.id),
            'external_system_id': str(self.external_system_id),
            'pacs_user_id': str(self.pacs_user_id),
            'pacs_username': self.pacs_username,
            'external_operator_code': self.external_operator_code,
            'external_operator_name': self.external_operator_name,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'created_by': self.created_by,
            'updated_by': self.updated_by,
        }


class UnifiedImportHistory(Base):
    """Audit trail for order imports from external systems"""
    __tablename__ = "unified_import_history"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    external_system_id = Column(UUID(as_uuid=True), ForeignKey("external_systems.id", ondelete="CASCADE"), nullable=False)
    external_order_id = Column(String(100), nullable=False)
    external_visit_id = Column(String(100), nullable=True)
    patient_mrn = Column(String(100), nullable=True)
    patient_name = Column(String(255), nullable=True)
    procedure_code = Column(String(100), nullable=True)
    procedure_name = Column(String(255), nullable=True)
    import_status = Column(String(20), nullable=False)  # success, failed, partial
    worklist_item_id = Column(UUID(as_uuid=True), nullable=True)  # References worklist_items.id
    patient_created = Column(Boolean, nullable=False, default=False)
    patient_updated = Column(Boolean, nullable=False, default=False)
    error_message = Column(Text, nullable=True)
    warnings = Column(JSON, nullable=True)
    raw_data = Column(JSON, nullable=True)
    imported_by = Column(String(100), nullable=True)
    operator_name = Column(String(255), nullable=True)
    imported_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    # Relationships
    external_system = relationship("ExternalSystem", back_populates="import_history")

    __table_args__ = (
        CheckConstraint("import_status IN ('success', 'failed', 'partial')", name="chk_import_status"),
        CheckConstraint("external_order_id != ''", name="chk_external_order_id_not_empty"),
    )

    def to_dict(self):
        return {
            'id': str(self.id),
            'external_system_id': str(self.external_system_id),
            'external_order_id': self.external_order_id,
            'external_visit_id': self.external_visit_id,
            'patient_mrn': self.patient_mrn,
            'patient_name': self.patient_name,
            'procedure_code': self.procedure_code,
            'procedure_name': self.procedure_name,
            'import_status': self.import_status,
            'worklist_item_id': str(self.worklist_item_id) if self.worklist_item_id else None,
            'patient_created': self.patient_created,
            'patient_updated': self.patient_updated,
            'error_message': self.error_message,
            'warnings': self.warnings,
            'raw_data': self.raw_data,
            'imported_by': self.imported_by,
            'operator_name': self.operator_name,
            'imported_at': self.imported_at.isoformat() if self.imported_at else None,
        }



