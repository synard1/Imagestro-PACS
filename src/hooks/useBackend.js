// src/hooks/useBackend.js
import { useEffect, useState } from "react";
import { loadRegistry, onRegistryChanged } from "../services/api-registry";

// Shared state for all useBackendHealth hooks
let sharedStatus = {};
const listeners = new Set();
let worker = null;
let activeIntervalMs = 300000; // Default 5 mins

/**
 * Initialize background worker for health checks
 */
function getWorker() {
  if (worker) return worker;
  
  try {
    // Create worker using Vite's constructor pattern
    worker = new Worker(new URL('../workers/health.worker.js', import.meta.url), {
      type: 'module'
    });
    
    worker.onmessage = (e) => {
      if (e.data.type === 'HEALTH_UPDATE') {
        sharedStatus = e.data.results;
        listeners.forEach(fn => fn(sharedStatus));
      }
    };
    
    console.log('[useBackend] Health worker initialized');
    return worker;
  } catch (err) {
    console.warn('[useBackend] Failed to initialize worker, falling back to main thread:', err);
    return null;
  }
}

/**
 * Hook to access backend health status
 * Refined to use background worker and shared state
 */
export function useBackendHealth({ intervalMs = 300000 } = {}) {
  const [registry, setRegistry] = useState(() => loadRegistry());
  const [status, setStatus] = useState(sharedStatus);

  useEffect(() => {
    // Subscribe to registry changes
    const off = onRegistryChanged((newReg) => {
      setRegistry(newReg);
      if (worker) {
        worker.postMessage({ type: 'UPDATE_REGISTRY', registry: newReg });
      }
    });

    // Subscribe to shared status updates
    const updateLocalStatus = (newStatus) => setStatus(newStatus);
    listeners.add(updateLocalStatus);

    // Initialize worker if not already running
    const hw = getWorker();
    if (hw && (listeners.size === 1 || intervalMs < activeIntervalMs)) {
      activeIntervalMs = intervalMs;
      hw.postMessage({ 
        type: 'START', 
        registry, 
        intervalMs 
      });
    }

    return () => {
      off();
      listeners.delete(updateLocalStatus);
      if (listeners.size === 0 && worker) {
        worker.postMessage({ type: 'STOP' });
        // We keep the worker instance but stop the interval
      }
    };
  }, [registry, intervalMs]);

  const getStatus = (mod) => {
    const moduleStatus = status[mod];
    if (!moduleStatus) {
      return registry[mod]?.enabled ? "unknown" : "disabled";
    }
    return moduleStatus;
  };
  
  return { registry, status, getStatus };
}
