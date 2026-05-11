const BACKEND_URL = 'https://dev-pacs-backend.satupintudigital.co.id';

// Headers that should NOT be forwarded to the backend
const IGNORE_HEADERS = [
  'host',
  'cf-ray',
  'cf-connecting-ip',
  'cf-ipcountry',
  'cf-visitor',
  'x-forwarded-for',
  'x-forwarded-proto',
  'x-real-ip'
];

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Strip /backend-api prefix to match local Vite proxy behavior
  const backendPath = url.pathname.replace(/^\/backend-api/, '');
  const backendUrl = `${BACKEND_URL}${backendPath}${url.search}`;

  console.log(`[Proxy] ${request.method} ${url.pathname} -> ${backendUrl}`);

  try {
    // Forward ALL headers from the client to the backend, except ignored ones
    const headers = new Headers();
    for (const [key, value] of request.headers.entries()) {
      if (!IGNORE_HEADERS.includes(key.toLowerCase())) {
        headers.set(key, value);
      }
    }

    // Add X-Forwarded headers for backend logging
    headers.set('X-Forwarded-For', request.headers.get('cf-connecting-ip') || '');
    headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''));
    headers.set('X-Forwarded-Host', url.hostname);
    headers.set('X-Real-IP', request.headers.get('cf-connecting-ip') || '');

    // Debug: Log important headers (redacted)
    const authHeaderValue = headers.get('authorization');
    const hasAuth = !!authHeaderValue;
    const authPrefix = authHeaderValue ? authHeaderValue.substring(0, 15) : 'none';
    const authLength = authHeaderValue ? authHeaderValue.length : 0;
    const tenantId = headers.get('x-tenant-id');
    console.log(`[Proxy Debug] Auth: ${hasAuth} (Prefix: ${authPrefix}, Len: ${authLength}), Tenant: ${tenantId}`);

    // Create backend request
    const backendRequest = new Request(backendUrl, {
      method: request.method,
      headers: headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
      redirect: 'manual'
    });

    // Fetch from backend
    const backendResponse = await fetch(backendRequest);

    // Prepare response headers
    const responseHeaders = new Headers(backendResponse.headers);

    // Add CORS headers (ensuring they are set correctly for pages.dev origin)
    responseHeaders.set('Access-Control-Allow-Origin', url.origin);
    responseHeaders.set('Access-Control-Allow-Credentials', 'true');
    responseHeaders.set('Access-Control-Expose-Headers', 'Content-Length, Content-Type, X-CSRF-Token, X-Tenant-ID');

    // Return response
    return new Response(backendResponse.body, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: responseHeaders
    });

  } catch (error) {
    console.error('[Proxy Error]', error);
    return new Response(JSON.stringify({
      error: 'Pages Function Proxy Error',
      message: error.message,
      path: url.pathname,
      target: backendUrl
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
