/**
 * Connection Service
 * 
 * Handles connection testing and health checks for external systems.
 * Uses provider adapters to test connections with different SIMRS providers.
 * 
 * Requirements: 3.3, 3.4, 3.5
 */

import { logger } from '../utils/logger';
import { getAdapter } from './adapters/ProviderAdapterFactory';
import { handleError, createError, ERROR_CATEGORIES } from './integrationErrorHandler';

/**
 * Test connection to external system
 * @param {Object} externalSystem - External system configuration
 * @param {string} externalSystem.provider - Provider type (khanza, gos, generic)
 * @param {Object} externalSystem.connection - Connection settings
 * @param {string} externalSystem.connection.baseUrl - API base URL
 * @param {string} externalSystem.connection.authType - Auth type (none, api_key, basic, bearer, jwt)
 * @param {number} externalSystem.connection.timeoutMs - Request timeout in milliseconds
 * @returns {Promise<Object>} Connection test result
 */
export const testConnection = async (externalSystem) => {
  if (!externalSystem) {
    throw createError('External system configuration is required', 'VALIDATION_ERROR');
  }

  const startTime = Date.now();
  const result = {
    success: false,
    responseTime: 0,
    status: null,
    statusCode: null,
    message: '',
    category: null,
    suggestions: [],
  };

  logger.info('[connectionService]', `Testing connection to ${externalSystem.code}...`);

  try {
    // Validate connection settings
    validateConnectionSettings(externalSystem.connection);

    // Get appropriate adapter
    const adapter = getAdapter(externalSystem);

    // Test connection using adapter
    const healthResult = await adapter.checkHealth();

    result.responseTime = Date.now() - startTime;
    result.success = true;
    result.status = 'connected';
    result.statusCode = healthResult.statusCode || 200;
    result.message = `Successfully connected to ${externalSystem.code}. Response time: ${result.responseTime}ms`;

    logger.info('[connectionService]', `Connection test successful for ${externalSystem.code}:`, {
      responseTime: result.responseTime,
      statusCode: result.statusCode,
    });

    return result;

  } catch (error) {
    result.responseTime = Date.now() - startTime;
    result.statusCode = error.status || error.statusCode || null;

    // Categorize error
    const category = categorizeConnectionError(error);
    result.category = category;

    // Generate error message and suggestions
    const errorInfo = generateConnectionErrorInfo(error, category, externalSystem);
    result.message = errorInfo.message;
    result.suggestions = errorInfo.suggestions;
    result.status = 'failed';

    logger.error('[connectionService]', `Connection test failed for ${externalSystem.code}:`, {
      category: result.category,
      message: result.message,
      responseTime: result.responseTime,
      statusCode: result.statusCode,
    });

    return result;
  }
};

/**
 * Validate connection settings
 * @param {Object} connection - Connection settings
 * @throws {Error} If validation fails
 */
const validateConnectionSettings = (connection) => {
  if (!connection || typeof connection !== 'object') {
    throw createError('Connection settings are required', 'VALIDATION_ERROR');
  }

  if (!connection.baseUrl || typeof connection.baseUrl !== 'string' || !connection.baseUrl.trim()) {
    throw createError('API URL is required', 'VALIDATION_ERROR');
  }

  // Validate URL format
  try {
    new URL(connection.baseUrl);
  } catch (e) {
    throw createError('API URL is not a valid URL', 'VALIDATION_ERROR');
  }

  if (connection.timeoutMs !== undefined) {
    if (typeof connection.timeoutMs !== 'number' || connection.timeoutMs < 1000 || connection.timeoutMs > 120000) {
      throw createError('Timeout must be between 1000ms and 120000ms', 'VALIDATION_ERROR');
    }
  }
};

/**
 * Categorize connection error
 * @param {Error|Object} error - Error object
 * @returns {string} Error category
 */
