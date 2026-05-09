/**
 * MWL UI - Frontend JavaScript
 * Modality Worklist Management System
 */

class MWLApp {
  constructor() {
    this.config = {};
    this.currentPage = 0;
    this.pageSize = 50;
    this.totalItems = 0;
    this.worklistData = [];
    this.currentFilters = {};
    this.authToken = null;
    
    this.init();
  }

  async init() {
    try {
      await this.loadConfig();
      await this.checkAuth();
      await this.loadStatistics();
      await this.loadWorklist();
      this.setupEventListeners();
      this.setDefaultDates();
    } catch (error) {
      console.error('Initialization error:', error);
      this.showError('Failed to initialize application');
    }
  }

  async loadConfig() {
    try {
      const response = await fetch('/config');
      this.config = await response.json();
    } catch (error) {
      console.error('Config loading error:', error);
      this.config = { gateway_base: '', service_name: 'MWL UI', version: '1.0.0' };
    }
  }

  async checkAuth() {
    // For now, we'll use a simple token check
    // In production, implement proper authentication
    this.authToken = localStorage.getItem('auth_token');
    if (!this.authToken) {
      // For demo purposes, we'll continue without auth
      // In production, redirect to login
      console.warn('No authentication token found');
    }
  }

  getAuthHeaders() {
    const headers = {
      'Content-Type': 'application/json'
    };
    
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }
    
