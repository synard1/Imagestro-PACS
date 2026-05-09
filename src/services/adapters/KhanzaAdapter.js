/**
 * Khanza Provider Adapter
 * 
 * Adapter for Khanza SIMRS integration.
 * Implements the ProviderAdapter interface with Khanza-specific field mappings.
 * Migrates logic from khanzaService.js to the adapter pattern.
 * 
 * Requirements: 11.2, 11.3
 */

import { logger } from '../../utils/logger';
import { createError } from '../khanzaErrorHandler';
import { generateDeterministicAccession } from '../accession';

/**
 * Khanza Provider Adapter
 * Implements ProviderAdapter interface for Khanza SIMRS
 */
class KhanzaAdapter {
  constructor(connectionSettings) {
    this.connection = connectionSettings || {};
    this.baseUrl = (this.connection.baseUrl || '').replace(/\/+$/, '');
    this.apiKey = this.connection.apiKey || '';
    this.timeoutMs = this.connection.timeoutMs || 30000;
    this.healthPath = this.connection.healthPath || '/health';
    this.provider = 'khanza';

    if (!connectionSettings) {
      logger.warn('[KhanzaAdapter]', 'Connection settings are missing, adapter might not function correctly');
    }
  }

  /**
   * Create request headers with authentication
   * @returns {Object} Headers object
   */
  createHeaders() {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }

