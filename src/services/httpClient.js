import axios from 'axios';
import { getEncrypted, removeEncrypted } from '../utils/encryptedStorage';

// Create axios instance with default config
const createHttpClient = (baseURL) => {
  const instance = axios.create({
    baseURL,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json'
    }
  });

  // Add request interceptor
  instance.interceptors.request.use(
    async (config) => {
      config.metadata = { startTime: new Date() };
      config.headers['X-Correlation-ID'] = generateCorrelationId();

      // Read token from encrypted storage
      const tokenData = await getEncrypted('satusehat_token');
      if (tokenData?.token) {
        config.headers['Authorization'] = `Bearer ${tokenData.token}`;
      }

      return config;
    },
    (error) => Promise.reject(error)
  );

  // Add response interceptor
  instance.interceptors.response.use(
    (response) => {
      const startTime = response.config.metadata.startTime;
      response.responseTime = new Date() - startTime;
      return response;
    },
    async (error) => {
      if (error.config?.metadata?.startTime) {
        error.responseTime = new Date() - error.config.metadata.startTime;
      }

      if (error.response?.status === 401) {
        // Clear encrypted token on unauthorized
        removeEncrypted('satusehat_token');
      }

      return Promise.reject(error);
    }
  );

  return instance;
};

const generateCorrelationId = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const clients = {
  staging: createHttpClient('https://api-satusehat-stg.dto.kemkes.go.id'),
  production: createHttpClient('https://api-satusehat.kemkes.go.id')
};

// Environment is non-sensitive — read from env var, no need for encrypted config
export const getHttpClient = () => {
  const env = (import.meta.env.VITE_SATUSEHAT_ENV || 'staging').toLowerCase();
  return clients[env] || clients.staging;
};

export default getHttpClient;
