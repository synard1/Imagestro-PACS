/**
 * Mock Audit Log Service for Unified SIMRS Integration
 * 
 * Provides mock audit log functionality for UI development and testing.
 * 
 * Requirements: 18.5
 */

import { MOCK_AUDIT_LOGS, AUDIT_ACTIONS, MOCK_EXTERNAL_SYSTEMS } from './mockData';
import { logger } from '../../utils/logger';

// Simulated network delay range (ms)
const MIN_DELAY = 200;
const MAX_DELAY = 500;

/**
 * Simulate network delay
 */
const simulateDelay = () => {
  const delay = Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY + 1)) + MIN_DELAY;
  return new Promise(resolve => setTimeout(resolve, delay));
};

// In-memory audit log data (copy of mock data for mutations)
let auditLogs = [...MOCK_AUDIT_LOGS];

/**
 * Reset mock data to initial state
 */
export function resetMockData() {
  auditLogs = [...MOCK_AUDIT_LOGS];
}

/**
 * Get unique users from audit logs
 * @returns {Array} List of unique users
 */
export async function getAuditLogUsers() {
  await simulateDelay();
  
  const usersMap = new Map();
  auditLogs.forEach(log => {
    if (log.user_id && !usersMap.has(log.user_id)) {
      usersMap.set(log.user_id, {
        id: log.user_id,
        username: log.username,
      });
    }
  });
  
  return Array.from(usersMap.values());
}

/**
 * List audit logs with filtering and pagination
 * @param {string} systemId - External system ID (optional, null for all systems)
 * @param {Object} params - Query parameters
 * @returns {Object} Paginated audit log results
 */
export async function listAuditLogs(systemId, params = {}) {
  await simulateDelay();
  
  const {
    startDate,
    endDate,
    action,
    userId,
    search,
    page = 1,
    pageSize = 10,
  } = params;

  logger.debug('[MockAuditLogService]', 'Listing audit logs', { systemId, params });

  // Filter logs
  let filtered = [...auditLogs];

  // Filter by system ID if provided
  if (systemId) {
    filtered = filtered.filter(log => log.external_system_id === systemId);
  }

  // Filter by date range
  if (startDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    filtered = filtered.filter(log => new Date(log.timestamp) >= start);
  }

  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    filtered = filtered.filter(log => new Date(log.timestamp) <= end);
  }

  // Filter by action type
  if (action && action !== 'all') {
    filtered = filtered.filter(log => log.action === action);
  }

  // Filter by user
  if (userId && userId !== 'all') {
    filtered = filtered.filter(log => log.user_id === userId);
  }

  // Search filter (entity_id, username, entity_type)
  if (search) {
    const searchLower = search.toLowerCase();
    filtered = filtered.filter(log =>
      log.entity_id?.toLowerCase().includes(searchLower) ||
      log.username?.toLowerCase().includes(searchLower) ||
      log.entity_type?.toLowerCase().includes(searchLower)
    );
  }

  // Sort by timestamp descending (most recent first)
  filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // Calculate pagination
  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize);
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const items = filtered.slice(startIndex, endIndex);

  // Enrich with system name
  const enrichedItems = items.map(log => {
    const system = MOCK_EXTERNAL_SYSTEMS.find(s => s.id === log.external_system_id);
    return {
      ...log,
      external_system_name: system?.name || 'Unknown System',
      external_system_code: system?.code || '-',
    };
  });

  return {
    items: enrichedItems,
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

/**
 * Get a single audit log entry by ID
 * @param {string} logId - Audit log ID
 * @returns {Object|null} Audit log entry or null
 */
export async function getAuditLogEntry(logId) {
  await simulateDelay();
  
  const log = auditLogs.find(l => l.id === logId);
  
  if (!log) {
    return null;
  }

  const system = MOCK_EXTERNAL_SYSTEMS.find(s => s.id === log.external_system_id);
  
  return {
    ...log,
    external_system_name: system?.name || 'Unknown System',
    external_system_code: system?.code || '-',
  };
}

/**
 * Create a new audit log entry (for internal use during other operations)
 * @param {Object} logData - Audit log data
 * @returns {Object} Created audit log entry
 */
export async function createAuditLogEntry(logData) {
  await simulateDelay();
  
  const newLog = {
    id: `al-${Date.now()}`,
    timestamp: new Date().toISOString(),
    ...logData,
  };

  auditLogs.unshift(newLog);
  
  logger.info('[MockAuditLogService]', 'Created audit log entry', { id: newLog.id });
  
  return newLog;
}

/**
 * Get available action types
 * @returns {Array} List of action types
 */
export function getActionTypes() {
  return AUDIT_ACTIONS;
}

/**
 * Get entity type display name
 * @param {string} entityType - Entity type code
 * @returns {string} Display name
 */
export function getEntityTypeDisplayName(entityType) {
  const displayNames = {
    external_system: 'External System',
    procedure_mapping: 'Procedure Mapping',
    doctor_mapping: 'Doctor Mapping',
    operator_mapping: 'Operator Mapping',
    order: 'Order',
    patient: 'Patient',
  };
  return displayNames[entityType] || entityType;
}

/**
 * Get action display name and color
 * @param {string} action - Action code
 * @returns {Object} Display name and color class
 */
export function getActionDisplay(action) {
  const displays = {
    CREATE: { label: 'Create', colorClass: 'bg-green-100 text-green-800' },
    UPDATE: { label: 'Update', colorClass: 'bg-blue-100 text-blue-800' },
    DELETE: { label: 'Delete', colorClass: 'bg-red-100 text-red-800' },
    IMPORT: { label: 'Import', colorClass: 'bg-purple-100 text-purple-800' },
    SYNC: { label: 'Sync', colorClass: 'bg-yellow-100 text-yellow-800' },
  };
  return displays[action] || { label: action, colorClass: 'bg-gray-100 text-gray-800' };
}

// Default export
export default {
  listAuditLogs,
  getAuditLogEntry,
  getAuditLogUsers,
  createAuditLogEntry,
  getActionTypes,
  getEntityTypeDisplayName,
  getActionDisplay,
  resetMockData,
};
