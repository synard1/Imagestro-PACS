/**
 * Log Viewer API routes.
 *
 * Mounted at `/api/v2/logs` by the gateway index.
 * Provides query endpoints for app_logs, error_events, worker_audit_logs,
 * and performance_metrics stored in the shared D1 LOG_DB.
 *
 * Requirements: 8.3, 8.4, 8.5, 12.1, 12.2, 12.5, 12.7, 13.1, 13.2, 13.3, 13.4, 13.6, 13.7, 3.5
 */

import { Hono } from 'hono';
import { verify } from 'hono/jwt';
import { uuidv7 } from 'uuidv7';
import type { AppContext } from '../types';
import {
  appLogsQuerySchema,
  errorEventsQuerySchema,
  auditLogsQuerySchema,
  metricsQuerySchema,
} from '../validators/logs';
import {
  LogQueryValidationError,
  LogQueryForbiddenError,
  LogQueryCrossTenantForbiddenError,
  LogNotFoundError,
} from '../errors';

// ─── Permission Constants ────────────────────────────────────────────────────

const LOGS_VIEWER = 'logs:read';
const LOGS_ADMIN = 'logs:admin';

// ─── Auth Payload Interface ──────────────────────────────────────────────────

interface LogsAuthPayload {
  user_id: string;
  tenant_id: string | null;
  role: string | null;
  permissions: string[];
  username: string | null;
  ip_address: string | null;
  user_agent: string | null;
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const logsRoutes = new Hono<AppContext>();

// ─── JWT Auth Middleware (applied to all log routes) ─────────────────────────

/**
 * Verify JWT and extract the full auth payload including user_id, permissions,
 * and role. Rejects with 401 if no valid token is present.
 *
 * Requirements: 13.1
 */
logsRoutes.use('*', async (c, next) => {
  const authHeader = c.req.header('Authorization');
  let token: string | null = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  if (!token) {
    return c.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'JWT bearer token required' } },
      401,
    );
  }

  try {
    const payload = await verify(token, c.env.JWT_SECRET, (c.env.JWT_ALGORITHM || 'HS256') as any);

    const authPayload: LogsAuthPayload = {
      user_id: payload.user_id as string,
      tenant_id: (payload.tenant_id as string) ?? null,
      role: ((payload.role as string) ?? '').toLowerCase() || null,
      permissions: (payload.permissions as string[]) ?? [],
      username: (payload.username as string) ?? null,
      ip_address: c.req.header('CF-Connecting-IP') ?? null,
      user_agent: c.req.header('User-Agent') ?? null,
    };

    // Store auth payload for downstream handlers
    c.set('logsAuth' as any, authPayload);
  } catch {
    return c.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid or expired JWT token' } },
      401,
    );
  }

  await next();
});

// ─── Permission Helpers ──────────────────────────────────────────────────────

/**
 * Check if the user has the required permission.
 * The wildcard '*' grants all permissions (super_admin).
 */
function hasPermission(auth: LogsAuthPayload, permission: string): boolean {
  return auth.permissions.includes('*') || auth.permissions.includes(permission);
}

/**
 * Require a specific permission. Throws LogQueryForbiddenError if missing.
 * Emits a LOGS_DENIED audit record before throwing on failure.
 *
 * Requirements: 13.2, 13.3, 13.6
 */
async function requirePermissionWithAudit(
  auth: LogsAuthPayload,
  permission: string,
  db: D1Database | null,
  resourceType: string,
  requestId: string | null,
): Promise<void> {
  if (!hasPermission(auth, permission)) {
    // Emit LOGS_DENIED audit record before rejecting
    await emitAuditRecord(db, auth, 'LOGS_DENIED', resourceType, { required_permission: permission }, null, requestId);
    throw new LogQueryForbiddenError(
      `Permission '${permission}' required to access this log endpoint`,
    );
  }
}

// ─── Tenant Predicate Helper ─────────────────────────────────────────────────

interface TenantPredicate {
  tenantId: string | null;
  isCrossTenant: boolean;
}

/**
 * Determine the tenant_id predicate for a log query.
 *
 * - Always scopes to the requester's tenant_id.
 * - Only allows cross-tenant (using a provided tenant_id query param) when
 *   the requester has LOGS_ADMIN AND role is 'superadmin'.
 * - Rejects with 403 + LogQueryCrossTenantForbiddenError otherwise.
 *
 * Requirements: 8.3, 8.4, 8.5, 13.4
 */
