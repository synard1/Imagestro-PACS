/**
 * Cache Manager for PWA Service Worker
 * Implements intelligent caching strategies for different resource types
 * Requirements: 3.1, 3.2, 3.4, 3.5
 */

class CacheManager {
  constructor() {
    this.cacheVersion = 'v1';
    this.staticCache = `static-assets-${this.cacheVersion}`;
    this.apiCache = `api-cache-${this.cacheVersion}`;
    this.pagesCache = `pages-cache-${this.cacheVersion}`;
    this.dynamicCache = `dynamic-content-${this.cacheVersion}`;
    
    // Cache size limits (in MB)
    this.cacheLimits = {
      static: 50 * 1024 * 1024,    // 50MB for static assets
      api: 20 * 1024 * 1024,       // 20MB for API responses
      pages: 10 * 1024 * 1024,     // 10MB for pages
      dynamic: 30 * 1024 * 1024    // 30MB for dynamic content
    };
    
    // Authentication routes that should never be cached
    this.authRoutes = [
      '/api/auth',
      '/api/login',
      '/api/logout',
      '/api/token',
      '/api/refresh',
      '/login',
      '/logout',
      '/auth'
    ];
    
    // Sensitive endpoints that should always bypass cache
    this.sensitiveEndpoints = [
      '/api/user/profile',
      '/api/user/session',
      '/api/admin',
      '/api/impersonate',
      '/api/audit'
    ];
  }

  /**
   * Cache-first strategy for static assets
   * Serves from cache first, falls back to network if not cached
   * @param {Request} request - The request to handle
   * @returns {Promise<Response>} The response
   */
  async cacheFirst(request) {
    const cacheName = this.staticCache;
    
    try {
      // Try cache first
      const cachedResponse = await caches.match(request);
      if (cachedResponse) {
        console.log('[CacheManager] Serving from cache (cache-first):', request.url);
        return cachedResponse;
      }
      
      console.log('[CacheManager] Not in cache, fetching from network:', request.url);
      
      // If not in cache, fetch from network
      const networkResponse = await fetch(request);
      
      // Cache the response if successful
      if (networkResponse.ok) {
        const cache = await caches.open(cacheName);
        
        // Check cache size before adding
        await this.enforceStorageLimit(cacheName, this.cacheLimits.static);
        
        cache.put(request, networkResponse.clone());
        console.log('[CacheManager] Cached static asset:', request.url);
      }
      
      return networkResponse;
      
    } catch (error) {
      console.error('[CacheManager] Cache-first strategy failed:', error);
      
      // Try cache again as fallback
      const cachedResponse = await caches.match(request);
      if (cachedResponse) {
        console.log('[CacheManager] Serving stale cache after network failure:', request.url);
        return cachedResponse;
      }
      
      throw error;
    }
  }

  /**
   * Network-first strategy for API requests
   * Tries network first, falls back to cache if network fails
   * @param {Request} request - The request to handle
   * @returns {Promise<Response>} The response
   */
  async networkFirst(request) {
    const cacheName = this.apiCache;
    
    // Check if this is an auth route - never cache these
    if (this.isAuthRoute(request.url) || this.isSensitiveEndpoint(request.url)) {
      console.log('[CacheManager] Bypassing cache for auth/sensitive route:', request.url);
      return fetch(request);
    }
    
    try {
      console.log('[CacheManager] Trying network first:', request.url);
      
      // Try network first
      const networkResponse = await fetch(request);
      
      // If successful, update cache and return response
      if (networkResponse.ok) {
        const cache = await caches.open(cacheName);
        
        // Check cache size before adding
        await this.enforceStorageLimit(cacheName, this.cacheLimits.api);
        
        cache.put(request, networkResponse.clone());
        console.log('[CacheManager] API response cached:', request.url);
        return networkResponse;
      }
      
      // If network response is not ok, try cache
      const cachedResponse = await caches.match(request);
      if (cachedResponse) {
        console.log('[CacheManager] Serving from cache after bad network response:', request.url);
        return cachedResponse;
      }
      
      // If no cache, return the network response anyway
      return networkResponse;
      
    } catch (error) {
      console.log('[CacheManager] Network failed, trying cache:', request.url, error.message);
      
      // Try to serve from cache
      const cachedResponse = await caches.match(request);
      if (cachedResponse) {
        console.log('[CacheManager] Serving from cache after network failure:', request.url);
        return cachedResponse;
      }
      
      // If no cache available, re-throw the error
      throw error;
    }
  }

