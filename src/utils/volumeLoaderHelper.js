import * as cornerstone from '@cornerstonejs/core';

/**
 * Helper to create and load a volume from imageIds
 * @param {string} volumeId 
 * @param {string[]} imageIds 
 * @returns {Promise<Object>} The created volume
 */
export async function createVolumeFromImages(volumeId, imageIds) {
    const { volumeLoader } = cornerstone;

    // Define the volume
    // For 'wadouri', we rely on Cornerstone to fetch metadata from the images
    // We might need to ensure metadata is pre-loaded or use 'cornerstoneStreamingImageVolume' if we had WADO-RS
    
    // Since we are using wadouri (stack), we create a volume that wraps these images
    // If the scheme is 'cornerstoneStreamingImageVolume', it expects a WADO-RS volume.
    // For stack images, we might need to use a different approach or define it manually.

    // Try defining it as a dynamic volume or just pass imageIds if the loader supports it
    // Cornerstone 1.x supports creating volume from imageIds
    
    try {
        // Check if volume already exists
        const existingVolume = await cornerstone.cache.getVolume(volumeId);
        if (existingVolume) {
            return existingVolume;
        }

        const volume = await volumeLoader.createAndCacheVolume(volumeId, {
            imageIds: imageIds,
        });

        return volume;
    } catch (error) {
        console.error("Failed to create volume:", error);
        throw error;
    }
}
