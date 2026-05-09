import { useAuth } from './useAuth';
import { can, canAny, canAll } from '../services/rbac';

/**
 * Hook untuk checking permissions
 * Menggunakan RBAC system yang sudah ada di aplikasi
 */
export function usePermissions() {
  const { currentUser } = useAuth() || {};

  /**
   * Check apakah user memiliki permission tertentu
   * @param {string|string[]} permissions - Permission atau array permissions
   * @param {boolean} any - Jika true, check ANY permission (OR logic), jika false check ALL (AND logic)
   * @returns {boolean} - True jika user memiliki permission
   */
  const hasPermission = (permissions, any = true) => {
    // Jika tidak ada user, return false
    if (!currentUser) {
      return false;
    }

    // Jika tidak ada permissions yang di-check, return true
    if (!permissions || (Array.isArray(permissions) && permissions.length === 0)) {
      return true;
    }

    // Normalize permissions ke array
    const permArray = Array.isArray(permissions) ? permissions : [permissions];

    // Check menggunakan RBAC functions
    if (any) {
      return canAny(permArray, currentUser);
    } else {
      return canAll(permArray, currentUser);
    }
  };

  /**
   * Check apakah user adalah admin
   * @returns {boolean} - True jika user adalah admin/superadmin
   */
  const isAdmin = () => {
    if (!currentUser) {
      return false;
    }

    const role = (currentUser?.role || '').toLowerCase();
    const perms = new Set((currentUser?.permissions || []).map(p => p.replace(/:/g, '.')));
    
    return (
      role === 'admin' ||
      role === 'superadmin' ||
      perms.has('*') ||
      perms.has('admin.*')
    );
  };

  /**
   * Get user permissions
   * @returns {string[]} - Array of user permissions
   */
  const getPermissions = () => {
    if (!currentUser) {
      return [];
    }

    return currentUser?.permissions || [];
  };

  /**
   * Get user role
   * @returns {string} - User role
   */
  const getRole = () => {
    if (!currentUser) {
      return null;
    }

    return currentUser?.role || null;
  };

  return {
    hasPermission,
    isAdmin,
    getPermissions,
    getRole,
    currentUser
  };
}

export default usePermissions;
