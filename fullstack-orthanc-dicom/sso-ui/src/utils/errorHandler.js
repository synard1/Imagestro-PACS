/**
 * Comprehensive Error Handling Utility
 * 
 * Provides robust error handling with detailed logging,
 * user-friendly error messages, and fallback mechanisms.
 */

import React from 'react'
import { globalLogger } from './logger'

/**
 * Error types for categorization
 */
export const ERROR_TYPES = {
  NETWORK: 'NETWORK_ERROR',
  AUTHENTICATION: 'AUTH_ERROR',
  AUTHORIZATION: 'PERMISSION_ERROR',
  VALIDATION: 'VALIDATION_ERROR',
  API: 'API_ERROR',
  COMPONENT: 'COMPONENT_ERROR',
  UNKNOWN: 'UNKNOWN_ERROR'
}

/**
 * Error severity levels
 */
export const ERROR_SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
}

/**
 * Categorize error based on error object
 */
const categorizeError = (error) => {
  if (!error) return ERROR_TYPES.UNKNOWN

  // Network errors
  if (error.code === 'NETWORK_ERROR' || error.message?.includes('Network Error')) {
    return ERROR_TYPES.NETWORK
  }

  // HTTP status code based categorization
  if (error.response?.status) {
    const status = error.response.status
    if (status === 401) return ERROR_TYPES.AUTHENTICATION
    if (status === 403) return ERROR_TYPES.AUTHORIZATION
    if (status >= 400 && status < 500) return ERROR_TYPES.VALIDATION
    if (status >= 500) return ERROR_TYPES.API
  }

  // React/Component errors
  if (error.name === 'ChunkLoadError' || error.message?.includes('Loading chunk')) {
    return ERROR_TYPES.COMPONENT
  }

  return ERROR_TYPES.UNKNOWN
}

/**
 * Determine error severity
 */
const determineSeverity = (errorType, error) => {
  switch (errorType) {
    case ERROR_TYPES.AUTHENTICATION:
    case ERROR_TYPES.NETWORK:
      return ERROR_SEVERITY.HIGH
    
    case ERROR_TYPES.AUTHORIZATION:
      return ERROR_SEVERITY.MEDIUM
    
    case ERROR_TYPES.API:
      return error.response?.status >= 500 ? ERROR_SEVERITY.HIGH : ERROR_SEVERITY.MEDIUM
    
    case ERROR_TYPES.COMPONENT:
      return ERROR_SEVERITY.CRITICAL
    
    case ERROR_TYPES.VALIDATION:
      return ERROR_SEVERITY.LOW
    
    default:
      return ERROR_SEVERITY.MEDIUM
  }
}

/**
 * Generate user-friendly error messages
 */
const getUserFriendlyMessage = (errorType, error) => {
  const defaultMessages = {
    [ERROR_TYPES.NETWORK]: 'Koneksi jaringan bermasalah. Silakan periksa koneksi internet Anda.',
    [ERROR_TYPES.AUTHENTICATION]: 'Sesi Anda telah berakhir. Silakan login kembali.',
    [ERROR_TYPES.AUTHORIZATION]: 'Anda tidak memiliki izin untuk mengakses fitur ini.',
    [ERROR_TYPES.VALIDATION]: 'Data yang dimasukkan tidak valid. Silakan periksa kembali.',
    [ERROR_TYPES.API]: 'Terjadi kesalahan pada server. Silakan coba lagi nanti.',
    [ERROR_TYPES.COMPONENT]: 'Terjadi kesalahan pada aplikasi. Silakan refresh halaman.',
    [ERROR_TYPES.UNKNOWN]: 'Terjadi kesalahan yang tidak diketahui. Silakan coba lagi.'
  }

  // Try to get more specific message from error response
  if (error.response?.data?.message) {
    return error.response.data.message
  }

  if (error.message && error.message !== 'Network Error') {
    return error.message
  }

  return defaultMessages[errorType] || defaultMessages[ERROR_TYPES.UNKNOWN]
}

/**
 * Enhanced Error class with additional context
 */
export class EnhancedError extends Error {
  constructor(originalError, context = {}) {
    super(originalError.message || 'Unknown error occurred')
    
    this.name = 'EnhancedError'
    this.originalError = originalError
    this.type = categorizeError(originalError)
    this.severity = determineSeverity(this.type, originalError)
    this.userMessage = getUserFriendlyMessage(this.type, originalError)
    this.context = context
    this.timestamp = new Date().toISOString()
    
    // Preserve stack trace
    if (originalError.stack) {
      this.stack = originalError.stack
    }
  }

  /**
   * Get detailed error information for logging
   */
  getDetailedInfo() {
    return {
      type: this.type,
      severity: this.severity,
      message: this.message,
      userMessage: this.userMessage,
      context: this.context,
      timestamp: this.timestamp,
      originalError: {
        name: this.originalError.name,
        message: this.originalError.message,
        stack: this.originalError.stack,
        response: this.originalError.response ? {
          status: this.originalError.response.status,
          statusText: this.originalError.response.statusText,
          data: this.originalError.response.data
        } : null
      }
    }
  }
}

