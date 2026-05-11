/**
 * WADO-RS Service
 * DICOMweb client for image retrieval
 */

import { loadRegistry } from './api-registry';

const getWadoBaseUrl = () => {
  const registry = loadRegistry();
  const studiesConfig = registry.studies || {};
  // Use configured baseUrl or default to localhost:8003
  const baseUrl = studiesConfig.baseUrl || 'http://localhost:8003';
  // Ensure no trailing slash
  const cleanBaseUrl = baseUrl.replace(/\/$/, '');
  return `${cleanBaseUrl}/wado-rs`;
};

export const wadoService = {
  /**
   * Get all instances in a study
   * @param {string} studyId - Study Instance UID
   * @returns {Promise<Object>} Study instances
   */
  async getStudy(studyId) {
    try {
      const baseUrl = getWadoBaseUrl();
      const response = await fetch(`${baseUrl}/studies/${studyId}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Failed to get study:', error);
      throw error;
    }
  },

  /**
   * Get all instances in a series
   * @param {string} studyId - Study Instance UID
   * @param {string} seriesId - Series Instance UID
   * @returns {Promise<Object>} Series instances
   */
  async getSeries(studyId, seriesId) {
    try {
      const baseUrl = getWadoBaseUrl();
      const response = await fetch(
        `${baseUrl}/studies/${studyId}/series/${seriesId}`
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Failed to get series:', error);
      throw error;
    }
  },

  /**
   * Get DICOM instance URL
   * @param {string} studyId - Study Instance UID
   * @param {string} seriesId - Series Instance UID
   * @param {string} instanceId - SOP Instance UID
   * @returns {string} Instance URL
   */
  getInstanceUrl(studyId, seriesId, instanceId) {
    const baseUrl = getWadoBaseUrl();
    return `${baseUrl}/studies/${studyId}/series/${seriesId}/instances/${instanceId}`;
  },

  /**
   * Get instance metadata
   * @param {string} studyId - Study Instance UID
   * @param {string} seriesId - Series Instance UID
   * @param {string} instanceId - SOP Instance UID
   * @returns {Promise<Object>} Instance metadata
   */
  async getInstanceMetadata(studyId, seriesId, instanceId) {
    try {
      const baseUrl = getWadoBaseUrl();
      const response = await fetch(
        `${baseUrl}/studies/${studyId}/series/${seriesId}/instances/${instanceId}/metadata`
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Failed to get metadata:', error);
      throw error;
    }
  },

  /**
   * Get thumbnail URL
   * @param {string} studyId - Study Instance UID
   * @param {string} seriesId - Series Instance UID
   * @param {string} instanceId - SOP Instance UID
   * @param {number} size - Thumbnail size (50-500px)
   * @returns {string} Thumbnail URL
   */
  getThumbnailUrl(studyId, seriesId, instanceId, size = 200) {
    const baseUrl = getWadoBaseUrl();
    return `${baseUrl}/studies/${studyId}/series/${seriesId}/instances/${instanceId}/thumbnail?size=${size}`;
  },

  /**
   * Get rendered image URL with windowing
   * @param {string} studyId - Study Instance UID
   * @param {string} seriesId - Series Instance UID
   * @param {string} instanceId - SOP Instance UID
   * @param {number} windowCenter - Window center
   * @param {number} windowWidth - Window width
   * @param {number} quality - JPEG quality (1-100)
   * @returns {string} Rendered image URL
   */
  getRenderedUrl(studyId, seriesId, instanceId, windowCenter, windowWidth, quality = 90) {
    const baseUrl = getWadoBaseUrl();
    let url = `${baseUrl}/studies/${studyId}/series/${seriesId}/instances/${instanceId}/rendered`;
    const params = new URLSearchParams();
    
    if (windowCenter !== undefined && windowCenter !== null) {
      params.append('window_center', windowCenter);
    }
    if (windowWidth !== undefined && windowWidth !== null) {
      params.append('window_width', windowWidth);
    }
    if (quality !== 90) {
      params.append('quality', quality);
    }
    
    const queryString = params.toString();
    return queryString ? `${url}?${queryString}` : url;
  },

  /**
   * Download DICOM instance
   * @param {string} studyId - Study Instance UID
   * @param {string} seriesId - Series Instance UID
   * @param {string} instanceId - SOP Instance UID
   * @returns {Promise<Blob>} DICOM file blob
   */
  async downloadInstance(studyId, seriesId, instanceId) {
    try {
      const url = this.getInstanceUrl(studyId, seriesId, instanceId);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.blob();
    } catch (error) {
      console.error('Failed to download instance:', error);
      throw error;
    }
  },

  /**
   * Check WADO-RS service health
   * @returns {Promise<Object>} Health status
   */
  async checkHealth() {
    try {
      const baseUrl = getWadoBaseUrl();
      const response = await fetch(`${baseUrl}/health`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error('WADO health check failed:', error);
      throw error;
    }
  },

  /**
   * Get base URL
   * @returns {string} Base URL
   */
  getBaseUrl() {
    return getWadoBaseUrl();
  }
};

export default wadoService;
