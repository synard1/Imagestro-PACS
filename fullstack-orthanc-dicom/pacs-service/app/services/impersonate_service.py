"""
Impersonate Service
Manages user impersonation sessions for superadmin testing and troubleshooting
"""

import logging
import uuid as uuid_lib
from typing import Optional, Dict, Any, Tuple, List
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import and_, desc, text
from jose import jwt

from app.models.impersonate_session import ImpersonateSession
from app.models.audit_log import AuditLog
from app.services.audit_service import AuditService
from app.config import settings

logger = logging.getLogger(__name__)


class ImpersonateService:
    """Service for managing impersonate sessions"""
    
    # Default timeout in minutes
    DEFAULT_TIMEOUT_MINUTES = 30
    
    # Service account identifiers (cannot be impersonated)
    SERVICE_ACCOUNT_KEYWORDS = ['service', 'system', 'bot', 'automation']
    
    def __init__(self, db: Session):
        """
        Initialize impersonate service
        
        Args:
            db: Database session
        """
        self.db = db
    
    async def validate_target_user(
        self,
        target_user_id: str,
        user_data: Optional[Dict[str, Any]] = None
    ) -> Tuple[bool, Optional[str]]:
        """
        Validate if a user can be impersonated
        
        Args:
            target_user_id: Target user ID to validate
            user_data: Optional user data dict with fields: is_active, role, username
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        try:
            # Check if user_data is provided (for testing)
            if user_data:
                # Check if user is active
                if not user_data.get('is_active', False):
                    return False, "USER_INACTIVE"
                
                # Check if user is superadmin
                role = user_data.get('role', '').lower()
                if role == 'superadmin':
                    return False, "CANNOT_IMPERSONATE_SUPERADMIN"
                
                # Check if user is service account
                username = user_data.get('username', '').lower()
                for keyword in self.SERVICE_ACCOUNT_KEYWORDS:
                    if keyword in username:
                        return False, "CANNOT_IMPERSONATE_SERVICE_ACCOUNT"
                
                return True, None
            
            # If no user_data provided, we would query the database
            # For now, return validation needed
            return True, None
            
        except Exception as e:
            logger.error(f"Error validating target user: {str(e)}")
            return False, "VALIDATION_ERROR"

    def _get_target_user_details(self, user_id: str) -> Dict[str, Any]:
        """Get target user details (name, role, etc.)"""
        try:
            # Try to fetch from users table
            result = self.db.execute(
                text("SELECT full_name, username, role, email FROM users WHERE id = :uid"),
                {"uid": user_id}
            ).fetchone()
            
            if result:
                full_name = getattr(result, 'full_name', '')
                username = getattr(result, 'username', 'Unknown')
                
                return {
                    "username": username,
                    "full_name": full_name,
                    "name": full_name or username, # Display name preference
                    "role": getattr(result, 'role', 'USER'),
                    "email": getattr(result, 'email', '')
                }
        except Exception as e:
            logger.warning(f"Could not fetch user details from DB: {e}")
            
        # Fallback/Mock data if table doesn't exist or user not found
        return {
            "username": "target_user",
            "full_name": "Target User",
            "name": "Target User",
            "role": "CLERK",
            "email": "target@example.com"
        }

    def _get_real_user_permissions(self, user_id: str, role: str) -> List[str]:
        """Fetch actual permissions from DB (replicating auth-service logic)"""
        permissions = set()
        try:
            # 1. Get permissions from roles
            role_perms = self.db.execute(
                text("""
                    SELECT DISTINCT p.name
                    FROM user_roles ur
                    JOIN roles r ON ur.role_id = r.id
                    JOIN role_permissions rp ON r.id = rp.role_id
                    JOIN permissions p ON rp.permission_id = p.id
                    WHERE ur.user_id = :uid AND r.is_active = TRUE AND p.is_active = TRUE
                """),
                {"uid": user_id}
            ).fetchall()
            for p in role_perms:
                permissions.add(p[0])

            # 2. Get direct user permissions
            direct_perms = self.db.execute(
                text("""
                    SELECT DISTINCT p.name
                    FROM user_permissions up
                    JOIN permissions p ON up.permission_id = p.id
                    WHERE up.user_id = :uid AND p.is_active = TRUE
                """),
                {"uid": user_id}
            ).fetchall()
            for p in direct_perms:
                permissions.add(p[0])
                
            # If no permissions found in DB, fallback to role-based mock
            if not permissions:
                return self._get_permissions_for_role(role)
                
            return list(permissions)
            
        except Exception as e:
            logger.warning(f"Could not fetch real permissions: {e}. Using fallback.")
            return self._get_permissions_for_role(role)

    def _get_permissions_for_role(self, role: str) -> List[str]:
        """Get permissions for a role (Fallback/Mock implementation)"""
        if not role:
            return ["dashboard.view"]
            
        role = role.upper()
        if role == "CLERK":
            return [
                "dashboard.view", "order.view", "order.create", 
                "patient.view", "patient.create"
            ]
        elif role == "RADIOLOGIST":
            return [
                "dashboard.view", "order.view", "worklist.view", 
                "study.view", "report.view", "report.create"
            ]
        elif role in ["ADMIN", "SUPERADMIN"]:
            return ["*"]
        
        return ["dashboard.view"] # Default

    def _generate_token(self, user_id: str, user_details: Dict[str, Any], original_user_id: str) -> str:
        """Generate JWT token for impersonation (Matching auth-service structure)"""
        now = datetime.utcnow()
        expire = now + timedelta(minutes=settings.impersonate_timeout_minutes)
        
        # Try to get real permissions first
        permissions = self._get_real_user_permissions(user_id, user_details["role"])
        
        payload = {
            # Standard claims
            "sub": user_id,
            "iat": now,
            "exp": expire,
            
            # Auth-service compatible claims
            "user_id": user_id,
            "username": user_details.get("username"),
            "email": user_details.get("email"),
            "full_name": user_details.get("full_name"),
            "role": user_details["role"],
            "permissions": permissions,
            "type": "access",
            
            # Impersonate specific
            "impersonating": True,
            "originalUserId": original_user_id
        }
        
        return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    
    async def start_impersonate(
        self,
        original_user_id: str,
        target_user_id: str,
        reason: Optional[str] = None,
        timeout_minutes: Optional[int] = None,
        target_user_data: Optional[Dict[str, Any]] = None
    ) -> Tuple[bool, Optional[Dict[str, Any]], Optional[str]]:
        """
        Start an impersonate session
        
        Args:
            original_user_id: ID of the superadmin starting impersonate
            target_user_id: ID of the user to impersonate
            reason: Optional reason for impersonation
            timeout_minutes: Optional custom timeout (default: 30 minutes)
            target_user_data: Optional user data for validation
            
        Returns:
            Tuple of (success, session_data, error_message)
        """
        try:
            # Validate target user
            is_valid, error_msg = await self.validate_target_user(target_user_id, target_user_data)
            if not is_valid:
                logger.warning(f"Target user validation failed: {error_msg}")
                return False, None, error_msg
            
            # Check for existing active impersonate session
            existing_session = self.db.query(ImpersonateSession).filter(
                and_(
                    ImpersonateSession.original_user_id == uuid_lib.UUID(original_user_id),
                    ImpersonateSession.status == 'active',
                    ImpersonateSession.end_time.is_(None)
                )
            ).first()
            
            if existing_session:
                logger.warning(f"User {original_user_id} already has active impersonate session")
                return False, None, "NESTED_IMPERSONATE_NOT_ALLOWED"
            
            # Create new impersonate session
            session_id = uuid_lib.uuid4()
            timeout = timeout_minutes or settings.impersonate_timeout_minutes or self.DEFAULT_TIMEOUT_MINUTES
            
            new_session = ImpersonateSession(
                id=session_id,
                original_user_id=uuid_lib.UUID(original_user_id),
                target_user_id=uuid_lib.UUID(target_user_id),
                reason=reason or "No reason provided",
                status='active',
                timeout_minutes=timeout
            )
            
            self.db.add(new_session)
            self.db.commit()
            
            logger.info(
                f"Impersonate session started: {original_user_id} -> {target_user_id} "
                f"(session_id: {session_id}, timeout: {timeout}min)"
            )
            
            # Log to audit trail
            try:
                audit_service = AuditService(self.db)
                await audit_service.create_log(
                    user_id=original_user_id,
                    action="impersonate_start",
                    resource_type="user",
                    resource_id=target_user_id,
                    details={
                        "session_id": str(session_id),
                        "reason": reason or "No reason provided",
                        "timeout_minutes": timeout
                    },
                    severity="WARNING"
                )
            except Exception as e:
                logger.error(f"Failed to create audit log for impersonate start: {str(e)}")
            
            # Fetch target user details
            user_details = self._get_target_user_details(target_user_id)
            
            # Generate JWT token (which now uses real permissions)
            token = self._generate_token(target_user_id, user_details, original_user_id)
            
            # Get permissions for response
            permissions = self._get_real_user_permissions(target_user_id, user_details['role'])
            
            session_data = {
                'sessionId': str(session_id),
                'startTime': new_session.start_time.isoformat(),
                'timeoutMinutes': timeout,
                'reason': reason or "No reason provided",
                
                'originalUserId': original_user_id,
                
                'targetUserId': target_user_id,
                'targetUserName': user_details['name'],
                'targetUserRole': user_details['role'],
                'targetUserPermissions': permissions,
                'targetUserEmail': user_details['email'],
                
                'token': token
            }
            
            return True, session_data, None
            
        except ValueError as e:
            logger.error(f"Invalid UUID format: {str(e)}")
            return False, None, "INVALID_USER_ID"
        except Exception as e:
            logger.error(f"Error starting impersonate session: {str(e)}")
            self.db.rollback()
            return False, None, "SESSION_START_ERROR"
    
    async def stop_impersonate(
        self,
        original_user_id: str,
        session_id: Optional[str] = None
    ) -> Tuple[bool, Optional[Dict[str, Any]], Optional[str]]:
        """
        Stop an impersonate session
        
        Args:
            original_user_id: ID of the superadmin stopping impersonate
            session_id: Optional specific session ID to stop
            
        Returns:
            Tuple of (success, session_data, error_message)
        """
        try:
            # Find active impersonate session
            query = self.db.query(ImpersonateSession).filter(
                and_(
                    ImpersonateSession.original_user_id == uuid_lib.UUID(original_user_id),
                    ImpersonateSession.status == 'active',
                    ImpersonateSession.end_time.is_(None)
                )
            )
            
            if session_id:
                query = query.filter(ImpersonateSession.id == uuid_lib.UUID(session_id))
            
            session = query.first()
            
            if not session:
                logger.warning(f"No active impersonate session found for user {original_user_id}")
                return False, None, "NO_ACTIVE_SESSION"
            
            # Stop the session
            session.end_time = datetime.utcnow()
            session.status = 'completed'
            
            self.db.commit()
            
            duration_seconds = session.duration_seconds()
            logger.info(
                f"Impersonate session stopped: {original_user_id} -> {session.target_user_id} "
                f"(duration: {duration_seconds}s)"
            )
            
            # Log to audit trail
            try:
                audit_service = AuditService(self.db)
                await audit_service.create_log(
                    user_id=original_user_id,
                    action="impersonate_stop",
                    resource_type="user",
                    resource_id=str(session.target_user_id),
                    details={
                        "session_id": str(session.id),
                        "duration_seconds": duration_seconds,
                        "reason": session.reason
                    },
                    severity="WARNING"
                )
            except Exception as e:
                logger.error(f"Failed to create audit log for impersonate stop: {str(e)}")
            
            session_data = {
                'sessionId': str(session.id),
                'originalUserId': str(session.original_user_id),
                'targetUserId': str(session.target_user_id),
                'startTime': session.start_time.isoformat(),
                'endTime': session.end_time.isoformat(),
                'duration': duration_seconds,
                'reason': session.reason,
                'status': session.status
            }
            
            return True, session_data, None
            
        except ValueError as e:
            logger.error(f"Invalid UUID format: {str(e)}")
            return False, None, "INVALID_USER_ID"
        except Exception as e:
            logger.error(f"Error stopping impersonate session: {str(e)}")
            self.db.rollback()
            return False, None, "SESSION_STOP_ERROR"
    
    async def get_active_session(
        self,
        original_user_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get active impersonate session for a user
        
        Args:
            original_user_id: ID of the superadmin
            
        Returns:
            Session data or None if no active session
        """
        try:
            session = self.db.query(ImpersonateSession).filter(
                and_(
                    ImpersonateSession.original_user_id == uuid_lib.UUID(original_user_id),
                    ImpersonateSession.status == 'active',
                    ImpersonateSession.end_time.is_(None)
                )
            ).first()
            
            if not session:
                return None
            
            # Calculate remaining time
            elapsed = (datetime.utcnow() - session.start_time).total_seconds() / 60
            remaining = session.timeout_minutes - elapsed
            
            return {
                'sessionId': str(session.id),
                'originalUserId': str(session.original_user_id),
                'targetUserId': str(session.target_user_id),
                'startTime': session.start_time.isoformat(),
                'timeoutMinutes': session.timeout_minutes,
                'remainingMinutes': max(0, remaining),
                'reason': session.reason,
                'status': session.status
            }
            
        except Exception as e:
            logger.error(f"Error getting active session: {str(e)}")
            return None
    
    async def get_session_history(
        self,
        original_user_id: str,
        limit: int = 50,
        offset: int = 0,
        filters: Optional[Dict[str, Any]] = None
    ) -> Tuple[List[Dict[str, Any]], int]:
        """
        Get impersonate session history for a user
        
        Args:
            original_user_id: ID of the superadmin
            limit: Maximum results
            offset: Offset for pagination
            filters: Optional filters (target_user_id, status, date_range)
            
        Returns:
            Tuple of (sessions, total_count)
        """
        try:
            query = self.db.query(ImpersonateSession).filter(
                ImpersonateSession.original_user_id == uuid_lib.UUID(original_user_id)
            )
            
            # Apply filters
            if filters:
                if filters.get('target_user_id'):
                    query = query.filter(
                        ImpersonateSession.target_user_id == uuid_lib.UUID(filters['target_user_id'])
                    )
                
                if filters.get('status'):
                    query = query.filter(ImpersonateSession.status == filters['status'])
                
                if filters.get('start_date'):
                    query = query.filter(ImpersonateSession.start_time >= filters['start_date'])
                
                if filters.get('end_date'):
                    query = query.filter(ImpersonateSession.start_time <= filters['end_date'])
            
            # Get total count
            total_count = query.count()
            
            # Get paginated results
            sessions = query.order_by(desc(ImpersonateSession.start_time)).limit(limit).offset(offset).all()
            
            session_list = [
                {
                    'sessionId': str(s.id),
                    'originalUserId': str(s.original_user_id),
                    'targetUserId': str(s.target_user_id),
                    'startTime': s.start_time.isoformat(),
                    'endTime': s.end_time.isoformat() if s.end_time else None,
                    'duration': s.duration_seconds(),
                    'reason': s.reason,
                    'status': s.status,
                    'createdAt': s.created_at.isoformat()
                }
                for s in sessions
            ]
            
            return session_list, total_count
            
        except Exception as e:
            logger.error(f"Error getting session history: {str(e)}")
            return [], 0
    
    async def handle_session_timeout(
        self,
        session_id: str
    ) -> Tuple[bool, Optional[str]]:
        """
        Handle session timeout
        
        Args:
            session_id: Session ID to timeout
            
        Returns:
            Tuple of (success, error_message)
        """
        try:
            session = self.db.query(ImpersonateSession).filter(
                ImpersonateSession.id == uuid_lib.UUID(session_id)
            ).first()
            
            if not session:
                return False, "SESSION_NOT_FOUND"
            
            if session.status != 'active':
                return False, "SESSION_NOT_ACTIVE"
            
            # Mark as timeout
            session.end_time = datetime.utcnow()
            session.status = 'timeout'
            
            self.db.commit()
            
            logger.info(f"Impersonate session timed out: {session_id}")
            
            # Log to audit trail
            try:
                audit_service = AuditService(self.db)
                await audit_service.create_log(
                    user_id=str(session.original_user_id),
                    action="impersonate_timeout",
                    resource_type="user",
                    resource_id=str(session.target_user_id),
                    details={
                        "session_id": str(session.id),
                        "reason": "Session timeout"
                    },
                    severity="WARNING"
                )
            except Exception as e:
                logger.error(f"Failed to create audit log for impersonate timeout: {str(e)}")
            
            return True, None
            
        except Exception as e:
            logger.error(f"Error handling session timeout: {str(e)}")
            self.db.rollback()
            return False, "TIMEOUT_ERROR"
    
    async def cleanup_expired_sessions(self) -> int:
        """
        Clean up expired impersonate sessions
        
        Returns:
            Number of sessions cleaned up
        """
        try:
            now = datetime.utcnow()
            
            # Find all active sessions that have exceeded their timeout
            expired_sessions = self.db.query(ImpersonateSession).filter(
                and_(
                    ImpersonateSession.status == 'active',
                    ImpersonateSession.end_time.is_(None),
                    ImpersonateSession.start_time + timedelta(minutes=ImpersonateSession.timeout_minutes) <= now
                )
            ).all()
            
            count = 0
            for session in expired_sessions:
                session.end_time = now
                session.status = 'timeout'
                count += 1
            
            if count > 0:
                self.db.commit()
                logger.info(f"Cleaned up {count} expired impersonate sessions")
            
            return count
            
        except Exception as e:
            logger.error(f"Error cleaning up expired sessions: {str(e)}")
            self.db.rollback()
            return 0
