/**
 * Khanza Import Service
 * 
 * Handles order import operations from SIMRS Khanza to PACS:
 * - Order validation before import
 * - Single and batch order import
 * - Patient creation/update logic
 * - Doctor auto-creation
 * - Import history tracking
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 5.1, 5.2, 5.3, 5.4, 5.5, 7.2, 7.3
 */

import { logger } from '../utils/logger';
import { apiClient } from './http';
import { isKhanzaActive, loadRegistry } from './api-registry';
import {
  getRadiologi,
  getPasien,
  getDokter,
  mapPatientData,
  validateRadiologiOrder,
  formatDateToISO,
} from './khanzaService';
import {
  getProcedureMappingByCode,
  getDoctorMappingByCode,
  createDoctorMapping,
} from './khanzaMappingService';
import {
  handleError,
  handleBatchErrors,
  createError,
} from './khanzaErrorHandler';

// Module name for API client (uses khanza module for correct routing)
const MODULE_NAME = 'khanza';

// Default pagination settings
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_PAGE = 1;

/**
 * Get API client for Khanza import operations
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
// Order Validation
// ============================================

/**
 * Validate a single order before import
 * Checks: required fields, procedure mapping (all procedures), patient existence
 * 
 * @param {string} noorder - Order number from Khanza
 * @returns {Promise<Object>} Validation result
 */
