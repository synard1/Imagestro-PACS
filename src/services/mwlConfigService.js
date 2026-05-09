/**
 * MWL Configuration Service
 * Handles fetching and updating Modality Worklist SCP settings.
 */

import { fetchJson } from './http';
import { loadRegistry } from './api-registry';
import { notify } from './notifications';

const MOCK_MWL_CONFIG = {
  aeTitle: 'MWL_SCP',
  port: 104,
  maxAssociations: 50,
  connectionTimeout: 15000,
  querySettings: {
    defaultCharacterSet: 'ISO_IR 100',
    fuzzyMatching: true,
    maxQueryResults: 100,
    truncateResults: false,
    wildcardMatching: true
  },
  worklistBehavior: {
    defaultDateRange: 'TODAY', // TODAY, TOMORROW, WEEK, ALL
    scheduledStationAETitleMapping: true,
    modalityFiltering: false,
    strictPatientIdMatching: true
  },
  allowedAETitles: [
    { aeTitle: 'CT_SCANNER_01', description: 'Main CT Scanner', ip: '192.168.1.101' },
    { aeTitle: 'MR_SCANNER_01', description: 'Main MRI', ip: '192.168.1.102' },
    { aeTitle: 'CR_ROOM_1', description: 'X-Ray Room 1', ip: '192.168.1.103' }
  ]
};

const STORAGE_KEY = 'mwl_scp_config';

/**
 * Get MWL Configuration
 * Fetches from backend if enabled, otherwise returns local/mock data.
 */
export async function getMWLConfig() {
  const registry = loadRegistry();
  const mwlConfig = registry.mwl || { enabled: false };

  try {
    if (mwlConfig.enabled) {
      const baseUrl = mwlConfig.baseUrl || import.meta.env.VITE_MAIN_API_BACKEND_URL || '';
      return await fetchJson(`${baseUrl}/api/config/mwl`);
    }

    // Fallback to local storage or mock
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
    return { ...MOCK_MWL_CONFIG };
  } catch (error) {
    console.error('Failed to fetch MWL config:', error);
    // Fallback on error if allowed, or rethrow
    notify({ type: 'warning', message: 'Using cached/default MWL settings due to connection error.' });
    return { ...MOCK_MWL_CONFIG };
  }
}

/**
 * Update MWL Configuration
 */
export async function updateMWLConfig(config) {
  const registry = loadRegistry();
  const mwlConfig = registry.mwl || { enabled: false };

  try {
    if (mwlConfig.enabled) {
      const baseUrl = mwlConfig.baseUrl || import.meta.env.VITE_MAIN_API_BACKEND_URL || '';
      const response = await fetchJson(`${baseUrl}/api/config/mwl`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      // Also update local cache
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      return response;
    }

    // Mock mode
    await new Promise(resolve => setTimeout(resolve, 500)); // Simulate delay
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    notify({ type: 'success', message: 'MWL Configuration saved successfully (Local)' });
    return config;
  } catch (error) {
    console.error('Failed to update MWL config:', error);
    notify({ type: 'error', message: `Failed to save MWL config: ${error.message}` });
    throw error;
  }
}

/**
 * Get Default Configuration
 */
export function getDefaultMWLConfig() {
  return { ...MOCK_MWL_CONFIG };
}
