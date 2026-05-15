/**
 * Proxy service — handles forwarding requests to upstream services
 * with timeout, circuit breaker, and tenant context injection.
 */

import { getAuthContext } from '../utils/auth';
import { computeHMAC } from '../utils/hmac';
import { isCircuitOpen, recordSuccess, recordFailure } from '../utils/circuit-breaker';
import { PROXY_TIMEOUT_MS } from '../utils/constants';

/**
 * Proxy a request to a legacy backend service via BACKBONE (VPC tunnel) or direct fetch.
 */
export async function proxyRequest(
  c: any,
  baseUrl: string,
  targetPath: string,
  extraHeaders: Record<string, string> = {},
  serviceName?: string
): Promise<Response> {
  const svc = serviceName || baseUrl;

  if (isCircuitOpen(svc)) {
    return c.json({
      success: false,
      error: { code: 'SERVICE_UNAVAILABLE', message: `Service ${svc} is temporarily unavailable (circuit open)` },
    }, 503);
  }

  const url = new URL(
    targetPath.startsWith('http')
      ? targetPath
      : `${baseUrl.replace(/\/$/, '')}/${targetPath.replace(/^\//, '')}`
  );
  const searchParams = new URLSearchParams(c.req.query());
  searchParams.forEach((value, key) => url.searchParams.set(key, value));

  const headers = new Headers();
  const forwardHeaders = ['authorization', 'cookie', 'x-api-key', 'content-type'];
  forwardHeaders.forEach(h => {
    const val = c.req.header(h);
    if (val) headers.set(h, val);
  });

  Object.entries(extraHeaders).forEach(([k, v]) => headers.set(k, v));

  // Inject tenant context from JWT
  const { tenant_id, role } = await getAuthContext(c);
  if (tenant_id) {
    headers.set('X-Tenant-ID', String(tenant_id));
    headers.set('X-Hospital-ID', String(tenant_id));
  } else if (role === 'superadmin') {
    const clientTenant = c.req.header('X-Tenant-ID');
    if (clientTenant) {
      headers.set('X-Tenant-ID', clientTenant);
      headers.set('X-Hospital-ID', clientTenant);
    }
  }

  // Propagate request ID
  const reqId = c.req.header('X-Request-ID') || '';
  if (reqId) headers.set('X-Request-ID', reqId);

  const reqInit: RequestInit = {
    method: c.req.method,
    headers,
    body: ['GET', 'HEAD'].includes(c.req.method) ? null : await c.req.arrayBuffer(),
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

    let response: Response;
    try {
      // Use BACKBONE VPC Network binding for private network routing via cloudflared tunnel
      // Resolves Docker internal hostnames (e.g. http://pacs-service:8003)
      response = c.env.BACKBONE
        ? await c.env.BACKBONE.fetch(url.toString(), { ...reqInit, signal: controller.signal })
        : await fetch(url.toString(), { ...reqInit, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }

    recordSuccess(svc);

    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    });
  } catch (e: any) {
    recordFailure(svc);

    if (e.name === 'AbortError') {
      console.error(`[Proxy Timeout] ${url} after ${PROXY_TIMEOUT_MS}ms`);
      return c.json({
        success: false,
        error: { code: 'GATEWAY_TIMEOUT', message: `Request to ${svc} timed out after ${PROXY_TIMEOUT_MS / 1000}s` },
      }, 504);
    }

    console.error(`[Proxy Error] ${url}:`, e.message);
    return c.json({
      success: false,
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Service unavailable' },
    }, 503);
  }
}

/**
 * Dispatch a request to a Cloudflare Worker via Service Binding.
 */
export async function dispatchToWorker(
  c: any,
  worker: Fetcher | undefined,
  workerName: string,
  targetPath: string,
  opts: { hmac?: boolean; forwardIp?: boolean } = {}
): Promise<Response> {
  if (!worker) {
    return c.json({ error: `Service Binding ${workerName} unbound` }, 500);
  }

  if (isCircuitOpen(workerName)) {
    return c.json({
      success: false,
      error: { code: 'SERVICE_UNAVAILABLE', message: `${workerName} is temporarily unavailable` },
    }, 503);
  }

  const headers = new Headers();
  const forwardHeaders = ['authorization', 'content-type', 'x-request-id'];
  forwardHeaders.forEach(h => {
    const val = c.req.header(h);
    if (val) headers.set(h, val);
  });

  // Resolve tenant from JWT
  const { tenant_id, role } = await getAuthContext(c);
  const tenantId = tenant_id
    ? String(tenant_id)
    : (role === 'superadmin' ? (c.req.header('X-Tenant-ID') || '') : '');
  headers.set('X-Tenant-ID', tenantId);
  headers.set('X-Hospital-ID', tenantId);

  // HMAC signature for gateway auth
  if (opts.hmac && c.env.GATEWAY_SHARED_SECRET) {
    const requestId = c.req.header('x-request-id') || '';
    const signature = await computeHMAC(tenantId + requestId, c.env.GATEWAY_SHARED_SECRET);
    headers.set('X-Gateway-Signature', signature);
  }

  // Forward client IP for auth-worker
  if (opts.forwardIp) {
    const clientIp = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || '';
    headers.set('X-Forwarded-For', clientIp);
    headers.set('X-Real-IP', clientIp);
    headers.set('CF-Connecting-IP', clientIp);
    headers.set('X-Original-User-Agent', c.req.header('User-Agent') || '');
  }

  const body = ['GET', 'HEAD'].includes(c.req.method) ? null : await c.req.arrayBuffer();

  try {
    const response = await worker.fetch(
      new Request(`https://${workerName}${targetPath}`, {
        method: c.req.method,
        headers,
        body,
      })
    );

    recordSuccess(workerName);

    return new Response(response.body, {
      status: response.status,
      headers: { 'Content-Type': response.headers.get('content-type') || 'application/json' },
    });
  } catch (e: any) {
    recordFailure(workerName);
    console.error(`[${workerName} Error]`, e.message);
    return c.json({
      error: 'Bad Gateway',
      path: targetPath,
      message: e.message || `Failed to connect to ${workerName}`,
    }, 502);
  }
}
