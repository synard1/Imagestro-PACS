# Order Management Service

Order Management Service adalah layanan internal untuk mengelola siklus hidup order radiologi
dalam ekosistem DICOM + SATUSEHAT.

Service ini:

- Membuat dan menyimpan order beserta nomor order dan accession number.
- Menjaga konsistensi dengan Master Data Service (patients/doctors) dan Accession API.
- Mengorkestrasi integrasi:
  - SATUSEHAT (FHIR ServiceRequest)
  - Modality Worklist (MWL Writer)
- Dirancang untuk diakses melalui API Gateway sebagai satu-satunya entry point di lingkungan production.

Versi implementasi: lihat header di `order_management_service.py`.

IMPORTANT:
- Di production, seluruh akses eksternal WAJIB melalui API Gateway:
  - Klien: `http(s)://<gateway-host>:8888/orders/...`
  - Internal: `http://order-management:8001/...` (hanya dalam `secure-network`)
- Dokumentasi ini menggambarkan kontrak API sebagaimana digunakan via Gateway,
  kecuali disebut eksplisit sebagai “internal only”.

---

## 1. Arsitektur & Dependencies

- Bahasa: Python 3.12 (image `python:3.12-slim`)
- Framework: Flask + flask-cors
- Database: PostgreSQL (shared dengan layanan lain)
- Komponen terkait:
  - Auth Service: issuer JWT + RBAC
  - API Gateway: validasi JWT, enforse permission, reverse proxy
  - Master Data Service: tabel `patients` (patient master)
  - Accession API: generator accession number
  - MWL Writer: Modality Worklist
  - SATUSEHAT: FHIR R4 (ServiceRequest) via OAuth2 client credentials
- Deployment:
  - Didefinisikan di `docker-compose.yml` sebagai `order-management`
  - Terhubung di network `secure-network`
  - Hanya API Gateway yang diexpose ke publik

---

## 2. Autentikasi & Otorisasi

### 2.1 Pola Umum

- JWT diverifikasi di API Gateway.
- Header yang relevan:
  - `Authorization: Bearer <JWT_TOKEN>`
  - Gateway menambahkan:
    - `X-Forwarded-For`
    - `X-Real-IP`
    - Dapat menambahkan informasi user (`X-User-ID`, `X-User-Name`) untuk audit.

Order Management juga memiliki helper JWT internal (untuk audit/fallback),
namun di production: ANGGAP validasi utama dilakukan oleh gateway.

### 2.2 Permissions (selaras API Gateway)

Gunakan permission berikut di auth-service:

- `order:read`    — baca detail / list order
- `order:create`  — membuat order baru
- `order:update`  — mengubah data order (non-key fields)
- `order:delete`  — soft delete & purge
- `order:sync`    — sync ke SATUSEHAT
- `worklist:create` — create worklist dari order
- `*`             — super-admin wildcard

Rekomendasi mapping di API Gateway (lihat `api-gateway/api_gateway.py`):

