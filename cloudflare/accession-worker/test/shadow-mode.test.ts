/**
 * Unit tests for shadow-mode middleware.
 *
 * Validates: Requirements 13.2, 13.3, 13.6, 13.8, 13.9
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import {
  shadowModeMiddleware,
  createShadowResponse,
} from '../src/middleware/shadow-mode';
import type { Env } from '../src/types';

function createApp(envOverrides: Partial<Env> = {}) {
  const app = new Hono<{
    Bindings: Env;
    Variables: { shadowMode: boolean };
  }>();

  app.use('*', shadowModeMiddleware);

  // Test route that reports shadow mode status
  app.get('/test', (c) => {
    return c.json({ shadowMode: c.get('shadowMode') });
  });

  app.post('/test', (c) => {
    const isShadow = c.get('shadowMode');
    if (isShadow) {
      return new Response(
        JSON.stringify({ status: 'shadow', would_respond: { id: '123' } }),
        { status: 202, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return c.json({ id: '123' }, 201);
  });

  app.patch('/test', (c) => {
    return c.json({ shadowMode: c.get('shadowMode') });
  });

  app.delete('/test', (c) => {
    return c.json({ shadowMode: c.get('shadowMode') });
  });

  return app;
}

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as any,
    CIRCUIT_BREAKER_DO: {} as any,
    METRICS: {} as any,
    RATE_LIMIT_EVENTS: {} as any,
    CIRCUIT_EVENTS: {} as any,
    JOB_RUNS: {} as any,
    RATE_LIMITER_WRITE: {} as any,
    RATE_LIMITER_READ: {} as any,
    JWT_SECRET: 'test-secret',
    ENABLE_MWL: 'false',
    FACILITY_CODE: 'FAC01',
    ...overrides,
  } as Env;
}

describe('shadowModeMiddleware', () => {
  describe('GET requests (Requirement 13.9)', () => {
    it('should never shadow GET requests even when SHADOW_MODE=true', async () => {
      const app = createApp();
      const env = makeEnv({ SHADOW_MODE: 'true' });

      const res = await app.request('/test', { method: 'GET' }, env);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.shadowMode).toBe(false);
    });

    it('should never shadow GET requests when tenant is not in canary list', async () => {
      const app = createApp();
      const env = makeEnv({ CANARY_TENANT_IDS: 'tenant-a,tenant-b' });

      const res = await app.request(
        '/test',
        {
          method: 'GET',
          headers: { 'x-tenant-id': 'tenant-c' },
        },
        env,
      );
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.shadowMode).toBe(false);
    });
  });

  describe('SHADOW_MODE=true (Requirement 13.2, 13.3, 13.6)', () => {
    it('should activate shadow mode for POST when SHADOW_MODE=true', async () => {
      const app = createApp();
      const env = makeEnv({ SHADOW_MODE: 'true' });

      const res = await app.request(
        '/test',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
        env,
      );
      expect(res.status).toBe(202);
      const body = await res.json() as any;
      expect(body.status).toBe('shadow');
      expect(body.would_respond).toEqual({ id: '123' });
    });

    it('should activate shadow mode for PATCH when SHADOW_MODE=true', async () => {
      const app = createApp();
      const env = makeEnv({ SHADOW_MODE: 'true' });

      const res = await app.request(
        '/test',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
        env,
      );
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.shadowMode).toBe(true);
    });

    it('should activate shadow mode for DELETE when SHADOW_MODE=true', async () => {
      const app = createApp();
      const env = makeEnv({ SHADOW_MODE: 'true' });

      const res = await app.request(
        '/test',
        { method: 'DELETE' },
        env,
      );
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.shadowMode).toBe(true);
    });

    it('should NOT activate shadow mode when SHADOW_MODE is not set', async () => {
      const app = createApp();
      const env = makeEnv({});

      const res = await app.request(
        '/test',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
        env,
      );
      expect(res.status).toBe(201);
      const body = await res.json() as any;
      expect(body.id).toBe('123');
    });

    it('should NOT activate shadow mode when SHADOW_MODE=false', async () => {
      const app = createApp();
      const env = makeEnv({ SHADOW_MODE: 'false' });

      const res = await app.request(
        '/test',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
        env,
      );
      expect(res.status).toBe(201);
    });
  });

  describe('CANARY_TENANT_IDS (Requirement 13.8)', () => {
    it('should shadow writes for tenants NOT in canary list', async () => {
      const app = createApp();
      const env = makeEnv({ CANARY_TENANT_IDS: 'tenant-a,tenant-b' });

      const res = await app.request(
        '/test',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': 'tenant-c',
          },
          body: JSON.stringify({}),
        },
        env,
      );
      expect(res.status).toBe(202);
      const body = await res.json() as any;
      expect(body.status).toBe('shadow');
    });

    it('should NOT shadow writes for tenants IN canary list', async () => {
      const app = createApp();
      const env = makeEnv({ CANARY_TENANT_IDS: 'tenant-a,tenant-b' });

      const res = await app.request(
        '/test',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': 'tenant-a',
          },
          body: JSON.stringify({}),
        },
        env,
      );
      expect(res.status).toBe(201);
      const body = await res.json() as any;
      expect(body.id).toBe('123');
    });

    it('should handle whitespace in CANARY_TENANT_IDS', async () => {
      const app = createApp();
      const env = makeEnv({
        CANARY_TENANT_IDS: ' tenant-a , tenant-b ',
      });

      const res = await app.request(
        '/test',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': 'tenant-a',
          },
          body: JSON.stringify({}),
        },
        env,
      );
      expect(res.status).toBe(201);
    });

    it('should shadow when both SHADOW_MODE=true and tenant is in canary list', async () => {
      // SHADOW_MODE=true takes precedence globally
      const app = createApp();
      const env = makeEnv({
        SHADOW_MODE: 'true',
        CANARY_TENANT_IDS: 'tenant-a',
      });

      const res = await app.request(
        '/test',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': 'tenant-a',
          },
          body: JSON.stringify({}),
        },
        env,
      );
      expect(res.status).toBe(202);
    });
  });

  describe('No shadow mode configured', () => {
    it('should pass through writes normally when no shadow config', async () => {
      const app = createApp();
      const env = makeEnv({});

      const res = await app.request(
        '/test',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
        env,
      );
      expect(res.status).toBe(201);
    });
  });
});

describe('createShadowResponse', () => {
  it('should return 202 with shadow envelope', () => {
    const response = createShadowResponse({ accession_number: 'ACC-001' });
    expect(response.status).toBe(202);
  });

  it('should include status and would_respond in body', async () => {
    const payload = { accession_number: 'ACC-001', id: 'uuid-123' };
    const response = createShadowResponse(payload);
    const body = await response.json();
    expect(body).toEqual({
      status: 'shadow',
      would_respond: payload,
    });
  });

  it('should set Content-Type to application/json', () => {
    const response = createShadowResponse({});
    expect(response.headers.get('Content-Type')).toBe('application/json');
  });
});
