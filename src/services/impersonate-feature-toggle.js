/**
 * Impersonate Feature Toggle Service
 * 
 * Manages the enable/disable state of the impersonate feature.
 * Handles UI hiding, API validation, and auto-stop of active sessions.
 * 
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5
 */

import { apiClient } from './http';
import { logger } from '../utils/logger';
import { stopImpersonate, getLocalImpersonateStatus } from './impersonateService';

const FEATURE_TOGGLE_KEY = 'app.impersonate.feature.enabled';

/**
 * Check if impersonate feature is enabled
 * @returns {boolean} - True if feature is enabled
 */
export function isImpersonateFeatureEnabled() {
  try {
    const stored = localStorage.getItem(FEATURE_TOGGLE_KEY);
    if (stored !== null) {
      return stored === 'true';
    }
    
    // Default to enabled if not set
    return true;
  } catch (error) {
    logger.error('[IMPERSONATE_TOGGLE] Error checking feature toggle:', error);
    return true; // Default to enabled on error
  }
}

/**
 * Set impersonate feature toggle state
 * @param {boolean} enabled - Whether to enable or disable the feature
 * @returns {Promise<Object>} - Result of the operation
 */
export async function setImpersonateFeatureToggle(enabled) {
  try {
    logger.info('[IMPERSONATE_TOGGLE] Setting feature toggle:', { enabled });

    // Call backend API to update feature toggle
    const client = apiClient('auth');
    const response = await client.post('/api/impersonate/feature-toggle', {
      enabled: enabled
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to update feature toggle');
    }

    // Update local storage
    localStorage.setItem(FEATURE_TOGGLE_KEY, enabled ? 'true' : 'false');

    // If disabling feature, stop any active impersonate sessions
    if (!enabled) {
      await handleFeatureDisable();
    }

    logger.info('[IMPERSONATE_TOGGLE] Feature toggle updated successfully:', { enabled });

    return {
      success: true,
      enabled: enabled,
      message: enabled ? 'Impersonate feature enabled' : 'Impersonate feature disabled'
    };
  } catch (error) {
    logger.error('[IMPERSONATE_TOGGLE] Error setting feature toggle:', error);
    throw error;
  }
}

/**
 * Handle feature disable - stop active sessions
 * @returns {Promise<void>}
 */
async function handleFeatureDisable() {
  try {
    const status = getLocalImpersonateStatus();
    
    if (status.isImpersonating) {
      logger.info('[IMPERSONATE_TOGGLE] Stopping active impersonate session due to feature disable');
      
      try {
        await stopImpersonate();
        logger.info('[IMPERSONATE_TOGGLE] Active impersonate session stopped');
      } catch (error) {
        logger.error('[IMPERSONATE_TOGGLE] Error stopping impersonate session:', error);
        // Continue anyway - we still want to disable the feature
      }
    }
  } catch (error) {
    logger.error('[IMPERSONATE_TOGGLE] Error handling feature disable:', error);
  }
}

/**
 * Get feature toggle status from backend
 * @returns {Promise<Object>} - Feature toggle status
 */
export async function getImpersonateFeatureToggleStatus() {
  try {
    const client = apiClient('auth');
    const response = await client.get('/api/impersonate/feature-toggle');

    if (response.success) {
      // Update local storage with backend value
      localStorage.setItem(FEATURE_TOGGLE_KEY, response.enabled ? 'true' : 'false');
      return response;
    }

    throw new Error(response.error || 'Failed to get feature toggle status');
  } catch (error) {
    logger.error('[IMPERSONATE_TOGGLE] Error getting feature toggle status:', error);
    // Return local status on error
    return {
      success: true,
      enabled: isImpersonateFeatureEnabled()
    };
  }
}

/**
 * Check if impersonate button should be visible
 * @returns {boolean} - True if button should be visible
 */
export function shouldShowImpersonateButton() {
  return isImpersonateFeatureEnabled();
}

/**
 * Check if impersonate dialog should be shown
 * @returns {boolean} - True if dialog should be shown
 */
export function shouldShowImpersonateDialog() {
  return isImpersonateFeatureEnabled();
}

/**
 * Check if impersonate API operations should be allowed
 * @returns {boolean} - True if operations should be allowed
 */
export function shouldAllowImpersonateOperations() {
  return isImpersonateFeatureEnabled();
}

/**
 * Validate impersonate operation is allowed
 * @throws {Error} - If feature is disabled
 */
export function validateImpersonateOperationAllowed() {
  if (!isImpersonateFeatureEnabled()) {
    throw new Error('FEATURE_DISABLED');
  }
}

export default {
  isImpersonateFeatureEnabled,
  setImpersonateFeatureToggle,
  getImpersonateFeatureToggleStatus,
  shouldShowImpersonateButton,
  shouldShowImpersonateDialog,
  shouldAllowImpersonateOperations,
  validateImpersonateOperationAllowed,
};
