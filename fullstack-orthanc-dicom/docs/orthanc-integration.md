# Dokumentasi Integrasi Orthanc REST API

Integrasi antara Orthanc, API Gateway, Order Management, Master Data, dan layanan lain
dirancang dengan pola single entry point, security-by-default, dan keselarasan dengan
spesifikasi resmi Orthanc REST API:

https://orthanc.uclouvain.be/book/users/rest.html#rest


## 1. Tujuan

Dokumen ini menjelaskan implementasi integrasi Orthanc REST API dalam stack ini:

- API Gateway (`api-gateway/api_gateway.py`)
- Order Management Service (`order-management/order_management_service.py`)
- Master Data Service (`master-data-service/app.py`)
- Orkestrasi container (`docker-compose.yml`)

Fokus:

- Bagaimana Orthanc diakses hanya melalui API Gateway.
- Bagaimana alur Order → Accession → Worklist → DICOM → Orthanc dikendalikan.
- Mapping endpoint Gateway ke REST API Orthanc.
- Peran Master Data dalam konsistensi identitas pasien dan dokter.
- Mekanisme keamanan (JWT, RBAC, network isolation).


## 2. Arsitektur Tingkat Tinggi

Komponen utama yang terkait dengan Orthanc:

- Orthanc (`services.orthanc`)
  - DICOM server.
  - Simpan study/series/instances.
  - HTTP: 8042 (internal), DICOM: 4242 (internal).
  - Worklist plugin aktif (`ORTHANC_WORKLISTS_ENABLED` = true).
  - Storage ke volume `orthanc_storage` dan Postgres.

- Orthanc Proxy (`services.orthanc-proxy`)
  - Flask/gunicorn (lihat `orthanc_proxy:app`).
  - Mengarah ke `ORTHANC_URL=http://orthanc:8042`.
  - Menjadi target internal untuk API Gateway: `ORTHANC_SERVICE_URL`.

- API Gateway (`services.api-gateway`, `api_gateway.py`)
  - Satu-satunya pintu masuk HTTP publik: port 8888.
  - Tanggung jawab:
    - Validasi JWT (via `JWT_SECRET` bersama auth-service).
    - RBAC dengan permission granular (mis. `orthanc:read`).
    - Proxy:
      - Auth, MWL, Orders, Master Data, dll.
      - Orthanc REST API melalui:
        - `/orthanc/*` (via orthanc-proxy)
        - Endpoint direct minimal: `/system`, `/statistics`, `/studies`, dll.
      - Orthanc Web UI via `/orthanc-ui/*`, `/ui/*`, `/app/*`.

- Order Management Service (`services.order-management`, `order_management_service.py`)
  - Menyimpan dan mengelola:
    - Orders (order_number).
    - Accession numbers.
    - Status integrasi SatuSehat.
    - File terkait order (order_files).
  - Menghasilkan worklist DICOM (via MWL Writer) berdasarkan order.
  - Tidak memanggil REST Orthanc langsung, namun mengatur alur data yang akan berakhir di Orthanc.

- Master Data Service (`services.master-data-service`, `master-data-service/app.py`)
  - Master pasien, dokter, dan settings.
  - Digunakan untuk memastikan identitas konsisten di seluruh pipeline:
    SIMRS → Orders → DICOM → Orthanc → SatuSehat.

- Layanan pendukung:
  - `auth-service`: SSO + JWT issuer.
  - `mwl-writer`: tulis DICOM Modality Worklist ke storage Orthanc.
  - `dicom-router`, `modality-simulator`, UI (SSO UI, MWL UI, SIMRS UI).


## 3. Konfigurasi Infrastruktur (docker-compose.yml)

### 3.1. Network dan Isolasi

- Semua service berada di `networks.secure-network`:
  - `subnet: 172.28.0.0/16`
- Prinsip:
  - Hanya port berikut yang boleh diakses dari luar:
    - API Gateway: `8888`
    - UI publik: `3000` (SSO UI), `8095` (SIMRS Order UI), `8096` (MWL UI)
    - Port DICOM Router (11112) untuk modality
  - Orthanc:
    - HTTP 8042 dan DICOM 4242 hanya untuk internal.
    - Di file compose terdapat `8042:8042` dengan komentar "REMOVED FOR SECURITY".
      Di lingkungan production, mapping ini HARUS dihapus agar Orthanc tidak diekspos langsung.

### 3.2. Hubungan antar service terkait Orthanc

- `orthanc`:
  - Menggunakan Postgres internal untuk storage DICOM.
  - Worklist plugin membaca dari volume `/worklists` yang juga di-mount oleh `mwl-writer`.

