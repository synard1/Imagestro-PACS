/**
 * Connection Tab Component
 * 
 * Displays and manages connection settings for external systems including:
 * - Base URL input with validation
 * - Auth type dropdown (None, API Key, Basic, Bearer, JWT)
 * - Dynamic credential fields based on auth type
 * - Timeout input (ms)
 * - Health check path input
 * - Test Connection button with loading state
 * - Connection result display (success with response time, or error with details)
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */

import { useState, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { useServiceMode } from '../../../hooks/useServiceMode';
import * as mockExternalSystemsService from '../../../services/mock/mockExternalSystemsService';
import { testConnection as testRealConnection } from '../../../services/connectionTestService';
import { logger } from '../../../utils/logger';

// Authentication types with labels
const AUTH_TYPES = [
  { value: 'none', label: 'None', description: 'No authentication required' },
  { value: 'api_key', label: 'API Key', description: 'Authenticate using an API key' },
  { value: 'basic', label: 'Basic Auth', description: 'Username and password authentication' },
  { value: 'bearer', label: 'Bearer Token', description: 'Bearer token authentication' },
  { value: 'jwt', label: 'JWT', description: 'JSON Web Token authentication' },
];

// Error type to user-friendly message mapping
const ERROR_MESSAGES = {
  timeout: {
    title: 'Connection Timeout',
    suggestion: 'Check if the SIMRS server is running and accessible. Try increasing the timeout value.',
  },
  auth_failed: {
    title: 'Authentication Failed',
    suggestion: 'Verify your API Key or credentials are correct.',
  },
  authentication_failed: {
    title: 'Authentication Failed',
    suggestion: 'Verify your API Key or credentials are correct.',
  },
  server_error: {
    title: 'Server Error',
    suggestion: 'Contact SIMRS administrator. The server may be experiencing issues.',
  },
  network_error: {
    title: 'Network Error',
    suggestion: 'Check network connectivity and verify the Base URL is correct.',
  },
  invalid_url: {
    title: 'Invalid URL',
    suggestion: 'Ensure the URL starts with http:// or https:// and is properly formatted.',
  },
};


/**
 * Validate connection settings
 * @param {Object} connection - Connection settings object
 * @returns {Object} Validation errors object
 */
const validateConnectionSettings = (connection) => {
  const errors = {};

  // Base URL validation
  if (!connection?.baseUrl?.trim()) {
    errors.baseUrl = 'Base URL is required';
  } else {
    try {
      new URL(connection.baseUrl);
    } catch {
      errors.baseUrl = 'Invalid URL format. Must start with http:// or https://';
    }
  }

  // Auth-specific validation
  const authType = connection?.authType;
  
  if (authType === 'api_key' && !connection?.apiKey?.trim()) {
    errors.apiKey = 'API Key is required for API Key authentication';
  }
  
  if (authType === 'basic') {
    if (!connection?.username?.trim()) {
      errors.username = 'Username is required for Basic authentication';
    }
    if (!connection?.password?.trim()) {
      errors.password = 'Password is required for Basic authentication';
    }
  }
  
  if ((authType === 'bearer' || authType === 'jwt') && !connection?.token?.trim()) {
    errors.token = 'Token is required for Bearer/JWT authentication';
  }

  // Timeout validation
  if (connection?.timeoutMs !== undefined && connection?.timeoutMs !== null) {
    const timeout = parseInt(connection.timeoutMs, 10);
    if (isNaN(timeout) || timeout < 1000) {
      errors.timeoutMs = 'Timeout must be at least 1000ms';
    } else if (timeout > 120000) {
      errors.timeoutMs = 'Timeout cannot exceed 120000ms (2 minutes)';
    }
  }

  return errors;
};

/**
 * Get fields required for a specific auth type
 * @param {string} authType - Authentication type
 * @returns {string[]} Array of required field names
 */
export const getRequiredFieldsForAuthType = (authType) => {
  switch (authType) {
    case 'api_key':
      return ['apiKey'];
    case 'basic':
      return ['username', 'password'];
    case 'bearer':
    case 'jwt':
      return ['token'];
    default:
      return [];
  }
};

/**
 * ConnectionTab Component
 * 
 * @param {Object} props - Component props
 * @param {string} props.systemId - External system ID (null for new systems)
 * @param {Object} props.connection - Connection settings object
 * @param {Function} props.onChange - Callback when connection settings change
 * @param {Object} props.validationErrors - External validation errors
 * @param {boolean} props.disabled - Whether the form is disabled
 */
export default function ConnectionTab({
  systemId = null,
  connection = {},
  onChange = () => {},
  validationErrors = {},
  disabled = false,
}) {
  // Service mode hook
  const { isMockMode } = useServiceMode();

  // Local state
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [localErrors, setLocalErrors] = useState({});

  // Merge external and local validation errors
  const errors = useMemo(() => ({
    ...localErrors,
    ...validationErrors,
  }), [localErrors, validationErrors]);

  // Get appropriate test connection function based on mode
  const testConnectionFn = useMemo(() => {
    if (isMockMode) {
      return mockExternalSystemsService.testConnection;
    }
    return testRealConnection;
  }, [isMockMode]);

  // Handle field change
  const handleChange = useCallback((field, value) => {
    const newConnection = {
      ...connection,
      [field]: value,
    };
    onChange(newConnection);
    
    // Clear local error for this field
    if (localErrors[field]) {
      setLocalErrors(prev => {
        const updated = { ...prev };
        delete updated[field];
        return updated;
      });
    }
    
    // Clear test result when settings change
    setTestResult(null);
  }, [connection, onChange, localErrors]);

  // Handle auth type change - clear auth-specific fields
  const handleAuthTypeChange = useCallback((authType) => {
    const newConnection = {
      ...connection,
      authType,
      // Clear all auth fields when type changes
      apiKey: '',
      username: '',
      password: '',
      token: '',
    };
    onChange(newConnection);
    
    // Clear auth-related errors
    setLocalErrors(prev => {
      const updated = { ...prev };
      delete updated.apiKey;
      delete updated.username;
      delete updated.password;
      delete updated.token;
      return updated;
    });
    
    setTestResult(null);
  }, [connection, onChange]);


  // Handle test connection
  const handleTestConnection = useCallback(async () => {
    // Validate before testing
    const validationResult = validateConnectionSettings(connection);
    if (Object.keys(validationResult).length > 0) {
      setLocalErrors(validationResult);
      return;
    }

    setTestingConnection(true);
    setTestResult(null);
    setLocalErrors({});

    try {
      logger.info('[ConnectionTab]', 'Testing connection', {
        systemId,
        baseUrl: connection.baseUrl,
        authType: connection.authType,
      });

      let result;
      
      if (isMockMode) {
        // For mock mode, use systemId directly
        result = await testConnectionFn(systemId || 'new');
      } else {
        // For real mode, pass connection settings
        result = await testConnectionFn(systemId || 'new', connection);
      }

      setTestResult(result);

      if (result.success) {
        logger.info('[ConnectionTab]', 'Connection test succeeded', {
          responseTime: result.responseTime,
        });
      } else {
        logger.warn('[ConnectionTab]', 'Connection test failed', {
          errorType: result.errorType || result.status,
          message: result.message || result.error,
        });
      }
    } catch (err) {
      logger.error('[ConnectionTab]', 'Connection test error', err);
      setTestResult({
        success: false,
        error: err.message || 'Connection test failed',
        errorType: 'unknown',
        suggestion: 'Check if the server is running and the URL is correct',
      });
    } finally {
      setTestingConnection(false);
    }
  }, [connection, systemId, testConnectionFn, isMockMode]);

  // Get error info for display
  const getErrorInfo = useCallback((result) => {
    const errorType = result.errorType || result.status;
    const errorInfo = ERROR_MESSAGES[errorType] || {
      title: 'Connection Error',
      suggestion: result.suggestion || 'Check your connection settings and try again.',
    };
    return errorInfo;
  }, []);

  // Determine which auth fields to show
  const authType = connection?.authType || 'none';
  const showApiKeyField = authType === 'api_key';
  const showBasicAuthFields = authType === 'basic';
  const showTokenField = authType === 'bearer' || authType === 'jwt';

  return (
    <div className="space-y-6">
      {/* Mock Mode Indicator */}
      {isMockMode && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            <span className="font-medium">Mock Mode:</span> Connection tests will simulate responses. 
            Switch to real mode to test actual connections.
          </p>
        </div>
      )}

      {/* Base URL */}
      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Connection Settings</h3>
        
        <FormField
          label="Base URL"
          required
          error={errors.baseUrl}
          hint="The base URL of the external system API (e.g., https://simrs.example.com/api)"
        >
          <input
            type="url"
            value={connection?.baseUrl || ''}
            onChange={(e) => handleChange('baseUrl', e.target.value)}
            placeholder="https://simrs.example.com/api"
            disabled={disabled}
            className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.baseUrl ? 'border-red-500' : 'border-gray-300'
            } ${disabled ? 'bg-gray-100' : ''}`}
          />
        </FormField>

        {/* Authentication Type */}
        <FormField
          label="Authentication Type"
          required
          hint="Select how to authenticate with the external system"
        >
          <select
            value={authType}
            onChange={(e) => handleAuthTypeChange(e.target.value)}
            disabled={disabled}
            className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              disabled ? 'bg-gray-100' : ''
            }`}
          >
            {AUTH_TYPES.map(auth => (
              <option key={auth.value} value={auth.value}>
                {auth.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            {AUTH_TYPES.find(a => a.value === authType)?.description}
          </p>
        </FormField>

        {/* API Key Field */}
        {showApiKeyField && (
          <FormField
            label="API Key"
            required
            error={errors.apiKey}
          >
            <input
              type="password"
              value={connection?.apiKey || ''}
              onChange={(e) => handleChange('apiKey', e.target.value)}
              placeholder="Enter API Key"
              disabled={disabled}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.apiKey ? 'border-red-500' : 'border-gray-300'
              } ${disabled ? 'bg-gray-100' : ''}`}
            />
          </FormField>
        )}

        {/* Basic Auth Fields */}
        {showBasicAuthFields && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              label="Username"
              required
              error={errors.username}
            >
              <input
                type="text"
                value={connection?.username || ''}
                onChange={(e) => handleChange('username', e.target.value)}
                placeholder="Enter username"
                disabled={disabled}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.username ? 'border-red-500' : 'border-gray-300'
                } ${disabled ? 'bg-gray-100' : ''}`}
              />
            </FormField>
            <FormField
              label="Password"
              required
              error={errors.password}
            >
              <input
                type="password"
                value={connection?.password || ''}
                onChange={(e) => handleChange('password', e.target.value)}
                placeholder="Enter password"
                disabled={disabled}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.password ? 'border-red-500' : 'border-gray-300'
                } ${disabled ? 'bg-gray-100' : ''}`}
              />
            </FormField>
          </div>
        )}

        {/* Token Field */}
        {showTokenField && (
          <FormField
            label={authType === 'jwt' ? 'JWT Token' : 'Bearer Token'}
            required
            error={errors.token}
          >
            <textarea
              value={connection?.token || ''}
              onChange={(e) => handleChange('token', e.target.value)}
              rows="3"
              placeholder={`Enter ${authType === 'jwt' ? 'JWT' : 'Bearer'} token`}
              disabled={disabled}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.token ? 'border-red-500' : 'border-gray-300'
              } ${disabled ? 'bg-gray-100' : ''}`}
            />
          </FormField>
        )}
      </div>


      {/* Advanced Settings */}
      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Advanced Settings</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            label="Timeout (ms)"
            error={errors.timeoutMs}
            hint="Connection timeout in milliseconds (1000-120000)"
          >
            <input
              type="number"
              value={connection?.timeoutMs || 30000}
              onChange={(e) => handleChange('timeoutMs', parseInt(e.target.value, 10) || 30000)}
              min="1000"
              max="120000"
              step="1000"
              disabled={disabled}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.timeoutMs ? 'border-red-500' : 'border-gray-300'
              } ${disabled ? 'bg-gray-100' : ''}`}
            />
          </FormField>

          <FormField
            label="Health Check Path"
            hint="API endpoint path for health checks (e.g., /health, /api/ping)"
          >
            <input
              type="text"
              value={connection?.healthPath || '/health'}
              onChange={(e) => handleChange('healthPath', e.target.value)}
              placeholder="/health"
              disabled={disabled}
              className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                disabled ? 'bg-gray-100' : ''
              }`}
            />
          </FormField>
        </div>
      </div>

      {/* Test Connection Section */}
      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Test Connection</h3>
        <p className="text-sm text-gray-600">
          Test the connection to verify your settings are correct before saving.
        </p>

        <div className="flex items-center gap-4">
          <button
            onClick={handleTestConnection}
            disabled={testingConnection || disabled || !connection?.baseUrl}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition flex items-center gap-2"
          >
            {testingConnection ? (
              <>
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                Testing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Test Connection
              </>
            )}
          </button>

          {!connection?.baseUrl && (
            <span className="text-sm text-gray-500">
              Enter a Base URL to test the connection
            </span>
          )}
        </div>

        {/* Test Result Display */}
        {testResult && (
          <div
            className={`p-4 rounded-lg border ${
              testResult.success
                ? 'bg-green-50 border-green-200'
                : 'bg-red-50 border-red-200'
            }`}
          >
            <div className="flex items-start gap-3">
              {testResult.success ? (
                <svg className="w-6 h-6 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="w-6 h-6 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}

              <div className="flex-1">
                <p className={`font-medium ${testResult.success ? 'text-green-800' : 'text-red-800'}`}>
                  {testResult.success ? 'Connection Successful' : getErrorInfo(testResult).title}
                </p>

                {testResult.success && testResult.responseTime && (
                  <p className="text-sm text-green-700 mt-1">
                    Response time: {Math.round(testResult.responseTime)}ms
                  </p>
                )}

                {testResult.success && testResult.message && (
                  <p className="text-sm text-green-700 mt-1">
                    {testResult.message}
                  </p>
                )}

                {!testResult.success && (
                  <>
                    {(testResult.error || testResult.message) && (
                      <p className="text-sm text-red-700 mt-1">
                        {testResult.error || testResult.message}
                      </p>
                    )}
                    
                    {testResult.details && testResult.details !== testResult.error && (
                      <p className="text-sm text-red-600 mt-1">
                        Details: {testResult.details}
                      </p>
                    )}

                    <div className="mt-3 p-3 bg-red-100 rounded">
                      <p className="text-sm text-red-800 font-medium">💡 Suggestion:</p>
                      <p className="text-sm text-red-700 mt-1">
                        {testResult.suggestion || getErrorInfo(testResult).suggestion}
                      </p>
                      
                      {testResult.suggestions && testResult.suggestions.length > 0 && (
                        <ul className="mt-2 text-sm text-red-700 list-disc list-inside">
                          {testResult.suggestions.map((suggestion, index) => (
                            <li key={index}>{suggestion}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </>
                )}

                {testResult.timestamp && (
                  <p className="text-xs text-gray-500 mt-2">
                    Tested at: {new Date(testResult.timestamp).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


// PropTypes
ConnectionTab.propTypes = {
  systemId: PropTypes.string,
  connection: PropTypes.shape({
    baseUrl: PropTypes.string,
    authType: PropTypes.oneOf(['none', 'api_key', 'basic', 'bearer', 'jwt']),
    apiKey: PropTypes.string,
    username: PropTypes.string,
    password: PropTypes.string,
    token: PropTypes.string,
    timeoutMs: PropTypes.number,
    healthPath: PropTypes.string,
  }),
  onChange: PropTypes.func,
  validationErrors: PropTypes.object,
  disabled: PropTypes.bool,
};

// Default props
ConnectionTab.defaultProps = {
  systemId: null,
  connection: {
    baseUrl: '',
    authType: 'none',
    apiKey: '',
    username: '',
    password: '',
    token: '',
    timeoutMs: 30000,
    healthPath: '/health',
  },
  onChange: () => {},
  validationErrors: {},
  disabled: false,
};

/**
 * FormField Helper Component
 */
function FormField({ label, required, error, hint, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {hint && !error && (
        <p className="mt-1 text-xs text-gray-500">{hint}</p>
      )}
      {error && (
        <p className="mt-1 text-xs text-red-500">{error}</p>
      )}
    </div>
  );
}

FormField.propTypes = {
  label: PropTypes.string.isRequired,
  required: PropTypes.bool,
  error: PropTypes.string,
  hint: PropTypes.string,
  children: PropTypes.node.isRequired,
};

FormField.defaultProps = {
  required: false,
  error: null,
  hint: null,
};

// Export validation function for external use
export { validateConnectionSettings };
