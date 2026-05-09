import jwt
from flask import request, jsonify
from functools import wraps
import logging
from ..config import JWT_SECRET, JWT_ALGORITHM

logger = logging.getLogger(__name__)

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
    if '*' in user_permissions:
        return True

    for required in required_permissions:
        # Exact match
        if required in user_permissions:
            return True

        # Category wildcard: required 'patient:search' match 'patient:*'
        if ':' in required:
            category = required.split(':', 1)[0]
            if f"{category}:*" in user_permissions:
                return True

    return False

def require_auth(required_permissions=[]):
    """Decorator to require authentication and check permissions (with wildcard support)"""
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
            if required_permissions and not check_permission(user.get('permissions', []), required_permissions):
                return jsonify({
                    "status": "error",
                    "message": "Permission denied",
                    "required": required_permissions,
                    "user_permissions": user.get('permissions', [])
                }), 403
            
            # Attach user info to request
            request.current_user = user
            return f(*args, **kwargs)
            
        return decorated_function
    return decorator

def is_high_privilege_user(user):
    """
    Check if user is high-privilege (SUPERADMIN or DEVELOPER).
    """
    if not user:
        return False

    permissions = user.get('permissions', [])
    role = user.get('role', '').upper()

    if '*' in permissions:
        return True
    if 'rbac:manage' in permissions:
        return True
    if role in ('SUPERADMIN', 'DEVELOPER'):
        return True

    return False

def is_dev_user(user: dict) -> bool:
    """
    Determine if user is allowed to manage sensitive (developer-only) settings.
    """
    if not user:
        return False

    perms = (user.get('permissions') or [])
    if '*' in perms:
        return True
    if 'setting:dev' in perms:
        return True
    if 'rbac:manage' in perms:
        return True

    return False
