/**
 * Health & gateway admin routes.
 */

import { Hono } from 'hono';
import type { AppContext } from '../types';
import { VERSION } from '../utils/constants';
import { getAuthContext } from '../utils/auth';
import { getAllCircuits } from '../utils/circuit-breaker';
import { proxyRequest } from '../services/proxy';

export const healthRoutes = new Hono<AppContext>();

// Root info
healthRoutes.get('/', (c) => c.json({ status: 'ok', service: 'api-gateway', version: VERSION }));

// WebSocket Real-time Health
healthRoutes.get('/ws/health', async (c) => {
  const upgradeHeader = c.req.header('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return c.text('Expected Upgrade: websocket', 426);
  }
  const id = c.env.HEALTH_DO.idFromName('global_infrastructure_health');
  const obj = c.env.HEALTH_DO.get(id);
  return obj.fetch(c.req.raw);
});

// Infrastructure health (Aggregated via Durable Object)
healthRoutes.get('/api/health', async (c) => {
  const ip = c.req.header('cf-connecting-ip') || 'anonymous';
  if (c.env.HEALTH_RATE_LIMITER) {
    const { success } = await c.env.HEALTH_RATE_LIMITER.limit({ key: ip });
    if (!success) return c.json({ success: false, error: 'Too Many Requests' }, 429);
  }
  const id = c.env.HEALTH_DO.idFromName('global_infrastructure_health');
  const obj = c.env.HEALTH_DO.get(id);
  return obj.fetch(c.req.raw);
});

// Health history (from SQLite in DO)
healthRoutes.get('/api/health/history', async (c) => {
  const id = c.env.HEALTH_DO.idFromName('global_infrastructure_health');
  const obj = c.env.HEALTH_DO.get(id);
  const doUrl = new URL('https://health-do/history');
  return obj.fetch(new Request(doUrl.toString()));
});

// Per-service legacy health (Direct proxy)
healthRoutes.get('/health/:service', async (c) => {
  const service = c.req.param('service');
  const mapping: Record<string, string> = {
    auth: `${c.env.AUTH_SERVICE_URL}/health`,
    pacs: `${c.env.PACS_SERVICE_URL}/api/health`,
    master: `${c.env.MASTER_DATA_SERVICE_URL}/health`,
    order: `${c.env.ORDER_SERVICE_URL}/health`,
    mwl: `${c.env.MWL_SERVICE_URL}/health`,
    simrs: `${c.env.SIMRS_UNIVERSAL_URL}/health`,
  };
  if (mapping[service]) return proxyRequest(c, '', mapping[service], {}, service);
  return c.json({ status: 'unknown', service }, 404);
});

// Circuit breaker status (superadmin only)
healthRoutes.get('/gateway/circuits', async (c) => {
  const { role } = await getAuthContext(c);
  if (role !== 'superadmin') return c.json({ error: 'Forbidden' }, 403);
  return c.json({ circuits: getAllCircuits() });
});
