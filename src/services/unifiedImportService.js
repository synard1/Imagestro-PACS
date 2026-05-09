/**
 * Unified Import Service
 * 
 * Handles order import operations from any external SIMRS system to PACS:
 * - Order validation before import
 * - Single and batch order import
 * - Patient creation/update logic
 * - Doctor auto-creation
 * - Worklist entry creation
 * - Import history tracking
 * 
 * Consolidates:
 * - khanzaImportService.js (Khanza-specific import logic)
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 9.1, 9.2, 9.3, 9.4, 9.5
 */

import { logger } from '../utils/logger';
import { apiClient } from './http';
import { getAdapter } from './adapters/ProviderAdapterFactory';
import { getProcedureMappingByCode, getDoctorMappingByCode, createDoctorMapping } from './unifiedMappingService';
import { handleError, handleBatchErrors, createError } from './integrationErrorHandler';
import externalSystemsService from './externalSystemsService';

// Module name for API client
const MODULE_NAME = 'externalSystems'; // Uses externalSystems module which points to backend-api

// Default pagination settings
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_PAGE = 1;

/**
 * Get API client for import operations
 * @returns {Object} API client instance
 */
const getClient = () => {
  return apiClient(MODULE_NAME);
};

// ============================================
// Order Validation
// ============================================

/**
 * Validate a single order before import
 * @param {string} externalSystemId - External system ID
 * @param {string} orderId - Order ID from external system
 * @returns {Promise<Object>} Validation result
 */
export const validateOrder = async (externalSystemId, orderId) => {
  if (!externalSystemId || !orderId) {
    return {
      valid: false,
      orderId: null,
      errors: ['External system ID and order ID are required'],
      warnings: [],
    };
  }

  logger.info('[unifiedImportService]', `Validating order: ${orderId}`);

  const result = {
    valid: true,
    orderId,
    errors: [],
    warnings: [],
    orderData: null,
    patientData: null,
    procedureMapping: null,
    doctorMapping: null,
    patientExists: false,
    patientDiff: null,
  };

  try {
    // 1. Get external system configuration
    const externalSystem = await externalSystemsService.getExternalSystem(externalSystemId, { includeCredentials: true });

    // 2. Get adapter for this provider
    const adapter = getAdapter(externalSystem);

    // 3. Fetch order from external system
    const order = await adapter.getOrder(orderId);
    if (!order) {
      result.valid = false;
      result.errors.push('Order not found in external system');
      return result;
    }
    result.orderData = order;

    // 4. Check procedure mapping
    const procedureCode = order.procedure_code || order.procedureCode;
    if (!procedureCode) {
      result.valid = false;
      result.errors.push('Order does not have a procedure code');
      return result;
    }

    const procedureMapping = await getProcedureMappingByCode(externalSystemId, procedureCode);
    if (!procedureMapping) {
      result.valid = false;
      result.errors.push(
        `Procedure "${order.procedure_name || procedureCode}" (code: ${procedureCode}) is not mapped to PACS. ` +
        'Please add the mapping in Settings â†’ Procedure Mappings.'
      );
      return result;
    }
    result.procedureMapping = procedureMapping;

    // 5. Check if order already imported
    const alreadyImported = await isOrderImported(externalSystemId, orderId);
    if (alreadyImported) {
      result.warnings.push('This order has already been imported. Re-importing will create a duplicate worklist entry.');
    }

    // 6. Check patient existence in PACS
    const patientMrn = order.patient_mrn || order.patientMrn;
    if (patientMrn) {
      try {
        const existingPatient = await checkPatientExists(patientMrn);
        result.patientExists = !!existingPatient;
        
        if (existingPatient) {
          // Fetch patient data from external system for comparison
          const externalPatient = await adapter.getPatient(patientMrn);
          const mappedExternalPatient = adapter.mapPatientData(externalPatient);
          
          // Compare patient data
          const diff = comparePatientData(existingPatient, mappedExternalPatient);
          if (diff.hasDifferences) {
            result.patientDiff = diff;
            result.warnings.push('Patient data differs between external system and PACS. You will be prompted to update.');
          }
          result.patientData = { existing: existingPatient, external: mappedExternalPatient };
        }
      } catch (error) {
        logger.debug('[unifiedImportService]', `Patient ${patientMrn} not found in PACS, will be created`);
      }
    }

    // 7. Check doctor mapping
    const doctorCode = order.doctor_code || order.doctorCode;
    if (doctorCode) {
      const doctorMapping = await getDoctorMappingByCode(externalSystemId, doctorCode);
      result.doctorMapping = doctorMapping;
      if (!doctorMapping) {
        result.warnings.push(
          `Doctor "${order.doctor_name || doctorCode}" is not mapped. A new doctor record will be auto-created.`
        );
      }
    }

    logger.info('[unifiedImportService]', `Order ${orderId} validation complete:`, {
      valid: result.valid,
      errors: result.errors.length,
      warnings: result.warnings.length,
    });

    return result;

  } catch (error) {
    logger.error('[unifiedImportService]', `Validation failed for order ${orderId}:`, error.message);
    
    handleError(error, {
      context: 'validate_order',
      notify: true,
      log: true,
    });
    
    result.valid = false;
    result.errors.push(`Failed to validate order: ${error.message}`);
    return result;
  }
};

