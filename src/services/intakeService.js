// src/services/intakeService.js
// Order Intake & Scheduling Service
// Handles order verification, scheduling, and check-in for admin radiologi

import { generateAccessionAsync } from './accession';
import orderService from './orderService';
import { apiClient } from './http';

const client = apiClient('orders');

/**
 * Get incoming orders for intake (status: created, scheduled)
 * @param {Object} filters - Filter options
 * @returns {Promise<Array>} List of orders
 */
export async function getIncomingOrders(filters = {}) {
  const normalizeOrders = (items = []) => {
    if (!Array.isArray(items)) return [];
    return items.map((o) => {
      const status = (o.status || o.order_status || '').toString().toLowerCase();
      const priority = (o.priority || 'routine').toString().toLowerCase();
      const scheduled_at = o.scheduled_at || o.scheduled_start_at || o.scheduled_time || o.scheduledStartAt;
      return { ...o, status, priority, scheduled_at };
    });
  };

  try {
    const params = new URLSearchParams();
    
    // Filter by intake-relevant statuses (send both lower/upper to satisfy backend filters)
    const intakeStatuses = filters.status
      ? [filters.status]
      : ['created', 'scheduled', 'arrived', 'in_progress'];

    intakeStatuses.forEach((status) => {
      params.append('status', status);
      params.append('status', status.toUpperCase());
    });
    
    if (filters.date_from) params.append('date_from', filters.date_from);
    if (filters.date_to) params.append('date_to', filters.date_to);
    if (filters.modality) params.append('modality', filters.modality);
    if (filters.priority) params.append('priority', filters.priority);
    if (filters.patient_name) params.append('patient_name', filters.patient_name);
    
    const response = await client.get(`/orders?${params.toString()}`);
    
    // Backend returns {orders: [...], count: N} format
    const primaryOrders = response.orders || response.data?.orders || response.data || response || [];
    let normalized = normalizeOrders(primaryOrders);

    // If backend ignored status filter (case mismatch) and returned empty, retry without status filter
    if (!filters.status && normalized.length === 0) {
      const fallbackResponse = await client.get('/orders');
      const fallbackOrders = fallbackResponse.orders || fallbackResponse.data?.orders || fallbackResponse.data || fallbackResponse || [];
      normalized = normalizeOrders(fallbackOrders);
    }

    // Only keep intake-relevant statuses for the board
    const allowed = ['created', 'scheduled', 'arrived', 'in_progress'];
    const filtered = normalized.filter((o) => allowed.includes(o.status));

    console.log('[intakeService] Loaded intake orders from backend:', filtered.length);
    return filtered;
  } catch (error) {
    console.warn('[intakeService] Failed to get incoming orders from backend, using mock data:', error);
    
    // Fallback to mock data from orderService if backend fails
    try {
      const allOrders = await orderService.listOrders();
      return allOrders.filter(o => 
        ['created', 'scheduled', 'arrived', 'in_progress'].includes(o.status)
      );
    } catch (mockError) {
      console.error('[intakeService] Failed to load mock orders:', mockError);
      return [];
    }
  }
}

/**
 * Create order with multiple procedures
 * @param {Object} orderData - Order data with procedures array
 * @returns {Promise<Object>} Created order with procedures
 */
export async function createOrderWithProcedures(orderData) {
  try {
    // 1. Create parent order
    const order = await orderService.createOrder({
      patient_id: orderData.patient_id,
      patient_name: orderData.patient_name,
      registration_number: orderData.registration_number,
      status: 'created',
      priority: orderData.priority || 'routine',
      referring_doctor: orderData.referring_doctor,
      clinical_indication: orderData.clinical_indication,
      // ... other order fields
    });

    // 2. Create procedures with unique accession numbers
    const procedures = [];
    for (let i = 0; i < orderData.procedures.length; i++) {
      const proc = orderData.procedures[i];
      
      // Generate unique accession number for each procedure
      const accessionNumber = await generateAccessionAsync({
        modality: proc.modality,
        date: new Date()
      });

      const procedure = await createProcedure({
        order_id: order.id,
        procedure_code: proc.code,
        procedure_name: proc.name,
        modality: proc.modality,
        accession_number: accessionNumber,
        sequence_number: i + 1,
        loinc_code: proc.loinc_code,
        loinc_name: proc.loinc_name,
        status: 'created'
      });

      procedures.push(procedure);
    }

    return {
      order,
      procedures
    };
  } catch (error) {
    console.error('[intakeService] Failed to create order with procedures:', error);
    throw error;
  }
}

/**
 * Create a single procedure for an order
 * @param {Object} procedureData - Procedure data
 * @returns {Promise<Object>} Created procedure
 */
export async function createProcedure(procedureData) {
  try {
    const response = await client.post('/order-procedures', procedureData);
    return response;
  } catch (error) {
    console.warn('[intakeService] Failed to create procedure (backend unavailable):', error);
    // Mock response
    return {
      id: 'proc-' + Date.now(),
      ...procedureData,
      created_at: new Date().toISOString()
    };
  }
}

/**
 * Get procedures for an order
 * @param {string} orderId - Order ID
 * @returns {Promise<Array>} List of procedures
 */
