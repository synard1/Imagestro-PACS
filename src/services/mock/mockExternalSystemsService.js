/**
 * Mock External Systems Service
 * 
 * Provides mock implementation of external systems management for UI development
 * and testing without backend dependency.
 * 
 * Requirements: 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 3.3, 3.4, 3.5
 */

import { MOCK_EXTERNAL_SYSTEMS } from './mockData.js';

// Simulate network delay for realistic UX
const simulateNetworkDelay = () => {
  const delay = Math.random() * 500 + 300; // 300-800ms
  return new Promise(resolve => setTimeout(resolve, delay));
};

// In-memory storage for mock data (allows mutations during session)
let externalSystems = JSON.parse(JSON.stringify(MOCK_EXTERNAL_SYSTEMS));

/**
 * List external systems with filtering, searching, and pagination
 * 
 * @param {Object} params - Query parameters
 * @param {string} params.type - Filter by system type (SIMRS, HIS, RIS, PACS, LIS, EMR)
 * @param {string} params.status - Filter by status (active, inactive, all)
 * @param {string} params.search - Search by code or name (case-insensitive)
 * @param {number} params.page - Page number (1-indexed)
 * @param {number} params.pageSize - Items per page
 * @returns {Promise<Object>} Paginated result with items and metadata
 */
