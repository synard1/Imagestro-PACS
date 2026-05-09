/**
 * Khanza API Client Service
 * 
 * Handles direct communication with SIMRS Khanza API for:
 * - Health check
 * - Radiology orders (radiologi)
 * - Patient data (pasien)
 * - Procedure search (pemeriksaan)
 * 
 * Khanza API is an external system running at a configurable URL (default: http://localhost:3007)
 * Authentication is done via X-API-Key header
 * 
 * Requirements: 1.2, 1.5, 3.2
 */

import { logger } from '../utils/logger';
import { 
  loadRegistry, 
  saveRegistry, 
  isKhanzaActive, 
  getKhanzaApiConfig 
} from './api-registry';
import {
  handleError,
  retryWithBackoff,
  validateApiConfig,
  createError,
} from './khanzaErrorHandler';
import { getKhanzaEnvConfig, isKhanzaConfiguredViaEnv } from '../config/khanza';
import { fetchJson } from './http';
import { getAuthHeader } from './auth-storage';
import { generateDeterministicAccession } from './accession';

// Default Khanza API configuration
const DEFAULT_KHANZA_API_CONFIG = {
  baseUrl: 'http://localhost:3007',
  apiKey: '',
  timeoutMs: 30000,
  healthPath: '/health',
  debug: false,
};

/**
 * Check if Khanza integration is enabled
 * @returns {boolean} True if Khanza is the active SIMRS provider
 */
export const isKhanzaEnabled = () => {
  // If configured via environment, always consider it enabled
  if (isKhanzaConfiguredViaEnv()) {
    return true;
  }
  return isKhanzaActive();
};

/**
 * Get Khanza API configuration from registry or environment variables
 * Environment variables take priority over registry configuration
 * Uses the new unified SIMRS config structure
 * @returns {Object} Khanza API configuration
 */
export const getKhanzaConfig = () => {
  // Start with default config
  let config = { ...DEFAULT_KHANZA_API_CONFIG };
  
  // Override with registry config if available
  const apiConfig = getKhanzaApiConfig();
  if (apiConfig) {
    config = {
      ...config,
      ...apiConfig,
    };
  }
  
  // Environment variables take highest priority
  if (isKhanzaConfiguredViaEnv()) {
    const envConfig = getKhanzaEnvConfig();
    config = {
      ...config,
      ...envConfig,
    };
    logger.debug('[khanzaService]', 'Using Khanza config from environment variables');
  }
  
  return config;
};

/**
 * Save Khanza API configuration to registry
 * Updates the nested simrs.providers.khanza.api config
 * @param {Object} config - Configuration to save
 */
export const saveKhanzaConfig = (config) => {
  const registry = loadRegistry();
  
  // Ensure the nested structure exists
  if (!registry.simrs) registry.simrs = {};
  if (!registry.simrs.providers) registry.simrs.providers = {};
  if (!registry.simrs.providers.khanza) registry.simrs.providers.khanza = {};
  
  // Update the API config
  registry.simrs.providers.khanza.api = {
    ...DEFAULT_KHANZA_API_CONFIG,
    ...(registry.simrs.providers.khanza.api || {}),
    ...config,
  };
  
  saveRegistry(registry);
  logger.info('[khanzaService]', 'Khanza API configuration saved');
};

/**
 * Enable Khanza as the active SIMRS provider
 * @param {boolean} enabled - Whether to enable Khanza
 */
export const setKhanzaEnabled = (enabled) => {
  const registry = loadRegistry();
  
  if (!registry.simrs) registry.simrs = {};
  
  if (enabled) {
    registry.simrs.enabled = true;
    registry.simrs.provider = 'khanza';
  } else {
    registry.simrs.enabled = false;
    registry.simrs.provider = 'none';
  }
  
  saveRegistry(registry);
  logger.info('[khanzaService]', `Khanza integration ${enabled ? 'enabled' : 'disabled'}`);
};

/**
 * Create request headers with authentication
 * @returns {Object} Headers object
 */
const createHeaders = () => {
  const config = getKhanzaConfig();
  const authHeader = getAuthHeader();
  
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...authHeader
  };
  
  if (config.apiKey) {
    headers['X-API-Key'] = config.apiKey;
  }
  
  return headers;
};

