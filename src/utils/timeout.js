/**
 * Request Timeout Utilities
 * Provides timeout handling for async operations
 */

/**
 * Wrap a promise with a timeout
 * @param {Promise} promise - Promise to wrap
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} operationName - Name of operation for error message
 * @returns {Promise} Promise that rejects on timeout
 */
export const withTimeout = (promise, timeoutMs = 30000, operationName = 'Operation') => {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      // Clear timeout if promise resolves/rejects first
      promise.finally(() => clearTimeout(timeoutId));
    })
  ]);
};

/**
 * Wrap a promise with timeout and retry logic
 * @param {Function} promiseFn - Function that returns a promise
 * @param {Object} options - Options object
 * @param {number} options.timeout - Timeout in milliseconds (default: 30000)
 * @param {number} options.retries - Number of retries (default: 0)
 * @param {number} options.retryDelay - Delay between retries in ms (default: 1000)
 * @param {string} options.operationName - Name of operation (default: 'Operation')
 * @returns {Promise} Promise with timeout and retry
 */
export const withTimeoutAndRetry = async (
  promiseFn,
  {
    timeout = 30000,
    retries = 0,
    retryDelay = 1000,
    operationName = 'Operation'
  } = {}
) => {
  let lastError;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await withTimeout(
        promiseFn(),
        timeout,
        `${operationName} (attempt ${attempt + 1}/${retries + 1})`
      );
      return result;
    } catch (error) {
      lastError = error;
      
      // Don't retry if it's the last attempt
      if (attempt < retries) {
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }
  
  // All attempts failed
  throw lastError;
};

/**
 * Create an AbortController with timeout
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Object} Object with controller and cleanup function
 */
export const createTimeoutController = (timeoutMs = 30000) => {
  const controller = new AbortController();
  
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  
  const cleanup = () => {
    clearTimeout(timeoutId);
  };
  
  return {
    controller,
    signal: controller.signal,
    cleanup,
    abort: () => {
      cleanup();
      controller.abort();
    }
  };
};

/**
 * Fetch with timeout
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @param {number} timeoutMs - Timeout in milliseconds (default: 30000)
 * @returns {Promise} Fetch promise with timeout
 */
export const fetchWithTimeout = async (url, options = {}, timeoutMs = 30000) => {
  const { controller, cleanup } = createTimeoutController(timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    
    cleanup();
    return response;
  } catch (error) {
    cleanup();
    
    if (error.name === 'AbortError') {
      throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
    }
    
    throw error;
  }
};

/**
 * Default timeout values for different operations
 */
export const TIMEOUT_PRESETS = {
  QUICK: 5000,      // 5 seconds - for quick operations
  NORMAL: 15000,    // 15 seconds - for normal API calls
  LONG: 30000,      // 30 seconds - for complex operations
  UPLOAD: 60000,    // 60 seconds - for file uploads
  DOWNLOAD: 120000  // 120 seconds - for large downloads
};

/**
 * Hook for using timeout in React components
 * @param {number} defaultTimeout - Default timeout in ms
 * @returns {Function} Function to wrap promises with timeout
 */
export const useTimeout = (defaultTimeout = TIMEOUT_PRESETS.NORMAL) => {
  return (promise, timeout = defaultTimeout, operationName = 'Operation') => {
    return withTimeout(promise, timeout, operationName);
  };
};
