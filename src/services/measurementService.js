/**
 * Measurement Service
 * Handle saving, loading, and managing DICOM viewer measurements
 */

import { apiClient } from './http';
import { loadRegistry } from './api-registry';

const DEFAULT_ENDPOINTS = {
  upsert:     '/api/measurements/upsert',
  bulk:       '/api/measurements/bulk',
  getByStudy: '/api/measurements/study/:studyUID',
  delete:    '/api/measurements/:id',
  deleteByStudy: '/api/measurements/study/:studyUID',
  history:    '/api/measurements/study/:studyUID/history',
};

const measurementApi = () => apiClient('measurements');

function getMeasurementsConfig() {
  const registry = loadRegistry();
  return registry.measurements || { enabled: false };
}

function getMeasurementEndpoints() {
  const cfg = getMeasurementsConfig();
  return {
    ...DEFAULT_ENDPOINTS,
    ...(cfg.endpoints || {})
  };
}

function buildEndpoint(key, params = {}) {
  const endpoints = getMeasurementEndpoints();
  const template = endpoints[key];
  if (!template) {
    throw new Error(`[MeasurementService] Endpoint '${key}' is not configured`);
  }

  return template.replace(/:([a-zA-Z0-9_]+)/g, (_, token) => {
    if (params[token] == null) {
      throw new Error(`[MeasurementService] Missing parameter '${token}' for endpoint '${key}'`);
    }
    return encodeURIComponent(params[token]);
  });
}

function isBackendEnabled() {
  const cfg = getMeasurementsConfig();
  return cfg.enabled === true;
}

function unwrapMeasurementResponse(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.measurements)) return payload.measurements;
  if (Array.isArray(payload?.data)) return payload.data;
  if (payload?.data?.measurements && Array.isArray(payload.data.measurements)) {
    return payload.data.measurements;
  }
  return [];
}

/**
 * Format measurement data for storage
 * @param {Object} annotation - Cornerstone annotation object
 * @param {string} studyUID - Study Instance UID
 * @param {string} seriesUID - Series Instance UID
 * @param {string} sopUID - SOP Instance UID
 * @returns {Object} Formatted measurement object
 */
export function formatMeasurementData(annotation, studyUID, seriesUID = null, sopUID = null) {
  const data = annotation.data;
  const metadata = annotation.metadata;

  // Extract value based on tool type
  let value = null;
  let unit = null;
  let formattedValue = null;

  if (data.cachedStats) {
    // For ROI tools (Rectangle, Ellipse, Freehand)
    if (data.cachedStats.area !== undefined) {
      value = data.cachedStats.area;
      unit = 'mm²';
      formattedValue = `${value.toFixed(2)} ${unit}`;
    }
  }

  // For Length tool
  if (metadata?.toolName === 'Length' && data.handles?.points) {
    const length = data.cachedStats?.length;
    if (length !== undefined) {
      value = length;
      unit = 'mm';
      formattedValue = `${value.toFixed(2)} ${unit}`;
    }
  }

  // For Angle tools
  if (metadata?.toolName === 'Angle' || metadata?.toolName === 'CobbAngle') {
    const angle = data.cachedStats?.angle;
    if (angle !== undefined) {
      value = angle;
      unit = 'degrees';
      formattedValue = `${value.toFixed(1)}°`;
    }
  }

  return {
    study_instance_uid: studyUID,
    series_instance_uid: seriesUID,
    sop_instance_uid: sopUID,
    annotation_uid: annotation.annotationUID,
    tool_name: metadata?.toolName || 'Unknown',
    measurement_data: {
      handles: data.handles,
      cachedStats: data.cachedStats,
      label: data.label,
      metadata: metadata
    },
    value: value,
    unit: unit,
    formatted_value: formattedValue,
    viewport_id: metadata?.viewportId,
    created_by: null, // Can be set from user context
    created_at: new Date().toISOString()
  };
}

/**
 * Save measurements to localStorage
 * @param {string} studyUID - Study Instance UID
 * @param {Array} measurements - Array of formatted measurements
 */
