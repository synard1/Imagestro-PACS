/**
 * Tenant context builder and JTI revocation management.
 *
 * Builds a TenantContext from JWT claims or gateway headers.
 * Maintains a per-isolate revoked JTI cache.
 *
 * Requirements: 5.1, 12.4, 12.6, 12.12
 */

import type { Env, TenantContext, JWTClaims } from '../types';

// ─── Per-Isolate Revoked JTI Cache ───────────────────────────────────────────

/**
 * Module-level Set that persists for the lifetime of the Worker isolate.
 * Each isolate maintains its own cache; revocations propagate via the
 * /admin/revoke-jti endpoint hitting all active isolates.
 */
const revokedJtis = new Set<string>();

/**
 * Add a JTI to the revocation cache. Once revoked, any JWT bearing this
 * JTI will be rejected with HTTP 401 regardless of signature validity.
 */
export function revokeJti(jti: string): void {
  revokedJtis.add(jti);
}

/**
 * Check whether a JTI has been revoked in this isolate's cache.
 */
export function isJtiRevoked(jti: string): boolean {
  return revokedJtis.has(jti);
}

/**
 * Get the current size of the revocation cache (useful for observability).
 */
export function getRevokedJtiCount(): number {
  return revokedJtis.size;
}

// ─── Tenant Context Builder ──────────────────────────────────────────────────

/** Default timezone when tenant has no configured timezone */
const DEFAULT_TIMEZONE = 'Asia/Jakarta';

/**
 * Build a TenantContext from validated JWT claims.
 */
export function buildTenantContextFromJwt(
  claims: JWTClaims,
  env: Env,
): TenantContext {
  return {
    tenantId: claims.tenant_id,
    facilityCode: env.FACILITY_CODE || '',
    timezone: DEFAULT_TIMEZONE,
    source: 'jwt',
    jwtClaims: claims,
    roles: claims.roles ?? [],
  };
}

/**
 * Build a TenantContext from gateway headers (Service Binding or
 * X-Gateway-Signature authenticated requests).
 */
export function buildTenantContextFromGateway(
  tenantId: string,
  env: Env,
): TenantContext {
  return {
    tenantId,
    facilityCode: env.FACILITY_CODE || '',
    timezone: DEFAULT_TIMEZONE,
    source: 'gateway',
    roles: [],
  };
}
