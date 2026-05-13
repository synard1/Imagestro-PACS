/**
 * Unit tests for rate-limit middleware.
 *
 * Validates: Requirements 12.8, 12.9
 */

import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { rateLimitMiddleware } from '../src/middleware/rate-limit';
import type { Env, TenantContext } from '../src/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createMockRateLimiter(success: boolean) {
  return {
    limit: vi.fn().mockResolvedValue({ success }),
  };
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as any,
    CIRCUIT_BREAKER_DO: {} as any,
    METRICS: {} as any,
    RATE_LIMIT_EVENTS: null as any,
    CIRCUIT_EVENTS: {} as any,
    JOB_RUNS: {} as any,
    RATE_LIMITER_WRITE: createMockRateLimiter(true) as any,
    RATE_LIMITER_READ: createMockRateLimiter(true) as any,
    JWT_SECRET: 'test-secret',
    ENABLE_MWL: 'false',
    FACILITY_CODE: 'FAC01',
    ...overrides,
  } as Env;
}

const mockTenant: TenantContext = {
  tenantId: 'tenant-123',
  facilityCode: 'FAC01',
  timezone: 'Asia/Jakarta',
  source: 'jwt',
  roles: ['admin'],
};

function createApp(tenant?: TenantContext) {
  const app = new Hono<{
    Bindings: Env;
    Variables: { tenant: TenantContext };
  }>();

  // Simulate auth middleware setting tenant context
  if (tenant) {
    app.use('*', async (c, next) => {
      c.set('tenant', tenant);
      return next();
    });
  }

  app.use('*', rateLimitMiddleware);

  app.get('/api/accessions', (c) => c.json({ items: [] }));
  app.post('/api/accessions', (c) => c.json({ id: '123' }, 201));
  app.patch('/api/accessions/:id', (c) => c.json({ id: c.req.param('id') }));
  app.delete('/api/accessions/:id', (c) => c.json({ deleted: true }));

  return app;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('rateLimitMiddleware', () => {
  describe('write endpoints (Requirement 12.8)', () => {
    it('should use RATE_LIMITER_WRITE for POST requests', async () => {
      const writeLimiter = createMockRateLimiter(true);
      const readLimiter = createMockRateLimiter(true);
      const env = makeEnv({
        RATE_LIMITER_WRITE: writeLimiter as any,
        RATE_LIMITER_READ: readLimiter as any,
      });
      const app = createApp(mockTenant);

      await app.request(
        '/api/accessions',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
        env,
      );

      expect(writeLimiter.limit).toHaveBeenCalledWith({ key: 'tenant-123' });
      expect(readLimiter.limit).not.toHaveBeenCalled();
    });

    it('should use RATE_LIMITER_WRITE for PATCH requests', async () => {
      const writeLimiter = createMockRateLimiter(true);
      const readLimiter = createMockRateLimiter(true);
      const env = makeEnv({
        RATE_LIMITER_WRITE: writeLimiter as any,
        RATE_LIMITER_READ: readLimiter as any,
      });
      const app = createApp(mockTenant);

      await app.request(
        '/api/accessions/abc',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
        env,
      );

      expect(writeLimiter.limit).toHaveBeenCalledWith({ key: 'tenant-123' });
      expect(readLimiter.limit).not.toHaveBeenCalled();
    });

    it('should use RATE_LIMITER_WRITE for DELETE requests', async () => {
      const writeLimiter = createMockRateLimiter(true);
      const readLimiter = createMockRateLimiter(true);
      const env = makeEnv({
        RATE_LIMITER_WRITE: writeLimiter as any,
        RATE_LIMITER_READ: readLimiter as any,
      });
      const app = createApp(mockTenant);

      await app.request('/api/accessions/abc', { method: 'DELETE' }, env);

      expect(writeLimiter.limit).toHaveBeenCalledWith({ key: 'tenant-123' });
      expect(readLimiter.limit).not.toHaveBeenCalled();
    });
  });

  describe('read endpoints (Requirement 12.8)', () => {
    it('should use RATE_LIMITER_READ for GET requests', async () => {
      const writeLimiter = createMockRateLimiter(true);
      const readLimiter = createMockRateLimiter(true);
      const env = makeEnv({
        RATE_LIMITER_WRITE: writeLimiter as any,
        RATE_LIMITER_READ: readLimiter as any,
      });
      const app = createApp(mockTenant);

      await app.request('/api/accessions', { method: 'GET' }, env);

      expect(readLimiter.limit).toHaveBeenCalledWith({ key: 'tenant-123' });
      expect(writeLimiter.limit).not.toHaveBeenCalled();
    });
  });

  describe('rate limit exceeded (Requirement 12.9)', () => {
    it('should return 429 with Retry-After header when write limit exceeded', async () => {
      const writeLimiter = createMockRateLimiter(false);
      const env = makeEnv({
        RATE_LIMITER_WRITE: writeLimiter as any,
        RATE_LIMIT_EVENTS: { writeDataPoint: vi.fn() } as any,
      });
      const app = createApp(mockTenant);

      const res = await app.request(
        '/api/accessions',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
        env,
      );

      expect(res.status).toBe(429);
      expect(res.headers.get('Retry-After')).toBe('10');
      const body = await res.json() as any;
      expect(body.code).toBe('RATE_LIMITED');
    });

    it('should return 429 with Retry-After header when read limit exceeded', async () => {
      const readLimiter = createMockRateLimiter(false);
      const env = makeEnv({
        RATE_LIMITER_READ: readLimiter as any,
        RATE_LIMIT_EVENTS: { writeDataPoint: vi.fn() } as any,
      });
      const app = createApp(mockTenant);

      const res = await app.request('/api/accessions', { method: 'GET' }, env);

      expect(res.status).toBe(429);
      expect(res.headers.get('Retry-After')).toBe('10');
      const body = await res.json() as any;
      expect(body.code).toBe('RATE_LIMITED');
    });

    it('should emit rate limit event to Analytics Engine on 429', async () => {
      const writeLimiter = createMockRateLimiter(false);
      const mockAnalytics = { writeDataPoint: vi.fn() };
      const env = makeEnv({
        RATE_LIMITER_WRITE: writeLimiter as any,
        RATE_LIMIT_EVENTS: mockAnalytics as any,
      });
      const app = createApp(mockTenant);

      await app.request(
        '/api/accessions',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
        env,
      );

      expect(mockAnalytics.writeDataPoint).toHaveBeenCalledWith({
        blobs: ['tenant-123', '/api/accessions'],
        doubles: [429],
        indexes: ['tenant-123'],
      });
    });
  });

  describe('graceful degradation', () => {
    it('should skip rate limiting when RATE_LIMITER_WRITE is not available', async () => {
      const env = makeEnv({
        RATE_LIMITER_WRITE: undefined as any,
      });
      const app = createApp(mockTenant);

      const res = await app.request(
        '/api/accessions',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
        env,
      );

      expect(res.status).toBe(201);
    });

    it('should skip rate limiting when RATE_LIMITER_READ is not available', async () => {
      const env = makeEnv({
        RATE_LIMITER_READ: undefined as any,
      });
      const app = createApp(mockTenant);

      const res = await app.request('/api/accessions', { method: 'GET' }, env);

      expect(res.status).toBe(200);
    });

    it('should skip rate limiting when no tenant context is set', async () => {
      const writeLimiter = createMockRateLimiter(true);
      const env = makeEnv({
        RATE_LIMITER_WRITE: writeLimiter as any,
      });
      // No tenant set
      const app = createApp(undefined);

      const res = await app.request(
        '/api/accessions',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
        env,
      );

      expect(res.status).toBe(201);
      expect(writeLimiter.limit).not.toHaveBeenCalled();
    });
  });

  describe('tenant key isolation', () => {
    it('should key rate limit by tenant_id', async () => {
      const writeLimiter = createMockRateLimiter(true);
      const env = makeEnv({
        RATE_LIMITER_WRITE: writeLimiter as any,
      });
      const tenant: TenantContext = {
        ...mockTenant,
        tenantId: 'hospital-xyz',
      };
      const app = createApp(tenant);

      await app.request(
        '/api/accessions',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
        env,
      );

      expect(writeLimiter.limit).toHaveBeenCalledWith({ key: 'hospital-xyz' });
    });
  });
});