// ============================================
// Order Import
// ============================================

/**
 * Import a single order from external system to PACS
 * @param {string} externalSystemId - External system ID
 * @param {string} orderId - Order ID from external system
 * @param {Object} options - Import options
 * @param {boolean} options.updatePatientIfDifferent - Auto-update patient data if different
 * @param {boolean} options.skipValidation - Skip pre-import validation
 * @returns {Promise<Object>} Import result
 */
export const importOrder = async (externalSystemId, orderId, options = {}) => {
  const {
    updatePatientIfDifferent = false,
    skipValidation = false,
  } = options;

  logger.info('[unifiedImportService]', `Importing order: ${orderId}`, options);

  const result = {
    success: false,
    orderId,
    worklistItemId: null,
    patientCreated: false,
    patientUpdated: false,
    doctorCreated: false,
    errors: [],
    warnings: [],
  };

  try {
    // 1. Get external system configuration
    const externalSystem = await externalSystemsService.getExternalSystem(externalSystemId, { includeCredentials: true });

    // 2. Get adapter for this provider
    const adapter = getAdapter(externalSystem);

    // 3. Validate order (unless skipped)
    let validation;
    if (!skipValidation) {
      validation = await validateOrder(externalSystemId, orderId);
      if (!validation.valid) {
        result.errors = validation.errors;
        result.warnings = validation.warnings;
        await recordImportHistory(externalSystemId, orderId, 'failed', result);
        return result;
      }
      result.warnings = validation.warnings;
    } else {
      // Fetch order data directly
      const order = await adapter.getOrder(orderId);
      validation = {
        orderData: order,
        procedureMapping: await getProcedureMappingByCode(externalSystemId, order.procedure_code || order.procedureCode),
        doctorMapping: await getDoctorMappingByCode(externalSystemId, order.doctor_code || order.doctorCode),
        patientExists: false,
        patientDiff: null,
      };
    }

    const { orderData, procedureMapping, doctorMapping, patientExists, patientDiff } = validation;

    // 4. Handle patient creation/update
    let patientId;
    const patientMrn = orderData.patient_mrn || orderData.patientMrn;

    if (!patientExists) {
      // Create new patient
      const externalPatient = await adapter.getPatient(patientMrn);
      const mappedPatient = adapter.mapPatientData(externalPatient);
      const createdPatient = await createPatientInPacs(mappedPatient);
      patientId = createdPatient.id;
      result.patientCreated = true;
      logger.info('[unifiedImportService]', `Created patient: ${patientMrn}`);
    } else {
      // Patient exists - check if update needed
      if (patientDiff?.hasDifferences && updatePatientIfDifferent) {
        const externalPatient = await adapter.getPatient(patientMrn);
        const mappedPatient = adapter.mapPatientData(externalPatient);
        await updatePatientInPacs(patientMrn, mappedPatient);
        result.patientUpdated = true;
        logger.info('[unifiedImportService]', `Updated patient: ${patientMrn}`);
      }
      patientId = validation.patientData?.existing?.id || patientMrn;
    }

    // 5. Handle doctor mapping/creation
    let pacsDoctorId = doctorMapping?.pacs_doctor_id;
    
    if (!doctorMapping && orderData.doctor_code) {
      // Auto-create doctor and mapping
      const doctorData = {
        external_code: orderData.doctor_code,
        external_name: orderData.doctor_name || 'Unknown Doctor',
        auto_created: true,
      };
      
      // Create doctor in PACS first
      const createdDoctor = await createDoctorInPacs({
        name: doctorData.external_name,
        external_id: doctorData.external_code,
        source: externalSystem.provider,
      });
      
      // Create mapping
      doctorData.pacs_doctor_id = createdDoctor.id;
      await createDoctorMapping(externalSystemId, doctorData);
      
      pacsDoctorId = createdDoctor.id;
      result.doctorCreated = true;
      logger.info('[unifiedImportService]', `Created doctor: ${doctorData.external_name}`);
    }

    // 6. Create worklist entry
    const worklistData = buildWorklistEntry(orderData, procedureMapping, patientId, pacsDoctorId, externalSystemId);
    const worklistItem = await createWorklistEntry(worklistData);
    
    result.worklistItemId = worklistItem.id;
    result.success = true;

    // 7. Record import history
    await recordImportHistory(externalSystemId, orderId, 'success', result, orderData);

    logger.info('[unifiedImportService]', `Order ${orderId} imported successfully:`, {
      worklistItemId: result.worklistItemId,
      patientCreated: result.patientCreated,
      patientUpdated: result.patientUpdated,
      doctorCreated: result.doctorCreated,
    });

    return result;

  } catch (error) {
    logger.error('[unifiedImportService]', `Import failed for order ${orderId}:`, error.message);
    result.errors.push(`Import failed: ${error.message}`);
    
    // Record failed import
    await recordImportHistory(externalSystemId, orderId, 'failed', result).catch(e => {
      logger.error('[unifiedImportService]', 'Failed to record import history:', e.message);
    });
    
    return result;
  }
};

