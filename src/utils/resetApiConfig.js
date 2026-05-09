/**
 * Utility to reset API configuration
 * Run this in browser console if you need to clear cached API settings:
 * 
 * import { resetApiConfig } from './utils/resetApiConfig'
 * resetApiConfig()
 * 
 * Or directly in console:
 * localStorage.clear()
 * location.reload()
 */

export function resetApiConfig() {
  // Remove all versions of API registry
  localStorage.removeItem("api.registry.v1");
  localStorage.removeItem("api.registry.v2");
  localStorage.removeItem("api.registry.v3");
  
  console.log("✅ API configuration cleared");
  console.log("🔄 Reloading page to apply default configuration...");
  
  // Reload page to apply defaults
  setTimeout(() => {
    window.location.reload();
  }, 500);
}

// Make it available in console for debugging
if (typeof window !== 'undefined') {
  window.resetApiConfig = resetApiConfig;
}

export default resetApiConfig;
