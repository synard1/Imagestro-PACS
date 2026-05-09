import { Pool } from "pg";
import { config } from "./config";

let pool: Pool | null = null;
let initialized = false;
let serviceRequestsTableInitialized = false;
let tokenStorageInitialized = false;

function buildPgConfig() {
  if (config.databaseUrl && config.databaseUrl.trim().length > 0) {
    return { connectionString: config.databaseUrl, ssl: false } as any;
  }
  if (config.pgHost && config.pgDatabase && config.pgUser) {
    return {
      host: config.pgHost,
      port: config.pgPort || 5432,
      database: config.pgDatabase,
      user: config.pgUser,
      password: config.pgPassword || undefined,
      ssl: false,
    } as any;
  }
  return null;
}

export async function getPool(): Promise<Pool | null> {
  try {
    if (!pool) {
      const cfg = buildPgConfig();
      if (!cfg) {
        console.warn("[db] PG config tidak ditemukan; logging akan di-skip");
        return null;
      }
      pool = new Pool(cfg);
    }
    return pool;
  } catch (e: any) {
    console.warn("[db] Gagal inisialisasi pool:", e?.message || e);
    return null;
  }
}

export async function initLogsTable() {
  try {
    if (initialized) return;
    const p = await getPool();
    if (!p) return;
    
    // Check if table exists and has the old schema
    const tableCheck = await p.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'satusehat_http_logs' AND column_name = 'id'
    `);
    
    if (tableCheck.rows.length > 0) {
      // Table exists, check if ID column is BIGINT (old schema)
      if (tableCheck.rows[0].data_type === 'bigint') {
        console.log("[db] Upgrading satusehat_http_logs table to use UUID v4");
        // For existing tables with data, we'll need a more complex migration
        // This is a simplified version - in production, you'd want a more robust migration
        await p.query(`
          ALTER TABLE satusehat_http_logs ALTER COLUMN id TYPE TEXT;
        `);
      }
    }
    
    // Create or update the table structure
    await p.query(`
      CREATE TABLE IF NOT EXISTS satusehat_http_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        method TEXT,
        url TEXT,
        request_headers JSONB,
        request_body TEXT,
        response_status INT,
        response_headers JSONB,
        response_body TEXT,
        error TEXT,
        duration_ms INT
      );
    `);
    
    initialized = true;
    console.log("[db] satusehat_http_logs siap");
  } catch (e: any) {
    console.warn("[db] Gagal membuat tabel log:", e?.message || e);
  }
}

export async function initServiceRequestsTable() {
  try {
    if (serviceRequestsTableInitialized) return;
    const p = await getPool();
    if (!p) return;
    
    // Check if table exists and has the old schema
    const tableCheck = await p.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'service_requests' AND column_name = 'id'
    `);
    
    if (tableCheck.rows.length > 0) {
      // Table exists, check if ID column is BIGINT (old schema)
      if (tableCheck.rows[0].data_type === 'bigint') {
        console.log("[db] Upgrading service_requests table to use UUID v4");
        // For existing tables with data, we'll need a more complex migration
        // This is a simplified version - in production, you'd want a more robust migration
        await p.query(`
          ALTER TABLE service_requests ALTER COLUMN id TYPE TEXT;
        `);
      }
    }
    
    // Create or update the table structure
    await p.query(`
      CREATE TABLE IF NOT EXISTS service_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        satusehat_id TEXT,
        patient_id TEXT NOT NULL,
        encounter_id TEXT NOT NULL,
        practitioner_id TEXT NOT NULL,
        location_id TEXT NOT NULL,
        code TEXT NOT NULL,
        code_display TEXT NOT NULL,
        category TEXT,
        priority TEXT,
        intent TEXT,
        status TEXT,
        authored_on TIMESTAMPTZ,
        reason_code TEXT,
        reason_display TEXT,
        note TEXT,
        request_data JSONB,
        response_data JSONB,
        error_message TEXT,
        UNIQUE(satusehat_id)
      );
    `);
    
    // Create index for better performance
    await p.query(`
      CREATE INDEX IF NOT EXISTS idx_service_requests_patient_id ON service_requests(patient_id);
      CREATE INDEX IF NOT EXISTS idx_service_requests_encounter_id ON service_requests(encounter_id);
      CREATE INDEX IF NOT EXISTS idx_service_requests_satusehat_id ON service_requests(satusehat_id);
      CREATE INDEX IF NOT EXISTS idx_service_requests_status ON service_requests(status);
    `);
    
    serviceRequestsTableInitialized = true;
    console.log("[db] service_requests table siap");
  } catch (e: any) {
    console.warn("[db] Gagal membuat tabel service_requests:", e?.message || e);
  }
}

