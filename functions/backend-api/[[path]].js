/**
 * Cloudflare Pages Function — Proxy /backend-api/* to api-gateway-v2
 * Strips /backend-api prefix. Forwards ALL headers for auth.
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

  // Strip /backend-api prefix
  const backendPath = url.pathname.replace(/^\/backend-api/, '');
  const gatewayUrl = `${GATEWAY_URL}${backendPath}${url.search}`;

  // Forward ALL request headers
  const headers = new Headers();
  for (const [key, value] of request.headers.entries()) {
    if (['host', 'cf-connecting-ip', 'cf-ray', 'cf-visitor', 'cf-ipcountry', 'cf-worker'].includes(key.toLowerCase())) {
      continue;
    }
    headers.set(key, value);
  }

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

    const responseHeaders = new Headers();
    for (const [key, value] of response.headers.entries()) {
      responseHeaders.set(key, value);
    }
    responseHeaders.set('Access-Control-Allow-Origin', url.origin);
    responseHeaders.set('Access-Control-Allow-Credentials', 'true');
    responseHeaders.set('Access-Control-Expose-Headers', 'Content-Length, Content-Type, X-CSRF-Token, X-Cache-Status');

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders
    });
  } catch (error) {
    console.error(`[Pages /backend-api] ${request.method} ${url.pathname} -> Error: ${error.message}`);
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
