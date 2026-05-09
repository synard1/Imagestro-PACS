# SatuSehat Token Management - API Gateway & satusehat-integrator

## Ringkasan

Fitur ini menyediakan mekanisme terpusat dan sinkron untuk mengelola token SatuSehat dengan prinsip:

- Satu pintu masuk melalui API Gateway.
- satusehat-integrator sebagai "single source of truth" untuk token:
  - In-memory cache
  - Persistent cache di Postgres (`satusehat_tokens`)
  - Sinkronisasi ke tabel `settings` (`satusehat_latest_token`)
- Konfigurasi kredensial diambil dari tabel `settings` (`integration_registry.satusehat`) via `master-data-service` untuk jalur tertentu.
- Menghindari pemanggilan berulang ke server SatuSehat (rate-limit friendly).
- Semua alur direct token generation dari Gateway disinkronkan kembali ke integrator.

Endpoint utama:

- API Gateway:
  - `POST /satusehat/token/generate`
- satusehat-integrator:
  - `GET /oauth/token`
  - `GET /oauth/health`
  - `POST /oauth/refresh`
  - `POST /oauth/token/store` (internal sync dari Gateway)

---

## Arsitektur

Komponen:

1. `master-data-service`
   - Menyimpan konfigurasi integrasi dalam tabel `settings`.
   - Kunci penting:
     - `integration_registry`
       - `satusehat`: konfigurasi SatuSehat.

2. `satusehat-integrator`
   - Service Bun/TypeScript.
   - Mengelola:
     - Tabel:
       - `satusehat_http_logs`
       - `service_requests`
       - `satusehat_tokens`
     - Token management:
       - In-memory cache
       - Baca token valid dari DB saat butuh
       - Simpan token baru ke DB dan ke `settings`
   - Endpoint:
     - `GET /health`, `GET /ready`
     - `GET /oauth/health`
     - `GET|POST /oauth/token`
     - `POST /oauth/refresh`
     - `POST /oauth/token/store` (untuk sinkronisasi token dari API Gateway)
     - Endpoint FHIR utilitas lainnya.

3. `api-gateway`
   - Satu-satunya entry point publik.
   - Endpoint terkait:
     - `POST /satusehat/token/generate`
     - `ALL /satusehat/<path>` (proxy ke integrator dengan token management otomatis)
   - Memanfaatkan:
     - satusehat-integrator sebagai sumber token utama.
     - `master-data-service` untuk membaca konfigurasi `integration_registry.satusehat` pada fallback direct call.

---

## Konfigurasi: `integration_registry.satusehat`

Konfigurasi SatuSehat disimpan di `settings` (via `master-data-service`).

Contoh struktur:

```json
{
  "integration_registry": {
    "satusehat": {
      "env": "sandbox",
      "scope": "",
      "enabled": true,
      "clientId": "F2iJHRHSFPKaulILvAAQYF5GFdeXW5pg1y7d4xkiaubtKSDB",
      "clientSecret": "LKuYcm0XnpAvIAVexv86iMIg1p5frf5XdwlLfRC2WNN3s4MlTeO6u9hd2jkjElcH",
      "timeoutMs": 10000,
      "tokenEndpoint": "https://api-satusehat-stg.dto.kemkes.go.id/oauth2/v1/accesstoken",
      "organizationId": "b3fff886-aaf3-4d79-b402-f6c3985e17c2"
    }
  }
}
```

Kriteria:

- `enabled: true` → integrasi aktif.
- `clientId`, `clientSecret`, `tokenEndpoint` → wajib.
- `scope` → optional.
- `timeoutMs` → optional (default 10 detik).

API Gateway menggunakan helper:

- `get_satusehat_config_from_settings()`:
  - Baca `settings/integration_registry` (fallback ke `settings`).
  - Cari `integration_registry.satusehat`.
  - Validasi field wajib.
  - Dipakai untuk jalur fallback yang memanggil token endpoint SatuSehat langsung.

---

## satusehat-integrator: Sumber Cache Utama

Lokasi: `/satusehat-integrator/src`

### 1) Inisialisasi DB

`db.ts`:

- `initLogsTable()` → `satusehat_http_logs`
- `initServiceRequestsTable()` → `service_requests`
- `initTokenStorageTable()` → `satusehat_tokens`
- (Dipanggil di `index.ts` saat startup.)

### 2) Token storage & helpers

`db.ts` menyediakan:

