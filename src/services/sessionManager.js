/**
 * Session Manager Service
 * 
 * Manages user session timeout based on:
 * 1. Token expiration from backend (expires_in)
 * 2. Idle timeout (15 minutes of inactivity)
 * 3. Maximum session duration (from token exp)
 * 
 * Features:
 * - Auto-logout on token expiration
 * - Idle timeout detection
 * - Warning before timeout
 * - Activity tracking
 * - Session refresh
 */

import { getAuth, clearAuth, isExpired } from './auth-storage';

// Session configuration
const SESSION_CONFIG = {
  IDLE_TIMEOUT: 15 * 60 * 1000,        // 15 minutes idle
  WARNING_TIME: 2 * 60 * 1000,         // 2 minutes warning before timeout
  CHECK_INTERVAL: 60 * 1000,           // Check every minute
  ACTIVITY_EVENTS: [
    'mousedown',
    'keydown',
    'scroll',
    'touchstart',
    'click',
    'mousemove'
  ]
};

class SessionManager {
  constructor() {
    this.lastActivity = Date.now();
    this.sessionStart = Date.now();
    this.checkInterval = null;
    this.warningShown = false;
    this.warningTimeout = null;
    this.isInitialized = false;
    this.activityListeners = [];
  }

  /**
   * Initialize session manager
   */
  initialize() {
    if (this.isInitialized) {
      return;
    }

    console.log('[SessionManager] Initializing...');

    // Setup activity tracking
    this.setupActivityTracking();

    // Start timeout checking
    this.startTimeoutChecking();

    // Check on visibility change
    this.setupVisibilityTracking();

    this.isInitialized = true;
    console.log('[SessionManager] Initialized successfully');
  }

  /**
   * Setup activity tracking
   */
  setupActivityTracking() {
    SESSION_CONFIG.ACTIVITY_EVENTS.forEach(eventType => {
      const listener = () => this.updateActivity();
      document.addEventListener(eventType, listener, { passive: true });
      this.activityListeners.push({ eventType, listener });
    });
  }

