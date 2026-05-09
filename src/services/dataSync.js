// src/services/dataSync.js
import { fetchJson } from './http';
import { getAuth, isExpired } from './auth-storage';

// Check if user is authenticated
function isAuthenticated() {
  const auth = getAuth();
  return auth && auth.access_token && !isExpired(auth);
}

// Get data storage configuration
export function getDataStorageConfig() {
  const mode = localStorage.getItem('dataStorageMode') || 'server';
  const serverConfig = localStorage.getItem('serverDataConfig');
  
  // Handle case where serverConfig might be the string "undefined"
  let parsedServerConfig = null;
  if (serverConfig && serverConfig !== 'undefined') {
    try {
      parsedServerConfig = JSON.parse(serverConfig);
    } catch (e) {
      console.error('Failed to parse serverDataConfig:', e);
    }
  }
  
  // If no server config found, use default values
  if (!parsedServerConfig) {
    parsedServerConfig = {
      serverUrl: '/api',
      username: 'admin',
      password: 'password123'
    };
  }
  
  return {
    mode,
    serverConfig: parsedServerConfig
  };
}

// Save data to the appropriate storage based on configuration
export async function saveData(entity, data) {
  const config = getDataStorageConfig();
  
  if (config.mode === 'server' && config.serverConfig) {
    // Check if user is authenticated before accessing server
    if (!isAuthenticated()) {
      console.warn('User not authenticated, saving to local storage instead of server');
      localStorage.setItem(entity, JSON.stringify(data));
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
      console.error('Failed to save to server, falling back to local storage:', error);
      // Fallback to localStorage
      localStorage.setItem(entity, JSON.stringify(data));
      return data;
    }
  } else {
    // Save to localStorage
    localStorage.setItem(entity, JSON.stringify(data));
    return data;
  }
}

