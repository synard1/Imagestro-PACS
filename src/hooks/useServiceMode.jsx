/**
 * Service Mode Toggle Hook
 * 
 * Provides a way to toggle between mock and real services for development.
 * Stores preference in localStorage and provides context for all components.
 * 
 * Features:
 * - Environment variable check for auto-switching (VITE_USE_MOCK_SERVICES)
 * - Graceful fallback to mock when backend is unavailable
 * - Automatic backend availability checking
 * - Service factory for getting appropriate service based on mode
 * 
 * Requirements: 11.4
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';

// Service mode constants
export const SERVICE_MODES = {
  MOCK: 'mock',
  REAL: 'real',
};

// LocalStorage key
const STORAGE_KEY = 'pacs_service_mode';

// Environment variable checks
const ENV_USE_MOCK = import.meta.env.VITE_USE_MOCK_SERVICES === 'true';
const ENV_FORCE_REAL = import.meta.env.VITE_FORCE_REAL_SERVICES === 'true';
// FIXED: Default to false when VITE_FORCE_REAL_SERVICES is true
const ENV_AUTO_FALLBACK = ENV_FORCE_REAL 
  ? false 
  : import.meta.env.VITE_AUTO_FALLBACK_TO_MOCK !== 'false';

// Backend health check configuration
const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
const HEALTH_CHECK_TIMEOUT = 5000; // 5 seconds

/**
 * Get initial service mode from environment or localStorage
 */
const getInitialMode = () => {
  // Force real mode if explicitly set (useful for production)
  if (ENV_FORCE_REAL) {
    return SERVICE_MODES.REAL;
  }

  // Check environment variable for mock mode
  if (ENV_USE_MOCK) {
    return SERVICE_MODES.MOCK;
  }

  // Check localStorage
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && Object.values(SERVICE_MODES).includes(stored)) {
      return stored;
    }
  } catch (e) {
    console.warn('Failed to read service mode from localStorage:', e);
  }

  // FIXED: Default to real when VITE_FORCE_REAL_SERVICES is true, otherwise mock in development
  if (ENV_FORCE_REAL) {
    return SERVICE_MODES.REAL;
  }
  return import.meta.env.DEV ? SERVICE_MODES.MOCK : SERVICE_MODES.REAL;
};

// Create context
const ServiceModeContext = createContext(null);

/**
 * Service Mode Provider Component
 * Wrap your app with this to enable service mode toggling
 */
export function ServiceModeProvider({ children }) {
  const [mode, setModeState] = useState(getInitialMode);
  const [backendAvailable, setBackendAvailable] = useState(null);
  const [lastHealthCheck, setLastHealthCheck] = useState(null);
  const healthCheckIntervalRef = useRef(null);

  // Persist mode to localStorage
  const setMode = useCallback((newMode) => {
    if (!Object.values(SERVICE_MODES).includes(newMode)) {
      console.warn(`Invalid service mode: ${newMode}`);
      return;
    }

    setModeState(newMode);
    try {
      localStorage.setItem(STORAGE_KEY, newMode);
    } catch (e) {
      console.warn('Failed to save service mode to localStorage:', e);
    }
  }, []);

  // Toggle between mock and real
  const toggleMode = useCallback(() => {
    setMode(mode === SERVICE_MODES.MOCK ? SERVICE_MODES.REAL : SERVICE_MODES.MOCK);
  }, [mode, setMode]);

  // Check backend availability with configurable endpoint
  const checkBackendAvailability = useCallback(async (endpoint = '/api/health') => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);

      const response = await fetch(endpoint, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const isAvailable = response.ok;
      setBackendAvailable(isAvailable);
      setLastHealthCheck(new Date());
      return isAvailable;
    } catch (e) {
      setBackendAvailable(false);
      setLastHealthCheck(new Date());
      return false;
    }
  }, []);

  // Check backend on mount and when switching to real mode
  useEffect(() => {
    if (mode === SERVICE_MODES.REAL) {
      checkBackendAvailability();

      // Set up periodic health checks when in real mode
      if (ENV_AUTO_FALLBACK) {
        healthCheckIntervalRef.current = setInterval(() => {
          checkBackendAvailability();
        }, HEALTH_CHECK_INTERVAL);
      }
    }

    return () => {
      if (healthCheckIntervalRef.current) {
        clearInterval(healthCheckIntervalRef.current);
        healthCheckIntervalRef.current = null;
      }
    };
  }, [mode, checkBackendAvailability]);

  // Auto-fallback to mock if backend unavailable (only if auto-fallback is enabled)
  // FIXED: Never fallback when VITE_FORCE_REAL_SERVICES is true
  const effectiveMode = useMemo(() => {
    // If force real is enabled, NEVER fallback to mock
    if (ENV_FORCE_REAL) {
      return SERVICE_MODES.REAL;
    }
    if (ENV_AUTO_FALLBACK && mode === SERVICE_MODES.REAL && backendAvailable === false) {
      return SERVICE_MODES.MOCK;
    }
    return mode;
  }, [mode, backendAvailable]);

  // Determine if we're using fallback mode
  const isUsingFallback = useMemo(() => {
    return mode === SERVICE_MODES.REAL && effectiveMode === SERVICE_MODES.MOCK;
  }, [mode, effectiveMode]);

  const value = useMemo(() => ({
    mode,
    effectiveMode,
    isMockMode: effectiveMode === SERVICE_MODES.MOCK,
    isRealMode: effectiveMode === SERVICE_MODES.REAL,
    backendAvailable,
    lastHealthCheck,
    setMode,
    toggleMode,
    checkBackendAvailability,
    // Convenience flags
    isUsingFallback,
    // Environment configuration
    autoFallbackEnabled: ENV_AUTO_FALLBACK,
    forcedRealMode: ENV_FORCE_REAL,
  }), [mode, effectiveMode, backendAvailable, lastHealthCheck, setMode, toggleMode, checkBackendAvailability, isUsingFallback]);

  return (
    <ServiceModeContext.Provider value={value}>
      {children}
    </ServiceModeContext.Provider>
  );
}