/**
 * Make HTTP request to Khanza API with timeout and error handling
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {string} path - API path
 * @param {Object} options - Additional options (body, params, retry)
 * @returns {Promise<Object>} Response data
 */
const request = async (method, path, options = {}) => {
  const config = getKhanzaConfig();
  const baseUrl = (config.baseUrl || DEFAULT_KHANZA_API_CONFIG.baseUrl).replace(/\/+$/, '');
  const timeoutMs = config.timeoutMs || DEFAULT_KHANZA_API_CONFIG.timeoutMs;
  const shouldRetry = options.retry !== false; // Default to true
  
  // Define the actual request operation
  const performRequest = async () => {
    // Build URL with query params if provided
    let url = `${baseUrl}${path}`;
    if (options.params) {
      const queryParams = new URLSearchParams();
      Object.entries(options.params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          queryParams.append(key, value);
        }
      });
      const queryString = queryParams.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }
    
    const controller = new AbortController();
    // Allow options.signal to override
    const signal = options.signal || controller.signal;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    const fetchOptions = {
      method,
      headers: createHeaders(),
      signal,
    };
    
    if (options.body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      fetchOptions.body = JSON.stringify(options.body);
    }
    
    logger.debug('[khanzaService]', `${method} ${url}`);
    
    try {
      const data = await fetchJson(url, fetchOptions);
      clearTimeout(timeoutId);
      logger.debug('[khanzaService]', 'Response received:', data);
      return data;
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      // Handle abort/timeout
      if (error.name === 'AbortError' || error.message?.includes('timeout')) {
        const timeoutError = new Error(`Request timeout after ${timeoutMs}ms. Khanza API may be slow or unreachable.`);
        timeoutError.code = 'TIMEOUT';
        logger.error('[khanzaService]', timeoutError.message);
        throw timeoutError;
      }
      
      // Handle network errors
      if (error.code === 'ENETWORK' || (error.message && error.message.includes('Failed to fetch'))) {
        const networkError = new Error('Cannot connect to Khanza API. Please check the API URL and ensure the service is running.');
        networkError.code = 'NETWORK_ERROR';
        logger.error('[khanzaService]', networkError.message);
        throw networkError;
      }
      
      // Re-throw other errors (already cleaned by fetchJson)
      throw error;
    }
  };

  // Use retry logic if enabled
  if (shouldRetry) {
    return retryWithBackoff(performRequest, {
      maxAttempts: 3,
      initialDelayMs: 1000,
      maxDelayMs: 5000,
      backoffMultiplier: 2,
      retryableStatuses: [408, 429, 500, 502, 503, 504],
      onRetry: (retryInfo) => {
        logger.warn('[khanzaService]', `Retrying request (attempt ${retryInfo.attempt}/${retryInfo.maxAttempts})`);
      },
    });
  } else {
    return performRequest();
  }
};

// ============================================
// Health Check
// ============================================

/**
 * Check Khanza API health/connectivity
 * @param {Object} options - Options
 * @param {boolean} options.notify - Whether to show user notification (default: false for health check)
 * @returns {Promise<Object>} Health status
 */
export const checkHealth = async (options = {}) => {
  const { notify: shouldNotify = false } = options;
  const config = getKhanzaConfig();
  const healthPath = config.healthPath || '/health';
  
  logger.info('[khanzaService]', 'Checking Khanza API health...');
  
  try {
    const response = await request('GET', healthPath, { retry: true });
    logger.info('[khanzaService]', 'Health check successful');
    return {
      status: 'connected',
      message: 'Khanza API is reachable',
      data: response,
    };
  } catch (error) {
    logger.error('[khanzaService]', 'Health check failed:', error.message);
    
    // Handle error with optional notification
    if (shouldNotify) {
      handleError(error, {
        context: 'health_check',
        notify: true,
        log: true,
      });
    }
    
    return {
      status: 'disconnected',
      message: error.message,
      error: error.code || 'UNKNOWN',
    };
  }
};

// ============================================
// Radiologi Endpoints
// ============================================

/**
 * List radiology orders from Khanza API
 * @param {Object} params - Query parameters
 * @param {string} params.tgl_mulai - Start date (YYYY-MM-DD)
 * @param {string} params.tgl_akhir - End date (YYYY-MM-DD)
 * @param {string} params.no_rkm_medis - Patient MRN filter
 * @param {string} params.status - Order status filter
 * @param {number} params.limit - Max results
 * @param {number} params.offset - Pagination offset
 * @returns {Promise<Array>} List of radiology orders
 * @throws {Error} If request fails
 */
