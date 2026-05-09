/**
 * Khanza Error Handler Service
 * 
 * Provides comprehensive error handling for Khanza integration:
 * - API connection errors with retry logic
 * - Validation error messages
 * - User-friendly error displays
 * - Error categorization and logging
 * 
 * Requirements: 1.5, 2.5, 3.3, 8.4
 */

import { logger } from '../utils/logger';
import { notify } from './notifications';

// Error categories
export const ERROR_CATEGORIES = {
  NETWORK: 'NETWORK',
  TIMEOUT: 'TIMEOUT',
  AUTH: 'AUTH',
  VALIDATION: 'VALIDATION',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  SERVER: 'SERVER',
  UNKNOWN: 'UNKNOWN',
};

// Error severity levels
export const ERROR_SEVERITY = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical',
};

// Retry configuration
const DEFAULT_RETRY_CONFIG = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
};

/**
 * Categorize error based on error code or HTTP status
 * @param {Error|Object} error - Error object
 * @returns {string} Error category
 */
export const categorizeError = (error) => {
  if (!error) return ERROR_CATEGORIES.UNKNOWN;

  const code = error.code || error.status;
  const message = (error.message || '').toLowerCase();

  // Network errors
  if (code === 'NETWORK_ERROR' || message.includes('failed to fetch') || message.includes('network')) {
    return ERROR_CATEGORIES.NETWORK;
  }

  // Timeout errors
  if (code === 'TIMEOUT' || message.includes('timeout')) {
    return ERROR_CATEGORIES.TIMEOUT;
  }

  // Authentication errors
  if (code === 'AUTH_FAILED' || code === 401 || message.includes('authentication') || message.includes('unauthorized')) {
    return ERROR_CATEGORIES.AUTH;
  }

  // Validation errors
  if (code === 'VALIDATION_ERROR' || code === 400 || message.includes('validation') || message.includes('invalid')) {
    return ERROR_CATEGORIES.VALIDATION;
  }

  // Not found errors
  if (code === 'NOT_FOUND' || code === 404 || message.includes('not found')) {
    return ERROR_CATEGORIES.NOT_FOUND;
  }

  // Conflict errors (duplicate, etc.)
  if (code === 'DUPLICATE' || code === 409 || message.includes('duplicate') || message.includes('conflict')) {
    return ERROR_CATEGORIES.CONFLICT;
  }

  // Server errors
  if (code === 'SERVER_ERROR' || code === 'ACCESS_DENIED' || (code >= 500 && code < 600)) {
    return ERROR_CATEGORIES.SERVER;
  }

  return ERROR_CATEGORIES.UNKNOWN;
};

/**
 * Get user-friendly error message based on error category
 * @param {Error|Object} error - Error object
 * @param {string} context - Context where error occurred (e.g., 'order_import', 'config_save')
 * @returns {Object} User-friendly error message and details
 */
