/**
 * DICOM Image Cache Service
 * Manages caching of DICOM images using IndexedDB for persistent storage
 * Prevents redundant downloads from backend API
 */

const DB_NAME = 'DICOMImageCache';
const DB_VERSION = 1;
const STORE_NAME = 'images';
const CACHE_EXPIRY_DAYS = 30;

/**
 * IndexedDB instance
 */
let db = null;

/**
 * Initialize IndexedDB
 * @returns {Promise<IDBDatabase>}
 */
export async function initDB() {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[ImageCache] Failed to open IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      db = request.result;
      // console.log('[ImageCache] IndexedDB initialized successfully');
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      // Create object store if it doesn't exist
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = database.createObjectStore(STORE_NAME, { keyPath: 'instanceUID' });
        
        // Create indexes for efficient querying
        objectStore.createIndex('studyUID', 'studyUID', { unique: false });
        objectStore.createIndex('seriesUID', 'seriesUID', { unique: false });
        objectStore.createIndex('timestamp', 'timestamp', { unique: false });
        
        console.log('[ImageCache] Object store created with indexes');
      }
    };
  });
}

/**
 * Check if an image is cached
 * @param {string} instanceUID - SOP Instance UID
 * @returns {Promise<boolean>}
 */
export async function isCached(instanceUID) {
  try {
    await initDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(instanceUID);

      request.onsuccess = () => {
        const record = request.result;
        
        if (!record) {
          resolve(false);
          return;
        }

        // Check if cache is expired
        const now = Date.now();
        const expiryTime = record.timestamp + (CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
        
        if (now > expiryTime) {
          console.log(`[ImageCache] Cache expired for ${instanceUID}`);
          // Delete expired entry
          deleteFromCache(instanceUID);
          resolve(false);
        } else {
          resolve(true);
        }
      };

      request.onerror = () => {
        console.error('[ImageCache] Error checking cache:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('[ImageCache] Error in isCached:', error);
    return false;
  }
}

/**
 * Cache a DICOM image
 * @param {string} studyUID - Study Instance UID
 * @param {string} seriesUID - Series Instance UID
 * @param {string} instanceUID - SOP Instance UID
 * @param {ArrayBuffer} arrayBuffer - DICOM file data
 * @returns {Promise<void>}
 */
export async function cacheImage(studyUID, seriesUID, instanceUID, arrayBuffer) {
  try {
    await initDB();

    const record = {
      instanceUID,
      studyUID,
      seriesUID,
      data: arrayBuffer,
      timestamp: Date.now(),
      size: arrayBuffer.byteLength
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(record);

      request.onsuccess = () => {
        console.log(`[ImageCache] Cached image: ${instanceUID} (${(arrayBuffer.byteLength / 1024).toFixed(2)} KB)`);
        resolve();
      };

      request.onerror = () => {
        console.error('[ImageCache] Error caching image:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('[ImageCache] Error in cacheImage:', error);
    throw error;
  }
}

/**
 * Get cached image
 * @param {string} instanceUID - SOP Instance UID
 * @returns {Promise<ArrayBuffer|null>}
 */
export async function getCachedImage(instanceUID) {
  try {
    await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(instanceUID);

      request.onsuccess = () => {
        const record = request.result;

        if (!record) {
          resolve(null);
          return;
        }

        // Check if cache is expired
        const now = Date.now();
        const expiryTime = record.timestamp + (CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

        if (now > expiryTime) {
          console.log(`[ImageCache] Cache expired for ${instanceUID}`);
          deleteFromCache(instanceUID);
          resolve(null);
        } else {
          console.log(`[ImageCache] Loaded from cache: ${instanceUID}`);
          resolve(record.data);
        }
      };

      request.onerror = () => {
        console.error('[ImageCache] Error getting cached image:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('[ImageCache] Error in getCachedImage:', error);
    return null;
  }
}

/**
 * Delete image from cache
 * @param {string} instanceUID - SOP Instance UID
 * @returns {Promise<void>}
 */
export async function deleteFromCache(instanceUID) {
  try {
    await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(instanceUID);

      request.onsuccess = () => {
        console.log(`[ImageCache] Deleted from cache: ${instanceUID}`);
        resolve();
      };

      request.onerror = () => {
        console.error('[ImageCache] Error deleting from cache:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('[ImageCache] Error in deleteFromCache:', error);
  }
}

/**
 * Clear all expired cache entries
 * @returns {Promise<number>} Number of deleted entries
 */
export async function clearExpiredCache() {
  try {
    await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.openCursor();
      
      let deletedCount = 0;
      const now = Date.now();

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        
        if (cursor) {
          const record = cursor.value;
          const expiryTime = record.timestamp + (CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
          
          if (now > expiryTime) {
            cursor.delete();
            deletedCount++;
          }
          
          cursor.continue();
        } else {
          // console.log(`[ImageCache] Cleared ${deletedCount} expired entries`);
          resolve(deletedCount);
        }
      };

      request.onerror = () => {
        console.error('[ImageCache] Error clearing expired cache:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('[ImageCache] Error in clearExpiredCache:', error);
    return 0;
  }
}

/**
 * Clear entire cache
 * @returns {Promise<void>}
 */
export async function clearAllCache() {
  try {
    await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        console.log('[ImageCache] All cache cleared');
        resolve();
      };

      request.onerror = () => {
        console.error('[ImageCache] Error clearing cache:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('[ImageCache] Error in clearAllCache:', error);
  }
}

/**
 * Get cache statistics
 * @returns {Promise<Object>}
 */
export async function getCacheStats() {
  try {
    await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.openCursor();

      let totalSize = 0;
      let totalCount = 0;
      const studies = new Set();
      const series = new Set();

      request.onsuccess = (event) => {
        const cursor = event.target.result;

        if (cursor) {
          const record = cursor.value;
          totalSize += record.size || 0;
          totalCount++;
          studies.add(record.studyUID);
          series.add(record.seriesUID);
          cursor.continue();
        } else {
          resolve({
            totalCount,
            totalSize,
            totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
            studyCount: studies.size,
            seriesCount: series.size
          });
        }
      };

      request.onerror = () => {
        console.error('[ImageCache] Error getting cache stats:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('[ImageCache] Error in getCacheStats:', error);
    return {
      totalCount: 0,
      totalSize: 0,
      totalSizeMB: '0.00',
      studyCount: 0,
      seriesCount: 0
    };
  }
}

/**
 * Clear cache for a specific study
 * @param {string} studyUID - Study Instance UID
 * @returns {Promise<number>} Number of deleted entries
 */
export async function clearStudyCache(studyUID) {
  try {
    await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('studyUID');
      const request = index.openCursor(IDBKeyRange.only(studyUID));

      let deletedCount = 0;

      request.onsuccess = (event) => {
        const cursor = event.target.result;

        if (cursor) {
          cursor.delete();
          deletedCount++;
          cursor.continue();
        } else {
          console.log(`[ImageCache] Cleared ${deletedCount} entries for study ${studyUID}`);
          resolve(deletedCount);
        }
      };

      request.onerror = () => {
        console.error('[ImageCache] Error clearing study cache:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('[ImageCache] Error in clearStudyCache:', error);
    return 0;
  }
}

// Initialize on module load
initDB().catch(err => {
  console.error('[ImageCache] Failed to initialize on load:', err);
});

// Auto-cleanup expired cache on load
setTimeout(() => {
  clearExpiredCache().catch(err => {
    console.error('[ImageCache] Failed to clear expired cache:', err);
  });
}, 2000);

export default {
  initDB,
  isCached,
  cacheImage,
  getCachedImage,
  deleteFromCache,
  clearExpiredCache,
  clearAllCache,
  getCacheStats,
  clearStudyCache
};