export const validateOrder = async (noorder) => {
  if (!noorder) {
    return {
      valid: false,
      noorder: null,
      errors: ['Order number (noorder) is required'],
      warnings: [],
    };
  }

  logger.info('[khanzaImportService]', `Validating order: ${noorder}`);

  const result = {
    valid: true,
    noorder,
    errors: [],
    warnings: [],
    orderData: null,
    patientData: null,
    doctorData: null, // Add doctor data from Khanza
    procedureMappings: [], // Changed to array
    doctorMapping: null,
    patientExists: false,
    patientDiff: null,
  };

  try {
    // 1. Fetch order from Khanza API
    const order = await getRadiologi(noorder);
    
    // 2. Validate required fields
    const fieldValidation = validateRadiologiOrder(order);
    if (!fieldValidation.valid) {
      result.valid = false;
      result.errors.push(fieldValidation.error);
      return result;
    }
    
    result.orderData = order;

    // 3. Check procedure mapping (Support Multiple Procedures from Array)
    // 3. Check procedure mapping (Support Multiple Procedures from Array)
    const pemeriksaan = order.pemeriksaan;
    
    // Normalize to array of objects {code, name}
    let procedures = [];
    
    if (Array.isArray(pemeriksaan)) {
        procedures = pemeriksaan.map(item => {
            if (typeof item === 'object' && item.kd_jenis_prw) {
                return { code: item.kd_jenis_prw, name: item.nm_perawatan || item.kd_jenis_prw };
            }
            if (typeof item === 'string') {
                return { code: item, name: item };
            }
            return null;
        }).filter(Boolean);
    } else if (typeof order.kd_jenis_prw === 'string') {
        const codes = order.kd_jenis_prw.split(',').map(c => c.trim()).filter(Boolean);
        // Try to match with names if available (legacy/string format)
        // Note: Splitting names string is risky if names contain commas, but best effort.
        // If nm_perawatan matches length, use it.
        const names = (order.nm_perawatan || '').split(',').map(n => n.trim()).filter(Boolean);
        
        procedures = codes.map((code, idx) => ({
            code,
            name: names[idx] || code
        }));
    }

    if (procedures.length === 0) {
      result.valid = false;
      result.errors.push('No valid procedure codes found in order data');
      return result;
    }

    const unmappedProcedures = [];
    
    // Check each procedure code
    for (const proc of procedures) {
      const { code, name } = proc;
      try {
        let mapping = await getProcedureMappingByCode(code);
        
        if (!mapping) {
            result.valid = false;
            result.errors.push(`Procedure "${name}" (${code}) is not mapped. Please map it in Settings > Mappings.`);
            continue;
        }
        
        result.procedureMappings.push({
          code: code,
          mapping: mapping
        });

      } catch (err) {
        // Network error or other failure in mapping service
        logger.error('[khanzaImportService]', `Failed to fetch mapping for ${code}: ${err.message}`);
        result.valid = false;
        result.errors.push(`Failed to verify mapping for "${name}": ${err.message}`);
      }
    }

    // (Logic for unmappedProcedures check removed since we handle missing mappings via fallback now)
    
    // 4. Check if order already imported
    const alreadyImported = await isOrderImported(noorder);
    if (alreadyImported) {
      result.warnings.push('This order has already been imported. Re-importing will create a duplicate worklist entry.');
    }

    // 5. Check patient existence in PACS
    const patientMrn = order.no_rkm_medis;
    if (patientMrn) {
      try {
        const existingPatient = await checkPatientExists(patientMrn);
        result.patientExists = !!existingPatient;
        
        if (existingPatient) {
          // Fetch patient data from Khanza for comparison
          const khanzaPatient = await getPasien(patientMrn);
          const mappedKhanzaPatient = mapPatientData(khanzaPatient);
          
          // Compare patient data
          const diff = comparePatientData(existingPatient, mappedKhanzaPatient);
          if (diff.hasDifferences) {
            result.patientDiff = diff;
            result.warnings.push('Patient data differs between SIMRS and PACS. You will be prompted to update.');
          }
          result.patientData = { existing: existingPatient, khanza: mappedKhanzaPatient };
        }
      } catch (error) {
        // Patient doesn't exist - will be created during import
        logger.debug('[khanzaImportService]', `Patient ${patientMrn} not found in PACS, will be created`);
      }
    }

    // 6. Fetch doctor data from Khanza (similar to patient data)
    const doctorCode = order.dokter_perujuk || order.kd_dokter;
    if (doctorCode) {
      try {
        // Fetch full doctor data from Khanza API
        const doctorData = await getDokter(doctorCode);
        result.doctorData = doctorData;
        logger.debug('[khanzaImportService]', `Doctor data fetched for ${doctorCode}:`, doctorData);
      } catch (err) {
        logger.warn('[khanzaImportService]', `Failed to fetch doctor data for ${doctorCode}: ${err.message}`);
        // Continue without doctor data - will use basic info from order
      }

      // Also check doctor mapping
      try {
        const doctorMapping = await getDoctorMappingByCode(doctorCode);
        result.doctorMapping = doctorMapping;
        if (!doctorMapping) {
            result.warnings.push(
            `Doctor "${order.nm_dokter || doctorCode}" is not mapped. A new doctor record will be auto-created.`
            );
        }
      } catch (err) {
           // Fallback for doctor mapping failure
           logger.warn('[khanzaImportService]', `Failed to fetch doctor mapping: ${err.message}`);
           // We can leave result.doctorMapping null, handled in importOrder logic (auto creates)
      }
    }

    logger.info('[khanzaImportService]', `Order ${noorder} validation complete:`, {
      valid: result.valid,
      errors: result.errors.length,
      warnings: result.warnings.length,
    });

    return result;

  } catch (error) {
    logger.error('[khanzaImportService]', `Validation failed for order ${noorder}:`, error.message);
    
    // Handle error with user notification
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
 * Import a single order from Khanza to PACS
 * 
 * @param {string} noorder - Order number from Khanza
 * @param {Object} options - Import options
 * @param {boolean} options.updatePatientIfDifferent - Auto-update patient data if different
 * @param {boolean} options.skipValidation - Skip pre-import validation
 * @returns {Promise<Object>} Import result
 */
export const importOrder = async (noorder, options = {}) => {
  const {
    updatePatientIfDifferent = false,
    skipValidation = false,
  } = options;

  logger.info('[khanzaImportService]', `Importing order: ${noorder}`, options);

  let orderDataForHistory = null;

  const result = {
    success: false,
    noorder,
    worklistItemId: null, // Note: will contain last ID if multiple, or null
    worklistItemIds: [], // New: IDs of all created items
    patientCreated: false,
    patientUpdated: false,
    doctorCreated: false,
    errors: [],
    warnings: [],
  };

  try {
    // 1. Validate order (unless skipped)
    let validation;
    if (!skipValidation) {
      validation = await validateOrder(noorder);
      orderDataForHistory = validation.orderData; // Capture for history

      if (!validation.valid) {
        result.errors = validation.errors;
        result.warnings = validation.warnings;
        await recordImportHistory(noorder, 'failed', result, orderDataForHistory);
        return result;
      }
      result.warnings = validation.warnings;
    } else {
      // Re-fetch logic for skipValidation needs to support fallback too
      const order = await getRadiologi(noorder);
      orderDataForHistory = order; // Capture for history
      
      const pemeriksaan = order.pemeriksaan;
      let procedures = [];
    
      if (Array.isArray(pemeriksaan)) {
          procedures = pemeriksaan.map(item => {
              if (typeof item === 'object' && item.kd_jenis_prw) {
                  return { code: item.kd_jenis_prw, name: item.nm_perawatan || item.kd_jenis_prw };
              }
              if (typeof item === 'string') {
                  return { code: item, name: item };
              }
              return null;
          }).filter(Boolean);
      } else if (typeof order.kd_jenis_prw === 'string') {
          const codes = order.kd_jenis_prw.split(',').map(c => c.trim()).filter(Boolean);
          const names = (order.nm_perawatan || '').split(',').map(n => n.trim()).filter(Boolean);
          procedures = codes.map((code, idx) => ({ code, name: names[idx] || code }));
      }
      
      // Mock validation object
      let doctorMapping = null;
      try {
         doctorMapping = await getDoctorMappingByCode(order.kd_dokter);
      } catch(e) {
          // Ignore
      }

      validation = {
        orderData: order,
        procedureMappings: [],
        doctorMapping,
        patientExists: false,
        patientDiff: null,
      };

      for (const proc of procedures) {
        const { code, name } = proc;
        try {
            const m = await getProcedureMappingByCode(code);
            if (!m) {
                result.errors.push(`Strict import: Procedure "${name}" (${code}) is not mapped.`);
                continue;
            }
            validation.procedureMappings.push({ code, mapping: m });
        } catch (err) {
            result.errors.push(`Strict import: Failed to verify mapping for "${name}": ${err.message}`);
        }
      }
    }

    const { orderData, procedureMappings, doctorMapping, patientExists, patientDiff, patientData } = validation;

    if (!procedureMappings || procedureMappings.length === 0) {
      result.errors.push('No valid procedure mappings found during import');
      await recordImportHistory(noorder, 'failed', result, orderData);
      return result;
    }

    // 2. Create Order in PACS for EACH procedure
    // Note: The backend enforces unique Accession Number. 
    // If we have multiple procedures for one Khanza Order, we must split them.
    // We will use suffix for Accession Number if multiple procedures exist.
    
    // Note: Patient and Doctor creation/update are handled automatically by the Order Management Service
    
    const totalProcedures = procedureMappings.length;
    
    for (let i = 0; i < totalProcedures; i++) {
        const proc = procedureMappings[i];
        const { mapping } = proc;
        
        // Handle Accession Number uniqueness
        let accessionNumber = noorder;
        if (totalProcedures > 1) {
             accessionNumber = `${noorder}-${i+1}`;
        }
        
        // Prepare Order Payload
        const scheduledDate = formatDateToISO(orderData.tgl_permintaan) || new Date().toISOString().split('T')[0];
        const scheduledTime = orderData.jam_permintaan || '08:00:00';
        const scheduledAt = `${scheduledDate}T${scheduledTime}`;

        // Robust Birth Date Resolution
        let birthDate = formatDateToISO(orderData.tgl_lahir);
        
        if (!birthDate && patientData && patientData.patient_birthdate) {
            birthDate = patientData.patient_birthdate;
        }
        
        if (!birthDate) {
            // Try fetching patient data directly as last resort
            try {
                const pat = await getPasien(orderData.no_rkm_medis);
                if (pat && pat.tgl_lahir) {
                    birthDate = formatDateToISO(pat.tgl_lahir);
                }
            } catch (ignore) {
                // Ignore fetch errors
            }
        }
        
        if (!birthDate) {
            // Use safe default if absolutely no DOB found to avoid blocking import
             birthDate = '1900-01-01';
             result.warnings.push(`Birth date missing for ${orderData.nm_pasien}, utilizing default ${birthDate}`);
        }

        // Prepare doctor information with enhanced data
        const doctorCode = orderData.dokter_perujuk || orderData.kd_dokter;
        let doctorName = orderData.nm_dokter || 'Unknown Doctor';
        let doctorDetails = null;

        // If we have doctor data from validation, use it
        if (validation.doctorData) {
            doctorName = validation.doctorData.nm_dokter || doctorName;
            doctorDetails = {
                code: validation.doctorData.kd_dokter,
                name: validation.doctorData.nm_dokter,
                specialty: validation.doctorData.kd_sps,
                license: validation.doctorData.no_ijn_praktek,
                phone: validation.doctorData.no_telp,
                email: validation.doctorData.email,
                address: validation.doctorData.almt_tgl
            };
        }

        const orderPayload = {
            accession_number: accessionNumber,
            // order_number is auto-generated by backend if not provided
            
            modality: mapping.modality || 'CR',
            procedure_code: mapping.pacs_code,
            procedure_name: mapping.pacs_name,
            
            scheduled_at: scheduledAt,
            
            // Patient Info
            patient_national_id: orderData.no_ktp || orderData.no_rkm_medis, // Fallback to MRN if NIK missing
            medical_record_number: orderData.no_rkm_medis,
            patient_name: orderData.nm_pasien,
            gender: orderData.jk === 'L' ? 'male' : 'female',
            birth_date: birthDate,
            patient_address: orderData.alamat,
            patient_phone: orderData.no_telp,
            
            // Doctor Info - Enhanced with full doctor data
            referring_doctor: doctorName,
            referring_doctor_code: doctorCode,
            
            // Additional Info
            registration_number: orderData.no_rawat,
            clinical_indication: orderData.diagnosa_klinis,
            notes: orderData.informasi_tambahan,
            
            order_source: 'khanza',
            
            // Additional metadata for traceability and debugging
            details: {
                khanza_no_rawat: orderData.no_rawat,
                khanza_no_order: noorder,
                khanza_kd_dokter: orderData.kd_dokter,
                khanza_dokter_perujuk: orderData.dokter_perujuk,
                khanza_kd_poli: orderData.kd_poli,
                original_procedure_code: proc.code,
                doctor_details: doctorDetails // Include full doctor data
            }
        };

        try {
            const createdOrder = await createOrderInPacs(orderPayload);
            result.worklistItemIds.push(createdOrder.id);
            result.worklistItemId = createdOrder.id; // Keep backward compatibility
        } catch (err) {
            // Check if error is duplicate accession (already imported)
            // Backend returns 409 for unique constraints
            if (err.status === 409) {
                 result.warnings.push(`Order ${accessionNumber} already exists in PACS.`);
                 // Proceed to next procedure
            } else {
                throw err;
            }
        }
    }
    
    result.success = true;

    // 5. Record import history
    // We record one history entry for the whole order, referencing one of the worklist items (or maybe just the order number)
    await recordImportHistory(noorder, 'success', result, orderData);

    logger.info('[khanzaImportService]', `Order ${noorder} imported successfully:`, {
      worklistItemIds: result.worklistItemIds,
      patientCreated: result.patientCreated,
      patientUpdated: result.patientUpdated,
      doctorCreated: result.doctorCreated,
    });

    return result;

  } catch (error) {
    logger.error('[khanzaImportService]', `Import failed for order ${noorder}:`, error.message);
    result.errors.push(`Import failed: ${error.message}`);
    
    // Record failed import
    await recordImportHistory(noorder, 'failed', result, orderDataForHistory).catch(e => {
      logger.error('[khanzaImportService]', 'Failed to record import history:', e.message);
    });
    
    return result;
  }
};

/**
 * Import multiple orders from Khanza to PACS
 * 
 * @param {Array<string>} noorders - Array of order numbers
 * @param {Object} options - Import options
 * @returns {Promise<Object>} Batch import result
 */
export const importOrders = async (noorders, options = {}) => {
  if (!Array.isArray(noorders) || noorders.length === 0) {
    return {
      total: 0,
      success: 0,
      failed: 0,
      results: [],
    };
  }

  logger.info('[khanzaImportService]', `Batch importing ${noorders.length} orders...`);

  const batchResult = {
    total: noorders.length,
    success: 0,
    failed: 0,
    results: [],
  };

  for (const noorder of noorders) {
    const result = await importOrder(noorder, options);
    batchResult.results.push(result);
    
    if (result.success) {
      batchResult.success++;
    } else {
      batchResult.failed++;
    }
  }

  logger.info('[khanzaImportService]', `Batch import completed:`, {
    total: batchResult.total,
    success: batchResult.success,
    failed: batchResult.failed,
  });

  // Handle batch errors with user notification
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
 * 
 * @param {string} noorder - Order number from Khanza
 * @returns {Promise<boolean>} True if already imported
 */
export const isOrderImported = async (noorder) => {
  if (!noorder) return false;

  logger.debug('[khanzaImportService]', `Checking if order ${noorder} is imported...`);

  try {
    const client = getClient();
    const response = await client.get(`/import-history/check/${encodeURIComponent(noorder)}`);
    return response?.imported === true || response?.exists === true;
  } catch (error) {
    // If endpoint doesn't exist or returns 404, assume not imported
    if (error.status === 404) {
      return false;
    }
    logger.error('[khanzaImportService]', 'Failed to check import status:', error.message);
    return false;
  }
};

/**
 * Get import history with pagination and filters
 * 
 * @param {Object} params - Query parameters
 * @param {number} params.page - Page number (1-based)
 * @param {number} params.pageSize - Items per page
 * @param {string} params.search - Search query (noorder, patient name)
 * @param {string} params.status - Filter by status (success, failed, partial)
 * @param {string} params.dateFrom - Start date (YYYY-MM-DD)
 * @param {string} params.dateTo - End date (YYYY-MM-DD)
 * @returns {Promise<Object>} Paginated import history
 */
export const getImportHistory = async (params = {}) => {
  const {
    page = DEFAULT_PAGE,
    pageSize = DEFAULT_PAGE_SIZE,
    search = '',
    status = '',
    dateFrom = '',
    dateTo = '',
  } = params;

  logger.info('[khanzaImportService]', 'Fetching import history...', { page, pageSize, search, status });

  try {
    const client = getClient();
    
    // Build query string
    const queryParams = new URLSearchParams();
    queryParams.append('page', page.toString());
    queryParams.append('page_size', pageSize.toString());
    
    if (search) queryParams.append('search', search);
    if (status) queryParams.append('status', status);
    if (dateFrom) queryParams.append('date_from', dateFrom);
    if (dateTo) queryParams.append('date_to', dateTo);

    const response = await client.get(`/import-history?${queryParams.toString()}`);
    
    // Normalize response format
    return normalizeListResponse(response, page, pageSize);
  } catch (error) {
    logger.error('[khanzaImportService]', 'Failed to fetch import history:', error.message);
    throw error;
  }
};

/**
 * Get single import history record by ID
 * 
 * @param {string} id - Import history record ID
 * @returns {Promise<Object>} Import history record
 */
export const getImportHistoryRecord = async (id) => {
  if (!id) {
    throw new Error('Import history ID is required');
  }

  logger.info('[khanzaImportService]', `Fetching import history record: ${id}`);

  try {
    const response = await client.get(`/import-history/${id}`);
    return response.data || response;
  } catch (error) {
    logger.error('[khanzaImportService]', 'Failed to fetch import history record:', error.message);
    throw error;
  }
};

/**
 * Get import history for a specific order (latest entry)
 * 
 * @param {string} noorder - Order number
 * @returns {Promise<Object|null>} Import history object or null
 */
export const getImportHistoryByOrder = async (noorder) => {
  if (!noorder) return null;

  try {
    const client = getClient();
    const response = await client.get(`/import-history/by-order/${encodeURIComponent(noorder)}`);
    
    if (response && response.history) {
      return response.history;
    }
    return null;
  } catch (error) {
    // If 404, it means no history exists
    if (error.status === 404 || error.response?.status === 404) {
      return null;
    }
    logger.warn('[khanzaImportService]', `Failed to fetch import history for order ${noorder}:`, error.message);
    return null;
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
    const response = await client.get(`/patients/${encodeURIComponent(mrn)}`);
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
    source: 'khanza',
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
  const response = await client.put(`/patients/${encodeURIComponent(mrn)}`, {
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
 * Build worklist entry from Khanza order data
 * @param {Object} orderData - Order data from Khanza
 * @param {Object} procedureMapping - Procedure mapping
 * @param {string} patientId - PACS patient ID
 * @param {string} doctorId - PACS doctor ID
 * @returns {Object} Worklist entry data
 */
const buildWorklistEntry = (orderData, procedureMapping, patientId, doctorId) => {
  // Parse date and time
  const scheduledDate = formatDateToISO(orderData.tgl_permintaan) || new Date().toISOString().split('T')[0];
  const scheduledTime = orderData.jam_permintaan || '08:00:00';
  
  return {
    // External references
    external_order_id: orderData.noorder,
    external_visit_id: orderData.no_rawat,
    
    // Patient info
    patient_id: patientId,
    patient_mrn: orderData.no_rkm_medis,
    patient_name: orderData.nm_pasien,
    
    // Procedure info
    procedure_code: procedureMapping.pacs_code,
    procedure_name: procedureMapping.pacs_name,
    modality: procedureMapping.modality,
    
    // Referring physician
    referring_physician_id: doctorId,
    referring_physician_name: orderData.nm_dokter || orderData.dokter_perujuk,
    
    // Schedule
    scheduled_date: scheduledDate,
    scheduled_time: scheduledTime,
    scheduled_start_at: `${scheduledDate}T${scheduledTime}`,
    
    // Clinical info
    clinical_indication: orderData.diagnosa_klinis,
    notes: orderData.informasi_tambahan,
    
    // Status
    status: 'scheduled',
    priority: 'routine',
    
    // Source tracking
    source: 'khanza',
    source_system: 'SIMRS Khanza',
  };
};

/**
 * Create worklist entry in PACS
 * @param {Object} worklistData - Worklist entry data
 * @returns {Promise<Object>} Created worklist entry
 */
const createWorklistEntry = async (worklistData) => {
  const client = apiClient('worklist');
  const response = await client.post('/api/worklist', worklistData);
  return response.data || response;
};

/**
 * Record import history
 * @param {string} noorder - Order number
 * @param {string} status - Import status (success, failed, partial)
 * @param {Object} result - Import result
 * @param {Object} rawData - Raw order data from Khanza
 */
export const recordImportHistory = async (noorder, status, result, rawData = null) => {
  logger.info('[khanzaImportService]', `Recording import history for ${noorder} (status: ${status})...`);
  try {
    const client = getClient();
    
    // Ensure errors are strings
    const errorMessage = result.errors?.map(e => typeof e === 'object' ? JSON.stringify(e) : String(e)).join('; ') || null;
    
    const payload = {
      noorder,
      no_rawat: rawData?.no_rawat,
      no_rkm_medis: rawData?.no_rkm_medis,
      patient_name: rawData?.nm_pasien,
      procedure_name: rawData?.nm_perawatan,
      import_status: status,
      worklist_item_id: result.worklistItemId || null,
      patient_created: result.patientCreated || false,
      patient_updated: result.patientUpdated || false,
      error_message: errorMessage,
      warnings: result.warnings?.length > 0 ? result.warnings.map(w => typeof w === 'object' ? JSON.stringify(w) : String(w)) : null,
      raw_data: rawData,
    };

    logger.debug('[khanzaImportService]', 'Import history payload:', payload);

    const response = await client.post('/import-history', payload);
    logger.info('[khanzaImportService]', 'Import history recorded successfully:', response);
    return true;
  } catch (error) {
    logger.error('[khanzaImportService]', 'Failed to record import history:', error.message, error.response?.data);
    // Don't throw - this is a non-critical operation
    return false;
  }
};

/**
 * Record a failed validation/preview attempt for audit trail
 * @param {string} noorder - Order number
 * @param {string} errorMessage - Error message
 * @param {Object} rawData - Optional raw order data
 */
export const recordFailedValidation = async (noorder, errorMessage, rawData = null) => {
  const result = {
    success: false,
    noorder,
    worklistItemId: null,
    patientCreated: false,
    patientUpdated: false,
    errors: [errorMessage],
    warnings: [],
  };
  return recordImportHistory(noorder, 'failed', result, rawData);
};

/**
 * Compare patient data between PACS and Khanza
 * @param {Object} pacsPatient - Patient data from PACS
 * @param {Object} khanzaPatient - Patient data from Khanza (mapped)
 * @returns {Object} Comparison result with differences
 */
const comparePatientData = (pacsPatient, khanzaPatient) => {
  const differences = [];
  
  const fieldsToCompare = [
    { pacs: 'name', khanza: 'patient_name', label: 'Name' },
    { pacs: 'gender', khanza: 'patient_sex', label: 'Gender', transform: (v) => v === 'M' ? 'male' : v === 'F' ? 'female' : v },
    { pacs: 'birth_date', khanza: 'patient_birthdate', label: 'Birth Date' },
    { pacs: 'address', khanza: 'patient_address', label: 'Address' },
    { pacs: 'phone', khanza: 'patient_phone', label: 'Phone' },
  ];

  for (const field of fieldsToCompare) {
    let pacsValue = pacsPatient[field.pacs];
    let khanzaValue = khanzaPatient[field.khanza];
    
    // Apply transform if needed
    if (field.transform && khanzaValue) {
      khanzaValue = field.transform(khanzaValue);
    }
    
    // Normalize for comparison
    pacsValue = normalizeValue(pacsValue);
    khanzaValue = normalizeValue(khanzaValue);
    
    if (pacsValue !== khanzaValue && khanzaValue) {
      differences.push({
        field: field.label,
        pacsValue: pacsPatient[field.pacs] || '(empty)',
        khanzaValue: khanzaPatient[field.khanza] || '(empty)',
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
// Export Default
// ============================================

/**
 * Get the configured SIMRS Import Mode
 * @returns {string} 'direct' or 'preview'
 */
export const getSimrsImportMode = () => {
    const registry = loadRegistry();
    return registry.simrs?.importMode || 'direct'; // Default to direct if not set
};

/**
 * Prepare order data for preview in Order Form (without saving)
 * @param {string} noorder - Khanza Order Number
 * @returns {Promise<Object>} Mapped data for OrderForm
 */
export const prepareOrderForPreview = async (noorder) => {
    // 1. Validate and fetch data
    // We use validateOrder to get all raw data and mappings
    const validation = await validateOrder(noorder);

    if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    const { orderData, procedureMappings, patientData } = validation;
    
    // 2. Resolve Birth Date (Reuse logic from importOrder)
    let birthDate = formatDateToISO(orderData.tgl_lahir);
    if (!birthDate && patientData && patientData.patient_birthdate) {
        birthDate = patientData.patient_birthdate;
    }
    if (!birthDate) {
         try {
            const pat = await getPasien(orderData.no_rkm_medis);
            if (pat && pat.tgl_lahir) birthDate = formatDateToISO(pat.tgl_lahir);
        } catch (e) { /* ignore */ }
    }
    if (!birthDate) birthDate = '1900-01-01'; // Fallback

    // 3. Map Procedures
    const procedures = procedureMappings.map((proc, index) => {
        const { mapping } = proc;
        // Handle Accession Number uniqueness logic for preview
        let accessionNumber = noorder;
        if (procedureMappings.length > 1) {
             accessionNumber = `${noorder}-${index+1}`;
        }

        return {
            id: Date.now() + index, // Temp ID
            code: mapping.pacs_code,
            name: mapping.pacs_name,
            modality: mapping.modality || 'CR',
            accession_number: accessionNumber,
            scheduled_at: `${formatDateToISO(orderData.tgl_permintaan)}T${orderData.jam_permintaan || '08:00:00'}`
        };
    });

    // 4. Map top-level Order Data
    // We Map to the structure expected by OrderForm state
    const previewData = {
        // Patient
        patient_id: orderData.no_rkm_medis, // MRN as ID for new patient logic
        patient_name: orderData.nm_pasien,
        registration_number: orderData.no_rawat,
        patient_national_id: orderData.no_ktp,
        gender: orderData.jk === 'L' ? 'male' : 'female',
        birth_date: birthDate,
        patient_address: orderData.alamat,
        patient_phone: orderData.no_telp,

        // Order Details
        scheduled_start_at: `${formatDateToISO(orderData.tgl_permintaan)}T${orderData.jam_permintaan || '08:00:00'}`,
        status: 'created', // Default for new import
        priority: orderData.cito === '1' ? 'stat' : 'routine', // Infer priority if available
        
        // Doctor - Enhanced with full doctor data if available
        referring_name: validation.doctorData?.nm_dokter || orderData.nm_dokter || orderData.dokter_perujuk || 'Unknown Doctor',
        referring_id: validation.doctorData?.nm_dokter || orderData.nm_dokter || 'Unknown Doctor', // Use name for display
        referring_doctor_code: orderData.dokter_perujuk || orderData.kd_dokter,
        referring_doctor_specialty: validation.doctorData?.kd_sps,
        referring_doctor_license: validation.doctorData?.no_ijn_praktek,
        referring_doctor_phone: validation.doctorData?.no_telp,
        referring_doctor_email: validation.doctorData?.email,

        // Clinical
        reason: orderData.diagnosa_klinis || '',
        icd10: '', // Map if available
        tags: 'SIMRS Import',
        
        // Notes
        clinical_notes: orderData.informasi_tambahan,

        // Procedures Array (Critical for multi-proc)
        procedures: procedures,
        
        // Metadata to flag source
        is_simrs_import: true,
        simrs_order_number: noorder,
        simrs_source: 'khanza'
    };

    return previewData;
};

/**
 * Create order in PACS Order Management
 * @param {Object} orderData - Order payload
 * @returns {Promise<Object>} Created order
 */
const createOrderInPacs = async (orderData) => {
  const client = apiClient('orders');
  // Use /orders/create endpoint
  const response = await client.post('/orders/create', orderData);
  // Response structure: { status: 'success', order: { ... } }
  return response.order || response;
};

export default {
  // Status
  isKhanzaEnabled,
  getSimrsImportMode,
  
  // Validation
  validateOrder,
  prepareOrderForPreview,
  
  // Import operations
  importOrder,
  importOrders,
  
  // Import status & history
  isOrderImported,
  getImportHistory,
  getImportHistoryRecord,
  recordImportHistory,
  recordFailedValidation,
};
