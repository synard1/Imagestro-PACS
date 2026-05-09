/**
 * Order Service
 * Handles all API calls related to order management
 * Supports both backend API and local mock data based on api-registry config
 * Backend API: http://103.42.117.19:8888/orders/
 */

import { apiClient } from './http';
import { loadRegistry } from './api-registry';
import { logger } from '../utils/logger';

// Check if backend is enabled
const isBackendEnabled = () => {
  const registry = loadRegistry();
  const config = registry.orders || { enabled: false };
  const enabled = config.enabled === true;
  logger.debug('[orderService] Backend enabled:', enabled);
  return enabled;
};

/**
 * Normalize order data from backend format to UI format
 * Backend API structure (from http://103.42.117.19:8888/orders):
 * {
 *   "id": "uuid",
 *   "order_number": "ORD2025110700005",
 *   "accession_number": "2025110600003.001",
 *   "patient_name": "Ardianto Putra",
 *   "patient_national_id": "9271060312000001",
 *   "medical_record_number": "MRN001234",
 *   "registration_number": "REG20251106001",
 *   "modality": "CT",
 *   "procedure_code": "LP23456-7",
 *   "procedure_name": "CT Head with Contrast",
 *   "scheduled_at": "Fri, 07 Nov 2025 09:00:00 GMT",
 *   "status": "CREATED",
 *   "order_status": "CREATED",
 *   "worklist_status": null,
 *   "satusehat_synced": false,
 *   "created_at": "Thu, 06 Nov 2025 19:18:11 GMT"
 * }
 */
const normalizeOrder = (order) => {
  if (!order) return null;

  // Format scheduled_at to ISO string for reliable parsing
  let scheduledStartAt = order.scheduled_at || order.scheduled_start_at || order.scheduled_time || order.scheduledStartAt;
  if (scheduledStartAt && typeof scheduledStartAt === 'string') {
    try {
      const date = new Date(scheduledStartAt);
      if (!isNaN(date.getTime())) {
        // Keep as ISO string for reliable parsing across browsers
        scheduledStartAt = date.toISOString();
      }
    } catch (e) {
      logger.debug('[orderService] Failed to parse scheduled_at:', scheduledStartAt);
    }
  }

  // Format created_at
  let createdAt = order.created_at || order.createdAt;
  if (createdAt && typeof createdAt === 'string') {
    try {
      const date = new Date(createdAt);
      if (!isNaN(date.getTime())) {
        createdAt = date.toISOString();
      }
    } catch (e) {
      logger.debug('[orderService] Failed to parse created_at:', createdAt);
    }
  }

  // Format updated_at
  let updatedAt = order.updated_at || order.updatedAt;
  if (updatedAt && typeof updatedAt === 'string') {
    try {
      const date = new Date(updatedAt);
      if (!isNaN(date.getTime())) {
        updatedAt = date.toISOString();
      }
    } catch (e) {
      logger.debug('[orderService] Failed to parse updated_at:', updatedAt);
    }
  }

  // Normalize status to lowercase for consistency
  let normalizedStatus = order.status || order.order_status || 'draft';
  if (typeof normalizedStatus === 'string') {
    normalizedStatus = normalizedStatus.toLowerCase();
  }

  // Parse details if backend returns it as a JSON string
  let parsedDetails = null;
  try {
    if (typeof order.details === 'string') {
      parsedDetails = JSON.parse(order.details);
    } else if (order.details && typeof order.details === 'object') {
      parsedDetails = order.details;
    }
  } catch (_) {
    parsedDetails = null;
  }

  // Extract status_history from details column if it exists
  let statusHistory = order.status_history || [];
  if (parsedDetails && parsedDetails.status_history) {
    statusHistory = parsedDetails.status_history;
  }

  return {
    // Keep original data
    ...order,
    // Normalize field names for UI compatibility (map backend fields to UI fields)
    id: order.id || order.order_id,
    order_number: order.order_number || order.orderNumber,
    accession_no: order.accession_number || order.accession_no || order.accessionNumber,
    patient_id: order.patient_national_id || order.patient_id || order.patientId,
    patient_name: order.patient_name || order.patientName,
    patient_ihs: order.patient_national_id || order.patient_ihs || order.patient_ihs_number || order.patientIhs,
    mrn: order.medical_record_number || order.mrn || order.medicalRecordNumber,
    registration_number: order.registration_number || order.registrationNumber,
    modality: order.modality,
    procedure_code: order.procedure_code || order.procedureCode,
    procedure_name: order.procedure_name || order.procedureName,
    requested_procedure: order.procedure_name || order.requested_procedure || order.requestedProcedure || order.procedure_description,
    station_ae_title: order.station_ae_title || order.stationAeTitle || order.ae_title,
    scheduled_at: scheduledStartAt,  // Keep backend field name for table display
    scheduled_start_at: scheduledStartAt,  // Alias for form compatibility
    status: normalizedStatus,  // Normalized to lowercase
    order_status: order.order_status || order.status,  // Keep original for reference
    worklist_status: order.worklist_status || order.worklistStatus,
    satusehat_synced: order.satusehat_synced || order.satusehatSynced || false,
    priority: order.priority || 'routine',
    reason: order.reason || order.clinical_indication || order.clinicalIndication,
    laterality: order.laterality || 'NA',
    body_part: order.body_part || order.bodyPart,
    contrast: order.contrast || 'none',
    contrast_allergy: order.contrast_allergy || order.contrastAllergy || false,
    pregnancy: order.pregnancy || 'unknown',
    // Prefer explicit icd10 fields; fall back to details.icd10 if present
    icd10: order.icd10 || order.icd10_code || (parsedDetails ? parsedDetails.icd10 : undefined) || order.icd10Code,
    tags: order.tags,
    referring_id: order.referring_id || order.referringId || order.referring_physician_id,
    referring_name: order.referring_name || order.referringName || order.referring_physician_name,
    nurse_id: order.nurse_id || order.nurseId,
    nurse_name: order.nurse_name || order.nurseName || order.attending_nurse,
    created_at: createdAt,
    updated_at: updatedAt,
    deleted_at: order.deleted_at || order.deletedAt,
    // Add status_history field for backward compatibility
    status_history: statusHistory,
    // Ensure details is an object for UI consumption
    details: parsedDetails ?? order.details
  };
};

