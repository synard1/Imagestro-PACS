// Centralized Axios instance for dev & prod
import axios from "axios";

// Priority: .env → runtime injected → fallback '/api'
const API_BASE =
  import.meta.env.VITE_API_BASE_URL ??
  (typeof window !== "undefined" && window.__API_BASE_URL__) ??
  "/api";

export const http = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  timeout: 20000,
});

// --- Request: inject bearer token if present
http.interceptors.request.use((cfg) => {
  try {
    const t = localStorage.getItem("access_token");
    if (t) cfg.headers.Authorization = `Bearer ${t}`;
  } catch {}
  return cfg;
});

// --- Response: minimal refresh flow (optional)
let refreshing = false;
let waiters = [];

http.interceptors.response.use(
  (r) => r,
  async (err) => {
    const { response, config } = err || {};
    if (!response) throw err; // Network/CORS

    // retry once after refresh
    if (response.status === 401 && !config._retry) {
      if (refreshing) {
        await new Promise((res) => waiters.push(res));
        config.headers.Authorization = `Bearer ${
          localStorage.getItem("access_token") || ""
        }`;
        config._retry = true;
        return http(config);
      }
      try {
        refreshing = true;
        const rt = localStorage.getItem("refresh_token");
        if (!rt) throw err;
        const r = await axios.post(
          `${API_BASE}/auth/refresh`,
          { refresh_token: rt },
          { withCredentials: true }
        );
        localStorage.setItem("access_token", r.data?.access_token || "");
        waiters.forEach((w) => w());
        waiters = [];
        config.headers.Authorization = `Bearer ${r.data?.access_token || ""}`;
        config._retry = true;
        return http(config);
      } catch (e) {
        waiters.forEach((w) => w());
        waiters = [];
        localStorage.removeItem("access_token");
        // optional: redirect login
        // window.location.assign('/login')
        throw e;
      } finally {
        refreshing = false;
      }
    }

    throw err;
  }
);
