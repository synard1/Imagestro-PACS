/**
 * API Service Module
 * 
 * This module provides a centralized API service for all HTTP requests
 * with proper error handling, retry logic, timeout management, and
 * response processing. It abstracts away the complexity of fetch operations
 * and provides a consistent interface for API interactions.
 * 
 * @version 1.0.0
 * @author SIMRS Order UI Team
 */

import { APP_CONFIG } from '../config/constants.js';
import { AuthStorage } from '../utils/storage.js';
import { showToast } from '../utils/dom.js';

/**
 * API Service class for handling HTTP requests
 */
class ApiService {
  constructor() {
    this.baseUrl = '';
    this.gatewayUrl = '';
    this.defaultHeaders = {
      'Content-Type': 'application/json',
    };
  }

  /**
   * Initialize API service with base URLs
   */
  init() {
    try {
      this.baseUrl = window.location.origin;
      this.gatewayUrl = this.getGatewayBase();
    } catch (error) {
      console.warn('Failed to initialize API service:', error);
      this.baseUrl = '';
      this.gatewayUrl = APP_CONFIG.API.DEFAULT_GATEWAY_BASE;
    }
  }

  /**
   * Get gateway base URL
   * @returns {string} - Gateway base URL
   */
  getGatewayBase() {
    try {
      const element = document.querySelector('#gateway_base');
      return (element?.value || APP_CONFIG.API.DEFAULT_GATEWAY_BASE).trim();
    } catch (error) {
      console.warn('Failed to get gateway base:', error);
      return APP_CONFIG.API.DEFAULT_GATEWAY_BASE;
    }
  }

  /**
   * Create request headers with authentication
   * @param {Object} additionalHeaders - Additional headers to include
   * @returns {Object} - Complete headers object
   */
  createHeaders(additionalHeaders = {}) {
    const headers = { ...this.defaultHeaders, ...additionalHeaders };
    
    const token = AuthStorage.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  }

