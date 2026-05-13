/**
 * Minimal Login Service
 */

import { createMinimalAuthClient } from "./minimalHttp";
import { logger } from "../utils/logger";

/**
 * Perform login with username and password
 *
 * @param {string} username - Username
 * @param {string} password - Password
 * @param {Object} [options] - Extra options (e.g., headers)
 * @returns {Promise<Object>} Login response with tokens and user data
 */
export async function performLogin(username, password, options = {}) {
  try {
    if (!username || !username.trim() || !password || !password.trim()) {
      throw new Error('Username and password are required');
    }

    const { getMinimalAuthConfig } = await import('./minimalAuthConfig');
    const authConfig = getMinimalAuthConfig();

    if (!authConfig || !authConfig.enabled) {
      throw new Error('Authentication module is not enabled.');
    }

    // Pass extra headers from options to client
    const client = createMinimalAuthClient(authConfig, options.headers || {});
    const loginPath = authConfig.loginPath || "/auth/login";

    logger.info("[LOGIN]", "Attempting login...");

    const response = await client.post(loginPath, {
      username,
      password,
    });

    if (!response.access_token) {
      throw new Error("Invalid login response: missing access_token");
    }

    return {
      access_token: response.access_token,
      refresh_token: response.refresh_token,
      token_type: response.token_type || "Bearer",
      expires_in: response.expires_in || 3600,
      user: response.user || response.data?.user || null
    };
  } catch (error) {
    logger.error("[LOGIN]", "Login failed:", error.originalError || error);
    throw error;
  }
}

export async function initializeAuthAfterLogin(loginResponse) {
  try {
    logger.info("[LOGIN]", "Initializing authentication services...");

    const [
      { setAuth },
      { setCurrentUser },
      sessionManagerModule
    ] = await Promise.all([
      import('./auth-storage'),
      import('./rbac'),
      import('./sessionManager')
    ]);

    setAuth({
      access_token: loginResponse.access_token,
      refresh_token: loginResponse.refresh_token,
      token_type: loginResponse.token_type || 'Bearer',
      expires_in: +loginResponse.expires_in || 0,
      user: loginResponse.user
    });

    let userData = loginResponse.user;
    if (!userData) {
      try {
        const { getCurrentUserFromBackend } = await import('./authService');
        userData = await getCurrentUserFromBackend();
      } catch (err) {
        userData = { id: "temp-" + Date.now(), name: "User", role: "user", permissions: [] };
      }
    }

    const normalizedUser = {
      ...userData,
      id: userData.id || userData.user_id || null,
      name: userData.name || userData.username || userData.full_name || "User",
      role: userData.role || "user",
      permissions: Array.isArray(userData.permissions) ? userData.permissions : [],
    };

    setCurrentUser(normalizedUser);
    sessionManagerModule.default.reset();
    sessionManagerModule.default.initialize();

    return normalizedUser;
  } catch (error) {
    logger.error("[LOGIN]", "Failed to initialize auth:", error);
    throw error;
  }
}

export async function clearAuthBeforeLogin() {
  try {
    const { clearAuth } = await import('./auth-storage');
    const { clearCurrentUser } = await import('./rbac');
    clearAuth();
    clearCurrentUser();
  } catch (error) {}
}