/**
 * Normalize array of orders
 */
const normalizeOrders = (orders) => {
  if (!Array.isArray(orders)) return [];
  return orders.map(normalizeOrder).filter(Boolean);
};

// ============================================
// Order Management Endpoints
// ============================================

/**
 * List all orders with optional search filters
 * @param {Object} params - Search parameters (status, patient_id, modality, etc.)
 * @returns {Promise<Array>} List of orders
 */
export const listOrders = async (params = {}) => {
  const backendEnabled = isBackendEnabled();
  logger.debug('[orderService] listOrders - Backend enabled:', backendEnabled);

  if (!backendEnabled) {
    logger.error('[orderService] Backend is not enabled. Orders module must be enabled in Settings.');
    throw new Error('Orders backend is not enabled. Please enable it in Settings page.');
  }

  logger.debug('[orderService] Using backend API');
  const client = apiClient('orders');

  // Build query params for search
  const queryParams = new URLSearchParams();
  if (params.status) queryParams.append('status', params.status);
  if (params.patient_id) queryParams.append('patient_id', params.patient_id);
  if (params.modality) queryParams.append('modality', params.modality);
  if (params.procedure_name) queryParams.append('procedure_name', params.procedure_name);
  if (params.accession_no) queryParams.append('accession_no', params.accession_no);
  if (params.order_number) queryParams.append('order_number', params.order_number);
  if (params.from_date) queryParams.append('from_date', params.from_date);
  if (params.to_date) queryParams.append('to_date', params.to_date);
  if (params.page) queryParams.append('page', params.page);
  if (params.limit) queryParams.append('limit', params.limit);

  // Try multiple endpoint patterns
  const baseCandidates = ['/orders', '/api/orders', '/orders/list'];
  const endpoints = queryParams.toString()
    ? baseCandidates.map(b => `${b}?${queryParams}`)
    : baseCandidates;

  let lastError = null;
  for (const ep of endpoints) {
    try {
      const response = await client.get(ep);

      // Handle different response formats
      if (response && response.status === 'success') {
        const orders = response.data?.orders || response.orders || response.data || [];
        return normalizeOrders(orders);
      }

      if (Array.isArray(response)) {
        return normalizeOrders(response);
      }

      // Some backends may return {orders:[...]}
      if (response && response.orders) {
        return normalizeOrders(response.orders);
      }

      // Fallback: return as-is
      return normalizeOrders(response?.data || []);
    } catch (error) {
      lastError = error;
      const msg = (error && error.message) ? error.message.toLowerCase() : '';
      if (error.status === 404 || error.status === 405 || msg.includes('not found') || msg.includes('method not allowed')) {
        continue;
      }
      break;
    }
  }

  logger.error('[orderService] List orders failed (all endpoints tried):', lastError);
  throw lastError || new Error('Failed to list orders');
};

