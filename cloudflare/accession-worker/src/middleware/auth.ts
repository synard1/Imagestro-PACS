/**
 * Authentication middleware for the Accession Worker.
 *
 * Authentication priority:
 * 1. Skip /healthz and /readyz (no auth required)
 * 2. Service Binding trust: X-Tenant-ID present without gateway signature = internal call
 * 3. X-Gateway-Signature HMAC verification (SHA-256 of tenant_id + request_id)
 * 4. JWT HS256 validation via hono/jwt verify
 *
 * Requirements: 5.1, 11.5, 11.11, 12.1, 12.2, 12.3, 12.4, 12.6, 12.7, 12.12
 */

import { createMiddleware } from 'hono/factory';
import { verify } from 'hono/jwt';
import type { Env, TenantContext, JWTClaims } from '../types';
import {
  isJtiRevoked,
  buildTenantContextFromJwt,
  buildTenantContextFromGateway,
} from './tenant';

// ─── Hono Variable Types ─────────────────────────────────────────────────────

type Variables = {
  tenant: TenantContext;
};

// ─── Paths that skip authentication ──────────────────────────────────────────

const PUBLIC_PATHS = ['/healthz', '/readyz'];

// ─── HMAC Helpers ────────────────────────────────────────────────────────────

/**
 * Compute HMAC-SHA256 of the given message using the provided secret.
 * Returns the hex-encoded digest.
 */
async function computeHmacSha256(
  secret: string,
  message: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(message),
  );
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Timing-safe comparison of two hex strings to prevent timing attacks.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  let result = 0;
  for (let i = 0; i < bufA.length; i++) {
    result |= (bufA[i] as number) ^ (bufB[i] as number);
  }
  return result === 0;
}

// ─── Auth Middleware ─────────────────────────────────────────────────────────

export const authMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: Variables;
}>(async (c, next) => {
  // 1. Skip public paths
  const path = new URL(c.req.url).pathname;
  if (PUBLIC_PATHS.includes(path)) {
    return next();
  }

  // 2. Check for Service Binding trust (internal call)
  //    If X-Tenant-ID is present WITHOUT X-Gateway-Signature, treat as
  //    trusted internal Service Binding call.
  const tenantIdHeader = c.req.header('X-Tenant-ID');
  const gatewaySignature = c.req.header('X-Gateway-Signature');

  if (tenantIdHeader && !gatewaySignature) {
    // Service Binding trust — no JWT validation needed
    const tenantContext = buildTenantContextFromGateway(tenantIdHeader, c.env);
    c.set('tenant', tenantContext);
    return next();
  }

  // 3. Check X-Gateway-Signature HMAC verification
  if (tenantIdHeader && gatewaySignature && c.env.GATEWAY_SHARED_SECRET) {
    const requestId = c.req.header('X-Request-ID') || '';
    const message = tenantIdHeader + requestId;
    const expectedSignature = await computeHmacSha256(
      c.env.GATEWAY_SHARED_SECRET,
      message,
    );

    if (timingSafeEqual(gatewaySignature, expectedSignature)) {
      const tenantContext = buildTenantContextFromGateway(tenantIdHeader, c.env);
      c.set('tenant', tenantContext);
      return next();
    }
    // If signature doesn't match, fall through to JWT validation
  }

  // 4. JWT HS256 validation
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json(
      { error: 'Authentication required', code: 'UNAUTHORIZED' },
      401,
    );
  }

  const token = authHeader.slice(7);
  if (!token) {
    return c.json(
      { error: 'Authentication required', code: 'UNAUTHORIZED' },
      401,
    );
  }

  // Ensure JWT_SECRET is configured
  if (!c.env.JWT_SECRET) {
    return c.json(
      { error: 'Server configuration error', code: 'INTERNAL_ERROR' },
      500,
    );
  }

  let payload: Record<string, unknown>;
  try {
    // hono/jwt verify validates signature, exp, and nbf automatically
    payload = (await verify(token, c.env.JWT_SECRET, 'HS256')) as Record<
      string,
      unknown
    >;
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Invalid token';
    return c.json(
      { error: `Authentication failed: ${message}`, code: 'UNAUTHORIZED' },
      401,
    );
  }

  // Validate required claims: tenant_id and jti
  const tenantId = payload.tenant_id as string | undefined;
  if (!tenantId) {
    return c.json(
      { error: 'Missing tenant context in token', code: 'FORBIDDEN' },
      403,
    );
  }

  const jti = payload.jti as string | undefined;
  if (!jti) {
    return c.json(
      { error: 'Missing jti claim in token', code: 'UNAUTHORIZED' },
      401,
    );
  }

  // Check JTI revocation
  if (isJtiRevoked(jti)) {
    return c.json(
      { error: 'Token has been revoked', code: 'UNAUTHORIZED' },
      401,
    );
  }

  // Build JWT claims object
  const claims: JWTClaims = {
    tenant_id: tenantId,
    jti,
    sub: (payload.sub as string) || '',
    exp: payload.exp as number,
    nbf: payload.nbf as number | undefined,
    roles: Array.isArray(payload.roles)
      ? (payload.roles as string[])
      : undefined,
  };

  const tenantContext = buildTenantContextFromJwt(claims, c.env);
  c.set('tenant', tenantContext);
  return next();
});
