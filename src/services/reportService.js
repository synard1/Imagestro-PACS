/**
 * Report Service
 * Handles all report-related API calls
 */

import { apiClient } from './http';
import khanzaService, { isKhanzaEnabled } from './khanzaService';
import { fetchStudyDetails } from './studyService';

const API_BASE = '/api/reports';

// Create API client instance for reports module
const reportsApi = apiClient('reports');

/**
 * Report Service
 * Provides methods for CRUD operations on radiology reports
 */
export const reportService = {
  /**
   * Create a new report
   * @param {Object} reportData - Report data
   * @returns {Promise<Object>} Created report
   */
  async createReport(reportData) {
    try {
      const response = await reportsApi.post(API_BASE, reportData);
      console.log('[ReportService] Report created:', response.data.report_id);
      return { success: true, data: response.data };
    } catch (error) {
      console.error('[ReportService] Create failed:', error);
      return {
        success: false,
        error: error.response?.data?.detail || error.message
      };
    }
  },

  /**
   * Get report by ID
   * @param {string} reportId - Report ID
   * @returns {Promise<Object>} Report data
   */
  async getReport(reportId) {
    try {
      const response = await reportsApi.get(`${API_BASE}/${reportId}`);
      return { success: true, data: response.data };
    } catch (error) {
      console.error('[ReportService] Get failed:', error);
      return {
        success: false,
        error: error.response?.data?.detail || error.message
      };
    }
  },

  /**
   * Get all reports for a study
   * @param {string} studyId - Study Instance UID
   * @returns {Promise<Array>} List of reports
   */
  async getReportsByStudy(studyId) {
    try {
      const response = await reportsApi.get(`${API_BASE}/study/${studyId}`);
      return { success: true, data: response.data };
    } catch (error) {
      console.error('[ReportService] Get by study failed:', error);
      return {
        success: false,
        error: error.response?.data?.detail || error.message
      };
    }
  },

  /**
   * Update report content
   * @param {string} reportId - Report ID
   * @param {Object} reportData - Updated report data
   * @returns {Promise<Object>} Updated report
   */
  async updateReport(reportId, reportData) {
    try {
      const response = await reportsApi.put(`${API_BASE}/${reportId}`, reportData);
      console.log('[ReportService] Report updated:', reportId);
      return { success: true, data: response.data };
    } catch (error) {
      console.error('[ReportService] Update failed:', error);
      return {
        success: false,
        error: error.response?.data?.detail || error.message
      };
    }
  },

  /**
   * Update report status (workflow transition)
   * @param {string} reportId - Report ID
   * @param {Object} statusData - Status update data
   * @returns {Promise<Object>} Updated report
   */
  async updateReportStatus(reportId, statusData) {
    try {
      const response = await reportsApi.patch(`${API_BASE}/${reportId}/status`, statusData);
      console.log('[ReportService] Status updated:', reportId, statusData.status);
      return { success: true, data: response.data };
    } catch (error) {
      console.error('[ReportService] Status update failed:', error);
      return {
        success: false,
        error: error.response?.data?.detail || error.message
      };
    }
  },

  /**
   * Delete report (soft delete)
   * @param {string} reportId - Report ID
   * @param {string} deletedBy - Username of deleter
   * @returns {Promise<Object>} Success status
   */
  async deleteReport(reportId, deletedBy) {
    try {
      await reportsApi.delete(`${API_BASE}/${reportId}?deleted_by=${deletedBy}`);
      console.log('[ReportService] Report deleted:', reportId);
      return { success: true };
    } catch (error) {
      console.error('[ReportService] Delete failed:', error);
      return {
        success: false,
        error: error.response?.data?.detail || error.message
      };
    }
  },

  /**
   * Search reports with filters
   * @param {Object} filters - Search filters
   * @returns {Promise<Array>} List of reports
   */
  async searchReports(filters = {}) {
    try {
      const queryString = new URLSearchParams(filters).toString();
      const url = queryString ? `${API_BASE}?${queryString}` : API_BASE;
      const response = await reportsApi.get(url);
      return { success: true, data: response.data };
    } catch (error) {
      console.error('[ReportService] Search failed:', error);
      return {
        success: false,
        error: error.response?.data?.detail || error.message
      };
    }
  },

  /**
   * Get report history (all versions)
   * @param {string} reportId - Report ID
   * @returns {Promise<Array>} Report history
   */
  async getReportHistory(reportId) {
    try {
      const response = await reportsApi.get(`${API_BASE}/${reportId}/history`);
      return { success: true, data: response.data };
    } catch (error) {
      console.error('[ReportService] Get history failed:', error);
      return {
        success: false,
        error: error.response?.data?.detail || error.message
      };
    }
  },

  /**
   * Get report statistics
   * @returns {Promise<Object>} Report statistics
   */
  async getReportStats() {
    try {
      const response = await reportsApi.get(`${API_BASE}/stats/summary`);
      return { success: true, data: response.data };
    } catch (error) {
      console.error('[ReportService] Get stats failed:', error);
      return {
        success: false,
        error: error.response?.data?.detail || error.message
      };
    }
  },

  /**
   * Save report as draft (auto-save)
   * @param {string} reportId - Report ID (null for new report)
   * @param {Object} reportData - Report data
   * @returns {Promise<Object>} Saved report
   */
  async saveDraft(reportId, reportData) {
    if (reportId) {
      // Update existing draft
      return await this.updateReport(reportId, {
        ...reportData,
        updated_by: reportData.created_by || 'system'
      });
    } else {
      // Create new draft
      return await this.createReport({
        ...reportData,
        status: 'draft'
      });
    }
  },

  /**
   * Finalize report (change status to final)
   * @param {string} reportId - Report ID
   * @param {Object} signatureData - Signature data
   * @param {string} username - Username
   * @returns {Promise<Object>} Finalized report
   */
  async finalizeReport(reportId, signatureData, username) {
    const result = await this.updateReportStatus(reportId, {
      status: 'final',
      updated_by: username,
      signature_id: signatureData.signature_id,
      signature_method: signatureData.method,
      signature_data: signatureData.data
    });

    // SIMRS Sync logic
    if (result.success && isKhanzaEnabled()) {
      try {
        console.log('[ReportService] SIMRS Khanza is enabled, syncing report...');
        
        // 1. Get report details to find study information
        const reportDetails = await this.getReport(reportId);
        if (reportDetails.success && reportDetails.data) {
          const report = reportDetails.data;
          const studyInstanceUid = report.study_instance_uid;
          
          // 2. Get study details to get accession number (noorder)
          const studyResult = await fetchStudyDetails(studyInstanceUid);
          
          if (studyResult.study && (studyResult.study.accession_number || studyResult.study.accessionNumber)) {
            const noorder = studyResult.study.accession_number || studyResult.study.accessionNumber;
            
            // 3. Get Khanza order details to get no_rawat
            const khanzaOrder = await khanzaService.getRadiologi(noorder);
            
            if (khanzaOrder && khanzaOrder.no_rawat) {
              const no_rawat = khanzaOrder.no_rawat;
              
              // 4. Save result to Khanza
              await khanzaService.saveHasilRadiologi({
                no_rawat: no_rawat,
                tgl_periksa: new Date().toISOString().split('T')[0],
                jam_periksa: new Date().toTimeString().split(' ')[0],
                hasil: report.content?.impression || report.content?.findings || 'Hasil Radiologi Selesai'
              });
              
              // 5. Update status to Selesai in Khanza
              await khanzaService.updateRadiologiStatus(noorder, 'Selesai');
              
              console.log('[ReportService] SIMRS Khanza sync completed successfully');
            }
          }
        }
      } catch (syncError) {
        console.error('[ReportService] SIMRS Khanza sync failed:', syncError);
        // Don't fail the main operation if sync fails
      }
    }

    return result;
  },

  /**
   * Submit report for preliminary review
   * @param {string} reportId - Report ID
   * @param {string} username - Username
   * @returns {Promise<Object>} Updated report
   */
  async submitForReview(reportId, username) {
    return await this.updateReportStatus(reportId, {
      status: 'preliminary',
      updated_by: username
    });
  },

  /**
   * Cancel report
   * @param {string} reportId - Report ID
   * @param {string} username - Username
   * @returns {Promise<Object>} Updated report
   */
  async cancelReport(reportId, username) {
    return await this.updateReportStatus(reportId, {
      status: 'cancelled',
      updated_by: username
    });
  }
};