/**
 * Error Handler class for component-level error handling
 */
export class ErrorHandler {
  constructor(componentName, logger, showNotification = null) {
    this.componentName = componentName
    this.logger = logger
    this.showNotification = showNotification
  }

  /**
   * Handle error with comprehensive logging and user notification
   */
  handle(error, context = {}, options = {}) {
    const enhancedError = new EnhancedError(error, {
      component: this.componentName,
      ...context
    })

    // Log the error
    this.logger.error(
      `Error occurred: ${enhancedError.type}`,
      enhancedError.getDetailedInfo(),
      enhancedError.originalError
    )

    // Show user notification if available and not disabled
    if (this.showNotification && !options.silent) {
      const notificationType = this.getNotificationType(enhancedError.severity)
      this.showNotification(enhancedError.userMessage, notificationType)
    }

    // Execute custom error handler if provided
    if (options.onError) {
      try {
        options.onError(enhancedError)
      } catch (handlerError) {
        this.logger.error('Error in custom error handler', null, handlerError)
      }
    }

    return enhancedError
  }

  /**
   * Handle async operation with automatic error handling
   */
  async handleAsync(asyncOperation, context = {}, options = {}) {
    try {
      const result = await asyncOperation()
      return { success: true, data: result, error: null }
    } catch (error) {
      const enhancedError = this.handle(error, context, options)
      return { success: false, data: null, error: enhancedError }
    }
  }

  /**
   * Wrap a function with error handling
   */
  wrap(fn, context = {}, options = {}) {
    return (...args) => {
      try {
        const result = fn(...args)
        
        // Handle async functions
        if (result && typeof result.then === 'function') {
          return result.catch(error => {
            this.handle(error, context, options)
            throw error
          })
        }
        
        return result
      } catch (error) {
        this.handle(error, context, options)
        throw error
      }
    }
  }

  /**
   * Get notification type based on error severity
   */
  getNotificationType(severity) {
    switch (severity) {
      case ERROR_SEVERITY.LOW:
        return 'info'
      case ERROR_SEVERITY.MEDIUM:
        return 'warning'
      case ERROR_SEVERITY.HIGH:
      case ERROR_SEVERITY.CRITICAL:
        return 'error'
      default:
        return 'error'
    }
  }
}

/**
 * React Hook for error handling
 */
export const useErrorHandler = (componentName, logger, showNotification) => {
  const errorHandler = React.useMemo(
    () => new ErrorHandler(componentName, logger, showNotification),
    [componentName, logger, showNotification]
  )

  return errorHandler
}

/**
 * Global error handler for unhandled errors
 */
export const setupGlobalErrorHandler = () => {
  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    globalLogger.error(
      'Unhandled promise rejection',
      {
        reason: event.reason,
        promise: event.promise
      },
      event.reason
    )
  })

  // Handle uncaught errors
  window.addEventListener('error', (event) => {
    globalLogger.error(
      'Uncaught error',
      {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      },
      event.error
    )
  })
}

/**
 * Utility functions for common error scenarios
 */
export const errorUtils = {
  /**
   * Check if error is a network error
   */
  isNetworkError: (error) => categorizeError(error) === ERROR_TYPES.NETWORK,

  /**
   * Check if error is an authentication error
   */
  isAuthError: (error) => categorizeError(error) === ERROR_TYPES.AUTHENTICATION,

  /**
   * Check if error is an authorization error
   */
  isPermissionError: (error) => categorizeError(error) === ERROR_TYPES.AUTHORIZATION,

  /**
   * Extract error message for display
   */
  getDisplayMessage: (error) => {
    const enhancedError = new EnhancedError(error)
    return enhancedError.userMessage
  },

  /**
   * Create a retry function with exponential backoff
   */
  createRetryFunction: (fn, maxRetries = 3, baseDelay = 1000) => {
    return async (...args) => {
      let lastError
      
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return await fn(...args)
        } catch (error) {
          lastError = error
          
          if (attempt === maxRetries) {
            throw error
          }
          
          // Don't retry on certain error types
          const errorType = categorizeError(error)
          if ([ERROR_TYPES.AUTHENTICATION, ERROR_TYPES.AUTHORIZATION, ERROR_TYPES.VALIDATION].includes(errorType)) {
            throw error
          }
          
          // Exponential backoff
          const delay = baseDelay * Math.pow(2, attempt)
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
      
      throw lastError
    }
  }
}

export default {
  ErrorHandler,
  EnhancedError,
  useErrorHandler,
  setupGlobalErrorHandler,
  errorUtils,
  ERROR_TYPES,
  ERROR_SEVERITY
}