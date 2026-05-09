"""
Role-Based Access Control Middleware
Standardized permission checking for API endpoints
"""

from fastapi import Depends, HTTPException, status
from typing import Dict, Any, List, Optional
import logging

from app.middleware.auth import get_current_user
from app.middleware.rbac_constants import (
    is_high_priv_user,
    can_manage_role,
    can_manage_permission
)

logger = logging.getLogger(__name__)

def require_permission(permission: str):
    """
    Dependency to require a specific permission.
    Supports both 'resource:action' and 'resource.action' formats.
    """
    async def permission_checker(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
        # High-privilege users (SUPERADMIN/DEVELOPER) bypass all permission checks
        if is_high_priv_user(user):
            return user
            
        user_permissions = user.get("permissions", [])
        
        # Normalize permission string for check (convert resource.action to resource:action)
        normalized_permission = permission.replace('.', ':')
        user_perms_set = {p.replace('.', ':') for p in user_permissions}
        
        # Check for exact match or wildcard
        if normalized_permission in user_perms_set or '*' in user_perms_set:
            return user
            
        # Check for resource-level wildcard (e.g., 'order:*')
        if ':' in normalized_permission:
            resource = normalized_permission.split(':')[0]
            if f"{resource}:*" in user_perms_set:
                return user
            
        logger.warning(f"Permission denied: user {user.get('username')} lacks {permission}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Insufficient permissions. Required: {permission}"
        )
        
    return permission_checker

def check_role_management_permission(user: Dict[str, Any], role_name: str):
    """
    Check if user is allowed to manage (create/edit/delete) a role.
    Raises HTTPException if not allowed.
    """
    if not can_manage_role(user, role_name):
        logger.warning(f"Management denied: user {user.get('username')} cannot manage protected role {role_name}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Cannot modify protected role '{role_name}'. Only SUPERADMIN/DEVELOPER can manage system roles."
        )

def check_permission_management_permission(user: Dict[str, Any], permission_name: str):
    """
    Check if user is allowed to manage a permission.
    Raises HTTPException if not allowed.
    """
    if not can_manage_permission(user, permission_name):
        logger.warning(f"Management denied: user {user.get('username')} cannot manage protected permission {permission_name}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Cannot modify protected permission '{permission_name}'. Only SUPERADMIN/DEVELOPER can manage system permissions."
        )

def log_access(user: Dict[str, Any], action: str, resource: str):
    """Log user access for audit"""
    logger.info(
        f"RBAC Access: user={user.get('username')}, role={user.get('role')}, "
        f"action={action}, resource={resource}"
    )
