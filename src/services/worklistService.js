/**
 * Worklist Service
 * Handles DICOM Modality Worklist (MWL) operations
 * Based on WORKLIST_SYSTEM_DOCUMENTATION.md
 */

import { fetchJson, apiClient } from './http';
import { loadRegistry } from './api-registry';
import { notify } from './notifications';
import { getAuthHeader } from './auth-storage';

/**
 * Status definitions from documentation
 */
export const ORDER_STATUS = {
  DRAFT: 'draft',
  CREATED: 'created',
  SCHEDULED: 'scheduled',
  ENQUEUED: 'enqueued',
  RESCHEDULED: 'rescheduled',
  ARRIVED: 'arrived',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  REPORTED: 'reported',
  FINALIZED: 'finalized',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  DISCONTINUED: 'discontinued',
  NO_SHOW: 'no_show'
};

export const SPS_STATUS = {
  SCHEDULED: 'SCHEDULED',
  ARRIVED: 'ARRIVED',
  STARTED: 'STARTED',
  COMPLETED: 'COMPLETED',
  DISCONTINUED: 'DISCONTINUED'
};

export const PRIORITY = {
  STAT: 'stat',
  HIGH: 'high',
  URGENT: 'urgent',
  ROUTINE: 'routine',
  MEDIUM: 'medium',
  LOW: 'low'
};

/**
 * Status display configuration
 */
export const STATUS_CONFIG = {
  [ORDER_STATUS.DRAFT]: {
    label: 'Draft',
    color: 'gray',
    icon: '📝',
    description: 'Order being created'
  },
  [ORDER_STATUS.CREATED]: {
    label: 'Created',
    color: 'blue',
    icon: '📋',
    description: 'Order created, awaiting scheduling'
  },
  [ORDER_STATUS.SCHEDULED]: {
    label: 'Scheduled',
    color: 'indigo',
    icon: '📅',
    description: 'Order scheduled'
  },
  [ORDER_STATUS.ENQUEUED]: {
    label: 'Enqueued',
    color: 'purple',
    icon: '⏳',
    description: 'In queue for today'
  },
  [ORDER_STATUS.RESCHEDULED]: {
    label: 'Rescheduled',
    color: 'yellow',
    icon: '🔄',
    description: 'Order rescheduled'
  },
  [ORDER_STATUS.ARRIVED]: {
    label: 'Arrived',
    color: 'cyan',
    icon: '✅',
    description: 'Patient checked in'
  },
  [ORDER_STATUS.IN_PROGRESS]: {
    label: 'In Progress',
    color: 'blue',
    icon: '🔄',
    description: 'Examination in progress'
  },
  [ORDER_STATUS.COMPLETED]: {
    label: 'Completed',
    color: 'green',
    icon: '✔️',
    description: 'Examination completed'
  },
  [ORDER_STATUS.REPORTED]: {
    label: 'Reported',
    color: 'teal',
    icon: '📄',
    description: 'Report created'
  },
  [ORDER_STATUS.FINALIZED]: {
    label: 'Finalized',
    color: 'emerald',
    icon: '✍️',
    description: 'Report signed'
  },
  [ORDER_STATUS.DELIVERED]: {
    label: 'Delivered',
    color: 'green',
    icon: '📬',
    description: 'Result delivered'
  },
  [ORDER_STATUS.CANCELLED]: {
    label: 'Cancelled',
    color: 'red',
    icon: '❌',
    description: 'Order cancelled'
  },
  [ORDER_STATUS.DISCONTINUED]: {
    label: 'Discontinued',
    color: 'red',
    icon: '⏹️',
    description: 'Procedure discontinued'
  },
  [ORDER_STATUS.NO_SHOW]: {
    label: 'No Show',
    color: 'orange',
    icon: '⚠️',
    description: 'Patient did not arrive'
  }
};

/**
 * Priority display configuration
 */
export const PRIORITY_CONFIG = {
  [PRIORITY.STAT]: {
    label: 'STAT',
    color: 'red',
    icon: '🚨',
    weight: 5
  },
  [PRIORITY.HIGH]: {
    label: 'High',
    color: 'orange',
    icon: '⚡',
    weight: 4
  },
  [PRIORITY.URGENT]: {
    label: 'Urgent',
    color: 'orange',
    icon: '⚡',
    weight: 4
  },
  [PRIORITY.ROUTINE]: {
    label: 'Routine',
    color: 'blue',
    icon: '📋',
    weight: 3
  },
  [PRIORITY.MEDIUM]: {
    label: 'Medium',
    color: 'gray',
    icon: '📄',
    weight: 2
  },
  [PRIORITY.LOW]: {
    label: 'Low',
    color: 'gray',
    icon: '📄',
    weight: 1
  }
};

