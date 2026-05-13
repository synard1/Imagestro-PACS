/**
 * Auth-service client for the Tenant Seeding Worker.
 *
 * Handles authentication (login) and user creation via the BACKBONE
 * VPC tunnel binding. Implements token caching and automatic
 * re-authentication on 401 responses (up to 3 attempts).
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */

import type { Env } from '../types';

/** Payload sent to POST /auth/users */
export interface CreateUserPayload {
  username: string;
  email: string;
  password: string;
  full_name: string;
  role: string;
  is_active: boolean;
  tenant_id: string;
}

/** Response from POST /auth/login */
interface LoginResponse {
  status: string;
  access_token: string;
  expires_in: number;
}

/** Maximum number of re-authentication attempts on 401 */
const MAX_REAUTH_ATTEMPTS = 3;

/** Timeout for user creation calls in milliseconds */
const USER_CREATION_TIMEOUT_MS = 10_000;

export class AuthClient {
  private env: Env;
  private cachedToken: string | null = null;

  constructor(env: Env) {
    this.env = env;
  }

  /**
   * Authenticates with the auth-service using service credentials.
   * Caches the returned JWT token for subsequent requests.
   *
   * @throws Error if login fails (non-success response from auth-service)
   */
  async login(): Promise<string> {
    const url = `${this.env.AUTH_SERVICE_URL}/auth/login`;

    const response = await this.env.BACKBONE.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: this.env.SEED_SERVICE_USERNAME,
        password: this.env.SEED_SERVICE_PASSWORD,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `Auth login failed: status=${response.status}, body=${body}`
      );
    }

    const data = (await response.json()) as LoginResponse;

    if (!data.access_token) {
      throw new Error('Auth login response missing access_token');
    }

    this.cachedToken = data.access_token;
    return this.cachedToken;
  }

  /**
   * Creates a user via the auth-service API.
   *
   * Uses the cached JWT token. On 401 responses, automatically
   * re-authenticates and retries up to MAX_REAUTH_ATTEMPTS times.
   * Applies a 10-second timeout via AbortController.
   *
   * @returns The Response from the auth-service (201, 409, or error status)
   * @throws Error if re-authentication fails after all attempts or on timeout
   */
  async createUser(userData: CreateUserPayload): Promise<Response> {
    // Ensure we have a token before attempting user creation
    if (!this.cachedToken) {
      await this.login();
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_REAUTH_ATTEMPTS; attempt++) {
      const response = await this.fetchCreateUser(userData);

      // If not a 401, return the response as-is (success, conflict, or other error)
      if (response.status !== 401) {
        return response;
      }

      // 401: token expired or invalid — re-authenticate and retry
      try {
        await this.login();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        // If login fails, continue to next attempt (login itself might be transient)
        continue;
      }
    }

    // All re-auth attempts exhausted
    throw lastError ?? new Error(
      `Authentication failed after ${MAX_REAUTH_ATTEMPTS} re-auth attempts`
    );
  }

  /**
   * Fetches users for a given tenant from the auth-service.
   * Uses the cached JWT token. On 401 responses, re-authenticates
   * and retries up to MAX_REAUTH_ATTEMPTS times.
   *
   * @returns Array of user objects for the tenant, or null if tenant not found
   * @throws Error if authentication fails after all attempts
   */
  async getUsersByTenant(tenantId: string): Promise<{ role: string }[] | null> {
    // Ensure we have a token before attempting the request
    if (!this.cachedToken) {
      await this.login();
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_REAUTH_ATTEMPTS; attempt++) {
      const url = `${this.env.AUTH_SERVICE_URL}/auth/users?tenant_id=${encodeURIComponent(tenantId)}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), USER_CREATION_TIMEOUT_MS);

      try {
        const response = await this.env.BACKBONE.fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.cachedToken}`,
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.status === 404) {
          return null;
        }

        if (response.status === 401) {
          // Token expired — re-authenticate and retry
          try {
            await this.login();
          } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            continue;
          }
          continue;
        }

        if (!response.ok) {
          const body = await response.text().catch(() => '');
          throw new Error(
            `Failed to get users for tenant: status=${response.status}, body=${body}`
          );
        }

        const data = await response.json() as Record<string, unknown>;
        // Auth-service returns { data: { users: [...], pagination: {...} } }
        let users: { role: string }[] = [];
        if (data.data && typeof data.data === 'object' && 'users' in (data.data as object)) {
          users = (data.data as { users: { role: string }[] }).users;
        } else if (Array.isArray(data.users)) {
          users = data.users as { role: string }[];
        } else if (Array.isArray(data.data)) {
          users = data.data as { role: string }[];
        } else if (Array.isArray(data)) {
          users = data as unknown as { role: string }[];
        }
        return users;
      } catch (error) {
        clearTimeout(timeoutId);
        if ((error as Error).name === 'AbortError') {
          throw new Error('Request to get users timed out');
        }
        throw error;
      }
    }

    throw lastError ?? new Error(
      `Authentication failed after ${MAX_REAUTH_ATTEMPTS} re-auth attempts`
    );
  }

  /**
   * Returns the currently cached token, or null if not authenticated.
   */
  getToken(): string | null {
    return this.cachedToken;
  }

  /**
   * Clears the cached token, forcing re-authentication on next request.
   */
  clearToken(): void {
    this.cachedToken = null;
  }

  /**
   * Performs the actual POST /auth/users fetch with timeout.
   */
  private async fetchCreateUser(userData: CreateUserPayload): Promise<Response> {
    const url = `${this.env.AUTH_SERVICE_URL}/auth/users`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), USER_CREATION_TIMEOUT_MS);

    try {
      const response = await this.env.BACKBONE.fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.cachedToken}`,
        },
        body: JSON.stringify(userData),
        signal: controller.signal,
      });

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
