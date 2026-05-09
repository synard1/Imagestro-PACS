/**
 * Custom Hook for Component Lifecycle Logging
 * 
 * Provides comprehensive lifecycle tracking with:
 * - Mount/unmount logging
 * - Performance monitoring
 * - Error boundary integration
 * - Data loading state tracking
 * - User interaction logging
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { createLogger } from '../utils/logger'
import { createPerformanceMonitor } from '../utils/performance'
import { useErrorHandler } from '../utils/errorHandler'
import { useNotification } from '../contexts/NotificationContext'

/**
 * Main lifecycle hook
 */
export const useComponentLifecycle = (componentName, options = {}) => {
  const {
    enablePerformanceMonitoring = true,
    enableErrorHandling = true,
    enableDataTracking = true,
    logUserInteractions = true,
    autoLogMount = true
  } = options

  // Initialize logger and performance monitor
  const logger = useRef(createLogger(componentName))
  const performanceMonitor = useRef(enablePerformanceMonitoring ? createPerformanceMonitor() : null)
  const { showNotification } = useNotification()
  
  // Error handler
  const errorHandler = enableErrorHandling 
    ? useErrorHandler(componentName, logger.current, showNotification)
    : null

  // Component state tracking
  const [componentState, setComponentState] = useState({
    mounted: false,
    loading: false,
    error: null,
    lastAction: null,
    dataLoadCount: 0,
    errorCount: 0
  })

  // Mount/unmount tracking
  useEffect(() => {
    if (autoLogMount && process.env.NODE_ENV === 'development') {
      logger.current.mountStart()
      
      if (performanceMonitor.current) {
        performanceMonitor.current.start('component-mount')
      }
    }

    setComponentState(prev => ({ ...prev, mounted: true }))

    // Log mount completion after a brief delay to capture initial render
    const mountTimer = setTimeout(() => {
      if (autoLogMount && process.env.NODE_ENV === 'development') {
        const mountDuration = performanceMonitor.current 
          ? performanceMonitor.current.end('component-mount')
          : null

        logger.current.mountComplete({
          performanceMonitoring: enablePerformanceMonitoring,
          errorHandling: enableErrorHandling,
          dataTracking: enableDataTracking,
          mountDuration
        })
      }
    }, 0)

    return () => {
      clearTimeout(mountTimer)
      if (autoLogMount && process.env.NODE_ENV === 'development') {
        logger.current.unmount()
      }
      setComponentState(prev => ({ ...prev, mounted: false }))
    }
  }, [autoLogMount, enablePerformanceMonitoring, enableErrorHandling, enableDataTracking])

  /**
   * Log data loading operations
   */
  const logDataOperation = useCallback((operation, dataType = 'data') => {
    const operationId = `${dataType}-${operation}-${Date.now()}`
    
    switch (operation) {
      case 'start':
        if (process.env.NODE_ENV === 'development') {
          logger.current.dataLoadStart(dataType)
        }
        if (performanceMonitor.current) {
          performanceMonitor.current.start(operationId)
        }
        setComponentState(prev => ({ 
          ...prev, 
          loading: true,
          lastAction: `Loading ${dataType}`
        }))
        return operationId

      case 'success':
        return (operationId, data = null) => {
          const duration = performanceMonitor.current 
            ? performanceMonitor.current.end(operationId)
            : null
          
          if (process.env.NODE_ENV === 'development') {
            logger.current.dataLoadSuccess(dataType, data, duration)
          }
          setComponentState(prev => ({ 
            ...prev, 
            loading: false,
            dataLoadCount: prev.dataLoadCount + 1,
            lastAction: `Loaded ${dataType} successfully`
          }))
        }

      case 'error':
        return (operationId, error) => {
          if (performanceMonitor.current) {
            performanceMonitor.current.end(operationId)
          }
          
          if (process.env.NODE_ENV === 'development') {
            logger.current.dataLoadError(dataType, error)
          }
          
          if (errorHandler) {
            errorHandler.handle(error, { operation: 'data-loading', dataType })
          }
          
          setComponentState(prev => ({ 
            ...prev, 
            loading: false,
            error: error,
            errorCount: prev.errorCount + 1,
            lastAction: `Failed to load ${dataType}`
          }))
        }

      default:
        logger.current.warn(`Unknown data operation: ${operation}`)
        return null
    }
  }, [errorHandler])

  /**
   * Log API operations
   */
  const logApiOperation = useCallback((operation, endpoint, method = 'GET') => {
    const operationId = `api-${method}-${endpoint.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}`
    
    switch (operation) {
      case 'start':
        if (process.env.NODE_ENV === 'development') {
          logger.current.apiCallStart(endpoint, method)
        }
        if (performanceMonitor.current) {
          performanceMonitor.current.start(operationId)
        }
        return operationId

      case 'success':
        return (operationId, response = null) => {
          const duration = performanceMonitor.current 
            ? performanceMonitor.current.end(operationId)
            : null
          
          if (process.env.NODE_ENV === 'development') {
            logger.current.apiCallSuccess(endpoint, method, response, duration)
          }
        }

      case 'error':
        return (operationId, error) => {
          if (performanceMonitor.current) {
            performanceMonitor.current.end(operationId)
          }
          
          if (process.env.NODE_ENV === 'development') {
            logger.current.apiCallError(endpoint, method, error)
          }
          
          if (errorHandler) {
            errorHandler.handle(error, { operation: 'api-call', endpoint, method })
          }
        }

      default:
        logger.current.warn(`Unknown API operation: ${operation}`)
        return null
    }
  }, [errorHandler])

  /**
   * Log user interactions
   */
  const logUserAction = useCallback((action, data = null) => {
    if (logUserInteractions && process.env.NODE_ENV === 'development') {
      logger.current.userAction(action, data)
    }
    if (logUserInteractions) {
      setComponentState(prev => ({ 
        ...prev, 
        lastAction: `User: ${action}`
      }))
    }
  }, [logUserInteractions])

  /**
   * Log permission checks
   */
  const logPermissionCheck = useCallback((permission, granted) => {
    logger.current.permissionCheck(permission, granted)
  }, [])

  /**
   * Log navigation events
   */
  const logNavigation = useCallback((from, to) => {
    logger.current.navigation(from, to)
  }, [])

  /**
   * Wrapper for async operations with automatic logging
   */
  const withAsyncLogging = useCallback((asyncFn, operationType = 'operation', identifier = 'unknown') => {
    return async (...args) => {
      const operationId = `${operationType}-${identifier}-${Date.now()}`
      
      try {
        logger.current.info(`🚀 Starting ${operationType}: ${identifier}`)
        
        if (performanceMonitor.current) {
          performanceMonitor.current.start(operationId)
        }

        const result = await asyncFn(...args)
        
        const duration = performanceMonitor.current 
          ? performanceMonitor.current.end(operationId)
          : null

        logger.current.success(`✅ Completed ${operationType}: ${identifier}${duration ? ` (${duration}ms)` : ''}`)
        
        return result
      } catch (error) {
        if (performanceMonitor.current) {
          performanceMonitor.current.end(operationId)
        }
        
        logger.current.error(`❌ Failed ${operationType}: ${identifier}`, null, error)
        
        if (errorHandler) {
          errorHandler.handle(error, { operation: operationType, identifier })
        }
        
        throw error
      }
    }
  }, [errorHandler])

  /**
   * Manual error logging
   */
  const logError = useCallback((error, context = {}) => {
    if (errorHandler) {
      return errorHandler.handle(error, context)
    } else {
      logger.current.error('Error occurred', context, error)
      return error
    }
  }, [errorHandler])

  /**
   * Performance timing utilities
   */
  const performance = useMemo(() => ({
    start: (operationName) => {
      if (performanceMonitor.current) {
        performanceMonitor.current.start(operationName)
      }
    },
    
    end: (operationName) => {
      if (performanceMonitor.current) {
        return performanceMonitor.current.end(operationName)
      }
      return null
    },
    
    time: async (operationName, asyncOperation) => {
      if (performanceMonitor.current) {
        return await performanceMonitor.current.timeAsync(operationName, asyncOperation)
      } else {
        const result = await asyncOperation()
        return { result, duration: null }
      }
    }
  }), [])

  /**
   * Debug information
   */
  const debug = useCallback((message, data = null) => {
    logger.current.debug(message, data)
  }, [])

  const info = useCallback((message, data = null) => {
    logger.current.info(message, data)
  }, [])

  const warn = useCallback((message, data = null) => {
    logger.current.warn(message, data)
  }, [])

  const error = useCallback((message, data = null, errorObj = null) => {
    logger.current.error(message, data, errorObj)
  }, [])

  return useMemo(() => ({
    // State
    componentState,
    
    // Data operations
    logDataOperation,
    
    // API operations
    logApiOperation,
    
    // User interactions
    logUserAction,
    
    // Permissions
    logPermissionCheck,
    
    // Navigation
    logNavigation,
    
    // Async wrapper
    withAsyncLogging,
    
    // Error handling
    logError,
    errorHandler,
    
    // Performance monitoring
    performance,
    
    // Direct logging methods
    debug,
    info,
    warn,
    error,
    
    // Raw logger access
    logger: logger.current
  }), [
    componentState,
    logDataOperation,
    logApiOperation,
    logUserAction,
    logPermissionCheck,
    logNavigation,
    withAsyncLogging,
    logError,
    errorHandler,
    performance,
    debug,
    info,
    warn,
    error
  ])
}

/**
 * Simplified hook for basic logging needs
 */
export const useBasicLogging = (componentName) => {
  return useComponentLifecycle(componentName, {
    enablePerformanceMonitoring: false,
    enableErrorHandling: false,
    enableDataTracking: false,
    logUserInteractions: false
  })
}

/**
 * Hook specifically for page components
 */
export const usePageLifecycle = (pageName) => {
  return useComponentLifecycle(`Page:${pageName}`, {
    enablePerformanceMonitoring: true,
    enableErrorHandling: true,
    enableDataTracking: true,
    logUserInteractions: true
  })
}

/**
 * Hook specifically for service components
 */
export const useServiceLifecycle = (serviceName) => {
  return useComponentLifecycle(`Service:${serviceName}`, {
    enablePerformanceMonitoring: true,
    enableErrorHandling: true,
    enableDataTracking: true,
    logUserInteractions: false
  })
}

export default useComponentLifecycle