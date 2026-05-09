/**
 * Permission Enforcement During Impersonate
 * 
 * Handles permission enforcement when a superadmin is impersonating another user.
 * Ensures that the target user's permissions are applied during the impersonate session.
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { logger } from '../utils/logger';
import { getCurrentUser } from './rbac';
import { getImpersonateSession } from './impersonate-storage';

/**
 * Check if a feature should be hidden/disabled during impersonate
 * @param {string} featureName - Name of the feature to check
 * @returns {boolean} - True if feature should be hidden
 */
export function shouldHideFeatureDuringImpersonate(featureName) {
  try {
    const session = getImpersonateSession();
    if (!session) {
      return false;
    }

    const targetPermissions = session.targetUserPermissions || [];
    
    // Map feature names to required permissions
    const featurePermissionMap = {
      'user_management': 'users:manage',
      'role_management': 'roles:manage',
      'settings': 'settings:manage',
      'audit_logs': 'audit:view',
      'system_config': 'system:configure',
      'reports': 'reports:view',
      'worklist': 'worklist:view',
      'studies': 'studies:view',
      'orders': 'orders:view',
    };

    const requiredPermission = featurePermissionMap[featureName];
    if (!requiredPermission) {
      // If feature is not in map, don't hide it
      return false;
    }

    // Check if target user has the required permission
    const hasPermission = targetPermissions.some(perm => {
      // Handle wildcard permissions
      if (perm === '*' || perm === 'admin.*') {
        return true;
      }
      
      // Exact match
      if (perm === requiredPermission) {
        return true;
      }

      // Wildcard match (e.g., 'users:*' matches 'users:manage')
      const permParts = perm.split(':');
      const requiredParts = requiredPermission.split(':');
      
      if (permParts.length === 2 && requiredParts.length === 2) {
        if (permParts[0] === requiredParts[0] && permParts[1] === '*') {
          return true;
        }
      }

      return false;
    });

    return !hasPermission;
  } catch (error) {
    logger.error('[IMPERSONATE_PERMISSION] Error checking feature permission:', error);
    return false;
  }
}

/**
 * Filter data based on target user permissions
 * @param {Array} data - Array of data items to filter
 * @param {string} resourceType - Type of resource (e.g., 'studies', 'orders')
 * @returns {Array} - Filtered data
 */
export function filterDataByTargetUserPermissions(data, resourceType) {
  try {
    const session = getImpersonateSession();
    if (!session) {
      return data;
    }

    const targetPermissions = session.targetUserPermissions || [];
    
    // Check if target user has permission to view this resource type
    const viewPermission = `${resourceType}:view`;
    const hasViewPermission = targetPermissions.some(perm => {
      if (perm === '*' || perm === 'admin.*') {
        return true;
      }
      if (perm === viewPermission) {
        return true;
      }
      
      const permParts = perm.split(':');
      if (permParts.length === 2 && permParts[0] === resourceType && permParts[1] === '*') {
        return true;
      }

      return false;
    });

    if (!hasViewPermission) {
      logger.warn(`[IMPERSONATE_PERMISSION] Target user does not have permission to view ${resourceType}`);
      return [];
    }

    // Filter by facility/department if applicable
    if (session.targetUserFacility) {
      return data.filter(item => {
        // Check if item belongs to target user's facility
        return item.facility_id === session.targetUserFacility ||
               item.facility === session.targetUserFacility ||
               !item.facility_id; // Include items without facility restriction
      });
    }

    return data;
  } catch (error) {
    logger.error('[IMPERSONATE_PERMISSION] Error filtering data:', error);
    return data;
  }
}

/**
 * Check if target user can perform an action
 * @param {string} action - Action to perform (e.g., 'create', 'edit', 'delete')
 * @param {string} resourceType - Type of resource
 * @returns {boolean} - True if action is allowed
 */
export function canPerformActionDuringImpersonate(action, resourceType) {
  try {
    const session = getImpersonateSession();
    if (!session) {
      return true; // Not impersonating, allow action
    }

    const targetPermissions = session.targetUserPermissions || [];
    
    // Build permission string
    const permission = `${resourceType}:${action}`;
    
    // Check if target user has the required permission
    const hasPermission = targetPermissions.some(perm => {
      if (perm === '*' || perm === 'admin.*') {
        return true;
      }
      if (perm === permission) {
        return true;
      }
      
      const permParts = perm.split(':');
      if (permParts.length === 2 && permParts[0] === resourceType && permParts[1] === '*') {
        return true;
      }

      return false;
    });

    if (!hasPermission) {
      logger.warn(`[IMPERSONATE_PERMISSION] Target user does not have permission to ${action} ${resourceType}`);
    }

    return hasPermission;
  } catch (error) {
    logger.error('[IMPERSONATE_PERMISSION] Error checking action permission:', error);
    return false;
  }
}

/**
 * Enforce facility restrictions during impersonate
 * @param {Object} item - Item to check
 * @returns {boolean} - True if item is accessible by target user
 */
export function isItemAccessibleByTargetUser(item) {
  try {
    const session = getImpersonateSession();
    if (!session) {
      return true; // Not impersonating, allow access
    }

    // Check facility restriction
    if (session.targetUserFacility) {
      const itemFacility = item.facility_id || item.facility;
      if (itemFacility && itemFacility !== session.targetUserFacility) {
        logger.warn('[IMPERSONATE_PERMISSION] Item is not in target user\'s facility');
        return false;
      }
    }

    // Check department restriction if applicable
    if (session.targetUserDepartment) {
      const itemDepartment = item.department_id || item.department;
      if (itemDepartment && itemDepartment !== session.targetUserDepartment) {
        logger.warn('[IMPERSONATE_PERMISSION] Item is not in target user\'s department');
        return false;
      }
    }

    return true;
  } catch (error) {
    logger.error('[IMPERSONATE_PERMISSION] Error checking item accessibility:', error);
    return true;
  }
}

/**
 * Get effective permissions during impersonate
 * @returns {string[]} - Array of effective permissions
 */
export function getEffectivePermissionsDuringImpersonate() {
  try {
    const session = getImpersonateSession();
    if (!session) {
      const currentUser = getCurrentUser();
      return currentUser?.permissions || [];
    }

    return session.targetUserPermissions || [];
  } catch (error) {
    logger.error('[IMPERSONATE_PERMISSION] Error getting effective permissions:', error);
    return [];
  }
}

/**
 * Get effective role during impersonate
 * @returns {string} - Effective role
 */
export function getEffectiveRoleDuringImpersonate() {
  try {
    const session = getImpersonateSession();
    if (!session) {
      const currentUser = getCurrentUser();
      return currentUser?.role || 'user';
    }

    return session.targetUserRole || 'user';
  } catch (error) {
    logger.error('[IMPERSONATE_PERMISSION] Error getting effective role:', error);
    return 'user';
  }
}

/**
 * Check if action should be logged with impersonate flag
 * @param {string} action - Action being performed
 * @returns {boolean} - True if action should be logged with impersonate flag
 */
export function shouldLogWithImpersonateFlag(action) {
  try {
    const session = getImpersonateSession();
    return !!session;
  } catch (error) {
    logger.error('[IMPERSONATE_PERMISSION] Error checking if should log with impersonate flag:', error);
    return false;
  }
}

export default {
  shouldHideFeatureDuringImpersonate,
  filterDataByTargetUserPermissions,
  canPerformActionDuringImpersonate,
  isItemAccessibleByTargetUser,
  getEffectivePermissionsDuringImpersonate,
  getEffectiveRoleDuringImpersonate,
  shouldLogWithImpersonateFlag,
};