function appendTenantPredicate(
  queryTenantId: string | undefined,
  auth: LogsAuthPayload,
): TenantPredicate {
  // If the user provides a tenant_id query param different from their own
  if (queryTenantId && queryTenantId !== auth.tenant_id) {
    // Only super_admin + LOGS_ADMIN can do cross-tenant queries
    if (auth.role === 'superadmin' && hasPermission(auth, LOGS_ADMIN)) {
      return { tenantId: queryTenantId, isCrossTenant: true };
    }
    throw new LogQueryCrossTenantForbiddenError();
  }

  // Default: scope to requester's tenant
  return { tenantId: auth.tenant_id, isCrossTenant: false };
}

// ─── Audit Emission Helper ───────────────────────────────────────────────────

/**
 * Emit a worker_audit_logs record for every served log viewer request.
 *
 * Requirements: 13.7
 */
async function emitAuditRecord(
  db: D1Database | null,
  auth: LogsAuthPayload,
  action: 'LOGS_QUERY' | 'LOGS_DENIED',
  resourceType: string,
  queryParams: Record<string, unknown>,
  resultCount: number | null,
  requestId: string | null,
): Promise<void> {
  if (!db) return;

  const id = uuidv7();
  const timestamp = Date.now();

  try {
    await db
      .prepare(
        `INSERT INTO worker_audit_logs (id, timestamp, worker, action, actor_user_id, actor_role, tenant_id, resource_type, resource_id, changes, request_id, ip_address, user_agent)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`,
      )
      .bind(
        id,
        timestamp,
        'api-gateway-v2',
        action,
        auth.user_id,
        auth.role,
        auth.tenant_id ?? 'system',
        resourceType,
        null,
        JSON.stringify({ query_params: queryParams, result_count: resultCount }),
        requestId,
        auth.ip_address,
        auth.user_agent,
      )
      .run();
  } catch {
    // Never let audit emission failure break the response (Req 11.2)
    console.error('[logs-audit] Failed to emit audit record');
  }
}

// ─── Cursor Parsing Helper ───────────────────────────────────────────────────

interface CursorValues {
  cursorTs: number;
  cursorId: string;
}

/**
 * Decode a cursor string into timestamp + id components.
 * Cursor format: `${timestamp}_${id}` (base64url encoded).
 */
function decodeCursor(cursor: string): CursorValues | null {
  try {
    const decoded = atob(cursor);
    const separatorIdx = decoded.indexOf('_');
    if (separatorIdx === -1) return null;

    const cursorTs = parseInt(decoded.substring(0, separatorIdx), 10);
    const cursorId = decoded.substring(separatorIdx + 1);

    if (isNaN(cursorTs) || !cursorId) return null;
    return { cursorTs, cursorId };
  } catch {
    return null;
  }
}

/**
 * Encode timestamp + id into a cursor string.
 */
function encodeCursor(timestamp: number, id: string): string {
  return btoa(`${timestamp}_${id}`);
}

// ─── Time Range Defaults ─────────────────────────────────────────────────────

function resolveTimeRange(from?: string, to?: string): { fromMs: number; toMs: number } {
  const toMs = to ? new Date(to).getTime() : Date.now();
  const fromMs = from ? new Date(from).getTime() : toMs - 3_600_000; // default 1 hour
  return { fromMs, toMs };
}

// ─── GET /app — Query app_logs ───────────────────────────────────────────────

