/**
 * Khanza Mapping Service
 * 
 * Handles CRUD operations for procedure and doctor mappings between
 * SIMRS Khanza and PACS systems via the PACS backend API.
 * 
 * This service communicates with the local PACS Service API for:
 * - Procedure mappings (khanza_procedure_mappings table)
 * - Doctor mappings (khanza_doctor_mappings table)
 * 
 * Requirements: 4.1, 4.2, 4.4, 4.5, 7.1, 7.4
 */

import { logger } from '../utils/logger';
import { apiClient } from './http';
import { isKhanzaActive } from './api-registry';
import {
  handleError,
  validateRequiredFields,
  createError,
} from './khanzaErrorHandler';

// Module name for API client
const MODULE_NAME = 'khanza'; // Uses khanza module for correct routing

// Default pagination settings
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_PAGE = 1;

/**
 * Get API client for Khanza mapping operations
 * @returns {Object} API client instance
 */
const getClient = () => {
  return apiClient(MODULE_NAME);
};

/**
 * Check if Khanza integration is enabled
 * Uses the unified SIMRS config structure
 * @returns {boolean} True if Khanza is the active SIMRS provider
 */
export const isKhanzaEnabled = () => {
  return isKhanzaActive();
};

// ============================================
// Procedure Mappings CRUD
// ============================================

/**
 * List procedure mappings with pagination and search
 * @param {Object} params - Query parameters
 * @param {number} params.page - Page number (1-based)
 * @param {number} params.pageSize - Items per page
 * @param {string} params.search - Search query (searches khanza_code, khanza_name, pacs_code, pacs_name)
 * @param {string} params.modality - Filter by modality
 * @param {boolean} params.isActive - Filter by active status
 * @returns {Promise<Object>} Paginated list of procedure mappings
 */
export const listProcedureMappings = async (params = {}) => {
  const {
    page = DEFAULT_PAGE,
    pageSize = DEFAULT_PAGE_SIZE,
    search = '',
    modality = '',
    isActive = null,
  } = params;

  logger.info('[khanzaMappingService]', 'Listing procedure mappings...', { page, pageSize, search });

  try {
    const client = getClient();
    
    // Build query string
    const queryParams = new URLSearchParams();
    queryParams.append('page', page.toString());
    queryParams.append('page_size', pageSize.toString());
    
    if (search) {
      queryParams.append('search', search);
    }
    if (modality) {
      queryParams.append('modality', modality);
    }
    if (isActive !== null) {
      queryParams.append('is_active', isActive.toString());
    }

    const response = await client.get(`/mappings/procedures?${queryParams.toString()}`);
    
    // Normalize response format
    const result = normalizeListResponse(response, page, pageSize);
    
    logger.debug('[khanzaMappingService]', 'Procedure mappings fetched:', result.total);
    return result;
  } catch (error) {
    logger.error('[khanzaMappingService]', 'Failed to list procedure mappings:', error.message);
    throw error;
  }
};

/**
 * Get a single procedure mapping by ID
 * @param {string} id - Mapping ID
 * @returns {Promise<Object>} Procedure mapping
 */
export const getProcedureMapping = async (id) => {
  if (!id) {
    throw new Error('Mapping ID is required');
  }

  logger.info('[khanzaMappingService]', `Getting procedure mapping: ${id}`);

  try {
    const client = getClient();
    const response = await client.get(`/mappings/procedures/${id}`);
    return response.data || response;
  } catch (error) {
    logger.error('[khanzaMappingService]', 'Failed to get procedure mapping:', error.message);
    throw error;
  }
};

/**
 * Get procedure mapping by Khanza code
 * @param {string} khanzaCode - Khanza procedure code (kd_jenis_prw)
 * @returns {Promise<Object|null>} Procedure mapping or null if not found
 */
export const getProcedureMappingByCode = async (khanzaCode) => {
  if (!khanzaCode) {
    throw new Error('Khanza code is required');
  }

  logger.info('[khanzaMappingService]', `Getting procedure mapping by code: ${khanzaCode}`);

  try {
    const client = getClient();
    const response = await client.get(`/mappings/procedures/by-code/${encodeURIComponent(khanzaCode)}`);
    return response.data || response;
  } catch (error) {
    if (error.status === 404 || (error.response && error.response.status === 404)) {
      return null;
    }
    logger.error('[khanzaMappingService]', 'Failed to get procedure mapping by code:', error.message);
    throw error;
  }
};

