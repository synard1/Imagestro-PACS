/**
 * Configurable PWA Manager
 * Handles PWA functionality with enable/disable capabilities
 */

import { 
  getPWAConfigWithEnvOverrides, 
  isPWAAllowed, 
  isEmergencyMode,
  isEmergencyDisabled,
  createEmergencyPWADisable,
  logPWAEnvConfig
} from '../utils/pwaEnvConfig.js'

class ConfigurablePWAManager {
  constructor() {
    this.config = {
      enabled: true,
      offlineMode: true,
      cacheStrategy: 'intelligent',
      updateNotifications: true,
      installPrompts: true,
      backgroundSync: true,
      pushNotifications: false
    }
    
    this.registration = null
    this.deferredPrompt = null
    this.isOnline = navigator.onLine
    this.updateAvailable = false
    this.listeners = new Map()
    
    // Load configuration from localStorage
    this.loadConfig()
    
    // Create emergency disable function for console access
    createEmergencyPWADisable()
    
    // Log environment configuration in development
    if (import.meta.env.DEV) {
      logPWAEnvConfig()
    }
    
    // Check for emergency conditions
    if (isEmergencyMode() || isEmergencyDisabled()) {
      console.warn('[PWA Manager] Emergency mode detected - PWA will be disabled')
      this.config.enabled = false
    }
    
    // Check if PWA is allowed by environment
    if (!isPWAAllowed()) {
      console.warn('[PWA Manager] PWA disabled by environment configuration')
      this.config.enabled = false
    }
    
    // Initialize if enabled
    if (this.config.enabled) {
      this.init()
    }
  }

  /**
   * Load configuration from localStorage with environment overrides
   */
  loadConfig() {
    try {
      const savedConfig = localStorage.getItem('pwa-config')
      let userConfig = this.config
      
      if (savedConfig) {
        const parsedConfig = JSON.parse(savedConfig)
        userConfig = { ...this.config, ...parsedConfig }
      }
      
      // Apply environment overrides
      this.config = getPWAConfigWithEnvOverrides(userConfig)
      
      console.log('[PWA Manager] Configuration loaded with environment overrides:', this.config)
    } catch (error) {
      console.error('Failed to load PWA config:', error)
      // Fallback to environment-only configuration
      this.config = getPWAConfigWithEnvOverrides(this.config)
    }
  }

  /**
   * Save configuration to localStorage
   */
  saveConfig() {
    try {
      localStorage.setItem('pwa-config', JSON.stringify(this.config))
    } catch (error) {
      console.error('Failed to save PWA config:', error)
    }
  }

  /**
   * Update configuration with environment override checks
   * @param {Object} newConfig - New configuration options
   */
  configure(newConfig) {
    const oldEnabled = this.config.enabled
    
    // Merge user config with new config
    const userConfig = { ...this.config, ...newConfig }
    
    // Apply environment overrides
    this.config = getPWAConfigWithEnvOverrides(userConfig)
    
    // Check if PWA is still allowed
    if (!isPWAAllowed()) {
      console.warn('[PWA Manager] Configuration rejected - PWA disabled by environment')
      this.config.enabled = false
    }
    
    this.saveConfig()
    
    // Handle enable/disable state changes
    if (oldEnabled !== this.config.enabled) {
      if (this.config.enabled) {
        this.init()
      } else {
        this.disable()
      }
    } else if (this.config.enabled) {
      // Apply configuration changes
      this.applyConfig()
    }
  }

  /**
   * Initialize PWA functionality
   */
  async init() {
    if (!this.config.enabled) return
    
    try {
      // Register service worker
      await this.registerServiceWorker()
      
      // Set up event listeners
      this.setupEventListeners()
      
      // Apply current configuration
      this.applyConfig()
      
      console.log('[PWA Manager] Initialized successfully')
    } catch (error) {
      console.error('[PWA Manager] Initialization failed:', error)
    }
  }