export const listRadiologi = async (params = {}) => {
  logger.info('[khanzaService]', 'Fetching radiology orders...');
  
  try {
    const response = await request('GET', '/radiologi', { params, retry: true });
    
    // Handle different response formats
    let items = [];
    if (Array.isArray(response)) {
      items = response;
    } else if (response) {
      // Explicitly check for items and data.items
      if (Array.isArray(response.items)) {
        items = response.items;
      } else if (response.data && Array.isArray(response.data.items)) {
        items = response.data.items;
      } else if (response.data) {
        items = Array.isArray(response.data) ? response.data : [response.data];
      } else if (response.orders && Array.isArray(response.orders)) {
        items = response.orders;
      }
    }
    
    // Map each order to structured format with examinations and accession numbers
    return items.map(item => mapRadiologiOrder(item));
  } catch (error) {
    handleError(error, {
      context: 'list_radiologi',
      notify: true,
      log: true,
    });
    throw error;
  }
};

/**
 * Get single radiology order by noorder
 * @param {string} noorder - Order number
 * @returns {Promise<Object>} Radiology order details
 * @throws {Error} If order not found or request fails
 */
export const getRadiologi = async (noorder) => {
  if (!noorder) {
    const error = createError('Order number (noorder) is required', 'VALIDATION_ERROR');
    handleError(error, {
      context: 'get_radiologi',
      notify: false,
      log: true,
    });
    throw error;
  }
  
  logger.info('[khanzaService]', `Fetching radiology order: ${noorder}`);
  
  try {
    const response = await request('GET', `/radiologi/${encodeURIComponent(noorder)}`, { retry: true });
    
    // Handle different response formats
    let orderData = response;
    if (response && response.data) {
      orderData = response.data;
    }
    
    // Map order to structured format
    return mapRadiologiOrder(orderData);
  } catch (error) {
    handleError(error, {
      context: 'get_radiologi',
      notify: true,
      log: true,
    });
    throw error;
  }
};

/**
 * Map radiology order from Khanza format to structured PACS format
 * @param {Object} khanzaOrder - Order data from Khanza API
 * @returns {Object} Structured order data
 */
export const mapRadiologiOrder = (khanzaOrder) => {
  if (!khanzaOrder) return null;

  const orderNumber = khanzaOrder.noorder || khanzaOrder.order_number || khanzaOrder.orderNumber;
  const visitNumber = khanzaOrder.no_rawat || khanzaOrder.visit_number || khanzaOrder.visitNumber;

  // Normalize examinations (pemeriksaan or tindakan) - Requirement for unique Accession Numbers per examination
  let examinations = [];
  const items = khanzaOrder.pemeriksaan || khanzaOrder.tindakan;
  
  if (Array.isArray(items)) {
    examinations = items.map((p, idx) => {
      const procCode = p.kd_jenis_prw || p.kd_pemeriksaan || p.kd_tindakan || p.procedure_code || p.procedureCode;
      const procName = p.nm_perawatan || p.nm_pemeriksaan || p.nm_tindakan || p.procedure_name || p.procedureName;
      return {
        procedure_code: procCode,
        procedure_name: procName,
        // Deterministic Accession Number Strategy: ACC-{ORDER_NUMBER}-{INDEX+1}
        accession_number: generateDeterministicAccession(orderNumber, idx)
      };
    });
  } else {
    // Handle flat structure or legacy format
    const procCode = khanzaOrder.kd_pemeriksaan || khanzaOrder.procedure_code || khanzaOrder.procedureCode || khanzaOrder.kd_jenis_prw || khanzaOrder.kd_tindakan;
    const procName = khanzaOrder.nm_pemeriksaan || khanzaOrder.procedure_name || khanzaOrder.procedureName || khanzaOrder.nm_perawatan || khanzaOrder.nm_tindakan;
    if (procCode) {
      examinations.push({
        procedure_code: procCode,
        procedure_name: procName,
        accession_number: generateDeterministicAccession(orderNumber, 0)
      });
    }
  }

  return {
    ...khanzaOrder,
    order_number: orderNumber,
    visit_number: visitNumber, // visit_number (no_rawat) is now top-level
    examinations, // structured examinations array
    
    // For backward compatibility keep the first procedure if it exists
    procedure_code: examinations[0]?.procedure_code,
    procedure_name: examinations[0]?.procedure_name,
    accession_number: examinations[0]?.accession_number,
    
    // Additional mapping for compatibility
    patient_sex: mapPatientSex(khanzaOrder.jk),
    request_date: formatDateToISO(khanzaOrder.tgl_permintaan || khanzaOrder.tgl_periksa),
    request_time: khanzaOrder.jam_permintaan || khanzaOrder.jam_periksa,
  };
};

