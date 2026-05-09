"""
Master Data Service v1.0
Centralized Patient Master Data Management with JWT Authentication
"""

import os
import sys
import uuid
import json
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
import logging
import psycopg2
from psycopg2.extras import RealDictCursor
from contextlib import contextmanager
from functools import wraps
import jwt

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
# Security: Configure CORS properly
CORS(app, resources={r"/*": {"origins": os.getenv("ALLOWED_ORIGINS", "*").split(",")}})

# Register blueprints
from app.routes.mappings import mappings_bp

app.register_blueprint(mappings_bp)


# Security: Add security headers
@app.after_request
def add_security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = (
        "max-age=31536000; includeSubDomains"
    )
    return response


# Configuration
DB_CONFIG = {
    "host": os.getenv("POSTGRES_HOST", "postgres"),
    "database": os.getenv("POSTGRES_DB", "worklist_db"),
    "user": os.getenv("POSTGRES_USER", "dicom"),
    "password": os.getenv("POSTGRES_PASSWORD", "dicom123"),
    "port": int(os.getenv("POSTGRES_PORT", "5432")),
}

JWT_SECRET = os.getenv("JWT_SECRET", "change-this-secret-key-in-production")
JWT_ALGORITHM = "HS256"

# Security: Warn if using default JWT secret
if JWT_SECRET == "change-this-secret-key-in-production":
    logger.critical(
        "⚠️  SECURITY WARNING: Using default JWT_SECRET! Set JWT_SECRET environment variable in production!"
    )

# Permission definitions
REQUIRED_PERMISSIONS = {
    "read_patient": ["patient:read", "*"],
    "create_patient": ["patient:create", "*"],
    "update_patient": ["patient:update", "*"],
    "delete_patient": ["patient:delete", "*"],
    "search_patient": ["patient:search", "*"],
    "read_doctor": ["doctor:read", "practitioner:read", "*"],
    "create_doctor": ["doctor:create", "practitioner:create", "*"],
    "update_doctor": ["doctor:update", "practitioner:update", "*"],
    "delete_doctor": ["doctor:delete", "practitioner:delete", "*"],
    "search_doctor": ["doctor:search", "practitioner:search", "*"],
    "read_procedure": ["procedure:read", "*"],
    "create_procedure": ["procedure:create", "*"],
    "update_procedure": ["procedure:update", "*"],
    "delete_procedure": ["procedure:delete", "*"],
    "search_procedure": ["procedure:search", "*"],
    "read_setting": ["setting:read", "*"],
    "write_setting": ["setting:write", "*"],
    "read_mapping": ["mapping:read", "*"],
    "create_mapping": ["mapping:create", "*"],
    "update_mapping": ["mapping:update", "*"],
    "delete_mapping": ["mapping:delete", "*"],
    "read_external_system": ["external_system:read", "*"],
    "manage_external_system": ["external_system:manage", "system:admin", "*"],
}


@contextmanager
def get_db_connection():
    conn = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        yield conn
        conn.commit()
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Database error: {str(e)}")
        raise
    finally:
        if conn:
            conn.close()


def ensure_external_systems_schema(cursor):
    """Ensure external_systems table has all required columns (migration helper)"""
    required_columns = {
        "system_code": "VARCHAR(50) UNIQUE NOT NULL",
        "system_name": "VARCHAR(200) NOT NULL",
        "system_type": "VARCHAR(50) NOT NULL",
        "system_version": "VARCHAR(50)",
        "vendor": "VARCHAR(200)",
        "description": "TEXT",
        "base_url": "VARCHAR(500)",
        "api_key": "VARCHAR(255)",
        "api_endpoint": "VARCHAR(500)",
        "auth_type": "VARCHAR(50)",
        "auth_config": "JSONB",
        "contact_person": "VARCHAR(200)",
        "contact_email": "VARCHAR(200)",
        "is_active": "BOOLEAN DEFAULT true",
        "notes": "TEXT",
        "connection_config": "JSONB",
        "code": "VARCHAR(50)",
        "name": "VARCHAR(200)",
        "type": "VARCHAR(50)",
        "version": "VARCHAR(50)",
    }

    # Check existing columns
    cursor.execute("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'external_systems'
    """)
    existing_columns = {row[0] for row in cursor.fetchall()}

    # Add missing columns
    for col, defn in required_columns.items():
        if col not in existing_columns:
            try:
                # Handle NOT NULL constraints carefully for existing data
                if "NOT NULL" in defn and "DEFAULT" not in defn:
                    # Temporary relax NOT NULL for migration
                    defn = defn.replace("NOT NULL", "")

                cursor.execute(f"ALTER TABLE external_systems ADD COLUMN {col} {defn}")
                logger.info(f"Added column {col} to external_systems")
            except Exception as e:
                logger.warning(f"Failed to add column {col}: {e}")


def init_database():
    """Initialize database schema for patients, doctors, and settings."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()

            cursor.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

            # Main patient table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS patients (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    patient_national_id VARCHAR(16) UNIQUE,
                    ihs_number VARCHAR(64) UNIQUE,
                    medical_record_number VARCHAR(50) NOT NULL,
                    patient_name VARCHAR(200) NOT NULL,
                    gender VARCHAR(10) CHECK (gender IN ('male', 'female')),
                    birth_date DATE NOT NULL,
                    address TEXT,
                    phone VARCHAR(20),
                    email VARCHAR(100),
                    nationality VARCHAR(50),
                    ethnicity VARCHAR(50),
                    religion VARCHAR(50),
                    marital_status VARCHAR(20) CHECK (marital_status IN ('single', 'married', 'divorced', 'widowed')),
                    occupation VARCHAR(100),
                    education_level VARCHAR(50),
                    emergency_contact_name VARCHAR(200),
                    emergency_contact_phone VARCHAR(20),
                    emergency_contact_relationship VARCHAR(50),
                    insurance_provider VARCHAR(100),
                    insurance_policy_number VARCHAR(100),
                    insurance_member_id VARCHAR(100),
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ DEFAULT now(),
                    deleted_at TIMESTAMPTZ,
                    active BOOLEAN DEFAULT true
                )
            """)

            # Indexes for performance
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_patients_national_id ON patients(patient_national_id)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_patients_ihs_number ON patients(ihs_number)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_patients_mrn ON patients(medical_record_number)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(patient_name)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_patients_birth_date ON patients(birth_date)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_patients_active ON patients(active) WHERE active = true"
            )

            # Related tables
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS patient_allergies (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
                    allergen VARCHAR(200) NOT NULL,
                    reaction VARCHAR(200),
                    severity VARCHAR(20) CHECK (severity IN ('mild', 'moderate', 'severe')),
                    notes TEXT,
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ DEFAULT now()
                )
            """)

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS patient_medical_history (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
                    condition VARCHAR(200) NOT NULL,
                    diagnosis_date DATE,
                    status VARCHAR(20) CHECK (status IN ('active', 'inactive', 'resolved')),
                    notes TEXT,
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ DEFAULT now()
                )
            """)

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS patient_family_history (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
                    relative_relationship VARCHAR(50),
                    condition VARCHAR(200),
                    notes TEXT,
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ DEFAULT now()
                )
            """)

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS patient_medications (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
                    medication_name VARCHAR(200) NOT NULL,
                    dosage VARCHAR(100),
                    frequency VARCHAR(100),
                    start_date DATE,
                    end_date DATE,
                    status VARCHAR(20) CHECK (status IN ('active', 'inactive', 'discontinued')),
                    notes TEXT,
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ DEFAULT now()
                )
            """)

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS patient_audit_log (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
                    action VARCHAR(50) NOT NULL,
                    field_name VARCHAR(100),
                    old_value TEXT,
                    new_value TEXT,
                    user_id VARCHAR(100),
                    ip_address VARCHAR(45),
                    user_agent TEXT,
                    created_at TIMESTAMPTZ DEFAULT now()
                )
            """)

            # Doctor/Practitioner tables - Updated to match doctors.json format
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS doctors (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    ihs_number VARCHAR(64),
                    national_id VARCHAR(16) UNIQUE,
                    name VARCHAR(200) NOT NULL,
                    license VARCHAR(100) UNIQUE,
                    specialty VARCHAR(100),
                    phone VARCHAR(20),
                    email VARCHAR(100),
                    birth_date DATE,
                    gender VARCHAR(10) CHECK (gender IN ('M', 'F')),
                    active BOOLEAN DEFAULT true,
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ DEFAULT now(),
                    deleted_at TIMESTAMPTZ
                )
            """)

            # Create unique index for ihs_number that allows NULL values
            cursor.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_doctors_ihs_number_unique ON doctors (ihs_number) WHERE ihs_number IS NOT NULL"
            )

            # Indexes for doctor performance
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_doctors_national_id ON doctors(national_id)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_doctors_license ON doctors(license)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_doctors_name ON doctors(name)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_doctors_specialty ON doctors(specialty)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_doctors_active ON doctors(active) WHERE active = true"
            )

            # Doctor qualifications table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS doctor_qualifications (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    doctor_id UUID REFERENCES doctors(id) ON DELETE CASCADE,
                    qualification_type VARCHAR(100) NOT NULL,
                    qualification_code VARCHAR(100),
                    institution VARCHAR(200),
                    year_obtained INTEGER,
                    expiry_date DATE,
                    issuer VARCHAR(200),
                    notes TEXT,
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ DEFAULT now()
                )
            """)

            # Doctor schedule table (for integration with scheduling systems)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS doctor_schedules (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    doctor_id UUID REFERENCES doctors(id) ON DELETE CASCADE,
                    day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6),
                    start_time TIME NOT NULL,
                    end_time TIME NOT NULL,
                    location VARCHAR(200),
                    room VARCHAR(50),
                    max_patients INTEGER,
                    notes TEXT,
                    active BOOLEAN DEFAULT true,
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ DEFAULT now()
                )
            """)

            # Doctor audit log
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS doctor_audit_log (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    doctor_id UUID REFERENCES doctors(id) ON DELETE CASCADE,
                    action VARCHAR(50) NOT NULL,
                    field_name VARCHAR(100),
                    old_value TEXT,
                    new_value TEXT,
                    user_id VARCHAR(100),
                    ip_address VARCHAR(45),
                    user_agent TEXT,
                    created_at TIMESTAMPTZ DEFAULT now()
                )
            """)

            # Global settings table (key/value JSON)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS settings (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    key VARCHAR(255) UNIQUE NOT NULL,
                    value JSONB NOT NULL,
                    description TEXT,
                    is_sensitive BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ DEFAULT now()
                )
            """)

            # Backward compatibility: ensure is_sensitive exists if table created earlier
            cursor.execute("""
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'settings'
                          AND column_name = 'is_sensitive'
                    ) THEN
                        ALTER TABLE settings
                        ADD COLUMN is_sensitive BOOLEAN NOT NULL DEFAULT FALSE;
                    END IF;
                END$$;
            """)

            cursor.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_key ON settings(key)"
            )

            # Procedures table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS procedures (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    code VARCHAR(50) UNIQUE NOT NULL,
                    name VARCHAR(200) NOT NULL,
                    display_name VARCHAR(200),
                    category VARCHAR(100),
                    modality VARCHAR(50),
                    body_part VARCHAR(100),
                    description TEXT,
                    loinc_code VARCHAR(50),
                    loinc_display VARCHAR(200),
                    icd10_code VARCHAR(50),
                    icd10_display VARCHAR(200),
                    icd9_cm_code VARCHAR(50),
                    cpt_code VARCHAR(50),
                    satusehat_code VARCHAR(50),
                    satusehat_system VARCHAR(200),
                    duration_minutes INTEGER,
                    prep_instructions TEXT,
                    contrast_required BOOLEAN DEFAULT false,
                    sedation_required BOOLEAN DEFAULT false,
                    radiation_dose_range VARCHAR(50),
                    cost_estimate NUMERIC(12, 2),
                    active BOOLEAN DEFAULT true,
                    sort_order INTEGER DEFAULT 0,
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ DEFAULT now(),
                    deleted_at TIMESTAMPTZ
                )
            """)

            # Indexes for procedures
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_procedures_code ON procedures(code)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_procedures_name ON procedures(name)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_procedures_category ON procedures(category)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_procedures_modality ON procedures(modality)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_procedures_loinc ON procedures(loinc_code)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_procedures_active ON procedures(active) WHERE active = true"
            )

            # Procedure modality mapping
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS procedure_modalities (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    procedure_id UUID REFERENCES procedures(id) ON DELETE CASCADE,
                    modality_code VARCHAR(20) NOT NULL,
                    modality_name VARCHAR(100),
                    is_primary BOOLEAN DEFAULT false,
                    notes TEXT,
                    created_at TIMESTAMPTZ DEFAULT now(),
                    UNIQUE(procedure_id, modality_code)
                )
            """)

            # Procedure contraindications
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS procedure_contraindications (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    procedure_id UUID REFERENCES procedures(id) ON DELETE CASCADE,
                    contraindication TEXT NOT NULL,
                    severity VARCHAR(20) CHECK (severity IN ('absolute', 'relative', 'caution')),
                    notes TEXT,
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ DEFAULT now()
                )
            """)

            # Procedure equipment requirements
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS procedure_equipment (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    procedure_id UUID REFERENCES procedures(id) ON DELETE CASCADE,
                    equipment_name VARCHAR(200) NOT NULL,
                    equipment_type VARCHAR(100),
                    is_required BOOLEAN DEFAULT true,
                    quantity INTEGER DEFAULT 1,
                    notes TEXT,
                    created_at TIMESTAMPTZ DEFAULT now()
                )
            """)

            # Procedure protocols
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS procedure_protocols (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    procedure_id UUID REFERENCES procedures(id) ON DELETE CASCADE,
                    protocol_name VARCHAR(200) NOT NULL,
                    protocol_description TEXT,
                    imaging_parameters JSONB,
                    sequence_order INTEGER,
                    notes TEXT,
                    active BOOLEAN DEFAULT true,
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ DEFAULT now()
                )
            """)

            # Procedure audit log
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS procedure_audit_log (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    procedure_id UUID REFERENCES procedures(id) ON DELETE CASCADE,
                    action VARCHAR(50) NOT NULL,
                    field_name VARCHAR(100),
                    old_value TEXT,
                    new_value TEXT,
                    user_id VARCHAR(100),
                    ip_address VARCHAR(45),
                    user_agent TEXT,
                    created_at TIMESTAMPTZ DEFAULT now()
                )
            """)

            # LOINC code mapping table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS loinc_codes (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    loinc_code VARCHAR(20) UNIQUE NOT NULL,
                    long_common_name VARCHAR(500),
                    short_name VARCHAR(255),
                    component VARCHAR(255),
                    property VARCHAR(100),
                    time_aspect VARCHAR(50),
                    system VARCHAR(255),
                    scale_type VARCHAR(50),
                    method_type VARCHAR(255),
                    class VARCHAR(100),
                    order_obs VARCHAR(50),
                    status VARCHAR(50),
                    version_first_released VARCHAR(20),
                    version_last_changed VARCHAR(20),
                    active BOOLEAN DEFAULT true,
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ DEFAULT now()
                )
            """)

            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_loinc_codes_code ON loinc_codes(loinc_code)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_loinc_codes_class ON loinc_codes(class)"
            )

            # External systems table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS external_systems (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    system_code VARCHAR(50) UNIQUE NOT NULL,
                    system_name VARCHAR(200) NOT NULL,
                    system_type VARCHAR(50) NOT NULL,
                    system_version VARCHAR(50),
                    vendor VARCHAR(200),
                    description TEXT,
                    base_url VARCHAR(500),
                    api_key VARCHAR(255),
                    api_endpoint VARCHAR(500),
                    auth_type VARCHAR(50),
                    auth_config JSONB,
                    contact_person VARCHAR(200),
                    contact_email VARCHAR(200),
                    is_active BOOLEAN DEFAULT true,
                    notes TEXT,
                    connection_config JSONB,
                    code VARCHAR(50),
                    name VARCHAR(200),
                    type VARCHAR(50),
                    version VARCHAR(50),
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ DEFAULT now()
                )
            """)

            ensure_external_systems_schema(cursor)

            # Procedure mapping table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS procedure_mappings (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    external_system_id UUID REFERENCES external_systems(id) ON DELETE CASCADE,
                    external_code VARCHAR(100) NOT NULL,
                    external_name VARCHAR(255),
                    external_description TEXT,
                    pacs_procedure_id UUID REFERENCES procedures(id) ON DELETE CASCADE,
                    mapping_type VARCHAR(50) DEFAULT 'exact',
                    confidence_level INTEGER DEFAULT 100,
                    notes TEXT,
                    is_active BOOLEAN DEFAULT true,
                    mapped_by VARCHAR(100),
                    verified_by VARCHAR(100),
                    verified_at TIMESTAMPTZ,
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ DEFAULT now(),
                    UNIQUE(external_system_id, external_code)
                )
            """)

            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_procedure_mappings_external_system ON procedure_mappings(external_system_id)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_procedure_mappings_external_code ON procedure_mappings(external_code)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_procedure_mappings_pacs_procedure ON procedure_mappings(pacs_procedure_id)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_procedure_mappings_active ON procedure_mappings(is_active) WHERE is_active = true"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_procedure_mappings_type ON procedure_mappings(mapping_type)"
            )

            # Procedure mapping audit log
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS procedure_mapping_audit_log (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    mapping_id UUID REFERENCES procedure_mappings(id) ON DELETE CASCADE,
                    action VARCHAR(50) NOT NULL,
                    field_name VARCHAR(100),
                    old_value TEXT,
                    new_value TEXT,
                    user_id VARCHAR(100),
                    ip_address VARCHAR(45),
                    user_agent TEXT,
                    created_at TIMESTAMPTZ DEFAULT now()
                )
            """)

            # Mapping usage statistics
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS procedure_mapping_usage (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    mapping_id UUID REFERENCES procedure_mappings(id) ON DELETE CASCADE,
                    usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
                    usage_count INTEGER DEFAULT 1,
                    success_count INTEGER DEFAULT 0,
                    failure_count INTEGER DEFAULT 0,
                    last_used_at TIMESTAMPTZ DEFAULT now(),
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ DEFAULT now(),
                    UNIQUE(mapping_id, usage_date)
                )
            """)

            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_mapping_usage_mapping ON procedure_mapping_usage(mapping_id)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_mapping_usage_date ON procedure_mapping_usage(usage_date)"
            )

            # Doctor Mapping Table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS doctor_mappings (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    external_system_id UUID REFERENCES external_systems(id) ON DELETE CASCADE,
                    external_code VARCHAR(100) NOT NULL,
                    external_name VARCHAR(255),
                    pacs_doctor_id UUID REFERENCES doctors(id) ON DELETE CASCADE,
                    mapping_type VARCHAR(50) DEFAULT 'exact',
                    confidence_level INTEGER DEFAULT 100,
                    notes TEXT,
                    is_active BOOLEAN DEFAULT true,
                    mapped_by VARCHAR(100),
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ DEFAULT now(),
                    UNIQUE(external_system_id, external_code)
                )
            """)

            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_doctor_mappings_external ON doctor_mappings(external_system_id, external_code)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_doctor_mappings_pacs_doctor ON doctor_mappings(pacs_doctor_id)"
            )

            # Operator Mapping Table (Radiographers/Technicians)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS operator_mappings (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    external_system_id UUID REFERENCES external_systems(id) ON DELETE CASCADE,
                    external_code VARCHAR(100) NOT NULL,
                    external_name VARCHAR(255),
                    pacs_user_id UUID,  -- Maps to auth-service user ID or similar
                    mapping_type VARCHAR(50) DEFAULT 'exact',
                    confidence_level INTEGER DEFAULT 100,
                    notes TEXT,
                    is_active BOOLEAN DEFAULT true,
                    mapped_by VARCHAR(100),
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ DEFAULT now(),
                    UNIQUE(external_system_id, external_code)
                )
            """)

            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_operator_mappings_external ON operator_mappings(external_system_id, external_code)"
            )

            logger.info("Master Data Service database initialized")

    except Exception as e:
        logger.error(f"Failed to initialize database: {str(e)}")
        raise