- `orthanc-proxy`:
  - Environment:
    - `ORTHANC_URL=http://orthanc:8042`
  - Menyediakan HTTP 8043 internal untuk diakses Gateway sebagai `ORTHANC_SERVICE_URL`.

- `api-gateway`:
  - `ORTHANC_SERVICE_URL=http://orthanc-proxy:8043`
  - `ORTHANC_WEB_URL=http://orthanc:8042`
  - Proxy semua akses Orthanc melalui endpoint Gateway.

- `order-management`:
  - `MWL_SERVICE_URL=http://mwl-writer:8000`
  - `ACCESSION_API_URL=http://accession-api:8180`
  - Membuat order dan worklist, yang kemudian dikonsumsi modality dan Orthanc.

- `master-data-service`:
  - Berbagi database `worklist_db` dengan order-management untuk konsistensi identitas.


## 4. Integrasi API Gateway dengan Orthanc REST API

### 4.1. Prinsip Dasar

- Klien eksternal TIDAK boleh memanggil Orthanc langsung.
- Semua request harus:
  - Masuk lewat `http://<host>:8888` (API Gateway).
  - Membawa JWT (Bearer) kecuali endpoint publik tertentu.
  - Lolos pengecekan permission.
- Gateway meneruskan request:
  - Ke `orthanc-proxy` (untuk REST API).
  - Ke `orthanc` (untuk Web UI/static) dengan Basic Auth internal.

### 4.2. Proxy umum: /orthanc/<path>

Definisi (di `api_gateway.py`):

- Route:
  - `@app.route('/orthanc/<path:path>', methods=['GET', 'POST', 'PUT', 'DELETE'])`
  - `@require_auth(['orthanc:read', '*'])`
- Implementasi:
  - Membangun URL: `ORTHANC_SERVICE_URL / {path}`.
  - Meneruskan:
    - Method (GET/POST/PUT/DELETE).
    - Headers (termasuk Authorization dari klien, IP, User-Agent).
    - Body / query string.
- `ORTHANC_SERVICE_URL` → `http://orthanc-proxy:8043`:
  - orthanc-proxy lalu meneruskan ke `ORTHANC_URL=http://orthanc:8042`.

Mapping ke spesifikasi Orthanc REST API:

- Contoh:
  - GET `/orthanc/system` → Orthanc `/system`
  - GET `/orthanc/studies` → Orthanc `/studies`
  - GET `/orthanc/studies/{id}` → Orthanc `/studies/{id}`
  - GET `/orthanc/instances/{id}/file` → Orthanc `/instances/{id}/file`
- Pola: semua path di dokumentasi Orthanc dapat diakses dengan prefix `/orthanc/` via Gateway,
  selama user memiliki permission yang sesuai.

Catatan:
- Secara default decorator menggunakan `['orthanc:read', '*']` untuk semua method.
- Untuk produksi disarankan:
  - Pisahkan izin read/write:
    - GET: `orthanc:read`
    - POST/PUT/DELETE: `orthanc:write` atau `orthanc:admin`.
  - Saat ini perlu penyesuaian kecil jika ingin enforcement seketat itu.

### 4.3. Orthanc Web UI: /orthanc-ui/*

Tujuan: expose UI Orthanc secara aman melalui Gateway.

- Endpoint:
  - `/orthanc-ui`
  - `/orthanc-ui/<path:path>`
- Mekanisme:
  - Jika `ALLOW_ORTHANC_UI_PUBLIC=false`:
    - Gateway meminta HTTP Basic Auth (`ADMIN_USERNAME`, `ADMIN_PASSWORD`).
    - Hanya kredensial ini yang boleh mengakses UI.
  - Jika `ALLOW_ORTHANC_UI_PUBLIC=true`:
    - GET diizinkan (UI view).
    - POST/PUT/DELETE diblok jika public (untuk menghindari operasi tulis tanpa kontrol).
  - Gateway menggunakan Basic Auth internal ke Orthanc:
    - `ORTHANC_USERNAME` / `ORTHANC_PASSWORD`.
- Akses:
  - `http://<host>:8888/orthanc-ui/` → Explorer Orthanc.

### 4.4. Static UI Orthanc: /ui dan /app

- Endpoint:
  - `/ui`, `/ui/<path>`
  - `/app`, `/app/<path>`
- Fungsi:
  - Proxy asset Explorer v1/v2 dari Orthanc.
  - Mode public/private diatur `ALLOW_ORTHANC_UI_PUBLIC`.
- Hubungan dengan spec Orthanc:
  - Ini meng-expose asset yang disediakan plugin UI Orthanc, tanpa membuka port 8042.