/**
 * Hook to access service mode context
 */
export function useServiceMode() {
  const context = useContext(ServiceModeContext);
  
  if (!context) {
    throw new Error('useServiceMode must be used within a ServiceModeProvider');
  }
  
  return context;
}

/**
 * Service Mode Indicator Component
 * Shows a visual indicator when using mock mode
 */
export function ServiceModeIndicator({ className = '' }) {
  const { isMockMode, isUsingFallback, toggleMode } = useServiceMode();

  if (!isMockMode) {
    return null;
  }

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 ${className}`}
      onClick={toggleMode}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && toggleMode()}
    >
      <div className={`
        px-3 py-2 rounded-lg shadow-lg cursor-pointer
        flex items-center gap-2 text-sm font-medium
        transition-colors duration-200
        ${isUsingFallback 
          ? 'bg-yellow-100 text-yellow-800 border border-yellow-300' 
          : 'bg-blue-100 text-blue-800 border border-blue-300'
        }
        hover:opacity-80
      `}>
        <span className={`
          w-2 h-2 rounded-full
          ${isUsingFallback ? 'bg-yellow-500' : 'bg-blue-500'}
          animate-pulse
        `} />
        <span>
          {isUsingFallback ? 'Mock Mode (Backend Unavailable)' : 'Mock Mode'}
        </span>
      </div>
    </div>
  );
}

/**
 * Higher-order component to inject service mode
 */
export function withServiceMode(Component) {
  return function WrappedComponent(props) {
    const serviceMode = useServiceMode();
    return <Component {...props} serviceMode={serviceMode} />;
  };
}

/**
 * Hook to get the appropriate service based on mode
 * @param {Object} mockService - Mock service implementation
 * @param {Object} realService - Real service implementation
 * @returns {Object} The appropriate service based on current mode
 */
export function useService(mockService, realService) {
  const { effectiveMode } = useServiceMode();
  
  return useMemo(() => {
    return effectiveMode === SERVICE_MODES.MOCK ? mockService : realService;
  }, [effectiveMode, mockService, realService]);
}

/**
 * Create a service factory that returns the appropriate service based on mode
 * This is useful for creating service instances outside of React components
 * 
 * @param {Object} mockService - Mock service implementation
 * @param {Object} realService - Real service implementation
 * @returns {Function} Factory function that returns the appropriate service
 */
export function createServiceFactory(mockService, realService) {
  return (isMockMode) => {
    return isMockMode ? mockService : realService;
  };
}

/**
 * Hook to get multiple services based on mode
 * @param {Object} services - Object with mock and real service pairs
 * @returns {Object} Object with the appropriate services based on current mode
 * 
 * @example
 * const services = useServices({
 *   mapping: { mock: mockMappingService, real: realMappingService },
 *   import: { mock: mockImportService, real: realImportService },
 * });
 * // services.mapping and services.import will be the appropriate service
 */
export function useServices(services) {
  const { effectiveMode } = useServiceMode();
  
  return useMemo(() => {
    const result = {};
    for (const [key, { mock, real }] of Object.entries(services)) {
      result[key] = effectiveMode === SERVICE_MODES.MOCK ? mock : real;
    }
    return result;
  }, [effectiveMode, services]);
}

/**
 * Hook to get service with automatic error handling and fallback
 * If the real service call fails, it can optionally fall back to mock
 * 
 * @param {Object} mockService - Mock service implementation
 * @param {Object} realService - Real service implementation
 * @param {Object} options - Options for the service wrapper
 * @param {boolean} options.fallbackOnError - Whether to fallback to mock on error
 * @returns {Object} Wrapped service with error handling
 */
export function useServiceWithFallback(mockService, realService, options = {}) {
  const { effectiveMode, isMockMode, checkBackendAvailability } = useServiceMode();
  const { fallbackOnError = true } = options;
  
  return useMemo(() => {
    if (isMockMode) {
      return mockService;
    }

    // Wrap real service methods with error handling
    const wrappedService = {};
    for (const [key, value] of Object.entries(realService)) {
      if (typeof value === 'function') {
        wrappedService[key] = async (...args) => {
          try {
            return await value(...args);
          } catch (error) {
            // Check if it's a network/connection error
            if (fallbackOnError && (
              error.name === 'TypeError' ||
              error.message?.includes('network') ||
              error.message?.includes('fetch') ||
              error.code === 'ECONNREFUSED'
            )) {
              console.warn(`[useServiceWithFallback] Real service failed, falling back to mock for ${key}:`, error.message);
              // Re-check backend availability
              checkBackendAvailability();
              // Fall back to mock service
              if (typeof mockService[key] === 'function') {
                return await mockService[key](...args);
              }
            }
            throw error;
          }
        };
      } else {
        wrappedService[key] = value;
      }
    }
    return wrappedService;
  }, [effectiveMode, isMockMode, mockService, realService, fallbackOnError, checkBackendAvailability]);
}

export default {
  ServiceModeProvider,
  useServiceMode,
  useService,
  useServices,
  useServiceWithFallback,
  createServiceFactory,
  ServiceModeIndicator,
  withServiceMode,
  SERVICE_MODES,
};
