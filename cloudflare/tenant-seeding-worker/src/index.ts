import { Hono } from 'hono';
import type { Env } from './types';
import type { D1Logger } from '../../shared/logger';
import { requestIdMiddleware, type RequestIdVariables } from './middleware/request-id';
import { createLoggerMiddleware } from '../../shared/logger-middleware';
import { seedRoute } from './routes/seed';
import { manualRoute } from './routes/manual';
import { statusRoute } from './routes/status';
import { healthRoute } from './routes/health';

type Variables = RequestIdVariables & {
  logger: D1Logger;
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Global middleware
app.use('*', requestIdMiddleware);
app.use('*', createLoggerMiddleware('tenant-seeding-worker') as any);

// Mount route handlers
app.route('/', seedRoute);
app.route('/', manualRoute);
app.route('/', statusRoute);
app.route('/', healthRoute);

export default app;
