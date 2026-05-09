/**
 * Secure Data Sync Service
 * 
 * Drop-in replacement for dataSync.js that uses secure storage for PHI
 * This service maintains backward compatibility while adding HIPAA compliance
 */

import { fetchJson } from './http';
import { getAuth, isExpired } from './auth-storage';
import secureStorage from './secureStorage';
import phiDetector from './phiDetector';

// Check if user is authenticated
function isAuthenticated() {
  const auth = getAuth();
  return auth && auth.access_token && !isExpired(auth);
}

// Get data storage configuration (non-PHI, safe in localStorage)
export function getDataStorageConfig() {
  const mode = localStorage.getItem('dataStorageMode') || 'server';
  const serverConfig = localStorage.getItem('serverDataConfig');
  
  let parsedServerConfig = null;
  if (serverConfig && serverConfig !== 'undefined') {
    try {
      parsedServerConfig = JSON.parse(serverConfig);
    } catch (e) {
      console.error('Failed to parse serverDataConfig:', e);
    }
  }
  
  if (!parsedServerConfig) {
    parsedServerConfig = {
      serverUrl: 'http://localhost:3001',
      username: 'admin',
      password: 'password123'
    };
  }
  
  return {
    mode,
    serverConfig: parsedServerConfig
  };
}

/**
 * Determine storage location based on entity type
 */
function getStorageForEntity(entity) {
  const isPhi = phiDetector.isPhiEntity(entity);
  
  return {
    isPhi,
    storage: isPhi ? 'secure' : 'local',
    riskLevel: phiDetector.getEntityRiskLevel(entity)
  };
}

/**
 * Save data with automatic PHI detection and secure storage
 */
export async function saveData(entity, data) {
  const config = getDataStorageConfig();
  const storageInfo = getStorageForEntity(entity);
  
  // Log PHI access
  if (storageInfo.isPhi) {
    phiDetector.logPhiAccess(entity, 'WRITE');
  }
  
  if (config.mode === 'server' && config.serverConfig) {
    if (!isAuthenticated()) {
      console.warn('User not authenticated, saving to storage instead of server');
      
      // Use secure storage for PHI
      if (storageInfo.isPhi) {
        await secureStorage.setItem(entity, data);
      } else {
        localStorage.setItem(entity, JSON.stringify(data));
      }
      return data;
    }
    
    // Save to server
    try {
      const response = await fetchJson(`${config.serverConfig.serverUrl}/api/${entity}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.serverConfig.username && {
            'Authorization': 'Basic ' + btoa(`${config.serverConfig.username}:${config.serverConfig.password}`)
          })
        },
        body: JSON.stringify(data)
      });
      return response;
    } catch (error) {
      console.error('Failed to save to server, falling back to storage:', error);
      
      // Fallback: Use secure storage for PHI
      if (storageInfo.isPhi) {
        await secureStorage.setItem(entity, data);
      } else {
        localStorage.setItem(entity, JSON.stringify(data));
      }
      return data;
    }
  } else {
    // Use secure storage for PHI
    if (storageInfo.isPhi) {
      await secureStorage.setItem(entity, data);
    } else {
      localStorage.setItem(entity, JSON.stringify(data));
    }
    return data;
  }
}

/**
 * Update data with automatic PHI detection
 */
export async function updateData(entity, id, data) {
  const config = getDataStorageConfig();
  const storageInfo = getStorageForEntity(entity);
  
  // Log PHI access
  if (storageInfo.isPhi) {
    phiDetector.logPhiAccess(entity, 'UPDATE');
  }
  
  if (config.mode === 'server' && config.serverConfig) {
    if (!isAuthenticated()) {
      console.warn('User not authenticated, updating in storage instead of server');
      
      // Get existing data
      let existingData = [];
      if (storageInfo.isPhi) {
        existingData = await secureStorage.getItem(entity) || [];
      } else {
        const storedData = localStorage.getItem(entity);
        if (storedData && storedData !== 'undefined') {
          try {
            existingData = JSON.parse(storedData);
          } catch (e) {
            console.error(`Failed to parse data for ${entity}:`, e);
          }
        }
      }
      
      const updatedData = existingData.map(item => item.id === id ? { ...item, ...data } : item);
      
      // Save updated data
      if (storageInfo.isPhi) {
        await secureStorage.setItem(entity, updatedData);
      } else {
        localStorage.setItem(entity, JSON.stringify(updatedData));
      }
      
      return { ...data, id };
    }
    
    // Update on server
    try {
      const response = await fetchJson(`${config.serverConfig.serverUrl}/api/${entity}/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(config.serverConfig.username && {
            'Authorization': 'Basic ' + btoa(`${config.serverConfig.username}:${config.serverConfig.password}`)
          })
        },
        body: JSON.stringify(data)
      });
      return response;
    } catch (error) {
      console.error('Failed to update on server:', error);
      throw error;
    }
  } else {
    // Get existing data
    let existingData = [];
    if (storageInfo.isPhi) {
      existingData = await secureStorage.getItem(entity) || [];
    } else {
      const storedData = localStorage.getItem(entity);
      if (storedData && storedData !== 'undefined') {
        try {
          existingData = JSON.parse(storedData);
        } catch (e) {
          console.error(`Failed to parse data for ${entity}:`, e);
        }
      }
    }
    
    const updatedData = existingData.map(item => item.id === id ? { ...item, ...data } : item);
    
    // Save updated data
    if (storageInfo.isPhi) {
      await secureStorage.setItem(entity, updatedData);
    } else {
      localStorage.setItem(entity, JSON.stringify(updatedData));
    }
    
    return { ...data, id };
  }
}

