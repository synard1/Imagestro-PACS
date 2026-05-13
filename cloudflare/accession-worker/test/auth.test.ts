/**
 * Unit tests for auth middleware and tenant context builder.
 *
 * Tests cover:
 * - Public path skipping (/healthz, /readyz)
 * - Service Binding trust (X-Tenant-ID without gateway signature)
 * - X-Gateway-Signature HMAC verification
 * - JWT HS256 validation (valid, expired, missing claims)
 * - JTI revocation
 * - Tenant context building
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import { authMiddleware } from '../src/middleware/auth';
import {
  revokeJti,
  isJtiRevoked,
  buildTenantContextFromJwt,
  buildTenantContextFromGateway,
} from '../src/middleware/tenant';
import type { Env, TenantContext, JWTClaims } from '../src/types';

// ─── Test Helpers ────────────────────────────────────────────────────────────

const TEST_JWT_SECRET = 'test-secret-key-for-unit-tests';
const TEST_GATEWAY_SECRET = 'gateway-shared-secret-for-tests';
const TEST_FACILITY_CODE = 'RS01';

function createTestEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as D1Database,
    CIRCUIT_BREAKER_DO: {} as DurableObjectNamespace,
    METRICS: {} as AnalyticsEngineDataset,
    RATE_LIMIT_EVENTS: {} as AnalyticsEngineDataset,
    CIRCUIT_EVENTS: {} as AnalyticsEngineDataset,
    JOB_RUNS: {} as AnalyticsEngineDataset,
    RATE_LIMITER_WRITE: {} as RateLimit,
    RATE_LIMITER_READ: {} as RateLimit,
    JWT_SECRET: TEST_JWT_SECRET,
    GATEWAY_SHARED_SECRET: TEST_GATEWAY_SECRET,
    ENABLE_MWL: 'false',
    FACILITY_CODE: TEST_FACILITY_CODE,
    ...overrides,
  } as Env;
}

async function computeHmacSha256(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function createValidJwt(
  claims: Partial<JWTClaims> & { tenant_id: string; jti: string },
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: 'user-123',
    exp: now + 3600,
    nbf: now - 60,
    ...claims,
  };
  return sign(payload, TEST_JWT_SECRET, 'HS256');
}

function createApp(env: Env) {
  type Variables = { tenant: TenantContext };
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();

  app.use('*', authMiddleware);
  app.get('/healthz', (c) => c.json({ status: 'ok' }));
  app.get('/readyz', (c) => c.json({ status: 'ok' }));
  app.get('/api/test', (c) => {
    const tenant = c.get('tenant');
    return c.json({ tenant });
  });
  app.post('/api/accessions', (c) => {
    const tenant = c.get('tenant');
    return c.json({ tenant });
  });

  return app;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Auth Middleware', () => {
  describe('Public paths (skip auth)', () => {
    it('allows /healthz without authentication', async () => {
      const env = createTestEnv();
      const app = createApp(env);
      const res = await app.request('/healthz', {}, env);
      expect(res.status).toBe(200);
    });

    it('allows /readyz without authentication', async () => {
      const env = createTestEnv();
      const app = createApp(env);
      const res = await app.request('/readyz', {}, env);
      expect(res.status).toBe(200);
    });
  });

  describe('Service Binding trust', () => {
    it('trusts X-Tenant-ID without gateway signature as internal call', async () => {
      const env = createTestEnv();
      const app = createApp(env);
      const res = await app.request(
        '/api/test',
        { headers: { 'X-Tenant-ID': 'tenant-abc' } },
        env,
      );
      expect(res.status).toBe(200);
      const body = await res.json() as { tenant: TenantContext };
      expect(body.tenant.tenantId).toBe('tenant-abc');
      expect(body.tenant.source).toBe('gateway');
      expect(body.tenant.facilityCode).toBe(TEST_FACILITY_CODE);
      expect(body.tenant.timezone).toBe('Asia/Jakarta');
    });
  });

  describe('X-Gateway-Signature HMAC', () => {
    it('accepts valid HMAC signature over tenant_id + request_id', async () => {
      const env = createTestEnv();
      const app = createApp(env);
      const tenantId = 'tenant-xyz';
      const requestId = 'req-001';
      const signature = await computeHmacSha256(
        TEST_GATEWAY_SECRET,
        tenantId + requestId,
      );

      const res = await app.request(
        '/api/test',
        {
          headers: {
            'X-Tenant-ID': tenantId,
            'X-Request-ID': requestId,
            'X-Gateway-Signature': signature,
          },
        },
        env,
      );
      expect(res.status).toBe(200);
      const body = await res.json() as { tenant: TenantContext };
      expect(body.tenant.tenantId).toBe(tenantId);
      expect(body.tenant.source).toBe('gateway');
    });

    it('rejects invalid HMAC signature and falls through to JWT', async () => {
      const env = createTestEnv();
      const app = createApp(env);
      const res = await app.request(
        '/api/test',
        {
          headers: {
            'X-Tenant-ID': 'tenant-xyz',
            'X-Request-ID': 'req-001',
            'X-Gateway-Signature': 'invalid-signature',
          },
        },
        env,
      );
      // Falls through to JWT validation, which fails (no Authorization header)
      expect(res.status).toBe(401);
    });
  });

  describe('JWT HS256 validation', () => {
    it('accepts valid JWT with required claims', async () => {
      const env = createTestEnv();
      const app = createApp(env);
      const token = await createValidJwt({
        tenant_id: 'tenant-jwt',
        jti: 'jti-123',
        sub: 'user-456',
        roles: ['admin'],
      });

      const res = await app.request(
        '/api/test',
        { headers: { Authorization: `Bearer ${token}` } },
        env,
      );
      expect(res.status).toBe(200);
      const body = await res.json() as { tenant: TenantContext };
      expect(body.tenant.tenantId).toBe('tenant-jwt');
      expect(body.tenant.source).toBe('jwt');
      expect(body.tenant.roles).toEqual(['admin']);
      expect(body.tenant.jwtClaims?.jti).toBe('jti-123');
      expect(body.tenant.jwtClaims?.sub).toBe('user-456');
    });

    it('rejects request without Authorization header', async () => {
      const env = createTestEnv();
      const app = createApp(env);
      const res = await app.request('/api/test', {}, env);
      expect(res.status).toBe(401);
      const body = await res.json() as { error: string; code: string };
      expect(body.code).toBe('UNAUTHORIZED');
    });

    it('rejects request with empty Bearer token', async () => {
      const env = createTestEnv();
      const app = createApp(env);
      const res = await app.request(
        '/api/test',
        { headers: { Authorization: 'Bearer ' } },
        env,
      );
      expect(res.status).toBe(401);
    });

    it('rejects JWT signed with wrong secret', async () => {
      const env = createTestEnv();
      const app = createApp(env);
      const now = Math.floor(Date.now() / 1000);
      const token = await sign(
        { tenant_id: 'tenant-x', jti: 'jti-x', sub: 'u', exp: now + 3600 },
        'wrong-secret',
        'HS256',
      );

      const res = await app.request(
        '/api/test',
        { headers: { Authorization: `Bearer ${token}` } },
        env,
      );
      expect(res.status).toBe(401);
      const body = await res.json() as { code: string };
      expect(body.code).toBe('UNAUTHORIZED');
    });

    it('rejects JWT missing tenant_id claim with 403', async () => {
      const env = createTestEnv();
      const app = createApp(env);
      const now = Math.floor(Date.now() / 1000);
      // Sign a token without tenant_id
      const token = await sign(
        { jti: 'jti-no-tenant', sub: 'user', exp: now + 3600 },
        TEST_JWT_SECRET,
        'HS256',
      );

      const res = await app.request(
        '/api/test',
        { headers: { Authorization: `Bearer ${token}` } },
        env,
      );
      expect(res.status).toBe(403);
      const body = await res.json() as { code: string };
      expect(body.code).toBe('FORBIDDEN');
    });

    it('rejects JWT missing jti claim with 401', async () => {
      const env = createTestEnv();
      const app = createApp(env);
      const now = Math.floor(Date.now() / 1000);
      const token = await sign(
        { tenant_id: 'tenant-x', sub: 'user', exp: now + 3600 },
        TEST_JWT_SECRET,
        'HS256',
      );

      const res = await app.request(
        '/api/test',
        { headers: { Authorization: `Bearer ${token}` } },
        env,
      );
      expect(res.status).toBe(401);
      const body = await res.json() as { code: string };
      expect(body.code).toBe('UNAUTHORIZED');
    });

    it('rejects expired JWT', async () => {
      const env = createTestEnv();
      const app = createApp(env);
      const now = Math.floor(Date.now() / 1000);
      const token = await sign(
        { tenant_id: 'tenant-x', jti: 'jti-exp', sub: 'user', exp: now - 100 },
        TEST_JWT_SECRET,
        'HS256',
      );

      const res = await app.request(
        '/api/test',
        { headers: { Authorization: `Bearer ${token}` } },
        env,
      );
      expect(res.status).toBe(401);
    });
  });

  describe('JTI revocation', () => {
    it('rejects JWT with revoked JTI', async () => {
      const env = createTestEnv();
      const app = createApp(env);
      const revokedJtiId = 'revoked-jti-test-' + Date.now();
      revokeJti(revokedJtiId);

      const token = await createValidJwt({
        tenant_id: 'tenant-rev',
        jti: revokedJtiId,
      });

      const res = await app.request(
        '/api/test',
        { headers: { Authorization: `Bearer ${token}` } },
        env,
      );
      expect(res.status).toBe(401);
      const body = await res.json() as { error: string };
      expect(body.error).toContain('revoked');
    });
  });
});

describe('Tenant Context Builder', () => {
  const mockEnv = createTestEnv();

  describe('buildTenantContextFromJwt', () => {
    it('builds context with all JWT claims', () => {
      const claims: JWTClaims = {
        tenant_id: 'tenant-1',
        jti: 'jti-1',
        sub: 'user-1',
        exp: 9999999999,
        nbf: 1000000000,
        roles: ['admin', 'data_steward'],
      };

      const ctx = buildTenantContextFromJwt(claims, mockEnv);
      expect(ctx.tenantId).toBe('tenant-1');
      expect(ctx.facilityCode).toBe(TEST_FACILITY_CODE);
      expect(ctx.timezone).toBe('Asia/Jakarta');
      expect(ctx.source).toBe('jwt');
      expect(ctx.jwtClaims).toEqual(claims);
      expect(ctx.roles).toEqual(['admin', 'data_steward']);
    });

    it('defaults roles to empty array when not in claims', () => {
      const claims: JWTClaims = {
        tenant_id: 'tenant-2',
        jti: 'jti-2',
        sub: 'user-2',
        exp: 9999999999,
      };

      const ctx = buildTenantContextFromJwt(claims, mockEnv);
      expect(ctx.roles).toEqual([]);
    });
  });

  describe('buildTenantContextFromGateway', () => {
    it('builds context from tenant ID header', () => {
      const ctx = buildTenantContextFromGateway('tenant-gw', mockEnv);
      expect(ctx.tenantId).toBe('tenant-gw');
      expect(ctx.facilityCode).toBe(TEST_FACILITY_CODE);
      expect(ctx.timezone).toBe('Asia/Jakarta');
      expect(ctx.source).toBe('gateway');
      expect(ctx.roles).toEqual([]);
      expect(ctx.jwtClaims).toBeUndefined();
    });
  });

  describe('JTI revocation cache', () => {
    it('tracks revoked JTIs', () => {
      const jti = 'test-revoke-' + Date.now();
      expect(isJtiRevoked(jti)).toBe(false);
      revokeJti(jti);
      expect(isJtiRevoked(jti)).toBe(true);
    });
  });
});
