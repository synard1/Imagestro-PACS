/**
 * Cloudflare Pages Function — Proxy /wado-rs/* to api-gateway-v2
 */
const GATEWAY_URL = 'https://api-gateway-v2.xolution.workers.dev';

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': url.origin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, Cookie, X-Tenant-ID, X-Hospital-ID, Accept',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400',
      }
    });
  }

  const gatewayUrl = `${GATEWAY_URL}${url.pathname}${url.search}`;

  const headers = new Headers();
  const forwardHeaders = [
    'authorization', 'content-type', 'cookie', 'accept',
    'x-tenant-id', 'x-hospital-id', 'x-api-key', 'x-request-id'
  ];
  for (const h of forwardHeaders) {
    const val = request.headers.get(h);
    if (val) headers.set(h, val);
  }

  headers.set('X-Forwarded-For', request.headers.get('cf-connecting-ip') || '');
  headers.set('X-Forwarded-Host', url.hostname);

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

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
