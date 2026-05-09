"""
Authentication Middleware
JWT token validation and user extraction
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from typing import Optional, Dict, Any
import logging

from app.config import settings

logger = logging.getLogger(__name__)

security = HTTPBearer(auto_error=False)


def decode_token(token: str) -> Dict[str, Any]:
    """Decode and validate JWT token"""
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm]
        )
        return payload
    except JWTError as e:
        logger.error(f"JWT decode error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Dict[str, Any]:
    """
    Get current user from JWT token
    Returns user dict with: user_id, username, role, permissions

    In development mode with REQUIRE_ROLE_CHECK=false, returns a mock user
    """
    # Development/testing mode - allow bypass
    if not settings.require_role_check:
        logger.warning("Auth bypassed - REQUIRE_ROLE_CHECK is disabled (development mode)")
        return {
            "user_id": "test_user",
            "username": "test_user",
            "role": "superadmin",
            "permissions": ["all"],
        }

    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No credentials provided",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    payload = decode_token(token)
    logger.info(f"Decoded token payload: {payload}")

    # Extract user information
    user = {
        "user_id": payload.get("user_id") or payload.get("sub"),
        "username": payload.get("username"),
        "full_name": payload.get("full_name"),
        "role": payload.get("role"),
        "tenant_id": payload.get("tenant_id"),
        "permissions": payload.get("permissions", []),
    }

    if not user["user_id"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload"
        )

    return user


def require_roles(allowed_roles: list):
    """
    Dependency to require specific roles
    Usage: user = Depends(require_roles(["superadmin", "developer"]))
    """
    async def role_checker(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
        user_role = user.get("role", "").lower()
        
        if not settings.require_role_check:
            # Role check disabled (for testing)
            return user
        
        if user_role not in [role.lower() for role in allowed_roles]:
            logger.warning(f"Access denied for user {user['username']} with role {user_role}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "status": "error",
                    "message": "Insufficient permissions to access PACS features",
                    "required_roles": allowed_roles,
                    "your_role": user_role,
                    "hint": "Only SUPERADMIN or DEVELOPER can access PACS features"
                }
            )
        
        return user
    
    return role_checker
