// src/services/settings-cache.js
// Centralized caching layer for settings with localStorage persistence

const CACHE_PREFIX = 'settings_cache_';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes default TTL

// Track ongoing requests to prevent duplicates
const pendingRequests = new Map();

/**
 * Get cached data from localStorage
 * @param {string} key - Cache key
 * @param {number} ttlMs - Time to live in milliseconds
 * @returns {any|null} Cached data or null if expired/not found
 */
export function getCachedData(key, ttlMs = CACHE_TTL_MS) {
  try {
    const cacheKey = CACHE_PREFIX + key;
    const cached = localStorage.getItem(cacheKey);
    
    if (!cached) {
      return null;
    }
    
    const { data, timestamp } = JSON.parse(cached);
    
    // Check if cache is still valid
    if (Date.now() - timestamp < ttlMs) {
      const minutesLeft = Math.floor((ttlMs - (Date.now() - timestamp)) / 1000 / 60);
      console.debug(`[settings-cache] Cache hit for '${key}' (expires in ${minutesLeft} minutes)`);
      return data;
    }
    
    // Cache expired
    console.debug(`[settings-cache] Cache expired for '${key}'`);
    localStorage.removeItem(cacheKey);
    return null;
  } catch (error) {
    console.warn(`[settings-cache] Error reading cache for '${key}':`, error);
    return null;
  }
}

/**
 * Save data to cache (localStorage)
 * @param {string} key - Cache key
 * @param {any} data - Data to cache
 */
export function setCachedData(key, data) {
  try {
    const cacheKey = CACHE_PREFIX + key;
    const cacheData = {
      data,
      timestamp: Date.now()
    };
    
    localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    console.debug(`[settings-cache] Cached '${key}'`);
  } catch (error) {
    console.warn(`[settings-cache] Error saving cache for '${key}':`, error);
  }
}

/**
 * Clear specific cache entry
 * @param {string} key - Cache key
 */
export function clearCachedData(key) {
  try {
    const cacheKey = CACHE_PREFIX + key;
    localStorage.removeItem(cacheKey);
    console.debug(`[settings-cache] Cleared cache for '${key}'`);
  } catch (error) {
    console.warn(`[settings-cache] Error clearing cache for '${key}':`, error);
  }
}

/**
 * Clear all settings cache
 */
export function clearAllSettingsCache() {
  try {
    const keys = Object.keys(localStorage);
    let cleared = 0;
    
    keys.forEach(key => {
      if (key.startsWith(CACHE_PREFIX)) {
        localStorage.removeItem(key);
        cleared++;
      }
    });
    
    console.log(`[settings-cache] Cleared ${cleared} cache entries`);
  } catch (error) {
    console.warn('[settings-cache] Error clearing all cache:', error);
  }
}

/**
 * Fetch with deduplication - prevents multiple concurrent requests for the same data
 * @param {string} key - Unique key for this request
 * @param {Function} fetchFn - Async function that fetches the data
 * @param {number} ttlMs - Cache TTL in milliseconds
 * @returns {Promise<any>} Data from cache or fetch
 */
export async function fetchWithCache(key, fetchFn, ttlMs = CACHE_TTL_MS) {
  // Check cache first
  const cached = getCachedData(key, ttlMs);
  if (cached !== null) {
    return cached;
  }
  
  // Check if request is already in progress
  if (pendingRequests.has(key)) {
    console.debug(`[settings-cache] Request already in progress for '${key}', waiting...`);
    return await pendingRequests.get(key);
  }
  
  // Start new request
  console.debug(`[settings-cache] Fetching '${key}' from backend...`);
  const promise = fetchFn()
    .then(data => {
      // Cache the result
      setCachedData(key, data);
      return data;
    })
    .finally(() => {
      // Remove from pending requests
      pendingRequests.delete(key);
    });
  
  // Store promise to prevent duplicate requests
  pendingRequests.set(key, promise);
  
  return await promise;
}

/**
 * Get cache info for debugging
 * @returns {Object} Cache statistics
 */
export function getCacheInfo() {
  try {
    const keys = Object.keys(localStorage);
    const cacheKeys = keys.filter(k => k.startsWith(CACHE_PREFIX));
    
    const entries = cacheKeys.map(key => {
      try {
        const data = localStorage.getItem(key);
        const { timestamp } = JSON.parse(data);
        const age = Date.now() - timestamp;
        const ageMinutes = Math.floor(age / 1000 / 60);
        
        return {
          key: key.replace(CACHE_PREFIX, ''),
          ageMinutes,
          size: data.length
        };
      } catch {
        return null;
      }
    }).filter(Boolean);
    
    return {
      totalEntries: entries.length,
      entries,
      pendingRequests: Array.from(pendingRequests.keys())
    };
  } catch (error) {
    console.warn('[settings-cache] Error getting cache info:', error);
    return { totalEntries: 0, entries: [], pendingRequests: [] };
  }
}
