/**
 * External Systems Service
 * 
 * Handles all API operations for external systems management including:
 * - CRUD operations for external systems
 * - Connection testing
 * - Configuration management
 * 
 * Requirements: 1.1, 2.1, 3.1
 */

import { apiClient } from './http';
import { logger } from '../utils/logger';

const MODULE_NAME = 'externalSystems'; // Uses externalSystems module which points to backend-api
const inflightRequests = new Map();

/**
 * Map backend system object (snake_case) to frontend structure (camelCase with connection object)
 */
const mapToFrontend = (data) => {
  if (!data) return data;
  
  // If already mapped (has camelCase fields), return as-is
  if (data.connection && data.code && !data.system_code) return data;

  // Map all backend fields to frontend structure
  const system = {
    id: data.id,
    code: data.system_code || data.code || '',
    name: data.system_name || data.name || '',
    type: data.system_type || data.type || '',
    provider: data.provider || '',  // Backend has 'provider' field (e.g., 'khanza')
    vendor: data.vendor || '',       // Backend has 'vendor' field (e.g., 'Khanza')
    version: data.system_version || data.version || '',
    is_active: data.is_active !== undefined ? data.is_active : true,
    
    // Credential flags for UI masking
    has_api_key: data.has_api_key || !!data.api_key,
    has_password: data.has_password || !!data.password,
    has_secret_key: data.has_secret_key || !!data.secret_key,
    
    // Contact information
    contact_person: data.contact_person || '',
    contact_email: data.contact_email || '',
    
    // Facility information
    facility_code: data.facility_code || '',
    facility_name: data.facility_name || '',
    
    // BPJS Credentials (root-level for flat forms)
    cons_id: data.cons_id || '',
    secret_key: data.secret_key || '',
    
    // Notes and metadata
    notes: data.notes || '',
    created_at: data.created_at || '',
    updated_at: data.updated_at || '',
    
    // Capabilities (provider-specific features)
    capabilities: data.capabilities || {},
    
    // Connection properties (nested object for frontend)
    connection: {
      baseUrl: data.base_url || '',
      authType: data.auth_type || 'none',
      apiKey: data.api_key || '',
      username: data.username || '',
      password: data.password || '',
      token: data.token || '',
      consId: data.cons_id || '',
      secretKey: data.secret_key || '',
      timeoutMs: data.timeout_ms || 30000,
      healthPath: data.health_path || '/health',
      apiEndpoint: data.api_endpoint || '',
    },
  };

  return system;
};

/**
 * Map frontend system object to backend structure (snake_case flat)
 */
const mapToBackend = (data) => {
  if (!data) return data;
  
  const system = {
    // Main fields
    system_code: data.code || data.system_code,
    system_name: data.name || data.system_name,
    system_type: data.type || data.system_type,
    provider: data.provider,      // Provider type (khanza, gos, generic)
    vendor: data.vendor,          // Vendor name (Khanza, GOS, etc.)
    system_version: data.version || data.system_version,
    is_active: data.is_active !== undefined ? data.is_active : true,
    
    // Contact information
    contact_person: data.contact_person,
    contact_email: data.contact_email,
    
    // Facility information
    facility_code: data.facility_code,
    facility_name: data.facility_name,
    
    // Notes
    notes: data.notes,
  };
  
  // Map connection properties from nested object to flat structure
  if (data.connection) {
    system.base_url = data.connection.baseUrl;
    system.auth_type = data.connection.authType;
    system.api_key = data.connection.apiKey;
    system.username = data.connection.username;
    system.password = data.connection.password;
    system.token = data.connection.token;
    system.cons_id = data.connection.consId;
    system.secret_key = data.connection.secretKey;
    system.timeout_ms = data.connection.timeoutMs;
    system.health_path = data.connection.healthPath;
    system.api_endpoint = data.connection.apiEndpoint;
  } else {
    // If no connection object, try to get from flat structure
    system.base_url = data.base_url;
    system.auth_type = data.auth_type;
    system.api_key = data.api_key;
    system.username = data.username;
    system.password = data.password;
    system.token = data.token;
    system.cons_id = data.cons_id || data.consId;
    system.secret_key = data.secret_key || data.secretKey;
    system.timeout_ms = data.timeout_ms;
    system.health_path = data.health_path;
    system.api_endpoint = data.api_endpoint;
  }
  
  // Remove undefined/null values
  Object.keys(system).forEach(key => {
    if (system[key] === undefined || system[key] === null) {
      delete system[key];
    }
  });
  
  return system;
};

