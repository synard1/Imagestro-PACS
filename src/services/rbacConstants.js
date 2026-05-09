/**
 * RBAC Constants - Protected Roles and Permissions
 * 
 * Defines which roles and permissions are protected (reserved) and cannot be
 * modified by regular admin users. Only SUPERADMIN and DEVELOPER can manage these.
 * 
 * This supports multi-tenant architecture where each tenant has an ADMIN,
 * but system-level roles/permissions are protected.
 */

// ============================================
// Reserved Role Names
// These roles cannot be created, edited, or deleted by regular admins
// ============================================
export const RESERVED_ROLE_NAMES = new Set([
  'SUPERADMIN',
  'DEVELOPER',
]);

// Extended reserved roles (includes ADMIN_SECURITY)
export const EXTENDED_RESERVED_ROLE_NAMES = new Set([
  'SUPERADMIN',
  'DEVELOPER', 
  'ADMIN_SECURITY',
]);

// High-privilege roles that have special access
export const HIGH_PRIV_ROLES = new Set([
  'SUPERADMIN',
  'DEVELOPER',
  'ADMIN_SECURITY',
]);

// ============================================
// Reserved Permission Names
// These permissions cannot be created, edited, or deleted by regular admins
// ============================================
export const RESERVED_PERMISSIONS = new Set([
  '*',                    // Global wildcard - full access
  'rbac:manage',          // Full RBAC management
  'rbac:view',            // View all RBAC data
  'rbac:custom-manage',   // Custom RBAC management
  'setting:dev',          // Developer settings
  'system:admin',         // System administration
  'system:logs',          // System logs access
  'system:config',        // System configuration
]);

// Permissions that should be hidden from regular admins
export const HIDDEN_PERMISSIONS = new Set([
  '*',
  'rbac:manage',
  'setting:dev',
]);

// ============================================
// Helper Functions
// ============================================

/**
 * Check if a role name is reserved (protected)
 * @param {string} roleName - Role name to check
 * @returns {boolean} True if role is reserved
 */
export function isReservedRole(roleName) {
  if (!roleName) return false;
  return RESERVED_ROLE_NAMES.has(roleName.toUpperCase());
}

/**
 * Check if a role name is in extended reserved list
 * @param {string} roleName - Role name to check
 * @returns {boolean} True if role is in extended reserved list
 */
export function isExtendedReservedRole(roleName) {
  if (!roleName) return false;
  return EXTENDED_RESERVED_ROLE_NAMES.has(roleName.toUpperCase());
}

/**
 * Check if a role is high-privilege
 * @param {string} roleName - Role name to check
 * @returns {boolean} True if role is high-privilege
 */
export function isHighPrivRole(roleName) {
  if (!roleName) return false;
  return HIGH_PRIV_ROLES.has(roleName.toUpperCase());
}

/**
 * Check if a permission name is reserved (protected)
 * @param {string} permissionName - Permission name to check
 * @returns {boolean} True if permission is reserved
 */
export function isReservedPermission(permissionName) {
  if (!permissionName) return false;
  return RESERVED_PERMISSIONS.has(permissionName);
}

/**
 * Check if a permission should be hidden from regular admins
 * @param {string} permissionName - Permission name to check
 * @returns {boolean} True if permission should be hidden
 */
export function isHiddenPermission(permissionName) {
  if (!permissionName) return false;
  return HIDDEN_PERMISSIONS.has(permissionName);
}

/**
 * Check if current user is a high-privilege user (SUPERADMIN/DEVELOPER)
 * @param {Object} user - User object with role and permissions
 * @returns {boolean} True if user is high-privilege
 */
export function isHighPrivUser(user) {
  if (!user) return false;
  
  // Check role
  const role = (user.role || '').toUpperCase();
  if (role === 'SUPERADMIN' || role === 'DEVELOPER') {
    return true;
  }
  
  // Check permissions
  const permissions = Array.isArray(user.permissions) ? user.permissions : [];
  const permSet = new Set(permissions.map(p => typeof p === 'string' ? p : p.name));
  
  // Has global wildcard
  if (permSet.has('*')) return true;
  
  // Has rbac:manage
  if (permSet.has('rbac:manage') || permSet.has('rbac.manage')) return true;
  
  return false;
}

/**
 * Check if user can manage a specific role
 * @param {Object} user - Current user
 * @param {Object} targetRole - Role to manage
 * @returns {boolean} True if user can manage the role
 */
export function canManageRole(user, targetRole) {
  if (!user || !targetRole) return false;
  
  // High-priv users can manage all roles
  if (isHighPrivUser(user)) return true;
  
  // Regular admins cannot manage reserved roles
  if (isExtendedReservedRole(targetRole.name)) return false;
  
  return true;
}

/**
 * Check if user can manage a specific permission
 * @param {Object} user - Current user
 * @param {Object} targetPermission - Permission to manage
 * @returns {boolean} True if user can manage the permission
 */
export function canManagePermission(user, targetPermission) {
  if (!user || !targetPermission) return false;
  
  // High-priv users can manage all permissions
  if (isHighPrivUser(user)) return true;
  
  // Regular admins cannot manage reserved permissions
  if (isReservedPermission(targetPermission.name)) return false;
  
  return true;
}

/**
 * Filter roles based on user's privilege level
 * @param {Array} roles - Array of roles
 * @param {Object} user - Current user
 * @param {Object} options - Filter options
 * @param {boolean} options.hideReserved - Hide reserved roles for non-high-priv users
 * @returns {Array} Filtered roles
 */
