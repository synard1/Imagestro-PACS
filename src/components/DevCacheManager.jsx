import React, { useState, useEffect, useRef } from 'react';
import { clearAllCaches, getCacheStatus, isDevelopmentMode } from '../utils/cacheManager';
import { 
  shouldShowCacheManager, 
  getCacheManagerPositionStyles, 
  getCacheManagerInitialState,
  getCacheManagerClasses,
  getCacheManagerSize,
  createAutoHideTimer,
  logCacheManagerConfig
} from '../utils/cacheManagerConfig';

/**
 * Configurable Cache Manager Component
 * Visibility and behavior controlled by environment variables
 */
const DevCacheManager = () => {
  const [cacheStatus, setCacheStatus] = useState(null);
  const [isClearing, setIsClearing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const autoHideTimerRef = useRef(null);
  const componentRef = useRef(null);

  // Get initial configuration
  const initialState = getCacheManagerInitialState();

  // Check if cache manager should be shown
  if (!shouldShowCacheManager()) {
    return null;
  }

  // Initialize state from configuration
  useEffect(() => {
    setIsVisible(initialState.visible);
    setIsMinimized(initialState.minimized);
    
    // Log configuration in development
    if (import.meta.env.DEV) {
      logCacheManagerConfig();
    }
  }, []);

  // Auto-hide functionality
  useEffect(() => {
    if (initialState.autoHide && isVisible && !isMinimized) {
      startAutoHideTimer();
    }
    
    return () => clearAutoHideTimer();
  }, [isVisible, isMinimized]);

  const startAutoHideTimer = () => {
    clearAutoHideTimer();
    autoHideTimerRef.current = createAutoHideTimer(() => {
      setIsMinimized(true);
    });
  };

  const clearAutoHideTimer = () => {
    if (autoHideTimerRef.current) {
      clearTimeout(autoHideTimerRef.current);
      autoHideTimerRef.current = null;
    }
  };

  const handleMouseEnter = () => {
    clearAutoHideTimer();
  };

  const handleMouseLeave = () => {
    if (initialState.autoHide && !isMinimized) {
      startAutoHideTimer();
    }
  };

  // Don't render if not visible
  if (!isVisible) {
    return null;
  }

  useEffect(() => {
    loadCacheStatus();
  }, []);

  const loadCacheStatus = async () => {
    try {
      const status = await getCacheStatus();
      setCacheStatus(status);
    } catch (error) {
      console.error('Failed to load cache status:', error);
    }
  };

  const handleClearCache = async () => {
    setIsClearing(true);
    try {
      const success = await clearAllCaches();
      if (success) {
        await loadCacheStatus();
        // Show success message
        console.log('Cache cleared successfully');
      }
    } catch (error) {
      console.error('Failed to clear cache:', error);
    } finally {
      setIsClearing(false);
    }
  };

  const handleClearAndReload = async () => {
    setIsClearing(true);
    try {
      await clearAllCaches();
      // Wait a moment then reload
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (error) {
      console.error('Failed to clear cache and reload:', error);
      window.location.reload();
    }
  };

  const positionStyles = getCacheManagerPositionStyles();
  const sizeStyles = getCacheManagerSize(isMinimized);
  const cssClasses = getCacheManagerClasses(isMinimized);

  if (!cacheStatus) {
    return (
      <div 
        style={{ ...positionStyles, ...sizeStyles }}
        className="bg-yellow-100 border border-yellow-300 rounded-lg p-3 text-sm"
      >
        <div className="text-yellow-800">Loading cache status...</div>
      </div>
    );
  }

  return (
    <div 
      ref={componentRef}
      style={{ ...positionStyles, ...sizeStyles }}
      className={cssClasses}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold text-gray-800 flex items-center gap-2">
          <span>Cache Manager</span>
          {import.meta.env.DEV && (
            <span className="text-xs bg-blue-100 text-blue-600 px-1 rounded">DEV</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-blue-600 hover:text-blue-800 text-xs"
            title="Toggle details"
          >
            {showDetails ? 'Hide' : 'Show'}
          </button>
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="text-gray-600 hover:text-gray-800 text-xs ml-1"
            title={isMinimized ? 'Expand' : 'Minimize'}
          >
            {isMinimized ? '▲' : '▼'}
          </button>
          <button
            onClick={() => setIsVisible(false)}
            className="text-gray-600 hover:text-red-600 text-xs ml-1"
            title="Hide cache manager"
          >
            ✕
          </button>
        </div>
      </div>

      {!isMinimized && (

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-gray-600">Service Worker:</span>
          <span className={`px-2 py-1 rounded text-xs ${
            cacheStatus.serviceWorkerActive 
              ? 'bg-green-100 text-green-800' 
              : 'bg-red-100 text-red-800'
          }`}>
            {cacheStatus.serviceWorkerActive ? 'Active' : 'Inactive'}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-gray-600">Caches:</span>
          <span className="text-gray-800">{cacheStatus.cacheCount || 0}</span>
        </div>

        {showDetails && cacheStatus.caches && (
          <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
            <div className="font-medium mb-1">Cache Details:</div>
            {cacheStatus.caches.map((cache, index) => (
              <div key={index} className="mb-1">
                <div className="font-mono text-blue-600">{cache.name}</div>
                <div className="text-gray-500 ml-2">{cache.entryCount} entries</div>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 mt-3">
          <button
            onClick={handleClearCache}
            disabled={isClearing}
            className="flex-1 bg-blue-500 text-white px-3 py-1 rounded text-xs hover:bg-blue-600 disabled:opacity-50"
          >
            {isClearing ? 'Clearing...' : 'Clear Cache'}
          </button>
          <button
            onClick={handleClearAndReload}
            disabled={isClearing}
            className="flex-1 bg-red-500 text-white px-3 py-1 rounded text-xs hover:bg-red-600 disabled:opacity-50"
          >
            Clear & Reload
          </button>
        </div>

          <div className="text-xs text-gray-500 mt-2">
            Tip: Use Ctrl+F5 for hard refresh with cache clear
          </div>
        </div>
      )}

      {isMinimized && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-600">
            {cacheStatus.cacheCount || 0} caches
          </span>
          <span className={`text-xs px-1 rounded ${
            cacheStatus.serviceWorkerActive 
              ? 'bg-green-100 text-green-600' 
              : 'bg-red-100 text-red-600'
          }`}>
            {cacheStatus.serviceWorkerActive ? 'SW Active' : 'SW Inactive'}
          </span>
        </div>
      )}
    </div>
  );
};

export default DevCacheManager;