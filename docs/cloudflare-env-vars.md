# Cloudflare Pages — Environment Variables

> Generated: 2026-05-11  
> Source scan: `src/**/*.{js,jsx,ts,tsx}`

---

## Minimal Config (Copy-paste ke CF Pages → Settings → Environment Variables)

```
VITE_MAIN_API_BACKEND_URL=
VITE_MAIN_PACS_API_BACKEND_URL=
VITE_ENABLE_LOCAL_AUTH=false
VITE_FORCE_REAL_SERVICES=true
VITE_USE_MOCK_SERVICES=false
VITE_AUTO_FALLBACK_TO_MOCK=false
VITE_USE_PACS_BACKEND=true
VITE_APP_NAME=Imagestro PACS
VITE_APP_SHORT_NAME=Imagestro
VITE_LOG_LEVEL=error
VITE_SHOW_CACHE_MANAGER=false
VITE_CACHE_MANAGER_DEV_ONLY=true
VITE_SHOW_STORAGE_INDICATOR=false
VITE_VERIFICATION_BASE_URL=https://imagestro-pacs.pages.dev
VITE_PWA_DEVELOPMENT_MODE=false
VITE_USE_BACKEND_SIGNATURES=true
VITE_SETTINGS_AUTH_TYPE=system
```

---

## REQUIRED — Wajib diset

| Variable | Value CF Pages | Keterangan |
|----------|----------------|------------|
| `VITE_MAIN_API_BACKEND_URL` | *(kosong)* | CF Worker proxy `/backend-api` handle routing — jangan isi absolute URL |
| `VITE_MAIN_PACS_API_BACKEND_URL` | *(kosong)* | Sama, sudah di-proxy oleh CF Worker |
| `VITE_ENABLE_LOCAL_AUTH` | `false` | Wajib `false` di production |
| `VITE_FORCE_REAL_SERVICES` | `true` | Paksa semua service ke real backend |
| `VITE_USE_MOCK_SERVICES` | `false` | Matikan mock data |
| `VITE_USE_PACS_BACKEND` | `true` | Aktifkan koneksi ke PACS backend |

---

## App Identity

| Variable | Contoh Value | Keterangan |
|----------|-------------|------------|
| `VITE_APP_NAME` | `Imagestro PACS` | Tampil di navbar & login page |
| `VITE_APP_SHORT_NAME` | `Imagestro` | Tampil di tab/browser title |

---

## Feature Flags

| Variable | Rekomendasi CF Prod | Default | Keterangan |
|----------|---------------------|---------|------------|
| `VITE_AUTO_FALLBACK_TO_MOCK` | `false` | `true` | Jangan fallback ke mock di prod |
| `VITE_ENABLE_SIMRS` | `true`/`false` | — | Aktif/nonaktifkan integrasi SIMRS |
| `VITE_ENABLE_SATUSEHAT` | `false` | — | Nonaktifkan jika belum siap |
| `VITE_ENABLE_DICOM_VIEWER` | `true` | — | |
| `VITE_USE_LEGACY_MENU` | `false` | `false` | |
| `VITE_SHOW_GUIDES_FOR_ADMINS` | `false` | `false` | Sembunyikan guided tour di prod |
| `VITE_SETTINGS_AUTH_TYPE` | `system` | — | Gunakan system auth untuk settings service |
| `VITE_USE_BACKEND_SIGNATURES` | `true` | `false` | Simpan tanda tangan digital di backend |

---

## Logging & Debug

| Variable | Rekomendasi CF Prod | Default | Keterangan |
|----------|---------------------|---------|------------|
| `VITE_LOG_LEVEL` | `error` | `info` | Minimalkan log di prod (`debug`/`info`/`warn`/`error`) |
| `VITE_DEBUG` | `false` | `false` | |

---

## UI / Display

| Variable | Rekomendasi CF Prod | Default | Keterangan |
|----------|---------------------|---------|------------|
| `VITE_SHOW_STORAGE_INDICATOR` | `false` | `true` | Sembunyikan indicator storage mode |
| `VITE_SHOW_CACHE_MANAGER` | `false` | `true` | Sembunyikan cache manager widget |
| `VITE_CACHE_MANAGER_DEV_ONLY` | `true` | `true` | Cache manager hanya muncul saat dev |
| `VITE_CACHE_MANAGER_POSITION` | `bottom-right` | `bottom-right` | `bottom-right`/`bottom-left`/`top-right`/`top-left` |
| `VITE_CACHE_MANAGER_AUTO_HIDE` | `true` | `false` | Auto-sembunyikan cache manager |
| `VITE_CACHE_MANAGER_AUTO_HIDE_DELAY` | `10000` | `10000` | Delay auto-hide (ms) |
| `VITE_CACHE_MANAGER_START_MINIMIZED` | `true` | `false` | Mulai dalam kondisi minimized |

---

## Digital Signature & QR Code

| Variable | Value | Keterangan |
|----------|-------|------------|
| `VITE_VERIFICATION_BASE_URL` | `https://imagestro-pacs.pages.dev` | Base URL untuk QR code verifikasi laporan |
| `VITE_QR_CODE_FORMAT` | `text` | Format QR: `text` atau `url` |