export function saveMeasurementsToLocalStorage(studyUID, measurements) {
  try {
    const key = `measurements_${studyUID}`;
    const data = {
      study_uid: studyUID,
      measurements: measurements,
      saved_at: new Date().toISOString(),
      version: '1.0'
    };

    localStorage.setItem(key, JSON.stringify(data));
    console.log(`[MeasurementService] Saved ${measurements.length} measurements to localStorage for study ${studyUID}`);
    return true;
  } catch (error) {
    console.error('[MeasurementService] Error saving to localStorage:', error);
    return false;
  }
}

/**
 * Load measurements from localStorage
 * @param {string} studyUID - Study Instance UID
 * @returns {Array} Array of measurements
 */
export function loadMeasurementsFromLocalStorage(studyUID) {
  try {
    const key = `measurements_${studyUID}`;
    const data = localStorage.getItem(key);

    if (!data) {
      console.log(`[MeasurementService] No saved measurements found for study ${studyUID}`);
      return [];
    }

    const parsed = JSON.parse(data);
    console.log(`[MeasurementService] Loaded ${parsed.measurements?.length || 0} measurements from localStorage`);
    return parsed.measurements || [];
  } catch (error) {
    console.error('[MeasurementService] Error loading from localStorage:', error);
    return [];
  }
}

/**
 * Export measurements to JSON file
 * @param {string} studyUID - Study Instance UID
 * @param {Array} measurements - Array of measurements
 * @param {string} patientName - Patient name for filename
 */