/**
 * Import multiple orders from external system to PACS
 * @param {string} externalSystemId - External system ID
 * @param {Array<string>} orderIds - Array of order IDs
 * @param {Object} options - Import options
 * @returns {Promise<Object>} Batch import result
 */
export const importOrders = async (externalSystemId, orderIds, options = {}) => {
  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    return {
      total: 0,
      success: 0,
      failed: 0,
      results: [],
    };
  }

  logger.info('[unifiedImportService]', `Batch importing ${orderIds.length} orders...`);

  const batchResult = {
    total: orderIds.length,
    success: 0,
    failed: 0,
    results: [],
  };

  for (const orderId of orderIds) {
    const result = await importOrder(externalSystemId, orderId, options);
    batchResult.results.push(result);
    
    if (result.success) {
      batchResult.success++;
    } else {
      batchResult.failed++;
    }
  }

  logger.info('[unifiedImportService]', `Batch import completed:`, {
    total: batchResult.total,
    success: batchResult.success,
    failed: batchResult.failed,
  });

  if (batchResult.failed > 0) {
    handleBatchErrors(batchResult.results, {
      context: 'batch_import_orders',
      notify: true,
    });
  }

  return batchResult;
};

// ============================================
// Import Status & History
// ============================================

/**
 * Check if an order has already been imported
 * @param {string} externalSystemId - External system ID
 * @param {string} orderId - Order ID from external system
 * @returns {Promise<boolean>} True if already imported
 */
export const isOrderImported = async (externalSystemId, orderId) => {
  if (!externalSystemId || !orderId) return false;

  logger.debug('[unifiedImportService]', `Checking if order ${orderId} is imported...`);

  try {
    const client = getClient();
    const response = await client.get(
      `/external-systems/${externalSystemId}/import-history/check/${encodeURIComponent(orderId)}`
    );
    return response?.imported === true || response?.exists === true;
  } catch (error) {
    if (error.status === 404) {
      return false;
    }
    logger.error('[unifiedImportService]', 'Failed to check import status:', error.message);
    return false;
  }
};

/**
 * List orders from external system with pagination and filters
 * @param {string} externalSystemId - External system ID
 * @param {Object} params - Query parameters
 * @param {number} params.page - Page number (1-based)
 * @param {number} params.pageSize - Items per page
 * @param {string} params.search - Search query (order number, patient name, MRN)
 * @param {string} params.startDate - Start date (YYYY-MM-DD)
 * @param {string} params.endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Object>} Paginated orders list
 */
