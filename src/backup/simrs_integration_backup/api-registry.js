// src/services/api-registry.js
// Changed to v3 to update worklist baseUrl to 103.42.117.19:8888
const LS_KEY = "api.registry.v3";

export const DEFAULT_REGISTRY = {
  // module/service level toggles + endpoint
  dashboard: {
    enabled: false,
    baseUrl: "http://localhost:8080",
    healthPath: "/api/health",
    timeoutMs: 6000,
  },
  auth: {
    enabled: false,
    baseUrl: "http://103.42.117.19:8888",
    healthPath: "/health",
    timeoutMs: 6000,
    loginPath: "/auth/login",
    debug: false,
  },
  worklist: {
    enabled: true,
    baseUrl: "http://localhost:8003", // API Gateway
    healthPath: "/health",
    timeoutMs: 6000,
    endpoints: {
      list: "/api/worklist",
      get: "/api/worklist/:id",
      summary: "/api/worklist/summary",
      updateStatus: "/api/orders/:id/status",
      reschedule: "/api/orders/:id/reschedule",
      cancel: "/api/orders/:id/cancel",
      slots: "/api/schedule/slots",
      bookSlot: "/api/schedule/slots/:id/book"
    },
    debug: false,
  },
  // Point orders module to the API Gateway
  orders: {
    enabled: true,
    baseUrl: "http://103.42.117.19:8888",
    healthPath: "/health",
    timeoutMs: 6000,
  },
  patients: {
    enabled: true,
    baseUrl: "http://103.42.117.19:8888",
    healthPath: "/health",
    timeoutMs: 6000,
  },
  doctors: {
    enabled: true,
    baseUrl: "http://103.42.117.19:8888",
    healthPath: "/health",
    timeoutMs: 6000,
  },
  procedures: {
    enabled: true,
    baseUrl: "http://103.42.117.19:8888",
    healthPath: "/health",
    timeoutMs: 6000,
  },
  mappings: {
    enabled: true,
    baseUrl: "http://103.42.117.19:8888",
    healthPath: "/health",
    timeoutMs: 6000,
  },
  externalSystems: {
    enabled: true,
    baseUrl: "http://103.42.117.19:8888",
    healthPath: "/health",
    timeoutMs: 6000,
  },
  modalities: {
    enabled: false,
    baseUrl: "http://localhost:8085",
    healthPath: "/api/health",
    timeoutMs: 6000,
  },
  nodes: {
    enabled: true,
    baseUrl: "http://localhost:8003",
    healthPath: "/api/health",
    timeoutMs: 6000,
  },
  // User management now points to API Gateway and is enabled by default
  users: {
    enabled: true,
    baseUrl: "http://103.42.117.19:8888",
    healthPath: "/health",
    timeoutMs: 6000,
  },
  auth_audit: {
    enabled: true,
    baseUrl: "http://103.42.117.19:8888",
    healthPath: "/health",
    timeoutMs: 6000,
  },
  audit: {
    enabled: true,
    baseUrl: "http://localhost:8003",
    healthPath: "/api/health",
    timeoutMs: 6000,
  },
  storage_config: {
    enabled: true,
    baseUrl: "http://localhost:8003",
    healthPath: "/api/health",
    timeoutMs: 6000,
  },
  // Settings service through API Gateway
  settings: {
    enabled: true,
    baseUrl: "http://103.42.117.19:8888",
    healthPath: "/health",
    timeoutMs: 6000,
    debug: false,
  },
  satusehat: {
    enabled: true,
    restApiUrl: "https://api-satusehat-stg.dto.kemkes.go.id",
    timeoutMs: 10000,
    env: "sandbox",
    clientId: "",
    clientSecret: "",
    organizationId: "",
    tokenEndpoint:
      "https://api-satusehat-stg.dto.kemkes.go.id/oauth2/v1/accesstoken",
  },
  // Separate backend for SatuSehat monitoring (orders + file status),
  // independent from core orders backend.
  satusehatMonitor: {
    enabled: true,
    baseUrl: "http://103.42.117.19:8888",
    healthPath: "/api/health",
    timeoutMs: 10000,
    auth: "basic",
    basicUser: "admin",
    basicPass: "password123",
  },
  // Reports service through API Gateway
  reports: {
    enabled: true,
    baseUrl: "http://103.42.117.19:8888",
    healthPath: "/health",
    timeoutMs: 6000,
    debug: false,
  },
  // Studies service (DICOM studies management)
  studies: {
    enabled: true,
    baseUrl: "http://localhost:8003",
    healthPath: "/health",
    timeoutMs: 6000,
    debug: false,
  },
  // Measurements service (DICOM viewer measurements)
  measurements: {
    enabled: true,
    baseUrl: "http://localhost:8003",
    healthPath: "/api/health",
    timeoutMs: 6000,
    debug: false,
    endpoints: {
      create: "/api/measurements",
      bulk: "/api/measurements/bulk",
      getByStudy: "/api/measurements/study/:studyUID",
      delete: "/api/measurements/:id",
      deleteByStudy: "/api/measurements/study/:studyUID"
    }
  },
};

export function loadRegistry() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...DEFAULT_REGISTRY };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_REGISTRY, ...parsed };
  } catch {
    return { ...DEFAULT_REGISTRY };
  }
}

export function saveRegistry(reg) {
  localStorage.setItem(LS_KEY, JSON.stringify(reg));
  window.dispatchEvent(
    new CustomEvent("api:registry:changed", { detail: reg })
  );
}

export function onRegistryChanged(cb) {
  const h = (e) => cb(e.detail ?? loadRegistry());
  window.addEventListener("api:registry:changed", h);
  const s = (e) => {
    if (e.key === LS_KEY) cb(loadRegistry());
  };
  window.addEventListener("storage", s);
  return () => {
    window.removeEventListener("api:registry:changed", h);
    window.removeEventListener("storage", s);
  };
}

// Helper function to reset registry to defaults
export function resetRegistry() {
  localStorage.removeItem("api.registry.v1"); // Remove old version
  localStorage.removeItem("api.registry.v2"); // Remove old version
  localStorage.removeItem("api.registry.v3"); // Remove current version
  window.dispatchEvent(
    new CustomEvent("api:registry:changed", { detail: DEFAULT_REGISTRY })
  );
  return DEFAULT_REGISTRY;
}