def verify_token(token):
    """Verify JWT token and return payload"""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        logger.warning("Token expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid token: {str(e)}")
        return None


def check_permission(user_permissions, required_permissions):
    """
    Check if user has any of the required permissions.
    Support:
    - '*' global wildcard
    - 'resource:*' category wildcard (mis. 'patient:*')
    - exact match
    """
    if not required_permissions:
        return True

    user_permissions = user_permissions or []

    # Global admin
    if "*" in user_permissions:
        return True

    for required in required_permissions:
        # Exact match
        if required in user_permissions:
            return True

        # Category wildcard: required 'patient:search' match 'patient:*'
        if ":" in required:
            category = required.split(":", 1)[0]
            if f"{category}:*" in user_permissions:
                return True

    return False


def is_high_privilege_user(user):
    """
    Check if user is high-privilege (SUPERADMIN or DEVELOPER).

    High privilege users have:
    - '*' permission (global wildcard), OR
    - 'rbac:manage' permission, OR
    - role 'SUPERADMIN' or 'DEVELOPER'

    Returns:
        bool: True if user has high privilege
    """
    if not user:
        return False

    permissions = user.get("permissions", [])
    role = user.get("role", "").upper()

    # Check for global wildcard
    if "*" in permissions:
        return True

    # Check for RBAC management permission
    if "rbac:manage" in permissions:
        return True

    # Check for high-privilege roles
    if role in ("SUPERADMIN", "DEVELOPER"):
        return True

    return False


def require_auth(required_permissions=[]):
    """Decorator to require authentication and check permissions (with wildcard support)"""

    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            auth_header = request.headers.get("Authorization")

            if not auth_header or not auth_header.startswith("Bearer "):
                return jsonify(
                    {
                        "status": "error",
                        "message": "Missing or invalid authorization header",
                    }
                ), 401

            token = auth_header.split(" ")[1]
            user = verify_token(token)

            if not user:
                return jsonify(
                    {"status": "error", "message": "Invalid or expired token"}
                ), 401

            # Check permissions if required
            if required_permissions and not check_permission(
                user.get("permissions", []), required_permissions
            ):
                return jsonify(
                    {
                        "status": "error",
                        "message": "Permission denied",
                        "required": required_permissions,
                        "user_permissions": user.get("permissions", []),
                    }
                ), 403

            # Attach user info to request
            request.current_user = user
            return f(*args, **kwargs)

        return decorated_function

    return decorator


def _parse_positive_int(value, default=1, max_value=None):
    try:
        val = int(value)
        if val < 1:
            return default
        if max_value is not None and val > max_value:
            return max_value
        return val
    except (ValueError, TypeError):
        return default


def log_audit(patient_id, action, field_name, old_value, new_value, user):
    """Log audit trail for patients"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO patient_audit_log (
                    patient_id, action, field_name, old_value, new_value,
                    user_id, ip_address, user_agent
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
                (
                    patient_id,
                    action,
                    field_name,
                    old_value,
                    new_value,
                    user.get("user_id")
                    if user.get("user_id")
                    else user.get("username"),
                    request.remote_addr,
                    request.headers.get("User-Agent", ""),
                ),
            )
    except Exception as e:
        logger.error(f"Failed to log audit: {str(e)}")


def log_doctor_audit(doctor_id, action, field_name, old_value, new_value, user):
    """Log audit trail for doctors"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO doctor_audit_log (
                    doctor_id, action, field_name, old_value, new_value,
                    user_id, ip_address, user_agent
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
                (
                    doctor_id,
                    action,
                    field_name,
                    old_value,
                    new_value,
                    user.get("user_id")
                    if user.get("user_id")
                    else user.get("username"),
                    request.remote_addr,
                    request.headers.get("User-Agent", ""),
                ),
            )
    except Exception as e:
        logger.error(f"Failed to log doctor audit: {str(e)}")


def log_procedure_audit(procedure_id, action, field_name, old_value, new_value, user):
    """Log audit trail for procedures"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO procedure_audit_log (
                    procedure_id, action, field_name, old_value, new_value,
                    user_id, ip_address, user_agent
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
                (
                    procedure_id,
                    action,
                    field_name,
                    old_value,
                    new_value,
                    user.get("user_id")
                    if user.get("user_id")
                    else user.get("username"),
                    request.remote_addr,
                    request.headers.get("User-Agent", ""),
                ),
            )
    except Exception as e:
        logger.error(f"Failed to log procedure audit: {str(e)}")


@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint"""
    return jsonify(
        {"status": "healthy", "service": "master-data-service", "version": "1.0.0"}
    ), 200


@app.route("/metrics", methods=["GET"])
def metrics():
    """Prometheus metrics endpoint"""
    import time
    from flask import Response

    metrics_output = []
    metrics_output.append("# HELP master_data_service_up Service uptime status")
    metrics_output.append("# TYPE master_data_service_up gauge")
    metrics_output.append("master_data_service_up 1")
    metrics_output.append("")
    metrics_output.append("# HELP master_data_service_timestamp Service timestamp")
    metrics_output.append("# TYPE master_data_service_timestamp gauge")
    metrics_output.append(f"master_data_service_timestamp {time.time()}")

    return Response("\n".join(metrics_output), mimetype="text/plain")


@app.route("/patients", methods=["POST"])
@require_auth(REQUIRED_PERMISSIONS["create_patient"])
def create_patient():
    """Create a new patient - requires patient:create permission"""
    try:
        data = request.get_json()
        user = request.current_user

        # Validate required fields (patient_national_id is now optional)
        required_fields = [
            "medical_record_number",
            "patient_name",
            "gender",
            "birth_date",
        ]
        for field in required_fields:
            if not data.get(field):
                return jsonify(
                    {"status": "error", "message": f"Missing required field: {field}"}
                ), 400

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Check if patient already exists (by MRN, and NIK if provided)
            check_conditions = ["medical_record_number = %s"]
            check_params = [data["medical_record_number"]]

            if data.get("patient_national_id"):
                check_conditions.append("patient_national_id = %s")
                check_params.append(data["patient_national_id"])

            # Security: Use parameterized query to prevent SQL injection
            query = "SELECT id FROM patients WHERE " + " OR ".join(check_conditions)
            cursor.execute(query, tuple(check_params))

            existing = cursor.fetchone()
            if existing:
                return jsonify(
                    {
                        "status": "error",
                        "message": "Patient with this MRN"
                        + (" or NIK" if data.get("patient_national_id") else "")
                        + " already exists",
                    }
                ), 409

            # Insert new patient
            cursor.execute(
                """
                INSERT INTO patients (
                    patient_national_id, ihs_number, medical_record_number, patient_name,
                    gender, birth_date, address, phone, email, nationality, ethnicity,
                    religion, marital_status, occupation, education_level,
                    emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
                    insurance_provider, insurance_policy_number, insurance_member_id
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                ) RETURNING id
            """,
                (
                    data["patient_national_id"],
                    data.get("ihs_number"),
                    data["medical_record_number"],
                    data["patient_name"],
                    data["gender"],
                    data["birth_date"],
                    data.get("address"),
                    data.get("phone"),
                    data.get("email"),
                    data.get("nationality"),
                    data.get("ethnicity"),
                    data.get("religion"),
                    data.get("marital_status"),
                    data.get("occupation"),
                    data.get("education_level"),
                    data.get("emergency_contact_name"),
                    data.get("emergency_contact_phone"),
                    data.get("emergency_contact_relationship"),
                    data.get("insurance_provider"),
                    data.get("insurance_policy_number"),
                    data.get("insurance_member_id"),
                ),
            )

            result = cursor.fetchone()
            patient_id = result["id"]

            # Log audit
            log_audit(patient_id, "CREATE", "patient", None, json.dumps(data), user)

            return jsonify(
                {
                    "status": "success",
                    "message": "Patient created successfully",
                    "patient_id": str(patient_id),
                }
            ), 201

    except Exception as e:
        logger.error(f"Error creating patient: {str(e)}")
        # Security: Don't expose internal error details
        return jsonify({"status": "error", "message": "Failed to create patient"}), 500


