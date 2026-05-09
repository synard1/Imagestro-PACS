/**
 * PWA Environment Configuration Utility
 * 
 * Provides system-level PWA configuration overrides via environment variables.
 * This allows administrators to control PWA behavior without requiring UI access.
 * Useful for emergency situations or deployment-specific requirements.
 */

/**
 * Get PWA environment configuration
 * @returns {Object} PWA environment configuration
 */
export function getPWAEnvConfig() {
  return {
    // Master PWA control
    forceDisabled: import.meta.env.VITE_PWA_FORCE_DISABLED === 'true',
    
    // Feature permissions
    allowOfflineMode: import.meta.env.VITE_PWA_ALLOW_OFFLINE_MODE !== 'false',
    allowCaching: import.meta.env.VITE_PWA_ALLOW_CACHING !== 'false',
    allowInstallPrompts: import.meta.env.VITE_PWA_ALLOW_INSTALL_PROMPTS !== 'false',
    allowUpdateNotifications: import.meta.env.VITE_PWA_ALLOW_UPDATE_NOTIFICATIONS !== 'false',
    allowBackgroundSync: import.meta.env.VITE_PWA_ALLOW_BACKGROUND_SYNC !== 'false',
    allowPushNotifications: import.meta.env.VITE_PWA_ALLOW_PUSH_NOTIFICATIONS === 'true',
    
    // Cache strategy override
    forceCacheStrategy: import.meta.env.VITE_PWA_FORCE_CACHE_STRATEGY || null,
    
    // Emergency and development modes
    emergencyMode: import.meta.env.VITE_PWA_EMERGENCY_MODE === 'true',
    developmentMode: import.meta.env.VITE_PWA_DEVELOPMENT_MODE === 'true'
  }
}

/**
 * Check if PWA is allowed to be enabled
 * @returns {boolean} True if PWA can be enabled
 */
export function isPWAAllowed() {
  const envConfig = getPWAEnvConfig()
  return !envConfig.forceDisabled && !envConfig.emergencyMode
}

/**
 * Apply environment overrides to PWA configuration
 * @param {Object} userConfig - User's PWA configuration
 * @returns {Object} Final PWA configuration with environment overrides applied
 */
export function applyPWAEnvOverrides(userConfig) {
  const envConfig = getPWAEnvConfig()
  
  // If PWA is force disabled or in emergency mode, disable everything
  if (envConfig.forceDisabled || envConfig.emergencyMode) {
    return {
      ...userConfig,
      enabled: false,
      offlineMode: false,
      cacheStrategy: 'disabled',
      updateNotifications: false,
      installPrompts: false,
      backgroundSync: false,
      pushNotifications: false
    }
  }
  
  // Apply feature restrictions
  const finalConfig = { ...userConfig }
  
  if (!envConfig.allowOfflineMode) {
    finalConfig.offlineMode = false
  }
  
  if (!envConfig.allowCaching) {
    finalConfig.cacheStrategy = 'disabled'
  }
  
  if (!envConfig.allowInstallPrompts) {
    finalConfig.installPrompts = false
  }
  
  if (!envConfig.allowUpdateNotifications) {
    finalConfig.updateNotifications = false
  }
  
  if (!envConfig.allowBackgroundSync) {
    finalConfig.backgroundSync = false
  }
  
  if (!envConfig.allowPushNotifications) {
    finalConfig.pushNotifications = false
  }
  
  // Apply cache strategy override
  if (envConfig.forceCacheStrategy) {
    finalConfig.cacheStrategy = envConfig.forceCacheStrategy
  }
  
  // Apply development mode adjustments
  if (envConfig.developmentMode) {
    finalConfig.cacheStrategy = finalConfig.cacheStrategy === 'aggressive' ? 'intelligent' : finalConfig.cacheStrategy
    finalConfig.updateNotifications = false // Reduce noise in development
  }
  
  return finalConfig
}

/**
 * Get PWA configuration with environment overrides
 * @param {Object} userConfig - User's PWA configuration
 * @returns {Object} Final PWA configuration
 */
export function getPWAConfigWithEnvOverrides(userConfig = {}) {
  const defaultConfig = {
    enabled: false,
    offlineMode: false,
    cacheStrategy: 'disabled',
    updateNotifications: false,
    installPrompts: false,
    backgroundSync: false,
    pushNotifications: false
  }

  const mergedConfig = { ...defaultConfig, ...userConfig }
  return applyPWAEnvOverrides(mergedConfig)
}
/**
 * Check if emergency mode is enabled
 * @returns {boolean} True if emergency mode is enabled
 */
