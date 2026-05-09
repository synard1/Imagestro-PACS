/**
 * Doctor Service
 * Handles all API calls related to doctor management
 * Supports both backend API and local mock data based on api-registry config
 */

import { apiClient } from './http';
import { loadRegistry } from './api-registry';
import { api } from './api'; // Fallback to existing mock service

/**
 * Check if SatuSehat Mock Mode is enabled
 */
const isMockModeEnabled = () => {
  const saved = localStorage.getItem('satusehat_show_mock_data');
  return saved === 'true';
};

// Check if backend is enabled
const isBackendEnabled = () => {
  // If mock mode is forced, pretend backend is disabled
  if (isMockModeEnabled()) {
    console.debug('[doctorService] SatuSehat Mock Mode is active');
    return false;
  }

  const registry = loadRegistry();
  const config = registry.doctors || { enabled: false };
  const enabled = config.enabled === true;
  console.debug('[doctorService] Backend enabled:', enabled);
  return enabled;
};

/**
 * Normalize doctor data from backend format to UI format
 * Backend uses: ihs_number, national_id, license, phone, etc.
 * UI expects: same format but with potential field mapping
 */
const normalizeDoctor = (doctor) => {
  if (!doctor) return null;

  // Format birth_date for the date input field
  let formattedBirthDate = ''
  if (doctor.birth_date) {
    // Handle different date formats from backend
    if (typeof doctor.birth_date === 'string') {
      // If it's in GMT format like "Tue, 28 Oct 2025 00:00:00 GMT"
      if (doctor.birth_date.includes('GMT')) {
        const dateObj = new Date(doctor.birth_date)
        if (!isNaN(dateObj.getTime())) {
          formattedBirthDate = dateObj.toISOString().split('T')[0]
        }
      } 
      // If it's already in YYYY-MM-DD format
      else if (doctor.birth_date.match(/^\d{4}-\d{2}-\d{2}/)) {
        formattedBirthDate = doctor.birth_date
      }
      // Try to parse other formats
      else {
        const dateObj = new Date(doctor.birth_date)
        if (!isNaN(dateObj.getTime())) {
          formattedBirthDate = dateObj.toISOString().split('T')[0]
        }
      }
    } else if (doctor.birth_date instanceof Date) {
      formattedBirthDate = doctor.birth_date.toISOString().split('T')[0]
    }
  }

  return {
    // Keep original data
    ...doctor,
    // Add any field mappings if needed
    id: doctor.id || doctor.ihs_number,
    name: doctor.name || doctor.doctor_name,
    specialty: doctor.specialty || doctor.specialization,
    phone: doctor.phone || doctor.contact_phone || doctor.telephone,
    birth_date: formattedBirthDate
  };
};

/**
 * Normalize array of doctors
 */
const normalizeDoctors = (doctors) => {
  if (!Array.isArray(doctors)) return [];
  return doctors.map(normalizeDoctor).filter(Boolean);
};

// ============================================
// Doctor Management Endpoints
// ============================================

/**
 * List all doctors with optional search filters
 * @param {Object} params - Search parameters (name, national_id, license, etc.)
 * @returns {Promise<Array>} List of doctors
 */