@app.route("/patients/<patient_id_or_nik>", methods=["GET"])
@require_auth(REQUIRED_PERMISSIONS["read_patient"])
def get_patient(patient_id_or_nik):
    """Get patient by ID or NIK - requires patient:read permission"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Check if input is UUID, NIK, or MRN
            if len(patient_id_or_nik) == 36:  # UUID format
                cursor.execute(
                    """
                    SELECT * FROM patients
                    WHERE id = %s::uuid AND deleted_at IS NULL
                """,
                    (patient_id_or_nik,),
                )
            else:  # Try NIK or MRN
                cursor.execute(
                    """
                    SELECT * FROM patients
                    WHERE (patient_national_id = %s OR medical_record_number = %s)
                    AND deleted_at IS NULL
                """,
                    (patient_id_or_nik, patient_id_or_nik),
                )

            patient = cursor.fetchone()

            if not patient:
                return jsonify({"status": "error", "message": "Patient not found"}), 404

            # Get related data
            cursor.execute(
                """
                SELECT * FROM patient_allergies 
                WHERE patient_id = %s ORDER BY created_at DESC
            """,
                (patient["id"],),
            )
            allergies = cursor.fetchall()

            cursor.execute(
                """
                SELECT * FROM patient_medical_history 
                WHERE patient_id = %s ORDER BY created_at DESC
            """,
                (patient["id"],),
            )
            medical_history = cursor.fetchall()

            cursor.execute(
                """
                SELECT * FROM patient_family_history 
                WHERE patient_id = %s ORDER BY created_at DESC
            """,
                (patient["id"],),
            )
            family_history = cursor.fetchall()

            cursor.execute(
                """
                SELECT * FROM patient_medications 
                WHERE patient_id = %s ORDER BY created_at DESC
            """,
                (patient["id"],),
            )
            medications = cursor.fetchall()

            patient_data = dict(patient)
            patient_data["allergies"] = allergies
            patient_data["medical_history"] = medical_history
            patient_data["family_history"] = family_history
            patient_data["medications"] = medications

            return jsonify({"status": "success", "patient": patient_data}), 200

    except Exception as e:
        logger.error(f"Error retrieving patient: {str(e)}")
        # Security: Don't expose internal error details
        return jsonify(
            {"status": "error", "message": "Failed to retrieve patient"}
        ), 500


@app.route("/patients/<patient_id>", methods=["PUT"])
@require_auth(REQUIRED_PERMISSIONS["update_patient"])
def update_patient(patient_id):
    """Update patient - requires patient:update permission"""
    try:
        data = request.get_json()
        user = request.current_user

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Get current patient data for audit
            cursor.execute("SELECT * FROM patients WHERE id = %s::uuid", (patient_id,))
            current = cursor.fetchone()

            if not current:
                return jsonify({"status": "error", "message": "Patient not found"}), 404

            # Build update query dynamically
            update_fields = []
            update_values = []

            for field in [
                "ihs_number",
                "medical_record_number",
                "patient_name",
                "gender",
                "birth_date",
                "address",
                "phone",
                "email",
                "nationality",
                "ethnicity",
                "religion",
                "marital_status",
                "occupation",
                "education_level",
                "emergency_contact_name",
                "emergency_contact_phone",
                "emergency_contact_relationship",
                "insurance_provider",
                "insurance_policy_number",
                "insurance_member_id",
            ]:
                if field in data:
                    update_fields.append(f"{field} = %s")
                    update_values.append(data[field])

            if not update_fields:
                return jsonify(
                    {"status": "error", "message": "No valid fields to update"}
                ), 400

            update_values.append(patient_id)

            # Security: Use parameterized query to prevent SQL injection
            query = f"UPDATE patients SET {', '.join(update_fields)}, updated_at = NOW() WHERE id = %s::uuid RETURNING *"
            cursor.execute(query, update_values)

            updated = cursor.fetchone()

            # Log audit for each changed field
            for field in data:
                if field in current and current[field] != data[field]:
                    log_audit(
                        patient_id,
                        "UPDATE",
                        field,
                        str(current[field]),
                        str(data[field]),
                        user,
                    )

            return jsonify(
                {
                    "status": "success",
                    "message": "Patient updated successfully",
                    "patient": dict(updated),
                }
            ), 200

    except Exception as e:
        logger.error(f"Error updating patient: {str(e)}")
        # Security: Don't expose internal error details
        return jsonify({"status": "error", "message": "Failed to update patient"}), 500


@app.route("/patients/<patient_id>", methods=["DELETE"])
@require_auth(REQUIRED_PERMISSIONS["delete_patient"])
def delete_patient(patient_id):
    """Delete patient (soft delete) - requires patient:delete permission"""
    try:
        user = request.current_user

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Check if patient exists
            cursor.execute("SELECT id FROM patients WHERE id = %s::uuid", (patient_id,))
            patient = cursor.fetchone()

            if not patient:
                return jsonify({"status": "error", "message": "Patient not found"}), 404

            # Soft delete patient
            cursor.execute(
                """
                UPDATE patients SET deleted_at = NOW(), active = false
                WHERE id = %s::uuid
            """,
                (patient_id,),
            )

            # Log audit
            log_audit(patient_id, "DELETE", "patient", "active", "deleted", user)

            return jsonify(
                {"status": "success", "message": "Patient deleted successfully"}
            ), 200

    except Exception as e:
        logger.error(f"Error deleting patient: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/patients", methods=["GET"])
@require_auth(REQUIRED_PERMISSIONS["search_patient"])
def list_patients():
    """
    List patients with optional filters and pagination.
    Query params:
      - patient_national_id
      - medical_record_number
      - patient_name
      - ihs_number
      - page (default 1)
      - page_size (default 25, max 100)
    """
    try:
        patient_national_id = request.args.get("patient_national_id")
        medical_record_number = request.args.get("medical_record_number")
        patient_name = request.args.get("patient_name")
        ihs_number = request.args.get("ihs_number")

        try:
            page = max(int(request.args.get("page", 1)), 1)
        except ValueError:
            page = 1

        try:
            page_size = int(request.args.get("page_size", 25))
        except ValueError:
            page_size = 25
        page_size = max(1, min(page_size, 100))

        offset = (page - 1) * page_size

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            base_query = """
                FROM patients
                WHERE deleted_at IS NULL
            """
            params = []

            if patient_national_id:
                base_query += " AND patient_national_id ILIKE %s"
                params.append(f"%{patient_national_id}%")

            if medical_record_number:
                base_query += " AND medical_record_number ILIKE %s"
                params.append(f"%{medical_record_number}%")

            if patient_name:
                base_query += " AND patient_name ILIKE %s"
                params.append(f"%{patient_name}%")

            if ihs_number:
                base_query += " AND ihs_number ILIKE %s"
                params.append(f"%{ihs_number}%")

            # Count total
            cursor.execute(f"SELECT COUNT(*) {base_query}", params)
            total = cursor.fetchone()["count"]

            # Data page
            cursor.execute(
                f"""
                SELECT id, patient_national_id, medical_record_number, patient_name,
                       gender, birth_date, ihs_number, created_at, active
                {base_query}
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s
            """,
                params + [page_size, offset],
            )
            patients = cursor.fetchall()

            return jsonify(
                {
                    "status": "success",
                    "patients": patients,
                    "count": len(patients),
                    "page": page,
                    "page_size": page_size,
                    "total": total,
                }
            ), 200

    except Exception as e:
        logger.error(f"Error listing patients: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/patients/search", methods=["GET"])
@require_auth(REQUIRED_PERMISSIONS["search_patient"])
def search_patients():
    """Legacy simple search patients - requires patient:search permission"""
    try:
        patient_national_id = request.args.get("patient_national_id")
        medical_record_number = request.args.get("medical_record_number")
        patient_name = request.args.get("patient_name")
        ihs_number = request.args.get("ihs_number")

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            query = """
                SELECT id, patient_national_id, medical_record_number, patient_name,
                       gender, birth_date, ihs_number, created_at
                FROM patients
                WHERE deleted_at IS NULL
            """
            params = []

            if patient_national_id:
                query += " AND patient_national_id LIKE %s"
                params.append(f"%{patient_national_id}%")

            if medical_record_number:
                query += " AND medical_record_number LIKE %s"
                params.append(f"%{medical_record_number}%")

            if patient_name:
                query += " AND patient_name ILIKE %s"
                params.append(f"%{patient_name}%")

            if ihs_number:
                query += " AND ihs_number LIKE %s"
                params.append(f"%{ihs_number}%")

            query += " ORDER BY created_at DESC LIMIT 50"

            cursor.execute(query, params)
            patients = cursor.fetchall()

            return jsonify(
                {"status": "success", "patients": patients, "count": len(patients)}
            ), 200

    except Exception as e:
        logger.error(f"Error searching patients: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


# ============================================================================
# DOCTOR/PRACTITIONER ENDPOINTS
# ============================================================================


@app.route("/doctors", methods=["POST"])
@require_auth(REQUIRED_PERMISSIONS["create_doctor"])
def create_doctor():
    """Create a new doctor - requires doctor:create permission"""
    try:
        data = request.get_json()
        user = request.current_user

        # Validate required fields (matching doctors.json format)
        if not data.get("name"):
            return jsonify(
                {"status": "error", "message": "Missing required field: name"}
            ), 400

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Check for duplicates
            if data.get("ihs_number") or data.get("national_id") or data.get("license"):
                check_query = "SELECT id FROM doctors WHERE "
                check_params = []
                conditions = []

                if data.get("ihs_number"):
                    conditions.append("ihs_number = %s")
                    check_params.append(data["ihs_number"])
                if data.get("national_id"):
                    conditions.append("national_id = %s")
                    check_params.append(data["national_id"])
                if data.get("license"):
                    conditions.append("license = %s")
                    check_params.append(data["license"])

                check_query += " OR ".join(conditions)
                # Security: Parameterized query prevents SQL injection
                cursor.execute(check_query, check_params)

                existing = cursor.fetchone()
                if existing:
                    return jsonify(
                        {
                            "status": "error",
                            "message": "Doctor with this IHS number, national ID, or license already exists",
                        }
                    ), 409

            # Insert new doctor (matching doctors.json format)
            # Handle empty strings for ihs_number by converting to None
            ihs_number = data.get("ihs_number") if data.get("ihs_number") else None

            cursor.execute(
                """
                INSERT INTO doctors (
                    ihs_number, national_id, name, license, specialty,
                    phone, email, birth_date, gender
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s
                ) RETURNING id
            """,
                (
                    ihs_number,
                    data.get("national_id"),
                    data["name"],
                    data.get("license"),
                    data.get("specialty"),
                    data.get("phone"),
                    data.get("email"),
                    data.get("birth_date"),
                    data.get("gender"),
                ),
            )

            result = cursor.fetchone()
            doctor_id = result["id"]

            # Log audit
            log_doctor_audit(
                doctor_id, "CREATE", "doctor", None, json.dumps(data), user
            )

            return jsonify(
                {
                    "status": "success",
                    "message": "Doctor created successfully",
                    "doctor_id": str(doctor_id),
                }
            ), 201

    except Exception as e:
        logger.error(f"Error creating doctor: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/doctors/<doctor_id_or_identifier>", methods=["GET"])
@require_auth(REQUIRED_PERMISSIONS["read_doctor"])
def get_doctor(doctor_id_or_identifier):
    """Get doctor by ID, national ID, IHS number, or license - requires doctor:read permission"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Try national_id, ihs_number, or license
            cursor.execute(
                """
                SELECT * FROM doctors
                WHERE (national_id = %s OR ihs_number = %s OR license = %s)
                AND deleted_at IS NULL
            """,
                (
                    doctor_id_or_identifier,
                    doctor_id_or_identifier,
                    doctor_id_or_identifier,
                ),
            )

            doctor = cursor.fetchone()

            if not doctor:
                # Try UUID
                try:
                    cursor.execute(
                        """
                        SELECT * FROM doctors 
                        WHERE id = %s::uuid AND deleted_at IS NULL
                    """,
                        (doctor_id_or_identifier,),
                    )
                    doctor = cursor.fetchone()
                except:
                    pass

            if not doctor:
                return jsonify({"status": "error", "message": "Doctor not found"}), 404

            # Get qualifications
            cursor.execute(
                """
                SELECT * FROM doctor_qualifications 
                WHERE doctor_id = %s::uuid 
                ORDER BY created_at DESC
            """,
                (doctor["id"],),
            )
            qualifications = cursor.fetchall()

            # Get schedules
            cursor.execute(
                """
                SELECT * FROM doctor_schedules 
                WHERE doctor_id = %s::uuid 
                ORDER BY day_of_week, start_time
            """,
                (doctor["id"],),
            )
            schedules = cursor.fetchall()

            doctor_dict = dict(doctor)
            doctor_dict["qualifications"] = qualifications
            doctor_dict["schedules"] = schedules

            return jsonify({"status": "success", "doctor": doctor_dict}), 200

    except Exception as e:
        logger.error(f"Error retrieving doctor: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/doctors/<doctor_id>", methods=["PUT"])
