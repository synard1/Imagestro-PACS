/**
 * CSRF (Cross-Site Request Forgery) Protection
 * Fetches and validates CSRF tokens from backend with proper authentication
 */

const CSRF_TOKEN_KEY = 'csrf_token';
const CSRF_EXPIRY_KEY = 'csrf_token_expiry';
// Use relative path by default for remote deployments
const API_BASE_URL = import.meta.env.VITE_MAIN_API_BACKEND_URL || '';

/**
 * Get authentication token from storage
 * Checks both legacy 'token' key and new 'auth.session.v1' structure
 * @returns {string|null} JWT token
 */
const getAuthToken = () => {
  // Try simple token key first (legacy)
  let token = localStorage.getItem('token');
  if (token) return token;

  // Try auth session storage (new standard)
  try {
    const sessionStr = localStorage.getItem('auth.session.v1');
    if (sessionStr) {
      const session = JSON.parse(sessionStr);
      if (session && session.access_token) {
        return session.access_token;
      }
    }
  } catch (e) {
    console.error('[CSRF] Failed to parse auth session:', e);
  }

  return null;
};

/**
 * Get authentication headers for CSRF requests
 * @returns {Object} Headers with authentication
 */
const getAuthHeaders = () => {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  // Get JWT token
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Add Tenant context for Superadmins (must match http.js logic)
  const selectedTenantId = localStorage.getItem('superadmin_selected_tenant');
  if (selectedTenantId) {
    headers['X-Tenant-ID'] = selectedTenantId;
  }

  return headers;
};

/**
 * Fetch a new CSRF token from backend
 * @returns {Promise<string>} CSRF token
 */
let _csrfFetchPromise = null; // Deduplication promise

export const fetchCSRFToken = async () => {
  // If there's already a fetch in progress, return that promise
  if (_csrfFetchPromise) {
    console.debug('[CSRF] Deduplicating concurrent token fetch request');
    return _csrfFetchPromise;
  }

  // Create new fetch promise
  _csrfFetchPromise = (async () => {
    try {
      const url = `${API_BASE_URL}/api/csrf/token`;
      const headers = getAuthHeaders();
      
      console.debug('[CSRF] Fetching token from:', url);
      console.debug('[CSRF] Request headers:', headers);
      
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers,
      });
      
      console.debug('[CSRF] Response status:', response.status);
      
      if (!response.ok) {
        // Don't throw error for 401 - just log it
        if (response.status === 401) {
          console.debug('[CSRF] Token fetch requires authentication - will retry after login');
          return null;
        }
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error('[CSRF] Failed to fetch token:', response.status, errorText);
        throw new Error(`Failed to fetch CSRF token: ${response.status}`);
      }
      
      const data = await response.json();
      const token = data.token;
      const expiresIn = data.expires_in || 3600; // Default 1 hour
      
      console.debug('[CSRF] Token received:', {
        tokenPreview: token ? token.substring(0, 20) + '...' : 'null',
        expiresIn: expiresIn + 's'
      });
      
      // Store token and expiry time
      sessionStorage.setItem(CSRF_TOKEN_KEY, token);
      const expiryTime = Date.now() + (expiresIn * 1000);
      sessionStorage.setItem(CSRF_EXPIRY_KEY, expiryTime.toString());
      
      console.debug('[CSRF] ✅ Token fetched and cached successfully');
      return token;
    } catch (error) {
      console.error('[CSRF] ❌ Error fetching token:', error);
      // Don't throw - return null to allow graceful degradation
      return null;
    } finally {
      // Clear the promise after completion
      _csrfFetchPromise = null;
    }
  })();

  return _csrfFetchPromise;
};

/**
 * Check if current token is expired
 * @returns {boolean} True if expired
 */
const isTokenExpired = () => {
  const expiryTime = sessionStorage.getItem(CSRF_EXPIRY_KEY);
  if (!expiryTime) return true;
  
  return Date.now() >= parseInt(expiryTime);
};

/**
 * Get current CSRF token from sessionStorage
 * Fetches new token if none exists or expired
 * @returns {Promise<string|null>} CSRF token or null if unavailable
 */