export const listOrders = async (externalSystemId, params = {}) => {
  if (!externalSystemId) {
    throw createError('External system ID is required', 'VALIDATION_ERROR');
  }

  const {
    page = DEFAULT_PAGE,
    pageSize = DEFAULT_PAGE_SIZE,
    search = '',
    startDate = '',
    endDate = '',
  } = params;

  logger.info('[unifiedImportService]', 'Listing orders...', { externalSystemId, page, pageSize, search });

  try {
    const client = getClient();
    
    // Get external system configuration to get the provider
    const externalSystem = await externalSystemsService.getExternalSystem(externalSystemId, { includeCredentials: true });
    
    // Get adapter for this provider
    const adapter = getAdapter(externalSystem);

    const queryParams = new URLSearchParams();
    queryParams.append('page', page.toString());
    queryParams.append('page_size', pageSize.toString());
    
    if (search) queryParams.append('search', search);
    if (startDate) queryParams.append('start_date', startDate);
    if (endDate) queryParams.append('end_date', endDate);

    const response = await client.get(
      `/external-systems/${externalSystemId}/orders?${queryParams.toString()}`
    );
    
    const normalized = normalizeListResponse(response, page, pageSize);
    
    // Map each item using adapter.mapOrderData
    if (normalized.items && Array.isArray(normalized.items)) {
      normalized.items = normalized.items.map(item => adapter.mapOrderData(item));
    }
    
    return normalized;
  } catch (error) {
    logger.error('[unifiedImportService]', 'Failed to list orders:', error.message);
    throw error;
  }
};

/**
 * Get import history with pagination and filters
 * @param {string} externalSystemId - External system ID
 * @param {Object} params - Query parameters
 * @param {number} params.page - Page number (1-based)
 * @param {number} params.pageSize - Items per page
 * @param {string} params.search - Search query
 * @param {string} params.status - Filter by status
 * @param {string} params.dateFrom - Start date
 * @param {string} params.dateTo - End date
 * @returns {Promise<Object>} Paginated import history
 */
export const getImportHistory = async (externalSystemId, params = {}) => {
  if (!externalSystemId) {
    throw createError('External system ID is required', 'VALIDATION_ERROR');
  }

  const {
    page = DEFAULT_PAGE,
    pageSize = DEFAULT_PAGE_SIZE,
    search = '',
    status = '',
    dateFrom = '',
    dateTo = '',
  } = params;

  logger.info('[unifiedImportService]', 'Fetching import history...', { externalSystemId, page, pageSize });

  try {
    const client = getClient();
    
    const queryParams = new URLSearchParams();
    queryParams.append('page', page.toString());
    queryParams.append('page_size', pageSize.toString());
    
    if (search) queryParams.append('search', search);
    if (status) queryParams.append('status', status);
    if (dateFrom) queryParams.append('date_from', dateFrom);
    if (dateTo) queryParams.append('date_to', dateTo);

    const response = await client.get(
      `/external-systems/${externalSystemId}/import-history?${queryParams.toString()}`
    );
    
    return normalizeListResponse(response, page, pageSize);
  } catch (error) {
    logger.error('[unifiedImportService]', 'Failed to fetch import history:', error.message);
    throw error;
  }
};

/**
 * Get single import history record by ID
 * @param {string} externalSystemId - External system ID
 * @param {string} historyId - Import history record ID
 * @returns {Promise<Object>} Import history record
 */
export const getImportHistoryRecord = async (externalSystemId, historyId) => {
  if (!externalSystemId || !historyId) {
    throw createError('External system ID and history ID are required', 'VALIDATION_ERROR');
  }

  logger.info('[unifiedImportService]', `Fetching import history record: ${historyId}`);

  try {
    const client = getClient();
    const response = await client.get(
      `/external-systems/${externalSystemId}/import-history/${historyId}`
    );
    return response.data || response;
  } catch (error) {
    logger.error('[unifiedImportService]', 'Failed to fetch import history record:', error.message);
    throw error;
  }
};

/**
 * Retry a failed import
 * @param {string} externalSystemId - External system ID
 * @param {string} historyId - Import history record ID
 * @param {Object} options - Retry options
 * @returns {Promise<Object>} Import result
 */
