import { useState, useEffect } from 'react';
import { loadSatusehatConfig } from '../config/satusehatConfig';
import { getDataStorageConfig } from '../services/dataSync';

export function useSatusehatAuth() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const config = loadSatusehatConfig();
        if (!config.enabled) {
          setIsAuthenticated(false);
          return;
        }

        // Check if we have a valid token
        const tokenData = localStorage.getItem('satusehat_token');
        if (tokenData) {
          const { token, expiresAt } = JSON.parse(tokenData);
          if (expiresAt > Date.now()) {
            setIsAuthenticated(true);
            return;
          }
        }

        // Try to get a new token via local backend proxy (requires Basic auth)
        const dataCfg = getDataStorageConfig();
        const serverUrl = dataCfg?.serverConfig?.serverUrl || 'http://localhost:3001';
        const basicAuth = dataCfg?.serverConfig?.username
          ? 'Basic ' + btoa(`${dataCfg.serverConfig.username}:${dataCfg.serverConfig.password || ''}`)
          : 'Basic ' + btoa('admin:password123');

        const response = await fetch(`${serverUrl.replace(/\/+$/, '')}/api/satusehat/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': basicAuth
          },
          body: JSON.stringify({
            client_id: config.clientId || '',
            client_secret: config.clientSecret || '',
            env: (config.environment === 'PRODUCTION' ? 'production' : 'sandbox'),
            tokenEndpoint: config.tokenEndpoint || config.token_endpoint || undefined
          })
        });

        if (response.ok) {
          const data = await response.json();
          // Save token with expiration
          localStorage.setItem('satusehat_token', JSON.stringify({
            token: data.access_token,
            expiresAt: Date.now() + (data.expires_in * 1000)
          }));
          setIsAuthenticated(true);
        } else {
          throw new Error('Failed to authenticate with SatuSehat');
        }
      } catch (err) {
        console.error('SatuSehat auth error:', err);
        setError(err.message);
        setIsAuthenticated(false);
      } finally {
        setIsInitialized(true);
      }
    };

    initAuth();
  }, []);

  return { isInitialized, isAuthenticated, error };
}
