import { getConfig, getConfigSync } from './config'
import { loadRegistry } from './api-registry'
import { getAuthHeader } from './auth-storage'
import { createCleanError, parseErrorMessage } from './error-parser'
import { addCSRFHeader } from '../utils/csrf'
import { redactSensitiveData } from '../utils/security'

// Lightweight notifier so services can signal UI without React import
const listeners = new Set()
export function notify(msg) {
  listeners.forEach(fn => fn(msg))
}
export function onNotify(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// simpan log ringan untuk debugging
window.__API_LOGS__ = window.__API_LOGS__ || [];
function logDebug(cfg, moduleName, info) {
  if (!cfg?.debug) return;
  
  // Redact sensitive data before logging or storing
  const safeInfo = {
    ...info,
    request: info.request ? redactSensitiveData(info.request) : null,
    response: info.response ? redactSensitiveData(info.response) : null
  };

  window.__API_LOGS__.push({ ts: Date.now(), module: moduleName, ...safeInfo });
  try {
    console.groupCollapsed(`[API][${moduleName}] ${info.method} ${info.url}`);
    safeInfo.request && console.log('request', safeInfo.request);
    safeInfo.response && console.log('response', safeInfo.response);
    info.error && console.error('error', info.error);
    console.groupEnd();
  } catch {}
}

/**
 * Convert backend URL to proxy URL in development
 * @param {string} url - Original URL
 * @returns {string} Proxied URL in dev, original URL in production
 */
function getProxiedUrl(url) {
  if (!url) return url;
  
  const isDev = import.meta.env.DEV;
  
  // Skip if already a proxy URL
  if (url.startsWith('/backend-api')) {
    return url;
  }
  
  // In development, convert backend URLs to use Vite proxy
  const pacsBackendUrl = import.meta.env.VITE_MAIN_PACS_API_BACKEND_URL || (isDev ? 'http://localhost:8888' : '');
  if (isDev && pacsBackendUrl && url.startsWith(pacsBackendUrl)) {
    const path = url.replace(pacsBackendUrl, '');
    console.debug(`[http] Converting to proxy URL: ${url} -> /backend-api${path}`);
    return `/backend-api${path}`;
  }
  
  return url;
}

function normalizeEnvToken(token) {
  if (!token || typeof token !== 'string') return null;
  // Remove any existing Bearer prefix to avoid duplication
  const cleanToken = token.replace(/^Bearer\s+/i, '');
  return `Bearer ${cleanToken}`;
}

function getModuleEnvToken(moduleName) {
  try {
    if (typeof import.meta === 'undefined' || !import.meta.env) return null;
    const env = import.meta.env;
    const key = moduleName
      ? `VITE_${moduleName.replace(/[^a-z0-9]/gi, '_').toUpperCase()}_API_TOKEN`
      : null;

    if (key && env[key]) {
      return normalizeEnvToken(env[key]);
    }

    if (env.VITE_API_FALLBACK_TOKEN) {
      return normalizeEnvToken(env.VITE_API_FALLBACK_TOKEN);
    }
  } catch (_) {
    // Ignore env access issues so we can fall back gracefully
  }
  return null;
}

export async function fetchJson(path, options={}) {
  const { apiBaseUrl, timeoutMs } = await getConfig()
  
  // Skip prepending apiBaseUrl ONLY if it's an absolute URL or already has the proxy prefix
  let url;
  if (path.startsWith('http') || path.startsWith('/backend-api')) {
    url = path;
  } else {
    // If apiBaseUrl is empty, default to /backend-api for routes that don't start with /api
    let prefix = apiBaseUrl || "";
    if (!prefix && !path.startsWith("/api")) {
      prefix = "/backend-api";
    }
    url = `${prefix}${path}`;
  }
  
  // Convert to proxy URL in development
  url = getProxiedUrl(url)

  const ctrl = new AbortController()
  const id = setTimeout(() => ctrl.abort(), timeoutMs)

  // Allow external signal to abort this request
  if (options.signal) {
    options.signal.addEventListener('abort', () => ctrl.abort());
  }

  const authHeader = getAuthHeader();
  console.debug('[HTTP] Auth Header:', { Authorization: authHeader.Authorization ? '[REDACTED]' : 'none' });

  const opt = {
    ...options,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...authHeader,
      ...(options.headers || {})
    },
    signal: ctrl.signal
  }

  try {
    const res = await fetch(url, opt)
    clearTimeout(id)
    if (!res.ok) {
      const text = await res.text().catch(()=> '')
      const rawErr = new Error(`HTTP ${res.status}: ${text}`)
      rawErr.status = res.status

      // Create clean error for user display
      throw createCleanError(rawErr, res.status)
    }
    return await res.json()
  } catch (e) {
    clearTimeout(id)

    // Normalize network/timeout error
    if (e.name === 'AbortError') {
      const err = new Error('Request timeout')
      err.code = 'ETIMEOUT'
      throw createCleanError(err)
    }

    if (e.message && e.message.includes('Failed to fetch')) {
      const err = new Error('Network error: backend unreachable')
      err.code = 'ENETWORK'
      throw createCleanError(err)
    }

    // If error is already clean, throw it
    if (e.originalError) {
      throw e
    }

    // Otherwise, create clean error
    throw createCleanError(e)
  }
}

