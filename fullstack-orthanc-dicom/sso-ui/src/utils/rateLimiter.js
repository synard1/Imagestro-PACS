/**
 * Rate Limiter Utility
 * Prevents excessive API calls and provides debouncing functionality
 */

class RateLimiter {
  constructor() {
    this.requests = new Map()
    this.debounceTimers = new Map()
  }

  /**
   * Check if a request is allowed based on rate limiting
   * @param {string} key - Unique identifier for the request type
   * @param {number} maxRequests - Maximum requests allowed
   * @param {number} windowMs - Time window in milliseconds
   * @returns {boolean} - Whether the request is allowed
   */
  isAllowed(key, maxRequests = 10, windowMs = 60000) {
    const now = Date.now()
    const windowStart = now - windowMs

    if (!this.requests.has(key)) {
      this.requests.set(key, [])
    }

    const requestTimes = this.requests.get(key)
    
    // Remove old requests outside the window
    const validRequests = requestTimes.filter(time => time > windowStart)
    this.requests.set(key, validRequests)

    // Check if we're under the limit
    if (validRequests.length < maxRequests) {
      validRequests.push(now)
      return true
    }

    if (process.env.NODE_ENV === 'development') {
      console.warn(`Rate limit exceeded for ${key}. Max ${maxRequests} requests per ${windowMs}ms`)
    }
    return false
  }

  /**
   * Debounce a function call
   * @param {string} key - Unique identifier for the debounced function
   * @param {Function} fn - Function to debounce
   * @param {number} delay - Delay in milliseconds
   * @returns {Function} - Debounced function
   */
  debounce(key, fn, delay = 300) {
    return (...args) => {
      // Clear existing timer
      if (this.debounceTimers.has(key)) {
        clearTimeout(this.debounceTimers.get(key))
      }

      // Set new timer
      const timer = setTimeout(() => {
        fn.apply(this, args)
        this.debounceTimers.delete(key)
      }, delay)

      this.debounceTimers.set(key, timer)
    }
  }

  /**
   * Throttle a function call
   * @param {string} key - Unique identifier for the throttled function
   * @param {Function} fn - Function to throttle
   * @param {number} limit - Minimum time between calls in milliseconds
   * @returns {Function} - Throttled function
   */
  throttle(key, fn, limit = 1000) {
    let inThrottle = false
    
    return (...args) => {
      if (!inThrottle) {
        fn.apply(this, args)
        inThrottle = true
        setTimeout(() => inThrottle = false, limit)
      }
    }
  }

  /**
   * Clear all rate limiting data for a specific key
   * @param {string} key - Key to clear
   */
  clear(key) {
    this.requests.delete(key)
    if (this.debounceTimers.has(key)) {
      clearTimeout(this.debounceTimers.get(key))
      this.debounceTimers.delete(key)
    }
  }

  /**
   * Clear all rate limiting data
   */
  clearAll() {
    this.requests.clear()
    this.debounceTimers.forEach(timer => clearTimeout(timer))
    this.debounceTimers.clear()
  }

  /**
   * Get current request count for a key
   * @param {string} key - Key to check
   * @param {number} windowMs - Time window in milliseconds
   * @returns {number} - Current request count
   */
  getCurrentCount(key, windowMs = 60000) {
    if (!this.requests.has(key)) {
      return 0
    }

    const now = Date.now()
    const windowStart = now - windowMs
    const requestTimes = this.requests.get(key)
    
    return requestTimes.filter(time => time > windowStart).length
  }
}

// Create a singleton instance
const rateLimiter = new RateLimiter()

export default rateLimiter
export { RateLimiter }