export async function initTokenStorageTable() {
  try {
    if (tokenStorageInitialized) return;
    const p = await getPool();
    if (!p) return;
    
    // Check if table exists and has the old schema
    const tableCheck = await p.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'satusehat_tokens' AND column_name = 'id'
    `);
    
    if (tableCheck.rows.length > 0) {
      // Table exists, check if ID column is BIGINT (old schema)
      if (tableCheck.rows[0].data_type === 'bigint') {
        console.log("[db] Upgrading satusehat_tokens table to use UUID v4");
        // For existing tables with data, we'll need a more complex migration
        // This is a simplified version - in production, you'd want a more robust migration
        await p.query(`
          ALTER TABLE satusehat_tokens ALTER COLUMN id TYPE TEXT;
        `);
      }
    }
    
    // Create or update the table structure
    await p.query(`
      CREATE TABLE IF NOT EXISTS satusehat_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        client_id TEXT NOT NULL,
        organization_name TEXT,
        developer_email TEXT,
        token_type TEXT,
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        expires_in INTEGER,
        issued_at BIGINT,
        scope TEXT,
        status TEXT,
        raw_response JSONB,
        request_data JSONB
      );
    `);
    
    // Create index for better performance
    await p.query(`
      CREATE INDEX IF NOT EXISTS idx_satusehat_tokens_client_id ON satusehat_tokens(client_id);
      CREATE INDEX IF NOT EXISTS idx_satusehat_tokens_created_at ON satusehat_tokens(created_at);
      CREATE INDEX IF NOT EXISTS idx_satusehat_tokens_access_token ON satusehat_tokens(access_token);
    `);
    
    tokenStorageInitialized = true;
    console.log("[db] satusehat_tokens table siap");
  } catch (e: any) {
    console.warn("[db] Gagal membuat tabel satusehat_tokens:", e?.message || e);
  }
}

export interface LogEntry {
  method: string;
  url: string;
  requestHeaders?: Record<string, string>;
  requestBody?: string | null;
  responseStatus?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: string | null;
  error?: string | null;
  durationMs?: number;
}

export interface ServiceRequestEntry {
  satusehatId?: string;
  patientId: string;
  encounterId: string;
  practitionerId: string;
  locationId: string;
  code: string;
  codeDisplay: string;
  category?: string;
  priority?: string;
  intent?: string;
  status?: string;
  authoredOn?: string;
  reasonCode?: string;
  reasonDisplay?: string;
  note?: string;
  requestData?: any;
  responseData?: any;
  errorMessage?: string;
}

export interface TokenEntry {
  clientId: string;
  organizationName?: string;
  developerEmail?: string;
  tokenType?: string;
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  issuedAt?: number;
  scope?: string;
  status?: string;
  rawResponse?: any;
  requestData?: any;
}

export async function logSatusehatHttp(entry: LogEntry) {
  try {
    const p = await getPool();
    if (!p) return;
    await initLogsTable();
    const q = `INSERT INTO satusehat_http_logs
      (method, url, request_headers, request_body, response_status, response_headers, response_body, error, duration_ms)
      VALUES ($1, $2, $3::jsonb, $4, $5, $6::jsonb, $7, $8, $9)`;
    await p.query(q, [
      entry.method,
      entry.url,
      JSON.stringify(entry.requestHeaders || {}),
      entry.requestBody ?? null,
      entry.responseStatus ?? null,
      JSON.stringify(entry.responseHeaders || {}),
      entry.responseBody ?? null,
      entry.error ?? null,
      entry.durationMs ?? null,
    ]);
  } catch (e: any) {
    console.warn("[db] Gagal insert log:", e?.message || e);
  }
}

export async function saveServiceRequest(entry: ServiceRequestEntry): Promise<string | null> {
  try {
    const p = await getPool();
    if (!p) return null;
    await initServiceRequestsTable();
    
    const q = `INSERT INTO service_requests
      (satusehat_id, patient_id, encounter_id, practitioner_id, location_id, code, code_display, 
       category, priority, intent, status, authored_on, reason_code, reason_display, note, 
       request_data, response_data, error_message)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17::jsonb, $18)
      RETURNING id`;
      
    const result = await p.query(q, [
      entry.satusehatId ?? null,
      entry.patientId,
      entry.encounterId,
      entry.practitionerId,
      entry.locationId,
      entry.code,
      entry.codeDisplay,
      entry.category ?? null,
      entry.priority ?? null,
      entry.intent ?? null,
      entry.status ?? null,
      entry.authoredOn ? new Date(entry.authoredOn) : null,
      entry.reasonCode ?? null,
      entry.reasonDisplay ?? null,
      entry.note ?? null,
      entry.requestData ? JSON.stringify(entry.requestData) : null,
      entry.responseData ? JSON.stringify(entry.responseData) : null,
      entry.errorMessage ?? null,
    ]);
    
    return result.rows[0]?.id || null;
  } catch (e: any) {
    console.warn("[db] Gagal insert service request:", e?.message || e);
    return null;
  }
}

export async function saveToken(entry: TokenEntry): Promise<string | null> {
  try {
    const p = await getPool();
    if (!p) return null;
    await initTokenStorageTable();

    const q = `INSERT INTO satusehat_tokens
      (client_id, organization_name, developer_email, token_type, access_token, refresh_token,
       expires_in, issued_at, scope, status, raw_response, request_data)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb)
      RETURNING id`;

    const result = await p.query(q, [
      entry.clientId,
      entry.organizationName ?? null,
      entry.developerEmail ?? null,
      entry.tokenType ?? null,
      entry.accessToken,
      entry.refreshToken ?? null,
      entry.expiresIn ?? null,
      entry.issuedAt ?? null,
      entry.scope ?? null,
      entry.status ?? null,
      entry.rawResponse ? JSON.stringify(entry.rawResponse) : null,
      entry.requestData ? JSON.stringify(entry.requestData) : null,
    ]);

    return result.rows[0]?.id || null;
  } catch (e: any) {
    console.warn("[db] Gagal insert token:", e?.message || e);
    return null;
  }
}

/**
 * Ambil token terbaru yang masih valid dari tabel satusehat_tokens untuk clientId tertentu.
 * Validasi sederhana berdasarkan expires_in + issued_at (jika ada).
 */
export async function getLatestValidTokenFromDb(clientId: string): Promise<TokenEntry | null> {
  try {
    const p = await getPool();
    if (!p) return null;
    await initTokenStorageTable();

    // Ambil token terakhir untuk client_id tersebut
    const q = `
      SELECT client_id, organization_name, developer_email, token_type,
             access_token, refresh_token, expires_in, issued_at,
             scope, status, raw_response, request_data
      FROM satusehat_tokens
      WHERE client_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `;
    const r = await p.query(q, [clientId]);
    if (r.rows.length === 0) return null;

    const row = r.rows[0];

    // Hitung apakah masih valid (fallback: kalau tidak ada issued_at/expires_in, dianggap tidak valid)
    const nowSec = Math.floor(Date.now() / 1000);
    const issuedAt = typeof row.issued_at === "number" ? row.issued_at : null;
    const expiresIn = typeof row.expires_in === "number" ? row.expires_in : null;

    if (!issuedAt || !expiresIn) {
      return null;
    }

    const exp = issuedAt + expiresIn;
    // Berikan sedikit buffer (misal 60 detik) agar aman
    if (nowSec >= exp - 60) {
      return null;
    }

    const entry: TokenEntry = {
      clientId: row.client_id,
      organizationName: row.organization_name || undefined,
      developerEmail: row.developer_email || undefined,
      tokenType: row.token_type || undefined,
      accessToken: row.access_token,
      refreshToken: row.refresh_token || undefined,
      expiresIn: expiresIn,
      issuedAt: issuedAt,
      scope: row.scope || undefined,
      status: row.status || undefined,
      rawResponse: row.raw_response || undefined,
      requestData: row.request_data || undefined,
    };

    return entry;
  } catch (e: any) {
    console.warn("[db] Gagal mengambil token terbaru dari DB:", e?.message || e);
    return null;
  }
}

/**
 * Simpan token terbaru ke tabel settings agar bisa diakses service/UI lain.
 * Menggunakan pola upsert sederhana pada key yang diberikan.
 *
 * Catatan:
 * - Tidak memutuskan schema pasti settings; diasumsikan:
 *   settings(key TEXT PRIMARY KEY, value JSONB)
 * - Jika schema berbeda, fungsi ini akan gagal diam-diam (log warning) tanpa mengganggu alur utama.
 */
export async function upsertSetting(key: string, value: any): Promise<void> {
  try {
    const p = await getPool();
    if (!p) return;
    // Cek apakah tabel settings ada; jika tidak, abaikan
    const existsCheck = await p.query(`
      SELECT to_regclass('public.settings') AS exists;
    `);
    const exists = existsCheck.rows[0]?.exists;
    if (!exists) {
      console.warn("[db] Tabel settings tidak ditemukan; skip upsertSetting");
      return;
    }

    const q = `
      INSERT INTO settings(key, value)
      VALUES ($1, $2::jsonb)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `;
    await p.query(q, [key, JSON.stringify(value)]);
  } catch (e: any) {
    console.warn("[db] Gagal upsert setting:", e?.message || e);
  }
}

export async function updateServiceRequestResponse(id: string, satusehatId: string, responseData: any, errorMessage?: string): Promise<boolean> {
  try {
    const p = await getPool();
    if (!p) return false;
    
    const q = `UPDATE service_requests 
      SET satusehat_id = $1, response_data = $2::jsonb, error_message = $3, updated_at = NOW()
      WHERE id = $4`;
      
    await p.query(q, [
      satusehatId,
      JSON.stringify(responseData),
      errorMessage ?? null,
      id
    ]);
    
    return true;
  } catch (e: any) {
    console.warn("[db] Gagal update service request response:", e?.message || e);
    return false;
  }
}
