const BACKEND_URL = 'https://dev-pacs-backend.satupintudigital.co.id';

// Headers to forward from client to backend
const FORWARD_HEADERS = [
  'authorization',
  'content-type',
  'cookie',
  'x-csrf-token',
  'x-tenant-id',
  'x-api-key',
  'x-requested-with',
  'accept',
  'accept-language',
  'cache-control',
  'user-agent'
];

// Headers to forward from backend to client
const RESPONSE_HEADERS = [
  'content-type',
  'content-length',
  'cache-control',
  'set-cookie',
  'x-csrf-token',
  'etag',
  'last-modified'
];

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Keep prefix for /api/ and /wado-rs/ (matches local Vite proxy behavior)
  const backendUrl = `${BACKEND_URL}${url.pathname}${url.search}`;

  console.log(`[Proxy-API] ${request.method} ${url.pathname} -> ${backendUrl}`);

  try {
    // Prepare headers to forward
    const headers = new Headers();
    FORWARD_HEADERS.forEach(header => {
      const value = request.headers.get(header);
      if (value) {
        headers.set(header, value);
      }
    });

    // Add X-Forwarded headers
    headers.set('X-Forwarded-For', request.headers.get('cf-connecting-ip') || '');
    headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''));
    headers.set('X-Forwarded-Host', url.hostname);
    headers.set('X-Real-IP', request.headers.get('cf-connecting-ip') || '');

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
    const responseHeaders = new Headers();
    RESPONSE_HEADERS.forEach(header => {
      const value = backendResponse.headers.get(header);
      if (value) {
        responseHeaders.set(header, value);
      }
    });

    // Add CORS headers
    responseHeaders.set('Access-Control-Allow-Origin', url.origin);
    responseHeaders.set('Access-Control-Allow-Credentials', 'true');
    responseHeaders.set('Access-Control-Expose-Headers', 'Content-Length, Content-Type, X-CSRF-Token');

    return new Response(backendResponse.body, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: responseHeaders
    });

  } catch (error) {
    console.error('[Proxy-API Error]', error);
    return new Response(JSON.stringify({
      error: 'Pages Function API Proxy Error',
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