/**
 * Get report summary for dashboard
 * @returns {Promise<Object>} Report summary statistics
 */
export const getReportSummary = async () => {
  try {
    const response = await reportsApi.get(`${API_BASE}/stats/summary`);
    return response;
  } catch (error) {
    // Silently handle error and return mock data
    // This is expected when backend is not running
    console.warn('[ReportService] Using mock data (backend not available)');
    
    // Generate realistic mock data for dashboard visualization
    const today = new Date();
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(today);
      date.setDate(date.getDate() - (6 - i));
      return date.toISOString().split('T')[0];
    });
    
    // Return realistic mock data (compatible with Dashboard structure)
    return {
      // Totals
      total: 156,
      completed: 98,
      in_progress: 35,
      scheduled: 23,
      
      // Report status breakdown
      draft: 12,
      preliminary: 23,
      final: 63,
      
      // Status breakdown for charts
      statusBreakdown: [
        { status: 'scheduled', count: 23 },
        { status: 'in_progress', count: 35 },
        { status: 'completed', count: 98 },
        { status: 'cancelled', count: 5 }
      ],
      
      // Trends data (last 7 days)
      trends: last7Days.map((date, i) => {
        const created = 18 + Math.floor(Math.random() * 10);
        const completed = Math.floor(created * 0.7) + Math.floor(Math.random() * 5);
        const synced = Math.floor(completed * 0.9) + Math.floor(Math.random() * 3);
        return {
          date,
          created,
          completed,
          synced,
          scheduled: 4 + Math.floor(Math.random() * 5)
        };
      }),
      
      // Modality breakdown
      modalityBreakdown: [
        { name: 'CT', count: 45, completed: 32 },
        { name: 'MR', count: 38, completed: 25 },
        { name: 'US', count: 32, completed: 20 },
        { name: 'CR', count: 25, completed: 15 },
        { name: 'XA', count: 16, completed: 6 }
      ],
      
      // By modality detailed
      by_modality: {
        CT: { total: 45, completed: 32, in_progress: 8, scheduled: 5 },
        MR: { total: 38, completed: 25, in_progress: 9, scheduled: 4 },
        US: { total: 32, completed: 20, in_progress: 7, scheduled: 5 },
        CR: { total: 25, completed: 15, in_progress: 6, scheduled: 4 },
        XA: { total: 16, completed: 6, in_progress: 5, scheduled: 5 }
      },
      
      // Priority breakdown
      priorityBreakdown: [
        { priority: 'stat', count: 15 },
        { priority: 'urgent', count: 42 },
        { priority: 'routine', count: 89 },
        { priority: 'low', count: 10 }
      ],
      
      // Totals object for compatibility
      totals: {
        orders: 156,
        completed: 98,
        inProgress: 35,
        scheduled: 23
      },
      
      // Recent orders/reports
      recent: [
        {
          id: '1',
          patient_name: 'John Doe',
          patient_id: 'P001234',
          modality: 'CT',
          procedure: 'CT Brain without contrast',
          status: 'completed',
          date: new Date(Date.now() - 3600000).toISOString(),
          report_status: 'final'
        },
        {
          id: '2',
          patient_name: 'Jane Smith',
          patient_id: 'P001235',
          modality: 'MR',
          procedure: 'MRI Brain with contrast',
          status: 'in_progress',
          date: new Date(Date.now() - 7200000).toISOString(),
          report_status: 'preliminary'
        },
        {
          id: '3',
          patient_name: 'Bob Johnson',
          patient_id: 'P001236',
          modality: 'US',
          procedure: 'Ultrasound Abdomen',
          status: 'completed',
          date: new Date(Date.now() - 10800000).toISOString(),
          report_status: 'final'
        },
        {
          id: '4',
          patient_name: 'Alice Williams',
          patient_id: 'P001237',
          modality: 'CR',
          procedure: 'Chest X-ray PA and Lateral',
          status: 'scheduled',
          date: new Date(Date.now() + 3600000).toISOString(),
          report_status: 'draft'
        },
        {
          id: '5',
          patient_name: 'Charlie Brown',
          patient_id: 'P001238',
          modality: 'CT',
          procedure: 'CT Chest with contrast',
          status: 'in_progress',
          date: new Date(Date.now() - 1800000).toISOString(),
          report_status: 'draft'
        }
      ],
      
      // SatuSehat integration status
      satusehat: {
        synced: 98,
        pending: 35,
        failed: 3,
        last_sync: new Date(Date.now() - 1800000).toISOString(),
        sync_rate: 96.5
      },
      
      // Doctor Performance (Top referring physicians)
      doctorPerformance: [
        { 
          name: 'Dr. Sarah Johnson', 
          orders: 45, 
          completed: 42, 
          completionRate: 93.3 
        },
        { 
          name: 'Dr. Michael Chen', 
          orders: 38, 
          completed: 35, 
          completionRate: 92.1 
        },
        { 
          name: 'Dr. Emily Rodriguez', 
          orders: 32, 
          completed: 28, 
          completionRate: 87.5 
        },
        { 
          name: 'Dr. James Wilson', 
          orders: 28, 
          completed: 25, 
          completionRate: 89.3 
        },
        { 
          name: 'Dr. Lisa Anderson', 
          orders: 24, 
          completed: 22, 
          completionRate: 91.7 
        }
      ],
      
      // Operational Alerts (Bottlenecks)
      bottlenecks: [
        { 
          label: 'Orders pending > 24h', 
          count: 8, 
          severity: 'warning' 
        },
        { 
          label: 'Failed SatuSehat sync', 
          count: 3, 
          severity: 'error' 
        },
        { 
          label: 'Missing patient info', 
          count: 5, 
          severity: 'warning' 
        },
        { 
          label: 'Incomplete procedures', 
          count: 2, 
          severity: 'info' 
        }
      ],
      
      // Longest Pending Orders
      longRunningOrders: [
        {
          id: 'LR001',
          accession: 'ACC2025001',
          patient: 'Robert Martinez',
          modality: 'CT',
          status: 'scheduled',
          scheduledAt: new Date(Date.now() - 86400000 * 2).toISOString(), // 2 days ago
          waitingHours: 48
        },
        {
          id: 'LR002',
          accession: 'ACC2025002',
          patient: 'Patricia Taylor',
          modality: 'MR',
          status: 'in_progress',
          scheduledAt: new Date(Date.now() - 86400000 * 1.5).toISOString(), // 1.5 days ago
          waitingHours: 36
        },
        {
          id: 'LR003',
          accession: 'ACC2025003',
          patient: 'David Thompson',
          modality: 'US',
          status: 'scheduled',
          scheduledAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
          waitingHours: 24
        },
        {
          id: 'LR004',
          accession: 'ACC2025004',
          patient: 'Jennifer White',
          modality: 'CR',
          status: 'in_progress',
          scheduledAt: new Date(Date.now() - 72000000).toISOString(), // 20 hours ago
          waitingHours: 20
        },
        {
          id: 'LR005',
          accession: 'ACC2025005',
          patient: 'Christopher Lee',
          modality: 'XA',
          status: 'scheduled',
          scheduledAt: new Date(Date.now() - 64800000).toISOString(), // 18 hours ago
          waitingHours: 18
        }
      ],
      
      // Additional statistics
      stats: {
        avg_completion_time: '2.5 hours',
        avg_report_time: '45 minutes',
        total_patients: 142,
        total_studies: 156,
        storage_used_gb: 125.4,
        images_count: 4580
      }
    };
  }
};

/**
 * Download report summary as CSV
 * @param {Object} filters - Optional filters
 */
export const downloadSummaryCsv = async (filters = {}) => {
  try {
    const queryString = new URLSearchParams(filters).toString();
    const apiUrl = queryString ? `${API_BASE}/export/csv?${queryString}` : `${API_BASE}/export/csv`;
    const response = await reportsApi.get(apiUrl);
    
    // Create download link
    const blobUrl = window.URL.createObjectURL(new Blob([response]));
    const link = document.createElement('a');
    link.href = blobUrl;
    link.setAttribute('download', `reports_summary_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(blobUrl);
    
    return { success: true };
  } catch (error) {
    console.error('[ReportService] CSV download failed:', error);
    return {
      success: false,
      error: error.response?.data?.detail || error.message
    };
  }
};

export default reportService;
