/**
 * DICOM Storage Service
 * Manages DICOM file storage in localStorage for mock/development mode
 */

const STORAGE_KEYS = {
  STUDIES: 'pacs_studies',
  SERIES: 'pacs_series',
  INSTANCES: 'pacs_instances',
  FILES: 'pacs_files' // Base64 encoded files
};

/**
 * Generate unique IDs for DICOM entities
 */
function generateUID(prefix = '1.2.840.113619') {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000000);
  return `${prefix}.${timestamp}.${random}`;
}

/**
 * Convert File to base64 string
 */
async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Parse DICOM file metadata (simplified - in real app would use dicom-parser)
 */
function parseDicomMetadata(file, metadata) {
  // For mock mode, generate metadata based on file info and provided metadata
  const studyUID = generateUID();
  const seriesUID = generateUID();
  const instanceUID = generateUID();
  
  return {
    studyUID,
    seriesUID,
    instanceUID,
    patientId: metadata.patientId || 'UNKNOWN',
    patientName: metadata.patientName || 'Unknown Patient',
    accessionNumber: metadata.accessionNumber || `ACC${Date.now()}`,
    studyDate: new Date().toISOString().split('T')[0].replace(/-/g, ''),
    studyTime: new Date().toTimeString().split(' ')[0].replace(/:/g, ''),
    modality: metadata.modality || 'CT',
    studyDescription: metadata.studyDescription || 'DICOM Study',
    seriesDescription: 'Series 1',
    instanceNumber: 1,
    orderId: metadata.orderId
  };
}

/**
 * Get all items from localStorage
 */
function getStorageItems(key) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error(`[DicomStorage] Error reading ${key}:`, error);
    return [];
  }
}

/**
 * Save items to localStorage
 */
function setStorageItems(key, items) {
  try {
    localStorage.setItem(key, JSON.stringify(items));
    return true;
  } catch (error) {
    console.error(`[DicomStorage] Error saving ${key}:`, error);
    return false;
  }
}

/**
 * Store DICOM file in localStorage
 * @param {File} file - DICOM file to store
 * @param {Object} metadata - Study metadata
 * @returns {Promise<Object>} Result with studyUID, seriesUID, etc.
 * @throws {Error} If storage fails
 */
