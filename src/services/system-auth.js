// src/services/system-auth.js
// System-level authentication for service accounts (e.g., settings client)
// This allows the frontend to authenticate with system credentials independently
// of the logged-in user's session

const STORAGE_KEY = 'system_auth_token';
const STORAGE_EXPIRY_KEY = 'system_auth_expiry';

let systemTokenCache = null;
let systemTokenExpiry = null;
let loginPromise = null; // Track ongoing login request

/**
 * Initialize token from localStorage on module load
 */
function initializeFromStorage() {
  try {
    const storedToken = localStorage.getItem(STORAGE_KEY);
    const storedExpiry = localStorage.getItem(STORAGE_EXPIRY_KEY);
    
    if (storedToken && storedExpiry) {
      const expiryTime = parseInt(storedExpiry, 10);
      
      // Check if stored token is still valid
      if (Date.now() < expiryTime) {
        systemTokenCache = storedToken;
        systemTokenExpiry = expiryTime;
        
        const minutesLeft = Math.floor((expiryTime - Date.now()) / 1000 / 60);
        console.log(`[system-auth] ✓ Restored token from localStorage (expires in ${minutesLeft} minutes)`);
      } else {
        // Token expired, clear storage
        console.log('[system-auth] Stored token expired, clearing...');
        clearStoredToken();
      }
    }
  } catch (error) {
    console.warn('[system-auth] Failed to restore token from storage:', error);
    clearStoredToken();
  }
}

/**
 * Save token to localStorage
 */
function saveTokenToStorage(token, expiry) {
  try {
    localStorage.setItem(STORAGE_KEY, token);
    localStorage.setItem(STORAGE_EXPIRY_KEY, expiry.toString());
    console.debug('[system-auth] Token saved to localStorage');
  } catch (error) {
    console.warn('[system-auth] Failed to save token to storage:', error);
  }
}

/**
 * Clear token from localStorage
 */
function clearStoredToken() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_EXPIRY_KEY);
    console.debug('[system-auth] Token cleared from localStorage');
  } catch (error) {
    console.warn('[system-auth] Failed to clear token from storage:', error);
  }
}


/**
 * Get system authentication token for a specific module
 * Automatically handles login and token refresh
 * @param {string} moduleName - Module name (e.g., 'settings')
 * @returns {Promise<string|null>} Bearer token or null
 */
export async function getSystemToken(moduleName) {
  const envPrefix = `VITE_${moduleName.replace(/[^a-z0-9]/gi, '_').toUpperCase()}`;
  const authType = import.meta.env[`${envPrefix}_AUTH_TYPE`];
  
  // Only handle 'system' auth type for auto-login
  if (authType !== 'system') {
    return null;
  }
  
  const username = import.meta.env[`${envPrefix}_SYSTEM_USER`];
  const password = import.meta.env[`${envPrefix}_SYSTEM_PASS`];
  
  if (!username || !password) {
    console.warn(`[system-auth] System credentials not configured for ${moduleName}`);
    return null;
  }
  
  // Check if we have a valid cached token (in memory or from storage)
  if (systemTokenCache && systemTokenExpiry && Date.now() < systemTokenExpiry) {
    const minutesLeft = Math.floor((systemTokenExpiry - Date.now()) / 1000 / 60);
    console.debug(`[system-auth] Using cached token for ${moduleName} (expires in ${minutesLeft} minutes)`);
    return systemTokenCache;
  }
  
  // Token expired, clear cache and storage
  if (systemTokenCache && systemTokenExpiry && Date.now() >= systemTokenExpiry) {
    console.log('[system-auth] Token expired, clearing cache and storage...');
    clearStoredToken();
    systemTokenCache = null;
    systemTokenExpiry = null;
  }
  
  // If login is already in progress, wait for it
  if (loginPromise) {
    console.debug(`[system-auth] Login already in progress for ${moduleName}, waiting...`);
    return await loginPromise;
  }
  
  // Start new login
  loginPromise = performLogin(moduleName, username, password);
  
  try {
    const token = await loginPromise;
    return token;
  } finally {
    // Clear login promise after completion (success or failure)
    loginPromise = null;
  }
}

/**
 * Perform actual login request
 * @private
 */
async function performLogin(moduleName, username, password) {
  try {
    console.log(`[system-auth] Logging in as system user for ${moduleName}...`);
    
    const loginUrl = '/backend-api/auth/login';
    const response = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[system-auth] Login failed for ${moduleName}:`, response.status, errorText);
      return null;
    }
    
    const data = await response.json();
    
    if (!data.access_token) {
      console.error(`[system-auth] No access_token in login response for ${moduleName}`);
      return null;
    }
    
    // Cache the token in memory
    systemTokenCache = data.access_token;
    
    // Set expiry to 80% of the token's lifetime to ensure refresh before expiry
    const expiresIn = data.expires_in || 86400; // Default 24 hours
    systemTokenExpiry = Date.now() + (expiresIn * 1000 * 0.8);
    
    // Save to localStorage for persistence across page refreshes
    saveTokenToStorage(systemTokenCache, systemTokenExpiry);
    
    const expiryMinutes = Math.floor(expiresIn * 0.8 / 60);
    const expiryTime = new Date(systemTokenExpiry).toLocaleTimeString();
    console.log(`[system-auth] ✓ Successfully logged in as system user for ${moduleName}`);
    console.log(`[system-auth] Token cached (memory + localStorage), will refresh in ${expiryMinutes} minutes (${expiryTime})`);
    
    return systemTokenCache;
  } catch (error) {
    console.error(`[system-auth] Error during system login for ${moduleName}:`, error);
    return null;
  }
}

/**
 * Clear cached system token (useful for testing or logout)
 */
export function clearSystemToken() {
  systemTokenCache = null;
  systemTokenExpiry = null;
  clearStoredToken();
  console.log('[system-auth] System token cache cleared (memory + localStorage)');
}

/**
 * Check if system auth is configured for a module
 * @param {string} moduleName - Module name
 * @returns {boolean}
 */
export function isSystemAuthConfigured(moduleName) {
  const envPrefix = `VITE_${moduleName.replace(/[^a-z0-9]/gi, '_').toUpperCase()}`;
  const authType = import.meta.env[`${envPrefix}_AUTH_TYPE`];
  const username = import.meta.env[`${envPrefix}_SYSTEM_USER`];
  const password = import.meta.env[`${envPrefix}_SYSTEM_PASS`];
  
  return authType === 'system' && !!username && !!password;
}

/**
 * Get token info (for debugging)
 * @returns {Object} Token info
 */
export function getSystemTokenInfo() {
  return {
    hasToken: !!systemTokenCache,
    expiresAt: systemTokenExpiry ? new Date(systemTokenExpiry).toLocaleString() : null,
    minutesLeft: systemTokenExpiry ? Math.floor((systemTokenExpiry - Date.now()) / 1000 / 60) : null,
    isValid: systemTokenCache && systemTokenExpiry && Date.now() < systemTokenExpiry,
    source: systemTokenCache ? 'cache' : 'none'
  };
}

// Initialize token from storage when module loads
initializeFromStorage();
