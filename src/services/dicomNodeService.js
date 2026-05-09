import { apiClient } from './http';
import { notify } from './notifications';

export const dicomNodeService = {
  /**
   * List all DICOM nodes
   */
  async listNodes(filters = {}) {
    try {
      const client = apiClient('nodes');
      const params = new URLSearchParams();
      if (filters.node_type) params.append('node_type', filters.node_type);
      if (filters.is_active !== undefined) params.append('is_active', filters.is_active);
      
      const path = params.toString() ? `/api/dicom/nodes?${params}` : '/api/dicom/nodes';
      return await client.get(path);
    } catch (error) {
      notify({ type: 'error', message: `Failed to load DICOM nodes: ${error.message}` });
      throw error;
    }
  },

  /**
   * Get a single DICOM node by ID
   */
  async getNode(id) {
    try {
      const client = apiClient('nodes');
      return await client.get(`/api/dicom/nodes/${id}`);
    } catch (error) {
      notify({ type: 'error', message: `Failed to load DICOM node: ${error.message}` });
      throw error;
    }
  },

  /**
   * Create a new DICOM node
   */
  async createNode(data) {
    try {
      const client = apiClient('nodes');
      return await client.post('/api/dicom/nodes', data);
    } catch (error) {
      notify({ type: 'error', message: `Failed to create DICOM node: ${error.message}` });
      throw error;
    }
  },

  /**
   * Update an existing DICOM node
   */
  async updateNode(id, data) {
    try {
      const client = apiClient('nodes');
      return await client.put(`/api/dicom/nodes/${id}`, data);
    } catch (error) {
      notify({ type: 'error', message: `Failed to update DICOM node: ${error.message}` });
      throw error;
    }
  },

  /**
   * Delete a DICOM node
   */
  async deleteNode(id) {
    try {
      const client = apiClient('nodes');
      await client.delete(`/api/dicom/nodes/${id}`);
      return { success: true };
    } catch (error) {
      notify({ type: 'error', message: `Failed to delete DICOM node: ${error.message}` });
      throw error;
    }
  },

  /**
   * Test connection to a DICOM node (C-ECHO)
   */
  async testConnection(id) {
    try {
      const client = apiClient('nodes');
      return await client.post(`/api/dicom/nodes/${id}/test`);
    } catch (error) {
      notify({ type: 'error', message: `Connection test failed: ${error.message}` });
      throw error;
    }
  },

  /**
   * Test connection without saving (for validation during creation)
   */
  async testConnectionDirect(ae_title, host, port, timeout = 30) {
    try {
      const client = apiClient('nodes');
      const params = new URLSearchParams({
        ae_title,
        host,
        port: port.toString(),
        timeout: timeout.toString()
      });
      return await client.post(`/api/dicom/nodes/test-connection?${params}`);
    } catch (error) {
      notify({ type: 'error', message: `Connection test failed: ${error.message}` });
      throw error;
    }
  },

  /**
   * Deploy an isolated container for a tenant node
   */
  async deployNode(id) {
    try {
      const client = apiClient('nodes');
      return await client.post(`/api/dicom/nodes/${id}/deploy`);
    } catch (error) {
      notify({ type: 'error', message: `Deployment failed: ${error.message}` });
      throw error;
    }
  },

  /**
   * Destroy the isolated container for a tenant node
   */
  async destroyNode(id) {
    try {
      const client = apiClient('nodes');
      return await client.post(`/api/dicom/nodes/${id}/destroy`);
    } catch (error) {
      notify({ type: 'error', message: `Failed to destroy node: ${error.message}` });
      throw error;
    }
  }
};