/**
 * Get worklist items
 */
export async function getWorklist(filters = {}) {
  const registry = loadRegistry();
  const worklistConfig = registry.worklist || { enabled: false };
  
  try {
    if (worklistConfig.enabled) {
      const params = new URLSearchParams();
      if (filters.date) params.append('date', filters.date);
      if (filters.modality) params.append('modality', filters.modality);
      if (filters.status) params.append('status', filters.status);
      if (filters.priority) params.append('priority', filters.priority);
      if (filters.search) params.append('search', filters.search);
      
      const client = apiClient('worklist');
      const queryString = params.toString() ? `?${params.toString()}` : '';
      return await client.get(`/worklists${queryString}`);
    }
    
    // Fallback to mock data
    const worklistModule = await import('../data/worklist.json');
    let worklist = worklistModule.default || [];
    
    // Apply filters
    if (filters.date) {
      worklist = worklist.filter(item => 
        item.scheduled_date === filters.date
      );
    }
    if (filters.modality) {
      worklist = worklist.filter(item => 
        item.modality === filters.modality
      );
    }
    if (filters.status) {
      worklist = worklist.filter(item => 
        item.status === filters.status
      );
    }
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      worklist = worklist.filter(item =>
        item.patient_name?.toLowerCase().includes(searchLower) ||
        item.accession_no?.toLowerCase().includes(searchLower) ||
        item.order_number?.toLowerCase().includes(searchLower) ||
        item.patient_id?.toLowerCase().includes(searchLower)
      );
    }
    
    return worklist;
  } catch (error) {
    console.error('Failed to fetch worklist:', error);
    notify({ type: 'error', message: `Failed to fetch worklist: ${error.message}` });
    throw error;
  }
}

/**
 * Get worklist item by ID
 */
export async function getWorklistItem(id) {
  const registry = loadRegistry();
  const worklistConfig = registry.worklist || { enabled: false };
  
  try {
    if (worklistConfig.enabled) {
      const client = apiClient('worklist');
      return await client.get(`/worklists/${id}`);
    }
    
    // Fallback to mock data
    const worklistModule = await import('../data/worklist.json');
    const worklist = worklistModule.default || [];
    const item = worklist.find(w => w.id === id);
    
    if (!item) {
      throw new Error('Worklist item not found');
    }
    
    return item;
  } catch (error) {
    console.error('Failed to fetch worklist item:', error);
    notify({ type: 'error', message: `Failed to fetch worklist item: ${error.message}` });
    throw error;
  }
}

/**
 * Get auth headers for orders API
 */
function getOrdersAuthHeaders() {
  // Try to get from auth-storage first
  const stored = getAuthHeader() || {};
  if (stored.Authorization) {
    return stored;
  }

  // Fallback to environment variable
  const fallbackToken = import.meta.env?.VITE_ORDERS_API_TOKEN;
  if (fallbackToken) {
    return { Authorization: `Bearer ${fallbackToken}` };
  }

  return {};
}

/**
 * Update order status
 */
/**
 * Map internal order status to SPS status
 */
function mapStatusToSps(status) {
  const map = {
    [ORDER_STATUS.SCHEDULED]: SPS_STATUS.SCHEDULED,
    [ORDER_STATUS.ARRIVED]: SPS_STATUS.ARRIVED,
    [ORDER_STATUS.IN_PROGRESS]: SPS_STATUS.STARTED,
    [ORDER_STATUS.COMPLETED]: SPS_STATUS.COMPLETED,
    [ORDER_STATUS.CANCELLED]: SPS_STATUS.DISCONTINUED
  };
  return map[status];
}

/**
 * Update order status
 */
export async function updateOrderStatus(worklistId, status, notes = '') {
  try {
    // Check if this is a supported SPS status transition
    const spsStatus = mapStatusToSps(status);
    
    if (spsStatus) {
      // It's a worklist status update
      const client = apiClient('worklist');
      return await client.patch(`/worklists/${worklistId}/status`, { 
        status: spsStatus, 
        changed_by: 'user', // TODO: Get actual user
        reason: notes 
      });
    }

    // Fallback for non-SPS statuses (like REPORTED, FINALIZED) which might still live in Order Service?
    const client = apiClient('orders');
    return await client.patch(`/orders/${worklistId}/status`, { status, notes });
  } catch (error) {
    console.error('Failed to update order status:', error);
    notify({ type: 'error', message: `Failed to update status: ${error.message}` });
    throw error;
  }
}