/**
 * Create a new procedure mapping
 * @param {Object} mapping - Mapping data
 * @param {string} mapping.khanza_code - Khanza procedure code (kd_jenis_prw)
 * @param {string} mapping.khanza_name - Khanza procedure name
 * @param {string} mapping.pacs_code - PACS procedure code
 * @param {string} mapping.pacs_name - PACS procedure name
 * @param {string} mapping.modality - Modality (CT, MR, CR, etc.)
 * @param {string} mapping.description - Optional description
 * @returns {Promise<Object>} Created procedure mapping
 */
export const createProcedureMapping = async (mapping) => {
  // Validate required fields
  try {
    validateProcedureMappingInput(mapping);
  } catch (validationError) {
    handleError(validationError, {
      context: 'create_procedure_mapping',
      notify: true,
      log: true,
    });
    throw validationError;
  }

  logger.info('[khanzaMappingService]', 'Creating procedure mapping:', mapping.khanza_code);

  try {
    const client = getClient();
    const response = await client.post('/mappings/procedures', mapping);
    
    logger.info('[khanzaMappingService]', 'Procedure mapping created successfully');
    return response.data || response;
  } catch (error) {
    // Handle duplicate error
    if (error.status === 409 || error.message?.includes('duplicate')) {
      const duplicateError = new Error(`Procedure mapping with Khanza code '${mapping.khanza_code}' already exists`);
      duplicateError.code = 'DUPLICATE';
      handleError(duplicateError, {
        context: 'create_procedure_mapping',
        notify: true,
        log: true,
      });
      throw duplicateError;
    }
    
    handleError(error, {
      context: 'create_procedure_mapping',
      notify: true,
      log: true,
    });
    throw error;
  }
};

/**
 * Update an existing procedure mapping
 * @param {string} id - Mapping ID
 * @param {Object} mapping - Updated mapping data
 * @returns {Promise<Object>} Updated procedure mapping
 */
export const updateProcedureMapping = async (id, mapping) => {
  if (!id) {
    throw new Error('Mapping ID is required');
  }

  logger.info('[khanzaMappingService]', `Updating procedure mapping: ${id}`);

  try {
    const client = getClient();
    const response = await client.put(`/mappings/procedures/${id}`, mapping);
    
    logger.info('[khanzaMappingService]', 'Procedure mapping updated successfully');
    return response.data || response;
  } catch (error) {
    logger.error('[khanzaMappingService]', 'Failed to update procedure mapping:', error.message);
    throw error;
  }
};

/**
 * Delete a procedure mapping (soft delete - sets is_active to false)
 * @param {string} id - Mapping ID
 * @returns {Promise<Object>} Deletion result
 */
export const deleteProcedureMapping = async (id) => {
  if (!id) {
    throw new Error('Mapping ID is required');
  }

  logger.info('[khanzaMappingService]', `Deleting procedure mapping: ${id}`);

  try {
    const client = getClient();
    const response = await client.delete(`/mappings/procedures/${id}`);
    
    logger.info('[khanzaMappingService]', 'Procedure mapping deleted successfully');
    return response;
  } catch (error) {
    logger.error('[khanzaMappingService]', 'Failed to delete procedure mapping:', error.message);
    throw error;
  }
};

// ============================================
// Doctor Mappings CRUD
// ============================================

/**
 * List doctor mappings with pagination and search
 * @param {Object} params - Query parameters
 * @param {number} params.page - Page number (1-based)
 * @param {number} params.pageSize - Items per page
 * @param {string} params.search - Search query (searches khanza_code, khanza_name)
 * @param {boolean} params.autoCreated - Filter by auto-created status
 * @returns {Promise<Object>} Paginated list of doctor mappings
 */