  /**
   * Register service worker
   */
  async registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service workers are not supported')
    }

    try {
      this.registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none'
      })

      console.log('[PWA Manager] Service worker registered:', this.registration.scope)

      // Handle service worker updates
      this.registration.addEventListener('updatefound', () => {
        const newWorker = this.registration.installing
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker?.controller) {
              this.updateAvailable = true
              this.emit('updateAvailable', this.registration)

              if (this.config.updateNotifications) {
                this.showUpdateNotification()
              }
            }
          })
        }
      })
      return this.registration
    } catch (error) {
      console.error('[PWA Manager] Service worker registration failed:', error)
      throw error
    }
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    // Network status
    window.addEventListener('online', () => {
      this.isOnline = true
      this.emit('networkStatusChange', true)
    })

    window.addEventListener('offline', () => {
      this.isOnline = false
      this.emit('networkStatusChange', false)
    })

    // Install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault()
      this.deferredPrompt = e
      this.emit('installPromptAvailable', e)
      
      if (this.config.installPrompts) {
        this.showInstallPrompt()
      }
    })

    // App installed
    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null
      this.emit('appInstalled')
    })

    // Service worker messages
    navigator.serviceWorker.addEventListener('message', (event) => {
      this.handleServiceWorkerMessage(event.data)
    })
  }

  /**
   * Apply current configuration to service worker
   */
  applyConfig() {
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'PWA_CONFIG_UPDATE',
        config: this.config
      })
    }
  }

  /**
   * Handle messages from service worker
   */
  handleServiceWorkerMessage(data) {
    switch (data.type) {
      case 'SERVER_RECOVERY':
        this.emit('serverRecovery', data)
        break
      case 'MAINTENANCE_EVENT':
        this.emit('maintenanceEvent', data)
        break
      case 'CACHE_UPDATE':
        this.emit('cacheUpdate', data)
        break
      default:
        console.log('[PWA Manager] Unknown message from service worker:', data)
    }
  }

  /**
   * Show update notification
   */
  showUpdateNotification() {
    if (!this.config.updateNotifications) return

    const notification = document.createElement('div')
    notification.id = 'pwa-update-notification'
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: white;
      border: 1px solid #e5e7eb;
      padding: 16px;
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
      z-index: 10000;
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 350px;
      animation: slideIn 0.3s ease-out;
    `

    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="
          width: 40px;
          height: 40px;
          background: #10b981;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        ">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="white">
            <path d="M4 2v16l4-4h8a2 2 0 002-2V4a2 2 0 00-2-2H4z"/>
          </svg>
        </div>
        <div style="flex: 1;">
          <div style="font-weight: 600; color: #1f2937; margin-bottom: 4px;">Update Available</div>
          <div style="color: #6b7280; font-size: 14px;">A new version of the app is ready</div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button id="pwa-update-btn" style="
            background: #10b981;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
          ">Update</button>
          <button id="pwa-update-dismiss-btn" style="
            background: #f3f4f6;
            color: #6b7280;
            border: none;
            padding: 8px 12px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
          ">Later</button>
        </div>
      </div>
    `

    document.body.appendChild(notification)

    // Handle update button click
    notification.querySelector('#pwa-update-btn').addEventListener('click', () => {
      this.applyUpdate()
      notification.remove()
    })

    // Handle dismiss button click
    notification.querySelector('#pwa-update-dismiss-btn').addEventListener('click', () => {
      notification.remove()
    })

    // Auto-dismiss after 10 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove()
      }
    }, 10000)
  }

  /**
   * Show install prompt
   */
  async showInstallPrompt() {
    if (!this.config.installPrompts || !this.deferredPrompt) return

    try {
      const result = await this.deferredPrompt.prompt()
      console.log('[PWA Manager] Install prompt result:', result.outcome)
      
      if (result.outcome === 'accepted') {
        this.emit('installAccepted')
      } else {
        this.emit('installDismissed')
      }
      
      this.deferredPrompt = null
    } catch (error) {
      console.error('[PWA Manager] Install prompt failed:', error)
    }
  }

  /**
   * Apply pending update
   */
  applyUpdate() {
    if (this.registration && this.registration.waiting) {
      this.registration.waiting.postMessage({ type: 'SKIP_WAITING' })
      window.location.reload()
    }
  }

  /**
   * Check if app can be installed
   */
  canInstall() {
    return !!this.deferredPrompt
  }

  /**
   * Check if app is installed
   */
  isInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true
  }

  /**
   * Get network status
   */
  getNetworkStatus() {
    return this.isOnline
  }

  /**
   * Get installation info
   */
  getInstallationInfo() {
    return {
      canInstall: this.canInstall(),
      isInstalled: this.isInstalled(),
      supportsServiceWorker: 'serviceWorker' in navigator,
      isOnline: this.isOnline,
      hasUpdate: this.updateAvailable
    }
  }

  /**
   * Disable PWA functionality
   */
  async disable() {
    try {
      // Unregister service worker
      if (this.registration) {
        await this.registration.unregister()
        this.registration = null
        console.log('[PWA Manager] Service worker unregistered')
      }

      // Clear all caches
      if ('caches' in window) {
        const cacheNames = await caches.keys()
        await Promise.all(cacheNames.map(name => caches.delete(name)))
        console.log('[PWA Manager] All caches cleared')
      }

      // Remove event listeners
      this.listeners.clear()

      console.log('[PWA Manager] Disabled successfully')
    } catch (error) {
      console.error('[PWA Manager] Failed to disable:', error)
      throw error
    }
  }

  /**
   * Add event listener
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event).add(callback)
  }

  /**
   * Remove event listener
   */
  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback)
    }
  }

  /**
   * Emit event
   */
  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data)
        } catch (error) {
          console.error(`[PWA Manager] Event listener error for ${event}:`, error)
        }
      })
    }
  }

  /**
   * Destroy PWA manager
   */
  destroy() {
    this.listeners.clear()
  }
}

// Create singleton instance
const pwaManager = new ConfigurablePWAManager()

export default pwaManager