export const retryImport = async (externalSystemId, historyId, options = {}) => {
  if (!externalSystemId || !historyId) {
    throw createError('External system ID and history ID are required', 'VALIDATION_ERROR');
  }

  logger.info('[unifiedImportService]', `Retrying import: ${historyId}`);

  try {
    // Get the original import history record
    const historyRecord = await getImportHistoryRecord(externalSystemId, historyId);
    
    if (!historyRecord) {
      throw createError('Import history record not found', 'NOT_FOUND');
    }

    // Retry the import
    const result = await importOrder(externalSystemId, historyRecord.external_order_id, options);
    
    logger.info('[unifiedImportService]', `Retry completed for ${historyId}:`, {
      success: result.success,
      errors: result.errors.length,
    });

    return result;
  } catch (error) {
    logger.error('[unifiedImportService]', `Retry failed for ${historyId}:`, error.message);
    throw error;
  }
};


// ============================================
// Helper Functions
// ============================================

/**
 * Check if patient exists in PACS by MRN
 * @param {string} mrn - Medical record number
 * @returns {Promise<Object|null>} Patient data or null
 */
const checkPatientExists = async (mrn) => {
  try {
    const client = apiClient('patients');
    const response = await client.get(`/patients/mrn/${encodeURIComponent(mrn)}`);
    return response.data || response;
  } catch (error) {
    if (error.status === 404) {
      return null;
    }
    throw error;
  }
};

/**
 * Create patient in PACS
 * @param {Object} patientData - Patient data in PACS format
 * @returns {Promise<Object>} Created patient
 */
const createPatientInPacs = async (patientData) => {
  const client = apiClient('patients');
  const response = await client.post('/patients', {
    medical_record_number: patientData.mrn,
    patient_name: patientData.patient_name,
    gender: patientData.patient_sex === 'M' ? 'male' : patientData.patient_sex === 'F' ? 'female' : 'other',
    birth_date: patientData.patient_birthdate,
    address: patientData.patient_address,
    phone: patientData.patient_phone,
    source: 'external_system',
  });
  return response.data || response;
};

/**
 * Update patient in PACS
 * @param {string} mrn - Medical record number
 * @param {Object} patientData - Updated patient data
 * @returns {Promise<Object>} Updated patient
 */
const updatePatientInPacs = async (mrn, patientData) => {
  const client = apiClient('patients');
  const response = await client.put(`/patients/mrn/${encodeURIComponent(mrn)}`, {
    patient_name: patientData.patient_name,
    gender: patientData.patient_sex === 'M' ? 'male' : patientData.patient_sex === 'F' ? 'female' : 'other',
    birth_date: patientData.patient_birthdate,
    address: patientData.patient_address,
    phone: patientData.patient_phone,
  });
  return response.data || response;
};

/**
 * Create doctor in PACS
 * @param {Object} doctorData - Doctor data
 * @returns {Promise<Object>} Created doctor
 */
const createDoctorInPacs = async (doctorData) => {
  const client = apiClient('doctors');
  const response = await client.post('/doctors', doctorData);
  return response.data || response;
};

/**
 * Build worklist entry from order data
 * @param {Object} orderData - Order data from external system
 * @param {Object} procedureMapping - Procedure mapping
 * @param {string} patientId - PACS patient ID
 * @param {string} doctorId - PACS doctor ID
 * @param {string} externalSystemId - External system ID
 * @returns {Object} Worklist entry data
 */
const buildWorklistEntry = (orderData, procedureMapping, patientId, doctorId, externalSystemId) => {
  const scheduledDate = orderData.scheduled_date || new Date().toISOString().split('T')[0];
  const scheduledTime = orderData.scheduled_time || '08:00:00';
  
  return {
    // External references
    external_order_id: orderData.order_id || orderData.orderId,
    external_system_id: externalSystemId,
    external_visit_id: orderData.visit_id || orderData.visitId,
    
    // Patient info
    patient_id: patientId,
    patient_mrn: orderData.patient_mrn || orderData.patientMrn,
    patient_name: orderData.patient_name || orderData.patientName,
    
    // Procedure info
    procedure_code: procedureMapping.pacs_code,
    procedure_name: procedureMapping.pacs_name,
    modality: procedureMapping.modality,
    
    // Referring physician
    referring_physician_id: doctorId,
    referring_physician_name: orderData.doctor_name || orderData.doctorName,
    
    // Schedule
    scheduled_date: scheduledDate,
    scheduled_time: scheduledTime,
    scheduled_start_at: `${scheduledDate}T${scheduledTime}`,
    
    // Clinical info
    clinical_indication: orderData.clinical_indication || orderData.clinicalIndication,
    notes: orderData.notes,
    
    // Status
    status: 'scheduled',
    priority: 'routine',
    
    // Source tracking
    source: 'external_system',
    source_system: orderData.source_system || 'External System',
  };
};