/**
 * Update radiology order status in Khanza
 * @param {string} noorder - Order number
 * @param {string} status - New status (e.g., 'Selesai', 'Belum')
 * @returns {Promise<Object>} Update result
 */
export const updateRadiologiStatus = async (noorder, status) => {
  if (!noorder || !status) {
    throw createError('Order number and status are required', 'VALIDATION_ERROR');
  }

  logger.info('[khanzaService]', `Updating radiology status: ${noorder} to ${status}`);

  try {
    const response = await request('PATCH', `/radiologi/${encodeURIComponent(noorder)}/status`, {
      body: { status },
      retry: true
    });
    return response;
  } catch (error) {
    handleError(error, {
      context: 'update_radiologi_status',
      notify: true,
      log: true
    });
    throw error;
  }
};

/**
 * Save radiology result (hasil radiologi) to Khanza
 * @param {Object} data - Result data
 * @param {string} data.no_rawat - Registration number
 * @param {string} data.tgl_periksa - Date of examination (YYYY-MM-DD)
 * @param {string} data.jam_periksa - Time of examination (HH:mm:ss)
 * @param {string} data.hasil - Report text
 * @returns {Promise<Object>} Save result
 */
export const saveHasilRadiologi = async (data) => {
  const { no_rawat, tgl_periksa, jam_periksa, hasil } = data;
  if (!no_rawat || !tgl_periksa || !jam_periksa || !hasil) {
    throw createError('Missing required fields for saving hasil radiologi', 'VALIDATION_ERROR');
  }

  logger.info('[khanzaService]', `Saving radiology result for: ${no_rawat}`);

  try {
    const response = await request('POST', '/radiologi/hasil', {
      body: data,
      retry: true
    });
    return response;
  } catch (error) {
    handleError(error, {
      context: 'save_hasil_radiologi',
      notify: true,
      log: true
    });
    throw error;
  }
};

/**
 * Get radiology results (hasil radiologi) from Khanza
 * @param {string} no_rawat - Registration number
 * @param {boolean} direct - Whether to fetch direct from MySQL
 * @returns {Promise<Array>} List of radiology results
 */
export const getHasilRadiologi = async (no_rawat, direct = false) => {
  if (!no_rawat) {
    throw createError('Registration number (no_rawat) is required', 'VALIDATION_ERROR');
  }

  logger.info('[khanzaService]', `Fetching radiology results for: ${no_rawat}`);

  try {
    const response = await request('GET', `/radiologi/hasil/${encodeURIComponent(no_rawat)}`, {
      params: { direct: direct.toString() },
      retry: true
    });

    // Handle different response formats
    if (Array.isArray(response)) {
      return response;
    }

    if (response) {
      // Explicitly check for items and data.items
      if (Array.isArray(response.items)) {
        return response.items;
      }
      
      if (response.data && Array.isArray(response.data.items)) {
        return response.data.items;
      }
      
      if (response.data) {
        return Array.isArray(response.data) ? response.data : [response.data];
      }
    }

    return [];
  } catch (error) {
    handleError(error, {
      context: 'get_hasil_radiologi',
      notify: true,
      log: true
    });
    throw error;
  }
};

// ============================================
// Pasien Endpoints
// ============================================

/**
 * Get patient data by medical record number
 * @param {string} noRkmMedis - Medical record number (no_rkm_medis)
 * @returns {Promise<Object>} Patient data
 * @throws {Error} If patient not found or request fails
 */
