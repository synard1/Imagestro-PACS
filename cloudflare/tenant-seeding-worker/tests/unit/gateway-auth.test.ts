import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { gatewayAuth } from '../../src/middleware/gateway-auth';
import type { Env } from '../../src/types';

function createApp() {
  const app = new Hono<{ Bindings: Env }>();

  app.use('/protected/*', gatewayAuth);
  app.post('/protected/seed', (c) => c.json({ ok: true }, 202));

  return app;
}

describe('gatewayAuth middleware', () => {
  const VALID_SECRET = 'my-super-secret-gateway-key-12345';
  const app = createApp();

  function env(secret: string = VALID_SECRET): Env {
    return { GATEWAY_SHARED_SECRET: secret } as unknown as Env;
  }

  it('returns 401 when X-Gateway-Secret header is missing', async () => {
    const res = await app.request(
      '/protected/seed',
      { method: 'POST', body: '{}' },
      env(),
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 when X-Gateway-Secret header is empty string', async () => {
    const res = await app.request(
      '/protected/seed',
      {
        method: 'POST',
        headers: { 'X-Gateway-Secret': '' },
        body: '{}',
      },
      env(),
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 when X-Gateway-Secret does not match', async () => {
    const res = await app.request(
      '/protected/seed',
      {
        method: 'POST',
        headers: { 'X-Gateway-Secret': 'wrong-secret' },
        body: '{}',
      },
      env(),
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 when GATEWAY_SHARED_SECRET env is empty', async () => {
    const res = await app.request(
      '/protected/seed',
      {
        method: 'POST',
        headers: { 'X-Gateway-Secret': 'some-secret' },
        body: '{}',
      },
      env(''),
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('allows request through when secret matches', async () => {
    const res = await app.request(
      '/protected/seed',
      {
        method: 'POST',
        headers: { 'X-Gateway-Secret': VALID_SECRET },
        body: '{}',
      },
      env(),
    );

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it('returns 401 when secret differs by one character', async () => {
    const res = await app.request(
      '/protected/seed',
      {
        method: 'POST',
        headers: { 'X-Gateway-Secret': VALID_SECRET + 'x' },
        body: '{}',
      },
      env(),
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('is case-sensitive for secret comparison', async () => {
    const res = await app.request(
      '/protected/seed',
      {
        method: 'POST',
        headers: { 'X-Gateway-Secret': VALID_SECRET.toUpperCase() },
        body: '{}',
      },
      env(),
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });
});
