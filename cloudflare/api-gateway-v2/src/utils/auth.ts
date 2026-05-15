/**
 * JWT authentication helpers.
 */

import { verify } from 'hono/jwt';
import type { AuthPayload } from '../types';

/**
 * Extract tenant_id, role, and username from the JWT in the request.
 * Returns nulls if no valid token is present.
 */
export async function getAuthContext(c: any): Promise<AuthPayload> {
  const authHeader = c.req.header('Authorization');
  let token: string | null = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else {
    token = c.req.query('token') || c.req.query('access_token') || null;
  }

  if (!token) return { tenant_id: null, role: null, username: null };

  try {
    const payload = await verify(token, c.env.JWT_SECRET, (c.env.JWT_ALGORITHM || 'HS256') as any);
    return {
      tenant_id: payload.tenant_id as string | null,
      role: (payload.role as string)?.toLowerCase() ?? null,
      username: payload.username as string | null,
    };
  } catch {
    return { tenant_id: null, role: null, username: null };
  }
}

/**
 * Verify a Cloudflare Turnstile token.
 */
export async function verifyTurnstile(token: string, secret: string, ip: string): Promise<boolean> {
  if (!token || !secret) return false;

  const formData = new FormData();
  formData.append('secret', secret);
  formData.append('response', token);
  formData.append('remoteip', ip);

  try {
    const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      body: formData,
      method: 'POST',
    });
    const outcome = await result.json() as { success: boolean };
    return outcome.success;
  } catch {
    return false;
  }
}