export const getUserFriendlyErrorMessage = (error, context = '') => {
  if (!error) {
    return {
      title: 'Unknown Error',
      message: 'An unexpected error occurred. Please try again.',
      details: null,
      severity: ERROR_SEVERITY.ERROR,
      category: ERROR_CATEGORIES.UNKNOWN,
      actionable: false,
    };
  }

  const category = categorizeError(error);
  const originalMessage = error.message || '';

  let title = 'Error';
  let message = originalMessage;
  let details = null;
  let severity = ERROR_SEVERITY.ERROR;
  let actionable = false;

  switch (category) {
    case ERROR_CATEGORIES.NETWORK:
      title = 'Connection Failed';
      message = 'Cannot connect to Khanza API. Please check:';
      details = [
        '• API URL is correct in Settings',
        '• Khanza API service is running',
        '• Network connectivity is available',
        '• Firewall is not blocking the connection',
      ];
      severity = ERROR_SEVERITY.ERROR;
      actionable = true;
      break;

    case ERROR_CATEGORIES.TIMEOUT:
      title = 'Request Timeout';
      message = 'Khanza API is taking too long to respond. This may indicate:';
      details = [
        '• Khanza API is slow or overloaded',
        '• Network connection is slow',
        '• Request timeout setting is too short',
      ];
      severity = ERROR_SEVERITY.WARNING;
      actionable = true;
      break;

    case ERROR_CATEGORIES.AUTH:
      title = 'Authentication Failed';
      message = 'Cannot authenticate with Khanza API. Please check:';
      details = [
        '• API Key is correct in Settings',
        '• API Key has not expired',
        '• API Key has required permissions',
      ];
      severity = ERROR_SEVERITY.ERROR;
      actionable = true;
      break;

    case ERROR_CATEGORIES.VALIDATION:
      title = 'Validation Error';
      message = originalMessage || 'The provided data is invalid. Please check your input.';
      if (error.details && Array.isArray(error.details)) {
        details = error.details;
      }
      severity = ERROR_SEVERITY.WARNING;
      actionable = true;
      break;

    case ERROR_CATEGORIES.NOT_FOUND:
      title = 'Not Found';
      message = originalMessage || 'The requested resource was not found.';
      severity = ERROR_SEVERITY.WARNING;
      actionable = false;
      break;

    case ERROR_CATEGORIES.CONFLICT:
      title = 'Conflict';
      message = originalMessage || 'This resource already exists or conflicts with existing data.';
      severity = ERROR_SEVERITY.WARNING;
      actionable = false;
      break;

    case ERROR_CATEGORIES.SERVER:
      title = 'Server Error';
      message = 'Khanza API server encountered an error. Please:';
      details = [
        '• Try again in a few moments',
        '• Check Khanza API service status',
        '• Contact system administrator if problem persists',
      ];
      severity = ERROR_SEVERITY.ERROR;
      actionable = true;
      break;

    default:
      title = 'Unexpected Error';
      message = originalMessage || 'An unexpected error occurred.';
      severity = ERROR_SEVERITY.ERROR;
      actionable = false;
  }

  return {
    title,
    message,
    details,
    severity,
    category,
    actionable,
    originalError: originalMessage,
  };
};

/**
 * Handle error with logging and user notification
 * @param {Error|Object} error - Error object
 * @param {Object} options - Options
 * @param {string} options.context - Context where error occurred
 * @param {boolean} options.notify - Whether to show user notification (default: true)
 * @param {boolean} options.log - Whether to log error (default: true)
 * @param {Function} options.onError - Callback function for error handling
 * @returns {Object} Processed error information
 */
export const handleError = (error, options = {}) => {
  const {
    context = 'khanza_operation',
    notify: shouldNotify = true,
    log: shouldLog = true,
    onError = null,
  } = options;

  // Get user-friendly error message
  const errorInfo = getUserFriendlyErrorMessage(error, context);

  // Log error
  if (shouldLog) {
    logger.error(`[khanzaErrorHandler] ${context}:`, {
      category: errorInfo.category,
      severity: errorInfo.severity,
      message: errorInfo.message,
      originalError: error.message,
      stack: error.stack,
    });
  }

  // Show user notification
  if (shouldNotify) {
    const toastType = errorInfo.severity === ERROR_SEVERITY.CRITICAL ? 'error' : errorInfo.severity;
    const detailText = errorInfo.details
      ? Array.isArray(errorInfo.details)
        ? errorInfo.details.join('\n')
        : errorInfo.details
      : null;

    notify({
      type: toastType,
      message: errorInfo.title,
      detail: detailText || errorInfo.message,
      ttl: errorInfo.severity === ERROR_SEVERITY.CRITICAL ? 0 : 5000,
    });
  }

  // Call error callback if provided
  if (onError && typeof onError === 'function') {
    try {
      onError(errorInfo);
    } catch (callbackError) {
      logger.error('[khanzaErrorHandler] Error callback failed:', callbackError.message);
    }
  }

  return errorInfo;
};

