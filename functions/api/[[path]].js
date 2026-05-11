const BACKEND_URL = 'https://dev-pacs-backend.satupintudigital.co.id';

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  // Keep /api prefix
  const backendUrl = `${BACKEND_URL}${url.pathname}${url.search}`;

  console.log(`[Proxy-API] ${request.method} ${url.pathname} -> ${backendUrl}`);

  // Forward critical headers
  const headers = new Headers(request.headers);
  headers.delete('host'); // Let fetch set the correct host for the backend

  try {
    const backendResponse = await fetch(backendUrl, {
      method: request.method,
      headers: headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
      redirect: 'manual'
    });

    // Copy all response headers
    const responseHeaders = new Headers(backendResponse.headers);
    
    // Ensure CORS headers are correct for the Pages origin
    responseHeaders.set('Access-Control-Allow-Origin', url.origin);
    responseHeaders.set('Access-Control-Allow-Credentials', 'true');
    responseHeaders.set('Access-Control-Expose-Headers', '*');

    return new Response(backendResponse.body, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: responseHeaders
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 502 });
  }
}