/**
 * Delete data with automatic PHI detection
 */
export async function deleteData(entity, id) {
  const config = getDataStorageConfig();
  const storageInfo = getStorageForEntity(entity);
  
  // Log PHI access
  if (storageInfo.isPhi) {
    phiDetector.logPhiAccess(entity, 'DELETE');
  }
  
  if (config.mode === 'server' && config.serverConfig) {
    if (!isAuthenticated()) {
      console.warn('User not authenticated, deleting from storage instead of server');
      
      // Get existing data
      let existingData = [];
      if (storageInfo.isPhi) {
        existingData = await secureStorage.getItem(entity) || [];
      } else {
        const storedData = localStorage.getItem(entity);
        if (storedData && storedData !== 'undefined') {
          try {
            existingData = JSON.parse(storedData);
          } catch (e) {
            console.error(`Failed to parse data for ${entity}:`, e);
          }
        }
      }
      
      const updatedData = existingData.filter(item => item.id !== id);
      
      // Save updated data
      if (storageInfo.isPhi) {
        await secureStorage.setItem(entity, updatedData);
      } else {
        localStorage.setItem(entity, JSON.stringify(updatedData));
      }
      
      return { id };
    }
    
    // Delete from server
    try {
      const response = await fetchJson(`${config.serverConfig.serverUrl}/api/${entity}/${id}`, {
        method: 'DELETE',
        headers: {
          ...(config.serverConfig.username && {
            'Authorization': 'Basic ' + btoa(`${config.serverConfig.username}:${config.serverConfig.password}`)
          })
        }
      });
      return response;
    } catch (error) {
      console.error('Failed to delete from server:', error);
      throw error;
    }
  } else {
    // Get existing data
    let existingData = [];
    if (storageInfo.isPhi) {
      existingData = await secureStorage.getItem(entity) || [];
    } else {
      const storedData = localStorage.getItem(entity);
      if (storedData && storedData !== 'undefined') {
        try {
          existingData = JSON.parse(storedData);
        } catch (e) {
          console.error(`Failed to parse data for ${entity}:`, e);
        }
      }
    }
    
    const updatedData = existingData.filter(item => item.id !== id);
    
    // Save updated data
    if (storageInfo.isPhi) {
      await secureStorage.setItem(entity, updatedData);
    } else {
      localStorage.setItem(entity, JSON.stringify(updatedData));
    }
    
    return { id };
  }
}

/**
 * Load data with automatic PHI detection
 */
export async function loadData(entity) {
  const storageInfo = getStorageForEntity(entity);
  
  // Log PHI access
  if (storageInfo.isPhi) {
    phiDetector.logPhiAccess(entity, 'READ');
  }
  
  // First check if API backend is enabled
  const appConfig = await import('./config');
  const config = appConfig.loadConfig();
  
  if (config.backendEnabled) {
    try {
      const api = await import('./api');
      const data = await api.fetchJson(`${config.apiBaseUrl}/api/${entity}`);
      return data;
    } catch (error) {
      console.error(`Failed to load ${entity} from API backend, checking storage:`, error);
    }
  }
  
  // Check server storage mode
  const storageConfig = getDataStorageConfig();
  
  if (storageConfig.mode === 'server' && storageConfig.serverConfig) {
    if (!isAuthenticated()) {
      console.warn('User not authenticated, loading from storage instead of server');
      
      // Load from appropriate storage
      if (storageInfo.isPhi) {
        return await secureStorage.getItem(entity) || [];
      } else {
        const storedData = localStorage.getItem(entity);
        if (!storedData || storedData === 'undefined') {
          return [];
        }
        try {
          return JSON.parse(storedData);
        } catch (e) {
          console.error(`Failed to parse data for ${entity}:`, e);
          return [];
        }
      }
    }
    
    // Load from server
    try {
      const response = await fetchJson(`${storageConfig.serverConfig.serverUrl}/api/${entity}`, {
        headers: {
          ...(storageConfig.serverConfig.username && {
            'Authorization': 'Basic ' + btoa(`${storageConfig.serverConfig.username}:${storageConfig.serverConfig.password}`)
          })
        }
      });
      return response;
    } catch (error) {
      console.error('Failed to load from server, falling back to storage:', error);
      
      // Fallback to appropriate storage
      if (storageInfo.isPhi) {
        return await secureStorage.getItem(entity) || [];
      } else {
        const storedData = localStorage.getItem(entity);
        if (!storedData || storedData === 'undefined') {
          return [];
        }
        try {
          return JSON.parse(storedData);
        } catch (e) {
          console.error(`Failed to parse data for ${entity}:`, e);
          return [];
        }
      }
    }
  } else {
    // Load from appropriate storage
    if (storageInfo.isPhi) {
      return await secureStorage.getItem(entity) || [];
    } else {
      const storedData = localStorage.getItem(entity);
      if (!storedData || storedData === 'undefined') {
        return [];
      }
      try {
        return JSON.parse(storedData);
      } catch (e) {
        console.error(`Failed to parse data for ${entity}:`, e);
        return [];
      }
    }
  }
}

// Re-export other functions from original dataSync.js
export {
  getCurrentDataWithDefaults,
  syncAllDataToServer,
  syncFromServer,
  initializeDataStorage,
  checkServerConnection,
  loadSettingsFromServer,
  loadCompanyProfileFromServer
} from './dataSync';
