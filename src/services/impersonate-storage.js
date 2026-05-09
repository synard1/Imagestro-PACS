// src/services/impersonate-storage.js
import { logger } from '../utils/logger'

const IMPERSONATE_KEY = 'impersonate.session.v1';

/**
 * Impersonate session data structure:
 * {
 *   sessionId: string,
 *   originalUserId: string,
 *   originalUserName: string,
 *   targetUserId: string,
 *   targetUserName: string,
 *   targetUserRole: string,
 *   targetUserPermissions: string[],
 *   startTime: ISO8601 string,
 *   timeoutMinutes: number,
 *   reason: string (optional),
 *   token: string (JWT token for target user)
 * }
 */

/**
 * Set impersonate session data in localStorage
 * @param {Object} session - Impersonate session object
 * @returns {Object} The session data that was saved
 */
export function setImpersonateSession(session) {
  try {
    if (!session || !session.sessionId) {
      throw new Error('Invalid session: must have sessionId');
    }

    if (!session.originalUserId || !session.targetUserId) {
      throw new Error('Invalid session: must have originalUserId and targetUserId');
    }

    const data = {
      sessionId: session.sessionId,
      originalUserId: session.originalUserId,
      originalUserName: session.originalUserName || '',
      targetUserId: session.targetUserId,
      targetUserName: session.targetUserName || '',
      targetUserRole: session.targetUserRole || '',
      targetUserPermissions: Array.isArray(session.targetUserPermissions) 
        ? session.targetUserPermissions 
        : [],
      startTime: session.startTime || new Date().toISOString(),
      timeoutMinutes: session.timeoutMinutes || 30,
      reason: session.reason || null,
      token: session.token || null
    };

    logger.info('[IMPERSONATE-STORAGE] Saving impersonate session:', {
      sessionId: data.sessionId,
      originalUserId: data.originalUserId,
      targetUserId: data.targetUserId,
      startTime: data.startTime,
      timeoutMinutes: data.timeoutMinutes
    });

    localStorage.setItem(IMPERSONATE_KEY, JSON.stringify(data));

    // Verify it was saved
    const saved = localStorage.getItem(IMPERSONATE_KEY);
    if (!saved) {
      logger.error('[IMPERSONATE-STORAGE] Failed to save impersonate session!');
      throw new Error('localStorage.setItem failed');
    }

    logger.info('[IMPERSONATE-STORAGE] Impersonate session saved and verified');
    return data;
  } catch (error) {
    logger.error('[IMPERSONATE-STORAGE] Error saving impersonate session:', error);
    throw error;
  }
}

/**
 * Get current impersonate session from localStorage
 * @returns {Object|null} Impersonate session object or null if not impersonating
 */
export function getImpersonateSession() {
  try {
    const raw = localStorage.getItem(IMPERSONATE_KEY);
    if (!raw) {
      logger.debug('[IMPERSONATE-STORAGE] No impersonate session found');
      return null;
    }

    const parsed = JSON.parse(raw);
    logger.debug('[IMPERSONATE-STORAGE] Impersonate session loaded:', {
      sessionId: parsed.sessionId,
      targetUserId: parsed.targetUserId,
      startTime: parsed.startTime
    });

    return parsed;
  } catch (error) {
    logger.error('[IMPERSONATE-STORAGE] Error loading impersonate session:', error);
    return null;
  }
}

/**
 * Clear impersonate session from localStorage
 */
export function clearImpersonateSession() {
  logger.debug('[IMPERSONATE-STORAGE] Clearing impersonate session');
  localStorage.removeItem(IMPERSONATE_KEY);

  // Verify it was cleared
  const check = localStorage.getItem(IMPERSONATE_KEY);
  if (check) {
    logger.error('[IMPERSONATE-STORAGE] Failed to clear impersonate session!');
  } else {
    logger.debug('[IMPERSONATE-STORAGE] Impersonate session cleared successfully');
  }
}

/**
 * Backup original auth data before impersonate
 * @param {Object} authData - Original auth data to backup
 */
export function backupOriginalAuth(authData) {
  try {
    const BACKUP_KEY = 'impersonate.original_auth.v1';
    logger.info('[IMPERSONATE-STORAGE] Backing up original auth data');
    localStorage.setItem(BACKUP_KEY, JSON.stringify(authData));
  } catch (error) {
    logger.error('[IMPERSONATE-STORAGE] Error backing up original auth:', error);
    throw error;
  }
}

