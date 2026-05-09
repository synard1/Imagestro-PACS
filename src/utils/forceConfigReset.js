/**
 * Force Config Reset Utility
 * 
 * Use this to completely reset configuration and clear all caches
 * Run this in browser console if config migration doesn't work
 */

export function forceResetAllConfig() {
  console.log('🔄 Starting force config reset...');
  
  // Clear all localStorage keys related to config
  const keysToDelete = [
    'app.config',
    'app.settings',
    'settings',
    'config',
    'notification.config',
    'notifications'
  ];
  
  keysToDelete.forEach(key => {
    if (localStorage.getItem(key)) {
      localStorage.removeItem(key);
      console.log(`✓ Cleared localStorage: ${key}`);
    }
  });
  
  // Clear sessionStorage
  sessionStorage.clear();
  console.log('✓ Cleared sessionStorage');
  
  // Clear all caches
  if ('caches' in window) {
    caches.keys().then(cacheNames => {
      cacheNames.forEach(cacheName => {
        caches.delete(cacheName);
        console.log(`✓ Cleared cache: ${cacheName}`);
      });
    });
  }
  
  console.log('✅ Force reset complete!');
  console.log('🔄 Reloading page in 2 seconds...');
  
  setTimeout(() => {
    window.location.reload();
  }, 2000);
}

export function showCurrentConfig() {
  try {
    const config = localStorage.getItem('app.config');
    if (config) {
      const parsed = JSON.parse(config);
      console.log('📋 Current Config:', parsed);
      console.log('   apiBaseUrl:', parsed.apiBaseUrl);
      console.log('   backendEnabled:', parsed.backendEnabled);
    } else {
      console.log('❌ No config in localStorage');
    }
  } catch (error) {
    console.error('Error reading config:', error);
  }
}

export function fixConfigApiBaseUrl() {
  try {
    const raw = localStorage.getItem('app.config');
    if (!raw) {
      console.log('❌ No config found');
      return;
    }
    
    const config = JSON.parse(raw);
    console.log('📋 Current apiBaseUrl:', config.apiBaseUrl);
    
    if (config.apiBaseUrl === '/backend-api') {
      console.log('🔧 Fixing apiBaseUrl from /backend-api to empty string...');
      config.apiBaseUrl = '';
      localStorage.setItem('app.config', JSON.stringify(config));
      console.log('✅ Fixed! Reloading page...');
      setTimeout(() => window.location.reload(), 1000);
    } else if (config.apiBaseUrl === '') {
      console.log('✅ apiBaseUrl is already correct (empty string)');
    } else {
      console.log('⚠️  apiBaseUrl is:', config.apiBaseUrl);
    }
  } catch (error) {
    console.error('Error fixing config:', error);
  }
}

// Export for console access
if (typeof window !== 'undefined') {
  window.__CONFIG_UTILS__ = {
    forceResetAllConfig,
    showCurrentConfig,
    fixConfigApiBaseUrl
  };
  
  // console.log('💡 Config utilities available:');
  // console.log('   window.__CONFIG_UTILS__.showCurrentConfig()');
  // console.log('   window.__CONFIG_UTILS__.fixConfigApiBaseUrl()');
  // console.log('   window.__CONFIG_UTILS__.forceResetAllConfig()');
}
