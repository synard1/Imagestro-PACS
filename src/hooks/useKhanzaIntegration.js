/**
 * useKhanzaIntegration Hook
 * 
 * Custom React hook for managing Khanza-specific integration features.
 * Handles order browser, import history, and mapping operations.
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */

import { useState, useCallback } from 'react';
import { logger } from '../utils/logger';

/**
 * Hook for managing Khanza integration features
 * @param {string} systemId - External system ID
 * @returns {Object} Khanza integration state and methods
 */
export function useKhanzaIntegration(systemId) {
  const [activeTab, setActiveTab] = useState('orders'); // 'orders', 'history', 'mappings'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const switchTab = useCallback((tab) => {
    if (['orders', 'history', 'mappings'].includes(tab)) {
      setActiveTab(tab);
      setError(null);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    activeTab,
    switchTab,
    loading,
    error,
    clearError,
    systemId,
  };
}

export default useKhanzaIntegration;
