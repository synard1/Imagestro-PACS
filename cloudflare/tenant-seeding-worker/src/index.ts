import { Hono } from 'hono';
import type { Env } from './types';
import { requestIdMiddleware, type RequestIdVariables } from './middleware/request-id';
import { seedRoute } from './routes/seed';
import { manualRoute } from './routes/manual';
import { statusRoute } from './routes/status';
import { healthRoute } from './routes/health';

const app = new Hono<{ Bindings: Env; Variables: RequestIdVariables }>();

// Global middleware
app.use('*', requestIdMiddleware);

// Mount route handlers
app.route('/', seedRoute);
app.route('/', manualRoute);
app.route('/', statusRoute);
app.route('/', healthRoute);

export default app;