  /**
   * Stale-while-revalidate strategy for dynamic content
   * Serves from cache immediately, then updates cache in background
   * @param {Request} request - The request to handle
   * @returns {Promise<Response>} The response
   */
  async staleWhileRevalidate(request) {
    const cacheName = this.dynamicCache;
    
    // Check if this is an auth route - never cache these
    if (this.isAuthRoute(request.url) || this.isSensitiveEndpoint(request.url)) {
      console.log('[CacheManager] Bypassing cache for auth/sensitive route:', request.url);
      return fetch(request);
    }
    
    try {
      // Get cached response immediately
      const cachedResponse = await caches.match(request);
      
      // Start network request in background
      const networkResponsePromise = fetch(request).then(async (networkResponse) => {
        if (networkResponse.ok) {
          const cache = await caches.open(cacheName);
          
          // Check cache size before adding
          await this.enforceStorageLimit(cacheName, this.cacheLimits.dynamic);
          
          cache.put(request, networkResponse.clone());
          console.log('[CacheManager] Background cache update completed:', request.url);
        }
        return networkResponse;
      }).catch((error) => {
        console.log('[CacheManager] Background network request failed:', request.url, error.message);
        return null;
      });
      
      // If we have cached content, return it immediately
      if (cachedResponse) {
        console.log('[CacheManager] Serving stale content while revalidating:', request.url);
        return cachedResponse;
      }
      
      // If no cached content, wait for network response
      console.log('[CacheManager] No cached content, waiting for network:', request.url);
      const networkResponse = await networkResponsePromise;
      
      if (networkResponse) {
        return networkResponse;
      }
      
      throw new Error('No cached content and network failed');
      
    } catch (error) {
      console.error('[CacheManager] Stale-while-revalidate strategy failed:', error);
      throw error;
    }
  }

  /**
   * Check if URL is an authentication route
   * @param {string} url - The URL to check
   * @returns {boolean} True if it's an auth route
   */
  isAuthRoute(url) {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    
    return this.authRoutes.some(route => pathname.startsWith(route));
  }

  /**
   * Check if URL is a sensitive endpoint
   * @param {string} url - The URL to check
   * @returns {boolean} True if it's a sensitive endpoint
   */
  isSensitiveEndpoint(url) {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    
    return this.sensitiveEndpoints.some(endpoint => pathname.startsWith(endpoint));
  }

  /**
   * Enforce storage limits for a cache
   * Removes oldest entries if cache exceeds size limit
   * @param {string} cacheName - Name of the cache to check
   * @param {number} sizeLimit - Size limit in bytes
   */
  async enforceStorageLimit(cacheName, sizeLimit) {
    try {
      const cache = await caches.open(cacheName);
      const keys = await cache.keys();
      
      if (!keys || keys.length === 0) return;
      
      // Calculate current cache size
      let currentSize = 0;
      const entries = [];
      
      for (const request of keys) {
        const response = await cache.match(request);
        if (response) {
          const size = await this.getResponseSize(response);
          entries.push({
            request,
            size,
            timestamp: this.getTimestamp(response) || Date.now()
          });
          currentSize += size;
        }
      }
      
      // If under limit, no cleanup needed
      if (currentSize <= sizeLimit) {
        return;
      }
      
      console.log(`[CacheManager] Cache ${cacheName} exceeds limit (${currentSize}/${sizeLimit} bytes), cleaning up...`);
      
      // Sort by timestamp (oldest first)
      entries.sort((a, b) => a.timestamp - b.timestamp);
      
      // Remove oldest entries until under limit
      let removedSize = 0;
      let removedCount = 0;
      
      for (const entry of entries) {
        if (currentSize - removedSize <= sizeLimit) {
          break;
        }
        
        await cache.delete(entry.request);
        removedSize += entry.size;
        removedCount++;
      }
      
      console.log(`[CacheManager] Removed ${removedCount} entries (${removedSize} bytes) from ${cacheName}`);
      
    } catch (error) {
      console.error('[CacheManager] Failed to enforce storage limit:', error);
    }
  }

