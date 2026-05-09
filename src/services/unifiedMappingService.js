/**
 * Unified Mapping Service
 * 
 * Consolidates procedure, doctor, and operator mappings for all external systems.
 * Provides unified CRUD operations with support for multiple SIMRS providers.
 * 
 * Consolidates:
 * - mappingService.js (generic procedure mappings)
 * - khanzaMappingService.js (Khanza-specific mappings)
 * 
 * Requirements: 4.1, 4.2, 4.4, 4.5, 5.1, 5.2, 6.1, 6.2
 */

import { logger } from '../utils/logger';
import { apiClient } from './http';
import { handleError, createError } from './integrationErrorHandler';

// Module name for API client
const MODULE_NAME = 'externalSystems'; // Uses externalSystems module which points to backend-api

// Default pagination settings
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_PAGE = 1;

/**
 * Get API client for mapping operations
 * @returns {Object} API client instance
 */
const getClient = () => {
  return apiClient(MODULE_NAME);
};

// ============================================
// Procedure Mappings CRUD
// ============================================

/**
 * List procedure mappings with pagination and search
 * @param {string} externalSystemId - External system ID
 * @param {Object} params - Query parameters
 * @param {number} params.page - Page number (1-based)
 * @param {number} params.pageSize - Items per page
 * @param {string} params.search - Search query
 * @param {string} params.modality - Filter by modality
 * @param {boolean} params.isActive - Filter by active status
 * @returns {Promise<Object>} Paginated list of procedure mappings
 */
export const listProcedureMappings = async (externalSystemId, params = {}) => {
  if (!externalSystemId) {
    throw createError('External system ID is required', 'VALIDATION_ERROR');
  }

  const {
    page = DEFAULT_PAGE,
    pageSize = DEFAULT_PAGE_SIZE,
    search = '',
    modality = '',
    isActive = null,
  } = params;

  logger.info('[unifiedMappingService]', 'Listing procedure mappings...', { externalSystemId, page, pageSize });

  try {
    const client = getClient();
    const queryParams = new URLSearchParams();
    queryParams.append('page', page.toString());
    queryParams.append('page_size', pageSize.toString());
    
    if (search) queryParams.append('search', search);
    if (modality) queryParams.append('modality', modality);
    if (isActive !== null) queryParams.append('is_active', isActive.toString());

    const response = await client.get(
      `/external-systems/${externalSystemId}/mappings/procedures?${queryParams.toString()}`
    );
    
    logger.debug('[unifiedMappingService]', 'Raw backend response:', { 
      responseType: typeof response,
      hasItems: 'items' in response,
      hasMappings: 'mappings' in response,
      firstItem: response.items?.[0] || response.mappings?.[0],
      firstItemId: response.items?.[0]?.id || response.mappings?.[0]?.id
    });
    
    const normalized = normalizeListResponse(response, page, pageSize);
    
    logger.debug('[unifiedMappingService]', 'After normalization:', {
      itemsCount: normalized.items?.length,
      firstNormalizedItem: normalized.items?.[0],
      firstNormalizedId: normalized.items?.[0]?.id
    });
    
    // Apply procedure-specific field mapping
    const result = {
      ...normalized,
      items: normalized.items.map(normalizeProcedureMapping),
    };
    
    logger.debug('[unifiedMappingService]', 'After field mapping:', {
      firstMappedItem: result.items?.[0],
      firstMappedId: result.items?.[0]?.id
    });
    
    return result;
  } catch (error) {
    logger.error('[unifiedMappingService]', 'Failed to list procedure mappings:', error.message);
    throw error;
  }
};

/**
 * Get a single procedure mapping by ID
 * @param {string} externalSystemId - External system ID
 * @param {string} mappingId - Mapping ID
 * @returns {Promise<Object>} Procedure mapping
 */
export const getProcedureMapping = async (externalSystemId, mappingId) => {
  if (!externalSystemId || !mappingId) {
    throw createError('External system ID and mapping ID are required', 'VALIDATION_ERROR');
  }

  logger.info('[unifiedMappingService]', `Getting procedure mapping: ${mappingId}`);

  try {
    const client = getClient();
    const response = await client.get(
      `/external-systems/${externalSystemId}/mappings/procedures/${mappingId}`
    );
    return response.data || response;
  } catch (error) {
    logger.error('[unifiedMappingService]', 'Failed to get procedure mapping:', error.message);
    throw error;
  }
};