export const listDoctors = async (params = {}) => {
  const backendEnabled = isBackendEnabled();
  console.debug('[doctorService] listDoctors - Backend enabled:', backendEnabled);

  if (!backendEnabled) {
    console.debug('[doctorService] Using local api service');
    return api.listDoctors();
  }

  console.debug('[doctorService] Using backend API');
  try {
    const client = apiClient('doctors');

    // Build query params for search (MasterData uses filters on /doctors)
    const queryParams = new URLSearchParams();
    if (params.name) queryParams.append('name', params.name);
    if (params.national_id) queryParams.append('national_id', params.national_id);
    if (params.license) queryParams.append('license', params.license);
    if (params.ihs_number) queryParams.append('ihs_number', params.ihs_number);
    if (params.specialty) queryParams.append('specialty', params.specialty);
    if (params.active != null) queryParams.append('active', String(params.active));
    if (params.page) queryParams.append('page', params.page);
    if (params.page_size || params.limit) queryParams.append('page_size', params.page_size || params.limit);

    const qs = queryParams.toString();
    // Ensure we use /backend-api prefix for all candidates if baseUrl is relative/empty
    const baseCandidates = [`/doctors`, `/api/doctors`, `/master-data/doctors`];

    const endpoints = baseCandidates.map(b => (qs ? `${b}?${qs}` : b));

    let lastError = null;
    for (const ep of endpoints) {
      try {
        const response = await client.get(ep);
        if (response && response.status === 'success') {
          const doctors = response.data?.doctors || response.doctors || [];
          return normalizeDoctors(doctors);
        }
        if (Array.isArray(response)) return normalizeDoctors(response);
        if (response && response.doctors) return normalizeDoctors(response.doctors);
        return normalizeDoctors(response?.data?.doctors || []);
      } catch (e) {
        lastError = e;
        const msg = (e && e.message) ? e.message.toLowerCase() : '';
        const isPathIssue = e.status === 404 || e.status === 405 || msg.includes('not found') || msg.includes('method not allowed');
        const isTimeoutOrNetwork = e.code === 'ETIMEOUT' || msg.includes('timeout') || msg.includes('network');
        if (isPathIssue || isTimeoutOrNetwork) continue;
        break;
      }
    }

    // Same-origin fallback
    try {
      const localClient = apiClient('doctorsLocal');
      for (const b of ['/doctors', '/api/doctors', '/master-data/doctors']) {
        const ep = qs ? `${b}?${qs}` : b;
        try {
          const response = await localClient.get(ep);
          if (response && response.status === 'success') {
            const doctors = response.data?.doctors || response.doctors || [];
            return normalizeDoctors(doctors);
          }
          if (Array.isArray(response)) return normalizeDoctors(response);
          if (response && response.doctors) return normalizeDoctors(response.doctors);
        } catch (e2) {
          lastError = e2;
          const msg2 = (e2 && e2.message) ? e2.message.toLowerCase() : '';
          const isPathIssue2 = e2.status === 404 || e2.status === 405 || msg2.includes('not found') || msg2.includes('method not allowed');
          const isTimeoutOrNetwork2 = e2.code === 'ETIMEOUT' || msg2.includes('timeout') || msg2.includes('network');
          if (isPathIssue2 || isTimeoutOrNetwork2) continue;
          break;
        }
      }
    } catch (_) {}

    throw lastError || new Error('Failed to list doctors');
  } catch (error) {
    console.error('[doctorService] List doctors failed:', error);
    throw error;
  }
};

/**
 * Get doctor by ID or IHS Number
 * @param {string} doctorIdOrIhsNumber - Doctor ID (UUID) or IHS Number
 * @returns {Promise<Object>} Doctor data
 */
export const getDoctor = async (doctorIdOrIhsNumber) => {
  const backendEnabled = isBackendEnabled();

  if (!backendEnabled) {
    console.debug('[doctorService] Using local api service');
    try {
      const doctor = await api.getDoctor(doctorIdOrIhsNumber);
      console.debug('[doctorService] Doctor loaded from local API:', doctor);
      return doctor;
    } catch (error) {
      console.error('[doctorService] Failed to load doctor from local API:', error);
      throw error;
    }
  }

  console.debug('[doctorService] Getting doctor from backend API:', doctorIdOrIhsNumber);
  try {
    const client = apiClient('doctors');
    const candidates = [`/doctors/${doctorIdOrIhsNumber}`, `/api/doctors/${doctorIdOrIhsNumber}`, `/master-data/doctors/${doctorIdOrIhsNumber}`];
    let lastErr = null;
    for (const ep of candidates) {
      try {
        const response = await client.get(ep);
        if (response && response.status === 'success') {
          const doctor = response.data?.doctor || response.doctor || response.data;
          return normalizeDoctor(doctor);
        }
        return normalizeDoctor(response);
      } catch (e) {
        lastErr = e;
        const msg = (e && e.message) ? e.message.toLowerCase() : '';
        if (e.status === 404 || e.status === 405 || msg.includes('not found') || msg.includes('method not allowed')) continue;
        break;
      }
    }
    throw lastErr || new Error('Failed to get doctor');
  } catch (error) {
    console.error('[doctorService] Get doctor failed:', error);
    throw error;
  }
};

/**
 * Create a new doctor
 * @param {Object} doctorData - Doctor information
 * @returns {Promise<Object>} Created doctor data
 */
