/**
 * Mock Unified Mapping Service
 * 
 * Provides mock implementation of unified procedure, doctor, and operator mappings
 * for UI development and testing without backend dependency.
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.5, 4.6, 4.7, 5.1, 5.2, 6.1, 6.2, 6.3
 */

import {
  MOCK_PROCEDURE_MAPPINGS,
  MOCK_DOCTOR_MAPPINGS,
  MOCK_OPERATOR_MAPPINGS,
} from './mockData.js';

// Simulate network delay for realistic UX
const simulateNetworkDelay = () => {
  const delay = Math.random() * 500 + 300; // 300-800ms
  return new Promise(resolve => setTimeout(resolve, delay));
};

// In-memory storage for mock data (allows mutations during session)
let procedureMappings = JSON.parse(JSON.stringify(MOCK_PROCEDURE_MAPPINGS));
let doctorMappings = JSON.parse(JSON.stringify(MOCK_DOCTOR_MAPPINGS));
let operatorMappings = JSON.parse(JSON.stringify(MOCK_OPERATOR_MAPPINGS));

// ============================================
// Procedure Mappings
// ============================================

/**
 * List procedure mappings with filtering, searching, and pagination
 * 
 * @param {string} systemId - External system ID
 * @param {Object} params - Query parameters
 * @param {string} params.search - Search by external code or name
 * @param {string} params.modality - Filter by modality
 * @param {number} params.page - Page number (1-indexed)
 * @param {number} params.pageSize - Items per page
 * @returns {Promise<Object>} Paginated result with items and metadata
 */