logsRoutes.get('/app', async (c) => {
  const auth = c.get('logsAuth' as any) as LogsAuthPayload;
  const db = c.env.LOG_DB;
  const requestId = c.get('requestId') ?? null;
  await requirePermissionWithAudit(auth, LOGS_VIEWER, db, 'app_logs', requestId);

  const rawQuery = c.req.query();
  const parsed = appLogsQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    throw new LogQueryValidationError('Invalid query parameters', parsed.error.flatten());
  }

  const filters = parsed.data;
  const { tenantId } = appendTenantPredicate(filters.tenant_id, auth);
  const { fromMs, toMs } = resolveTimeRange(filters.from, filters.to);
  const queryId = uuidv7();

  if (!db) {
    return c.json({ items: [], next_cursor: null, query_id: queryId });
  }

  // Build query
  const params: unknown[] = [];
  let whereClause = 'WHERE tenant_id = ?1 AND timestamp BETWEEN ?2 AND ?3';
  params.push(tenantId, fromMs, toMs);
  let paramIdx = 3;

  // Cursor-based pagination
  let cursorClause = '';
  if (filters.cursor) {
    const cursorVals = decodeCursor(filters.cursor);
    if (cursorVals) {
      paramIdx++;
      params.push(cursorVals.cursorTs);
      paramIdx++;
      params.push(cursorVals.cursorId);
      cursorClause = ` AND (timestamp < ?${paramIdx - 1} OR (timestamp = ?${paramIdx - 1} AND id < ?${paramIdx}))`;
    }
  }

  // Optional level filter
  if (filters.level) {
    paramIdx++;
    params.push(filters.level);
    whereClause += ` AND level = ?${paramIdx}`;
  }

  // Optional worker filter
  if (filters.worker) {
    paramIdx++;
    params.push(filters.worker);
    whereClause += ` AND worker = ?${paramIdx}`;
  }

  // Optional request_id filter
  if (filters.request_id) {
    paramIdx++;
    params.push(filters.request_id);
    whereClause += ` AND request_id = ?${paramIdx}`;
  }

  paramIdx++;
  params.push(filters.limit);

  const sql = `SELECT * FROM app_logs ${whereClause}${cursorClause} ORDER BY timestamp DESC, id DESC LIMIT ?${paramIdx}`;

  const result = await db.prepare(sql).bind(...params).all();
  const items = result.results ?? [];

  // Compute next_cursor from last item
  let nextCursor: string | null = null;
  if (items.length === filters.limit) {
    const lastItem = items[items.length - 1] as any;
    nextCursor = encodeCursor(lastItem.timestamp, lastItem.id);
  }

  // Emit audit record
  await emitAuditRecord(db, auth, 'LOGS_QUERY', 'app_logs', rawQuery, items.length, requestId);

  return c.json({ items, next_cursor: nextCursor, query_id: queryId });
});

// ─── GET /errors — Query error_events ────────────────────────────────────────

logsRoutes.get('/errors', async (c) => {
  const auth = c.get('logsAuth' as any) as LogsAuthPayload;
  const db = c.env.LOG_DB;
  const requestId = c.get('requestId') ?? null;
  await requirePermissionWithAudit(auth, LOGS_VIEWER, db, 'error_events', requestId);

  const rawQuery = c.req.query();
  const parsed = errorEventsQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    throw new LogQueryValidationError('Invalid query parameters', parsed.error.flatten());
  }

  const filters = parsed.data;
  const { tenantId } = appendTenantPredicate(filters.tenant_id, auth);
  const { fromMs, toMs } = resolveTimeRange(filters.from, filters.to);
  const queryId = uuidv7();

  if (!db) {
    return c.json({ items: [], next_cursor: null, query_id: queryId });
  }

  const params: unknown[] = [];
  let whereClause = 'WHERE tenant_id = ?1 AND timestamp BETWEEN ?2 AND ?3';
  params.push(tenantId, fromMs, toMs);
  let paramIdx = 3;

  // Cursor-based pagination
  let cursorClause = '';
  if (filters.cursor) {
    const cursorVals = decodeCursor(filters.cursor);
    if (cursorVals) {
      paramIdx++;
      params.push(cursorVals.cursorTs);
      paramIdx++;
      params.push(cursorVals.cursorId);
      cursorClause = ` AND (timestamp < ?${paramIdx - 1} OR (timestamp = ?${paramIdx - 1} AND id < ?${paramIdx}))`;
    }
  }

  // Optional severity filter
  if (filters.severity) {
    paramIdx++;
    params.push(filters.severity);
    whereClause += ` AND severity = ?${paramIdx}`;
  }

  // Optional worker filter
  if (filters.worker) {
    paramIdx++;
    params.push(filters.worker);
    whereClause += ` AND worker = ?${paramIdx}`;
  }

  // Optional request_id filter
  if (filters.request_id) {
    paramIdx++;
    params.push(filters.request_id);
    whereClause += ` AND request_id = ?${paramIdx}`;
  }

  paramIdx++;
  params.push(filters.limit);

  const sql = `SELECT * FROM error_events ${whereClause}${cursorClause} ORDER BY timestamp DESC, id DESC LIMIT ?${paramIdx}`;

  const result = await db.prepare(sql).bind(...params).all();
  const items = result.results ?? [];

  let nextCursor: string | null = null;
  if (items.length === filters.limit) {
    const lastItem = items[items.length - 1] as any;
    nextCursor = encodeCursor(lastItem.timestamp, lastItem.id);
  }

  await emitAuditRecord(db, auth, 'LOGS_QUERY', 'error_events', rawQuery, items.length, requestId);

  return c.json({ items, next_cursor: nextCursor, query_id: queryId });
});