export const createDoctor = async (doctorData) => {
  const backendEnabled = isBackendEnabled();

  if (!backendEnabled) {
    console.debug('[doctorService] Using local api service');
    return api.createDoctor(doctorData);
  }

  console.debug('[doctorService] Creating doctor in backend API');
  try {
    const client = apiClient('doctors');
    const candidates = ['/doctors', '/api/doctors', '/master-data/doctors'];
    let lastErr = null;
    for (const ep of candidates) {
      try {
        const response = await client.post(ep, doctorData);
        if (response && response.status === 'success') {
          const doctor = response.data?.doctor || response.doctor || response.data;
          return normalizeDoctor(doctor);
        }
        return normalizeDoctor(response);
      } catch (e) {
        lastErr = e;
        const msg = (e && e.message) ? e.message.toLowerCase() : '';
        const isPathIssue = e.status === 404 || e.status === 405 || msg.includes('not found') || msg.includes('method not allowed');
        const isTimeoutOrNetwork = e.code === 'ETIMEOUT' || msg.includes('timeout') || msg.includes('network');
        if (isPathIssue || isTimeoutOrNetwork) continue;
        break;
      }
    }

    // Same-origin fallback
    try {
      const localClient = apiClient('doctorsLocal');
      for (const ep of ['/doctors', '/api/doctors', '/master-data/doctors']) {
        try {
          const response = await localClient.post(ep, doctorData);
          if (response && response.status === 'success') {
            const doctor = response.data?.doctor || response.doctor || response.data;
            return normalizeDoctor(doctor);
          }
          return normalizeDoctor(response);
        } catch (e2) {
          lastErr = e2;
          const msg2 = (e2 && e2.message) ? e2.message.toLowerCase() : '';
          const isPathIssue2 = e2.status === 404 || e2.status === 405 || msg2.includes('not found') || msg2.includes('method not allowed');
          const isTimeoutOrNetwork2 = e2.code === 'ETIMEOUT' || msg2.includes('timeout') || msg2.includes('network');
          if (isPathIssue2 || isTimeoutOrNetwork2) continue;
          break;
        }
      }
    } catch (_) {}

    throw lastErr || new Error('Failed to create doctor');
  } catch (error) {
    console.error('[doctorService] Create doctor failed:', error);
    // Normalize backend error messages
    if (error.message && error.message.includes('invalid input syntax for type date')) {
      throw new Error('Invalid date format. Please enter a valid birth date.');
    }
    throw error;
  }
};

/**
 * Update doctor information
 * @param {string} doctorId - Doctor ID (UUID)
 * @param {Object} doctorData - Updated doctor information
 * @returns {Promise<Object>} Updated doctor data
 */
export const updateDoctor = async (doctorId, doctorData) => {
  const backendEnabled = isBackendEnabled();

  if (!backendEnabled) {
    console.debug('[doctorService] Using local api service');
    return api.updateDoctor(doctorId, doctorData);
  }

  console.debug('[doctorService] Updating doctor in backend API:', doctorId);
  console.debug('[doctorService] Update payload:', doctorData);

  try {
    const client = apiClient('doctors');
    console.debug('[doctorService] Doctor service client created');
    const candidates = [`/doctors/${doctorId}`, `/api/doctors/${doctorId}`, `/master-data/doctors/${doctorId}`];
    let lastErr = null;

    for (const ep of candidates) {
      try {
        console.debug('[doctorService] Trying update endpoint:', ep);
        const response = await client.put(ep, doctorData);
        console.debug('[doctorService] Update response:', response);

        if (response && response.status === 'success') {
          const doctor = response.data?.doctor || response.doctor || response.data;
          console.debug('[doctorService] Update successful:', doctor);
          return normalizeDoctor(doctor);
        }
        return normalizeDoctor(response);
      } catch (e) {
        lastErr = e;
        console.debug('[doctorService] Endpoint failed:', ep, 'Error:', e);
        const msg = (e && e.message) ? e.message.toLowerCase() : '';
        const isPathIssue = e.status === 404 || e.status === 405 || msg.includes('not found') || msg.includes('method not allowed');
        const isTimeoutOrNetwork = e.code === 'ETIMEOUT' || msg.includes('timeout') || msg.includes('network');
        if (isPathIssue || isTimeoutOrNetwork) continue;
        break;
      }
    }

    // If all endpoints failed, provide helpful error message
    if (lastErr) {
      console.error('[doctorService] All update endpoints failed:', lastErr);

      // Check for specific error types
      if (lastErr.status === 404) {
        throw new Error('Doctor not found. The doctor may have been deleted. Please refresh the page.');
      }
      if (lastErr.status === 401 || lastErr.status === 403) {
        throw new Error('You do not have permission to update this doctor.');
      }
      if (lastErr.status === 409) {
        throw new Error('Update conflict. Another user may have modified this doctor. Please refresh and try again.');
      }

      throw lastErr;
    }

    throw new Error('Failed to update doctor. Please try again.');
  } catch (error) {
    console.error('[doctorService] Update doctor failed:', error);

    // Normalize backend error messages
    if (error.message && error.message.includes('invalid input syntax for type date')) {
      throw new Error('Invalid date format. Please enter a valid birth date.');
    }
    if (error.message && error.message.includes('duplicate key')) {
      throw new Error('A doctor with this National ID or License already exists.');
    }

    throw error;
  }
};