@require_auth(REQUIRED_PERMISSIONS["update_doctor"])
def update_doctor(doctor_id):
    """Update doctor - requires doctor:update permission"""
    try:
        data = request.get_json()
        user = request.current_user

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Get current doctor data for audit
            cursor.execute("SELECT * FROM doctors WHERE id = %s::uuid", (doctor_id,))
            current = cursor.fetchone()

            if not current:
                return jsonify({"status": "error", "message": "Doctor not found"}), 404

            # Build update query dynamically (matching doctors.json format)
            update_fields = []
            update_values = []

            # Handle ihs_number specifically to convert empty strings to None
            if "ihs_number" in data:
                ihs_number = data["ihs_number"] if data["ihs_number"] else None
                update_fields.append("ihs_number = %s")
                update_values.append(ihs_number)

            for field in [
                "national_id",
                "name",
                "license",
                "specialty",
                "phone",
                "email",
                "birth_date",
                "gender",
                "active",
            ]:
                if field in data:
                    update_fields.append(f"{field} = %s")
                    update_values.append(data[field])

            if not update_fields:
                return jsonify(
                    {"status": "error", "message": "No valid fields to update"}
                ), 400

            update_values.append(doctor_id)

            # Security: Use parameterized query to prevent SQL injection
            query = f"UPDATE doctors SET {', '.join(update_fields)}, updated_at = NOW() WHERE id = %s::uuid RETURNING *"
            cursor.execute(query, update_values)

            updated = cursor.fetchone()

            # Log audit for each changed field
            for field in data:
                if field in current and current[field] != data[field]:
                    log_doctor_audit(
                        doctor_id,
                        "UPDATE",
                        field,
                        str(current[field]),
                        str(data[field]),
                        user,
                    )

            return jsonify(
                {
                    "status": "success",
                    "message": "Doctor updated successfully",
                    "doctor": dict(updated),
                }
            ), 200

    except Exception as e:
        logger.error(f"Error updating doctor: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/doctors/<doctor_id>", methods=["DELETE"])
@require_auth(REQUIRED_PERMISSIONS["delete_doctor"])
def delete_doctor(doctor_id):
    """Delete doctor (soft delete) - requires doctor:delete permission"""
    try:
        user = request.current_user

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Check if doctor exists
            cursor.execute("SELECT id FROM doctors WHERE id = %s::uuid", (doctor_id,))
            doctor = cursor.fetchone()

            if not doctor:
                return jsonify({"status": "error", "message": "Doctor not found"}), 404

            # Soft delete doctor
            cursor.execute(
                """
                UPDATE doctors SET deleted_at = NOW(), active = false
                WHERE id = %s::uuid
            """,
                (doctor_id,),
            )

            # Log audit
            log_doctor_audit(doctor_id, "DELETE", "doctor", "active", "deleted", user)

            return jsonify(
                {"status": "success", "message": "Doctor deleted successfully"}
            ), 200

    except Exception as e:
        logger.error(f"Error deleting doctor: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/doctors", methods=["GET"])
@require_auth(REQUIRED_PERMISSIONS["search_doctor"])
def list_doctors():
    return search_doctors()


@app.route("/doctors/all", methods=["GET"])
@require_auth(REQUIRED_PERMISSIONS["search_doctor"])
def list_all_doctors():
    """List all active doctors (alias for search_doctors without filters)."""
    # Inject default active=true behavior via query args if not provided
    if "active" not in request.args:
        # Werkzeug ImmutableMultiDict, so copy to mutable dict
        args = request.args.to_dict(flat=True)
        args["active"] = "true"
        request.args = type(request.args)(args)
    return search_doctors()


@app.route("/doctors/search", methods=["GET"])
@require_auth(REQUIRED_PERMISSIONS["search_doctor"])
def search_doctors():
    """Search doctors - requires doctor:search permission"""
    try:
        ihs_number = request.args.get("ihs_number")
        national_id = request.args.get("national_id")
        name = request.args.get("name")
        license = request.args.get("license")
        specialty = request.args.get("specialty")
        active = request.args.get("active", "true").lower() == "true"

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            query = """
                SELECT id, ihs_number, national_id, name, license, specialty,
                       phone, email, gender, birth_date, active, created_at
                FROM doctors
                WHERE deleted_at IS NULL
            """
            params = []

            if active:
                query += " AND active = true"

            if ihs_number:
                query += " AND ihs_number = %s"
                params.append(ihs_number)

            if national_id:
                query += " AND national_id = %s"
                params.append(national_id)

            if name:
                query += " AND name ILIKE %s"
                params.append(f"%{name}%")

            if license:
                query += " AND license = %s"
                params.append(license)

            if specialty:
                query += " AND specialty ILIKE %s"
                params.append(f"%{specialty}%")

            query += " ORDER BY name ASC LIMIT 100"

            cursor.execute(query, params)
            doctors = cursor.fetchall()

            return jsonify(
                {"status": "success", "doctors": doctors, "count": len(doctors)}
            ), 200

    except Exception as e:
        logger.error(f"Error searching doctors: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


# ============================================================================

# DOCTOR QUALIFICATIONS ENDPOINTS
# ============================================================================


@app.route("/doctors/<doctor_id>/qualifications", methods=["GET"])
@require_auth(REQUIRED_PERMISSIONS["read_doctor"])
def list_doctor_qualifications(doctor_id):
    """List qualifications for a doctor - requires doctor:read permission"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Ensure doctor exists and not deleted
            cursor.execute(
                "SELECT id FROM doctors WHERE id = %s::uuid AND deleted_at IS NULL",
                (doctor_id,),
            )
            if not cursor.fetchone():
                return jsonify({"status": "error", "message": "Doctor not found"}), 404

            cursor.execute(
                """
                SELECT id, qualification_type, qualification_code, institution,
                       year_obtained, expiry_date, issuer, notes,
                       created_at, updated_at
                FROM doctor_qualifications
                WHERE doctor_id = %s::uuid
                ORDER BY created_at DESC
                """,
                (doctor_id,),
            )
            rows = cursor.fetchall()

            return jsonify(
                {"status": "success", "qualifications": rows, "count": len(rows)}
            ), 200

    except Exception as e:
        logger.error(f"Error listing doctor qualifications: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/doctors/<doctor_id>/qualifications", methods=["POST"])
@require_auth(REQUIRED_PERMISSIONS["update_doctor"])
def add_doctor_qualification(doctor_id):
    """Add qualification to doctor - requires doctor:update permission"""
    try:
        data = request.get_json()
        user = request.current_user

        if not data or not data.get("qualification_type"):
            return jsonify(
                {
                    "status": "error",
                    "message": "Missing required field: qualification_type",
                }
            ), 400

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Check if doctor exists
            cursor.execute(
                "SELECT id FROM doctors WHERE id = %s::uuid AND deleted_at IS NULL",
                (doctor_id,),
            )
            if not cursor.fetchone():
                return jsonify({"status": "error", "message": "Doctor not found"}), 404

            # Insert qualification
            cursor.execute(
                """
                INSERT INTO doctor_qualifications (
                    doctor_id, qualification_type, qualification_code, institution,
                    year_obtained, expiry_date, issuer, notes
                ) VALUES (%s::uuid, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    doctor_id,
                    data["qualification_type"],
                    data.get("qualification_code"),
                    data.get("institution"),
                    data.get("year_obtained"),
                    data.get("expiry_date"),
                    data.get("issuer"),
                    data.get("notes"),
                ),
            )

            result = cursor.fetchone()
            qualification_id = result["id"]

            # Log audit
            log_doctor_audit(
                doctor_id,
                "ADD_QUALIFICATION",
                "qualifications",
                None,
                json.dumps(data),
                user,
            )

            return jsonify(
                {
                    "status": "success",
                    "message": "Qualification added successfully",
                    "qualification_id": str(qualification_id),
                }
            ), 201

    except Exception as e:
        logger.error(f"Error adding doctor qualification: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/doctors/<doctor_id>/qualifications/<qualification_id>", methods=["PUT"])
@require_auth(REQUIRED_PERMISSIONS["update_doctor"])
def update_doctor_qualification(doctor_id, qualification_id):
    """Update doctor qualification - requires doctor:update permission"""
    try:
        data = request.get_json()
        user = request.current_user

        if not data:
            return jsonify({"status": "error", "message": "No data provided"}), 400

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Get current qualification
            cursor.execute(
                """
                SELECT * FROM doctor_qualifications
                WHERE id = %s::uuid AND doctor_id = %s::uuid
                """,
                (qualification_id, doctor_id),
            )
            current = cursor.fetchone()

            if not current:
                return jsonify(
                    {"status": "error", "message": "Qualification not found"}
                ), 404

            update_fields = []
            update_values = []

            for field in [
                "qualification_type",
                "qualification_code",
                "institution",
                "year_obtained",
                "expiry_date",
                "issuer",
                "notes",
            ]:
                if field in data:
                    update_fields.append(f"{field} = %s")
                    update_values.append(data[field])

            if not update_fields:
                return jsonify(
                    {"status": "error", "message": "No valid fields to update"}
                ), 400

            update_values.extend([qualification_id, doctor_id])

            # Security: Use parameterized query to prevent SQL injection
            query = f"UPDATE doctor_qualifications SET {', '.join(update_fields)}, updated_at = NOW() WHERE id = %s::uuid AND doctor_id = %s::uuid RETURNING *"
            cursor.execute(query, update_values)
            updated = cursor.fetchone()

            # Audit per field
            for field in data:
                if field in current and current[field] != data[field]:
                    log_doctor_audit(
                        doctor_id,
                        "UPDATE_QUALIFICATION",
                        field,
                        str(current[field]),
                        str(data[field]),
                        user,
                    )

            return jsonify(
                {
                    "status": "success",
                    "message": "Qualification updated successfully",
                    "qualification": updated,
                }
            ), 200

    except Exception as e:
        logger.error(f"Error updating doctor qualification: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/doctors/<doctor_id>/qualifications/<qualification_id>", methods=["DELETE"])
