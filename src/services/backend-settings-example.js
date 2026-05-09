/**
 * Example of how the frontend interacts with the backend settings API
 * 
 * This demonstrates the proper format and methods for retrieving and updating
 * settings from the MasterData service backend.
 */

// Constants
const SETTINGS_API_URL = 'http://103.42.117.19:8888/settings';
const SETTINGS_KEY = 'app.config';

/**
 * Get settings from backend API
 * @param {string} authToken - JWT token for authentication
 * @returns {Promise<Object>} Settings object
 */
export async function getBackendSettings(authToken) {
  try {
    const response = await fetch(`${SETTINGS_API_URL}/${SETTINGS_KEY}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      const settings = await response.json();
      return settings.value; // Return the actual settings value
    } else if (response.status === 404) {
      // Settings not found, return default settings
      return getDefaultSettings();
    } else {
      throw new Error(`Failed to fetch settings: ${response.status}`);
    }
  } catch (error) {
    console.error('Error fetching settings from backend:', error);
    throw error;
  }
}

/**
 * Update settings in backend API
 * @param {Object} settings - Settings object to save
 * @param {string} authToken - JWT token for authentication
 * @returns {Promise<Object>} Updated settings
 */
export async function updateBackendSettings(settings, authToken) {
  try {
    const response = await fetch(`${SETTINGS_API_URL}/${SETTINGS_KEY}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        value: settings,
        description: 'Application configuration settings'
      })
    });
    
    if (response.ok) {
      const updatedSettings = await response.json();
      return updatedSettings.value; // Return the actual settings value
    } else {
      throw new Error(`Failed to update settings: ${response.status}`);
    }
  } catch (error) {
    console.error('Error updating settings in backend:', error);
    throw error;
  }
}

/**
 * Get default settings (fallback when backend is unavailable)
 * @returns {Object} Default settings object
 */
function getDefaultSettings() {
  return {
    backendEnabled: false,
    apiBaseUrl: 'http://localhost:8000',
    timeoutMs: 6000,
    healthIntervalMs: 15000,
    modalities: ['US', 'CT', 'MR', 'DR', 'OT', 'SC', 'SR', 'RF', 'NM', 'CR', 'XA', 'MG'],
    patientDataValidation: true,
    patientDataEncryption: false,
    autoSaveInterval: 5,
    dataRetentionDays: 365,
    rbacEnabled: true,
    permissionCaching: true,
    permissionCacheTTL: 60,
    sessionTimeout: 30,
    autoSync: true,
    conflictResolution: true,
    syncInterval: 10,
    offlineBufferSize: 100
  };
}

/**
 * Example usage of the settings API
 */
export async function exampleUsage() {
  try {
    // In a real application, you would get the auth token from your auth service
    const authToken = 'YOUR_JWT_TOKEN_HERE';
    
    // Try to get settings from backend
    let settings;
    try {
      settings = await getBackendSettings(authToken);
      console.log('Settings loaded from backend:', settings);
    } catch (error) {
      // Fallback to default settings
      settings = getDefaultSettings();
      console.log('Using default settings due to backend error:', settings);
    }
    
    // Update a setting
    settings.backendEnabled = true;
    
    // Try to save updated settings to backend
    try {
      const updatedSettings = await updateBackendSettings(settings, authToken);
      console.log('Settings updated in backend:', updatedSettings);
    } catch (error) {
      console.log('Failed to update settings in backend, changes saved locally only');
    }
    
    return settings;
  } catch (error) {
    console.error('Error in settings example:', error);
    throw error;
  }
}

export default {
  getBackendSettings,
  updateBackendSettings,
  getDefaultSettings,
  exampleUsage
};