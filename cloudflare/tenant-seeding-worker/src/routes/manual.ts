/**
 * POST /seed/manual route handler.
 *
 * Allows platform operators to manually trigger user seeding for an
 * existing tenant. Requires JWT authentication with SUPERADMIN role.
 * Queries existing users for the tenant and creates default users only
 * for roles not already present.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4
 */

import { Hono } from 'hono';
import { jwtAuth } from '../middleware/jwt-auth';
import { AuthClient } from '../services/auth-client';
import { generatePassword } from '../services/password-generator';
import { DEFAULT_USERS, type Env } from '../types';
import type { D1Logger } from '../../../shared/logger';

const manualRoute = new Hono<{ Bindings: Env }>();

manualRoute.post('/seed/manual', jwtAuth, async (c) => {
  const logger = (c as any).get('logger') as D1Logger | undefined;

  // Parse and validate request body
  let body: { tenant_id?: string; email_domain?: string; roles?: string[] };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { tenant_id, email_domain, roles } = body;

  if (!tenant_id || typeof tenant_id !== 'string' || tenant_id.trim() === '') {
    return c.json({ error: 'tenant_id is required' }, 400);
  }

  // Create auth client and authenticate
  const authClient = new AuthClient(c.env);
  await authClient.login();

  // Query existing users for the tenant
  const existingUsers = await authClient.getUsersByTenant(tenant_id);

  // If tenant doesn't exist (auth-service returns null/empty for unknown tenant)
  if (existingUsers === null) {
    return c.json({ error: 'Tenant not found' }, 404);
  }

  // Determine which roles already have users assigned
  const existingRoles = new Set(
    existingUsers.map((u) => u.role?.toUpperCase()).filter(Boolean)
  );

  // Determine which default users to create
  let usersToCreate = DEFAULT_USERS;

  // If specific roles were requested, filter to only those
  if (roles && Array.isArray(roles) && roles.length > 0) {
    const requestedRoles = new Set(roles.map((r) => r.toUpperCase()));
    usersToCreate = DEFAULT_USERS.filter((u) => requestedRoles.has(u.role));
  }

  // Skip roles that already have users
  const rolesToSkip: string[] = [];
  const rolesToCreate = usersToCreate.filter((u) => {
    if (existingRoles.has(u.role)) {
      rolesToSkip.push(u.role);
      return false;
    }
    return true;
  });

  // Create users for roles not already present
  let usersCreated = 0;

  // Use email_domain if provided, otherwise derive from tenant_id
  // We need tenant_code for username generation — use tenant_id as fallback
  const tenantCode = tenant_id.toLowerCase();

  for (const userDef of rolesToCreate) {
    const username = `${userDef.usernamePrefix}.${tenantCode}`;
    const emailDomain = email_domain || `${tenantCode}.local`;
    const email = `${userDef.emailPrefix}@${emailDomain}`;
    const full_name = `${userDef.fullNamePrefix} ${tenant_id}`;
    const password = generatePassword();

    try {
      const response = await authClient.createUser({
        username,
        email,
        password,
        full_name,
        role: userDef.role,
        is_active: true,
        tenant_id,
      });

      if (response.status === 201 || response.status === 409) {
        usersCreated++;
      }
    } catch (error) {
      // Log but continue with remaining users
      console.error(
        JSON.stringify({
          tenant_id,
          username,
          role: userDef.role,
          status: 'failure',
          error: error instanceof Error ? error.message : String(error),
        })
      );
    }
  }

  // Emit audit log for manual seed operation
  if (logger) {
    logger.audit({
      action: 'TENANT_PROVISION',
      resource_type: 'tenant',
      resource_id: tenant_id,
      changes: {
        before: { existing_roles: Array.from(existingRoles) },
        after: { users_created: usersCreated, roles_skipped: rolesToSkip, roles_requested: roles || null },
      },
    });
  }

  return c.json({
    users_created: usersCreated,
    roles_skipped: rolesToSkip,
  }, 200);
});

export { manualRoute };
