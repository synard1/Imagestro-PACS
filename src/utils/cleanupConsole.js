// Console cleanup utility
// Suppresses console.log/info/debug in production to reduce noise and limit info exposure.
// console.warn and console.error are intentionally left unmodified so real issues are still visible.

const isDevelopment = import.meta.env.DEV;

let isDebugMode = false;
try {
  isDebugMode = localStorage.getItem('debug_mode') === 'true';
} catch (e) {}

export function cleanupConsole() {
  if (isDevelopment || isDebugMode) return;

  const noop = () => {};
  console.log = noop;
  console.info = noop;
  console.debug = noop;
  // console.warn and console.error stay native
}

export function enableDebugMode() {
  localStorage.setItem('debug_mode', 'true');
  window.location.reload();
}

export function disableDebugMode() {
  localStorage.removeItem('debug_mode');
  window.location.reload();
}

if (typeof window !== 'undefined') {
  window.enableDebugMode = enableDebugMode;
  window.disableDebugMode = disableDebugMode;
}
