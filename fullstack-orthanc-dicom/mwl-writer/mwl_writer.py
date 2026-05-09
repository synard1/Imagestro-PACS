"""
MWL Writer Service v4.0 - Secured with JWT Authentication
DICOM Worklist Management with Complete Security
"""
import os
import sys
import uuid
import json
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from pydicom.dataset import Dataset, FileMetaDataset
from pydicom.uid import generate_uid, ExplicitVRLittleEndian
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

WORKLIST_DIR = "/worklists"
JWT_SECRET = os.getenv('JWT_SECRET', 'change-this-secret-key')
JWT_ALGORITHM = 'HS256'

DB_CONFIG = {
    'host': os.getenv('POSTGRES_HOST', 'postgres'),
    'database': os.getenv('POSTGRES_DB', 'worklist_db'),
    'user': os.getenv('POSTGRES_USER', 'dicom'),
    'password': os.getenv('POSTGRES_PASSWORD', 'dicom123'),
    'port': 5432
}

# Permission definitions
REQUIRED_PERMISSIONS = {
    'create_worklist': ['worklist:create', '*'],
    'read_worklist': ['worklist:read', '*'],
    'update_worklist': ['worklist:update', '*'],
    'delete_worklist': ['worklist:delete', '*'],
    'search_worklist': ['worklist:search', '*']
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
    """Initialize worklist tables with UUID"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            cursor.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
            
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS worklists (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    accession_number VARCHAR(50) UNIQUE NOT NULL,
                    patient_id VARCHAR(50) NOT NULL,
                    patient_name VARCHAR(200) NOT NULL,
                    patient_birth_date VARCHAR(8),
                    patient_sex VARCHAR(1),
                    modality VARCHAR(10),
                    procedure_description TEXT,
                    scheduled_date VARCHAR(8),
                    scheduled_time VARCHAR(6),
                    physician_name VARCHAR(200),
                    station_aet VARCHAR(50),
                    study_instance_uid VARCHAR(200),
                    status VARCHAR(20) DEFAULT 'SCHEDULED',
                    filename VARCHAR(200),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    created_by VARCHAR(200),
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    modified_by VARCHAR(200),
                    deleted_at TIMESTAMP,
                    deleted_by VARCHAR(200)
                )
            """)
            
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_worklists_accession ON worklists(accession_number)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_worklists_patient_id ON worklists(patient_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_worklists_status ON worklists(status)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_worklists_scheduled_date ON worklists(scheduled_date)")
            
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS worklist_audit_log (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    worklist_id UUID REFERENCES worklists(id) ON DELETE CASCADE,
                    accession_number VARCHAR(50),
                    action VARCHAR(50) NOT NULL,
                    before_data JSONB,
                    after_data JSONB,
                    user_info VARCHAR(200),
                    ip_address VARCHAR(45),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_audit_worklist_id ON worklist_audit_log(worklist_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_audit_action ON worklist_audit_log(action)")
            
            logger.info("Worklist database initialized with UUID")
            
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
                    log_audit(None, None, 'PERMISSION_DENIED', None, None, user)
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

def log_audit(worklist_id, accession, action, before_data, after_data, user):
    """Log audit trail"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO worklist_audit_log (
                    worklist_id, accession_number, action, before_data, after_data, 
                    user_info, ip_address
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (
                worklist_id,
                accession,
                action,
                json.dumps(before_data) if before_data else None,
                json.dumps(after_data) if after_data else None,
                user.get('username') if user else 'system',
                request.remote_addr
            ))
    except Exception as e:
        logger.error(f"Failed to log audit: {str(e)}")

def create_worklist_file(order_data):
    """Create DICOM worklist file"""
    try:
        ds = Dataset()
        ds.is_little_endian = True
        ds.is_implicit_VR = False
        
        file_meta = FileMetaDataset()
        file_meta.MediaStorageSOPClassUID = '1.2.840.10008.5.1.4.31'
        file_meta.MediaStorageSOPInstanceUID = generate_uid()
        file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
        file_meta.ImplementationClassUID = generate_uid()
        
        ds.file_meta = file_meta
        
        ds.PatientName = order_data.get('patient_name', 'DOE^JOHN')
        ds.PatientID = order_data.get('patient_id', '12345678')
        ds.PatientBirthDate = order_data.get('patient_birth_date', '19800101')
        ds.PatientSex = order_data.get('patient_sex', 'M')
        
        accession_number = order_data.get('accession_number', f"ACC{datetime.now().strftime('%Y%m%d%H%M%S')}")
        study_uid = order_data.get('study_instance_uid', generate_uid())
        
        ds.AccessionNumber = accession_number
        ds.StudyInstanceUID = study_uid
        ds.RequestedProcedureDescription = order_data.get('procedure_description', 'MRI Kepala')
        ds.RequestedProcedureID = order_data.get('requested_procedure_id', '001')
        ds.SpecificCharacterSet = 'ISO_IR 100'
        
        order_data['accession_number'] = accession_number
        order_data['study_instance_uid'] = study_uid
        
        sps_item = Dataset()
        sps_item.Modality = order_data.get('modality', 'MR')
        sps_item.ScheduledStationAETitle = order_data.get('station_aet', 'SCANNER01')
        sps_item.ScheduledProcedureStepStartDate = order_data.get('scheduled_date', datetime.now().strftime('%Y%m%d'))
        sps_item.ScheduledProcedureStepStartTime = order_data.get('scheduled_time', '080000')
        sps_item.ScheduledPerformingPhysicianName = order_data.get('physician_name', 'DR.SMITH')
        sps_item.ScheduledProcedureStepDescription = order_data.get('step_description', 'MRI Kepala')
        sps_item.ScheduledProcedureStepID = order_data.get('step_id', '001')
        
        ds.ScheduledProcedureStepSequence = [sps_item]
        
        filename = f"{ds.AccessionNumber}.wl"
        filepath = os.path.join(WORKLIST_DIR, filename)
        ds.save_as(filepath, write_like_original=False)
        
        logger.info(f"Created worklist file: {filename}")
        return filepath, filename
        
    except Exception as e:
        logger.error(f"Error creating worklist file: {str(e)}")
        raise

@app.route('/', methods=['GET'])
def index():
    return jsonify({
        "service": "MWL Writer Service",
        "version": "4.0 (Secured)",
        "status": "running",
        "security": "JWT Authentication Enabled",
        "endpoints": {
            "health": "GET /health",
            "create": "POST /worklist/create [AUTH]",
            "list": "GET /worklist/list [AUTH]",
            "get": "GET /worklist/<id> [AUTH]",
            "update": "PUT /worklist/<id>/status [AUTH]",
            "search": "GET /worklist/search [AUTH]"
        }
    }), 200

@app.route('/health', methods=['GET'])
def health():
    db_status = "unknown"
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            db_status = "healthy"
    except:
        db_status = "unhealthy"
    
    return jsonify({
        "status": "healthy",
        "service": "mwl-writer-secured",
        "version": "4.0",
        "database": db_status,
        "authentication": "enabled",
        "timestamp": datetime.utcnow().isoformat()
    }), 200

@app.route('/worklist/create', methods=['POST'])
@require_auth(REQUIRED_PERMISSIONS['create_worklist'])
def create_worklist():
    """Create new worklist - requires worklist:create permission"""
    try:
        if not request.is_json:
            return jsonify({"status": "error", "message": "Content-Type must be application/json"}), 400
        
        order_data = request.get_json()
        user = request.current_user
        
        if not order_data:
            return jsonify({"status": "error", "message": "Empty request body"}), 400
        
        required_fields = ['patient_name', 'patient_id', 'accession_number']
        missing_fields = [field for field in required_fields if field not in order_data]
        
        if missing_fields:
            return jsonify({
                "status": "error",
                "message": f"Missing required fields: {', '.join(missing_fields)}"
            }), 400
        
        filepath, filename = create_worklist_file(order_data)
        
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            worklist_uuid = uuid.uuid4()
            
            cursor.execute("""
                INSERT INTO worklists (
                    id, accession_number, patient_id, patient_name, patient_birth_date,
                    patient_sex, modality, procedure_description, scheduled_date,
                    scheduled_time, physician_name, station_aet, study_instance_uid,
                    filename, status, created_by
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                )
                RETURNING id
            """, (
                worklist_uuid,
                order_data.get('accession_number'),
                order_data.get('patient_id'),
                order_data.get('patient_name'),
                order_data.get('patient_birth_date'),
                order_data.get('patient_sex'),
                order_data.get('modality'),
                order_data.get('procedure_description'),
                order_data.get('scheduled_date'),
                order_data.get('scheduled_time'),
                order_data.get('physician_name'),
                order_data.get('station_aet'),
                order_data.get('study_instance_uid'),
                filename,
                'SCHEDULED',
                user.get('username')
            ))
            
            returned_uuid = cursor.fetchone()[0]
            
            log_audit(returned_uuid, order_data.get('accession_number'), 'CREATED', None, order_data, user)
        
        logger.info(f"Worklist created by {user.get('username')}: {filename}")
        
        return jsonify({
            "status": "success",
            "message": "Worklist created successfully",
            "worklist_id": str(returned_uuid),
            "filename": filename,
            "accession_number": order_data.get('accession_number'),
            "created_by": user.get('username')
        }), 201
        
    except psycopg2.IntegrityError:
        return jsonify({
            "status": "error",
            "message": f"Accession number {order_data.get('accession_number')} already exists"
        }), 409
    except Exception as e:
        logger.error(f"Error creating worklist: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/worklist/list', methods=['GET'])
@require_auth(REQUIRED_PERMISSIONS['read_worklist'])
def list_worklists():
    """List worklists - requires worklist:read permission"""
    try:
        status = request.args.get('status')
        date = request.args.get('date')
        limit = request.args.get('limit', 100, type=int)
        offset = request.args.get('offset', 0, type=int)
        include_deleted = request.args.get('include_deleted', 'false').lower() == 'true'
        
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            query = "SELECT id::text, * FROM worklists WHERE 1=1"
            params = []
            
            if not include_deleted:
                query += " AND deleted_at IS NULL"
            
            if status:
                query += " AND status = %s"
                params.append(status)
            
            if date:
                query += " AND scheduled_date = %s"
                params.append(date)
            
            query += " ORDER BY created_at DESC LIMIT %s OFFSET %s"
            params.extend([limit, offset])
            
            cursor.execute(query, params)
            worklists = cursor.fetchall()
            
            count_query = "SELECT COUNT(*) FROM worklists WHERE 1=1"
            if not include_deleted:
                count_query += " AND deleted_at IS NULL"
            
            cursor.execute(count_query)
            total_count = cursor.fetchone()['count']
            
            return jsonify({
                "status": "success",
                "worklists": worklists,
                "count": len(worklists),
                "total": total_count,
                "limit": limit,
                "offset": offset
            }), 200
            
    except Exception as e:
        logger.error(f"Error listing worklists: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/worklist/<identifier>', methods=['GET'])
@require_auth(REQUIRED_PERMISSIONS['read_worklist'])
def get_worklist(identifier):
    """Get specific worklist by UUID or accession number"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            try:
                uuid_obj = uuid.UUID(identifier)
                cursor.execute("SELECT id::text, * FROM worklists WHERE id = %s", (uuid_obj,))
            except ValueError:
                cursor.execute("SELECT id::text, * FROM worklists WHERE accession_number = %s", (identifier,))
            
            worklist = cursor.fetchone()
            
            if not worklist:
                return jsonify({"status": "error", "message": "Worklist not found"}), 404
            
            return jsonify({"status": "success", "worklist": worklist}), 200
            
    except Exception as e:
        logger.error(f"Error getting worklist: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/worklist/<identifier>/status', methods=['PUT'])
@require_auth(REQUIRED_PERMISSIONS['update_worklist'])
def update_status(identifier):
    """Update worklist status - requires worklist:update permission"""
    try:
        data = request.get_json()
        new_status = data.get('status')
        user = request.current_user
        
        if not new_status:
            return jsonify({"status": "error", "message": "Status is required"}), 400
        
        valid_statuses = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']
        if new_status not in valid_statuses:
            return jsonify({
                "status": "error",
                "message": f"Invalid status. Must be one of: {', '.join(valid_statuses)}"
            }), 400
        
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            try:
                uuid_obj = uuid.UUID(identifier)
                query = """
                    UPDATE worklists 
                    SET status = %s, updated_at = CURRENT_TIMESTAMP, modified_by = %s
                    WHERE id = %s 
                    RETURNING id, accession_number, status AS old_status
                """
                cursor.execute(query, (new_status, user.get('username'), uuid_obj))
            except ValueError:
                query = """
                    UPDATE worklists 
                    SET status = %s, updated_at = CURRENT_TIMESTAMP, modified_by = %s
                    WHERE accession_number = %s 
                    RETURNING id, accession_number, status AS old_status
                """
                cursor.execute(query, (new_status, user.get('username'), identifier))
            
            result = cursor.fetchone()
            
            if not result:
                return jsonify({"status": "error", "message": "Worklist not found"}), 404
            
            log_audit(
                result[0], 
                result[1], 
                'STATUS_UPDATED', 
                {"status": result[2]}, # Log old status
                {"status": new_status}, 
                user
            )
            
            return jsonify({
                "status": "success",
                "message": "Status updated successfully",
                "worklist_id": str(result[0]),
                "accession_number": result[1],
                "new_status": new_status,
                "updated_by": user.get('username')
            }), 200
            
    except Exception as e:
        logger.error(f"Error updating status: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/worklist/<identifier>', methods=['DELETE'])
@require_auth(REQUIRED_PERMISSIONS['delete_worklist'])
def delete_worklist(identifier):
    """Soft delete a worklist by UUID or accession number - requires worklist:delete permission"""
    try:
        user = request.current_user
        
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor) # Use RealDictCursor to fetch before_data
            
            # First, fetch the existing worklist data for audit log
            try:
                uuid_obj = uuid.UUID(identifier)
                cursor.execute("SELECT id, accession_number, status FROM worklists WHERE id = %s AND deleted_at IS NULL", (uuid_obj,))
            except ValueError:
                cursor.execute("SELECT id, accession_number, status FROM worklists WHERE accession_number = %s AND deleted_at IS NULL", (identifier,))
            
            worklist_to_delete = cursor.fetchone()

            if not worklist_to_delete:
                return jsonify({"status": "error", "message": "Worklist not found or already deleted"}), 404
            
            # Perform soft delete
            cursor = conn.cursor() # Switch back to regular cursor for update
            update_query = """
                UPDATE worklists 
                SET deleted_at = CURRENT_TIMESTAMP, deleted_by = %s, updated_at = CURRENT_TIMESTAMP, status = 'DELETED'
                WHERE id = %s
                RETURNING id, accession_number, status
            """
            cursor.execute(update_query, (user.get('username'), worklist_to_delete['id']))
            
            result = cursor.fetchone()

            log_audit(
                result[0], 
                result[1], 
                'DELETED', 
                {"status": worklist_to_delete['status']}, # Log old status
                {"status": "DELETED"}, 
                user
            )
            
            return jsonify({
                "status": "success",
                "message": "Worklist soft-deleted successfully",
                "worklist_id": str(result[0]),
                "accession_number": result[1],
                "deleted_by": user.get('username')
            }), 200
            
    except Exception as e:
        logger.error(f"Error deleting worklist: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/worklist/search', methods=['GET'])
@require_auth(REQUIRED_PERMISSIONS['search_worklist'])
def search_worklists():
    """Search worklists - requires worklist:search permission"""
    try:
        patient_id = request.args.get('patient_id')
        patient_name = request.args.get('patient_name')
        modality = request.args.get('modality')
        
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            query = "SELECT id::text, * FROM worklists WHERE deleted_at IS NULL"
            params = []
            
            if patient_id:
                query += " AND patient_id LIKE %s"
                params.append(f"%{patient_id}%")
            
            if patient_name:
                query += " AND patient_name LIKE %s"
                params.append(f"%{patient_name}%")
            
            if modality:
                query += " AND modality = %s"
                params.append(modality)
            
            query += " ORDER BY created_at DESC LIMIT 50"
            
            cursor.execute(query, params)
            worklists = cursor.fetchall()
            
            return jsonify({
                "status": "success",
                "worklists": worklists,
                "count": len(worklists)
            }), 200
            
    except Exception as e:
        logger.error(f"Error searching worklists: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    os.makedirs(WORKLIST_DIR, exist_ok=True)
    
    try:
        init_database()
        logger.info("MWL Writer database initialized")
    except Exception as e:
        logger.error(f"Failed to initialize: {str(e)}")
    
    logger.info("=" * 80)
    logger.info("MWL Writer Service v4.0 (Secured) starting...")
    logger.info("JWT Authentication: ENABLED")
    logger.info("Worklist directory: " + WORKLIST_DIR)
    logger.info("=" * 80)
    
    app.run(host='0.0.0.0', port=8000, debug=False)
