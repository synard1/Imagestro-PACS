// src/services/storageManager.js
// Centralized localStorage cache management for login/logout and versioned revalidation

const APP_CACHE_VERSION = '1';
const VERSION_KEY = 'app.cache.version';

// Keys that should be preserved across login/logout (environment/config)
const PRESERVE_KEYS = new Set([
  'api.registry.v1',
  'satusehat_config',
]);

// Known cache/data keys to clear when user context changes
const CACHE_KEYS = [
  'orders_offline',
  'satusehat_files_cache',
  'satusehat_token',
];

function broadcastInvalidation() {
  try {
    // Trigger storage listeners across tabs/windows
    const k = 'app:cache:invalidate';
    localStorage.setItem(k, String(Date.now()));
    localStorage.removeItem(k);
  } catch (_) {}
}

export function clearCaches() {
  try {
    // Explicitly clear known cache keys first
    for (const k of CACHE_KEYS) {
      try { localStorage.removeItem(k); } catch (_) {}
    }

    // Also clear any other app-specific keys except preserved ones
    // Iterate a copy of keys to avoid index shifting while removing
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key != null) keys.push(key);
    }
    for (const key of keys) {
      if (PRESERVE_KEYS.has(key)) continue;
      // Skip auth keys; authService/rbac manage them
      if (key === 'auth.session.v1' || key === 'app.currentUser') continue;
      // Skip version key
      if (key === VERSION_KEY) continue;
      // Clear any app-scoped caches we own
      if (CACHE_KEYS.includes(key)) {
        try { localStorage.removeItem(key); } catch (_) {}
      }
    }
  } finally {
    broadcastInvalidation();
  }
}

export function clearOnLogin() {
  // Clear caches when a user successfully logs in
  clearCaches();
}

export function clearOnLogout() {
  // Clear caches when a user logs out (auth tokens cleared elsewhere)
  clearCaches();
}

export function ensureCacheVersion() {
  try {
    const current = localStorage.getItem(VERSION_KEY);
    if (current !== APP_CACHE_VERSION) {
      clearCaches();
      localStorage.setItem(VERSION_KEY, APP_CACHE_VERSION);
    }
  } catch (_) {
    // Non-fatal; app continues without versioning
  }
}

