/**
 * Nurse Service
 * Handles all API calls related to nurse management
 */

import { apiClient } from './http';
import { loadRegistry } from './api-registry';

// Check if backend is enabled
const isBackendEnabled = () => {
  const registry = loadRegistry();
  const config = registry.nurses || { enabled: true }; // Default to true for new feature
  return config.enabled === true;
};

/**
 * Normalize nurse data
 */
const normalizeNurse = (nurse) => {
  if (!nurse) return null;
  return {
    ...nurse,
    id: nurse.id,
    name: nurse.name,
    license_number: nurse.license_number,
    phone: nurse.phone,
    email: nurse.email,
    gender: nurse.gender,
    active: nurse.active,
    national_id: nurse.national_id,
    ihs_number: nurse.ihs_number
  };
};

/**
 * Normalize array of nurses
 */
const normalizeNurses = (nurses) => {
  if (!Array.isArray(nurses)) return [];
  return nurses.map(normalizeNurse).filter(Boolean);
};

// ============================================
// Nurse Management Endpoints
// ============================================

export const listNurses = async (params = {}) => {
  try {
    const client = apiClient('nurses');
    const queryParams = new URLSearchParams();
    if (params.search) queryParams.append('search', params.search);
    if (params.active != null) queryParams.append('active', String(params.active));
    if (params.page) queryParams.append('page', params.page);
    if (params.page_size) queryParams.append('page_size', params.page_size);

    const qs = queryParams.toString();
    const endpoint = qs ? `/nurses?${qs}` : `/nurses`;

    const response = await client.get(endpoint);
    if (response && response.status === 'success') {
      const nurses = response.nurses || response.data?.nurses || [];
      return {
        items: normalizeNurses(nurses),
        total: response.total || nurses.length
      };
    }
    return { items: [], total: 0 };
  } catch (error) {
    console.error('[nurseService] List nurses failed:', error);
    throw error;
  }
};

export const getNurse = async (id) => {
  try {
    const client = apiClient('nurses');
    const response = await client.get(`/nurses/${id}`);
    if (response && response.status === 'success') {
      return normalizeNurse(response.nurse);
    }
    throw new Error('Failed to get nurse');
  } catch (error) {
    console.error('[nurseService] Get nurse failed:', error);
    throw error;
  }
};

export const createNurse = async (data) => {
  try {
    const client = apiClient('nurses');
    const response = await client.post('/nurses', data);
    return response;
  } catch (error) {
    console.error('[nurseService] Create nurse failed:', error);
    throw error;
  }
};

export const updateNurse = async (id, data) => {
  try {
    const client = apiClient('nurses');
    const response = await client.put(`/nurses/${id}`, data);
    return response;
  } catch (error) {
    console.error('[nurseService] Update nurse failed:', error);
    throw error;
  }
};

export const deleteNurse = async (id) => {
  try {
    const client = apiClient('nurses');
    const response = await client.delete(`/nurses/${id}`);
    return response;
  } catch (error) {
    console.error('[nurseService] Delete nurse failed:', error);
    throw error;
  }
};

export default {
  listNurses,
  getNurse,
  createNurse,
  updateNurse,
  deleteNurse,
};
