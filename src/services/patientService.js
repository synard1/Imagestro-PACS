/**
 * Patient Service
 * Handles all API calls related to patient management
 * Supports both backend API and local mock data based on api-registry config
 */

import { apiClient } from './http';
import { loadRegistry } from './api-registry';
import { logger } from '../utils/logger';
import { api } from './api'; // Fallback to existing mock service

/**
 * Check if SatuSehat Mock Mode is enabled
 * Only active if enabled in settings and user is superadmin/developer
 */
const isMockModeEnabled = () => {
  const saved = localStorage.getItem('satusehat_show_mock_data');
  return saved === 'true';
};

// Check if backend is enabled
const isBackendEnabled = () => {
  // If mock mode is forced, pretend backend is disabled
  if (isMockModeEnabled()) {
    logger.debug('[patientService] SatuSehat Mock Mode is active');
    return false;
  }

  const registry = loadRegistry();
  const config = registry.patients || { enabled: false };
  const enabled = config.enabled === true;
  logger.debug('[patientService] Backend enabled:', enabled);
  return enabled;
};

/**
 * Normalize patient data from backend format to UI format
 * Backend uses: patient_name, patient_national_id, medical_record_number, gender (male/female)
 * UI expects: name, patient_id, mrn, sex (M/F)
 */
const normalizePatient = (patient) => {
  if (!patient) return null;

  // Create a new object from the original patient data
  const newPatient = { ...patient };

  // Convert gender to the format expected by the UI (M/F)
  if (typeof newPatient.gender === 'string') {
    newPatient.gender = newPatient.gender.toLowerCase() === 'male' ? 'M' : 'F';
  }

  // Normalize other fields for UI compatibility
  newPatient.name = patient.patient_name || patient.name;
  newPatient.patient_id = patient.patient_national_id || patient.national_id || patient.patient_id || patient.nik;
  newPatient.national_id = patient.patient_national_id || patient.national_id || patient.nik;
  newPatient.mrn = patient.medical_record_number || patient.mrn;
  
  // Format birth_date if needed
  let birthDate = patient.birth_date || patient.birthdate;
  if (birthDate && typeof birthDate === 'string') {
    try {
      const date = new Date(birthDate);
      if (!isNaN(date.getTime())) {
        newPatient.birth_date = date.toISOString().split('T')[0];
      }
    } catch (e) {
      logger.debug('[patientService] Failed to parse date:', birthDate);
    }
  }

  // Format allergies from array of objects to string for UI
  let allergiesText = patient.allergies;
  if (Array.isArray(patient.allergies) && patient.allergies.length > 0) {
    allergiesText = patient.allergies.map(allergy => {
      const parts = [];
      if (allergy.allergen) parts.push(allergy.allergen);
      if (allergy.reaction) parts.push(`(${allergy.reaction})`);
      if (allergy.severity) parts.push(`[${allergy.severity}]`);
      return parts.join(' ');
    }).join('\n');
  } else if (typeof patient.allergies === 'string') {
    allergiesText = patient.allergies;
  } else {
    allergiesText = '';
  }
  newPatient.allergies = allergiesText;
  newPatient.allergies_array = Array.isArray(patient.allergies) ? patient.allergies : null;

  // Keep other important fields
  newPatient.ihs_number = patient.ihs_number || patient.satusehat_ihs_number || patient.patient_ihs_number;
  newPatient.phone = patient.phone || patient.contact_phone || patient.telephone;

  return newPatient;
};

/**
 * Normalize array of patients
 */
const normalizePatients = (patients) => {
  if (!Array.isArray(patients)) return [];
  return patients.map(normalizePatient).filter(Boolean);
};

// ============================================
// Patient Management Endpoints
// ============================================

/**
 * List all patients with optional search filters
 * @param {Object} params - Search parameters (name, nik, mrn, etc.)
 * @returns {Promise<Array>} List of patients
 */