// ─── GET /errors/:id — Get single error event ────────────────────────────────

logsRoutes.get('/errors/:id', async (c) => {
  const auth = c.get('logsAuth' as any) as LogsAuthPayload;
  const db = c.env.LOG_DB;
  const requestId = c.get('requestId') ?? null;
  await requirePermissionWithAudit(auth, LOGS_VIEWER, db, 'error_events', requestId);

  const errorId = c.req.param('id');
  const queryId = uuidv7();

  if (!db) {
    throw new LogNotFoundError();
  }

  // Scope by tenant_id for isolation
  const { tenantId } = appendTenantPredicate(undefined, auth);

  const result = await db
    .prepare('SELECT * FROM error_events WHERE id = ?1 AND tenant_id = ?2')
    .bind(errorId, tenantId)
    .first();

  if (!result) {
    throw new LogNotFoundError(`Error event '${errorId}' not found`);
  }

  await emitAuditRecord(db, auth, 'LOGS_QUERY', 'error_events', { id: errorId }, 1, requestId);

  return c.json({ item: result, query_id: queryId });
});

// ─── PATCH /errors/:id/resolve — Mark error event resolved ───────────────────

logsRoutes.patch('/errors/:id/resolve', async (c) => {
  const auth = c.get('logsAuth' as any) as LogsAuthPayload;
  const db = c.env.LOG_DB;
  const requestId = c.get('requestId') ?? null;
  await requirePermissionWithAudit(auth, LOGS_ADMIN, db, 'error_events', requestId);

  const errorId = c.req.param('id');

  if (!db) {
    throw new LogNotFoundError();
  }

  // Scope by tenant_id for isolation
  const { tenantId } = appendTenantPredicate(undefined, auth);

  // Check the record exists and belongs to the requester's tenant
  const existing = await db
    .prepare('SELECT id, resolved_at FROM error_events WHERE id = ?1 AND tenant_id = ?2')
    .bind(errorId, tenantId)
    .first();

  if (!existing) {
    throw new LogNotFoundError(`Error event '${errorId}' not found`);
  }

  // Set resolved_at and resolved_by
  const resolvedAt = Date.now();
  await db
    .prepare('UPDATE error_events SET resolved_at = ?1, resolved_by = ?2 WHERE id = ?3 AND tenant_id = ?4')
    .bind(resolvedAt, auth.user_id, errorId, tenantId)
    .run();

  // Emit audit record for the resolve action
  await emitAuditRecord(
    db,
    auth,
    'LOGS_QUERY',
    'error_events',
    { id: errorId, action: 'resolve' },
    1,
    requestId,
  );

  return c.json({
    success: true,
    item: { id: errorId, resolved_at: resolvedAt, resolved_by: auth.user_id },
  });
});

// ─── GET /audit — Query worker_audit_logs ────────────────────────────────────

