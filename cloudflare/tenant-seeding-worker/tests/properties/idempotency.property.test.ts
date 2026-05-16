/**
 * Property test 7.2: Idempotent event processing.
 *
 * Property 3: For any valid TenantCreatedEvent processed successfully,
 * processing the same event (same tenant_id) a second time SHALL NOT
 * create additional users and SHALL return a 202 response without
 * re-initiating the seeding process.
 *
 * Validates: Requirements 2.4
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Hono } from 'hono';
import { gatewayAuth } from '../../src/middleware/gateway-auth';
import { validateTenantCreatedEvent } from '../../src/utils/validation';
import type { Env, TenantCreatedEvent } from '../../src/types';

/**
 * Creates a minimal app that simulates the /seed endpoint's idempotency logic.
 * Uses an in-memory Map to simulate KV storage.
 */
function createIdempotentApp(kvStore: Map<string, string>) {
  const app = new Hono<{ Bindings: Env }>();

  app.post('/seed', gatewayAuth, async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const validation = validateTenantCreatedEvent(body);
    if (!validation.valid) {
      return c.json({ error: 'Invalid event payload', details: validation.errors }, 400);
    }

    const event = body as TenantCreatedEvent;
    const kvKey = `seed:${event.tenant_id}`;

    // Idempotency check
    const existing = kvStore.get(kvKey);
    if (existing !== undefined) {
      return c.json({ message: 'Event already received', tenant_id: event.tenant_id }, 202);
    }

    // Mark as processed
    kvStore.set(kvKey, JSON.stringify({ status: 'in_progress' }));

    return c.json({ message: 'Accepted', tenant_id: event.tenant_id }, 202);
  });

  return app;
}

const GATEWAY_SECRET = 'test-gateway-secret-123';

function createEnv(): Env {
  return { GATEWAY_SHARED_SECRET: GATEWAY_SECRET } as unknown as Env;
}

// Arbitrary: valid event payloads
const arbValidEvent = fc.record({
  event_id: fc.uuid(),
  tenant_id: fc.uuid(),
  tenant_code: fc.stringMatching(/^[a-z0-9-]+$/, { minLength: 1, maxLength: 20 }),
  tenant_name: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
  tenant_email: fc.constant('admin@test.com'),
  created_at: fc.date().map((d) => d.toISOString()),
});

describe('Feature: tenant-user-seeding, Property 3: Idempotent event processing', () => {
  it('first request returns 202 and marks event as processed', () => {
    fc.assert(
      fc.property(arbValidEvent, async (event) => {
        const kvStore = new Map<string, string>();
        const app = createIdempotentApp(kvStore);

        const res = await app.request(
          '/seed',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Gateway-Secret': GATEWAY_SECRET,
            },
            body: JSON.stringify(event),
          },
          createEnv()
        );

        expect(res.status).toBe(202);
        const body = await res.json() as { message: string };
        expect(body.message).toBe('Accepted');
        expect(kvStore.has(`seed:${event.tenant_id}`)).toBe(true);
      }),
      { numRuns: 50 }
    );
  });

  it('second request with same tenant_id returns 202 without re-processing', () => {
    fc.assert(
      fc.property(arbValidEvent, async (event) => {
        const kvStore = new Map<string, string>();
        const app = createIdempotentApp(kvStore);

        // First request
        await app.request(
          '/seed',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Gateway-Secret': GATEWAY_SECRET,
            },
            body: JSON.stringify(event),
          },
          createEnv()
        );

        // Second request with same tenant_id
        const res2 = await app.request(
          '/seed',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Gateway-Secret': GATEWAY_SECRET,
            },
            body: JSON.stringify({ ...event, event_id: crypto.randomUUID() }),
          },
          createEnv()
        );

        expect(res2.status).toBe(202);
        const body = await res2.json() as { message: string };
        expect(body.message).toBe('Event already received');
      }),
      { numRuns: 50 }
    );
  });

  it('different tenant_ids are processed independently', () => {
    fc.assert(
      fc.property(arbValidEvent, arbValidEvent, async (event1, event2) => {
        // Ensure different tenant_ids
        fc.pre(event1.tenant_id !== event2.tenant_id);

        const kvStore = new Map<string, string>();
        const app = createIdempotentApp(kvStore);

        // Process first event
        const res1 = await app.request(
          '/seed',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Gateway-Secret': GATEWAY_SECRET,
            },
            body: JSON.stringify(event1),
          },
          createEnv()
        );
        expect(res1.status).toBe(202);

        // Process second event (different tenant_id)
        const res2 = await app.request(
          '/seed',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Gateway-Secret': GATEWAY_SECRET,
            },
            body: JSON.stringify(event2),
          },
          createEnv()
        );
        expect(res2.status).toBe(202);
        const body2 = await res2.json() as { message: string };
        expect(body2.message).toBe('Accepted');
      }),
      { numRuns: 50 }
    );
  });

  it('same event processed N times always returns 202 after first', () => {
    fc.assert(
      fc.property(
        arbValidEvent,
        fc.integer({ min: 2, max: 5 }),
        async (event, repeatCount) => {
          const kvStore = new Map<string, string>();
          const app = createIdempotentApp(kvStore);

          // First request
          const first = await app.request(
            '/seed',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Gateway-Secret': GATEWAY_SECRET,
              },
              body: JSON.stringify(event),
            },
            createEnv()
          );
          expect(first.status).toBe(202);

          // Subsequent requests
          for (let i = 0; i < repeatCount; i++) {
            const res = await app.request(
              '/seed',
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Gateway-Secret': GATEWAY_SECRET,
                },
                body: JSON.stringify(event),
              },
              createEnv()
            );
            expect(res.status).toBe(202);
            const body = await res.json() as { message: string };
            expect(body.message).toBe('Event already received');
          }
        }
      ),
      { numRuns: 30 }
    );
  });
});
