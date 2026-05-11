/**
 * CORS Handler Service
 * Handles CORS issues by providing alternative request methods
 *
 * Solutions:
 * 1. Use Vite proxy (development only) - /backend-api/* routes to backend
 * 2. Use CORS proxy service (production)
 * 3. Update backend CORS configuration to allow the app origin
 */

import { logger } from '../utils/logger'
import { getPacsBackendUrl } from '../config/endpoints'

const CORS_PROXY_URLS = [
  // Use Vite dev proxy (development only)
  (path) => `/backend-api${path}`,
]

/**
 * Get the appropriate URL for a backend request.
 * In development, uses Vite proxy; in production, uses direct URL.
 *
 * @param {string} path - API path (e.g., '/orders')
 * @param {string} baseUrl - Original base URL from caller
 * @returns {string} URL to use for fetch
 */
export function getCorsAwareUrl(path, baseUrl) {
  const isDev = import.meta.env.DEV;
  const pacsBackend = getPacsBackendUrl();

  if (isDev && baseUrl && pacsBackend && baseUrl.startsWith(pacsBackend)) {
    logger.debug('[CORS] Using Vite proxy for development:', path);
    return `/backend-api${path}`;
  }

  return `${baseUrl}${path}`;
}

/**
 * Fetch with CORS handling.
 * Automatically handles CORS issues by using proxy in development.
 *
 * @param {string} url - Full URL or path
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>}
 */
export async function fetchWithCorsHandling(url, options = {}) {
  try {
    const response = await fetch(url, options);
    return response;
  } catch (error) {
    if (!import.meta.env.DEV && error.message.includes('CORS')) {
      logger.warn('[CORS] CORS error detected, attempting alternative method:', error);
      throw error;
    }
    throw error;
  }
}

/**
 * Check if a URL is the configured PACS backend URL.
 * @param {string} url - URL to check
 * @returns {boolean}
 */
export function isCorsAffected(url) {
  const pacsBackend = getPacsBackendUrl();
  return !!pacsBackend && url.includes(pacsBackend);
}

/**
 * Get CORS configuration for backend.
 * @returns {Object} CORS config
 */
export function getCorsConfig() {
  return {
    isDev: import.meta.env.DEV,
    backendUrl: getPacsBackendUrl(),
    appUrl: window.location.origin,
    proxyPath: '/backend-api',
    corsAffected: true,
    solution: import.meta.env.DEV ? 'vite-proxy' : 'backend-cors-config'
  };
}

export default {
  getCorsAwareUrl,
  fetchWithCorsHandling,
  isCorsAffected,
  getCorsConfig
};