/**
 * Reschedule order
 */
export async function rescheduleOrder(worklistId, newScheduledAt, reason = '') {
  try {
    const client = apiClient('worklist');
    
    // Parse date and time "YYYY-MM-DD HH:MM"
    const [datePart, timePart] = newScheduledAt.split(' ');
    
    return await client.patch(`/worklists/${worklistId}`, { 
      scheduled_date: datePart,
      scheduled_time: timePart
    });
  } catch (error) {
    console.error('Failed to reschedule order:', error);
    notify({ type: 'error', message: `Failed to reschedule: ${error.message}` });
    throw error;
  }
}

/**
 * Cancel order
 */
export async function cancelOrder(worklistId, reason = '') {
  try {
    const client = apiClient('worklist');
    
    return await client.patch(`/worklists/${worklistId}/status`, { 
      status: 'DISCONTINUED', 
      changed_by: 'user',
      reason 
    });
  } catch (error) {
    console.error('Failed to cancel order:', error);
    notify({ type: 'error', message: `Failed to cancel order: ${error.message}` });
    throw error;
  }
}

/**
 * Get available schedule slots
 */
export async function getAvailableSlots(modalityId, date) {
  const registry = loadRegistry();
  const worklistConfig = registry.worklist || { enabled: false };
  
  try {
    if (worklistConfig.enabled) {
      const params = new URLSearchParams();
      if (modalityId) params.append('modality_id', modalityId);
      if (date) params.append('date', date);
      
      const baseUrl = worklistConfig.baseUrl || import.meta.env.VITE_MAIN_API_BACKEND_URL || '';
      return await fetchJson(`${baseUrl}/api/schedule/slots?${params.toString()}`);
    }
    
    // Mock mode: generate sample slots
    const slots = [];
    const startHour = 8;
    const endHour = 17;
    const slotDuration = 30; // minutes
    
    for (let hour = startHour; hour < endHour; hour++) {
      for (let minute = 0; minute < 60; minute += slotDuration) {
        const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        slots.push({
          id: `slot-${hour}-${minute}`,
          slot_date: date,
          slot_start_time: timeStr,
          slot_end_time: `${hour}:${minute + slotDuration}`,
          duration_minutes: slotDuration,
          is_available: Math.random() > 0.3, // 70% available
          max_capacity: 1,
          current_bookings: 0
        });
      }
    }
    
    return { slots };
  } catch (error) {
    console.error('Failed to fetch available slots:', error);
    notify({ type: 'error', message: `Failed to fetch slots: ${error.message}` });
    throw error;
  }
}

/**
 * Book schedule slot
 */
