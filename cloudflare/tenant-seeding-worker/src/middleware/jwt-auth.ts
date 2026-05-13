/**
 * JWT authentication middleware for the manual trigger endpoint.
 *
 * Verifies JWT signature (HMAC-SHA256) against JWT_SECRET,
 * checks token expiration, and validates SUPERADMIN role claim.
 * Returns 403 Forbidden if the token is missing, invalid, expired,
 * or lacks the SUPERADMIN role.
 *
 * @module middleware/jwt-auth
 */

import { createMiddleware } from 'hono/factory';
import type { Env } from '../types';

/**
 * Decode a base64url-encoded string to a Uint8Array.
 */
function base64urlDecode(input: string): Uint8Array {
  // Replace base64url chars with standard base64 chars
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  // Pad to multiple of 4
  const pad = base64.length % 4;
  if (pad === 2) base64 += '==';
  else if (pad === 3) base64 += '=';

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Verify a JWT token's signature using HMAC-SHA256.
 * Returns the decoded payload if valid, or null if verification fails.
 */
async function verifyJwt(
  token: string,
  secret: string
): Promise<Record<string, unknown> | null> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const headerB64 = parts[0]!;
  const payloadB64 = parts[1]!;
  const signatureB64 = parts[2]!;

  // Import the secret key for HMAC-SHA256
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);

  let cryptoKey: CryptoKey;
  try {
    cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
  } catch {
    return null;
  }

  // Verify the signature against header.payload
  const signedContent = encoder.encode(`${headerB64}.${payloadB64}`);
  let signature: Uint8Array;
  try {
    signature = base64urlDecode(signatureB64);
  } catch {
    return null;
  }

  const isValid = await crypto.subtle.verify('HMAC', cryptoKey, signature, signedContent);
  if (!isValid) {
    return null;
  }

  // Decode and parse the payload
  try {
    const payloadBytes = base64urlDecode(payloadB64);
    const payloadStr = new TextDecoder().decode(payloadBytes);
    return JSON.parse(payloadStr) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Check whether the JWT payload contains the SUPERADMIN role.
 * Supports both `role` (string) and `roles` (array) claims.
 */
function hasSuperadminRole(payload: Record<string, unknown>): boolean {
  // Check single "role" claim
  if (typeof payload.role === 'string') {
    if (payload.role === 'SUPERADMIN') {
      return true;
    }
  }

  // Check "roles" array claim
  if (Array.isArray(payload.roles)) {
    if (payload.roles.includes('SUPERADMIN')) {
      return true;
    }
  }

  return false;
}

/**
 * Hono middleware that enforces JWT authentication with SUPERADMIN role.
 *
 * Extracts the Bearer token from the Authorization header, verifies
 * the signature using HMAC-SHA256 with the JWT_SECRET environment variable,
 * checks the `exp` claim for expiration, and validates that the token
 * contains a SUPERADMIN role claim.
 *
 * Returns 403 Forbidden for any authentication failure.
 */
export const jwtAuth = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const authHeader = c.req.header('Authorization');

  // Check for Authorization header with Bearer scheme
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const token = authHeader.slice(7); // Remove "Bearer " prefix
  if (!token) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  // Verify JWT signature
  const payload = await verifyJwt(token, c.env.JWT_SECRET);
  if (!payload) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  // Check expiration
  if (typeof payload.exp === 'number') {
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return c.json({ error: 'Forbidden' }, 403);
    }
  }

  // Validate SUPERADMIN role
  if (!hasSuperadminRole(payload)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  await next();
});