/**
 * Get API client for external systems operations
 * @returns {Object} API client instance
 */
const getClient = () => {
  return apiClient(MODULE_NAME);
};

/**
 * Create cache key for list requests
 * @param {Object} params - Query parameters
 * @returns {string} Cache key
 */
const createCacheKey = (params = {}) => {
  const q = new URLSearchParams();
  // Map frontend params to backend params
  if (params.page) q.append('page', params.page);
  if (params.pageSize || params.page_size) q.append('page_size', params.pageSize || params.page_size);
  if (params.system_code) q.append('system_code', params.system_code);
  if (params.system_type || params.type) q.append('type', params.system_type || params.type);
  if (params.provider) q.append('provider', params.provider);
  if (params.facility_code) q.append('facility_code', params.facility_code);
  if (typeof params.is_active !== 'undefined') {
    q.append('is_active', params.is_active ? 'true' : 'false');
  }
  if (params.search) q.append('search', params.search);
  return q.toString() ? `/external-systems?${q}` : '/external-systems';
};

/**
 * List all external systems with filtering and pagination
 * @param {Object} params - Query parameters
 * @param {number} [params.page=1] - Page number (1-based)
 * @param {number} [params.page_size=20] - Items per page
 * @param {string} [params.system_code] - Filter by system code
 * @param {string} [params.system_type] - Filter by system type
 * @param {boolean} [params.is_active] - Filter by active status
 * @param {string} [params.search] - Search by code or name
 * @returns {Promise<Object>} Paginated list of external systems
 */
export async function listExternalSystems(params = {}) {
  const url = createCacheKey(params);

  // Return cached request if one is in flight
  if (inflightRequests.has(url)) {
    return inflightRequests.get(url);
  }

  const requestPromise = (async () => {
    try {
      const client = getClient();
      const response = await client.get(url);
      
      // Backend returns 'systems' array, but frontend expects 'items'
      // Normalize the response structure
      let items = [];
      if (response && response.systems) {
        items = response.systems.map(mapToFrontend);
      } else if (response && response.items) {
        items = response.items.map(mapToFrontend);
      }
      
      logger.debug('[externalSystemsService]', 'Listed external systems', {
        count: items.length,
      });

      // Return normalized response with 'items' field
      return {
        items: items,
        total: response?.count || items.length,
        page: response?.page || 1,
        page_size: response?.page_size || items.length,
        total_pages: response?.total_pages || 1,
        status: response?.status || 'success'
      };
    } catch (error) {
      logger.error('[externalSystemsService]', 'Failed to list external systems', error);
      throw error;
    }
  })()
    .finally(() => {
      inflightRequests.delete(url);
    });

  inflightRequests.set(url, requestPromise);
  return requestPromise;
}

/**
 * Get a single external system by ID
 * @param {string} id - System ID
 * @param {Object} options - Options
 * @param {boolean} options.includeCredentials - Whether to include credentials
 * @param {boolean} options.maskCredentials - Whether to mask credentials (default: true)
 * @returns {Promise<Object>} External system details
 */
export async function getExternalSystem(id, options = {}) {
  if (!id) {
    throw new Error('System ID is required');
  }

  const { includeCredentials = false, maskCredentials = true } = options;
  
  const queryParams = new URLSearchParams();
  if (includeCredentials) queryParams.append('include_credentials', 'true');
  if (includeCredentials && !maskCredentials) queryParams.append('mask_credentials', 'false');
  
  const queryString = queryParams.toString();
  const url = `/external-systems/${encodeURIComponent(id)}${queryString ? `?${queryString}` : ''}`;

  // Return cached request if one is in flight
  if (inflightRequests.has(url)) {
    return inflightRequests.get(url);
  }

  const requestPromise = (async () => {
    try {
      const client = getClient();
      const response = await client.get(url);
      logger.debug('[externalSystemsService]', 'Retrieved external system', { id, includeCredentials });
      
      // Backend may return system directly or wrapped in 'system' field
      const system = response?.system || response;
      return mapToFrontend(system);
    } catch (error) {
      logger.error('[externalSystemsService]', 'Failed to get external system', error);
      throw error;
    }
  })()
    .finally(() => {
      inflightRequests.delete(url);
    });

  inflightRequests.set(url, requestPromise);
  return requestPromise;
}

