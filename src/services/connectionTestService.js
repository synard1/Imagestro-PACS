/**
 * Connection Test Service
 * 
 * Handles testing connections to external systems with:
 * - Connection validation
 * - Error categorization
 * - Response time measurement
 * - User-friendly error messages
 * 
 * Requirements: 3.3, 3.4, 3.5, 12.2
 */

import { apiClient } from './http';
import { logger } from '../utils/logger';

const MODULE_NAME = 'externalSystems'; // Uses externalSystems module which points to backend-api

/**
 * Get API client for connection test operations
 * @returns {Object} API client instance
 */
const getClient = () => {
  return apiClient(MODULE_NAME);
};

/**
 * Error type categories
 */
export const ERROR_TYPES = {
  TIMEOUT: 'timeout',
  AUTH_FAILED: 'auth_failed',
  SERVER_ERROR: 'server_error',
  NETWORK_ERROR: 'network_error',
  INVALID_URL: 'invalid_url',
  UNKNOWN: 'unknown',
};

/**
 * Categorize error based on error details
 * @param {Error} error - Error object
 * @returns {string} Error type
 */
function categorizeError(error) {
  if (!error) return ERROR_TYPES.UNKNOWN;

  const message = error.message?.toLowerCase() || '';
  const status = error.status || error.statusCode;

  // Timeout errors
  if (message.includes('timeout') || message.includes('timed out')) {
    return ERROR_TYPES.TIMEOUT;
  }

  // Authentication errors
  if (status === 401 || status === 403 || message.includes('unauthorized') || message.includes('forbidden')) {
    return ERROR_TYPES.AUTH_FAILED;
  }

  // Server errors
  if (status >= 500 || message.includes('server error')) {
    return ERROR_TYPES.SERVER_ERROR;
  }

  // Network errors
  if (message.includes('network') || message.includes('econnrefused') || message.includes('enotfound')) {
    return ERROR_TYPES.NETWORK_ERROR;
  }

  // Invalid URL
  if (message.includes('invalid url') || message.includes('malformed')) {
    return ERROR_TYPES.INVALID_URL;
  }

  return ERROR_TYPES.UNKNOWN;
}

/**
 * Get user-friendly error message based on error type
 * @param {string} errorType - Error type
 * @param {string} [baseUrl] - Base URL being tested
 * @returns {Object} Error message and suggestions
 */
function getErrorMessage(errorType, baseUrl) {
  const messages = {
    [ERROR_TYPES.TIMEOUT]: {
      message: 'Connection timed out. The external system is not responding within the timeout period.',
      suggestions: [
        'Check if the Base URL is correct',
        'Verify network connectivity to the external system',
        'Try increasing the timeout value',
        'Check if the external system is running and accessible',
      ],
    },
    [ERROR_TYPES.AUTH_FAILED]: {
      message: 'Authentication failed. The provided credentials are invalid or insufficient.',
      suggestions: [
        'Verify the authentication type is correct',
        'Check if the username and password are correct',
        'Verify the bearer token or JWT is valid and not expired',
        'Check if the user has sufficient permissions',
      ],
    },
    [ERROR_TYPES.SERVER_ERROR]: {
      message: 'The external system is experiencing server errors.',
      suggestions: [
        'Check the external system status',
        'Contact the external system administrator',
        'Try again later',
        'Check the external system logs for more details',
      ],
    },
    [ERROR_TYPES.NETWORK_ERROR]: {
      message: 'Network error. Unable to reach the external system.',
      suggestions: [
        'Check if the Base URL is correct',
        'Verify network connectivity',
        'Check firewall and proxy settings',
        'Verify DNS resolution for the hostname',
      ],
    },
    [ERROR_TYPES.INVALID_URL]: {
      message: 'Invalid Base URL format.',
      suggestions: [
        'Ensure the URL starts with http:// or https://',
        'Check for typos in the URL',
        'Verify the URL format is correct',
      ],
    },
    [ERROR_TYPES.UNKNOWN]: {
      message: 'An unexpected error occurred while testing the connection.',
      suggestions: [
        'Check the connection settings',
        'Review the error details',
        'Contact support if the issue persists',
      ],
    },
  };

  return messages[errorType] || messages[ERROR_TYPES.UNKNOWN];
}

