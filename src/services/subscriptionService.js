import { apiClient } from './http';

const SUBSCRIPTION_KEY = 'app.subscription';

const DEMO_PRODUCTS = [
  {
    id: 'prod-free',
    name: 'Free Trial',
    code: 'free-tier',
    tier: 'free',
    description: 'Ideal for testing and small clinics',
    price: 0,
    currency: 'IDR',
    billing_cycle: 'monthly',
    max_users: 5,
    max_storage_gb: 10,
    max_api_calls_per_day: 1000,
    features: ['basic_mwl', 'basic_orders', '5_users'],
    is_active: true,
    is_featured: false,
    color: '#64748b',
    sort_order: 1
  },
  {
    id: 'prod-basic',
    name: 'Basic PACS',
    code: 'basic-tier',
    tier: 'basic',
    description: 'Standard features for growing imaging centers',
    price: 1500000,
    currency: 'IDR',
    billing_cycle: 'monthly',
    max_users: 10,
    max_storage_gb: 50,
    max_api_calls_per_day: 5000,
    features: ['full_mwl', 'full_orders', 'dicom_viewer', '10_users', 'email_support'],
    is_active: true,
    is_featured: false,
    color: '#3b82f6',
    sort_order: 2
  },
  {
    id: 'prod-pro',
    name: 'Professional',
    code: 'pro-tier',
    tier: 'professional',
    description: 'Advanced analytics and full SatuSehat integration',
    price: 3500000,
    currency: 'IDR',
    billing_cycle: 'monthly',
    max_users: 25,
    max_storage_gb: 200,
    max_api_calls_per_day: 20000,
    features: ['full_mwl', 'full_orders', 'dicom_viewer', 'advanced_reports', 'satusehat_integration', 'api_access', '25_users', 'priority_support'],
    is_active: true,
    is_featured: true,
    color: '#8b5cf6',
    sort_order: 3
  },
  {
    id: 'prod-ent',
    name: 'Enterprise',
    code: 'ent-tier',
    tier: 'enterprise',
    description: 'Unlimited power for hospital networks',
    price: 10000000,
    currency: 'IDR',
    billing_cycle: 'monthly',
    max_users: null,
    max_storage_gb: null,
    max_api_calls_per_day: null,
    features: ['full_mwl', 'full_orders', 'dicom_viewer', 'advanced_reports', 'satusehat_integration', 'api_access', 'hl7_integration', 'multi_modality', 'unlimited_users', 'dedicated_support'],
    is_active: true,
    is_featured: false,
    color: '#f59e0b',
    sort_order: 4
  }
];

const DEMO_SUBSCRIPTIONS = [
  {
    id: 'sub-1',
    tenant_id: 'demo-tenant-1',
    product_id: 'prod-pro',
    status: 'active',
    started_at: '2025-01-01T00:00:00Z',
    expires_at: '2026-12-31T23:59:59Z',
    auto_renew: true,
    is_active: true,
    product: DEMO_PRODUCTS[2]
  },
  {
    id: 'sub-2',
    tenant_id: 'demo-tenant-2',
    product_id: 'prod-basic',
    status: 'active',
    started_at: '2025-06-01T00:00:00Z',
    expires_at: '2026-05-31T23:59:59Z',
    auto_renew: true,
    is_active: true,
    product: DEMO_PRODUCTS[1]
  },
  {
    id: 'sub-3',
    tenant_id: 'demo-tenant-3',
    product_id: 'prod-free',
    status: 'trial',
    started_at: '2026-04-01T00:00:00Z',
    expires_at: '2026-05-01T00:00:00Z',
    auto_renew: false,
    is_active: true,
    product: DEMO_PRODUCTS[0]
  }
];

