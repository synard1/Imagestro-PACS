/**
 * API Gateway v2 — Cloudflare Workers + Hono
 */

import { Hono } from 'hono';
import { logger } from 'hono/logger';
import type { AppContext } from './types';

// Middleware
import { corsMiddleware } from './middleware/cors';
import { requestIdMiddleware } from './middleware/request-id';
import { bodySizeLimitMiddleware } from './middleware/body-size-limit';
import { securityHeadersMiddleware } from './middleware/security-headers';

// Routes
import { healthRoutes } from './routes/health';
import { accessionRoutes } from './routes/accession';
import { authRoutes } from './routes/auth';
import { masterDataRoutes } from './routes/master-data';
import { orderRoutes } from './routes/orders';
import { thumbnailRoutes } from './routes/thumbnails';
import { legacyRoutes } from './routes/legacy';

// Durable Objects
export { InfrastructureHealthSQLite } from './objects/InfrastructureHealthDO';
export { ThumbnailGeneratorSQLite } from './objects/ThumbnailGeneratorDO';

// ─── App Setup ────────────────────────────────────────────────────────────────

const app = new Hono<AppContext>();

// ─── Middleware Chain ──────────────────────────────────────────────────────────

app.use('*', logger());
app.use('*', corsMiddleware);
app.use('*', requestIdMiddleware);
app.use('*', bodySizeLimitMiddleware);
app.use('*', securityHeadersMiddleware);

// ─── Route Mounting ───────────────────────────────────────────────────────────

// Health & gateway admin
app.route('', healthRoutes);

// Thumbnail Orchestration
app.route('', thumbnailRoutes);

// Worker routes (Service Bindings)
app.route('', accessionRoutes);
app.route('', authRoutes);
app.route('', masterDataRoutes);
app.route('', orderRoutes);

// Legacy backend proxies (VPC tunnel)
app.route('', legacyRoutes);

// ─── Explicit 404 ──────────────────────────────────────────────────────────────

app.all('*', (c) => {
  return c.json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${c.req.method} ${c.req.path} not found`,
    },
  }, 404);
});

export default app;