  /**
   * Get approximate response size
   * @param {Response} response - The response to measure
   * @returns {Promise<number>} Size in bytes
   */
  async getResponseSize(response) {
    try {
      const clone = response.clone();
      const arrayBuffer = await clone.arrayBuffer();
      return arrayBuffer.byteLength;
    } catch (error) {
      // Fallback to content-length header or estimate
      const contentLength = response.headers.get('content-length');
      return contentLength ? parseInt(contentLength, 10) : 1024; // 1KB estimate
    }
  }

  /**
   * Get timestamp from response headers
   * @param {Response} response - The response to check
   * @returns {number|null} Timestamp or null
   */
  getTimestamp(response) {
    const dateHeader = response.headers.get('date');
    if (dateHeader) {
      return new Date(dateHeader).getTime();
    }
    
    // Check for custom timestamp header
    const timestampHeader = response.headers.get('x-cache-timestamp');
    if (timestampHeader) {
      return parseInt(timestampHeader, 10);
    }
    
    return null;
  }

  /**
   * Clean up all caches
   * Removes old cache versions and enforces size limits
   * @returns {Promise<void>}
   */
  async cleanup() {
    try {
      console.log('[CacheManager] Starting cache cleanup...');
      
      // Get all cache names
      const cacheNames = await caches.keys();
      
      // Delete old cache versions
      const deletePromises = cacheNames
        .filter((cacheName) => {
          return (cacheName.includes('static-assets-') && cacheName !== this.staticCache) ||
                 (cacheName.includes('api-cache-') && cacheName !== this.apiCache) ||
                 (cacheName.includes('pages-cache-') && cacheName !== this.pagesCache) ||
                 (cacheName.includes('dynamic-content-') && cacheName !== this.dynamicCache);
        })
        .map((cacheName) => {
          console.log('[CacheManager] Deleting old cache:', cacheName);
          return caches.delete(cacheName);
        });
      
      await Promise.all(deletePromises);
      
      // Enforce size limits on current caches
      await Promise.all([
        this.enforceStorageLimit(this.staticCache, this.cacheLimits.static),
        this.enforceStorageLimit(this.apiCache, this.cacheLimits.api),
        this.enforceStorageLimit(this.pagesCache, this.cacheLimits.pages),
        this.enforceStorageLimit(this.dynamicCache, this.cacheLimits.dynamic)
      ]);
      
      console.log('[CacheManager] Cache cleanup completed');
      
    } catch (error) {
      console.error('[CacheManager] Cache cleanup failed:', error);
    }
  }

  /**
   * Get cache statistics
   * @returns {Promise<Object>} Cache statistics
   */
  async getStats() {
    try {
      const stats = {
        static: await this.getCacheStats(this.staticCache),
        api: await this.getCacheStats(this.apiCache),
        pages: await this.getCacheStats(this.pagesCache),
        dynamic: await this.getCacheStats(this.dynamicCache)
      };
      
      return stats;
    } catch (error) {
      console.error('[CacheManager] Failed to get cache stats:', error);
      return {};
    }
  }

  /**
   * Get statistics for a specific cache
   * @param {string} cacheName - Name of the cache
   * @returns {Promise<Object>} Cache statistics
   */
  async getCacheStats(cacheName) {
    try {
      const cache = await caches.open(cacheName);
      const keys = await cache.keys();
      
      let totalSize = 0;
      for (const request of keys) {
        const response = await cache.match(request);
        if (response) {
          totalSize += await this.getResponseSize(response);
        }
      }
      
      return {
        entries: keys.length,
        size: totalSize,
        sizeFormatted: this.formatBytes(totalSize)
      };
    } catch (error) {
      return { entries: 0, size: 0, sizeFormatted: '0 B' };
    }
  }

  /**
   * Format bytes to human readable string
   * @param {number} bytes - Number of bytes
   * @returns {string} Formatted string
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// ES module export
export default CacheManager;