import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { verify } from 'hono/jwt';

type Bindings = {
  JWT_SECRET: string;
  JWT_ALGORITHM: string;
  KHANZA_INTERNAL_KEY: string;
  KHANZA_API_URL: string;
  AUTH_SERVICE_URL: string;
  PACS_SERVICE_URL: string;
  MASTER_DATA_SERVICE_URL: string;
  ORDER_SERVICE_URL: string;
  MWL_SERVICE_URL: string;
  SIMRS_UNIVERSAL_URL: string;
  SATUSEHAT_INTEGRATOR_URL: string;
  ALLOWED_ORIGINS: string;
  TURNSTILE_SECRET_KEY: string;
}

const app = new Hono<{ Bindings: Bindings }>();

// 1. Middlewares
app.use('*', logger());

// Dynamic CORS
app.use('*', async (c, next) => {
  const allowedOrigins = (c.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3000').split(',');
  const corsMiddleware = cors({
    origin: allowedOrigins,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID', 'X-Hospital-ID', 'X-API-Key', 'X-Request-ID', 'X-Turnstile-Token'],
    exposeHeaders: ['Content-Length', 'X-Request-ID'],
    maxAge: 600,
    credentials: true,
  });
  return corsMiddleware(c, next);
});

// Request ID Propagation
app.use('*', async (c, next) => {
  const reqId = c.req.header('X-Request-ID') || crypto.randomUUID();
  await next();
  c.res.headers.set('X-Request-ID', reqId);
});

// 2. Auth Helpers
async function getAuthContext(c: any) {
  const authHeader = c.req.header('Authorization');
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else {
    token = c.req.query('token') || c.req.query('access_token');
  }

  if (!token) return { tenant_id: null, role: null, username: null };

  try {
    const payload = await verify(token, c.env.JWT_SECRET, (c.env.JWT_ALGORITHM || 'HS256') as any);
    return {
      tenant_id: payload.tenant_id,
      role: (payload.role as string)?.toLowerCase(),
      username: payload.username,
    };
  } catch (e) {
    return { tenant_id: null, role: null, username: null };
  }
}

async function verifyTurnstile(token: string, secret: string, ip: string) {
  if (!token || !secret) return false;
  
  const formData = new FormData();
  formData.append('secret', secret);
  formData.append('response', token);
  formData.append('remoteip', ip);

  try {
    const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      body: formData,
      method: 'POST',
    });
    const outcome: any = await result.json();
    return outcome.success;
  } catch (e) {
    console.error('[Turnstile Error]', e);
    return false;
  }
}

// 3. Proxy Helper
async function proxyRequest(c: any, baseUrl: string, targetPath: string, extraHeaders: Record<string, string> = {}) {
  const url = new URL(targetPath.startsWith('http') ? targetPath : `${baseUrl.replace(/\/$/, '')}/${targetPath.replace(/^\//, '')}`);
  const searchParams = new URLSearchParams(c.req.query());
  searchParams.forEach((value, key) => url.searchParams.set(key, value));

  const headers = new Headers();
  const forwardHeaders = ['authorization', 'cookie', 'x-api-key', 'content-type'];
  forwardHeaders.forEach(h => {
    const val = c.req.header(h);
    if (val) headers.set(h, val);
  });

  Object.entries(extraHeaders).forEach(([k, v]) => headers.set(k, v));

  const { tenant_id, role } = await getAuthContext(c);
  if (tenant_id) {
    headers.set('X-Tenant-ID', String(tenant_id));
    headers.set('X-Hospital-ID', String(tenant_id));
  } else if (role === 'superadmin') {
    const clientTenant = c.req.header('X-Tenant-ID');
    if (clientTenant) {
      headers.set('X-Tenant-ID', clientTenant);
      headers.set('X-Hospital-ID', clientTenant);
    }
  }

  const reqInit: RequestInit = {
    method: c.req.method,
    headers: headers,
    body: ['GET', 'HEAD'].includes(c.req.method) ? null : await c.req.arrayBuffer(),
    // @ts-ignore
    duplex: 'half'
  };

  try {
    const response = await fetch(url.toString(), reqInit);
    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    });
  } catch (e: any) {
    console.error(`[Proxy Error] ${url}:`, e);
    return c.json({ success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'Service unavailable' } }, 503);
  }
}

// 4. Routes Mapping

// Root & Health
app.get('/', (c) => c.json({ status: 'ok', service: 'api-gateway', version: '2.45.0-hono' }));
app.get('/health', (c) => proxyRequest(c, c.env.PACS_SERVICE_URL, 'api/health'));

// Turnstile Protected Login
app.post('/auth/login', async (c) => {
  const turnstileToken = c.req.header('X-Turnstile-Token');
  const ip = c.req.header('CF-Connecting-IP') || '';
  
  if (c.env.TURNSTILE_SECRET_KEY) {
    const isValid = await verifyTurnstile(turnstileToken || '', c.env.TURNSTILE_SECRET_KEY, ip);
    if (!isValid) {
      return c.json({ success: false, error: { code: 'SECURITY_CHECK_FAILED', message: 'Bot detection failed' } }, 403);
    }
  }

  return proxyRequest(c, c.env.AUTH_SERVICE_URL, 'auth/login');
});

