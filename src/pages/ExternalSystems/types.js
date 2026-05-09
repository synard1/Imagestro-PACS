/**
 * TypeScript-like Interface Definitions for External Systems
 * 
 * These interfaces define the data structures for external systems,
 * connections, and mappings used throughout the consolidation feature.
 * 
 * Requirements: 1.1, 2.1, 3.1
 */

/**
 * @typedef {Object} ExternalSystem
 * @property {string} id - Unique identifier (UUID)
 * @property {string} code - System code (unique, e.g., 'KHANZA_01')
 * @property {string} name - System name (e.g., 'Khanza SIMRS')
 * @property {'SIMRS'|'HIS'|'RIS'|'PACS'|'LIS'|'EMR'} type - System type
 * @property {string} [provider] - Provider name (e.g., 'khanza', 'gos', 'generic')
 * @property {string} [vendor] - Vendor name
 * @property {string} [version] - System version
 * @property {boolean} is_active - Whether system is active
 * @property {ConnectionSettings} connection - Connection configuration
 * @property {Date} created_at - Creation timestamp
 * @property {Date} updated_at - Last update timestamp
 * @property {string} [created_by] - User ID who created the system
 * @property {string} [updated_by] - User ID who last updated the system
 */

/**
 * @typedef {Object} ConnectionSettings
 * @property {string} baseUrl - Base URL for the external system
 * @property {'none'|'basic'|'bearer'|'jwt'} authType - Authentication type
 * @property {string} [username] - Username for basic auth
 * @property {string} [password] - Password for basic auth (encrypted in storage)
 * @property {string} [token] - Bearer token (encrypted in storage)
 * @property {number} [timeoutMs] - Connection timeout in milliseconds (default: 5000)
 */

/**
 * @typedef {Object} TestConnectionResult
 * @property {boolean} success - Whether connection test succeeded
 * @property {number} [responseTime] - Response time in milliseconds
 * @property {string} [error] - Error message if failed
 * @property {'timeout'|'auth_failed'|'server_error'|'network_error'} [errorType] - Type of error
 */

/**
 * @typedef {Object} ListFilters
 * @property {string} [type] - Filter by system type
 * @property {'active'|'inactive'} [status] - Filter by status
 * @property {string} [search] - Search term (searches code and name)
 * @property {number} [page] - Page number (1-based)
 * @property {number} [pageSize] - Items per page
 */

/**
 * @typedef {Object} PaginatedResponse
 * @property {Array} items - Array of items
 * @property {number} total - Total number of items
 * @property {number} page - Current page
 * @property {number} pageSize - Items per page
 * @property {number} totalPages - Total number of pages
 */

/**
 * @typedef {Object} ProcedureMapping
 * @property {string} id - Unique identifier (UUID)
 * @property {string} external_system_id - Reference to external system
 * @property {string} khanza_code - Khanza procedure code (kd_jenis_prw)
 * @property {string} khanza_name - Khanza procedure name
 * @property {string} pacs_code - PACS procedure code
 * @property {string} pacs_name - PACS procedure name
 * @property {string} [modality] - Modality (CT, MR, CR, etc.)
 * @property {string} [description] - Optional description
 * @property {boolean} is_active - Whether mapping is active
 * @property {Date} created_at - Creation timestamp
 * @property {Date} updated_at - Last update timestamp
 */

/**
 * @typedef {Object} DoctorMapping
 * @property {string} id - Unique identifier (UUID)
 * @property {string} external_system_id - Reference to external system
 * @property {string} khanza_code - Khanza doctor code (kd_dokter)
 * @property {string} khanza_name - Khanza doctor name
 * @property {string} pacs_doctor_id - PACS doctor ID
 * @property {boolean} auto_created - Whether auto-created during import
 * @property {Date} created_at - Creation timestamp
 * @property {Date} updated_at - Last update timestamp
 */

/**
 * @typedef {Object} OperatorMapping
 * @property {string} id - Unique identifier (UUID)
 * @property {string} external_system_id - Reference to external system
 * @property {string} pacs_user_id - PACS user ID
 * @property {string} pacs_username - PACS username
 * @property {string} khanza_operator_code - Khanza operator code
 * @property {string} khanza_operator_name - Khanza operator name
 * @property {boolean} is_active - Whether mapping is active
 * @property {Date} created_at - Creation timestamp
 * @property {Date} updated_at - Last update timestamp
 */

/**
 * @typedef {Object} KhanzaOrder
 * @property {string} id - Unique identifier
 * @property {string} order_id - Order ID from Khanza
 * @property {string} patient_id - Patient ID
 * @property {string} patient_name - Patient name
 * @property {string} procedure_code - Procedure code
 * @property {string} procedure_name - Procedure name
 * @property {string} requesting_doctor - Requesting doctor name
 * @property {'pending'|'completed'|'cancelled'} status - Order status
 * @property {Date} created_at - Order creation date
 */

