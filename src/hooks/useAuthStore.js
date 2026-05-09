// src/hooks/useAuthStore.js
import { useState, useCallback, useEffect } from 'react';
import { 
  getImpersonateSession, 
  setImpersonateSession, 
  clearImpersonateSession,
  isImpersonating,
  getImpersonateStatus,
  getImpersonateTimeRemaining
} from '../services/impersonate-storage';
import { 
  startImpersonate, 
  stopImpersonate,
  getLocalImpersonateStatus,
  isCurrentlyImpersonating
} from '../services/impersonateService';
import { getCurrentUser } from '../services/rbac';
import { logger } from '../utils/logger';

/**
 * Custom hook for managing auth and impersonate state
 * Provides getters and setters for impersonate session
 * Handles session persistence across navigation and page refresh
 */
export function useAuthStore() {
  const [impersonateSession, setImpersonateSessionState] = useState(() => {
    return getImpersonateSession();
  });

  const [isImpersonatingState, setIsImpersonatingState] = useState(() => {
    return isImpersonating();
  });

  const [timeRemaining, setTimeRemaining] = useState(() => {
    return getImpersonateTimeRemaining();
  });

  // Sync impersonate session state
  const syncImpersonateState = useCallback(() => {
    const session = getImpersonateSession();
    const isActive = isImpersonating();
    const remaining = getImpersonateTimeRemaining();

    setImpersonateSessionState(session);
    setIsImpersonatingState(isActive);
    setTimeRemaining(remaining);

    logger.debug('[AUTH-STORE] Impersonate state synced:', {
      isImpersonating: isActive,
      timeRemaining: remaining
    });
  }, []);

  // Set up interval to update time remaining
  useEffect(() => {
    if (!isImpersonatingState) return;

    const interval = setInterval(() => {
      const remaining = getImpersonateTimeRemaining();
      setTimeRemaining(remaining);

      if (remaining === 0) {
        logger.warn('[AUTH-STORE] Impersonate session expired');
        syncImpersonateState();
      }
    }, 1000); // Update every second

    return () => clearInterval(interval);
  }, [isImpersonatingState, syncImpersonateState]);

  // Listen for storage changes (from other tabs/windows)
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'impersonate.session.v1') {
        logger.debug('[AUTH-STORE] Impersonate session changed in another tab');
        syncImpersonateState();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [syncImpersonateState]);

  // Getters
  const getCurrentImpersonateSession = useCallback(() => {
    return impersonateSession;
  }, [impersonateSession]);

  const getImpersonateStatus = useCallback(() => {
    return {
      isImpersonating: isImpersonatingState,
      session: impersonateSession,
      timeRemaining: timeRemaining,
      isExpired: isImpersonatingState && timeRemaining === 0
    };
  }, [isImpersonatingState, impersonateSession, timeRemaining]);

  const getOriginalUser = useCallback(() => {
    if (!impersonateSession) return null;
    return {
      id: impersonateSession.originalUserId,
      name: impersonateSession.originalUserName
    };
  }, [impersonateSession]);

  const getTargetUser = useCallback(() => {
    if (!impersonateSession) return null;
    return {
      id: impersonateSession.targetUserId,
      name: impersonateSession.targetUserName,
      role: impersonateSession.targetUserRole,
      permissions: impersonateSession.targetUserPermissions
    };
  }, [impersonateSession]);

  const getTimeRemainingFormatted = useCallback(() => {
    if (timeRemaining <= 0) return '0:00';
    
    const minutes = Math.floor(timeRemaining / 60000);
    const seconds = Math.floor((timeRemaining % 60000) / 1000);
    
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, [timeRemaining]);

  // Setters
  const setImpersonateSessionData = useCallback((session) => {
    try {
      setImpersonateSession(session);
      syncImpersonateState();
      logger.info('[AUTH-STORE] Impersonate session set');
    } catch (error) {
      logger.error('[AUTH-STORE] Error setting impersonate session:', error);
      throw error;
    }
  }, [syncImpersonateState]);

  const clearImpersonateSessionData = useCallback(() => {
    try {
      clearImpersonateSession();
      syncImpersonateState();
      logger.info('[AUTH-STORE] Impersonate session cleared');
    } catch (error) {
      logger.error('[AUTH-STORE] Error clearing impersonate session:', error);
      throw error;
    }
  }, [syncImpersonateState]);

  // Actions
  const startImpersonateSession = useCallback(async (targetUserId, reason = null) => {
    try {
      logger.info('[AUTH-STORE] Starting impersonate session:', { targetUserId, reason });
      const session = await startImpersonate(targetUserId, reason);
      syncImpersonateState();
      logger.info('[AUTH-STORE] Impersonate session started');
      return session;
    } catch (error) {
      logger.error('[AUTH-STORE] Error starting impersonate session:', error);
      throw error;
    }
  }, [syncImpersonateState]);

  const stopImpersonateSession = useCallback(async () => {
    try {
      logger.info('[AUTH-STORE] Stopping impersonate session');
      const result = await stopImpersonate();
      syncImpersonateState();
      logger.info('[AUTH-STORE] Impersonate session stopped');
      return result;
    } catch (error) {
      logger.error('[AUTH-STORE] Error stopping impersonate session:', error);
      throw error;
    }
  }, [syncImpersonateState]);

  return {
    // Getters
    getCurrentImpersonateSession,
    getImpersonateStatus,
    getOriginalUser,
    getTargetUser,
    getTimeRemainingFormatted,
    isImpersonating: isImpersonatingState,
    timeRemaining,
    impersonateSession,

    // Setters
    setImpersonateSessionData,
    clearImpersonateSessionData,

    // Actions
    startImpersonateSession,
    stopImpersonateSession,

    // Sync
    syncImpersonateState
  };
}

/**
 * Global auth store instance (for use outside React components)
 * This provides a way to access auth state from non-React code
 */
let globalAuthStore = null;

export function setGlobalAuthStore(store) {
  globalAuthStore = store;
}

export function getGlobalAuthStore() {
  return globalAuthStore;
}
