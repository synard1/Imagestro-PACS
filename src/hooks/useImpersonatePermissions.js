/**
 * Hook for Permission Enforcement During Impersonate
 * 
 * Provides utilities for checking permissions and enforcing restrictions
 * when a superadmin is impersonating another user.
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { useEffect, useState } from 'react';
import {
  shouldHideFeatureDuringImpersonate,
  filterDataByTargetUserPermissions,
  canPerformActionDuringImpersonate,
  isItemAccessibleByTargetUser,
  getEffectivePermissionsDuringImpersonate,
  getEffectiveRoleDuringImpersonate,
  shouldLogWithImpersonateFlag,
} from '../services/impersonate-permission-enforcement';
import { getImpersonateSession } from '../services/impersonate-storage';
import { logger } from '../utils/logger';

/**
 * Hook for permission enforcement during impersonate
 * @returns {Object} - Permission enforcement utilities
 */
export function useImpersonatePermissions() {
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [effectiveRole, setEffectiveRole] = useState(null);
  const [effectivePermissions, setEffectivePermissions] = useState([]);

  // Update state when impersonate session changes
  useEffect(() => {
    const session = getImpersonateSession();
    setIsImpersonating(!!session);
    setEffectiveRole(getEffectiveRoleDuringImpersonate());
    setEffectivePermissions(getEffectivePermissionsDuringImpersonate());

    // Set up listener for impersonate session changes
    const handleStorageChange = () => {
      const updatedSession = getImpersonateSession();
      setIsImpersonating(!!updatedSession);
      setEffectiveRole(getEffectiveRoleDuringImpersonate());
      setEffectivePermissions(getEffectivePermissionsDuringImpersonate());
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  /**
   * Check if a feature should be hidden during impersonate
   * @param {string} featureName - Name of the feature
   * @returns {boolean} - True if feature should be hidden
   */
  const shouldHideFeature = (featureName) => {
    return shouldHideFeatureDuringImpersonate(featureName);
  };

  /**
   * Filter data based on target user permissions
   * @param {Array} data - Data to filter
   * @param {string} resourceType - Type of resource
   * @returns {Array} - Filtered data
   */
  const filterData = (data, resourceType) => {
    return filterDataByTargetUserPermissions(data, resourceType);
  };

  /**
   * Check if an action can be performed
   * @param {string} action - Action to perform
   * @param {string} resourceType - Type of resource
   * @returns {boolean} - True if action is allowed
   */
  const canPerformAction = (action, resourceType) => {
    return canPerformActionDuringImpersonate(action, resourceType);
  };

  /**
   * Check if an item is accessible by target user
   * @param {Object} item - Item to check
   * @returns {boolean} - True if item is accessible
   */
  const isItemAccessible = (item) => {
    return isItemAccessibleByTargetUser(item);
  };

  /**
   * Get effective permissions
   * @returns {string[]} - Array of permissions
   */
  const getPermissions = () => {
    return effectivePermissions;
  };

  /**
   * Get effective role
   * @returns {string} - Role name
   */
  const getRole = () => {
    return effectiveRole;
  };

  /**
   * Check if action should be logged with impersonate flag
   * @param {string} action - Action being performed
   * @returns {boolean} - True if should log with impersonate flag
   */
  const shouldLogWithFlag = (action) => {
    return shouldLogWithImpersonateFlag(action);
  };

  /**
   * Get current impersonate session info
   * @returns {Object|null} - Session info or null
   */
  const getSessionInfo = () => {
    return getImpersonateSession();
  };

  return {
    isImpersonating,
    effectiveRole,
    effectivePermissions,
    shouldHideFeature,
    filterData,
    canPerformAction,
    isItemAccessible,
    getPermissions,
    getRole,
    shouldLogWithFlag,
    getSessionInfo,
  };
}

export default useImpersonatePermissions;
