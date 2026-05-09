from flask import request
import json
import logging
from .db import get_db_connection

logger = logging.getLogger(__name__)

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

def log_procedure_audit(procedure_id, action, field_name, old_value, new_value, user):
    """Log audit trail for procedures"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO procedure_audit_log (
                    procedure_id, action, field_name, old_value, new_value,
                    user_id, ip_address, user_agent
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                procedure_id,
                action,
                field_name,
                old_value,
                new_value,
                user.get('user_id') if user.get('user_id') else user.get('username'),
                request.remote_addr,
                request.headers.get('User-Agent', '')
            ))
    except Exception as e:
        logger.error(f"Failed to log procedure audit: {str(e)}")

def log_mapping_audit(mapping_id, action, field_name, old_value, new_value, user):
    """Log audit trail for procedure mappings"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO procedure_mapping_audit_log (
                    mapping_id, action, field_name, old_value, new_value,
                    user_id, ip_address, user_agent
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                mapping_id,
                action,
                field_name,
                old_value,
                new_value,
                user.get('user_id') if user.get('user_id') else user.get('username'),
                request.remote_addr,
                request.headers.get('User-Agent', '')
            ))
    except Exception as e:
        logger.error(f"Failed to log mapping audit: {str(e)}")
