import { apiClient } from "./http";
import { setAuth, clearAuth, getAuth, isExpired } from "./auth-storage";
import { setCurrentUser, clearCurrentUser, getCurrentUser } from "./rbac";
import { loadRegistry } from "./api-registry";
import { logger } from "../utils/logger";
import { logger as cleanLogger } from "../utils/cleanupConsole";

/**
 * Login menggunakan backend auth module
 * @param {string} username - Username untuk login
 * @param {string} password - Password untuk login
 * @returns {Promise<Object>} Response dari backend auth dengan user data
 */
export async function loginBackend(username, password) {
  let tokenSaved = false;

  try {
    const registry = loadRegistry();
    const authConfig = registry.auth;

    if (!authConfig || !authConfig.enabled) {
      throw new Error(
        "Authentication module is not enabled. Please enable it in settings."
      );
    }

    const client = apiClient("auth");
    const loginPath = authConfig.loginPath || "/login";

    logger.info("[AUTH]", "Attempting login...");

    const response = await client.post(loginPath, {
      username,
      password,
    });

    logger.debug("[AUTH]", "Login response received");

    // Validasi response memiliki access_token
    if (!response.access_token) {
      logger.error("[AUTH]", "Login response missing access_token");
      throw new Error("Invalid login response: missing access_token");
    }

    // Simpan token authentication dengan user info
    logger.debug("[AUTH]", "Saving tokens to localStorage...");
    setAuth({
      access_token: response.access_token,
      refresh_token: response.refresh_token,
      token_type: response.token_type || "Bearer",
      expires_in: response.expires_in || 3600,
      user: response.user // Include user info for session manager
    });

    tokenSaved = true; // Mark that token has been saved
    logger.debug("[AUTH]", "Tokens saved successfully");

    // Verify token was actually saved
    const savedAuth = getAuth();
    if (!savedAuth || !savedAuth.access_token) {
      logger.error("[AUTH]", "Token save verification failed!");
      throw new Error("Failed to save authentication token");
    }
    logger.debug("[AUTH]", "Token save verified");

    // Set current user dari response
    let userData = null;

    // Try multiple possible user data locations in response
    if (response.user) {
      userData = response.user;
      logger.debug("[AUTH]", "User data found in response.user");
    } else if (response.data?.user) {
      userData = response.data.user;
      logger.debug("[AUTH]", "User data found in response.data.user");
    } else if (response.payload) {
      userData = response.payload;
      logger.debug("[AUTH]", "User data found in response.payload");
    } else if (response.user_data) {
      userData = response.user_data;
      logger.debug("[AUTH]", "User data found in response.user_data");
    }

    // If no user data in login response, try to fetch from /me or /verify endpoint
    if (!userData) {
      logger.debug(
        "[AUTH]",
        "No user data in login response, fetching from backend..."
      );
      try {
        const userResponse = await getCurrentUserFromBackend();
        userData = userResponse;
        logger.debug("[AUTH]", "User data fetched successfully");
      } catch (err) {
        logger.warn(
          "[AUTH]",
          "Could not fetch user data after login:",
          err.message
        );
        // Continue without user data - will be fetched on next verify
        // DON'T clear token here - user data can be fetched later
      }
    }

    // Set user data if available
    if (userData) {
      // Normalize user data structure - preserve all fields from backend
      const normalizedUser = {
        ...userData, // Preserve all profile fields (telegram, whatsapp, phone_number, etc.)
        id: userData.id || userData.user_id || null,
        name:
          userData.name || userData.username || userData.full_name || "User",
        username: userData.username || userData.name || null,
        email: userData.email || null,
        role: userData.role || "user",
        permissions: Array.isArray(userData.permissions)
          ? userData.permissions
          : [],
      };

      logger.debug("[AUTH]", "Setting current user:", normalizedUser.name);
      setCurrentUser(normalizedUser);
    } else {
      logger.warn("[AUTH]", "Login successful but no user data available");
      // Set minimal user data to prevent "Guest" display
      setCurrentUser({
        id: "temp-" + Date.now(),
        name: username || "User",
        username: username,
        email: null,
        role: "user",
        permissions: [],
      });
    }

    logger.info("[AUTH]", "Login completed successfully");

    // Reset session manager for new session
    try {
      const sessionManagerModule = await import('./sessionManager');
      const sessionManager = sessionManagerModule.default;
      sessionManager.reset();
      logger.debug("[AUTH]", "Session manager reset for new login");
    } catch (error) {
      logger.warn("[AUTH]", "Failed to reset session manager:", error.message);
    }

    return {
      ...response,
      user: userData,
    };
  } catch (error) {
    logger.error("[AUTH]", "Login failed:", error.originalError || error);

    // Only clear auth if token was NOT saved successfully
    // If token was saved but user data fetch failed, keep the token
    if (!tokenSaved) {
      logger.debug("[AUTH]", "Clearing auth state (token was not saved)");
      clearAuth();
      clearCurrentUser();
    } else {
      logger.debug(
        "[AUTH]",
        "Keeping token (token was saved, only user data fetch failed)"
      );
      // Don't clear - token is valid, user data can be fetched later
    }

    throw error;
  }
}

