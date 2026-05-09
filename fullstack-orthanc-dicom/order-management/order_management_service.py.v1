"""
Order Management Service v1.0
SIMRS Order Simulator dengan Accession Number Generator
Menyimpan order data untuk integrasi DICOM-SATUSEHAT
"""
import os
import sys
import uuid
import json
from datetime import datetime, timedelta
from flask import Flask, request, jsonify
from flask_cors import CORS
import psycopg2
from psycopg2.extras import RealDictCursor
from contextlib import contextmanager
import logging
import requests

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
    'port': 5432
}

# External services
SATUSEHAT_BASE_URL = os.getenv('SATUSEHAT_BASE_URL', 'https://api-satusehat-stg.dto.kemkes.go.id')
SATUSEHAT_CLIENT_ID = os.getenv('SATUSEHAT_CLIENT_ID', '')
SATUSEHAT_CLIENT_SECRET = os.getenv('SATUSEHAT_CLIENT_SECRET', '')
SATUSEHAT_ORG_ID = os.getenv('SATUSEHAT_ORGANIZATION_ID', '100000001')

MWL_SERVICE_URL = os.getenv('MWL_SERVICE_URL', 'http://mwl-writer:8000')

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
    """Initialize order management tables"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            cursor.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
            
            # Orders table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS orders (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    order_number VARCHAR(50) UNIQUE NOT NULL,
                    accession_number VARCHAR(50) UNIQUE NOT NULL,
                    
                    -- Patient Information
                    patient_nik VARCHAR(16),
                    patient_ihs_number VARCHAR(50),
                    patient_name VARCHAR(200) NOT NULL,
                    patient_birth_date DATE,
                    patient_sex VARCHAR(1),
                    patient_phone VARCHAR(20),
                    patient_address TEXT,
                    
                    -- Order Information
                    order_type VARCHAR(50) DEFAULT 'IMAGING',
                    modality VARCHAR(10),
                    procedure_code VARCHAR(20),
                    procedure_name VARCHAR(200),
                    procedure_description TEXT,
                    body_site VARCHAR(100),
                    
                    -- Clinical Information
                    clinical_indication TEXT,
                    clinical_notes TEXT,
                    priority VARCHAR(20) DEFAULT 'routine',
                    
                    -- Scheduling
                    scheduled_date DATE,
                    scheduled_time TIME,
                    estimated_duration INTEGER,
                    
                    -- Healthcare Providers
                    ordering_physician_id VARCHAR(50),
                    ordering_physician_name VARCHAR(200),
                    performing_physician_id VARCHAR(50),
                    performing_physician_name VARCHAR(200),
                    
                    -- Encounter Information
                    encounter_id VARCHAR(100),
                    encounter_type VARCHAR(50),
                    
                    -- SATUSEHAT Integration
                    satusehat_patient_id VARCHAR(100),
                    satusehat_encounter_id VARCHAR(100),
                    satusehat_service_request_id VARCHAR(100),
                    satusehat_synced BOOLEAN DEFAULT FALSE,
                    satusehat_sync_date TIMESTAMP,
                    
                    -- Status Tracking
                    order_status VARCHAR(50) DEFAULT 'PENDING',
                    worklist_status VARCHAR(50),
                    imaging_status VARCHAR(50),
                    
                    -- Audit
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    created_by VARCHAR(200),
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_by VARCHAR(200),
                    
                    -- Soft Delete
                    deleted_at TIMESTAMP,
                    deleted_by VARCHAR(200)
                )
            """)

            # Align legacy deployments that might miss order_number definition
            cursor.execute("""
                SELECT is_nullable
                FROM information_schema.columns
                WHERE table_name = 'orders' AND column_name = 'order_number'
            """)
            column_info = cursor.fetchone()

            if column_info is None:
                # Older installations created the table before order_number existed
                cursor.execute("ALTER TABLE orders ADD COLUMN order_number VARCHAR(50)")

            # Hydrate blank order_number values so we can safely enforce NOT NULL + UNIQUE
            cursor.execute("""
                WITH ranked AS (
                    SELECT
                        id,
                        COALESCE(created_at, CURRENT_TIMESTAMP) AS created_ts,
                        ROW_NUMBER() OVER (
                            ORDER BY COALESCE(created_at, CURRENT_TIMESTAMP), id::text
                        ) AS rn
                    FROM orders
                    WHERE order_number IS NULL OR order_number = ''
                )
                UPDATE orders o
                SET order_number = CONCAT(
                    'ORD',
                    TO_CHAR(r.created_ts, 'YYYYMMDD'),
                    LPAD(r.rn::text, 6, '0')
                )
                FROM ranked r
                WHERE o.id = r.id
            """)

            cursor.execute("SELECT COUNT(*) FROM orders WHERE order_number IS NULL OR order_number = ''")
            remaining_missing = cursor.fetchone()[0]
            if remaining_missing == 0:
                # Only enforce NOT NULL when safe; newer deployments already comply
                cursor.execute("ALTER TABLE orders ALTER COLUMN order_number SET NOT NULL")
            else:
                logger.warning("Detected orders without order_number; skipping NOT NULL enforcement.")

            cursor.execute("""
                SELECT COUNT(*) FROM (
                    SELECT order_number
                    FROM orders
                    WHERE order_number IS NOT NULL AND order_number <> ''
                    GROUP BY order_number
                    HAVING COUNT(*) > 1
                ) duplicates
            """)
            duplicate_order_numbers = cursor.fetchone()[0]

            if duplicate_order_numbers == 0:
                cursor.execute("""
                    SELECT 1
                    FROM pg_constraint
                    WHERE conrelid = 'orders'::regclass
                      AND contype = 'u'
                      AND conname = 'orders_order_number_key'
                """)
                has_order_number_unique = cursor.fetchone() is not None
                if not has_order_number_unique:
                    cursor.execute("ALTER TABLE orders ADD CONSTRAINT orders_order_number_key UNIQUE (order_number)")
            else:
                logger.warning("Skipping order_number unique constraint; duplicates detected.")
            
            # Indexes
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_orders_accession ON orders(accession_number)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_orders_patient_nik ON orders(patient_nik)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(order_status)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_orders_scheduled_date ON orders(scheduled_date)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_orders_satusehat_service_request ON orders(satusehat_service_request_id)")
            
            # Order audit log
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS order_audit_log (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
                    order_number VARCHAR(50),
                    accession_number VARCHAR(50),
                    action VARCHAR(50) NOT NULL,
                    before_data JSONB,
                    after_data JSONB,
                    user_info VARCHAR(200),
                    ip_address VARCHAR(45),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_order_audit_order_id ON order_audit_log(order_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_order_audit_action ON order_audit_log(action)")
            
            # Accession number sequence for auto-generation
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS accession_sequence (
                    id SERIAL PRIMARY KEY,
                    prefix VARCHAR(10) DEFAULT 'ACC',
                    date_format VARCHAR(20) DEFAULT 'YYYYMMDD',
                    sequence_number INTEGER DEFAULT 0,
                    sequence_date DATE DEFAULT CURRENT_DATE
                )
            """)
            
            # Initialize sequence if not exists
            cursor.execute("SELECT COUNT(*) FROM accession_sequence")
            if cursor.fetchone()[0] == 0:
                cursor.execute("""
                    INSERT INTO accession_sequence (prefix, date_format, sequence_number, sequence_date)
                    VALUES ('ACC', 'YYYYMMDD', 0, CURRENT_DATE)
                """)
            
            logger.info("Order management database initialized")
            
    except Exception as e:
        logger.error(f"Failed to initialize database: {str(e)}")
        raise

def generate_accession_number():
    """Generate unique accession number with format: ACC + YYYYMMDD + sequence"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            today = datetime.now().date()
            date_str = today.strftime('%Y%m%d')
            
            # Get or reset sequence for today
            cursor.execute("""
                UPDATE accession_sequence 
                SET sequence_number = CASE 
                    WHEN sequence_date < %s THEN 1
                    ELSE sequence_number + 1
                END,
                sequence_date = %s
                WHERE id = 1
                RETURNING prefix, sequence_number
            """, (today, today))
            
            result = cursor.fetchone()
            prefix = result[0]
            seq_num = result[1]
            
            # Format: ACC20251021001
            accession_number = f"{prefix}{date_str}{seq_num:03d}"
            
            logger.info(f"Generated Accession Number: {accession_number}")
            return accession_number
            
    except Exception as e:
        logger.error(f"Error generating accession number: {str(e)}")
        raise

def log_order_action(order_id, order_number, accession, action, before_data, after_data, user_info, ip_address):
    """Log order actions"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO order_audit_log (
                    order_id, order_number, accession_number, action, 
                    before_data, after_data, user_info, ip_address
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                str(order_id) if order_id is not None else None,
                order_number,
                accession,
                action,
                json.dumps(before_data) if before_data else None,
                json.dumps(after_data) if after_data else None,
                user_info,
                ip_address
            ))
    except Exception as e:
        logger.error(f"Failed to log order action: {str(e)}")

@app.route('/', methods=['GET'])
def index():
    return jsonify({
        "service": "Order Management Service",
        "version": "1.0",
        "description": "SIMRS Order Simulator dengan Accession Number Generator",
        "status": "running",
        "endpoints": {
            "create_order": "POST /orders/create",
            "list_orders": "GET /orders/list",
            "get_order": "GET /orders/<id>",
            "update_status": "PUT /orders/<id>/status",
            "sync_satusehat": "POST /orders/<id>/sync-satusehat",
            "create_worklist": "POST /orders/<id>/create-worklist",
            "complete_flow": "POST /orders/complete-flow"
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
        "service": "order-management",
        "database": db_status,
        "timestamp": datetime.utcnow().isoformat()
    }), 200

@app.route('/orders/create', methods=['POST'])
def create_order():
    """Create new order with auto-generated Accession Number"""
    try:
        data = request.get_json()
        
        # Required fields
        required = ['patient_name', 'patient_nik', 'modality', 'procedure_name']
        missing = [f for f in required if f not in data]
        
        if missing:
            return jsonify({
                "status": "error",
                "message": f"Missing required fields: {', '.join(missing)}"
            }), 400
        
        # Generate IDs
        order_id = uuid.uuid4()
        order_number = f"ORD{datetime.now().strftime('%Y%m%d%H%M%S')}"
        accession_number = generate_accession_number()
        
        # Default scheduled date/time if not provided
        scheduled_date = data.get('scheduled_date', (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d'))
        scheduled_time = data.get('scheduled_time', '10:00:00')
        
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            cursor.execute("""
                INSERT INTO orders (
                    id, order_number, accession_number,
                    patient_nik, patient_name, patient_birth_date, patient_sex,
                    patient_phone, patient_address,
                    modality, procedure_name, procedure_description,
                    clinical_indication, priority,
                    scheduled_date, scheduled_time,
                    ordering_physician_name,
                    order_status, created_by
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                )
                RETURNING id, order_number, accession_number
            """, (
                order_id, order_number, accession_number,
                data.get('patient_nik'),
                data.get('patient_name'),
                data.get('patient_birth_date'),
                data.get('patient_sex', 'U'),
                data.get('patient_phone'),
                data.get('patient_address'),
                data.get('modality'),
                data.get('procedure_name'),
                data.get('procedure_description'),
                data.get('clinical_indication'),
                data.get('priority', 'routine'),
                scheduled_date,
                scheduled_time,
                data.get('ordering_physician_name', 'DR. ADMIN'),
                'PENDING',
                request.headers.get('X-User-ID', 'system')
            ))
            
            result = cursor.fetchone()
            
            # Log action
            log_order_action(
                result[0], result[1], result[2], 'ORDER_CREATED',
                None, data, 
                request.headers.get('X-User-ID', 'system'),
                request.remote_addr
            )
        
        logger.info(f"Order created: {order_number} - {accession_number}")
        
        return jsonify({
            "status": "success",
            "message": "Order created successfully",
            "order_id": str(order_id),
            "order_number": order_number,
            "accession_number": accession_number,
            "scheduled_date": scheduled_date,
            "scheduled_time": scheduled_time,
            "next_steps": {
                "1": f"POST /orders/{order_id}/sync-satusehat - Sync to SATUSEHAT",
                "2": f"POST /orders/{order_id}/create-worklist - Create DICOM Worklist"
            }
        }), 201
        
    except Exception as e:
        logger.error(f"Error creating order: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/orders/list', methods=['GET'])
def list_orders():
    """List all orders with filters"""
    try:
        status = request.args.get('status')
        date = request.args.get('date')
        modality = request.args.get('modality')
        limit = request.args.get('limit', 100, type=int)
        offset = request.args.get('offset', 0, type=int)
        
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            query = "SELECT * FROM orders WHERE deleted_at IS NULL"
            params = []
            
            if status:
                query += " AND order_status = %s"
                params.append(status)
            
            if date:
                query += " AND scheduled_date = %s"
                params.append(date)
            
            if modality:
                query += " AND modality = %s"
                params.append(modality)
            
            query += " ORDER BY created_at DESC LIMIT %s OFFSET %s"
            params.extend([limit, offset])
            
            cursor.execute(query, params)
            orders = cursor.fetchall()
            
            # Convert UUID to string
            for order in orders:
                order['id'] = str(order['id'])
            
            return jsonify({
                "status": "success",
                "orders": orders,
                "count": len(orders),
                "limit": limit,
                "offset": offset
            }), 200
            
    except Exception as e:
        logger.error(f"Error listing orders: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/orders/<identifier>', methods=['GET'])
def get_order(identifier):
    """Get order by ID, order number, or accession number"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Try UUID first
            try:
                uuid_obj = uuid.UUID(identifier)
                # Use string representation to avoid psycopg2 UUID adaptation issues
                cursor.execute(
                    "SELECT * FROM orders WHERE id = %s AND deleted_at IS NULL",
                    (str(uuid_obj),)
                )
            except ValueError:
                # Try accession or order number
                cursor.execute("""
                    SELECT * FROM orders 
                    WHERE (accession_number = %s OR order_number = %s) 
                    AND deleted_at IS NULL
                """, (identifier, identifier))
            
            order = cursor.fetchone()
            
            if not order:
                return jsonify({"status": "error", "message": "Order not found"}), 404
            
            order['id'] = str(order['id'])
            
            return jsonify({
                "status": "success",
                "order": order
            }), 200
            
    except Exception as e:
        logger.error(f"Error getting order: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/orders/<identifier>/sync-satusehat', methods=['POST'])
def sync_to_satusehat(identifier):
    """Sync order to SATUSEHAT (create Patient, Encounter, ServiceRequest)"""
    try:
        # Get order
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            try:
                uuid_obj = uuid.UUID(identifier)
                cursor.execute("SELECT * FROM orders WHERE id = %s", (uuid_obj,))
            except ValueError:
                cursor.execute("SELECT * FROM orders WHERE accession_number = %s", (identifier,))
            
            order = cursor.fetchone()
            
            if not order:
                return jsonify({"status": "error", "message": "Order not found"}), 404
        
        # TODO: Implement actual SATUSEHAT API calls
        # For now, using mock data
        
        logger.info(f"Syncing order to SATUSEHAT: {order['accession_number']}")
        
        # Mock patient, encounter, and service request IDs
        patient_id = f"P{datetime.now().strftime('%Y%m%d%H%M%S')}"
        encounter_id = f"ENC{datetime.now().strftime('%Y%m%d%H%M%S')}"
        service_request_id = f"SR{datetime.now().strftime('%Y%m%d%H%M%S')}"
        
        # Update order with SATUSEHAT IDs
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            cursor.execute("""
                UPDATE orders 
                SET satusehat_patient_id = %s,
                    satusehat_encounter_id = %s,
                    satusehat_service_request_id = %s,
                    satusehat_synced = TRUE,
                    satusehat_sync_date = CURRENT_TIMESTAMP,
                    order_status = 'SYNCED',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
            """, (patient_id, encounter_id, service_request_id, order['id']))
            
            log_order_action(
                order['id'], order['order_number'], order['accession_number'],
                'SATUSEHAT_SYNCED',
                {"status": order['order_status']},
                {"patient_id": patient_id, "encounter_id": encounter_id, "service_request_id": service_request_id},
                request.headers.get('X-User-ID', 'system'),
                request.remote_addr
            )
        
        return jsonify({
            "status": "success",
            "message": "Order synced to SATUSEHAT successfully",
            "accession_number": order['accession_number'],
            "satusehat_patient_id": patient_id,
            "satusehat_encounter_id": encounter_id,
            "satusehat_service_request_id": service_request_id
        }), 200
        
    except Exception as e:
        logger.error(f"Error syncing to SATUSEHAT: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/orders/<identifier>/create-worklist', methods=['POST'])
def create_worklist_from_order(identifier):
    """Create DICOM worklist from order"""
    try:
        # Get order
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            try:
                uuid_obj = uuid.UUID(identifier)
                cursor.execute("SELECT * FROM orders WHERE id = %s", (uuid_obj,))
            except ValueError:
                cursor.execute("SELECT * FROM orders WHERE accession_number = %s", (identifier,))
            
            order = cursor.fetchone()
            
            if not order:
                return jsonify({"status": "error", "message": "Order not found"}), 404
        
        # Create worklist payload
        worklist_data = {
            "patient_name": order['patient_name'].replace(' ', '^'),
            "patient_id": order['patient_nik'],
            "patient_birth_date": order['patient_birth_date'].strftime('%Y%m%d') if order['patient_birth_date'] else None,
            "patient_sex": order['patient_sex'],
            "accession_number": order['accession_number'],
            "procedure_description": order['procedure_description'] or order['procedure_name'],
            "modality": order['modality'],
            "scheduled_date": order['scheduled_date'].strftime('%Y%m%d') if order['scheduled_date'] else None,
            "scheduled_time": order['scheduled_time'].strftime('%H%M%S') if order['scheduled_time'] else None,
            "physician_name": order['ordering_physician_name'].replace(' ', '^') if order['ordering_physician_name'] else None,
            "station_aet": "SCANNER01"
        }
        
        # Call MWL Writer service
        try:
            response = requests.post(
                f"{MWL_SERVICE_URL}/worklist/create",
                json=worklist_data,
                timeout=10
            )
            response.raise_for_status()
            mwl_response = response.json()
            
            # Update order status
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    UPDATE orders 
                    SET worklist_status = 'CREATED',
                        order_status = 'SCHEDULED',
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s
                """, (order['id'],))
                
                log_order_action(
                    order['id'], order['order_number'], order['accession_number'],
                    'WORKLIST_CREATED',
                    {"status": order['order_status']},
                    mwl_response,
                    request.headers.get('X-User-ID', 'system'),
                    request.remote_addr
                )
            
            return jsonify({
                "status": "success",
                "message": "Worklist created successfully",
                "accession_number": order['accession_number'],
                "worklist": mwl_response
            }), 200
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error calling MWL service: {str(e)}")
            return jsonify({
                "status": "error",
                "message": f"Failed to create worklist: {str(e)}"
            }), 500
        
    except Exception as e:
        logger.error(f"Error creating worklist: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/orders/complete-flow', methods=['POST'])
def complete_flow():
    """Complete flow: Create order → Sync SATUSEHAT → Create Worklist"""
    try:
        data = request.get_json()
        
        # Step 1: Create order
        order_response = create_order()
        if order_response[1] != 201:
            return order_response
        
        order_data = order_response[0].get_json()
        order_id = order_data['order_id']
        accession_number = order_data['accession_number']
        
        logger.info(f"Step 1: Order created - {accession_number}")
        
        # Step 2: Sync to SATUSEHAT
        sync_response = sync_to_satusehat(order_id)
        if sync_response[1] != 200:
            return sync_response
        
        sync_data = sync_response[0].get_json()
        logger.info(f"Step 2: SATUSEHAT synced - {accession_number}")
        
        # Step 3: Create worklist
        worklist_response = create_worklist_from_order(order_id)
        if worklist_response[1] != 200:
            return worklist_response
        
        logger.info(f"Step 3: Worklist created - {accession_number}")
        
        return jsonify({
            "status": "success",
            "message": "Complete flow executed successfully",
            "accession_number": accession_number,
            "order": order_data,
            "satusehat": sync_data,
            "worklist": worklist_response[0].get_json(),
            "next_steps": {
                "1": "Simulate scan",
                "2": "DICOM Router will process automatically",
                "3": "ImagingStudy will be created in SATUSEHAT"
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error in complete flow: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    os.makedirs('/var/log/orders', exist_ok=True)
    
    try:
        init_database()
        logger.info("Order management service initialized")
    except Exception as e:
        logger.error(f"Failed to initialize: {str(e)}")
    
    logger.info("=" * 80)
    logger.info("Order Management Service starting...")
    logger.info("Features:")
    logger.info("  - Auto Accession Number generation")
    logger.info("  - Order data persistence")
    logger.info("  - SATUSEHAT integration")
    logger.info("  - MWL Worklist creation")
    logger.info("  - Complete flow automation")
    logger.info("=" * 80)
    
    app.run(host='0.0.0.0', port=8001, debug=False)
