"""
RBAC Constants - Protected Roles and Permissions

Defines which roles and permissions are protected (reserved) and cannot be
modified by regular admin users. Only SUPERADMIN and DEVELOPER can manage these.

This supports multi-tenant architecture where each tenant has an ADMIN,
but system-level roles/permissions are protected.
"""

from typing import Set, Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)

# ============================================
# Reserved Role Names
# These roles cannot be created, edited, or deleted by regular admins
# ============================================
RESERVED_ROLE_NAMES: Set[str] = {
    'SUPERADMIN',
    'DEVELOPER',
}

# Extended reserved roles (includes ADMIN_SECURITY)
EXTENDED_RESERVED_ROLE_NAMES: Set[str] = {
    'SUPERADMIN',
    'DEVELOPER',
    'ADMIN_SECURITY',
}

# High-privilege roles that have special access
HIGH_PRIV_ROLES: Set[str] = {
    'SUPERADMIN',
    'DEVELOPER',
    'ADMIN_SECURITY',
}

# ============================================
# Reserved Permission Names
# These permissions cannot be created, edited, or deleted by regular admins
# ============================================
RESERVED_PERMISSIONS: Set[str] = {
    '*',                    # Global wildcard - full access
    'rbac:manage',          # Full RBAC management
    'rbac:view',            # View all RBAC data
    'rbac:custom-manage',   # Custom RBAC management
    'setting:dev',          # Developer settings
    'system:admin',         # System administration
    'system:logs',          # System logs access
    'system:config',        # System configuration
}

# Permissions that should be hidden from regular admins
HIDDEN_PERMISSIONS: Set[str] = {
    '*',
    'rbac:manage',
    'setting:dev',
}


# ============================================
# Helper Functions
# ============================================

def is_reserved_role(role_name: str) -> bool:
    """
    Check if a role name is reserved (protected)
    
    Args:
        role_name: Role name to check
        
    Returns:
        True if role is reserved
    """
    if not role_name:
        return False
    return role_name.upper() in RESERVED_ROLE_NAMES


def is_extended_reserved_role(role_name: str) -> bool:
    """
    Check if a role name is in extended reserved list
    
    Args:
        role_name: Role name to check
        
    Returns:
        True if role is in extended reserved list
    """
    if not role_name:
        return False
    return role_name.upper() in EXTENDED_RESERVED_ROLE_NAMES


def is_high_priv_role(role_name: str) -> bool:
    """
    Check if a role is high-privilege
    
    Args:
        role_name: Role name to check
        
    Returns:
        True if role is high-privilege
    """
    if not role_name:
        return False
    return role_name.upper() in HIGH_PRIV_ROLES


def is_reserved_permission(permission_name: str) -> bool:
    """
    Check if a permission name is reserved (protected)
    
    Args:
        permission_name: Permission name to check
        
    Returns:
        True if permission is reserved
    """
    if not permission_name:
        return False
    return permission_name in RESERVED_PERMISSIONS


def is_hidden_permission(permission_name: str) -> bool:
    """
    Check if a permission should be hidden from regular admins
    
    Args:
        permission_name: Permission name to check
        
    Returns:
        True if permission should be hidden
    """
    if not permission_name:
        return False
    return permission_name in HIDDEN_PERMISSIONS


def is_high_priv_user(user: Dict[str, Any]) -> bool:
    """
    Check if user is a high-privilege user (SUPERADMIN/DEVELOPER)
    
    Args:
        user: User dict with 'role' and 'permissions' keys
        
    Returns:
        True if user is high-privilege
    """
    if not user:
        return False
    
    # Check role
    role = (user.get('role') or '').upper()
    if role in ('SUPERADMIN', 'DEVELOPER'):
        return True
    
    # Check permissions
    permissions = user.get('permissions', [])
    if isinstance(permissions, list):
        perm_set = set(permissions)
        
        # Has global wildcard
        if '*' in perm_set:
            return True
        
        # Has rbac:manage
        if 'rbac:manage' in perm_set or 'rbac.manage' in perm_set:
            return True
    
    return False


