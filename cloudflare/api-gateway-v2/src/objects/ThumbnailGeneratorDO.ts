import { DurableObject } from "cloudflare:workers";
import type { Bindings } from "../types";

type ThumbnailStatus = 'initial' | 'generating' | 'complete' | 'error';

interface ThumbnailState {
  status: ThumbnailStatus;
  r2_key?: string;
  error?: string;
  last_updated: string;
}

export class ThumbnailGeneratorSQLite extends DurableObject<Bindings> {
  
  constructor(state: DurableObjectState, env: Bindings) {
    super(state, env);
    this.ctx.blockConcurrencyWhile(async () => {
      await this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS thumbnail_state (
          cache_key TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          r2_key TEXT,
          error_message TEXT,
          last_updated TEXT NOT NULL
        )
      `);
    });
  }

  private async getState(cacheKey: string): Promise<ThumbnailState | null> {
    const results = await this.ctx.storage.sql.exec<any>(
      "SELECT * FROM thumbnail_state WHERE cache_key = ?", cacheKey
    ).toArray();
    if (results.length === 0) return null;
    const result = results[0];
    return { 
      status: result.status, 
      r2_key: result.r2_key, 
      error: result.error_message, 
      last_updated: result.last_updated 
    };
  }

  private async setState(cacheKey: string, state: Partial<ThumbnailState>) {
    const finalState = { ...state, last_updated: new Date().toISOString() };
    await this.ctx.storage.sql.exec(
      `INSERT INTO thumbnail_state (cache_key, status, r2_key, error_message, last_updated)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET
         status=excluded.status,
         r2_key=excluded.r2_key,
         error_message=excluded.error_message,
         last_updated=excluded.last_updated
      `,
      cacheKey, finalState.status, finalState.r2_key, finalState.error, finalState.last_updated
    );
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    
    // We expect paths like: /api/studies/{uid}/series/{uid}/instances/{uid}/thumbnail
    // And query params like: ?size=150, ?quality=80, etc.
    const path = url.pathname;
    const search = url.search;
    
    // Normalize path for cache key (strip /backend-api prefix if present)
    let normalizedPath = path;
    if (normalizedPath.startsWith('/backend-api/')) {
      normalizedPath = normalizedPath.replace('/backend-api', '');
    }
    
    // Generate a unique cache key based on normalized path + params
    const cacheKey = `${normalizedPath}${search}`;
    const r2Key = `cache/${cacheKey.replace(/[\/\?&=]/g, '_')}` + (normalizedPath.endsWith('original') ? '.dcm' : '.jpg');

    // Capture ALL relevant headers to forward (match proxyRequest logic exactly)
    const headers = new Headers();
    const forwardHeaders = ["authorization", "cookie", "x-api-key", "content-type", "accept"];
    for (const h of forwardHeaders) {
      const val = request.headers.get(h);
      if (val) headers.set(h, val);
    }

    // Resolve tenant from request headers or search params (Browser fallback)
    const tenantId = request.headers.get('x-tenant-id') || url.searchParams.get('tenant_id') || '';
    if (tenantId) {
      headers.set('X-Tenant-ID', tenantId);
      headers.set('X-Hospital-ID', tenantId);
    }

    // Forward request ID for tracing
    const requestId = request.headers.get('x-request-id') || '';
    if (requestId) headers.set('X-Request-ID', requestId);

    return this.ctx.blockConcurrencyWhile(async () => {
      const state = await this.getState(cacheKey);
      
      // Serve from R2 cache if available
      if (state?.status === 'complete' && state.r2_key) {
        const object = await this.env.IMAGE_CACHE_R2.get(state.r2_key);
        if (object) {
          const contentType = normalizedPath.endsWith('original') ? 'application/dicom' : 'image/jpeg';
          return new Response(object.body, { 
            headers: { 
              'Content-Type': contentType, 
              'X-Cache-Status': 'HIT',
              'Cache-Control': 'public, max-age=604800',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Credentials': 'true'
            } 
          });
        }
        // R2 object missing despite state=complete — reset and re-fetch
        await this.setState(cacheKey, { status: 'initial' });
      }

      // If previous attempt resulted in a 404 error (study not found in PACS),
      // don't retry for 10 minutes to avoid hammering PACS
      if (state?.status === 'error' && state.error?.includes('PACS 404')) {
        const errorAge = Date.now() - new Date(state.last_updated).getTime();
        if (errorAge < 600000) { // 10 minutes
          return new Response(JSON.stringify({ 
            success: false, 
            error: { code: 'NOT_FOUND', message: 'Study not found in PACS (cached)' } 
          }), { 
            status: 404, 
            headers: { 
              'Content-Type': 'application/json',
              'X-Cache-Status': 'ERROR_CACHED',
              'Cache-Control': 'no-cache'
            } 
          });
        }
      }
      
      // Staleness check: If generating for more than 2 minutes, allow retry
      const isStale = state?.status === 'generating' && 
                      (Date.now() - new Date(state.last_updated).getTime() > 120000);

      if (state?.status === 'generating' && !isStale) {
        return new Response(JSON.stringify({ status: 'generating' }), { 
          status: 202, 
          headers: { 'Retry-After': '3', 'Content-Type': 'application/json' } 
        });
      }
      
      await this.setState(cacheKey, { status: 'generating' });
      try {
        // Map internal paths to WADO-RS for PACS
        let wadoPath = normalizedPath;

        // Standardize /api/studies/... -> /wado-rs/studies/... for PACS
        if (wadoPath.startsWith('/api/')) {
          wadoPath = wadoPath.replace('/api/', '/wado-rs/');
        }
        
        // Ensure path starts with / but not //
        wadoPath = '/' + wadoPath.replace(/^\/+/, '');
        
        const baseUrl = this.env.PACS_SERVICE_URL.replace(/\/$/, '');
        const pacsUrl = `${baseUrl}${wadoPath}${url.search}`;
        
        console.log(`[ThumbnailDO] Proxying to PACS: ${pacsUrl}`);
        
        const pacsResponse = await this.env.BACKBONE.fetch(pacsUrl, { 
          method: 'GET',
          headers,
          signal: AbortSignal.timeout(30000)
        });

        if (!pacsResponse.ok) {
          const status = pacsResponse.status;
          let errorText = '';
          try { errorText = await pacsResponse.text(); } catch {}
          
          // For 401: PACS auth issue — don't cache, let client retry with fresh token
          if (status === 401) {
            await this.setState(cacheKey, { status: 'initial' });
            return new Response(JSON.stringify({ 
              success: false, 
              error: { code: 'UNAUTHORIZED', message: 'PACS authentication failed' } 
            }), { 
              status: 401, 
              headers: { 'Content-Type': 'application/json' } 
            });
          }
          
          // For 404: Study/instance not found in PACS — cache the error
          if (status === 404) {
            await this.setState(cacheKey, { status: 'error', error: `PACS 404: ${errorText.substring(0, 50)}` });
            return new Response(JSON.stringify({ 
              success: false, 
              error: { code: 'NOT_FOUND', message: 'Study not found in PACS' } 
            }), { 
              status: 404, 
              headers: { 'Content-Type': 'application/json' } 
            });
          }
          
          // For 403: Forbidden
          if (status === 403) {
            await this.setState(cacheKey, { status: 'initial' });
            return new Response(JSON.stringify({ 
              success: false, 
              error: { code: 'FORBIDDEN', message: 'Access denied' } 
            }), { 
              status: 403, 
              headers: { 'Content-Type': 'application/json' } 
            });
          }
          
          throw new Error(`PACS error ${status}: ${errorText.substring(0, 100)}`);
        }

        const imageBody = await pacsResponse.arrayBuffer();
        
        // Validate we actually got image data (not an error page)
        if (imageBody.byteLength === 0) {
          await this.setState(cacheKey, { status: 'error', error: 'Empty response from PACS' });
          return new Response(JSON.stringify({ 
            success: false, 
            error: { code: 'EMPTY_RESPONSE', message: 'PACS returned empty response' } 
          }), { 
            status: 502, 
            headers: { 'Content-Type': 'application/json' } 
          });
        }

        const contentType = pacsResponse.headers.get('content-type') || (normalizedPath.endsWith('original') ? 'application/dicom' : 'image/jpeg');

        // Store in R2 cache
        await this.env.IMAGE_CACHE_R2.put(r2Key, imageBody, { 
          httpMetadata: { contentType } 
        });
        
        await this.setState(cacheKey, { status: 'complete', r2_key: r2Key });

        return new Response(imageBody, { 
          headers: { 
            'Content-Type': contentType, 
            'X-Cache-Status': 'MISS',
            'Cache-Control': 'public, max-age=604800',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': 'true'
          } 
        });
      } catch (e: any) {
        console.error(`[ThumbnailDO Error] ${normalizedPath}:`, e.message);
        await this.setState(cacheKey, { status: 'error', error: e.message });
        return new Response(JSON.stringify({
          success: false,
          error: { code: 'GATEWAY_ERROR', message: e.message }
        }), { 
          status: 502,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    });
  }
}