/**
 * Get order by ID, order number, or accession number
 * @param {string} identifier - Order ID, order number, or accession number
 * @returns {Promise<Object>} Order data
 */
export const getOrder = async (identifier) => {
  const backendEnabled = isBackendEnabled();

  if (!backendEnabled) {
    logger.error('[orderService] Backend is not enabled. Orders module must be enabled in Settings.');
    throw new Error('Orders backend is not enabled. Please enable it in Settings page.');
  }

  logger.debug('[orderService] Getting order from backend API:', identifier);
  try {
    const client = apiClient('orders');
    const candidates = [
      `/orders/${identifier}`,
      `/api/orders/${identifier}`,
      `/orders/details/${identifier}`
    ];

    let lastErr = null;
    for (const ep of candidates) {
      try {
        const response = await client.get(ep);

        // Normalize response format
        if (response && response.status === 'success') {
          const order = response.data?.order || response.order || response.data;
          return normalizeOrder(order);
        }

        return normalizeOrder(response);
      } catch (e) {
        lastErr = e;
        const msg = (e && e.message) ? e.message.toLowerCase() : '';
        if (e.status === 404 || e.status === 405 || msg.includes('not found') || msg.includes('method not allowed')) {
          continue;
        }
        break;
      }
    }
    throw lastErr || new Error('Failed to get order');
  } catch (error) {
    logger.error('[orderService] Get order failed:', error);
    throw error;
  }
};

/**
 * Create a new order
 * @param {Object} orderData - Order information
 * @returns {Promise<Object>} Created order data
 */
export const createOrder = async (orderData) => {
  const backendEnabled = isBackendEnabled();

  if (!backendEnabled) {
    logger.error('[orderService] Backend is not enabled. Orders module must be enabled in Settings.');
    throw new Error('Orders backend is not enabled. Please enable it in Settings page.');
  }

  logger.debug('[orderService] Creating order in backend API');
  
  // Refactor data to move status_history to details column
  const processedOrderData = { ...orderData };
  
  // If status_history exists, move it to details column
  if (processedOrderData.status_history) {
    // Initialize details object if it doesn't exist
    if (!processedOrderData.details) {
      processedOrderData.details = {};
    }
    
    // Move status_history to details.status_history
    processedOrderData.details.status_history = processedOrderData.status_history;
    
    // Remove the separate status_history field
    delete processedOrderData.status_history;
  }
  
  const client = apiClient('orders');

  // Try multiple endpoint patterns
  const endpointCandidates = ['/orders/create', '/orders', '/api/orders'];

  let lastError = null;
  for (const ep of endpointCandidates) {
    try {
      const response = await client.post(ep, processedOrderData);

      if (response && response.status === 'success') {
        const createdId = response.order_id || response.data?.order_id || response.data?.id || response.id;

        if (createdId) {
          // Try to fetch the created order details
          try {
            const detail = await getOrder(createdId);
            return detail;
          } catch (_) {
            // If fetch fails, return normalized created data
            return normalizeOrder({ id: createdId, ...processedOrderData, ...response.data });
          }
        }

        const order = response.data?.order || response.order || response.data;
        return normalizeOrder(order || processedOrderData);
      }

      // If backend returns object directly
      return normalizeOrder(response || processedOrderData);
    } catch (error) {
      lastError = error;
      // Retry on typical path/method issues
      const msg = (error && error.message) ? error.message.toLowerCase() : '';
      if (error.status === 405 || error.status === 404 || msg.includes('method not allowed') || msg.includes('not found')) {
        continue; // try next candidate path
      }
      // Other errors: break immediately
      break;
    }
  }

  logger.error('[orderService] Create order failed (all endpoints tried):', lastError);
  throw lastError || new Error('Failed to create order');
};

/**
 * Update order information
 * @param {string} identifier - Order ID, order number, or accession number
 * @param {Object} orderData - Updated order information
 * @returns {Promise<Object>} Updated order data
 */
