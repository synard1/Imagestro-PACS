import { useEffect, useRef } from 'react';
import { getAuth, isExpired } from '../services/auth-storage';

/**
 * Hook to automatically refresh token before expiration
 * Checks token every minute and refreshes 5 minutes before expiry
 */
export function useTokenRefresh() {
  const refreshTimerRef = useRef(null);
  const isRefreshingRef = useRef(false);
  const servicesLoadedRef = useRef(false);
  const servicesRef = useRef(null);

  useEffect(() => {
    // Lazy load services only when needed
    async function loadServices() {
      if (servicesLoadedRef.current) return servicesRef.current;
      
      const [{ loadRegistry }, { refreshToken, logoutBackend }] = await Promise.all([
        import('../services/api-registry'),
        import('../services/authService')
      ]);
      
      servicesRef.current = { loadRegistry, refreshToken, logoutBackend };
      servicesLoadedRef.current = true;
      return servicesRef.current;
    }

    /**
     * Check token and refresh if needed
     */
    async function checkAndRefreshToken() {
      // Prevent multiple simultaneous refresh attempts
      if (isRefreshingRef.current) {
        return;
      }

      const auth = getAuth();

      // No auth data, nothing to do
      if (!auth || !auth.access_token) {
        return;
      }

      // Load services lazily when we actually need them
      const { loadRegistry, refreshToken, logoutBackend } = await loadServices();

      const registry = loadRegistry();
      const authConfig = registry.auth;

      // Only run if backend auth is enabled
      if (!authConfig || !authConfig.enabled) {
        return;
      }

      // Check if token is already expired
      if (isExpired(auth)) {
        console.log('Token expired, attempting refresh...');

        isRefreshingRef.current = true;
        try {
          await refreshToken();
          console.log('Token refreshed successfully');
        } catch (error) {
          console.error('Token refresh failed:', error);
          // Clear auth and redirect to login
          await logoutBackend();
          window.location.href = '/login';
        } finally {
          isRefreshingRef.current = false;
        }
        return;
      }

      // Check if token will expire soon (within 5 minutes)
      const timeUntilExpiry = auth.expires_at - Date.now();
      const fiveMinutes = 5 * 60 * 1000;

      if (timeUntilExpiry > 0 && timeUntilExpiry < fiveMinutes) {
        console.log('Token expiring soon, refreshing...');

        isRefreshingRef.current = true;
        try {
          await refreshToken();
          console.log('Token refreshed proactively');
        } catch (error) {
          console.error('Proactive token refresh failed:', error);
          // Don't logout yet, token still valid
        } finally {
          isRefreshingRef.current = false;
        }
      }
    }

    // Delay initial check to not block initial render
    const initialTimer = setTimeout(() => {
      checkAndRefreshToken();
    }, 2000);

    // Check every 5 minutes instead of every minute
    refreshTimerRef.current = setInterval(() => {
      checkAndRefreshToken();
    }, 5 * 60 * 1000); // 5 minutes

    // Cleanup on unmount
    return () => {
      clearTimeout(initialTimer);
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, []);
}

