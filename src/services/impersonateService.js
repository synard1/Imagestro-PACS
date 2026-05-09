// src/services/impersonateService.js
import { apiClient } from './http';
import { 
  setImpersonateSession, 
  getImpersonateSession, 
  clearImpersonateSession,
  isImpersonating,
  getImpersonateStatus,
  validateImpersonateSession,
  backupOriginalAuth,
  restoreOriginalAuth,
  backupOriginalUser,
  restoreOriginalUser
} from './impersonate-storage';
import { getCurrentUser, setCurrentUser } from './rbac';
import { getAuth, setAuth } from './auth-storage';
import { logger } from '../utils/logger';

/**
 * Start impersonate session
 * @param {string} targetUserId - ID of user to impersonate
 * @param {string} reason - Optional reason for impersonation
 * @returns {Promise<Object>} Session data
 */
export async function startImpersonate(targetUserId, reason = null) {
  try {
    if (!targetUserId) {
      throw new Error('Target user ID is required');
    }

    // Check if already impersonating
    if (isImpersonating()) {
      throw new Error('NESTED_IMPERSONATE_NOT_ALLOWED');
    }

    const currentUser = getCurrentUser();
    if (!currentUser) {
      throw new Error('Not authenticated');
    }

    // Backup original auth and user data BEFORE impersonate
    const currentAuth = getAuth();
    if (currentAuth) {
      backupOriginalAuth(currentAuth);
      logger.info('[IMPERSONATE] Backed up original auth token');
    }
    
    backupOriginalUser(currentUser);
    logger.info('[IMPERSONATE] Backed up original user data:', {
      userId: currentUser.id,
      username: currentUser.username,
      role: currentUser.role
    });

    logger.info('[IMPERSONATE] Starting impersonate session:', {
      originalUserId: currentUser.id,
      targetUserId: targetUserId,
      reason: reason
    });

    // Call backend API to start impersonate
    const client = apiClient('impersonate');
    const response = await client.post('/impersonate/start', {
      targetUserId: targetUserId,
      reason: reason || 'No reason provided'
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to start impersonate');
    }

    const session = response.session;

    // Log full session data for debugging
    logger.info('[IMPERSONATE] Received session from backend:', {
      sessionId: session.sessionId,
      targetUserId: session.targetUserId,
      targetUserName: session.targetUserName,
      targetUserRole: session.targetUserRole,
      targetUserPermissions: session.targetUserPermissions,
      hasToken: !!session.token,
      fullSession: session
    });

    // WORKAROUND: If backend doesn't send complete user data, fetch it separately
    if (!session.targetUserName || !session.targetUserRole || !session.targetUserPermissions || !session.token) {
      logger.warn('[IMPERSONATE] Backend response incomplete, fetching target user data separately...');
      
      try {
        // Fetch target user data from users API
        const userClient = apiClient('users');
        const userResponse = await userClient.get(`/api/users/${targetUserId}`);
        
        logger.info('[IMPERSONATE] Fetched user data from API:', userResponse);
        
        // Merge user data into session
        session.targetUserName = session.targetUserName || userResponse.name || userResponse.username || 'Unknown User';
        session.targetUserRole = session.targetUserRole || userResponse.role || 'user';
        session.targetUserPermissions = session.targetUserPermissions || userResponse.permissions || [];
        session.targetUserEmail = session.targetUserEmail || userResponse.email || null;
        
        // For token, use current auth token (not ideal but works for permission checking)
        // Note: Ideally backend should provide a proper impersonate token
        if (!session.token) {
          const currentAuth = getAuth();
          session.token = currentAuth?.access_token;
          logger.warn('[IMPERSONATE] Using current auth token (backend should provide impersonate token)');
        }
        
        logger.info('[IMPERSONATE] Merged user data into session:', {
          targetUserName: session.targetUserName,
          targetUserRole: session.targetUserRole,
          permissionsCount: session.targetUserPermissions?.length || 0,
          permissions: session.targetUserPermissions
        });
      } catch (fetchError) {
        logger.error('[IMPERSONATE] Failed to fetch user data:', fetchError);
        throw new Error('Failed to get target user data. Please ensure the user exists and you have permission to view user details.');
      }
    }

    // Validate session data
    const validation = validateImpersonateSession(session);
    if (!validation.valid) {
      logger.error('[IMPERSONATE] Invalid session data from backend:', validation.errors);
      throw new Error('Invalid session data received from backend');
    }

    // Save impersonate session
    setImpersonateSession(session);

    // Update auth token with impersonate token
    // Backend now properly supports impersonate tokens (verified via /auth/me)
    if (session.token) {
      const currentAuth = getAuth();
      setAuth({
        access_token: session.token,
        refresh_token: currentAuth?.refresh_token || '',
        token_type: 'Bearer',
        expires_in: session.timeoutMinutes * 60,
        user: {
          id: session.targetUserId,
          username: session.targetUserName,
          role: session.targetUserRole,
          full_name: session.targetUserName
        }
      });
      logger.info('[IMPERSONATE] Updated auth token to impersonate token');
    } else {
      logger.warn('[IMPERSONATE] No token provided in session - keeping original token');
    }

    // Prepare user data with permissions
    const targetUserData = {
      id: session.targetUserId,
      name: session.targetUserName,
      username: session.targetUserName,
      role: session.targetUserRole,
      permissions: session.targetUserPermissions || [],
      email: session.targetUserEmail || null
    };

    logger.info('[IMPERSONATE] Setting current user to target user:', {
      id: targetUserData.id,
      name: targetUserData.name,
      role: targetUserData.role,
      permissionsCount: targetUserData.permissions.length,
      permissions: targetUserData.permissions
    });

    // Update current user to target user
    setCurrentUser(targetUserData);

    logger.info('[IMPERSONATE] Impersonate session started successfully:', {
      sessionId: session.sessionId,
      targetUserId: session.targetUserId
    });

    return session;
  } catch (error) {
    logger.error('[IMPERSONATE] Error starting impersonate:', error.message);
    throw error;
  }
}

/**
 * Stop impersonate session
 * @returns {Promise<Object>} Stop result with duration
 */
export async function stopImpersonate() {
  try {
    const session = getImpersonateSession();
    if (!session) {
      throw new Error('NO_ACTIVE_SESSION');
    }

    logger.info('[IMPERSONATE] Stopping impersonate session:', {
      sessionId: session.sessionId,
      targetUserId: session.targetUserId
    });

    // Call backend API to stop impersonate
    const client = apiClient('impersonate');
    const response = await client.post('/impersonate/stop', {});

    if (!response.success) {
      throw new Error(response.error || 'Failed to stop impersonate');
    }

    // Clear impersonate session
    clearImpersonateSession();

    // Restore original auth token
    const originalAuth = restoreOriginalAuth();
    if (originalAuth) {
      setAuth(originalAuth);
      logger.info('[IMPERSONATE] Restored original auth token');
    } else {
      logger.warn('[IMPERSONATE] No original auth to restore - user may need to re-login');
    }

    // Restore original user data
    const originalUser = restoreOriginalUser();
    if (originalUser) {
      setCurrentUser(originalUser);
      logger.info('[IMPERSONATE] Restored original user data:', {
        userId: originalUser.id,
        username: originalUser.username,
        role: originalUser.role
      });
    } else {
      logger.warn('[IMPERSONATE] No original user to restore');
    }
    
    logger.info('[IMPERSONATE] Impersonate session stopped successfully:', {
      sessionId: session.sessionId,
      duration: response.duration
    });

    return {
      success: true,
      duration: response.duration,
      originalUserId: session.originalUserId,
      originalUserName: session.originalUserName
    };
  } catch (error) {
    logger.error('[IMPERSONATE] Error stopping impersonate:', error.message);
    throw error;
  }
}

/**
 * Get current impersonate status
 * @returns {Promise<Object>} Status object
 */
export async function getImpersonateStatusFromBackend() {
  try {
    const client = apiClient('impersonate');
    const response = await client.get('/impersonate/status');

    return response;
  } catch (error) {
    logger.error('[IMPERSONATE] Error getting impersonate status:', error.message);
    // Return local status if backend call fails
    return getImpersonateStatus();
  }
}

/**
 * Get impersonate history
 * @param {Object} filters - Filter options
 * @returns {Promise<Object>} History data with pagination
 */
export async function getImpersonateHistory(filters = {}) {
  try {
    const client = apiClient('impersonate');
    const response = await client.get('/impersonate/history', { params: filters });

    return response;
  } catch (error) {
    logger.error('[IMPERSONATE] Error getting impersonate history:', error.message);
    throw error;
  }
}

/**
 * Validate if a user can be impersonated
 * @param {string} targetUserId - User ID to validate
 * @returns {Promise<Object>} Validation result
 */
export async function validateImpersonateTarget(targetUserId) {
  try {
    if (!targetUserId) {
      return {
        valid: false,
        error: 'USER_NOT_FOUND'
      };
    }

    const client = apiClient('impersonate');
    const response = await client.post('/impersonate/validate', {
      targetUserId: targetUserId
    });

    return response;
  } catch (error) {
    logger.error('[IMPERSONATE] Error validating impersonate target:', error.message);
    
    // Map error responses
    if (error.response?.status === 404) {
      return { valid: false, error: 'USER_NOT_FOUND' };
    }
    if (error.response?.status === 400) {
      return { valid: false, error: error.response.data?.error || 'INVALID_TARGET' };
    }
    
    throw error;
  }
}

/**
 * Get local impersonate status (from localStorage)
 * @returns {Object} Status object
 */
export function getLocalImpersonateStatus() {
  return getImpersonateStatus();
}

/**
 * Check if currently impersonating
 * @returns {boolean} True if impersonating
 */
export function isCurrentlyImpersonating() {
  return isImpersonating();
}

/**
 * Get current impersonate session (from localStorage)
 * @returns {Object|null} Session object or null
 */
export function getCurrentImpersonateSession() {
  return getImpersonateSession();
}

/**
 * Clear impersonate session (local only)
 * Use stopImpersonate() to properly stop via backend
 */
export function clearLocalImpersonateSession() {
  clearImpersonateSession();
}
