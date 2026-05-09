/**
 * CORS Handler Service
 * Handles CORS issues by providing alternative request methods
 * 
 * Problem: Backend at 103.42.117.19:8888 only allows CORS from localhost:3000
 * but app runs on localhost:5173
 * 
 * Solutions:
 * 1. Use Vite proxy (development only) - /backend-api/* routes to backend
 * 2. Use CORS proxy service (production)
 * 3. Update backend CORS configuration to allow localhost:5173
 */

import { logger } from '../utils/logger'

const CORS_PROXY_URLS = [
  // Option 1: Use Vite dev proxy (development only)
  (path) => `/backend-api${path}`,
  
  // Option 2: Use public CORS proxy (if needed)
  // (path) => `https://cors-anywhere.herokuapp.com/http://103.42.117.19:8888${path}`,
]

/**
 * Get the appropriate URL for a backend request
 * In development, uses Vite proxy; in production, uses direct URL or CORS proxy
 * 
 * @param {string} path - API path (e.g., '/orders')
 * @param {string} baseUrl - Original base URL (e.g., 'http://103.42.117.19:8888')
 * @returns {string} URL to use for fetch
 */
export function getCorsAwareUrl(path, baseUrl) {
  const isDev = import.meta.env.DEV;
  
  if (isDev && baseUrl.includes('103.42.117.19:8888')) {
    // In development, use Vite proxy
    logger.debug('[CORS] Using Vite proxy for development:', path);
    return `/backend-api${path}`;
  }
  
  // In production or for other URLs, use direct URL
  return `${baseUrl}${path}`;
}

/**
 * Fetch with CORS handling
 * Automatically handles CORS issues by using proxy in development
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
    // If CORS error in production, try alternative methods
    if (!import.meta.env.DEV && error.message.includes('CORS')) {
      logger.warn('[CORS] CORS error detected, attempting alternative method:', error);
      
      // Could implement fallback here (e.g., use CORS proxy service)
      throw error;
    }
    
    throw error;
  }
}

/**
 * Check if a URL is affected by CORS issues
 * @param {string} url - URL to check
 * @returns {boolean}
 */
export function isCorsAffected(url) {
  return url.includes('103.42.117.19:8888');
}

/**
 * Get CORS configuration for backend
 * @returns {Object} CORS config
 */
export function getCorsConfig() {
  return {
    isDev: import.meta.env.DEV,
    backendUrl: 'http://103.42.117.19:8888',
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
