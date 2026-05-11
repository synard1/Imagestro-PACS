// Single source of truth untuk semua backend endpoint URL.
// Gunakan ini di seluruh codebase — jangan hardcode IP/URL langsung.
const isDev = import.meta.env.DEV;

export const ENDPOINTS = {
  mainApi: import.meta.env.VITE_MAIN_API_BACKEND_URL || (isDev ? 'http://localhost:8003' : ''),
  pacsApi: import.meta.env.VITE_MAIN_PACS_API_BACKEND_URL || (isDev ? 'http://localhost:8888' : ''),
};

export function getPacsBackendUrl() {
  return ENDPOINTS.pacsApi;
}

export function getMainApiUrl() {
  return ENDPOINTS.mainApi;
}