export const subscriptionService = {
  async listProducts(includeInactive = false) {
    const client = apiClient('satusehatMonitor');
    try {
      const res = await client.get(`/api/subscriptions/products?include_inactive=${includeInactive}`);
      return res;
    } catch (error) {
      console.warn('[subscriptionService] API unavailable, using demo products:', error.message);
      const products = includeInactive ? DEMO_PRODUCTS : DEMO_PRODUCTS.filter(p => p.is_active);
      return { items: products, total: products.length };
    }
  },

  async getProduct(productId) {
    const client = apiClient('satusehatMonitor');
    try {
      const res = await client.get(`/api/subscriptions/products/${productId}`);
      return res;
    } catch (error) {
      console.error('[subscriptionService] Failed to get product:', error);
      const product = DEMO_PRODUCTS.find(p => p.id === productId);
      if (product) return product;
      throw error;
    }
  },

  async createProduct(productData) {
    const client = apiClient('satusehatMonitor');
    try {
      const res = await client.post('/api/subscriptions/products', productData);
      return res;
    } catch (error) {
      console.error('[subscriptionService] Failed to create product:', error);
      throw error;
    }
  },

  async updateProduct(productId, productData) {
    const client = apiClient('satusehatMonitor');
    try {
      const res = await client.put(`/api/subscriptions/products/${productId}`, productData);
      return res;
    } catch (error) {
      console.error('[subscriptionService] Failed to update product:', error);
      throw error;
    }
  },

  async deleteProduct(productId) {
    const client = apiClient('satusehatMonitor');
    try {
      await client.delete(`/api/subscriptions/products/${productId}`);
      return true;
    } catch (error) {
      console.error('[subscriptionService] Failed to delete product:', error);
      throw error;
    }
  },

  async listSubscriptions(tenantId = null, status = null, withDetails = false) {
    const client = apiClient('satusehatMonitor');
    try {
      let url = withDetails ? '/api/subscriptions/with-details?' : '/api/subscriptions?';
      if (tenantId) url += `tenant_id=${tenantId}&`;
      if (status) url += `status=${status}&`;
      const res = await client.get(url);
      return res;
    } catch (error) {
      console.warn('[subscriptionService] API unavailable, using demo subscriptions:', error.message);
      let subs = [...DEMO_SUBSCRIPTIONS];
      if (tenantId) subs = subs.filter(s => s.tenant_id === tenantId);
      if (status) subs = subs.filter(s => s.status === status);
      return { items: subs, total: subs.length };
    }
  },

  async getMySubscription() {
    const client = apiClient('satusehatMonitor');
    try {
      const res = await client.get('/api/subscriptions/my');
      return res;
    } catch (error) {
      console.error('[subscriptionService] Failed to get my subscription:', error);
      // Fallback for demo: use first demo subscription
      return DEMO_SUBSCRIPTIONS[0];
    }
  },

  async getMyUsage() {
    const client = apiClient('satusehatMonitor');
    try {
      const res = await client.get('/api/subscriptions/my/usage');
      return res;
    } catch (error) {
      console.error('[subscriptionService] Failed to get my usage:', error);
      return {
        storage_bytes: 5368709120,
        api_calls_today: 1234,
        storage_limit_gb: 200,
        api_limit_per_day: 20000,
        tier_name: 'Professional',
        status: 'active'
      };
    }
  },

  async getMyInvoices() {
    const client = apiClient('satusehatMonitor');
    try {
      const res = await client.get('/api/subscriptions/my/invoices');
      return res;
    } catch (error) {
      console.error('[subscriptionService] Failed to get my invoices:', error);
      return { items: [], total: 0 };
    }
  },

  async getSubscription(subscriptionId) {
    const client = apiClient('satusehatMonitor');
    try {
      const res = await client.get(`/api/subscriptions/${subscriptionId}`);
      return res;
    } catch (error) {
      console.error('[subscriptionService] Failed to get subscription:', error);
      const sub = DEMO_SUBSCRIPTIONS.find(s => s.id === subscriptionId);
      if (sub) return sub;
      throw error;
    }
  },

  async createSubscription(subscriptionData) {
    const client = apiClient('satusehatMonitor');
    try {
      const res = await client.post('/api/subscriptions', subscriptionData);
      return res;
    } catch (error) {
      console.error('[subscriptionService] Failed to create subscription:', error);
      throw error;
    }
  },

  async updateSubscription(subscriptionId, subscriptionData) {
    const client = apiClient('satusehatMonitor');
    try {
      const res = await client.put(`/api/subscriptions/${subscriptionId}`, subscriptionData);
      return res;
    } catch (error) {
      console.error('[subscriptionService] Failed to update subscription:', error);
      throw error;
    }
  },

  async cancelSubscription(subscriptionId) {
    const client = apiClient('satusehatMonitor');
    try {
      await client.delete(`/api/subscriptions/${subscriptionId}`);
      return true;
    } catch (error) {
      console.error('[subscriptionService] Failed to cancel subscription:', error);
      throw error;
    }
  },

  async getUsage(tenantId) {
    const client = apiClient('satusehatMonitor');
    try {
      const res = await client.get(`/api/subscriptions/usage/${tenantId}`);
      return res;
    } catch (error) {
      console.error('[subscriptionService] Failed to get usage:', error);
      return {
        tenant_id: tenantId,
        storage_bytes: 5368709120,
        api_calls_today: 1234,
        storage_limit_gb: 200,
        api_limit_per_day: 20000,
        tier_name: 'Professional',
        status: 'active'
      };
    }
  },

  async renewSubscription(subscriptionId) {
    const client = apiClient('satusehatMonitor');
    try {
      const res = await client.post(`/api/subscriptions/${subscriptionId}/renew`);
      return res;
    } catch (error) {
      console.error('[subscriptionService] Failed to renew subscription:', error);
      throw error;
    }
  },

  async seedProducts() {
    const client = apiClient('satusehatMonitor');
    try {
      const res = await client.post('/api/subscriptions/seed-products');
      return res;
    } catch (error) {
      console.error('[subscriptionService] Failed to seed products:', error);
      throw error;
    }
  },

  getDemoProducts() {
    return DEMO_PRODUCTS;
  },

  getDemoSubscriptions() {
    return DEMO_SUBSCRIPTIONS;
  },

  cacheSubscription(subscription) {
    try {
      localStorage.setItem(SUBSCRIPTION_KEY, JSON.stringify(subscription));
    } catch (error) {
      console.warn('[subscriptionService] Failed to cache subscription:', error);
    }
  },

  getCachedSubscription() {
    try {
      const cached = localStorage.getItem(SUBSCRIPTION_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.warn('[subscriptionService] Failed to get cached subscription:', error);
      return null;
    }
  },

  clearCachedSubscription() {
    try {
      localStorage.removeItem(SUBSCRIPTION_KEY);
    } catch (error) {
      console.warn('[subscriptionService] Failed to clear cached subscription:', error);
    }
  },

  isFeatureEnabledForTier(featureName, productTier = 'free') {
    const tierFeatures = {
      free: ['basic_mwl', 'basic_orders', '5_users'],
      basic: ['full_mwl', 'full_orders', 'dicom_viewer', '10_users', 'email_support'],
      professional: ['full_mwl', 'full_orders', 'dicom_viewer', 'advanced_reports', 
                   'satusehat_integration', 'api_access', '25_users', 'priority_support'],
      enterprise: ['full_mwl', 'full_orders', 'dicom_viewer', 'advanced_reports',
                   'satusehat_integration', 'api_access', 'hl7_integration',
                   'multi_modality', 'unlimited_users', 'dedicated_support']
    };

    const features = tierFeatures[productTier] || tierFeatures.free;
    return features.includes(featureName);
  },

  getTierLimit(limitType, productTier = 'free') {
    const tierLimits = {
      free: { max_users: 5, max_storage_gb: 10, max_api_calls_per_day: 1000 },
      basic: { max_users: 10, max_storage_gb: 50, max_api_calls_per_day: 5000 },
      professional: { max_users: 25, max_storage_gb: 200, max_api_calls_per_day: 20000 },
      enterprise: { max_users: null, max_storage_gb: null, max_api_calls_per_day: null }
    };

    const limits = tierLimits[productTier] || tierLimits.free;
    return limits[limitType];
  }
};