- `saveToken(entry: TokenEntry)`
  - Menyimpan histori token ke `satusehat_tokens`.
- `getLatestValidTokenFromDb(clientId: string)`
  - Ambil satu token terbaru untuk `clientId`.
  - Valid jika:
    - `issued_at + expires_in > now - 60` (ada buffer 60 detik).
- `upsertSetting(key: string, value: any)`
  - Upsert ke tabel `settings` jika ada:
    - `INSERT ... ON CONFLICT (key) DO UPDATE value = EXCLUDED.value`
  - Dipakai untuk menyimpan `satusehat_latest_token`.

### 3) Logika Satusehat.token() (satusehat.ts)

`Satusehat.token()` sekarang punya 3 lapis cache:

1. In-memory cache:
   - Jika `tokenCache.token` masih valid (dengan buffer) → langsung return.

2. DB cache (persistent):
   - Jika in-memory tidak valid:
     - Panggil `getLatestValidTokenFromDb(config.clientId)`.
     - Jika ditemukan token yang masih valid:
       - Isi `tokenCache` (in-memory) dari hasil DB.
       - Log: `[satusehat] Loaded valid token from DB cache`.
       - Return token tersebut.
   
3. Remote fetch (SatuSehat):
   - Jika tidak ada token valid:
     - `fetchTokenWithRetry()` → `performTokenFetch()`:
       - Panggil SatuSehat token endpoint.
       - Simpan ke:
         - In-memory cache (`tokenCache`).
         - `satusehat_tokens` via `saveToken()`.
         - `settings` key `satusehat_latest_token` via `upsertSetting()`.

Dengan ini:

- satusehat-integrator bisa survive restart (token tetap terbaca dari DB).
- Integrator menjadi sumber utama status token yang valid.

### 4) Endpoint internal: `POST /oauth/token/store`

Didefinisikan di `index.ts`:

- Tujuan:
  - Dipanggil oleh API Gateway ketika Gateway melakukan direct call ke token endpoint SatuSehat.
  - Menyinkronkan token yang berhasil didapat ke integrator.

Perilaku:

- Menerima JSON dengan minimal:
  - `access_token` (wajib)
  - `token_type`, `scope`, `expires_in`, `issued_at`, `organizationId` (opsional)
- Menyimpan:
  - Ke `satusehat_tokens` via `saveToken()`:
    - `clientId` dari `config.clientId` (atau "unknown")
    - `status: "active"`
    - `rawResponse`: seluruh body
  - Ke `settings` via `upsertSetting("satusehat_latest_token", ...)`:
    - Menyimpan token dalam bentuk aman (tanpa clientSecret).
    - Tambah metadata:
      - `source: "gateway-direct"`
      - `env`, `organizationId`.
- Response:
  - 200: `{ "status": "ok", "message": "Token stored successfully" }`
  - 400 jika tidak ada `access_token`.
  - 500 jika terjadi error internal.

Catatan:
- Endpoint ini dianggap internal dan dipanggil hanya dari API Gateway dalam jaringan internal Docker.

---

## API Gateway: `POST /satusehat/token/generate`

Lokasi:
- `/api-gateway/api_gateway.py`

### Proteksi & Izin

Deklarasi:

```python
@app.route('/satusehat/token/generate', methods=['POST'])
@require_auth(['system:admin', 'setting:write', '*'])
def satusehat_generate_token():
    ...
```

Syarat:

- JWT harus mengandung salah satu:
  - `system:admin`
  - `setting:write`
  - `*`

Jika tidak:
- 403 Forbidden:
  - `"message": "Insufficient permissions"`

### Alur Lengkap (Sinkronisasi & Anti Rate Limit)

1) Cek ke satusehat-integrator (prioritas utama)

- `GET {SATUSEHAT_INTEGRATOR_URL}/oauth/health`
  - Jika:
    - status 200
    - body.valid == true
  - Maka:
    - `GET {SATUSEHAT_INTEGRATOR_URL}/oauth/token`
    - Jika 200:
      - Return:

        ```json
        {
          "status": "ok",
          "source": "cache",
          "integrator": true,
          "token": { ...dari integrator... }
        }
        ```

    - Tidak ada request baru ke SatuSehat:
      - Integrator yang mengelola cache (in-memory + DB).

- Jika `/oauth/health` atau `/oauth/token` gagal:
  - Lanjut ke langkah 2 (fallback).

2) Fallback: generate token baru langsung ke SatuSehat

Digunakan hanya jika integrator tidak memberikan token valid.