/**
 * Retry a failed operation with exponential backoff
 * @param {Function} operation - Async function to retry
 * @param {Object} options - Retry options
 * @param {number} options.maxAttempts - Maximum retry attempts
 * @param {number} options.initialDelayMs - Initial delay in milliseconds
 * @param {number} options.maxDelayMs - Maximum delay in milliseconds
 * @param {number} options.backoffMultiplier - Backoff multiplier
 * @param {Array<number>} options.retryableStatuses - HTTP statuses to retry on
 * @param {Function} options.onRetry - Callback on retry attempt
 * @returns {Promise<any>} Operation result
 */
export const retryWithBackoff = async (operation, options = {}) => {
  const {
    maxAttempts = DEFAULT_RETRY_CONFIG.maxAttempts,
    initialDelayMs = DEFAULT_RETRY_CONFIG.initialDelayMs,
    maxDelayMs = DEFAULT_RETRY_CONFIG.maxDelayMs,
    backoffMultiplier = DEFAULT_RETRY_CONFIG.backoffMultiplier,
    retryableStatuses = DEFAULT_RETRY_CONFIG.retryableStatuses,
    onRetry = null,
  } = options;

  let lastError;
  let delayMs = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      logger.debug('[khanzaErrorHandler]', `Attempt ${attempt}/${maxAttempts}`);
      return await operation();
    } catch (error) {
      lastError = error;
      const isRetryable = isRetryableError(error, retryableStatuses);

      if (attempt === maxAttempts || !isRetryable) {
        // Last attempt or non-retryable error
        logger.error('[khanzaErrorHandler]', `Operation failed after ${attempt} attempt(s):`, error.message);
        throw error;
      }

      // Calculate delay for next attempt
      const nextDelay = Math.min(delayMs, maxDelayMs);
      logger.warn('[khanzaErrorHandler]', `Retrying after ${nextDelay}ms (attempt ${attempt}/${maxAttempts})`);

      // Call retry callback if provided
      if (onRetry && typeof onRetry === 'function') {
        try {
          onRetry({
            attempt,
            maxAttempts,
            delayMs: nextDelay,
            error: error.message,
          });
        } catch (callbackError) {
          logger.error('[khanzaErrorHandler]', 'Retry callback failed:', callbackError.message);
        }
      }

      // Wait before retrying
      await delay(nextDelay);

      // Increase delay for next attempt
      delayMs = Math.ceil(delayMs * backoffMultiplier);
    }
  }

  throw lastError;
};

/**
 * Check if error is retryable
 * @param {Error|Object} error - Error object
 * @param {Array<number>} retryableStatuses - HTTP statuses to retry on
 * @returns {boolean} True if error is retryable
 */
const isRetryableError = (error, retryableStatuses = DEFAULT_RETRY_CONFIG.retryableStatuses) => {
  if (!error) return false;

  const code = error.code || error.status;

  // Retryable error codes
  if (code === 'TIMEOUT' || code === 'NETWORK_ERROR') {
    return true;
  }

  // Retryable HTTP statuses
  if (typeof code === 'number' && retryableStatuses.includes(code)) {
    return true;
  }

  return false;
};

/**
 * Delay execution for specified milliseconds
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Validate required fields in object
 * @param {Object} obj - Object to validate
 * @param {Array<string>} requiredFields - Required field names
 * @returns {Object} Validation result { valid: boolean, errors: string[] }
 */