export async function listProcedureMappings(systemId, params = {}) {
  await simulateNetworkDelay();

  const {
    search = '',
    modality = null,
    page = 1,
    pageSize = 10,
  } = params;

  // Filter by system ID
  let filtered = procedureMappings.filter(m => m.external_system_id === systemId);

  // Filter by modality
  if (modality) {
    filtered = filtered.filter(m => m.modality === modality);
  }

  // Search by external code or name (case-insensitive)
  if (search) {
    const searchLower = search.toLowerCase();
    filtered = filtered.filter(
      m =>
        m.external_code.toLowerCase().includes(searchLower) ||
        m.external_name.toLowerCase().includes(searchLower)
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
 * Get procedure mapping by external code
 * 
 * @param {string} systemId - External system ID
 * @param {string} externalCode - External procedure code
 * @returns {Promise<Object|null>} Mapping or null if not found
 */
export async function getProcedureMappingByCode(systemId, externalCode) {
  await simulateNetworkDelay();

  const mapping = procedureMappings.find(
    m => m.external_system_id === systemId && m.external_code === externalCode
  );
  return mapping || null;
}

/**
 * Create a new procedure mapping
 * 
 * @param {string} systemId - External system ID
 * @param {Object} mappingData - Mapping data
 * @returns {Promise<Object>} Created mapping
 */
export async function createProcedureMapping(systemId, mappingData) {
  await simulateNetworkDelay();

  // Validate required fields
  if (!mappingData.external_code || !mappingData.pacs_code) {
    throw new Error('Missing required fields: external_code, pacs_code');
  }

  // Check for duplicate external code in this system
  if (
    procedureMappings.some(
      m =>
        m.external_system_id === systemId &&
        m.external_code === mappingData.external_code
    )
  ) {
    throw new Error(
      `Procedure mapping with code "${mappingData.external_code}" already exists for this system`
    );
  }

  // Create new mapping
  const newMapping = {
    id: `pm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    external_system_id: systemId,
    ...mappingData,
    is_active: mappingData.is_active !== undefined ? mappingData.is_active : true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  procedureMappings.push(newMapping);
  return newMapping;
}

/**
 * Update an existing procedure mapping
 * 
 * @param {string} id - Mapping ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated mapping
 */
export async function updateProcedureMapping(id, updates) {
  await simulateNetworkDelay();

  const mappingIndex = procedureMappings.findIndex(m => m.id === id);
  if (mappingIndex === -1) {
    throw new Error(`Procedure mapping with ID "${id}" not found`);
  }

  const currentMapping = procedureMappings[mappingIndex];

  // Check for duplicate external code if code is being updated
  if (updates.external_code && updates.external_code !== currentMapping.external_code) {
    if (
      procedureMappings.some(
        m =>
          m.external_system_id === currentMapping.external_system_id &&
          m.external_code === updates.external_code
      )
    ) {
      throw new Error(
        `Procedure mapping with code "${updates.external_code}" already exists for this system`
      );
    }
  }

  // Update mapping
  const updatedMapping = {
    ...currentMapping,
    ...updates,
    id: currentMapping.id,
    external_system_id: currentMapping.external_system_id,
    created_at: currentMapping.created_at,
    updated_at: new Date().toISOString(),
  };

  procedureMappings[mappingIndex] = updatedMapping;
  return updatedMapping;
}

/**
 * Delete a procedure mapping
 * 
 * @param {string} id - Mapping ID
 * @returns {Promise<void>}
 */
export async function deleteProcedureMapping(id) {
  await simulateNetworkDelay();

  const mappingIndex = procedureMappings.findIndex(m => m.id === id);
  if (mappingIndex === -1) {
    throw new Error(`Procedure mapping with ID "${id}" not found`);
  }

  procedureMappings.splice(mappingIndex, 1);
}

/**
 * Bulk import procedure mappings from JSON
 * 
 * @param {string} systemId - External system ID
 * @param {Array} mappingsData - Array of mapping data
 * @returns {Promise<Object>} Import result with success/failure counts
 */
export async function bulkImportProcedureMappings(systemId, mappingsData) {
  await simulateNetworkDelay();

  const results = {
    total: mappingsData.length,
    successful: 0,
    failed: 0,
    errors: [],
  };

  for (const mappingData of mappingsData) {
    try {
      await createProcedureMapping(systemId, mappingData);
      results.successful++;
    } catch (error) {
      results.failed++;
      results.errors.push({
        code: mappingData.external_code,
        error: error.message,
      });
    }
  }

  return results;
}

/**
 * Export procedure mappings to JSON format
 * 
 * @param {string} systemId - External system ID
 * @returns {Promise<Array>} Array of mappings
 */
export async function exportProcedureMappings(systemId) {
  await simulateNetworkDelay();

  const mappings = procedureMappings.filter(m => m.external_system_id === systemId);
  return JSON.parse(JSON.stringify(mappings));
}

/**
 * List unmapped procedures (mock data)
 * 
 * @param {string} systemId - External system ID
 * @param {Object} params - Query parameters
 * @param {string} params.search - Search by code or name
 * @param {number} params.page - Page number (1-indexed)
 * @param {number} params.pageSize - Items per page
 * @returns {Promise<Object>} Paginated result with items and metadata
 */
export async function listUnmappedProcedures(systemId, params = {}) {
  await simulateNetworkDelay();

  const {
    search = '',
    page = 1,
    pageSize = 10,
  } = params;

  // Mock unmapped procedures data
  const mockUnmappedProcedures = [
    {
      id: 'unm-1',
      khanza_code: 'RAD-001',
      khanza_name: 'CT Scan Kepala',
      first_seen_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      last_seen_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      occurrence_count: 5,
    },
    {
      id: 'unm-2',
      khanza_code: 'RAD-002',
      khanza_name: 'MRI Lumbal',
      first_seen_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      last_seen_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      occurrence_count: 3,
    },
    {
      id: 'unm-3',
      khanza_code: 'RAD-003',
      khanza_name: 'USG Abdomen',
      first_seen_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      last_seen_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      occurrence_count: 8,
    },
  ];

  // Filter by search
  let filtered = mockUnmappedProcedures;
  if (search) {
    const searchLower = search.toLowerCase();
    filtered = filtered.filter(
      m =>
        m.khanza_code.toLowerCase().includes(searchLower) ||
        m.khanza_name.toLowerCase().includes(searchLower)
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
    total,
    limit: pageSize,
    offset: startIndex,
    page,
    pageSize,
    totalPages,
  };
}

/**
 * Soft delete unmapped procedure (mock)
 * 
 * @param {string} systemId - External system ID
 * @param {string} unmappedProcedureId - Unmapped procedure ID
 * @returns {Promise<Object>} Success response
 */
export async function deleteUnmappedProcedure(systemId, unmappedProcedureId) {
  await simulateNetworkDelay();
  
  // In mock mode, just return success
  // In real implementation, this would set is_active = false
  return {
    status: 'success',
    message: 'Unmapped procedure marked as inactive',
  };
}

/**
 * Mock listUnmappedPatients - returns empty list for now
 * @param {string} systemId - System ID (not used in mock)
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} Empty result
 */
export async function listUnmappedPatients(systemId, params = {}) {
  await simulateNetworkDelay();
  
  return {
    items: [],
    total: 0,
    limit: params.pageSize || 50,
    offset: params.offset || 0,
  };
}

// ============================================
// Doctor Mappings
// ============================================

/**
 * List doctor mappings with filtering and pagination
 * 
 * @param {string} systemId - External system ID
 * @param {Object} params - Query parameters
 * @param {string} params.search - Search by external code or name
 * @param {number} params.page - Page number (1-indexed)
 * @param {number} params.pageSize - Items per page
 * @returns {Promise<Object>} Paginated result with items and metadata
 */
export async function listDoctorMappings(systemId, params = {}) {
  await simulateNetworkDelay();

  const {
    search = '',
    page = 1,
    pageSize = 10,
  } = params;

  // Filter by system ID
  let filtered = doctorMappings.filter(m => m.external_system_id === systemId);

  // Search by external code or name (case-insensitive)
  if (search) {
    const searchLower = search.toLowerCase();
    filtered = filtered.filter(
      m =>
        m.external_code.toLowerCase().includes(searchLower) ||
        m.external_name.toLowerCase().includes(searchLower)
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
 * Get doctor mapping by external code
 * 
 * @param {string} systemId - External system ID
 * @param {string} externalCode - External doctor code
 * @returns {Promise<Object|null>} Mapping or null if not found
 */
export async function getDoctorMappingByCode(systemId, externalCode) {
  await simulateNetworkDelay();

  const mapping = doctorMappings.find(
    m => m.external_system_id === systemId && m.external_code === externalCode
  );
  return mapping || null;
}

/**
 * Create a new doctor mapping
 * 
 * @param {string} systemId - External system ID
 * @param {Object} mappingData - Mapping data
 * @returns {Promise<Object>} Created mapping
 */
export async function createDoctorMapping(systemId, mappingData) {
  await simulateNetworkDelay();

  // Validate required fields
  if (!mappingData.external_code || !mappingData.pacs_doctor_id) {
    throw new Error('Missing required fields: external_code, pacs_doctor_id');
  }

  // Check for duplicate external code in this system
  if (
    doctorMappings.some(
      m =>
        m.external_system_id === systemId &&
        m.external_code === mappingData.external_code
    )
  ) {
    throw new Error(
      `Doctor mapping with code "${mappingData.external_code}" already exists for this system`
    );
  }

  // Create new mapping
  const newMapping = {
    id: `dm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    external_system_id: systemId,
    ...mappingData,
    auto_created: mappingData.auto_created !== undefined ? mappingData.auto_created : false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  doctorMappings.push(newMapping);
  return newMapping;
}

/**
 * Update an existing doctor mapping
 * 
 * @param {string} id - Mapping ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated mapping
 */
export async function updateDoctorMapping(id, updates) {
  await simulateNetworkDelay();

  const mappingIndex = doctorMappings.findIndex(m => m.id === id);
  if (mappingIndex === -1) {
    throw new Error(`Doctor mapping with ID "${id}" not found`);
  }

  const currentMapping = doctorMappings[mappingIndex];

  // Check for duplicate external code if code is being updated
  if (updates.external_code && updates.external_code !== currentMapping.external_code) {
    if (
      doctorMappings.some(
        m =>
          m.external_system_id === currentMapping.external_system_id &&
          m.external_code === updates.external_code
      )
    ) {
      throw new Error(
        `Doctor mapping with code "${updates.external_code}" already exists for this system`
      );
    }
  }

  // Update mapping
  const updatedMapping = {
    ...currentMapping,
    ...updates,
    id: currentMapping.id,
    external_system_id: currentMapping.external_system_id,
    created_at: currentMapping.created_at,
    updated_at: new Date().toISOString(),
  };

  doctorMappings[mappingIndex] = updatedMapping;
  return updatedMapping;
}

/**
 * Delete a doctor mapping
 * 
 * @param {string} id - Mapping ID
 * @returns {Promise<void>}
 */
export async function deleteDoctorMapping(id) {
  await simulateNetworkDelay();

  const mappingIndex = doctorMappings.findIndex(m => m.id === id);
  if (mappingIndex === -1) {
    throw new Error(`Doctor mapping with ID "${id}" not found`);
  }

  doctorMappings.splice(mappingIndex, 1);
}

// ============================================
// Operator Mappings
// ============================================

/**
 * List operator mappings with filtering and pagination
 * 
 * @param {string} systemId - External system ID
 * @param {Object} params - Query parameters
 * @param {string} params.search - Search by PACS username or external operator name
 * @param {number} params.page - Page number (1-indexed)
 * @param {number} params.pageSize - Items per page
 * @returns {Promise<Object>} Paginated result with items and metadata
 */
export async function listOperatorMappings(systemId, params = {}) {
  await simulateNetworkDelay();

  const {
    search = '',
    page = 1,
    pageSize = 10,
  } = params;

  // Filter by system ID
  let filtered = operatorMappings.filter(m => m.external_system_id === systemId);

  // Search by PACS username or external operator name (case-insensitive)
  if (search) {
    const searchLower = search.toLowerCase();
    filtered = filtered.filter(
      m =>
        m.pacs_username.toLowerCase().includes(searchLower) ||
        m.external_operator_name.toLowerCase().includes(searchLower)
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
 * Get operator mapping by PACS user ID
 * 
 * @param {string} systemId - External system ID
 * @param {string} pacsUserId - PACS user ID
 * @returns {Promise<Object|null>} Mapping or null if not found
 */
export async function getOperatorMappingByUserId(systemId, pacsUserId) {
  await simulateNetworkDelay();

  const mapping = operatorMappings.find(
    m => m.external_system_id === systemId && m.pacs_user_id === pacsUserId
  );
  return mapping || null;
}

/**
 * Create a new operator mapping
 * 
 * @param {string} systemId - External system ID
 * @param {Object} mappingData - Mapping data
 * @returns {Promise<Object>} Created mapping
 */
export async function createOperatorMapping(systemId, mappingData) {
  await simulateNetworkDelay();

  // Validate required fields
  if (!mappingData.pacs_user_id || !mappingData.external_operator_code) {
    throw new Error('Missing required fields: pacs_user_id, external_operator_code');
  }

  // Check for duplicate PACS user ID in this system
  if (
    operatorMappings.some(
      m =>
        m.external_system_id === systemId &&
        m.pacs_user_id === mappingData.pacs_user_id
    )
  ) {
    throw new Error(
      `Operator mapping for PACS user "${mappingData.pacs_user_id}" already exists for this system`
    );
  }

  // Create new mapping
  const newMapping = {
    id: `om-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    external_system_id: systemId,
    ...mappingData,
    is_active: mappingData.is_active !== undefined ? mappingData.is_active : true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  operatorMappings.push(newMapping);
  return newMapping;
}

/**
 * Update an existing operator mapping
 * 
 * @param {string} id - Mapping ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated mapping
 */
export async function updateOperatorMapping(id, updates) {
  await simulateNetworkDelay();

  const mappingIndex = operatorMappings.findIndex(m => m.id === id);
  if (mappingIndex === -1) {
    throw new Error(`Operator mapping with ID "${id}" not found`);
  }

  const currentMapping = operatorMappings[mappingIndex];

  // Check for duplicate PACS user ID if user ID is being updated
  if (updates.pacs_user_id && updates.pacs_user_id !== currentMapping.pacs_user_id) {
    if (
      operatorMappings.some(
        m =>
          m.external_system_id === currentMapping.external_system_id &&
          m.pacs_user_id === updates.pacs_user_id
      )
    ) {
      throw new Error(
        `Operator mapping for PACS user "${updates.pacs_user_id}" already exists for this system`
      );
    }
  }

  // Update mapping
  const updatedMapping = {
    ...currentMapping,
    ...updates,
    id: currentMapping.id,
    external_system_id: currentMapping.external_system_id,
    created_at: currentMapping.created_at,
    updated_at: new Date().toISOString(),
  };

  operatorMappings[mappingIndex] = updatedMapping;
  return updatedMapping;
}

/**
 * Delete an operator mapping
 * 
 * @param {string} id - Mapping ID
 * @returns {Promise<void>}
 */
export async function deleteOperatorMapping(id) {
  await simulateNetworkDelay();

  const mappingIndex = operatorMappings.findIndex(m => m.id === id);
  if (mappingIndex === -1) {
    throw new Error(`Operator mapping with ID "${id}" not found`);
  }

  operatorMappings.splice(mappingIndex, 1);
}

// ============================================
// Utility Functions
// ============================================

/**
 * Reset mock data to initial state
 * 
 * Useful for testing and resetting state between test runs
 * 
 * @returns {void}
 */
export function resetMockData() {
  procedureMappings = JSON.parse(JSON.stringify(MOCK_PROCEDURE_MAPPINGS));
  doctorMappings = JSON.parse(JSON.stringify(MOCK_DOCTOR_MAPPINGS));
  operatorMappings = JSON.parse(JSON.stringify(MOCK_OPERATOR_MAPPINGS));
}

/**
 * Get current mock data (for debugging)
 * 
 * @returns {Object} Current mappings
 */
export function getMockData() {
  return {
    procedureMappings: JSON.parse(JSON.stringify(procedureMappings)),
    doctorMappings: JSON.parse(JSON.stringify(doctorMappings)),
    operatorMappings: JSON.parse(JSON.stringify(operatorMappings)),
  };
}

export default {
  // Procedure Mappings
  listProcedureMappings,
  getProcedureMappingByCode,
  createProcedureMapping,
  updateProcedureMapping,
  deleteProcedureMapping,
  bulkImportProcedureMappings,
  exportProcedureMappings,
  listUnmappedProcedures,
  deleteUnmappedProcedure,

  // Patient Mappings
  listUnmappedPatients,

  // Doctor Mappings
  listDoctorMappings,
  getDoctorMappingByCode,
  createDoctorMapping,
  updateDoctorMapping,
  deleteDoctorMapping,

  // Operator Mappings
  listOperatorMappings,
  getOperatorMappingByUserId,
  createOperatorMapping,
  updateOperatorMapping,
  deleteOperatorMapping,

  // Utilities
  resetMockData,
  getMockData,
};
