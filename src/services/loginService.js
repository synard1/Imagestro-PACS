/**
 * Minimal Login Service
 * 
 * This file contains ONLY the essential login functionality.
 * It is designed to be loaded on the login page without exposing
 * sensitive authentication logic, session management, or RBAC systems.
 * 
 * Full authentication services are lazy-loaded after successful login.
 */

import { createMinimalAuthClient } from "./minimalHttp";
import { logger } from "../utils/logger";

/**
 * Perform login with username and password
 * This is a minimal implementation that only handles the login request
 * Full auth initialization happens after successful login
 * 
 * @param {string} username - Username
 * @param {string} password - Password
 * @returns {Promise<Object>} Login response with tokens and user data
 */
export async function performLogin(username, password) {
  try {
    // Basic validation
    if (!username || !username.trim()) {
      throw new Error('Username is required');
    }

    if (!password || !password.trim()) {
      throw new Error('Password is required');
    }

    if (username.length < 3) {
      throw new Error('Username must be at least 3 characters');
    }

    // Use minimal auth config instead of full registry
    // This prevents exposing all backend URLs and endpoints
    const { getMinimalAuthConfig } = await import('./minimalAuthConfig');
    const authConfig = getMinimalAuthConfig();

    if (!authConfig || !authConfig.enabled) {
      throw new Error('Authentication module is not enabled. Please enable it in settings.');
    }

    // Create minimal HTTP client (no api-registry loaded)
    const client = createMinimalAuthClient(authConfig);
    const loginPath = authConfig.loginPath || "/auth/login";

    logger.info("[LOGIN]", "Attempting login...");

    // Make login request
    try {
      const response = await client.post(loginPath, {
        username,
        password,
      });

      logger.debug("[LOGIN]", "Login response received");

      // Validate response has access_token
      if (!response.access_token) {
        logger.error("[LOGIN]", "Login response missing access_token");
        throw new Error("Invalid login response: missing access_token");
      }

      logger.info("[LOGIN]", "Login successful");

      return {
        access_token: response.access_token,
        refresh_token: response.refresh_token,
        token_type: response.token_type || "Bearer",
        expires_in: response.expires_in || 3600,
        user: response.user || response.data?.user || null
      };
    } catch (error) {
      // Fallback to local auth if enabled
      const isLocalAuthEnabled = import.meta.env.VITE_ENABLE_LOCAL_AUTH === 'true';
      
      if (isLocalAuthEnabled) {
        logger.warn("[LOGIN]", "Backend login failed, attempting local fallback...");
        return await performLocalLogin(username, password);
      }
      
      // If not enabled, rethrow original error
      throw error;
    }
  } catch (error) {
    logger.error("[LOGIN]", "Login failed:", error.originalError || error);
    throw error;
  }
}

/**
 * Perform local mock login using users.json
 * 
 * @param {string} username - Username
 * @param {string} password - Password (ignored in mock)
 * @returns {Promise<Object>} Mock login response
 */
async function performLocalLogin(username, password) {
  try {
    // Load mock users data
    const usersData = await import('../data/users.json');
    const users = usersData.default || usersData;

    // Find user - search by name (normalized) or ID
    const user = users.find(u => {
      const normalizedName = u.name.toLowerCase().replace(/\s+/g, '.');
      return normalizedName === username.toLowerCase() || u.id === username;
    });

    if (!user) {
      logger.error("[LOGIN]", "Local user not found:", username);
      throw new Error("Invalid username or password (Local Auth)");
    }

    logger.info("[LOGIN]", "Local login successful for:", user.name);

    return {
      access_token: "mock-local-token-" + Date.now(),
      refresh_token: "mock-local-refresh-" + Date.now(),
      token_type: "Bearer",
      expires_in: 86400, // 24 hours
      user: {
        id: user.id,
        name: user.name,
        username: username.toLowerCase(),
        role: user.role,
        permissions: user.permissions || []
      }
    };
  } catch (err) {
    logger.error("[LOGIN]", "Local login failed:", err.message);
    throw err;
  }
}

/**
 * Initialize authentication after successful login
 * This function lazy-loads all auth-related services and initializes them
 * 
 * @param {Object} loginResponse - Response from performLogin
 * @returns {Promise<Object>} User data
 */
export async function initializeAuthAfterLogin(loginResponse) {
  try {
    logger.info("[LOGIN]", "Initializing authentication services...");

    // Lazy load auth services
    const [
      { setAuth },
      { setCurrentUser },
      sessionManagerModule
    ] = await Promise.all([
      import('./auth-storage'),
      import('./rbac'),
      import('./sessionManager')
    ]);

    // Calculate expiration time
    const expiresAt = Date.now() + ((+loginResponse.expires_in || 0) * 1000);

    // Save authentication data
    logger.debug("[LOGIN]", "Saving authentication data...");
    setAuth({
      access_token: loginResponse.access_token,
      refresh_token: loginResponse.refresh_token,
      token_type: loginResponse.token_type || 'Bearer',
      expires_in: +loginResponse.expires_in || 0,
      user: loginResponse.user
    });

    // Set current user
    let userData = loginResponse.user;

    // If no user data, try to fetch from backend
    if (!userData) {
      logger.debug("[LOGIN]", "No user data in response, fetching from backend...");
      try {
        const { getCurrentUserFromBackend } = await import('./authService');
        userData = await getCurrentUserFromBackend();
      } catch (err) {
        logger.warn("[LOGIN]", "Could not fetch user data:", err.message);
        // Create minimal user data
        userData = {
          id: "temp-" + Date.now(),
          name: "User",
          username: "",
          email: null,
          role: "user",
          permissions: []
        };
      }
    }

    // Normalize user data
    const normalizedUser = {
      ...userData,
      id: userData.id || userData.user_id || null,
      name: userData.name || userData.username || userData.full_name || "User",
      username: userData.username || userData.name || null,
      email: userData.email || null,
      role: userData.role || "user",
      permissions: Array.isArray(userData.permissions) ? userData.permissions : [],
    };

    logger.debug("[LOGIN]", "Setting current user:", normalizedUser.name);
    setCurrentUser(normalizedUser);

    // Initialize session manager
    logger.debug("[LOGIN]", "Initializing session manager...");
    const sessionManager = sessionManagerModule.default;
    sessionManager.reset();
    sessionManager.initialize();

    logger.info("[LOGIN]", "Authentication initialization complete");

    return normalizedUser;

  } catch (error) {
    logger.error("[LOGIN]", "Failed to initialize auth:", error);
    throw error;
  }
}

/**
 * Clear authentication data on login page
 * This ensures clean state before login attempt
 */
export async function clearAuthBeforeLogin() {
  try {
    const { clearAuth } = await import('./auth-storage');
    const { clearCurrentUser } = await import('./rbac');
    
    clearAuth();
    clearCurrentUser();
    
    logger.debug("[LOGIN]", "Auth state cleared");
  } catch (error) {
    logger.warn("[LOGIN]", "Failed to clear auth state:", error);
    // Non-critical, continue anyway
  }
}