export const getPasien = async (noRkmMedis) => {
  if (!noRkmMedis) {
    const error = createError('Medical record number (no_rkm_medis) is required', 'VALIDATION_ERROR');
    handleError(error, {
      context: 'get_pasien',
      notify: false,
      log: true,
    });
    throw error;
  }
  
  logger.info('[khanzaService]', `Fetching patient: ${noRkmMedis}`);
  
  try {
    const response = await request('GET', `/pasien/${encodeURIComponent(noRkmMedis)}`, { retry: true });
    
    // Handle different response formats
    if (response) {
      // Check for items/data.items even in singular get
      if (Array.isArray(response.items)) {
        return response.items[0] || null;
      }
      
      if (response.data) {
        if (Array.isArray(response.data.items)) {
          return response.data.items[0] || null;
        }
        return response.data;
      }
      
      if (Array.isArray(response)) {
        return response[0] || null;
      }
    }
    
    return response;
  } catch (error) {
    handleError(error, {
      context: 'get_pasien',
      notify: true,
      log: true,
    });
    throw error;
  }
};

/**
 * Get doctor data by doctor code
 * @param {string} kdDokter - Doctor code (kd_dokter)
 * @returns {Promise<Object>} Doctor data
 * @throws {Error} If doctor not found or request fails
 */
export const getDokter = async (kdDokter) => {
  if (!kdDokter) {
    const error = createError('Doctor code (kd_dokter) is required', 'VALIDATION_ERROR');
    handleError(error, {
      context: 'get_dokter',
      notify: false,
      log: true,
    });
    throw error;
  }
  
  logger.info('[khanzaService]', `Fetching doctor: ${kdDokter}`);
  
  try {
    const response = await request('GET', `/dokter/${encodeURIComponent(kdDokter)}`, { retry: true });
    
    // Handle different response formats
    if (response) {
      // Check for items/data.items even in singular get
      if (Array.isArray(response.items)) {
        return response.items[0] || null;
      }
      
      if (response.data) {
        if (Array.isArray(response.data.items)) {
          return response.data.items[0] || null;
        }
        return response.data;
      }
      
      if (Array.isArray(response)) {
        return response[0] || null;
      }
    }
    
    return response;
  } catch (error) {
    handleError(error, {
      context: 'get_dokter',
      notify: true,
      log: true,
    });
    throw error;
  }
};

// ============================================
// Pemeriksaan (Procedure) Endpoints
// ============================================

/**
 * Search for radiology procedures/examinations
 * @param {string} search - Search query
 * @returns {Promise<Array>} List of matching procedures
 * @throws {Error} If request fails
 */
export const searchPemeriksaan = async (search = '') => {
  logger.info('[khanzaService]', `Searching procedures: ${search}`);
  
  try {
    const response = await request('GET', '/radiologi/pemeriksaan', {
      params: { search },
      retry: true,
    });
    
    // Handle different response formats
    if (Array.isArray(response)) {
      return response;
    }
    
    if (response) {
      // Explicitly check for items and data.items
      if (Array.isArray(response.items)) {
        return response.items;
      }
      
      if (response.data && Array.isArray(response.data.items)) {
        return response.data.items;
      }
      
      if (response.data) {
        return Array.isArray(response.data) ? response.data : [response.data];
      }
      
      if (response.pemeriksaan && Array.isArray(response.pemeriksaan)) {
        return response.pemeriksaan;
      }
    }
    
    return [];
  } catch (error) {
    handleError(error, {
      context: 'search_pemeriksaan',
      notify: true,
      log: true,
    });
    throw error;
  }
};

// ============================================
// Date Parsing Utilities
// ============================================

/**
 * Parse date string from Khanza API
 * Handles both ISO format (YYYY-MM-DD) and Indonesian format (DD-MM-YYYY)
 * @param {string} dateStr - Date string to parse
 * @returns {Date|null} Parsed date or null if invalid
 */