export async function getOrderProcedures(orderId) {
  try {
    const response = await client.get(`/orders/${orderId}/procedures`);
    return response || [];
  } catch (error) {
    console.warn('[intakeService] Failed to get order procedures (backend unavailable):', error);
    return [];
  }
}

/**
 * Schedule a procedure
 * @param {string} procedureId - Procedure ID
 * @param {Object} scheduleData - Schedule data
 * @returns {Promise<Object>} Updated procedure
 */
export async function scheduleProcedure(procedureId, scheduleData) {
  try {
    const response = await client.put(`/order-procedures/${procedureId}`, {
      scheduled_at: scheduleData.scheduled_at,
      modality: scheduleData.modality,
      status: 'scheduled'
    });
    return response;
  } catch (error) {
    console.warn('[intakeService] Failed to schedule procedure (backend unavailable):', error);
    return {
      id: procedureId,
      ...scheduleData,
      status: 'scheduled',
      updated_at: new Date().toISOString()
    };
  }
}

/**
 * Check-in patient for a procedure
 * @param {string} procedureId - Procedure ID
 * @returns {Promise<Object>} Updated procedure
 */
export async function checkInProcedure(procedureId) {
  try {
    const response = await client.put(`/order-procedures/${procedureId}`, {
      status: 'arrived'
    });
    return response;
  } catch (error) {
    console.warn('[intakeService] Failed to check-in procedure (backend unavailable):', error);
    return {
      id: procedureId,
      status: 'arrived',
      updated_at: new Date().toISOString()
    };
  }
}

/**
 * Reschedule a procedure
 * @param {string} procedureId - Procedure ID
 * @param {Object} rescheduleData - Reschedule data
 * @returns {Promise<Object>} Updated procedure
 */
export async function rescheduleProcedure(procedureId, rescheduleData) {
  try {
    const response = await client.put(`/order-procedures/${procedureId}`, {
      scheduled_at: rescheduleData.scheduled_at,
      status: 'scheduled',
      details: {
        reschedule_history: rescheduleData.history
      }
    });
    return response;
  } catch (error) {
    console.warn('[intakeService] Failed to reschedule procedure (backend unavailable):', error);
    return {
      id: procedureId,
      scheduled_at: rescheduleData.scheduled_at,
      status: 'scheduled',
      updated_at: new Date().toISOString()
    };
  }
}

/**
 * Cancel a procedure
 * @param {string} procedureId - Procedure ID
 * @param {string} reason - Cancellation reason
 * @returns {Promise<Object>} Updated procedure
 */
export async function cancelProcedure(procedureId, reason) {
  try {
    const response = await client.put(`/order-procedures/${procedureId}`, {
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_reason: reason
    });
    return response;
  } catch (error) {
    console.warn('[intakeService] Failed to cancel procedure (backend unavailable):', error);
    return {
      id: procedureId,
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_reason: reason
    };
  }
}

export async function getIntakeStatistics() {
  try {
    const response = await client.get('/intake/statistics');
    const stats = response || {
      total_pending: 0,
      scheduled_today: 0,
      awaiting_checkin: 0,
      overdue: 0
    };
    console.log('[intakeService] Loaded statistics from backend:', stats);
    return stats;
  } catch (error) {
    console.warn('[intakeService] Failed to get statistics (backend unavailable), using mock data:', error);
    
    // Calculate mock stats from local orders
    try {
      const allOrders = await orderService.listOrders();
      const today = new Date().toISOString().slice(0, 10);
      
      const stats = {
        total_pending: allOrders.filter(o => o.status === 'created').length,
        scheduled_today: allOrders.filter(o => 
          o.status === 'scheduled' && 
          o.scheduled_start_at && 
          o.scheduled_start_at.startsWith(today)
        ).length,
        awaiting_checkin: allOrders.filter(o => o.status === 'scheduled').length,
        overdue: allOrders.filter(o => 
          o.status === 'scheduled' && 
          o.scheduled_start_at && 
          o.scheduled_start_at < today
        ).length
      };
      console.log('[intakeService] Calculated mock statistics:', stats);
      return stats;
    } catch (mockError) {
      console.error('[intakeService] Failed to calculate mock statistics:', mockError);
      return {
        total_pending: 0,
        scheduled_today: 0,
        awaiting_checkin: 0,
        overdue: 0
      };
    }
  }
}

/**
 * Update order status
 * @param {string} orderId - Order ID
 * @param {string} newStatus - New status
 * @returns {Promise<Object>} Updated order
 */
export async function updateOrderStatus(orderId, newStatus) {
  try {
    const response = await client.put(`/orders/${orderId}`, {
      status: newStatus,
      updated_at: new Date().toISOString()
    });
    return response;
  } catch (error) {
    console.warn('[intakeService] Failed to update order status (backend unavailable):', error);
    // Fallback to orderService
    return await orderService.updateOrder(orderId, { status: newStatus });
  }
}

export default {
  getIncomingOrders,
  createOrderWithProcedures,
  createProcedure,
  getOrderProcedures,
  scheduleProcedure,
  checkInProcedure,
  rescheduleProcedure,
  cancelProcedure,
  getIntakeStatistics,
  updateOrderStatus
};