/**
 * Delete doctor (soft delete)
 * @param {string} doctorId - Doctor ID (UUID)
 * @returns {Promise<Object>} Deletion confirmation
 */
export const deleteDoctor = async (doctorId) => {
  const backendEnabled = isBackendEnabled();

  if (!backendEnabled) {
    console.debug('[doctorService] Using local api service');
    return api.deleteDoctor(doctorId);
  }

  console.debug('[doctorService] Deleting doctor in backend API:', doctorId);
  try {
    const client = apiClient('doctors');
    const candidates = [`/doctors/${doctorId}`, `/api/doctors/${doctorId}`, `/master-data/doctors/${doctorId}`];
    let lastErr = null;
    for (const ep of candidates) {
      try {
        const response = await client.delete(ep);
        return response || { status: 'success' };
      } catch (e) {
        lastErr = e;
        const msg = (e && e.message) ? e.message.toLowerCase() : '';
        const isPathIssue = e.status === 404 || e.status === 405 || msg.includes('not found') || msg.includes('method not allowed');
        const isTimeoutOrNetwork = e.code === 'ETIMEOUT' || msg.includes('timeout') || msg.includes('network');
        if (isPathIssue || isTimeoutOrNetwork) continue;
        break;
      }
    }

    // Same-origin fallback
    try {
      const localClient = apiClient('doctorsLocal');
      for (const ep of [`/doctors/${doctorId}`, `/api/doctors/${doctorId}`, `/master-data/doctors/${doctorId}`]) {
        try {
          const response = await localClient.delete(ep);
          return response || { status: 'success' };
        } catch (e2) {
          lastErr = e2;
          const msg2 = (e2 && e2.message) ? e2.message.toLowerCase() : '';
          const isPathIssue2 = e2.status === 404 || e2.status === 405 || msg2.includes('not found') || msg2.includes('method not allowed');
          const isTimeoutOrNetwork2 = e2.code === 'ETIMEOUT' || msg2.includes('timeout') || msg2.includes('network');
          if (isPathIssue2 || isTimeoutOrNetwork2) continue;
          break;
        }
      }
    } catch (_) {}

    throw lastErr || new Error('Failed to delete doctor');
  } catch (error) {
    console.error('[doctorService] Delete doctor failed:', error);
    throw error;
  }
};

/**
 * Search doctors by various criteria
 * @param {Object} searchParams - Search parameters
 * @returns {Promise<Array>} List of matching doctors
 */
export const searchDoctors = async (searchParams) => {
  const backendEnabled = isBackendEnabled();

  if (!backendEnabled) {
    console.debug('[doctorService] Using local api service');
    return api.listDoctors(); // Mock service doesn't have search, so we use listDoctors
  }

  console.debug('[doctorService] Searching doctors in backend API');
  try {
    const client = apiClient('doctors');
    const queryParams = new URLSearchParams(searchParams);
    const response = await client.get(`/doctors/search?${queryParams}`);

    // Normalize response format
    if (response.status === 'success') {
      const doctors = response.data?.doctors || response.doctors || [];
      return normalizeDoctors(doctors);
    }

    // If response is array, normalize it
    if (Array.isArray(response)) {
      return normalizeDoctors(response);
    }

    return response;
  } catch (error) {
    console.error('[doctorService] Search doctors failed:', error);
    throw error;
  }
};

// Export all functions as default
export default {
  listDoctors,
  getDoctor,
  createDoctor,
  updateDoctor,
  deleteDoctor,
  searchDoctors,
};
