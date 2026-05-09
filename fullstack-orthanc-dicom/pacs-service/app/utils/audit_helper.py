"""
Audit Logging Helper
Centralized utility for creating audit log entries across all modules
"""

import logging
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from datetime import datetime
from fastapi import Request

from app.services.audit_service import AuditService

logger = logging.getLogger(__name__)


class AuditHelper:
    """
    Helper class for creating audit log entries
    Provides consistent audit logging across all CRUD operations
    """

    # Audit Action Constants
    ACTION_CREATE = "CREATE"
    ACTION_READ = "READ"
    ACTION_UPDATE = "UPDATE"
    ACTION_DELETE = "DELETE"
    ACTION_SOFT_DELETE = "SOFT_DELETE"
    ACTION_RESTORE = "RESTORE"
    ACTION_STATUS_CHANGE = "STATUS_CHANGE"
    ACTION_UPLOAD = "UPLOAD"
    ACTION_DOWNLOAD = "DOWNLOAD"
    ACTION_EXPORT = "EXPORT"
    ACTION_SYNC = "SYNC"

    # Resource Type Constants
    RESOURCE_ORDER = "ORDER"
    RESOURCE_WORKLIST = "WORKLIST"
    RESOURCE_STUDY = "STUDY"
    RESOURCE_SERIES = "SERIES"
    RESOURCE_INSTANCE = "INSTANCE"
    RESOURCE_DICOM_FILE = "DICOM_FILE"
    RESOURCE_SCHEDULE_SLOT = "SCHEDULE_SLOT"
    RESOURCE_PATIENT = "PATIENT"

    # Severity Levels
    SEVERITY_INFO = "INFO"
    SEVERITY_WARNING = "WARNING"
    SEVERITY_ERROR = "ERROR"
    SEVERITY_CRITICAL = "CRITICAL"

    @staticmethod
    def extract_user_from_request(request: Optional[Request] = None) -> Dict[str, Optional[str]]:
        """
        Extract user information from request context

        Args:
            request: FastAPI Request object

        Returns:
            Dictionary with user_id, username, user_role
        """
        if not request:
            return {
                'user_id': None,
                'username': 'system',
                'user_role': 'SYSTEM'
            }

        # Try to get user from request state (set by auth middleware)
        user_id = getattr(request.state, 'user_id', None)
        username = getattr(request.state, 'username', None)
        user_role = getattr(request.state, 'user_role', None)

        # Handle Impersonation: If X-Impersonated-By exists, use it for username if not already set
        impersonator = request.headers.get('X-Impersonated-By')
        if impersonator and username and username != 'anonymous':
            # Format: "original_user (as target_user)"
            username = f"{impersonator} (as {username})"

        # Fallback: Try to get from headers (for external integrations)
        if not user_id:
            user_id = request.headers.get('X-User-ID')
        if not username:
            username = request.headers.get('X-Username', 'anonymous')
        if not user_role:
            user_role = request.headers.get('X-User-Role', 'UNKNOWN')

        return {
            'user_id': user_id,
            'username': username,
            'user_role': user_role
        }

    @staticmethod
    def extract_request_info(request: Optional[Request] = None) -> Dict[str, Optional[str]]:
        """
        Extract request metadata (IP, user agent, method, path)

        Args:
            request: FastAPI Request object

        Returns:
            Dictionary with ip_address, user_agent, request_method, request_path
        """
        if not request:
            return {
                'ip_address': None,
                'user_agent': None,
                'request_method': None,
                'request_path': None,
                'session_id': None
            }

        # Get client IP (support proxy headers)
        ip_address = request.headers.get('X-Forwarded-For')
        if ip_address:
            ip_address = ip_address.split(',')[0].strip()
        else:
            ip_address = request.client.host if request.client else None

        return {
            'ip_address': ip_address,
            'user_agent': request.headers.get('User-Agent'),
            'request_method': request.method,
            'request_path': str(request.url.path),
            'session_id': request.headers.get('X-Session-ID')
        }

    @staticmethod
    async def log_crud_operation(
        db: Session,
        action: str,
        resource_type: str,
        resource_id: str,
        request: Optional[Request] = None,
        details: Optional[Dict[str, Any]] = None,
        phi_accessed: bool = False,
        patient_id: Optional[str] = None,
        study_instance_uid: Optional[str] = None,
        severity: str = SEVERITY_INFO,
        failure_reason: Optional[str] = None,
        response_status: Optional[int] = None,
        response_time_ms: Optional[int] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Log a CRUD operation to audit log

        Args:
            db: Database session
            action: Action performed (CREATE, READ, UPDATE, DELETE, etc.)
            resource_type: Type of resource (ORDER, WORKLIST, STUDY, etc.)
            resource_id: ID of the resource
            request: FastAPI Request object (optional)
            details: Additional details (JSON)
            phi_accessed: Whether PHI was accessed (HIPAA compliance)
            patient_id: Patient ID if PHI was accessed
            study_instance_uid: Study UID for DICOM operations
            severity: Log severity (INFO, WARNING, ERROR, CRITICAL)
            failure_reason: Reason if operation failed
            response_status: HTTP response status
            response_time_ms: Response time in milliseconds

        Returns:
            Created audit log entry or None if failed
        """
        try:
            # Extract user and request info
            user_info = AuditHelper.extract_user_from_request(request)
            request_info = AuditHelper.extract_request_info(request)

            # Auto-fill response metrics if available in request state
            if request and response_time_ms is None:
                response_time_ms = getattr(request.state, 'response_time_ms', None)
            if request and response_status is None:
                response_status = getattr(request.state, 'response_status', None)

            # Create audit service
            audit_service = AuditService(db)

            # Create audit log
            result = await audit_service.create_log(
                user_id=user_info['user_id'],
                username=user_info['username'],
                user_role=user_info['user_role'],
                action=action,
                resource_type=resource_type,
                resource_id=resource_id,
                details=details,
                ip_address=request_info['ip_address'],
                user_agent=request_info['user_agent'],
                session_id=request_info['session_id'],
                request_method=request_info['request_method'],
                request_path=request_info['request_path'],
                response_status=response_status,
                response_time_ms=response_time_ms,
                phi_accessed=phi_accessed,
                patient_id=patient_id,
                study_instance_uid=study_instance_uid,
                failure_reason=failure_reason,
                severity=severity
            )

            return result

        except Exception as e:
            logger.error(f"Failed to create audit log: {str(e)}")
            # Don't fail the main operation if audit logging fails
            return None

    @staticmethod
    async def log_order_created(
        db: Session,
        order_id: str,
        request: Optional[Request] = None,
        details: Optional[Dict[str, Any]] = None,
        patient_id: Optional[str] = None
    ):
        """Log order creation"""
        return await AuditHelper.log_crud_operation(
            db=db,
            action=AuditHelper.ACTION_CREATE,
            resource_type=AuditHelper.RESOURCE_ORDER,
            resource_id=order_id,
            request=request,
            details=details,
            phi_accessed=True if patient_id else False,
            patient_id=patient_id,
            response_status=201
        )

    @staticmethod
    async def log_order_updated(
        db: Session,
        order_id: str,
        request: Optional[Request] = None,
        details: Optional[Dict[str, Any]] = None,
        patient_id: Optional[str] = None
    ):
        """Log order update"""
        return await AuditHelper.log_crud_operation(
            db=db,
            action=AuditHelper.ACTION_UPDATE,
            resource_type=AuditHelper.RESOURCE_ORDER,
            resource_id=order_id,
            request=request,
            details=details,
            phi_accessed=True if patient_id else False,
            patient_id=patient_id,
            response_status=200
        )

    @staticmethod
    async def log_order_deleted(
        db: Session,
        order_id: str,
        request: Optional[Request] = None,
        details: Optional[Dict[str, Any]] = None
    ):
        """Log order deletion"""
        return await AuditHelper.log_crud_operation(
            db=db,
            action=AuditHelper.ACTION_DELETE,
            resource_type=AuditHelper.RESOURCE_ORDER,
            resource_id=order_id,
            request=request,
            details=details,
            response_status=200
        )

    @staticmethod
    async def log_worklist_created(
        db: Session,
        worklist_id: str,
        request: Optional[Request] = None,
        details: Optional[Dict[str, Any]] = None,
        patient_id: Optional[str] = None,
        study_instance_uid: Optional[str] = None
    ):
        """Log worklist item creation"""
        return await AuditHelper.log_crud_operation(
            db=db,
            action=AuditHelper.ACTION_CREATE,
            resource_type=AuditHelper.RESOURCE_WORKLIST,
            resource_id=worklist_id,
            request=request,
            details=details,
            phi_accessed=True if patient_id else False,
            patient_id=patient_id,
            study_instance_uid=study_instance_uid,
            response_status=201
        )

    @staticmethod
    async def log_worklist_updated(
        db: Session,
        worklist_id: str,
        request: Optional[Request] = None,
        details: Optional[Dict[str, Any]] = None,
        patient_id: Optional[str] = None,
        study_instance_uid: Optional[str] = None
    ):
        """Log worklist item update"""
        return await AuditHelper.log_crud_operation(
            db=db,
            action=AuditHelper.ACTION_UPDATE,
            resource_type=AuditHelper.RESOURCE_WORKLIST,
            resource_id=worklist_id,
            request=request,
            details=details,
            phi_accessed=True if patient_id else False,
            patient_id=patient_id,
            study_instance_uid=study_instance_uid,
            response_status=200
        )

    @staticmethod
    async def log_worklist_status_changed(
        db: Session,
        worklist_id: str,
        old_status: str,
        new_status: str,
        request: Optional[Request] = None,
        details: Optional[Dict[str, Any]] = None,
        patient_id: Optional[str] = None,
        study_instance_uid: Optional[str] = None
    ):
        """Log worklist status change"""
        status_details = details or {}
        status_details.update({
            'old_status': old_status,
            'new_status': new_status,
            'status_change': f"{old_status} → {new_status}"
        })

        return await AuditHelper.log_crud_operation(
            db=db,
            action=AuditHelper.ACTION_STATUS_CHANGE,
            resource_type=AuditHelper.RESOURCE_WORKLIST,
            resource_id=worklist_id,
            request=request,
            details=status_details,
            phi_accessed=True if patient_id else False,
            patient_id=patient_id,
            study_instance_uid=study_instance_uid,
            response_status=200
        )

    @staticmethod
    async def log_worklist_deleted(
        db: Session,
        worklist_id: str,
        request: Optional[Request] = None,
        details: Optional[Dict[str, Any]] = None
    ):
        """Log worklist item deletion (soft delete)"""
        return await AuditHelper.log_crud_operation(
            db=db,
            action=AuditHelper.ACTION_SOFT_DELETE,
            resource_type=AuditHelper.RESOURCE_WORKLIST,
            resource_id=worklist_id,
            request=request,
            details=details,
            response_status=200
        )

    @staticmethod
    async def log_study_accessed(
        db: Session,
        study_uid: str,
        request: Optional[Request] = None,
        details: Optional[Dict[str, Any]] = None,
        patient_id: Optional[str] = None
    ):
        """Log study access (PHI tracking for HIPAA)"""
        return await AuditHelper.log_crud_operation(
            db=db,
            action=AuditHelper.ACTION_READ,
            resource_type=AuditHelper.RESOURCE_STUDY,
            resource_id=study_uid,
            request=request,
            details=details,
            phi_accessed=True,  # Accessing study is always PHI access
            patient_id=patient_id,
            study_instance_uid=study_uid,
            response_status=200
        )

    @staticmethod
    async def log_study_created(
        db: Session,
        study_uid: str,
        request: Optional[Request] = None,
        details: Optional[Dict[str, Any]] = None,
        patient_id: Optional[str] = None
    ):
        """Log study creation"""
        return await AuditHelper.log_crud_operation(
            db=db,
            action=AuditHelper.ACTION_CREATE,
            resource_type=AuditHelper.RESOURCE_STUDY,
            resource_id=study_uid,
            request=request,
            details=details,
            phi_accessed=True if patient_id else False,
            patient_id=patient_id,
            study_instance_uid=study_uid,
            response_status=201
        )

    @staticmethod
    async def log_study_updated(
        db: Session,
        study_uid: str,
        request: Optional[Request] = None,
        details: Optional[Dict[str, Any]] = None,
        patient_id: Optional[str] = None
    ):
        """Log study update"""
        return await AuditHelper.log_crud_operation(
            db=db,
            action=AuditHelper.ACTION_UPDATE,
            resource_type=AuditHelper.RESOURCE_STUDY,
            resource_id=study_uid,
            request=request,
            details=details,
            phi_accessed=True if patient_id else False,
            patient_id=patient_id,
            study_instance_uid=study_uid,
            response_status=200
        )

    @staticmethod
    async def log_study_deleted(
        db: Session,
        study_uid: str,
        request: Optional[Request] = None,
        details: Optional[Dict[str, Any]] = None,
        patient_id: Optional[str] = None
    ):
        """Log study soft deletion"""
        return await AuditHelper.log_crud_operation(
            db=db,
            action=AuditHelper.ACTION_SOFT_DELETE,
            resource_type=AuditHelper.RESOURCE_STUDY,
            resource_id=study_uid,
            request=request,
            details=details,
            phi_accessed=True if patient_id else False,
            patient_id=patient_id,
            study_instance_uid=study_uid,
            response_status=200
        )

    @staticmethod
    async def log_study_archived(
        db: Session,
        study_uid: str,
        request: Optional[Request] = None,
        details: Optional[Dict[str, Any]] = None,
        patient_id: Optional[str] = None
    ):
        """Log study archiving"""
        return await AuditHelper.log_crud_operation(
            db=db,
            action="ARCHIVE",
            resource_type=AuditHelper.RESOURCE_STUDY,
            resource_id=study_uid,
            request=request,
            details=details,
            phi_accessed=True if patient_id else False,
            patient_id=patient_id,
            study_instance_uid=study_uid,
            response_status=200
        )

    @staticmethod
    async def log_dicom_uploaded(
        db: Session,
        dicom_file_id: str,
        request: Optional[Request] = None,
        details: Optional[Dict[str, Any]] = None,
        patient_id: Optional[str] = None,
        study_instance_uid: Optional[str] = None
    ):
        """Log DICOM file upload"""
        return await AuditHelper.log_crud_operation(
            db=db,
            action=AuditHelper.ACTION_UPLOAD,
            resource_type=AuditHelper.RESOURCE_DICOM_FILE,
            resource_id=dicom_file_id,
            request=request,
            details=details,
            phi_accessed=True if patient_id else False,
            patient_id=patient_id,
            study_instance_uid=study_instance_uid,
            response_status=201
        )

    @staticmethod
    async def log_dicom_accessed(
        db: Session,
        dicom_file_id: str,
        request: Optional[Request] = None,
        details: Optional[Dict[str, Any]] = None,
        patient_id: Optional[str] = None,
        study_instance_uid: Optional[str] = None
    ):
        """Log DICOM file access (PHI tracking)"""
        return await AuditHelper.log_crud_operation(
            db=db,
            action=AuditHelper.ACTION_READ,
            resource_type=AuditHelper.RESOURCE_DICOM_FILE,
            resource_id=dicom_file_id,
            request=request,
            details=details,
            phi_accessed=True,  # DICOM access is always PHI access
            patient_id=patient_id,
            study_instance_uid=study_instance_uid,
            response_status=200
        )
