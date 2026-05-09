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
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stdout
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# Configuration
DB_CONFIG = {
    'host': os.getenv('POSTGRES_HOST', 'postgres'),
    'database': os.getenv('POSTGRES_DB', 'worklist_db'),
    'user': os.getenv('POSTGRES_USER', 'dicom'),
    'password': os.getenv('POSTGRES_PASSWORD', 'dicom123'),
    'port': int(os.getenv('POSTGRES_PORT', 5432))
}

JWT_SECRET = os.getenv('JWT_SECRET', 'change-this-secret-key-in-production')
JWT_ALGORITHM = 'HS256'

# Permission definitions
REQUIRED_PERMISSIONS = {
    'read_patient': ['patient:read', '*'],
    'create_patient': ['patient:create', '*'],
    'update_patient': ['patient:update', '*'],
    'delete_patient': ['patient:delete', '*'],
    'search_patient': ['patient:search', '*'],
    'read_doctor': ['doctor:read', 'practitioner:read', '*'],
    'create_doctor': ['doctor:create', 'practitioner:create', '*'],
    'update_doctor': ['doctor:update', 'practitioner:update', '*'],
    'delete_doctor': ['doctor:delete', 'practitioner:delete', '*'],
    'search_doctor': ['doctor:search', 'practitioner:search', '*'],
    'read_setting': ['setting:read', '*'],
    'write_setting': ['setting:write', '*']
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
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_patients_national_id ON patients(patient_national_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_patients_ihs_number ON patients(ihs_number)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_patients_mrn ON patients(medical_record_number)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(patient_name)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_patients_birth_date ON patients(birth_date)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_patients_active ON patients(active) WHERE active = true")
            
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
            cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_doctors_ihs_number_unique ON doctors (ihs_number) WHERE ihs_number IS NOT NULL")
            
            # Indexes for doctor performance
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_doctors_national_id ON doctors(national_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_doctors_license ON doctors(license)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_doctors_name ON doctors(name)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_doctors_specialty ON doctors(specialty)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_doctors_active ON doctors(active) WHERE active = true")

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

            cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_key ON settings(key)")

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

def require_auth(required_permissions=[]):
    """Decorator to require authentication and check permissions"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            auth_header = request.headers.get('Authorization')
            
            if not auth_header or not auth_header.startswith('Bearer '):
                return jsonify({
                    "status": "error",
                    "message": "Missing or invalid authorization header"
                }), 401
            
            token = auth_header.split(' ')[1]
            user = verify_token(token)
            
            if not user:
                return jsonify({
                    "status": "error",
                    "message": "Invalid or expired token"
                }), 401
            
            # Check permissions if required
            if required_permissions:
                user_permissions = user.get('permissions', [])
                
                # Admin has all permissions
                if '*' in user_permissions:
                    request.current_user = user
                    return f(*args, **kwargs)
                
                # Check if user has any of the required permissions
                has_permission = any(perm in user_permissions for perm in required_permissions)
                
                if not has_permission:
                    return jsonify({
                        "status": "error",
                        "message": "Permission denied",
                        "required": required_permissions,
                        "user_permissions": user_permissions
                    }), 403
            
            # Attach user info to request
            request.current_user = user
            return f(*args, **kwargs)
            
        return decorated_function
    return decorator

def log_audit(patient_id, action, field_name, old_value, new_value, user):
    """Log audit trail for patients"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO patient_audit_log (
                    patient_id, action, field_name, old_value, new_value,
                    user_id, ip_address, user_agent
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                patient_id,
                action,
                field_name,
                old_value,
                new_value,
                user.get('user_id') if user.get('user_id') else user.get('username'),
                request.remote_addr,
                request.headers.get('User-Agent', '')
            ))
    except Exception as e:
        logger.error(f"Failed to log audit: {str(e)}")

def log_doctor_audit(doctor_id, action, field_name, old_value, new_value, user):
    """Log audit trail for doctors"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO doctor_audit_log (
                    doctor_id, action, field_name, old_value, new_value,
                    user_id, ip_address, user_agent
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                doctor_id,
                action,
                field_name,
                old_value,
                new_value,
                user.get('user_id') if user.get('user_id') else user.get('username'),
                request.remote_addr,
                request.headers.get('User-Agent', '')
            ))
    except Exception as e:
        logger.error(f"Failed to log doctor audit: {str(e)}")

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "service": "master-data-service",
        "version": "1.0.0"
    }), 200

@app.route('/patients', methods=['POST'])
@require_auth(REQUIRED_PERMISSIONS['create_patient'])
def create_patient():
    """Create a new patient - requires patient:create permission"""
    try:
        data = request.get_json()
        user = request.current_user

        # Validate required fields (patient_national_id is now optional)
        required_fields = ['medical_record_number', 'patient_name', 'gender', 'birth_date']
        for field in required_fields:
            if not data.get(field):
                return jsonify({
                    "status": "error",
                    "message": f"Missing required field: {field}"
                }), 400
        
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Check if patient already exists (by MRN, and NIK if provided)
            check_conditions = ["medical_record_number = %s"]
            check_params = [data['medical_record_number']]

            if data.get('patient_national_id'):
                check_conditions.append("patient_national_id = %s")
                check_params.append(data['patient_national_id'])

            cursor.execute(f"""
                SELECT id FROM patients
                WHERE {' OR '.join(check_conditions)}
            """, tuple(check_params))

            existing = cursor.fetchone()
            if existing:
                return jsonify({
                    "status": "error",
                    "message": "Patient with this MRN" + (" or NIK" if data.get('patient_national_id') else "") + " already exists"
                }), 409
            
            # Insert new patient
            cursor.execute("""
                INSERT INTO patients (
                    patient_national_id, ihs_number, medical_record_number, patient_name,
                    gender, birth_date, address, phone, email, nationality, ethnicity,
                    religion, marital_status, occupation, education_level,
                    emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
                    insurance_provider, insurance_policy_number, insurance_member_id
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                ) RETURNING id
            """, (
                data['patient_national_id'], data.get('ihs_number'), data['medical_record_number'], data['patient_name'],
                data['gender'], data['birth_date'], data.get('address'), data.get('phone'), data.get('email'),
                data.get('nationality'), data.get('ethnicity'), data.get('religion'), data.get('marital_status'),
                data.get('occupation'), data.get('education_level'), data.get('emergency_contact_name'),
                data.get('emergency_contact_phone'), data.get('emergency_contact_relationship'),
                data.get('insurance_provider'), data.get('insurance_policy_number'), data.get('insurance_member_id')
            ))
            
            result = cursor.fetchone()
            patient_id = result['id']
            
            # Log audit
            log_audit(patient_id, 'CREATE', 'patient', None, json.dumps(data), user)
            
            return jsonify({
                "status": "success",
                "message": "Patient created successfully",
                "patient_id": str(patient_id)
            }), 201
            
    except Exception as e:
        logger.error(f"Error creating patient: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/patients/<patient_id_or_nik>', methods=['GET'])
@require_auth(REQUIRED_PERMISSIONS['read_patient'])
def get_patient(patient_id_or_nik):
    """Get patient by ID or NIK - requires patient:read permission"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Check if input is UUID, NIK, or MRN
            if len(patient_id_or_nik) == 36:  # UUID format
                cursor.execute("""
                    SELECT * FROM patients
                    WHERE id = %s::uuid AND deleted_at IS NULL
                """, (patient_id_or_nik,))
            else:  # Try NIK or MRN
                cursor.execute("""
                    SELECT * FROM patients
                    WHERE (patient_national_id = %s OR medical_record_number = %s)
                    AND deleted_at IS NULL
                """, (patient_id_or_nik, patient_id_or_nik))
            
            patient = cursor.fetchone()
            
            if not patient:
                return jsonify({
                    "status": "error",
                    "message": "Patient not found"
                }), 404
            
            # Get related data
            cursor.execute("""
                SELECT * FROM patient_allergies 
                WHERE patient_id = %s ORDER BY created_at DESC
            """, (patient['id'],))
            allergies = cursor.fetchall()
            
            cursor.execute("""
                SELECT * FROM patient_medical_history 
                WHERE patient_id = %s ORDER BY created_at DESC
            """, (patient['id'],))
            medical_history = cursor.fetchall()
            
            cursor.execute("""
                SELECT * FROM patient_family_history 
                WHERE patient_id = %s ORDER BY created_at DESC
            """, (patient['id'],))
            family_history = cursor.fetchall()
            
            cursor.execute("""
                SELECT * FROM patient_medications 
                WHERE patient_id = %s ORDER BY created_at DESC
            """, (patient['id'],))
            medications = cursor.fetchall()
            
            patient_data = dict(patient)
            patient_data['allergies'] = allergies
            patient_data['medical_history'] = medical_history
            patient_data['family_history'] = family_history
            patient_data['medications'] = medications
            
            return jsonify({
                "status": "success",
                "patient": patient_data
            }), 200
            
    except Exception as e:
        logger.error(f"Error retrieving patient: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/patients/<patient_id>', methods=['PUT'])
@require_auth(REQUIRED_PERMISSIONS['update_patient'])
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
                return jsonify({
                    "status": "error",
                    "message": "Patient not found"
                }), 404
            
            # Build update query dynamically
            update_fields = []
            update_values = []
            
            for field in [
                'ihs_number', 'medical_record_number', 'patient_name', 'gender', 'birth_date',
                'address', 'phone', 'email', 'nationality', 'ethnicity', 'religion',
                'marital_status', 'occupation', 'education_level', 'emergency_contact_name',
                'emergency_contact_phone', 'emergency_contact_relationship',
                'insurance_provider', 'insurance_policy_number', 'insurance_member_id'
            ]:
                if field in data:
                    update_fields.append(f"{field} = %s")
                    update_values.append(data[field])
            
            if not update_fields:
                return jsonify({
                    "status": "error",
                    "message": "No valid fields to update"
                }), 400
            
            update_values.append(patient_id)
            
            # Update patient
            cursor.execute(f"""
                UPDATE patients SET {', '.join(update_fields)}, updated_at = NOW()
                WHERE id = %s::uuid
                RETURNING *
            """, update_values)
            
            updated = cursor.fetchone()
            
            # Log audit for each changed field
            for field in data:
                if field in current and current[field] != data[field]:
                    log_audit(patient_id, 'UPDATE', field, str(current[field]), str(data[field]), user)
            
            return jsonify({
                "status": "success",
                "message": "Patient updated successfully",
                "patient": dict(updated)
            }), 200
            
    except Exception as e:
        logger.error(f"Error updating patient: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/patients/<patient_id>', methods=['DELETE'])
@require_auth(REQUIRED_PERMISSIONS['delete_patient'])
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
                return jsonify({
                    "status": "error",
                    "message": "Patient not found"
                }), 404
            
            # Soft delete patient
            cursor.execute("""
                UPDATE patients SET deleted_at = NOW(), active = false
                WHERE id = %s::uuid
            """, (patient_id,))
            
            # Log audit
            log_audit(patient_id, 'DELETE', 'patient', 'active', 'deleted', user)
            
            return jsonify({
                "status": "success",
                "message": "Patient deleted successfully"
            }), 200
            
    except Exception as e:
        logger.error(f"Error deleting patient: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/patients', methods=['GET'])
@require_auth(REQUIRED_PERMISSIONS['search_patient'])
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
        patient_national_id = request.args.get('patient_national_id')
        medical_record_number = request.args.get('medical_record_number')
        patient_name = request.args.get('patient_name')
        ihs_number = request.args.get('ihs_number')

        try:
            page = max(int(request.args.get('page', 1)), 1)
        except ValueError:
            page = 1

        try:
            page_size = int(request.args.get('page_size', 25))
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
            total = cursor.fetchone()['count']

            # Data page
            cursor.execute(f"""
                SELECT id, patient_national_id, medical_record_number, patient_name,
                       gender, birth_date, ihs_number, created_at, active
                {base_query}
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s
            """, params + [page_size, offset])
            patients = cursor.fetchall()

            return jsonify({
                "status": "success",
                "patients": patients,
                "count": len(patients),
                "page": page,
                "page_size": page_size,
                "total": total
            }), 200

    except Exception as e:
        logger.error(f"Error listing patients: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/patients/search', methods=['GET'])
@require_auth(REQUIRED_PERMISSIONS['search_patient'])
def search_patients():
    """Legacy simple search patients - requires patient:search permission"""
    try:
        patient_national_id = request.args.get('patient_national_id')
        medical_record_number = request.args.get('medical_record_number')
        patient_name = request.args.get('patient_name')
        ihs_number = request.args.get('ihs_number')
        
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
            
            return jsonify({
                "status": "success",
                "patients": patients,
                "count": len(patients)
            }), 200
            
    except Exception as e:
        logger.error(f"Error searching patients: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

# ============================================================================
# DOCTOR/PRACTITIONER ENDPOINTS
# ============================================================================

@app.route('/doctors', methods=['POST'])
@require_auth(REQUIRED_PERMISSIONS['create_doctor'])
def create_doctor():
    """Create a new doctor - requires doctor:create permission"""
    try:
        data = request.get_json()
        user = request.current_user
        
        # Validate required fields (matching doctors.json format)
        if not data.get('name'):
            return jsonify({
                "status": "error",
                "message": "Missing required field: name"
            }), 400

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Check for duplicates
            if data.get('ihs_number') or data.get('national_id') or data.get('license'):
                check_query = "SELECT id FROM doctors WHERE "
                check_params = []
                conditions = []

                if data.get('ihs_number'):
                    conditions.append("ihs_number = %s")
                    check_params.append(data['ihs_number'])
                if data.get('national_id'):
                    conditions.append("national_id = %s")
                    check_params.append(data['national_id'])
                if data.get('license'):
                    conditions.append("license = %s")
                    check_params.append(data['license'])

                check_query += " OR ".join(conditions)
                cursor.execute(check_query, check_params)

                existing = cursor.fetchone()
                if existing:
                    return jsonify({
                        "status": "error",
                        "message": "Doctor with this IHS number, national ID, or license already exists"
                    }), 409

            # Insert new doctor (matching doctors.json format)
            # Handle empty strings for ihs_number by converting to None
            ihs_number = data.get('ihs_number') if data.get('ihs_number') else None
            
            cursor.execute("""
                INSERT INTO doctors (
                    ihs_number, national_id, name, license, specialty,
                    phone, email, birth_date, gender
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s
                ) RETURNING id
            """, (
                ihs_number, data.get('national_id'), data['name'], data.get('license'),
                data.get('specialty'), data.get('phone'), data.get('email'), data.get('birth_date'), 
                data.get('gender')
            ))

            result = cursor.fetchone()
            doctor_id = result['id']

            # Log audit
            log_doctor_audit(doctor_id, 'CREATE', 'doctor', None, json.dumps(data), user)

            return jsonify({
                "status": "success",
                "message": "Doctor created successfully",
                "doctor_id": str(doctor_id)
            }), 201

    except Exception as e:
        logger.error(f"Error creating doctor: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/doctors/<doctor_id_or_identifier>', methods=['GET'])
@require_auth(REQUIRED_PERMISSIONS['read_doctor'])
def get_doctor(doctor_id_or_identifier):
    """Get doctor by ID, national ID, IHS number, or license - requires doctor:read permission"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Try national_id, ihs_number, or license
            cursor.execute("""
                SELECT * FROM doctors
                WHERE (national_id = %s OR ihs_number = %s OR license = %s)
                AND deleted_at IS NULL
            """, (doctor_id_or_identifier, doctor_id_or_identifier, doctor_id_or_identifier))

            doctor = cursor.fetchone()

            if not doctor:
                # Try UUID
                try:
                    cursor.execute("""
                        SELECT * FROM doctors 
                        WHERE id = %s::uuid AND deleted_at IS NULL
                    """, (doctor_id_or_identifier,))
                    doctor = cursor.fetchone()
                except:
                    pass

            if not doctor:
                return jsonify({
                    "status": "error",
                    "message": "Doctor not found"
                }), 404

            # Get qualifications
            cursor.execute("""
                SELECT * FROM doctor_qualifications 
                WHERE doctor_id = %s::uuid 
                ORDER BY created_at DESC
            """, (doctor['id'],))
            qualifications = cursor.fetchall()

            # Get schedules
            cursor.execute("""
                SELECT * FROM doctor_schedules 
                WHERE doctor_id = %s::uuid 
                ORDER BY day_of_week, start_time
            """, (doctor['id'],))
            schedules = cursor.fetchall()

            doctor_dict = dict(doctor)
            doctor_dict['qualifications'] = qualifications
            doctor_dict['schedules'] = schedules

            return jsonify({
                "status": "success",
                "doctor": doctor_dict
            }), 200

    except Exception as e:
        logger.error(f"Error retrieving doctor: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/doctors/<doctor_id>', methods=['PUT'])
@require_auth(REQUIRED_PERMISSIONS['update_doctor'])
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
                return jsonify({
                    "status": "error",
                    "message": "Doctor not found"
                }), 404

            # Build update query dynamically (matching doctors.json format)
            update_fields = []
            update_values = []

            # Handle ihs_number specifically to convert empty strings to None
            if 'ihs_number' in data:
                ihs_number = data['ihs_number'] if data['ihs_number'] else None
                update_fields.append("ihs_number = %s")
                update_values.append(ihs_number)
            
            for field in [
                'national_id', 'name', 'license', 'specialty',
                'phone', 'email', 'birth_date', 'gender', 'active'
            ]:
                if field in data:
                    update_fields.append(f"{field} = %s")
                    update_values.append(data[field])

            if not update_fields:
                return jsonify({
                    "status": "error",
                    "message": "No valid fields to update"
                }), 400

            update_values.append(doctor_id)

            # Update doctor
            cursor.execute(f"""
                UPDATE doctors SET {', '.join(update_fields)}, updated_at = NOW()
                WHERE id = %s::uuid
                RETURNING *
            """, update_values)

            updated = cursor.fetchone()

            # Log audit for each changed field
            for field in data:
                if field in current and current[field] != data[field]:
                    log_doctor_audit(doctor_id, 'UPDATE', field, str(current[field]), str(data[field]), user)

            return jsonify({
                "status": "success",
                "message": "Doctor updated successfully",
                "doctor": dict(updated)
            }), 200

    except Exception as e:
        logger.error(f"Error updating doctor: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/doctors/<doctor_id>', methods=['DELETE'])
@require_auth(REQUIRED_PERMISSIONS['delete_doctor'])
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
                return jsonify({
                    "status": "error",
                    "message": "Doctor not found"
                }), 404

            # Soft delete doctor
            cursor.execute("""
                UPDATE doctors SET deleted_at = NOW(), active = false
                WHERE id = %s::uuid
            """, (doctor_id,))

            # Log audit
            log_doctor_audit(doctor_id, 'DELETE', 'doctor', 'active', 'deleted', user)

            return jsonify({
                "status": "success",
                "message": "Doctor deleted successfully"
            }), 200

    except Exception as e:
        logger.error(f"Error deleting doctor: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/doctors', methods=['GET'])
@require_auth(REQUIRED_PERMISSIONS['search_doctor'])
def list_doctors():
    return search_doctors()

@app.route('/doctors/all', methods=['GET'])
@require_auth(REQUIRED_PERMISSIONS['search_doctor'])
def list_all_doctors():
    """List all active doctors (alias for search_doctors without filters)."""
    # Inject default active=true behavior via query args if not provided
    if 'active' not in request.args:
        # Werkzeug ImmutableMultiDict, so copy to mutable dict
        args = request.args.to_dict(flat=True)
        args['active'] = 'true'
        request.args = type(request.args)(args)
    return search_doctors()

@app.route('/doctors/search', methods=['GET'])
@require_auth(REQUIRED_PERMISSIONS['search_doctor'])
def search_doctors():
    """Search doctors - requires doctor:search permission"""
    try:
        ihs_number = request.args.get('ihs_number')
        national_id = request.args.get('national_id')
        name = request.args.get('name')
        license = request.args.get('license')
        specialty = request.args.get('specialty')
        active = request.args.get('active', 'true').lower() == 'true'

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

            return jsonify({
                "status": "success",
                "doctors": doctors,
                "count": len(doctors)
            }), 200

    except Exception as e:
        logger.error(f"Error searching doctors: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

# ============================================================================

# DOCTOR QUALIFICATIONS ENDPOINTS
# ============================================================================

@app.route('/doctors/<doctor_id>/qualifications', methods=['GET'])
@require_auth(REQUIRED_PERMISSIONS['read_doctor'])
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
                return jsonify({
                    "status": "error",
                    "message": "Doctor not found"
                }), 404

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

            return jsonify({
                "status": "success",
                "qualifications": rows,
                "count": len(rows)
            }), 200

    except Exception as e:
        logger.error(f"Error listing doctor qualifications: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/doctors/<doctor_id>/qualifications', methods=['POST'])
@require_auth(REQUIRED_PERMISSIONS['update_doctor'])
def add_doctor_qualification(doctor_id):
    """Add qualification to doctor - requires doctor:update permission"""
    try:
        data = request.get_json()
        user = request.current_user

        if not data or not data.get('qualification_type'):
            return jsonify({
                "status": "error",
                "message": "Missing required field: qualification_type"
            }), 400

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Check if doctor exists
            cursor.execute(
                "SELECT id FROM doctors WHERE id = %s::uuid AND deleted_at IS NULL",
                (doctor_id,),
            )
            if not cursor.fetchone():
                return jsonify({
                    "status": "error",
                    "message": "Doctor not found"
                }), 404

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
                    data['qualification_type'],
                    data.get('qualification_code'),
                    data.get('institution'),
                    data.get('year_obtained'),
                    data.get('expiry_date'),
                    data.get('issuer'),
                    data.get('notes'),
                ),
            )

            result = cursor.fetchone()
            qualification_id = result['id']

            # Log audit
            log_doctor_audit(
                doctor_id,
                'ADD_QUALIFICATION',
                'qualifications',
                None,
                json.dumps(data),
                user,
            )

            return jsonify({
                "status": "success",
                "message": "Qualification added successfully",
                "qualification_id": str(qualification_id)
            }), 201

    except Exception as e:
        logger.error(f"Error adding doctor qualification: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/doctors/<doctor_id>/qualifications/<qualification_id>', methods=['PUT'])
@require_auth(REQUIRED_PERMISSIONS['update_doctor'])
def update_doctor_qualification(doctor_id, qualification_id):
    """Update doctor qualification - requires doctor:update permission"""
    try:
        data = request.get_json()
        user = request.current_user

        if not data:
            return jsonify({
                "status": "error",
                "message": "No data provided"
            }), 400

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
                return jsonify({
                    "status": "error",
                    "message": "Qualification not found"
                }), 404

            update_fields = []
            update_values = []

            for field in [
                'qualification_type',
                'qualification_code',
                'institution',
                'year_obtained',
                'expiry_date',
                'issuer',
                'notes',
            ]:
                if field in data:
                    update_fields.append(f"{field} = %s")
                    update_values.append(data[field])

            if not update_fields:
                return jsonify({
                    "status": "error",
                    "message": "No valid fields to update"
                }), 400

            update_values.extend([qualification_id, doctor_id])

            cursor.execute(
                f"""
                UPDATE doctor_qualifications
                SET {', '.join(update_fields)}, updated_at = NOW()
                WHERE id = %s::uuid AND doctor_id = %s::uuid
                RETURNING *
                """,
                update_values,
            )
            updated = cursor.fetchone()

            # Audit per field
            for field in data:
                if field in current and current[field] != data[field]:
                    log_doctor_audit(
                        doctor_id,
                        'UPDATE_QUALIFICATION',
                        field,
                        str(current[field]),
                        str(data[field]),
                        user,
                    )

            return jsonify({
                "status": "success",
                "message": "Qualification updated successfully",
                "qualification": updated
            }), 200

    except Exception as e:
        logger.error(f"Error updating doctor qualification: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/doctors/<doctor_id>/qualifications/<qualification_id>', methods=['DELETE'])
@require_auth(REQUIRED_PERMISSIONS['update_doctor'])
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
                return jsonify({
                    "status": "error",
                    "message": "Qualification not found"
                }), 404

            log_doctor_audit(
                doctor_id,
                'DELETE_QUALIFICATION',
                'qualifications',
                deleted['qualification_type'],
                None,
                user,
            )

            return jsonify({
                "status": "success",
                "message": "Qualification deleted successfully"
            }), 200

    except Exception as e:
        logger.error(f"Error deleting doctor qualification: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


def is_dev_user(user: dict) -> bool:
    """
    Determine if user is allowed to manage sensitive (developer-only) settings.

    Rules:
    - Has '*' permission (global superadmin), OR
    - Has 'system:admin' OR 'setting:dev' in permissions.
    """
    if not user:
        return False
    perms = user.get('permissions', []) or []
    if '*' in perms:
        return True
    if 'system:admin' in perms:
        return True
    if 'setting:dev' in perms:
        return True
    return False


# ============================================================================

# SETTINGS ENDPOINTS

# ============================================================================



@app.route('/settings', methods=['GET'])
@require_auth(REQUIRED_PERMISSIONS['read_setting'])
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

            return jsonify({
                "status": "success",
                "settings": settings,
                "count": len(settings)
            }), 200

    except Exception as e:
        logger.error(f"Error listing settings: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500



@app.route('/settings', methods=['POST'])
@require_auth(REQUIRED_PERMISSIONS['write_setting'])
def create_setting():
    """Create a new setting. is_sensitive only allowed for developer/superadmin."""
    try:
        data = request.get_json()
        if not data or 'key' not in data or 'value' not in data:
            return jsonify({
                "status": "error",
                "message": "Missing required fields: key, value"
            }), 400

        user = request.current_user
        is_sensitive = bool(data.get('is_sensitive', False))

        # Only dev/superadmin can create sensitive settings
        if is_sensitive and not is_dev_user(user):
            return jsonify({
                "status": "error",
                "message": "Insufficient permission to create sensitive setting"
            }), 403

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute(
                """
                INSERT INTO settings (key, value, description, is_sensitive)
                VALUES (%s, %s, %s, %s)
                RETURNING id, key, value, description, is_sensitive, created_at, updated_at
                """,
                (data['key'], json.dumps(data['value']), data.get('description'), is_sensitive)
            )
            new_setting = cursor.fetchone()

            return jsonify({
                "status": "success",
                "message": "Setting created successfully",
                "setting": new_setting
            }), 201

    except psycopg2.IntegrityError:
        return jsonify({
            "status": "error",
            "message": f"Setting with key '{data.get('key')}' already exists"
        }), 409
    except Exception as e:
        logger.error(f"Error creating setting: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500



@app.route('/settings/<string:key>', methods=['GET'])
@require_auth(REQUIRED_PERMISSIONS['read_setting'])
def get_setting(key):
    """Get a single setting by key. Sensitive settings require developer/superadmin."""
    try:
        user = request.current_user

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("""
                SELECT id, key, value, description, is_sensitive,
                       created_at, updated_at
                FROM settings
                WHERE key = %s
            """, (key,))
            setting = cursor.fetchone()

            if not setting:
                return jsonify({"status": "error", "message": "Setting not found"}), 404

            if setting.get('is_sensitive') and not is_dev_user(user):
                return jsonify({
                    "status": "error",
                    "message": "Insufficient permission to access this setting"
                }), 403

            return jsonify({"status": "success", "setting": setting}), 200

    except Exception as e:
        logger.error(f"Error getting setting '{key}': {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500



@app.route('/settings/<string:key>', methods=['PUT'])
@require_auth(REQUIRED_PERMISSIONS['write_setting'])
def update_setting(key):
    """
    Update a setting by key.
    - Normal admins can update general settings (is_sensitive = false).
    - Sensitive settings and changing is_sensitive require developer/superadmin.
    """
    try:
        user = request.current_user
        data = request.get_json()

        if not data or 'value' not in data:
            return jsonify({
                "status": "error",
                "message": "Missing required field: value"
            }), 400

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Load existing setting
            cursor.execute(
                "SELECT id, key, is_sensitive FROM settings WHERE key = %s",
                (key,)
            )
            existing = cursor.fetchone()

            if not existing:
                return jsonify({
                    "status": "error",
                    "message": "Setting not found to update"
                }), 404

            # If existing is sensitive, require dev/superadmin
            if existing['is_sensitive'] and not is_dev_user(user):
                return jsonify({
                    "status": "error",
                    "message": "Insufficient permission to update this sensitive setting"
                }), 403

            # Determine new sensitivity flag
            new_is_sensitive = existing['is_sensitive']
            if 'is_sensitive' in data:
                requested_flag = bool(data['is_sensitive'])
                if requested_flag != existing['is_sensitive']:
                    # Only dev/superadmin can change sensitivity
                    if not is_dev_user(user):
                        return jsonify({
                            "status": "error",
                            "message": "Only developer/superadmin can change setting sensitivity"
                        }), 403
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
                (json.dumps(data['value']), data.get('description'),
                 new_is_sensitive, key)
            )

            updated_setting = cursor.fetchone()

            return jsonify({
                "status": "success",
                "message": "Setting updated successfully",
                "setting": updated_setting
            }), 200

    except Exception as e:
        logger.error(f"Error updating setting '{key}': {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500



@app.route('/settings/<string:key>', methods=['DELETE'])
@require_auth(REQUIRED_PERMISSIONS['write_setting'])
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
                "SELECT key, is_sensitive FROM settings WHERE key = %s",
                (key,)
            )
            setting = cursor.fetchone()

            if not setting:
                return jsonify({
                    "status": "error",
                    "message": "Setting not found to delete"
                }), 404

            if setting['is_sensitive'] and not is_dev_user(user):
                return jsonify({
                    "status": "error",
                    "message": "Insufficient permission to delete this sensitive setting"
                }), 403

            cursor.execute(
                "DELETE FROM settings WHERE key = %s RETURNING key",
                (key,)
            )
            deleted = cursor.fetchone()

            return jsonify({
                "status": "success",
                "message": f"Setting '{deleted['key']}' deleted successfully"
            }), 200

    except Exception as e:
        logger.error(f"Error deleting setting '{key}': {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500



if __name__ == '__main__':

    try:

        init_database()

        logger.info("Master Data Service database initialized")

    except Exception as e:

        logger.error(f"Failed to initialize: {str(e)}")

    

    logger.info("=" * 80)

    logger.info("Master Data Service v1.0 starting...")

    logger.info("JWT Authentication: ENABLED")

    logger.info("=" * 80)

    

    app.run(host='0.0.0.0', port=8002, debug=False)
