/**
 * Study Service
 * Abstraction layer for study data with backend/mock fallback
 */

import { getAllStudies } from './dicomStorageService';
import { loadRegistry } from './api-registry';
import { apiClient } from './http';
import wadoService from './wadoService';
import { notify } from './notifications';
import { cacheSeriesSizes } from './seriesSizeCache';
import { addCSRFHeader } from '../utils/csrf';
import { getAuthHeader } from './auth-storage';

// Check if backend is enabled from api-registry
function isBackendEnabled() {
  const registry = loadRegistry();
  const studiesConfig = registry.studies || { enabled: false };
  return studiesConfig.enabled === true;
}

// Get API client for studies module
const getStudiesApi = () => apiClient('studies');

// Generate unique ID for mock data
const generateId = () => `STU-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Mock data fallback - first try localStorage, then JSON file
async function getMockStudies() {
  // Try localStorage first
  const localStudies = getAllStudies();
  if (localStudies && localStudies.length > 0) {
    return localStudies.map(study => ({
      id: study.studyUID,  // Use studyUID as id for consistency
      study_instance_uid: study.studyUID,
      patient_id: study.patientId,
      patient_name: study.patientName,
      accession_number: study.accessionNumber || 'N/A',
      study_date: study.studyDate,
      study_time: study.studyTime,
      modality: study.modality,
      study_description: study.studyDescription,
      number_of_series: study.numberOfSeries,
      number_of_instances: study.numberOfInstances,
      order_id: study.orderId,
      status: 'completed',
      created_at: study.createdAt,
      _localStorage_id: study.id  // Keep original id for reference
    }));
  }
  
  // Fallback to JSON file
  try {
    const module = await import('../data/studies.json');
    return module.default || [];
  } catch (error) {
    console.warn('[StudyService] Failed to load mock data:', error);
    return [];
  }
}

const delay = (ms) => new Promise(res => setTimeout(res, ms));
const respond = async (data) => { 
  await delay(150); 
  return JSON.parse(JSON.stringify(data)); 
};

// ============================================================================
// Request Deduplication
// ============================================================================

// Cache for pending requests to prevent duplicate concurrent fetches
const _pendingStudyDetails = new Map(); // studyUID -> Promise
const _pendingStudySeries = new Map(); // studyUID -> Promise

/**
 * Deduplicate concurrent requests for study details
 * @param {string} studyUID - Study Instance UID
 * @param {Function} fetchFn - Function to fetch data
 * @returns {Promise} Deduplicated promise
 */
function deduplicateStudyDetails(studyUID, fetchFn) {
  if (_pendingStudyDetails.has(studyUID)) {
    console.debug(`[StudyService] Deduplicating study details request for ${studyUID}`);
    return _pendingStudyDetails.get(studyUID);
  }

  const promise = fetchFn()
    .finally(() => {
      _pendingStudyDetails.delete(studyUID);
    });

  _pendingStudyDetails.set(studyUID, promise);
  return promise;
}

/**
 * Deduplicate concurrent requests for study series
 * @param {string} studyUID - Study Instance UID
 * @param {Function} fetchFn - Function to fetch data
 * @returns {Promise} Deduplicated promise
 */
function deduplicateStudySeries(studyUID, fetchFn) {
  if (_pendingStudySeries.has(studyUID)) {
    console.debug(`[StudyService] Deduplicating study series request for ${studyUID}`);
    return _pendingStudySeries.get(studyUID);
  }

  const promise = fetchFn()
    .finally(() => {
      _pendingStudySeries.delete(studyUID);
    });

  _pendingStudySeries.set(studyUID, promise);
  return promise;
}

// ============================================================================
// Public API
// ============================================================================

export async function fetchStudies(filters = {}) {
  const backendEnabled = isBackendEnabled();


  if (backendEnabled) {
    try {
      // Build query params matching STUDIES-WADO-API.md
      const params = new URLSearchParams();
      
      // Map filters to API parameters
      if (filters.patientName) params.append('patient_name', filters.patientName);
      if (filters.modality && filters.modality !== 'all' && filters.modality !== 'ALL') {
        params.append('modality', filters.modality);
      }
      // Backend doesn't seem to have a generic status filter in docs, but we'll keep it if it does
      // Docs say: patient_name, accession_number, modality, study_date_from, study_date_to
      if (filters.status && filters.status !== 'all') params.append('status', filters.status);
      
      if (filters.startDate) params.append('study_date_from', filters.startDate);
      if (filters.endDate) params.append('study_date_to', filters.endDate);
      if (filters.accessionNumber) params.append('accession_number', filters.accessionNumber);
      
      // Add pagination support
      if (filters.page) params.append('page', filters.page);
      if (filters.pageSize) params.append('page_size', filters.pageSize);

      const endpoint = `/api/studies${params.toString() ? '?' + params.toString() : ''}`;
      const api = getStudiesApi();
      const result = await api.get(endpoint);

      // Handle different response formats
      // API docs say: { data: [], count, page, ... }
      const studies = Array.isArray(result) ? result : (result.data || result.studies || []);
      const total = result.total || result.count || studies.length;
      const page = result.page || filters.page || 1;
      const pageSize = result.page_size || filters.pageSize || 25;
      const totalPages = result.total_pages || Math.ceil(total / pageSize);

      return {
        studies: studies,
        total: total,
        page: page,
        pageSize: pageSize,
        totalPages: totalPages,
        source: 'backend'
      };
    } catch (error) {
      console.error('[StudyService] Backend error:', error);
      // Don't silently fallback - throw error when backend is enabled
      throw error;
    }
  }
  
  // Fallback to mock data
  const studies = await getMockStudies();
  
  // Apply filters to mock data
  let filtered = studies;
  
  if (filters.patientName) {
    filtered = filtered.filter(s => 
      s.patient_name?.toLowerCase().includes(filters.patientName.toLowerCase())
    );
  }
  
  if (filters.modality && filters.modality !== 'all' && filters.modality !== 'ALL') {
    filtered = filtered.filter(s => s.modality === filters.modality);
  }
  
  if (filters.status && filters.status !== 'all') {
    filtered = filtered.filter(s => s.status === filters.status);
  }
  
  if (filters.startDate) {
    filtered = filtered.filter(s => {
      const studyDate = new Date(s.study_date);
      const startDate = new Date(filters.startDate);
      return studyDate >= startDate;
    });
  }
  
  if (filters.endDate) {
    filtered = filtered.filter(s => {
      const studyDate = new Date(s.study_date);
      const endDate = new Date(filters.endDate);
      return studyDate <= endDate;
    });
  }

  if (filters.accessionNumber) {
    filtered = filtered.filter(s => 
      s.accession_number?.toLowerCase().includes(filters.accessionNumber.toLowerCase())
    );
  }
  
  // Implement pagination for mock data
  const page = filters.page || 1;
  const pageSize = filters.pageSize || 25;
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedStudies = filtered.slice(startIndex, endIndex);
  
  return {
    studies: paginatedStudies,
    total: filtered.length,
    page: page,
    pageSize: pageSize,
    totalPages: Math.ceil(filtered.length / pageSize),
    source: 'mock'
  };
}

export async function fetchStudyDetails(studyInstanceUid) {
  return deduplicateStudyDetails(studyInstanceUid, async () => {
    const backendEnabled = isBackendEnabled();

    if (backendEnabled) {
      try {
        const endpoint = `/api/studies/${studyInstanceUid}`;
        const api = getStudiesApi();
        const study = await api.get(endpoint);

        
        if (!study) {
          throw new Error('Backend returned empty study object');
        }
        
        return { study, source: 'backend' };
      } catch (error) {
        console.warn('[StudyService] Backend failed for study details, trying WADO fallback:', error.message);
        
        // Try WADO-RS fallback for study details
        try {
          const studyData = await wadoService.getStudy(studyInstanceUid);
          if (studyData && (studyData.instances || Array.isArray(studyData))) {
            const instances = studyData.instances || studyData;
            if (instances.length > 0) {
              const first = instances[0];
              // Construct study object from first instance metadata
              const study = {
                study_instance_uid: studyInstanceUid,
                patient_name: first.patient_name || first.patientName || first['00100010']?.Value?.[0]?.Alphabetic || 'Unknown',
                patient_id: first.patient_id || first.patientId || first['00100020']?.Value?.[0] || 'Unknown',
                study_date: first.study_date || first.studyDate || first['00080020']?.Value?.[0],
                study_time: first.study_time || first.studyTime || first['00080030']?.Value?.[0],
                accession_number: first.accession_number || first.accessionNumber || first['00080050']?.Value?.[0],
                study_description: first.study_description || first.studyDescription || first['00081030']?.Value?.[0],
                modality: first.modality || first['00080060']?.Value?.[0],
                number_of_instances: instances.length,
                number_of_series: new Set(instances.map(i => i.series_instance_uid || i.seriesInstanceUID)).size
              };

              return { study, source: 'wado-fallback' };
            }
          }
        } catch (wadoError) {
          console.error('[StudyService] WADO fallback for details failed:', wadoError);
        }
      }
    }
    
    // Try localStorage first
    const localStudies = getAllStudies();
    const localStudy = localStudies.find(s => 
      s.studyUID === studyInstanceUid || 
      s.id === studyInstanceUid
    );
    
    if (localStudy) {
      return {
        study: {
          id: localStudy.studyUID,  // Use studyUID as id for consistency
          study_instance_uid: localStudy.studyUID,
          patient_id: localStudy.patientId,
          patient_name: localStudy.patientName,
          accession_number: localStudy.accessionNumber || 'N/A',
          study_date: localStudy.studyDate,
          study_time: localStudy.studyTime,
          modality: localStudy.modality,
          study_description: localStudy.studyDescription,
          number_of_series: localStudy.numberOfSeries,
          number_of_instances: localStudy.numberOfInstances,
          order_id: localStudy.orderId,
          status: 'completed',
          created_at: localStudy.createdAt,
          _localStorage_id: localStudy.id  // Keep original id for reference
        },
        source: 'localStorage'
      };
    }
    
    // Fallback to mock data
    const studies = await getMockStudies();
    const study = studies.find(s => 
      s.study_instance_uid === studyInstanceUid ||
      s.id === studyInstanceUid
    );
    
    if (study) {
      return { study, source: 'mock' };
    }
    
    console.error('[StudyService] Study not found in any source:', studyInstanceUid);
    return { study: null, source: 'none' };
  });
}

export async function fetchStudySeries(studyInstanceUid) {
  return deduplicateStudySeries(studyInstanceUid, async () => {
    const backendEnabled = isBackendEnabled();

    if (backendEnabled) {
      try {
        const endpoint = `/api/studies/${studyInstanceUid}/series`;
        const api = getStudiesApi();
        const result = await api.get(endpoint);
        const series = Array.isArray(result) ? result : (result.series || result.data || []);
        
        // Check if backend returned series but WITHOUT instances - cross-reference with WADO-RS
        const hasInstances = series.some(s => s.instances && s.instances.length > 0);
        
        // If we have series but no instances array, cross-reference with WADO-RS to get actual instance data
        if (series.length > 0) {
          // Cross-reference with WADO-RS if any series is missing the instances array
          const needsWadoCrossReference = series.some(s => !s.instances || s.instances.length === 0);
          
          if (needsWadoCrossReference) {
            try {
              // Try to get actual instance data from WADO-RS
              const wadoStudyData = await wadoService.getStudy(studyInstanceUid);
              
              if (wadoStudyData && (wadoStudyData.instances || Array.isArray(wadoStudyData))) {
                const instances = wadoStudyData.instances || wadoStudyData;
                // Group instances by series to enrich the series data
                const seriesInstanceMap = new Map();
                instances.forEach(instance => {
                  const seriesUid = instance.series_instance_uid || instance.series_id || 
                                    instance.seriesInstanceUID || instance['0020000E']?.Value?.[0];
                  
                  if (seriesUid) {
                    if (!seriesInstanceMap.has(seriesUid)) {
                      seriesInstanceMap.set(seriesUid, []);
                    }
                    seriesInstanceMap.get(seriesUid).push(instance);
                  }
                });
                
                // Enrich series with actual instance data
                const enrichedSeries = series.map(s => {
                  const seriesUid = s.series_instance_uid || s.seriesInstanceUID;
                  const actualInstances = seriesInstanceMap.get(seriesUid) || [];
                  
                  return {
                    ...s,
                    number_of_instances: s.number_of_instances || actualInstances.length,
                    instances: actualInstances
                  };
                });
                
                // Cache series sizes for download progress
                cacheSeriesSizes(enrichedSeries);
                return { series: enrichedSeries, source: 'backend-enriched' };
              }
            } catch (wadoError) {
              console.warn('[StudyService] WADO cross-reference failed:', wadoError.message);
              // Continue with original backend data if WADO fails
            }
          }
          
          // Cache series sizes for download progress
          cacheSeriesSizes(series);
          return { series, source: 'backend' };
        }
        
        // If no series from backend, try WADO-RS fallback
        console.warn('[StudyService] Backend returned no series, trying WADO fallback');
        throw new Error('Backend returned no series');
      } catch (error) {
        console.warn('[StudyService] Backend failed, trying WADO fallback:', error.message);
        
        // WADO-RS fallback
        try {
          const studyData = await wadoService.getStudy(studyInstanceUid);
          
          if (studyData && (studyData.instances || Array.isArray(studyData))) {
            const instances = studyData.instances || studyData;
            // Group instances by series
            const seriesMap = new Map();
            
            instances.forEach(instance => {
              const seriesUid = instance.series_instance_uid || instance.series_id || 
                                instance.seriesInstanceUID || instance['0020000E']?.Value?.[0];
                                
              if (!seriesUid) return;
              
              if (!seriesMap.has(seriesUid)) {
                seriesMap.set(seriesUid, {
                  series_instance_uid: seriesUid,
                  series_number: instance.series_number || instance.seriesNumber || instance['00200011']?.Value?.[0] || 0,
                  series_description: instance.series_description || instance.seriesDescription || instance['0008103E']?.Value?.[0] || 'No Description',
                  modality: instance.modality || instance['00080060']?.Value?.[0] || 'Unknown',
                  number_of_instances: 0,
                  instances: []
                });
              }
              
              const seriesData = seriesMap.get(seriesUid);
              seriesData.number_of_instances++;
              
              // Normalize instance with SOP UID
              seriesData.instances.push({
                sop_instance_uid: instance.sop_instance_uid || instance.instance_id ||
                                 instance.sopInstanceUID || instance['00080018']?.Value?.[0],
                instance_number: instance.instance_number || instance.instanceNumber || 
                                instance['00200013']?.Value?.[0] || 0,
                series_instance_uid: seriesUid,
                ...instance
              });
            });
            
            const seriesList = Array.from(seriesMap.values());
            return { series: seriesList, source: 'wado-fallback' };
          } else {
            console.warn('[StudyService] WADO returned no data for study:', studyInstanceUid);
            return { series: [], source: 'wado-fallback' };
          }
        } catch (wadoError) {
          console.error('[StudyService] WADO fallback failed:', wadoError);
          return { series: [], source: 'wado-error' };
        }
        
        throw error;
      }
    }
    
    // Mock data
    return {
      series: [{
        series_instance_uid: 'mock-series-1',
        series_number: 1,
        series_description: 'Mock Series',
        modality: 'CT',
        number_of_instances: 100
      }],
      source: 'mock'
    };
  });
}

export async function fetchStudyFiles(studyInstanceUid) {
  const backendEnabled = isBackendEnabled();

  if (backendEnabled) {
    try {
      const endpoint = `/api/studies/${studyInstanceUid}/files`;
      const api = getStudiesApi();
      const result = await api.get(endpoint);
      const files = Array.isArray(result) ? result : (result.files || result.data || []);
      return { files, source: 'backend' };
    } catch (error) {
      console.error('[StudyService] Failed to fetch study files:', error);
      throw error;
    }
  }

  return { files: [], source: 'mock' };
}

export async function createStudy(data) {
  const backendEnabled = isBackendEnabled();

  if (backendEnabled) {
    try {
      const endpoint = '/api/studies';

      const api = getStudiesApi();
      const result = await api.post(endpoint, data);
      notify({
        type: 'success',
        message: 'Study created successfully'
      });
      return result;
    } catch (e) {
      console.error('[StudyService] Failed to create study:', e);
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
    id: generateId(),
    study_instance_uid: data.studyInstanceUID || `1.2.826.0.1.3680043.2.1125.${Date.now()}`,
    series: data.series || [],
    status: data.status || 'scheduled',
    created_at: new Date().toISOString()
  };

  const studies = await getMockStudies();
  studies.push(newStudy);
  
  notify({ 
    type: 'success', 
    message: 'Study created successfully' 
  });
  
  return respond(newStudy);
}

export async function updateStudy(id, data) {
  const backendEnabled = isBackendEnabled();

  if (backendEnabled) {
    try {
      const endpoint = `/api/studies/${id}`;

      const api = getStudiesApi();
      const result = await api.put(endpoint, data);
      notify({
        type: 'success',
        message: 'Study updated successfully'
      });
      return result;
    } catch (e) {
      console.error('[StudyService] Failed to update study:', e);
      notify({
        type: 'error',
        message: `Failed to update study: ${e.message}`
      });
      throw e;
    }
  }

  // Mock mode
  const studies = await getMockStudies();
  const idx = studies.findIndex(s => s.id === id || s.study_instance_uid === id);
  if (idx === -1) throw new Error('Study not found');

  studies[idx] = { ...studies[idx], ...data };
  
  notify({ 
    type: 'success', 
    message: 'Study updated successfully' 
  });
  
  return respond(studies[idx]);
}

export async function deleteStudy(id) {
  const backendEnabled = isBackendEnabled();

  if (backendEnabled) {
    try {
      const endpoint = `/api/studies/${id}`;

      const api = getStudiesApi();
      const result = await api.delete(endpoint);
      notify({
        type: 'success',
        message: 'Study deleted successfully'
      });
      return result;
    } catch (e) {
      console.error('[StudyService] Failed to delete study:', e);
      notify({
        type: 'error',
        message: `Failed to delete study: ${e.message}`
      });
      throw e;
    }
  }

  // Mock mode
  const studies = await getMockStudies();
  const idx = studies.findIndex(s => s.id === id || s.study_instance_uid === id);
  if (idx === -1) throw new Error('Study not found');

  studies.splice(idx, 1);
  
  notify({ 
    type: 'success', 
    message: 'Study deleted successfully' 
  });
  
  return respond({ success: true });
}

export async function archiveStudy(id) {
  const backendEnabled = isBackendEnabled();

  if (backendEnabled) {
    try {
      const endpoint = `/api/studies/${id}/archive`;

      const api = getStudiesApi();
      const result = await api.post(endpoint);
      notify({
        type: 'success',
        message: 'Study archived successfully'
      });
      return result;
    } catch (e) {
      console.error('[StudyService] Failed to archive study:', e);
      notify({
        type: 'error',
        message: `Failed to archive study: ${e.message}`
      });
      throw e;
    }
  }

  // Mock mode
  const studies = await getMockStudies();
  const study = studies.find(s => s.id === id || s.study_instance_uid === id);
  if (!study) throw new Error('Study not found');

  study.status = 'archived';
  study.archived_at = new Date().toISOString();
  
  notify({ 
    type: 'success', 
    message: 'Study archived successfully' 
  });
  
  return respond({ success: true, study });
}

export async function uploadDicomFile(file, orderId = null, onProgress = null) {
  const backendEnabled = isBackendEnabled();

  if (!backendEnabled) {
    notify({
      type: 'error',
      message: 'Studies service is not enabled. Please enable it in settings.'
    });
    throw new Error('Studies service is not enabled');
  }

  try {
    const registry = loadRegistry();
    const studiesConfig = registry.studies || {};
    const baseUrl = studiesConfig.baseUrl || import.meta.env.VITE_MAIN_API_BACKEND_URL || '';
    const cleanBaseUrl = baseUrl.replace(/\/$/, '');
    const endpoint = `${cleanBaseUrl}/api/dicom/upload-v2`;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', 'dicom');
    if (orderId) {
      formData.append('order_id', orderId);
    }

    const { uploadWithProgress } = await import('./http');
    const result = await uploadWithProgress(endpoint, formData, onProgress);
    
    notify({
      type: 'success',
      message: 'DICOM file uploaded successfully'
    });

    return result;
  } catch (error) {
    console.error('[StudyService] Upload error:', error);
    notify({
      type: 'error',
      message: `Failed to upload DICOM file: ${error.message}`
    });
    throw error;
  }
}

export async function getStudyThumbnail(studyInstanceUid, seriesUid = null, instanceUid = null, size = 200) {
  const backendEnabled = isBackendEnabled();

  if (backendEnabled) {
    try {
      // If we don't have series/instance UIDs, get them from WADO-RS
      if (!seriesUid || !instanceUid) {
        // Use WADO-RS to get instances first
        const studyData = await wadoService.getStudy(studyInstanceUid);
        const instances = studyData.instances || [];

        if (instances.length > 0) {
          // Try to find series and instance UIDs from metadata
          // Support both snake_case (API) and camelCase (common JS) and DICOM tags
          const firstInstance = instances[0];
          
          seriesUid = seriesUid || firstInstance.series_instance_uid || 
                                firstInstance.seriesInstanceUID || 
                                firstInstance['0020000E']?.Value?.[0];
                                
          instanceUid = instanceUid || firstInstance.sop_instance_uid || 
                                  firstInstance.sopInstanceUID || 
                                  firstInstance['00080018']?.Value?.[0];
        }
      }

      if (seriesUid && instanceUid) {
        const thumbnailUrl = wadoService.getThumbnailUrl(studyInstanceUid, seriesUid, instanceUid, size);
        
        // Fetch as blob to create object URL
        const response = await fetch(thumbnailUrl);
        if (response.ok) {
          const blob = await response.blob();
          return URL.createObjectURL(blob);
        }
      }
    } catch (error) {
      console.warn('[StudyService] Failed to get thumbnail:', error);
    }
  }

  // Return placeholder
  return null;
}

export async function getRenderedImage(studyInstanceUid, seriesUid, instanceUid, windowCenter, windowWidth, quality = 90) {
  const backendEnabled = isBackendEnabled();

  if (backendEnabled) {
    try {
      if (studyInstanceUid && seriesUid && instanceUid) {
        const renderedUrl = wadoService.getRenderedUrl(
          studyInstanceUid, 
          seriesUid, 
          instanceUid, 
          windowCenter, 
          windowWidth, 
          quality
        );
        
        // Fetch as blob to create object URL
        const response = await fetch(renderedUrl);
        if (response.ok) {
          const blob = await response.blob();
          return URL.createObjectURL(blob);
        }
      }
    } catch (error) {
      console.warn('[StudyService] Failed to get rendered image:', error);
    }
  }

  // Return placeholder
  return null;
}

export async function isBackendAvailable() {
  const backendEnabled = isBackendEnabled();
  if (!backendEnabled) return false;

  try {
    const registry = loadRegistry();
    const studiesConfig = registry.studies || {};
    const baseUrl = studiesConfig.baseUrl || '';
    const healthPath = studiesConfig.healthPath || '/health';

    const response = await fetch(`${baseUrl}${healthPath}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    return response.ok;
  } catch (error) {
    console.warn('[StudyService] Health check failed:', error);
    return false;
  }
}

export default {
  fetchStudies,
  fetchStudyDetails,
  fetchStudySeries,
  fetchStudyFiles,
  createStudy,
  updateStudy,
  deleteStudy,
  archiveStudy,
  uploadDicomFile,
  getStudyThumbnail,
  isBackendAvailable,
};
