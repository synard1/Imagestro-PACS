const BACKEND_URL = 'https://dev-pacs-backend.satupintudigital.co.id';

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  // Keep /api prefix
  const backendUrl = `${BACKEND_URL}${url.pathname}${url.search}`;

  console.log(`[Proxy-API] ${request.method} ${url.pathname} -> ${backendUrl}`);

  // MINIMALIST HEADERS: Only forward what is absolutely necessary
  const headers = new Headers();
  
  // 1. Authorization (Bearer token)
  const auth = request.headers.get('authorization');
  if (auth) headers.set('authorization', auth);
  
  // 2. Tenant Context
  const tenant = request.headers.get('x-tenant-id');
  if (tenant) headers.set('x-tenant-id', tenant);
  
  // 3. API Key
  const apiKey = request.headers.get('x-api-key');
  if (apiKey) headers.set('x-api-key', apiKey);

  // 4. Content Type (for POST/PUT)
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);

  // 5. Accept
  const accept = request.headers.get('accept');
  if (accept) headers.set('accept', accept);

  console.log(`[Proxy-API Auth] Authorization present: ${!!auth} (len: ${auth?.length || 0})`);
  console.log(`[Proxy-API Auth] X-Tenant-ID: ${tenant}`);

  try {
    const backendResponse = await fetch(backendUrl, {
      method: request.method,
      headers: headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
      redirect: 'manual'
    });

    console.log(`[Proxy-API Response] Backend returned: ${backendResponse.status}`);

    const responseHeaders = new Headers(backendResponse.headers);
    responseHeaders.set('Access-Control-Allow-Origin', url.origin);
    responseHeaders.set('Access-Control-Allow-Credentials', 'true');
    responseHeaders.set('Access-Control-Expose-Headers', '*');

    return new Response(backendResponse.body, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: responseHeaders
    });
  } catch (error) {
    console.error(`[Proxy-API Error] ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), { status: 502 });
  }
}
