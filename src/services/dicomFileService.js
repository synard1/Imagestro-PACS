/**
 * DICOM File Service
 * Handles loading DICOM files from localStorage for viewing
 */

import { getFileByInstanceId } from './dicomStorageService';

/**
 * Convert base64 data URL to ArrayBuffer
 */
function base64ToArrayBuffer(base64) {
  // Remove data URL prefix if present
  const base64Data = base64.split(',')[1] || base64;
  const binaryString = window.atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Convert base64 to Blob
 * @param {string} base64 - Base64 string (with or without data URL prefix)
 * @param {string} mimeType - MIME type for the blob
 * @returns {Blob} DICOM blob
 */
function base64ToBlob(base64, mimeType = 'application/dicom') {
  try {
    const arrayBuffer = base64ToArrayBuffer(base64);
    const blob = new Blob([arrayBuffer], { type: mimeType });

    // Verify blob creation
    if (blob.size === 0) {
      throw new Error('Created blob has zero size - base64 data may be invalid');
    }

    return blob;
  } catch (error) {
    console.error('[DicomFileService] Error converting base64 to blob:', error);
    throw new Error(`Base64 to Blob conversion failed: ${error.message}`);
  }
}

/**
 * Get DICOM file as ArrayBuffer for Cornerstone
 */
export async function getDicomFileAsArrayBuffer(instanceId) {
  try {
    const fileData = getFileByInstanceId(instanceId);
    
    if (!fileData || !fileData.base64Data) {
      throw new Error(`File not found for instance: ${instanceId}`);
    }
    
    console.log('[DicomFileService] Loading file:', {
      instanceId,
      fileName: fileData.fileName,
      size: fileData.fileSize
    });
    
    const arrayBuffer = base64ToArrayBuffer(fileData.base64Data);
    return arrayBuffer;
  } catch (error) {
    console.error('[DicomFileService] Error loading file:', error);
    throw error;
  }
}

/**
 * Get DICOM file as Blob
 */
export async function getDicomFileAsBlob(instanceId) {
  try {
    const fileData = getFileByInstanceId(instanceId);
    
    if (!fileData || !fileData.base64Data) {
      throw new Error(`File not found for instance: ${instanceId}`);
    }
    
    const blob = base64ToBlob(fileData.base64Data, fileData.mimeType);
    return blob;
  } catch (error) {
    console.error('[DicomFileService] Error loading file as blob:', error);
    throw error;
  }
}

/**
 * Get DICOM file as Object URL for display
 */
export async function getDicomFileAsObjectURL(instanceId) {
  try {
    const blob = await getDicomFileAsBlob(instanceId);
    const objectURL = URL.createObjectURL(blob);
    return objectURL;
  } catch (error) {
    console.error('[DicomFileService] Error creating object URL:', error);
    throw error;
  }
}

/**
 * Create image ID for Cornerstone from localStorage
 */
export function createLocalStorageImageId(instanceId) {
  return `localStorage:${instanceId}`;
}

/**
 * Parse localStorage image ID
 */
export function parseLocalStorageImageId(imageId) {
  if (!imageId.startsWith('localStorage:')) {
    return null;
  }
  return imageId.replace('localStorage:', '');
}

/**
 * Check if image ID is from localStorage
 */
export function isLocalStorageImageId(imageId) {
  return imageId && imageId.startsWith('localStorage:');
}

/**
 * Load DICOM file for Cornerstone
 * Returns promise that resolves to image object
 */
export function loadDicomImage(imageId) {
  console.log('[DicomFileService] Loading image:', imageId);
  
  const instanceId = parseLocalStorageImageId(imageId);
  
  if (!instanceId) {
    const error = new Error('Invalid localStorage image ID: ' + imageId);
    return {
      promise: Promise.reject(error),
      cancelFn: undefined
    };
  }
  
  const loadPromise = new Promise((resolve, reject) => {
    try {
      const fileData = getFileByInstanceId(instanceId);
      
      if (!fileData || !fileData.base64Data) {
        reject(new Error(`File not found for instance: ${instanceId}`));
        return;
      }
      
      console.log('[DicomFileService] File found:', {
        instanceId,
        fileName: fileData.fileName,
        size: fileData.fileSize
      });
      
      // Convert base64 to ArrayBuffer
      const arrayBuffer = base64ToArrayBuffer(fileData.base64Data);
      const pixelData = new Uint8Array(arrayBuffer);
      
      // Create a simple grayscale image
      // In real implementation, should parse DICOM headers
      const image = {
        imageId,
        minPixelValue: 0,
        maxPixelValue: 255,
        slope: 1,
        intercept: 0,
        windowCenter: 128,
        windowWidth: 256,
        rows: 512, // Default, should be parsed from DICOM
        columns: 512,
        height: 512,
        width: 512,
        color: false,
        rgba: false,
        columnPixelSpacing: 1,
        rowPixelSpacing: 1,
        invert: false,
        sizeInBytes: arrayBuffer.byteLength,
        getPixelData: () => pixelData,
        decodeTimeInMS: 0
      };
      
      console.log('[DicomFileService] Image loaded successfully');
      resolve(image);
    } catch (error) {
      console.error('[DicomFileService] Error loading DICOM image:', error);
      reject(error);
    }
  });
  
  // Return object with promise property (Cornerstone format)
  return {
    promise: loadPromise,
    cancelFn: undefined
  };
}

/**
 * Get DICOM file as Blob URL for Cornerstone wadouri loader
 * This is the recommended approach for displaying DICOM from localStorage
 *
 * @param {string} instanceId - The instance ID
 * @returns {string} Blob URL (blob:http://...)
 * @throws {Error} If file not found or blob creation fails
 */
export function getDicomBlobUrl(instanceId) {
  try {
    const fileData = getFileByInstanceId(instanceId);

    if (!fileData) {
      throw new Error(`File record not found for instance: ${instanceId}`);
    }

    if (!fileData.base64Data) {
      throw new Error(`No base64 data found for instance: ${instanceId}`);
    }

    console.log('[DicomFileService] Creating blob URL for:', {
      instanceId,
      fileName: fileData.fileName,
      size: fileData.fileSize
    });

    // Convert base64 to blob
    const blob = base64ToBlob(fileData.base64Data, 'application/dicom');

    // Verify blob was created
    if (!blob || blob.size === 0) {
      throw new Error(`Failed to create blob from base64 data for instance: ${instanceId}`);
    }

    // Create object URL
    const blobUrl = URL.createObjectURL(blob);

    console.log('[DicomFileService] ✅ Blob URL created:', {
      blobUrl: blobUrl.substring(0, 50) + '...',
      blobSize: blob.size
    });

    return blobUrl;
  } catch (error) {
    console.error('[DicomFileService] ❌ Error creating blob URL:', error);
    throw new Error(`Failed to create blob URL: ${error.message}`);
  }
}

/**
 * Revoke blob URL to free memory
 */
export function revokeDicomBlobUrl(blobUrl) {
  try {
    URL.revokeObjectURL(blobUrl);
    console.log('[DicomFileService] Blob URL revoked:', blobUrl);
  } catch (error) {
    console.warn('[DicomFileService] Error revoking blob URL:', error);
  }
}

export default {
  getDicomFileAsArrayBuffer,
  getDicomFileAsBlob,
  getDicomFileAsObjectURL,
  createLocalStorageImageId,
  parseLocalStorageImageId,
  isLocalStorageImageId,
  loadDicomImage,
  getDicomBlobUrl,
  revokeDicomBlobUrl
};