export const updateOrder = async (identifier, orderData) => {
  const backendEnabled = isBackendEnabled();

  if (!backendEnabled) {
    logger.error('[orderService] Backend is not enabled. Orders module must be enabled in Settings.');
    throw new Error('Orders backend is not enabled. Please enable it in Settings page.');
  }

  logger.debug('[orderService] Updating order in backend API:', identifier);
  
  // Refactor data to move status_history to details column
  const processedOrderData = { ...orderData };
  
  // If status_history exists, move it to details column
  if (processedOrderData.status_history) {
    // Initialize details object if it doesn't exist
    if (!processedOrderData.details) {
      processedOrderData.details = {};
    }
    
    // Move status_history to details.status_history
    processedOrderData.details.status_history = processedOrderData.status_history;
    
    // Remove the separate status_history field
    delete processedOrderData.status_history;
  }
  
  try {
    const client = apiClient('orders');
    logger.debug('[orderService] Order service client created');

    const candidates = [
      `/orders/${identifier}`,
      `/api/orders/${identifier}`,
      `/orders/update/${identifier}`
    ];

    let lastErr = null;
    for (const ep of candidates) {
      try {
        const response = await client.put(ep, processedOrderData);

        if (response && response.status === 'success') {
          const order = response.data?.order || response.order || response.data;
          return normalizeOrder(order);
        }

        return normalizeOrder(response);
      } catch (e) {
        lastErr = e;
        const msg = (e && e.message) ? e.message.toLowerCase() : '';
        if (e.status === 404 || e.status === 405 || msg.includes('not found') || msg.includes('method not allowed')) {
          continue;
        }
        break;
      }
    }

    throw lastErr || new Error('Failed to update order');
  } catch (error) {
    logger.error('[orderService] Update order failed:', error);

    // Provide helpful error messages
    if (error.status === 404) {
      throw new Error('Order not found. The order may have been deleted. Please refresh the page.');
    }
    if (error.status === 401 || error.status === 403) {
      throw new Error('You do not have permission to update this order.');
    }
    if (error.status === 409) {
      throw new Error('Update conflict. Another user may have modified this order. Please refresh and try again.');
    }

    throw error;
  }
};

/**
 * Delete order (soft delete)
 * @param {string} identifier - Order ID, order number, or accession number
 * @returns {Promise<Object>} Deletion confirmation
 */
export const deleteOrder = async (identifier) => {
  const backendEnabled = isBackendEnabled();

  if (!backendEnabled) {
    logger.error('[orderService] Backend is not enabled. Orders module must be enabled in Settings.');
    throw new Error('Orders backend is not enabled. Please enable it in Settings page.');
  }

  logger.debug('[orderService] Deleting order in backend API:', identifier);
  try {
    const client = apiClient('orders');
    const candidates = [
      `/orders/${identifier}`,
      `/api/orders/${identifier}`,
      `/orders/delete/${identifier}`
    ];

    let lastErr = null;
    for (const ep of candidates) {
      try {
        const response = await client.delete(ep);
        return response || { status: 'success' };
      } catch (e) {
        lastErr = e;
        const msg = (e && e.message) ? e.message.toLowerCase() : '';
        if (e.status === 404 || e.status === 405 || msg.includes('not found') || msg.includes('method not allowed')) {
          continue;
        }
        break;
      }
    }

    throw lastErr || new Error('Failed to delete order');
  } catch (error) {
    logger.error('[orderService] Delete order failed:', error);
    throw error;
  }
};

/**
 * Hard delete order (purge) - only after soft delete
 * @param {string} identifier - Order ID, order number, or accession number
 * @returns {Promise<Object>} Deletion confirmation
 */
export const purgeOrder = async (identifier) => {
  const backendEnabled = isBackendEnabled();

  if (!backendEnabled) {
    logger.debug('[orderService] Purge not supported in local api service');
    throw new Error('Purge operation is only available with backend API');
  }

  logger.debug('[orderService] Purging order in backend API:', identifier);
  try {
    const client = apiClient('orders');
    const candidates = [
      `/orders/${identifier}/purge`,
      `/api/orders/${identifier}/purge`
    ];

    let lastErr = null;
    for (const ep of candidates) {
      try {
        const response = await client.delete(ep);
        return response || { status: 'success' };
      } catch (e) {
        lastErr = e;
        const msg = (e && e.message) ? e.message.toLowerCase() : '';
        if (e.status === 404 || e.status === 405 || msg.includes('not found') || msg.includes('method not allowed')) {
          continue;
        }
        break;
      }
    }

    throw lastErr || new Error('Failed to purge order');
  } catch (error) {
    logger.error('[orderService] Purge order failed:', error);
    throw error;
  }
};

/**
 * Sync order to SATUSEHAT
 * @param {string} identifier - Order ID, order number, or accession number
 * @returns {Promise<Object>} Sync result
 */