/**
 * Test connection to an external system
 * @param {string} systemId - System ID
 * @param {Object} connectionSettings - Connection settings
 * @param {string} connectionSettings.baseUrl - Base URL
 * @param {string} connectionSettings.authType - Auth type (none, basic, bearer, jwt)
 * @param {string} [connectionSettings.username] - Username for basic auth
 * @param {string} [connectionSettings.password] - Password for basic auth
 * @param {string} [connectionSettings.token] - Token for bearer/JWT auth
 * @param {number} [connectionSettings.timeoutMs] - Timeout in milliseconds
 * @returns {Promise<Object>} Test result with success status and details
 */
export async function testConnection(systemId, connectionSettings) {
  if (!systemId) {
    throw new Error('System ID is required');
  }

  logger.info('[connectionTestService]', 'Testing connection', {
    systemId,
    baseUrl: connectionSettings?.baseUrl,
  });

  const startTime = Date.now();

  try {
    const client = getClient();
    // Use the new backend endpoint that handles decryption
    const response = await client.post(
      `/external-systems/${encodeURIComponent(systemId)}/test-connection`,
      connectionSettings || {}
    );

    const responseTime = Date.now() - startTime;

    logger.info('[connectionTestService]', 'Connection test result', {
      systemId,
      status: response.status,
      success: response.success || response.status === 'success',
      responseTime,
    });

    // Backend returns { status: "success", message: "...", details: "..." }
    const isSuccess = response.success === true || response.status === 'success';

    if (isSuccess) {
      return {
        success: true,
        responseTime: response.response_time_ms || responseTime,
        message: response.message || `Connection successful (${responseTime}ms)`,
        details: response.details,
        ...response
      };
    } else {
      return {
        success: false,
        responseTime,
        error: response.error || response.message || 'Connection failed',
        suggestions: response.suggestion ? [response.suggestion] : [],
        details: response.details,
      };
    }
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const errorType = categorizeError(error);
    const errorInfo = getErrorMessage(errorType, connectionSettings?.baseUrl);

    logger.error('[connectionTestService]', 'Connection test failed', {
      systemId,
      errorType,
      responseTime,
      error: error.message,
    });

    return {
      success: false,
      responseTime,
      error: errorInfo.message,
      errorType,
      suggestions: errorInfo.suggestions,
      details: error.message,
    };
  }
}

/**
 * Test connection directly to the external system URL (bypasses backend)
 * 
 * This function is useful when:
 * - Backend pacs-service is not running
 * - Testing Khanza API connectivity directly
 * - Development/debugging scenarios
 * 
 * @param {Object} connectionSettings - Connection settings
 * @param {string} connectionSettings.baseUrl - Base URL to test
 * @param {string} connectionSettings.authType - Auth type (none, api_key, basic, bearer, jwt)
 * @param {string} [connectionSettings.apiKey] - API key
 * @param {string} [connectionSettings.username] - Username for basic auth
 * @param {string} [connectionSettings.password] - Password for basic auth
 * @param {string} [connectionSettings.token] - Token for bearer/JWT auth
 * @param {number} [connectionSettings.timeoutMs] - Timeout in milliseconds
 * @param {string} [connectionSettings.healthPath] - Health check path (default: /)
 * @returns {Promise<Object>} Test result with success status and details
 */
