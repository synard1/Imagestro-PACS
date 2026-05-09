/**
 * Workflow Service
 * Manages PACS workflow states and transitions with localStorage persistence
 */

const STORAGE_KEY = 'pacs_workflow_orders';

/**
 * PACS Workflow States
 * Full workflow from order creation to report delivery
 */
export const WORKFLOW_STATES = {
  // Initial states
  SCHEDULED: 'scheduled',           // Order created, waiting for exam
  ARRIVED: 'arrived',               // Patient arrived at facility
  
  // Exam states
  IN_PROGRESS: 'in_progress',       // Exam in progress
  IMAGE_ACQUIRED: 'image_acquired', // Images captured, not yet sent to PACS
  
  // PACS states  
  IMAGES_RECEIVED: 'images_received', // Images received in PACS
  READY_FOR_READING: 'ready_for_reading', // Ready for radiologist
  
  // Reading states
  READING: 'reading',               // Radiologist reading
  REPORTED: 'reported',             // Report completed
  
  // Final states
  VERIFIED: 'verified',             // Report verified by senior
  DELIVERED: 'delivered',           // Report delivered to referring physician
  
  // Special states
  CANCELLED: 'cancelled',           // Order cancelled
  ON_HOLD: 'on_hold'               // Temporarily on hold
};

/**
 * Workflow state labels for UI
 */
export const WORKFLOW_LABELS = {
  [WORKFLOW_STATES.SCHEDULED]: 'Scheduled',
  [WORKFLOW_STATES.ARRIVED]: 'Patient Arrived',
  [WORKFLOW_STATES.IN_PROGRESS]: 'Exam In Progress',
  [WORKFLOW_STATES.IMAGE_ACQUIRED]: 'Images Acquired',
  [WORKFLOW_STATES.IMAGES_RECEIVED]: 'Images in PACS',
  [WORKFLOW_STATES.READY_FOR_READING]: 'Ready for Reading',
  [WORKFLOW_STATES.READING]: 'Being Read',
  [WORKFLOW_STATES.REPORTED]: 'Report Completed',
  [WORKFLOW_STATES.VERIFIED]: 'Report Verified',
  [WORKFLOW_STATES.DELIVERED]: 'Report Delivered',
  [WORKFLOW_STATES.CANCELLED]: 'Cancelled',
  [WORKFLOW_STATES.ON_HOLD]: 'On Hold'
};

/**
 * Workflow state colors for UI
 */
export const WORKFLOW_COLORS = {
  [WORKFLOW_STATES.SCHEDULED]: 'gray',
  [WORKFLOW_STATES.ARRIVED]: 'blue',
  [WORKFLOW_STATES.IN_PROGRESS]: 'yellow',
  [WORKFLOW_STATES.IMAGE_ACQUIRED]: 'indigo',
  [WORKFLOW_STATES.IMAGES_RECEIVED]: 'purple',
  [WORKFLOW_STATES.READY_FOR_READING]: 'cyan',
  [WORKFLOW_STATES.READING]: 'orange',
  [WORKFLOW_STATES.REPORTED]: 'green',
  [WORKFLOW_STATES.VERIFIED]: 'teal',
  [WORKFLOW_STATES.DELIVERED]: 'emerald',
  [WORKFLOW_STATES.CANCELLED]: 'red',
  [WORKFLOW_STATES.ON_HOLD]: 'amber'
};

/**
 * Valid workflow transitions
 */
