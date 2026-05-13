import { Hono } from 'hono';
import type { Env, SeedingStatus } from '../types';

const statusRoute = new Hono<{ Bindings: Env }>();

statusRoute.get('/seed/status/:tenant_id', async (c) => {
  const tenantId = c.req.param('tenant_id');

  const raw = await c.env.API_CACHE.get(`seed:${tenantId}`);

  if (!raw) {
    return c.json({ error: 'Not found' }, 404);
  }

  const status: SeedingStatus = JSON.parse(raw);
  return c.json(status, 200);
});

export { statusRoute };