/**
 * Create a new external system
 * @param {Object} data - System data
 * @param {string} data.code - System code (unique)
 * @param {string} data.name - System name
 * @param {string} data.type - System type (SIMRS, HIS, RIS, PACS, LIS, EMR)
 * @param {string} [data.provider] - Provider name
 * @param {string} [data.vendor] - Vendor name
 * @param {string} [data.version] - System version
 * @param {Object} [data.connection] - Connection settings
 * @returns {Promise<Object>} Created external system
 */
export async function createExternalSystem(data) {
  if (!data) {
    throw new Error('System data is required');
  }

  try {
    const client = getClient();
    const backendData = mapToBackend(data);
    const response = await client.post('/external-systems', backendData);
    logger.info('[externalSystemsService]', 'Created external system', {
      code: data.code,
      type: data.type,
    });
    const system = response?.system || response;
    return mapToFrontend(system);
  } catch (error) {
    logger.error('[externalSystemsService]', 'Failed to create external system', error);
    throw error;
  }
}

/**
 * Update an existing external system
 * @param {string} id - System ID
 * @param {Object} data - Updated system data
 * @returns {Promise<Object>} Updated external system
 */
export async function updateExternalSystem(id, data) {
  if (!id) {
    throw new Error('System ID is required');
  }

  if (!data) {
    throw new Error('System data is required');
  }

  try {
    console.log('[externalSystemsService] updateExternalSystem called with:', { id, data });
    const client = getClient();
    const url = `/external-systems/${encodeURIComponent(id)}`;
    console.log('[externalSystemsService] Making PUT request to:', url, 'with data:', data);
    const backendData = mapToBackend(data);
    const response = await client.put(url, backendData);
    console.log('[externalSystemsService] Response:', response);
    logger.info('[externalSystemsService]', 'Updated external system', { id });
    const system = response?.system || response;
    return mapToFrontend(system);
  } catch (error) {
    logger.error('[externalSystemsService]', 'Failed to update external system', error);
    throw error;
  }
}

/**
 * Delete an external system
 * @param {string} id - System ID
 * @returns {Promise<Object>} Deletion result
 */
export async function deleteExternalSystem(id) {
  if (!id) {
    throw new Error('System ID is required');
  }

  try {
    const client = getClient();
    const response = await client.delete(`/external-systems/${encodeURIComponent(id)}`);
    logger.info('[externalSystemsService]', 'Deleted external system', { id });
    return response;
  } catch (error) {
    logger.error('[externalSystemsService]', 'Failed to delete external system', error);
    throw error;
  }
}

/**
 * Export all external systems with their configurations
 * @returns {Promise<Object>} Export data with systems and metadata
 * Requirements: 19.1, 19.5
 */
export async function exportAllSystems() {
  try {
    const client = getClient();
    const response = await client.get('/external-systems/export');
    logger.info('[externalSystemsService]', 'Exported all external systems');
    return response;
  } catch (error) {
    logger.error('[externalSystemsService]', 'Failed to export external systems', error);
    throw error;
  }
}

/**
 * Preview import data before applying
 * @param {Object} importData - Import data to preview
 * @returns {Promise<Object>} Preview result with changes summary
 * Requirements: 19.2
 */
export async function previewImport(importData) {
  if (!importData) {
    throw new Error('Import data is required');
  }

  try {
    const client = getClient();
    const response = await client.post('/external-systems/import/preview', importData);
    logger.info('[externalSystemsService]', 'Previewed import data');
    return response;
  } catch (error) {
    logger.error('[externalSystemsService]', 'Failed to preview import', error);
    throw error;
  }
}

/**
 * Import external systems from backup data
 * @param {Object} importData - Import data
 * @param {Object} options - Import options
 * @param {string} options.conflictResolution - How to handle conflicts (skip, overwrite, merge)
 * @returns {Promise<Object>} Import result
 * Requirements: 19.2, 19.3, 19.4
 */
export async function importSystems(importData, options = {}) {
  if (!importData) {
    throw new Error('Import data is required');
  }

  try {
    const client = getClient();
    const response = await client.post('/external-systems/import', {
      data: importData,
      options,
    });
    logger.info('[externalSystemsService]', 'Imported external systems', {
      conflictResolution: options.conflictResolution,
    });
    return response;
  } catch (error) {
    logger.error('[externalSystemsService]', 'Failed to import external systems', error);
    throw error;
  }
}

export default {
  listExternalSystems,
  getExternalSystem,
  createExternalSystem,
  updateExternalSystem,
  deleteExternalSystem,
  exportAllSystems,
  previewImport,
  importSystems,
};