/**
 * Get current user data from backend /me or /verify endpoint
 * @returns {Promise<Object>} User data
 */
export async function getCurrentUserFromBackend() {
  try {
    const registry = loadRegistry();
    const authConfig = registry.auth;

    if (!authConfig || !authConfig.enabled) {
      throw new Error("Authentication module is not enabled.");
    }

    const client = apiClient("auth");

    // Try /me endpoint first, fallback to /verify
    let response;
    try {
      const mePath = authConfig.mePath || "/me";
      response = await client.get(mePath);
    } catch (err) {
      // If /me fails, try /verify
      const verifyPath = authConfig.verifyPath || "/auth/verify";
      response = await client.post(verifyPath);
    }

    // Extract user from various possible response formats
    return response.user || response.data?.user || response.payload || response;
  } catch (error) {
    throw error;
  }
}

/**
 * Logout dan clear semua auth data
 */
export async function logoutBackend() {
  try {
    const registry = loadRegistry();
    const authConfig = registry.auth;

    if (authConfig && authConfig.enabled) {
      const client = apiClient("auth");
      const logoutPath = authConfig.logoutPath || "/logout";

      // Best-effort reachability check to avoid noisy network errors
      let reachable = true;
      try {
        const healthPath = authConfig.healthPath || "/health";
        await client.get(healthPath);
      } catch (_) {
        reachable = false;
      }

      if (reachable) {
        try {
          await client.post(logoutPath);
        } catch (error) {
          // Quietly ignore backend logout failures; proceed with local cleanup
          cleanLogger.debug("[AUTH] Skipping backend logout (request failed):", error.message || error);
        }
      } else {
        cleanLogger.debug("[AUTH] Auth backend not reachable, skipping logout request");
      }
    }
  } catch (error) {
    // Don’t propagate; logout should always proceed
    cleanLogger.debug("[AUTH] Logout encountered a non-fatal error:", error.message || error);
  } finally {
    // Always clear local auth data
    clearAuth();
    clearCurrentUser();
    
    // Destroy session manager
    try {
      const sessionManagerModule = await import('./sessionManager');
      const sessionManager = sessionManagerModule.default;
      sessionManager.destroy();
      cleanLogger.debug("[AUTH] Session manager destroyed");
    } catch (error) {
      cleanLogger.warn("[AUTH] Failed to destroy session manager:", error.message);
    }
  }
}

/**
 * Refresh access token menggunakan refresh token
 * @returns {Promise<Object>} Response dengan token baru
 */
