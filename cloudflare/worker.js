/**
 * Cloudflare Worker - API Proxy for Imagestro PACS
 *
 * This worker acts as a transparent reverse proxy between the Cloudflare Pages
 * frontend (https://imagestro-pacs.pages.dev) and the backend API
 * (https://dev-pacs-backend.satupintudigital.co.id).
 *
 * Purpose:
 * - Maintains same-origin behavior for the frontend (no CORS issues)
 * - Proxies /backend-api/*, /api/*, /wado-rs/* requests to backend
 * - Preserves all headers, cookies, and authentication tokens
 * - Handles preflight OPTIONS requests
 *
 * Deployment:
 * - Deploy via: wrangler deploy
 * - Route: imagestro-pacs.pages.dev/backend-api/*
 * - Route: imagestro-pacs.pages.dev/api/*
 * - Route: imagestro-pacs.pages.dev/wado-rs/*
 */

const BACKEND_URL = 'https://dev-pacs-backend.satupintudigital.co.id';

// Paths that should be proxied to backend
const PROXY_PATHS = ['/backend-api/', '/api/', '/wado-rs/'];

// Headers to forward from client to backend
const FORWARD_HEADERS = [
  'authorization',
  'content-type',
  'cookie',
  'x-csrf-token',
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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Check if this request should be proxied
    const shouldProxy = PROXY_PATHS.some(path => url.pathname.startsWith(path));

    if (!shouldProxy) {
      // Not a proxied path - return 404 or pass through
      return new Response('Not Found', { status: 404 });
    }

    // Handle CORS preflight (OPTIONS)
    if (request.method === 'OPTIONS') {
      return handlePreflight(request);
    }

    try {
      // Build backend URL
      const backendUrl = `${BACKEND_URL}${url.pathname}${url.search}`;

      // Prepare headers to forward
      const headers = new Headers();
      FORWARD_HEADERS.forEach(header => {
        const value = request.headers.get(header);
        if (value) {
          headers.set(header, value);
        }
      });

      // Add X-Forwarded headers for backend logging
      headers.set('X-Forwarded-For', request.headers.get('cf-connecting-ip') || '');
      headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''));
      headers.set('X-Forwarded-Host', url.hostname);
      headers.set('X-Real-IP', request.headers.get('cf-connecting-ip') || '');

      // Create backend request
      const backendRequest = new Request(backendUrl, {
        method: request.method,
        headers: headers,
        body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
        redirect: 'manual' // Don't follow redirects automatically
      });

      // Fetch from backend
      const backendResponse = await fetch(backendRequest);

      // Prepare response headers
      const responseHeaders = new Headers();

      // Copy specific headers from backend response
      RESPONSE_HEADERS.forEach(header => {
        const value = backendResponse.headers.get(header);
        if (value) {
          responseHeaders.set(header, value);
        }
      });

      // Add CORS headers (allow credentials from pages.dev)
      responseHeaders.set('Access-Control-Allow-Origin', url.origin);
      responseHeaders.set('Access-Control-Allow-Credentials', 'true');
      responseHeaders.set('Access-Control-Expose-Headers', 'Content-Length, Content-Type, X-CSRF-Token');

      // Handle Set-Cookie specially (can have multiple)
      const cookies = backendResponse.headers.getAll('set-cookie');
      if (cookies.length > 0) {
        cookies.forEach(cookie => {
          responseHeaders.append('set-cookie', cookie);
        });
      }

      // Return proxied response
      return new Response(backendResponse.body, {
        status: backendResponse.status,
        statusText: backendResponse.statusText,
        headers: responseHeaders
      });

    } catch (error) {
      console.error('Proxy error:', error);
      return new Response(JSON.stringify({
        error: 'Proxy Error',
        message: error.message,
        path: url.pathname
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
};

/**
 * Handle CORS preflight OPTIONS requests
 */
function handlePreflight(request) {
  const url = new URL(request.url);

  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': url.origin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, Cookie, X-CSRF-Token, X-Requested-With, Accept, Accept-Language, Cache-Control',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400', // 24 hours
      'Vary': 'Origin'
    }
  });
}
