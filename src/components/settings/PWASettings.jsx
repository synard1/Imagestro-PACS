import { useState, useEffect } from 'react'
import { formatBytes } from '../../utils/formatters'
import { getPWAEnvConfig, isPWAAllowed, isEmergencyMode } from '../../utils/pwaEnvConfig'

export default function PWASettings({ config, status, onConfigChange, onStatusChange, onSave }) {
  const [isLoading, setIsLoading] = useState(false)
  const [pwaManager, setPwaManager] = useState(null)
  const [serviceWorkerRegistration, setServiceWorkerRegistration] = useState(null)
  const [envConfig, setEnvConfig] = useState(null)

  // Load PWA manager and status on component mount
  useEffect(() => {
    loadPWAManager()
    loadPWAStatus()
    loadEnvConfig()
  }, [])

  const loadEnvConfig = () => {
    setEnvConfig(getPWAEnvConfig())
  }

  // Load PWA configuration from localStorage
  useEffect(() => {
    const savedConfig = localStorage.getItem('pwa-config')
    if (savedConfig) {
      try {
        const parsedConfig = JSON.parse(savedConfig)
        onConfigChange({ ...config, ...parsedConfig })
      } catch (error) {
        console.error('Failed to load PWA config:', error)
      }
    }
  }, [])

  // Load PWA configuration in Settings component
  useEffect(() => {
    const loadPWAConfig = async () => {
      try {
        const savedConfig = localStorage.getItem('pwa-config')
        if (savedConfig) {
          const parsedConfig = JSON.parse(savedConfig)
          setPwaConfig({ ...pwaConfig, ...parsedConfig })
        }
      } catch (error) {
        console.error('Failed to load PWA config in Settings:', error)
      }
    }
    loadPWAConfig()
  }, [])

  const loadPWAManager = async () => {
    try {
      const { default: manager } = await import('../../services/pwaManager')
      setPwaManager(manager)
    } catch (error) {
      console.error('Failed to load PWA manager:', error)
    }
  }

  const loadPWAStatus = async () => {
    try {
      // Check service worker registration
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration()
        setServiceWorkerRegistration(registration)
        
        // Get cache size
        const cacheSize = await getCacheSize()
        
        onStatusChange({
          isRegistered: !!registration,
          isInstalled: window.matchMedia('(display-mode: standalone)').matches,
          hasUpdate: registration?.waiting !== null,
          cacheSize,
          lastUpdate: registration ? new Date(registration.updateViaCache).toISOString() : null
        })
      }
    } catch (error) {
      console.error('Failed to load PWA status:', error)
    }
  }

  const getCacheSize = async () => {
    try {
      if ('caches' in window) {
        const cacheNames = await caches.keys()
        let totalSize = 0
        
        for (const cacheName of cacheNames) {
          const cache = await caches.open(cacheName)
          const keys = await cache.keys()
          
          for (const request of keys) {
            const response = await cache.match(request)
            if (response) {
              const clone = response.clone()
              const arrayBuffer = await clone.arrayBuffer()
              totalSize += arrayBuffer.byteLength
            }
          }
        }
        
        return totalSize
      }
      return 0
    } catch (error) {
      console.error('Failed to calculate cache size:', error)
      return 0
    }
  }

  const handleConfigChange = (key, value) => {
    const newConfig = { ...config, [key]: value }
    onConfigChange(newConfig)
    
    // Save to localStorage
    localStorage.setItem('pwa-config', JSON.stringify(newConfig))
    
    // Apply changes immediately
    applyPWAConfig(newConfig)
  }

  const applyPWAConfig = async (newConfig) => {
    try {
      setIsLoading(true)
      
      if (newConfig.enabled) {
        // Enable PWA
        await enablePWA(newConfig)
      } else {
        // Disable PWA
        await disablePWA()
      }
      
      // Reload status
      await loadPWAStatus()
    } catch (error) {
      console.error('Failed to apply PWA config:', error)
      alert('Failed to apply PWA settings: ' + error.message)
    } finally {
      setIsLoading(false)
    }
  }

  const enablePWA = async (config) => {
    if ('serviceWorker' in navigator) {
      try {
        // Register service worker if not already registered
        if (!serviceWorkerRegistration) {
          const registration = await navigator.serviceWorker.register('/sw.js', {
            scope: '/',
            updateViaCache: 'none'
          })
          setServiceWorkerRegistration(registration)
          console.log('Service worker registered successfully')
        }
        
        // Configure PWA based on settings
        if (pwaManager) {
          pwaManager.configure({
            offlineMode: config.offlineMode,
            cacheStrategy: config.cacheStrategy,
            updateNotifications: config.updateNotifications,
            installPrompts: config.installPrompts,
            backgroundSync: config.backgroundSync,
            pushNotifications: config.pushNotifications
          })
        }
        
        // Send configuration to service worker
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: 'PWA_CONFIG_UPDATE',
            config: config
          })
        }
        
      } catch (error) {
        throw new Error('Failed to enable PWA: ' + error.message)
      }
    } else {
      throw new Error('Service workers are not supported in this browser')
    }
  }

  const disablePWA = async () => {
    try {
      // Unregister service worker
      if (serviceWorkerRegistration) {
        await serviceWorkerRegistration.unregister()
        setServiceWorkerRegistration(null)
        console.log('Service worker unregistered successfully')
      }
      
      // Clear all caches
      if ('caches' in window) {
        const cacheNames = await caches.keys()
        await Promise.all(cacheNames.map(name => caches.delete(name)))
        console.log('All caches cleared')
      }
      
      // Disable PWA manager
      if (pwaManager) {
        pwaManager.disable()
      }
      
    } catch (error) {
      throw new Error('Failed to disable PWA: ' + error.message)
    }
  }

  const handleClearCache = async () => {
    if (!confirm('Are you sure you want to clear all PWA caches? This will remove offline content.')) {
      return
    }
    
    try {
      setIsLoading(true)
      
      if ('caches' in window) {
        const cacheNames = await caches.keys()
        await Promise.all(cacheNames.map(name => caches.delete(name)))
        
        // Reload the page to re-cache essential assets
        if (config.enabled) {
          window.location.reload()
        }
      }
      
      await loadPWAStatus()
      alert('Cache cleared successfully')
    } catch (error) {
      console.error('Failed to clear cache:', error)
      alert('Failed to clear cache: ' + error.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleForceUpdate = async () => {
    try {
      setIsLoading(true)
      
      if (serviceWorkerRegistration) {
        await serviceWorkerRegistration.update()
        
        // Check for waiting service worker
        if (serviceWorkerRegistration.waiting) {
          serviceWorkerRegistration.waiting.postMessage({ type: 'SKIP_WAITING' })
          window.location.reload()
        }
      }
      
      await loadPWAStatus()
    } catch (error) {
      console.error('Failed to force update:', error)
      alert('Failed to force update: ' + error.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleInstallApp = async () => {
    try {
      if (pwaManager && pwaManager.canInstall()) {
        await pwaManager.showInstallPrompt()
        await loadPWAStatus()
      } else {
        alert('App installation is not available at this time')
      }
    } catch (error) {
      console.error('Failed to install app:', error)
      alert('Failed to install app: ' + error.message)
    }
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">PWA (Progressive Web App) Settings</h2>
        <p className="text-gray-600 mb-6">
          Configure Progressive Web App features including offline mode, caching, and installation prompts.
        </p>

        {/* Environment Override Warning */}
        {envConfig && (envConfig.forceDisabled || envConfig.emergencyMode || !isPWAAllowed()) && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <h3 className="font-medium text-red-800 mb-2">⚠️ Environment Override Active</h3>
            <div className="text-sm text-red-700 space-y-1">
              {envConfig.forceDisabled && <p>• PWA is force disabled by environment configuration</p>}
              {envConfig.emergencyMode && <p>• Emergency mode is enabled - all PWA features are disabled</p>}
              {!isPWAAllowed() && <p>• PWA is not allowed by system administrator</p>}
              <p className="mt-2 font-medium">Contact your system administrator to modify these settings.</p>
            </div>
          </div>
        )}

        {/* Environment Configuration Info */}
        {envConfig && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="font-medium text-blue-800 mb-2">Environment Configuration</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-blue-700">
              <div className="flex justify-between">
                <span>Force Disabled:</span>
                <span className={envConfig.forceDisabled ? 'text-red-600' : 'text-green-600'}>
                  {envConfig.forceDisabled ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Emergency Mode:</span>
                <span className={envConfig.emergencyMode ? 'text-red-600' : 'text-green-600'}>
                  {envConfig.emergencyMode ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Development Mode:</span>
                <span className={envConfig.developmentMode ? 'text-orange-600' : 'text-gray-600'}>
                  {envConfig.developmentMode ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Cache Strategy Override:</span>
                <span className="text-gray-700">
                  {envConfig.forceCacheStrategy || 'None'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* PWA Status */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="font-medium mb-3">PWA Status</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="flex justify-between">
              <span>Service Worker:</span>
              <span className={status.isRegistered ? 'text-green-600' : 'text-red-600'}>
                {status.isRegistered ? '✓ Registered' : '✗ Not Registered'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>App Installed:</span>
              <span className={status.isInstalled ? 'text-green-600' : 'text-gray-600'}>
                {status.isInstalled ? '✓ Installed' : '○ Not Installed'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Update Available:</span>
              <span className={status.hasUpdate ? 'text-orange-600' : 'text-gray-600'}>
                {status.hasUpdate ? '⚠ Update Available' : '○ Up to Date'}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Cache Size:</span>
              <span className="text-gray-700">
                {formatBytes(status.cacheSize)}
              </span>
            </div>
          </div>
        </div>

        {/* Main PWA Toggle */}
        <div className="mb-6">
          <label className={`flex items-center justify-between p-4 border rounded-lg ${
            !isPWAAllowed() ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'
          }`}>
            <div>
              <div className="font-medium">Enable PWA Features</div>
              <div className="text-sm text-gray-600">
                Enable Progressive Web App functionality including offline mode and caching
                {!isPWAAllowed() && (
                  <span className="block text-red-600 mt-1">
                    ⚠️ Disabled by environment configuration
                  </span>
                )}
              </div>
            </div>
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => handleConfigChange('enabled', e.target.checked)}
              disabled={isLoading || !isPWAAllowed()}
              className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
            />
          </label>
        </div>

        {/* PWA Configuration Options */}
        {config.enabled && (
          <div className="space-y-4">
            {/* Offline Mode */}
            <label className={`flex items-center justify-between p-3 border rounded-lg ${
              envConfig && !envConfig.allowOfflineMode ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'
            }`}>
              <div>
                <div className="font-medium">Offline Mode</div>
                <div className="text-sm text-gray-600">
                  Show maintenance page when server is unavailable
                  {envConfig && !envConfig.allowOfflineMode && (
                    <span className="block text-red-600 mt-1">⚠️ Disabled by environment</span>
                  )}
                </div>
              </div>
              <input
                type="checkbox"
                checked={config.offlineMode}
                onChange={(e) => handleConfigChange('offlineMode', e.target.checked)}
                disabled={isLoading || (envConfig && !envConfig.allowOfflineMode)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
            </label>

            {/* Cache Strategy */}
            <div className={`p-3 border rounded-lg ${
              envConfig && (!envConfig.allowCaching || envConfig.forceCacheStrategy) ? 'opacity-50' : ''
            }`}>
              <label className="block font-medium mb-2">
                Cache Strategy
                {envConfig && envConfig.forceCacheStrategy && (
                  <span className="text-red-600 text-sm ml-2">⚠️ Overridden by environment</span>
                )}
              </label>
              <select
                value={config.cacheStrategy}
                onChange={(e) => handleConfigChange('cacheStrategy', e.target.value)}
                disabled={isLoading || (envConfig && (!envConfig.allowCaching || envConfig.forceCacheStrategy))}
                className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="intelligent">Intelligent (Recommended)</option>
                <option value="aggressive">Aggressive (More Offline Content)</option>
                <option value="minimal">Minimal (Less Storage Usage)</option>
                {envConfig && !envConfig.allowCaching && <option value="disabled">Disabled</option>}
              </select>
              <div className="text-sm text-gray-600 mt-1">
                {config.cacheStrategy === 'intelligent' && 'Balances performance and storage usage'}
                {config.cacheStrategy === 'aggressive' && 'Caches more content for better offline experience'}
                {config.cacheStrategy === 'minimal' && 'Caches only essential content to save storage'}
                {config.cacheStrategy === 'disabled' && 'Caching is disabled'}
                {envConfig && envConfig.forceCacheStrategy && (
                  <span className="block text-red-600 mt-1">
                    Environment forces: {envConfig.forceCacheStrategy}
                  </span>
                )}
              </div>
            </div>

            {/* Update Notifications */}
            <label className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
              <div>
                <div className="font-medium">Update Notifications</div>
                <div className="text-sm text-gray-600">
                  Show notifications when app updates are available
                </div>
              </div>
              <input
                type="checkbox"
                checked={config.updateNotifications}
                onChange={(e) => handleConfigChange('updateNotifications', e.target.checked)}
                disabled={isLoading}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
            </label>

            {/* Install Prompts */}
            <label className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
              <div>
                <div className="font-medium">Installation Prompts</div>
                <div className="text-sm text-gray-600">
                  Show prompts to install the app on device home screen
                </div>
              </div>
              <input
                type="checkbox"
                checked={config.installPrompts}
                onChange={(e) => handleConfigChange('installPrompts', e.target.checked)}
                disabled={isLoading}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
            </label>

            {/* Background Sync */}
            <label className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
              <div>
                <div className="font-medium">Background Sync</div>
                <div className="text-sm text-gray-600">
                  Sync data in the background when connection is restored
                </div>
              </div>
              <input
                type="checkbox"
                checked={config.backgroundSync}
                onChange={(e) => handleConfigChange('backgroundSync', e.target.checked)}
                disabled={isLoading}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
            </label>

            {/* Push Notifications */}
            <label className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
              <div>
                <div className="font-medium">Push Notifications</div>
                <div className="text-sm text-gray-600">
                  Enable push notifications (requires permission)
                </div>
              </div>
              <input
                type="checkbox"
                checked={config.pushNotifications}
                onChange={(e) => handleConfigChange('pushNotifications', e.target.checked)}
                disabled={isLoading}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
            </label>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={onSave}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
          >
            Save PWA Settings
          </button>
          
          {config.enabled && (
            <>
              <button
                onClick={handleClearCache}
                disabled={isLoading}
                className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50"
              >
                {isLoading ? 'Clearing...' : 'Clear Cache'}
              </button>
              
              {status.hasUpdate && (
                <button
                  onClick={handleForceUpdate}
                  disabled={isLoading}
                  className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
                >
                  {isLoading ? 'Updating...' : 'Update Now'}
                </button>
              )}
              
              {!status.isInstalled && (
                <button
                  onClick={handleInstallApp}
                  disabled={isLoading}
                  className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50"
                >
                  Install App
                </button>
              )}
            </>
          )}
          
          <button
            onClick={loadPWAStatus}
            disabled={isLoading}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 disabled:opacity-50"
          >
            {isLoading ? 'Refreshing...' : 'Refresh Status'}
          </button>
        </div>

        {/* Emergency Actions */}
        {config.enabled && (
          <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h4 className="font-medium text-yellow-900 mb-2">🚨 Emergency Actions</h4>
            <div className="text-sm text-yellow-800 space-y-2">
              <p>If PWA is causing issues and you cannot access the settings:</p>
              <div className="bg-yellow-100 p-2 rounded font-mono text-xs">
                emergencyDisablePWA()
              </div>
              <p>Open browser console (F12) and run the above command to completely disable PWA.</p>
            </div>
          </div>
        )}

        {/* Help Text */}
        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <h4 className="font-medium text-blue-900 mb-2">About PWA Features</h4>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• <strong>Offline Mode:</strong> Access the app even when the server is down</li>
            <li>• <strong>Caching:</strong> Faster loading times by storing content locally</li>
            <li>• <strong>Installation:</strong> Add the app to your device's home screen</li>
            <li>• <strong>Updates:</strong> Automatic updates with user notification</li>
            <li>• <strong>Background Sync:</strong> Sync data when connection is restored</li>
          </ul>
        </div>

        {/* Cache Manager Configuration */}
        {import.meta.env.VITE_SHOW_CACHE_MANAGER !== 'false' && (
          <div className="mt-6 p-4 bg-purple-50 border border-purple-200 rounded-lg">
            <h4 className="font-medium text-purple-900 mb-2">🔧 Cache Manager Widget</h4>
            <div className="text-sm text-purple-800 space-y-2">
              <p>The cache manager widget can be controlled via environment variables:</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                <div className="flex justify-between">
                  <span>Show Widget:</span>
                  <code className="text-xs bg-purple-100 px-1 rounded">
                    {import.meta.env.VITE_SHOW_CACHE_MANAGER !== 'false' ? 'Enabled' : 'Disabled'}
                  </code>
                </div>
                <div className="flex justify-between">
                  <span>Position:</span>
                  <code className="text-xs bg-purple-100 px-1 rounded">
                    {import.meta.env.VITE_CACHE_MANAGER_POSITION || 'bottom-right'}
                  </code>
                </div>
                <div className="flex justify-between">
                  <span>Auto Hide:</span>
                  <code className="text-xs bg-purple-100 px-1 rounded">
                    {import.meta.env.VITE_CACHE_MANAGER_AUTO_HIDE === 'true' ? 'Yes' : 'No'}
                  </code>
                </div>
                <div className="flex justify-between">
                  <span>Dev Only:</span>
                  <code className="text-xs bg-purple-100 px-1 rounded">
                    {import.meta.env.VITE_CACHE_MANAGER_DEV_ONLY === 'true' ? 'Yes' : 'No'}
                  </code>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Environment Variables Help */}
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-medium text-gray-900 mb-2">Environment Configuration</h4>
          <div className="text-sm text-gray-700 space-y-1">
            <p>System administrators can control PWA behavior via environment variables:</p>
            <ul className="mt-2 space-y-1 font-mono text-xs">
              <li>• <code>VITE_PWA_FORCE_DISABLED=true</code> - Completely disable PWA</li>
              <li>• <code>VITE_PWA_EMERGENCY_MODE=true</code> - Emergency disable all features</li>
              <li>• <code>VITE_PWA_ALLOW_CACHING=false</code> - Disable caching</li>
              <li>• <code>VITE_PWA_FORCE_CACHE_STRATEGY=minimal</code> - Force cache strategy</li>
              <li>• <code>VITE_SHOW_CACHE_MANAGER=false</code> - Hide cache manager widget</li>
              <li>• <code>VITE_CACHE_MANAGER_POSITION=hidden</code> - Hide cache manager</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}