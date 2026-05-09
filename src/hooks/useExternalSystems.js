/**
 * useExternalSystems Hook
 * 
 * Custom React hook for managing external systems data and operations.
 * Handles fetching, caching, and state management for external systems.
 * Supports both mock and real services via useServiceMode.
 * 
 * Requirements: 1.1, 2.1, 3.1
 */

import { useState, useEffect, useCallback, useContext } from 'react';
import { listExternalSystems as listExternalSystemsReal } from '../services/externalSystemsService';
import { listExternalSystems as listExternalSystemsMock } from '../services/mock/mockExternalSystemsService';
import { logger } from '../utils/logger';

// Check if we should use mock services
const shouldUseMock = () => {
  // FIXED: If VITE_FORCE_REAL_SERVICES is true, NEVER use mock
  if (import.meta.env.VITE_FORCE_REAL_SERVICES === 'true') {
    return false;
  }
  
  // Check environment variable for explicit mock mode
  if (import.meta.env.VITE_USE_MOCK_SERVICES === 'true') {
    return true;
  }
  
  // Check localStorage (only if not forced to real)
  try {
    const stored = localStorage.getItem('pacs_service_mode');
    if (stored === 'mock') return true;
    if (stored === 'real') return false;
  } catch (e) {
    // Ignore localStorage errors
  }
  
  // Default to mock in development ONLY if auto-fallback is enabled
  const autoFallback = import.meta.env.VITE_AUTO_FALLBACK_TO_MOCK !== 'false';
  return import.meta.env.DEV && autoFallback;
};

/**
 * Hook for managing external systems list
 * @param {number} [refreshTrigger=0] - Trigger to refresh the list
 * @param {Object} [filters={}] - Filter parameters
 * @returns {Object} External systems state and methods
 */
export function useExternalSystems(refreshTrigger = 0, filters = {}) {
  const [systems, setSystems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });

  // Fetch systems - no dependencies to avoid infinite loop
  useEffect(() => {
    const fetchSystems = async () => {
      setLoading(true);
      setError(null);

      try {
        const useMock = shouldUseMock();
        const listExternalSystems = useMock ? listExternalSystemsMock : listExternalSystemsReal;
        
        const params = {
          page: pagination.page,
          pageSize: pagination.pageSize,
          ...filters,
        };

        const response = await listExternalSystems(params);

        // Handle both mock and real response formats
        const items = response?.items || response || [];
        const paginationData = response?.pagination || {};
        
        setSystems(items);
        setPagination(prev => ({
          page: paginationData.page || prev.page,
          pageSize: paginationData.pageSize || prev.pageSize,
          total: paginationData.total || items.length,
          totalPages: paginationData.totalPages || Math.ceil(items.length / prev.pageSize),
        }));

        logger.debug('[useExternalSystems]', 'Fetched external systems', {
          count: items.length,
          useMock,
        });
      } catch (err) {
        const errorMessage = err?.message || 'Failed to fetch external systems';
        setError(errorMessage);
        logger.error('[useExternalSystems]', 'Failed to fetch external systems', err);
      } finally {
        setLoading(false);
      }
    };

    fetchSystems();
  }, [refreshTrigger]);

  const goToPage = useCallback((page) => {
    setPagination(prev => ({ ...prev, page }));
  }, []);

  const changePageSize = useCallback((pageSize) => {
    setPagination(prev => ({ ...prev, pageSize, page: 1 }));
  }, []);

  return {
    systems,
    loading,
    error,
    pagination,
    goToPage,
    changePageSize,
  };
}

export default useExternalSystems;
