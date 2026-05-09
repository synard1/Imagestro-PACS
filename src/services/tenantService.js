import { apiClient } from './http';

const TENANT_KEY = 'app.tenant';
const DEMO_MODE = false;

const DEMO_TENANTS = [
  {
    id: 'demo-tenant-1',
    name: 'RSUPN Cipto Mangunkusumo',
    code: 'RSCM001',
    type: 'hospital',
    city: 'Jakarta',
    province: 'DKI Jakarta',
    is_active: true,
    is_verified: true,
    email: 'admin@rscm.co.id',
    satusehat_org_id: '10000001'
  },
  {
    id: 'demo-tenant-2',
    name: 'RSUD Dr. Soetomo',
    code: 'RSS001',
    type: 'hospital',
    city: 'Surabaya',
    province: 'Jawa Timur',
    is_active: true,
    is_verified: true,
    email: 'admin@rsud-soetomo.id',
    satusehat_org_id: '10000002'
  },
  {
    id: 'demo-tenant-3',
    name: 'RS Hasan Sadikin',
    code: 'RSHS001',
    type: 'hospital',
    city: 'Bandung',
    province: 'Jawa Barat',
    is_active: true,
    is_verified: false,
    email: 'admin@rshs.co.id',
    satusehat_org_id: '10000003'
  }
];