### 4.5. Minimal direct API untuk UI: /system, /statistics, /tools, dll.

Untuk kompatibilitas UI yang mengharapkan root endpoint Orthanc:

- Implementasi `orthanc_*` di Gateway menggunakan `_proxy_orthanc_direct`:
  - `/system` → Orthanc `/system`
  - `/statistics` → Orthanc `/statistics`
  - `/tools`, `/tools/<subpath>` → Orthanc `/tools/*`
  - `/instances`, `/studies`, `/series`, `/changes`, `/peers`, `/modalities`, `/plugins`, `/jobs`
- Keamanan:
  - Jika `ALLOW_ORTHANC_UI_PUBLIC=false`:
    - Perlu Basic Auth gateway (admin).
  - Jika true:
    - Hanya operasi dianggap aman (GET, HEAD, OPTIONS, POST untuk tools/find/lookup) yang diizinkan.
    - Operasi lain diblok di gateway.

Ini memberikan cara standar untuk menjalankan viewer yang langsung memanggil `/system`, `/studies`, dsb.,
tapi tetap melewati Gateway, align dengan REST Orthanc.


## 5. Integrasi Order Management dengan Worklist dan Orthanc

Order Management tidak langsung memanggil REST Orthanc, tetapi:

- Mengatur:
  - Identitas pasien (via Master Data).
  - order_number dan accession_number.
  - Pembuatan Worklist untuk modality.
- Orthanc akan menerima DICOM dari modality berdasarkan informasi ini.

### 5.1. Pembuatan Order dan Accession

- Endpoint (Gateway):
  - POST `/orders` → proxy ke Order Management `/orders/create`.
  - Permission via gateway: `order:create` atau `*`.
- Di Order Management:
  - `create_order_unified()`:
    - Validasi data.
    - Generate `order_number`.
    - Generate atau gunakan `accession_number` via `ACCESSION_API_URL`.
    - Memastikan patient ada di `patients` (Master Data DB).
    - Simpan `orders` dengan metadata lengkap, termasuk `accession_number`.

### 5.2. Pembuatan Worklist

- Endpoint di Order Management:
  - POST `/orders/<identifier>/create-worklist`
    - identifier bisa id/order_number/accession_number.
- Proses:
  - Ambil order.
  - Bentuk payload DICOM Worklist (Scheduled Procedure Step).
  - Kirim ke MWL Writer:
    - `POST {MWL_SERVICE_URL}/worklist/create`.
  - MWL Writer menyimpan ke `/worklists`, yang digunakan Orthanc Worklist plugin.
- Hasil:
  - Modality dengan AET yang sesuai dapat query Modality Worklist ke Orthanc,
    dan mendapatkan item berbasis order tersebut.

### 5.3. Complete Flow

- Endpoint:
  - POST `/orders/complete-flow` (via Gateway dengan JWT).
- Langkah otomatis:
  1. Create order.
  2. Sync ke SatuSehat (ServiceRequest).
  3. Create Worklist.
- Setelah itu:
  - Modality membaca worklist.
  - Mengirim DICOM ke Orthanc (C-STORE).
  - Studi DICOM di Orthanc akan memiliki AccessionNumber dan patient info
    yang cocok dengan order.

### 5.4. Korelasi dengan Orthanc REST

Setelah DICOM tersimpan di Orthanc:

- Klien dapat memonitor menggunakan Gateway:
  - GET `/orthanc/studies` → daftar studi.
  - GET `/orthanc/tools/find` → mencari studi berdasarkan:
    - AccessionNumber
    - PatientID
    - dsb.
- Dengan demikian:
  - `accession_number` dari Order Management = `AccessionNumber` di DICOM/Orthanc.
  - `patient_national_id`/MRN bisa disejajarkan dengan PatientID/PID di DICOM.


## 6. Peran Master Data Service

Master Data Service memastikan konsistensi identitas:

- Endpoint via Gateway:
  - `/patients/*`, `/patients/search`
  - `/doctors/*`, `/doctors/search`
  - `/settings/*`
- Fitur:
  - Tabel `patients`, `doctors`, dsb.
  - Settings untuk integrasi (misal SatuSehat) yang juga dipakai oleh Gateway
    (`get_satusehat_config_from_settings`).
- Relasi:
  - Order Management:
    - `ensure_patient_record` menggunakan tabel `patients`.
    - Order memiliki `patient_id` yang mengacu ke Master Data.
  - Orthanc:
    - Tidak langsung memanggil Master Data.
    - Namun data pasien/dokter yang dipakai DICOM berasal dari Master Data,
      sehingga pencarian di Orthanc menjadi konsisten dengan sistem lain.