export async function testConnectionDirect(connectionSettings) {
  if (!connectionSettings) {
    throw new Error('Connection settings are required');
  }

  if (!connectionSettings.baseUrl) {
    throw new Error('Base URL is required');
  }

  logger.info('[connectionTestService]', 'Testing connection directly', {
    baseUrl: connectionSettings.baseUrl,
  });

  const startTime = Date.now();
  const timeout = connectionSettings.timeoutMs || 30000;
  const healthPath = connectionSettings.healthPath || '/';

  try {
    // Build the test URL
    let testUrl = connectionSettings.baseUrl;
    if (!testUrl.endsWith('/') && !healthPath.startsWith('/')) {
      testUrl += '/';
    }
    if (healthPath && healthPath !== '/') {
      testUrl = testUrl.replace(/\/$/, '') + healthPath;
    }

    // Build headers based on auth type
    const headers = {
      'Accept': 'application/json',
    };

    if (connectionSettings.authType === 'api_key' && connectionSettings.apiKey) {
      headers['X-API-Key'] = connectionSettings.apiKey;
    } else if (connectionSettings.authType === 'bearer' && connectionSettings.token) {
      headers['Authorization'] = `Bearer ${connectionSettings.token}`;
    } else if (connectionSettings.authType === 'jwt' && connectionSettings.token) {
      headers['Authorization'] = `Bearer ${connectionSettings.token}`;
    } else if (connectionSettings.authType === 'basic' && connectionSettings.username && connectionSettings.password) {
      const credentials = btoa(`${connectionSettings.username}:${connectionSettings.password}`);
      headers['Authorization'] = `Basic ${credentials}`;
    }

    // Make the request with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(testUrl, {
      method: 'GET',
      headers,
      signal: controller.signal,
      mode: 'cors',
    });

    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;

    if (response.ok) {
      logger.info('[connectionTestService]', 'Direct connection test succeeded', {
        url: testUrl,
        status: response.status,
        responseTime,
      });

      return {
        success: true,
        responseTime,
        message: `Connection successful (${responseTime}ms)`,
        status: response.status,
        statusText: response.statusText,
      };
    } else {
      const errorType = response.status === 401 || response.status === 403 
        ? ERROR_TYPES.AUTH_FAILED 
        : response.status >= 500 
          ? ERROR_TYPES.SERVER_ERROR 
          : ERROR_TYPES.UNKNOWN;
      
      const errorInfo = getErrorMessage(errorType, connectionSettings.baseUrl);

      logger.warn('[connectionTestService]', 'Direct connection test failed with status', {
        url: testUrl,
        status: response.status,
        responseTime,
      });

      return {
        success: false,
        responseTime,
        error: `HTTP ${response.status}: ${response.statusText}`,
        errorType,
        suggestions: errorInfo.suggestions,
        status: response.status,
      };
    }
  } catch (error) {
    const responseTime = Date.now() - startTime;
    let errorType = ERROR_TYPES.UNKNOWN;
    
    if (error.name === 'AbortError') {
      errorType = ERROR_TYPES.TIMEOUT;
    } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      errorType = ERROR_TYPES.NETWORK_ERROR;
    }

    const errorInfo = getErrorMessage(errorType, connectionSettings.baseUrl);

    logger.error('[connectionTestService]', 'Direct connection test error', {
      baseUrl: connectionSettings.baseUrl,
      errorType,
      responseTime,
      error: error.message,
    });

    return {
      success: false,
      responseTime,
      error: errorInfo.message,
      errorType,
      suggestions: errorInfo.suggestions,
      details: error.message,
    };
  }
}

/**
 * Test connection with retry logic
 * @param {string} systemId - System ID
 * @param {Object} connectionSettings - Connection settings
 * @param {number} [maxRetries=1] - Maximum number of retries
 * @returns {Promise<Object>} Test result
 */
export async function testConnectionWithRetry(systemId, connectionSettings, maxRetries = 1) {
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await testConnection(systemId, connectionSettings);
      if (result.success) {
        return result;
      }
      lastError = result;
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        logger.debug('[connectionTestService]', `Retry attempt ${attempt + 1}/${maxRetries}`);
        // Wait before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }

  return lastError;
}

/**
 * Validate connection settings format
 * @param {Object} connectionSettings - Connection settings to validate
 * @returns {Array<string>} Array of validation errors (empty if valid)
 */
export function validateConnectionSettings(connectionSettings) {
  const errors = [];

  if (!connectionSettings) {
    errors.push('Connection settings are required');
    return errors;
  }

  if (!connectionSettings.baseUrl) {
    errors.push('Base URL is required');
  } else if (typeof connectionSettings.baseUrl !== 'string') {
    errors.push('Base URL must be a string');
  } else if (!connectionSettings.baseUrl.match(/^https?:\/\//)) {
    errors.push('Base URL must start with http:// or https://');
  }

  if (!connectionSettings.authType) {
    errors.push('Authentication type is required');
  } else if (!['none', 'basic', 'bearer', 'jwt'].includes(connectionSettings.authType)) {
    errors.push('Invalid authentication type');
  }

  if (connectionSettings.authType === 'basic') {
    if (!connectionSettings.username) {
      errors.push('Username is required for basic authentication');
    }
    if (!connectionSettings.password) {
      errors.push('Password is required for basic authentication');
    }
  }

  if (['bearer', 'jwt'].includes(connectionSettings.authType)) {
    if (!connectionSettings.token) {
      errors.push('Token is required for bearer/JWT authentication');
    }
  }

  if (connectionSettings.timeoutMs !== undefined) {
    if (typeof connectionSettings.timeoutMs !== 'number' || connectionSettings.timeoutMs < 100) {
      errors.push('Timeout must be a number >= 100ms');
    }
  }

  return errors;
}

export default {
  testConnection,
  testConnectionWithRetry,
  validateConnectionSettings,
  ERROR_TYPES,
  categorizeError,
  getErrorMessage,
};
