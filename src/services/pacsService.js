/**
 * PACS Service
 * Integration with PACS backend API
 */
import { getAuthHeader } from './auth-storage';
import { uploadWithProgress } from './http';

const PACS_API_URL = import.meta.env.VITE_MAIN_API_BACKEND_URL || '';
const API_PREFIX = '/pacs';

// ============================================================================
// Studies API
// ============================================================================

export async function getStudies(filters = {}) {
  const params = new URLSearchParams();

  if (filters.patientName) params.append('patient_name', filters.patientName);
  if (filters.patientId) params.append('patient_id', filters.patientId);
  if (filters.accessionNumber) params.append('accession_number', filters.accessionNumber);
  if (filters.studyDate) params.append('study_date', filters.studyDate);
  if (filters.modality) params.append('modality', filters.modality);
  if (filters.limit) params.append('limit', filters.limit);
  if (filters.offset) params.append('offset', filters.offset);

  const response = await fetch(`${PACS_API_URL}${API_PREFIX}/studies?${params.toString()}`, {
    headers: getAuthHeader()
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch studies: ${response.statusText}`);
  }
  
  return response.json();
}

export async function getStudy(studyInstanceUid) {
  const response = await fetch(`${PACS_API_URL}${API_PREFIX}/studies/${studyInstanceUid}`, {
    headers: getAuthHeader()
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch study: ${response.statusText}`);
  }
  
  return response.json();
}

export async function getStudySeries(studyInstanceUid) {
  const response = await fetch(`${PACS_API_URL}${API_PREFIX}/studies/${studyInstanceUid}/series`, {
    headers: getAuthHeader()
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch series: ${response.statusText}`);
  }
  
  return response.json();
}

export async function getSeriesInstances(seriesInstanceUid) {
  const response = await fetch(`${PACS_API_URL}${API_PREFIX}/series/${seriesInstanceUid}/instances`, {
    headers: getAuthHeader()
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch instances: ${response.statusText}`);
  }
  
  return response.json();
}

// ============================================================================
// DICOM Files API
// ============================================================================

export async function getDicomFile(instanceUid) {
  const response = await fetch(`${PACS_API_URL}${API_PREFIX}/instances/${instanceUid}/file`, {
    headers: getAuthHeader()
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch DICOM file: ${response.statusText}`);
  }
  
  return response.blob();
}

export async function getDicomMetadata(instanceUid) {
  const response = await fetch(`${PACS_API_URL}${API_PREFIX}/instances/${instanceUid}/metadata`, {
    headers: getAuthHeader()
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch metadata: ${response.statusText}`);
  }
  
  return response.json();
}

export async function getDicomThumbnail(instanceUid, size = 'medium') {
  const response = await fetch(`${PACS_API_URL}${API_PREFIX}/instances/${instanceUid}/thumbnail?size=${size}`, {
    headers: getAuthHeader()
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch thumbnail: ${response.statusText}`);
  }
  
  return response.blob();
}

// ============================================================================
// Upload API
// ============================================================================

export async function uploadDicomFile(file, metadata = {}, onProgress = null) {
  const formData = new FormData();
  formData.append('file', file);

  // order_id is optional in upload-v2 — supports multi-exam per order
  if (metadata.orderId) formData.append('order_id', metadata.orderId);
  if (metadata.accessionNumber) formData.append('accession_number', metadata.accessionNumber);
  if (metadata.patientId) formData.append('patient_id', metadata.patientId);

  // Determine the correct base URL for upload
  let uploadBase = import.meta.env.VITE_PACS_API_URL || PACS_API_URL;
  
  if (!uploadBase) {
    if (typeof window !== 'undefined') {
      uploadBase = window.location.origin + '/backend-api';
    }
  }

  // Use upload-v2 which is confirmed active in backend
  const PACS_UPLOAD_URL = `${uploadBase}/api/dicom/upload-v2`;

  return uploadWithProgress(PACS_UPLOAD_URL, formData, onProgress);
}

// ============================================================================
// Storage Stats API
// ============================================================================

export async function getStorageStats() {
  const response = await fetch(`${PACS_API_URL}${API_PREFIX}/storage/stats`, {
    headers: getAuthHeader()
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch storage stats: ${response.statusText}`);
  }
  
  return response.json();
}

// ============================================================================
// Health Check
// ============================================================================

export async function checkPacsHealth() {
  try {
    const response = await fetch(`${PACS_API_URL}${API_PREFIX}/health`, {
      method: 'GET',
      headers: { 
        ...getAuthHeader(),
        'Content-Type': 'application/json' 
      },
    });
    return response.ok;
  } catch (error) {
    console.warn('[PacsService] Health check failed:', error);
    return false;
  }
}

export default {
  getStudies,
  getStudy,
  getStudySeries,
  getSeriesInstances,
  getDicomFile,
  getDicomMetadata,
  getDicomThumbnail,
  uploadDicomFile,
  getStorageStats,
  checkPacsHealth,
};
