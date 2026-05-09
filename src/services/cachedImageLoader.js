/**
 * Custom Cornerstone WADO Image Loader with Caching
 * Wraps the default loader to add IndexedDB caching
 */

import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';
import { isCached, getCachedImage, cacheImage } from './dicomImageCacheService';
import { getAuthHeader } from './auth-storage';

// Store the original loader
let originalLoader = null;

// Map to store pending requests for deduplication
const pendingRequests = new Map();

/**
 * Load image with progress tracking (for any URL)
 * @param {string} url - The actual URL to fetch
 * @param {string} imageId - The original imageId for progress events
 * @returns {Promise<ArrayBuffer>} - The image data
 */
async function loadWithProgressTracking(url, imageId) {
  const authHeaders = getAuthHeader() || {};
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      headers: {
        'Accept': 'application/dicom',
        ...authHeaders
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    // Get content-length for progress tracking
    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;
    
    // Use ReadableStream to track progress
    const reader = response.body.getReader();
    const chunks = [];
    let loaded = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      loaded += value.length;

      // Dispatch progress event for UI
      const event = new CustomEvent('dicom-image-progress', {
        detail: {
          imageId,
          loaded,
          total
        }
      });
      window.dispatchEvent(event);
    }
    
    // Reassemble the chunks into a single Uint8Array
    const combinedChunks = new Uint8Array(loaded);
    let position = 0;
    for (const chunk of chunks) {
      combinedChunks.set(chunk, position);
      position += chunk.length;
    }
    
    const arrayBuffer = combinedChunks.buffer;
    
    if (arrayBuffer.byteLength === 0) {
      throw new Error('Downloaded empty image data');
    }
    
    return arrayBuffer;
  } catch (error) {
    console.error(`[CachedImageLoader] Load failed: ${error.message}`);
    throw error;
  }
}

/**
 * Load and cache an image from a WADO-RS URL
 * @param {string} imageId - The Cornerstone imageId
 * @returns {Promise<ArrayBuffer>} - The image data as ArrayBuffer
 */
