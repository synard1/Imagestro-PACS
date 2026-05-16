/**
 * Legacy backend proxy routes.
 * Routes to Flask services via VPC tunnel (BACKBONE binding).
 * These will be gradually migrated to dedicated workers.
 */

import { Hono } from 'hono';
import type { AppContext } from '../types';
import { getAuthContext } from '../utils/auth';
import { proxyRequest } from '../services/proxy';

export const legacyRoutes = new Hono<AppContext>();

// ─── Zero Trust Middleware (for /api/* legacy routes) ─────────────────────────
// NOTE: Legacy backend services validate auth themselves.
// Gateway only validates JWT when it can (matching JWT_SECRET).
// If validation fails, we still forward to backend — it will reject if unauthorized.
// This allows tokens signed by legacy auth-service (different secret) to pass through.

legacyRoutes.use('/api/*', async (c, next) => {
  const path = c.req.path.replace(/^\/api/, '').replace(/^\/v1/, '');
  const publicPaths = ['/health', '/auth/forgot-password', '/csrf/token'];
  const isPublic = publicPaths.some(p => path.startsWith(p));
  const isAuth = path.startsWith('/auth/');

  if (isPublic || isAuth) return next();

  // Try to extract auth context — if it works, great (injects tenant headers).
  // If it fails (different JWT secret), still forward — backend validates itself.
  const { tenant_id, role } = await getAuthContext(c);
  
  // Only block if there's NO authorization at all (truly unauthenticated)
  const hasAuthHeader = !!c.req.header('Authorization');
  const hasCookie = !!c.req.header('Cookie');
  const hasTokenParam = !!c.req.query('token') || !!c.req.query('access_token');
  
  if (!tenant_id && !hasAuthHeader && !hasCookie && !hasTokenParam) {
    console.warn(`[ZeroTrust] No credentials at all for ${c.req.path}`);
    return c.json({ 
      success: false, 
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' } 
    }, 401);
  }
  
  return next();
});

// ─── WADO-RS (DICOM image retrieval) ──────────────────────────────────────────

legacyRoutes.all('/wado-rs/*', (c) => {
  let path = c.req.path.replace(/^\/api/, '').replace(/^\/wado-rs\//, '');
  if (path.startsWith('v2/')) path = path.substring(3);
  return proxyRequest(c, c.env.PACS_SERVICE_URL, `wado-rs/${path}`, {}, 'pacs');
});

// ─── Users (via auth service) ─────────────────────────────────────────────────

legacyRoutes.all('/users/*', (c) =>
  proxyRequest(c, c.env.AUTH_SERVICE_URL, `auth/${c.req.path.replace(/^\/api/, '').replace(/^\/v1/, '')}`, {}, 'auth-flask')
);

// ─── Orders ───────────────────────────────────────────────────────────────────

legacyRoutes.get('/orders', (c) => proxyRequest(c, c.env.ORDER_SERVICE_URL, 'orders/list', {}, 'orders'));
legacyRoutes.all('/orders/*', (c) =>
  proxyRequest(c, c.env.ORDER_SERVICE_URL, c.req.path.replace(/^\/api/, '').replace(/^\/v1/, ''), {}, 'orders')
);

// ─── Worklist (MWL) ───────────────────────────────────────────────────────────

legacyRoutes.all('/worklist*', (c) =>
  proxyRequest(c, c.env.MWL_SERVICE_URL, c.req.path.replace(/^\/api/, '').replace(/^\/v1/, ''), {}, 'mwl')
);

// ─── Khanza (SIMRS integration) ──────────────────────────────────────────────

legacyRoutes.all('/khanza/mappings/*', (c) =>
  proxyRequest(c, c.env.PACS_SERVICE_URL, `api/${c.req.path.replace(/^\/api/, '').replace(/^\/v1/, '')}`, {}, 'pacs')
);
legacyRoutes.all('/khanza/import-history/*', (c) =>
  proxyRequest(c, c.env.PACS_SERVICE_URL, `api/${c.req.path.replace(/^\/api/, '').replace(/^\/v1/, '')}`, {}, 'pacs')
);
legacyRoutes.all('/khanza/*', (c) => {
  const kp = c.req.path.replace(/^\/api/, '').replace(/^\/v1/, '').replace(/^\/khanza\//, '');
  const target = kp.startsWith('api/') ? kp : `api/${kp}`;
  return proxyRequest(c, c.env.KHANZA_API_URL, target, { 'X-API-Key': c.env.KHANZA_INTERNAL_KEY }, 'khanza');
});

// ─── SIMRS Universal ──────────────────────────────────────────────────────────

legacyRoutes.all('/simrs-universal/*', (c) =>
  proxyRequest(c, c.env.SIMRS_UNIVERSAL_URL, c.req.path.replace(/.*simrs-universal\//, ''), {}, 'simrs')
);
legacyRoutes.all('/radiology/*', (c) =>
  proxyRequest(c, c.env.SIMRS_UNIVERSAL_URL, c.req.path.replace(/^\/api/, '').replace(/^\/v1/, ''), {}, 'simrs')
);

// ─── SatuSehat (FHIR integration) ────────────────────────────────────────────

legacyRoutes.all('/satusehat/*', (c) =>
  proxyRequest(c, c.env.SATUSEHAT_INTEGRATOR_URL, c.req.path.replace(/.*satusehat\//, ''), {}, 'satusehat')
);
legacyRoutes.all('/fhir/*', (c) =>
  proxyRequest(c, c.env.SATUSEHAT_INTEGRATOR_URL, c.req.path.replace(/^\/api/, '').replace(/^\/v1/, ''), {}, 'satusehat')
);
legacyRoutes.all('/monitor/satusehat/*', (c) =>
  proxyRequest(c, c.env.SATUSEHAT_INTEGRATOR_URL, c.req.path.replace(/.*monitor\//, ''), {}, 'satusehat')
);

// ─── DICOM upload ─────────────────────────────────────────────────────────────

legacyRoutes.all('/dicom/upload', (c) => proxyRequest(c, c.env.PACS_SERVICE_URL, 'api/dicom/upload', {}, 'pacs'));
legacyRoutes.all('/dicom/bulk', (c) => proxyRequest(c, c.env.PACS_SERVICE_URL, 'api/dicom/bulk', {}, 'pacs'));

// ─── PACS catch-all for /api/* routes ─────────────────────────────────────────
// Routes like /api/tenants, /api/studies, /api/audit/logs, /api/storage-*,
// /api/v1/settings/*, etc. are served by the PACS backend.
// This MUST be the last route in this file (lowest priority).

legacyRoutes.all('/api/*', (c) => {
  const path = c.req.path.replace(/^\/api/, '').replace(/^\/v1/, '');
  const targetPath = path.startsWith('/api/') ? path.substring(1) : `api/${path.replace(/^\//, '')}`;
  return proxyRequest(c, c.env.PACS_SERVICE_URL, targetPath, {}, 'pacs');
});
