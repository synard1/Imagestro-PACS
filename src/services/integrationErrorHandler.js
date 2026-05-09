/**
 * Integration Error Handler Service
 * 
 * Provides comprehensive error handling for unified SIMRS integration:
 * - Error categorization (timeout, auth_failed, server_error, network_error)
 * - User-friendly error messages
 * - Error logging with error ID
 * - Retry logic with exponential backoff
 * 
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5
 */

import { logger } from '../utils/logger';
import { notify } from './notifications';

// Error categories
export const ERROR_CATEGORIES = {
  NETWORK: 'network_error',
  TIMEOUT: 'timeout',
  AUTH: 'auth_failed',
  VALIDATION: 'validation_error',
  NOT_FOUND: 'not_found',
  CONFLICT: 'duplicate',
  SERVER: 'server_error',
  UNKNOWN: 'unknown',
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
 * Generate unique error ID for tracking
 * @returns {string} Error ID
 */
const generateErrorId = () => {
  return `ERR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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
 * @param {string} context - Context where error occurred
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
      errorId: generateErrorId(),
    };
  }

  const category = categorizeError(error);
  const originalMessage = error.message || '';
  const errorId = generateErrorId();

  let title = 'Error';
  let message = originalMessage;
  let details = null;
  let severity = ERROR_SEVERITY.ERROR;
  let actionable = false;

  switch (category) {
    case ERROR_CATEGORIES.NETWORK:
      title = 'Connection Failed';
      message = 'Cannot connect to external system. Please check:';
      details = [
        '• API URL is correct in Settings',
        '• External system service is running',
        '• Network connectivity is available',
        '• Firewall is not blocking the connection',
      ];
      severity = ERROR_SEVERITY.ERROR;
      actionable = true;
      break;

    case ERROR_CATEGORIES.TIMEOUT:
      title = 'Request Timeout';
      message = 'External system is taking too long to respond. This may indicate:';
      details = [
        '• External system is slow or overloaded',
        '• Network connection is slow',
        '• Request timeout setting is too short',
      ];
      severity = ERROR_SEVERITY.WARNING;
      actionable = true;
      break;

    case ERROR_CATEGORIES.AUTH:
      title = 'Authentication Failed';
      message = 'Cannot authenticate with external system. Please check:';
      details = [
        '• API Key or credentials are correct in Settings',
        '• Credentials have not expired',
        '• Credentials have required permissions',
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
      message = 'External system server encountered an error. Please:';
      details = [
        '• Try again in a few moments',
        '• Check external system service status',
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
    errorId,
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
    context = 'integration_operation',
    notify: shouldNotify = true,
    log: shouldLog = true,
    onError = null,
  } = options;

  // Get user-friendly error message
  const errorInfo = getUserFriendlyErrorMessage(error, context);

  // Log error
  if (shouldLog) {
    logger.error(`[integrationErrorHandler] ${context}:`, {
      errorId: errorInfo.errorId,
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
      logger.error('[integrationErrorHandler] Error callback failed:', callbackError.message);
    }
  }

  return errorInfo;
};

/**
 * Retry a failed operation with exponential backoff
 * @param {Function} operation - Async function to retry
 * @param {Object} options - Retry options
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
      logger.debug('[integrationErrorHandler]', `Attempt ${attempt}/${maxAttempts}`);
      return await operation();
    } catch (error) {
      lastError = error;
      const isRetryable = isRetryableError(error, retryableStatuses);

      if (attempt === maxAttempts || !isRetryable) {
        logger.error('[integrationErrorHandler]', `Operation failed after ${attempt} attempt(s):`, error.message);
        throw error;
      }

      const nextDelay = Math.min(delayMs, maxDelayMs);
      logger.warn('[integrationErrorHandler]', `Retrying after ${nextDelay}ms (attempt ${attempt}/${maxAttempts})`);

      if (onRetry && typeof onRetry === 'function') {
        try {
          onRetry({
            attempt,
            maxAttempts,
            delayMs: nextDelay,
            error: error.message,
          });
        } catch (callbackError) {
          logger.error('[integrationErrorHandler]', 'Retry callback failed:', callbackError.message);
        }
      }

      await delay(nextDelay);
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

  if (code === 'TIMEOUT' || code === 'NETWORK_ERROR') {
    return true;
  }

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
 * @param {Object} errorInfo - Error information
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

  if (errorInfo.errorId) {
    formatted += `\n\nError ID: ${errorInfo.errorId}`;
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

  logger.error(`[integrationErrorHandler] ${context}:`, {
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

  // Utilities
  createError,
  formatErrorForDisplay,
  generateErrorId,
};