export const getCSRFToken = async () => {
  // Check if user is authenticated first
  const authToken = getAuthToken();
  if (!authToken) {
    console.debug('[CSRF] User not authenticated, skipping token fetch');
    return null;
  }
  
  // Get existing token from sessionStorage
  let token = sessionStorage.getItem(CSRF_TOKEN_KEY);
  
  // If token exists and not expired, return it immediately
  if (token && !isTokenExpired()) {
    console.debug('[CSRF] Using cached token from sessionStorage');
    return token;
  }
  
  // Token missing or expired - fetch new one
  if (token && isTokenExpired()) {
    console.debug('[CSRF] Token expired, fetching new token...');
  } else {
    console.debug('[CSRF] Token missing, fetching new token...');
  }
  
  token = await fetchCSRFToken();
  
  return token;
};

/**
 * Refresh CSRF token (call after login/logout)
 * @returns {Promise<string|null>} New CSRF token or null
 */
export const refreshCSRFToken = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/csrf/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: getAuthHeaders(),
    });
    
    if (!response.ok) {
      // Don't throw error for 401 - just log it
      if (response.status === 401) {
        console.debug('CSRF token refresh requires authentication');
        return null;
      }
      throw new Error(`Failed to refresh CSRF token: ${response.status}`);
    }
    
    const data = await response.json();
    const token = data.token;
    const expiresIn = data.expires_in || 3600;
    
    // Store token and expiry time
    sessionStorage.setItem(CSRF_TOKEN_KEY, token);
    const expiryTime = Date.now() + (expiresIn * 1000);
    sessionStorage.setItem(CSRF_EXPIRY_KEY, expiryTime.toString());
    
    return token;
  } catch (error) {
    console.error('Error refreshing CSRF token:', error);
    // Fallback to fetch if refresh fails
    return fetchCSRFToken();
  }
};

/**
 * Clear CSRF token (call on logout)
 */
export const clearCSRFToken = () => {
  sessionStorage.removeItem(CSRF_TOKEN_KEY);
  sessionStorage.removeItem(CSRF_EXPIRY_KEY);
};

/**
 * Add CSRF token to request headers
 * @param {Object} headers - Existing headers object
 * @returns {Promise<Object>} Headers with CSRF token (if available)
 */
export const addCSRFHeader = async (headers = {}) => {
  console.debug('[CSRF] addCSRFHeader called, fetching token...');
  const token = await getCSRFToken();
  
  // Only add header if token is available
  if (token) {
    console.debug('[CSRF] ✅ Token attached to headers:', token.substring(0, 20) + '...');
    return {
      ...headers,
      'X-CSRF-Token': token
    };
  }
  
  // Return headers without CSRF token if unavailable
  console.warn('[CSRF] ⚠️ No token available - headers returned WITHOUT CSRF token!');
  console.warn('[CSRF] Auth status:', {
    hasJWT: !!getAuthToken(),
    hasCSRFInSession: !!sessionStorage.getItem(CSRF_TOKEN_KEY),
    csrfExpiry: sessionStorage.getItem(CSRF_EXPIRY_KEY)
  });
  return headers;
};

/**
 * CSRF-protected fetch wrapper
 * Automatically adds CSRF token to requests
 * @param {string} url - Request URL
 * @param {Object} options - Fetch options
 * @returns {Promise} Fetch response
 */
export const csrfFetch = async (url, options = {}) => {
  const method = (options.method || 'GET').toUpperCase();
  
  // Only add CSRF for state-changing methods
  const requiresCSRF = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  
  if (requiresCSRF) {
    // Add CSRF token to headers
    options.headers = await addCSRFHeader(options.headers);
  }
  
  return fetch(url, options);
};

/**
 * Initialize CSRF protection
 * Call this on app startup (after authentication)
 */
export const initCSRFProtection = async () => {
  try {
    // Only fetch token if user is authenticated
    const token = getAuthToken();
    if (!token) {
      console.debug('CSRF protection: Skipping initialization (not authenticated)');
      return;
    }

    // Fetch initial token
    await getCSRFToken();
    
    // Refresh token periodically (every 30 minutes)
    setInterval(async () => {
      try {
        // Only refresh if still authenticated
        const currentToken = getAuthToken();
        if (currentToken) {
          await refreshCSRFToken();
        }
      } catch (error) {
        console.error('Failed to refresh CSRF token:', error);
      }
    }, 30 * 60 * 1000); // 30 minutes
    
  } catch (error) {
    console.error('Failed to initialize CSRF protection:', error);
  }
};

/**
 * Reinitialize CSRF protection after login
 * Call this after successful authentication
 */
export const reinitCSRFProtection = async () => {
  try {
    console.debug('CSRF protection: Reinitializing after login');
    await fetchCSRFToken();
  } catch (error) {
    console.error('Failed to reinitialize CSRF protection:', error);
  }
};
