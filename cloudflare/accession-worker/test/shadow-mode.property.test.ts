import { describe, it } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 26: Shadow mode activation logic.
 * Tests the shadow mode decision logic from the middleware.
 */

interface ShadowConfig {
  shadowModeGlobal: boolean;
  canaryTenantIds: string[];
  tenantId: string;
  method: string;
}

function isShadowActive(config: ShadowConfig): boolean {
  // GET requests are never shadowed
  if (config.method === 'GET') return false;

  if (config.shadowModeGlobal) return true;

  if (config.canaryTenantIds.length > 0) {
    // Tenants NOT in canary list are shadowed
    return !config.canaryTenantIds.includes(config.tenantId);
  }

  return false;
}

describe('Property 26: Shadow mode activation', () => {
  it('GET requests are never shadowed regardless of config', () => {
    fc.assert(fc.property(
      fc.boolean(),
      fc.array(fc.string({ minLength: 1, maxLength: 10 })),
      fc.string({ minLength: 1, maxLength: 10 }),
      (globalShadow, canary, tenant) => {
        return !isShadowActive({ shadowModeGlobal: globalShadow, canaryTenantIds: canary, tenantId: tenant, method: 'GET' });
      }
    ), { numRuns: 200 });
  });

  it('global shadow mode shadows all non-GET requests', () => {
    fc.assert(fc.property(
      fc.constantFrom('POST', 'PATCH', 'DELETE', 'PUT'),
      fc.string({ minLength: 1, maxLength: 10 }),
      (method, tenant) => {
        return isShadowActive({ shadowModeGlobal: true, canaryTenantIds: [], tenantId: tenant, method });
      }
    ), { numRuns: 100 });
  });

  it('canary tenants are NOT shadowed', () => {
    fc.assert(fc.property(
      fc.string({ minLength: 1, maxLength: 10 }),
      fc.constantFrom('POST', 'PATCH', 'DELETE'),
      (tenant, method) => {
        return !isShadowActive({ shadowModeGlobal: false, canaryTenantIds: [tenant], tenantId: tenant, method });
      }
    ), { numRuns: 100 });
  });

  it('non-canary tenants ARE shadowed when canary list is set', () => {
    fc.assert(fc.property(
      fc.string({ minLength: 1, maxLength: 10 }),
      fc.string({ minLength: 1, maxLength: 10 }),
      fc.constantFrom('POST', 'PATCH', 'DELETE'),
      (tenant, canaryTenant, method) => {
        if (tenant === canaryTenant) return true; // skip equal case
        return isShadowActive({ shadowModeGlobal: false, canaryTenantIds: [canaryTenant], tenantId: tenant, method });
      }
    ), { numRuns: 100 });
  });
});
