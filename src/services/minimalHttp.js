/**
 * Minimal HTTP Client for Login
 * 
 * This is a stripped-down version of the full http client
 * that ONLY works for authentication endpoints.
 * It does NOT load the full api-registry.
 */

import { createCleanError } from './error-parser';
import { addCSRFHeader } from '../utils/csrf';

/**
 * Create a minimal API client for authentication
 * This client only knows about the auth endpoint and doesn't load full registry
 * 
 * @param {Object} authConfig - Minimal auth configuration
 * @returns {Object} HTTP client with get, post, put, delete methods
 */
export function createMinimalAuthClient(authConfig) {
  const baseUrl = (authConfig.baseUrl || '/backend-api').replace(/\/+$/, '');
  const timeoutMs = authConfig.timeoutMs || 6000;

  async function request(method, path, data = null) {
    const url = `${baseUrl}${path}`;

    console.debug(`[minimal-http] ${method} ${url}`);

    // Add CSRF protection for state-changing methods
    // Skip CSRF for login endpoint specifically to avoid 500 errors when no session exists yet
    const isLoginEndpoint = path.endsWith('/login') || path.includes('/auth/login');
    const requiresCSRF = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && !isLoginEndpoint;
    const csrfHeaders = requiresCSRF ? await addCSRFHeader() : {};

    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...csrfHeaders,
      },
    };

    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(data);
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      options.signal = controller.signal;

      const response = await fetch(url, options);
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        const rawErr = new Error(`HTTP ${response.status}: ${errorText}`);
        rawErr.status = response.status;

        throw createCleanError(rawErr, response.status);
      }

      // Parse response
      let result;
      const raw = await response.text();
      if (!raw) {
        result = response.status === 204 ? { status: 'success' } : {};
      } else {
        try {
          result = JSON.parse(raw);
        } catch (_) {
          result = raw;
        }
      }

      return result;
    } catch (error) {
      if (error.name === 'AbortError') {
        const timeoutErr = new Error(`Request timeout`);
        timeoutErr.code = 'ETIMEOUT';
        throw createCleanError(timeoutErr);
      }

      // If it's already a clean error, throw as-is
      if (error.originalError) {
        throw error;
      }

      // Create clean error for unexpected errors
      throw createCleanError(error);
    }
  }

  return {
    get: (path) => request('GET', path),
    post: (path, data) => request('POST', path, data),
    put: (path, data) => request('PUT', path, data),
    patch: (path, data) => request('PATCH', path, data),
    delete: (path) => request('DELETE', path),
  };
}
