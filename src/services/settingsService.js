import { apiClient } from './http';
import { getAuthHeader } from './auth-storage';
import { loadRegistry, saveRegistry, DEFAULT_REGISTRY } from './api-registry';

// Gateway configuration for settings service
// Using proxy URL for development
const SETTINGS_GATEWAY_URL = '/backend-api';

// Helper to access local data server (upload server) for settings fallback
function localSettingsClient() {
  // satusehatMonitor module is configured to /backend-api by default
  // and exposes /api/* endpoints on the local dev server.
  return apiClient('satusehatMonitor');
}

async function getLocalSetting(key) {
  const client = localSettingsClient();
  const list = await client.get('/api/settings');
  if (Array.isArray(list)) {
    const item = list.find((it) => it && (it.id === key || it.key === key));
    return item || null;
  }
  return null;
}

async function upsertLocalSetting(key, value, description = '') {
  const client = localSettingsClient();
  const existing = await getLocalSetting(key);
  if (existing && (existing.id || existing.key)) {
    const id = existing.id || existing.key || key;
    const payload = { ...existing, id, key, value, description, updatedAt: new Date().toISOString() };
    return await client.put(`/api/settings/${encodeURIComponent(id)}`, payload);
  }
  const payload = { id: key, key, value, description, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  return await client.post('/api/settings', payload);
}
const SETTINGS_PERMISSION = 'setting:read';

// Default local settings as fallback
const DEFAULT_SETTINGS = {
  backendEnabled: false,
  apiBaseUrl: '', // Empty - use direct /api paths (proxied by Vite)
  timeoutMs: 6000,
  healthIntervalMs: 15000,
  modalities: ['US','CT','MR','DR','OT','SC','SR','RF','NM','CR','XA','MG'],
  
  // Patient Data Management
  patientDataValidation: true,
  patientDataEncryption: false,
  autoSaveInterval: 5,
  dataRetentionDays: 365,
  
  // User Permissions Management
  rbacEnabled: true,
  permissionCaching: true,
  permissionCacheTTL: 60,
  sessionTimeout: 30,
  
  // Data Synchronization
  autoSync: true,
  conflictResolution: true,
  syncInterval: 10,
  offlineBufferSize: 100,

  // Worklist Widget Configuration
  worklistWidget: {
    enabled: true,
    useBackendApi: true,
    apiUrl: `${import.meta.env.VITE_MAIN_API_BACKEND_URL || ''}/api/worklist`,
    refreshInterval: 30000,
    maxItems: 10,
    autoRefresh: true
  },

  // Floating Worklist Widget Configuration
  floatingWorklistWidget: {
    enabled: true
  },

  // Accession number generation mode
  // false = client-side (legacy); true = accession-worker (Cloudflare Worker + D1)
  useServerAccession: false
};

/**
 * Get settings from backend API with fallback to local settings
 * @param {Object} options
 * @param {boolean} options.refresh - force bypass cache
 * @param {number} options.cacheTtlMs - override cache ttl
 * @returns {Promise<Object>} Settings object
 */
export async function getSettings(options = {}) {
  const { refresh = false, cacheTtlMs = SETTINGS_CACHE_TTL_MS } = options || {};
  if (!refresh && isSettingsCacheValid(cacheTtlMs)) {
    const cached = { ...DEFAULT_SETTINGS, ...(_cacheAppConfig.value || {}) };
    // Ensure apiBaseUrl is never /backend-api
    if (cached.apiBaseUrl === '/backend-api') {
      cached.apiBaseUrl = '';
    }
    return cached;
  }
  try {
    // Try to get settings from backend API (deduplicated)
    const settings = await fetchSettingsWithDedup({ refresh });
    const result = { ...DEFAULT_SETTINGS, ...settings };
    // Ensure apiBaseUrl is never /backend-api
    if (result.apiBaseUrl === '/backend-api') {
      result.apiBaseUrl = '';
    }
    return result;
  } catch (error) {
    console.warn('Failed to fetch settings from backend, using local settings:', error);
    if (!refresh && _cacheAppConfig) {
      const cached = { ...DEFAULT_SETTINGS, ...(_cacheAppConfig.value || {}) };
      // Ensure apiBaseUrl is never /backend-api
      if (cached.apiBaseUrl === '/backend-api') {
        cached.apiBaseUrl = '';
      }
      return cached;
    }
    // Fallback to local settings
    const local = getLocalSettings();
    // Ensure apiBaseUrl is never /backend-api
    if (local.apiBaseUrl === '/backend-api') {
      local.apiBaseUrl = '';
    }
    return local;
  }
}
/**
 * Get settings strictly from backend API (no local fallback)
 * @returns {Promise<Object>} Settings object from backend
 */
export async function getSettingsStrict(options = {}) {
  const { refresh = false, cacheTtlMs = SETTINGS_CACHE_TTL_MS } = options || {};
  if (!refresh && isSettingsCacheValid(cacheTtlMs)) return _cacheAppConfig.value;
  const value = await fetchSettingsWithDedup({ refresh });
  return value;
}

// ---------------- Accession Config (separate backend key) ----------------

const DEFAULT_ACCESSION = {
  pattern: '{ORG}-{YYYY}{MM}{DD}-{SEQ4}',
  resetPolicy: 'daily',
  seqPadding: 4,
  orgCode: 'RS01',
  siteCode: 'RAD',
  useModalityInSeqScope: false,
  allowedSeparators: ['-','_','/']
};
// In-memory caches for settings
let _cacheAppConfig = null; // { value, updatedAt }
let _cacheAccession = null; // { value (UI-mapped), backendUpdatedAt }
const SETTINGS_CACHE_TTL_MS = 30 * 1000;
let _settingsFetchPromise = null;

function isSettingsCacheValid(ttlMs = SETTINGS_CACHE_TTL_MS) {
  if (!_cacheAppConfig) return false;
  if (typeof ttlMs !== 'number' || ttlMs <= 0) return true;
  return (Date.now() - _cacheAppConfig.updatedAt) < ttlMs;
}

function updateSettingsCache(settings, { persist = true } = {}) {
  _cacheAppConfig = { value: settings, updatedAt: Date.now() };
  if (persist) {
    saveLocalSettings(settings);
  }
}

function beginSettingsFetch() {
  const fetchPromise = (async () => {
    const settings = await fetchSettingsFromBackend();
    updateSettingsCache(settings, { persist: true });
    return settings;
  })();

  const trackedPromise = fetchPromise.finally(() => {
    if (_settingsFetchPromise === trackedPromise) {
      _settingsFetchPromise = null;
    }
  });

  _settingsFetchPromise = trackedPromise;
  return trackedPromise;
}

function fetchSettingsWithDedup(options = {}) {
  const { refresh = false } = options || {};
  if (_settingsFetchPromise && !refresh) {
    return _settingsFetchPromise;
  }
  return beginSettingsFetch();
}

function mapBackendAccessionToUi(value) {
  const v = value || {};
  // Convert {NNN...} to {SEQn}
  const toUiPattern = (p) => {
    if (!p || typeof p !== 'string') return DEFAULT_ACCESSION.pattern;
    return p.replace(/\{N+\}/gi, (m) => {
      const n = m.length - 2; // exclude braces
      return `{SEQ${n}}`;
    });
  };
  const reset = (v.counter_reset_policy || '').toString().toLowerCase();
  const resetPolicy = reset === 'daily' ? 'daily' : reset === 'monthly' ? 'monthly' : 'never';

  return {
    ...DEFAULT_ACCESSION,
    pattern: toUiPattern(v.pattern),
    resetPolicy,
    seqPadding: v.sequence_digits ?? DEFAULT_ACCESSION.seqPadding,
    // org/site not provided by backend; keep defaults or from prefix if desired
  };
}

function mapUiAccessionToBackend(uiCfg, currentBackend) {
  const cur = currentBackend || {};
  const fromUiPattern = (p) => {
    if (!p || typeof p !== 'string') return cur.pattern || DEFAULT_ACCESSION.pattern;
    // Replace {SEQn} with {NNN...}
    return p.replace(/\{SEQ(\d+)?\}/gi, (_, n) => {
      const len = parseInt(n || '4', 10);
      return `{${'N'.repeat(Math.max(1, len))}}`;
    });
  };

  const counter_reset_policy = (uiCfg.resetPolicy || 'never').toUpperCase();
  const sequence_digits = uiCfg.seqPadding || 4;

  return {
    // preserve other backend fields
    ...cur,
    pattern: fromUiPattern(uiCfg.pattern),
    counter_reset_policy,
    sequence_digits,
  };
}

export async function getAccessionConfig() {
  const { fetchWithCache } = await import('./settings-cache.js');
  
  return await fetchWithCache('accession_config', async () => {
    try {
      // Don't try backend if not authenticated
      const { getAuth } = await import('./auth-storage');
      const isSystemAuth = import.meta.env.VITE_SETTINGS_AUTH_TYPE === 'system';
      if (!getAuth() && !isSystemAuth) {
        const item = await getLocalSetting('accession_config');
        return item && item.value ? mapBackendAccessionToUi(item.value) : { ...DEFAULT_ACCESSION };
      }

      const client = apiClient('settings');
      const res = await client.get('/settings/accession_config');
      const setting = res && res.setting ? res.setting : null;
      const val = setting && setting.value ? setting.value : null;
      const ui = val ? mapBackendAccessionToUi(val) : { ...DEFAULT_ACCESSION };
      return ui;
    } catch (e) {
      console.warn('[settingsService] Failed to fetch accession config from backend:', e);
      // Fallback to local dev server file
      const item = await getLocalSetting('accession_config');
      const val = item && item.value ? item.value : null;
      const ui = val ? mapBackendAccessionToUi(val) : { ...DEFAULT_ACCESSION };
      return ui;
    }
  }, 5 * 60 * 1000); // 5 minutes TTL
}

export async function updateAccessionConfig(uiCfg) {
  const { clearCachedData } = await import('./settings-cache.js');
  
  try {
    const client = apiClient('settings');

    // Try to fetch current value, but don't fail if it doesn't exist (404)
    let currentVal = {};
    let currentDescription = 'Accession number format and generation rules';

    try {
      const current = await client.get('/settings/accession_config');
      currentVal = current && current.setting && current.setting.value ? current.setting.value : {};
      currentDescription = (current && current.setting && current.setting.description) || currentDescription;
    } catch (getError) {
      // If setting doesn't exist (404), that's ok - we'll create it with PUT
      console.log('[settingsService] Accession config not found, will create new one');
    }

    const payload = {
      value: mapUiAccessionToBackend(uiCfg, currentVal),
      description: currentDescription
    };

    const res = await client.put('/settings/accession_config', payload);
    const updated = res && res.setting && res.setting.value ? mapBackendAccessionToUi(res.setting.value) : mapBackendAccessionToUi(payload.value);
    
    // Clear cache to force refetch on next access
    clearCachedData('accession_config');
    
    return updated;
  } catch (e) {
    console.error('[settingsService] Failed to save accession config to backend, using local fallback:', e);
    // Local fallback
    const payload = mapUiAccessionToBackend(uiCfg, {});
    const saved = await upsertLocalSetting('accession_config', payload, 'Accession number format and generation rules');
    const val = saved && saved.value ? saved.value : payload;
    const updated = mapBackendAccessionToUi(val);
    
    // Clear cache
    clearCachedData('accession_config');
    
    return updated;
  }
}

// ---------------- Order Number Config (separate backend key) ----------------

const DEFAULT_ORDER_NUMBER = {
  pattern: 'ORD{YYYY}{MM}{DD}{SEQ5}',
  resetPolicy: 'daily',
  seqPadding: 5,
  orgCode: 'RS01',
  siteCode: 'RAD',
  prefix: 'ORD',
  useModalityInSeqScope: false,
  allowedSeparators: ['-','_','/']
};

let _cacheOrderNumber = null; // { value (UI-mapped), backendUpdatedAt }

function mapBackendOrderNumberToUi(value) {
  const v = value || {};
  // Convert {NNN...} to {SEQn}
  const toUiPattern = (p) => {
    if (!p || typeof p !== 'string') return DEFAULT_ORDER_NUMBER.pattern;
    return p.replace(/\{N+\}/gi, (m) => {
      const n = m.length - 2; // exclude braces
      return `{SEQ${n}}`;
    });
  };
  const reset = (v.counter_reset_policy || '').toString().toLowerCase();
  const resetPolicy = reset === 'daily' ? 'daily' : reset === 'monthly' ? 'monthly' : 'never';

  return {
    ...DEFAULT_ORDER_NUMBER,
    pattern: toUiPattern(v.pattern),
    resetPolicy,
    seqPadding: v.sequence_digits ?? DEFAULT_ORDER_NUMBER.seqPadding,
    prefix: v.prefix || DEFAULT_ORDER_NUMBER.prefix,
    orgCode: v.org_code || DEFAULT_ORDER_NUMBER.orgCode,
  };
}

function mapUiOrderNumberToBackend(uiCfg, currentBackend) {
  const cur = currentBackend || {};
  const fromUiPattern = (p) => {
    if (!p || typeof p !== 'string') return cur.pattern || DEFAULT_ORDER_NUMBER.pattern;
    // Replace {SEQn} with {NNN...}
    return p.replace(/\{SEQ(\d+)?\}/gi, (_, n) => {
      const len = parseInt(n || '5', 10);
      return `{${'N'.repeat(Math.max(1, len))}}`;
    });
  };

  const counter_reset_policy = (uiCfg.resetPolicy || 'never').toUpperCase();
  const sequence_digits = uiCfg.seqPadding || 5;

  return {
    // preserve other backend fields
    ...cur,
    pattern: fromUiPattern(uiCfg.pattern),
    counter_reset_policy,
    sequence_digits,
    prefix: uiCfg.prefix || 'ORD',
    org_code: uiCfg.orgCode || 'RS01',
  };
}

export async function getOrderNumberConfig() {
  const { fetchWithCache } = await import('./settings-cache.js');
  
  return await fetchWithCache('order_number_config', async () => {
    try {
      // Don't try backend if not authenticated
      const { getAuth } = await import('./auth-storage');
      const isSystemAuth = import.meta.env.VITE_SETTINGS_AUTH_TYPE === 'system';
      if (!getAuth() && !isSystemAuth) {
        const item = await getLocalSetting('order_number_config');
        return item && item.value ? mapBackendOrderNumberToUi(item.value) : { ...DEFAULT_ORDER_NUMBER };
      }

      const client = apiClient('settings');
      const res = await client.get('/settings/order_number_config');
      const setting = res && res.setting ? res.setting : null;
      const val = setting && setting.value ? setting.value : null;
      return val ? mapBackendOrderNumberToUi(val) : { ...DEFAULT_ORDER_NUMBER };
    } catch (e) {
      console.warn('[settingsService] Failed to fetch order number config from backend:', e);
      // Fallback to local dev server file
      const item = await getLocalSetting('order_number_config');
      const val = item && item.value ? item.value : null;
      return val ? mapBackendOrderNumberToUi(val) : { ...DEFAULT_ORDER_NUMBER };
    }
  }, 5 * 60 * 1000); // 5 minutes TTL
}

export async function updateOrderNumberConfig(uiCfg) {
  try {
    const client = apiClient('settings');

    // Try to fetch current value, but don't fail if it doesn't exist (404)
    let currentVal = {};
    let currentDescription = 'Order number format and generation rules';

    try {
      const current = await client.get('/settings/order_number_config');
      currentVal = current && current.setting && current.setting.value ? current.setting.value : {};
      currentDescription = (current && current.setting && current.setting.description) || currentDescription;
    } catch (getError) {
      // If setting doesn't exist (404), that's ok - we'll create it with PUT
      console.log('[settingsService] Order number config not found, will create new one');
    }

    const payload = {
      value: mapUiOrderNumberToBackend(uiCfg, currentVal),
      description: currentDescription
    };

    const res = await client.put('/settings/order_number_config', payload);
    const updated = res && res.setting && res.setting.value ? mapBackendOrderNumberToUi(res.setting.value) : mapBackendOrderNumberToUi(payload.value);
    _cacheOrderNumber = { value: updated, backendUpdatedAt: res?.setting?.updated_at || Date.now() };
    return updated;
  } catch (e) {
    console.error('[settingsService] Failed to save order number config to backend, using local fallback:', e);
    // Local fallback
    const payload = mapUiOrderNumberToBackend(uiCfg, {});
    const saved = await upsertLocalSetting('order_number_config', payload, 'Order number format and generation rules');
    const val = saved && saved.value ? saved.value : payload;
    const updated = mapBackendOrderNumberToUi(val);
    _cacheOrderNumber = { value: updated, backendUpdatedAt: saved?.updatedAt || Date.now() };
    return updated;
  }
}

function ensureSettingsModule() {
  let registry = loadRegistry();
  if (!registry.settings) {
    registry.settings = {
      enabled: true,
      baseUrl: SETTINGS_GATEWAY_URL,
      timeoutMs: 6000,
      debug: false,
    };
    saveRegistry(registry);
  }
}

// ---------------- Company Profile (separate backend key) ----------------

export const DEFAULT_COMPANY_PROFILE = {
  name: 'Imagestro',
  appTitle: 'PACS UI',
  shortTitle: 'P',
  address: '',
  phone: '',
  email: '',
  website: '',
  logoUrl: ''
};

let _cacheCompanyProfile = null; // { value, updatedAt }

export async function getCompanyProfile() {
  ensureSettingsModule();
  const { fetchWithCache } = await import('./settings-cache.js');
  
  return await fetchWithCache('company_profile', async () => {
    try {
      // Don't try backend if not authenticated
      const { getAuth } = await import('./auth-storage');
      const isSystemAuth = import.meta.env.VITE_SETTINGS_AUTH_TYPE === 'system';
      if (!getAuth() && !isSystemAuth) {
        return { ...DEFAULT_COMPANY_PROFILE };
      }

      const client = apiClient('settings');
      const res = await client.get('/settings/company_profile');
      const setting = res && res.setting ? res.setting : null;
      let val = setting && setting.value ? setting.value : null;
      if (val && val.logoUrl && val.logoUrl.includes('hospital.com')) {
        val.logoUrl = ''; // Use placeholder instead of broken URL
      }
      return val ? { ...DEFAULT_COMPANY_PROFILE, ...val } : { ...DEFAULT_COMPANY_PROFILE };
    } catch (e) {
      console.warn('[settingsService] Failed to fetch company profile from backend:', e);
      // Fallback: try the correct endpoint directly through gateway
      try {
        const client = localSettingsClient();
        // Use the proper RESTful endpoint
        const res = await client.get('/settings/company_profile');
        return res && res.setting?.value ? { ...DEFAULT_COMPANY_PROFILE, ...res.setting.value } : { ...DEFAULT_COMPANY_PROFILE };
      } catch (_) {
        return { ...DEFAULT_COMPANY_PROFILE };
      }
    }
  }, 5 * 60 * 1000); // 5 minutes TTL
}

export async function updateCompanyProfile(profile) {
  ensureSettingsModule();
  try {
    const client = apiClient('settings');
    const current = await client.get('/settings/company_profile').catch(() => ({}));
    const description = (current && current.setting && current.setting.description) || 'Company profile information';
    const payload = {
      value: { ...DEFAULT_COMPANY_PROFILE, ...(profile || {}) },
      description
    };
    const res = await client.put('/settings/company_profile', payload);
    const updated = res && res.setting && res.setting.value ? { ...DEFAULT_COMPANY_PROFILE, ...res.setting.value } : payload.value;

    // Sync with cache layer
    try {
      const { setCachedData } = await import('./settings-cache.js');
      setCachedData('company_profile', updated);
    } catch (err) {
      console.warn('[settings-cache] Failed to update cache in updateCompanyProfile', err);
    }

    _cacheCompanyProfile = { value: updated, updatedAt: res?.setting?.updated_at || Date.now() };
    return updated;
    } catch (e) {
    // Fallback: try the correct endpoint directly through gateway
    const client = localSettingsClient();
    const payload = { ...DEFAULT_COMPANY_PROFILE, ...(profile || {}) };
    // Use proper endpoint and PUT method
    const res = await client.put('/settings/company_profile', payload);
    const updated = res && res.setting?.value ? { ...DEFAULT_COMPANY_PROFILE, ...res.setting.value } : payload;

    // Sync with cache layer in fallback too
    try {
      const { setCachedData } = await import('./settings-cache.js');
      setCachedData('company_profile', updated);
    } catch (err) { /* ignore */ }

    _cacheCompanyProfile = { value: updated, updatedAt: Date.now() };
    return updated;
    }

}

// ---------------- Integration Registry (separate backend key) ----------------

let _cacheIntegration = null; // { value, updatedAt }

export async function getIntegrationRegistry() {
  ensureSettingsModule();
  const { fetchWithCache } = await import('./settings-cache.js');
  
  return await fetchWithCache('integration_registry', async () => {
    try {
      // Don't try backend if not authenticated
      const { getAuth } = await import('./auth-storage');
      const isSystemAuth = import.meta.env.VITE_SETTINGS_AUTH_TYPE === 'system';
      if (!getAuth() && !isSystemAuth) {
        const item = await getLocalSetting('integration_registry');
        const val = item && item.value ? item.value : null;
        return val ? { ...DEFAULT_REGISTRY, ...val } : { ...DEFAULT_REGISTRY };
      }

      const client = apiClient('settings');
      const res = await client.get('/settings/integration_registry');
      const setting = res && res.setting ? res.setting : null;
      const val = setting && setting.value ? setting.value : null;
      return val ? { ...DEFAULT_REGISTRY, ...val } : { ...DEFAULT_REGISTRY };
    } catch (e) {
      console.warn('[settingsService] Failed to fetch integration registry from backend:', e);
      // Local fallback
      const item = await getLocalSetting('integration_registry');
      const val = item && item.value ? item.value : null;
      return val ? { ...DEFAULT_REGISTRY, ...val } : { ...DEFAULT_REGISTRY };
    }
  }, 5 * 60 * 1000); // 5 minutes TTL
}

export async function updateIntegrationRegistry(registry) {
  ensureSettingsModule();
  try {
    const client = apiClient('settings');
    const current = await client.get('/settings/integration_registry').catch(() => ({}));
    const description = (current && current.setting && current.setting.description) || 'Integration modules registry configuration';
    const payload = {
      value: { ...DEFAULT_REGISTRY, ...(registry || {}) },
      description
    };
    const res = await client.put('/settings/integration_registry', payload);
    const updated = res && res.setting && res.setting.value ? { ...DEFAULT_REGISTRY, ...res.setting.value } : payload.value;
    _cacheIntegration = { value: updated, updatedAt: res?.setting?.updated_at || Date.now() };
    return updated;
  } catch (e) {
    // Local fallback
    const saved = await upsertLocalSetting('integration_registry', { ...DEFAULT_REGISTRY, ...(registry || {}) }, 'Integration modules registry configuration');
    const val = saved && saved.value ? saved.value : { ...DEFAULT_REGISTRY, ...(registry || {}) };
    const updated = { ...DEFAULT_REGISTRY, ...val };
    _cacheIntegration = { value: updated, updatedAt: saved?.updatedAt || Date.now() };
    return updated;
  }
}

/**
 * Fetch settings from the backend API through the gateway
 * @returns {Promise<Object>} Settings object from backend
 */
async function fetchSettingsFromBackend() {
  const { fetchWithCache } = await import('./settings-cache.js');
  
  return await fetchWithCache('app_config', async () => {
    try {
      // Don't even try backend if we don't have auth (and not using system auth)
      const { getAuth } = await import('./auth-storage');
      const isSystemAuth = import.meta.env.VITE_SETTINGS_AUTH_TYPE === 'system';
      
      if (!getAuth() && !isSystemAuth) {
        console.debug('[settingsService] Not authenticated, using local fallback for app.config');
        const item = await getLocalSetting('app.config');
        return item ? (item.value || {}) : {};
      }

      // Ensure registry has settings module configured
      let registry = loadRegistry();
      if (!registry.settings) {
        registry.settings = {
          enabled: true,
          baseUrl: SETTINGS_GATEWAY_URL,
          timeoutMs: 6000,
          debug: false,
        };
        saveRegistry(registry);
      }

      // Create API client for settings service and attempt gateway-style path first
      const client = apiClient('settings');
      let res;
      try {
        res = await client.get('/settings/app.config');
      } catch (primaryError) {
        // Fallback to local dev server structure
        try {
          const item = await getLocalSetting('app.config');
          if (item) return item.value || {};
        } catch (e) {
          // ignore local fallback error
        }

        // If backend explicitly denied access, treat as "use defaults" (guest mode)
        if (primaryError.status === 401 || primaryError.status === 403) {
          console.warn('[settingsService] Backend settings require auth. Using defaults.');
          return {};
        }
        
        throw primaryError;
      }

      // Accept several possible shapes and normalize to the settings object
      if (res && typeof res === 'object') {
        // 1. Core Service pattern: { status: 'success', data: { value: {...} } }
        if (res.status === 'success' && res.data?.value) return res.data.value;
        if (res.status === 'success' && res.data) return res.data;

        // 2. Common shape: { setting: { key, value, ... } }
        if (res.setting && typeof res.setting === 'object' && 'value' in res.setting) {
          return res.setting.value;
        }

        // 3. Preferred shape: { key: 'app.config', value: {...} }
        if ('value' in res) return res.value;

        // 4. Map-like or list shape
        if (Array.isArray(res)) {
          const item = res.find(r => r && (r.key === 'app.config' || r.id === 'app.config'));
          if (item && item.value) return item.value;
        }

        if (res['app.config']) {
          const item = res['app.config'];
          return item && item.value ? item.value : item;
        }

        // 5. Fallback: if it's an object and looks like settings (has common keys), use it as is
        if (res.apiBaseUrl || res.theme || res.features) return res;
      }

      console.warn('[settingsService] Unexpected settings format, using local fallback');
      const fallback = await getLocalSetting('app.config');
      return fallback?.value || {};

    } catch (error) {
      console.error('[settingsService] Error fetching app.config from backend:', error);
      throw error;
    }
  }, 5 * 60 * 1000); // 5 minutes TTL
}

/**
 * Strip absolute legacy URLs from settings object
 */
function stripLegacyUrlsFromSettings(settings) {
  if (!settings) return settings;
  const next = { ...settings };
  let changed = false;

  if (next.apiBaseUrl && next.apiBaseUrl.startsWith('http')) {
    try {
      const urlObj = new URL(next.apiBaseUrl);
      const relativePath = urlObj.pathname.replace(/\/+$/, "");
      console.log(`[settingsService] Converting absolute apiBaseUrl to relative: ${next.apiBaseUrl} -> ${relativePath || '(root)'}`);
      next.apiBaseUrl = relativePath;
      changed = true;
    } catch (e) {
      next.apiBaseUrl = "";
      changed = true;
    }
  }

  // Also check worklistWidget apiUrl if it exists in settings
  if (next.worklistWidget?.apiUrl && next.worklistWidget.apiUrl.startsWith('http')) {
    try {
      const urlObj = new URL(next.worklistWidget.apiUrl);
      const relativePath = urlObj.pathname.replace(/\/+$/, "");
      console.log(`[settingsService] Converting absolute worklistWidget.apiUrl to relative: ${next.worklistWidget.apiUrl} -> ${relativePath || '(root)'}`);
      next.worklistWidget.apiUrl = relativePath;
      changed = true;
    } catch (e) {
      if (next.worklistWidget.apiUrl.includes('/api/worklist')) {
        next.worklistWidget.apiUrl = '/api/worklist';
        changed = true;
      }
    }
  }

  return { settings: next, changed };
}

/**
 * Get local settings from localStorage
 * @returns {Object} Settings object from localStorage or defaults
 */
export function getLocalSettings() {
  try {
    const raw = localStorage.getItem('app.config');
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    const result = { ...DEFAULT_SETTINGS, ...parsed };
    
    // Ensure apiBaseUrl is never /backend-api (legacy issue)
    if (result.apiBaseUrl === '/backend-api') {
      result.apiBaseUrl = '';
    }

    const { settings: cleaned } = stripLegacyUrlsFromSettings(result);
    return cleaned;
  } catch (e) {
    console.error('Error parsing local settings:', e);
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Save settings to localStorage
 * @param {Object} settings - Settings to save
 */
export function saveLocalSettings(settings) {
  try {
    const { settings: cleaned } = stripLegacyUrlsFromSettings(settings);
    localStorage.setItem('app.config', JSON.stringify(cleaned));
  } catch (e) {
    console.error('Error saving local settings:', e);
  }
}

/**
 * Update settings in backend and fallback to local storage
 * @param {Object} settings - Settings to update
 * @returns {Promise<Object>} Updated settings
 */
export async function updateSettings(settings) {
  try {
    // Try to update settings in backend
    const updatedSettings = await updateSettingsInBackend(settings);
    // Also save to local storage as backup
    updateSettingsCache(updatedSettings, { persist: true });
    return updatedSettings;
  } catch (error) {
    console.warn('Failed to update settings in backend, saving locally:', error);
    // Fallback to saving locally
    updateSettingsCache(settings, { persist: true });
    return settings;
  }
}
/**
 * Update settings strictly in backend (no local fallback)
 * @param {Object} settings - Settings to update
 * @returns {Promise<Object>} Updated settings from backend
 */
export async function updateSettingsStrict(settings) {
  // Reuse internal backend update and surface any errors to caller
  const updated = await updateSettingsInBackend(settings);
  updateSettingsCache(updated, { persist: true });
  return updated;
}

/**
 * Update settings in the backend API through the gateway
 * @param {Object} settings - Settings to update
 * @returns {Promise<Object>} Updated settings from backend
 */
async function updateSettingsInBackend(settings) {
  try {
    // Create API client for settings service
    const client = apiClient('settings');

    // Backend expects payload with { value, description? }
    const payload = {
      value: settings,
      description: 'Application configuration settings'
    };

    const res = await client.put('/settings/app.config', payload);

    if (!res || typeof res !== 'object') {
      throw new Error('Invalid response from backend when updating settings');
    }

    // Normalize to settings object
    if (res.setting && res.setting.value) return res.setting.value;
    return 'value' in res ? res.value : res;
  } catch (error) {
    console.error('Error updating settings in backend:', error);
    throw error;
  }
}

/**
 * Authenticate with the settings service gateway
 * @param {string} username - Username for authentication
 * @param {string} password - Password for authentication
 * @returns {Promise<Object>} Authentication response
 */
export async function authenticateSettingsService(username, password) {
  try {
    // Ensure auth module is configured in registry
    let registry = loadRegistry();
    if (!registry.auth) {
      registry.auth = {
        enabled: true,
        baseUrl: SETTINGS_GATEWAY_URL,
        timeoutMs: 6000
      };
      // Save the updated registry
      saveRegistry(registry);
    } else if (!registry.auth.enabled) {
      registry.auth.enabled = true;
      // Save the updated registry
      saveRegistry(registry);
    }

    // Create API client for auth
    const client = apiClient('auth');

    // Authenticate with the gateway
    const response = await client.post('/login', {
      username,
      password
    });

    return response;
  } catch (error) {
    console.error('Error authenticating with settings service:', error);
    throw error;
  }
}

// ---------------- Notification Config (separate backend key) ----------------

export const DEFAULT_NOTIFICATION_CONFIG = {
  enabled: false,
  telegramBotToken: '',
  notifyOnNewOrder: true,
  notifyOnStagnantOrder: false,
  stagnantThresholdMinutes: 60,
  lastCheckTime: null,
  // WhatsApp Configuration (Evolution API)
  whatsappEnabled: false,
  whatsappBaseUrl: 'http://103.42.117.18:9282/',
  whatsappInstanceName: '03D6C760-8A3F-43CB-B2BA-F2604FA1CA5F',
  whatsappApiKey: '',
  whatsappTargetNumber: ''
};

let _cacheNotificationConfig = null; // { value, updatedAt }

/**
 * Get notification configuration from backend with fallback to local storage
 * @returns {Promise<Object>} Notification config object
 */
export async function getNotificationConfig() {
  ensureSettingsModule();
  if (_cacheNotificationConfig) return _cacheNotificationConfig.value;

  try {
    // Don't try backend if not authenticated
    const { getAuth } = await import('./auth-storage');
    const isSystemAuth = import.meta.env.VITE_SETTINGS_AUTH_TYPE === 'system';
    if (!getAuth() && !isSystemAuth) {
      try {
        const raw = localStorage.getItem('notifications');
        if (raw) return JSON.parse(raw);
      } catch (e) {}
      return { ...DEFAULT_NOTIFICATION_CONFIG };
    }

    const client = apiClient('settings');
    const res = await client.get('/settings/notification_config');
    const setting = res && res.setting ? res.setting : null;
    const val = setting && setting.value ? setting.value : null;
    const config = val ? { ...DEFAULT_NOTIFICATION_CONFIG, ...val } : { ...DEFAULT_NOTIFICATION_CONFIG };
    _cacheNotificationConfig = { value: config, updatedAt: setting?.updated_at };
    return config;
  } catch (e) {
    console.warn('[settingsService] Failed to fetch notification config from backend, using localStorage fallback:', e);
    // Fallback to localStorage
    try {
      const raw = localStorage.getItem('notifications');
      if (!raw) return { ...DEFAULT_NOTIFICATION_CONFIG };
      const parsed = JSON.parse(raw);
      const config = { ...DEFAULT_NOTIFICATION_CONFIG, ...parsed };
      _cacheNotificationConfig = { value: config, updatedAt: Date.now() };
      return config;
    } catch (localError) {
      console.error('[settingsService] Error parsing local notification config:', localError);
      const config = { ...DEFAULT_NOTIFICATION_CONFIG };
      _cacheNotificationConfig = { value: config, updatedAt: Date.now() };
      return config;
    }
  }
}

/**
 * Update notification configuration in backend with fallback to local storage
 * @param {Object} config - Notification config to update
 * @returns {Promise<Object>} Updated notification config
 */
export async function updateNotificationConfig(config) {
  ensureSettingsModule();

  try {
    const client = apiClient('settings');

    // Try to fetch current setting to get description
    let currentDescription = 'Notification service configuration for order alerts';
    try {
      const current = await client.get('/settings/notification_config');
      currentDescription = (current && current.setting && current.setting.description) || currentDescription;
    } catch (getError) {
      console.log('[settingsService] Notification config not found, will create new one');
    }

    const payload = {
      value: { ...DEFAULT_NOTIFICATION_CONFIG, ...(config || {}) },
      description: currentDescription
    };

    const res = await client.put('/settings/notification_config', payload);
    const updated = res && res.setting && res.setting.value
      ? { ...DEFAULT_NOTIFICATION_CONFIG, ...res.setting.value }
      : payload.value;

    _cacheNotificationConfig = { value: updated, updatedAt: res?.setting?.updated_at || Date.now() };

    // Also save to localStorage as backup
    try {
      localStorage.setItem('notifications', JSON.stringify(updated));
    } catch (e) {
      console.warn('[settingsService] Failed to save notification config to localStorage:', e);
    }

    return updated;
  } catch (e) {
    console.error('[settingsService] Failed to save notification config to backend, using localStorage fallback:', e);

    // Fallback to localStorage
    const updated = { ...DEFAULT_NOTIFICATION_CONFIG, ...(config || {}) };
    try {
      localStorage.setItem('notifications', JSON.stringify(updated));
      _cacheNotificationConfig = { value: updated, updatedAt: Date.now() };
      return updated;
    } catch (localError) {
      console.error('[settingsService] Failed to save notification config to localStorage:', localError);
      throw localError;
    }
  }
}

export default {
  getSettings,
  getSettingsStrict,
  getAccessionConfig,
  updateAccessionConfig,
  getOrderNumberConfig,
  updateOrderNumberConfig,
  getCompanyProfile,
  updateCompanyProfile,
  getIntegrationRegistry,
  updateIntegrationRegistry,
  getNotificationConfig,
  updateNotificationConfig,
  getLocalSettings,
  saveLocalSettings,
  updateSettings,
  updateSettingsStrict,
  authenticateSettingsService
};