export const WORKFLOW_TRANSITIONS = {
  [WORKFLOW_STATES.SCHEDULED]: [
    WORKFLOW_STATES.ARRIVED,
    WORKFLOW_STATES.IN_PROGRESS,
    WORKFLOW_STATES.CANCELLED,
    WORKFLOW_STATES.ON_HOLD
  ],
  [WORKFLOW_STATES.ARRIVED]: [
    WORKFLOW_STATES.IN_PROGRESS,
    WORKFLOW_STATES.CANCELLED,
    WORKFLOW_STATES.ON_HOLD
  ],
  [WORKFLOW_STATES.IN_PROGRESS]: [
    WORKFLOW_STATES.IMAGE_ACQUIRED,
    WORKFLOW_STATES.CANCELLED,
    WORKFLOW_STATES.ON_HOLD
  ],
  [WORKFLOW_STATES.IMAGE_ACQUIRED]: [
    WORKFLOW_STATES.IMAGES_RECEIVED,
    WORKFLOW_STATES.ON_HOLD
  ],
  [WORKFLOW_STATES.IMAGES_RECEIVED]: [
    WORKFLOW_STATES.READY_FOR_READING,
    WORKFLOW_STATES.ON_HOLD
  ],
  [WORKFLOW_STATES.READY_FOR_READING]: [
    WORKFLOW_STATES.READING,
    WORKFLOW_STATES.ON_HOLD
  ],
  [WORKFLOW_STATES.READING]: [
    WORKFLOW_STATES.REPORTED,
    WORKFLOW_STATES.ON_HOLD
  ],
  [WORKFLOW_STATES.REPORTED]: [
    WORKFLOW_STATES.VERIFIED,
    WORKFLOW_STATES.DELIVERED,
    WORKFLOW_STATES.ON_HOLD
  ],
  [WORKFLOW_STATES.VERIFIED]: [
    WORKFLOW_STATES.DELIVERED
  ],
  [WORKFLOW_STATES.ON_HOLD]: [
    WORKFLOW_STATES.SCHEDULED,
    WORKFLOW_STATES.ARRIVED,
    WORKFLOW_STATES.IN_PROGRESS,
    WORKFLOW_STATES.CANCELLED
  ]
};

/**
 * Get workflow orders from localStorage
 */
function getWorkflowOrders() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch (error) {
    console.error('[WorkflowService] Error reading workflow orders:', error);
    return {};
  }
}

/**
 * Save workflow orders to localStorage
 */
function saveWorkflowOrders(orders) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
    return true;
  } catch (error) {
    console.error('[WorkflowService] Error saving workflow orders:', error);
    return false;
  }
}

/**
 * Get workflow state for an order
 */
export function getOrderWorkflowState(orderId) {
  const orders = getWorkflowOrders();
  return orders[orderId] || null;
}

/**
 * Update workflow state for an order
 */
export function updateOrderWorkflowState(orderId, newState, metadata = {}) {
  const orders = getWorkflowOrders();
  const currentState = orders[orderId];
  
  // Validate transition
  if (currentState && currentState.workflow_status) {
    const validTransitions = WORKFLOW_TRANSITIONS[currentState.workflow_status] || [];
    if (!validTransitions.includes(newState) && newState !== currentState.workflow_status) {
      console.warn(`[WorkflowService] Invalid transition from ${currentState.workflow_status} to ${newState}`);
      // Allow it anyway for flexibility in mock mode
    }
  }
  
  // Update state
  orders[orderId] = {
    ...currentState,
    workflow_status: newState,
    updated_at: new Date().toISOString(),
    ...metadata
  };
  
  // Add timestamp for specific states
  const timestamp = new Date().toISOString();
  if (newState === WORKFLOW_STATES.ARRIVED && !orders[orderId].arrived_at) {
    orders[orderId].arrived_at = timestamp;
  } else if (newState === WORKFLOW_STATES.IN_PROGRESS && !orders[orderId].started_at) {
    orders[orderId].started_at = timestamp;
  } else if (newState === WORKFLOW_STATES.IMAGE_ACQUIRED && !orders[orderId].images_acquired_at) {
    orders[orderId].images_acquired_at = timestamp;
  } else if (newState === WORKFLOW_STATES.IMAGES_RECEIVED && !orders[orderId].images_received_at) {
    orders[orderId].images_received_at = timestamp;
  } else if (newState === WORKFLOW_STATES.REPORTED && !orders[orderId].reported_at) {
    orders[orderId].reported_at = timestamp;
  } else if (newState === WORKFLOW_STATES.VERIFIED && !orders[orderId].verified_at) {
    orders[orderId].verified_at = timestamp;
  } else if (newState === WORKFLOW_STATES.DELIVERED && !orders[orderId].delivered_at) {
    orders[orderId].delivered_at = timestamp;
  }
  
  saveWorkflowOrders(orders);
  
  console.log(`[WorkflowService] Order ${orderId} workflow updated to ${newState}`);
  
  return orders[orderId];
}

/**
 * Initialize workflow state for an order
 */
