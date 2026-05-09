/**
 * useConnectionTest Hook
 * 
 * Custom React hook for testing connections to external systems.
 * Handles connection testing with loading and error states.
 * 
 * Requirements: 3.3, 3.4, 3.5
 */

import { useState, useCallback } from 'react';
import { testConnection } from '../services/connectionTestService';
import { logger } from '../utils/logger';

/**
 * Hook for testing external system connections
 * @returns {Object} Connection test state and methods
 */
export function useConnectionTest() {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const test = useCallback(async (systemId, connectionSettings) => {
    if (!systemId || !connectionSettings) {
      setError('System ID and connection settings are required');
      return;
    }

    setTesting(true);
    setError(null);
    setResult(null);

    try {
      const testResult = await testConnection(systemId, connectionSettings);

      if (testResult.success) {
        logger.info('[useConnectionTest]', 'Connection test succeeded', {
          systemId,
          responseTime: testResult.responseTime,
        });
        setResult(testResult);
      } else {
        logger.warn('[useConnectionTest]', 'Connection test failed', {
          systemId,
          errorType: testResult.errorType,
        });
        setResult(testResult);
      }
    } catch (err) {
      const errorMessage = err?.message || 'Connection test failed';
      setError(errorMessage);
      logger.error('[useConnectionTest]', 'Connection test error', err);
    } finally {
      setTesting(false);
    }
  }, []);

  const reset = useCallback(() => {
    setTesting(false);
    setResult(null);
    setError(null);
  }, []);

  return {
    testing,
    result,
    error,
    test,
    reset,
  };
}

export default useConnectionTest;
