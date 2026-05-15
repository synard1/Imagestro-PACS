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
    
    // We expect paths like: /studies/{uid}/[thumbnail|rendered|original]
    // And query params like: ?size=150, ?quality=80, etc.
    const path = url.pathname;
    const search = url.search;
    
    // Generate a unique cache key that includes parameters
    const cacheKey = `${path}${search}`;
    const r2Key = `cache/${cacheKey.replace(/[\/\?&=]/g, '_')}` + (path.endsWith('original') ? '.dcm' : '.jpg');

    // Capture headers to forward
    const headers = new Headers();
    const forwardHeaders = ["authorization", "x-tenant-id", "x-hospital-id"];
    for (const h of forwardHeaders) {
      const val = request.headers.get(h);
      if (val) headers.set(h, val);
    }

    return this.ctx.blockConcurrencyWhile(async () => {
      const state = await this.getState(cacheKey);
      
      if (state?.status === 'complete' && state.r2_key) {
        const object = await this.env.IMAGE_CACHE_R2.get(state.r2_key);
        if (object) {
          const contentType = path.endsWith('original') ? 'application/dicom' : 'image/jpeg';
          return new Response(object.body, { 
            headers: { 
              'Content-Type': contentType, 
              'X-Cache-Status': 'HIT',
              'Cache-Control': 'public, max-age=604800' 
            } 
          });
        }
      }
      
      // Staleness check: If generating for more than 5 minutes, allow retry
      const isStale = state?.status === 'generating' && 
                      (Date.now() - new Date(state.last_updated).getTime() > 300000);

      if (state?.status === 'generating' && !isStale) {
        return new Response("Generating...", { status: 202, headers: { 'Retry-After': '5' } });
      }
      
      await this.setState(cacheKey, { status: 'generating' });
      try {
        // Map internal WADO-RS paths
        // Frontend sends: /api/studies/:studyId/series/:seriesId/instances/:instanceId/[thumbnail|rendered|original]
        // PACS expects: /wado-rs/studies/:studyId/series/:seriesId/instances/:instanceId/[thumbnail|rendered|original]
        const wadoPath = path.replace('/api/', 'wado-rs/');
        const pacsUrl = `${this.env.PACS_SERVICE_URL}/${wadoPath}${search}`;
        
        console.log(`[ThumbnailDO] Proxying to PACS: ${pacsUrl}`);
        
        const pacsResponse = await this.env.BACKBONE.fetch(pacsUrl, { 
          method: 'GET',
          headers,
          signal: AbortSignal.timeout(60000) // Longer timeout for original files
        });

        if (!pacsResponse.ok) {
          const errorText = await pacsResponse.text();
          throw new Error(`PACS error ${pacsResponse.status}: ${errorText.substring(0, 100)}`);
        }

        const imageBody = await pacsResponse.arrayBuffer();
        const contentType = pacsResponse.headers.get('content-type') || (path.endsWith('original') ? 'application/dicom' : 'image/jpeg');

        await this.env.IMAGE_CACHE_R2.put(r2Key, imageBody, { 
          httpMetadata: { contentType } 
        });
        
        await this.setState(cacheKey, { status: 'complete', r2_key: r2Key });

        return new Response(imageBody, { 
          headers: { 
            'Content-Type': contentType, 
            'X-Cache-Status': 'MISS',
            'Cache-Control': 'public, max-age=604800'
          } 
        });
      } catch (e: any) {
        await this.setState(cacheKey, { status: 'error', error: e.message });
        return new Response(`Error: ${e.message}`, { status: 500 });
      }
    });
  }
}