export function initializeOrderWorkflow(order) {
  const orders = getWorkflowOrders();
  
  if (!orders[order.id]) {
    orders[order.id] = {
      order_id: order.id,
      workflow_status: order.workflow_status || WORKFLOW_STATES.SCHEDULED,
      created_at: order.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    saveWorkflowOrders(orders);
    console.log(`[WorkflowService] Initialized workflow for order ${order.id}`);
  }
  
  return orders[order.id];
}

/**
 * Get valid next states for an order
 */
export function getValidNextStates(orderId) {
  const state = getOrderWorkflowState(orderId);
  if (!state || !state.workflow_status) {
    return [WORKFLOW_STATES.SCHEDULED];
  }
  
  return WORKFLOW_TRANSITIONS[state.workflow_status] || [];
}

/**
 * Check if transition is valid
 */
export function isValidTransition(currentState, newState) {
  if (!currentState) return true;
  const validStates = WORKFLOW_TRANSITIONS[currentState] || [];
  return validStates.includes(newState);
}

/**
 * Auto-transition workflow based on events
 */
export function autoTransitionWorkflow(orderId, event, metadata = {}) {
  const currentState = getOrderWorkflowState(orderId);
  const currentStatus = currentState?.workflow_status || WORKFLOW_STATES.SCHEDULED;
  
  let newState = null;
  
  switch (event) {
    case 'patient_arrived':
      if (currentStatus === WORKFLOW_STATES.SCHEDULED) {
        newState = WORKFLOW_STATES.ARRIVED;
      }
      break;
      
    case 'exam_started':
      if ([WORKFLOW_STATES.SCHEDULED, WORKFLOW_STATES.ARRIVED].includes(currentStatus)) {
        newState = WORKFLOW_STATES.IN_PROGRESS;
      }
      break;
      
    case 'images_uploaded':
      if (currentStatus === WORKFLOW_STATES.IN_PROGRESS) {
        newState = WORKFLOW_STATES.IMAGE_ACQUIRED;
      }
      break;
      
    case 'images_stored_in_pacs':
      if (currentStatus === WORKFLOW_STATES.IMAGE_ACQUIRED) {
        newState = WORKFLOW_STATES.IMAGES_RECEIVED;
      }
      break;
      
    case 'ready_for_reading':
      if (currentStatus === WORKFLOW_STATES.IMAGES_RECEIVED) {
        newState = WORKFLOW_STATES.READY_FOR_READING;
      }
      break;
      
    case 'reading_started':
      if (currentStatus === WORKFLOW_STATES.READY_FOR_READING) {
        newState = WORKFLOW_STATES.READING;
      }
      break;
      
    case 'report_completed':
      if (currentStatus === WORKFLOW_STATES.READING) {
        newState = WORKFLOW_STATES.REPORTED;
      }
      break;
      
    case 'report_verified':
      if (currentStatus === WORKFLOW_STATES.REPORTED) {
        newState = WORKFLOW_STATES.VERIFIED;
      }
      break;
      
    case 'report_delivered':
      if ([WORKFLOW_STATES.REPORTED, WORKFLOW_STATES.VERIFIED].includes(currentStatus)) {
        newState = WORKFLOW_STATES.DELIVERED;
      }
      break;
      
    default:
      console.warn(`[WorkflowService] Unknown event: ${event}`);
  }
  
  if (newState) {
    return updateOrderWorkflowState(orderId, newState, metadata);
  }
  
  return currentState;
}

/**
 * Get workflow statistics
 */
export function getWorkflowStatistics() {
  const orders = getWorkflowOrders();
  const stats = {};
  
  Object.values(WORKFLOW_STATES).forEach(state => {
    stats[state] = 0;
  });
  
  Object.values(orders).forEach(order => {
    const state = order.workflow_status || WORKFLOW_STATES.SCHEDULED;
    stats[state] = (stats[state] || 0) + 1;
  });
  
  return stats;
}

/**
 * Clear all workflow data
 */
export function clearWorkflowData() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    console.log('[WorkflowService] Workflow data cleared');
    return true;
  } catch (error) {
    console.error('[WorkflowService] Error clearing workflow data:', error);
    return false;
  }
}

export default {
  WORKFLOW_STATES,
  WORKFLOW_LABELS,
  WORKFLOW_COLORS,
  WORKFLOW_TRANSITIONS,
  getOrderWorkflowState,
  updateOrderWorkflowState,
  initializeOrderWorkflow,
  getValidNextStates,
  isValidTransition,
  autoTransitionWorkflow,
  getWorkflowStatistics,
  clearWorkflowData
};