export const listDoctorMappings = async (params = {}) => {
  const {
    page = DEFAULT_PAGE,
    pageSize = DEFAULT_PAGE_SIZE,
    search = '',
    autoCreated = null,
  } = params;

  logger.info('[khanzaMappingService]', 'Listing doctor mappings...', { page, pageSize, search });

  try {
    const client = getClient();
    
    // Build query string
    const queryParams = new URLSearchParams();
    queryParams.append('page', page.toString());
    queryParams.append('page_size', pageSize.toString());
    
    if (search) {
      queryParams.append('search', search);
    }
    if (autoCreated !== null) {
      queryParams.append('auto_created', autoCreated.toString());
    }

    const response = await client.get(`/mappings/doctors?${queryParams.toString()}`);
    
    // Normalize response format
    const result = normalizeListResponse(response, page, pageSize);
    
    logger.debug('[khanzaMappingService]', 'Doctor mappings fetched:', result.total);
    return result;
  } catch (error) {
    logger.error('[khanzaMappingService]', 'Failed to list doctor mappings:', error.message);
    throw error;
  }
};

/**
 * Get a single doctor mapping by ID
 * @param {string} id - Mapping ID
 * @returns {Promise<Object>} Doctor mapping
 */
export const getDoctorMapping = async (id) => {
  if (!id) {
    throw new Error('Mapping ID is required');
  }

  logger.info('[khanzaMappingService]', `Getting doctor mapping: ${id}`);

  try {
    const client = getClient();
    const response = await client.get(`/mappings/doctors/${id}`);
    return response.data || response;
  } catch (error) {
    logger.error('[khanzaMappingService]', 'Failed to get doctor mapping:', error.message);
    throw error;
  }
};

/**
 * Get doctor mapping by Khanza code
 * @param {string} khanzaCode - Khanza doctor code (kd_dokter)
 * @returns {Promise<Object|null>} Doctor mapping or null if not found
 */
export const getDoctorMappingByCode = async (khanzaCode) => {
  if (!khanzaCode) {
    throw new Error('Khanza code is required');
  }

  logger.info('[khanzaMappingService]', `Getting doctor mapping by code: ${khanzaCode}`);

  try {
    const client = getClient();
    const response = await client.get(`/mappings/doctors/by-code/${encodeURIComponent(khanzaCode)}`);
    return response.data || response;
  } catch (error) {
    // Return null for 404 (not found)
    if (error.status === 404) {
      logger.debug('[khanzaMappingService]', `Doctor mapping not found for code: ${khanzaCode}`);
      return null;
    }
    logger.error('[khanzaMappingService]', 'Failed to get doctor mapping by code:', error.message);
    throw error;
  }
};

/**
 * Create a new doctor mapping
 * @param {Object} mapping - Mapping data
 * @param {string} mapping.khanza_code - Khanza doctor code (kd_dokter)
 * @param {string} mapping.khanza_name - Khanza doctor name
 * @param {string} mapping.pacs_doctor_id - PACS doctor ID
 * @param {boolean} mapping.auto_created - Whether auto-created during import
 * @returns {Promise<Object>} Created doctor mapping
 */
export const createDoctorMapping = async (mapping) => {
  // Validate required fields
  try {
    validateDoctorMappingInput(mapping);
  } catch (validationError) {
    handleError(validationError, {
      context: 'create_doctor_mapping',
      notify: true,
      log: true,
    });
    throw validationError;
  }

  logger.info('[khanzaMappingService]', 'Creating doctor mapping:', mapping.khanza_code);

  try {
    const client = getClient();
    const response = await client.post('/mappings/doctors', mapping);
    
    logger.info('[khanzaMappingService]', 'Doctor mapping created successfully');
    return response.data || response;
  } catch (error) {
    // Handle duplicate error
    if (error.status === 409 || error.message?.includes('duplicate')) {
      const duplicateError = new Error(`Doctor mapping with Khanza code '${mapping.khanza_code}' already exists`);
      duplicateError.code = 'DUPLICATE';
      handleError(duplicateError, {
        context: 'create_doctor_mapping',
        notify: true,
        log: true,
      });
      throw duplicateError;
    }
    
    handleError(error, {
      context: 'create_doctor_mapping',
      notify: true,
      log: true,
    });
    throw error;
  }
};