Kesimpulan:
- Master Data adalah sumber kebenaran identitas.
- Orthanc menyimpan data imaging yang sudah memakai identitas tersebut.


## 7. Keamanan: JWT, RBAC, dan Best Practices

### 7.1. Single Entry Point

- Semua request eksternal harus melalui:
  - `api-gateway` pada port 8888.
- Service internal:
  - Orthanc, Postgres, Order Management, Master Data, MWL Writer, dll
    tidak diekspos ke publik.

Best practice production:

- Hapus mapping berikut dari `docker-compose.yml` jika tidak diperlukan:
  - `8042:8042` (Orthanc HTTP)
  - `5532:5432` (Postgres)
- Gunakan reverse proxy (Nginx/Traefik) di depan Gateway jika diperlukan TLS/HTTPS.

### 7.2. JWT dan RBAC

- JWT dikeluarkan oleh `auth-service`.
- API Gateway:
  - `validate_token()` memverifikasi menggunakan `JWT_SECRET` dan `HS256`.
  - `require_auth(required_permissions=...)`:
    - Mengecek:
      - Token valid.
      - Permissions:
        - `*` (superadmin)
        - Wildcard kategori (mis. `patient:*`, `order:*`)
        - Permission spesifik.
- Order Management dan Master Data:
  - Juga memverifikasi JWT dan permission (untuk direct call, jika diperlukan).
  - Namun dalam arsitektur ini, biasanya diakses via Gateway.

### 7.3. Akses Orthanc yang Aman

Disarankan konfigurasi:

- `ALLOW_ORTHANC_UI_PUBLIC=false`
- Hanya expose:
  - `http://<host>:8888/orthanc-ui/` (dengan Basic Auth gateway).
  - `http://<host>:8888/orthanc/...` (dengan JWT + RBAC).
- Tambahkan pattern RBAC lebih ketat untuk operasi tulis Orthanc, contoh:
  - GET `/orthanc/*`: `orthanc:read`
  - POST/PUT/DELETE `/orthanc/*`: `orthanc:write` atau `orthanc:admin`
  - Hanya role tertentu memiliki `orthanc:write/admin`.


## 8. Alur End-to-End (Ringkas)

1. User login (SSO):
   - POST `/auth/login` → dapat JWT.

2. Buat order:
   - POST `/orders` (via Gateway, Bearer JWT).
   - Gateway → Order Management:
     - Generate order_number & accession_number.
     - Simpan ke DB; sinkron dengan Master Data pasien.

3. (Opsional) Sync ke SatuSehat:
   - POST `/orders/<id>/sync-satusehat` atau `/orders/complete-flow`.

4. Buat Worklist:
   - POST `/orders/<id>/create-worklist`.
   - Order Management → MWL Writer → file di `/worklists` (Orthanc).

5. Modality:
   - Query MWL ke Orthanc.
   - Scan dan kirim DICOM ke Orthanc (C-STORE ke 4242).

6. Viewer/Admin:
   - Akses studi lewat:
     - `/orthanc-ui/*` (Web UI).
     - `/orthanc/studies`, `/orthanc/instances`, `/orthanc/tools/find`, dll.
     - Semua via Gateway dengan JWT/RBAC.

Dengan ini:

- Orthanc REST API aman di belakang Gateway.
- Keterkaitan antara order, accession, worklist, DICOM, dan SatuSehat dapat ditelusuri.
- Identitas pasien/dokter konsisten via Master Data.


## 9. Rekomendasi Tambahan (Opsional)

Untuk penguatan production:

- Security:
  - Terapkan HTTPS di depan API Gateway.
  - Kunci JWT_SECRET kuat dan konsisten di auth-service, api-gateway, order-management, master-data.
  - Nonaktifkan semua port internal yang tidak perlu di host.

- RBAC Orthanc:
  - Pisahkan izin:
    - `orthanc:read` untuk read-only.
    - `orthanc:write` untuk operasional (anonymize, delete, upload).
    - `orthanc:admin` untuk operasi penuh.
  - Perbarui decorator `/orthanc/<path>` sesuai kebutuhan.

- Observability:
  - Aktifkan logging akses di Gateway (sudah ada logger).
  - Korelasikan request-id antara Gateway, Order Management, dan Orthanc.

- Dokumentasi internal:
  - Tambahkan contoh konkret panggilan:
    - GET `/orthanc/studies` dengan JWT.
    - Pencarian studi berdasarkan AccessionNumber via `/orthanc/tools/find`.
    - Alur lengkap `complete-flow`.