/**
 * @typedef {Object} OrderBrowserFilters
 * @property {string} [patientSearch] - Search by patient name or ID
 * @property {string} [procedureType] - Filter by procedure type
 * @property {Date} [dateFrom] - Filter from date
 * @property {Date} [dateTo] - Filter to date
 * @property {number} [page] - Page number
 * @property {number} [pageSize] - Items per page
 */

/**
 * @typedef {Object} ImportHistory
 * @property {string} id - Unique identifier
 * @property {string} external_system_id - Reference to external system
 * @property {string} order_id - Order ID from Khanza
 * @property {string} patient_id - Patient ID
 * @property {string} patient_name - Patient name
 * @property {string} [procedure_code] - Procedure code
 * @property {string} [procedure_name] - Procedure name
 * @property {'success'|'failed'|'pending'} import_status - Import status
 * @property {string} [error_message] - Error message if failed
 * @property {Date} imported_at - Import timestamp
 * @property {string} [created_by] - User ID who initiated import
 */

/**
 * @typedef {Object} ImportHistoryFilters
 * @property {Date} [dateFrom] - Filter from date
 * @property {Date} [dateTo] - Filter to date
 * @property {'success'|'failed'|'pending'} [status] - Filter by status
 * @property {number} [page] - Page number
 * @property {number} [pageSize] - Items per page
 */

/**
 * @typedef {Object} ErrorResponse
 * @property {boolean} success - Always false for errors
 * @property {string} message - Error message
 * @property {string} [code] - Error code
 * @property {Array<string>} [details] - Additional error details
 * @property {string} [errorId] - Error ID for support reference
 */

// Export type definitions as constants for runtime validation
export const SYSTEM_TYPES = ['SIMRS', 'HIS', 'RIS', 'PACS', 'LIS', 'EMR'];
export const AUTH_TYPES = ['none', 'basic', 'bearer', 'jwt', 'bpjs'];
export const ORDER_STATUSES = ['pending', 'completed', 'cancelled'];
export const IMPORT_STATUSES = ['success', 'failed', 'pending'];
export const MODALITIES = ['CR', 'CT', 'MR', 'US', 'XA', 'NM', 'PT', 'MG', 'DX', 'RF', 'OT'];

/**
 * Validate external system data
 * @param {Object} system - System data to validate
 * @returns {Array<string>} Array of validation errors (empty if valid)
 */
export function validateExternalSystem(system) {
  const errors = [];

  if (!system.code || typeof system.code !== 'string' || !system.code.trim()) {
    errors.push('System code is required');
  }

  if (!system.name || typeof system.name !== 'string' || !system.name.trim()) {
    errors.push('System name is required');
  }

  if (!system.type || !SYSTEM_TYPES.includes(system.type)) {
    errors.push(`System type must be one of: ${SYSTEM_TYPES.join(', ')}`);
  }

  if (system.connection) {
    if (!system.connection.baseUrl || typeof system.connection.baseUrl !== 'string') {
      errors.push('Base URL is required');
    }

    if (!system.connection.authType || !AUTH_TYPES.includes(system.connection.authType)) {
      errors.push(`Auth type must be one of: ${AUTH_TYPES.join(', ')}`);
    }

    if (system.connection.authType === 'basic') {
      if (!system.connection.username) errors.push('Username is required for basic auth');
      if (!system.connection.password) errors.push('Password is required for basic auth');
    }

    if (system.connection.authType === 'bearer' || system.connection.authType === 'jwt') {
      if (!system.connection.token) errors.push('Token is required for bearer/JWT auth');
    }

    if (system.connection.authType === 'bpjs') {
      if (!system.connection.consId) errors.push('Consumer ID is required for BPJS auth');
      if (!system.connection.secretKey) errors.push('Secret Key is required for BPJS auth');
    }
  }

  return errors;
}

/**
 * Validate connection settings
 * @param {Object} connection - Connection settings to validate
 * @returns {Array<string>} Array of validation errors (empty if valid)
 */
export function validateConnectionSettings(connection) {
  const errors = [];

  if (!connection.baseUrl || typeof connection.baseUrl !== 'string') {
    errors.push('Base URL is required');
  }

  if (!connection.authType || !AUTH_TYPES.includes(connection.authType)) {
    errors.push(`Auth type must be one of: ${AUTH_TYPES.join(', ')}`);
  }

  if (connection.authType === 'basic') {
    if (!connection.username) errors.push('Username is required for basic auth');
    if (!connection.password) errors.push('Password is required for basic auth');
  }

  if (connection.authType === 'bearer' || connection.authType === 'jwt') {
    if (!connection.token) errors.push('Token is required for bearer/JWT auth');
  }

  if (connection.authType === 'bpjs') {
    if (!connection.consId) errors.push('Consumer ID is required for BPJS auth');
    if (!connection.secretKey) errors.push('Secret Key is required for BPJS auth');
  }

  return errors;
}

export default {
  SYSTEM_TYPES,
  AUTH_TYPES,
  ORDER_STATUSES,
  IMPORT_STATUSES,
  MODALITIES,
  validateExternalSystem,
  validateConnectionSettings,
};
