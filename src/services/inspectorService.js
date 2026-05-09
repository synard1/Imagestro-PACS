/**
 * Inspector Service
 * Handles API calls to the independent DICOM inspector backend
 */
import { apiClient, uploadWithProgress } from './http';
import { loadRegistry } from './api-registry';
import { notify } from './notifications';

const getInspectorApi = () => apiClient('inspector');

/**
 * Inspect a DICOM file (Upload & Extract Tags)
 * @param {File} file - DICOM file
 * @param {Function} onProgress - Progress callback
 * @returns {Promise} Upload result
 */
export async function inspectFile(file, onProgress = null) {
  try {
    const registry = loadRegistry();
    const config = registry.inspector || {};

    // Use configured baseUrl or default to common backend URL
    const baseUrl = config.baseUrl || import.meta.env.VITE_MAIN_API_BACKEND_URL || '';
    const cleanBaseUrl = baseUrl.replace(/\/$/, '');

    // Backend endpoint is /api/v1/inspect
    // Nginx proxies /api/inspector/ to backend root /
    const endpoint = `${cleanBaseUrl}/api/inspector/api/v1/inspect`;

    const formData = new FormData();
    formData.append('file', file);

    const result = await uploadWithProgress(endpoint, formData, onProgress);
    
    notify({
      type: 'success',
      message: 'DICOM file inspected successfully'
    });

    return result;
  } catch (error) {
    console.error('[InspectorService] Inspection error:', error);
    notify({
      type: 'error',
      message: `Failed to inspect DICOM file: ${error.message}`
    });
    throw error;
  }
}

/**
 * Get extracted tags for a file
 * @param {string} fileId - File ID (inspection_id)
 * @returns {Promise} Tags data
 */
export async function getTags(fileId) {
  const api = getInspectorApi();
  try {
    // Backend endpoint: GET /api/v1/inspections/{id}
    const result = await api.get(`/api/v1/inspections/${fileId}`);
    // Map backend response to what UI expects (result.data contains the tags)
    return result.data || result;
  } catch (error) {
    console.error('[InspectorService] Get tags error:', error);
    notify({
      type: 'error',
      message: `Failed to fetch DICOM tags: ${error.message}`
    });
    throw error;
  }
}

/**
 * Refresh tags for a file
 * @param {string} fileId - File ID
 * @returns {Promise} Updated tags data
 */
export async function refreshTags(fileId) {
  // Since this is ephemeral, refresh just re-fetches the same data
  return getTags(fileId);
}

export default {
  inspectFile,
  getTags,
  refreshTags,
};
