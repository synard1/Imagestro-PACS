/**
 * DICOM Image Cache with Manual Fetch Wrapper
 * Simpler approach: cache images manually when fetching
 */

import { isCached, getCachedImage, cacheImage } from './dicomImageCacheService';

/**
 * Fetch and cache a DICOM instance
 * @param {string} wadoUrl - Full WADO-RS URL
 * @param {string} studyUID - Study Instance UID
 * @param {string} seriesUID - Series Instance UID  
 * @param {string} instanceUID - SOP Instance UID
 * @returns {Promise<{blob: Blob, fromCache: boolean}>}
 */
export async function fetchAndCacheDicom(wadoUrl, studyUID, seriesUID, instanceUID) {
  try {
    // Check cache first
    const cached = await isCached(instanceUID);
    
    if (cached) {
      console.log(`[DicomCache] ✅ Loading from cache: ${instanceUID}`);
      const arrayBuffer = await getCachedImage(instanceUID);
      
      if (arrayBuffer) {
        const blob = new Blob([arrayBuffer], { type: 'application/dicom' });
        return {
          blob,
          fromCache: true
        };
      }
    }
    
    // Not cached, fetch from network
    console.log(`[DicomCache] 📥 Downloading from network: ${instanceUID}`);
    console.log(`[DicomCache] URL: ${wadoUrl}`);
    
    const response = await fetch(wadoUrl);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: 'application/dicom' });
    
    // Cache for next time
    try {
      await cacheImage(studyUID, seriesUID, instanceUID, arrayBuffer);
      console.log(`[DicomCache] ✅ Cached: ${instanceUID} (${(arrayBuffer.byteLength / 1024).toFixed(2)} KB)`);
    } catch (cacheError) {
      console.warn('[DicomCache] Failed to cache:', cacheError);
    }
    
    return {
      blob,
      fromCache: false
    };
  } catch (error) {
    console.error('[DicomCache] Error fetching DICOM:', error);
    throw error;
  }
}

export default {
  fetchAndCacheDicom
};
