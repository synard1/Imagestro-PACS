/**
 * Studies & Thumbnail Routes
 * 
 * When THUMBNAIL_CACHE_ENABLED=true (default):
 *   Uses Durable Objects + R2 for caching thumbnails.
 * 
 * When THUMBNAIL_CACHE_ENABLED=false:
 *   Bypasses cache entirely — proxies directly to PACS via BACKBONE tunnel.
 *   This is the "original" behavior before caching was introduced.
 */
import { Hono } from 'hono';
import type { AppContext } from '../types';
import { proxyRequest } from '../services/proxy';

export const thumbnailRoutes = new Hono<AppContext>();

/**
 * Check if thumbnail caching is enabled via env var.
 */
function isCacheEnabled(env: any): boolean {
  const val = env.THUMBNAIL_CACHE_ENABLED;
  // Default to false (disabled) until cache is proven stable
  if (!val) return false;
  return val === 'true' || val === '1';
}

/**
 * Direct proxy to PACS — no caching, no DO.
 * Converts /api/studies/... path to /wado-rs/studies/... for PACS.
 * Also converts ?token= query param to Authorization header if needed.
 */
async function proxyToPacs(c: any): Promise<Response> {
  const path = c.req.path;
  // Convert /api/studies/... → wado-rs/studies/...
  const wadoPath = path.replace(/^\/api\//, 'wado-rs/');
  
  // If token is in query param but not in Authorization header, inject it
  const tokenParam = c.req.query('token') || c.req.query('access_token');
  const hasAuthHeader = !!c.req.header('Authorization');
  
  const extraHeaders: Record<string, string> = {};
  if (tokenParam && !hasAuthHeader) {
    extraHeaders['Authorization'] = `Bearer ${tokenParam}`;
  }
  
  return proxyRequest(c, c.env.PACS_SERVICE_URL, wadoPath, extraHeaders, 'pacs');
}

/**
 * Build a request to forward to the Durable Object with all necessary headers.
 */
function buildDORequest(c: any): Request {
  const headers = new Headers(c.req.raw.headers);
  
  const tenantId = c.req.header('x-tenant-id') || '';
  if (tenantId) {
    headers.set('X-Tenant-ID', tenantId);
    headers.set('X-Hospital-ID', tenantId);
  }
  
  const requestId = c.req.header('x-request-id') || '';
  if (requestId) {
    headers.set('X-Request-ID', requestId);
  }

  return new Request(c.req.url, {
    method: c.req.method,
    headers,
  });
}

// ─── Main route: /api/studies/:study/series/:series/instances/:instance/:type ──

thumbnailRoutes.get('/api/studies/:studyId/series/:seriesId/instances/:instanceId/:type', async (c) => {
  const { type, instanceId } = c.req.param();
  
  if (!['thumbnail', 'rendered', 'original'].includes(type)) {
    return c.json({ error: 'Invalid resource type' }, 400);
  }

  // If cache disabled, proxy directly to PACS
  if (!isCacheEnabled(c.env)) {
    return proxyToPacs(c);
  }

  // Cache enabled — use Durable Object
  const doId = c.env.THUMBNAIL_DO.idFromName(instanceId);
  const stub = c.env.THUMBNAIL_DO.get(doId);
  return stub.fetch(buildDORequest(c));
});

// HEAD requests
thumbnailRoutes.on('HEAD', '/api/studies/:studyId/series/:seriesId/instances/:instanceId/:type', async (c) => {
  const { type, instanceId } = c.req.param();
  
  if (!['thumbnail', 'rendered', 'original'].includes(type)) {
    return c.json({ error: 'Invalid resource type' }, 400);
  }

  if (!isCacheEnabled(c.env)) {
    return proxyToPacs(c);
  }

  const doId = c.env.THUMBNAIL_DO.idFromName(instanceId);
  const stub = c.env.THUMBNAIL_DO.get(doId);
  return stub.fetch(buildDORequest(c));
});

// Backward compatibility: /api/thumbnail/studies/...
thumbnailRoutes.get('/api/thumbnail/studies/:studyId/series/:seriesId/instances/:instanceId', async (c) => {
  const { studyId, seriesId, instanceId } = c.req.param();

  if (!isCacheEnabled(c.env)) {
    return proxyToPacs(c);
  }

  const doId = c.env.THUMBNAIL_DO.idFromName(instanceId);
  const stub = c.env.THUMBNAIL_DO.get(doId);
  
  const url = new URL(c.req.url);
  url.pathname = `/api/studies/${studyId}/series/${seriesId}/instances/${instanceId}/thumbnail`;
  const headers = new Headers(c.req.raw.headers);
  return stub.fetch(new Request(url.toString(), { method: 'GET', headers }));
});
