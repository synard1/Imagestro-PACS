import axios from 'axios';
import { loadSatusehatConfig } from '../config/satusehatConfig';

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
      // Add timestamp to help with debugging
      config.metadata = { startTime: new Date() };
      
      // Add correlation ID for request tracing
      config.headers['X-Correlation-ID'] = generateCorrelationId();
      
      // Add authentication token if available
      const token = localStorage.getItem('satusehat_token');
      if (token) {
        config.headers['Authorization'] = `Bearer ${token}`;
      }
      
      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );

  // Add response interceptor
  instance.interceptors.response.use(
    (response) => {
      // Add response time metadata
      const startTime = response.config.metadata.startTime;
      response.responseTime = new Date() - startTime;
      
      return response;
    },
    async (error) => {
      // Add response time even for errors
      if (error.config?.metadata?.startTime) {
        error.responseTime = new Date() - error.config.metadata.startTime;
      }

      // Handle specific error cases
      if (error.response?.status === 401) {
        // Clear token cache on unauthorized
        localStorage.removeItem('satusehat_token');
        localStorage.removeItem('satusehat_token_expiry');
      }

      return Promise.reject(error);
    }
  );

  return instance;
};

// Generate unique correlation ID
const generateCorrelationId = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// Create clients for different environments
const clients = {
  staging: createHttpClient('https://api-satusehat-stg.dto.kemkes.go.id'),
  production: createHttpClient('https://api-satusehat.kemkes.go.id')
};

export const getHttpClient = () => {
  const config = loadSatusehatConfig();
  return clients[config.environment.toLowerCase()] || clients.staging;
};

export default getHttpClient;