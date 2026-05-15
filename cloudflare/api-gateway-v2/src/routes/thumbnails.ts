/**
 * Optimized Studies & Thumbnail Routes
 * Orchestrated via Cloudflare Durable Objects + R2 Cache
 */
import { Hono } from 'hono';
import type { AppContext } from '../types';

export const thumbnailRoutes = new Hono<AppContext>();

// Unified route for Thumbnail, Rendered (JPEG), and Original DICOM
// Handles paths like: 
//   /api/studies/:study/series/:series/instances/:instance/thumbnail
//   /api/studies/:study/series/:series/instances/:instance/rendered
//   /api/studies/:study/series/:series/instances/:instance/original (DICOM)
thumbnailRoutes.get('/api/studies/:studyId/series/:seriesId/instances/:instanceId/:type', async (c) => {
  const { studyId, seriesId, instanceId, type } = c.req.param();
  const search = new URL(c.req.url).search;
  
  if (!['thumbnail', 'rendered', 'original'].includes(type)) {
    return c.json({ error: 'Invalid resource type' }, 400);
  }

  // Generate a consistent ID based on the instance, but include type in DO routing
  // Note: We use the instance ID as the DO name so all requests for that instance 
  // (thumb, rendered, original) are coordinated by the same DO for maximum efficiency.
  const doId = c.env.THUMBNAIL_DO.idFromName(instanceId);
  const stub = c.env.THUMBNAIL_DO.get(doId);
  
  // Forward to Durable Object
  return stub.fetch(c.req.raw);
});

// Backward compatibility for old thumbnail route
thumbnailRoutes.get('/api/thumbnail/studies/:studyId/series/:seriesId/instances/:instanceId', async (c) => {
  const { studyId, seriesId, instanceId } = c.req.param();
  const doId = c.env.THUMBNAIL_DO.idFromName(instanceId);
  const stub = c.env.THUMBNAIL_DO.get(doId);
  
  // Rewrite internal path for DO to handle it as 'thumbnail' type
  const url = new URL(c.req.url);
  url.pathname = `/api/studies/${studyId}/series/${seriesId}/instances/${instanceId}/thumbnail`;
  return stub.fetch(new Request(url.toString(), c.req.raw));
});