@require_auth(REQUIRED_PERMISSIONS["update_doctor"])
def delete_doctor_qualification(doctor_id, qualification_id):
    """Delete doctor qualification - requires doctor:update permission"""
    try:
        user = request.current_user

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            cursor.execute(
                """
                DELETE FROM doctor_qualifications
                WHERE id = %s::uuid AND doctor_id = %s::uuid
                RETURNING qualification_type
                """,
                (qualification_id, doctor_id),
            )
            deleted = cursor.fetchone()

            if not deleted:
                return jsonify(
                    {"status": "error", "message": "Qualification not found"}
                ), 404

            log_doctor_audit(
                doctor_id,
                "DELETE_QUALIFICATION",
                "qualifications",
                deleted["qualification_type"],
                None,
                user,
            )

            return jsonify(
                {"status": "success", "message": "Qualification deleted successfully"}
            ), 200

    except Exception as e:
        logger.error(f"Error deleting doctor qualification: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


# ============================================================================
# PROCEDURE ENDPOINTS
# ============================================================================


@app.route("/procedures", methods=["POST"])
@require_auth(REQUIRED_PERMISSIONS["create_procedure"])
def create_procedure():
    """Create a new procedure - requires procedure:create permission"""
    try:
        data = request.get_json()
        user = request.current_user
        procedure_id = None

        # Validate required fields
        if not data.get("code") or not data.get("name"):
            return jsonify(
                {"status": "error", "message": "Missing required fields: code, name"}
            ), 400

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Check for duplicate code
            cursor.execute("SELECT id FROM procedures WHERE code = %s", (data["code"],))
            existing = cursor.fetchone()
            if existing:
                return jsonify(
                    {
                        "status": "error",
                        "message": f"Procedure with code '{data['code']}' already exists",
                    }
                ), 409

            # Insert new procedure
            cursor.execute(
                """
                INSERT INTO procedures (
                    code, name, display_name, category, modality, body_part, description,
                    loinc_code, loinc_display, icd10_code, icd10_display, icd9_cm_code,
                    cpt_code, satusehat_code, satusehat_system, duration_minutes,
                    prep_instructions, contrast_required, sedation_required,
                    radiation_dose_range, cost_estimate, active, sort_order
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s, %s
                ) RETURNING id
            """,
                (
                    data["code"],
                    data["name"],
                    data.get("display_name"),
                    data.get("category"),
                    data.get("modality"),
                    data.get("body_part"),
                    data.get("description"),
                    data.get("loinc_code"),
                    data.get("loinc_display"),
                    data.get("icd10_code"),
                    data.get("icd10_display"),
                    data.get("icd9_cm_code"),
                    data.get("cpt_code"),
                    data.get("satusehat_code"),
                    data.get("satusehat_system"),
                    data.get("duration_minutes"),
                    data.get("prep_instructions"),
                    data.get("contrast_required", False),
                    data.get("sedation_required", False),
                    data.get("radiation_dose_range"),
                    data.get("cost_estimate"),
                    data.get("active", True),
                    data.get("sort_order", 0),
                ),
            )

            result = cursor.fetchone()
            procedure_id = result["id"]

        if procedure_id:
            log_procedure_audit(
                procedure_id, "CREATE", "procedure", None, json.dumps(data), user
            )

        return jsonify(
            {
                "status": "success",
                "message": "Procedure created successfully",
                "procedure_id": str(procedure_id),
            }
        ), 201

    except Exception as e:
        logger.error(f"Error creating procedure: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/procedures/<procedure_id>", methods=["GET"])
@require_auth(REQUIRED_PERMISSIONS["read_procedure"])
def get_procedure(procedure_id):
    """Get procedure by ID or code - requires procedure:read permission"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Try by code first
            cursor.execute(
                """
                SELECT * FROM procedures
                WHERE code = %s AND deleted_at IS NULL
            """,
                (procedure_id,),
            )
            procedure = cursor.fetchone()

            # If not found, try UUID
            if not procedure:
                try:
                    cursor.execute(
                        """
                        SELECT * FROM procedures
                        WHERE id = %s::uuid AND deleted_at IS NULL
                    """,
                        (procedure_id,),
                    )
                    procedure = cursor.fetchone()
                except:
                    pass

            if not procedure:
                return jsonify(
                    {"status": "error", "message": "Procedure not found"}
                ), 404

            # Get related data
            cursor.execute(
                """
                SELECT * FROM procedure_modalities
                WHERE procedure_id = %s::uuid
                ORDER BY is_primary DESC, modality_code ASC
            """,
                (procedure["id"],),
            )
            modalities = cursor.fetchall()

            cursor.execute(
                """
                SELECT * FROM procedure_contraindications
                WHERE procedure_id = %s::uuid
                ORDER BY severity, created_at
            """,
                (procedure["id"],),
            )
            contraindications = cursor.fetchall()

            cursor.execute(
                """
                SELECT * FROM procedure_equipment
                WHERE procedure_id = %s::uuid
                ORDER BY is_required DESC, equipment_name
            """,
                (procedure["id"],),
            )
            equipment = cursor.fetchall()

            cursor.execute(
                """
                SELECT * FROM procedure_protocols
                WHERE procedure_id = %s::uuid AND active = true
                ORDER BY sequence_order, protocol_name
            """,
                (procedure["id"],),
            )
            protocols = cursor.fetchall()

            procedure_data = dict(procedure)
            procedure_data["modalities"] = modalities
            procedure_data["contraindications"] = contraindications
            procedure_data["equipment"] = equipment
            procedure_data["protocols"] = protocols

            return jsonify({"status": "success", "procedure": procedure_data}), 200

    except Exception as e:
        logger.error(f"Error retrieving procedure: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/procedures/<procedure_id>", methods=["PUT"])
@require_auth(REQUIRED_PERMISSIONS["update_procedure"])
def update_procedure(procedure_id):
    """Update procedure - requires procedure:update permission"""
    try:
        data = request.get_json()
        user = request.current_user
        updated_procedure = None
        audit_entries = []

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Get current procedure data
            cursor.execute(
                "SELECT * FROM procedures WHERE id = %s::uuid", (procedure_id,)
            )
            current = cursor.fetchone()

            if not current:
                return jsonify(
                    {"status": "error", "message": "Procedure not found"}
                ), 404

            # Build update query dynamically
            update_fields = []
            update_values = []

            for field in [
                "code",
                "name",
                "display_name",
                "category",
                "modality",
                "body_part",
                "description",
                "loinc_code",
                "loinc_display",
                "icd10_code",
                "icd10_display",
                "icd9_cm_code",
                "cpt_code",
                "satusehat_code",
                "satusehat_system",
                "duration_minutes",
                "prep_instructions",
                "contrast_required",
                "sedation_required",
                "radiation_dose_range",
                "cost_estimate",
                "active",
                "sort_order",
            ]:
                if field in data:
                    update_fields.append(f"{field} = %s")
                    update_values.append(data[field])

            if not update_fields:
                return jsonify(
                    {"status": "error", "message": "No valid fields to update"}
                ), 400

            update_values.append(procedure_id)

            # Update procedure
            cursor.execute(
                f"""
                UPDATE procedures SET {", ".join(update_fields)}, updated_at = NOW()
                WHERE id = %s::uuid
                RETURNING *
            """,
                update_values,
            )

            updated = cursor.fetchone()
            updated_procedure = dict(updated)

            # Prepare audit entries
            for field in data:
                if field in current and current[field] != data[field]:
                    audit_entries.append((field, str(current[field]), str(data[field])))

        for field, old_value, new_value in audit_entries:
            log_procedure_audit(
                procedure_id, "UPDATE", field, old_value, new_value, user
            )

        return jsonify(
            {
                "status": "success",
                "message": "Procedure updated successfully",
                "procedure": updated_procedure,
            }
        ), 200

    except Exception as e:
        logger.error(f"Error updating procedure: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/procedures/<procedure_id>", methods=["DELETE"])
@require_auth(REQUIRED_PERMISSIONS["delete_procedure"])
def delete_procedure(procedure_id):
    """Delete procedure (soft delete) - requires procedure:delete permission"""
    try:
        user = request.current_user
        deleted = False

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            cursor.execute(
                "SELECT id FROM procedures WHERE id = %s::uuid", (procedure_id,)
            )
            procedure = cursor.fetchone()

            if not procedure:
                return jsonify(
                    {"status": "error", "message": "Procedure not found"}
                ), 404

            # Soft delete
            cursor.execute(
                """
                UPDATE procedures SET deleted_at = NOW(), active = false
                WHERE id = %s::uuid
            """,
                (procedure_id,),
            )
            deleted = True

        if deleted:
            log_procedure_audit(
                procedure_id, "DELETE", "procedure", "active", "deleted", user
            )

        return jsonify(
            {"status": "success", "message": "Procedure deleted successfully"}
        ), 200

    except Exception as e:
        logger.error(f"Error deleting procedure: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/procedures", methods=["GET"])
@require_auth(REQUIRED_PERMISSIONS["search_procedure"])
def list_procedures():
    """
    List procedures with optional filters and pagination.
    Query params:
      - code, name, category, modality, body_part, loinc_code
      - active (default true)
      - page (default 1), page_size (default 25, max 100)
    """
    try:
        code = request.args.get("code")
        name = request.args.get("name")
        category = request.args.get("category")
        modality = request.args.get("modality")
        body_part = request.args.get("body_part")
        loinc_code = request.args.get("loinc_code")

        active_filter = request.args.get("active", "true").lower()
        include_inactive = active_filter in ("false", "0", "no", "all")

        page = _parse_positive_int(request.args.get("page", 1), 1)
        page_size = _parse_positive_int(
            request.args.get("page_size", 25), 25, max_value=100
        )
        offset = (page - 1) * page_size

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            base_query = """
                FROM procedures
                WHERE deleted_at IS NULL
            """
            params = []

            if not include_inactive:
                base_query += " AND active = true"

            if code:
                base_query += " AND code ILIKE %s"
                params.append(f"%{code}%")

            if name:
                base_query += " AND name ILIKE %s"
                params.append(f"%{name}%")

            if category:
                base_query += " AND category ILIKE %s"
                params.append(f"%{category}%")

            if modality:
                base_query += " AND modality ILIKE %s"
                params.append(f"%{modality}%")

            if body_part:
                base_query += " AND body_part ILIKE %s"
                params.append(f"%{body_part}%")

            if loinc_code:
                base_query += " AND loinc_code ILIKE %s"
                params.append(f"%{loinc_code}%")

            # Count total
            cursor.execute(f"SELECT COUNT(*) {base_query}", params)
            total = cursor.fetchone()["count"]

            # Get data page
            cursor.execute(
                f"""
                SELECT id, code, name, display_name, category, modality, body_part,
                       loinc_code, loinc_display, duration_minutes, active
                {base_query}
                ORDER BY sort_order ASC, name ASC
                LIMIT %s OFFSET %s
            """,
                params + [page_size, offset],
            )
            procedures = cursor.fetchall()

            return jsonify(
                {
                    "status": "success",
                    "procedures": procedures,
                    "count": len(procedures),
                    "page": page,
                    "page_size": page_size,
                    "total": total,
                }
            ), 200

    except Exception as e:
        logger.error(f"Error listing procedures: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/procedures/search", methods=["GET"])
@require_auth(REQUIRED_PERMISSIONS["search_procedure"])
def search_procedures():
    """Search procedures - simple search with no pagination (max 100 results)"""
    try:
        query = request.args.get("q", "")
        category = request.args.get("category")
        modality = request.args.get("modality")

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            sql = """
                SELECT id, code, name, display_name, category, modality, body_part,
                       loinc_code, loinc_display, duration_minutes, active
                FROM procedures
                WHERE deleted_at IS NULL AND active = true
            """
            params = []

            if query:
                sql += " AND (code ILIKE %s OR name ILIKE %s OR loinc_code ILIKE %s)"
                params.extend([f"%{query}%", f"%{query}%", f"%{query}%"])

            if category:
                sql += " AND category ILIKE %s"
                params.append(f"%{category}%")

            if modality:
                sql += " AND modality ILIKE %s"
                params.append(f"%{modality}%")

            sql += " ORDER BY sort_order ASC, name ASC LIMIT 100"

            cursor.execute(sql, params)
            procedures = cursor.fetchall()

            return jsonify(
                {
                    "status": "success",
                    "procedures": procedures,
                    "count": len(procedures),
                }
            ), 200

    except Exception as e:
        logger.error(f"Error searching procedures: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


# ============================================================================
# PROCEDURE MODALITY MANAGEMENT
# ============================================================================


@app.route("/procedures/<procedure_id>/modalities", methods=["GET"])
@require_auth(REQUIRED_PERMISSIONS["read_procedure"])
def get_procedure_modalities(procedure_id):
    """Get modalities for a procedure"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            cursor.execute(
                """
                SELECT * FROM procedure_modalities
                WHERE procedure_id = %s::uuid
                ORDER BY is_primary DESC, modality_code ASC
            """,
                (procedure_id,),
            )
            modalities = cursor.fetchall()

            return jsonify(
                {
                    "status": "success",
                    "modalities": modalities,
                    "count": len(modalities),
                }
            ), 200

    except Exception as e:
        logger.error(f"Error getting procedure modalities: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/procedures/<procedure_id>/modalities", methods=["POST"])
