/**
 * Configuration Migration Utility
 * 
 * Handles migration of old configuration format to new format
 * Specifically fixes apiBaseUrl from '/backend-api' to ''
 */

/**
 * Migrate old config to new format
 * Fixes apiBaseUrl from '/backend-api' to ''
 */
export function migrateConfig() {
  try {
    const raw = localStorage.getItem('app.config');
    if (!raw) return;

    const config = JSON.parse(raw);
    
    // Check if migration is needed
    if (config.apiBaseUrl === '/backend-api') {
      console.log('[ConfigMigration] Migrating apiBaseUrl from /backend-api to empty string');
      
      // Update config
      config.apiBaseUrl = '';
      
      // Save back to localStorage
      localStorage.setItem('app.config', JSON.stringify(config));
      
      console.log('[ConfigMigration] Migration complete');
      return true;
    }
  } catch (error) {
    console.error('[ConfigMigration] Error during migration:', error);
  }
  
  return false;
}

/**
 * Clear old config and reset to defaults
 * Use this if migration doesn't work
 */
export function resetConfig() {
  try {
    localStorage.removeItem('app.config');
    console.log('[ConfigMigration] Config cleared - will use defaults on next load');
    return true;
  } catch (error) {
    console.error('[ConfigMigration] Error clearing config:', error);
    return false;
  }
}

/**
 * Get current config from localStorage
 */
export function getCurrentConfig() {
  try {
    const raw = localStorage.getItem('app.config');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.error('[ConfigMigration] Error reading config:', error);
    return null;
  }
}

/**
 * Log current config for debugging
 */
export function logCurrentConfig() {
  const config = getCurrentConfig();
  if (config) {
    console.log('[ConfigMigration] Current config:', {
      apiBaseUrl: config.apiBaseUrl,
      backendEnabled: config.backendEnabled,
      timeoutMs: config.timeoutMs
    });
  } else {
    console.log('[ConfigMigration] No config in localStorage');
  }
}