  /**
   * Setup visibility tracking
   */
  setupVisibilityTracking() {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.checkTimeout();
      }
    });
  }

  /**
   * Update last activity timestamp
   */
  updateActivity() {
    this.lastActivity = Date.now();
    this.warningShown = false;

    // Clear warning timeout if exists
    if (this.warningTimeout) {
      clearTimeout(this.warningTimeout);
      this.warningTimeout = null;
    }
  }

  /**
   * Start timeout checking interval
   */
  startTimeoutChecking() {
    // Clear existing interval
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    // Check timeout every minute
    this.checkInterval = setInterval(() => {
      this.checkTimeout();
    }, SESSION_CONFIG.CHECK_INTERVAL);

    // Initial check
    this.checkTimeout();
  }

  /**
   * Check if session should timeout
   */
  checkTimeout() {
    const auth = getAuth();

    // No auth, no need to check
    if (!auth || !auth.access_token) {
      return;
    }

    const now = Date.now();
    const idleTime = now - this.lastActivity;

    // Check token expiration
    if (isExpired(auth)) {
      console.log('[SessionManager] Token expired, logging out...');
      this.logout('Your session has expired. Please login again.');
      return;
    }

    // Check idle timeout
    if (idleTime >= SESSION_CONFIG.IDLE_TIMEOUT) {
      console.log('[SessionManager] Idle timeout reached, logging out...');
      this.logout('You have been logged out due to inactivity.');
      return;
    }

    // Check if warning should be shown
    const timeUntilIdleTimeout = SESSION_CONFIG.IDLE_TIMEOUT - idleTime;
    if (timeUntilIdleTimeout <= SESSION_CONFIG.WARNING_TIME && !this.warningShown) {
      this.showWarning(timeUntilIdleTimeout);
    }

    // Check token expiration warning
    if (auth.expires_at) {
      const timeUntilExpiration = auth.expires_at - now;
      if (timeUntilExpiration <= SESSION_CONFIG.WARNING_TIME && 
          timeUntilExpiration > 0 && 
          !this.warningShown) {
        this.showExpirationWarning(timeUntilExpiration);
      }
    }
  }

  /**
   * Show idle timeout warning
   */
  showWarning(timeRemaining) {
    this.warningShown = true;
    const minutes = Math.ceil(timeRemaining / 60000);

    console.log(`[SessionManager] Showing idle warning: ${minutes} minute(s) remaining`);

    // Show warning dialog
    const shouldContinue = confirm(
      `Your session will expire in ${minutes} minute(s) due to inactivity.\n\n` +
      `Click OK to continue your session, or Cancel to logout.`
    );

    if (shouldContinue) {
      this.updateActivity();
      console.log('[SessionManager] User chose to continue session');
    } else {
      this.logout('You have been logged out.');
    }
  }

  /**
   * Show token expiration warning
   */
  showExpirationWarning(timeRemaining) {
    this.warningShown = true;
    const minutes = Math.ceil(timeRemaining / 60000);

    console.log(`[SessionManager] Showing expiration warning: ${minutes} minute(s) remaining`);

    // Show warning dialog
    const shouldRefresh = confirm(
      `Your session will expire in ${minutes} minute(s).\n\n` +
      `Click OK to refresh your session, or Cancel to logout.`
    );

    if (shouldRefresh) {
      this.refreshSession();
    } else {
      this.logout('You have been logged out.');
    }
  }

  /**
   * Refresh session using refresh token
   */
  async refreshSession() {
    try {
      console.log('[SessionManager] Attempting to refresh session...');

      const auth = getAuth();
      if (!auth || !auth.refresh_token) {
        throw new Error('No refresh token available');
      }

      // Import authService dynamically to avoid circular dependency
      const { refreshToken } = await import('./authService');
      
      const result = await refreshToken(auth.refresh_token);
      
      if (result.success) {
        console.log('[SessionManager] Session refreshed successfully');
        this.updateActivity();
        this.warningShown = false;
        
        // Show success message
        alert('Your session has been refreshed successfully.');
      } else {
        throw new Error('Failed to refresh session');
      }
    } catch (error) {
      console.error('[SessionManager] Failed to refresh session:', error);
      alert('Failed to refresh session. You will be logged out.');
      this.logout('Session refresh failed. Please login again.');
    }
  }

  /**
   * Logout user
   */
  logout(reason) {
    console.log(`[SessionManager] Logging out: ${reason}`);

    // Clear all session data
    clearAuth();
    
    // Clear session storage (for PHI migration)
    try {
      sessionStorage.clear();
    } catch (error) {
      console.error('[SessionManager] Failed to clear sessionStorage:', error);
    }

    // Stop checking
    this.destroy();

    // Redirect to login with reason
    const encodedReason = encodeURIComponent(reason);
    window.location.href = `/login?reason=${encodedReason}`;
  }

  /**
   * Get session info
   */
  getSessionInfo() {
    const auth = getAuth();
    
    if (!auth || !auth.access_token) {
      return {
        isActive: false,
        message: 'No active session'
      };
    }

    const now = Date.now();
    const idleTime = now - this.lastActivity;
    const sessionDuration = now - this.sessionStart;

    let expiresAt = null;
    let timeUntilExpiration = null;

    if (auth.expires_at) {
      expiresAt = new Date(auth.expires_at);
      timeUntilExpiration = auth.expires_at - now;
    }

    return {
      isActive: true,
      lastActivity: new Date(this.lastActivity),
      sessionStart: new Date(this.sessionStart),
      idleTime: Math.floor(idleTime / 1000), // seconds
      sessionDuration: Math.floor(sessionDuration / 1000), // seconds
      expiresAt,
      timeUntilExpiration: timeUntilExpiration ? Math.floor(timeUntilExpiration / 1000) : null,
      isExpired: isExpired(auth),
      user: {
        username: auth.username,
        email: auth.email,
        role: auth.role
      }
    };
  }

  /**
   * Extend session (update activity)
   */
  extendSession() {
    this.updateActivity();
    console.log('[SessionManager] Session extended');
  }

  /**
   * Destroy session manager
   */
  destroy() {
    console.log('[SessionManager] Destroying...');

    // Clear interval
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // Clear warning timeout
    if (this.warningTimeout) {
      clearTimeout(this.warningTimeout);
      this.warningTimeout = null;
    }

    // Remove activity listeners
    this.activityListeners.forEach(({ eventType, listener }) => {
      document.removeEventListener(eventType, listener);
    });
    this.activityListeners = [];

    this.isInitialized = false;
    console.log('[SessionManager] Destroyed');
  }

  /**
   * Reset session manager (for new login)
   */
  reset() {
    console.log('[SessionManager] Resetting...');
    
    this.lastActivity = Date.now();
    this.sessionStart = Date.now();
    this.warningShown = false;

    if (this.warningTimeout) {
      clearTimeout(this.warningTimeout);
      this.warningTimeout = null;
    }

    // Restart checking
    if (this.isInitialized) {
      this.startTimeoutChecking();
    }
  }
}

// Create singleton instance
const sessionManager = new SessionManager();

// Export
export { SessionManager, SESSION_CONFIG };
export default sessionManager;