export async function loadAndCacheImage(imageId) {
  // Check if we already have a pending request for this imageId
  if (pendingRequests.has(imageId)) {
    console.log(`[CachedImageLoader] ⚡ Request deduplication: Reusing pending request for ${imageId}`);
    return pendingRequests.get(imageId);
  }

  // Create a new promise for this request
  const requestPromise = (async () => {
    // Import config
    const { getImageLoadStrategy } = await import('./dicomImageLoadConfig');
    const strategy = getImageLoadStrategy();
    
    // Check if this is a presigned S3 URL (direct S3 access)
    const isPresignedS3 = imageId.includes('contabostorage.com') || imageId.includes('amazonaws.com') || imageId.includes('s3');
    
    if (isPresignedS3 && strategy !== 'wado-rs') {
      // For S3 presigned URLs, load with progress tracking
      const actualUrl = imageId.replace('wadouri:', '');
      
      try {
        // S3 presigned URLs may have CORS issues, so we try with mode: 'cors'
        const response = await fetch(actualUrl, {
          method: 'GET',
          mode: 'cors',
          credentials: 'omit',
          headers: {
            'Accept': 'application/dicom'
          }
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        // Get content-length for progress tracking
        const contentLength = response.headers.get('content-length');
        const total = contentLength ? parseInt(contentLength, 10) : 0;
        
        // Use ReadableStream to track progress (same as WADO-RS)
        const reader = response.body.getReader();
        const chunks = [];
        let loaded = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          chunks.push(value);
          loaded += value.length;

          // Dispatch progress event for UI
          const event = new CustomEvent('dicom-image-progress', {
            detail: {
              imageId,
              loaded,
              total
            }
          });
          window.dispatchEvent(event);
        }
        
        // Reassemble the chunks into a single Uint8Array
        const combinedChunks = new Uint8Array(loaded);
        let position = 0;
        for (const chunk of chunks) {
          combinedChunks.set(chunk, position);
          position += chunk.length;
        }
        
        const arrayBuffer = combinedChunks.buffer;
        
        if (arrayBuffer.byteLength === 0) {
          throw new Error('Downloaded empty image data');
        }
        
        return arrayBuffer;
      } catch (error) {
        console.error('[CachedImageLoader] Direct S3 load failed (likely CORS):', error.message);
        
        if (strategy === 'presigned-url') {
          // If strategy is presigned-url only, don't fallback
          throw error;
        }
        
        console.log('[CachedImageLoader] Falling back to WADO-RS endpoint via backend proxy');
        // Fall through to WADO-RS endpoint which will redirect to S3
      }
    }
    
    // WADO-RS endpoint will automatically follow redirects (307, 308) to presigned URLs
    
    // Check if this is a WADO-RS URL that we should cache
    // Match pattern: wadouri:http://localhost:5173/wado-rs/v2/studies/.../series/.../instances/...
    const wadoMatch = imageId.match(/\/wado-rs(?:\/v\d+)?\/studies\/([^\/]+)\/series\/([^\/]+)\/instances\/([^\/\?]+)/);
    
    // For presigned S3 URLs that don't match WADO pattern, still load with progress tracking
    // but skip caching since we don't have UIDs
    if (!wadoMatch) {
      const actualUrl = imageId.replace('wadouri:', '');
      return await loadWithProgressTracking(actualUrl, imageId);
    }

    const [, studyUID, seriesUID, instanceUID] = wadoMatch;

    // 1. Try Cache
    try {
      const cached = await isCached(instanceUID);
      
      if (cached) {
        const arrayBuffer = await getCachedImage(instanceUID);
        
        if (arrayBuffer) {
          // Dispatch progress event for cached image (instant load)
          const event = new CustomEvent('dicom-image-progress', {
            detail: {
              imageId,
              loaded: arrayBuffer.byteLength,
              total: arrayBuffer.byteLength
            }
          });
          window.dispatchEvent(event);
          
          return arrayBuffer;
        }
      }
    } catch (cacheErr) {
      console.warn('[CachedImageLoader] Cache lookup failed, falling back to network:', cacheErr);
      // Continue to network load
    }
    
    // 2. Network Load
    const actualUrl = imageId.replace('wadouri:', '');
    const authHeaders = getAuthHeader() || {};
    
    try {
      const response = await fetch(actualUrl, {
        headers: {
          ...authHeaders
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unable to read response body');
        console.error(`[CachedImageLoader] HTTP ${response.status}: ${response.statusText}`);
        throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText.substring(0, 200)}`);
      }
      
      const contentLength = response.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;

      // Use ReadableStream to track progress
      const reader = response.body.getReader();
      const chunks = [];
      let loaded = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        loaded += value.length;

        // Dispatch progress event
        // We use a custom event on the window object so the UI can listen to it
        const event = new CustomEvent('dicom-image-progress', {
          detail: {
            imageId,
            loaded,
            total
          }
        });
        window.dispatchEvent(event);
      }
      
      // Reassemble the chunks into a single Uint8Array
      const combinedChunks = new Uint8Array(loaded);
      let position = 0;
      for (const chunk of chunks) {
        combinedChunks.set(chunk, position);
        position += chunk.length;
      }
      
      // Get the ArrayBuffer from the Uint8Array
      const arrayBuffer = combinedChunks.buffer;
      
      // Validate the response
      if (arrayBuffer.byteLength === 0) {
        console.error('[CachedImageLoader] Downloaded empty arrayBuffer');
        throw new Error('Downloaded empty image data');
      }
      
      // 3. Cache the downloaded data (background, don't await)
      try {
        cacheImage(studyUID, seriesUID, instanceUID, arrayBuffer).catch(() => {});
      } catch (cacheError) {
        // Ignore cache errors
      }

      return arrayBuffer;
    } catch (fetchError) {
      console.error(`[CachedImageLoader] Network fetch failed for ${actualUrl}:`, fetchError);
      throw fetchError;
    }
  })();

  // Store the promise in the map
  pendingRequests.set(imageId, requestPromise);

  // Clean up the map when the promise settles (success or failure)
  requestPromise.finally(() => {
    pendingRequests.delete(imageId);
  });

  return requestPromise;
}

/**
 * Initialize the cached image loader
 * This should be called after Cornerstone is initialized
 * @param {Object} cornerstone - The cornerstone-core instance
 */
export function initCachedImageLoader(cornerstone) {
  if (originalLoader) {
    console.log('[CachedImageLoader] Already initialized');
    return;
  }

  if (!cornerstone) {
    console.error('[CachedImageLoader] Cornerstone instance required for initialization');
    return;
  }

  // Get reference to original wadouri loader
  originalLoader = cornerstoneDICOMImageLoader.wadouri.loadImage;

  // Replace with caching wrapper
  cornerstoneDICOMImageLoader.wadouri.loadImage = function cachedLoadImage(imageId, options) {
    // Safety check
    if (!imageId || typeof imageId !== 'string') {
      console.warn('[CachedImageLoader] Invalid imageId:', imageId);
      return originalLoader.call(this, imageId, options);
    }

    // Check if this is a WADO-RS URL that we should cache
    const isWado = imageId.includes('/wado-rs/') && imageId.includes('/studies/') && imageId.includes('/series/') && imageId.includes('/instances/');
    
    // Check if this is a presigned S3 URL that needs progress tracking
    const isPresignedS3 = imageId.includes('contabostorage.com') || imageId.includes('amazonaws.com') || imageId.includes('s3.');
    
    if (isWado || isPresignedS3) {
      return {
        promise: (async () => {
          try {
            const arrayBuffer = await loadAndCacheImage(imageId);
            
            if (arrayBuffer) {
              // Validate arrayBuffer
              if (!arrayBuffer || arrayBuffer.byteLength === 0) {
                console.error('[CachedImageLoader] Invalid arrayBuffer - empty or null');
                throw new Error('Invalid image data');
              }
              
              try {
                // Create a blob URL and load with original loader
                const blob = new Blob([arrayBuffer], { type: 'application/dicom' });
                
                if (blob.size === 0) {
                  console.error('[CachedImageLoader] Created empty blob');
                  throw new Error('Empty image blob');
                }
                
                const blobUrl = URL.createObjectURL(blob);
                const blobImageId = `wadouri:${blobUrl}`;
                
                // Add error handling for the original loader call
                const loadResult = originalLoader.call(this, blobImageId, options);
                
                if (!loadResult) {
                  console.error('[CachedImageLoader] Original loader returned null/undefined');
                  URL.revokeObjectURL(blobUrl); // Clean up immediately
                  throw new Error('Original loader failed - no result');
                }
                
                if (!loadResult.promise) {
                  console.error('[CachedImageLoader] Original loader did not return a valid promise');
                  URL.revokeObjectURL(blobUrl); // Clean up immediately
                  throw new Error('Original loader failed - no promise');
                }
                
                // Don't revoke the blob URL immediately, let Cornerstone handle it
                const image = await loadResult.promise;
                
                // Clean up blob URL after delay
                setTimeout(() => {
                  try {
                    URL.revokeObjectURL(blobUrl);
                  } catch (e) {
                    // Ignore cleanup errors
                  }
                }, 30000);
                
                return image;
              } catch (blobError) {
                console.error('[CachedImageLoader] Error creating or loading blob:', blobError);
                throw blobError;
              }
            }
            
            // Fallback if loadAndCacheImage returns null
            const fallbackResult = originalLoader.call(this, imageId, options);
            
            if (!fallbackResult || !fallbackResult.promise) {
              console.error('[CachedImageLoader] Fallback loader failed');
              throw new Error('Fallback loader failed');
            }
            
            return fallbackResult.promise;

          } catch (error) {
            console.error('[CachedImageLoader] Error:', error.message);
            // Final fallback: try original loader directly
            const loadResult = originalLoader.call(this, imageId, options);
            if (loadResult && loadResult.promise) {
              return await loadResult.promise;
            } else {
              throw new Error('Both cached and original loaders failed');
            }
          }
        })(),
        cancelFn: undefined
      };
    }
    
    // Not a WADO-RS URL, use original loader
    if (originalLoader) {
      return originalLoader.call(this, imageId, options);
    } else {
      console.error('[CachedImageLoader] Critical: originalLoader is null!');
      // Fallback to default wadouri loader if possible, though this shouldn't happen if initialized correctly
      return cornerstoneDICOMImageLoader.wadouri.loadImage(imageId, options);
    }
  };

  // Re-register the loader with Cornerstone to ensure it uses our wrapper
  cornerstone.registerImageLoader('wadouri', cornerstoneDICOMImageLoader.wadouri.loadImage);
}

/**
 * Reset to original loader (for cleanup/testing)
 * @param {Object} cornerstone - The cornerstone-core instance
 */
export function resetImageLoader(cornerstone) {
  if (originalLoader) {
    cornerstoneDICOMImageLoader.wadouri.loadImage = originalLoader;
    
    if (cornerstone) {
      cornerstone.registerImageLoader('wadouri', originalLoader);
    }
    
    originalLoader = null;
  }
}

export default {
  initCachedImageLoader,
  resetImageLoader,
  loadAndCacheImage
};