export async function refreshToken() {
  try {
    const registry = loadRegistry();
    const authConfig = registry.auth;

    if (!authConfig || !authConfig.enabled) {
      throw new Error("Authentication module is not enabled.");
    }

    const currentAuth = getAuth();
    if (!currentAuth || !currentAuth.refresh_token) {
      throw new Error("No refresh token available");
    }

    const client = apiClient("auth");
    const refreshPath = authConfig.refreshPath || "/refresh";

    const response = await client.post(refreshPath, {
      refresh_token: currentAuth.refresh_token,
    });

    // Validasi response
    if (!response.access_token) {
      throw new Error("Invalid refresh response: missing access_token");
    }

    // Update token authentication (preserve user info)
    setAuth({
      access_token: response.access_token,
      refresh_token: response.refresh_token || currentAuth.refresh_token,
      token_type: response.token_type || "Bearer",
      expires_in: response.expires_in || 3600,
      user: response.user || {
        username: currentAuth.username,
        email: currentAuth.email,
        role: currentAuth.role,
        full_name: currentAuth.full_name,
        id: currentAuth.user_id
      }
    });

    return {
      success: true,
      ...response
    };
  } catch (error) {
    console.error("Token refresh failed:", error.originalError || error);
    // Clear auth jika refresh gagal
    clearAuth();
    clearCurrentUser();
    throw error;
  }
}

// Cache untuk hasil verifikasi token
const verificationCache = {
  lastVerified: 0,
  cachedUser: null,
  minInterval: 4 * 60 * 1000, // Minimal 4 menit antara verifikasi
};

/**
 * Verify current token dengan backend dan update user data
 * @returns {Promise<Object>} User data jika token valid
 */
export async function verifyToken() {
  try {
    const registry = loadRegistry();
    const authConfig = registry.auth;

    if (!authConfig || !authConfig.enabled) {
      throw new Error("Authentication module is not enabled.");
    }

    // Check if token exists
    const currentAuth = getAuth();
    if (!currentAuth || !currentAuth.access_token) {
      cleanLogger.debug("[AUTH] No token found for verification");
      throw new Error("No authentication token found");
    }

    const now = Date.now();
    const timeSinceLastVerify = now - verificationCache.lastVerified;

    // Jika belum expired dan masih dalam interval cache, gunakan cache
    if (!isExpired(currentAuth) && 
        verificationCache.cachedUser && 
        timeSinceLastVerify < verificationCache.minInterval) {
      logger.info("[AUTH] Using cached verification result");
      return verificationCache.cachedUser;
    }

    // Jika token expired, coba refresh dulu
    if (isExpired(currentAuth)) {
      cleanLogger.debug("[AUTH] Token expired, attempting refresh...");
      try {
        await refreshToken();
        cleanLogger.debug("[AUTH] Token refreshed, continuing verification");
      } catch (refreshError) {
        cleanLogger.error("[AUTH] Token refresh failed:", refreshError.message);
        clearAuth();
        clearCurrentUser();
        throw refreshError;
      }
    }

    logger.info("[AUTH] Verifying token with backend...");
    const client = apiClient("auth");
    const verifyPath = authConfig.verifyPath || "/auth/verify";

    // Make the verification request
    const response = await client.post(verifyPath);

    // Extract and normalize user data
    let userData = response.user || response.data?.user || response.payload || response;

    if (userData && (userData.id || userData.user_id)) {
      const normalizedUser = {
        ...userData, // Preserve all profile fields (telegram, whatsapp, phone_number, etc.)
        id: userData.id || userData.user_id || null,
        name:
          userData.name || userData.username || userData.full_name || "User",
        username: userData.username || userData.name || null,
        email: userData.email || null,
        role: userData.role || "user",
        permissions: Array.isArray(userData.permissions)
          ? userData.permissions
          : [],
      };

      // Update cache
      verificationCache.lastVerified = Date.now();
      verificationCache.cachedUser = normalizedUser;

      logger.info("[AUTH] User data updated:", normalizedUser.name);
      setCurrentUser(normalizedUser);
      return normalizedUser;
    }

    logger.warn("[AUTH] No valid user data in verification response");
    throw new Error("No user data in verification response");
  } catch (error) {
    logger.error(
      "[AUTH] Token verification failed:",
      error.originalError || error
    );

    // Only clear auth on authentication errors (401, 403)
    // Keep auth on network errors or server errors (5xx) - user can retry
    const shouldClearAuth =
      error.status === 401 ||
      error.status === 403 ||
      error.message?.includes("No authentication token");

    if (shouldClearAuth) {
      logger.info("[AUTH] Clearing auth due to authentication failure");
      clearAuth();
      clearCurrentUser();
    } else {
      logger.info("[AUTH] Keeping auth (temporary error, can retry)");
    }

    throw error;
  }
}

