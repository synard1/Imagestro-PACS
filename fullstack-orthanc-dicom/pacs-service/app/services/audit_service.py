"""
Audit Service
Manages audit log operations with HIPAA/GDPR compliance
"""

import logging
import json
import uuid as uuid_lib
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_, desc, text

logger = logging.getLogger(__name__)


def _validate_uuid(value: Optional[str]) -> Optional[str]:
    """
    Validate and convert string to UUID format
    Returns None if value is not a valid UUID
    """
    if not value:
        return None
    try:
        # Try to parse as UUID
        uuid_lib.UUID(value)
        return value
    except (ValueError, AttributeError):
        # Not a valid UUID, return None
        return None


class AuditService:
    """Service for managing audit logs"""
    
    def __init__(self, db: Session):
        """
        Initialize audit service
        
        Args:
            db: Database session
        """
        self.db = db
    
    async def create_log(
        self,
        user_id: Optional[str],
        username: Optional[str],
        user_role: Optional[str],
        action: str,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        session_id: Optional[str] = None,
        request_method: Optional[str] = None,
        request_path: Optional[str] = None,
        response_status: Optional[int] = None,
        response_time_ms: Optional[int] = None,
        phi_accessed: bool = False,
        patient_id: Optional[str] = None,
        study_instance_uid: Optional[str] = None,
        failure_reason: Optional[str] = None,
        severity: str = 'INFO'
    ) -> Dict[str, Any]:
        """
        Create audit log entry
        
        Args:
            user_id: User UUID
            username: Username
            user_role: User role
            action: Action performed
            resource_type: Type of resource accessed
            resource_id: Resource identifier
            details: Additional details (JSON)
            ip_address: Client IP address
            user_agent: Client user agent
            session_id: Session identifier
            request_method: HTTP method
            request_path: Request path
            response_status: HTTP response status
            response_time_ms: Response time in milliseconds
            phi_accessed: Whether PHI was accessed
            patient_id: Patient ID (for PHI tracking)
            study_instance_uid: Study UID (for DICOM tracking)
            failure_reason: Reason for failure (if any)
            severity: Log severity (INFO, WARNING, ERROR, CRITICAL)
            
        Returns:
            Created audit log entry
        """
        try:
            # Validate UUID fields
            validated_user_id = _validate_uuid(user_id)

            query = """
                INSERT INTO pacs_audit_log (
                    user_id, username, user_role, action, resource_type, resource_id,
                    details, ip_address, user_agent, session_id, request_method,
                    request_path, response_status, response_time_ms, phi_accessed,
                    patient_id, study_instance_uid, failure_reason, severity
                ) VALUES (
                    :user_id, :username, :user_role, :action, :resource_type, :resource_id,
                    :details, :ip_address, :user_agent, :session_id, :request_method,
                    :request_path, :response_status, :response_time_ms, :phi_accessed,
                    :patient_id, :study_instance_uid, :failure_reason, :severity
                )
                RETURNING id, created_at
            """

            result = self.db.execute(text(query), {
                'user_id': validated_user_id,
                'username': username,
                'user_role': user_role,
                'action': action,
                'resource_type': resource_type,
                'resource_id': resource_id,
                'details': json.dumps(details) if details else None,
                'ip_address': ip_address,
                'user_agent': user_agent,
                'session_id': session_id,
                'request_method': request_method,
                'request_path': request_path,
                'response_status': response_status,
                'response_time_ms': response_time_ms,
                'phi_accessed': phi_accessed,
                'patient_id': patient_id,
                'study_instance_uid': study_instance_uid,
                'failure_reason': failure_reason,
                'severity': severity
            })
            
            self.db.commit()
            row = result.fetchone()
            
            log_msg = f"Audit: {action} by {username or 'anonymous'}"
            if phi_accessed:
                log_msg += f" [PHI ACCESSED - Patient: {patient_id}]"
            
            logger.info(log_msg)
            
            return {
                'id': str(row[0]),
                'created_at': row[1].isoformat()
            }
            
        except Exception as e:
            logger.error(f"Failed to create audit log: {str(e)}")
            self.db.rollback()
            raise # Propagate exception to caller
    
    async def get_logs(
        self,
        user_id: Optional[str] = None,
        username: Optional[str] = None,
        action: Optional[str] = None,
        resource_type: Optional[str] = None,
        phi_only: bool = False,
        failed_only: bool = False,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        severity: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
        include_total: bool = True,
        page: Optional[int] = None,
        search: Optional[str] = None
    ) -> Tuple[List[Dict[str, Any]], int]:
        """
        Query audit logs with filters
        
        Args:
            user_id: Filter by user ID
            username: Filter by username
            action: Filter by action
            resource_type: Filter by resource type
            phi_only: Only show PHI access logs
            failed_only: Only show failed operations
            start_date: Start date filter
            end_date: End date filter
            severity: Filter by severity
            limit: Maximum results
            offset: Offset for pagination (overridden by page when provided)
            include_total: Whether to calculate total rows for pagination
            page: Optional page number (1-based)
            
        Returns:
            Tuple of (logs on the requested page, total matching rows)
        """
        try:
            effective_offset = offset
            if page:
                effective_offset = (page - 1) * limit

            conditions = ["1=1"]
            params: Dict[str, Any] = {}

            if user_id:
                conditions.append("user_id = :user_id")
                params['user_id'] = user_id

            if username:
                conditions.append("username ILIKE :username")
                params['username'] = f"%{username}%"

            if action:
                conditions.append("action = :action")
                params['action'] = action

            if resource_type:
                conditions.append("resource_type = :resource_type")
                params['resource_type'] = resource_type

            if phi_only:
                conditions.append("phi_accessed = TRUE")

            if failed_only:
                conditions.append("response_status >= 400")

            if start_date:
                conditions.append("created_at >= :start_date")
                params['start_date'] = start_date

            if end_date:
                conditions.append("created_at <= :end_date")
                params['end_date'] = end_date

            if severity:
                conditions.append("severity = :severity")
                params['severity'] = severity

            if search:
                # Global search across multiple fields
                conditions.append("""(
                    username ILIKE :search OR 
                    action ILIKE :search OR 
                    resource_type ILIKE :search OR 
                    resource_id ILIKE :search OR 
                    ip_address ILIKE :search
                )""")
                params['search'] = f"%{search}%"

            where_clause = " AND ".join(conditions)

            total_count = 0
            if include_total:
                count_query = text(f"SELECT COUNT(*) FROM pacs_audit_log WHERE {where_clause}")
                total_count = self.db.execute(count_query, params).scalar() or 0

            query_str = f"SELECT * FROM pacs_audit_log WHERE {where_clause} ORDER BY created_at DESC LIMIT :limit OFFSET :offset"
            query_params = {**params, 'limit': limit, 'offset': effective_offset}

            result = self.db.execute(text(query_str), query_params)
            rows = result.fetchall()
            
            logs = []
            for row in rows:
                r = row._mapping
                logs.append({
                    'id': str(r['id']),
                    'user_id': str(r['user_id']) if r['user_id'] else None,
                    'username': r['username'],
                    'user_role': r['user_role'],
                    'action': r['action'],
                    'resource_type': r['resource_type'],
                    'resource_id': r['resource_id'],
                    'details': r['details'],
                    'ip_address': r['ip_address'],
                    'user_agent': r['user_agent'],
                    'session_id': r['session_id'],
                    'request_method': r['request_method'],
                    'request_path': r['request_path'],
                    'response_status': r['response_status'],
                    'response_time_ms': r['response_time_ms'],
                    'phi_accessed': r['phi_accessed'],
                    'patient_id': r['patient_id'],
                    'study_instance_uid': r['study_instance_uid'],
                    'failure_reason': r['failure_reason'],
                    'severity': r['severity'],
                    'created_at': r['created_at'].isoformat()
                })
            
            return logs, total_count
            
        except Exception as e:
            logger.error(f"Failed to get audit logs: {str(e)}")
            raise
    
    async def get_stats(
        self,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """
        Get audit statistics
        
        Args:
            start_date: Start date (default: 30 days ago)
            end_date: End date (default: now)
            
        Returns:
            Statistics dictionary
        """
        try:
            if not start_date:
                start_date = datetime.now() - timedelta(days=365)  # Extend to 1 year for more data
            if not end_date:
                end_date = datetime.now() + timedelta(days=1)  # Add 1 day buffer

            # Query untuk total events (using >= and <= to avoid timezone issues)
            total_query = text("""
                SELECT COUNT(*) as total_events FROM pacs_audit_log
                WHERE created_at >= :start_date AND created_at <= :end_date
            """)
            total_result = self.db.execute(total_query, {
                'start_date': start_date,
                'end_date': end_date
            }).fetchone()

            # Query untuk PHI access count
            phi_query = text("""
                SELECT COUNT(*) as phi_count FROM pacs_audit_log
                WHERE created_at >= :start_date AND created_at <= :end_date
                AND phi_accessed = true
            """)
            phi_result = self.db.execute(phi_query, {
                'start_date': start_date,
                'end_date': end_date
            }).fetchone()

            # Query untuk failed operations
            failed_query = text("""
                SELECT COUNT(*) as failed_count FROM pacs_audit_log
                WHERE created_at >= :start_date AND created_at <= :end_date
                AND failure_reason IS NOT NULL
            """)
            failed_result = self.db.execute(failed_query, {
                'start_date': start_date,
                'end_date': end_date
            }).fetchone()

            # Query untuk unique users
            users_query = text("""
                SELECT COUNT(DISTINCT username) as unique_users FROM pacs_audit_log
                WHERE created_at >= :start_date AND created_at <= :end_date
            """)
            users_result = self.db.execute(users_query, {
                'start_date': start_date,
                'end_date': end_date
            }).fetchone()

            # Query untuk unique patients
            patients_query = text("""
                SELECT COUNT(DISTINCT patient_id) as unique_patients FROM pacs_audit_log
                WHERE created_at >= :start_date AND created_at <= :end_date
                AND patient_id IS NOT NULL
            """)
            patients_result = self.db.execute(patients_query, {
                'start_date': start_date,
                'end_date': end_date
            }).fetchone()

            return {
                'total_events': total_result[0] if total_result else 0,
                'phi_access_count': phi_result[0] if phi_result else 0,
                'failed_operations': failed_result[0] if failed_result else 0,
                'unique_users': users_result[0] if users_result else 0,
                'unique_patients': patients_result[0] if patients_result else 0,
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat()
            }
            
        except Exception as e:
            logger.error(f"Failed to get audit stats: {str(e)}")
            raise
    
    async def export_logs(
        self,
        format: str = 'json',
        **filters
    ) -> str:
        """
        Export audit logs
        
        Args:
            format Format (json or csv)
            **filters: Filter parameters for get_logs
            
        Returns:
            Exported data as string
        """
        import json
        import csv
        from io import StringIO
        
        logs, _ = await self.get_logs(limit=10000, offset=0, include_total=False, **filters)
        
        if format == 'csv':
            output = StringIO()
            if logs:
                writer = csv.DictWriter(output, fieldnames=logs[0].keys())
                writer.writeheader()
                writer.writerows(logs)
            return output.getvalue()
        else:
            return json.dumps(logs, indent=2)

    # ============================================================================
    # Impersonate-Specific Audit Methods
    # ============================================================================
    
    async def log_impersonate_start(
        self,
        original_user_id: str,
        original_username: str,
        original_user_role: str,
        target_user_id: str,
        target_username: str,
        target_user_role: str,
        reason: Optional[str] = None,
        session_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Log impersonate session start
        
        Args:
            original_user_id: Superadmin user ID
            original_username: Superadmin username
            original_user_role: Superadmin role
            target_user_id: Target user ID
            target_username: Target username
            target_user_role: Target user role
            reason: Reason for impersonation
            session_id: Impersonate session ID
            ip_address: Client IP address
            user_agent: Client user agent
            
        Returns:
            Created audit log entry
        """
        try:
            details = {
                'target_user_id': target_user_id,
                'target_username': target_username,
                'target_user_role': target_user_role,
                'reason': reason or 'No reason provided'
            }
            
            return await self.create_log(
                user_id=original_user_id,
                username=original_username,
                user_role=original_user_role,
                action='impersonate_start',
                resource_type='user',
                resource_id=target_user_id,
                details=details,
                ip_address=ip_address,
                user_agent=user_agent,
                severity='WARNING'
            )
            
        except Exception as e:
            logger.error(f"Failed to log impersonate start: {str(e)}")
            raise
    
    async def log_impersonate_stop(
        self,
        original_user_id: str,
        original_username: str,
        original_user_role: str,
        target_user_id: str,
        target_username: str,
        duration_seconds: int,
        session_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Log impersonate session stop
        
        Args:
            original_user_id: Superadmin user ID
            original_username: Superadmin username
            original_user_role: Superadmin role
            target_user_id: Target user ID
            target_username: Target username
            duration_seconds: Session duration in seconds
            session_id: Impersonate session ID
            ip_address: Client IP address
            user_agent: Client user agent
            
        Returns:
            Created audit log entry
        """
        try:
            details = {
                'target_user_id': target_user_id,
                'target_username': target_username,
                'duration_seconds': duration_seconds
            }
            
            return await self.create_log(
                user_id=original_user_id,
                username=original_username,
                user_role=original_user_role,
                action='impersonate_stop',
                resource_type='user',
                resource_id=target_user_id,
                details=details,
                ip_address=ip_address,
                user_agent=user_agent,
                severity='WARNING'
            )
            
        except Exception as e:
            logger.error(f"Failed to log impersonate stop: {str(e)}")
            raise
    
    async def log_action_during_impersonate(
        self,
        original_user_id: str,
        original_username: str,
        target_user_id: str,
        target_username: str,
        action: str,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        session_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Log action performed during impersonate session
        
        Args:
            original_user_id: Superadmin user ID
            original_username: Superadmin username
            target_user_id: Target user ID
            target_username: Target username
            action: Action performed
            resource_type: Type of resource accessed
            resource_id: Resource identifier
            details: Additional details
            session_id: Impersonate session ID
            ip_address: Client IP address
            user_agent: Client user agent
            
        Returns:
            Created audit log entry
        """
        try:
            log_details = details or {}
            log_details['impersonated_as'] = target_username
            
            return await self.create_log(
                user_id=target_user_id,
                username=target_username,
                user_role=None,
                action=action,
                resource_type=resource_type,
                resource_id=resource_id,
                details=log_details,
                ip_address=ip_address,
                user_agent=user_agent,
                severity='INFO'
            )
            
        except Exception as e:
            logger.error(f"Failed to log action during impersonate: {str(e)}")
            raise
    
    async def get_impersonate_logs(
        self,
        original_user_id: Optional[str] = None,
        target_user_id: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        limit: int = 100,
        offset: int = 0
    ) -> Tuple[List[Dict[str, Any]], int]:
        """
        Get impersonate-related audit logs
        
        Args:
            original_user_id: Filter by superadmin ID
            target_user_id: Filter by target user ID
            start_date: Start date filter
            end_date: End date filter
            limit: Maximum results
            offset: Offset for pagination
            
        Returns:
            Tuple of (logs, total_count)
        """
        try:
            conditions = ["action IN ('impersonate_start', 'impersonate_stop')"]
            params: Dict[str, Any] = {}
            
            if original_user_id:
                conditions.append("user_id = :original_user_id")
                params['original_user_id'] = original_user_id
            
            if target_user_id:
                conditions.append("resource_id = :target_user_id")
                params['target_user_id'] = target_user_id
            
            if start_date:
                conditions.append("created_at >= :start_date")
                params['start_date'] = start_date
            
            if end_date:
                conditions.append("created_at <= :end_date")
                params['end_date'] = end_date
            
            where_clause = " AND ".join(conditions)
            
            # Get total count
            count_query = text(f"SELECT COUNT(*) FROM pacs_audit_log WHERE {where_clause}")
            total_count = self.db.execute(count_query, params).scalar() or 0
            
            # Get paginated results
            query_str = f"SELECT * FROM pacs_audit_log WHERE {where_clause} ORDER BY created_at DESC LIMIT :limit OFFSET :offset"
            query_params = {**params, 'limit': limit, 'offset': offset}
            
            result = self.db.execute(text(query_str), query_params)
            rows = result.fetchall()
            
            logs = []
            for row in rows:
                r = row._mapping
                logs.append({
                    'id': str(r['id']),
                    'user_id': str(r['user_id']) if r['user_id'] else None,
                    'username': r['username'],
                    'action': r['action'],
                    'resource_type': r['resource_type'],
                    'resource_id': r['resource_id'],
                    'details': r['details'],
                    'created_at': r['created_at'].isoformat()
                })
            
            return logs, total_count
            
        except Exception as e:
            logger.error(f"Failed to get impersonate logs: {str(e)}")
            raise
