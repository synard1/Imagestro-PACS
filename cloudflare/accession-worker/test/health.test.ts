import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

describe('Health endpoints', () => {
  describe('GET /healthz', () => {
    it('returns 200 with health check payload', async () => {
      const response = await SELF.fetch('http://localhost/healthz');
      expect(response.status).toBe(200);

      const body = (await response.json()) as Record<string, unknown>;
      expect(body.service).toBe('accession-worker');
      expect(body.version).toBeDefined();
      expect(body.timestamp).toBeDefined();
      expect(typeof body.uptime_ms).toBe('number');
      expect(['ok', 'degraded']).toContain(body.status);
      expect(body.checks).toBeDefined();
    });

    it('includes db check with latency_ms', async () => {
      const response = await SELF.fetch('http://localhost/healthz');
      const body = (await response.json()) as {
        checks: { db: { status: string; latency_ms: number } };
      };
      expect(body.checks.db).toBeDefined();
      expect(typeof body.checks.db.latency_ms).toBe('number');
      expect(['ok', 'error']).toContain(body.checks.db.status);
    });

    it('always returns 200 even when degraded', async () => {
      // The endpoint always returns 200 per requirement 11.8
      const response = await SELF.fetch('http://localhost/healthz');
      expect(response.status).toBe(200);
    });
  });

  describe('GET /readyz', () => {
    it('returns ready status when dependencies are available', async () => {
      const response = await SELF.fetch('http://localhost/readyz');
      const body = (await response.json()) as { ready: boolean; missing?: string[] };

      // In test environment with DB and JWT_SECRET configured, should be ready
      if (response.status === 200) {
        expect(body.ready).toBe(true);
        expect(body.missing).toBeUndefined();
      } else {
        expect(response.status).toBe(503);
        expect(body.ready).toBe(false);
        expect(body.missing).toBeDefined();
        expect(Array.isArray(body.missing)).toBe(true);
      }
    });
  });
});