  /**
   * Create fetch options with timeout and error handling
   * @param {string} method - HTTP method
   * @param {Object} options - Request options
   * @returns {Object} - Complete fetch options
   */
  createFetchOptions(method = 'GET', options = {}) {
    const { body, headers = {}, timeout = APP_CONFIG.API.TIMEOUT, ...otherOptions } = options;

    const fetchOptions = {
      method: method.toUpperCase(),
      headers: this.createHeaders(headers),
      ...otherOptions,
    };

    if (body && method.toUpperCase() !== 'GET') {
      fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    // Add timeout using AbortController
    if (timeout > 0) {
      const controller = new AbortController();
      fetchOptions.signal = controller.signal;
      
      setTimeout(() => {
        controller.abort();
      }, timeout);
    }

    return fetchOptions;
  }

  /**
   * Make HTTP request with retry logic
   * @param {string} url - Request URL
   * @param {Object} options - Request options
   * @param {number} retryCount - Current retry count
   * @returns {Promise<Response>} - Fetch response
   */
  async makeRequest(url, options = {}, retryCount = 0) {
    const maxRetries = APP_CONFIG.API.RETRY_ATTEMPTS;
    const retryDelay = APP_CONFIG.API.RETRY_DELAY * Math.pow(2, retryCount);

    try {
      const response = await fetch(url, options);
      
      // Handle specific HTTP status codes
      if (response.status === APP_CONFIG.HTTP_STATUS.UNAUTHORIZED) {
        // Clear invalid token
        AuthStorage.removeToken();
        throw new Error(APP_CONFIG.ERROR_MESSAGES.AUTH_EXPIRED);
      }

      if (response.status === APP_CONFIG.HTTP_STATUS.SERVICE_UNAVAILABLE && retryCount < maxRetries) {
        console.warn(`Service unavailable (503), retrying in ${retryDelay}ms...`);
        await this.delay(retryDelay);
        return this.makeRequest(url, options, retryCount + 1);
      }

      return response;

    } catch (error) {
      // Handle network errors with retry
      if ((error.name === 'TypeError' || error.message.includes('fetch')) && retryCount < maxRetries) {
        console.warn(`Network error, retrying in ${retryDelay}ms...`);
        await this.delay(retryDelay);
        return this.makeRequest(url, options, retryCount + 1);
      }

      // Handle timeout errors
      if (error.name === 'AbortError') {
        throw new Error('Request timeout. Please try again.');
      }

      throw error;
    }
  }

  /**
   * Process API response
   * @param {Response} response - Fetch response
   * @returns {Promise<Object>} - Processed response data
   */
  async processResponse(response) {
    try {
      const contentType = response.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data?.message || data?.detail || `HTTP ${response.status}: ${response.statusText}`);
        }
        
        return {
          success: true,
          data,
          status: response.status,
          statusText: response.statusText,
        };
      } else {
        const text = await response.text();
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return {
          success: true,
          data: text,
          status: response.status,
          statusText: response.statusText,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message || APP_CONFIG.ERROR_MESSAGES.UNKNOWN_ERROR,
        status: response?.status || 0,
        statusText: response?.statusText || 'Unknown Error',
      };
    }
  }

  /**
   * Delay utility for retry logic
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} - Promise that resolves after delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generic API request method
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Request options
   * @param {string} baseUrl - Base URL (optional)
   * @returns {Promise<Object>} - API response
   */
  async request(endpoint, options = {}, baseUrl = null) {
    try {
      const url = `${baseUrl || this.baseUrl}${endpoint}`;
      const fetchOptions = this.createFetchOptions(options.method || 'GET', options);
      
      console.log(`API Request: ${fetchOptions.method} ${url}`);
      
      const response = await this.makeRequest(url, fetchOptions);
      const result = await this.processResponse(response);
      
      if (!result.success) {
        console.error(`API Error: ${result.error}`);
      }
      
      return result;
    } catch (error) {
      console.error('API Request failed:', error);
      return {
        success: false,
        error: error.message || APP_CONFIG.ERROR_MESSAGES.NETWORK_ERROR,
        status: 0,
        statusText: 'Network Error',
      };
    }
  }

  /**
   * GET request
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Request options
   * @param {string} baseUrl - Base URL (optional)
   * @returns {Promise<Object>} - API response
   */
  async get(endpoint, options = {}, baseUrl = null) {
    return this.request(endpoint, { ...options, method: 'GET' }, baseUrl);
  }

  /**
   * POST request
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request body data
   * @param {Object} options - Request options
   * @param {string} baseUrl - Base URL (optional)
   * @returns {Promise<Object>} - API response
   */
  async post(endpoint, data = null, options = {}, baseUrl = null) {
    return this.request(endpoint, { ...options, method: 'POST', body: data }, baseUrl);
  }

  /**
   * PUT request
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request body data
   * @param {Object} options - Request options
   * @param {string} baseUrl - Base URL (optional)
   * @returns {Promise<Object>} - API response
   */
  async put(endpoint, data = null, options = {}, baseUrl = null) {
    return this.request(endpoint, { ...options, method: 'PUT', body: data }, baseUrl);
  }

  /**
   * PATCH request
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request body data
   * @param {Object} options - Request options
   * @param {string} baseUrl - Base URL (optional)
   * @returns {Promise<Object>} - API response
   */
  async patch(endpoint, data = null, options = {}, baseUrl = null) {
    return this.request(endpoint, { ...options, method: 'PATCH', body: data }, baseUrl);
  }

  /**
   * DELETE request
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Request options
   * @param {string} baseUrl - Base URL (optional)
   * @returns {Promise<Object>} - API response
   */
  async delete(endpoint, options = {}, baseUrl = null) {
    return this.request(endpoint, { ...options, method: 'DELETE' }, baseUrl);
  }
}

/**
 * Specialized API services for different domains
 */

/**
 * Authentication API service
 */
export const AuthApi = {
  /**
   * Login user
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Promise<Object>} - Login response
   */
  async login(username, password) {
    if (!username || !password) {
      return {
        success: false,
        error: 'Username dan password wajib diisi',
      };
    }

    const result = await apiService.post(APP_CONFIG.ENDPOINTS.AUTH.LOGIN, {
      username: username.trim(),
      password,
    }, {}, apiService.gatewayUrl);

    if (result.success && result.data) {
      const token = result.data.access_token || result.data.token;
      if (token) {
        AuthStorage.setToken(token);
      }
    }

    return result;
  },

  /**
   * Logout user
   * @returns {Promise<boolean>} - Logout success status
   */
  async logout() {
    try {
      AuthStorage.removeToken();
      return true;
    } catch (error) {
      console.warn('Logout error:', error);
      return false;
    }
  },

  /**
   * Verify authentication token
   * @param {string} token - Token to verify
   * @returns {Promise<Object>} - Verification response
   */
  async verifyToken(token) {
    if (!token) {
      return { valid: false, error: 'No token provided' };
    }

    try {
      const result = await apiService.post(APP_CONFIG.ENDPOINTS.AUTH.VERIFY, {
        token: token,
      }, {}, apiService.gatewayUrl);

      if (result.success && result.data) {
        return {
          valid: result.data.valid || false,
          payload: result.data.payload || null,
        };
      }

      return { valid: false, error: 'Invalid response from server' };
    } catch (error) {
      console.error('Token verification error:', error);
      return { valid: false, error: error.message || 'Verification failed' };
    }
  },
};