Langkah:

- Ambil konfigurasi dari `integration_registry.satusehat`:
  - `cfg = get_satusehat_config_from_settings()`
  - Jika error → 400 dengan pesan konfigurasi.

- Panggil token endpoint SatuSehat:
  - `POST cfg.tokenEndpoint`
  - Body:
    - `grant_type=client_credentials`
    - `client_id=cfg.clientId`
    - `client_secret=cfg.clientSecret`
    - `scope=cfg.scope` (jika ada)

- Jika gagal:
  - 502/503 dengan detail.

- Jika sukses:
  - Gateway log: token baru berhasil.

3) Sinkronisasi token direct ke satusehat-integrator

Jika jalur direct berhasil (step 2):

- Gateway akan:
  - Kirim:

    ```http
    POST {SATUSEHAT_INTEGRATOR_URL}/oauth/token/store
    Content-Type: application/json

    {
      "access_token": "<dari SatuSehat>",
      "token_type": "...",
      "expires_in": ...,
      "scope": "...",
      "issued_at": ...,
      "organizationId": cfg.organizationId
    }
    ```

- Jika `/oauth/token/store`:
  - 200 → sukses sinkron.
  - non-200/exception → hanya warning di log, respon ke client tetap 200 jika token dari SatuSehat valid.

- Response ke client:

  ```json
  {
    "status": "ok",
    "source": "direct",
    "env": "<cfg.env>",
    "organizationId": "<cfg.organizationId>",
    "tokenEndpoint": "<cfg.tokenEndpoint>",
    "token": { ...response asli dari SatuSehat... }
  }
  ```

Dengan ini:

- Semua token valid yang dihasilkan (baik oleh integrator maupun gateway):
  - Masuk ke `satusehat_tokens`.
  - Di-upsert ke `settings.satusehat_latest_token`.
  - Dapat dimanfaatkan oleh service/UI lain sebagai referensi token terkini.

---

## Konsumsi oleh Service/UI Lain

Service atau UI lain punya beberapa opsi aman:

1) Via API Gateway:

- `POST /satusehat/token/generate`
  - Untuk admin:
    - Mengambil token terkini.
    - Otomatis memanfaatkan integrator + cache.

2) Via integrator (internal):

- `GET /oauth/token`
  - Mengembalikan token terkini yang dikelola integrator.
  - Gateway sudah menyediakan proxy `/satusehat/...` bila perlu.

3) Via tabel settings:

- Baca `settings` dengan key:
  - `satusehat_latest_token`
- Nilai ini:
  - Diisi oleh satusehat-integrator setiap kali token baru berhasil diambil.
  - Diupdate juga oleh endpoint internal `/oauth/token/store` saat Gateway melakukan direct generation.
- Cocok untuk:
  - UI admin yang hanya ingin menampilkan informasi token terkini.
  - Service lain yang butuh introspeksi (read-only).

Catatan:
- Aplikasi lain sebaiknya tidak menyalahgunakan `satusehat_latest_token` untuk langsung mem-bypass mekanisme integrator, kecuali benar-benar mengerti konsekuensinya (mis. untuk display/monitoring).
- Untuk operasi FHIR/x SatuSehat, tetap rekomendasi:
  - Gunakan proxy via satusehat-integrator (melalui API Gateway).

---

## Error Handling Utama

- 403:
  - Kurang permission (bukan admin).
- 400:
  - Konfigurasi SatuSehat di `settings` tidak lengkap/invalid.
- 502:
  - SatuSehat mengembalikan error saat direct generation.
- 503:
  - Masalah jaringan ke SatuSehat atau service internal down.
- Sinkronisasi gagal:
  - Tidak menggagalkan response token ke client:
    - Hanya warning di log.
    - Token masih diteruskan ke caller.

---

## Best Practices

- Simpan kredensial SatuSehat hanya di `settings.integration_registry.satusehat`, bukan hard-coded.
- Gunakan:
  - `/satusehat/token/generate` hanya oleh admin/ops.
  - Proxy `/satusehat/...` untuk akses FHIR yang terautentikasi.
- Pantau:
  - `satusehat_http_logs` untuk jejak request.
  - `satusehat_tokens` untuk histori token.
  - `settings.satusehat_latest_token` untuk status token terkini.
- Dengan desain ini:
  - Meminimalkan call ke token endpoint SatuSehat.
  - Menjaga konsistensi antara Gateway, integrator, dan konfigurasi di DB.

---
