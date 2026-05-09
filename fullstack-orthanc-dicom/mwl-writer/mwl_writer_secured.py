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
from psycopg2.extras import RealDictCursor, register_uuid
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

# Register UUID adapter for psycopg2
register_uuid()

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

def log_audit(conn, cursor, worklist_id, accession, action, before_data=None, after_data=None, user=None):
    """Log audit trail - handles None values safely"""
    try:
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
            (user.get('username') if user and isinstance(user, dict) else 'system'),
            getattr(request, 'remote_addr', 'unknown')
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

@app.route('/worklists', methods=['POST'])
@require_auth(REQUIRED_PERMISSIONS['create_worklist'])
def create_worklist():
    """FULL Create worklist with validation & DICOM file generation"""
    try:
        if not request.is_json:
            return jsonify({"status": "error", "message": "Content-Type must be application/json"}), 400
        
        data = request.get_json()
        user = request.current_user
        
        if not data:
            return jsonify({"status": "error", "message": "Empty request body"}), 400
        
        # Required fields validation
        required_fields = ['patient_name', 'patient_id', 'accession_number', 'modality']
        missing_fields = [f for f in required_fields if not data.get(f)]
        if missing_fields:
            return jsonify({
                "status": "error", 
                "message": f"Missing required fields: {', '.join(missing_fields)}"
            }), 400
        
        # Normalize dates/times
        scheduled_date = data.get('scheduled_date')
        if scheduled_date:
            # Accept YYYY-MM-DD or YYYYMMDD
            if len(scheduled_date) == 10 and '-' in scheduled_date:
                scheduled_date = scheduled_date.replace('-', '')
            data['scheduled_date'] = scheduled_date[:8]
        
        scheduled_time = data.get('scheduled_time')
        if scheduled_time and len(scheduled_time) > 6:
            scheduled_time = scheduled_time[:6]
            data['scheduled_time'] = scheduled_time
        
        # Generate DICOM worklist file
        try:
            filepath, filename = create_worklist_file(data)
        except Exception as file_err:
            logger.error(f"DICOM file creation failed: {file_err}")
            return jsonify({
                "status": "error",
                "message": "Failed to generate DICOM worklist file",
                "detail": str(file_err)
            }), 500
        
        # Insert to database
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            worklist_uuid = uuid.uuid4()
            
            cursor.execute("""
                INSERT INTO worklists (
                    id, accession_number, patient_id, patient_name, 
                    patient_birth_date, patient_sex, modality, procedure_description,
                    scheduled_date, scheduled_time, physician_name, station_aet,
                    study_instance_uid, filename, status, created_by
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                ) RETURNING id, accession_number, created_at
            """, (
                worklist_uuid,
                data['accession_number'],
                data['patient_id'],
                data['patient_name'],
                data.get('patient_birth_date'),
                data.get('patient_sex'),
                data['modality'],
                data.get('procedure_description'),
                data.get('scheduled_date'),
                data.get('scheduled_time'),
                data.get('physician_name'),
                data.get('station_aet'),
                data.get('study_instance_uid'),
                filename,
                'SCHEDULED',
                user.get('username')
            ))
            
            result = cursor.fetchone()
            
            # Log audit
            log_audit(conn, cursor, result['id'], result['accession_number'], 
                     'CREATED', None, data, user)
        
        logger.info(f"Worklist created by {user.get('username')}: {data['accession_number']}")
        
        return jsonify({
            "status": "success",
            "message": "Worklist created successfully",
            "data": {
                "id": str(result['id']),
                "accession_number": result['accession_number'],
                "filename": filename,
                "status": "SCHEDULED",
                "created_at": result['created_at'].isoformat() if result['created_at'] else None,
                "created_by": user.get('username')
            }
        }), 201
        
    except psycopg2.IntegrityError as e:
        if "unique_violation" in str(e).lower():
            return jsonify({
                "status": "error",
                "message": f"Worklist with accession_number '{data.get('accession_number')}' already exists"
            }), 409
        raise
    except Exception as e:
        logger.error(f"Error creating worklist: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/worklists', methods=['GET'])
@require_auth(REQUIRED_PERMISSIONS['read_worklist'])
def list_worklists():
    """FULL List worklists with advanced filtering/pagination - requires worklist:read"""
    try:
        # Parse query parameters
        status = request.args.get('status')
        modality = request.args.get('modality')
        patient_id_filter = request.args.get('patient_id') # Renamed to avoid conflict with selected column
        accession = request.args.get('accession_number')
        scheduled_date_filter = request.args.get('scheduled_date') # Renamed
        station_aet = request.args.get('station_aet')
        
        page = max(1, int(request.args.get('page', 1)))
        page_size = min(100, max(1, int(request.args.get('page_size', 20))))
        offset = (page - 1) * page_size
        
        include_deleted = request.args.get('include_deleted', 'false').lower() == 'true'
        sort_by = request.args.get('sort_by', 'created_at')
        sort_dir = request.args.get('sort_dir', 'desc').lower()
        
        valid_sorts = ['created_at', 'updated_at', 'accession_number', 'patient_name'] # scheduled_date removed
        if sort_by not in valid_sorts:
            sort_by = 'created_at'
        
        sort_dir = 'DESC' if sort_dir == 'desc' else 'ASC'
        
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Build WHERE clause
            where_conditions = []
            params = []
            
            if not include_deleted:
                where_conditions.append("w.deleted_at IS NULL")
            
            if status:
                where_conditions.append("w.status = %s")
                params.append(status)
            
            if modality:
                where_conditions.append("w.modality = %s")
                params.append(modality)
                
            if patient_id_filter: # Use renamed filter variable
                where_conditions.append("w.patient_id ILIKE %s")
                params.append(f"%{patient_id_filter}%")
                
            if accession:
                where_conditions.append("w.accession_number ILIKE %s")
                params.append(f"%{accession}%")
                
            if scheduled_date_filter: # Use renamed filter variable
                where_conditions.append("w.scheduled_date = %s")
                params.append(scheduled_date_filter)
                
            if station_aet:
                where_conditions.append("w.station_aet ILIKE %s")
                params.append(f"%{station_aet}%")
            
            where_clause = "WHERE " + " AND ".join(where_conditions) if where_conditions else ""
            
            # Count total
            count_query = f"SELECT COUNT(*) as total FROM worklists w {where_clause}"
            cursor.execute(count_query, params)
            total = cursor.fetchone()['total']
            
            # Fetch paginated data
            query = f"""
                SELECT 
                    w.id::text as id,
                    w.accession_number,
                    w.patient_name,
                    w.modality,
                    w.procedure_description,
                    w.physician_name,
                    w.station_aet,
                    w.status,
                    w.created_at,
                    w.updated_at,
                    p.patient_national_id,
                    p.gender,
                    p.medical_record_number as patient_medical_record_number,
                    w.scheduled_date as _scheduled_date_hidden, -- Keep for internal processing
                    w.scheduled_time as _scheduled_time_hidden, -- Keep for internal processing
                    w.patient_id as _patient_id_hidden, -- Keep for internal processing
                    w.patient_sex as _patient_sex_hidden -- Keep for internal processing
                FROM worklists w
                LEFT JOIN patients p ON (w.patient_id = p.medical_record_number OR w.patient_id = p.patient_national_id)
                {where_clause}
                ORDER BY w.{sort_by} {sort_dir}
                LIMIT %s OFFSET %s
            """
            cursor.execute(query, params + [page_size, offset])
            worklists = cursor.fetchall()

            # Process worklists to add derived fields and remove hidden ones
            for wl in worklists:
                # 1. Map gender
                patient_sex_val = wl.get('_patient_sex_hidden')
                if not wl.get('gender') and patient_sex_val:
                    sex = patient_sex_val.upper()
                    if sex == 'M':
                        wl['gender'] = 'male'
                    elif sex == 'F':
                        wl['gender'] = 'female'
                    else:
                        wl['gender'] = 'other'
                elif wl.get('gender'): # Ensure gender from patient table is formatted
                    g = wl.get('gender').lower()
                    if g == 'male':
                        wl['gender'] = 'male'
                    elif g == 'female':
                        wl['gender'] = 'female'
                    else:
                        wl['gender'] = 'other'
                else: # Default if no gender information
                    wl['gender'] = None

                # 2. Ensure patient_national_id (use hidden patient_id if no join result)
                if not wl.get('patient_national_id'):
                    pid = wl.get('_patient_id_hidden', '')
                    if pid and len(pid) == 16 and pid.isdigit():
                        wl['patient_national_id'] = pid
                
                # 3. Construct scheduled_at
                s_date = wl.get('_scheduled_date_hidden')
                s_time = wl.get('_scheduled_time_hidden')
                if s_date:
                    try:
                        formatted_date = f"{s_date[:4]}-{s_date[4:6]}-{s_date[6:8]}"
                        if s_time:
                            s_time = s_time.ljust(6, '0')
                            formatted_time = f"{s_time[:2]}:{s_time[2:4]}:{s_time[4:6]}"
                            wl['scheduled_at'] = f"{formatted_date} {formatted_time}"
                        else:
                            wl['scheduled_at'] = f"{formatted_date} 00:00:00"
                    except:
                        wl['scheduled_at'] = None
                else:
                    wl['scheduled_at'] = None

                # Remove hidden fields from final response
                for key in ['_scheduled_date_hidden', '_scheduled_time_hidden', '_patient_id_hidden', '_patient_sex_hidden']:
                    if key in wl:
                        del wl[key]

            # Re-process filters to remove hidden fields
            filter_response = {
                "status": status,
                "modality": modality,
                "accession_number": accession,
                "station_aet": station_aet,
                "include_deleted": include_deleted
            }
            # Add patient_id_filter back to filters if it was used for filtering
            if patient_id_filter:
                filter_response["patient_id_filter"] = patient_id_filter
            if scheduled_date_filter:
                filter_response["scheduled_date_filter"] = scheduled_date_filter
            
        return jsonify({
            "status": "success",
            "worklists": worklists,
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": total,
                "pages": (total + page_size - 1) // page_size,
                "count": len(worklists)
            },
            "filters": filter_response
        }), 200
        
    except Exception as e:
        logger.error(f"Error listing worklists: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/worklists/summary', methods=['GET'])
@require_auth(REQUIRED_PERMISSIONS['read_worklist'])
def get_worklists_summary():
    """Get count summary of worklists by status"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("""
                SELECT status, COUNT(*) as count 
                FROM worklists 
                WHERE deleted_at IS NULL
                GROUP BY status
            """)
            counts = cursor.fetchall()

            # Reformat to dict
            summary = {row['status']: row['count'] for row in counts}
            # Ensure basic statuses exist
            for status in ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']:
                if status not in summary:
                    summary[status] = 0

            summary['total'] = sum(summary.values())

            return jsonify({
                "status": "success",
                "summary": summary
            }), 200
    except Exception as e:
        logger.error(f"Error getting summary: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/worklists/<identifier>', methods=['GET'])
@require_auth(REQUIRED_PERMISSIONS['read_worklist'])
def get_worklist(identifier):
    """Get single worklist by UUID or accession_number - Full details"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Common query part
            query = """
                SELECT 
                    w.id::text as id,
                    w.accession_number,
                    w.patient_name,
                    w.modality,
                    w.procedure_description,
                    w.physician_name,
                    w.station_aet,
                    w.status,
                    w.created_at,
                    w.created_by,
                    w.updated_at,
                    w.modified_by,
                    CASE 
                        WHEN w.deleted_at IS NOT NULL THEN 
                            jsonb_build_object(
                                'deleted', true,
                                'deleted_at', w.deleted_at,
                                'deleted_by', w.deleted_by
                            )
                        ELSE 
                            jsonb_build_object('deleted', false)
                    END as deletion_info,
                    p.patient_national_id,
                    p.gender,
                    p.medical_record_number as patient_medical_record_number,
                    w.scheduled_date as _scheduled_date_hidden,
                    w.scheduled_time as _scheduled_time_hidden,
                    w.patient_id as _patient_id_hidden,
                    w.patient_sex as _patient_sex_hidden
                FROM worklists w
                LEFT JOIN patients p ON (w.patient_id = p.medical_record_number OR w.patient_id = p.patient_national_id)
                WHERE 
            """
            
            # Try UUID first, then accession_number
            try:
                uuid_obj = uuid.UUID(identifier)
                cursor.execute(query + "w.id = %s AND (w.deleted_at IS NULL OR w.deleted_at IS NOT NULL)", (uuid_obj,))
            except ValueError:
                cursor.execute(query + "w.accession_number = %s AND (w.deleted_at IS NULL OR w.deleted_at IS NOT NULL)", (identifier,))
            
            worklist = cursor.fetchone()
            
            if not worklist:
                return jsonify({
                    "status": "error", 
                    "message": "Worklist not found",
                    "hint": "Check accession_number or UUID format"
                }), 404
            
            # Process derived fields
            wl = worklist
            # 1. Map gender
            patient_sex_val = wl.get('_patient_sex_hidden')
            if not wl.get('gender') and patient_sex_val:
                g = patient_sex_val.lower()
                if g == 'm':
                    wl['gender'] = 'male'
                elif g == 'f':
                    wl['gender'] = 'female'
                else:
                    wl['gender'] = 'other'
            elif wl.get('gender'): # Ensure gender from patient table is formatted
                g = wl.get('gender').lower()
                if g == 'male':
                    wl['gender'] = 'male'
                elif g == 'female':
                    wl['gender'] = 'female'
                else:
                    wl['gender'] = 'other'
            else: # Default if no gender information
                wl['gender'] = None

            # 2. Ensure patient_national_id (use hidden patient_id if no join result)
            if not wl.get('patient_national_id'):
                pid = wl.get('_patient_id_hidden', '')
                if pid and len(pid) == 16 and pid.isdigit():
                    wl['patient_national_id'] = pid
            
            # 3. Construct scheduled_at
            s_date = wl.get('_scheduled_date_hidden')
            s_time = wl.get('_scheduled_time_hidden')
            if s_date:
                try:
                    formatted_date = f"{s_date[:4]}-{s_date[4:6]}-{s_date[6:8]}"
                    if s_time:
                        s_time = s_time.ljust(6, '0')
                        formatted_time = f"{s_time[:2]}:{s_time[2:4]}:{s_time[4:6]}"
                        wl['scheduled_at'] = f"{formatted_date} {formatted_time}"
                    else:
                        wl['scheduled_at'] = f"{formatted_date} 00:00:00"
                except:
                    wl['scheduled_at'] = None
            else:
                wl['scheduled_at'] = None

            # Remove hidden fields from final response
            for key in ['_scheduled_date_hidden', '_scheduled_time_hidden', '_patient_id_hidden', '_patient_sex_hidden']:
                if key in wl:
                    del wl[key]

            # Format timestamps
            for ts_field in ['created_at', 'updated_at']:
                if worklist.get(ts_field):
                    worklist[ts_field] = worklist[ts_field].isoformat()
            
            # Handle deletion_info separately as it's JSONB/dict
            if worklist.get('deletion_info'):
                del_info = worklist['deletion_info']
                if del_info.get('deleted_at'):
                    # It might be already string or datetime depending on driver/JSONB
                    if isinstance(del_info['deleted_at'], datetime):
                         del_info['deleted_at'] = del_info['deleted_at'].isoformat()
            
            return jsonify({
                "status": "success", 
                "worklist": worklist
            }), 200
            
    except Exception as e:
        logger.error(f"Error getting worklist {identifier}: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/worklists/<identifier>', methods=['PUT'])
@require_auth(REQUIRED_PERMISSIONS['update_worklist'])
def update_worklist(identifier):
    """FULL Update worklist - supports partial updates"""
    try:
        data = request.get_json()
        user = request.current_user
        
        if not data:
            return jsonify({"status": "error", "message": "No update data provided"}), 400
        
        # Allowed update fields
        allowed_fields = [
            'status', 'patient_name', 'patient_birth_date', 'patient_sex',
            'modality', 'procedure_description', 'scheduled_date', 'scheduled_time',
            'physician_name', 'station_aet', 'study_instance_uid'
        ]
        
        update_fields = {k: v for k, v in data.items() if k in allowed_fields}
        
        if not update_fields:
            return jsonify({
                "status": "error", 
                "message": "No valid fields to update. Allowed: " + ", ".join(allowed_fields)
            }), 400
        
        # Validate status if provided
        if 'status' in update_fields:
            valid_statuses = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']
            if update_fields['status'] not in valid_statuses:
                return jsonify({
                    "status": "error",
                    "message": f"Invalid status. Must be one of: {', '.join(valid_statuses)}"
                }), 400
        
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Get existing worklist for audit
            try:
                uuid_obj = uuid.UUID(identifier)
                cursor.execute("SELECT * FROM worklists WHERE id = %s", (uuid_obj,))
            except ValueError:
                cursor.execute("SELECT * FROM worklists WHERE accession_number = %s", (identifier,))
            
            existing = cursor.fetchone()
            if not existing:
                return jsonify({"status": "error", "message": "Worklist not found"}), 404
            
            # Build dynamic UPDATE query
            set_clauses = []
            params = []
            
            for field, value in update_fields.items():
                set_clauses.append(f"{field} = %s")
                params.append(value)
            
            set_clauses.extend(['updated_at = CURRENT_TIMESTAMP', 'modified_by = %s'])
            params.extend([user.get('username')])
            
            # Add WHERE condition
            try:
                uuid_obj = uuid.UUID(identifier)
                params.append(uuid_obj)
                where_clause = "WHERE id = %s"
            except ValueError:
                params.append(identifier)
                where_clause = "WHERE accession_number = %s"
            
            update_query = f"""
                UPDATE worklists 
                SET {', '.join(set_clauses)}
                {where_clause}
                RETURNING id::text, accession_number, status, updated_at, modified_by
            """
            
            cursor.execute(update_query, params)
            updated = cursor.fetchone()
            
            if not updated:
                return jsonify({"status": "error", "message": "Update failed"}), 500
            
            # Log audit
            log_audit(
                conn, cursor, updated['id'], updated['accession_number'],
                'UPDATED', existing, updated, user
            )
        
        logger.info(f"Worklist updated by {user.get('username')}: {identifier}")
        
        return jsonify({
            "status": "success",
            "message": "Worklist updated successfully",
            "data": {
                "id": updated['id'],
                "accession_number": updated['accession_number'],
                "status": updated['status'],
                "updated_at": updated['updated_at'].isoformat(),
                "updated_by": updated['modified_by']
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error updating worklist {identifier}: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/worklists/<identifier>', methods=['DELETE'])
@require_auth(REQUIRED_PERMISSIONS['delete_worklist'])
def delete_worklist(identifier):
    """Soft delete worklist - requires worklist:delete permission"""
    try:
        user = request.current_user
        
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Get existing for audit
            try:
                uuid_obj = uuid.UUID(identifier)
                cursor.execute("SELECT id, accession_number FROM worklists WHERE id = %s", (uuid_obj,))
            except ValueError:
                cursor.execute("SELECT id, accession_number FROM worklists WHERE accession_number = %s", (identifier,))
            
            existing = cursor.fetchone()
            if not existing:
                return jsonify({"status": "error", "message": "Worklist not found"}), 404
            
            # Soft delete
            try:
                uuid_obj = uuid.UUID(identifier)
                cursor.execute("""
                    UPDATE worklists 
                    SET deleted_at = CURRENT_TIMESTAMP, 
                        deleted_by = %s,
                        status = 'DELETED',
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s
                    RETURNING id::text, accession_number
                """, (user.get('username'), uuid_obj))
            except ValueError:
                cursor.execute("""
                    UPDATE worklists 
                    SET deleted_at = CURRENT_TIMESTAMP, 
                        deleted_by = %s,
                        status = 'DELETED',
                        updated_at = CURRENT_TIMESTAMP
                    WHERE accession_number = %s
                    RETURNING id::text, accession_number
                """, (user.get('username'), identifier))
            
            result = cursor.fetchone()
            
            # Log audit
            log_audit(
                conn, cursor, result['id'], result['accession_number'],
                'DELETED', existing, None, user
            )
        
        logger.info(f"Worklist soft-deleted by {user.get('username')}: {identifier}")
        
        return jsonify({
            "status": "success",
            "message": "Worklist soft-deleted successfully",
            "data": {
                "id": result['id'],
                "accession_number": result['accession_number'],
                "deleted_by": user.get('username')
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error deleting worklist {identifier}: {str(e)}")
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
                    RETURNING id, accession_number
                """
                cursor.execute(query, (new_status, user.get('username'), uuid_obj))
            except ValueError:
                query = """
                    UPDATE worklists 
                    SET status = %s, updated_at = CURRENT_TIMESTAMP, modified_by = %s
                    WHERE accession_number = %s 
                    RETURNING id, accession_number
                """
                cursor.execute(query, (new_status, user.get('username'), identifier))
            
            result = cursor.fetchone()
            
            if not result:
                return jsonify({"status": "error", "message": "Worklist not found"}), 404
            
            log_audit(
                result[0], 
                result[1], 
                'STATUS_UPDATED', 
                {"status": "previous"},
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

@app.route('/worklist/search', methods=['GET'])
@require_auth(REQUIRED_PERMISSIONS['search_worklist'])
def search_worklists():
    """Search worklists - requires worklist:search permission"""
    try:
        patient_id_filter = request.args.get('patient_id')
        patient_name = request.args.get('patient_name')
        modality = request.args.get('modality')
        
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            query = """
                SELECT 
                    w.id::text as id,
                    w.accession_number,
                    w.patient_name,
                    w.modality,
                    w.procedure_description,
                    w.physician_name,
                    w.station_aet,
                    w.status,
                    w.created_at,
                    w.updated_at,
                    p.patient_national_id,
                    p.gender,
                    p.medical_record_number as patient_medical_record_number,
                    w.scheduled_date as _scheduled_date_hidden,
                    w.scheduled_time as _scheduled_time_hidden,
                    w.patient_id as _patient_id_hidden,
                    w.patient_sex as _patient_sex_hidden
                FROM worklists w
                LEFT JOIN patients p ON (w.patient_id = p.medical_record_number OR w.patient_id = p.patient_national_id)
                WHERE w.deleted_at IS NULL
            """
            params = []
            
            if patient_id_filter:
                query += " AND w.patient_id LIKE %s"
                params.append(f"%{patient_id_filter}%")
            
            if patient_name:
                query += " AND w.patient_name LIKE %s"
                params.append(f"%{patient_name}%")
            
            if modality:
                query += " AND w.modality = %s"
                params.append(modality)
            
            query += " ORDER BY w.created_at DESC LIMIT 50"
            
            cursor.execute(query, params)
            worklists = cursor.fetchall()
            
            # Process worklists (same logic as list_worklists)
            for wl in worklists:
                # 1. Map gender
                patient_sex_val = wl.get('_patient_sex_hidden')
                if not wl.get('gender') and patient_sex_val:
                    g = patient_sex_val.lower()
                    if g == 'm':
                        wl['gender'] = 'male'
                    elif g == 'f':
                        wl['gender'] = 'female'
                    else:
                        wl['gender'] = 'other'
                elif wl.get('gender'): # Ensure gender from patient table is formatted
                    g = wl.get('gender').lower()
                    if g == 'male':
                        wl['gender'] = 'male'
                    elif g == 'female':
                        wl['gender'] = 'female'
                    else:
                        wl['gender'] = 'other'
                else: # Default if no gender information
                    wl['gender'] = None
                
                # 2. Ensure patient_national_id
                if not wl.get('patient_national_id'):
                    pid = wl.get('_patient_id_hidden', '')
                    if pid and len(pid) == 16 and pid.isdigit():
                        wl['patient_national_id'] = pid
                
                # 3. Construct scheduled_at
                s_date = wl.get('_scheduled_date_hidden')
                s_time = wl.get('_scheduled_time_hidden')
                if s_date:
                    try:
                        formatted_date = f"{s_date[:4]}-{s_date[4:6]}-{s_date[6:8]}"
                        if s_time:
                            s_time = s_time.ljust(6, '0')
                            formatted_time = f"{s_time[:2]}:{s_time[2:4]}:{s_time[4:6]}"
                            wl['scheduled_at'] = f"{formatted_date} {formatted_time}"
                        else:
                            wl['scheduled_at'] = f"{formatted_date} 00:00:00"
                    except:
                        wl['scheduled_at'] = None
                else:
                    wl['scheduled_at'] = None
            
                # Remove hidden fields from final response
                for key in ['_scheduled_date_hidden', '_scheduled_time_hidden', '_patient_id_hidden', '_patient_sex_hidden']:
                    if key in wl:
                        del wl[key]
            
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