logsRoutes.get('/audit', async (c) => {
  const auth = c.get('logsAuth' as any) as LogsAuthPayload;
  const db = c.env.LOG_DB;
  const requestId = c.get('requestId') ?? null;
  await requirePermissionWithAudit(auth, LOGS_ADMIN, db, 'worker_audit_logs', requestId);

  const rawQuery = c.req.query();
  const parsed = auditLogsQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    throw new LogQueryValidationError('Invalid query parameters', parsed.error.flatten());
  }

  const filters = parsed.data;
  const { tenantId } = appendTenantPredicate(filters.tenant_id, auth);
  const { fromMs, toMs } = resolveTimeRange(filters.from, filters.to);
  const queryId = uuidv7();

  if (!db) {
    return c.json({ items: [], next_cursor: null, query_id: queryId });
  }

  const params: unknown[] = [];
  let whereClause = 'WHERE tenant_id = ?1 AND timestamp BETWEEN ?2 AND ?3';
  params.push(tenantId, fromMs, toMs);
  let paramIdx = 3;

  // Cursor-based pagination
  let cursorClause = '';
  if (filters.cursor) {
    const cursorVals = decodeCursor(filters.cursor);
    if (cursorVals) {
      paramIdx++;
      params.push(cursorVals.cursorTs);
      paramIdx++;
      params.push(cursorVals.cursorId);
      cursorClause = ` AND (timestamp < ?${paramIdx - 1} OR (timestamp = ?${paramIdx - 1} AND id < ?${paramIdx}))`;
    }
  }

  // Optional action filter
  if (filters.action) {
    paramIdx++;
    params.push(filters.action);
    whereClause += ` AND action = ?${paramIdx}`;
  }

  // Optional resource_type filter
  if (filters.resource_type) {
    paramIdx++;
    params.push(filters.resource_type);
    whereClause += ` AND resource_type = ?${paramIdx}`;
  }

  // Optional worker filter
  if (filters.worker) {
    paramIdx++;
    params.push(filters.worker);
    whereClause += ` AND worker = ?${paramIdx}`;
  }

  // Optional request_id filter
  if (filters.request_id) {
    paramIdx++;
    params.push(filters.request_id);
    whereClause += ` AND request_id = ?${paramIdx}`;
  }

  paramIdx++;
  params.push(filters.limit);

  const sql = `SELECT * FROM worker_audit_logs ${whereClause}${cursorClause} ORDER BY timestamp DESC, id DESC LIMIT ?${paramIdx}`;

  const result = await db.prepare(sql).bind(...params).all();
  const items = result.results ?? [];

  let nextCursor: string | null = null;
  if (items.length === filters.limit) {
    const lastItem = items[items.length - 1] as any;
    nextCursor = encodeCursor(lastItem.timestamp, lastItem.id);
  }

  await emitAuditRecord(db, auth, 'LOGS_QUERY', 'worker_audit_logs', rawQuery, items.length, requestId);

  return c.json({ items, next_cursor: nextCursor, query_id: queryId });
});

// ─── GET /metrics — Query performance_metrics ────────────────────────────────

logsRoutes.get('/metrics', async (c) => {
  const auth = c.get('logsAuth' as any) as LogsAuthPayload;
  const db = c.env.LOG_DB;
  const requestId = c.get('requestId') ?? null;
  await requirePermissionWithAudit(auth, LOGS_VIEWER, db, 'performance_metrics', requestId);

  const rawQuery = c.req.query();
  const parsed = metricsQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    throw new LogQueryValidationError('Invalid query parameters', parsed.error.flatten());
  }

  const filters = parsed.data;
  const { tenantId } = appendTenantPredicate(filters.tenant_id, auth);
  const { fromMs, toMs } = resolveTimeRange(filters.from, filters.to);
  const queryId = uuidv7();

  if (!db) {
    return c.json({ items: [], next_cursor: null, query_id: queryId });
  }

  const params: unknown[] = [];
  // performance_metrics uses period_start for time filtering
  let whereClause = 'WHERE tenant_id = ?1 AND period_start BETWEEN ?2 AND ?3';
  params.push(tenantId, fromMs, toMs);
  let paramIdx = 3;

  // Cursor-based pagination (using period_start DESC, id DESC)
  let cursorClause = '';
  if (filters.cursor) {
    const cursorVals = decodeCursor(filters.cursor);
    if (cursorVals) {
      paramIdx++;
      params.push(cursorVals.cursorTs);
      paramIdx++;
      params.push(cursorVals.cursorId);
      cursorClause = ` AND (period_start < ?${paramIdx - 1} OR (period_start = ?${paramIdx - 1} AND id < ?${paramIdx}))`;
    }
  }

  // Optional endpoint filter
  if (filters.endpoint) {
    paramIdx++;
    params.push(filters.endpoint);
    whereClause += ` AND endpoint = ?${paramIdx}`;
  }

  // Optional worker filter
  if (filters.worker) {
    paramIdx++;
    params.push(filters.worker);
    whereClause += ` AND worker = ?${paramIdx}`;
  }

  paramIdx++;
  params.push(filters.limit);

  const sql = `SELECT * FROM performance_metrics ${whereClause}${cursorClause} ORDER BY period_start DESC, id DESC LIMIT ?${paramIdx}`;

  const result = await db.prepare(sql).bind(...params).all();
  const items = result.results ?? [];

  let nextCursor: string | null = null;
  if (items.length === filters.limit) {
    const lastItem = items[items.length - 1] as any;
    nextCursor = encodeCursor(lastItem.period_start, lastItem.id);
  }

  await emitAuditRecord(db, auth, 'LOGS_QUERY', 'performance_metrics', rawQuery, items.length, requestId);

  return c.json({ items, next_cursor: nextCursor, query_id: queryId });
});
