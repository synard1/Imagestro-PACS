const KEY = 'app.config'

const defaults = {
  backendEnabled: true,
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

  // Accession Number Configuration
  accessionRegenerationEnabled: false, // Disable accession number regeneration by default
  accessionReadOnlyAfterCreate: true,   // Make accession number read-only after creation

  // Worklist Widget Configuration
  worklistWidget: {
    enabled: true,
    useBackendApi: true,
    apiUrl: `${import.meta.env.VITE_MAIN_API_BACKEND_URL || ''}/api/worklist`,
    refreshInterval: 30000, // 30 seconds in milliseconds
    maxItems: 10,
    autoRefresh: true
  },

  // Floating Worklist Widget Configuration
  floatingWorklistWidget: {
    enabled: true
  },

  // AI Chat Configuration
  aiChat: {
    enabled: false,
    mode: import.meta.env.VITE_AI_CHAT_MODE || 'kpi', // 'kpi' or 'flexible'
  }
}

/**
 * Strip absolute legacy URLs from configuration
 */
function stripLegacyUrls(config) {
  if (!config) return config;
  
  let changed = false;
  const next = { ...config };
  
  // Clean apiBaseUrl
  if (next.apiBaseUrl && next.apiBaseUrl.startsWith('http')) {
    try {
      const urlObj = new URL(next.apiBaseUrl);
      const relativePath = urlObj.pathname.replace(/\/+$/, "");
      console.log(`[config] Converting absolute apiBaseUrl to relative: ${next.apiBaseUrl} -> ${relativePath || '(root)'}`);
      next.apiBaseUrl = relativePath;
      changed = true;
    } catch (e) {
      next.apiBaseUrl = "";
      changed = true;
    }
  }
  
  // Clean worklistWidget.apiUrl
  if (next.worklistWidget?.apiUrl && next.worklistWidget.apiUrl.startsWith('http')) {
    try {
      const urlObj = new URL(next.worklistWidget.apiUrl);
      const relativePath = urlObj.pathname.replace(/\/+$/, "");
      console.log(`[config] Converting absolute worklistWidget.apiUrl to relative: ${next.worklistWidget.apiUrl} -> ${relativePath || '(root)'}`);
      next.worklistWidget.apiUrl = relativePath;
      changed = true;
    } catch (e) {
      // Don't modify if it might be a valid external URL, but our internal ones usually have /api
      if (next.worklistWidget.apiUrl.includes('/api/worklist')) {
        next.worklistWidget.apiUrl = '/api/worklist';
        changed = true;
      }
    }
  }
  
  return { next, changed };
}

// Synchronous local config getter - fast, no network
function getLocalConfig() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...defaults }
    const parsed = JSON.parse(raw)
    const merged = { ...defaults, ...parsed };
    
    const { next } = stripLegacyUrls(merged);
    return next;
  } catch (e) {
    return { ...defaults }
  }
}

// Cache for loaded config
let _configCache = null;
let _configLoadPromise = null;

export async function loadConfig() {
  // Return cached config if available
  if (_configCache) return _configCache;
  
  // Deduplicate concurrent calls
  if (_configLoadPromise) return _configLoadPromise;
  
  _configLoadPromise = (async () => {
    // Start with local config (fast)
    _configCache = getLocalConfig();
    
    // Optional: Try to sync with backend in background (non-blocking)
    // This is deferred and won't block initial page load
    if (_configCache.backendEnabled) {
      setTimeout(async () => {
        try {
          const { getSettings } = await import('./settingsService');
          const backendConfig = await getSettings({ refresh: true });
          if (backendConfig) {
            const { next, changed } = stripLegacyUrls(backendConfig);
            const newConfig = { ...defaults, ...next };
            const currentStr = localStorage.getItem(KEY);
            const nextStr = JSON.stringify(newConfig);
            
            if (currentStr !== nextStr) {
              _configCache = newConfig;
              localStorage.setItem(KEY, nextStr);
              // Only dispatch if changed to stop the loop
              window.dispatchEvent(new CustomEvent('app-config-updated', { detail: _configCache }));
            }
          }
        } catch (e) {
          // Silently ignore backend sync errors - local config is fine
          console.debug('[config] Backend sync skipped:', e.message);
        }
      }, 2000); // Delay backend sync by 2 seconds
    }
    
    return _configCache;
  })();
  
  const result = await _configLoadPromise;
  _configLoadPromise = null;
  return result;
}

export function saveConfig(next) {
  const { next: cleaned } = stripLegacyUrls(next);
  
  // Update cache
  _configCache = { ...defaults, ...cleaned };
  
  // Always save to localStorage first
  localStorage.setItem(KEY, JSON.stringify(_configCache))
  
  // Also try to save to backend if enabled (non-blocking)
  if (cleaned?.backendEnabled) {
    import('./settingsService').then(({ updateSettings }) => {
      updateSettings(cleaned).catch(err => {
        console.warn('Failed to save config to backend:', err);
      });
    }).catch(e => {
      console.warn('Failed to import settingsService:', e);
    });
  }
}

export async function getConfig() {
  return await loadConfig()
}

// Synchronous version for components that need immediate config (uses cache or local)
export function getConfigSync() {
  return _configCache || getLocalConfig();
}
