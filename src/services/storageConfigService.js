import { apiClient } from './http';

const DEMO_MODE = false;

export const storageConfigService = {
  async listBackends(tenantId = null) {
    const client = apiClient('satusehatMonitor');
    try {
      let url = '/api/storage-backends';
      if (tenantId) url += `?tenant_id=${tenantId}`;
      const response = await client.get(url);
      return response;
    } catch (error) {
      console.error('[storageConfigService] Failed to list backends:', error);
      if (DEMO_MODE) {
        return [
          {
            id: 'backend-1',
            name: 'Local Default',
            type: 'local',
            config: { base_path: '/var/lib/pacs/storage' },
            is_active: true,
            tenant_id: tenantId
          }
        ];
      }
      throw error;
    }
  },

  async createBackend(data) {
    const client = apiClient('satusehatMonitor');
    try {
      const response = await client.post('/api/storage-backends', data);
      return response;
    } catch (error) {
      console.error('[storageConfigService] Failed to create backend:', error);
      throw error;
    }
  },

  async updateBackend(backendId, data) {
    const client = apiClient('satusehatMonitor');
    try {
      const response = await client.patch(`/api/storage-backends/${backendId}`, data);
      return response;
    } catch (error) {
      console.error('[storageConfigService] Failed to update backend:', error);
      throw error;
    }
  },

  async deleteBackend(backendId) {
    const client = apiClient('satusehatMonitor');
    try {
      const response = await client.delete(`/api/storage-backends/${backendId}`);
      return response;
    } catch (error) {
      console.error('[storageConfigService] Failed to delete backend:', error);
      throw error;
    }
  },

  async getUsageStats() {
    const client = apiClient('satusehatMonitor');
    try {
      const response = await client.get('/api/storage-backends/usage-stats');
      return response;
    } catch (error) {
      console.error('[storageConfigService] Failed to get usage stats:', error);
      if (DEMO_MODE) {
        return [
          {
            tenant_id: 'demo-tenant-1',
            tenant_name: 'RSUPN Cipto Mangunkusumo',
            study_count: 1250,
            total_bytes: 53687091200,
            total_gb: 50.0
          },
          {
            tenant_id: 'demo-tenant-2',
            tenant_name: 'RSUD Dr. Soetomo',
            study_count: 840,
            total_bytes: 32212254720,
            total_gb: 30.0
          }
        ];
      }
      throw error;
    }
  },

  // ============== MIGRATION METHODS ==============
  
  /**
   * Create a new storage migration job
   * @param {Object} data - Migration config
   * @param {string} data.tenant_id - Tenant ID
   * @param {string} data.from_storage_id - Source storage backend ID
   * @param {string} data.to_storage_id - Target storage backend ID
   * @param {string} data.scope - 'tenant', 'patient', 'study', 'date_range'
   * @param {Object} data.filter - Filter criteria based on scope
   */
  async createMigration(data) {
    const client = apiClient('satusehatMonitor');
    try {
      const response = await client.post('/api/storage-migrations', data);
      return response;
    } catch (error) {
      console.error('[storageConfigService] Failed to create migration:', error);
      throw error;
    }
  },

  /**
   * Get list of storage migrations
   * @param {string} tenantId - Optional tenant filter
   * @param {string} status - Optional status filter
   */
  async listMigrations(tenantId = null, status = null) {
    const client = apiClient('satusehatMonitor');
    try {
      let url = '/api/storage-migrations';
      const params = [];
      if (tenantId) params.push(`tenant_id=${tenantId}`);
      if (status) params.push(`status=${status}`);
      if (params.length > 0) url += '?' + params.join('&');
      const response = await client.get(url);
      return response;
    } catch (error) {
      console.error('[storageConfigService] Failed to list migrations:', error);
      throw error;
    }
  },

  /**
   * Get migration status by ID
   * @param {string} migrationId - Migration ID
   */
  async getMigration(migrationId) {
    const client = apiClient('satusehatMonitor');
    try {
      const response = await client.get(`/api/storage-migrations/${migrationId}`);
      return response;
    } catch (error) {
      console.error('[storageConfigService] Failed to get migration:', error);
      throw error;
    }
  },

  /**
   * Cancel a running migration
   * @param {string} migrationId - Migration ID
   */
  async cancelMigration(migrationId) {
    const client = apiClient('satusehatMonitor');
    try {
      const response = await client.post(`/api/storage-migrations/${migrationId}/cancel`);
      return response;
    } catch (error) {
      console.error('[storageConfigService] Failed to cancel migration:', error);
      throw error;
    }
  },

  /**
   * Get storage backend with extended info (including connection_type, access_endpoint)
   * @param {string} backendId - Storage backend ID
   */
  async getBackendDetails(backendId) {
    const client = apiClient('satusehatMonitor');
    try {
      const response = await client.get(`/api/storage-backends/${backendId}/details`);
      return response;
    } catch (error) {
      console.error('[storageConfigService] Failed to get backend details:', error);
      throw error;
    }
  },

  /**
   * Test connection to a storage backend
   * @param {Object} config - Storage config to test
   */
  async testConnection(config) {
    const client = apiClient('satusehatMonitor');
    try {
      const response = await client.post('/api/storage-backends/test-connection', config);
      return response;
    } catch (error) {
      console.error('[storageConfigService] Failed to test connection:', error);
      throw error;
    }
  },

  /**
   * Get study storage locations (which storage contains each study)
   * @param {string} tenantId - Tenant ID
   * @param {string} patientId - Optional patient filter
   */
  async getStudyStorageLocations(tenantId, patientId = null) {
    const client = apiClient('satusehatMonitor');
    try {
      let url = `/api/storage-locations?tenant_id=${tenantId}`;
      if (patientId) url += `&patient_id=${patientId}`;
      const response = await client.get(url);
      return response;
    } catch (error) {
      console.error('[storageConfigService] Failed to get study locations:', error);
      throw error;
    }
  },

  // ============== HEALTH MONITORING METHODS ==============

  /**
   * Get health summary for all storage backends
   */
  async getHealthSummary() {
    const client = apiClient('satusehatMonitor');
    try {
      const response = await client.get('/api/storage-health/summary');
      return response;
    } catch (error) {
      console.error('[storageConfigService] Failed to get health summary:', error);
      throw error;
    }
  },

  /**
   * Trigger a manual health check for a specific backend
   * @param {string} backendId - Storage backend ID
   */
  async triggerHealthCheck(backendId) {
    const client = apiClient('satusehatMonitor');
    try {
      const response = await client.post(`/api/storage-health/${backendId}/check`);
      return response;
    } catch (error) {
      console.error('[storageConfigService] Failed to trigger health check:', error);
      throw error;
    }
  },

  /**
   * Get historical health records for a backend
   * @param {string} backendId - Storage backend ID
   * @param {number} limit - Result limit
   */
  async getHealthHistory(backendId, limit = 50) {
    const client = apiClient('satusehatMonitor');
    try {
      const response = await client.get(`/api/storage-health/${backendId}/history?limit=${limit}`);
      return response;
    } catch (error) {
      console.error('[storageConfigService] Failed to get health history:', error);
      throw error;
    }
  }
};

export default storageConfigService;