export const validateRequiredFields = (obj, requiredFields = []) => {
  const errors = [];

  if (!obj || typeof obj !== 'object') {
    return {
      valid: false,
      errors: ['Object is required and must be a valid object'],
    };
  }

  for (const field of requiredFields) {
    const value = obj[field];
    if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
      errors.push(`${field} is required`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Validate API configuration
 * @param {Object} config - API configuration
 * @returns {Object} Validation result { valid: boolean, errors: string[] }
 */
export const validateApiConfig = (config) => {
  const errors = [];

  if (!config || typeof config !== 'object') {
    return {
      valid: false,
      errors: ['Configuration is required'],
    };
  }

  if (!config.baseUrl || typeof config.baseUrl !== 'string' || !config.baseUrl.trim()) {
    errors.push('API URL is required');
  } else {
    // Validate URL format
    try {
      new URL(config.baseUrl);
    } catch (e) {
      errors.push('API URL is not a valid URL');
    }
  }

  if (!config.apiKey || typeof config.apiKey !== 'string' || !config.apiKey.trim()) {
    errors.push('API Key is required');
  }

  if (config.timeoutMs !== undefined) {
    if (typeof config.timeoutMs !== 'number' || config.timeoutMs < 1000 || config.timeoutMs > 120000) {
      errors.push('Timeout must be between 1000ms and 120000ms');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Create error object with standardized format
 * @param {string} message - Error message
 * @param {string} code - Error code
 * @param {Object} details - Additional error details
 * @returns {Error} Error object
 */
export const createError = (message, code = 'UNKNOWN', details = null) => {
  const error = new Error(message);
  error.code = code;
  if (details) {
    error.details = details;
  }
  return error;
};

/**
 * Format error details for display
 * @param {Object} errorInfo - Error information from getUserFriendlyErrorMessage
 * @returns {string} Formatted error message
 */
export const formatErrorForDisplay = (errorInfo) => {
  if (!errorInfo) return 'An error occurred';

  let formatted = errorInfo.title;

  if (errorInfo.message) {
    formatted += `\n${errorInfo.message}`;
  }

  if (errorInfo.details && Array.isArray(errorInfo.details)) {
    formatted += `\n${errorInfo.details.join('\n')}`;
  } else if (errorInfo.details) {
    formatted += `\n${errorInfo.details}`;
  }

  return formatted;
};

/**
 * Handle batch operation errors
 * @param {Array<Object>} results - Array of operation results
 * @param {Object} options - Options
 * @returns {Object} Batch error summary
 */
export const handleBatchErrors = (results, options = {}) => {
  const {
    context = 'batch_operation',
    notify: shouldNotify = true,
  } = options;

  const failed = results.filter(r => !r.success);
  const succeeded = results.filter(r => r.success);

  if (failed.length === 0) {
    return {
      hasErrors: false,
      total: results.length,
      succeeded: succeeded.length,
      failed: 0,
      errors: [],
    };
  }

  const errors = failed.map(r => ({
    item: r.noorder || r.id || 'Unknown',
    error: r.errors?.[0] || r.error || 'Unknown error',
  }));

  if (shouldNotify) {
    const message = `${failed.length} of ${results.length} operations failed`;
    const details = errors.slice(0, 3).map(e => `• ${e.item}: ${e.error}`).join('\n');

    notify({
      type: 'error',
      message,
      detail: details + (errors.length > 3 ? `\n... and ${errors.length - 3} more` : ''),
      ttl: 0,
    });
  }

  logger.error(`[khanzaErrorHandler] ${context}:`, {
    total: results.length,
    succeeded: succeeded.length,
    failed: failed.length,
    errors,
  });

  return {
    hasErrors: true,
    total: results.length,
    succeeded: succeeded.length,
    failed: failed.length,
    errors,
  };
};

// ============================================
// Export Default
// ============================================

export default {
  // Categories and severity
  ERROR_CATEGORIES,
  ERROR_SEVERITY,

  // Error handling
  categorizeError,
  getUserFriendlyErrorMessage,
  handleError,
  handleBatchErrors,

  // Retry logic
  retryWithBackoff,

  // Validation
  validateRequiredFields,
  validateApiConfig,

  // Utilities
  createError,
  formatErrorForDisplay,
};
