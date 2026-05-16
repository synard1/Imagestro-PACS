/**
 * Optimized Studies & Thumbnail Routes
 * Orchestrated via Cloudflare Durable Objects + R2 Cache
 * 
 * These routes bypass the legacy Zero Trust middleware because:
 * 1. The DO handles auth forwarding to PACS directly
 * 2. Cached responses (R2 HIT) don't need auth validation
 * 3. The PACS service validates auth on its own for cache misses
 */
import { Hono } from 'hono';
import type { AppContext } from '../types';

export const thumbnailRoutes = new Hono<AppContext>();

/**
 * Build a request to forward to the Durable Object with all necessary headers.
 * Ensures auth, tenant, and request-id headers are propagated.
 */
function buildDORequest(c: any): Request {
  const headers = new Headers(c.req.raw.headers);
  
  // Ensure tenant headers are present (may come from JWT via gateway)
  const tenantId = c.req.header('x-tenant-id') || '';
  if (tenantId) {
    headers.set('X-Tenant-ID', tenantId);
    headers.set('X-Hospital-ID', tenantId);
  }
  
  // Ensure request ID is propagated
  const requestId = c.req.header('x-request-id') || '';
  if (requestId) {
    headers.set('X-Request-ID', requestId);
  }

  return new Request(c.req.url, {
    method: c.req.method,
    headers,
  });
}

// Unified route for Thumbnail, Rendered (JPEG), and Original DICOM
// Handles paths like: 
//   /api/studies/:study/series/:series/instances/:instance/thumbnail
//   /api/studies/:study/series/:series/instances/:instance/rendered
//   /api/studies/:study/series/:series/instances/:instance/original (DICOM)
thumbnailRoutes.get('/api/studies/:studyId/series/:seriesId/instances/:instanceId/:type', async (c) => {
  const { type, instanceId } = c.req.param();
  
  if (!['thumbnail', 'rendered', 'original'].includes(type)) {
    return c.json({ error: 'Invalid resource type' }, 400);
  }

  // Use the instance ID as the DO name so all requests for that instance 
  // (thumb, rendered, original) are coordinated by the same DO.
  const doId = c.env.THUMBNAIL_DO.idFromName(instanceId);
  const stub = c.env.THUMBNAIL_DO.get(doId);
  
  // Forward to Durable Object with all headers
  return stub.fetch(buildDORequest(c));
});

// Also handle HEAD requests (used by service workers for cache validation)
thumbnailRoutes.on('HEAD', '/api/studies/:studyId/series/:seriesId/instances/:instanceId/:type', async (c) => {
  const { type, instanceId } = c.req.param();
  
  if (!['thumbnail', 'rendered', 'original'].includes(type)) {
    return c.json({ error: 'Invalid resource type' }, 400);
  }

  const doId = c.env.THUMBNAIL_DO.idFromName(instanceId);
  const stub = c.env.THUMBNAIL_DO.get(doId);
  
  return stub.fetch(buildDORequest(c));
});

// Backward compatibility for old thumbnail route
thumbnailRoutes.get('/api/thumbnail/studies/:studyId/series/:seriesId/instances/:instanceId', async (c) => {
  const { studyId, seriesId, instanceId } = c.req.param();
  const doId = c.env.THUMBNAIL_DO.idFromName(instanceId);
  const stub = c.env.THUMBNAIL_DO.get(doId);
  
  // Rewrite internal path for DO to handle it as 'thumbnail' type
  const url = new URL(c.req.url);
  url.pathname = `/api/studies/${studyId}/series/${seriesId}/instances/${instanceId}/thumbnail`;
  
  const headers = new Headers(c.req.raw.headers);
  return stub.fetch(new Request(url.toString(), { method: 'GET', headers }));
});
