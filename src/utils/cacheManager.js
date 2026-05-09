/**
 * Client-side cache management utilities
 * Provides functions to interact with service worker cache
 */

/**
 * Clear all service worker caches
 * @returns {Promise<boolean>} Success status
 */
export async function clearAllCaches() {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
    console.warn('[CacheManager] Service worker not available');
    return false;
  }

  try {
    const messageChannel = new MessageChannel();
    
    const response = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Cache clear timeout'));
      }, 10000);

      messageChannel.port1.onmessage = (event) => {
        clearTimeout(timeout);
        resolve(event.data);
      };

      navigator.serviceWorker.controller.postMessage(
        { type: 'CLEAR_CACHE' },
        [messageChannel.port2]
      );
    });

    if (response.type === 'CACHE_CLEARED' && response.data.success) {
      console.log('[CacheManager] All caches cleared successfully');
      return true;
    } else {
      console.error('[CacheManager] Failed to clear caches:', response.data.error);
      return false;
    }
  } catch (error) {
    console.error('[CacheManager] Error clearing caches:', error);
    return false;
  }
}

/**
 * Invalidate cache for specific URLs
 * @param {string[]} urls - URLs to invalidate
 * @returns {Promise<boolean>} Success status
 */
export async function invalidateCache(urls) {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
    console.warn('[CacheManager] Service worker not available');
    return false;
  }

  if (!Array.isArray(urls) || urls.length === 0) {
    console.warn('[CacheManager] No URLs provided for cache invalidation');
    return false;
  }

  try {
    const messageChannel = new MessageChannel();
    
    const response = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Cache invalidation timeout'));
      }, 10000);

      messageChannel.port1.onmessage = (event) => {
        clearTimeout(timeout);
        resolve(event.data);
      };

      navigator.serviceWorker.controller.postMessage(
        { type: 'INVALIDATE_CACHE', urls },
        [messageChannel.port2]
      );
    });

    if (response.type === 'CACHE_INVALIDATED' && response.data.success) {
      console.log('[CacheManager] Cache invalidated for URLs:', urls);
      return true;
    } else {
      console.error('[CacheManager] Failed to invalidate cache:', response.data.error);
      return false;
    }
  } catch (error) {
    console.error('[CacheManager] Error invalidating cache:', error);
    return false;
  }
}

/**
 * Clear cache and reload the page
 * Useful for development when you want to ensure fresh content
 */
export async function clearCacheAndReload() {
  console.log('[CacheManager] Clearing cache and reloading...');
  
  try {
    const success = await clearAllCaches();
    
    if (success) {
      // Wait a moment for cache clearing to complete
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } else {
      console.warn('[CacheManager] Cache clearing failed, reloading anyway');
      window.location.reload();
    }
  } catch (error) {
    console.error('[CacheManager] Error during cache clear and reload:', error);
    window.location.reload();
  }
}

/**
 * Check if we're in development mode
 * @returns {boolean} True if in development
 */
export function isDevelopmentMode() {
  return location.hostname === 'localhost' || 
         location.hostname === '127.0.0.1' || 
         location.port === '5173' ||
         import.meta.env.DEV;
}

/**
 * Auto-clear cache in development mode when page loads
 * This helps prevent stale content issues during development
 */
export function initDevelopmentCacheManagement() {
  if (!isDevelopmentMode()) {
    return;
  }

  console.log('[CacheManager] Development mode detected, setting up cache management');

  // Clear cache when page is loaded with Ctrl+F5 or Cmd+Shift+R
  const clearCacheOnHardRefresh = (event) => {
    if ((event.ctrlKey && event.key === 'F5') || 
        (event.metaKey && event.shiftKey && event.key === 'R')) {
      console.log('[CacheManager] Hard refresh detected, clearing cache');
      clearAllCaches();
    }
  };

  document.addEventListener('keydown', clearCacheOnHardRefresh);

  // Add a global function for manual cache clearing in development
  if (typeof window !== 'undefined') {
    window.clearPWACache = clearCacheAndReload;
    console.log('[CacheManager] Added window.clearPWACache() function for manual cache clearing');
  }

  // Check if we should auto-clear cache on startup
  const shouldAutoClear = localStorage.getItem('dev-auto-clear-cache') === 'true';
  if (shouldAutoClear) {
    console.log('[CacheManager] Auto-clearing cache on startup');
    clearAllCaches().then(() => {
      localStorage.removeItem('dev-auto-clear-cache');
    });
  }
}

/**
 * Set flag to auto-clear cache on next page load
 * Useful for development workflows
 */
export function scheduleAutoCacheClear() {
  if (isDevelopmentMode()) {
    localStorage.setItem('dev-auto-clear-cache', 'true');
    console.log('[CacheManager] Scheduled auto cache clear for next page load');
  }
}

/**
 * Get cache status information
 * @returns {Promise<Object>} Cache status details
 */
export async function getCacheStatus() {
  try {
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      const cacheDetails = await Promise.all(
        cacheNames.map(async (name) => {
          const cache = await caches.open(name);
          const keys = await cache.keys();
          return {
            name,
            entryCount: keys.length,
            urls: keys.map(req => req.url).slice(0, 10) // First 10 URLs
          };
        })
      );

      return {
        available: true,
        cacheCount: cacheNames.length,
        caches: cacheDetails,
        serviceWorkerActive: !!navigator.serviceWorker?.controller
      };
    }

    return {
      available: false,
      reason: 'Cache API not supported'
    };
  } catch (error) {
    return {
      available: false,
      reason: error.message
    };
  }
}

// Auto-initialize development cache management
if (typeof window !== 'undefined') {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDevelopmentCacheManagement);
  } else {
    initDevelopmentCacheManagement();
  }
}