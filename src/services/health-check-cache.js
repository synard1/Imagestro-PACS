// src/services/health-check-cache.js
// Centralized health check service with caching and deduplication

const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes cache (reduced from 30s to minimize health checks)
const healthCache = new Map(); // { endpointUrl: { status, timestamp } }
const pendingChecks = new Map(); // { endpointUrl: Promise }

/**
 * Get endpoint URL for a module
 * Normalized to relative paths to avoid issues with absolute URLs/IPs
 * @param {Object} config - Module config
 * @returns {string} Full endpoint URL
 */
function getEndpointUrl(config) {
  if (!config.healthPath) return null;
  let baseUrl = config.baseUrl?.trim() || "";
  const healthPath = config.healthPath || "/api/health";
  
  // Generic stripping of any absolute URL (http://... or https://...)
  if (baseUrl.startsWith('http')) {
    try {
      const urlObj = new URL(baseUrl);
      baseUrl = urlObj.pathname.replace(/\/+$/, "");
    } catch (e) {
      baseUrl = ""; // Fallback for invalid URLs
    }
  } else {
    baseUrl = baseUrl.replace(/\/+$/, "");
  }
  
  // Special case: if baseUrl is empty (or was stripped), use working gateway paths
  if (!baseUrl) {
    // If it's a PACS module (usually starts with /api), use the relative /api path
    if (healthPath.startsWith('/api')) return healthPath;
    // Otherwise fallback to /backend-api for gateway-level checks
    return `/backend-api${healthPath.startsWith('/') ? '' : '/'}${healthPath}`;
  }

  return `${baseUrl}${healthPath}`;
}

/**
 * Get cached health status
 * @param {string} endpointUrl - Endpoint URL
 * @returns {Object|null} Cached status or null if expired/not found
 */
function getCachedHealth(endpointUrl) {
  const cached = healthCache.get(endpointUrl);
  
  if (!cached) {
    return null;
  }
  
  // Check if cache is still valid
  if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
    const secondsLeft = Math.floor((CACHE_TTL_MS - (Date.now() - cached.timestamp)) / 1000);
    console.debug(`[health-check] Cache hit for '${endpointUrl}' (expires in ${secondsLeft}s)`);
    return cached.status;
  }
  
  // Cache expired
  console.debug(`[health-check] Cache expired for '${endpointUrl}'`);
  healthCache.delete(endpointUrl);
  return null;
}

/**
 * Save health status to cache
 * @param {string} endpointUrl - Endpoint URL
 * @param {Object} status - Health status
 */
function setCachedHealth(endpointUrl, status) {
  healthCache.set(endpointUrl, {
    status,
    timestamp: Date.now()
  });
  console.debug(`[health-check] Cached status for '${endpointUrl}':`, status.healthy ? 'healthy' : 'unhealthy');
}

/**
 * Perform actual health check
 * @param {string} moduleName - Module name
 * @param {Object} config - Module config
 * @returns {Promise<Object>} Health status
 */
async function performHealthCheck(moduleName, config) {
  // Special handling for satusehat module - disabled to prevent automatic token generation
  if (moduleName === 'satusehat') {
    return { healthy: false, error: "Health check disabled for SatuSehat" };
  }
  
  // Skip health check for modules without healthPath
  if (!config.healthPath) {
    return { healthy: false, error: "Health check not supported" };
  }
  
  if (!config.enabled) {
    return { healthy: false, error: "Disabled" };
  }
  
  try {
    const startTime = Date.now();
    const url = getEndpointUrl(config);
    
    if (!url) {
      return { healthy: false, error: "Invalid endpoint URL" };
    }
    
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), config.timeoutMs || 6000);
    
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: "no-store",
    });
    
    clearTimeout(timeout);
    const responseTime = Date.now() - startTime;
    
    return res.ok 
      ? { healthy: true, responseTime } 
      : { healthy: false, error: `HTTP ${res.status}`, responseTime };
  } catch (error) {
    return { 
      healthy: false, 
      error: error.name === 'AbortError' ? 'Timeout' : error.message 
    };
  }
}

/**
 * Check module health with caching and deduplication
 * @param {string} moduleName - Module name
 * @param {Object} config - Module config
 * @returns {Promise<Object>} Health status
 */
export async function checkModuleHealth(moduleName, config) {
  const endpointUrl = getEndpointUrl(config);
  
  // If no endpoint URL, return error immediately
  if (!endpointUrl) {
    return { healthy: false, error: "Health check not supported" };
  }
  
  // Check cache first (by endpoint URL, not module name)
  const cached = getCachedHealth(endpointUrl);
  if (cached !== null) {
    return cached;
  }
  
  // Check if health check is already in progress for this endpoint
  if (pendingChecks.has(endpointUrl)) {
    console.debug(`[health-check] Health check already in progress for '${endpointUrl}', waiting...`);
    return await pendingChecks.get(endpointUrl);
  }
  
  // Start new health check
  console.debug(`[health-check] Checking health for '${moduleName}' at '${endpointUrl}'...`);
  const promise = performHealthCheck(moduleName, config)
    .then(status => {
      // Cache the result by endpoint URL
      setCachedHealth(endpointUrl, status);
      return status;
    })
    .finally(() => {
      // Remove from pending checks
      pendingChecks.delete(endpointUrl);
    });
  
  // Store promise to prevent duplicate requests
  pendingChecks.set(endpointUrl, promise);
  
  return await promise;
}

/**
 * Check health for all modules
 * @param {Object} registry - Module registry
 * @returns {Promise<Object>} Health status for all modules
 */
export async function checkAllModulesHealth(registry) {
  const entries = await Promise.all(
    Object.entries(registry).map(async ([moduleName, config]) => [
      moduleName,
      await checkModuleHealth(moduleName, config),
    ])
  );
  
  return Object.fromEntries(entries);
}

/**
 * Clear health cache for specific endpoint or all
 * @param {string} endpointUrl - Endpoint URL (optional)
 */
export function clearHealthCache(endpointUrl) {
  if (endpointUrl) {
    healthCache.delete(endpointUrl);
    console.debug(`[health-check] Cleared cache for '${endpointUrl}'`);
  } else {
    healthCache.clear();
    console.debug('[health-check] Cleared all health cache');
  }
}

/**
 * Get cache info for debugging
 * @returns {Object} Cache statistics
 */
export function getHealthCacheInfo() {
  const entries = Array.from(healthCache.entries()).map(([endpointUrl, data]) => {
    const age = Date.now() - data.timestamp;
    const ageSeconds = Math.floor(age / 1000);
    
    return {
      endpointUrl,
      healthy: data.status.healthy,
      ageSeconds,
      expiresIn: Math.max(0, Math.floor((CACHE_TTL_MS - age) / 1000))
    };
  });
  
  return {
    totalCached: entries.length,
    entries,
    pendingChecks: Array.from(pendingChecks.keys())
  };
}