export function filterRolesForUser(roles, user, options = { hideReserved: false }) {
  if (!Array.isArray(roles)) return [];
  
  // High-priv users see all roles
  if (isHighPrivUser(user)) return roles;
  
  // Regular admins
  if (options.hideReserved) {
    // Hide reserved roles completely
    return roles.filter(role => !isExtendedReservedRole(role.name));
  }
  
  // Show all but mark as protected
  return roles;
}

/**
 * Filter permissions based on user's privilege level
 * @param {Array} permissions - Array of permissions
 * @param {Object} user - Current user
 * @param {Object} options - Filter options
 * @param {boolean} options.hideReserved - Hide reserved permissions for non-high-priv users
 * @returns {Array} Filtered permissions
 */
export function filterPermissionsForUser(permissions, user, options = { hideReserved: false }) {
  if (!Array.isArray(permissions)) return [];
  
  // High-priv users see all permissions
  if (isHighPrivUser(user)) return permissions;
  
  // Regular admins
  if (options.hideReserved) {
    // Hide reserved and hidden permissions
    return permissions.filter(perm => 
      !isReservedPermission(perm.name) && !isHiddenPermission(perm.name)
    );
  }
  
  // Show all but mark as protected
  return permissions;
}

/**
 * Get protection info for a role
 * Uses backend data (protected flag) if available,
 * otherwise falls back to checking reserved roles list
 * @param {Object} role - Role object
 * @param {Object} user - Current user
 * @returns {Object} Protection info { isProtected, canEdit, canDelete, reason }
 */
export function getRoleProtectionInfo(role, user) {
  if (!role) return { isProtected: false, canEdit: false, canDelete: false, reason: '' };
  
  const isHighPriv = isHighPrivUser(user);
  
  // Use backend data if available (protected flag from API)
  const isProtected = role.protected === true;
  
  // If backend says it's protected
  if (isProtected) {
    if (isHighPriv) {
      return {
        isProtected: true,
        canEdit: true,
        canDelete: false, // Even high-priv cannot delete protected roles
        reason: 'Protected role - only SUPERADMIN/DEVELOPER can modify',
      };
    }
    return {
      isProtected: true,
      canEdit: false,
      canDelete: false,
      reason: 'Protected role - only SUPERADMIN/DEVELOPER can modify',
    };
  }
  
  // Fallback to checking reserved roles list (for backward compatibility)
  const isReserved = isExtendedReservedRole(role.name);
  
  if (isReserved) {
    if (isHighPriv) {
      return {
        isProtected: true,
        canEdit: true,
        canDelete: false, // Even high-priv cannot delete core roles
        reason: 'System role - protected from deletion',
      };
    }
    return {
      isProtected: true,
      canEdit: false,
      canDelete: false,
      reason: 'System role - only SUPERADMIN/DEVELOPER can modify',
    };
  }
  
  return {
    isProtected: false,
    canEdit: true,
    canDelete: true,
    reason: '',
  };
}

/**
 * Get protection info for a permission
 * Uses backend data (protected, hidden_from_tenant_admin flags) if available,
 * otherwise falls back to checking reserved permissions list
 * @param {Object} permission - Permission object
 * @param {Object} user - Current user
 * @returns {Object} Protection info { isProtected, canEdit, canDelete, reason }
 */
export function getPermissionProtectionInfo(permission, user) {
  if (!permission) return { isProtected: false, canEdit: false, canDelete: false, reason: '' };
  
  const isHighPriv = isHighPrivUser(user);
  
  // Use backend data if available (protected flag from API)
  const isProtected = permission.protected === true;
  const isHidden = permission.hidden_from_tenant_admin === true;
  
  // If backend says it's protected
  if (isProtected) {
    if (isHighPriv) {
      return {
        isProtected: true,
        canEdit: true,
        canDelete: false, // Even high-priv cannot delete protected permissions
        reason: 'Protected permission - only SUPERADMIN/DEVELOPER can modify',
      };
    }
    return {
      isProtected: true,
      canEdit: false,
      canDelete: false,
      reason: 'Protected permission - only SUPERADMIN/DEVELOPER can modify',
    };
  }
  
  // Fallback to checking reserved permissions list (for backward compatibility)
  const isReserved = isReservedPermission(permission.name);
  
  if (isReserved) {
    if (isHighPriv) {
      return {
        isProtected: true,
        canEdit: true,
        canDelete: false,
        reason: 'System permission - protected from deletion',
      };
    }
    return {
      isProtected: true,
      canEdit: false,
      canDelete: false,
      reason: 'System permission - only SUPERADMIN/DEVELOPER can modify',
    };
  }
  
  return {
    isProtected: false,
    canEdit: true,
    canDelete: true,
    reason: '',
  };
}

export default {
  // Constants
  RESERVED_ROLE_NAMES,
  EXTENDED_RESERVED_ROLE_NAMES,
  HIGH_PRIV_ROLES,
  RESERVED_PERMISSIONS,
  HIDDEN_PERMISSIONS,
  
  // Check functions
  isReservedRole,
  isExtendedReservedRole,
  isHighPrivRole,
  isReservedPermission,
  isHiddenPermission,
  isHighPrivUser,
  
  // Permission check functions
  canManageRole,
  canManagePermission,
  
  // Filter functions
  filterRolesForUser,
  filterPermissionsForUser,
  
  // Info functions
  getRoleProtectionInfo,
  getPermissionProtectionInfo,
};