/**
 * Reset verification cache
 */
function resetVerificationCache() {
  verificationCache.lastVerified = 0;
  verificationCache.cachedUser = null;
}

/**
 * Initialize auth state - check for existing token and verify
 * Should be called on app startup
 * @returns {Promise<Object|null>} User data if authenticated, null otherwise
 */
export async function initializeAuth() {
  try {
    logger.info("[AUTH] Initializing authentication...");
    resetVerificationCache(); // Reset cache on initialization

    const registry = loadRegistry();
    const authConfig = registry.auth;

    // If auth is not enabled, return null
    if (!authConfig || !authConfig.enabled) {
      cleanLogger.debug("[AUTH] Backend auth not enabled");
      clearAuth();
      clearCurrentUser();
      return null;
    }

    const currentAuth = getAuth();

    // No token, not authenticated
    if (!currentAuth || !currentAuth.access_token) {
      logger.info("[AUTH] No existing token found");
      clearAuth();
      clearCurrentUser();
      return null;
    }

    logger.info("[AUTH] Existing token found, verifying...");

    // Token exists, verify it
    const userData = await verifyToken();
    logger.info("[AUTH] Auth initialization successful");
    return userData;
  } catch (error) {
    logger.error("[AUTH] Auth initialization failed:", error.message);

    // verifyToken() already handles clearing auth on 401/403
    // Only clear here if it's a different error and token is truly invalid
    const shouldClear =
      error.status === 401 ||
      error.status === 403 ||
      error.message?.includes("No authentication token");

    if (shouldClear) {
      logger.info("[AUTH] Clearing auth during initialization");
      clearAuth();
      clearCurrentUser();
    } else {
      logger.info(
        "[AUTH] Keeping auth (initialization error but token may be valid)"
      );
      // Try to load user from localStorage at least
      const savedUser = getCurrentUser();
      if (savedUser && savedUser.id) {
        logger.info("[AUTH] Using cached user data:", savedUser.name);
        return savedUser;
      }
    }

    return null;
  }
}

/**
 * Check if user is currently authenticated
 * @returns {boolean} True if authenticated with valid token
 */
export function isAuthenticated() {
  const currentAuth = getAuth();
  if (!currentAuth || !currentAuth.access_token) {
    return false;
  }

  // Check if token is expired
  if (isExpired(currentAuth)) {
    return false;
  }

  // Check if user data exists
  const user = getCurrentUser();
  return !!user && !!user.id;
}

/**
 * Get time until token expires in milliseconds
 * @returns {number} Milliseconds until expiration, 0 if expired or no token
 */
export function getTimeUntilExpiry() {
  const currentAuth = getAuth();
  if (!currentAuth || !currentAuth.expires_at) {
    return 0;
  }

  const timeLeft = currentAuth.expires_at - Date.now();
  return Math.max(0, timeLeft);
}


/**
 * Verify password untuk current user tanpa login ulang
 * Digunakan untuk authorization actions seperti revoke signature
 * @param {string} password - Password untuk diverifikasi
 * @returns {Promise<boolean>} True jika password benar
 */