export async function listExternalSystems(params = {}) {
  await simulateNetworkDelay();

  const {
    type = null,
    status = 'all',
    search = '',
    page = 1,
    pageSize = 10,
  } = params;

  // Filter by type
  let filtered = externalSystems;
  if (type) {
    filtered = filtered.filter(sys => sys.type === type);
  }

  // Filter by status
  if (status === 'active') {
    filtered = filtered.filter(sys => sys.is_active === true);
  } else if (status === 'inactive') {
    filtered = filtered.filter(sys => sys.is_active === false);
  }

  // Search by code or name (case-insensitive)
  if (search) {
    const searchLower = search.toLowerCase();
    filtered = filtered.filter(
      sys =>
        sys.code.toLowerCase().includes(searchLower) ||
        sys.name.toLowerCase().includes(searchLower)
    );
  }

  // Pagination
  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize);
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const items = filtered.slice(startIndex, endIndex);

  return {
    items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

/**
 * Get a single external system by ID
 * 
 * @param {string} id - System ID
 * @returns {Promise<Object|null>} External system or null if not found
 */
export async function getExternalSystem(id) {
  await simulateNetworkDelay();

  const system = externalSystems.find(sys => sys.id === id);
  return system || null;
}

/**
 * Create a new external system
 * 
 * @param {Object} systemData - System data to create
 * @returns {Promise<Object>} Created system with generated ID
 */
export async function createExternalSystem(systemData) {
  await simulateNetworkDelay();

  // Validate required fields
  if (!systemData.code || !systemData.name || !systemData.type || !systemData.provider) {
    throw new Error('Missing required fields: code, name, type, provider');
  }

  // Check for duplicate code
  if (externalSystems.some(sys => sys.code === systemData.code)) {
    throw new Error(`System code "${systemData.code}" already exists`);
  }

  // Create new system with generated ID
  const newSystem = {
    id: `sys-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    ...systemData,
    is_active: systemData.is_active !== undefined ? systemData.is_active : true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  externalSystems.push(newSystem);
  return newSystem;
}

/**
 * Update an existing external system
 * 
 * @param {string} id - System ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated system
 */
export async function updateExternalSystem(id, updates) {
  await simulateNetworkDelay();

  const systemIndex = externalSystems.findIndex(sys => sys.id === id);
  if (systemIndex === -1) {
    throw new Error(`System with ID "${id}" not found`);
  }

  // Check for duplicate code if code is being updated
  if (updates.code && updates.code !== externalSystems[systemIndex].code) {
    if (externalSystems.some(sys => sys.code === updates.code)) {
      throw new Error(`System code "${updates.code}" already exists`);
    }
  }

  // Update system
  const updatedSystem = {
    ...externalSystems[systemIndex],
    ...updates,
    id: externalSystems[systemIndex].id, // Prevent ID change
    created_at: externalSystems[systemIndex].created_at, // Prevent created_at change
    updated_at: new Date().toISOString(),
  };

  externalSystems[systemIndex] = updatedSystem;
  return updatedSystem;
}

/**
 * Delete an external system
 * 
 * @param {string} id - System ID
 * @returns {Promise<void>}
 */
export async function deleteExternalSystem(id) {
  await simulateNetworkDelay();

  const systemIndex = externalSystems.findIndex(sys => sys.id === id);
  if (systemIndex === -1) {
    throw new Error(`System with ID "${id}" not found`);
  }

  externalSystems.splice(systemIndex, 1);
}

/**
 * Test connection to an external system
 * 
 * Simulates connection test with realistic success/failure scenarios based on connection settings.
 * Now properly validates connection settings and performs realistic mock testing.
 * 
 * @param {string} id - System ID (can be 'new' for unsaved systems)
 * @param {Object} connectionSettings - Connection settings to test
 * @param {string} connectionSettings.baseUrl - Base URL to test
 * @param {string} connectionSettings.authType - Authentication type
 * @param {string} [connectionSettings.apiKey] - API key for api_key auth
 * @param {string} [connectionSettings.username] - Username for basic auth
 * @param {string} [connectionSettings.password] - Password for basic auth
 * @param {string} [connectionSettings.token] - Token for bearer/jwt auth
 * @param {string} [connectionSettings.consId] - Consumer ID for bpjs auth
 * @param {string} [connectionSettings.secretKey] - Secret key for bpjs auth
 * @param {number} [connectionSettings.timeoutMs] - Timeout in ms
 * @returns {Promise<Object>} Connection test result
 */
export async function testConnection(id, connectionSettings) {
  // Simulate longer delay for connection test
  const delay = Math.random() * 1000 + 500; // 500-1500ms
  await new Promise(resolve => setTimeout(resolve, delay));

  // Get connection settings from either the parameter or the stored system
  let settings = connectionSettings;
  if (!settings && id !== 'new') {
    const system = externalSystems.find(sys => sys.id === id);
    if (!system) {
      return {
        success: false,
        status: 'error',
        errorType: 'not_found',
        error: `System with ID "${id}" not found`,
        suggestion: 'Please save the system before testing connection',
        timestamp: new Date().toISOString(),
      };
    }
    settings = system.connection;
  }

  // Validate connection settings
  if (!settings || !settings.baseUrl) {
    return {
      success: false,
      status: 'error',
      errorType: 'validation_error',
      error: 'Base URL is required',
      suggestion: 'Please provide a valid Base URL for the external system',
      timestamp: new Date().toISOString(),
    };
  }

  // Validate URL format
  try {
    new URL(settings.baseUrl);
  } catch {
    return {
      success: false,
      status: 'error',
      errorType: 'invalid_url',
      error: 'Invalid URL format',
      suggestion: 'Ensure the URL starts with http:// or https:// and is properly formatted',
      timestamp: new Date().toISOString(),
    };
  }

  // Validate auth settings
  if (settings.authType === 'api_key' && !settings.apiKey) {
    return {
      success: false,
      status: 'error',
      errorType: 'validation_error',
      error: 'API Key is required for API Key authentication',
      suggestion: 'Please provide an API Key',
      timestamp: new Date().toISOString(),
    };
  }

  if (settings.authType === 'basic' && (!settings.username || !settings.password)) {
    return {
      success: false,
      status: 'error',
      errorType: 'validation_error',
      error: 'Username and password are required for Basic authentication',
      suggestion: 'Please provide both username and password',
      timestamp: new Date().toISOString(),
    };
  }

  if ((settings.authType === 'bearer' || settings.authType === 'jwt') && !settings.token) {
    return {
      success: false,
      status: 'error',
      errorType: 'validation_error',
      error: 'Token is required for Bearer/JWT authentication',
      suggestion: 'Please provide a valid token',
      timestamp: new Date().toISOString(),
    };
  }

  if (settings.authType === 'bpjs' && (!settings.consId || !settings.secretKey)) {
    return {
      success: false,
      status: 'error',
      errorType: 'validation_error',
      error: 'Consumer ID and Secret Key are required for BPJS authentication',
      suggestion: 'Please provide both Consumer ID and Secret Key',
      timestamp: new Date().toISOString(),
    };
  }


  const timeoutMs = settings.timeoutMs || 30000;

  // Simulate connection test scenarios - now based on URL patterns for more predictable testing
  // URLs containing 'fail' will fail, 'timeout' will timeout, etc.
  const baseUrlLower = settings.baseUrl.toLowerCase();
  
  if (baseUrlLower.includes('fail') || baseUrlLower.includes('error')) {
    return {
      success: false,
      status: 'server_error',
      errorType: 'server_error',
      error: 'SIMRS server error (HTTP 500)',
      suggestion: 'Contact SIMRS administrator',
      responseTime: Math.random() * 200 + 100,
      timestamp: new Date().toISOString(),
    };
  }

  if (baseUrlLower.includes('timeout')) {
    return {
      success: false,
      status: 'timeout',
      errorType: 'timeout',
      error: `Connection timeout after ${timeoutMs}ms`,
      suggestion: 'Check if the SIMRS server is running and accessible, or try increasing timeout',
      responseTime: timeoutMs,
      timestamp: new Date().toISOString(),
    };
  }

  if (baseUrlLower.includes('auth') || baseUrlLower.includes('unauthorized')) {
    return {
      success: false,
      status: 'auth_failed',
      errorType: 'authentication_failed',
      error: 'Authentication failed (HTTP 401)',
      suggestion: 'Verify your API Key or credentials are correct and not expired',
      responseTime: Math.random() * 200 + 100,
      timestamp: new Date().toISOString(),
    };
  }

  if (baseUrlLower.includes('notfound') || baseUrlLower.includes('notexist')) {
    return {
      success: false,
      status: 'network_error',
      errorType: 'network_error',
      error: 'Cannot reach the server (DNS lookup failed)',
      suggestion: 'Check if the hostname is correct and network connectivity',
      responseTime: Math.random() * 100 + 50,
      timestamp: new Date().toISOString(),
    };
  }

  // For normal URLs, use weighted random scenarios (70% success)
  const scenarios = [
    {
      weight: 0.7, // 70% success
      result: {
        success: true,
        status: 'connected',
        message: 'Connection successful',
        responseTime: Math.random() * 200 + 100, // 100-300ms
        timestamp: new Date().toISOString(),
      },
    },
    {
      weight: 0.1, // 10% timeout
      result: {
        success: false,
        status: 'timeout',
        errorType: 'timeout',
        error: `Connection timeout after ${timeoutMs}ms`,
        suggestion: 'Check if the SIMRS server is running and accessible',
        timestamp: new Date().toISOString(),
      },
    },
    {
      weight: 0.1, // 10% auth failed
      result: {
        success: false,
        status: 'auth_failed',
        errorType: 'authentication_failed',
        error: 'Authentication failed',
        suggestion: 'Verify your API Key or credentials',
        timestamp: new Date().toISOString(),
      },
    },
    {
      weight: 0.1, // 10% server error
      result: {
        success: false,
        status: 'server_error',
        errorType: 'server_error',
        error: 'SIMRS server error (HTTP 500)',
        suggestion: 'Contact SIMRS administrator',
        timestamp: new Date().toISOString(),
      },
    },
  ];

  // Select scenario based on weights
  const random = Math.random();
  let cumulativeWeight = 0;
  for (const scenario of scenarios) {
    cumulativeWeight += scenario.weight;
    if (random <= cumulativeWeight) {
      return scenario.result;
    }
  }

  // Fallback to success
  return scenarios[0].result;
}

/**
 * Reset mock data to initial state
 * 
 * Useful for testing and resetting state between test runs
 * 
 * @returns {void}
 */
export function resetMockData() {
  externalSystems = JSON.parse(JSON.stringify(MOCK_EXTERNAL_SYSTEMS));
}

/**
 * Get current mock data (for debugging)
 * 
 * @returns {Array} Current external systems
 */
export function getMockData() {
  return JSON.parse(JSON.stringify(externalSystems));
}

/**
 * Export all external systems configuration to JSON format
 * 
 * Exports all systems with their configurations (excluding sensitive data like API keys)
 * 
 * @returns {Promise<Object>} Export data with systems and metadata
 * Requirements: 19.1, 19.5
 */
export async function exportAllSystems() {
  await simulateNetworkDelay();

  // Clone systems and sanitize sensitive data
  const sanitizedSystems = externalSystems.map(system => {
    const sanitized = { ...system };
    
    // Remove or mask sensitive connection data
    if (sanitized.connection) {
      sanitized.has_api_key = !!sanitized.connection.apiKey;
      sanitized.has_password = !!sanitized.connection.password;
      sanitized.has_secret_key = !!sanitized.connection.secretKey;
      
      sanitized.connection = {
        ...sanitized.connection,
        apiKey: sanitized.connection.apiKey ? '***REDACTED***' : undefined,
        password: sanitized.connection.password ? '***REDACTED***' : undefined,
        token: sanitized.connection.token ? '***REDACTED***' : undefined,
        secretKey: sanitized.connection.secretKey ? '***REDACTED***' : undefined,
      };
    }
    
    return sanitized;
  });

  return {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    exportedBy: 'mock-service',
    systemCount: sanitizedSystems.length,
    systems: sanitizedSystems,
  };
}

/**
 * Preview import configuration before applying
 * 
 * Analyzes the import file and returns a preview of changes
 * 
 * @param {Object} importData - Import data from JSON file
 * @returns {Promise<Object>} Preview with changes summary
 * Requirements: 19.2
 */
export async function previewImport(importData) {
  await simulateNetworkDelay();

  // Validate import data format
  if (!importData || !importData.systems || !Array.isArray(importData.systems)) {
    throw new Error('Invalid import file format. Expected { systems: [...] }');
  }

  const preview = {
    valid: true,
    totalSystems: importData.systems.length,
    newSystems: [],
    existingSystems: [],
    conflicts: [],
    errors: [],
  };

  for (const system of importData.systems) {
    // Validate required fields
    if (!system.code || !system.name || !system.type || !system.provider) {
      preview.errors.push({
        code: system.code || 'UNKNOWN',
        error: 'Missing required fields: code, name, type, provider',
      });
      continue;
    }

    // Check if system already exists
    const existingSystem = externalSystems.find(s => s.code === system.code);
    
    if (existingSystem) {
      // Check for differences
      const differences = [];
      if (existingSystem.name !== system.name) {
        differences.push({ field: 'name', current: existingSystem.name, new: system.name });
      }
      if (existingSystem.type !== system.type) {
        differences.push({ field: 'type', current: existingSystem.type, new: system.type });
      }
      if (existingSystem.provider !== system.provider) {
        differences.push({ field: 'provider', current: existingSystem.provider, new: system.provider });
      }
      if (existingSystem.is_active !== system.is_active) {
        differences.push({ field: 'is_active', current: existingSystem.is_active, new: system.is_active });
      }

      if (differences.length > 0) {
        preview.conflicts.push({
          code: system.code,
          name: system.name,
          existingId: existingSystem.id,
          differences,
        });
      } else {
        preview.existingSystems.push({
          code: system.code,
          name: system.name,
          status: 'identical',
        });
      }
    } else {
      preview.newSystems.push({
        code: system.code,
        name: system.name,
        type: system.type,
        provider: system.provider,
      });
    }
  }

  preview.valid = preview.errors.length === 0;
  
  return preview;
}

/**
 * Import external systems configuration
 * 
 * @param {Object} importData - Import data from JSON file
 * @param {Object} options - Import options
 * @param {string} options.conflictResolution - How to handle conflicts: 'skip', 'overwrite', 'merge'
 * @returns {Promise<Object>} Import result with success/failure counts
 * Requirements: 19.2, 19.3, 19.4
 */
export async function importSystems(importData, options = {}) {
  await simulateNetworkDelay();

  const { conflictResolution = 'skip' } = options;

  // Validate import data format
  if (!importData || !importData.systems || !Array.isArray(importData.systems)) {
    throw new Error('Invalid import file format. Expected { systems: [...] }');
  }

  const result = {
    total: importData.systems.length,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    details: [],
  };

  for (const system of importData.systems) {
    try {
      // Validate required fields
      if (!system.code || !system.name || !system.type || !system.provider) {
        result.failed++;
        result.details.push({
          code: system.code || 'UNKNOWN',
          action: 'failed',
          reason: 'Missing required fields',
        });
        continue;
      }

      // Check if system already exists
      const existingIndex = externalSystems.findIndex(s => s.code === system.code);
      
      if (existingIndex !== -1) {
        // Handle conflict based on resolution strategy
        switch (conflictResolution) {
          case 'skip':
            result.skipped++;
            result.details.push({
              code: system.code,
              action: 'skipped',
              reason: 'System already exists',
            });
            break;
            
          case 'overwrite':
            // Replace entire system (keep ID and timestamps)
            const existingId = externalSystems[existingIndex].id;
            const existingCreatedAt = externalSystems[existingIndex].created_at;
            externalSystems[existingIndex] = {
              ...system,
              id: existingId,
              created_at: existingCreatedAt,
              updated_at: new Date().toISOString(),
              // Clear sensitive data that was redacted
              connection: system.connection ? {
                ...system.connection,
                apiKey: system.connection.apiKey === '***REDACTED***' ? externalSystems[existingIndex].connection?.apiKey : system.connection.apiKey,
                password: system.connection.password === '***REDACTED***' ? externalSystems[existingIndex].connection?.password : system.connection.password,
                token: system.connection.token === '***REDACTED***' ? externalSystems[existingIndex].connection?.token : system.connection.token,
              } : externalSystems[existingIndex].connection,
            };
            result.updated++;
            result.details.push({
              code: system.code,
              action: 'updated',
              reason: 'Overwritten existing system',
            });
            break;
            
          case 'merge':
            // Merge: only update non-sensitive fields, keep existing sensitive data
            const currentSystem = externalSystems[existingIndex];
            externalSystems[existingIndex] = {
              ...currentSystem,
              name: system.name || currentSystem.name,
              type: system.type || currentSystem.type,
              provider: system.provider || currentSystem.provider,
              vendor: system.vendor || currentSystem.vendor,
              version: system.version || currentSystem.version,
              is_active: system.is_active !== undefined ? system.is_active : currentSystem.is_active,
              facility_code: system.facility_code || currentSystem.facility_code,
              facility_name: system.facility_name || currentSystem.facility_name,
              capabilities: system.capabilities || currentSystem.capabilities,
              // Keep existing connection settings (don't overwrite with redacted values)
              connection: currentSystem.connection,
              updated_at: new Date().toISOString(),
            };
            result.updated++;
            result.details.push({
              code: system.code,
              action: 'merged',
              reason: 'Merged with existing system',
            });
            break;
            
          default:
            result.skipped++;
            result.details.push({
              code: system.code,
              action: 'skipped',
              reason: 'Unknown conflict resolution strategy',
            });
        }
      } else {
        // Create new system
        const newSystem = {
          id: `sys-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          ...system,
          // Clear redacted sensitive data for new systems
          connection: system.connection ? {
            ...system.connection,
            apiKey: system.connection.apiKey === '***REDACTED***' ? '' : system.connection.apiKey,
            password: system.connection.password === '***REDACTED***' ? '' : system.connection.password,
            token: system.connection.token === '***REDACTED***' ? '' : system.connection.token,
          } : undefined,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        externalSystems.push(newSystem);
        result.created++;
        result.details.push({
          code: system.code,
          action: 'created',
          reason: 'New system created',
        });
      }
    } catch (error) {
      result.failed++;
      result.details.push({
        code: system.code || 'UNKNOWN',
        action: 'failed',
        reason: error.message,
      });
    }
  }

  return result;
}

export default {
  listExternalSystems,
  getExternalSystem,
  createExternalSystem,
  updateExternalSystem,
  deleteExternalSystem,
  testConnection,
  resetMockData,
  getMockData,
  exportAllSystems,
  previewImport,
  importSystems,
};
