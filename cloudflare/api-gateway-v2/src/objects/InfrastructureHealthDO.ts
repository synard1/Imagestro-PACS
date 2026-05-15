import { DurableObject } from "cloudflare:workers";

export interface Env {
  AUTH_SERVICE_URL: string;
  PACS_SERVICE_URL: string;
  MASTER_DATA_SERVICE_URL: string;
  ORDER_SERVICE_URL: string;
  MWL_SERVICE_URL: string;
  SIMRS_UNIVERSAL_URL: string;
  BACKBONE: Fetcher;
}

export class InfrastructureHealthSQLite extends DurableObject<Env> {
  private sessions: Set<WebSocket> = new Set();
  private lastHealthState: any = { status: 'initializing', timestamp: Date.now() };

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    
    this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS health_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          status_json TEXT NOT NULL
        )
      `);
      
      try {
        const lastEntry = this.ctx.storage.sql.exec("SELECT status_json FROM health_history ORDER BY id DESC LIMIT 1").toArray();
        if (lastEntry.length > 0) {
          this.lastHealthState = JSON.parse(lastEntry[0].status_json as string);
        }
      } catch (e) {
        console.error("[HealthDO] Error recovering state:", e);
      }
    });

    this.ensureAlarm();
  }

  private async ensureAlarm() {
    try {
      const alarm = await this.ctx.storage.getAlarm();
      if (alarm === null) {
        await this.ctx.storage.setAlarm(Date.now() + 10000);
      }
    } catch (e) {
      console.error("[HealthDO] Error setting alarm:", e);
    }
  }

  async alarm() {
    await this.performHealthCheck();
    await this.ctx.storage.setAlarm(Date.now() + 20000);
  }

  private async performHealthCheck() {
    const services = [
      { id: 'auth', url: `${this.env.AUTH_SERVICE_URL}/health` },
      { id: 'pacs', url: `${this.env.PACS_SERVICE_URL}/api/health` },
      { id: 'master', url: `${this.env.MASTER_DATA_SERVICE_URL}/health` },
      { id: 'order', url: `${this.env.ORDER_SERVICE_URL}/health` },
      { id: 'mwl', url: `${this.env.MWL_SERVICE_URL}/health` },
      { id: 'simrs', url: `${this.env.SIMRS_UNIVERSAL_URL}/health` },
    ];

    const results: Record<string, any> = {};
    let overallHealthy = true;

    await Promise.all(services.map(async (service) => {
      const start = Date.now();
      try {
        if (!this.env.BACKBONE) throw new Error("BACKBONE missing");
        const response = await this.env.BACKBONE.fetch(service.url, { 
          method: 'GET',
          signal: AbortSignal.timeout(5000) 
        });
        const healthy = response.ok;
        if (!healthy) overallHealthy = false;
        results[service.id] = { healthy, status: response.status, responseTime: Date.now() - start, data: await response.json().catch(() => ({})) };
      } catch (error: any) {
        overallHealthy = false;
        results[service.id] = { healthy: false, status: 503, responseTime: Date.now() - start, error: error.message };
      }
    }));

    const newState = { status: overallHealthy ? 'up' : 'degraded', timestamp: Date.now(), services: results };
    this.lastHealthState = newState;
    try {
      this.ctx.storage.sql.exec("INSERT INTO health_history (status_json) VALUES (?)", JSON.stringify(newState));
    } catch (e) {}
    this.broadcast(JSON.stringify({ type: 'HEALTH_UPDATE', data: newState }));
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      await this.handleSession(server);
      return new Response(null, { status: 101, webSocket: client });
    }
    if (url.pathname.endsWith("/history")) {
      const rows = this.ctx.storage.sql.exec("SELECT * FROM health_history ORDER BY id DESC LIMIT 20").toArray();
      return Response.json(rows.map(r => ({ ...r, status_json: JSON.parse(r.status_json as string) })));
    }
    return Response.json(this.lastHealthState);
  }

  private async handleSession(ws: WebSocket) {
    this.ctx.acceptWebSocket(ws);
    this.sessions.add(ws);
    ws.send(JSON.stringify({ type: 'INITIAL_STATE', data: this.lastHealthState }));
  }

  async webSocketClose(ws: WebSocket) { this.sessions.delete(ws); }
  async webSocketError(ws: WebSocket) { this.sessions.delete(ws); }

  private broadcast(message: string) {
    for (const session of this.sessions) {
      try { session.send(message); } catch (e) { this.sessions.delete(session); }
    }
  }
}