// Rest of Auth
app.all('/auth/*', (c) => proxyRequest(c, c.env.AUTH_SERVICE_URL, c.req.path.replace(/^\/api/, '').replace(/^\/v1/, '')));

// Health Hub
app.get('/health/:service', async (c) => {
  const service = c.req.param('service');
  const mapping: Record<string, string> = {
    auth: `${c.env.AUTH_SERVICE_URL}/health`,
    pacs: `${c.env.PACS_SERVICE_URL}/api/health`,
    master: `${c.env.MASTER_DATA_SERVICE_URL}/health`,
    order: `${c.env.ORDER_SERVICE_URL}/health`,
    mwl: `${c.env.MWL_SERVICE_URL}/health`,
    simrs: `${c.env.SIMRS_UNIVERSAL_URL}/health`
  };
  if (mapping[service]) return proxyRequest(c, '', mapping[service]);
  return c.json({ status: 'unknown' }, 404);
});

// Zero Trust Middleware
app.use('/api/*', async (c, next) => {
  const path = c.req.path.replace(/^\/api/, '').replace(/^\/v1/, '');
  const publicPaths = ['/health', '/auth/forgot-password'];
  const isPublic = publicPaths.some(p => path.startsWith(p));
  const isAuth = path.startsWith('/auth/');

  if (isPublic || isAuth) return next();

  const { tenant_id, role } = await getAuthContext(c);
  if (!tenant_id && role !== 'superadmin') {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
  }
  return next();
});

// Module Proxies (WADO, MD, Orders, Khanza, etc. - compressed for space)
app.all('/wado-rs/*', (c) => {
  let path = c.req.path.replace(/^\/api/, '').replace(/^\/wado-rs\//, '');
  if (path.startsWith('v2/')) path = path.substring(3);
  return proxyRequest(c, c.env.PACS_SERVICE_URL, `wado-rs/${path}`);
});

app.all('/users/*', (c) => proxyRequest(c, c.env.AUTH_SERVICE_URL, `auth/${c.req.path.replace(/^\/api/, '').replace(/^\/v1/, '')}`));

const mdModules = ['patients', 'doctors', 'procedures', 'procedure-mappings', 'settings', 'nurses', 'modalities'];
mdModules.forEach(mod => {
  app.all(`/${mod}/*`, (c) => proxyRequest(c, c.env.MASTER_DATA_SERVICE_URL, c.req.path.replace(/^\/api/, '').replace(/^\/v1/, '')));
});

app.get('/orders', (c) => proxyRequest(c, c.env.ORDER_SERVICE_URL, 'orders/list'));
app.all('/orders/*', (c) => proxyRequest(c, c.env.ORDER_SERVICE_URL, c.req.path.replace(/^\/api/, '').replace(/^\/v1/, '')));
app.all('/worklist*', (c) => proxyRequest(c, c.env.MWL_SERVICE_URL, c.req.path.replace(/^\/api/, '').replace(/^\/v1/, '')));

app.all('/khanza/mappings/*', (c) => proxyRequest(c, c.env.PACS_SERVICE_URL, `api/${c.req.path.replace(/^\/api/, '').replace(/^\/v1/, '')}`));
app.all('/khanza/import-history/*', (c) => proxyRequest(c, c.env.PACS_SERVICE_URL, `api/${c.req.path.replace(/^\/api/, '').replace(/^\/v1/, '')}`));

app.all('/khanza/*', (c) => {
  const kp = c.req.path.replace(/^\/api/, '').replace(/^\/v1/, '').replace(/^\/khanza\//, '');
  const target = kp.startsWith('api/') ? kp : `api/${kp}`;
  return proxyRequest(c, c.env.KHANZA_API_URL, target, { 'X-API-Key': c.env.KHANZA_INTERNAL_KEY });
});

app.all('/simrs-universal/*', (c) => proxyRequest(c, c.env.SIMRS_UNIVERSAL_URL, c.req.path.replace(/.*simrs-universal\//, '')));
app.all('/radiology/*', (c) => proxyRequest(c, c.env.SIMRS_UNIVERSAL_URL, c.req.path.replace(/^\/api/, '').replace(/^\/v1/, '')));

app.all('/satusehat/*', (c) => proxyRequest(c, c.env.SATUSEHAT_INTEGRATOR_URL, c.req.path.replace(/.*satusehat\//, '')));
app.all('/fhir/*', (c) => proxyRequest(c, c.env.SATUSEHAT_INTEGRATOR_URL, c.req.path.replace(/^\/api/, '').replace(/^\/v1/, '')));
app.all('/monitor/satusehat/*', (c) => proxyRequest(c, c.env.SATUSEHAT_INTEGRATOR_URL, c.req.path.replace(/.*monitor\//, '')));

app.all('/dicom/upload', (c) => proxyRequest(c, c.env.PACS_SERVICE_URL, 'api/dicom/upload'));
app.all('/dicom/bulk', (c) => proxyRequest(c, c.env.PACS_SERVICE_URL, 'api/dicom/bulk'));

app.all('*', (c) => {
  const path = c.req.path.replace(/^\/api/, '').replace(/^\/v1/, '');
  const targetPath = path.startsWith('/api/') ? path.substring(1) : `api/${path.replace(/^\//, '')}`;
  return proxyRequest(c, c.env.PACS_SERVICE_URL, targetPath);
});

export default app;
