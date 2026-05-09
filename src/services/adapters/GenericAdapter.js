/**
 * Generic Provider Adapter
 * 
 * Adapter for generic/configurable SIMRS integration.
 * Implements the ProviderAdapter interface with configurable field mappings.
 * Supports custom API endpoints and field mapping configurations.
 * 
 * Requirements: 11.4
 */

import { logger } from '../../utils/logger';
import { createError } from '../khanzaErrorHandler';
import { generateDeterministicAccession } from '../accession';

/**
 * Generic Provider Adapter
 * Implements ProviderAdapter interface with configurable field mappings
 */
class GenericAdapter {
  constructor(connectionSettings, fieldMappings = {}) {
    if (!connectionSettings) {
      throw new Error('Connection settings are required');
    }

    this.connection = connectionSettings;
    this.baseUrl = (connectionSettings.baseUrl || '').replace(/\/+$/, '');
    this.apiKey = connectionSettings.apiKey || '';
    this.timeoutMs = connectionSettings.timeoutMs || 30000;
    this.healthPath = connectionSettings.healthPath || '/health';
    this.fieldMappings = fieldMappings || {};
    this.provider = 'generic';
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
      // Support different auth types
      const authType = this.connection.authType || 'api_key';
      switch (authType) {
        case 'api_key':
          headers['X-API-Key'] = this.apiKey;
          break;
        case 'bearer':
          headers['Authorization'] = `Bearer ${this.apiKey}`;
          break;
        case 'basic':
          headers['Authorization'] = `Basic ${this.apiKey}`;
          break;
        case 'jwt':
          headers['Authorization'] = `Bearer ${this.apiKey}`;
          break;
        default:
          headers['X-API-Key'] = this.apiKey;
      }
    }