export const listPatients = async (params = {}) => {
  const backendEnabled = isBackendEnabled();
  logger.debug('[patientService] listPatients - Backend enabled:', backendEnabled);

  if (!backendEnabled) {
    logger.debug('[patientService] Using local api service');
    return api.listPatients();
  }

  logger.debug('[patientService] Using backend API');
  const client = apiClient('patients');
  // Build query params for search
  const queryParams = new URLSearchParams();
  if (params.search) queryParams.append('search', params.search);
  if (params.name) queryParams.append('name', params.name);
  if (params.nik) queryParams.append('nik', params.nik);
  if (params.mrn) queryParams.append('mrn', params.mrn);
  if (params.ihs_number) queryParams.append('ihs_number', params.ihs_number);
  if (params.page) queryParams.append('page', params.page);
  if (params.limit) queryParams.append('limit', params.limit);

  const baseCandidates = ['/patients', '/api/patients', '/master-data/patients'];
  const endpoints = queryParams.toString()
    ? baseCandidates.map(b => `${b}/search?${queryParams}`)
    : baseCandidates;

  let lastError = null;
  for (const ep of endpoints) {
    try {
      const response = await client.get(ep);
      // Handle new gateway format: { status: 'success', data: [...] }
      if (response && response.status === 'success') {
        const patients = response.data || response.patients || [];
        return normalizePatients(Array.isArray(patients) ? patients : [patients]);
      }
      // Handle legacy formats
      if (Array.isArray(response)) return normalizePatients(response);
      if (response && response.patients) return normalizePatients(response.patients);
      if (response && response.data && Array.isArray(response.data)) return normalizePatients(response.data);
      
      return Array.isArray(response) ? normalizePatients(response) : [];
    } catch (error) {
      lastError = error;
      const msg = (error && error.message) ? error.message.toLowerCase() : '';
      if (error.status === 404 || error.status === 405 || msg.includes('not found') || msg.includes('method not allowed')) {
        continue;
      }
      break;
    }
  }
  logger.error('[patientService] List patients failed (all endpoints tried):', lastError);
  throw lastError || new Error('Failed to list patients');
};

/**
 * Get patient by ID or NIK
 * @param {string} patientIdOrNik - Patient ID (UUID) or NIK
 * @returns {Promise<Object>} Patient data
 */
export const getPatient = async (patientIdOrNik) => {
  const backendEnabled = isBackendEnabled();

  if (!backendEnabled) {
    logger.debug('[patientService] Using local api service');
    // When using local API service, make sure we're passing the correct parameter
    try {
      const patient = await api.getPatient(patientIdOrNik);
      logger.debug('[patientService] Patient loaded from local API:', patient);
      return patient;
    } catch (error) {
      logger.error('[patientService] Failed to load patient from local API:', error);
      throw error;
    }
  }

  logger.debug('[patientService] Getting patient from backend API:', patientIdOrNik);
  try {
    const client = apiClient('patients');
    const candidates = [`/patients/${patientIdOrNik}`, `/api/patients/${patientIdOrNik}`, `/master-data/patients/${patientIdOrNik}`];
    let lastErr = null;
    for (const ep of candidates) {
      try {
        const response = await client.get(ep);
        // Normalize response format
        if (response && response.status === 'success') {
          const patient = response.data?.patient || response.patient || response.data;
          return normalizePatient(patient);
        }
        return normalizePatient(response);
      } catch (e) {
        lastErr = e;
        const msg = (e && e.message) ? e.message.toLowerCase() : '';
        if (e.status === 404 || e.status === 405 || msg.includes('not found') || msg.includes('method not allowed')) continue;
        break;
      }
    }
    throw lastErr || new Error('Failed to get patient');
  } catch (error) {
    logger.error('[patientService] Get patient failed:', error);
    throw error;
  }
};

/**
 * Create a new patient
 * @param {Object} patientData - Patient information
 * @returns {Promise<Object>} Created patient data
 */
export const createPatient = async (patientData) => {
  const backendEnabled = isBackendEnabled();

  if (!backendEnabled) {
    logger.debug('[patientService] Using local api service');
    return api.createPatient(patientData);
  }

  logger.debug('[patientService] Creating patient in backend API');
  const client = apiClient('patients');

  // Try multiple endpoint patterns to accommodate gateway/path variations
  const endpointCandidates = ['/patients', '/api/patients', '/master-data/patients'];

  let lastError = null;
  for (const ep of endpointCandidates) {
    try {
      const response = await client.post(ep, patientData);

      if (response && response.status === 'success') {
        const createdId = response.patient_id || response.data?.patient_id || response.id;
        if (createdId) {
          try {
            const detail = await client.get(`${ep}/${createdId}`);
            const patient = detail?.data?.patient || detail?.patient || detail;
            return normalizePatient(patient);
          } catch (_) {
            return normalizePatient({ id: createdId, ...patientData });
          }
        }
        const patient = response.data?.patient || response.patient || response.data;
        return normalizePatient(patient || patientData);
      }

      // If backend returns object directly
      return normalizePatient(response || patientData);
    } catch (error) {
      lastError = error;
      // Retry on typical path/method issues
      const msg = (error && error.message) ? error.message.toLowerCase() : '';
      if (error.status === 405 || error.status === 404 || msg.includes('method not allowed') || msg.includes('not found')) {
        continue; // try next candidate path
      }
      // Other errors: break immediately
      break;
    }
  }

  logger.error('[patientService] Create patient failed (all endpoints tried):', lastError);
  throw lastError || new Error('Failed to create patient');
};