---

## DICOM / Image Loading

| Variable | Default | Keterangan |
|----------|---------|------------|
| `VITE_DICOM_VIEWER_MODE` | `simple` | Mode viewer: `simple` atau lainnya |
| `VITE_DICOM_IMAGE_LOAD_STRATEGY` | — | Override strategi load image |
| `VITE_DICOM_IMAGE_LOAD_TIMEOUT_MS` | `90000` | Timeout load image DICOM (ms) |

---

## PWA

| Variable | Rekomendasi CF Prod | Default | Keterangan |
|----------|---------------------|---------|------------|
| `VITE_PWA_FORCE_DISABLED` | `false` | `false` | `true` untuk disable PWA sepenuhnya |
| `VITE_PWA_ALLOW_OFFLINE_MODE` | `true` | `true` | |
| `VITE_PWA_ALLOW_CACHING` | `true` | `true` | |
| `VITE_PWA_ALLOW_INSTALL_PROMPTS` | `true` | `true` | |
| `VITE_PWA_ALLOW_UPDATE_NOTIFICATIONS` | `true` | `true` | |
| `VITE_PWA_ALLOW_BACKGROUND_SYNC` | `true` | `true` | |
| `VITE_PWA_ALLOW_PUSH_NOTIFICATIONS` | `false` | `false` | Butuh setup tambahan |
| `VITE_PWA_FORCE_CACHE_STRATEGY` | *(kosong)* | — | Override strategi cache: `intelligent`/`aggressive`/`minimal`/`disabled` |
| `VITE_PWA_EMERGENCY_MODE` | `false` | `false` | `true` untuk disable PWA dan clear semua cache |
| `VITE_PWA_DEVELOPMENT_MODE` | `false` | `false` | Enhanced logging, reduced cache limits |

---

## Upload Limits (Opsional — ada default)

| Variable | Default | Keterangan |
|----------|---------|------------|
| `VITE_MAX_FILE_SIZE` | `52428800` | Max ukuran satu file (bytes) — default 50MB |
| `VITE_MAX_FILES_PER_UPLOAD` | `20` | Max jumlah file per upload |
| `VITE_MAX_TOTAL_UPLOAD_SIZE` | `524288000` | Max total ukuran upload (bytes) — default 500MB |
| `VITE_MAX_FILES_PER_ORDER` | `100` | Max file per order |
| `VITE_MAX_DICOM_SIZE` | `104857600` | Max ukuran file DICOM — default 100MB |
| `VITE_MAX_PDF_SIZE` | `20971520` | Max ukuran PDF — default 20MB |
| `VITE_MAX_IMAGE_SIZE` | `10485760` | Max ukuran image — default 10MB |
| `VITE_MAX_DOCUMENT_SIZE` | `10485760` | Max ukuran dokumen — default 10MB |

---

## Integrasi Khanza (Hanya jika dipakai)

| Variable | Default | Keterangan |
|----------|---------|------------|
| `VITE_KHANZA_BASE_URL` | `http://localhost:3007` | URL backend Khanza |
| `VITE_KHANZA_API_KEY` | *(kosong)* | API key Khanza |
| `VITE_KHANZA_TIMEOUT_MS` | `30000` | Timeout request (ms) |
| `VITE_KHANZA_HEALTH_PATH` | `/health` | Endpoint health check |
| `VITE_KHANZA_DEBUG` | `false` | Debug mode Khanza |

---

## Integrasi SatuSehat (Hanya jika dipakai)

| Variable | Keterangan |
|----------|------------|
| `VITE_SATUSEHAT_MONITOR_AUTH_TYPE` | Tipe auth monitor: `basic` atau `bearer` |
| `VITE_SATUSEHAT_MONITOR_BASIC_USER` | Username untuk SatuSehat monitor |
| `VITE_SATUSEHAT_MONITOR_BASIC_PASS` | Password untuk SatuSehat monitor |

> ⚠️ **JANGAN set `VITE_SATUSEHAT_CLIENT_ID` atau `VITE_SATUSEHAT_CLIENT_SECRET` di Cloudflare Pages.**  
> Kredensial OAuth ini harus disimpan di backend saja. Menyimpannya di env Vite akan di-bundle ke dalam JavaScript publik dan bisa dibaca siapapun.

---

## AI Chat (Opsional)

| Variable | Default | Keterangan |
|----------|---------|------------|
| `VITE_AI_CHAT_MODE` | `kpi` | Mode AI chat: `kpi` atau `flexible` |

---

## Legacy Variables (Deprecated)

Variabel berikut masih dipakai di beberapa tempat tapi sedang di-phase out. Tetap set untuk kompatibilitas:

| Variable | Value CF Pages | Keterangan |
|----------|----------------|------------|
| `VITE_API_BASE_URL` | *(kosong)* | Legacy, digantikan `VITE_MAIN_API_BACKEND_URL` |
| `VITE_PACS_API_URL` | *(kosong)* | Legacy, digantikan `VITE_MAIN_PACS_API_BACKEND_URL` |