- GET    /orders/**         → `order:read` atau `*`
- POST   /orders/create     → `order:create` atau `*`
- PUT    /orders/<id>       → `order:update` atau `*`
- DELETE /orders/<id>       → `order:delete` atau `*`
- POST   /orders/<id>/sync-satusehat     → `order:sync` atau `*`
- POST   /orders/<id>/create-worklist    → `worklist:create` atau `*`
- POST   /orders/complete-flow           → kombinasi (lihat docs/complete-flow.md)

Produksi: enforce RBAC di gateway, biarkan Order Management fokus ke bisnis logik.

---

## 3. Konvensi API

### 3.1 Base Path

Dokumentasi ini mengacu pada path relatif yang di-proxy oleh API Gateway:

- Base: `/orders`

Contoh:
- `POST /orders/create`
- `GET /orders/<identifier>`
- `POST /orders/<identifier>/create-worklist`

### 3.2 Format Response

Semua response JSON mengikuti pola:

- Sukses:

  - HTTP 2xx
  - Body:
    - `status`: `"success"`
    - Properti lain sesuai konteks:
      - `order`
      - `orders`
      - `message`
      - dsb.

- Error:

  - HTTP 4xx / 5xx
  - Body:
    - `status`: `"error"`
    - `message`: deskripsi error untuk client
    - Opsional:
      - `required`
      - `user_permissions`
      - `upstream` (bila error dari layanan eksternal)
      - field lain untuk debugging terkontrol

Contoh:

```json
{
  "status": "error",
  "message": "Order not found"
}
```

### 3.3 Identifier

Parameter `identifier` pada beberapa endpoint bisa berupa:

- UUID `id`
- `order_number`
- `accession_number`

Service otomatis mendeteksi:
1) Coba parse sebagai UUID
2) Jika gagal, cocokan ke `order_number` atau `accession_number`.

---

## 4. Ringkasan Endpoint

Detail lengkap ada di `docs/*.md`.

1) Pembuatan dan Listing Order

- `POST /orders` (via API Gateway) → `POST /orders/create` (service)
  - Endpoint normalized untuk membuat order.
  - Membuat order unified + generate accession (via Accession API jika tidak disediakan).
  - Direkomendasikan untuk integrasi SIMRS / frontend melalui gateway.
  - Dok: `docs/order-create.md`

- `GET /orders` (via API Gateway) → `GET /orders/list` (service)
  - Endpoint normalized untuk listing order.
  - Mengembalikan HANYA kolom utama (ringkas), antara lain:
    - id, order_number, accession_number
    - patient_name, patient_national_id, medical_record_number
    - modality, procedure_code, procedure_name
    - registration_number
    - status, order_status, worklist_status, satusehat_synced
    - scheduled_at, created_at
  - Mengabaikan order dengan `status = 'DELETED'`.
  - Dok: `docs/order-list.md`

- `GET /orders/all`
  - List ringkas untuk overview:
    - kolom utama (id, order_number, accession_number, patient_name, modality, status, created_at)
  - Hanya non-DELETED.
  - Dok: `docs/order-all.md`

- `GET /orders/all/details`
  - List lengkap semua kolom non-DELETED.
  - Untuk admin/monitoring.
  - Dok: `docs/order-all-details.md`

2) Detail & Update Order

- `GET /orders/<identifier>`
  - Ambil detail order by id / order_number / accession_number.
  - Dok: `docs/order-get.md`

- `PUT /orders/<identifier>`
  - Update field yang diizinkan.
  - Tidak boleh:
    - `id`
    - `order_number`
    - `accession_number`
    - `created_at`
    - `updated_at`
  - Dok: `docs/order-update.md`

3) Delete / Purge

- `DELETE /orders/<identifier>`
  - Soft delete:
    - set `status = 'DELETED'`
    - menandai `details.deleted` dengan informasi actor & timestamp
  - Jika sudah DELETED → 409 dengan instruksi gunakan `/purge`.
  - Dok: `docs/order-delete.md`

- `DELETE /orders/<identifier>/purge`
  - Hard delete dari database.
  - Hanya untuk maintenance/admin, via gateway + strict RBAC.
  - Dok: `docs/order-purge.md`

4) Integrasi SATUSEHAT & Worklist

- `POST /orders/<identifier>/sync-satusehat`
  - Membuat FHIR ServiceRequest di SATUSEHAT menggunakan accession number.
  - Update:
    - `satusehat_ihs_number`
    - `satusehat_encounter_id`
    - `satusehat_service_request_id`
    - `satusehat_synced`, `satusehat_sync_date`
    - `order_status`
  - Dok: `docs/order-sync-satusehat.md`

- `POST /orders/<identifier>/create-worklist`
  - Membuat Modality Worklist di MWL Writer.
  - Update:
    - `worklist_status = 'CREATED'`
    - `order_status = 'SCHEDULED'`
  - Dok: `docs/order-create-worklist.md`

5) Complete Flow

- `POST /orders/complete-flow`
  - Orkestrasi:
    1. Create order (seperti `/orders/create`)
    2. Sync ke SATUSEHAT (bila konfigurasi mengharuskan / tidak optional)
    3. Create Modality Worklist
  - Mengembalikan ringkasan seluruh langkah.
  - Dok: `docs/complete-flow.md`

6) Health & Root

- `GET /`
  - Informasi singkat service dan daftar endpoint.

- `GET /health`
  - Status service dan konektivitas database.
  - Digunakan oleh orchestration (Docker/Kubernetes/monitoring).

---

## 5. Environment Variables (Utama)

Lihat juga `docker-compose.yml`. Variabel penting:

- Database:
  - `POSTGRES_HOST`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`

- JWT:
  - `JWT_SECRET` (WAJIB diganti di production)
  - `JWT_ALGORITHM` (default: HS256)

- Integrasi:
  - `MWL_SERVICE_URL`               (default: `http://mwl-writer:8000`)
  - `ACCESSION_API_URL`             (default: `http://accession-api:8180`)
  - `SATUSEHAT_BASE_URL`
  - `SATUSEHAT_CLIENT_ID`
  - `SATUSEHAT_CLIENT_SECRET`
  - `SATUSEHAT_ORGANIZATION_ID`
  - `SATUSEHAT_REQUESTER_REF`
  - `SATUSEHAT_PERFORMER_REF`
  - `ACSN_SYSTEM_BASE`
  - `SATUSEHAT_SYNC_OPTIONAL`       (`true` / `false`)

- Penomoran:
  - `ORDER_NUMBER_PREFIX`           (default: `ORD`)
  - `ORDER_NUMBER_RESET`            (`daily` / `monthly`)
  - `ORDER_NUMBER_PAD_LENGTH`
  - `ACCESSION_BACKFILL_PREFIX`
  - `ACCESSION_BACKFILL_PAD_LENGTH`

- MWL:
  - `MWL_STATION_AET`               (default: `SCANNER01`)

---

## 6. Skema Data & Migrasi

`init_database()` di `order_management_service.py` akan:

- Membuat / menyesuaikan tabel:
  - `orders`
  - `order_counters`
- Menormalkan skema:
  - Menambahkan kolom yang hilang untuk unified schema.
  - Mengubah nama kolom legacy ke nama baru:
    - `patient_nik` → `patient_national_id`
    - `ihs_number` → `satusehat_ihs_number` (dsb, lihat kode)
  - Backfill `order_number` dan `accession_number` bila kosong.
  - Menambahkan UNIQUE constraint aman (hanya ketika tidak ada duplikat).
  - Menambahkan index performa.

Integrasi dengan Master Data:
- Jika tabel `patients` tersedia, service dapat:
  - Membuat / update patient saat membuat order.
  - Mengisi `orders.patient_id` sebagai foreign key logis.

---

## 7. Keamanan & Praktik Production

- Jalankan Order Management sebagai internal service (tidak expose port 8001 langsung ke publik).
- Gunakan API Gateway sebagai satu-satunya entry point.
- Terapkan:
  - JWT_SECRET kuat dan aman.
  - RBAC via permission granular (`order:*`, `worklist:*`, dll).
- Logging:
  - Access & error logs di stdout (dikumpulkan oleh Docker/stack).
  - Audit log khusus ke `/var/log/orders/audit.log`.
- Monitoring:
  - Gunakan `/health` (internal) dan `/health?detailed=true` di gateway.
- Backup & Retention:
  - Backup database berkala.
  - Gunakan soft delete sebagai default; hard delete (`/purge`) hanya untuk kasus khusus.

---

## 8. Dokumentasi Endpoint Detail

Dokumen rinci di direktori `docs/`:

- `docs/order-create.md`
- `docs/order-list.md`
- `docs/order-all.md`
- `docs/order-all-details.md`
- `docs/order-get.md`
- `docs/order-update.md`
- `docs/order-delete.md`
- `docs/order-purge.md`
- `docs/order-sync-satusehat.md`
- `docs/order-create-worklist.md`
- `docs/complete-flow.md`

Pastikan tim integrasi membaca dokumen per-endpoint sebelum implementasi di SIMRS/Frontend.