    return headers;
  }

  /**
   * Make HTTP request to Khanza API
   * @param {string} method - HTTP method
   * @param {string} path - API path
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Response data
   */
  async request(method, path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    const fetchOptions = {
      method,
      headers: this.createHeaders(),
      signal: controller.signal,
    };

    // Add query parameters
    let finalUrl = url;
    if (options.params) {
      const queryParams = new URLSearchParams();
      Object.entries(options.params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          queryParams.append(key, value);
        }
      });
      const queryString = queryParams.toString();
      if (queryString) {
        finalUrl += `?${queryString}`;
      }
    }

    // Add request body
    if (options.body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      fetchOptions.body = JSON.stringify(options.body);
    }

    logger.debug('[KhanzaAdapter]', `${method} ${finalUrl}`);

    try {
      const response = await fetch(finalUrl, fetchOptions);
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        const error = new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
        error.status = response.status;

        if (response.status === 401) {
          error.code = 'AUTH_FAILED';
          error.message = 'Authentication failed. Please check your API Key configuration.';
        } else if (response.status === 403) {
          error.code = 'ACCESS_DENIED';
          error.message = 'Access denied. Your API Key may not have sufficient permissions.';
        } else if (response.status === 404) {
          error.code = 'NOT_FOUND';
          error.message = 'Resource not found. The requested data does not exist.';
        } else if (response.status >= 500) {
          error.code = 'SERVER_ERROR';
          error.message = 'Khanza API server error. Please try again later or contact support.';
        }

        logger.error('[KhanzaAdapter]', `Request failed: ${error.message}`);
        throw error;
      }

      const data = await response.json();
      logger.debug('[KhanzaAdapter]', 'Response received');
      return data;

    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        const timeoutError = new Error(`Request timeout after ${this.timeoutMs}ms. Khanza API may be slow or unreachable.`);
        timeoutError.code = 'TIMEOUT';
        logger.error('[KhanzaAdapter]', timeoutError.message);
        throw timeoutError;
      }

      if (error.message && error.message.includes('Failed to fetch')) {
        const networkError = new Error('Cannot connect to Khanza API. Please check the API URL and ensure the service is running.');
        networkError.code = 'NETWORK_ERROR';
        logger.error('[KhanzaAdapter]', networkError.message);
        throw networkError;
      }

      throw error;
    }
  }

  /**
   * Check Khanza API health/connectivity
   * @returns {Promise<Object>} Health status
   */
  async checkHealth() {
    logger.info('[KhanzaAdapter]', 'Checking Khanza API health...');

    try {
      const response = await this.request('GET', this.healthPath);
      logger.info('[KhanzaAdapter]', 'Health check successful');
      return {
        status: 'connected',
        message: 'Khanza API is reachable',
        data: response,
      };
    } catch (error) {
      logger.error('[KhanzaAdapter]', 'Health check failed:', error.message);
      return {
        status: 'disconnected',
        message: error.message,
        error: error.code || 'UNKNOWN',
      };
    }
  }

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
   */
  async listOrders(params = {}) {
    logger.info('[KhanzaAdapter]', 'Fetching radiology orders...');

    try {
      const response = await this.request('GET', '/api/radiologi', { params });

      // Handle different response formats
      if (Array.isArray(response)) {
        return response;
      }

      if (response && response.data) {
        return Array.isArray(response.data) ? response.data : [response.data];
      }

      if (response && response.orders) {
        return response.orders;
      }

      return [];
    } catch (error) {
      logger.error('[KhanzaAdapter]', 'Failed to list orders:', error.message);
      throw error;
    }
  }

  /**
   * Get single radiology order by noorder
   * @param {string} orderId - Order number (noorder)
   * @returns {Promise<Object>} Radiology order details
   */
  async getOrder(orderId) {
    if (!orderId) {
      throw createError('Order number (noorder) is required', 'VALIDATION_ERROR');
    }

    logger.info('[KhanzaAdapter]', `Fetching radiology order: ${orderId}`);

    try {
      const response = await this.request('GET', `/api/radiologi/${encodeURIComponent(orderId)}`);

      // Handle different response formats
      if (response && response.data) {
        return response.data;
      }

      return response;
    } catch (error) {
      logger.error('[KhanzaAdapter]', 'Failed to get order:', error.message);
      throw error;
    }
  }

  /**
   * Get patient data by medical record number
   * @param {string} patientId - Medical record number (no_rkm_medis)
   * @returns {Promise<Object>} Patient data
   */
  async getPatient(patientId) {
    if (!patientId) {
      throw createError('Medical record number (no_rkm_medis) is required', 'VALIDATION_ERROR');
    }

    logger.info('[KhanzaAdapter]', `Fetching patient: ${patientId}`);

    try {
      const response = await this.request('GET', `/api/pasien/${encodeURIComponent(patientId)}`);

      // Handle different response formats
      if (response && response.data) {
        return response.data;
      }

      return response;
    } catch (error) {
      logger.error('[KhanzaAdapter]', 'Failed to get patient:', error.message);
      throw error;
    }
  }

  /**
   * Search for radiology procedures/examinations
   * @param {string} query - Search query
   * @returns {Promise<Array>} List of matching procedures
   */
  async searchProcedures(query = '') {
    logger.info('[KhanzaAdapter]', `Searching procedures: ${query}`);

    try {
      const response = await this.request('GET', '/api/radiologi/pemeriksaan', {
        params: { search: query },
      });

      // Handle different response formats
      if (Array.isArray(response)) {
        return response;
      }

      if (response && response.data) {
        return Array.isArray(response.data) ? response.data : [response.data];
      }

      if (response && response.pemeriksaan) {
        return response.pemeriksaan;
      }

      return [];
    } catch (error) {
      logger.error('[KhanzaAdapter]', 'Failed to search procedures:', error.message);
      throw error;
    }
  }

  /**
   * Parse date string from Khanza API
   * Handles both ISO format (YYYY-MM-DD) and Indonesian format (DD-MM-YYYY)
   * @param {string} dateStr - Date string to parse
   * @returns {Date|null} Parsed date or null if invalid
   */
  parseDate(dateStr) {
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

    logger.warn('[KhanzaAdapter]', `Failed to parse date: ${dateStr}`);
    return null;
  }

  /**
   * Format date to ISO string (YYYY-MM-DD)
   * @param {Date|string} date - Date to format
   * @returns {string|null} Formatted date string or null
   */
  formatDateToISO(date) {
    if (!date) return null;

    const dateObj = date instanceof Date ? date : this.parseDate(date);
    if (!dateObj) return null;

    return dateObj.toISOString().split('T')[0];
  }

  /**
   * Map patient sex from Khanza format (L/P) to PACS format (M/F)
   * @param {string} jk - Khanza sex value (L=Laki-laki, P=Perempuan)
   * @returns {string} PACS sex value (M/F)
   */
  mapPatientSex(jk) {
    if (!jk) return 'O'; // Other/Unknown
    const normalized = jk.toUpperCase().trim();
    if (normalized === 'L' || normalized === 'LAKI-LAKI') return 'M';
    if (normalized === 'P' || normalized === 'PEREMPUAN') return 'F';
    return 'O';
  }

  /**
   * Map patient data from Khanza format to PACS format
   * @param {Object} khanzaPatient - Patient data from Khanza API
   * @returns {Object} Patient data in PACS format
   */
  mapPatientData(khanzaPatient) {
    if (!khanzaPatient) return null;

    return {
      mrn: khanzaPatient.no_rkm_medis || khanzaPatient.mrn || khanzaPatient.patient_mrn,
      patient_name: khanzaPatient.nm_pasien || khanzaPatient.patient_name || khanzaPatient.name,
      patient_sex: this.mapPatientSex(khanzaPatient.jk || khanzaPatient.patient_sex || khanzaPatient.gender),
      patient_birthdate: this.formatDateToISO(khanzaPatient.tgl_lahir || khanzaPatient.patient_birthdate || khanzaPatient.birth_date),
      patient_address: khanzaPatient.alamat || khanzaPatient.patient_address || khanzaPatient.address,
      patient_phone: khanzaPatient.no_tlp || khanzaPatient.patient_phone || khanzaPatient.phone,
      // Keep original data for reference
      _khanza_data: khanzaPatient,
    };
  }

  /**
   * Map order data from Khanza format to PACS format
   * @param {Object} khanzaOrder - Order data from Khanza API
   * @returns {Object} Order data in PACS format
   */
  mapOrderData(khanzaOrder) {
    if (!khanzaOrder) return null;

    const id = khanzaOrder.noorder || khanzaOrder.id || khanzaOrder.order_number || khanzaOrder.orderNumber || khanzaOrder.external_order_id;
    const orderNumber = khanzaOrder.noorder || khanzaOrder.order_number || khanzaOrder.orderNumber || khanzaOrder.external_order_id;
    const visitNumber = khanzaOrder.no_rawat || khanzaOrder.visit_number || khanzaOrder.visitNumber || khanzaOrder.external_visit_id;
    const patientName = khanzaOrder.nm_pasien || khanzaOrder.patient_name || khanzaOrder.patientName || khanzaOrder.name;
    const patientMrn = khanzaOrder.no_rkm_medis || khanzaOrder.patient_mrn || khanzaOrder.patientMrn || khanzaOrder.mrn;
    const doctorName = khanzaOrder.nm_dokter || khanzaOrder.doctor_name || khanzaOrder.doctorName || khanzaOrder.referring_doctor_name;
    const orderDate = this.formatDateToISO(khanzaOrder.tgl_permintaan || khanzaOrder.tgl_periksa || khanzaOrder.order_date || khanzaOrder.orderDate || khanzaOrder.request_date);
    const orderTime = khanzaOrder.jam_permintaan || khanzaOrder.jam_periksa || khanzaOrder.order_time || khanzaOrder.orderTime || khanzaOrder.request_time;

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
      id: id,
      order_number: orderNumber,
      visit_number: visitNumber, // visit_number (no_rawat) is now top-level
      patient_name: patientName,
      patient_mrn: patientMrn,
      patient_gender: khanzaOrder.jk || khanzaOrder.patient_gender || khanzaOrder.patientGender || khanzaOrder.patient_sex,
      doctor_name: doctorName,
      order_date: orderDate,
      order_time: orderTime,
      status: khanzaOrder.status,
      
      // Examinations array with unique accession numbers
      examinations: examinations,
      
      // For backward compatibility keep the first procedure if it exists
      procedure_code: examinations[0]?.procedure_code,
      procedure_name: examinations[0]?.procedure_name,
      accession_number: examinations[0]?.accession_number,
      priority: khanzaOrder.prioritas || khanzaOrder.priority || 'routine',
      clinical_indication: khanzaOrder.indikasi_klinis || khanzaOrder.clinical_indication || khanzaOrder.clinicalIndication,
      
      // For compatibility with OrderCard.jsx and other services
      external_order_id: orderNumber,
      external_visit_id: visitNumber,
      referring_doctor: doctorName,
      referring_doctor_name: doctorName,
      patient_sex: this.mapPatientSex(khanzaOrder.jk || khanzaOrder.patient_sex || khanzaOrder.patientGender || khanzaOrder.patient_gender),
      request_date: orderDate,
      request_time: orderTime,
      
      // Keep original data for reference
      _khanza_data: khanzaOrder,
    };
  }
}

export default KhanzaAdapter;
