/**
 * Global Fetch Interceptor
 * Intercepts all fetch calls and converts backend URLs to proxy URLs in development
 * This ensures consistent proxy usage across all services
 */

/**
 * Convert backend URL to proxy URL in development
 * @param {string} url - Original URL
 * @returns {string} Proxied URL in dev, original URL in production
 */
function getProxiedUrl(url) {
  if (!url || typeof url !== 'string') return url;
  
  const isDev = import.meta.env.DEV;
  
  // Skip if already a proxy URL
  if (url.startsWith('/backend-api')) {
    return url;
  }
  
  // In development, convert backend URLs to use Vite proxy
  const pacsBackendUrl = import.meta.env.VITE_MAIN_PACS_API_BACKEND_URL || (isDev ? 'http://localhost:8888' : '');
  if (isDev && pacsBackendUrl && url.startsWith(pacsBackendUrl)) {
    const path = url.replace(pacsBackendUrl, '');
    console.debug(`[fetch-interceptor] Converting to proxy URL: ${url} -> /backend-api${path}`);
    return `/backend-api${path}`;
  }
  
  return url;
}

/**
 * Initialize global fetch interceptor
 * Call this once at app startup
 */
export function initializeFetchInterceptor() {
  const originalFetch = window.fetch;
  
  window.fetch = function(resource, config) {
    // Convert URL if it's a string
    let url = resource;
    if (typeof resource === 'string') {
      url = getProxiedUrl(resource);
    } else if (resource instanceof Request) {
      // For Request objects, we need to create a new one with converted URL
      const convertedUrl = getProxiedUrl(resource.url);
      if (convertedUrl !== resource.url) {
        resource = new Request(convertedUrl, resource);
      }
    }
    
    // Call original fetch with converted URL
    return originalFetch.call(this, url, config);
  };
  
  // console.log('[fetch-interceptor] Global fetch interceptor initialized');
}

export { getProxiedUrl };
