/**
 * Khanza SIMRS Configuration
 * 
 * This module provides configuration for Khanza SIMRS integration
 * Configuration can be loaded from environment variables or registry
 */

/**
 * Get Khanza configuration from environment variables
 * @returns {Object} Khanza configuration
 */
export const getKhanzaEnvConfig = () => {
  return {
    baseUrl: import.meta.env.VITE_KHANZA_BASE_URL || 'http://localhost:3007',
    apiKey: import.meta.env.VITE_KHANZA_API_KEY || '',
    timeoutMs: parseInt(import.meta.env.VITE_KHANZA_TIMEOUT_MS || '30000', 10),
    healthPath: import.meta.env.VITE_KHANZA_HEALTH_PATH || '/health',
    debug: import.meta.env.VITE_KHANZA_DEBUG === 'true',
  };
};

/**
 * Check if Khanza is configured via environment variables
 * @returns {boolean}
 */
export const isKhanzaConfiguredViaEnv = () => {
  return !!(import.meta.env.VITE_KHANZA_BASE_URL || import.meta.env.VITE_KHANZA_API_KEY);
};

export default {
  getKhanzaEnvConfig,
  isKhanzaConfiguredViaEnv,
};