export async function bookSlot(slotId, orderId) {
  const registry = loadRegistry();
  const worklistConfig = registry.worklist || { enabled: false };
  
  try {
    if (worklistConfig.enabled) {
      const baseUrl = worklistConfig.baseUrl || import.meta.env.VITE_MAIN_API_BACKEND_URL || '';
      return await fetchJson(`${baseUrl}/api/schedule/slots/${slotId}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId })
      });
    }
    
    // Mock mode: just return success
    notify({ type: 'success', message: 'Slot booked successfully' });
    return { success: true, slot_id: slotId, order_id: orderId };
  } catch (error) {
    console.error('Failed to book slot:', error);
    notify({ type: 'error', message: `Failed to book slot: ${error.message}` });
    throw error;
  }
}

/**
 * Get worklist summary/statistics
 */
export async function getWorklistSummary(date = null) {
  const registry = loadRegistry();
  const worklistConfig = registry.worklist || { enabled: false };
  
  try {
    if (worklistConfig.enabled) {
      try {
        const client = apiClient('worklist');
        const params = date ? `?date=${date}` : '';
        return await client.get(`/worklists/summary${params}`);
      } catch (summaryError) {
        // Summary endpoint might not exist, return empty so UI calculates from worklist data
        console.debug('Worklist summary endpoint not available, will derive from worklist data');
        return { total: 0, by_status: {}, by_modality: {}, by_priority: {} };
      }
    }
    
    // Mock mode: calculate from worklist data
    const worklist = await getWorklist({ date });
    
    const summary = {
      total: worklist.length,
      by_status: {},
      by_modality: {},
      by_priority: {}
    };
    
    worklist.forEach(item => {
      // Count by status
      summary.by_status[item.status] = (summary.by_status[item.status] || 0) + 1;
      
      // Count by modality
      summary.by_modality[item.modality] = (summary.by_modality[item.modality] || 0) + 1;
      
      // Count by priority
      summary.by_priority[item.priority] = (summary.by_priority[item.priority] || 0) + 1;
    });
    
    return summary;
  } catch (error) {
    console.error('Failed to fetch worklist summary:', error);
    return { total: 0, by_status: {}, by_modality: {}, by_priority: {} };
  }
}

/**
 * Get status badge configuration
 */
export function getStatusBadge(status) {
  return STATUS_CONFIG[status] || {
    label: status,
    color: 'gray',
    icon: '❓',
    description: 'Unknown status'
  };
}

/**
 * Get priority badge configuration
 */
export function getPriorityBadge(priority) {
  return PRIORITY_CONFIG[priority] || {
    label: priority,
    color: 'gray',
    icon: '📄',
    weight: 0
  };
}

/**
 * Check if status transition is allowed
 */
export function isStatusTransitionAllowed(currentStatus, newStatus) {
  const transitions = {
    [ORDER_STATUS.DRAFT]: [ORDER_STATUS.CREATED, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.CREATED]: [ORDER_STATUS.SCHEDULED, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.SCHEDULED]: [ORDER_STATUS.ENQUEUED, ORDER_STATUS.RESCHEDULED, ORDER_STATUS.ARRIVED, ORDER_STATUS.CANCELLED, ORDER_STATUS.NO_SHOW],
    [ORDER_STATUS.ENQUEUED]: [ORDER_STATUS.RESCHEDULED, ORDER_STATUS.ARRIVED, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.RESCHEDULED]: [ORDER_STATUS.SCHEDULED, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.ARRIVED]: [ORDER_STATUS.IN_PROGRESS, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.IN_PROGRESS]: [ORDER_STATUS.COMPLETED, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.COMPLETED]: [ORDER_STATUS.REPORTED],
    [ORDER_STATUS.REPORTED]: [ORDER_STATUS.FINALIZED],
    [ORDER_STATUS.FINALIZED]: [ORDER_STATUS.DELIVERED],
    [ORDER_STATUS.NO_SHOW]: [ORDER_STATUS.RESCHEDULED],
    [ORDER_STATUS.CANCELLED]: [],
    [ORDER_STATUS.DISCONTINUED]: [],
    [ORDER_STATUS.DELIVERED]: []
  };
  
  return transitions[currentStatus]?.includes(newStatus) || false;
}

/**
 * Get available status transitions for current status
 */
export function getAvailableTransitions(currentStatus) {
  const transitions = {
    [ORDER_STATUS.DRAFT]: [
      { status: ORDER_STATUS.CREATED, label: 'Complete Order', icon: '✅' }
    ],
    [ORDER_STATUS.CREATED]: [
      { status: ORDER_STATUS.SCHEDULED, label: 'Schedule', icon: '📅' }
    ],
    [ORDER_STATUS.SCHEDULED]: [
      { status: ORDER_STATUS.ARRIVED, label: 'Check In', icon: '✅' },
      { status: ORDER_STATUS.RESCHEDULED, label: 'Reschedule', icon: '🔄' },
      { status: ORDER_STATUS.NO_SHOW, label: 'Mark No Show', icon: '⚠️' }
    ],
    [ORDER_STATUS.ARRIVED]: [
      { status: ORDER_STATUS.IN_PROGRESS, label: 'Start Exam', icon: '▶️' }
    ],
    [ORDER_STATUS.IN_PROGRESS]: [
      { status: ORDER_STATUS.COMPLETED, label: 'Complete Exam', icon: '✔️' }
    ],
    [ORDER_STATUS.COMPLETED]: [
      { status: ORDER_STATUS.REPORTED, label: 'Create Report', icon: '📄' }
    ],
    [ORDER_STATUS.REPORTED]: [
      { status: ORDER_STATUS.FINALIZED, label: 'Sign Report', icon: '✍️' }
    ],
    [ORDER_STATUS.FINALIZED]: [
      { status: ORDER_STATUS.DELIVERED, label: 'Deliver Result', icon: '📬' }
    ],
    [ORDER_STATUS.NO_SHOW]: [
      { status: ORDER_STATUS.RESCHEDULED, label: 'Reschedule', icon: '🔄' }
    ]
  };
  
  return transitions[currentStatus] || [];
}

export default {
  getWorklist,
  getWorklistItem,
  updateOrderStatus,
  rescheduleOrder,
  cancelOrder,
  getAvailableSlots,
  bookSlot,
  getWorklistSummary,
  getStatusBadge,
  getPriorityBadge,
  isStatusTransitionAllowed,
  getAvailableTransitions,
  ORDER_STATUS,
  SPS_STATUS,
  PRIORITY,
  STATUS_CONFIG,
  PRIORITY_CONFIG
};
