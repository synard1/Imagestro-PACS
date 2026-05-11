const BACKEND_URL = 'http://100.113.207.79:8082';

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  // Keep /api prefix
  const backendUrl = `${BACKEND_URL}${url.pathname}${url.search}`;

  console.log(`[Proxy-API-Debug] ${request.method} ${url.pathname} -> ${backendUrl}`);

  // Critical headers to forward
  const headers = new Headers();
  const forwardList = [
    'authorization',
    'content-type',
    'accept',
    'x-tenant-id',
    'x-api-key',
    'x-csrf-token',
    'cookie'
  ];

  for (const h of forwardList) {
    const v = request.headers.get(h);
    if (v) headers.set(h, v);
  }

  try {
    const backendResponse = await fetch(backendUrl, {
      method: request.method,
      headers: headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
      redirect: 'manual'
    });

    const responseHeaders = new Headers(backendResponse.headers);
    responseHeaders.set('Access-Control-Allow-Origin', url.origin);
    responseHeaders.set('Access-Control-Allow-Credentials', 'true');

    return new Response(backendResponse.body, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: responseHeaders
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 502 });
  }
}
