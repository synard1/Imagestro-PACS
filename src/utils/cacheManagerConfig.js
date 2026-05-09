/**
 * Cache Manager Configuration Utility
 * 
 * Provides configuration management for the cache manager UI component
 * based on environment variables and user preferences.
 */

/**
 * Get cache manager environment configuration
 * @returns {Object} Cache manager configuration
 */
export function getCacheManagerConfig() {
  const isDev = import.meta.env.DEV
  const isProd = import.meta.env.PROD
  
  return {
    // Master show/hide control
    show: import.meta.env.VITE_SHOW_CACHE_MANAGER !== 'false',
    
    // Position configuration
    position: import.meta.env.VITE_CACHE_MANAGER_POSITION || 'bottom-right',
    
    // Auto-hide configuration
    autoHide: import.meta.env.VITE_CACHE_MANAGER_AUTO_HIDE === 'true',
    autoHideDelay: parseInt(import.meta.env.VITE_CACHE_MANAGER_AUTO_HIDE_DELAY) || 10000,
    
    // Start state
    startMinimized: import.meta.env.VITE_CACHE_MANAGER_START_MINIMIZED === 'true',
    
    // Development only mode
    devOnly: import.meta.env.VITE_CACHE_MANAGER_DEV_ONLY === 'true',
    
    // Runtime environment info
    isDevelopment: isDev,
    isProduction: isProd
  }
}

/**
 * Check if cache manager should be visible
 * @returns {boolean} True if cache manager should be shown
 */
export function shouldShowCacheManager() {
  const config = getCacheManagerConfig()
  
  // If explicitly hidden, don't show
  if (!config.show) {
    return false
  }
  
  // If position is hidden, don't show
  if (config.position === 'hidden') {
    return false
  }
  
  // If dev-only mode and we're in production, don't show
  if (config.devOnly && config.isProduction) {
    return false
  }
  
  return true
}

/**
 * Get cache manager position styles
 * @returns {Object} CSS styles for positioning
 */
export function getCacheManagerPositionStyles() {
  const config = getCacheManagerConfig()
  
  const baseStyles = {
    position: 'fixed',
    zIndex: 9999,
    transition: 'all 0.3s ease'
  }
  
  switch (config.position) {
    case 'bottom-right':
      return {
        ...baseStyles,
        bottom: '20px',
        right: '20px'
      }
    case 'bottom-left':
      return {
        ...baseStyles,
        bottom: '20px',
        left: '20px'
      }
    case 'top-right':
      return {
        ...baseStyles,
        top: '20px',
        right: '20px'
      }
    case 'top-left':
      return {
        ...baseStyles,
        top: '20px',
        left: '20px'
      }
    case 'hidden':
      return {
        ...baseStyles,
        display: 'none'
      }
    default:
      return {
        ...baseStyles,
        bottom: '20px',
        right: '20px'
      }
  }
}

/**
 * Get cache manager initial state
 * @returns {Object} Initial state configuration
 */
export function getCacheManagerInitialState() {
  const config = getCacheManagerConfig()
  
  return {
    visible: shouldShowCacheManager(),
    minimized: config.startMinimized,
    autoHide: config.autoHide,
    autoHideDelay: config.autoHideDelay,
    position: config.position
  }
}

/**
 * Create auto-hide timer for cache manager
 * @param {Function} hideCallback - Function to call when auto-hiding
 * @returns {number|null} Timer ID or null if auto-hide is disabled
 */
export function createAutoHideTimer(hideCallback) {
  const config = getCacheManagerConfig()
  
  if (!config.autoHide || !hideCallback) {
    return null
  }
  
  return setTimeout(() => {
    hideCallback()
  }, config.autoHideDelay)
}

/**
 * Log cache manager configuration for debugging
 */
export function logCacheManagerConfig() {
  const config = getCacheManagerConfig()
  
  console.group('[Cache Manager Config]')
  console.log('Show:', config.show)
  console.log('Position:', config.position)
  console.log('Auto Hide:', config.autoHide)
  console.log('Auto Hide Delay:', config.autoHideDelay + 'ms')
  console.log('Start Minimized:', config.startMinimized)
  console.log('Dev Only:', config.devOnly)
  console.log('Should Show:', shouldShowCacheManager())
  console.log('Environment:', config.isDevelopment ? 'Development' : 'Production')
  console.groupEnd()
}

/**
 * Get cache manager CSS classes based on configuration
 * @param {boolean} isMinimized - Current minimized state
 * @returns {string} CSS classes
 */
export function getCacheManagerClasses(isMinimized = false) {
  const config = getCacheManagerConfig()
  
  const baseClasses = [
    'cache-manager',
    'bg-white',
    'border',
    'border-gray-200',
    'rounded-lg',
    'shadow-lg',
    'transition-all',
    'duration-300'
  ]
  
  if (isMinimized) {
    baseClasses.push('opacity-75', 'hover:opacity-100')
  }
  
  if (config.autoHide) {
    baseClasses.push('hover:opacity-100')
  }
  
  return baseClasses.join(' ')
}

/**
 * Check if cache manager is in development-only mode
 * @returns {boolean} True if cache manager should only show in development
 */
export function isDevOnlyMode() {
  const config = getCacheManagerConfig()
  return config.devOnly
}

/**
 * Get cache manager size configuration
 * @param {boolean} isMinimized - Current minimized state
 * @returns {Object} Size configuration
 */
export function getCacheManagerSize(isMinimized = false) {
  if (isMinimized) {
    return {
      width: '200px',
      height: '40px'
    }
  }
  
  return {
    width: '320px',
    height: 'auto',
    maxHeight: '400px'
  }
}

/**
 * Create cache manager visibility controller
 * @returns {Object} Controller object with methods
 */
export function createCacheManagerController() {
  let isVisible = shouldShowCacheManager()
  let isMinimized = getCacheManagerConfig().startMinimized
  let autoHideTimer = null
  
  return {
    isVisible: () => isVisible,
    isMinimized: () => isMinimized,
    
    show() {
      if (shouldShowCacheManager()) {
        isVisible = true
        return true
      }
      return false
    },
    
    hide() {
      isVisible = false
      this.clearAutoHideTimer()
    },
    
    toggle() {
      if (isVisible) {
        this.hide()
      } else {
        this.show()
      }
      return isVisible
    },
    
    minimize() {
      isMinimized = true
    },
    
    maximize() {
      isMinimized = false
    },
    
    toggleMinimize() {
      isMinimized = !isMinimized
      return isMinimized
    },
    
    startAutoHideTimer(callback) {
      this.clearAutoHideTimer()
      autoHideTimer = createAutoHideTimer(callback)
    },
    
    clearAutoHideTimer() {
      if (autoHideTimer) {
        clearTimeout(autoHideTimer)
        autoHideTimer = null
      }
    },
    
    getState() {
      return {
        visible: isVisible,
        minimized: isMinimized,
        config: getCacheManagerConfig()
      }
    }
  }
}