// Update data in the appropriate storage based on configuration
export async function updateData(entity, id, data) {
  const config = getDataStorageConfig();
  
  if (config.mode === 'server' && config.serverConfig) {
    // Check if user is authenticated before accessing server
    if (!isAuthenticated()) {
      console.warn('User not authenticated, updating in local storage instead of server');
      // Safely parse localStorage data
      const storedData = localStorage.getItem(entity);
      let existingData = [];
      if (storedData !== null && storedData !== undefined && storedData !== 'undefined') {
        try {
          existingData = JSON.parse(storedData);
        } catch (e) {
          console.error(`Failed to parse localStorage data for ${entity}:`, e);
        }
      }
      const updatedData = existingData.map(item => item.id === id ? { ...item, ...data } : item);
      localStorage.setItem(entity, JSON.stringify(updatedData));
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
    // Update in localStorage
    // Safely parse localStorage data
    const storedData = localStorage.getItem(entity);
    let existingData = [];
    if (storedData !== null && storedData !== undefined && storedData !== 'undefined') {
      try {
        existingData = JSON.parse(storedData);
      } catch (e) {
        console.error(`Failed to parse localStorage data for ${entity}:`, e);
      }
    }
    const updatedData = existingData.map(item => item.id === id ? { ...item, ...data } : item);
    localStorage.setItem(entity, JSON.stringify(updatedData));
    return { ...data, id };
  }
}

// Delete data from the appropriate storage based on configuration
export async function deleteData(entity, id) {
  const config = getDataStorageConfig();
  
  if (config.mode === 'server' && config.serverConfig) {
    // Check if user is authenticated before accessing server
    if (!isAuthenticated()) {
      console.warn('User not authenticated, deleting from local storage instead of server');
      // Safely parse localStorage data
      const storedData = localStorage.getItem(entity);
      let existingData = [];
      if (storedData !== null && storedData !== undefined && storedData !== 'undefined') {
        try {
          existingData = JSON.parse(storedData);
        } catch (e) {
          console.error(`Failed to parse localStorage data for ${entity}:`, e);
        }
      }
      const updatedData = existingData.filter(item => item.id !== id);
      localStorage.setItem(entity, JSON.stringify(updatedData));
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
    // Delete from localStorage
    // Safely parse localStorage data
    const storedData = localStorage.getItem(entity);
    let existingData = [];
    if (storedData !== null && storedData !== undefined && storedData !== 'undefined') {
      try {
        existingData = JSON.parse(storedData);
      } catch (e) {
        console.error(`Failed to parse localStorage data for ${entity}:`, e);
      }
    }
    const updatedData = existingData.filter(item => item.id !== id);
    localStorage.setItem(entity, JSON.stringify(updatedData));
    return { id };
  }
}

// Load data following the correct priority order: API Backend → Server Storage → Default Data
export async function loadData(entity) {
  // First check if API backend is enabled and try to load from there
  const appConfig = await import('./config');
  const config = appConfig.loadConfig();
  
  if (config.backendEnabled) {
    try {
      // Try to load from API backend
      const api = await import('./api');
      const data = await api.fetchJson(`${config.apiBaseUrl}/api/${entity}`);
      return data;
    } catch (error) {
      console.error(`Failed to load ${entity} from API backend, checking server storage:`, error);
    }
  }
  
  // If API backend is not enabled or failed, check server storage mode
  const storageConfig = getDataStorageConfig();
  
  if (storageConfig.mode === 'server' && storageConfig.serverConfig) {
    // Check if user is authenticated before accessing server
    if (!isAuthenticated()) {
      console.warn('User not authenticated, loading from local storage instead of server');
      // Safely parse localStorage data
      const storedData = localStorage.getItem(entity);
      if (storedData === null || storedData === undefined || storedData === 'undefined') {
        return [];
      }
      try {
        return JSON.parse(storedData);
      } catch (e) {
        console.error(`Failed to parse localStorage data for ${entity}:`, e);
        return [];
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
      console.error('Failed to load from server, falling back to local storage:', error);
      // Fallback to localStorage
      const storedData = localStorage.getItem(entity);
      if (storedData === null || storedData === undefined || storedData === 'undefined') {
        return [];
      }
      try {
        return JSON.parse(storedData);
      } catch (e) {
        console.error(`Failed to parse localStorage data for ${entity}:`, e);
        return [];
      }
    }
  } else {
    // Load from localStorage
    const storedData = localStorage.getItem(entity);
    if (storedData === null || storedData === undefined || storedData === 'undefined') {
      return [];
    }
    try {
      return JSON.parse(storedData);
    } catch (e) {
      console.error(`Failed to parse localStorage data for ${entity}:`, e);
      return [];
    }
  }
}

// Get current data with fallback following the correct priority order: API Backend → Server Storage → Default Data
export async function getCurrentDataWithDefaults() {
  // Import default data
  const defaultPatients = await import('../data/patients.json');
  const defaultOrders = await import('../data/orders.json');
  const defaultDoctors = await import('../data/doctors.json');
  const defaultNurses = await import('../data/nurses.json');
  const defaultModalities = await import('../data/modalities.json');
  const defaultDicomNodes = await import('../data/dicomNodes.json');
  const defaultUsers = await import('../data/users.json');
  const defaultAuditLogs = await import('../data/auditLogs.json');
  
  // Load company profile
  let companyProfile = {};
  try {
    const storedProfile = localStorage.getItem('companyProfile');
    if (storedProfile) {
      companyProfile = JSON.parse(storedProfile);
    }
  } catch (e) {
    console.error('Failed to parse company profile:', e);
  }
  
  // Helper function to safely parse localStorage data
  function safeParseLocalStorage(key, defaultValue = []) {
    const storedData = localStorage.getItem(key);
    if (storedData === null || storedData === undefined || storedData === 'undefined') {
      return defaultValue;
    }
    try {
      return JSON.parse(storedData);
    } catch (e) {
      console.error(`Failed to parse localStorage data for ${key}:`, e);
      return defaultValue;
    }
  }
  
  // First check if API backend is enabled
  const appConfig = await import('./config');
  const config = appConfig.loadConfig();
  
  if (config.backendEnabled && isAuthenticated()) {
    try {
      // Try to load from API backend
      const api = await import('./api');
      const { getCompanyProfile } = await import('./settingsService');
      
      const [patients, orders, doctors, nurses, modalities, dicomNodes, users, auditLogs, companyProfileData] = await Promise.all([
        api.fetchJson(`${config.apiBaseUrl}/patients`).catch(() => null),
        api.fetchJson(`${config.apiBaseUrl}/orders`).catch(() => null),
        api.fetchJson(`${config.apiBaseUrl}/api/doctors`).catch(() => null),
        api.fetchJson(`${config.apiBaseUrl}/api/nurses`).catch(() => null),
        api.fetchJson(`${config.apiBaseUrl}/api/modalities`).catch(() => null),
        api.fetchJson(`${config.apiBaseUrl}/api/dicomNodes`).catch(() => null),
        api.fetchJson(`${config.apiBaseUrl}/api/users`).catch(() => null),
        api.fetchJson(`${config.apiBaseUrl}/api/auditLogs`).catch(() => null),
        getCompanyProfile().catch(() => null)
      ]);
      
      return {
        patients: patients || safeParseLocalStorage('patients') || defaultPatients.default,
        orders: orders || safeParseLocalStorage('orders') || defaultOrders.default,
        doctors: doctors || safeParseLocalStorage('doctors') || defaultDoctors.default,
        nurses: nurses || safeParseLocalStorage('nurses') || defaultNurses.default,
        modalities: modalities || safeParseLocalStorage('modalities') || defaultModalities.default,
        dicomNodes: dicomNodes || safeParseLocalStorage('dicomNodes') || defaultDicomNodes.default,
        users: users || safeParseLocalStorage('users') || defaultUsers.default,
        auditLogs: auditLogs || safeParseLocalStorage('auditLogs') || defaultAuditLogs.default,
        companyProfile: companyProfileData || companyProfile
      };
    } catch (error) {
      console.error('Failed to load data from API backend, checking server storage:', error);
    }
  }
  
  // If API backend is not enabled or failed, check server storage mode
  const storageConfig = getDataStorageConfig();
  
  if (storageConfig.mode === 'server' && storageConfig.serverConfig) {
    // Check if user is authenticated before accessing server
    if (!isAuthenticated()) {
      console.warn('User not authenticated, loading from local storage instead of server');
      // Fallback to localStorage and default data
      return {
        patients: safeParseLocalStorage('patients') || defaultPatients.default,
        orders: safeParseLocalStorage('orders') || defaultOrders.default,
        doctors: safeParseLocalStorage('doctors') || defaultDoctors.default,
        nurses: safeParseLocalStorage('nurses') || defaultNurses.default,
        modalities: safeParseLocalStorage('modalities') || defaultModalities.default,
        dicomNodes: safeParseLocalStorage('dicomNodes') || defaultDicomNodes.default,
        users: safeParseLocalStorage('users') || defaultUsers.default,
        auditLogs: safeParseLocalStorage('auditLogs') || defaultAuditLogs.default,
        companyProfile: companyProfile
      };
    }
    
    // Load from server
    try {
      const [patients, orders, doctors, nurses, modalities, dicomNodes, users, auditLogs, companyProfileData] = await Promise.all([
        fetchJson(`${storageConfig.serverConfig.serverUrl}/patients`, {
          headers: {
            ...(storageConfig.serverConfig.username && {
              'Authorization': 'Basic ' + btoa(`${storageConfig.serverConfig.username}:${storageConfig.serverConfig.password}`)
            })
          }
        }).catch(() => null),
        fetchJson(`${storageConfig.serverConfig.serverUrl}/orders`, {
          headers: {
            ...(storageConfig.serverConfig.username && {
              'Authorization': 'Basic ' + btoa(`${storageConfig.serverConfig.username}:${storageConfig.serverConfig.password}`)
            })
          }
        }).catch(() => null),
        fetchJson(`${storageConfig.serverConfig.serverUrl}/api/doctors`, {
          headers: {
            ...(storageConfig.serverConfig.username && {
              'Authorization': 'Basic ' + btoa(`${storageConfig.serverConfig.username}:${storageConfig.serverConfig.password}`)
            })
          }
        }).catch(() => null),
        fetchJson(`${storageConfig.serverConfig.serverUrl}/api/nurses`, {
          headers: {
            ...(storageConfig.serverConfig.username && {
              'Authorization': 'Basic ' + btoa(`${storageConfig.serverConfig.username}:${storageConfig.serverConfig.password}`)
            })
          }
        }).catch(() => null),
        fetchJson(`${storageConfig.serverConfig.serverUrl}/api/modalities`, {
          headers: {
            ...(storageConfig.serverConfig.username && {
              'Authorization': 'Basic ' + btoa(`${storageConfig.serverConfig.username}:${storageConfig.serverConfig.password}`)
            })
          }
        }).catch(() => null),
        fetchJson(`${storageConfig.serverConfig.serverUrl}/api/dicomNodes`, {
          headers: {
            ...(storageConfig.serverConfig.username && {
              'Authorization': 'Basic ' + btoa(`${storageConfig.serverConfig.username}:${storageConfig.serverConfig.password}`)
            })
          }
        }).catch(() => null),
        fetchJson(`${storageConfig.serverConfig.serverUrl}/api/users`, {
          headers: {
            ...(storageConfig.serverConfig.username && {
              'Authorization': 'Basic ' + btoa(`${storageConfig.serverConfig.username}:${storageConfig.serverConfig.password}`)
            })
          }
        }).catch(() => null),
        fetchJson(`${storageConfig.serverConfig.serverUrl}/api/auditLogs`, {
          headers: {
            ...(storageConfig.serverConfig.username && {
              'Authorization': 'Basic ' + btoa(`${storageConfig.serverConfig.username}:${storageConfig.serverConfig.password}`)
            })
          }
        }).catch(() => null),
        getCompanyProfile().catch(() => null)
      ]);
      
      return {
        patients: patients || safeParseLocalStorage('patients') || defaultPatients.default,
        orders: orders || safeParseLocalStorage('orders') || defaultOrders.default,
        doctors: doctors || safeParseLocalStorage('doctors') || defaultDoctors.default,
        nurses: nurses || safeParseLocalStorage('nurses') || defaultNurses.default,
        modalities: modalities || safeParseLocalStorage('modalities') || defaultModalities.default,
        dicomNodes: dicomNodes || safeParseLocalStorage('dicomNodes') || defaultDicomNodes.default,
        users: users || safeParseLocalStorage('users') || defaultUsers.default,
        auditLogs: auditLogs || safeParseLocalStorage('auditLogs') || defaultAuditLogs.default,
        companyProfile: companyProfileData || companyProfile
      };
    } catch (error) {
      console.error('Failed to load from server, falling back to local storage:', error);
    }
  }
  
  // Fallback to localStorage and default data
  return {
    patients: safeParseLocalStorage('patients') || defaultPatients.default,
    orders: safeParseLocalStorage('orders') || defaultOrders.default,
    doctors: safeParseLocalStorage('doctors') || defaultDoctors.default,
    nurses: safeParseLocalStorage('nurses') || defaultNurses.default,
    modalities: safeParseLocalStorage('modalities') || defaultModalities.default,
    dicomNodes: safeParseLocalStorage('dicomNodes') || defaultDicomNodes.default,
    users: safeParseLocalStorage('users') || defaultUsers.default,
    auditLogs: safeParseLocalStorage('auditLogs') || defaultAuditLogs.default,
    companyProfile: companyProfile
  };
}

// Sync all data to server
export async function syncAllDataToServer() {
  const config = getDataStorageConfig();
  
  if (config.mode !== 'server' || !config.serverConfig) {
    throw new Error('Server storage not configured');
  }
  
  // Check if user is authenticated before accessing server
  if (!isAuthenticated()) {
    throw new Error('User not authenticated');
  }
  
  // Get all data with fallback to defaults
  const dataToSync = await getCurrentDataWithDefaults();
  
  try {
    const response = await fetchJson(`${config.serverConfig.serverUrl}/api/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.serverConfig.username && {
          'Authorization': 'Basic ' + btoa(`${config.serverConfig.username}:${config.serverConfig.password}`)
        })
      },
      body: JSON.stringify(dataToSync)
    });
    
    return response;
  } catch (error) {
    console.error('Failed to sync data to server:', error);
    throw error;
  }
}

// Sync data from server to local storage (pull from server)
export async function syncFromServer() {
  const config = getDataStorageConfig();
  
  if (config.mode !== 'server' || !config.serverConfig) {
    throw new Error('Server storage not configured');
  }
  
  // Check if user is authenticated before accessing server
  if (!isAuthenticated()) {
    throw new Error('User not authenticated');
  }
  
  try {
    // Fetch all data from server
    const entities = ['patients', 'orders', 'doctors', 'nurses', 'modalities', 'dicomNodes', 'users', 'auditLogs', 'settings', 'company-profile'];
    const syncResults = {};
    
    for (const entity of entities) {
      try {
        const data = await fetchJson(`${config.serverConfig.serverUrl}/api/${entity}`, {
          headers: {
            ...(config.serverConfig.username && {
              'Authorization': 'Basic ' + btoa(`${config.serverConfig.username}:${config.serverConfig.password}`)
            })
          }
        });
        // Save to local storage
        if (entity === 'company-profile') {
          localStorage.setItem('companyProfile', JSON.stringify(data));
        } else {
          localStorage.setItem(entity, JSON.stringify(data));
        }
        syncResults[entity] = { status: 'success', data };
      } catch (error) {
        console.error(`Failed to sync ${entity} from server:`, error);
        syncResults[entity] = { status: 'error', error: error.message };
      }
    }
    
    // If settings were synced, apply them
    if (syncResults.settings && syncResults.settings.status === 'success' && syncResults.settings.data.length > 0) {
      const settingsData = syncResults.settings.data[0]; // Assuming settings is stored as an array with one item
      if (settingsData.uiConfig) {
        localStorage.setItem('app.config', JSON.stringify(settingsData.uiConfig));
      }
      if (settingsData.registry) {
        localStorage.setItem('api.registry.v1', JSON.stringify(settingsData.registry));
      }
      if (settingsData.accessionConfig) {
        localStorage.setItem('accession.config', JSON.stringify(settingsData.accessionConfig));
      }
      if (settingsData.companyProfile) {
        localStorage.setItem('companyProfile', JSON.stringify(settingsData.companyProfile));
      }
      if (settingsData.dataStorageMode) {
        localStorage.setItem('dataStorageMode', settingsData.dataStorageMode);
      }
      if (settingsData.serverConfig) {
        localStorage.setItem('serverDataConfig', JSON.stringify(settingsData.serverConfig));
      }
    }
    
    return syncResults;
  } catch (error) {
    console.error('Failed to sync data from server:', error);
    throw error;
  }
}

// Initialize data storage based on mode
export async function initializeDataStorage() {
  const config = getDataStorageConfig();
  
  if (config.mode === 'server' && config.serverConfig) {
    // Check if user is authenticated before accessing server
    if (!isAuthenticated()) {
      console.warn('User not authenticated, skipping server data initialization');
      return;
    }
    
    // Try to load initial data from server
    try {
      const syncResults = await syncFromServer();
      console.log('Data synchronized from server:', syncResults);
      
      // Update config states if settings were synced
      if (syncResults.settings && syncResults.settings.status === 'success' && syncResults.settings.data.length > 0) {
        const settingsData = syncResults.settings.data[0];
        if (settingsData.dataStorageMode) {
          // Update the in-memory config
          config.mode = settingsData.dataStorageMode;
        }
      }
    } catch (error) {
      console.error('Failed to initialize data from server, using local data:', error);
    }
  }
  // If client mode, do nothing as data is already in localStorage
}

// Check if server is reachable
export async function checkServerConnection() {
  const config = getDataStorageConfig();
  
  if (config.mode !== 'server' || !config.serverConfig) {
    return { reachable: false, error: 'Server storage not configured' };
  }
  
  // Check if user is authenticated before accessing server
  if (!isAuthenticated()) {
    return { reachable: false, error: 'User not authenticated' };
  }
  
  try {
    const client = apiClient('satusehatMonitor'); // Proxied to /backend-api
    console.log('Checking server connection via satusehatMonitor client');
    
    const data = await client.get('/health');
    return { reachable: true, status: 200, data };
  } catch (error) {
    console.error('Health check error:', error);
    return { reachable: false, status: error.status || 500, error: error.message };
  }
}

// Load settings from server when in server mode
export async function loadSettingsFromServer() {
  const config = getDataStorageConfig();
  
  if (config.mode !== 'server' || !config.serverConfig) {
    return null;
  }
  
  // Check if user is authenticated before accessing server
  if (!isAuthenticated()) {
    console.warn('User not authenticated, skipping server settings load');
    return null;
  }
  
  try {
    const { getSettingsStrict } = await import('./settingsService');
    const settingsData = await getSettingsStrict({ refresh: true });
    
    // Apply settings if they exist
    if (settingsData) {
      if (settingsData.uiConfig) {
        localStorage.setItem('app.config', JSON.stringify(settingsData.uiConfig));
      }
      if (settingsData.registry) {
        localStorage.setItem('api.registry.v1', JSON.stringify(settingsData.registry));
      }
      if (settingsData.accessionConfig) {
        localStorage.setItem('accession.config', JSON.stringify(settingsData.accessionConfig));
      }
      if (settingsData.companyProfile) {
        localStorage.setItem('companyProfile', JSON.stringify(settingsData.companyProfile));
      }
      if (settingsData.dataStorageMode) {
        localStorage.setItem('dataStorageMode', settingsData.dataStorageMode);
      }
      if (settingsData.serverConfig) {
        localStorage.setItem('serverDataConfig', JSON.stringify(settingsData.serverConfig));
      }
      
      return settingsData;
    }
    
    return null;
  } catch (error) {
    console.error('Failed to load settings from server:', error);
    return null;
  }
}

// Load company profile from server
export async function loadCompanyProfileFromServer() {
  const config = getDataStorageConfig();
  
  if (config.mode !== 'server' || !config.serverConfig) {
    return null;
  }
  
  // Check if user is authenticated before accessing server
  if (!isAuthenticated()) {
    console.warn('User not authenticated, skipping server company profile load');
    return null;
  }
  
  try {
    const { getCompanyProfile } = await import('./settingsService');
    const companyProfile = await getCompanyProfile();
    
    // Save to localStorage
    localStorage.setItem('companyProfile', JSON.stringify(companyProfile));
    
    return companyProfile;
  } catch (error) {
    console.error('Failed to load company profile from server:', error);
    return null;
  }
}