/**
 * Get procedure mapping by external code
 * @param {string} externalSystemId - External system ID
 * @param {string} externalCode - External procedure code
 * @returns {Promise<Object|null>} Procedure mapping or null if not found
 */
export const getProcedureMappingByCode = async (externalSystemId, externalCode) => {
  if (!externalSystemId || !externalCode) {
    throw createError('External system ID and code are required', 'VALIDATION_ERROR');
  }

  logger.debug('[unifiedMappingService]', `Getting procedure mapping by code: ${externalCode}`);

  try {
    const client = getClient();
    const response = await client.get(
      `/external-systems/${externalSystemId}/mappings/procedures/by-code/${encodeURIComponent(externalCode)}`
    );
    return response.data || response;
  } catch (error) {
    if (error.status === 404) {
      logger.debug('[unifiedMappingService]', `Procedure mapping not found for code: ${externalCode}`);
      return null;
    }
    logger.error('[unifiedMappingService]', 'Failed to get procedure mapping by code:', error.message);
    throw error;
  }
};

/**
 * Create a new procedure mapping
 * @param {string} externalSystemId - External system ID
 * @param {Object} mapping - Mapping data
 * @returns {Promise<Object>} Created procedure mapping
 */
export const createProcedureMapping = async (externalSystemId, mapping) => {
  if (!externalSystemId) {
    throw createError('External system ID is required', 'VALIDATION_ERROR');
  }

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

  logger.info('[unifiedMappingService]', 'Creating procedure mapping:', mapping.external_code);

  try {
    const client = getClient();
    const response = await client.post(
      `/external-systems/${externalSystemId}/mappings/procedures`,
      mapping
    );
    
    logger.info('[unifiedMappingService]', 'Procedure mapping created successfully');
    return response.data || response;
  } catch (error) {
    if (error.status === 409 || error.message?.includes('duplicate')) {
      const duplicateError = createError(
        `Procedure mapping with code '${mapping.external_code}' already exists`,
        'DUPLICATE'
      );
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
 * @param {string} externalSystemId - External system ID
 * @param {string} mappingId - Mapping ID
 * @param {Object} mapping - Updated mapping data
 * @returns {Promise<Object>} Updated procedure mapping
 */
export const updateProcedureMapping = async (externalSystemId, mappingId, mapping) => {
  if (!externalSystemId || !mappingId) {
    throw createError('External system ID and mapping ID are required', 'VALIDATION_ERROR');
  }

  logger.info('[unifiedMappingService]', `Updating procedure mapping: ${mappingId}`, {
    externalSystemId,
    mappingId,
    mappingIdType: typeof mappingId
  });

  try {
    const client = getClient();
    
    // First, verify the mapping exists
    try {
      logger.debug('[unifiedMappingService]', 'Verifying mapping exists before update...');
      await client.get(`/external-systems/${externalSystemId}/mappings/procedures/${mappingId}`);
    } catch (verifyError) {
      if (verifyError.status === 404) {
        const notFoundError = createError(
          `Mapping with ID '${mappingId}' not found. The data may be outdated. Please refresh and try again.`,
          'NOT_FOUND'
        );
        handleError(notFoundError, {
          context: 'update_procedure_mapping_verify',
          notify: true,
          log: true,
        });
        throw notFoundError;
      }
      // If it's another error, continue with the update attempt
      logger.warn('[unifiedMappingService]', 'Verification failed, proceeding with update:', verifyError.message);
    }
    
    const response = await client.put(
      `/external-systems/${externalSystemId}/mappings/procedures/${mappingId}`,
      mapping
    );
    
    logger.info('[unifiedMappingService]', 'Procedure mapping updated successfully');
    return response.data || response;
  } catch (error) {
    if (error.status === 404) {
      const notFoundError = createError(
        `Mapping with ID '${mappingId}' not found. The data may be outdated. Please refresh the page and try again.`,
        'NOT_FOUND'
      );
      handleError(notFoundError, {
        context: 'update_procedure_mapping',
        notify: true,
        log: true,
      });
      throw notFoundError;
    }
    
    logger.error('[unifiedMappingService]', 'Failed to update procedure mapping:', error.message);
    handleError(error, {
      context: 'update_procedure_mapping',
      notify: true,
      log: true,
    });
    throw error;
  }
};

/**
 * Delete a procedure mapping
 * @param {string} externalSystemId - External system ID
 * @param {string} mappingId - Mapping ID
 * @returns {Promise<Object>} Deletion result
 */
export const deleteProcedureMapping = async (externalSystemId, mappingId) => {
  if (!externalSystemId || !mappingId) {
    throw createError('External system ID and mapping ID are required', 'VALIDATION_ERROR');
  }

  logger.info('[unifiedMappingService]', `Deleting procedure mapping: ${mappingId}`);

  try {
    const client = getClient();
    const response = await client.delete(
      `/external-systems/${externalSystemId}/mappings/procedures/${mappingId}`
    );
    
    logger.info('[unifiedMappingService]', 'Procedure mapping deleted successfully');
    return response;
  } catch (error) {
    logger.error('[unifiedMappingService]', 'Failed to delete procedure mapping:', error.message);
    throw error;
  }
};

/**
 * Bulk import procedure mappings
 * @param {string} externalSystemId - External system ID
 * @param {Array<Object>} mappings - Array of mapping data
 * @returns {Promise<Object>} Import result
 */
export const bulkImportProcedureMappings = async (externalSystemId, mappings) => {
  if (!externalSystemId) {
    throw createError('External system ID is required', 'VALIDATION_ERROR');
  }

  if (!Array.isArray(mappings) || mappings.length === 0) {
    throw createError('Mappings array is required and must not be empty', 'VALIDATION_ERROR');
  }

  logger.info('[unifiedMappingService]', `Bulk importing ${mappings.length} procedure mappings...`);

  try {
    const client = getClient();
    const response = await client.post(
      `/external-systems/${externalSystemId}/mappings/procedures/bulk`,
      { mappings }
    );
    
    logger.info('[unifiedMappingService]', 'Bulk import completed');
    return response.data || response;
  } catch (error) {
    logger.error('[unifiedMappingService]', 'Bulk import failed:', error.message);
    throw error;
  }
};

/**
 * Export procedure mappings
 * @param {string} externalSystemId - External system ID
 * @returns {Promise<Array>} All procedure mappings
 */
export const exportProcedureMappings = async (externalSystemId) => {
  if (!externalSystemId) {
    throw createError('External system ID is required', 'VALIDATION_ERROR');
  }

  logger.info('[unifiedMappingService]', 'Exporting procedure mappings...');

  const allMappings = [];
  let page = 1;
  const pageSize = 100;
  let hasMore = true;

  while (hasMore) {
    const result = await listProcedureMappings(externalSystemId, { page, pageSize });
    allMappings.push(...result.items);
    hasMore = page < result.totalPages;
    page++;
  }

  logger.info('[unifiedMappingService]', `Exported ${allMappings.length} procedure mappings`);
  return allMappings;
};

/**
 * List unmapped procedures (procedures that failed to import due to missing mappings)
 * @param {string} externalSystemId - External system ID
 * @param {Object} params - Query parameters
 * @param {number} params.page - Page number (1-based)
 * @param {number} params.pageSize - Items per page
 * @param {string} params.search - Search query
 * @returns {Promise<Object>} Paginated list of unmapped procedures
 */
export const listUnmappedProcedures = async (externalSystemId, params = {}) => {
  if (!externalSystemId) {
    throw createError('External system ID is required', 'VALIDATION_ERROR');
  }

  const {
    page = DEFAULT_PAGE,
    pageSize = 50,
    search = '',
  } = params;

  logger.info('[unifiedMappingService]', 'Listing unmapped procedures...', { externalSystemId, page, pageSize });

  try {
    // Use Khanza-specific endpoint for unmapped procedures
    const client = apiClient('khanza'); // Use khanza module instead of externalSystems
    const queryParams = new URLSearchParams();
    queryParams.append('limit', pageSize.toString());
    queryParams.append('offset', ((page - 1) * pageSize).toString());
    
    if (search) queryParams.append('search', search);

    const response = await client.get(
      `/mappings/procedures/unmapped?${queryParams.toString()}`
    );
    
    logger.debug('[unifiedMappingService]', 'Unmapped procedures response:', {
      itemsCount: response.items?.length,
      total: response.total
    });
    
    // Normalize response to match our pagination format
    const totalPages = Math.ceil((response.total || 0) / pageSize);
    
    return {
      items: response.items || [],
      total: response.total || 0,
      limit: response.limit || pageSize,
      offset: response.offset || 0,
      page: page,
      pageSize: pageSize,
      totalPages: totalPages,
    };
  } catch (error) {
    logger.error('[unifiedMappingService]', 'Failed to list unmapped procedures:', error.message);
    throw error;
  }
};

/**
 * List unmapped patients (imported via orders but no standalone patient record)
 * @param {string} externalSystemId - External system ID 
 * @param {Object} params - Query params
 * @param {number} params.page - Page number (1-based)
 * @param {number} params.pageSize - Items per page
 * @param {string} params.search - Search query
 * @returns {Promise<Object>} Paginated list of unmapped patients
 */
export const listUnmappedPatients = async (externalSystemId, params = {}) => {
  if (!externalSystemId) {
    throw createError('External system ID is required', 'VALIDATION_ERROR');
  }

  const {
    page = DEFAULT_PAGE,
    pageSize = 50,
    search = '',
  } = params;

  logger.info('[unifiedMappingService]', 'Listing unmapped patients...', { externalSystemId, page, pageSize });

  try {
    const client = apiClient('khanza');
    const queryParams = new URLSearchParams();
    queryParams.append('limit', pageSize.toString());
    queryParams.append('offset', ((page - 1) * pageSize).toString());
    
    if (search) queryParams.append('search', search);

    const response = await client.get(
      `/mappings/patients/unmapped?${queryParams.toString()}`
    );
    
    logger.debug('[unifiedMappingService]', 'Unmapped patients response:', {
      itemsCount: response.items?.length,
      total: response.total
    });
    
    const totalPages = Math.ceil((response.total || 0) / pageSize);
    
    return {
      items: response.items || [],
      total: response.total || 0,
      limit: response.limit || pageSize,
      offset: response.offset || 0,
      page: page,
      pageSize: pageSize,
      totalPages: totalPages,
    };
  } catch (error) {
    logger.error('[unifiedMappingService]', 'Failed to list unmapped patients:', error.message);
    throw error;
  }
};

/**
 * Soft delete an unmapped procedure (set is_active = false)
 * Called after a mapping is successfully created for this procedure
 * @param {string} externalSystemId - External system ID (not used but kept for consistency)
 * @param {string} unmappedProcedureId - Unmapped procedure ID
 * @returns {Promise<Object>} Deletion result
 */
export const deleteUnmappedProcedure = async (externalSystemId, unmappedProcedureId) => {
  if (!unmappedProcedureId) {
    throw createError('Unmapped procedure ID is required', 'VALIDATION_ERROR');
  }

  logger.info('[unifiedMappingService]', `Soft deleting unmapped procedure: ${unmappedProcedureId}`);

  try {
    const client = apiClient('khanza');
    const response = await client.delete(
      `/mappings/procedures/unmapped/${unmappedProcedureId}`
    );
    
    logger.info('[unifiedMappingService]', 'Unmapped procedure soft deleted successfully');
    return response;
  } catch (error) {
    logger.error('[unifiedMappingService]', 'Failed to soft delete unmapped procedure:', error.message);
    throw error;
  }
};


// ============================================
// Doctor Mappings CRUD
// ============================================

/**
 * List doctor mappings with pagination and search
 * @param {string} externalSystemId - External system ID
 * @param {Object} params - Query parameters
 * @param {number} params.page - Page number (1-based)
 * @param {number} params.pageSize - Items per page
 * @param {string} params.search - Search query
 * @param {boolean} params.autoCreated - Filter by auto-created status
 * @returns {Promise<Object>} Paginated list of doctor mappings
 */
export const listDoctorMappings = async (externalSystemId, params = {}) => {
  if (!externalSystemId) {
    throw createError('External system ID is required', 'VALIDATION_ERROR');
  }

  const {
    page = DEFAULT_PAGE,
    pageSize = DEFAULT_PAGE_SIZE,
    search = '',
    autoCreated = null,
  } = params;

  logger.info('[unifiedMappingService]', 'Listing doctor mappings...', { externalSystemId, page, pageSize });

  try {
    const client = getClient();
    const queryParams = new URLSearchParams();
    queryParams.append('page', page.toString());
    queryParams.append('page_size', pageSize.toString());
    
    if (search) queryParams.append('search', search);
    if (autoCreated !== null) queryParams.append('auto_created', autoCreated.toString());

    const response = await client.get(
      `/external-systems/${externalSystemId}/mappings/doctors?${queryParams.toString()}`
    );
    
    return normalizeListResponse(response, page, pageSize);
  } catch (error) {
    logger.error('[unifiedMappingService]', 'Failed to list doctor mappings:', error.message);
    throw error;
  }
};

/**
 * Get a single doctor mapping by ID
 * @param {string} externalSystemId - External system ID
 * @param {string} mappingId - Mapping ID
 * @returns {Promise<Object>} Doctor mapping
 */
export const getDoctorMapping = async (externalSystemId, mappingId) => {
  if (!externalSystemId || !mappingId) {
    throw createError('External system ID and mapping ID are required', 'VALIDATION_ERROR');
  }

  logger.info('[unifiedMappingService]', `Getting doctor mapping: ${mappingId}`);

  try {
    const client = getClient();
    const response = await client.get(
      `/external-systems/${externalSystemId}/mappings/doctors/${mappingId}`
    );
    return response.data || response;
  } catch (error) {
    logger.error('[unifiedMappingService]', 'Failed to get doctor mapping:', error.message);
    throw error;
  }
};

/**
 * Get doctor mapping by external code
 * @param {string} externalSystemId - External system ID
 * @param {string} externalCode - External doctor code
 * @returns {Promise<Object|null>} Doctor mapping or null if not found
 */
export const getDoctorMappingByCode = async (externalSystemId, externalCode) => {
  if (!externalSystemId || !externalCode) {
    throw createError('External system ID and code are required', 'VALIDATION_ERROR');
  }

  logger.debug('[unifiedMappingService]', `Getting doctor mapping by code: ${externalCode}`);

  try {
    const client = getClient();
    const response = await client.get(
      `/external-systems/${externalSystemId}/mappings/doctors/by-code/${encodeURIComponent(externalCode)}`
    );
    return response.data || response;
  } catch (error) {
    if (error.status === 404) {
      logger.debug('[unifiedMappingService]', `Doctor mapping not found for code: ${externalCode}`);
      return null;
    }
    logger.error('[unifiedMappingService]', 'Failed to get doctor mapping by code:', error.message);
    throw error;
  }
};

/**
 * Create a new doctor mapping
 * @param {string} externalSystemId - External system ID
 * @param {Object} mapping - Mapping data
 * @returns {Promise<Object>} Created doctor mapping
 */
export const createDoctorMapping = async (externalSystemId, mapping) => {
  if (!externalSystemId) {
    throw createError('External system ID is required', 'VALIDATION_ERROR');
  }

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

  logger.info('[unifiedMappingService]', 'Creating doctor mapping:', mapping.external_code);

  try {
    const client = getClient();
    const response = await client.post(
      `/external-systems/${externalSystemId}/mappings/doctors`,
      mapping
    );
    
    logger.info('[unifiedMappingService]', 'Doctor mapping created successfully');
    return response.data || response;
  } catch (error) {
    if (error.status === 409 || error.message?.includes('duplicate')) {
      const duplicateError = createError(
        `Doctor mapping with code '${mapping.external_code}' already exists`,
        'DUPLICATE'
      );
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
 * @param {string} externalSystemId - External system ID
 * @param {string} mappingId - Mapping ID
 * @param {Object} mapping - Updated mapping data
 * @returns {Promise<Object>} Updated doctor mapping
 */
export const updateDoctorMapping = async (externalSystemId, mappingId, mapping) => {
  if (!externalSystemId || !mappingId) {
    throw createError('External system ID and mapping ID are required', 'VALIDATION_ERROR');
  }

  logger.info('[unifiedMappingService]', `Updating doctor mapping: ${mappingId}`);

  try {
    const client = getClient();
    const response = await client.put(
      `/external-systems/${externalSystemId}/mappings/doctors/${mappingId}`,
      mapping
    );
    
    logger.info('[unifiedMappingService]', 'Doctor mapping updated successfully');
    return response.data || response;
  } catch (error) {
    logger.error('[unifiedMappingService]', 'Failed to update doctor mapping:', error.message);
    throw error;
  }
};

/**
 * Delete a doctor mapping
 * @param {string} externalSystemId - External system ID
 * @param {string} mappingId - Mapping ID
 * @returns {Promise<Object>} Deletion result
 */
export const deleteDoctorMapping = async (externalSystemId, mappingId) => {
  if (!externalSystemId || !mappingId) {
    throw createError('External system ID and mapping ID are required', 'VALIDATION_ERROR');
  }

  logger.info('[unifiedMappingService]', `Deleting doctor mapping: ${mappingId}`);

  try {
    const client = getClient();
    const response = await client.delete(
      `/external-systems/${externalSystemId}/mappings/doctors/${mappingId}`
    );
    
    logger.info('[unifiedMappingService]', 'Doctor mapping deleted successfully');
    return response;
  } catch (error) {
    logger.error('[unifiedMappingService]', 'Failed to delete doctor mapping:', error.message);
    throw error;
  }
};


// ============================================
// Operator Mappings CRUD
// ============================================

/**
 * List operator mappings with pagination and search
 * @param {string} externalSystemId - External system ID
 * @param {Object} params - Query parameters
 * @param {number} params.page - Page number (1-based)
 * @param {number} params.pageSize - Items per page
 * @param {string} params.search - Search query
 * @param {boolean} params.isActive - Filter by active status
 * @returns {Promise<Object>} Paginated list of operator mappings
 */
export const listOperatorMappings = async (externalSystemId, params = {}) => {
  if (!externalSystemId) {
    throw createError('External system ID is required', 'VALIDATION_ERROR');
  }

  const {
    page = DEFAULT_PAGE,
    pageSize = DEFAULT_PAGE_SIZE,
    search = '',
    isActive = null,
  } = params;

  logger.info('[unifiedMappingService]', 'Listing operator mappings...', { externalSystemId, page, pageSize });

  try {
    const client = getClient();
    const queryParams = new URLSearchParams();
    queryParams.append('page', page.toString());
    queryParams.append('page_size', pageSize.toString());
    
    if (search) queryParams.append('search', search);
    if (isActive !== null) queryParams.append('is_active', isActive.toString());

    const response = await client.get(
      `/external-systems/${externalSystemId}/mappings/operators?${queryParams.toString()}`
    );
    
    return normalizeListResponse(response, page, pageSize);
  } catch (error) {
    logger.error('[unifiedMappingService]', 'Failed to list operator mappings:', error.message);
    throw error;
  }
};

/**
 * Get a single operator mapping by ID
 * @param {string} externalSystemId - External system ID
 * @param {string} mappingId - Mapping ID
 * @returns {Promise<Object>} Operator mapping
 */
export const getOperatorMapping = async (externalSystemId, mappingId) => {
  if (!externalSystemId || !mappingId) {
    throw createError('External system ID and mapping ID are required', 'VALIDATION_ERROR');
  }

  logger.info('[unifiedMappingService]', `Getting operator mapping: ${mappingId}`);

  try {
    const client = getClient();
    const response = await client.get(
      `/external-systems/${externalSystemId}/mappings/operators/${mappingId}`
    );
    return response.data || response;
  } catch (error) {
    logger.error('[unifiedMappingService]', 'Failed to get operator mapping:', error.message);
    throw error;
  }
};

/**
 * Get operator mapping by PACS user ID
 * @param {string} externalSystemId - External system ID
 * @param {string} pacsUserId - PACS user ID
 * @returns {Promise<Object|null>} Operator mapping or null if not found
 */
export const getOperatorMappingByUserId = async (externalSystemId, pacsUserId) => {
  if (!externalSystemId || !pacsUserId) {
    throw createError('External system ID and PACS user ID are required', 'VALIDATION_ERROR');
  }

  logger.debug('[unifiedMappingService]', `Getting operator mapping by user ID: ${pacsUserId}`);

  try {
    const client = getClient();
    const response = await client.get(
      `/external-systems/${externalSystemId}/mappings/operators/by-user/${encodeURIComponent(pacsUserId)}`
    );
    return response.data || response;
  } catch (error) {
    if (error.status === 404) {
      logger.debug('[unifiedMappingService]', `Operator mapping not found for user: ${pacsUserId}`);
      return null;
    }
    logger.error('[unifiedMappingService]', 'Failed to get operator mapping by user ID:', error.message);
    throw error;
  }
};

/**
 * Create a new operator mapping
 * @param {string} externalSystemId - External system ID
 * @param {Object} mapping - Mapping data
 * @returns {Promise<Object>} Created operator mapping
 */
export const createOperatorMapping = async (externalSystemId, mapping) => {
  if (!externalSystemId) {
    throw createError('External system ID is required', 'VALIDATION_ERROR');
  }

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

  logger.info('[unifiedMappingService]', 'Creating operator mapping:', mapping.pacs_user_id);

  try {
    const client = getClient();
    const response = await client.post(
      `/external-systems/${externalSystemId}/mappings/operators`,
      mapping
    );
    
    logger.info('[unifiedMappingService]', 'Operator mapping created successfully');
    return response.data || response;
  } catch (error) {
    if (error.status === 409 || error.message?.includes('duplicate')) {
      const duplicateError = createError(
        `Operator mapping for PACS user '${mapping.pacs_user_id}' already exists`,
        'DUPLICATE'
      );
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
 * @param {string} externalSystemId - External system ID
 * @param {string} mappingId - Mapping ID
 * @param {Object} mapping - Updated mapping data
 * @returns {Promise<Object>} Updated operator mapping
 */
export const updateOperatorMapping = async (externalSystemId, mappingId, mapping) => {
  if (!externalSystemId || !mappingId) {
    throw createError('External system ID and mapping ID are required', 'VALIDATION_ERROR');
  }

  logger.info('[unifiedMappingService]', `Updating operator mapping: ${mappingId}`);

  try {
    const client = getClient();
    const response = await client.put(
      `/external-systems/${externalSystemId}/mappings/operators/${mappingId}`,
      mapping
    );
    
    logger.info('[unifiedMappingService]', 'Operator mapping updated successfully');
    return response.data || response;
  } catch (error) {
    logger.error('[unifiedMappingService]', 'Failed to update operator mapping:', error.message);
    throw error;
  }
};

/**
 * Delete an operator mapping
 * @param {string} externalSystemId - External system ID
 * @param {string} mappingId - Mapping ID
 * @returns {Promise<Object>} Deletion result
 */
export const deleteOperatorMapping = async (externalSystemId, mappingId) => {
  if (!externalSystemId || !mappingId) {
    throw createError('External system ID and mapping ID are required', 'VALIDATION_ERROR');
  }

  logger.info('[unifiedMappingService]', `Deleting operator mapping: ${mappingId}`);

  try {
    const client = getClient();
    const response = await client.delete(
      `/external-systems/${externalSystemId}/mappings/operators/${mappingId}`
    );
    
    logger.info('[unifiedMappingService]', 'Operator mapping deleted successfully');
    return response;
  } catch (error) {
    logger.error('[unifiedMappingService]', 'Failed to delete operator mapping:', error.message);
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

  if (!mapping || typeof mapping !== 'object') {
    throw createError('Mapping data is required', 'VALIDATION_ERROR');
  }

  if (!mapping.external_code || typeof mapping.external_code !== 'string' || !mapping.external_code.trim()) {
    errors.push('External code is required');
  }

  if (!mapping.external_name || typeof mapping.external_name !== 'string' || !mapping.external_name.trim()) {
    errors.push('External name is required');
  }

  if (!mapping.pacs_code || typeof mapping.pacs_code !== 'string' || !mapping.pacs_code.trim()) {
    errors.push('PACS code is required');
  }

  if (!mapping.pacs_name || typeof mapping.pacs_name !== 'string' || !mapping.pacs_name.trim()) {
    errors.push('PACS name is required');
  }

  if (mapping.modality) {
    const validModalities = ['CR', 'CT', 'MR', 'US', 'XA', 'NM', 'PT', 'MG', 'DX', 'RF', 'OT'];
    if (!validModalities.includes(mapping.modality.toUpperCase())) {
      errors.push(`Invalid modality. Valid values: ${validModalities.join(', ')}`);
    }
  }

  if (errors.length > 0) {
    const error = createError(`Validation failed: ${errors.join('; ')}`, 'VALIDATION_ERROR', errors);
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

  if (!mapping || typeof mapping !== 'object') {
    throw createError('Mapping data is required', 'VALIDATION_ERROR');
  }

  if (!mapping.external_code || typeof mapping.external_code !== 'string' || !mapping.external_code.trim()) {
    errors.push('External code is required');
  }

  if (!mapping.external_name || typeof mapping.external_name !== 'string' || !mapping.external_name.trim()) {
    errors.push('External name is required');
  }

  if (mapping.pacs_doctor_id !== undefined && mapping.pacs_doctor_id !== null) {
    if (typeof mapping.pacs_doctor_id !== 'string' || !mapping.pacs_doctor_id.trim()) {
      errors.push('PACS doctor ID must be a non-empty string if provided');
    }
  }

  if (errors.length > 0) {
    const error = createError(`Validation failed: ${errors.join('; ')}`, 'VALIDATION_ERROR', errors);
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

  if (!mapping || typeof mapping !== 'object') {
    throw createError('Mapping data is required', 'VALIDATION_ERROR');
  }

  if (!mapping.pacs_user_id || typeof mapping.pacs_user_id !== 'string' || !mapping.pacs_user_id.trim()) {
    errors.push('PACS user ID is required');
  }

  if (!mapping.pacs_username || typeof mapping.pacs_username !== 'string' || !mapping.pacs_username.trim()) {
    errors.push('PACS username is required');
  }

  if (!mapping.external_operator_code || typeof mapping.external_operator_code !== 'string' || !mapping.external_operator_code.trim()) {
    errors.push('External operator code is required');
  }

  if (!mapping.external_operator_name || typeof mapping.external_operator_name !== 'string' || !mapping.external_operator_name.trim()) {
    errors.push('External operator name is required');
  }

  if (errors.length > 0) {
    const error = createError(`Validation failed: ${errors.join('; ')}`, 'VALIDATION_ERROR', errors);
    throw error;
  }
};

// ============================================
// Response Normalization Helpers
// ============================================

/**
 * Normalize procedure mapping fields from backend format
 * @param {Object} mapping - Raw mapping from backend
 * @returns {Object} Normalized mapping
 */
const normalizeProcedureMapping = (mapping) => {
  if (!mapping) return mapping;
  
  return {
    ...mapping,
    // Map pacs_modality to modality for frontend compatibility
    modality: mapping.modality || mapping.pacs_modality || '',
  };
};

/**
 * Normalize list response to consistent pagination format
 * @param {Object|Array} response - API response
 * @param {number} page - Current page
 * @param {number} pageSize - Page size
 * @returns {Object} Normalized response with pagination info
 */
const normalizeListResponse = (response, page, pageSize) => {
  // Check for 'mappings' field (backend uses this for procedure/doctor/operator mappings)
  if (response && typeof response === 'object' && 'mappings' in response) {
    return {
      items: response.mappings || [],
      total: response.total || response.mappings?.length || 0,
      page: response.page || page,
      pageSize: response.page_size || response.pageSize || pageSize,
      totalPages: response.total_pages || response.totalPages || Math.ceil((response.total || 0) / pageSize),
    };
  }

  // Check for 'items' field (standard format)
  if (response && typeof response === 'object' && 'items' in response) {
    return {
      items: response.items || [],
      total: response.total || response.items?.length || 0,
      page: response.page || page,
      pageSize: response.page_size || response.pageSize || pageSize,
      totalPages: response.total_pages || response.totalPages || Math.ceil((response.total || 0) / pageSize),
    };
  }

  if (response && response.data && Array.isArray(response.data)) {
    return {
      items: response.data,
      total: response.total || response.data.length,
      page: response.page || page,
      pageSize: response.page_size || response.pageSize || pageSize,
      totalPages: response.total_pages || response.totalPages || Math.ceil((response.total || response.data.length) / pageSize),
    };
  }

  if (Array.isArray(response)) {
    return {
      items: response,
      total: response.length,
      page: page,
      pageSize: pageSize,
      totalPages: Math.ceil(response.length / pageSize),
    };
  }

  return {
    items: [],
    total: 0,
    page: page,
    pageSize: pageSize,
    totalPages: 0,
  };
};

// ============================================
// Export Default
// ============================================

export default {
  // Procedure Mappings
  listProcedureMappings,
  getProcedureMapping,
  getProcedureMappingByCode,
  createProcedureMapping,
  updateProcedureMapping,
  deleteProcedureMapping,
  bulkImportProcedureMappings,
  exportProcedureMappings,

  // Doctor Mappings
  listDoctorMappings,
  getDoctorMapping,
  getDoctorMappingByCode,
  createDoctorMapping,
  updateDoctorMapping,
  deleteDoctorMapping,

  // Operator Mappings
  listOperatorMappings,
  getOperatorMapping,
  getOperatorMappingByUserId,
  createOperatorMapping,
  updateOperatorMapping,
  deleteOperatorMapping,
};
