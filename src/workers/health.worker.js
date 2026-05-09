/**
 * Health Monitor Web Worker - v2.0
 * Berjalan di background untuk memantau kesehatan semua microservices.
 */

const healthCache = new Map();
const CACHE_TTL = 30000; // Cache 30 detik
let intervalId = null;
let currentRegistry = {};

async function fetchHealth(url, moduleName) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), 8000);

  try {
    const startTime = Date.now();
    // Gunakan absolute URL agar jelas di tab Network
    const absoluteUrl = url.startsWith('http') ? url : `${self.location.origin}${url}`;
    
    const res = await fetch(absoluteUrl, {
      signal: ctrl.signal,
      cache: 'no-store',
      headers: { 'Accept': 'application/json' }
    });
    
    const responseTime = Date.now() - startTime;
    let data = null;
    
    if (res.ok) {
      try {
        data = await res.json();
      } catch (e) {
        data = { status: 'ok', msg: 'Plain response' };
      }
    }

    clearTimeout(id);
    return {
      healthy: res.ok,
      status: res.status,
      responseTime,
      data,
      url: absoluteUrl,
      lastCheck: new Date().toISOString()
    };
  } catch (err) {
    clearTimeout(id);
    return {
      healthy: false,
      status: 0,
      error: err.name === 'AbortError' ? 'Timeout' : err.message,
      url: url,
      lastCheck: new Date().toISOString()
    };
  }
}

async function checkAll(registry) {
  const results = {};
  const tasks = Object.entries(registry)
    .filter(([_, config]) => config.enabled && config.healthPath)
    .map(async ([name, config]) => {
      // Tentukan URL berdasarkan baseUrl dan healthPath
      let url = config.baseUrl || "";
      if (url.endsWith('/')) url = url.slice(0, -1);
      const path = config.healthPath.startsWith('/') ? config.healthPath : `/${config.healthPath}`;
      const fullUrl = `${url}${path}`;

      // Check Cache
      const cached = healthCache.get(fullUrl);
      if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
        results[name] = cached.data;
        return;
      }

      const status = await fetchHealth(fullUrl, name);
      results[name] = status;
      healthCache.set(fullUrl, { data: status, timestamp: Date.now() });
    });

  await Promise.all(tasks);
  self.postMessage({ type: 'HEALTH_UPDATE', results });
}

self.onmessage = (e) => {
  const { type, registry, intervalMs } = e.data;
  if (type === 'START') {
    currentRegistry = registry || {};
    if (intervalId) clearInterval(intervalId);
    checkAll(currentRegistry);
    intervalId = setInterval(() => checkAll(currentRegistry), intervalMs || 30000);
  }
  if (type === 'CHECK_NOW') {
    checkAll(currentRegistry);
  }
};
