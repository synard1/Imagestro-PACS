/**
 * Hook for Impersonate Feature Toggle
 * 
 * Provides utilities for checking and managing the impersonate feature toggle state.
 * 
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5
 */

import { useEffect, useState } from 'react';
import {
  isImpersonateFeatureEnabled,
  setImpersonateFeatureToggle,
  getImpersonateFeatureToggleStatus,
  shouldShowImpersonateButton,
  shouldShowImpersonateDialog,
  shouldAllowImpersonateOperations,
  validateImpersonateOperationAllowed,
} from '../services/impersonate-feature-toggle';
import { logger } from '../utils/logger';

/**
 * Hook for impersonate feature toggle
 * @returns {Object} - Feature toggle utilities
 */
export function useImpersonateFeatureToggle() {
  const [isEnabled, setIsEnabled] = useState(isImpersonateFeatureEnabled());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load feature toggle status on mount
  useEffect(() => {
    loadFeatureToggleStatus();
  }, []);

  /**
   * Load feature toggle status from backend
   */
  const loadFeatureToggleStatus = async () => {
    try {
      setLoading(true);
      const response = await getImpersonateFeatureToggleStatus();
      setIsEnabled(response.enabled);
      setError(null);
    } catch (err) {
      logger.error('[useImpersonateFeatureToggle] Error loading status:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Toggle feature enabled/disabled
   * @param {boolean} enabled - Whether to enable or disable
   */
  const toggleFeature = async (enabled) => {
    try {
      setLoading(true);
      setError(null);
      
      logger.info('[useImpersonateFeatureToggle] Toggling feature:', { enabled });
      
      const response = await setImpersonateFeatureToggle(enabled);
      setIsEnabled(response.enabled);
      
      logger.info('[useImpersonateFeatureToggle] Feature toggled successfully');
    } catch (err) {
      logger.error('[useImpersonateFeatureToggle] Error toggling feature:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Check if button should be shown
   */
  const canShowButton = () => {
    return shouldShowImpersonateButton();
  };

  /**
   * Check if dialog should be shown
   */
  const canShowDialog = () => {
    return shouldShowImpersonateDialog();
  };

  /**
   * Check if operations are allowed
   */
  const canPerformOperations = () => {
    return shouldAllowImpersonateOperations();
  };

  /**
   * Validate operation is allowed
   */
  const validateOperation = () => {
    try {
      validateImpersonateOperationAllowed();
      return true;
    } catch (err) {
      logger.warn('[useImpersonateFeatureToggle] Operation not allowed:', err.message);
      return false;
    }
  };

  return {
    isEnabled,
    loading,
    error,
    toggleFeature,
    canShowButton,
    canShowDialog,
    canPerformOperations,
    validateOperation,
    reload: loadFeatureToggleStatus,
  };
}

export default useImpersonateFeatureToggle;