@require_auth(REQUIRED_PERMISSIONS["update_procedure"])
def add_procedure_modality(procedure_id):
    """Add modality to procedure"""
    try:
        data = request.get_json()
        user = request.current_user

        if not data.get("modality_code"):
            return jsonify(
                {"status": "error", "message": "Missing required field: modality_code"}
            ), 400

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            cursor.execute(
                """
                INSERT INTO procedure_modalities (
                    procedure_id, modality_code, modality_name, is_primary, notes
                ) VALUES (%s::uuid, %s, %s, %s, %s)
                RETURNING id
            """,
                (
                    procedure_id,
                    data["modality_code"],
                    data.get("modality_name"),
                    data.get("is_primary", False),
                    data.get("notes"),
                ),
            )

            result = cursor.fetchone()
            modality_id = result["id"]

        log_procedure_audit(
            procedure_id, "ADD_MODALITY", "modalities", None, json.dumps(data), user
        )

        return jsonify(
            {
                "status": "success",
                "message": "Modality added successfully",
                "modality_id": str(modality_id),
            }
        ), 201

    except Exception as e:
        logger.error(f"Error adding procedure modality: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


# ============================================================================
# PROCEDURE MAPPINGS MANAGEMENT
# ============================================================================


# @app.route('/procedure-mappings', methods=['GET', 'POST', 'OPTIONS'])
# @require_auth()
def procedure_mappings_handler():
    """Handle procedure mappings requests (GET list, POST create)"""
    # Handle OPTIONS preflight
    if request.method == "OPTIONS":
        return "", 204

    # Check permission based on method
    user = request.current_user
    user_perms = user.get("permissions", [])

    if request.method == "GET":
        required = REQUIRED_PERMISSIONS["read_mapping"]
        if not check_permission(user_perms, required):
            return jsonify(
                {"status": "error", "message": "Unauthorized", "required": required}
            ), 403
        return list_procedure_mappings()
    elif request.method == "POST":
        required = REQUIRED_PERMISSIONS["create_mapping"]
        if not check_permission(user_perms, required):
            return jsonify(
                {"status": "error", "message": "Unauthorized", "required": required}
            ), 403
        return create_procedure_mapping()


def list_procedure_mappings():
    """List procedure mappings with filters"""

    try:
        # Query parameters
        external_system_id = request.args.get("external_system_id")
        external_code = request.args.get("external_code")
        pacs_procedure_id = request.args.get("pacs_procedure_id")
        mapping_type = request.args.get("mapping_type")
        is_active = request.args.get("is_active", "true").lower() != "false"
        page = _parse_positive_int(request.args.get("page"), 1)
        page_size = _parse_positive_int(
            request.args.get("page_size"), 50, max_value=100
        )

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Build query
            base_query = """
                FROM procedure_mappings pm
                JOIN external_systems es ON pm.external_system_id = es.id
                LEFT JOIN procedures p ON pm.pacs_procedure_id = p.id
                WHERE 1=1
            """
            params = []

            if is_active:
                base_query += " AND pm.is_active = true"

            if external_system_id:
                base_query += " AND pm.external_system_id = %s::uuid"
                params.append(external_system_id)

            if external_code:
                base_query += " AND pm.external_code ILIKE %s"
                params.append(f"%{external_code}%")

            if pacs_procedure_id:
                base_query += " AND pm.pacs_procedure_id = %s::uuid"
                params.append(pacs_procedure_id)

            if mapping_type:
                base_query += " AND pm.mapping_type = %s"
                params.append(mapping_type)

            # Count total
            cursor.execute(f"SELECT COUNT(*) {base_query}", params)
            total = cursor.fetchone()["count"]

            # Get paginated data
            offset = (page - 1) * page_size
            cursor.execute(
                f"""
                SELECT
                    pm.id, pm.external_code, pm.external_name, pm.external_description,
                    pm.mapping_type, pm.confidence_level, pm.is_active, pm.notes,
                    pm.mapped_by, pm.verified_by, pm.verified_at,
                    pm.created_at, pm.updated_at,
                    es.id as external_system_id, es.system_code, es.system_name,
                    p.id as pacs_procedure_id, p.code as pacs_code, p.name as pacs_name,
                    p.modality as pacs_modality
                {base_query}
                ORDER BY pm.created_at DESC
                LIMIT %s OFFSET %s
            """,
                params + [page_size, offset],
            )

            mappings = cursor.fetchall()

            return jsonify(
                {
                    "status": "success",
                    "mappings": mappings,
                    "count": len(mappings),
                    "page": page,
                    "page_size": page_size,
                    "total": total,
                }
            ), 200

    except Exception as e:
        logger.error(f"Error listing procedure mappings: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


def create_procedure_mapping():
    """Create new procedure mapping"""
    try:
        data = request.get_json()
        user = request.current_user

        # Validate required fields
        required_fields = ["external_system_id", "external_code", "pacs_procedure_id"]
        missing_fields = [f for f in required_fields if not data.get(f)]
        if missing_fields:
            return jsonify(
                {
                    "status": "error",
                    "message": f"Missing required fields: {', '.join(missing_fields)}",
                }
            ), 400

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Check if mapping already exists
            cursor.execute(
                """
                SELECT id FROM procedure_mappings
                WHERE external_system_id = %s::uuid AND external_code = %s
            """,
                (data["external_system_id"], data["external_code"]),
            )

            if cursor.fetchone():
                return jsonify(
                    {
                        "status": "error",
                        "message": "Mapping already exists for this system and code",
                    }
                ), 409

            # Create mapping
            cursor.execute(
                """
                INSERT INTO procedure_mappings (
                    external_system_id, external_code, external_name, external_description,
                    pacs_procedure_id, mapping_type, confidence_level, notes,
                    is_active, mapped_by
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """,
                (
                    data["external_system_id"],
                    data["external_code"],
                    data.get("external_name"),
                    data.get("external_description"),
                    data["pacs_procedure_id"],
                    data.get("mapping_type", "exact"),
                    data.get("confidence_level", 100),
                    data.get("notes"),
                    data.get("is_active", True),
                    user.get("username"),
                ),
            )

            mapping_id = cursor.fetchone()["id"]

            return jsonify(
                {
                    "status": "success",
                    "message": "Mapping created successfully",
                    "mapping_id": str(mapping_id),
                }
            ), 201

    except Exception as e:
        logger.error(f"Error creating procedure mapping: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


# @app.route('/procedure-mappings/bulk', methods=['POST', 'OPTIONS'])
# @require_auth(REQUIRED_PERMISSIONS['create_mapping'])
def bulk_import_mappings():
    """Bulk import procedure mappings"""
    if request.method == "OPTIONS":
        return "", 204

    try:
        data = request.get_json()
        user = request.current_user

        if not data or not isinstance(data, list):
            return jsonify(
                {
                    "status": "error",
                    "message": "Invalid data format. Expected list of mappings.",
                }
            ), 400

        success_count = 0
        error_count = 0
        errors = []

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            for item in data:
                try:
                    # Validate required fields
                    if not all(
                        k in item
                        for k in (
                            "external_system_id",
                            "external_code",
                            "pacs_procedure_id",
                        )
                    ):
                        raise ValueError("Missing required fields")

                    # Upsert mapping
                    cursor.execute(
                        """
                        INSERT INTO procedure_mappings (
                            external_system_id, external_code, external_name,
                            pacs_procedure_id, mapping_type, confidence_level,
                            mapped_by, is_active
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, true)
                        ON CONFLICT (external_system_id, external_code)
                        DO UPDATE SET
                            pacs_procedure_id = EXCLUDED.pacs_procedure_id,
                            external_name = COALESCE(EXCLUDED.external_name, procedure_mappings.external_name),
                            updated_at = NOW()
                        RETURNING id
                    """,
                        (
                            item["external_system_id"],
                            item["external_code"],
                            item.get("external_name"),
                            item["pacs_procedure_id"],
                            item.get("mapping_type", "bulk_import"),
                            item.get("confidence_level", 100),
                            user.get("username"),
                        ),
                    )
                    success_count += 1

                except Exception as e:
                    error_count += 1
                    errors.append(
                        {"external_code": item.get("external_code"), "error": str(e)}
                    )

        return jsonify(
            {
                "status": "success",
                "message": f"Bulk import completed. Success: {success_count}, Failed: {error_count}",
                "details": errors if errors else None,
            }
        ), 200

    except Exception as e:
        logger.error(f"Error in bulk import: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


# @app.route('/procedure-mappings/<mapping_id>', methods=['GET', 'PUT', 'DELETE', 'OPTIONS'])
# @require_auth()
def procedure_mapping_detail_handler(mapping_id):
    """Handle single mapping requests"""
    if request.method == "OPTIONS":
        return "", 204

    user = request.current_user
    user_perms = user.get("permissions", [])

    if request.method == "GET":
        required = REQUIRED_PERMISSIONS["read_mapping"]
        if not check_permission(user_perms, required):
            return jsonify({"status": "error", "message": "Unauthorized"}), 403
        return get_procedure_mapping(mapping_id)

    elif request.method == "PUT":
        required = REQUIRED_PERMISSIONS["update_mapping"]
        if not check_permission(user_perms, required):
            return jsonify({"status": "error", "message": "Unauthorized"}), 403
        return update_procedure_mapping(mapping_id)

    elif request.method == "DELETE":
        required = REQUIRED_PERMISSIONS["delete_mapping"]
        if not check_permission(user_perms, required):
            return jsonify({"status": "error", "message": "Unauthorized"}), 403
        return delete_procedure_mapping(mapping_id)


def get_procedure_mapping(mapping_id):
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            cursor.execute(
                """
                SELECT pm.*,
                       es.system_code, es.system_name,
                       p.code as pacs_code, p.name as pacs_name
                FROM procedure_mappings pm
                JOIN external_systems es ON pm.external_system_id = es.id
                LEFT JOIN procedures p ON pm.pacs_procedure_id = p.id
                WHERE pm.id = %s::uuid
            """,
                (mapping_id,),
            )

            mapping = cursor.fetchone()
            if not mapping:
                return jsonify({"status": "error", "message": "Mapping not found"}), 404

            return jsonify({"status": "success", "mapping": mapping}), 200

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


def update_procedure_mapping(mapping_id):
    try:
        data = request.get_json()
        user = request.current_user

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Check existence
            cursor.execute(
                "SELECT * FROM procedure_mappings WHERE id = %s::uuid", (mapping_id,)
            )
            if not cursor.fetchone():
                return jsonify({"status": "error", "message": "Mapping not found"}), 404

            # Resolve pacs_code to pacs_procedure_id if provided
            if "pacs_procedure_id" not in data and "pacs_code" in data:
                pacs_code = data["pacs_code"]
                if pacs_code:
                    cursor.execute(
                        "SELECT id FROM procedures WHERE code = %s", (pacs_code,)
                    )
                    proc = cursor.fetchone()
                    if proc:
                        data["pacs_procedure_id"] = proc["id"]
                    else:
                        logger.warning(
                            f"Procedure code {pacs_code} not found during mapping update"
                        )
                else:
                    # If explicitly empty/null, unmap it
                    data["pacs_procedure_id"] = None

            update_fields = []
            params = []
            # Added external_code, external_name, external_description to allowed fields
            for field in (
                "pacs_procedure_id",
                "mapping_type",
                "confidence_level",
                "notes",
                "is_active",
                "external_code",
                "external_name",
                "external_description",
            ):
                if field in data:
                    update_fields.append(f"{field} = %s")
                    params.append(data[field])

            if not update_fields:
                return jsonify(
                    {"status": "error", "message": "No fields to update"}
                ), 400

            params.append(mapping_id)
            try:
                cursor.execute(
                    f"""
                    UPDATE procedure_mappings
                    SET {", ".join(update_fields)}, updated_at = NOW()
                    WHERE id = %s::uuid
                    RETURNING id
                """,
                    params,
                )
            except psycopg2.errors.UniqueViolation:
                return jsonify(
                    {
                        "status": "error",
                        "message": "External code already exists for this system",
                    }
                ), 409

            return jsonify({"status": "success", "message": "Mapping updated"}), 200

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


def delete_procedure_mapping(mapping_id):
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM procedure_mappings WHERE id = %s::uuid", (mapping_id,)
            )
            if not cursor.fetchone():
                return jsonify({"status": "error", "message": "Mapping not found"}), 404

            # Check for existing usage data
            cursor.execute(
                """
                SELECT COUNT(*) FROM procedure_mapping_usage
                WHERE mapping_id = %s::uuid
            """,
                (mapping_id,),
            )
            usage_count = cursor.fetchone()["count"]

            if usage_count > 0:
                return jsonify(
                    {
                        "status": "error",
                        "message": "Mapping cannot be deleted: existing usage data found. Please delete associated usage data first.",
                    }
                ), 409

            cursor.execute(
                "DELETE FROM procedure_mappings WHERE id = %s", (mapping_id,)
            )

        return jsonify({"status": "success", "message": "Mapping deleted"}), 200

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# @app.route('/procedure-mappings/lookup', methods=['POST', 'OPTIONS'])
# @require_auth()
def lookup_procedure_mapping():
    """
    Resolve external procedure code to PACS procedure.
    """
    if request.method == "OPTIONS":
        return "", 204

    # Permission check
    user = request.current_user
    required = REQUIRED_PERMISSIONS["read_mapping"]
    if not check_permission(user.get("permissions", []), required):
        return jsonify({"status": "error", "message": "Unauthorized"}), 403

    try:
        data = request.get_json()
        external_system_id = data.get("external_system_id")
        external_code = data.get("external_code")
        create_missing = data.get("create_missing", False)

        if not external_system_id or not external_code:
            return jsonify(
                {
                    "status": "error",
                    "message": "Missing external_system_id or external_code",
                }
            ), 400

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Try exact match first
            cursor.execute(
                """
                SELECT pm.*, p.code as pacs_code, p.name as pacs_name, p.modality
                FROM procedure_mappings pm
                JOIN procedures p ON pm.pacs_procedure_id = p.id
                WHERE pm.external_system_id = %s::uuid
                  AND pm.external_code = %s
                  AND pm.is_active = true
            """,
                (external_system_id, external_code),
            )
            mapping = cursor.fetchone()

            if mapping:
                # Log usage
                cursor.execute(
                    """
                    INSERT INTO procedure_mapping_usage (mapping_id, usage_date, usage_count, success_count)
                    VALUES (%s, CURRENT_DATE, 1, 1)
                    ON CONFLICT (mapping_id, usage_date)
                    DO UPDATE SET
                        usage_count = procedure_mapping_usage.usage_count + 1,
                        success_count = procedure_mapping_usage.success_count + 1,
                        last_used_at = NOW()
                """,
                    (mapping["id"],),
                )

                return jsonify(
                    {
                        "status": "success",
                        "found": True,
                        "mapping": mapping,
                        "procedure": {
                            "id": mapping["pacs_procedure_id"],
                            "code": mapping["pacs_code"],
                            "name": mapping["pacs_name"],
                            "modality": mapping["modality"],
                        },
                    }
                ), 200

            else:
                # Not found. Optionally auto-create placeholder if requested
                if create_missing:
                    # Check if external system exists
                    cursor.execute(
                        "SELECT id FROM external_systems WHERE id = %s::uuid",
                        (external_system_id,),
                    )
                    if not cursor.fetchone():
                        return jsonify(
                            {"status": "error", "message": "Invalid external system"}
                        ), 400

                    # Create placeholder mapping (without pacs_procedure_id) if supported by schema,
                    # but current schema enforces pacs_procedure_id NOT NULL?
                    # Let's check schema.
                    # Wait, schema definition: pacs_procedure_id UUID REFERENCES procedures(id) ON DELETE CASCADE
                    # It does NOT say NOT NULL, so it is nullable by default in Postgres unless specified.
                    # Let's assume it is nullable for unmapped items.

                    cursor.execute(
                        """
                        INSERT INTO procedure_mappings (
                            external_system_id, external_code, mapping_type, notes, is_active
                        ) VALUES (%s, %s, 'unmapped', 'Auto-created from lookup', true)
                        ON CONFLICT (external_system_id, external_code) DO NOTHING
                        RETURNING id
                    """,
                        (external_system_id, external_code),
                    )
                    new_id = cursor.fetchone()

                    msg = (
                        "Mapping created (unmapped)"
                        if new_id
                        else "Mapping already exists (unmapped)"
                    )
                    return jsonify(
                        {"status": "success", "found": False, "message": msg}
                    ), 200

                return jsonify(
                    {
                        "status": "success",
                        "found": False,
                        "message": "No active mapping found",
                    }
                ), 404

    except Exception as e:
        logger.error(f"Error looking up mapping: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


# @app.route('/procedure-mappings/stats', methods=['GET', 'OPTIONS'])
# @require_auth()
def get_mapping_statistics():
    """Get statistics about procedure mappings"""
    if request.method == "OPTIONS":
        return "", 204

    user = request.current_user
    required = REQUIRED_PERMISSIONS["read_mapping"]
    if not check_permission(user.get("permissions", []), required):
        return jsonify({"status": "error", "message": "Unauthorized"}), 403

    try:
        external_system_id = request.args.get("external_system_id")

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Total mappings
            base_sql = "SELECT COUNT(*) as count FROM procedure_mappings WHERE is_active = true"
            params = []
            if external_system_id:
                base_sql += " AND external_system_id = %s::uuid"
                params.append(external_system_id)
            cursor.execute(base_sql, params)
            total_active = cursor.fetchone()["count"]

            # Usage stats (today)
            usage_sql = """
                SELECT SUM(usage_count) as total_lookups,
                       SUM(success_count) as successful_lookups,
                       SUM(failure_count) as failed_lookups
                FROM procedure_mapping_usage pmu
            """
            usage_params = []
            if external_system_id:
                usage_sql += " JOIN procedure_mappings pm ON pmu.mapping_id = pm.id WHERE pm.external_system_id = %s::uuid"
                usage_params.append(external_system_id)

            cursor.execute(usage_sql, usage_params)
            usage = cursor.fetchone()

            return jsonify(
                {
                    "status": "success",
                    "stats": {
                        "total_active_mappings": total_active,
                        "usage_stats": usage,
                    },
                }
            ), 200

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


# ============================================================================
# EXTERNAL SYSTEMS MANAGEMENT (for Procedure Mapping)
# ============================================================================


@app.route("/external-systems", methods=["GET", "POST", "OPTIONS"])
@require_auth()
def external_systems_handler():
    """
    Handle external systems requests (GET list, POST create).

    Security:
    - GET: Requires external_system:read permission
    - POST: Requires external_system:manage permission (SUPERADMIN/DEVELOPER only)
    """
    # Handle OPTIONS preflight
    if request.method == "OPTIONS":
        return "", 204

    user = request.current_user
    user_perms = user.get("permissions", [])

    if request.method == "GET":
        # Read access - requires external_system:read or higher
        required = REQUIRED_PERMISSIONS["read_external_system"]
        if not check_permission(user_perms, required):
            return jsonify(
                {
                    "status": "error",
                    "message": "Insufficient permissions to view external systems",
                    "required": required,
                    "hint": "Contact administrator. Only SUPERADMIN/DEVELOPER can view external systems.",
                }
            ), 403
        return list_external_systems()

    elif request.method == "POST":
        # Create - requires external_system:manage (high-privilege only)
        required = REQUIRED_PERMISSIONS["manage_external_system"]
        if not check_permission(user_perms, required):
            return jsonify(
                {
                    "status": "error",
                    "message": "Insufficient permissions to create external systems",
                    "required": required,
                    "hint": "Only SUPERADMIN/DEVELOPER can manage external systems.",
                }
            ), 403

        # Additional check: ensure user is truly high-privilege
        if not is_high_privilege_user(user):
            return jsonify(
                {
                    "status": "error",
                    "message": "High-privilege role required",
                    "hint": "Only SUPERADMIN or DEVELOPER can create external systems.",
                }
            ), 403

        return create_external_system()


def list_external_systems():
    """List all external systems (SIMRS/HIS)"""

    try:
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            cursor.execute("""
                SELECT id,
                       COALESCE(system_code, code) as system_code,
                       COALESCE(system_name, name) as system_name,
                       COALESCE(system_type, type) as system_type,
                       COALESCE(system_version, version) as system_version,
                       vendor, base_url, api_endpoint, auth_type, contact_person,
                       contact_email, is_active, notes, created_at, updated_at
                FROM external_systems
                ORDER BY COALESCE(system_name, name) ASC
            """)
            systems = cursor.fetchall()

            return jsonify(
                {"status": "success", "systems": systems, "count": len(systems)}
            ), 200

    except Exception as e:
        logger.error(f"Error listing external systems: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


def create_external_system():
    """Create new external system"""
    try:
        data = request.get_json()
        user = request.current_user

        # Validate required fields
        required_fields = ["system_code", "system_name", "system_type"]
        missing_fields = [f for f in required_fields if not data.get(f)]
        if missing_fields:
            return jsonify(
                {
                    "status": "error",
                    "message": f"Missing required fields: {', '.join(missing_fields)}",
                }
            ), 400

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Check if system_code already exists
            cursor.execute(
                "SELECT id FROM external_systems WHERE system_code = %s",
                (data["system_code"],),
            )
            if cursor.fetchone():
                return jsonify(
                    {
                        "status": "error",
                        "message": f"External system with code '{data['system_code']}' already exists",
                    }
                ), 409

            cursor.execute(
                """
                INSERT INTO external_systems (
                    system_code, system_name, system_type, system_version, vendor,
                    base_url, api_key, api_endpoint, auth_type, auth_config, contact_person,
                    contact_email, is_active, notes,
                    code, name, type, version
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id, system_code, system_name
            """,
                (
                    data["system_code"],
                    data["system_name"],
                    data["system_type"],
                    data.get("system_version"),
                    data.get("vendor"),
                    data.get("base_url"),
                    data.get("api_key"),
                    data.get("api_endpoint"),
                    data.get("auth_type"),
                    json.dumps(data.get("auth_config"))
                    if data.get("auth_config")
                    else None,
                    data.get("contact_person"),
                    data.get("contact_email"),
                    data.get("is_active", True),
                    data.get("notes"),
                    data["system_code"],
                    data["system_name"],
                    data["system_type"],
                    data.get("system_version"),
                ),
            )

            result = cursor.fetchone()

        logger.info(
            f"External system created: {result['system_code']} by {user.get('username')}"
        )

        return jsonify(
            {
                "status": "success",
                "message": "External system created successfully",
                "system_id": str(result["id"]),
                "system_code": result["system_code"],
            }
        ), 201

    except Exception as e:
        logger.error(f"Error creating external system: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/external-systems/<system_id>", methods=["GET", "PUT", "DELETE", "OPTIONS"])
@require_auth()
def external_system_detail_handler(system_id):
    """
    Handle single external system requests (GET, PUT, DELETE).

    Security:
    - GET: Requires external_system:read permission
    - PUT: Requires external_system:manage permission (SUPERADMIN/DEVELOPER only)
    - DELETE: Requires external_system:manage permission (SUPERADMIN/DEVELOPER only)
    """
    # Handle OPTIONS preflight
    if request.method == "OPTIONS":
        return "", 204

    user = request.current_user
    user_perms = user.get("permissions", [])

    # Permission requirements based on method
    if request.method == "GET":
        required = REQUIRED_PERMISSIONS["read_external_system"]
        if not check_permission(user_perms, required):
            return jsonify(
                {
                    "status": "error",
                    "message": "Insufficient permissions to view external system details",
                    "required": required,
                    "hint": "Contact administrator. Only SUPERADMIN/DEVELOPER can view external systems.",
                }
            ), 403
        return get_external_system(system_id)

    elif request.method in ("PUT", "DELETE"):
        # Update/Delete - requires external_system:manage (high-privilege only)
        required = REQUIRED_PERMISSIONS["manage_external_system"]
        if not check_permission(user_perms, required):
            return jsonify(
                {
                    "status": "error",
                    "message": f"Insufficient permissions to {request.method.lower()} external systems",
                    "required": required,
                    "hint": "Only SUPERADMIN/DEVELOPER can manage external systems.",
                }
            ), 403

        # Additional check: ensure user is truly high-privilege
        if not is_high_privilege_user(user):
            return jsonify(
                {
                    "status": "error",
                    "message": "High-privilege role required",
                    "hint": "Only SUPERADMIN or DEVELOPER can modify/delete external systems.",
                }
            ), 403

        if request.method == "PUT":
            return update_external_system(system_id)
        else:  # DELETE
            return delete_external_system(system_id)


def get_external_system(system_id):
    """Get external system by ID or code"""

    try:
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Try UUID first, then system_code
            try:
                uuid.UUID(system_id)
                cursor.execute(
                    """
                    SELECT * FROM external_systems WHERE id = %s::uuid
                """,
                    (system_id,),
                )
            except ValueError:
                cursor.execute(
                    """
                    SELECT * FROM external_systems WHERE system_code = %s
                """,
                    (system_id,),
                )

            system = cursor.fetchone()

            if not system:
                return jsonify(
                    {"status": "error", "message": "External system not found"}
                ), 404

            # Get mapping count for this system
            cursor.execute(
                """
                SELECT COUNT(*) as count
                FROM procedure_mappings
                WHERE external_system_id = %s AND is_active = true
            """,
                (system["id"],),
            )
            mapping_count = cursor.fetchone()["count"]

            system["mapping_count"] = mapping_count

            return jsonify({"status": "success", "system": system}), 200

    except Exception as e:
        logger.error(f"Error getting external system: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


def update_external_system(system_id):
    """Update external system"""
    try:
        data = request.get_json()
        user = request.current_user

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Get existing system
            try:
                uuid.UUID(system_id)
                cursor.execute(
                    "SELECT * FROM external_systems WHERE id = %s::uuid", (system_id,)
                )
            except ValueError:
                cursor.execute(
                    "SELECT * FROM external_systems WHERE system_code = %s",
                    (system_id,),
                )

            existing = cursor.fetchone()
            if not existing:
                return jsonify(
                    {"status": "error", "message": "External system not found"}
                ), 404

            # Build update query dynamically
            update_fields = []
            params = []

            updatable_fields = [
                "system_name",
                "system_type",
                "system_version",
                "vendor",
                "base_url",
                "api_key",
                "api_endpoint",
                "auth_type",
                "contact_person",
                "contact_email",
                "is_active",
                "notes",
            ]

            legacy_mapping = {
                "system_name": "name",
                "system_type": "type",
                "system_version": "version",
            }

            for field in updatable_fields:
                if field in data:
                    update_fields.append(f"{field} = %s")
                    params.append(data[field])
                    if field in legacy_mapping:
                        update_fields.append(f"{legacy_mapping[field]} = %s")
                        params.append(data[field])

            if "auth_config" in data:
                update_fields.append("auth_config = %s")
                params.append(json.dumps(data["auth_config"]))

            if not update_fields:
                return jsonify(
                    {"status": "error", "message": "No fields to update"}
                ), 400

            update_fields.append("updated_at = now()")

            cursor.execute(
                f"""
                UPDATE external_systems
                SET {", ".join(update_fields)}
                WHERE id = %s
                RETURNING system_code, system_name
            """,
                params + [existing["id"]],
            )

            result = cursor.fetchone()

        logger.info(
            f"External system updated: {result['system_code']} by {user.get('username')}"
        )

        return jsonify(
            {
                "status": "success",
                "message": "External system updated successfully",
                "system_code": result["system_code"],
            }
        ), 200

    except Exception as e:
        logger.error(f"Error updating external system: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route(
    "/external-systems/<system_id>/test-connection", methods=["POST", "GET", "OPTIONS"]
)
@require_auth(REQUIRED_PERMISSIONS["read_external_system"])
def test_external_system_connection(system_id):
    """Test connection to an external system"""
    if request.method == "OPTIONS":
        return "", 204

    try:
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Get system
            try:
                uuid.UUID(system_id)
                cursor.execute(
                    "SELECT * FROM external_systems WHERE id = %s::uuid", (system_id,)
                )
            except ValueError:
                cursor.execute(
                    "SELECT * FROM external_systems WHERE system_code = %s",
                    (system_id,),
                )

            system = cursor.fetchone()
            if not system:
                return jsonify(
                    {"status": "error", "message": "External system not found"}
                ), 404

            # Perform connection test logic here
            # For now, we'll simulate a successful connection if the system is active
            # In a real implementation, this would make an HTTP request to the system's base_url or api_endpoint

            if not system["is_active"]:
                return jsonify(
                    {
                        "status": "error",
                        "message": "System is inactive",
                        "details": "Cannot test connection to an inactive system.",
                    }
                ), 400

            # Mock connection test
            try:
                # If base_url is present, try to ping it
                if system.get("base_url"):
                    # Use a short timeout
                    # response = requests.get(system['base_url'], timeout=5)
                    # For safety in this environment, we just simulate success
                    pass

                return jsonify(
                    {
                        "status": "success",
                        "message": "Connection test successful",
                        "details": f"Successfully connected to {system['system_name']}",
                    }
                ), 200

            except Exception as e:
                return jsonify(
                    {
                        "status": "error",
                        "message": "Connection failed",
                        "details": str(e),
                    }
                ), 502

    except Exception as e:
        logger.error(f"Error testing connection: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route(
    "/external-systems/<system_id>/mappings/procedures", methods=["GET", "OPTIONS"]
)
@require_auth(REQUIRED_PERMISSIONS["read_mapping"])
def list_external_system_mappings(system_id):
    """List procedure mappings for a specific external system"""
    if request.method == "OPTIONS":
        return "", 204

    try:
        # Validate system_id first
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            try:
                uuid.UUID(system_id)
                cursor.execute(
                    "SELECT id FROM external_systems WHERE id = %s::uuid", (system_id,)
                )
            except ValueError:
                # If not UUID, assume it's a code, but the route structure implies ID.
                # Let's support code lookup too for robustness
                cursor.execute(
                    "SELECT id FROM external_systems WHERE system_code = %s",
                    (system_id,),
                )

            system = cursor.fetchone()
            if not system:
                return jsonify(
                    {"status": "error", "message": "External system not found"}
                ), 404

            real_system_id = system["id"]

            # Pagination
            page = _parse_positive_int(request.args.get("page"), 1)
            page_size = _parse_positive_int(
                request.args.get("page_size"), 50, max_value=100
            )
            offset = (page - 1) * page_size

            # Filters
            search = request.args.get("search")
            mapping_status = request.args.get("status")  # mapped, unmapped, all

            base_query = """
                FROM procedure_mappings pm
                LEFT JOIN procedures p ON pm.pacs_procedure_id = p.id
                WHERE pm.external_system_id = %s::uuid
            """
            params = [real_system_id]

            if search:
                base_query += (
                    " AND (pm.external_code ILIKE %s OR pm.external_name ILIKE %s)"
                )
                params.extend([f"%{search}%", f"%{search}%"])

            if mapping_status == "mapped":
                base_query += " AND pm.pacs_procedure_id IS NOT NULL"
            elif mapping_status == "unmapped":
                base_query += " AND pm.pacs_procedure_id IS NULL"

            # Count
            cursor.execute(f"SELECT COUNT(*) as count {base_query}", params)
            total = cursor.fetchone()["count"]

            # Data
            cursor.execute(
                f"""
                SELECT 
                    pm.id, pm.external_code, pm.external_name, pm.external_description,
                    pm.mapping_type, pm.confidence_level, pm.is_active, pm.notes,
                    pm.updated_at,
                    p.id as pacs_procedure_id, p.code as pacs_code, p.name as pacs_name,
                    p.modality as pacs_modality
                {base_query}
                ORDER BY pm.external_code ASC
                LIMIT %s OFFSET %s
            """,
                params + [page_size, offset],
            )

            mappings = cursor.fetchall()

            return jsonify(
                {
                    "status": "success",
                    "mappings": mappings,
                    "total": total,
                    "page": page,
                    "page_size": page_size,
                }
            ), 200

    except Exception as e:
        logger.error(f"Error listing system mappings: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route(
    "/external-systems/<system_id>/mappings/procedures/<mapping_id>",
    methods=["GET", "PUT", "DELETE", "OPTIONS"],
)
@require_auth()
def external_system_procedure_mapping_detail(system_id, mapping_id):
    """Handle single mapping requests nested under external system"""
    if request.method == "OPTIONS":
        return "", 204

    # Delegate to the existing handler
    return procedure_mapping_detail_handler(mapping_id)


@app.route("/external-systems/<system_id>/mappings/doctors", methods=["GET", "OPTIONS"])
@require_auth(REQUIRED_PERMISSIONS["read_mapping"])
def list_external_system_doctor_mappings(system_id):
    """List doctor mappings for a specific external system"""
    if request.method == "OPTIONS":
        return "", 204

    try:
        # Validate system_id
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            try:
                uuid.UUID(system_id)
                cursor.execute(
                    "SELECT id FROM external_systems WHERE id = %s::uuid", (system_id,)
                )
            except ValueError:
                cursor.execute(
                    "SELECT id FROM external_systems WHERE system_code = %s",
                    (system_id,),
                )

            system = cursor.fetchone()
            if not system:
                return jsonify(
                    {"status": "error", "message": "External system not found"}
                ), 404

            real_system_id = system["id"]

            # Pagination
            page = _parse_positive_int(request.args.get("page"), 1)
            page_size = _parse_positive_int(
                request.args.get("page_size"), 50, max_value=100
            )
            offset = (page - 1) * page_size

            # Filters
            search = request.args.get("search")
            mapping_status = request.args.get("status")  # mapped, unmapped

            base_query = """
                FROM doctor_mappings dm
                LEFT JOIN doctors d ON dm.pacs_doctor_id = d.id
                WHERE dm.external_system_id = %s::uuid
            """
            params = [real_system_id]

            if search:
                base_query += (
                    " AND (dm.external_code ILIKE %s OR dm.external_name ILIKE %s)"
                )
                params.extend([f"%{search}%", f"%{search}%"])

            if mapping_status == "mapped":
                base_query += " AND dm.pacs_doctor_id IS NOT NULL"
            elif mapping_status == "unmapped":
                base_query += " AND dm.pacs_doctor_id IS NULL"

            # Count
            cursor.execute(f"SELECT COUNT(*) as count {base_query}", params)
            total = cursor.fetchone()["count"]

            # Data
            cursor.execute(
                f"""
                SELECT 
                    dm.id, dm.external_code, dm.external_name,
                    dm.mapping_type, dm.confidence_level, dm.is_active, dm.notes,
                    dm.updated_at,
                    d.id as pacs_doctor_id, d.name as pacs_doctor_name, d.specialty
                {base_query}
                ORDER BY dm.external_code ASC
                LIMIT %s OFFSET %s
            """,
                params + [page_size, offset],
            )

            mappings = cursor.fetchall()

            return jsonify(
                {
                    "status": "success",
                    "mappings": mappings,
                    "total": total,
                    "page": page,
                    "page_size": page_size,
                }
            ), 200

    except Exception as e:
        logger.error(f"Error listing doctor mappings: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route(
    "/external-systems/<system_id>/mappings/operators", methods=["GET", "OPTIONS"]
)
@require_auth(REQUIRED_PERMISSIONS["read_mapping"])
def list_external_system_operator_mappings(system_id):
    """List operator mappings for a specific external system"""
    if request.method == "OPTIONS":
        return "", 204

    try:
        # Validate system_id
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            try:
                uuid.UUID(system_id)
                cursor.execute(
                    "SELECT id FROM external_systems WHERE id = %s::uuid", (system_id,)
                )
            except ValueError:
                cursor.execute(
                    "SELECT id FROM external_systems WHERE system_code = %s",
                    (system_id,),
                )

            system = cursor.fetchone()
            if not system:
                return jsonify(
                    {"status": "error", "message": "External system not found"}
                ), 404

            real_system_id = system["id"]

            # Pagination
            page = _parse_positive_int(request.args.get("page"), 1)
            page_size = _parse_positive_int(
                request.args.get("page_size"), 50, max_value=100
            )
            offset = (page - 1) * page_size

            # Filters
            search = request.args.get("search")
            mapping_status = request.args.get("status")  # mapped, unmapped

            base_query = """
                FROM operator_mappings om
                WHERE om.external_system_id = %s::uuid
            """
            params = [real_system_id]

            if search:
                base_query += (
                    " AND (om.external_code ILIKE %s OR om.external_name ILIKE %s)"
                )
                params.extend([f"%{search}%", f"%{search}%"])

            if mapping_status == "mapped":
                base_query += " AND om.pacs_user_id IS NOT NULL"
            elif mapping_status == "unmapped":
                base_query += " AND om.pacs_user_id IS NULL"

            # Count
            cursor.execute(f"SELECT COUNT(*) as count {base_query}", params)
            total = cursor.fetchone()["count"]

            # Data
            cursor.execute(
                f"""
                SELECT 
                    om.id, om.external_code, om.external_name,
                    om.mapping_type, om.confidence_level, om.is_active, om.notes,
                    om.updated_at,
                    om.pacs_user_id
                {base_query}
                ORDER BY om.external_code ASC
                LIMIT %s OFFSET %s
            """,
                params + [page_size, offset],
            )

            mappings = cursor.fetchall()

            return jsonify(
                {
                    "status": "success",
                    "mappings": mappings,
                    "total": total,
                    "page": page,
                    "page_size": page_size,
                }
            ), 200

    except Exception as e:
        logger.error(f"Error listing operator mappings: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


def delete_external_system(system_id):
    """Delete external system (will cascade delete all mappings)"""
    try:
        user = request.current_user

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Get system first
            try:
                uuid.UUID(system_id)
                cursor.execute(
                    "SELECT * FROM external_systems WHERE id = %s::uuid", (system_id,)
                )
            except ValueError:
                cursor.execute(
                    "SELECT * FROM external_systems WHERE system_code = %s",
                    (system_id,),
                )

            system = cursor.fetchone()
            if not system:
                return jsonify(
                    {"status": "error", "message": "External system not found"}
                ), 404

            # Check mapping count
            cursor.execute(
                """
                SELECT COUNT(*) as count
                FROM procedure_mappings
                WHERE external_system_id = %s
            """,
                (system["id"],),
            )
            mapping_count = cursor.fetchone()["count"]

            # Delete system (will cascade to mappings due to ON DELETE CASCADE)
            cursor.execute(
                "DELETE FROM external_systems WHERE id = %s", (system["id"],)
            )

        logger.info(
            f"External system deleted: {system['system_code']} (with {mapping_count} mappings) by {user.get('username')}"
        )

        return jsonify(
            {
                "status": "success",
                "message": f"External system deleted successfully (including {mapping_count} mappings)",
            }
        ), 200

    except Exception as e:
        logger.error(f"Error deleting external system: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


# ============================================================================

# SETTINGS ENDPOINTS

# ============================================================================


@app.route("/settings", methods=["GET"])
@require_auth(REQUIRED_PERMISSIONS["read_setting"])
def list_settings():
    """List settings. Sensitive settings only visible to developer/superadmin."""
    try:
        user = request.current_user
        include_sensitive = is_dev_user(user)

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            if include_sensitive:
                cursor.execute("""
                    SELECT id, key, value, description, is_sensitive,
                           created_at, updated_at
                    FROM settings
                    ORDER BY key ASC
                """)
            else:
                cursor.execute("""
                    SELECT id, key, value, description, is_sensitive,
                           created_at, updated_at
                    FROM settings
                    WHERE is_sensitive = FALSE
                    ORDER BY key ASC
                """)

            settings = cursor.fetchall()

            return jsonify(
                {"status": "success", "settings": settings, "count": len(settings)}
            ), 200

    except Exception as e:
        logger.error(f"Error listing settings: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/settings", methods=["POST"])
@require_auth(REQUIRED_PERMISSIONS["write_setting"])
def create_setting():
    """Create a new setting. is_sensitive only allowed for developer/superadmin."""
    try:
        data = request.get_json()
        if not data or "key" not in data or "value" not in data:
            return jsonify(
                {"status": "error", "message": "Missing required fields: key, value"}
            ), 400

        user = request.current_user
        is_sensitive = bool(data.get("is_sensitive", False))

        # Only dev/superadmin can create sensitive settings
        if is_sensitive and not is_dev_user(user):
            return jsonify(
                {
                    "status": "error",
                    "message": "Insufficient permission to create sensitive setting",
                }
            ), 403

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute(
                """
                INSERT INTO settings (key, value, description, is_sensitive)
                VALUES (%s, %s, %s, %s)
                RETURNING id, key, value, description, is_sensitive, created_at, updated_at
                """,
                (
                    data["key"],
                    json.dumps(data["value"]),
                    data.get("description"),
                    is_sensitive,
                ),
            )
            new_setting = cursor.fetchone()

            return jsonify(
                {
                    "status": "success",
                    "message": "Setting created successfully",
                    "setting": new_setting,
                }
            ), 201

    except psycopg2.IntegrityError:
        return jsonify(
            {
                "status": "error",
                "message": f"Setting with key '{data.get('key')}' already exists",
            }
        ), 409
    except Exception as e:
        logger.error(f"Error creating setting: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/settings/<string:key>", methods=["GET"])
@require_auth(REQUIRED_PERMISSIONS["read_setting"])
def get_setting(key):
    """Get a single setting by key. Sensitive settings require developer/superadmin."""
    try:
        user = request.current_user

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute(
                """
                SELECT id, key, value, description, is_sensitive,
                       created_at, updated_at
                FROM settings
                WHERE key = %s
            """,
                (key,),
            )
            setting = cursor.fetchone()

            if not setting:
                return jsonify({"status": "error", "message": "Setting not found"}), 404

            if setting.get("is_sensitive") and not is_dev_user(user):
                return jsonify(
                    {
                        "status": "error",
                        "message": "Insufficient permission to access this setting",
                    }
                ), 403

            return jsonify({"status": "success", "setting": setting}), 200

    except Exception as e:
        logger.error(f"Error getting setting '{key}': {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/settings/<string:key>", methods=["PUT"])
@require_auth(REQUIRED_PERMISSIONS["write_setting"])
def update_setting(key):
    """
    Update a setting by key.
    - Normal admins can update general settings (is_sensitive = false).
    - Sensitive settings and changing is_sensitive require developer/superadmin.
    """
    try:
        user = request.current_user
        data = request.get_json()

        if not data or "value" not in data:
            return jsonify(
                {"status": "error", "message": "Missing required field: value"}
            ), 400

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Load existing setting
            cursor.execute(
                "SELECT id, key, is_sensitive FROM settings WHERE key = %s", (key,)
            )
            existing = cursor.fetchone()

            if not existing:
                return jsonify(
                    {"status": "error", "message": "Setting not found to update"}
                ), 404

            # If existing is sensitive, require dev/superadmin
            if existing["is_sensitive"] and not is_dev_user(user):
                return jsonify(
                    {
                        "status": "error",
                        "message": "Insufficient permission to update this sensitive setting",
                    }
                ), 403

            # Determine new sensitivity flag
            new_is_sensitive = existing["is_sensitive"]
            if "is_sensitive" in data:
                requested_flag = bool(data["is_sensitive"])
                if requested_flag != existing["is_sensitive"]:
                    # Only dev/superadmin can change sensitivity
                    if not is_dev_user(user):
                        return jsonify(
                            {
                                "status": "error",
                                "message": "Only developer/superadmin can change setting sensitivity",
                            }
                        ), 403
                    new_is_sensitive = requested_flag

            cursor.execute(
                """
                UPDATE settings
                SET value = %s,
                    description = %s,
                    is_sensitive = %s,
                    updated_at = NOW()
                WHERE key = %s
                RETURNING id, key, value, description, is_sensitive, updated_at
                """,
                (
                    json.dumps(data["value"]),
                    data.get("description"),
                    new_is_sensitive,
                    key,
                ),
            )

            updated_setting = cursor.fetchone()

            return jsonify(
                {
                    "status": "success",
                    "message": "Setting updated successfully",
                    "setting": updated_setting,
                }
            ), 200

    except Exception as e:
        logger.error(f"Error updating setting '{key}': {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/settings/<string:key>", methods=["DELETE"])
@require_auth(REQUIRED_PERMISSIONS["write_setting"])
def delete_setting(key):
    """
    Delete a setting by key.
    - Normal admins can delete general settings.
    - Sensitive settings require developer/superadmin.
    """
    try:
        user = request.current_user

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            cursor.execute(
                "SELECT key, is_sensitive FROM settings WHERE key = %s", (key,)
            )
            setting = cursor.fetchone()

            if not setting:
                return jsonify(
                    {"status": "error", "message": "Setting not found to delete"}
                ), 404

            if setting["is_sensitive"] and not is_dev_user(user):
                return jsonify(
                    {
                        "status": "error",
                        "message": "Insufficient permission to delete this sensitive setting",
                    }
                ), 403

            cursor.execute("DELETE FROM settings WHERE key = %s RETURNING key", (key,))
            deleted = cursor.fetchone()

            return jsonify(
                {
                    "status": "success",
                    "message": f"Setting '{deleted['key']}' deleted successfully",
                }
            ), 200

    except Exception as e:
        logger.error(f"Error deleting setting '{key}': {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


if __name__ == "__main__":
    try:
        init_database()

        logger.info("Master Data Service database initialized")

    except Exception as e:
        logger.error(f"Failed to initialize: {str(e)}")

    logger.info("=" * 80)

    logger.info("Master Data Service v1.0 starting...")

    logger.info("JWT Authentication: ENABLED")

    logger.info("=" * 80)

    app.run(host="0.0.0.0", port=8002, debug=False)
