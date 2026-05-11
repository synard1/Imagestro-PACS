const BACKEND_URL = 'https://dev-pacs-backend.satupintudigital.co.id';

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  // Keep /api prefix
  const backendUrl = `${BACKEND_URL}${url.pathname}${url.search}`;

  // Log incoming headers for debugging
  console.log(`[Proxy-API] Incoming Authorization: ${request.headers.get('authorization')?.substring(0, 30)}...`);

  // Force lowercase headers to be safe
  const headers = new Headers();
  for (const [key, value] of request.headers.entries()) {
    const k = key.toLowerCase();
    if (['authorization', 'x-tenant-id', 'x-api-key', 'content-type', 'accept', 'x-csrf-token'].includes(k)) {
      headers.set(k, value);
    }
  }

  try {
    const backendResponse = await fetch(backendUrl, {
      method: request.method,
      headers: headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
      redirect: 'manual'
    });

    console.log(`[Proxy-API] Backend ${backendUrl} returned ${backendResponse.status}`);

    const responseHeaders = new Headers(backendResponse.headers);
    responseHeaders.set('Access-Control-Allow-Origin', url.origin);
    responseHeaders.set('Access-Control-Allow-Credentials', 'true');

    return new Response(backendResponse.body, {
      status: backendResponse.status,
      headers: responseHeaders
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 502 });
  }
}
