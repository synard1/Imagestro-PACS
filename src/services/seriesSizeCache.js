/**
 * Series Size Cache Service
 * Caches storage_size from API response for accurate download progress
 */

const CACHE_KEY = 'pacs_series_size_cache';
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get cached series sizes
 * @returns {Object} - Map of seriesUID -> { storageSize, timestamp }
 */
function getCache() {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return {};
    return JSON.parse(cached);
  } catch (e) {
    console.warn('[SeriesSizeCache] Failed to read cache:', e);
    return {};
  }
}

/**
 * Save cache to localStorage
 * @param {Object} cache - Cache object
 */
function saveCache(cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.warn('[SeriesSizeCache] Failed to save cache:', e);
  }
}

/**
 * Cache series size from API response
 * @param {string} seriesUID - Series Instance UID
 * @param {number} storageSize - Storage size in bytes
 */
export function cacheSeriesSize(seriesUID, storageSize) {
  if (!seriesUID || !storageSize || storageSize <= 0) return;
  
  const cache = getCache();
  cache[seriesUID] = {
    storageSize,
    timestamp: Date.now()
  };
  saveCache(cache);
}

/**
 * Cache multiple series sizes from API response
 * @param {Array} seriesList - Array of series objects with series_instance_uid and storage_size
 */
export function cacheSeriesSizes(seriesList) {
  if (!Array.isArray(seriesList)) return;
  
  const cache = getCache();
  let count = 0;
  
  seriesList.forEach(series => {
    const seriesUID = series.series_instance_uid || series.seriesInstanceUID;
    const storageSize = series.storage_size || series.storageSize;
    
    if (seriesUID && storageSize && storageSize > 0) {
      cache[seriesUID] = {
        storageSize,
        timestamp: Date.now()
      };
      count++;
    }
  });
  
  if (count > 0) {
    saveCache(cache);
  }
}

/**
 * Get cached series size
 * @param {string} seriesUID - Series Instance UID
 * @returns {number|null} - Storage size in bytes or null if not cached/expired
 */
export function getCachedSeriesSize(seriesUID) {
  if (!seriesUID) return null;
  
  const cache = getCache();
  const entry = cache[seriesUID];
  
  if (!entry) return null;
  
  // Check expiry
  if (Date.now() - entry.timestamp > CACHE_EXPIRY_MS) {
    return null;
  }
  
  return entry.storageSize;
}

/**
 * Clear expired entries from cache
 */
export function cleanupCache() {
  const cache = getCache();
  const now = Date.now();
  let cleaned = 0;
  
  Object.keys(cache).forEach(key => {
    if (now - cache[key].timestamp > CACHE_EXPIRY_MS) {
      delete cache[key];
      cleaned++;
    }
  });
  
  if (cleaned > 0) {
    saveCache(cache);
  }
}

/**
 * Clear all cache
 */
export function clearCache() {
  localStorage.removeItem(CACHE_KEY);
}

export default {
  cacheSeriesSize,
  cacheSeriesSizes,
  getCachedSeriesSize,
  cleanupCache,
  clearCache
};
