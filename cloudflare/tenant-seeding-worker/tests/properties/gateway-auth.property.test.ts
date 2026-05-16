/**
 * Property test 4.2: Gateway secret validation.
 *
 * Property 8: For any incoming request to the /seed endpoint, if the
 * X-Gateway-Secret header value matches the configured GATEWAY_SHARED_SECRET
 * (constant-time comparison), the request SHALL be processed; otherwise,
 * the request SHALL be rejected with a 401 response.
 *
 * Validates: Requirements 7.4, 7.5
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Hono } from 'hono';
import { gatewayAuth } from '../../src/middleware/gateway-auth';
import type { Env } from '../../src/types';

function createTestApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.use('/protected/*', gatewayAuth);
  app.post('/protected/seed', (c) => c.json({ ok: true }, 202));
  return app;
}

function createEnv(secret: string): Env {
  return { GATEWAY_SHARED_SECRET: secret } as unknown as Env;
}

describe('Feature: tenant-user-seeding, Property 8: Gateway secret validation', () => {
  const app = createTestApp();

  it('accepts requests when header matches the configured secret', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 8, maxLength: 64 }).filter((s) => s.trim().length > 0),
        async (secret) => {
          const res = await app.request(
            '/protected/seed',
            {
              method: 'POST',
              headers: { 'X-Gateway-Secret': secret },
              body: '{}',
            },
            createEnv(secret)
          );
          expect(res.status).toBe(202);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects requests when header does not match the configured secret', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 8, maxLength: 64 }).filter((s) => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 64 }).filter((s) => s.trim().length > 0),
        async (secret, headerValue) => {
          // Ensure they are different
          fc.pre(secret !== headerValue);

          const res = await app.request(
            '/protected/seed',
            {
              method: 'POST',
              headers: { 'X-Gateway-Secret': headerValue },
              body: '{}',
            },
            createEnv(secret)
          );
          expect(res.status).toBe(401);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects requests when X-Gateway-Secret header is missing', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 8, maxLength: 64 }).filter((s) => s.trim().length > 0),
        async (secret) => {
          const res = await app.request(
            '/protected/seed',
            { method: 'POST', body: '{}' },
            createEnv(secret)
          );
          expect(res.status).toBe(401);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('rejects requests when secret differs by appending characters', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 8, maxLength: 32 }).filter((s) => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 10 }),
        async (secret, suffix) => {
          fc.pre(suffix.length > 0);
          const res = await app.request(
            '/protected/seed',
            {
              method: 'POST',
              headers: { 'X-Gateway-Secret': secret + suffix },
              body: '{}',
            },
            createEnv(secret)
          );
          expect(res.status).toBe(401);
        }
      ),
      { numRuns: 50 }
    );
  });

  it('rejects requests when secret differs by prepending characters', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 8, maxLength: 32 }).filter((s) => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 10 }),
        async (secret, prefix) => {
          fc.pre(prefix.length > 0);
          const res = await app.request(
            '/protected/seed',
            {
              method: 'POST',
              headers: { 'X-Gateway-Secret': prefix + secret },
              body: '{}',
            },
            createEnv(secret)
          );
          expect(res.status).toBe(401);
        }
      ),
      { numRuns: 50 }
    );
  });
});
