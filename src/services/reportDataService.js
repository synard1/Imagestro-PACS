/**
 * Report Data Service
 * Service untuk fetch data laporan (mock atau real API)
 */

import {
  mockRegistrationData,
  mockModalityData,
  mockSatusehatData,
  mockWorklistData,
  mockStorageData,
  mockProductivityData,
  mockAuditData,
  mockDashboardData
} from '../data/mockReportData';
import { getAuth } from './auth-storage';

// Toggle untuk menggunakan mock data atau real API
const USE_MOCK_DATA = true;

// Base URL untuk API
const API_BASE_URL = import.meta.env.VITE_MAIN_API_BACKEND_URL || '';

/**
 * Helper untuk fetch dengan error handling
 */
const fetchWithAuth = async (url, options = {}) => {
  const auth = getAuth();
  const token = auth?.access_token;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : '',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
};

/**
 * Simulate API delay untuk mock data
 */
const simulateDelay = (ms = 500) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Filter data berdasarkan date range
 */
const filterByDateRange = (data, startDate, endDate, dateField = 'date') => {
  if (!startDate && !endDate) return data;
  
  return data.filter(item => {
    const itemDate = new Date(item[dateField]);
    if (startDate && itemDate < new Date(startDate)) return false;
    if (endDate && itemDate > new Date(endDate)) return false;
    return true;
  });
};

// ============================================================================
// DASHBOARD
// ============================================================================
export const getDashboardData = async () => {
  if (USE_MOCK_DATA) {
    await simulateDelay(300);
    return mockDashboardData;
  }
  
  return fetchWithAuth(`${API_BASE_URL}/api/reports/dashboard`);
};

// ============================================================================
// REGISTRATION REPORT
// ============================================================================
export const getRegistrationReport = async (filters = {}) => {
  if (USE_MOCK_DATA) {
    await simulateDelay(400);
    
    let data = { ...mockRegistrationData };
    
    // Apply filters to trend data
    if (filters.startDate || filters.endDate) {
      data.trend = filterByDateRange(data.trend, filters.startDate, filters.endDate);
    }
    
    // Filter by source
    if (filters.source && filters.source !== 'all') {
      data.details = data.details.filter(d => d.source === filters.source);
    }
    
    // Filter by patient type
    if (filters.patientType && filters.patientType !== 'all') {
      data.details = data.details.filter(d => d.patientType === filters.patientType);
    }
    
    return data;
  }
  
  const params = new URLSearchParams();
  if (filters.startDate) params.append('start_date', filters.startDate);
  if (filters.endDate) params.append('end_date', filters.endDate);
  if (filters.source) params.append('source', filters.source);
  if (filters.patientType) params.append('patient_type', filters.patientType);
  
  return fetchWithAuth(`${API_BASE_URL}/api/reports/registration?${params}`);
};

// ============================================================================
// MODALITY REPORT
// ============================================================================
export const getModalityReport = async (filters = {}) => {
  if (USE_MOCK_DATA) {
    await simulateDelay(400);
    
    let data = { ...mockModalityData };
    
    if (filters.startDate || filters.endDate) {
      data.trend = filterByDateRange(data.trend, filters.startDate, filters.endDate);
    }
    
    if (filters.modality && filters.modality !== 'all') {
      data.byModality = data.byModality.filter(m => m.modality === filters.modality);
    }
    
    return data;
  }
  
  const params = new URLSearchParams();
  if (filters.startDate) params.append('start_date', filters.startDate);
  if (filters.endDate) params.append('end_date', filters.endDate);
  if (filters.modality) params.append('modality', filters.modality);
  
  return fetchWithAuth(`${API_BASE_URL}/api/reports/modality?${params}`);
};

// ============================================================================
// SATUSEHAT REPORT
// ============================================================================
export const getSatusehatReport = async (filters = {}) => {
  if (USE_MOCK_DATA) {
    await simulateDelay(400);
    
    let data = { ...mockSatusehatData };
    
    if (filters.startDate || filters.endDate) {
      data.trend = filterByDateRange(data.trend, filters.startDate, filters.endDate);
    }
    
    return data;
  }
  
  const params = new URLSearchParams();
  if (filters.startDate) params.append('start_date', filters.startDate);
  if (filters.endDate) params.append('end_date', filters.endDate);
  if (filters.status) params.append('status', filters.status);
  
  return fetchWithAuth(`${API_BASE_URL}/api/reports/satusehat?${params}`);
};

