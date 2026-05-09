// src/services/studiesService.js
import { getConfig } from './config';
import { apiClient } from './http';
import { notify } from './notifications';
import { loadRegistry } from './api-registry';
import { addCSRFHeader } from '../utils/csrf';

// Create API client for studies module
const getStudiesApi = () => apiClient('studies');

const mockDataCache = {};

async function loadMockStudies() {
  if (!mockDataCache.studies) {
    mockDataCache.studies = import('../data/studies.json').then(mod => mod.default ?? mod);
  }
  return mockDataCache.studies;
}

const delay = (ms) => new Promise(res => setTimeout(res, ms));
const respond = async (data) => { 
  await delay(150); 
  return JSON.parse(JSON.stringify(data)); 
};

// Generate unique ID
const generateId = () => `STU-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Helper to normalize backend data (snake_case) to frontend model (camelCase)
const normalizeStudy = (s) => {
  // If it's already in frontend format (mock data), return as is
  if (s.studyId && s.patient && typeof s.patient === 'object') return s;

  return {
    studyId: s.study_instance_uid || s.study_id, // Use UID as ID if study_id missing
    studyInstanceUID: s.study_instance_uid,
    studyDate: s.study_date,
    studyTime: s.study_time || '',
    accessionNumber: s.accession_number,
    description: s.study_description || '',
    modality: s.modality,
    status: s.status || 'completed', // Default status
    patient: {
      name: s.patient_name ? s.patient_name.replace(/\^/g, ' ') : 'Unknown',
      mrn: s.patient_id || '',
      birthDate: s.patient_birth_date || '',
      sex: s.patient_sex || ''
    },
    series: (s.series || []).map(ser => ({
      seriesId: ser.series_instance_uid,
      seriesInstanceUID: ser.series_instance_uid,
      seriesNumber: ser.series_number,
      modality: ser.modality,
      description: ser.series_description,
      instances: ser.instances || [] // Placeholder if instances not fully populated
    })),
    numberOfInstances: s.number_of_instances || 0,
    numberOfSeries: s.number_of_series || 0
  };
};

export async function listStudies(options = {}) {
  const { search, modality, dateFrom, dateTo, limit } = options;
  
  const registry = loadRegistry();
  const studiesConfig = registry.studies || { enabled: false };
  const backendEnabled = studiesConfig.enabled === true;

  console.log('[Studies Service] Backend enabled:', backendEnabled);

  if (backendEnabled) {
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search); // Backend might expect 'patient_name' or generic 'search'
      // Adjust params based on API docs if needed. Docs say: patient_name, accession_number, etc.
      // For now, assuming backend handles generic 'search' or we map it.
      // Let's map 'search' to 'patient_name' as a fallback if backend is strict, 
      // but ideally backend has a 'q' or 'search' param.
      // Docs say: patient_name, accession_number. 
      // We'll send 'patient_name' if search is present for now, or check if backend supports 'search'.
      if (search) params.append('patient_name', search); 
      
      if (modality && modality !== 'ALL') params.append('modality', modality);
      if (dateFrom) params.append('study_date_from', dateFrom);
      if (dateTo) params.append('study_date_to', dateTo);
      if (limit) params.append('page_size', limit);

      const endpoint = `/api/studies?${params.toString()}`;

      console.log('[Studies Service] Fetching from endpoint:', endpoint);

      const api = getStudiesApi();
      const response = await api.get(endpoint);
      
      // Handle paginated response { data: [], ... } or direct array
      const rawData = Array.isArray(response) ? response : (response.data || []);
      
      console.log('[Studies Service] Received data:', rawData.length, 'studies');
      
      // Normalize data
      return rawData.map(normalizeStudy);
    } catch (e) {
      console.error('[Studies Service] Backend error:', e);
      notify({
        type: 'error',
        message: `Failed to fetch studies from backend: ${e.message}`
      });
      throw e;
    }
  }

  // Mock mode
  let studies = await loadMockStudies();
  
  // Apply filters
  if (search) {
    const searchLower = search.toLowerCase();
    studies = studies.filter(s =>
      s.patient?.name?.toLowerCase().includes(searchLower) ||
      s.patient?.mrn?.toLowerCase().includes(searchLower) ||
      s.accessionNumber?.toLowerCase().includes(searchLower) ||
      s.description?.toLowerCase().includes(searchLower)
    );
  }

  if (modality && modality !== 'ALL') {
    studies = studies.filter(s => s.modality === modality);
  }

  if (dateFrom) {
    const fromTime = new Date(dateFrom).getTime();
    studies = studies.filter(s => new Date(s.studyDate).getTime() >= fromTime);
  }

  if (dateTo) {
    const toTime = new Date(dateTo).getTime() + 24 * 3600 * 1000;
    studies = studies.filter(s => new Date(s.studyDate).getTime() < toTime);
  }

  // Sort by date/time descending
  studies.sort((a, b) => {
    if (a.studyDate === b.studyDate) {
      return b.studyTime.localeCompare(a.studyTime);
    }
    return b.studyDate.localeCompare(a.studyDate);
  });

  if (limit) {
    studies = studies.slice(0, limit);
  }

  return respond(studies);
}

export async function getStudy(id) {
  const registry = loadRegistry();
  const studiesConfig = registry.studies || { enabled: false };
  const backendEnabled = studiesConfig.enabled === true;

  if (backendEnabled) {
    try {
      const endpoint = `/api/studies/${id}`;
      console.log('[Studies Service] Fetching study from:', endpoint);
      const api = getStudiesApi();
      return await api.get(endpoint);
    } catch (e) {
      console.error('[Studies Service] Failed to fetch study:', e);
      notify({
        type: 'error',
        message: `Failed to fetch study: ${e.message}`
      });
      throw e;
    }
  }

  // Mock mode
  const studies = await loadMockStudies();
  const study = studies.find(s => s.studyId === id || s.studyInstanceUID === id);
  if (!study) throw new Error('Study not found');
  return respond(study);
}

export async function createStudy(data) {
  const registry = loadRegistry();
  const studiesConfig = registry.studies || { enabled: false };
  const backendEnabled = studiesConfig.enabled === true;

  if (backendEnabled) {
    try {
      const endpoint = '/api/studies';
      console.log('[Studies Service] Creating study at:', endpoint);
      const api = getStudiesApi();
      const result = await api.post(endpoint, data);
      notify({
        type: 'success',
        message: 'Study created successfully'
      });
      return result;
    } catch (e) {
      console.error('[Studies Service] Failed to create study:', e);
      notify({
        type: 'error',
        message: `Failed to create study: ${e.message}`
      });
      throw e;
    }
  }

  // Mock mode
  const newStudy = {
    ...data,
    studyId: generateId(),
    studyInstanceUID: data.studyInstanceUID || `1.2.826.0.1.3680043.2.1125.${Date.now()}`,
    series: data.series || [],
    status: data.status || 'scheduled'
  };

  const studies = await loadMockStudies();
  studies.push(newStudy);
  
  notify({ 
    type: 'success', 
    message: 'Study created successfully' 
  });
  
  return respond(newStudy);
}

export async function updateStudy(id, data) {
  const registry = loadRegistry();
  const studiesConfig = registry.studies || { enabled: false };
  const backendEnabled = studiesConfig.enabled === true;

  if (backendEnabled) {
    try {
      const endpoint = `/api/studies/${id}`;
      console.log('[Studies Service] Updating study at:', endpoint);
      const api = getStudiesApi();
      const result = await api.put(endpoint, data);
      notify({
        type: 'success',
        message: 'Study updated successfully'
      });
      return result;
    } catch (e) {
      console.error('[Studies Service] Failed to update study:', e);
      notify({
        type: 'error',
        message: `Failed to update study: ${e.message}`
      });
      throw e;
    }
  }

  // Mock mode
  const studies = await loadMockStudies();
  const idx = studies.findIndex(s => s.studyId === id || s.studyInstanceUID === id);
  if (idx === -1) throw new Error('Study not found');

  studies[idx] = { ...studies[idx], ...data };
  
  notify({ 
    type: 'success', 
    message: 'Study updated successfully' 
  });
  
  return respond(studies[idx]);
}

export async function deleteStudy(id) {
  const registry = loadRegistry();
  const studiesConfig = registry.studies || { enabled: false };
  const backendEnabled = studiesConfig.enabled === true;

  if (backendEnabled) {
    try {
      // ID passed here should be the studyInstanceUID if normalized correctly
      const endpoint = `/api/studies/${id}`;
      console.log('[Studies Service] Deleting study at:', endpoint);
      const api = getStudiesApi();
      const result = await api.delete(endpoint);
      notify({
        type: 'success',
        message: 'Study deleted successfully'
      });
      return result;
    } catch (e) {
      console.error('[Studies Service] Failed to delete study:', e);
      notify({
        type: 'error',
        message: `Failed to delete study: ${e.message}`
      });
      throw e;
    }
  }

  // Mock mode
  const studies = await loadMockStudies();
  const idx = studies.findIndex(s => s.studyId === id || s.studyInstanceUID === id);
  if (idx === -1) throw new Error('Study not found');

  studies.splice(idx, 1);
  
  notify({ 
    type: 'success', 
    message: 'Study deleted successfully' 
  });
  
  return respond({ success: true });
}

export async function archiveStudy(id) {
  const registry = loadRegistry();
  const studiesConfig = registry.studies || { enabled: false };
  const backendEnabled = studiesConfig.enabled === true;

  if (backendEnabled) {
    try {
      const endpoint = `/api/studies/${id}/archive`;
      console.log('[Studies Service] Archiving study at:', endpoint);
      const api = getStudiesApi();
      const result = await api.post(endpoint);
      notify({
        type: 'success',
        message: 'Study archived successfully'
      });
      return result;
    } catch (e) {
      console.error('[Studies Service] Failed to archive study:', e);
      notify({
        type: 'error',
        message: `Failed to archive study: ${e.message}`
      });
      throw e;
    }
  }

  // Mock mode
  const studies = await loadMockStudies();
  const study = studies.find(s => s.studyId === id || s.studyInstanceUID === id);
  if (!study) throw new Error('Study not found');

  study.status = 'archived';
  
  notify({ 
    type: 'success', 
    message: 'Study archived successfully' 
  });
  
  return respond({ success: true });
}

/**
 * Upload DICOM file
 * @param {File} file - DICOM file to upload
 * @param {string} orderId - Optional order ID to link the study
 * @returns {Promise} Upload result with study information
 */
export async function uploadDicomFile(file, orderId = null) {
  const registry = loadRegistry();
  const studiesConfig = registry.studies || { enabled: false };
  const backendEnabled = studiesConfig.enabled === true;

  if (!backendEnabled) {
    notify({
      type: 'error',
      message: 'Studies service is not enabled. Please enable it in settings.'
    });
    throw new Error('Studies service is not enabled');
  }

  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', 'dicom');
    if (orderId) {
      formData.append('order_id', orderId);
    }

    const baseUrl = studiesConfig.baseUrl || import.meta.env.VITE_MAIN_API_BACKEND_URL || '';
    const cleanBaseUrl = baseUrl.replace(/\/$/, '');
    const endpoint = `${cleanBaseUrl}/api/dicom/upload`;

    console.log('[Studies Service] Uploading DICOM to:', endpoint);

    // Prepare headers with Auth and CSRF
    let headers = {};
    
    // Add Authorization header
    const token = localStorage.getItem('token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Add CSRF token
    headers = await addCSRFHeader(headers);

    const response = await fetch(endpoint, {
      method: 'POST',
      body: formData,
      headers
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Upload failed' }));
      throw new Error(errorData.detail || errorData.message || 'Upload failed');
    }

    const result = await response.json();
    
    console.log('[Studies Service] Upload successful:', result);

    notify({
      type: 'success',
      message: 'DICOM file uploaded successfully'
    });

    return result;
  } catch (error) {
    console.error('[Studies Service] Upload error:', error);
    notify({
      type: 'error',
      message: `Failed to upload DICOM file: ${error.message}`
    });
    throw error;
  }
}

// Get study statistics
export async function getStudyStats() {
  const studies = await listStudies();
  
  const stats = {
    total: studies.length,
    byModality: {},
    byStatus: {},
    recent: studies.slice(0, 5)
  };

  studies.forEach(s => {
    // Count by modality
    stats.byModality[s.modality] = (stats.byModality[s.modality] || 0) + 1;
    
    // Count by status
    stats.byStatus[s.status] = (stats.byStatus[s.status] || 0) + 1;
  });

  return stats;
}
