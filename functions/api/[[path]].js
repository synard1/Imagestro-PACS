/**
 * Cloudflare Pages Function — Proxy /api/* to api-gateway-v2
 * Forwards ALL headers to preserve auth context (JWT in Authorization or Cookie).
 */
const GATEWAY_URL = 'https://api-gateway-v2.xolution.workers.dev';

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': url.origin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, Cookie, X-CSRF-Token, X-Tenant-ID, X-Hospital-ID, X-Request-ID, Accept, Cache-Control',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400',
      }
    });
  }

  // Forward to api-gateway-v2 (keeps /api prefix)
  const gatewayUrl = `${GATEWAY_URL}${url.pathname}${url.search}`;

  // Forward ALL request headers — don't filter, let gateway decide what to use
  const headers = new Headers();
  for (const [key, value] of request.headers.entries()) {
    // Skip hop-by-hop headers and CF internal headers
    if (['host', 'cf-connecting-ip', 'cf-ray', 'cf-visitor', 'cf-ipcountry', 'cf-worker'].includes(key.toLowerCase())) {
      continue;
    }
    headers.set(key, value);
  }

  // Override host to match gateway
  headers.set('X-Forwarded-For', request.headers.get('cf-connecting-ip') || '');
  headers.set('X-Forwarded-Host', url.hostname);
  headers.set('X-Forwarded-Proto', 'https');

  try {
    const response = await fetch(gatewayUrl, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? null : request.body,
      redirect: 'manual'
    });

    // Forward ALL response headers from gateway
    const responseHeaders = new Headers();
    for (const [key, value] of response.headers.entries()) {
      responseHeaders.set(key, value);
    }
    // Ensure CORS for browser
    responseHeaders.set('Access-Control-Allow-Origin', url.origin);
    responseHeaders.set('Access-Control-Allow-Credentials', 'true');
    responseHeaders.set('Access-Control-Expose-Headers', 'Content-Length, Content-Type, X-CSRF-Token, X-Cache-Status');

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders
    });
  } catch (error) {
    console.error(`[Pages /api] ${request.method} ${url.pathname} -> Error: ${error.message}`);
    return new Response(JSON.stringify({ 
      error: 'Gateway Error', 
      message: error.message 
    }), { 
      status: 502,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': url.origin,
        'Access-Control-Allow-Credentials': 'true'
      }
    });
  }
}
