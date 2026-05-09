/**
 * DICOM Image Loading Configuration Service
 * Manages strategy for loading DICOM images
 * 
 * Strategies:
 * - 'wado-rs' (proxy): Load via backend WADO-RS proxy - supports progress tracking
 * - 'presigned-url' (direct): Load directly from S3 presigned URL - faster but no progress
 * - 'auto': Use presigned URL if available, fallback to WADO-RS
 * 
 * For progress bar to work correctly, use 'wado-rs' strategy
 */

// Local storage key for runtime config override
const CONFIG_KEY = 'pacs_image_load_config';

/**
 * Get runtime config from localStorage (allows changing without restart)
 */
function getRuntimeConfig() {
  try {
    const stored = localStorage.getItem(CONFIG_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('[DicomImageLoadConfig] Failed to read runtime config:', e);
  }
  return null;
}

/**
 * Set runtime config (persists to localStorage)
 * @param {Object} config - { strategy: 'wado-rs' | 'presigned-url' | 'auto' }
 */
export function setImageLoadConfig(config) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    console.log('[DicomImageLoadConfig] Runtime config updated:', config);
  } catch (e) {
    console.warn('[DicomImageLoadConfig] Failed to save runtime config:', e);
  }
}

/**
 * Clear runtime config (revert to env/default)
 */
export function clearImageLoadConfig() {
  localStorage.removeItem(CONFIG_KEY);
  console.log('[DicomImageLoadConfig] Runtime config cleared');
}

/**
 * Get the configured image loading strategy
 * Priority: Runtime config > Environment variable > Default ('wado-rs')
 * 
 * @returns {string} 'presigned-url' | 'wado-rs' | 'auto'
 */
export function getImageLoadStrategy() {
  // 1. Check runtime config first (allows changing without restart)
  const runtimeConfig = getRuntimeConfig();
  if (runtimeConfig?.strategy) {
    return runtimeConfig.strategy;
  }
  
  // 2. Check environment variable
  const envStrategy = import.meta.env.VITE_DICOM_IMAGE_LOAD_STRATEGY;
  if (envStrategy) {
    return envStrategy;
  }
  
  // 3. Default to 'wado-rs' for progress bar support
  const defaultStrategy = 'wado-rs';
  return defaultStrategy;
}

/**
 * Get the configured image loading timeout
 * @returns {number} Timeout in milliseconds
 */
export function getImageLoadTimeout() {
  const timeout = parseInt(import.meta.env.VITE_DICOM_IMAGE_LOAD_TIMEOUT_MS || '90000', 10);
  return timeout;
}

/**
 * Determine if we should use presigned URL for this image
 * @param {string} imageId - The image ID
 * @param {Object} instance - The instance data with presigned_url
 * @returns {boolean} True if should use presigned URL
 */
export function shouldUsePresignedUrl(imageId, instance) {
  const strategy = getImageLoadStrategy();
  
  // WADO-RS strategy: NEVER use presigned URL, always go through proxy
  if (strategy === 'wado-rs') {
    return false;
  }
  
  // Check if presigned URL is available
  const hasPresignedUrl = instance?.presigned_url || 
    imageId?.includes('contabostorage.com') || 
    imageId?.includes('amazonaws.com') ||
    imageId?.includes('s3.');
  
  if (strategy === 'presigned-url') {
    // Always use presigned URL if configured and available
    if (!hasPresignedUrl) {
      console.warn('[DicomImageLoadConfig] Presigned URL strategy but no presigned URL available');
    }
    return hasPresignedUrl;
  }
  
  // 'auto' - use presigned URL if available, otherwise WADO-RS
  return hasPresignedUrl;
}

/**
 * Get the image URL based on strategy
 * @param {Object} instance - Instance data
 * @param {string} studyUID - Study UID
 * @param {string} seriesUID - Series UID
 * @param {string} sopUID - SOP Instance UID
 * @returns {string} The image URL to use
 */
export function getImageUrl(instance, studyUID, seriesUID, sopUID) {
  const strategy = getImageLoadStrategy();
  
  // For wado-rs strategy, ALWAYS use WADO-RS endpoint (proxy) - ignore presigned URLs
  if (strategy === 'wado-rs') {
    if (studyUID && seriesUID && sopUID) {
      // Use /original to get the raw DICOM Part 10 file for Enhanced Viewer
      const wadoUrl = `${window.location.origin}/wado-rs/studies/${studyUID}/series/${seriesUID}/instances/${sopUID}/original`;
      return `wadouri:${wadoUrl}`;
    } else {
      console.error('[DicomImageLoadConfig] Missing UIDs for WADO-RS:', { studyUID, seriesUID, sopUID });
    }
  }

  // If already has imageId (localStorage), use it (only for non-wado-rs strategy)
  if (instance?.imageId && instance.imageId.startsWith('wadouri:')) {
    return instance.imageId;
  }

  // Check if should use presigned URL (for 'auto' or 'presigned-url' strategy)
  if (shouldUsePresignedUrl('', instance)) {
    if (instance?.presigned_url) {
      return `wadouri:${instance.presigned_url}`;
    }
  }

  // Fallback to WADO-RS endpoint
  if (studyUID && seriesUID && sopUID) {
    const wadoUrl = `${window.location.origin}/wado-rs/studies/${studyUID}/series/${seriesUID}/instances/${sopUID}/original`;
    return `wadouri:${wadoUrl}`;
  }
  
  return null;
}

/**
 * Get current config info for debugging/display
 */
export function getConfigInfo() {
  const strategy = getImageLoadStrategy();
  const runtimeConfig = getRuntimeConfig();
  
  return {
    strategy,
    isRuntimeOverride: !!runtimeConfig?.strategy,
    description: strategy === 'wado-rs' 
      ? 'Loading via proxy (progress bar enabled)'
      : strategy === 'presigned-url'
        ? 'Loading direct from S3 (faster, no progress)'
        : 'Auto-detect (S3 if available, else proxy)'
  };
}

/**
 * Get error message for timeout based on strategy
 * @returns {string} Error message
 */
export function getTimeoutErrorMessage() {
  const strategy = getImageLoadStrategy();
  const timeout = getImageLoadTimeout();
  
  if (strategy === 'presigned-url') {
    return `Image loading timeout (${timeout}ms) - S3 presigned URL may be slow or unreachable.`;
  } else if (strategy === 'wado-rs') {
    return `Image loading timeout (${timeout}ms) - WADO-RS proxy may be slow. Check backend.`;
  } else {
    return `Image loading timeout (${timeout}ms) - Both presigned URL and WADO-RS failed.`;
  }
}

export default {
  getImageLoadStrategy,
  getImageLoadTimeout,
  shouldUsePresignedUrl,
  getImageUrl,
  getConfigInfo,
  setImageLoadConfig,
  clearImageLoadConfig,
  getTimeoutErrorMessage
};