/**
 * Update an existing doctor mapping
 * @param {string} id - Mapping ID
 * @param {Object} mapping - Updated mapping data
 * @returns {Promise<Object>} Updated doctor mapping
 */
export const updateDoctorMapping = async (id, mapping) => {
  if (!id) {
    throw new Error('Mapping ID is required');
  }

  logger.info('[khanzaMappingService]', `Updating doctor mapping: ${id}`);

  try {
    const client = getClient();
    const response = await client.put(`/mappings/doctors/${id}`, mapping);
    
    logger.info('[khanzaMappingService]', 'Doctor mapping updated successfully');
    return response.data || response;
  } catch (error) {
    logger.error('[khanzaMappingService]', 'Failed to update doctor mapping:', error.message);
    throw error;
  }
};

/**
 * Delete a doctor mapping
 * @param {string} id - Mapping ID
 * @returns {Promise<Object>} Deletion result
 */
export const deleteDoctorMapping = async (id) => {
  if (!id) {
    throw new Error('Mapping ID is required');
  }

  logger.info('[khanzaMappingService]', `Deleting doctor mapping: ${id}`);

  try {
    const client = getClient();
    const response = await client.delete(`/mappings/doctors/${id}`);
    
    logger.info('[khanzaMappingService]', 'Doctor mapping deleted successfully');
    return response;
  } catch (error) {
    logger.error('[khanzaMappingService]', 'Failed to delete doctor mapping:', error.message);
    throw error;
  }
};

// ============================================
// Validation Helpers
// ============================================

/**
 * Validate procedure mapping input
 * @param {Object} mapping - Mapping data to validate
 * @throws {Error} If validation fails
 */
const validateProcedureMappingInput = (mapping) => {
  const errors = [];

  if (!mapping) {
    throw new Error('Mapping data is required');
  }

  if (!mapping.khanza_code || typeof mapping.khanza_code !== 'string' || !mapping.khanza_code.trim()) {
    errors.push('Khanza code is required');
  }

  if (!mapping.khanza_name || typeof mapping.khanza_name !== 'string' || !mapping.khanza_name.trim()) {
    errors.push('Khanza name is required');
  }

  if (!mapping.pacs_code || typeof mapping.pacs_code !== 'string' || !mapping.pacs_code.trim()) {
    errors.push('PACS code is required');
  }

  if (!mapping.pacs_name || typeof mapping.pacs_name !== 'string' || !mapping.pacs_name.trim()) {
    errors.push('PACS name is required');
  }

  // Validate modality if provided
  if (mapping.modality) {
    const validModalities = ['CR', 'CT', 'MR', 'US', 'XA', 'NM', 'PT', 'MG', 'DX', 'RF', 'OT'];
    if (!validModalities.includes(mapping.modality.toUpperCase())) {
      errors.push(`Invalid modality. Valid values: ${validModalities.join(', ')}`);
    }
  }

  if (errors.length > 0) {
    const error = new Error(`Validation failed: ${errors.join('; ')}`);
    error.code = 'VALIDATION_ERROR';
    error.details = errors;
    throw error;
  }
};

/**
 * Validate doctor mapping input
 * @param {Object} mapping - Mapping data to validate
 * @throws {Error} If validation fails
 */
const validateDoctorMappingInput = (mapping) => {
  const errors = [];

  if (!mapping) {
    throw new Error('Mapping data is required');
  }

  if (!mapping.khanza_code || typeof mapping.khanza_code !== 'string' || !mapping.khanza_code.trim()) {
    errors.push('Khanza code is required');
  }

  if (!mapping.khanza_name || typeof mapping.khanza_name !== 'string' || !mapping.khanza_name.trim()) {
    errors.push('Khanza name is required');
  }

  // pacs_doctor_id is optional for auto-created mappings
  // but if provided, it should be a valid string
  if (mapping.pacs_doctor_id !== undefined && mapping.pacs_doctor_id !== null) {
    if (typeof mapping.pacs_doctor_id !== 'string' || !mapping.pacs_doctor_id.trim()) {
      errors.push('PACS doctor ID must be a non-empty string if provided');
    }
  }

  if (errors.length > 0) {
    const error = new Error(`Validation failed: ${errors.join('; ')}`);
    error.code = 'VALIDATION_ERROR';
    error.details = errors;
    throw error;
  }
};

