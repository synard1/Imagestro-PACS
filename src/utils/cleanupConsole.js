// Console cleanup utility
// This utility helps clean up console logs during production or when needed

const isDevelopment = import.meta.env.DEV;
const isDebugMode = localStorage.getItem('debug_mode') === 'true';

// Create a controlled logger that respects environment and debug settings
export const logger = {
  // Always show errors and warnings
  error: (...args) => console.error(...args),
  warn: (...args) => console.warn(...args),
  
  // Only show info/debug in development or debug mode
  info: (...args) => {
    if (isDevelopment || isDebugMode) {
      console.info(...args);
    }
  },
  
  debug: (...args) => {
    if (isDevelopment || isDebugMode) {
      console.log(...args);
    }
  },
  
  // Force log (always shows, use sparingly)
  force: (...args) => console.log(...args)
};

// Function to clean up console logs globally
export function cleanupConsole() {
  if (!isDevelopment && !isDebugMode) {
    // Override console.log in production unless debug mode is enabled
    const originalLog = console.log;
    const originalInfo = console.info;
    const originalDebug = console.debug;
    
    console.log = (...args) => {
      // Only allow certain prefixes to show
      const message = args[0];
      if (typeof message === 'string') {
        // Allow critical system messages
        if (message.includes('[CRITICAL]') || 
            message.includes('[ERROR]') || 
            message.includes('[WARN]') ||
            message.includes('🧹') ||
            message.includes('🔇') ||
            message.includes('🔊') ||
            message.includes('✅') ||
            message.includes('❌')) {
          originalLog(...args);
        }
        // Suppress all other logs including [api-registry], [PWA], [Auth], etc.
      }
    };
    
    console.info = (...args) => {
      const message = args[0];
      if (typeof message === 'string' && 
          (message.includes('[CRITICAL]') || 
           message.includes('[ERROR]') ||
           message.includes('🧹') ||
           message.includes('✅') ||
           message.includes('❌'))) {
        originalInfo(...args);
      }
    };
    
    console.debug = (...args) => {
      // Suppress all debug logs in production
    };
  }
}

// Function to enable debug mode
export function enableDebugMode() {
  localStorage.setItem('debug_mode', 'true');
  console.log('🔊 Debug mode enabled. Refresh page to see all logs.');
}

// Function to disable debug mode
export function disableDebugMode() {
  localStorage.setItem('debug_mode', 'false');
  console.log('🔇 Debug mode disabled. Refresh page to hide verbose logs.');
}

// Make debug functions available globally for easy access
if (typeof window !== 'undefined') {
  window.enableDebugMode = enableDebugMode;
  window.disableDebugMode = disableDebugMode;
}