export async function verifyPassword(password) {
  try {
    const currentUser = getCurrentUser();
    
    if (!currentUser || !currentUser.username) {
      logger.error("[AUTH]", "No current user found for password verification");
      throw new Error("No authenticated user found");
    }

    const registry = loadRegistry();
    const authConfig = registry.auth;

    if (!authConfig || !authConfig.enabled) {
      logger.warn("[AUTH]", "Auth module not enabled, cannot verify password securely");
      return false;
    }

    const client = apiClient("auth");
    const loginPath = authConfig.loginPath || "/login";

    logger.info("[AUTH]", `Verifying password for user: ${currentUser.username}`);

    // Try login dengan current username dan provided password
    // Jika berhasil, password benar. Kita tidak save token-nya.
    const response = await client.post(loginPath, {
      username: currentUser.username,
      password: password,
    });

    // Jika sampai sini tanpa error, password benar
    if (response.access_token) {
      logger.info("[AUTH]", "Password verification successful");
      return true;
    }

    return false;

  } catch (error) {
    logger.error("[AUTH]", "Password verification failed:", error.message);
    
    // Jika error 401 atau 403, password salah
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      return false;
    }

    // Error lain, throw
    throw new Error(`Password verification failed: ${error.message}`);
  }
}

/**
 * Update user's guided tour status
 * @param {string} version - Tour version
 * @returns {Promise<Object>}
 */
export async function updateTourStatus(version = '1.0') {
  try {
    const user = getCurrentUser();
    if (!user) {
      throw new Error("No authenticated user found");
    }

    // Cek environment via config atau import.meta.env
    const isLocalAuth = import.meta.env.VITE_ENABLE_LOCAL_AUTH === 'true';

    if (isLocalAuth) {
      const updatedUser = {
        ...user,
        tour_completed: true,
        tour_passed_at: new Date().toISOString(),
        tour_version: version
      };
      
      localStorage.setItem('currentUser', JSON.stringify(updatedUser));
      cleanLogger.debug("[AUTH]", "Tour status updated (Local)");
      return { status: 'success', user: updatedUser };
    }

    const client = apiClient("auth");
    cleanLogger.debug("[AUTH]", `Updating tour status for user: ${user.username}`);

    const response = await client.patch("/auth/tour/complete", { version });
    
    if (response.status === 'success') {
      const userData = response.data || {};
      const updatedUser = { 
        ...user, 
        ...userData,
        tour_completed: true 
      };
      localStorage.setItem('currentUser', JSON.stringify(updatedUser));
      cleanLogger.debug("[AUTH]", "Tour status updated (Backend)");
      return { status: 'success', user: updatedUser };
    }

    return response;
  } catch (error) {
    cleanLogger.error("[AUTH]", "Update tour status failed:", error.message);
    throw error;
  }
}

/**
 * Update user's quick start onboarding progress
 * @param {string} taskId - ID of the completed task (e.g., 'org', 'doctors')
 * @param {string} version - Feature version
 * @returns {Promise<Object>}
 */
export async function updateQuickStartProgress(taskId, version = '1.0') {
  try {
    const user = getCurrentUser();
    if (!user) throw new Error("No authenticated user found");

    const isLocalAuth = import.meta.env.VITE_ENABLE_LOCAL_AUTH === 'true';
    const now = new Date().toISOString();

    if (isLocalAuth) {
      // Get existing progress or initialize
      const progress = JSON.parse(localStorage.getItem('onboarding_progress') || '{}');
      
      // Update task with timestamp and version
      progress[taskId] = {
        completed: true,
        completedAt: now,
        version: version
      };
      
      localStorage.setItem('onboarding_progress', JSON.stringify(progress));
      cleanLogger.debug("[AUTH]", `Quick start progress updated locally for ${taskId}`);
      return { status: 'success', progress };
    }

    const client = apiClient("auth");
    const response = await client.patch("/auth/onboarding/progress", { 
      taskId, 
      version,
      completedAt: now
    });
    
    if (response.status === 'success') {
      cleanLogger.debug("[AUTH]", `Quick start progress updated on backend for ${taskId}`);
      return { status: 'success', progress: response.data };
    }

    return response;
  } catch (error) {
    cleanLogger.error("[AUTH]", `Update quick start progress failed for ${taskId}:`, error.message);
    throw error;
  }
}

