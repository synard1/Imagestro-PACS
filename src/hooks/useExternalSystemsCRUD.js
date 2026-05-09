/**
 * useExternalSystemsCRUD Hook
 * 
 * Complete CRUD operations for external systems
 * Handles create, read, update, delete operations
 */

import { useState, useCallback } from 'react';
import {
  listExternalSystems,
  getExternalSystem,
  createExternalSystem,
  updateExternalSystem,
  deleteExternalSystem,
} from '../services/externalSystemsService';
import { logger } from '../utils/logger';

export function useExternalSystemsCRUD() {
  const [systems, setSystems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });

  // Fetch all systems
  const fetchSystems = useCallback(async (filters = {}) => {
    setLoading(true);
    setError(null);

    try {
      const params = {
        page: filters.page || pagination.page,
        pageSize: filters.pageSize || pagination.pageSize,
        ...filters,
      };

      const response = await listExternalSystems(params);

      const items = response?.items || [];
      setSystems(items);

      setPagination({
        page: response?.page || params.page,
        pageSize: response?.page_size || params.pageSize,
        total: response?.total || items.length,
        totalPages: response?.total_pages || Math.ceil((response?.total || items.length) / (params.pageSize || 20)),
      });

      logger.debug('[useExternalSystemsCRUD]', 'Fetched systems', { count: items.length });
      return items;
    } catch (err) {
      const errorMessage = err?.message || 'Failed to fetch systems';
      setError(errorMessage);
      logger.error('[useExternalSystemsCRUD]', 'Failed to fetch systems', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize]);

  // Get single system
  const fetchSystem = useCallback(async (systemId) => {
    setLoading(true);
    setError(null);

    try {
      const system = await getExternalSystem(systemId);
      logger.debug('[useExternalSystemsCRUD]', 'Fetched system', { systemId });
      return system;
    } catch (err) {
      const errorMessage = err?.message || 'Failed to fetch system';
      setError(errorMessage);
      logger.error('[useExternalSystemsCRUD]', 'Failed to fetch system', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Create system
  const create = useCallback(async (data) => {
    setLoading(true);
    setError(null);

    try {
      const newSystem = await createExternalSystem(data);
      logger.info('[useExternalSystemsCRUD]', 'Created system', { code: data.code });
      
      // Refresh list
      await fetchSystems();
      
      return newSystem;
    } catch (err) {
      const errorMessage = err?.message || 'Failed to create system';
      setError(errorMessage);
      logger.error('[useExternalSystemsCRUD]', 'Failed to create system', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchSystems]);

  // Update system
  const update = useCallback(async (systemId, data) => {
    console.log('[useExternalSystemsCRUD] update called with:', { systemId, data });
    setLoading(true);
    setError(null);

    try {
      console.log('[useExternalSystemsCRUD] Calling updateExternalSystem with:', { systemId, data });
      const updatedSystem = await updateExternalSystem(systemId, data);
      logger.info('[useExternalSystemsCRUD]', 'Updated system', { systemId });
      
      // Update in local state
      setSystems(prev => prev.map(s => s.id === systemId ? updatedSystem : s));
      
      return updatedSystem;
    } catch (err) {
      const errorMessage = err?.message || 'Failed to update system';
      setError(errorMessage);
      logger.error('[useExternalSystemsCRUD]', 'Failed to update system', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Delete system
  const delete_ = useCallback(async (systemId) => {
    setLoading(true);
    setError(null);

    try {
      await deleteExternalSystem(systemId);
      logger.info('[useExternalSystemsCRUD]', 'Deleted system', { systemId });
      
      // Remove from local state
      setSystems(prev => prev.filter(s => s.id !== systemId));
      
      return true;
    } catch (err) {
      const errorMessage = err?.message || 'Failed to delete system';
      setError(errorMessage);
      logger.error('[useExternalSystemsCRUD]', 'Failed to delete system', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Go to page
  const goToPage = useCallback((page) => {
    setPagination(prev => ({ ...prev, page }));
    fetchSystems({ page });
  }, [fetchSystems]);

  // Change page size
  const changePageSize = useCallback((pageSize) => {
    setPagination(prev => ({ ...prev, pageSize, page: 1 }));
    fetchSystems({ pageSize, page: 1 });
  }, [fetchSystems]);

  return {
    systems,
    loading,
    error,
    pagination,
    fetchSystems,
    fetchSystem,
    create,
    update,
    delete: delete_,
    goToPage,
    changePageSize,
  };
}

export default useExternalSystemsCRUD;