export const parseKhanzaDate = (dateStr) => {
  if (!dateStr || typeof dateStr !== 'string') {
    return null;
  }
  
  // Try ISO format first (YYYY-MM-DD)
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  
  // Try Indonesian format (DD-MM-YYYY)
  const idMatch = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (idMatch) {
    const [, day, month, year] = idMatch;
    const date = new Date(`${year}-${month}-${day}`);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  
  // Try parsing as-is (for other formats)
  const fallbackDate = new Date(dateStr);
  if (!isNaN(fallbackDate.getTime())) {
    return fallbackDate;
  }
  
  logger.warn('[khanzaService]', `Failed to parse date: ${dateStr}`);
  return null;
};

/**
 * Format date to ISO string (YYYY-MM-DD)
 * @param {Date|string} date - Date to format
 * @returns {string|null} Formatted date string or null
 */
export const formatDateToISO = (date) => {
  if (!date) return null;
  
  const dateObj = date instanceof Date ? date : parseKhanzaDate(date);
  if (!dateObj) return null;
  
  return dateObj.toISOString().split('T')[0];
};

/**
 * Format date to Indonesian format (DD-MM-YYYY)
 * @param {Date|string} date - Date to format
 * @returns {string|null} Formatted date string or null
 */
export const formatDateToIndonesian = (date) => {
  if (!date) return null;
  
  const dateObj = date instanceof Date ? date : parseKhanzaDate(date);
  if (!dateObj) return null;
  
  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const year = dateObj.getFullYear();
  
  return `${day}-${month}-${year}`;
};

// ============================================
// Field Mapping Utilities
// ============================================

/**
 * Map patient sex from Khanza format (L/P) to PACS format (M/F)
 * @param {string} jk - Khanza sex value (L=Laki-laki, P=Perempuan)
 * @returns {string} PACS sex value (M/F)
 */
export const mapPatientSex = (jk) => {
  if (!jk) return 'O'; // Other/Unknown
  const normalized = jk.toUpperCase().trim();
  if (normalized === 'L' || normalized === 'LAKI-LAKI') return 'M';
  if (normalized === 'P' || normalized === 'PEREMPUAN') return 'F';
  return 'O';
};

/**
 * Map patient data from Khanza format to PACS format
 * @param {Object} khanzaPatient - Patient data from Khanza API
 * @returns {Object} Patient data in PACS format
 */
export const mapPatientData = (khanzaPatient) => {
  if (!khanzaPatient) return null;
  
  return {
    mrn: khanzaPatient.no_rkm_medis,
    patient_name: khanzaPatient.nm_pasien,
    patient_sex: mapPatientSex(khanzaPatient.jk),
    patient_birthdate: formatDateToISO(khanzaPatient.tgl_lahir),
    patient_address: khanzaPatient.alamat,
    patient_phone: khanzaPatient.no_tlp,
    // Keep original data for reference
    _khanza_data: khanzaPatient,
  };
};

// ============================================
// JSON Response Validation
// ============================================

/**
 * Validate required fields in Khanza API response
 * @param {Object} data - Response data to validate
 * @param {Array<string>} requiredFields - List of required field names
 * @returns {Object} Validation result { valid: boolean, missingFields: string[] }
 */
export const validateRequiredFields = (data, requiredFields = []) => {
  if (!data || typeof data !== 'object') {
    return {
      valid: false,
      missingFields: requiredFields,
      error: 'Response data is empty or invalid',
    };
  }
  
  const missingFields = requiredFields.filter(field => {
    const value = data[field];
    return value === undefined || value === null || value === '';
  });
  
  return {
    valid: missingFields.length === 0,
    missingFields,
    error: missingFields.length > 0 
      ? `Missing required fields: ${missingFields.join(', ')}`
      : null,
  };
};

/**
 * Validate radiology order response
 * @param {Object} order - Order data from Khanza API
 * @returns {Object} Validation result
 */
export const validateRadiologiOrder = (order) => {
  return validateRequiredFields(order, ['noorder', 'no_rawat', 'no_rkm_medis']);
};

// ============================================
// Export Default
// ============================================

export default {
  // Configuration
  getKhanzaConfig,
  saveKhanzaConfig,
  
  // Health check
  checkHealth,
  
  // Radiologi
  listRadiologi,
  getRadiologi,
  mapRadiologiOrder,
  updateRadiologiStatus,
  saveHasilRadiologi,
  getHasilRadiologi,
  
  // Pasien
  getPasien,
  
  // Dokter
  getDokter,
  
  // Pemeriksaan
  searchPemeriksaan,
  
  // Date utilities
  parseKhanzaDate,
  formatDateToISO,
  formatDateToIndonesian,
  
  // Field mapping
  mapPatientSex,
  mapPatientData,
  
  // Validation
  validateRequiredFields,
  validateRadiologiOrder,
};