export function apiClient(moduleName) {
  const registry = loadRegistry();
  let cfg = registry[moduleName];
  
  // Initialize default config if module not found or disabled
  if (!cfg) {
    console.warn(`Module '${moduleName}' not found in registry, using defaults`);
    cfg = {
      baseUrl: '',
      timeoutMs: 6000,
      debug: true
    };
  }
  
  // Temporarily disabled module validation to allow SatuSehat integration testing
  // if (!cfg.enabled) {
  //   throw new Error(`Module '${moduleName}' is disabled`);
  // }
  
  const baseUrl = (cfg.baseUrl || '').replace(/\/+$/, '');
  
  async function request(method, path, data = null) {
    // Special handling for SatuSehat endpoints
    let url;
    if (moduleName === 'satusehat') {
      const registry = loadRegistry();
      const satusehatConfig = registry.satusehat || {};

      // Use configured REST API URL from settings
      const restApiUrl = satusehatConfig.restApiUrl;
      if (!restApiUrl) {
        throw new Error('SatuSehat REST API URL not configured. Please check Integration settings.');
      }

      url = `${restApiUrl}${path}`;
    } else {
      // For other modules, use standard baseUrl
      // Skip baseUrl if path already contains a full proxy path or absolute URL
      if (path.startsWith('/backend-api') || path.startsWith('http')) {
        url = path;
      } else {
        const { apiBaseUrl } = getConfigSync();
        // If apiBaseUrl is empty, default to /backend-api for routes that don't start with /api
        // This ensures routes like /auth/verify or /patients go to the gateway
        let prefix = apiBaseUrl || "";
        
        // CRITICAL FIX: Always use /backend-api for specific auth endpoints 
        // if they don't already have it, to fix the 405 error in production
        const isAuthVerify = path === "/auth/verify" || path === "/auth/me" || path === "/me";
        
        if (!prefix && !path.startsWith("/api") && !path.startsWith("/backend-api")) {
          prefix = "/backend-api";
        } else if (isAuthVerify && !prefix.includes("/backend-api")) {
          // Force prefix for auth endpoints if not already proxied
          prefix = "/backend-api";
        }
        
        url = `${prefix}${baseUrl}${path}`;
      }

      // Convert to proxy URL in development
      url = getProxiedUrl(url);
    }
    console.debug(`[http] Constructed URL for ${moduleName}:`, url);

    // Choose auth scheme per-module:
    // 1. Check for Environment/System Override (System/Service Account)
    // 2. Check for Registry Config (if auth='basic' defined in registry)
    // 3. User Session (Bearer Token)
    let authHeaders = {};
    try {
      // 1. Environment/System Override
      // Allow any module to be configured with system credentials via ENV
      // Format: VITE_MODULENAME_AUTH_TYPE (basic, apikey, bearer)
      const envPrefix = `VITE_${moduleName.replace(/[^a-z0-9]/gi, '_').toUpperCase()}`;
      const authType = import.meta.env[`${envPrefix}_AUTH_TYPE`];



      // Handle 'system' auth type - auto-login with username/password to get JWT
      if (authType === 'system') {
        const { getSystemToken } = await import('./system-auth.js');
        const token = await getSystemToken(moduleName);
        
        if (token) {
          authHeaders = { Authorization: `Bearer ${token}` };
          console.debug(`[http] Using System JWT Token for ${moduleName}`);
        } else {
          console.warn(`[http] System auth configured for ${moduleName} but failed to get token`);
        }
      } else if (authType === 'basic') {
        const basicUser = import.meta.env[`${envPrefix}_BASIC_USER`];
        const basicPass = import.meta.env[`${envPrefix}_BASIC_PASS`];

        if (basicUser && basicPass) {
          const token = btoa(`${basicUser}:${basicPass}`);
          authHeaders = { Authorization: `Basic ${token}` };
          console.debug(`[http] Using System Basic Auth for ${moduleName}`);
        } else {
          console.warn(`[http] Basic auth configured for ${moduleName} but credentials missing in env`);
        }
      } else if (authType === 'apikey') {
        const apiKey = import.meta.env[`${envPrefix}_API_KEY`];
        const headerName = import.meta.env[`${envPrefix}_API_KEY_HEADER`] || 'X-API-Key';
        
        if (apiKey) {
          authHeaders = { [headerName]: apiKey };
          console.debug(`[http] Using System API Key for ${moduleName}`);
        }
      } else if (authType === 'bearer') {
         // Force a specific bearer token from env
         const token = import.meta.env[`${envPrefix}_TOKEN`];
         if (token) {
            authHeaders = { Authorization: normalizeEnvToken(token) };
            console.debug(`[http] Using System Bearer Token for ${moduleName}`);
         }
      }

      // If system auth was set, skip the rest (Priority #1)
      if (Object.keys(authHeaders).length > 0) {
        // success, do nothing more
      } 
      // 2. Registry Config (Legacy/Static Config)
      else if (cfg && cfg.auth === 'basic' && cfg.basicUser && cfg.basicPass) {
        const token = btoa(`${cfg.basicUser}:${cfg.basicPass}`);
        authHeaders = { Authorization: `Basic ${token}` };
      } 
      // 3. User Session (Standard User Auth)
      else {
        // Special case: satusehatMonitor fallback (maintain backward compatibility if not using generic pattern)
        if (moduleName === 'satusehatMonitor' && !authHeaders.Authorization) {
             const monitorAuthType = import.meta.env.VITE_SATUSEHAT_MONITOR_AUTH_TYPE;
             if (monitorAuthType === 'basic') {
                 // Try specific env vars if the generic ones weren't found
                 const basicUser = import.meta.env.VITE_SATUSEHAT_MONITOR_BASIC_USER;
                 const basicPass = import.meta.env.VITE_SATUSEHAT_MONITOR_BASIC_PASS;
                 if (basicUser && basicPass) {
                     const token = btoa(`${basicUser}:${basicPass}`);
                     authHeaders = { Authorization: `Basic ${token}` };
                 }
             }
        }

        // Use logged-in user's token if no system auth configured
        if (!authHeaders.Authorization && !Object.keys(authHeaders).length) {
            const storedAuth = getAuthHeader();
            if (storedAuth.Authorization) {
              authHeaders = storedAuth;
            } else {
              // Fall back to general fallback token
              const fallbackToken = getModuleEnvToken(moduleName);
              if (fallbackToken) {
                authHeaders = { Authorization: fallbackToken };
              }
            }
        }
      }
    } catch (err) {
      console.error(`[http] Error setting auth headers for ${moduleName}:`, err);
      // Try to get auth from storage as fallback
      const storedAuth = getAuthHeader();
      if (storedAuth.Authorization) {
        authHeaders = storedAuth;
      }
    }

    console.debug(`[http] Auth headers for ${moduleName}:`, { 
      hasAuth: !!authHeaders.Authorization,
      authScheme: authHeaders.Authorization?.split(' ')[0] || 'none'
    });
    

    
    // Add CSRF protection for state-changing methods
    const requiresCSRF = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    const csrfHeaders = requiresCSRF ? await addCSRFHeader() : {};

    // Global Tenant context for Superadmins
    const selectedTenantId = localStorage.getItem('superadmin_selected_tenant');
    const tenantHeader = selectedTenantId ? { 'X-Tenant-ID': selectedTenantId } : {};

    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...authHeaders,
        ...csrfHeaders,
        ...tenantHeader,
      },
    };

    
    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(data);
    }
    
    try {
      logDebug(cfg, moduleName, { method, url, request: data });
      
      console.debug(`[http] Making fetch request to ${url} with options:`, redactSensitiveData(options));

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), cfg.timeoutMs || 6000);
      
      options.signal = controller.signal;
      
      const response = await fetch(url, options);
      clearTimeout(timeoutId);
      
      console.debug(`[http] Fetch response received from ${url}:`, { status: response.status, ok: response.ok });

      if (!response.ok) {
        const errorText = await response.text();
        const rawErr = new Error(`HTTP ${response.status}: ${errorText}`);
        rawErr.status = response.status;

        // Create clean error
        const cleanError = createCleanError(rawErr, response.status);
        logDebug(cfg, moduleName, { method, url, error: cleanError.message });

        throw cleanError;
      }

      // Gracefully handle empty bodies (e.g., 204 No Content)
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
      logDebug(cfg, moduleName, { method, url, response: result });

      return result;
    } catch (error) {
      logDebug(cfg, moduleName, { method, url, error: error.message });

      if (error.name === 'AbortError') {
        const timeoutErr = new Error(`Request timeout for ${moduleName} module`);
        timeoutErr.code = 'ETIMEOUT';
        throw createCleanError(timeoutErr);
      }

      // If it's already a clean error, throw as-is (don't notify, let caller handle)
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

/**
 * Handle multipart file upload with progress tracking
 */
export async function uploadWithProgress(url, formData, onProgress) {
  return new Promise(async (resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    // Convert to proxy URL in development
    const finalUrl = getProxiedUrl(url);
    
    xhr.open('POST', finalUrl);

    // Add Auth headers
    const authHeaders = getAuthHeader();
    Object.entries(authHeaders).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value);
    });

    // Add CSRF header
    const csrfHeaders = await addCSRFHeader();
    Object.entries(csrfHeaders).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value);
    });

    // Add Tenant context if available
    const selectedTenantId = localStorage.getItem('superadmin_selected_tenant');
    if (selectedTenantId) {
      xhr.setRequestHeader('X-Tenant-ID', selectedTenantId);
    }

    // Progress handler
    if (onProgress && xhr.upload) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          onProgress(percentComplete);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          resolve(response);
        } catch (e) {
          resolve(xhr.responseText);
        }
      } else {
        const error = new Error(`Upload failed with status ${xhr.status}`);
        error.status = xhr.status;
        error.response = xhr.responseText;
        reject(error);
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error during upload'));
    };

    xhr.send(formData);
  });
}