// ============================================================================
// WORKLIST REPORT
// ============================================================================
export const getWorklistReport = async (filters = {}) => {
  if (USE_MOCK_DATA) {
    await simulateDelay(400);
    
    let data = { ...mockWorklistData };
    
    if (filters.startDate || filters.endDate) {
      data.trend = filterByDateRange(data.trend, filters.startDate, filters.endDate);
    }
    
    return data;
  }
  
  const params = new URLSearchParams();
  if (filters.startDate) params.append('start_date', filters.startDate);
  if (filters.endDate) params.append('end_date', filters.endDate);
  if (filters.status) params.append('status', filters.status);
  if (filters.modality) params.append('modality', filters.modality);
  
  return fetchWithAuth(`${API_BASE_URL}/api/reports/worklist?${params}`);
};

// ============================================================================
// STORAGE REPORT
// ============================================================================
export const getStorageReport = async (filters = {}) => {
  if (USE_MOCK_DATA) {
    await simulateDelay(400);
    
    let data = { ...mockStorageData };
    
    if (filters.startDate || filters.endDate) {
      data.trend = filterByDateRange(data.trend, filters.startDate, filters.endDate);
    }
    
    return data;
  }
  
  const params = new URLSearchParams();
  if (filters.startDate) params.append('start_date', filters.startDate);
  if (filters.endDate) params.append('end_date', filters.endDate);
  
  return fetchWithAuth(`${API_BASE_URL}/api/reports/storage?${params}`);
};

// ============================================================================
// PRODUCTIVITY REPORT
// ============================================================================
export const getProductivityReport = async (filters = {}) => {
  if (USE_MOCK_DATA) {
    await simulateDelay(400);
    return mockProductivityData;
  }
  
  const params = new URLSearchParams();
  if (filters.startDate) params.append('start_date', filters.startDate);
  if (filters.endDate) params.append('end_date', filters.endDate);
  if (filters.role) params.append('role', filters.role);
  
  return fetchWithAuth(`${API_BASE_URL}/api/reports/productivity?${params}`);
};

// ============================================================================
// AUDIT REPORT
// ============================================================================
export const getAuditReport = async (filters = {}) => {
  if (USE_MOCK_DATA) {
    await simulateDelay(400);
    
    let data = { ...mockAuditData };
    
    if (filters.startDate || filters.endDate) {
      data.trend = filterByDateRange(data.trend, filters.startDate, filters.endDate);
    }
    
    if (filters.user) {
      data.timeline = data.timeline.filter(t => t.user === filters.user);
    }
    
    if (filters.action) {
      data.timeline = data.timeline.filter(t => t.action === filters.action);
    }
    
    return data;
  }
  
  const params = new URLSearchParams();
  if (filters.startDate) params.append('start_date', filters.startDate);
  if (filters.endDate) params.append('end_date', filters.endDate);
  if (filters.user) params.append('user', filters.user);
  if (filters.action) params.append('action', filters.action);
  
  return fetchWithAuth(`${API_BASE_URL}/api/reports/audit?${params}`);
};

// ============================================================================
// EXPORT FUNCTIONS
// ============================================================================
export const exportReport = async (reportType, format, filters = {}) => {
  if (USE_MOCK_DATA) {
    await simulateDelay(1000);
    // Simulate download
    console.log(`Exporting ${reportType} as ${format}`, filters);
    return { success: true, message: `${reportType} exported as ${format}` };
  }
  
  const params = new URLSearchParams();
  params.append('format', format);
  if (filters.startDate) params.append('start_date', filters.startDate);
  if (filters.endDate) params.append('end_date', filters.endDate);
  
  const auth = getAuth();
  const response = await fetch(`${API_BASE_URL}/api/reports/${reportType}/export?${params}`, {
    headers: {
      'Authorization': `Bearer ${auth?.access_token || ''}`,
    },
  });
  
  if (!response.ok) {
    throw new Error('Export failed');
  }
  
  // Handle file download
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${reportType}_report.${format}`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
  
  return { success: true };
};
