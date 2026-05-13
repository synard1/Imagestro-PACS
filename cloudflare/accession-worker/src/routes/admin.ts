/**
 * Admin routes — admin-only maintenance endpoints.
 *
 * - POST /admin/run-job/:name — invoke idempotency_cleanup or soft_delete_purge on demand
 * - POST /admin/revoke-jti — push a jti into the in-memory revocation cache
 *
 * Requirements: 12.12, 19.6
 */

import { Hono } from 'hono';
import type { Env, TenantContext } from '../types';
import { ForbiddenError, ValidationError } from '../errors';
import { revokeJti } from '../middleware/tenant';
import { idempotencyCleanupJob } from '../jobs/idempotency-cleanup';
import { softDeletePurgeJob } from '../jobs/soft-delete-purge';

type Variables = { tenant: TenantContext };

const adminRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// Require admin role for all admin endpoints
adminRoutes.use('*', async (c, next) => {
  const tenant = c.get('tenant');
  if (!tenant?.roles?.includes('admin')) {
    throw new ForbiddenError('Admin role required');
  }
  await next();
});

// POST /admin/run-job/:name
adminRoutes.post('/admin/run-job/:name', async (c) => {
  const jobName = c.req.param('name');

  switch (jobName) {
    case 'idempotency_cleanup': {
      const result = await idempotencyCleanupJob(c.env);
      return c.json(result, 200);
    }
    case 'soft_delete_purge': {
      const result = await softDeletePurgeJob(c.env);
      return c.json(result, 200);
    }
    default:
      throw new ValidationError([{ field: 'name', message: `Unknown job: ${jobName}. Valid jobs: idempotency_cleanup, soft_delete_purge` }]);
  }
});

// POST /admin/revoke-jti
adminRoutes.post('/admin/revoke-jti', async (c) => {
  const body = await c.req.json<{ jti?: string }>();
  if (!body.jti || typeof body.jti !== 'string') {
    throw new ValidationError([{ field: 'jti', message: 'jti is required and must be a string' }]);
  }

  revokeJti(body.jti);
  return c.json({ revoked: true, jti: body.jti }, 200);
});

export { adminRoutes };
export default adminRoutes;