// ============================================
// Response Normalization Helpers
// ============================================

/**
 * Normalize list response to consistent pagination format
 * @param {Object|Array} response - API response
 * @param {number} page - Current page
 * @param {number} pageSize - Page size
 * @returns {Object} Normalized response with pagination info
 */
const normalizeListResponse = (response, page, pageSize) => {
  // If response is already in expected format
  if (response && typeof response === 'object' && 'items' in response) {
    return {
      items: response.items || [],
      total: response.total || response.items?.length || 0,
      page: response.page || page,
      pageSize: response.page_size || response.pageSize || pageSize,
      totalPages: response.total_pages || response.totalPages || Math.ceil((response.total || 0) / pageSize),
    };
  }

  // If response has data array
  if (response && response.data && Array.isArray(response.data)) {
    return {
      items: response.data,
      total: response.total || response.data.length,
      page: response.page || page,
      pageSize: response.page_size || response.pageSize || pageSize,
      totalPages: response.total_pages || response.totalPages || Math.ceil((response.total || response.data.length) / pageSize),
    };
  }

  // If response is an array
  if (Array.isArray(response)) {
    return {
      items: response,
      total: response.length,
      page: page,
      pageSize: pageSize,
      totalPages: Math.ceil(response.length / pageSize),
    };
  }

  // Default empty response
  return {
    items: [],
    total: 0,
    page: page,
    pageSize: pageSize,
    totalPages: 0,
  };
};

// ============================================
// Bulk Operations
// ============================================

/**
 * Import multiple procedure mappings at once
 * @param {Array<Object>} mappings - Array of mapping data
 * @returns {Promise<Object>} Import result with success/failure counts
 */
export const bulkImportProcedureMappings = async (mappings) => {
  if (!Array.isArray(mappings) || mappings.length === 0) {
    throw new Error('Mappings array is required and must not be empty');
  }

  logger.info('[khanzaMappingService]', `Bulk importing ${mappings.length} procedure mappings...`);

  const results = {
    total: mappings.length,
    success: 0,
    failed: 0,
    errors: [],
  };

  for (const mapping of mappings) {
    try {
      await createProcedureMapping(mapping);
      results.success++;
    } catch (error) {
      results.failed++;
      results.errors.push({
        khanza_code: mapping.khanza_code,
        error: error.message,
      });
    }
  }

  logger.info('[khanzaMappingService]', `Bulk import completed: ${results.success} success, ${results.failed} failed`);
  return results;
};

/**
 * Export all procedure mappings
 * @returns {Promise<Array>} All procedure mappings
 */
export const exportProcedureMappings = async () => {
  logger.info('[khanzaMappingService]', 'Exporting all procedure mappings...');

  const allMappings = [];
  let page = 1;
  const pageSize = 100;
  let hasMore = true;

  while (hasMore) {
    const result = await listProcedureMappings({ page, pageSize });
    allMappings.push(...result.items);
    hasMore = page < result.totalPages;
    page++;
  }

  logger.info('[khanzaMappingService]', `Exported ${allMappings.length} procedure mappings`);
  return allMappings;
};

// ============================================
// Export Default
// ============================================
// Operator User Mappings CRUD
// ============================================

/**
 * List operator user mappings with pagination and search
 * @param {Object} params - Query parameters
 * @param {number} params.page - Page number (1-based)
 * @param {number} params.pageSize - Items per page
 * @param {string} params.search - Search query (searches pacs_username, khanza_operator_code)
 * @param {boolean} params.isActive - Filter by active status
 * @returns {Promise<Object>} Paginated list of operator mappings
 */
