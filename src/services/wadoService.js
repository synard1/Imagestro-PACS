/**
 * WADO-RS Service
 * DICOMweb client for image retrieval
 */

import { loadRegistry } from './api-registry';
import { getConfigSync } from './config';
import { isCached, getCachedImage, cacheImage } from './dicomImageCacheService';
import { getAuthHeader } from './auth-storage';

const getWadoBaseUrl = () => {
  const registry = loadRegistry();
  const studiesConfig = registry.studies || {};
  const { apiBaseUrl } = getConfigSync();
  
  // Try registry first
  let baseUrl = studiesConfig.baseUrl;
  
  // If no registry baseUrl, use the standard prefixed path
  if (!baseUrl) {
    // If apiBaseUrl is empty, default to /backend-api for consistency with apiClient
    // This ensures all WADO requests go through the gateway
    const prefix = apiBaseUrl || "/backend-api";
    const cleanPrefix = prefix.replace(/\/$/, '');
    
    // In our architecture, /wado-rs is the standard suffix for DICOMweb
    return `${cleanPrefix}/wado-rs`;
  }

  // Ensure no trailing slash
  const cleanBaseUrl = baseUrl.replace(/\/$/, '');
  
  // If it's an absolute URL, ensure it has /wado-rs suffix
  if (cleanBaseUrl.startsWith('http')) {
    return cleanBaseUrl.endsWith('/wado-rs') ? cleanBaseUrl : `${cleanBaseUrl}/wado-rs`;
  }
  
  // If it's a relative path and doesn't contain wado-rs, append it
  // This helps when baseUrl is just "/backend-api" or similar
  if (cleanBaseUrl && !cleanBaseUrl.includes('wado-rs')) {
     return `${cleanBaseUrl}/wado-rs`;
  }
  
  // Return the base URL as is (assuming it's already /wado-rs or similar)
  return cleanBaseUrl;
};

// Helper to get headers including auth
const getHeaders = (extraHeaders = {}) => {
  const authHeader = getAuthHeader();
  return {
    ...authHeader,
    ...extraHeaders
  };
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

      const response = await fetch(`${baseUrl}/studies/${studyId}`, {
        headers: getHeaders({ 'Accept': 'application/json' })
      });
      if (!response.ok) {
        console.error(`[WadoService] HTTP Error: ${response.status} ${response.statusText}`);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.warn(`[WadoService] Unexpected content type: ${contentType}`);
        const text = await response.text();

        throw new Error(`Unexpected response format. Expected JSON but got ${contentType || 'unknown'}.`);
      }
      const data = await response.json();

      return data;
    } catch (error) {
      console.error('Failed to get study:', error);
      throw error;
    }
  },

  /**
   * Get frame from a multi-frame instance
   * @param {string} studyId - Study Instance UID
   * @param {string} seriesId - Series Instance UID
   * @param {string} instanceId - SOP Instance UID
   * @param {number} frameNumber - Frame number (1-based)
   * @param {number} quality - JPEG quality (1-100)
   * @returns {Promise<Blob>} Frame image blob
   */
  async getFrame(studyId, seriesId, instanceId, frameNumber, quality = 90) {
    try {
      const baseUrl = getWadoBaseUrl();
      const url = `${baseUrl}/studies/${studyId}/series/${seriesId}/instances/${instanceId}/frames/${frameNumber}?quality=${quality}`;
      const response = await fetch(url, {
        headers: getHeaders()
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.blob();
    } catch (error) {
      console.error('Failed to get frame:', error);
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
      const url = `${baseUrl}/studies/${studyId}/series/${seriesId}`;

      const response = await fetch(url, {
        headers: getHeaders({ 'Accept': 'application/json' })
      });
      if (!response.ok) {
        console.error(`[WadoService] HTTP Error for series: ${response.status} ${response.statusText}`);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.warn(`[WadoService] Unexpected content type for series: ${contentType}`);
        const text = await response.text();

        throw new Error(`Unexpected response format for series. Expected JSON but got ${contentType || 'unknown'}.`);
      }
      const data = await response.json();

      return data;
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
        `${baseUrl}/studies/${studyId}/series/${seriesId}/instances/${instanceId}/metadata`,
        { headers: getHeaders({ 'Accept': 'application/json' }) }
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
      const response = await fetch(url, {
        headers: getHeaders()
      });
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
   * Download DICOM instance with caching support
   * @param {string} studyId - Study Instance UID
   * @param {string} seriesId - Series Instance UID
   * @param {string} instanceId - SOP Instance UID
   * @returns {Promise<{arrayBuffer: ArrayBuffer, fromCache: boolean}>}
   */
  async downloadInstanceWithCache(studyId, seriesId, instanceId) {
    try {
      // Check if image is cached
      const cached = await isCached(instanceId);
      
      if (cached) {

        const arrayBuffer = await getCachedImage(instanceId);
        
        if (arrayBuffer) {
          return {
            arrayBuffer,
            fromCache: true
          };
        }
      }

      // Not cached or cache failed, download from backend

      const url = this.getInstanceUrl(studyId, seriesId, instanceId);
      const response = await fetch(url, {
        headers: getHeaders()
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();

      // Cache the downloaded image
      try {
        await cacheImage(studyId, seriesId, instanceId, arrayBuffer);

      } catch (cacheError) {
        console.warn('[WadoService] Failed to cache image:', cacheError);
        // Don't fail the download if caching fails
      }

      return {
        arrayBuffer,
        fromCache: false
      };
    } catch (error) {
      console.error('[WadoService] Failed to download instance:', error);
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
      const response = await fetch(`${baseUrl}/health`, {
        headers: getHeaders({ 'Accept': 'application/json' })
      });
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