    return headers;
  }

  /**
   * Make HTTP request to API
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

    logger.debug('[GenericAdapter]', `${method} ${finalUrl}`);

    try {
      const response = await fetch(finalUrl, fetchOptions);
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        const error = new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
        error.status = response.status;

        if (response.status === 401) {
          error.code = 'AUTH_FAILED';
          error.message = 'Authentication failed.';
        } else if (response.status === 404) {
          error.code = 'NOT_FOUND';
          error.message = 'Resource not found.';
        } else if (response.status >= 500) {
          error.code = 'SERVER_ERROR';
          error.message = 'API server error.';
        }

        throw error;
      }

      const data = await response.json();
      logger.debug('[GenericAdapter]', 'Response received');
      return data;

    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        const timeoutError = new Error(`Request timeout after ${this.timeoutMs}ms`);
        timeoutError.code = 'TIMEOUT';
        throw timeoutError;
      }

      if (error.message && error.message.includes('Failed to fetch')) {
        const networkError = new Error('Cannot connect to API');
        networkError.code = 'NETWORK_ERROR';
        throw networkError;
      }

      throw error;
    }
  }

  /**
   * Check API health/connectivity
   * @returns {Promise<Object>} Health status
   */
  async checkHealth() {
    logger.info('[GenericAdapter]', 'Checking API health...');

    try {
      const response = await this.request('GET', this.healthPath);
      logger.info('[GenericAdapter]', 'Health check successful');
      return {
        status: 'connected',
        message: 'API is reachable',
        data: response,
      };
    } catch (error) {
      logger.error('[GenericAdapter]', 'Health check failed:', error.message);
      return {
        status: 'disconnected',
        message: error.message,
        error: error.code || 'UNKNOWN',
      };
    }
  }

  /**
   * List orders from API
   * Uses configurable endpoint from field mappings
   * @param {Object} params - Query parameters
   * @returns {Promise<Array>} List of orders
   */
  async listOrders(params = {}) {
    logger.info('[GenericAdapter]', 'Fetching orders...');

    try {
      // Get endpoint from field mappings or use default
      const endpoint = this.getFieldMapping('orders_endpoint', '/api/orders');
      const response = await this.request('GET', endpoint, { params });

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
      logger.error('[GenericAdapter]', 'Failed to list orders:', error.message);
      throw error;
    }
  }

  /**
   * Get single order by ID
   * @param {string} orderId - Order ID
   * @returns {Promise<Object>} Order details
   */
  async getOrder(orderId) {
    if (!orderId) {
      throw createError('Order ID is required', 'VALIDATION_ERROR');
    }

    logger.info('[GenericAdapter]', `Fetching order: ${orderId}`);

    try {
      const endpoint = this.getFieldMapping('order_endpoint', '/api/orders/:id');
      const path = endpoint.replace(':id', encodeURIComponent(orderId));
      const response = await this.request('GET', path);

      // Handle different response formats
      if (response && response.data) {
        return response.data;
      }

      return response;
    } catch (error) {
      logger.error('[GenericAdapter]', 'Failed to get order:', error.message);
      throw error;
    }
  }

  /**
   * Get patient data by identifier
   * @param {string} patientId - Patient identifier (MRN, ID, etc.)
   * @returns {Promise<Object>} Patient data
   */
  async getPatient(patientId) {
    if (!patientId) {
      throw createError('Patient ID is required', 'VALIDATION_ERROR');
    }

    logger.info('[GenericAdapter]', `Fetching patient: ${patientId}`);

    try {
      const endpoint = this.getFieldMapping('patient_endpoint', '/api/patients/:id');
      const path = endpoint.replace(':id', encodeURIComponent(patientId));
      const response = await this.request('GET', path);

      // Handle different response formats
      if (response && response.data) {
        return response.data;
      }

      return response;
    } catch (error) {
      logger.error('[GenericAdapter]', 'Failed to get patient:', error.message);
      throw error;
    }
  }

  /**
   * Search for procedures
   * @param {string} query - Search query
   * @returns {Promise<Array>} List of procedures
   */
  async searchProcedures(query = '') {
    logger.info('[GenericAdapter]', `Searching procedures: ${query}`);

    try {
      const endpoint = this.getFieldMapping('procedures_endpoint', '/api/procedures');
      const response = await this.request('GET', endpoint, {
        params: { search: query },
      });

      // Handle different response formats
      if (Array.isArray(response)) {
        return response;
      }

      if (response && response.data) {
        return Array.isArray(response.data) ? response.data : [response.data];
      }

      if (response && response.procedures) {
        return response.procedures;
      }

      return [];
    } catch (error) {
      logger.error('[GenericAdapter]', 'Failed to search procedures:', error.message);
      throw error;
    }
  }

  /**
   * Get field mapping value
   * @param {string} key - Field mapping key
   * @param {*} defaultValue - Default value if not found
   * @returns {*} Mapped value or default
   */
  getFieldMapping(key, defaultValue = null) {
    if (!this.fieldMappings || typeof this.fieldMappings !== 'object') {
      return defaultValue;
    }

    return this.fieldMappings[key] !== undefined ? this.fieldMappings[key] : defaultValue;
  }

  /**
   * Map value using field mapping configuration
   * @param {string} mappingKey - Mapping configuration key
   * @param {*} value - Value to map
   * @returns {*} Mapped value
   */
  mapValue(mappingKey, value) {
    if (!value) return value;

    const mapping = this.getFieldMapping(mappingKey, {});
    if (typeof mapping === 'object' && mapping[value] !== undefined) {
      return mapping[value];
    }

    return value;
  }

  /**
   * Map patient sex using field mapping
   * @param {string} sex - Sex value from API
   * @returns {string} Mapped sex value
   */
  mapPatientSex(sex) {
    if (!sex) return 'O';

    // Try to use field mapping if available
    const sexMapping = this.getFieldMapping('sex_mapping', {
      'M': 'M',
      'F': 'F',
      'L': 'M',
      'P': 'F',
      'MALE': 'M',
      'FEMALE': 'F',
      'LAKI-LAKI': 'M',
      'PEREMPUAN': 'F',
    });

    const normalized = sex.toUpperCase().trim();
    return sexMapping[normalized] || 'O';
  }

  /**
   * Parse date using field mapping configuration
   * @param {string} dateStr - Date string
   * @returns {Date|null} Parsed date
   */
  parseDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') {
      return null;
    }

    // Get date format from field mapping
    const dateFormat = this.getFieldMapping('date_format', 'ISO');

    if (dateFormat === 'ISO' || dateFormat === 'YYYY-MM-DD') {
      const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (isoMatch) {
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }

    if (dateFormat === 'ID' || dateFormat === 'DD-MM-YYYY') {
      const idMatch = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})/);
      if (idMatch) {
        const [, day, month, year] = idMatch;
        const date = new Date(`${year}-${month}-${day}`);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }

    // Try parsing as-is
    const fallbackDate = new Date(dateStr);
    if (!isNaN(fallbackDate.getTime())) {
      return fallbackDate;
    }

    logger.warn('[GenericAdapter]', `Failed to parse date: ${dateStr}`);
    return null;
  }

  /**
   * Format date to ISO string
   * @param {Date|string} date - Date to format
   * @returns {string|null} Formatted date
   */
  formatDateToISO(date) {
    if (!date) return null;

    const dateObj = date instanceof Date ? date : this.parseDate(date);
    if (!dateObj) return null;

    return dateObj.toISOString().split('T')[0];
  }

  /**
   * Map patient data using field mapping configuration
   * @param {Object} apiPatient - Patient data from API
   * @returns {Object} Patient data in PACS format
   */
  mapPatientData(apiPatient) {
    if (!apiPatient) return null;

    // Get field names from mapping
    const mrnField = this.getFieldMapping('patient_mrn_field', 'mrn');
    const nameField = this.getFieldMapping('patient_name_field', 'name');
    const sexField = this.getFieldMapping('patient_sex_field', 'sex');
    const birthdateField = this.getFieldMapping('patient_birthdate_field', 'birthdate');
    const addressField = this.getFieldMapping('patient_address_field', 'address');
    const phoneField = this.getFieldMapping('patient_phone_field', 'phone');

    return {
      mrn: apiPatient[mrnField],
      patient_name: apiPatient[nameField],
      patient_sex: this.mapPatientSex(apiPatient[sexField]),
      patient_birthdate: this.formatDateToISO(apiPatient[birthdateField]),
      patient_address: apiPatient[addressField],
      patient_phone: apiPatient[phoneField],
      _api_data: apiPatient,
    };
  }

  /**
   * Map order data using field mapping configuration
   * @param {Object} apiOrder - Order data from API
   * @returns {Object} Order data in PACS format
   */
  mapOrderData(apiOrder) {
    if (!apiOrder) return null;

    // Get field names from mapping
    const orderIdField = this.getFieldMapping('order_id_field', 'id');
    const visitIdField = this.getFieldMapping('visit_id_field', 'visit_id');
    const mrnField = this.getFieldMapping('order_mrn_field', 'mrn');
    const patientNameField = this.getFieldMapping('order_patient_name_field', 'patient_name');
    const procedureCodeField = this.getFieldMapping('procedure_code_field', 'procedure_code');
    const procedureNameField = this.getFieldMapping('procedure_name_field', 'procedure_name');
    const doctorField = this.getFieldMapping('doctor_field', 'doctor');
    const dateField = this.getFieldMapping('order_date_field', 'date');
    const timeField = this.getFieldMapping('order_time_field', 'time');
    const indicationField = this.getFieldMapping('indication_field', 'indication');
    const priorityField = this.getFieldMapping('priority_field', 'priority');

    const orderNumber = apiOrder[orderIdField] || apiOrder.order_number || apiOrder.external_order_id;
    const visitNumber = apiOrder[visitIdField] || apiOrder.visit_number || apiOrder.external_visit_id;
    const patientName = apiOrder[patientNameField] || apiOrder.patient_name;
    const patientMrn = apiOrder[mrnField] || apiOrder.patient_mrn;
    const doctorName = apiOrder[doctorField] || apiOrder.doctor_name || apiOrder.referring_doctor_name;
    const orderDate = this.formatDateToISO(apiOrder[dateField] || apiOrder.order_date || apiOrder.request_date);
    const orderTime = apiOrder[timeField] || apiOrder.order_time || apiOrder.request_time;

    // Normalize examinations (pemeriksaan) - Requirement for unique Accession Numbers per examination
    let examinations = [];
    // Check if input already has examinations array
    if (Array.isArray(apiOrder.examinations || apiOrder.pemeriksaan)) {
      const items = apiOrder.examinations || apiOrder.pemeriksaan;
      examinations = items.map((p, idx) => {
        const procCode = p.procedure_code || p.procedureCode || p.kd_jenis_prw || p.kd_pemeriksaan;
        const procName = p.procedure_name || p.procedureName || p.nm_perawatan || p.nm_pemeriksaan;
        return {
          procedure_code: procCode,
          procedure_name: procName,
          // Deterministic Accession Number Strategy: ACC-{ORDER_NUMBER}-{INDEX+1}
          accession_number: p.accession_number || generateDeterministicAccession(orderNumber, idx)
        };
      });
    } else {
      // Handle flat structure or legacy format
      const procCode = apiOrder[procedureCodeField] || apiOrder.procedure_code;
      const procName = apiOrder[procedureNameField] || apiOrder.procedure_name;
      if (procCode) {
        examinations.push({
          procedure_code: procCode,
          procedure_name: procName,
          // Deterministic Accession Number Strategy: ACC-{ORDER_NUMBER}-1
          accession_number: apiOrder.accession_number || generateDeterministicAccession(orderNumber, 0)
        });
      }
    }

    return {
      id: orderNumber,
      order_number: orderNumber,
      visit_number: visitNumber, // visit_number is now top-level
      patient_mrn: patientMrn,
      patient_name: patientName,
      
      // Examinations array with unique accession numbers
      examinations: examinations,
      
      // For backward compatibility keep the first procedure if it exists
      procedure_code: examinations[0]?.procedure_code,
      procedure_name: examinations[0]?.procedure_name,
      accession_number: examinations[0]?.accession_number,
      
      doctor_name: doctorName,
      referring_doctor: doctorName,
      referring_doctor_name: doctorName,
      order_date: orderDate,
      request_date: orderDate,
      order_time: orderTime,
      request_time: orderTime,
      clinical_indication: apiOrder[indicationField] || apiOrder.clinical_indication,
      priority: this.mapValue('priority_mapping', apiOrder[priorityField] || apiOrder.priority),
      external_order_id: orderNumber,
      external_visit_id: visitNumber,
      _api_data: apiOrder,
    };
  }
}

export default GenericAdapter;