export function exportMeasurementsToJSON(studyUID, measurements, patientName = 'Unknown') {
  try {
    const data = {
      study_instance_uid: studyUID,
      patient_name: patientName,
      measurements: measurements,
      exported_at: new Date().toISOString(),
      total_count: measurements.length,
      version: '1.0'
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    const filename = `measurements_${patientName.replace(/\s+/g, '_')}_${studyUID.substring(0, 16)}_${Date.now()}.json`;
    link.href = url;
    link.download = filename;
    link.click();

    URL.revokeObjectURL(url);
    console.log(`[MeasurementService] Exported ${measurements.length} measurements to ${filename}`);
    return true;
  } catch (error) {
    console.error('[MeasurementService] Error exporting measurements:', error);
    return false;
  }
}

/**
 * Save measurements to backend API via upsert (creates or updates with history archive)
 * @param {Array} measurements - Array of formatted measurements
 * @param {string} reason - 'auto_save' | 'manual_save' | 'clear_all'
 * @returns {Promise<Object>} API response
 */
export async function saveMeasurementsToAPI(measurements, reason = 'auto_save') {
  if (!isBackendEnabled()) {
    throw new Error('Measurements service is not enabled in API registry');
  }

  try {
    const endpoint = buildEndpoint('upsert');
    const api = measurementApi();
    const result = await api.post(endpoint, { measurements, reason });
    const summary = {
      created:  result?.created  ?? 0,
      updated:  result?.updated  ?? 0,
      skipped:  result?.skipped  ?? 0,
      errors:   result?.errors   ?? [],
      total:    result?.total    ?? measurements.length,
    };
    console.log(`[MeasurementService] Upsert via ${endpoint}`, summary);
    return result;
  } catch (error) {
    console.error('[MeasurementService] Error saving to API:', error);
    throw error;
  }
}

/**
 * Load measurements from backend API
 * @param {string} studyUID - Study Instance UID
 * @returns {Promise<Array>} Array of measurements
 */
export async function loadMeasurementsFromAPI(studyUID) {
  if (!isBackendEnabled()) {
    throw new Error('Measurements service is not enabled in API registry');
  }

  try {
    const endpoint = buildEndpoint('getByStudy', { studyUID });
    const api = measurementApi();
    const response = await api.get(endpoint);
    const measurements = unwrapMeasurementResponse(response);
    console.log(`[MeasurementService] Loaded ${measurements.length} measurements from API`);
    return measurements;
  } catch (error) {
    console.error('[MeasurementService] Error loading from API:', error);
    throw error;
  }
}

/**
 * Delete measurement from backend API
 * @param {string} measurementId - Measurement ID
 * @returns {Promise<void>}
 */
export async function deleteMeasurementFromAPI(measurementId) {
  if (!isBackendEnabled()) {
    throw new Error('Measurements service is not enabled in API registry');
  }

  try {
    const endpoint = buildEndpoint('delete', { id: measurementId });
    const api = measurementApi();
    await api.delete(endpoint);
    console.log(`[MeasurementService] Deleted measurement ${measurementId} from API`);
  } catch (error) {
    console.error('[MeasurementService] Error deleting from API:', error);
    throw error;
  }
}

/**
 * Save measurements with auto-fallback (API upsert -> localStorage)
 * @param {string} studyUID - Study Instance UID
 * @param {Array} measurements - Array of formatted measurements
 * @param {boolean} tryAPI - Whether to try API first
 * @param {string} reason - 'auto_save' | 'manual_save'
 * @returns {Promise<Object>} Save result
 */
export async function saveMeasurements(studyUID, measurements, tryAPI = true, reason = 'auto_save') {
  const result = {
    success: false,
    method: null,
    error: null
  };

  // Try API first if enabled
  const backendAvailable = isBackendEnabled();
  if (tryAPI && backendAvailable) {
    try {
      await saveMeasurementsToAPI(measurements, reason);
      result.success = true;
      result.method = 'api';
      return result;
    } catch (error) {
      console.warn('[MeasurementService] API save failed, falling back to localStorage:', error);
      result.error = error.message;
    }
  } else if (tryAPI && !backendAvailable) {
    console.info('[MeasurementService] Measurements backend disabled, using localStorage');
  }

  // Fallback to localStorage
  const saved = saveMeasurementsToLocalStorage(studyUID, measurements);
  result.success = saved;
  result.method = 'localStorage';

  return result;
}

/**
 * Load measurements with auto-fallback (API -> localStorage)
 * @param {string} studyUID - Study Instance UID
 * @param {boolean} tryAPI - Whether to try API first
 * @returns {Promise<Array>} Array of measurements
 */
export async function loadMeasurements(studyUID, tryAPI = true) {
  // Try API first if enabled
  const backendAvailable = isBackendEnabled();
  if (tryAPI && backendAvailable) {
    try {
      const measurements = await loadMeasurementsFromAPI(studyUID);
      if (measurements && measurements.length > 0) {
        return measurements;
      }
    } catch (error) {
      console.warn('[MeasurementService] API load failed, falling back to localStorage:', error);
    }
  } else if (tryAPI && !backendAvailable) {
    console.info('[MeasurementService] Measurements backend disabled, loading from localStorage');
  }

  // Fallback to localStorage
  return loadMeasurementsFromLocalStorage(studyUID);
}

/**
 * Restore measurements to Cornerstone viewer
 * @param {Array} measurements - Array of saved measurements
 * @param {Object} cornerstoneTools - Cornerstone tools object
 * @returns {number} Number of measurements restored
 */
export function restoreMeasurementsToViewer(measurements, cornerstoneTools) {
  if (!measurements || measurements.length === 0) {
    console.log('[MeasurementService] No measurements to restore');
    return 0;
  }

  if (!cornerstoneTools || !cornerstoneTools.annotation) {
    console.error('[MeasurementService] Cornerstone tools not available');
    return 0;
  }

  const { annotation } = cornerstoneTools;
  let restoredCount = 0;

  try {
    measurements.forEach((savedMeasurement, index) => {
      try {
        const toolName = savedMeasurement.tool_name;
        const measurementData = savedMeasurement.measurement_data;

        if (!measurementData || !measurementData.handles) {
          console.warn(`[MeasurementService] Skipping measurement ${index}: missing data`);
          return;
        }

        // Reconstruct annotation object
        const restoredAnnotation = {
          annotationUID: savedMeasurement.annotation_uid || `restored-${Date.now()}-${index}`,
          metadata: {
            toolName: toolName,
            viewportId: measurementData.metadata?.viewportId,
            ...measurementData.metadata
          },
          data: {
            handles: measurementData.handles,
            cachedStats: measurementData.cachedStats,
            label: measurementData.label
          },
          highlighted: false,
          invalidated: false
        };

        // Add annotation to state
        annotation.state.addAnnotation(restoredAnnotation);
        restoredCount++;

        console.log(`[MeasurementService] Restored ${toolName} measurement (${index + 1}/${measurements.length})`);
      } catch (error) {
        console.error(`[MeasurementService] Error restoring measurement ${index}:`, error);
      }
    });

    console.log(`[MeasurementService] Successfully restored ${restoredCount}/${measurements.length} measurements`);
    return restoredCount;
  } catch (error) {
    console.error('[MeasurementService] Error in restoreMeasurementsToViewer:', error);
    return restoredCount;
  }
}
