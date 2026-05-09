/**
 * Mock Import Service
 * 
 * Provides mock implementation of order import functionality for UI development
 * and testing without backend dependency.
 * 
 * Requirements: 7.1, 7.2, 7.4, 8.1, 8.4, 9.1, 9.2, 10.1, 10.2, 10.5
 */

import {
  MOCK_SIMRS_ORDERS,
  MOCK_IMPORT_HISTORY,
  MOCK_PROCEDURE_MAPPINGS,
  MOCK_PACS_PATIENTS,
} from './mockData.js';

// Simulate network delay for realistic UX
const simulateNetworkDelay = () => {
  const delay = Math.random() * 500 + 300; // 300-800ms
  return new Promise(resolve => setTimeout(resolve, delay));
};

// In-memory storage for mock data (allows mutations during session)
let orders = JSON.parse(JSON.stringify(MOCK_SIMRS_ORDERS));
let importHistory = JSON.parse(JSON.stringify(MOCK_IMPORT_HISTORY));

// ============================================
// Order Listing and Filtering
// ============================================

/**
 * List orders from SIMRS with date filter and search
 * 
 * @param {string} systemId - External system ID
 * @param {Object} params - Query parameters
 * @param {string} params.startDate - Start date (ISO format)
 * @param {string} params.endDate - End date (ISO format)
 * @param {string} params.search - Search by order number, patient name, or MRN
 * @param {number} params.page - Page number (1-indexed)
 * @param {number} params.pageSize - Items per page
 * @returns {Promise<Object>} Paginated result with items and metadata
 */