export const listOperatorMappings = async (params = {}) => {
  const {
    page = DEFAULT_PAGE,
    pageSize = DEFAULT_PAGE_SIZE,
    search = '',
    isActive = null,
  } = params;

  logger.info('[khanzaMappingService]', 'Listing operator mappings...', { page, pageSize, search });

  try {
    const client = getClient();
    
    // Build query string
    const queryParams = new URLSearchParams();
    queryParams.append('page', page.toString());
    queryParams.append('page_size', pageSize.toString());
    
    if (search) {
      queryParams.append('search', search);
    }
    if (isActive !== null) {
      queryParams.append('is_active', isActive.toString());
    }

    const response = await client.get(`/mappings/operators?${queryParams.toString()}`);
    
    // Normalize response format
    const result = normalizeListResponse(response, page, pageSize);
    
    logger.debug('[khanzaMappingService]', 'Operator mappings fetched:', result.total);
    return result;
  } catch (error) {
    logger.error('[khanzaMappingService]', 'Failed to list operator mappings:', error.message);
    throw error;
  }
};

/**
 * Get a single operator mapping by ID
 * @param {string} id - Mapping ID
 * @returns {Promise<Object>} Operator mapping
 */
export const getOperatorMapping = async (id) => {
  if (!id) {
    throw new Error('Mapping ID is required');
  }

  logger.info('[khanzaMappingService]', `Getting operator mapping: ${id}`);

  try {
    const client = getClient();
    const response = await client.get(`/mappings/operators/${id}`);
    return response.data || response;
  } catch (error) {
    logger.error('[khanzaMappingService]', 'Failed to get operator mapping:', error.message);
    throw error;
  }
};

/**
 * Get operator mapping by PACS user ID
 * @param {string} pacsUserId - PACS user ID
 * @returns {Promise<Object|null>} Operator mapping or null if not found
 */
export const getOperatorMappingByUserId = async (pacsUserId) => {
  if (!pacsUserId) {
    throw new Error('PACS user ID is required');
  }

  logger.info('[khanzaMappingService]', `Getting operator mapping by user ID: ${pacsUserId}`);

  try {
    const client = getClient();
    const response = await client.get(`/mappings/operators/by-user/${encodeURIComponent(pacsUserId)}`);
    return response.data || response;
  } catch (error) {
    // Return null for 404 (not found)
    if (error.status === 404) {
      logger.debug('[khanzaMappingService]', `Operator mapping not found for user: ${pacsUserId}`);
      return null;
    }
    logger.error('[khanzaMappingService]', 'Failed to get operator mapping by user ID:', error.message);
    throw error;
  }
};

/**
 * Get operator mapping by PACS username
 * @param {string} pacsUsername - PACS username
 * @returns {Promise<Object|null>} Operator mapping or null if not found
 */
export const getOperatorMappingByUsername = async (pacsUsername) => {
  if (!pacsUsername) {
    throw new Error('PACS username is required');
  }

  logger.info('[khanzaMappingService]', `Getting operator mapping by username: ${pacsUsername}`);

  try {
    const client = getClient();
    const response = await client.get(`/mappings/operators/by-username/${encodeURIComponent(pacsUsername)}`);
    return response.data || response;
  } catch (error) {
    // Return null for 404 (not found)
    if (error.status === 404) {
      logger.debug('[khanzaMappingService]', `Operator mapping not found for username: ${pacsUsername}`);
      return null;
    }
    logger.error('[khanzaMappingService]', 'Failed to get operator mapping by username:', error.message);
    throw error;
  }
};

/**
 * Create a new operator mapping
 * @param {Object} mapping - Mapping data
 * @param {string} mapping.pacs_user_id - PACS user ID
 * @param {string} mapping.pacs_username - PACS username
 * @param {string} mapping.khanza_operator_code - Khanza operator code
 * @param {string} mapping.khanza_operator_name - Khanza operator name
 * @param {boolean} mapping.is_active - Whether mapping is active
 * @returns {Promise<Object>} Created operator mapping
 */