const categorizeConnectionError = (error) => {
  if (!error) return ERROR_CATEGORIES.UNKNOWN;

  const code = error.code || error.status;
  const message = (error.message || '').toLowerCase();

  // Timeout errors
  if (code === 'TIMEOUT' || code === 408 || message.includes('timeout')) {
    return ERROR_CATEGORIES.TIMEOUT;
  }

  // Authentication errors
  if (code === 'AUTH_FAILED' || code === 401 || code === 403 || message.includes('authentication') || message.includes('unauthorized')) {
    return ERROR_CATEGORIES.AUTH;
  }

  // Network errors
  if (code === 'NETWORK_ERROR' || code === 'ECONNREFUSED' || code === 'ENOTFOUND' || message.includes('failed to fetch') || message.includes('network')) {
    return ERROR_CATEGORIES.NETWORK;
  }

  // Server errors
  if (code >= 500 && code < 600) {
    return ERROR_CATEGORIES.SERVER;
  }

  // Not found
  if (code === 404) {
    return ERROR_CATEGORIES.NOT_FOUND;
  }

  return ERROR_CATEGORIES.UNKNOWN;
};

/**
 * Generate connection error information with suggestions
 * @param {Error|Object} error - Error object
 * @param {string} category - Error category
 * @param {Object} externalSystem - External system configuration
 * @returns {Object} Error info with message and suggestions
 */
const generateConnectionErrorInfo = (error, category, externalSystem) => {
  const info = {
    message: '',
    suggestions: [],
  };

  const originalMessage = error.message || '';

  switch (category) {
    case ERROR_CATEGORIES.TIMEOUT:
      info.message = `Connection timeout after ${externalSystem.connection?.timeoutMs || 30000}ms`;
      info.suggestions = [
        'Check if the external system server is running',
        'Verify network connectivity to the server',
        'Try increasing the timeout setting if the server is slow',
        'Check if there are any firewall rules blocking the connection',
      ];
      break;

    case ERROR_CATEGORIES.AUTH:
      info.message = 'Authentication failed';
      info.suggestions = [
        'Verify your API Key or credentials are correct',
        'Check if your credentials have expired',
        'Ensure your credentials have the required permissions',
        'Verify the authentication type matches the server requirements',
      ];
      break;

    case ERROR_CATEGORIES.NETWORK:
      info.message = `Cannot connect to ${externalSystem.connection?.baseUrl}`;
      info.suggestions = [
        'Verify the API URL is correct',
        'Check if the external system server is running',
        'Verify network connectivity is available',
        'Check if firewall is blocking the connection',
        'Try pinging the server to verify connectivity',
      ];
      break;

    case ERROR_CATEGORIES.SERVER:
      info.message = 'External system server error';
      info.suggestions = [
        'The external system server is experiencing issues',
        'Try again in a few moments',
        'Check the external system service status',
        'Contact the external system administrator if the problem persists',
      ];
      break;

    case ERROR_CATEGORIES.NOT_FOUND:
      info.message = 'API endpoint not found';
      info.suggestions = [
        'Verify the API URL is correct',
        'Check if the API version is compatible',
        'Verify the health check path is correct',
      ];
      break;

    default:
      info.message = originalMessage || 'Connection test failed';
      info.suggestions = [
        'Check the external system configuration',
        'Verify network connectivity',
        'Try again in a few moments',
      ];
  }

  return info;
};

/**
 * Get connection status for external system
 * @param {Object} externalSystem - External system configuration
 * @returns {Promise<Object>} Connection status
 */
export const getConnectionStatus = async (externalSystem) => {
  if (!externalSystem) {
    return {
      status: 'unknown',
      message: 'External system not configured',
      lastChecked: null,
    };
  }

  try {
    const result = await testConnection(externalSystem);
    return {
      status: result.success ? 'connected' : 'disconnected',
      message: result.message,
      responseTime: result.responseTime,
      lastChecked: new Date().toISOString(),
    };
  } catch (error) {
    logger.error('[connectionService]', 'Failed to get connection status:', error.message);
    return {
      status: 'error',
      message: error.message,
      lastChecked: new Date().toISOString(),
    };
  }
};

// ============================================
// Export Default
// ============================================

export default {
  testConnection,
  getConnectionStatus,
};
