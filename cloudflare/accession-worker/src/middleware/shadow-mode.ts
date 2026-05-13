/**
 * Shadow Mode Middleware
 *
 * Activates shadow mode for write requests when:
 * - `SHADOW_MODE=true` globally, OR
 * - `CANARY_TENANT_IDS` is set and the current tenant is NOT in the canary list
 *
 * GET requests always pass through (never shadowed) per Requirement 13.9.
 *
 * When shadow mode is active, the middleware sets `c.set('shadowMode', true)` so
 * route handlers can check and suppress D1 writes and MWL side effects, responding
 * with 202 and a shadow response body.
 *
 * Requirements: 13.2, 13.3, 13.6, 13.8, 13.9
 */

import { createMiddleware } from 'hono/factory';
import type { Env, TenantContext } from '../types';

/**
 * Hono context variables added by this middleware.
 */
export interface ShadowModeVariables {
  shadowMode: boolean;
}

/**
 * Shadow mode middleware for Hono.
 *
 * Validates: Requirements 13.2, 13.3, 13.6, 13.8, 13.9
 */
export const shadowModeMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: ShadowModeVariables & { tenant?: TenantContext };
}>(async (c, next) => {
  // Requirement 13.9: GET requests are NEVER routed through shadow mode
  if (c.req.method === 'GET') {
    c.set('shadowMode', false);
    await next();
    return;
  }

  const env = c.env;
  const isShadowGlobal = env.SHADOW_MODE === 'true';

  // Determine tenant_id from context. The auth/tenant middleware runs before
  // shadow-mode in the middleware chain, so tenant context should be available.
  const tenantContext = c.get('tenant') as TenantContext | undefined;
  const tenantId =
    tenantContext?.tenantId || c.req.header('x-tenant-id') || '';

  let isShadowForTenant = false;

  if (env.CANARY_TENANT_IDS) {
    // Requirement 13.8: When CANARY_TENANT_IDS is set, only listed tenants get
    // real processing. All others are routed through shadow mode.
    const canaryTenants = env.CANARY_TENANT_IDS.split(',').map((id) =>
      id.trim(),
    );
    const isCanaryTenant = canaryTenants.includes(tenantId);

    // If tenant IS in canary list → real processing (no shadow)
    // If tenant is NOT in canary list → shadow mode
    isShadowForTenant = !isCanaryTenant;
  }

  // Shadow is active if global flag is true OR tenant is not in canary list
  const shadowActive = isShadowGlobal || isShadowForTenant;

  c.set('shadowMode', shadowActive);

  await next();
});

/**
 * Helper to build a shadow-mode 202 response.
 *
 * Route handlers should call this when `c.get('shadowMode')` is true,
 * instead of persisting data.
 *
 * Validates: Requirement 13.3
 *
 * @param wouldRespond - The response body the handler would have returned
 * @returns A Response with status 202 and shadow envelope
 */
export function createShadowResponse(wouldRespond: unknown): Response {
  return new Response(
    JSON.stringify({
      status: 'shadow',
      would_respond: wouldRespond,
    }),
    {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}
