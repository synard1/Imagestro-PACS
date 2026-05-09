// src/services/auditService.js
import { apiClient } from './http'

// Client for Operational Audit Logs (Local PACS Service)
const client = apiClient('audit')

// Client for Auth Audit Logs (External Auth Service)
const authClient = apiClient('auth_audit')

// --- Operational Audit Logs (Local PACS Service) ---

export async function listLogs(filters = {}) {
  try {
    const { page = 1, limit = 50, ...rest } = filters;
    const queryParams = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      offset: ((page - 1) * limit).toString(),
      ...rest
    });

    // Local PACS Service Endpoint: /audit/logs (baseUrl already includes /api)
    const response = await client.get(`/audit/logs?${queryParams}`);
    
    return {
      logs: response.logs || [],
      pagination: {
        total: response.count || 0,
        limit: response.limit || limit,
        offset: response.offset || 0
      }
    };
  } catch (error) {
    console.error('Failed to list logs:', error);
    throw error;
  }
}

export async function getStats() {
  try {
    // Local PACS Service Endpoint: /audit/stats
    const response = await client.get('/audit/stats');
    return response;
  } catch (error) {
    console.error('Failed to get stats:', error);
    // Fallback to empty stats to prevent UI crash
    return {
      total_events: 0,
      phi_access_count: 0,
      failed_operations: 0,
      unique_users: 0,
      unique_patients: 0
    };
  }
}

export async function listActions() {
  try {
    // Local PACS Service Endpoint: /audit/actions
    const response = await client.get('/audit/actions');
    return response.actions || [];
  } catch (error) {
    console.warn('Failed to fetch actions, using defaults', error);
    return ['LOGIN', 'LOGOUT', 'VIEW_STUDY', 'UPDATE_STUDY', 'DELETE_STUDY', 'EXPORT_DATA', 'PRINT_FILM'];
  }
}

export async function listResourceTypes() {
  try {
    // Local PACS Service Endpoint: /audit/resource-types
    const response = await client.get('/audit/resource-types');
    return response.resource_types || [];
  } catch (error) {
    console.warn('Failed to fetch resource types, using defaults', error);
    return ['auth', 'study', 'series', 'image', 'patient', 'report', 'order'];
  }
}

export async function exportLogs(format, filters) {
  try {
    const queryParams = new URLSearchParams({
      ...filters,
      format
    });
    // Local PACS Service Endpoint: /audit/export
    const response = await client.get(`/audit/export?${queryParams}`, { responseType: 'blob' });
    return response;
  } catch (error) {
    console.error('Failed to export logs:', error);
    throw error;
  }
}

// --- Auth Audit Logs (External Auth Service) ---

export async function listAuthAuditLogs(params = {}) {
  try {
    const { page = 1, limit = 50 } = params
    const queryParams = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString()
    })

    // External Auth Service Endpoint: /auth/audit/logs
    const response = await authClient.get(`/auth/audit/logs?${queryParams}`)

    // Backend returns { data: [...], pagination: {...}, status: 'success' }
    if (response.status === 'success') {
      return {
        data: response.data || [],
        pagination: response.pagination || {}
      }
    }

    // Fallback if format is different
    return {
      data: Array.isArray(response) ? response : (response.data || []),
      pagination: response.pagination || {}
    }
  } catch (error) {
    console.error('Failed to fetch auth audit logs:', error)
    throw error
  }
}

export async function getAuditLog(id) {
  try {
    // This was originally used for Auth Audit Logs
    const response = await authClient.get(`/auth/audit/logs/${id}`)
    return response
  } catch (error) {
    console.error(`Failed to fetch audit log ${id}:`, error)
    throw error
  }
}

// Legacy export for backward compatibility
export async function listAuditLogs() {
  return listAuthAuditLogs();
}

const auditService = {
  listAuditLogs,
  listAuthAuditLogs,
  getAuditLog,
  listLogs,
  getStats,
  listActions,
  listResourceTypes,
  exportLogs
};

export default auditService;