/**
 * Update patient information
 * @param {string} patientId - Patient ID (UUID)
 * @param {Object} patientData - Updated patient information
 * @returns {Promise<Object>} Updated patient data
 */
export const updatePatient = async (patientId, patientData) => {
  const backendEnabled = isBackendEnabled();

  if (!backendEnabled) {
    logger.debug('[patientService] Using local api service');
    return api.updatePatient(patientId, patientData);
  }

  logger.debug('[patientService] Updating patient in backend API:', patientId);
  try {
    const client = apiClient('patients');
    logger.debug('[patientService] Patient service client created');
    const candidates = [`/patients/${patientId}`, `/api/patients/${patientId}`, `/master-data/patients/${patientId}`];
    let lastErr = null;
    for (const ep of candidates) {
      try {
        const response = await client.put(ep, patientData);
        if (response && response.status === 'success') {
          const patient = response.data?.patient || response.patient || response.data;
          return normalizePatient(patient);
        }
        return normalizePatient(response);
      } catch (e) {
        lastErr = e;
        const msg = (e && e.message) ? e.message.toLowerCase() : '';
        if (e.status === 404 || e.status === 405 || msg.includes('not found') || msg.includes('method not allowed')) continue;
        break;
      }
    }
    throw lastErr || new Error('Failed to update patient');
  } catch (error) {
    logger.error('[patientService] Update patient failed:', error);
    throw error;
  }
};

/**
 * Delete patient (soft delete)
 * @param {string} patientId - Patient ID (UUID)
 * @returns {Promise<Object>} Deletion confirmation
 */
export const deletePatient = async (patientId) => {
  const backendEnabled = isBackendEnabled();

  if (!backendEnabled) {
    logger.debug('[patientService] Using local api service');
    return api.deletePatient(patientId);
  }

  logger.debug('[patientService] Deleting patient in backend API:', patientId);
  try {
    const client = apiClient('patients');
    const candidates = [`/patients/${patientId}`, `/api/patients/${patientId}`, `/master-data/patients/${patientId}`];
    let lastErr = null;
    for (const ep of candidates) {
      try {
        const response = await client.delete(ep);
        return response || { status: 'success' };
      } catch (e) {
        lastErr = e;
        const msg = (e && e.message) ? e.message.toLowerCase() : '';
        if (e.status === 404 || e.status === 405 || msg.includes('not found') || msg.includes('method not allowed')) continue;
        break;
      }
    }
    throw lastErr || new Error('Failed to delete patient');
  } catch (error) {
    logger.error('[patientService] Delete patient failed:', error);
    throw error;
  }
};

/**
 * Search patients by various criteria
 * @param {Object} searchParams - Search parameters
 * @returns {Promise<Array>} List of matching patients
 */
export const searchPatients = async (searchParams) => {
  const backendEnabled = isBackendEnabled();

  if (!backendEnabled) {
    logger.debug('[patientService] Using local api service');
    return api.listPatients(); // Mock service doesn't have search, so we use listPatients
  }

  logger.debug('[patientService] Searching patients in backend API');
  try {
    const client = apiClient('patients');
    const queryParams = new URLSearchParams(searchParams);
    const response = await client.get(`/patients/search?${queryParams}`);

    // Normalize response format
    if (response.status === 'success') {
      const patients = response.data?.patients || response.patients || [];
      return normalizePatients(patients);
    }

    // If response is array, normalize it
    if (Array.isArray(response)) {
      return normalizePatients(response);
    }

    return response;
  } catch (error) {
    logger.error('[patientService] Search patients failed:', error);
    throw error;
  }
};

// Export all functions as default
export default {
  listPatients,
  getPatient,
  createPatient,
  updatePatient,
  deletePatient,
  searchPatients,
};