def can_manage_role(user: Dict[str, Any], target_role_name: str) -> bool:
    """
    Check if user can manage a specific role
    
    Args:
        user: Current user dict
        target_role_name: Name of role to manage
        
    Returns:
        True if user can manage the role
    """
    if not user or not target_role_name:
        return False
    
    # High-priv users can manage all roles
    if is_high_priv_user(user):
        return True
    
    # Regular admins cannot manage reserved roles
    if is_extended_reserved_role(target_role_name):
        return False
    
    return True


def can_manage_permission(user: Dict[str, Any], target_permission_name: str) -> bool:
    """
    Check if user can manage a specific permission
    
    Args:
        user: Current user dict
        target_permission_name: Name of permission to manage
        
    Returns:
        True if user can manage the permission
    """
    if not user or not target_permission_name:
        return False
    
    # High-priv users can manage all permissions
    if is_high_priv_user(user):
        return True
    
    # Regular admins cannot manage reserved permissions
    if is_reserved_permission(target_permission_name):
        return False
    
    return True


def filter_roles_for_user(
    roles: list, 
    user: Dict[str, Any], 
    hide_reserved: bool = False
) -> list:
    """
    Filter roles based on user's privilege level
    
    Args:
        roles: List of role dicts
        user: Current user dict
        hide_reserved: If True, hide reserved roles for non-high-priv users
        
    Returns:
        Filtered list of roles
    """
    if not roles:
        return []
    
    # High-priv users see all roles
    if is_high_priv_user(user):
        return roles
    
    # Regular admins
    if hide_reserved:
        return [r for r in roles if not is_extended_reserved_role(r.get('name', ''))]
    
    return roles


def filter_permissions_for_user(
    permissions: list, 
    user: Dict[str, Any], 
    hide_reserved: bool = False
) -> list:
    """
    Filter permissions based on user's privilege level
    
    Args:
        permissions: List of permission dicts
        user: Current user dict
        hide_reserved: If True, hide reserved permissions for non-high-priv users
        
    Returns:
        Filtered list of permissions
    """
    if not permissions:
        return []
    
    # High-priv users see all permissions
    if is_high_priv_user(user):
        return permissions
    
    # Regular admins
    if hide_reserved:
        return [
            p for p in permissions 
            if not is_reserved_permission(p.get('name', '')) 
            and not is_hidden_permission(p.get('name', ''))
        ]
    
    return permissions


def get_role_protection_info(role: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    """
    Get protection info for a role
    
    Args:
        role: Role dict
        user: Current user dict
        
    Returns:
        Dict with isProtected, canEdit, canDelete, reason
    """
    if not role:
        return {
            'isProtected': False,
            'canEdit': False,
            'canDelete': False,
            'reason': ''
        }
    
    role_name = role.get('name', '')
    is_high_priv = is_high_priv_user(user)
    is_reserved = is_extended_reserved_role(role_name)
    
    if is_reserved:
        if is_high_priv:
            return {
                'isProtected': True,
                'canEdit': True,
                'canDelete': False,  # Even high-priv cannot delete core roles
                'reason': 'System role - protected from deletion'
            }
        return {
            'isProtected': True,
            'canEdit': False,
            'canDelete': False,
            'reason': 'System role - only SUPERADMIN/DEVELOPER can modify'
        }
    
    return {
        'isProtected': False,
        'canEdit': True,
        'canDelete': True,
        'reason': ''
    }


def get_permission_protection_info(permission: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    """
    Get protection info for a permission
    
    Args:
        permission: Permission dict
        user: Current user dict
        
    Returns:
        Dict with isProtected, canEdit, canDelete, reason
    """
    if not permission:
        return {
            'isProtected': False,
            'canEdit': False,
            'canDelete': False,
            'reason': ''
        }
    
    perm_name = permission.get('name', '')
    is_high_priv = is_high_priv_user(user)
    is_reserved = is_reserved_permission(perm_name)
    
    if is_reserved:
        if is_high_priv:
            return {
                'isProtected': True,
                'canEdit': True,
                'canDelete': False,  # Even high-priv cannot delete core permissions
                'reason': 'System permission - protected from deletion'
            }
        return {
            'isProtected': True,
            'canEdit': False,
            'canDelete': False,
            'reason': 'System permission - only SUPERADMIN/DEVELOPER can modify'
        }
    
    return {
        'isProtected': False,
        'canEdit': True,
        'canDelete': True,
        'reason': ''
    }
