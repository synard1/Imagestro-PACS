from flask import Blueprint, request, jsonify
from psycopg2.extras import RealDictCursor
import uuid
import logging
import json
from ..utils.db import get_db_connection
from ..utils.auth import require_auth, check_permission
from ..config import REQUIRED_PERMISSIONS
from ..utils.helpers import _parse_positive_int, log_mapping_audit

mappings_bp = Blueprint('mappings', __name__)
logger = logging.getLogger(__name__)

# ... (existing code for list/create/handle/doctor mappings) ...

@mappings_bp.route('/procedure-mappings/bulk', methods=['POST', 'OPTIONS'])
@require_auth(REQUIRED_PERMISSIONS['create_mapping'])
def bulk_import_mappings():
    """Bulk import unified procedure mappings"""
    if request.method == 'OPTIONS':
        return '', 204

    try:
        data = request.get_json()
        user = request.current_user

        if not data or not isinstance(data, list):
            return jsonify({"status": "error", "message": "Invalid data format. Expected list of mappings."}), 400

        success_count = 0
        error_count = 0
        errors = []

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            for item in data:
                try:
                    # Validate required fields
                    if not all(k in item for k in ('external_system_id', 'external_code', 'pacs_code')):
                        raise ValueError("Missing required fields: external_system_id, external_code, pacs_code")

                    # Upsert mapping into unified_procedure_mappings
                    cursor.execute("""
                        INSERT INTO unified_procedure_mappings (
                            external_system_id, external_code, external_name, pacs_code,
                            pacs_name, modality, description, is_active, created_by, updated_by
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (external_system_id, external_code)
                        DO UPDATE SET
                            pacs_code = EXCLUDED.pacs_code,
                            pacs_name = COALESCE(EXCLUDED.pacs_name, unified_procedure_mappings.pacs_name),
                            modality = COALESCE(EXCLUDED.modality, unified_procedure_mappings.modality),
                            description = COALESCE(EXCLUDED.description, unified_procedure_mappings.description),
                            is_active = EXCLUDED.is_active,
                            updated_by = EXCLUDED.updated_by,
                            updated_at = NOW()
                        RETURNING id
                    """, (
                        item['external_system_id'], item['external_code'], item.get('external_name'),
                        item['pacs_code'], item.get('pacs_name'), item.get('modality'), item.get('description'),
                        item.get('is_active', True), user.get('username'), user.get('username')
                    ))
                    success_count += 1

                except Exception as e:
                    error_count += 1
                    errors.append({
                        "external_code": item.get('external_code'),
                        "error": str(e)
                    })

        return jsonify({
            "status": "success",
            "message": f"Bulk import completed. Success: {success_count}, Failed: {error_count}",
            "details": errors if errors else None
        }), 200

    except Exception as e:
        logger.error(f"Error in bulk import: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


@mappings_bp.route('/procedure-mappings/lookup', methods=['POST', 'OPTIONS'])
@require_auth()
def lookup_procedure_mapping():
    """
    Resolve external procedure code to PACS procedure using unified mappings.
    """
    if request.method == 'OPTIONS':
        return '', 204

    user = request.current_user
    required = REQUIRED_PERMISSIONS['read_mapping']
    if not check_permission(user.get('permissions', []), required):
        return jsonify({"status": "error", "message": "Unauthorized"}), 403

    try:
        data = request.get_json()
        external_system_id = data.get('external_system_id')
        external_code = data.get('external_code')
        create_missing = data.get('create_missing', False)

        if not external_system_id or not external_code:
            return jsonify({"status": "error", "message": "Missing external_system_id or external_code"}), 400

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Try exact match first
            cursor.execute("""
                SELECT upm.*
                FROM unified_procedure_mappings upm
                WHERE upm.external_system_id = %s::uuid
                  AND upm.external_code = %s
                  AND upm.is_active = true
            """, (external_system_id, external_code))
            mapping = cursor.fetchone()

            if mapping:
                # Log usage
                cursor.execute("""
                    INSERT INTO procedure_mapping_usage (mapping_id, usage_date, usage_count, success_count)
                    VALUES (%s, CURRENT_DATE, 1, 1)
                    ON CONFLICT (mapping_id, usage_date)
                    DO UPDATE SET
                        usage_count = procedure_mapping_usage.usage_count + 1,
                        success_count = procedure_mapping_usage.success_count + 1,
                        last_used_at = NOW()
                """, (mapping['id'],))

                return jsonify({
                    "status": "success",
                    "found": True,
                    "mapping": mapping,
                    "procedure": {
                        "pacs_code": mapping['pacs_code'],
                        "pacs_name": mapping['pacs_name'],
                        "modality": mapping['modality']
                    }
                }), 200

            else:
                if create_missing:
                    cursor.execute("SELECT id FROM external_systems WHERE id = %s::uuid", (external_system_id,))
                    if not cursor.fetchone():
                        return jsonify({"status": "error", "message": "Invalid external system"}), 400

                    cursor.execute("""
                        INSERT INTO unified_procedure_mappings (
                            external_system_id, external_code, external_name, is_active, created_by, updated_by
                        ) VALUES (%s, %s, %s, true, %s, %s)
                        ON CONFLICT (external_system_id, external_code) DO NOTHING
                        RETURNING id
                    """, (
                        external_system_id, external_code, external_code, user.get('username'), user.get('username')
                    ))
                    new_id = cursor.fetchone()
                    
                    msg = "Mapping created (unmapped)" if new_id else "Mapping already exists (unmapped)"
                    return jsonify({
                        "status": "success",
                        "found": False,
                        "message": msg
                    }), 200
                
                return jsonify({
                    "status": "success",
                    "found": False,
                    "message": "No active mapping found"
                }), 404

    except Exception as e:
        logger.error(f"Error looking up unified mapping: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


@mappings_bp.route('/procedure-mappings/stats', methods=['GET', 'OPTIONS'])
@require_auth()
def get_mapping_statistics():
    """Get statistics about unified procedure mappings"""
    if request.method == 'OPTIONS':
        return '', 204

    user = request.current_user
    required = REQUIRED_PERMISSIONS['read_mapping']
    if not check_permission(user.get('permissions', []), required):
        return jsonify({"status": "error", "message": "Unauthorized"}), 403

    try:
        external_system_id = request.args.get('external_system_id')

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Total mappings
            base_sql = "SELECT COUNT(*) as count FROM unified_procedure_mappings WHERE is_active = true"
            params = []
            if external_system_id:
                base_sql += " AND external_system_id = %s::uuid"
                params.append(external_system_id)
            cursor.execute(base_sql, params)
            total_active = cursor.fetchone()['count']

            return jsonify({
                "status": "success",
                "stats": {
                    "active_mappings": total_active
                }
            }), 200

    except Exception as e:
        logger.error(f"Error getting unified mapping stats: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500


# ============================================================================
# PROCEDURE MAPPINGS
# ============================================================================

@mappings_bp.route('/procedure-mappings', methods=['GET'])
@mappings_bp.route('/external-systems/<system_id>/mappings/procedures', methods=['GET'])
@require_auth(REQUIRED_PERMISSIONS['read_mapping'])
def list_procedure_mappings(system_id=None):
    """List procedure mappings with filters"""
    try:
        external_system_id = request.args.get('external_system_id') or system_id
        external_code = request.args.get('external_code')
        pacs_code = request.args.get('pacs_code') # Changed from pacs_procedure_id
        mapping_type = request.args.get('mapping_type')
        is_active = request.args.get('is_active')
        
        page = _parse_positive_int(request.args.get('page'), 1)
        page_size = _parse_positive_int(request.args.get('page_size'), 50, max_value=100)
        offset = (page - 1) * page_size

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            base_query = """
                FROM unified_procedure_mappings upm
                JOIN external_systems es ON upm.external_system_id = es.id
                WHERE 1=1
            """
            params = []
            
            if external_system_id:
                base_query += " AND upm.external_system_id = %s::uuid"
                params.append(external_system_id)
                
            if external_code:
                base_query += " AND upm.external_code ILIKE %s"
                params.append(f"%{external_code}%")
                
            if pacs_code: # Changed from pacs_procedure_id
                base_query += " AND upm.pacs_code = %s"
                params.append(pacs_code)
                
            if mapping_type:
                base_query += " AND upm.mapping_type = %s"
                params.append(mapping_type)
                
            if is_active is not None:
                is_active_bool = is_active.lower() == 'true'
                base_query += " AND upm.is_active = %s"
                params.append(is_active_bool)

            # Count
            cursor.execute(f"SELECT COUNT(*) as count {base_query}", params)
            total = cursor.fetchone()['count']
            
            # Data
            cursor.execute(f"""
                SELECT upm.*, 
                       es.system_code, es.system_name
                {base_query}
                ORDER BY upm.created_at DESC
                LIMIT %s OFFSET %s
            """, params + [page_size, offset])
            
            mappings = cursor.fetchall()
            
            return jsonify({
                "status": "success",
                "mappings": mappings,
                "total": total,
                "page": page,
                "page_size": page_size
            }), 200
            
    except Exception as e:
        logger.error(f"Error listing unified procedure mappings: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@mappings_bp.route('/procedure-mappings', methods=['POST'])
@mappings_bp.route('/external-systems/<system_id>/mappings/procedures', methods=['POST'])
@require_auth(REQUIRED_PERMISSIONS['create_mapping'])
def create_procedure_mapping(system_id=None):
    """Create a new unified procedure mapping"""
    try:
        data = request.get_json()
        user = request.current_user
        
        # Prefer system_id from path if available, otherwise from body
        external_system_id_from_path = system_id
        external_system_id_from_body = data.get('external_system_id')
        
        # Determine the external_system_id to use
        # Path parameter takes precedence if it exists
        external_system_id = external_system_id_from_path if external_system_id_from_path else external_system_id_from_body

        if not external_system_id or not data.get('external_code'):
            return jsonify({"status": "error", "message": "Missing external_system_id or external_code"}), 400

        try:
            external_system_uuid = uuid.UUID(external_system_id)
        except ValueError:
            return jsonify({"status": "error", "message": "Invalid external_system_id format"}), 400
        
        pacs_code = data.get('pacs_code')
        pacs_name = data.get('pacs_name')
        modality = data.get('modality')
        description = data.get('description')
        
        # If pacs_procedure_id is provided, try to fetch details from 'procedures' table
        if data.get('pacs_procedure_id'):
            with get_db_connection() as conn_proc:
                cursor_proc = conn_proc.cursor(cursor_factory=RealDictCursor)
                cursor_proc.execute("SELECT code, name, modality, description FROM procedures WHERE id = %s", (str(data['pacs_procedure_id']),))
                procedure_details = cursor_proc.fetchone()
                if procedure_details:
                    pacs_code = procedure_details['code']
                    pacs_name = procedure_details['name']
                    modality = procedure_details['modality']
                    description = procedure_details['description']
                else:
                    logger.warning(f"pacs_procedure_id {data['pacs_procedure_id']} not found in procedures table. Proceeding with provided pacs_code/name.")
        
        # Ensure at least pacs_code or pacs_name is present if no pacs_procedure_id lookup
        if not pacs_code and not pacs_name:
            return jsonify({"status": "error", "message": "Either pacs_procedure_id or pacs_code/pacs_name is required"}), 400

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Check duplicates
            cursor.execute("""
                SELECT id FROM unified_procedure_mappings 
                WHERE external_system_id = %s AND external_code = %s
            """, (str(external_system_uuid), data['external_code']))
            
            if cursor.fetchone():
                return jsonify({"status": "error", "message": "Mapping already exists"}), 409
                
            cursor.execute("""
                INSERT INTO unified_procedure_mappings (
                    external_system_id, external_code, external_name, pacs_code,
                    pacs_name, modality, description, is_active, created_by, updated_by
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                ) RETURNING id
            """, (
                str(external_system_uuid), data['external_code'], 
                data.get('external_name'), pacs_code,
                pacs_name, modality, description,
                data.get('is_active', True), user.get('username'), user.get('username')
            ))
            
            mapping_id = cursor.fetchone()['id']
            
            log_mapping_audit(mapping_id, 'CREATE', 'unified_procedure_mapping', None, json.dumps(data), user)
            
            return jsonify({
                "status": "success", 
                "message": "Unified mapping created",
                "mapping_id": mapping_id
            }), 201
            
    except Exception as e:
        logger.error(f"Error creating unified procedure mapping: {str(e)}", exc_info=True)
        return jsonify({"status": "error", "message": str(e)}), 500

@mappings_bp.route('/procedure-mappings/<mapping_id>', methods=['GET', 'PUT', 'DELETE'])
@mappings_bp.route('/external-systems/<system_id>/mappings/procedures/<mapping_id>', methods=['GET', 'PUT', 'DELETE'])
@require_auth(REQUIRED_PERMISSIONS['read_mapping'])
def handle_procedure_mapping(mapping_id, system_id=None):
    """Handle get, update, delete for procedure mapping"""
    try:
        if request.method == 'GET':
            return get_procedure_mapping(mapping_id)
        elif request.method == 'PUT':
            return update_procedure_mapping(mapping_id)
        elif request.method == 'DELETE':
            return delete_procedure_mapping(mapping_id)
            
    except Exception as e:
        logger.error(f"Error handling procedure mapping {mapping_id}: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

def get_procedure_mapping(mapping_id):
    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("""
            SELECT upm.*, es.system_code, es.system_name
            FROM unified_procedure_mappings upm
            JOIN external_systems es ON upm.external_system_id = es.id
            WHERE upm.id = %s::uuid
        """, (mapping_id,))
        
        mapping = cursor.fetchone()
        if not mapping:
            return jsonify({"status": "error", "message": "Mapping not found"}), 404
            
        return jsonify({"status": "success", "mapping": mapping}), 200

def update_procedure_mapping(mapping_id):
    data = request.get_json()
    user = request.current_user
    
    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("SELECT * FROM unified_procedure_mappings WHERE id = %s::uuid", (mapping_id,))
        current = cursor.fetchone()
        if not current:
            return jsonify({"status": "error", "message": "Mapping not found"}), 404
        
        update_fields = []
        params = []
        allowed_fields = [
            'external_code', 'external_name', 'pacs_code', 'pacs_name', 'modality', 'description',
            'is_active', 'notes'
        ]
        
        for field in allowed_fields:
            if field in data:
                update_fields.append(f"{field} = %s")
                params.append(data[field])
                
        if not update_fields:
            return jsonify({"status": "error", "message": "No fields to update"}), 400
            
        params.append(user.get('username')) # For updated_by
        params.append(mapping_id)
        
        try:
            cursor.execute(f"""
                UPDATE unified_procedure_mappings
                SET {', '.join(update_fields)}, updated_by = %s, updated_at = NOW()
                WHERE id = %s::uuid
                RETURNING id
            """, params)
        except Exception as e:
             if 'unique constraint' in str(e).lower():
                 return jsonify({"status": "error", "message": "External code already exists for this system"}), 409
             raise e
        
        log_mapping_audit(mapping_id, 'UPDATE', 'unified_procedure_mapping', None, json.dumps(data), user)
        
        return jsonify({"status": "success", "message": "Mapping updated"}), 200

def delete_procedure_mapping(mapping_id):
    user = request.current_user
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM unified_procedure_mappings WHERE id = %s::uuid", (mapping_id,))
        if not cursor.fetchone():
            return jsonify({"status": "error", "message": "Mapping not found"}), 404
            
        cursor.execute("DELETE FROM unified_procedure_mappings WHERE id = %s::uuid", (mapping_id,))
        
        log_mapping_audit(mapping_id, 'DELETE', 'unified_procedure_mapping', None, None, user)
        
        return jsonify({"status": "success", "message": "Mapping deleted"}), 200

# ============================================================================
# DOCTOR MAPPINGS (UNIFIED IMPLEMENTATION)
# ============================================================================

@mappings_bp.route('/doctor-mappings', methods=['GET'])
@require_auth(REQUIRED_PERMISSIONS['read_mapping'])
def list_doctor_mappings():
    """List doctor mappings"""
    try:
        external_system_id = request.args.get('external_system_id')
        search = request.args.get('search')
        page = _parse_positive_int(request.args.get('page'), 1)
        page_size = _parse_positive_int(request.args.get('page_size'), 50)
        offset = (page - 1) * page_size

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            base_query = """
                FROM doctor_mappings dm
                JOIN external_systems es ON dm.external_system_id = es.id
                LEFT JOIN doctors d ON dm.pacs_doctor_id = d.id
                WHERE 1=1
            """
            params = []
            
            if external_system_id:
                base_query += " AND dm.external_system_id = %s::uuid"
                params.append(external_system_id)
                
            if search:
                base_query += " AND (dm.external_code ILIKE %s OR dm.external_name ILIKE %s)"
                params.extend([f"%{search}%", f"%{search}%"])

            cursor.execute(f"SELECT COUNT(*) as count {base_query}", params)
            total = cursor.fetchone()['count']
            
            cursor.execute(f"""
                SELECT dm.*, es.system_code, d.name as pacs_doctor_name
                {base_query}
                ORDER BY dm.created_at DESC
                LIMIT %s OFFSET %s
            """, params + [page_size, offset])
            
            mappings = cursor.fetchall()
            
            return jsonify({
                "status": "success",
                "mappings": mappings,
                "total": total,
                "page": page, 
                "page_size": page_size
            }), 200
            
    except Exception as e:
        logger.error(f"Error listing doctor mappings: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@mappings_bp.route('/doctor-mappings', methods=['POST'])
@require_auth(REQUIRED_PERMISSIONS['create_mapping'])
def create_doctor_mapping():
    """Create a new doctor mapping"""
    try:
        data = request.get_json()
        user = request.current_user
        
        if not data.get('external_system_id') or not data.get('external_code'):
            return jsonify({"status": "error", "message": "Missing required fields"}), 400
            
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            cursor.execute("""
                INSERT INTO doctor_mappings (
                    external_system_id, external_code, external_name,
                    pacs_doctor_id, mapping_type, confidence_level, notes,
                    is_active, mapped_by
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s
                ) RETURNING id
            """, (
                data['external_system_id'], data['external_code'], data.get('external_name'),
                data.get('pacs_doctor_id'), data.get('mapping_type', 'exact'),
                data.get('confidence_level', 100), data.get('notes'),
                data.get('is_active', True), user.get('username')
            ))
            
            mapping_id = cursor.fetchone()['id']
            return jsonify({"status": "success", "message": "Mapping created", "mapping_id": mapping_id}), 201
            
    except Exception as e:
        logger.error(f"Error creating doctor mapping: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@mappings_bp.route('/doctor-mappings/<mapping_id>', methods=['PUT'])
@require_auth(REQUIRED_PERMISSIONS['update_mapping'])
def update_doctor_mapping(mapping_id):
    """Update doctor mapping"""
    try:
        data = request.get_json()
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            update_fields = []
            params = []
            for field in ['pacs_doctor_id', 'external_name', 'mapping_type', 'confidence_level', 'notes', 'is_active']:
                if field in data:
                    update_fields.append(f"{field} = %s")
                    params.append(data[field])
            
            if not update_fields:
                return jsonify({"status": "error", "message": "No fields to update"}), 400
                
            params.append(mapping_id)
            cursor.execute(f"""
                UPDATE doctor_mappings SET {', '.join(update_fields)}, updated_at = NOW()
                WHERE id = %s::uuid
            """, params)
            
            return jsonify({"status": "success", "message": "Mapping updated"}), 200
            
    except Exception as e:
        logger.error(f"Error updating doctor mapping: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@mappings_bp.route('/doctor-mappings/<mapping_id>', methods=['DELETE'])
@require_auth(REQUIRED_PERMISSIONS['delete_mapping'])
def delete_doctor_mapping(mapping_id):
    """Delete doctor mapping"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM doctor_mappings WHERE id = %s::uuid", (mapping_id,))
            return jsonify({"status": "success", "message": "Mapping deleted"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# ============================================================================
# OPERATOR MAPPINGS (UNIFIED IMPLEMENTATION)
# ============================================================================
# Similar structure for operator mappings...
# Skipping for brevity but should be implemented similarly if requested.
