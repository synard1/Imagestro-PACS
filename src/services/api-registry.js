// src/services/api-registry.js
import { getConfigSync } from './config';

/**
 * Standardised API Registry v11.0
 * Fix MWL Routing & Unified Health Hub
 * RESOLVED: Double prefixing issue for core modules
 */

export const DEFAULT_REGISTRY = {
  // Clinical Core - Use empty baseUrl because apiBaseUrl already contains /backend-api
  patients: { enabled: true, baseUrl: "", healthPath: "/health/master", timeoutMs: 5000 },
  procedures: { enabled: true, baseUrl: "", healthPath: "/health/master", timeoutMs: 5000 },
  doctors: { enabled: true, baseUrl: "", healthPath: "/health/master", timeoutMs: 5000 },
  procedure_mappings: { enabled: true, baseUrl: "", healthPath: "/health/master", timeoutMs: 5000 },
  studies: { enabled: true, baseUrl: "", healthPath: "/api/health", timeoutMs: 5000 },
  orders: { enabled: true, baseUrl: "", healthPath: "/health/order", timeoutMs: 5000 },  worklist: { enabled: true, baseUrl: "", healthPath: "/health/mwl", timeoutMs: 5000 },       

  // System Engines
  users: { enabled: true, baseUrl: "", healthPath: "/health/auth", timeoutMs: 5000 },
  auth: { enabled: true, baseUrl: "", healthPath: "/health/auth", timeoutMs: 5000 },
  pacs: { enabled: true, baseUrl: "", healthPath: "/api/health", timeoutMs: 5000 },
  modalities: { enabled: true, baseUrl: "", healthPath: "/api/health", timeoutMs: 5000 },
  dicom_nodes: { enabled: true, baseUrl: "", healthPath: "/api/health", timeoutMs: 5000 },
  
  // FIXED: Point directly to Health Hub via /backend-api
  mwl_writer: {
    enabled: true,
    baseUrl: "",
    healthPath: "/health/mwl",
    timeoutMs: 5000
  },

  // Compliance & Audit
  audit: { enabled: true, baseUrl: "", healthPath: "/api/health", timeoutMs: 5000 },
  auth_audit: { enabled: true, baseUrl: "", healthPath: "/health/auth", timeoutMs: 5000 },
  storage_config: { enabled: true, baseUrl: "", healthPath: "/api/health", timeoutMs: 5000 },
  settings: { enabled: true, baseUrl: "", healthPath: "/health/master", timeoutMs: 5000 },
  mappings: { enabled: true, baseUrl: "", healthPath: "/health/master", timeoutMs: 5000 },

  // Accession Worker (Cloudflare Worker + D1)
  accession: { enabled: true, baseUrl: "/accession-api", healthPath: "/healthz", timeoutMs: 5000 },

  // External Bridges - Keep specific prefixes
  externalSystems: { enabled: true, baseUrl: "", healthPath: "/health", timeoutMs: 5000 },
  nurses: { enabled: true, baseUrl: "", healthPath: "/health/master", timeoutMs: 5000 },
  khanza: { enabled: true, baseUrl: "/khanza", healthPath: "/health", timeoutMs: 5000 },
  simrs_universal: { enabled: true, baseUrl: "/simrs-universal", healthPath: "/health", timeoutMs: 5000 },
  satusehatMonitor: { enabled: true, baseUrl: "", healthPath: "/health/pacs", timeoutMs: 10000 },
  inspector: { enabled: true, baseUrl: "", healthPath: "/api/inspector/v1/health", timeoutMs: 5000 },

  // Clinical Annotations & Measurements
  measurements: {
    enabled: true,
    baseUrl: "",
    healthPath: "/api/health",
    timeoutMs: 5000
  }
};

let currentRegistry = { ...DEFAULT_REGISTRY };
const listeners = new Set();

// Debug logging for initialization
if (typeof window !== 'undefined') {
  window.__API_REGISTRY__ = currentRegistry;
}

export const loadRegistry = () => {
  // Ensure all latest default modules are present
  const merged = { ...DEFAULT_REGISTRY, ...currentRegistry };
  
  if (!merged.users || !merged.studies) {
    console.warn('[api-registry] critical modules missing, reinitializing');
    currentRegistry = { ...DEFAULT_REGISTRY };
    return currentRegistry;
  }
  
  return merged;
};
export const saveRegistry = (newRegistry) => {
  currentRegistry = { ...newRegistry };
  listeners.forEach(cb => cb(currentRegistry));
};
export const onRegistryChanged = (cb) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
export const isKhanzaActive = () => currentRegistry.khanza?.enabled || false;
export const getKhanzaApiConfig = () => currentRegistry.khanza || DEFAULT_REGISTRY.khanza;

export default DEFAULT_REGISTRY;