export async function listOrders(systemId, params = {}) {
  await simulateNetworkDelay();

  const {
    startDate = null,
    endDate = null,
    search = '',
    page = 1,
    pageSize = 10,
  } = params;

  // Filter by system ID
  let filtered = orders.filter(o => o.external_system_id === systemId);

  // Filter by date range
  if (startDate || endDate) {
    filtered = filtered.filter(o => {
      const orderDate = new Date(o.request_date);
      if (startDate) {
        const start = new Date(startDate);
        if (orderDate < start) return false;
      }
      if (endDate) {
        const end = new Date(endDate);
        // Set end date to end of day
        end.setHours(23, 59, 59, 999);
        if (orderDate > end) return false;
      }
      return true;
    });
  }

  // Search by order number, patient name, or MRN (case-insensitive)
  if (search) {
    const searchLower = search.toLowerCase();
    filtered = filtered.filter(
      o =>
        o.order_number.toLowerCase().includes(searchLower) ||
        o.patient_name.toLowerCase().includes(searchLower) ||
        o.patient_mrn.toLowerCase().includes(searchLower)
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
 * Get a single order by ID
 * 
 * @param {string} systemId - External system ID
 * @param {string} orderId - Order ID
 * @returns {Promise<Object|null>} Order or null if not found
 */
export async function getOrder(systemId, orderId) {
  await simulateNetworkDelay();

  const order = orders.find(o => o.external_system_id === systemId && o.id === orderId);
  return order || null;
}

// ============================================
// Order Import
// ============================================

/**
 * Validate an order before import
 * 
 * Checks if procedure mapping exists and other validation rules
 * 
 * @param {string} systemId - External system ID
 * @param {string} orderId - Order ID
 * @returns {Promise<Object>} Validation result with success flag and errors
 */
export async function validateOrder(systemId, orderId) {
  await simulateNetworkDelay();

  const order = orders.find(o => o.external_system_id === systemId && o.id === orderId);
  if (!order) {
    return {
      success: false,
      errors: ['Order not found'],
    };
  }

  const errors = [];

  // Check if procedure mapping exists
  const procedureMapping = MOCK_PROCEDURE_MAPPINGS.find(
    m => m.external_system_id === systemId && m.external_code === order.procedure_code
  );
  if (!procedureMapping) {
    errors.push(`Procedure code "${order.procedure_code}" is not mapped to any PACS procedure`);
  }

  // Check if required fields are present
  if (!order.patient_mrn) {
    errors.push('Patient MRN is required');
  }
  if (!order.patient_name) {
    errors.push('Patient name is required');
  }
  if (!order.procedure_code) {
    errors.push('Procedure code is required');
  }

  return {
    success: errors.length === 0,
    errors,
    order,
    procedureMapping,
  };
}

/**
 * Import a single order
 * 
 * Simulates the import process including patient creation/update and worklist entry creation
 * 
 * @param {string} systemId - External system ID
 * @param {string} orderId - Order ID
 * @param {Object} options - Import options
 * @param {boolean} options.updatePatientIfDifferent - Whether to update patient if data differs
 * @param {string} options.operatorName - Operator name for the import
 * @returns {Promise<Object>} Import result with success flag and details
 */
export async function importOrder(systemId, orderId, options = {}) {
  await simulateNetworkDelay();

  const { updatePatientIfDifferent = true, operatorName = 'radiographer1' } = options;

  // Validate order first
  const validation = await validateOrder(systemId, orderId);
  if (!validation.success) {
    // Create failed import history record
    const failedHistory = {
      id: `ih-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      external_system_id: systemId,
      external_order_id: orderId,
      external_visit_id: validation.order?.visit_number || 'UNKNOWN',
      patient_mrn: validation.order?.patient_mrn || 'UNKNOWN',
      patient_name: validation.order?.patient_name || 'UNKNOWN',
      procedure_code: validation.order?.procedure_code || 'UNKNOWN',
      procedure_name: validation.order?.procedure_name || 'UNKNOWN',
      import_status: 'failed',
      worklist_item_id: null,
      patient_created: false,
      patient_updated: false,
      error_message: validation.errors.join('; '),
      warnings: null,
      imported_by: operatorName,
      operator_name: operatorName,
      imported_at: new Date().toISOString(),
    };

    importHistory.push(failedHistory);

    return {
      success: false,
      orderId,
      errors: validation.errors,
      importHistoryId: failedHistory.id,
    };
  }

  const order = validation.order;
  const procedureMapping = validation.procedureMapping;

  // Check if patient exists in PACS
  const existingPatient = MOCK_PACS_PATIENTS[order.patient_mrn];
  let patientCreated = false;
  let patientUpdated = false;
  let patientDiff = null;

  if (existingPatient) {
    // Check if patient data differs
    const differs =
      existingPatient.name !== order.patient_name ||
      existingPatient.dob !== order.patient_dob ||
      existingPatient.sex !== order.patient_sex;

    if (differs) {
      patientDiff = {
        field: 'patient_data',
        pacsData: {
          name: existingPatient.name,
          dob: existingPatient.dob,
          sex: existingPatient.sex,
        },
        simrsData: {
          name: order.patient_name,
          dob: order.patient_dob,
          sex: order.patient_sex,
        },
      };

      if (updatePatientIfDifferent) {
        patientUpdated = true;
      }
    }
  } else {
    patientCreated = true;
  }

  // Create worklist entry
  const worklistItemId = `wl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Create import history record
  const historyRecord = {
    id: `ih-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    external_system_id: systemId,
    external_order_id: orderId,
    external_visit_id: order.visit_number,
    patient_mrn: order.patient_mrn,
    patient_name: order.patient_name,
    procedure_code: order.procedure_code,
    procedure_name: order.procedure_name,
    import_status: 'success',
    worklist_item_id: worklistItemId,
    patient_created: patientCreated,
    patient_updated: patientUpdated,
    error_message: null,
    warnings: [],
    imported_by: operatorName,
    operator_name: operatorName,
    imported_at: new Date().toISOString(),
  };

  // Add warnings if applicable
  if (patientCreated) {
    historyRecord.warnings.push('Patient created automatically');
  }
  if (patientUpdated) {
    historyRecord.warnings.push('Patient data updated from SIMRS');
  }

  importHistory.push(historyRecord);

  // Mark order as imported
  const orderIndex = orders.findIndex(o => o.id === orderId);
  if (orderIndex !== -1) {
    orders[orderIndex].is_imported = true;
    orders[orderIndex].imported_at = new Date().toISOString();
    orders[orderIndex].worklist_item_id = worklistItemId;
  }

  return {
    success: true,
    orderId,
    worklistItemId,
    patientCreated,
    patientUpdated,
    patientDiff,
    importHistoryId: historyRecord.id,
  };
}

/**
 * Import multiple orders
 * 
 * @param {string} systemId - External system ID
 * @param {string[]} orderIds - Array of order IDs to import
 * @param {Object} options - Import options
 * @returns {Promise<Object[]>} Array of import results
 */
export async function importOrders(systemId, orderIds, options = {}) {
  const results = [];
  for (const orderId of orderIds) {
    const result = await importOrder(systemId, orderId, options);
    results.push(result);
  }
  return results;
}

/**
 * Check if an order has been imported
 * 
 * @param {string} systemId - External system ID
 * @param {string} orderId - Order ID
 * @returns {Promise<boolean>} True if order is imported
 */
export async function isOrderImported(systemId, orderId) {
  await simulateNetworkDelay();

  const order = orders.find(o => o.external_system_id === systemId && o.id === orderId);
  return order ? order.is_imported === true : false;
}

// ============================================
// Import History
// ============================================

/**
 * Get import history with filtering
 * 
 * @param {string} systemId - External system ID
 * @param {Object} params - Query parameters
 * @param {string} params.startDate - Start date (ISO format)
 * @param {string} params.endDate - End date (ISO format)
 * @param {string} params.status - Filter by status (success, failed, partial, all)
 * @param {string} params.search - Search by order number or patient name
 * @param {number} params.page - Page number (1-indexed)
 * @param {number} params.pageSize - Items per page
 * @returns {Promise<Object>} Paginated result with items and metadata
 */
export async function getImportHistory(systemId, params = {}) {
  await simulateNetworkDelay();

  const {
    startDate = null,
    endDate = null,
    status = 'all',
    search = '',
    page = 1,
    pageSize = 10,
  } = params;

  // Filter by system ID
  let filtered = importHistory.filter(h => h.external_system_id === systemId);

  // Filter by date range
  if (startDate || endDate) {
    filtered = filtered.filter(h => {
      const historyDate = new Date(h.imported_at);
      if (startDate) {
        const start = new Date(startDate);
        if (historyDate < start) return false;
      }
      if (endDate) {
        const end = new Date(endDate);
        // Set end date to end of day
        end.setHours(23, 59, 59, 999);
        if (historyDate > end) return false;
      }
      return true;
    });
  }

  // Filter by status
  if (status !== 'all') {
    filtered = filtered.filter(h => h.import_status === status);
  }

  // Search by order number or patient name (case-insensitive)
  if (search) {
    const searchLower = search.toLowerCase();
    filtered = filtered.filter(
      h =>
        h.external_order_id.toLowerCase().includes(searchLower) ||
        h.patient_name.toLowerCase().includes(searchLower)
    );
  }

  // Sort by imported_at descending (most recent first)
  filtered.sort((a, b) => new Date(b.imported_at) - new Date(a.imported_at));

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
 * Get a single import history record
 * 
 * @param {string} historyId - Import history ID
 * @returns {Promise<Object|null>} History record or null if not found
 */
export async function getImportHistoryRecord(historyId) {
  await simulateNetworkDelay();

  const record = importHistory.find(h => h.id === historyId);
  return record || null;
}

/**
 * Retry a failed import
 * 
 * @param {string} systemId - External system ID
 * @param {string} historyId - Import history ID of the failed import
 * @param {Object} options - Import options
 * @returns {Promise<Object>} New import result
 */
export async function retryImport(systemId, historyId, options = {}) {
  await simulateNetworkDelay();

  const failedRecord = importHistory.find(h => h.id === historyId);
  if (!failedRecord) {
    return {
      success: false,
      errors: ['Import history record not found'],
    };
  }

  if (failedRecord.import_status === 'success') {
    return {
      success: false,
      errors: ['Cannot retry a successful import'],
    };
  }

  // Find the original order
  const order = orders.find(
    o =>
      o.external_system_id === systemId &&
      o.id === failedRecord.external_order_id
  );

  if (!order) {
    return {
      success: false,
      errors: ['Original order not found'],
    };
  }

  // Attempt import again
  return importOrder(systemId, order.id, options);
}

// ============================================
// Patient Diff Detection
// ============================================

/**
 * Detect patient data differences between PACS and SIMRS
 * 
 * @param {string} mrn - Patient MRN
 * @param {Object} simrsPatientData - Patient data from SIMRS
 * @returns {Promise<Object|null>} Diff object or null if no differences
 */
export async function detectPatientDiff(mrn, simrsPatientData) {
  await simulateNetworkDelay();

  const pacsPatient = MOCK_PACS_PATIENTS[mrn];
  if (!pacsPatient) {
    return null; // Patient doesn't exist in PACS, no diff
  }

  const diffs = [];

  // Compare fields
  if (pacsPatient.name !== simrsPatientData.patient_name) {
    diffs.push({
      field: 'name',
      pacsValue: pacsPatient.name,
      simrsValue: simrsPatientData.patient_name,
    });
  }

  if (pacsPatient.dob !== simrsPatientData.patient_dob) {
    diffs.push({
      field: 'dob',
      pacsValue: pacsPatient.dob,
      simrsValue: simrsPatientData.patient_dob,
    });
  }

  if (pacsPatient.sex !== simrsPatientData.patient_sex) {
    diffs.push({
      field: 'sex',
      pacsValue: pacsPatient.sex,
      simrsValue: simrsPatientData.patient_sex,
    });
  }

  return diffs.length > 0 ? { mrn, diffs } : null;
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
  orders = JSON.parse(JSON.stringify(MOCK_SIMRS_ORDERS));
  importHistory = JSON.parse(JSON.stringify(MOCK_IMPORT_HISTORY));
}

/**
 * Get current mock data (for debugging)
 * 
 * @returns {Object} Current orders and import history
 */
export function getMockData() {
  return {
    orders: JSON.parse(JSON.stringify(orders)),
    importHistory: JSON.parse(JSON.stringify(importHistory)),
  };
}

export default {
  listOrders,
  getOrder,
  validateOrder,
  importOrder,
  importOrders,
  isOrderImported,
  getImportHistory,
  getImportHistoryRecord,
  retryImport,
  detectPatientDiff,
  resetMockData,
  getMockData,
};