/**
 * Restore original auth data after impersonate
 * @returns {Object|null} Original auth data or null
 */
export function restoreOriginalAuth() {
  try {
    const BACKUP_KEY = 'impersonate.original_auth.v1';
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) {
      logger.warn('[IMPERSONATE-STORAGE] No original auth backup found');
      return null;
    }

    const authData = JSON.parse(raw);
    logger.info('[IMPERSONATE-STORAGE] Restoring original auth data');
    
    // Clear backup after restore
    localStorage.removeItem(BACKUP_KEY);
    
    return authData;
  } catch (error) {
    logger.error('[IMPERSONATE-STORAGE] Error restoring original auth:', error);
    return null;
  }
}

/**
 * Backup original user data before impersonate
 * @param {Object} userData - Original user data to backup
 */
export function backupOriginalUser(userData) {
  try {
    const BACKUP_KEY = 'impersonate.original_user.v1';
    logger.info('[IMPERSONATE-STORAGE] Backing up original user data');
    localStorage.setItem(BACKUP_KEY, JSON.stringify(userData));
  } catch (error) {
    logger.error('[IMPERSONATE-STORAGE] Error backing up original user:', error);
    throw error;
  }
}

/**
 * Restore original user data after impersonate
 * @returns {Object|null} Original user data or null
 */
export function restoreOriginalUser() {
  try {
    const BACKUP_KEY = 'impersonate.original_user.v1';
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) {
      logger.warn('[IMPERSONATE-STORAGE] No original user backup found');
      return null;
    }

    const userData = JSON.parse(raw);
    logger.info('[IMPERSONATE-STORAGE] Restoring original user data');
    
    // Clear backup after restore
    localStorage.removeItem(BACKUP_KEY);
    
    return userData;
  } catch (error) {
    logger.error('[IMPERSONATE-STORAGE] Error restoring original user:', error);
    return null;
  }
}


/**
 * Check if there is an active impersonate session
 * @returns {boolean} True if impersonating
 */
export function isImpersonating() {
  const session = getImpersonateSession();
  return !!session;
}

/**
 * Get remaining time for impersonate session in milliseconds
 * @returns {number} Milliseconds remaining, 0 if expired or no session
 */
export function getImpersonateTimeRemaining() {
  const session = getImpersonateSession();
  if (!session) return 0;

  const startTime = new Date(session.startTime).getTime();
  const timeoutMs = session.timeoutMinutes * 60 * 1000;
  const endTime = startTime + timeoutMs;
  const remaining = endTime - Date.now();

  return Math.max(0, remaining);
}

/**
 * Check if impersonate session has expired
 * @returns {boolean} True if session has expired
 */
export function isImpersonateSessionExpired() {
  const remaining = getImpersonateTimeRemaining();
  return remaining === 0;
}

/**
 * Get impersonate session status
 * @returns {Object} Status object with isImpersonating, session, and timeRemaining
 */
export function getImpersonateStatus() {
  const session = getImpersonateSession();
  const isActive = !!session;
  const timeRemaining = getImpersonateTimeRemaining();

  return {
    isImpersonating: isActive,
    session: session,
    timeRemaining: timeRemaining,
    isExpired: isActive && timeRemaining === 0
  };
}

/**
 * Validate impersonate session data
 * @param {Object} session - Session to validate
 * @returns {Object} Validation result { valid: boolean, errors: string[] }
 */
export function validateImpersonateSession(session) {
  const errors = [];

  if (!session) {
    errors.push('Session is null or undefined');
    return { valid: false, errors };
  }

  if (!session.sessionId) {
    errors.push('Missing sessionId');
  }

  if (!session.originalUserId) {
    errors.push('Missing originalUserId');
  }

  if (!session.targetUserId) {
    errors.push('Missing targetUserId');
  }

  if (!session.startTime) {
    errors.push('Missing startTime');
  }

  if (typeof session.timeoutMinutes !== 'number' || session.timeoutMinutes <= 0) {
    errors.push('Invalid timeoutMinutes');
  }

  // Validate startTime is valid ISO8601
  try {
    new Date(session.startTime).toISOString();
  } catch (e) {
    errors.push('Invalid startTime format');
  }

  return {
    valid: errors.length === 0,
    errors: errors
  };
}
