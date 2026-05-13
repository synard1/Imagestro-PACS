import { Hono } from 'hono';
import type { Env } from '../types';

const healthRoute = new Hono<{ Bindings: Env }>();

healthRoute.get('/health', (c) => {
  return c.json({ status: 'ok', service: 'tenant-seeding-worker' });
});

export { healthRoute };