export const createOperatorMapping = async (mapping) => {
  // Validate required fields
  try {
    validateOperatorMappingInput(mapping);
  } catch (validationError) {
    handleError(validationError, {
      context: 'create_operator_mapping',
      notify: true,
      log: true,
    });
    throw validationError;
  }

  logger.info('[khanzaMappingService]', 'Creating operator mapping:', mapping.pacs_user_id);

  try {
    const client = getClient();
    const response = await client.post('/mappings/operators', mapping);
    
    logger.info('[khanzaMappingService]', 'Operator mapping created successfully');
    return response.data || response;
  } catch (error) {
    // Handle duplicate error
    if (error.status === 409 || error.message?.includes('duplicate')) {
      const duplicateError = new Error(`Operator mapping for PACS user '${mapping.pacs_user_id}' already exists`);
      duplicateError.code = 'DUPLICATE';
      handleError(duplicateError, {
        context: 'create_operator_mapping',
        notify: true,
        log: true,
      });
      throw duplicateError;
    }
    
    handleError(error, {
      context: 'create_operator_mapping',
      notify: true,
      log: true,
    });
    throw error;
  }
};

/**
 * Update an existing operator mapping
 * @param {string} id - Mapping ID
 * @param {Object} mapping - Updated mapping data
 * @returns {Promise<Object>} Updated operator mapping
 */
export const updateOperatorMapping = async (id, mapping) => {
  if (!id) {
    throw new Error('Mapping ID is required');
  }

  logger.info('[khanzaMappingService]', `Updating operator mapping: ${id}`);

  try {
    const client = getClient();
    const response = await client.put(`/mappings/operators/${id}`, mapping);
    
    logger.info('[khanzaMappingService]', 'Operator mapping updated successfully');
    return response.data || response;
  } catch (error) {
    logger.error('[khanzaMappingService]', 'Failed to update operator mapping:', error.message);
    throw error;
  }
};

/**
 * Delete an operator mapping
 * @param {string} id - Mapping ID
 * @returns {Promise<Object>} Deletion result
 */
export const deleteOperatorMapping = async (id) => {
  if (!id) {
    throw new Error('Mapping ID is required');
  }

  logger.info('[khanzaMappingService]', `Deleting operator mapping: ${id}`);

  try {
    const client = getClient();
    const response = await client.delete(`/mappings/operators/${id}`);
    
    logger.info('[khanzaMappingService]', 'Operator mapping deleted successfully');
    return response;
  } catch (error) {
    logger.error('[khanzaMappingService]', 'Failed to delete operator mapping:', error.message);
    throw error;
  }
};

/**
 * Validate operator mapping input
 * @param {Object} mapping - Mapping data to validate
 * @throws {Error} If validation fails
 */
const validateOperatorMappingInput = (mapping) => {
  const errors = [];

  if (!mapping) {
    throw new Error('Mapping data is required');
  }

  if (!mapping.pacs_user_id || typeof mapping.pacs_user_id !== 'string' || !mapping.pacs_user_id.trim()) {
    errors.push('PACS user ID is required');
  }

  if (!mapping.pacs_username || typeof mapping.pacs_username !== 'string' || !mapping.pacs_username.trim()) {
    errors.push('PACS username is required');
  }

  if (!mapping.khanza_operator_code || typeof mapping.khanza_operator_code !== 'string' || !mapping.khanza_operator_code.trim()) {
    errors.push('Khanza operator code is required');
  }

  if (!mapping.khanza_operator_name || typeof mapping.khanza_operator_name !== 'string' || !mapping.khanza_operator_name.trim()) {
    errors.push('Khanza operator name is required');
  }

  if (errors.length > 0) {
    const error = new Error(`Validation failed: ${errors.join('; ')}`);
    error.code = 'VALIDATION_ERROR';
    error.details = errors;
    throw error;
  }
};


// ============================================
// Export Default
// ============================================

export default {
  // Status
  isKhanzaEnabled,

  // Procedure mappings
  listProcedureMappings,
  getProcedureMapping,
  getProcedureMappingByCode,
  createProcedureMapping,
  updateProcedureMapping,
  deleteProcedureMapping,
  bulkImportProcedureMappings,
  exportProcedureMappings,

  // Doctor mappings
  listDoctorMappings,
  getDoctorMapping,
  getDoctorMappingByCode,
  createDoctorMapping,
  updateDoctorMapping,
  deleteDoctorMapping,

  // Operator mappings
  listOperatorMappings,
  getOperatorMapping,
  getOperatorMappingByUserId,
  getOperatorMappingByUsername,
  createOperatorMapping,
  updateOperatorMapping,
  deleteOperatorMapping,
};