export async function storeDicomFile(file, metadata) {
  try {
    console.log('[DicomStorage] Storing DICOM file:', {
      name: file.name,
      size: file.size,
      type: file.type
    });

    // Validate file
    if (!file || file.size === 0) {
      throw new Error('Invalid file: File is empty');
    }

    // Check localStorage space before attempting
    const stats = getStorageStats();
    const estimatedSize = file.size * 1.37; // Base64 increases size by ~37%
    const availableSpace = 50 * 1024 * 1024 - stats.totalSize; // ~50MB limit

    if (estimatedSize > availableSpace) {
      throw new Error(
        `Insufficient localStorage space. ` +
        `Need ${(estimatedSize / 1024 / 1024).toFixed(2)}MB, ` +
        `available ${(availableSpace / 1024 / 1024).toFixed(2)}MB`
      );
    }

    // Convert file to base64
    const base64Data = await fileToBase64(file);

    if (!base64Data || base64Data.length < 100) {
      throw new Error('Base64 conversion failed: Data too small');
    }

    // Parse DICOM metadata (mock)
    const dicomMeta = parseDicomMetadata(file, metadata);

    // Get existing data
    const studies = getStorageItems(STORAGE_KEYS.STUDIES);
    const series = getStorageItems(STORAGE_KEYS.SERIES);
    const instances = getStorageItems(STORAGE_KEYS.INSTANCES);
    const files = getStorageItems(STORAGE_KEYS.FILES);

    // Check if study exists for this order
    let study = studies.find(s => s.orderId === metadata.orderId);

    if (!study) {
      // Create new study
      study = {
        id: `study_${Date.now()}`,
        studyUID: dicomMeta.studyUID,
        study_instance_uid: dicomMeta.studyUID, // Add snake_case version for compatibility
        patientId: metadata.patientId,
        patient_id: metadata.patientId, // Add snake_case version
        patientName: dicomMeta.patientName,
        patient_name: dicomMeta.patientName, // Add snake_case version
        accessionNumber: metadata.accessionNumber || `ACC${Date.now()}`,
        studyDate: dicomMeta.studyDate,
        study_date: dicomMeta.studyDate, // Add snake_case version
        studyTime: dicomMeta.studyTime,
        modality: dicomMeta.modality,
        studyDescription: dicomMeta.studyDescription,
        study_description: dicomMeta.studyDescription, // Add snake_case version
        orderId: metadata.orderId,
        numberOfSeries: 0,
        numberOfInstances: 0,
        createdAt: new Date().toISOString()
      };
      studies.push(study);
    } else {
    }

    // Check if series exists
    let seriesItem = series.find(s => s.studyUID === study.studyUID);

    if (!seriesItem) {
      // Create new series
      seriesItem = {
        id: `series_${Date.now()}`,
        seriesUID: dicomMeta.seriesUID,
        studyUID: study.studyUID,
        seriesNumber: 1,
        modality: dicomMeta.modality,
        seriesDescription: dicomMeta.seriesDescription,
        numberOfInstances: 0,
        createdAt: new Date().toISOString()
      };
      series.push(seriesItem);
      study.numberOfSeries++;
    } else {
    }

    // Create instance with unique ID
    const instance = {
      id: `instance_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      instanceUID: dicomMeta.instanceUID,
      seriesUID: seriesItem.seriesUID,
      studyUID: study.studyUID,
      instanceNumber: seriesItem.numberOfInstances + 1,
      fileName: file.name,
      fileSize: file.size,
      createdAt: new Date().toISOString()
    };
    instances.push(instance);

    // Store file data
    const fileData = {
      id: instance.id,
      instanceUID: instance.instanceUID,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'application/dicom',
      base64Data: base64Data,
      createdAt: new Date().toISOString()
    };
    files.push(fileData);

    // Update counts
    seriesItem.numberOfInstances++;
    study.numberOfInstances++;

    // Save all data back to localStorage with error handling
    const saveSuccess = (
      setStorageItems(STORAGE_KEYS.STUDIES, studies) &&
      setStorageItems(STORAGE_KEYS.SERIES, series) &&
      setStorageItems(STORAGE_KEYS.INSTANCES, instances) &&
      setStorageItems(STORAGE_KEYS.FILES, files)
    );

    if (!saveSuccess) {
      throw new Error('Failed to save data to localStorage - quota may be exceeded');
    }

    return {
      success: true,
      studyUID: study.studyUID,
      seriesUID: seriesItem.seriesUID,
      instanceUID: instance.instanceUID,
      studyId: study.id,
      instanceId: instance.id
    };

  } catch (error) {
    console.error('[DicomStorage] ❌ Error storing file:', error);

    // Check if it's a quota error
    if (error.name === 'QuotaExceededError' || error.message.includes('quota')) {
      throw new Error(
        'localStorage quota exceeded. ' +
        'Please clear old studies or use smaller files.'
      );
    }

    throw new Error(`Failed to store DICOM file: ${error.message}`);
  }
}

/**
 * Get studies by order ID
 */
export function getStudiesByOrderId(orderId) {
  const studies = getStorageItems(STORAGE_KEYS.STUDIES);
  return studies.filter(s => s.orderId === orderId);
}

/**
 * Get all studies
 */
export function getAllStudies() {
  return getStorageItems(STORAGE_KEYS.STUDIES);
}

/**
 * Get study by ID
 */
export function getStudyById(studyId) {
  const studies = getStorageItems(STORAGE_KEYS.STUDIES);
  return studies.find(s => s.id === studyId);
}

/**
 * Get series by study UID
 */
export function getSeriesByStudyUID(studyUID) {
  const series = getStorageItems(STORAGE_KEYS.SERIES);
  return series.filter(s => s.studyUID === studyUID);
}

/**
 * Get instances by series UID
 */
export function getInstancesBySeriesUID(seriesUID) {
  const instances = getStorageItems(STORAGE_KEYS.INSTANCES);
  return instances.filter(i => i.seriesUID === seriesUID);
}

/**
 * Get file data by instance ID
 */
export function getFileByInstanceId(instanceId) {
  const files = getStorageItems(STORAGE_KEYS.FILES);
  return files.find(f => f.id === instanceId);
}

/**
 * Delete study and all related data
 */
export function deleteStudy(studyId) {
  try {
    const studies = getStorageItems(STORAGE_KEYS.STUDIES);
    const study = studies.find(s => s.id === studyId);
    
    if (!study) {
      return false;
    }
    
    // Get all series for this study
    const allSeries = getStorageItems(STORAGE_KEYS.SERIES);
    const studySeries = allSeries.filter(s => s.studyUID === study.studyUID);
    
    // Get all instances for these series
    const allInstances = getStorageItems(STORAGE_KEYS.INSTANCES);
    const studyInstances = allInstances.filter(i => 
      studySeries.some(s => s.seriesUID === i.seriesUID)
    );
    
    // Delete files
    const allFiles = getStorageItems(STORAGE_KEYS.FILES);
    const remainingFiles = allFiles.filter(f => 
      !studyInstances.some(i => i.id === f.id)
    );
    
    // Delete instances
    const remainingInstances = allInstances.filter(i => 
      !studySeries.some(s => s.seriesUID === i.seriesUID)
    );
    
    // Delete series
    const remainingSeries = allSeries.filter(s => s.studyUID !== study.studyUID);
    
    // Delete study
    const remainingStudies = studies.filter(s => s.id !== studyId);
    
    // Save all
    setStorageItems(STORAGE_KEYS.FILES, remainingFiles);
    setStorageItems(STORAGE_KEYS.INSTANCES, remainingInstances);
    setStorageItems(STORAGE_KEYS.SERIES, remainingSeries);
    setStorageItems(STORAGE_KEYS.STUDIES, remainingStudies);
    
    return true;
    
  } catch (error) {
    console.error('[DicomStorage] Error deleting study:', error);
    return false;
  }
}

/**
 * Get storage statistics
 */
export function getStorageStats() {
  const studies = getStorageItems(STORAGE_KEYS.STUDIES);
  const series = getStorageItems(STORAGE_KEYS.SERIES);
  const instances = getStorageItems(STORAGE_KEYS.INSTANCES);
  const files = getStorageItems(STORAGE_KEYS.FILES);
  
  const totalSize = files.reduce((sum, f) => sum + (f.fileSize || 0), 0);
  
  return {
    studyCount: studies.length,
    seriesCount: series.length,
    instanceCount: instances.length,
    fileCount: files.length,
    totalSize: totalSize,
    totalSizeMB: (totalSize / 1024 / 1024).toFixed(2)
  };
}

/**
 * Clear all DICOM storage
 */
export function clearAllStorage() {
  try {
    localStorage.removeItem(STORAGE_KEYS.STUDIES);
    localStorage.removeItem(STORAGE_KEYS.SERIES);
    localStorage.removeItem(STORAGE_KEYS.INSTANCES);
    localStorage.removeItem(STORAGE_KEYS.FILES);
    return true;
  } catch (error) {
    console.error('[DicomStorage] Error clearing storage:', error);
    return false;
  }
}
