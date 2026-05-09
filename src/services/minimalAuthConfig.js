/**
 * Minimal Auth Configuration for Login Page
 * 
 * This file contains ONLY the essential auth configuration needed for login.
 * It does NOT expose:
 * - Full API registry
 * - Backend URLs
 * - Service endpoints
 * - Health check paths
 * - Any other sensitive configuration
 * 
 * Full registry is lazy-loaded AFTER successful authentication.
 */

/**
 * Get minimal auth configuration for login
 * This reads from environment variables and localStorage if needed
 * 
 * @returns {Object} Minimal auth config
 */
export function getMinimalAuthConfig() {
  // Check if auth is enabled from localStorage (minimal check)
  let authEnabled = true; // Default to enabled
  
  try {
    const stored = localStorage.getItem('api.registry.v6');
    if (stored) {
      const parsed = JSON.parse(stored);
      authEnabled = parsed.auth?.enabled !== false;
    }
  } catch {
    // If error, assume enabled
    authEnabled = true;
  }

  return {
    enabled: authEnabled,
    baseUrl: "/backend-api", // Always use proxy, never expose real backend URL
    loginPath: "/auth/login",
    timeoutMs: 6000
  };
}

/**
 * Check if authentication is enabled
 * @returns {boolean}
 */
export function isAuthEnabled() {
  const config = getMinimalAuthConfig();
  return config.enabled;
}
