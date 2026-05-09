import { getConfig } from './config'

let status = 'unknown' // 'up' | 'down' | 'unknown'
const listeners = new Set()
let timer = null
let pendingCheck = null

export function getStatus(){ return status }
export function onHealthChange(fn){ listeners.add(fn); return () => listeners.delete(fn) }

function emit(next){
  if (status === next) return // Only emit if changed
  status = next
  for (const fn of listeners) { try { fn(status) } catch (e) {} }
}

/**
 * Perform health check with deduplication
 */
export async function checkOnce() {
  // If there's already a check in progress, return its promise
  if (pendingCheck) return pendingCheck;

  pendingCheck = (async () => {
    const cfg = await getConfig()
    if (!cfg.backendEnabled) { 
      emit('unknown'); 
      return 'unknown'; 
    }
    
    try {
      const ctrl = new AbortController()
      const timeoutId = setTimeout(()=>ctrl.abort(), Math.min(cfg.timeoutMs, 4000) || 4000)
      
      // Prefer /backend-api/health for global health status
      const healthUrl = cfg.apiBaseUrl ? `${cfg.apiBaseUrl}/api/health` : '/backend-api/health';
      
      console.debug(`[health] Checking backend at ${healthUrl}`);
      const res = await fetch(healthUrl, { 
        signal: ctrl.signal,
        cache: 'no-cache' // Ensure we don't get 304 for health
      })
      clearTimeout(timeoutId)
      
      let nextStatus = 'down';
      if (res.ok) { 
        nextStatus = 'up'; 
      } else if (!cfg.apiBaseUrl && healthUrl === '/backend-api/health') {
        // Fallback to /api/health if /backend-api/health fails and we are using relative paths
        const fallbackRes = await fetch('/api/health', { signal: ctrl.signal });
        if (fallbackRes.ok) nextStatus = 'up';
      }
      
      emit(nextStatus);
      return nextStatus;
    } catch (e) {
      console.warn('[health] Check failed:', e.message);
      emit('down');
      return 'down';
    }
  })().finally(() => {
    pendingCheck = null;
  });

  return pendingCheck;
}

/**
 * Start background health monitoring
 * Default to 60s to reduce network noise
 */
export function startHealthWatch(intervalMs = 60000){
  if (timer) clearInterval(timer)
  
  // Initial check
  checkOnce()
  
  // Schedule periodic checks
  timer = setInterval(checkOnce, intervalMs)
  
  console.log(`[health] Background watch started (interval: ${intervalMs}ms)`);
  
  return () => { 
    if (timer) {
      clearInterval(timer); 
      timer = null;
      console.log('[health] Background watch stopped');
    }
  }
}