    return headers;
  }

  async apiRequest(url, options = {}) {
    const defaultOptions = {
      headers: this.getAuthHeaders(),
      ...options
    };

    try {
      const response = await fetch(url, defaultOptions);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }
      
      return await response.text();
    } catch (error) {
      console.error('API request error:', error);
      throw error;
    }
  }

  async loadStatistics() {
    try {
      const stats = await this.apiRequest('/api/statistics');
      this.updateStatistics(stats);
    } catch (error) {
      console.error('Statistics loading error:', error);
      this.showError('Failed to load statistics');
    }
  }

  updateStatistics(stats) {
    const overview = stats.overview || {};
    
    document.getElementById('totalItems').textContent = overview.total_items || 0;
    document.getElementById('scheduledItems').textContent = overview.scheduled || 0;
    document.getElementById('inProgressItems').textContent = overview.in_progress || 0;
    document.getElementById('completedItems').textContent = overview.completed || 0;
  }

  async loadWorklist() {
    try {
      this.showLoading(true);
      
      const params = new URLSearchParams({
        limit: this.pageSize,
        offset: this.currentPage * this.pageSize,
        ...this.currentFilters
      });

      const worklist = await this.apiRequest(`/api/worklist?${params}`);
      this.worklistData = worklist;
      this.renderWorklist();
      this.updatePagination();
      
    } catch (error) {
      console.error('Worklist loading error:', error);
      this.showError('Failed to load worklist');
      this.showEmptyState();
    } finally {
      this.showLoading(false);
    }
  }

  renderWorklist() {
    const tbody = document.getElementById('worklistTableBody');
    tbody.innerHTML = '';

    if (!this.worklistData || this.worklistData.length === 0) {
      this.showEmptyState();
      return;
    }

    this.hideEmptyState();

    this.worklistData.forEach(item => {
      const row = this.createWorklistRow(item);
      tbody.appendChild(row);
    });

    this.updateItemCount();
  }

  createWorklistRow(item) {
    const row = document.createElement('tr');
    
    const statusClass = this.getStatusClass(item.study_status);
    const modalityBadge = `<span class="modality-badge">${item.modality}</span>`;
    const statusBadge = `<span class="status-badge ${statusClass}">${item.study_status}</span>`;
    
    row.innerHTML = `
      <td><strong>${item.accession_number}</strong></td>
      <td>${item.patient_id}</td>
      <td>${item.patient_name}</td>
      <td>${modalityBadge}</td>
      <td>${this.formatDate(item.scheduled_procedure_step_start_date)}</td>
      <td>${this.formatTime(item.scheduled_procedure_step_start_time)}</td>
      <td><code>${item.scheduled_station_aet}</code></td>
      <td>${statusBadge}</td>
      <td>
        <div class="flex gap-2">
          <button class="btn btn-secondary btn-sm" onclick="app.viewItem('${item.accession_number}')">
            👁️ View
          </button>
          <button class="btn btn-primary btn-sm" onclick="app.editItem('${item.accession_number}')">
            ✏️ Edit
          </button>
        </div>
      </td>
    `;

    return row;
  }

  getStatusClass(status) {
    const statusMap = {
      'SCHEDULED': 'status-scheduled',
      'IN_PROGRESS': 'status-in-progress',
      'COMPLETED': 'status-completed',
      'CANCELLED': 'status-cancelled'
    };
    return statusMap[status] || 'status-scheduled';
  }

  formatDate(dateString) {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('id-ID');
    } catch {
      return dateString;
    }
  }

  formatTime(timeString) {
    if (!timeString) return '-';
    try {
      // Handle both full datetime and time-only strings
      if (timeString.includes('T')) {
        const date = new Date(timeString);
        return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      } else {
        // Assume it's already in HH:MM format
        return timeString.substring(0, 5);
      }
    } catch {
      return timeString;
    }
  }

  async viewItem(accessionNumber) {
    try {
      const item = await this.apiRequest(`/api/worklist/${accessionNumber}`);
      this.showItemDetails(item);
    } catch (error) {
      console.error('Error viewing item:', error);
      this.showError('Failed to load item details');
    }
  }

  async editItem(accessionNumber) {
    try {
      const item = await this.apiRequest(`/api/worklist/${accessionNumber}`);
      this.showUpdateModal(item);
    } catch (error) {
      console.error('Error loading item for edit:', error);
      this.showError('Failed to load item for editing');
    }
  }

  showItemDetails(item) {
    const details = `
      <div class="item-details">
        <h3>Worklist Item Details</h3>
        <div class="details-grid">
          <div><strong>Accession Number:</strong> ${item.accession_number}</div>
          <div><strong>Patient ID:</strong> ${item.patient_id}</div>
          <div><strong>Patient Name:</strong> ${item.patient_name}</div>
          <div><strong>Birth Date:</strong> ${this.formatDate(item.patient_birth_date)}</div>
          <div><strong>Sex:</strong> ${item.patient_sex || '-'}</div>
          <div><strong>Study UID:</strong> ${item.study_instance_uid}</div>
          <div><strong>Study Description:</strong> ${item.study_description || '-'}</div>
          <div><strong>Modality:</strong> ${item.modality}</div>
          <div><strong>Scheduled Date:</strong> ${this.formatDate(item.scheduled_procedure_step_start_date)}</div>
          <div><strong>Scheduled Time:</strong> ${this.formatTime(item.scheduled_procedure_step_start_time)}</div>
          <div><strong>Station AET:</strong> ${item.scheduled_station_aet}</div>
          <div><strong>Performing Physician:</strong> ${item.scheduled_performing_physician || '-'}</div>
          <div><strong>Procedure Description:</strong> ${item.requested_procedure_description || '-'}</div>
          <div><strong>Status:</strong> <span class="status-badge ${this.getStatusClass(item.study_status)}">${item.study_status}</span></div>
        </div>
      </div>
    `;
    
    this.showModal('Item Details', details);
  }

  showUpdateModal(item) {
    document.getElementById('updateAccessionNumber').value = item.accession_number;
    document.getElementById('updatePatientName').value = item.patient_name;
    document.getElementById('updateStatus').value = item.study_status;
    
    // Set current date/time as defaults for performed fields if status is changing to IN_PROGRESS or COMPLETED
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentTime = now.toTimeString().split(' ')[0].substring(0, 5);
    
    if (item.study_status === 'SCHEDULED') {
      document.getElementById('updatePerformedStartDate').value = today;
      document.getElementById('updatePerformedStartTime').value = currentTime;
    }
    
    document.getElementById('updateModal').hidden = false;
  }

  async saveUpdate() {
    try {
      const accessionNumber = document.getElementById('updateAccessionNumber').value;
      const updateData = {
        study_status: document.getElementById('updateStatus').value,
        performed_procedure_step_start_date: document.getElementById('updatePerformedStartDate').value || null,
        performed_procedure_step_start_time: document.getElementById('updatePerformedStartTime').value || null,
        performed_procedure_step_end_date: document.getElementById('updatePerformedEndDate').value || null,
        performed_procedure_step_end_time: document.getElementById('updatePerformedEndTime').value || null
      };

      await this.apiRequest(`/api/worklist/${accessionNumber}`, {
        method: 'PUT',
        body: JSON.stringify(updateData)
      });

      this.showSuccess('Worklist item updated successfully');
      this.closeUpdateModal();
      await this.loadWorklist();
      await this.loadStatistics();
      
    } catch (error) {
      console.error('Update error:', error);
      this.showError('Failed to update worklist item');
    }
  }

  closeUpdateModal() {
    document.getElementById('updateModal').hidden = true;
  }

  applyFilters() {
    this.currentFilters = {
      patient_id: document.getElementById('filterPatientId').value,
      patient_name: document.getElementById('filterPatientName').value,
      accession_number: document.getElementById('filterAccessionNumber').value,
      modality: document.getElementById('filterModality').value,
      date_from: document.getElementById('filterDateFrom').value,
      date_to: document.getElementById('filterDateTo').value,
      status: document.getElementById('filterStatus').value,
      station_aet: document.getElementById('filterStationAet').value
    };

    // Remove empty filters
    Object.keys(this.currentFilters).forEach(key => {
      if (!this.currentFilters[key]) {
        delete this.currentFilters[key];
      }
    });

    this.currentPage = 0;
    this.loadWorklist();
  }

  clearFilters() {
    document.getElementById('filterPatientId').value = '';
    document.getElementById('filterPatientName').value = '';
    document.getElementById('filterAccessionNumber').value = '';
    document.getElementById('filterModality').value = '';
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value = '';
    document.getElementById('filterStatus').value = '';
    document.getElementById('filterStationAet').value = '';
    
    this.currentFilters = {};
    this.currentPage = 0;
    this.loadWorklist();
  }

  setDefaultDates() {
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    document.getElementById('filterDateFrom').value = weekAgo.toISOString().split('T')[0];
    document.getElementById('filterDateTo').value = today.toISOString().split('T')[0];
  }

  async refreshData() {
    await Promise.all([
      this.loadStatistics(),
      this.loadWorklist()
    ]);
    this.showSuccess('Data refreshed successfully');
  }

  async refreshWorklist() {
    await this.loadWorklist();
    this.showSuccess('Worklist refreshed');
  }

  async exportWorklist() {
    try {
      const params = new URLSearchParams({
        limit: 10000, // Large limit for export
        ...this.currentFilters
      });

      const data = await this.apiRequest(`/api/worklist?${params}`);
      this.downloadCSV(data, 'worklist_export.csv');
      this.showSuccess('Worklist exported successfully');
      
    } catch (error) {
      console.error('Export error:', error);
      this.showError('Failed to export worklist');
    }
  }

  downloadCSV(data, filename) {
    if (!data || data.length === 0) {
      this.showError('No data to export');
      return;
    }

    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(header => `"${row[header] || ''}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  showStatistics() {
    // This could open a detailed statistics modal
    this.showInfo('Detailed statistics feature coming soon!');
  }

  previousPage() {
    if (this.currentPage > 0) {
      this.currentPage--;
      this.loadWorklist();
    }
  }

  nextPage() {
    this.currentPage++;
    this.loadWorklist();
  }

  updatePagination() {
    const start = this.currentPage * this.pageSize + 1;
    const end = Math.min((this.currentPage + 1) * this.pageSize, this.worklistData.length);
    
    document.getElementById('paginationStart').textContent = start;
    document.getElementById('paginationEnd').textContent = end;
    document.getElementById('paginationTotal').textContent = this.worklistData.length;
    
    document.getElementById('prevPage').disabled = this.currentPage === 0;
    document.getElementById('nextPage').disabled = this.worklistData.length < this.pageSize;
    
    document.getElementById('pagination').hidden = this.worklistData.length === 0;
  }

  updateItemCount() {
    const count = this.worklistData.length;
    const text = count === 1 ? '1 item' : `${count} items`;
    document.getElementById('itemCount').textContent = text;
  }

  showLoading(show) {
    document.getElementById('loadingState').hidden = !show;
    document.getElementById('worklistTableBody').style.display = show ? 'none' : '';
  }

  showEmptyState() {
    document.getElementById('emptyState').hidden = false;
    document.getElementById('pagination').hidden = true;
    document.getElementById('itemCount').textContent = '0 items';
  }

  hideEmptyState() {
    document.getElementById('emptyState').hidden = true;
  }

  setupEventListeners() {
    // Enter key support for filters
    const filterInputs = document.querySelectorAll('.form-input, .form-select');
    filterInputs.forEach(input => {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.applyFilters();
        }
      });
    });

    // Auto-apply filters on select change
    const selectInputs = document.querySelectorAll('.form-select');
    selectInputs.forEach(select => {
      select.addEventListener('change', () => {
        this.applyFilters();
      });
    });

    // Modal close on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeUpdateModal();
      }
    });

    // Modal close on overlay click
    document.getElementById('updateModal').addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-overlay')) {
        this.closeUpdateModal();
      }
    });
  }

  showModal(title, content) {
    // Create a simple modal for displaying information
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title">${title}</h3>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
        </div>
        <div class="modal-body">
          ${content}
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  showSuccess(message) {
    this.showNotification(message, 'success');
  }

  showError(message) {
    this.showNotification(message, 'error');
  }

  showInfo(message) {
    this.showNotification(message, 'info');
  }

  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 16px 24px;
      border-radius: 8px;
      color: white;
      font-weight: 500;
      z-index: 10000;
      max-width: 400px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
      animation: slideIn 0.3s ease-out;
    `;

    const colors = {
      success: '#2ecc71',
      error: '#e74c3c',
      info: '#3498db',
      warning: '#f39c12'
    };

    notification.style.background = colors[type] || colors.info;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease-in forwards';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
}

// Global functions for onclick handlers
function refreshData() {
  app.refreshData();
}

function refreshWorklist() {
  app.refreshWorklist();
}

function applyFilters() {
  app.applyFilters();
}

function clearFilters() {
  app.clearFilters();
}

function exportWorklist() {
  app.exportWorklist();
}

function showStatistics() {
  app.showStatistics();
}

function previousPage() {
  app.previousPage();
}

function nextPage() {
  app.nextPage();
}

function closeUpdateModal() {
  app.closeUpdateModal();
}

function saveUpdate() {
  app.saveUpdate();
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(100%);
      opacity: 0;
    }
  }

  .details-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;
    margin-top: 16px;
  }

  .details-grid > div {
    padding: 8px 0;
    border-bottom: 1px solid var(--border-color);
  }

  .details-grid > div:last-child {
    border-bottom: none;
  }
`;
document.head.appendChild(style);

// Initialize the application
const app = new MWLApp();