/**
 * Configuration API service
 */
export const ConfigApi = {
  /**
   * Fetch application configuration
   * @returns {Promise<Object>} - Configuration response
   */
  async fetchConfig() {
    const result = await apiService.get(APP_CONFIG.ENDPOINTS.CONFIG, {}, apiService.baseUrl);
    
    if (result.success && result.data) {
      // Update gateway base if provided
      if (result.data.gateway_base) {
        apiService.gatewayUrl = result.data.gateway_base;
        const gatewayElement = document.querySelector('#gateway_base');
        if (gatewayElement) {
          gatewayElement.value = result.data.gateway_base;
        }
      }
    }

    return result;
  },
};

/**
 * Static data API service
 */
export const StaticDataApi = {
  /**
   * Load all static data
   * @returns {Promise<Object>} - Static data response
   */
  async loadAll() {
    try {
      const [patients, practitioners, procedures, loincLabels] = await Promise.all([
        apiService.get(APP_CONFIG.ENDPOINTS.STATIC.PATIENTS),
        apiService.get(APP_CONFIG.ENDPOINTS.STATIC.PRACTITIONERS),
        apiService.get(APP_CONFIG.ENDPOINTS.STATIC.PROCEDURES),
        apiService.get(APP_CONFIG.ENDPOINTS.STATIC.LOINC_LABELS),
      ]);

      return {
        success: true,
        data: {
          patients: patients.success ? patients.data : [],
          practitioners: practitioners.success ? practitioners.data : [],
          procedures: procedures.success ? procedures.data : [],
          loincLabels: loincLabels.success ? loincLabels.data : [],
        },
      };
    } catch (error) {
      console.error('Failed to load static data:', error);
      return {
        success: false,
        error: 'Gagal memuat data statis',
      };
    }
  },
};

/**
 * SATUSEHAT API service
 */
export const SatusehatApi = {
  /**
   * Fetch SATUSEHAT locations
   * @returns {Promise<Object>} - Locations response
   */
  async fetchLocations() {
    const result = await apiService.get(
      APP_CONFIG.ENDPOINTS.SATUSEHAT.LOCATION,
      {},
      apiService.gatewayUrl
    );

    if (result.success && result.data) {
      // Process locations data
      const items = Array.isArray(result.data.entry)
        ? result.data.entry
            .map((entry) => {
              const resource = entry.resource || {};
              const name = resource.name || (Array.isArray(resource.alias) ? resource.alias[0] : '');
              return { id: resource.id, name };
            })
            .filter((item) => item.id && item.name)
        : [];

      return {
        success: true,
        data: items,
      };
    }

    return result;
  },

  /**
   * Create service request
   * @param {Object} serviceRequestData - Service request data
   * @returns {Promise<Object>} - Service request response
   */
  async createServiceRequest(serviceRequestData) {
    return apiService.post(
      APP_CONFIG.ENDPOINTS.SATUSEHAT.SERVICE_REQUEST,
      serviceRequestData,
      {},
      apiService.gatewayUrl
    );
  },
};

/**
 * Orders API service
 */
export const OrdersApi = {
  /**
   * Create order
   * @param {Object} orderData - Order data
   * @returns {Promise<Object>} - Order response
   */
  async createOrder(orderData) {
    return apiService.post(APP_CONFIG.ENDPOINTS.ORDERS.CREATE, orderData);
  },

  /**
   * Create order with complete flow
   * @param {Object} orderData - Order data
   * @returns {Promise<Object>} - Order response
   */
  async createCompleteFlow(orderData) {
    return apiService.post(APP_CONFIG.ENDPOINTS.ORDERS.COMPLETE_FLOW, orderData);
  },

  /**
   * Get SIM orders
   * @returns {Promise<Object>} - SIM orders response
   */
  async getSimOrders() {
    return apiService.get(APP_CONFIG.ENDPOINTS.ORDERS.SIM_ORDERS);
  },

  /**
   * Update service request ID for SIM order
   * @param {string} orderId - Order ID
   * @param {string} serviceRequestId - Service request ID
   * @returns {Promise<Object>} - Update response
   */
  async updateServiceRequestId(orderId, serviceRequestId) {
    const endpoint = APP_CONFIG.ENDPOINTS.ORDERS.SERVICE_REQUEST.replace('{order_id}', orderId);
    return apiService.patch(endpoint, { service_request_id: serviceRequestId });
  },
};

// Create and export singleton instance
const apiService = new ApiService();

// Initialize on module load
apiService.init();

export { apiService };
export default apiService;