export const syncToSatusehat = async (identifier) => {
  const backendEnabled = isBackendEnabled();

  if (!backendEnabled) {
    logger.debug('[orderService] Sync to SATUSEHAT not supported in local api service');
    throw new Error('SATUSEHAT sync is only available with backend API');
  }

  logger.debug('[orderService] Syncing order to SATUSEHAT:', identifier);
  try {
    const client = apiClient('orders');
    const candidates = [
      `/orders/${identifier}/sync-satusehat`,
      `/api/orders/${identifier}/sync-satusehat`
    ];

    let lastErr = null;
    for (const ep of candidates) {
      try {
        const response = await client.post(ep, {});
        return response;
      } catch (e) {
        lastErr = e;
        const msg = (e && e.message) ? e.message.toLowerCase() : '';
        if (e.status === 404 || e.status === 405 || msg.includes('not found') || msg.includes('method not allowed')) {
          continue;
        }
        break;
      }
    }

    throw lastErr || new Error('Failed to sync order to SATUSEHAT');
  } catch (error) {
    logger.error('[orderService] Sync to SATUSEHAT failed:', error);
    throw error;
  }
};

/**
 * Create worklist from order
 * @param {string} identifier - Order ID, order number, or accession number
 * @returns {Promise<Object>} Worklist creation result
 */
export const createWorklist = async (identifier) => {
  const backendEnabled = isBackendEnabled();

  if (!backendEnabled) {
    logger.debug('[orderService] Create worklist not supported in local api service');
    throw new Error('Worklist creation is only available with backend API');
  }

  logger.debug('[orderService] Creating worklist from order:', identifier);
  try {
    const client = apiClient('orders');
    const candidates = [
      `/orders/${identifier}/create-worklist`,
      `/api/orders/${identifier}/create-worklist`
    ];

    let lastErr = null;
    for (const ep of candidates) {
      try {
        const response = await client.post(ep, {});
        return response;
      } catch (e) {
        lastErr = e;
        const msg = (e && e.message) ? e.message.toLowerCase() : '';
        if (e.status === 404 || e.status === 405 || msg.includes('not found') || msg.includes('method not allowed')) {
          continue;
        }
        break;
      }
    }

    throw lastErr || new Error('Failed to create worklist from order');
  } catch (error) {
    logger.error('[orderService] Create worklist failed:', error);
    throw error;
  }
};

/**
 * Execute complete flow: create order, sync to SATUSEHAT, create worklist
 * @param {Object} orderData - Order information
 * @returns {Promise<Object>} Complete flow result
 */
export const completeFlow = async (orderData) => {
  const backendEnabled = isBackendEnabled();

  if (!backendEnabled) {
    logger.debug('[orderService] Complete flow not supported in local api service');
    throw new Error('Complete flow is only available with backend API');
  }

  logger.debug('[orderService] Executing complete flow');
  try {
    const client = apiClient('orders');
    const candidates = [
      '/orders/complete-flow',
      '/api/orders/complete-flow'
    ];

    let lastErr = null;
    for (const ep of candidates) {
      try {
        const response = await client.post(ep, orderData);
        return response;
      } catch (e) {
        lastErr = e;
        const msg = (e && e.message) ? e.message.toLowerCase() : '';
        if (e.status === 404 || e.status === 405 || msg.includes('not found') || msg.includes('method not allowed')) {
          continue;
        }
        break;
      }
    }

    throw lastErr || new Error('Failed to execute complete flow');
  } catch (error) {
    logger.error('[orderService] Complete flow failed:', error);
    throw error;
  }
};

/**
 * Search orders by various criteria
 * @param {Object} searchParams - Search parameters
 * @returns {Promise<Array>} List of matching orders
 */
export const searchOrders = async (searchParams) => {
  const backendEnabled = isBackendEnabled();

  if (!backendEnabled) {
    logger.error('[orderService] Backend is not enabled. Orders module must be enabled in Settings.');
    throw new Error('Orders backend is not enabled. Please enable it in Settings page.');
  }

  logger.debug('[orderService] Searching orders in backend API');
  try {
    const client = apiClient('orders');
    const queryParams = new URLSearchParams(searchParams);
    const response = await client.get(`/orders/search?${queryParams}`);

    // Normalize response format
    if (response.status === 'success') {
      const orders = response.data?.orders || response.orders || [];
      return normalizeOrders(orders);
    }

    // If response is array, normalize it
    if (Array.isArray(response)) {
      return normalizeOrders(response);
    }

    return normalizeOrders(response?.orders || []);
  } catch (error) {
    logger.error('[orderService] Search orders failed:', error);
    throw error;
  }
};

// Export all functions as default
export default {
  listOrders,
  getOrder,
  createOrder,
  updateOrder,
  deleteOrder,
  purgeOrder,
  syncToSatusehat,
  createWorklist,
  completeFlow,
  searchOrders,
};
