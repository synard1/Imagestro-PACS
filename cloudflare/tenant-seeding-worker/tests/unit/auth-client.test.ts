import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthClient, type CreateUserPayload } from '../../src/services/auth-client';
import type { Env } from '../../src/types';

/**
 * Unit tests for AuthClient service.
 * Tests login, createUser, token caching, re-authentication on 401,
 * and timeout behavior.
 */

function createMockEnv(fetchImpl: typeof globalThis.fetch): Env {
  return {
    BACKBONE: { fetch: fetchImpl } as unknown as Fetcher,
    API_CACHE: {} as KVNamespace,
    GATEWAY_SHARED_SECRET: 'test-secret',
    SEED_SERVICE_USERNAME: 'seed-user',
    SEED_SERVICE_PASSWORD: 'seed-pass',
    JWT_SECRET: 'jwt-secret',
    AUTH_SERVICE_URL: 'http://auth-service:5000',
  };
}

const sampleUser: CreateUserPayload = {
  username: 'admin.hospital1',
  email: 'admin@hospital1.local',
  password: 'SecurePass1!xyz',
  full_name: 'Admin Hospital One',
  role: 'TENANT_ADMIN',
  is_active: true,
  tenant_id: 'tenant-uuid-123',
};

describe('AuthClient', () => {
  describe('login()', () => {
    it('authenticates successfully and caches the token', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: 'success',
            access_token: 'jwt-token-abc',
            expires_in: 86400,
          }),
          { status: 200 }
        )
      );

      const env = createMockEnv(mockFetch);
      const client = new AuthClient(env);

      const token = await client.login();

      expect(token).toBe('jwt-token-abc');
      expect(client.getToken()).toBe('jwt-token-abc');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://auth-service:5000/auth/login',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: 'seed-user',
            password: 'seed-pass',
          }),
        })
      );
    });

    it('throws an error when login returns non-2xx status', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response('Unauthorized', { status: 401 })
      );

      const env = createMockEnv(mockFetch);
      const client = new AuthClient(env);

      await expect(client.login()).rejects.toThrow('Auth login failed: status=401');
    });

    it('throws an error when response is missing access_token', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: 'success' }), { status: 200 })
      );

      const env = createMockEnv(mockFetch);
      const client = new AuthClient(env);

      await expect(client.login()).rejects.toThrow('Auth login response missing access_token');
    });
  });

  describe('createUser()', () => {
    it('creates a user successfully with cached token', async () => {
      const mockFetch = vi.fn()
        // First call: login
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ status: 'success', access_token: 'token-1', expires_in: 86400 }),
            { status: 200 }
          )
        )
        // Second call: createUser
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ id: 'user-1' }), { status: 201 })
        );

      const env = createMockEnv(mockFetch);
      const client = new AuthClient(env);

      const response = await client.createUser(sampleUser);

      expect(response.status).toBe(201);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      // Verify the createUser call includes the Bearer token
      expect(mockFetch).toHaveBeenLastCalledWith(
        'http://auth-service:5000/auth/users',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer token-1',
          }),
        })
      );
    });

    it('returns 409 response without retrying (conflict treated as success)', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ status: 'success', access_token: 'token-1', expires_in: 86400 }),
            { status: 200 }
          )
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: 'User already exists' }), { status: 409 })
        );

      const env = createMockEnv(mockFetch);
      const client = new AuthClient(env);

      const response = await client.createUser(sampleUser);

      expect(response.status).toBe(409);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('re-authenticates on 401 and retries the request', async () => {
      const mockFetch = vi.fn()
        // Initial login
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ status: 'success', access_token: 'token-1', expires_in: 86400 }),
            { status: 200 }
          )
        )
        // First createUser attempt → 401
        .mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))
        // Re-login
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ status: 'success', access_token: 'token-2', expires_in: 86400 }),
            { status: 200 }
          )
        )
        // Second createUser attempt → 201
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ id: 'user-1' }), { status: 201 })
        );

      const env = createMockEnv(mockFetch);
      const client = new AuthClient(env);

      const response = await client.createUser(sampleUser);

      expect(response.status).toBe(201);
      expect(mockFetch).toHaveBeenCalledTimes(4);
      // Verify the second createUser uses the new token
      expect(mockFetch).toHaveBeenLastCalledWith(
        'http://auth-service:5000/auth/users',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer token-2',
          }),
        })
      );
    });

    it('throws after 3 failed re-authentication attempts on persistent 401', async () => {
      const mockFetch = vi.fn()
        // Initial login
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ status: 'success', access_token: 'token-1', expires_in: 86400 }),
            { status: 200 }
          )
        )
        // 1st createUser → 401
        .mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))
        // 1st re-login fails
        .mockResolvedValueOnce(new Response('Forbidden', { status: 403 }))
        // 2nd createUser → 401 (uses stale token since login failed)
        .mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))
        // 2nd re-login fails
        .mockResolvedValueOnce(new Response('Forbidden', { status: 403 }))
        // 3rd createUser → 401
        .mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))
        // 3rd re-login fails
        .mockResolvedValueOnce(new Response('Forbidden', { status: 403 }));

      const env = createMockEnv(mockFetch);
      const client = new AuthClient(env);

      await expect(client.createUser(sampleUser)).rejects.toThrow('Auth login failed');
    });

    it('returns 5xx response without re-authenticating (not a 401)', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ status: 'success', access_token: 'token-1', expires_in: 86400 }),
            { status: 200 }
          )
        )
        .mockResolvedValueOnce(
          new Response('Internal Server Error', { status: 500 })
        );

      const env = createMockEnv(mockFetch);
      const client = new AuthClient(env);

      const response = await client.createUser(sampleUser);

      expect(response.status).toBe(500);
      // Only 2 calls: login + createUser (no re-auth since it's not 401)
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('uses existing cached token without calling login again', async () => {
      const mockFetch = vi.fn()
        // Initial login
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ status: 'success', access_token: 'token-1', expires_in: 86400 }),
            { status: 200 }
          )
        )
        // First createUser
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ id: 'user-1' }), { status: 201 })
        )
        // Second createUser (should reuse token, no login)
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ id: 'user-2' }), { status: 201 })
        );

      const env = createMockEnv(mockFetch);
      const client = new AuthClient(env);

      // First call triggers login
      const response1 = await client.createUser(sampleUser);
      expect(response1.status).toBe(201);

      // Second call reuses cached token
      const response2 = await client.createUser({ ...sampleUser, username: 'dokter.hospital1' });
      expect(response2.status).toBe(201);

      // Only 1 login call + 2 createUser calls = 3 total
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('clearToken()', () => {
    it('forces re-authentication on next createUser call', async () => {
      const mockFetch = vi.fn()
        // First login
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ status: 'success', access_token: 'token-1', expires_in: 86400 }),
            { status: 200 }
          )
        )
        // First createUser
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ id: 'user-1' }), { status: 201 })
        )
        // Second login (after clearToken)
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ status: 'success', access_token: 'token-2', expires_in: 86400 }),
            { status: 200 }
          )
        )
        // Second createUser
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ id: 'user-2' }), { status: 201 })
        );

      const env = createMockEnv(mockFetch);
      const client = new AuthClient(env);

      await client.createUser(sampleUser);
      client.clearToken();
      expect(client.getToken()).toBeNull();

      await client.createUser(sampleUser);

      // 2 logins + 2 createUser = 4 total
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });
  });
});
