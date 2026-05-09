import { getConfig } from './config';
import { getAuthHeader } from './auth-storage';

/**
 * Service for handling data exports
 */
export const exportService = {
  /**
   * Export master data to Excel
   * @param {string} type - The type of data to export (doctors, modalities, insurance, procedure-mappings)
   * @returns {Promise<void>}
   */
  exportToExcel: async (type) => {
    const authHeader = getAuthHeader();
    
    // Construct the URL directly to the PACS service (port 8003) to avoid proxy issues
    // Using import.meta.env.VITE_PACS_API_URL or falling back to localhost:8003
    const pacsUrl = import.meta.env.VITE_PACS_API_URL || 'http://localhost:8003';
    const url = `${pacsUrl}/api/export/${type}`;
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          ...authHeader,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Export failed: ${response.status} ${errorText}`);
      }

      // Handle the blob response
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      
      // Get filename from header or use default
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `${type}_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
      
      if (contentDisposition && contentDisposition.includes('filename=')) {
        filename = contentDisposition.split('filename=')[1].replace(/["']/g, '');
      }
      
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error(`Error exporting ${type}:`, error);
      throw error;
    }
  }
};