export function isEmergencyMode() {
  return getPWAEnvConfig().emergencyMode
}

/**
 * Check if development mode is enabled
 * @returns {boolean} True if development mode is enabled
 */
export function isDevelopmentMode() {
  return getPWAEnvConfig().developmentMode
}

/**
 * Get environment-specific cache limits based on configuration
 * @param {string} strategy - Cache strategy
 * @returns {Object} Cache limits configuration
 */
export function getEnvCacheLimits(strategy) {
  const envConfig = getPWAEnvConfig()
  
  // Base limits for each strategy
  const baseLimits = {
    intelligent: {
      static: 50 * 1024 * 1024,    // 50MB
      api: 20 * 1024 * 1024,       // 20MB
      dynamic: 30 * 1024 * 1024    // 30MB
    },
    aggressive: {
      static: 100 * 1024 * 1024,   // 100MB
      api: 50 * 1024 * 1024,       // 50MB
      dynamic: 75 * 1024 * 1024    // 75MB
    },
    minimal: {
      static: 25 * 1024 * 1024,    // 25MB
      api: 10 * 1024 * 1024,       // 10MB
      dynamic: 15 * 1024 * 1024    // 15MB
    },
    disabled: {
      static: 0,
      api: 0,
      dynamic: 0
    }
  }
  
  let limits = baseLimits[strategy] || baseLimits.intelligent
  
  // Reduce limits in development mode
  if (envConfig.developmentMode) {
    limits = {
      static: Math.floor(limits.static * 0.5),
      api: Math.floor(limits.api * 0.5),
      dynamic: Math.floor(limits.dynamic * 0.5)
    }
  }
  
  // Disable caching if not allowed
  if (!envConfig.allowCaching) {
    limits = baseLimits.disabled
  }
  
  return limits
}

/**
 * Log PWA environment configuration for debugging
 */
export function logPWAEnvConfig() {
  const envConfig = getPWAEnvConfig()
  
  console.group('[PWA Env Config]')
  console.log('Force Disabled:', envConfig.forceDisabled)
  console.log('Emergency Mode:', envConfig.emergencyMode)
  console.log('Development Mode:', envConfig.developmentMode)
  console.log('Allow Offline Mode:', envConfig.allowOfflineMode)
  console.log('Allow Caching:', envConfig.allowCaching)
  console.log('Allow Install Prompts:', envConfig.allowInstallPrompts)
  console.log('Allow Update Notifications:', envConfig.allowUpdateNotifications)
  console.log('Allow Background Sync:', envConfig.allowBackgroundSync)
  console.log('Allow Push Notifications:', envConfig.allowPushNotifications)
  console.log('Force Cache Strategy:', envConfig.forceCacheStrategy || 'None')
  console.groupEnd()
}

/**
 * Create emergency PWA disable function
 * This can be called from browser console in emergency situations
 */
export function createEmergencyPWADisable() {
  window.emergencyDisablePWA = async function() {
    console.warn('[Emergency PWA Disable] Disabling PWA and clearing all caches...')
    
    try {
      // Unregister service worker
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        for (const registration of registrations) {
          await registration.unregister()
          console.log('[Emergency PWA Disable] Service worker unregistered')
        }
      }
      
      // Clear all caches
      if ('caches' in window) {
        const cacheNames = await caches.keys()
        for (const cacheName of cacheNames) {
          await caches.delete(cacheName)
          console.log(`[Emergency PWA Disable] Cache '${cacheName}' deleted`)
        }
      }
      
      // Clear PWA configuration
      localStorage.removeItem('pwa-config')
      localStorage.setItem('pwa-emergency-disabled', 'true')
      
      console.log('[Emergency PWA Disable] PWA disabled successfully')
      console.log('[Emergency PWA Disable] Please reload the page')
      
      // Optionally reload the page
      if (confirm('PWA has been disabled. Reload the page now?')) {
        window.location.reload()
      }
      
    } catch (error) {
      console.error('[Emergency PWA Disable] Failed to disable PWA:', error)
    }
  }
  
  console.log('[PWA Emergency] Emergency disable function available: emergencyDisablePWA()')
}

/**
 * Check if PWA was emergency disabled
 * @returns {boolean} True if PWA was emergency disabled
 */
export function isEmergencyDisabled() {
  return localStorage.getItem('pwa-emergency-disabled') === 'true'
}

/**
 * Clear emergency disable flag
 */
export function clearEmergencyDisable() {
  localStorage.removeItem('pwa-emergency-disabled')
}