## 10. Pedoman Frontend: Kirim DICOM via DICOM Router & Ambil ImagingStudy ID

Bagian ini ditujukan untuk tim UI agar memiliki pedoman teknis saat mengintegrasikan fitur upload DICOM dan pencarian ImagingStudy ID (FHIR).

### 10.1. Kirim DICOM File via DICOM Router (HTTP)

- Endpoint dasar melalui Gateway:
  - Health check publik: `GET /dicom-router/health`
  - Semua endpoint router diproxy 1:1: `/{gateway}/dicom-router/<path>`
  - Default target router: `DICOM_ROUTER_URL=http://dicom-router:8080`
  - Permission gateway: `dicom:router` atau `*`
- Mode DICOM (modality):
  - Modality mengirim C-STORE ke AET `DCMROUTER` host `<gateway-host>` port `11112`.
  - Router meneruskan ke Orthanc dengan AET `ORTHANC` (env `ORTHANC_HOST/PORT/AET` di compose).
- Mode HTTP (upload manual dari UI):
  - Gunakan endpoint upload bawaan router (default upstream image memakai path `/upload`), akses lewat Gateway: `POST /dicom-router/upload`.
  - Header: `Authorization: Bearer <JWT>` (agar lolos RBAC gateway).
  - Body: `multipart/form-data` dengan field `file=@<nama_file>.dcm`. Beberapa deployment router juga menerima metadata opsional (mis. `targetAet`, `targetHost`, `targetPort`, `studyInstanceUID`, `accessionNumber`); jika tidak dikirim, router memakai nilai default yang sudah dikonfigurasi di compose.
  - Contoh curl:
    ```bash
    curl -X POST http://localhost:8888/dicom-router/upload \
      -H "Authorization: Bearer $TOKEN" \
      -F "file=@/path/to/example.dcm"
    ```
  - Respons dikembalikan apa adanya dari DICOM Router; biasanya mencantumkan status dan informasi studi (mis. StudyInstanceUID / AccessionNumber) setelah file diteruskan ke Orthanc. UI cukup menampilkan status sukses/gagal dan menyimpan StudyInstanceUID jika tersedia untuk korelasi berikutnya.

### 10.2. Ambil ImagingStudy ID (FHIR) untuk ditampilkan di UI

Satusehat Integrator sudah menyediakan helper pencarian ImagingStudy yang diproxy oleh Gateway dan otomatis mengelola token.

- Endpoint rekomendasi (gateway → satusehat-integrator):
  - `GET /satusehat/imagingstudy/search/<accessionNumber>?orgId=<ORG_IHS>`  
    - Akan membangun 3 identifier fallback:  
      1) `<systemBase>/<orgId>|<acsn>` (default systemBase dari config)  
      2) `http://sys-ids.kemkes.go.id/acsn/<orgId>|<acsn>`  
      3) `http://sys-ids.kemkes.go.id/accessionno/<orgId>|<acsn>`
  - Alternatif query-param: `GET /satusehat/imagingstudy/search?accessionNumber=<acsn>&orgId=<ORG_IHS>` atau `GET /satusehat/imagingstudy/search?identifier=<system|value>`.
- Contoh respons sukses (dipersingkat):
  ```json
  {
    "imagingStudyId": "0ed1234a-5678-90ab-cdef-111213141516",
    "identifier": "http://sys-ids.kemkes.go.id/acsn/100000001|ACC20251107000001",
    "triedIdentifiers": [
      "http://sys-ids.kemkes.go.id/acsn/100000001|ACC20251107000001",
      "http://sys-ids.kemkes.go.id/accessionno/100000001|ACC20251107000001"
    ],
    "bundle": { "...FHIR bundle..." }
  }
  ```
- Autentikasi:
  - Gateway akan memanggil satusehat-integrator yang otomatis mengelola token SATUSEHAT. Untuk jejak audit UI, tetap disarankan mengirim `Authorization: Bearer <JWT>`, meski path ini tidak memakai decorator `require_auth`.
- Pola penggunaan di UI:
  1) Setelah upload DICOM (C-STORE atau HTTP), simpan AccessionNumber yang sudah dipakai di DICOM.
  2) Lakukan polling ringan ke endpoint di atas (mis. tiap 10–20 detik, maksimal N kali) sampai `imagingStudyId` muncul.
  3) Tampilkan `imagingStudyId` di tabel order/study, atau simpan untuk hyperlink ke viewer/FHIR detail.
  4) Jika polling habis tanpa hasil, tampilkan status “Belum tersedia di SATUSEHAT” dengan opsi “Coba lagi”.
