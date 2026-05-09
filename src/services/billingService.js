import { apiClient } from './http';

export const billingService = {
  /**
   * List invoices for the current tenant or all (if superadmin)
   */
  async listInvoices(params = {}) {
    const client = apiClient('satusehatMonitor');
    const { tenant_id, status, page = 1, limit = 20 } = params;
    let url = `/api/billing/invoices?page=${page}&limit=${limit}`;
    if (tenant_id) url += `&tenant_id=${tenant_id}`;
    if (status) url += `&status=${status}`;
    
    return await client.get(url);
  },

  /**
   * Get specific invoice details
   */
  async getInvoice(id) {
    const client = apiClient('satusehatMonitor');
    return await client.get(`/api/billing/invoices/${id}`);
  },

  /**
   * Create a new invoice (Superadmin only)
   */
  async createInvoice(payload) {
    const client = apiClient('satusehatMonitor');
    return await client.post('/api/billing/invoices', payload);
  },

  /**
   * Record a payment (Superadmin only or via webhook)
   */
  async recordPayment(payload) {
    const client = apiClient('satusehatMonitor');
    return await client.post('/api/billing/payments', payload);
  },

  /**
   * Get PDF URL for an invoice
   */
  getInvoicePdfUrl(id) {
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8003';
    return `${baseUrl}/api/billing/invoices/${id}/pdf`;
  },

  /**
   * List available discounts
   */
  async listDiscounts() {
    const client = apiClient('satusehatMonitor');
    return await client.get('/api/billing/discounts');
  },

  /**
   * Create a discount code
   */
  async createDiscount(payload) {
    const client = apiClient('satusehatMonitor');
    return await client.post('/api/billing/discounts', payload);
  }
};