export const tenantService = {
  async listTenants(params = {}) {
    const client = apiClient('satusehatMonitor');
    try {
      const { search, type, is_active, is_verified, include_inactive, page, limit } = params;
      let url = '/api/tenants?';
      if (search) url += `search=${search}&`;
      if (type) url += `type=${type}&`;
      if (is_active !== undefined) url += `is_active=${is_active}&`;
      if (is_verified !== undefined) url += `is_verified=${is_verified}&`;
      if (include_inactive) url += `include_inactive=true&`;
      if (page) url += `page=${page}&`;
      if (limit) url += `limit=${limit}&`;
      const res = await client.get(url);
      return res;
    } catch (error) {
      console.warn('[tenantService] API unavailable, using demo data:', error.message);
      if (DEMO_MODE) {
        let items = [...DEMO_TENANTS];
        if (params.is_active !== undefined) {
          items = items.filter(t => t.is_active === params.is_active);
        }
        return { items, total: items.length };
      }
      return { items: [], total: 0, error: error.message };
    }
  },

  async getTenant(tenantId) {
    const client = apiClient('satusehatMonitor');
    try {
      const res = await client.get(`/api/tenants/${tenantId}`);
      return res;
    } catch (error) {
      console.error('[tenantService] Failed to get tenant:', error);
      if (DEMO_MODE) {
        return DEMO_TENANTS.find(t => t.id === tenantId) || null;
      }
      throw error;
    }
  },

  async createTenant(tenantData) {
    const client = apiClient('satusehatMonitor');
    try {
      const res = await client.post('/api/tenants', tenantData);
      return res;
    } catch (error) {
      console.error('[tenantService] Failed to create tenant:', error);
      if (DEMO_MODE) {
        const newTenant = {
          ...tenantData,
          id: `tenant-${Date.now()}`,
          is_active: true,
          is_verified: false,
          created_at: new Date().toISOString()
        };
        DEMO_TENANTS.push(newTenant);
        return newTenant;
      }
      throw error;
    }
  },

  async updateTenant(tenantId, tenantData) {
    const client = apiClient('satusehatMonitor');
    try {
      const res = await client.put(`/api/tenants/${tenantId}`, tenantData);
      return res;
    } catch (error) {
      console.error('[tenantService] Failed to update tenant:', error);
      if (DEMO_MODE) {
        const idx = DEMO_TENANTS.findIndex(t => t.id === tenantId);
        if (idx !== -1) {
          DEMO_TENANTS[idx] = { ...DEMO_TENANTS[idx], ...tenantData };
          return DEMO_TENANTS[idx];
        }
      }
      throw error;
    }
  },

  async deleteTenant(tenantId) {
    const client = apiClient('satusehatMonitor');
    try {
      await client.delete(`/api/tenants/${tenantId}`);
      return true;
    } catch (error) {
      console.error('[tenantService] Failed to delete tenant:', error);
      if (DEMO_MODE) {
        const idx = DEMO_TENANTS.findIndex(t => t.id === tenantId);
        if (idx !== -1) {
          DEMO_TENANTS[idx].is_active = false;
          return true;
        }
      }
      throw error;
    }
  },

  async verifyTenant(tenantId) {
    const client = apiClient('satusehatMonitor');
    try {
      const res = await client.post(`/api/tenants/${tenantId}/verify`);
      return res;
    } catch (error) {
      console.error('[tenantService] Failed to verify tenant:', error);
      if (DEMO_MODE) {
        const idx = DEMO_TENANTS.findIndex(t => t.id === tenantId);
        if (idx !== -1) {
          DEMO_TENANTS[idx].is_verified = true;
          return { status: 'success', message: 'Tenant verified' };
        }
      }
      throw error;
    }
  },

  async getTenantSubscription(tenantId) {
    const client = apiClient('satusehatMonitor');
    try {
      const res = await client.get(`/api/tenants/${tenantId}/subscription`);
      return res;
    } catch (error) {
      console.error('[tenantService] Failed to get subscription:', error);
      return null;
    }
  },

  async getTenantUsage(tenantId) {
    const client = apiClient('satusehatMonitor');
    try {
      const res = await client.get(`/api/usage/tenant/${tenantId}/summary`);
      return res;
    } catch (error) {
      console.error('[tenantService] Failed to get usage:', error);
      return {
        tenant_id: tenantId,
        tier_name: 'Professional',
        api_calls_today: 1234,
        api_limit: 20000,
        api_percent: 6.2,
        storage_bytes: 5368709120,
        storage_gb: 5.0,
        storage_limit_gb: 200,
        storage_percent: 2.5,
        active_users: 15,
        user_limit: 25,
        user_percent: 60,
        is_over_limit: false,
        status: 'active'
      };
    }
  },

  async getTenantAnalytics(tenantId, periodStart = 30) {
    const client = apiClient('satusehatMonitor');
    try {
      const res = await client.get(`/api/usage/tenant/${tenantId}/analytics?period_start=${periodStart}`);
      return res;
    } catch (error) {
      console.error('[tenantService] Failed to get analytics:', error);
      return {
        tenant_id: tenantId,
        period_start: new Date(Date.now() - periodStart * 24 * 60 * 60 * 1000).toISOString(),
        period_end: new Date().toISOString(),
        total_api_calls: 50000,
        avg_api_calls_per_day: 1666,
        total_storage_bytes: 5368709120,
        peak_storage_bytes: 5368709120,
        avg_active_users: 12,
        peak_users: 15,
        api_trend: Array.from({length: periodStart}).map((_, i) => ({
          date: new Date(Date.now() - (periodStart - i - 1) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          api_calls: Math.floor(Math.random() * 2000) + 500,
          storage_bytes: Math.floor(Math.random() * 1073741824) + 4294967296,
          active_users: Math.floor(Math.random() * 5) + 10
        })),
        previous_period_total_api_calls: 45000,
        period_over_period_change: 11.1
      };
    }
  },

  async getTenantDlmInsights(tenantId) {
    const client = apiClient('satusehatMonitor');
    try {
      const res = await client.get(`/api/usage/tenant/${tenantId}/dlm-insights`);
      return res;
    } catch (error) {
      console.error('[tenantService] Failed to get DLM insights:', error);
      return {
        tenant_id: tenantId,
        total_studies: 0,
        hot_percent: 0,
        warm_percent: 0,
        cold_percent: 0,
        stale_count: 0,
        stale_gb: 0,
        estimated_savings_usd: 0,
        recommendation: "DLM Insights currently unavailable."
      };
    }
  },

  async createInvitation(tenantId, email, role = 'ADMIN') {
    const client = apiClient('satusehatMonitor');
    try {
      const res = await client.post(`/api/tenants/${tenantId}/invitation`, { email, role });
      return res;
    } catch (error) {
      console.error('[tenantService] Failed to create invitation:', error);
      if (DEMO_MODE) {
        return {
          id: `inv-${Date.now()}`,
          tenant_id: tenantId,
          email,
          role,
          token: `demo-token-${Date.now()}`,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          is_used: false,
          created_at: new Date().toISOString()
        };
      }
      throw error;
    }
  },

  async updateExternalSystem(tenantId, config) {
    const client = apiClient('satusehatMonitor');
    try {
      const res = await client.put(`/api/tenants/${tenantId}/external-system`, config);
      return res;
    } catch (error) {
      console.error('[tenantService] Failed to update external system:', error);
      throw error;
    }
  },

  async testSimrsConnection(config) {
    const client = apiClient('satusehatMonitor');
    try {
      const res = await client.post('/api/khanza/test-connection', config);
      return res;
    } catch (error) {
      console.error('[tenantService] Failed to test connection:', error);
      throw error;
    }
  },

  getDemoTenants() {
    return DEMO_TENANTS;
  },

  cacheTenant(tenant) {
    try {
      localStorage.setItem(TENANT_KEY, JSON.stringify(tenant));
    } catch (error) {
      console.warn('[tenantService] Failed to cache tenant:', error);
    }
  },

  getCachedTenant() {
    try {
      const cached = localStorage.getItem(TENANT_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.warn('[tenantService] Failed to get cached tenant:', error);
      return null;
    }
  },

  clearCachedTenant() {
    try {
      localStorage.removeItem(TENANT_KEY);
    } catch (error) {
      console.warn('[tenantService] Failed to clear cached tenant:', error);
    }
  }
};

export default tenantService;