/**
 * Create worklist entry in PACS
 * @param {Object} worklistData - Worklist entry data
 * @returns {Promise<Object>} Created worklist entry
 */
const createWorklistEntry = async (worklistData) => {
  const client = getClient();
  const response = await client.post('/api/worklist', worklistData);
  return response.data || response;
};

/**
 * Record import history
 * @param {string} externalSystemId - External system ID
 * @param {string} orderId - Order ID
 * @param {string} status - Import status
 * @param {Object} result - Import result
 * @param {Object} rawData - Raw order data
 */
const recordImportHistory = async (externalSystemId, orderId, status, result, rawData = null) => {
  try {
    const client = getClient();
    await client.post(
      `/external-systems/${externalSystemId}/import-history`,
      {
        external_order_id: orderId,
        external_visit_id: rawData?.visit_id || rawData?.visitId,
        patient_mrn: rawData?.patient_mrn || rawData?.patientMrn,
        patient_name: rawData?.patient_name || rawData?.patientName,
        procedure_name: rawData?.procedure_name || rawData?.procedureName,
        import_status: status,
        worklist_item_id: result.worklistItemId,
        patient_created: result.patientCreated,
        patient_updated: result.patientUpdated,
        error_message: result.errors?.join('; ') || null,
        warnings: result.warnings?.length > 0 ? result.warnings : null,
        raw_data: rawData,
      }
    );
  } catch (error) {
    logger.error('[unifiedImportService]', 'Failed to record import history:', error.message);
  }
};

/**
 * Compare patient data between PACS and external system
 * @param {Object} pacsPatient - Patient data from PACS
 * @param {Object} externalPatient - Patient data from external system (mapped)
 * @returns {Object} Comparison result with differences
 */
const comparePatientData = (pacsPatient, externalPatient) => {
  const differences = [];
  
  const fieldsToCompare = [
    { pacs: 'name', external: 'patient_name', label: 'Name' },
    { pacs: 'gender', external: 'patient_sex', label: 'Gender', transform: (v) => v === 'M' ? 'male' : v === 'F' ? 'female' : v },
    { pacs: 'birth_date', external: 'patient_birthdate', label: 'Birth Date' },
    { pacs: 'address', external: 'patient_address', label: 'Address' },
    { pacs: 'phone', external: 'patient_phone', label: 'Phone' },
  ];

  for (const field of fieldsToCompare) {
    let pacsValue = pacsPatient[field.pacs];
    let externalValue = externalPatient[field.external];
    
    if (field.transform && externalValue) {
      externalValue = field.transform(externalValue);
    }
    
    pacsValue = normalizeValue(pacsValue);
    externalValue = normalizeValue(externalValue);
    
    if (pacsValue !== externalValue && externalValue) {
      differences.push({
        field: field.label,
        pacsValue: pacsPatient[field.pacs] || '(empty)',
        externalValue: externalPatient[field.external] || '(empty)',
      });
    }
  }

  return {
    hasDifferences: differences.length > 0,
    differences,
  };
};

/**
 * Normalize value for comparison
 * @param {any} value - Value to normalize
 * @returns {string} Normalized value
 */
const normalizeValue = (value) => {
  if (value === null || value === undefined) return '';
  return String(value).trim().toLowerCase();
};

/**
 * Normalize list response to consistent pagination format
 * @param {Object|Array} response - API response
 * @param {number} page - Current page
 * @param {number} pageSize - Page size
 * @returns {Object} Normalized response with pagination info
 */
const normalizeListResponse = (response, page, pageSize) => {
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
  // Order listing
  listOrders,
  
  // Validation
  validateOrder,
  
  // Import operations
  importOrder,
  importOrders,
  
  // Import status & history
  isOrderImported,
  getImportHistory,
  getImportHistoryRecord,
  retryImport,
};
