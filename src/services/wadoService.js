/**
 * WADO-RS Service
 * Optimized via Cloudflare Durable Objects + R2 Cache
 */

import { loadRegistry } from './api-registry';
import { getConfigSync } from './config';
import { isCached, getCachedImage, cacheImage } from './dicomImageCacheService';
import { getAuthHeader } from './auth-storage';

const getWadoBaseUrl = () => {
  const registry = loadRegistry();
  const studiesConfig = registry.studies || {};
  const { apiBaseUrl } = getConfigSync();

  let baseUrl = studiesConfig.baseUrl;

  if (!baseUrl) {
    const prefix = apiBaseUrl || "/backend-api";
    return `${prefix.replace(/\/$/, '')}/wado-rs`;
  }

  const cleanBaseUrl = baseUrl.replace(/\/$/, '');
  if (cleanBaseUrl.startsWith('http')) {
    return cleanBaseUrl.endsWith('/wado-rs') ? cleanBaseUrl : `${cleanBaseUrl}/wado-rs`;
  }
  return cleanBaseUrl.includes('wado-rs') ? cleanBaseUrl : `${cleanBaseUrl}/wado-rs`;
};

const getHeaders = (extraHeaders = {}) => {
  const authHeader = getAuthHeader();
  return { ...authHeader, ...extraHeaders };
};

export const wadoService = {
  getThumbnailUrl(studyId, seriesId, instanceId, size = 200) {
    const { apiBaseUrl } = getConfigSync();
    const prefix = apiBaseUrl || "";
    return `${prefix}/api/studies/${studyId}/series/${seriesId}/instances/${instanceId}/thumbnail?size=${size}`;
  },

  getRenderedUrl(studyId, seriesId, instanceId, windowCenter, windowWidth, quality = 90) {
    const { apiBaseUrl } = getConfigSync();
    const prefix = apiBaseUrl || "";
    let url = `${prefix}/api/studies/${studyId}/series/${seriesId}/instances/${instanceId}/rendered`;
    const params = new URLSearchParams();

    if (windowCenter !== undefined && windowCenter !== null) params.append('window_center', windowCenter);
    if (windowWidth !== undefined && windowWidth !== null) params.append('window_width', windowWidth);
    if (quality !== 90) params.append('quality', quality);

    const queryString = params.toString();
    return queryString ? `${url}?${queryString}` : url;
  },

  getInstanceUrl(studyId, seriesId, instanceId) {
    const { apiBaseUrl } = getConfigSync();
    const prefix = apiBaseUrl || "";
    return `${prefix}/api/studies/${studyId}/series/${seriesId}/instances/${instanceId}/original`;
  },

  async getStudy(studyId) {
    try {
      const baseUrl = getWadoBaseUrl();
      const response = await fetch(`${baseUrl}/studies/${studyId}`, {
        headers: getHeaders({ 'Accept': 'application/json' })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Failed to get study:', error);
      throw error;
    }
  },

  async downloadInstanceWithCache(studyId, seriesId, instanceId) {
    try {
      const cached = await isCached(instanceId);
      if (cached) {
        const arrayBuffer = await getCachedImage(instanceId);
        if (arrayBuffer) return { arrayBuffer, fromCache: true };
      }

      const url = this.getInstanceUrl(studyId, seriesId, instanceId);
      const response = await fetch(url, { headers: getHeaders() });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const arrayBuffer = await response.arrayBuffer();
      try {
        await cacheImage(studyId, seriesId, instanceId, arrayBuffer);
      } catch (cacheError) {
        console.warn('[WadoService] Local cache failed:', cacheError);
      }

      return { arrayBuffer, fromCache: false };
    } catch (error) {
      console.error('[WadoService] Download failed:', error);
      throw error;
    }
  },

  getBaseUrl() {
    return getWadoBaseUrl();
  }
};

export default wadoService;
