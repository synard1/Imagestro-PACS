# FIX: SATUSEHAT Readiness "v_order_prereq_status does not exist" Error (HTTP 500)

## Gejala Error (Symptoms)
- **URL Endpoint:** `GET /orders/{identifier}/satusehat-readiness` (via `api-gateway` / `satusehat-monitor` UI).
- **HTTP Status:** `500 Internal Server Error`
- **Pesan Error dari Backend:**
  ```json
  {
    "status": "error",
    "message": "Failed to check satusehat readiness",
    "detail": "relation \"v_order_prereq_status\" does not exist\nLINE 1: SELECT * FROM v_order_prereq_status WHERE order_id = '...' \n ^\n"
  }
  ```
- **Context:** Terjadi saat user mencoba melakukan *test sync* di halaman `http://{HOST}/satusehat-monitor`.

## Root Cause (Akar Masalah)
Error terjadi karena *Order Management Service* mencoba memanggil *view database* `v_order_prereq_status` saat mengecek kesiapan suatu order untuk disinkronisasikan ke SATUSEHAT. 

Namun, *view* tersebut belum diciptakan pada database (`worklist_db`) karena inisialisasi tabel dan skema terkait SATUSEHAT (sebelumnya ditangani oleh file skrip terpisah `apply_satusehat_schema.py`) **belum diintegrasikan** ke dalam *startup lifecycle* dan *database initialization* otomatis (`init_database()`) milik `order-management_service.py`.

Akibatnya, ketika di-*deploy* ke env baru atau saat tabel di-*reset*, komponen SATUSEHAT tidak otomatis terbuat.

## Resolusi dan Perubahan (Changes Made)
Pembuatan skema SATUSEHAT ditambahkan langsung ke fungsi `init_database()` pada file `order-management/order_management_service.py` agar database konsisten dan independen saat *service* berjalan.

**Komponen yang ditambahkan ke otomatisasi startup:**
1. **Custom ENUM Types:**
   - `tx_status` (pending, sending, sent, failed, cancelled, retrying)
   - `sr_state` (created, sent, failed)
   - `is_state` (created, sent, failed)
2. **SATUSEHAT Tables:**
   - `satusehat_orgs` (Untuk mapping Organisasi)
   - `satusehat_service_requests` (Audit trail untuk ServiceRequest)
   - `satusehat_encounters` (Audit trail untuk Encounter)
   - `satusehat_imaging_studies` (Audit trail untuk ImagingStudy)
   - Termasuk pembuatan relasi `FOREIGN KEY` ke tabel `orders` dengan instruksi `ON DELETE CASCADE`.
   - Indexing (`CREATE INDEX`) pada kolom-kolom kritikal seperti `order_id` dan `service_request_id`.
3. **Database View:**
   - `v_order_prereq_status`: *View* kompleks (CTE/WITH) yang bertugas menggabungkan status pengiriman dari `service_requests`, `encounters`, dan `imaging_studies` untuk mempercepat proses pengecekan readiness.

## File yang Dimodifikasi
- `order-management/order_management_service.py`
  - Perubahan berada di dalam fungsi `init_database()`, setelah blok pembuatan index untuk `order_procedures`.

## Verification (Verifikasi)
- Menjalankan `python -m py_compile order-management/order_management_service.py` dipastikan lolos (tidak ada *syntax error*).
- Pada saat *restart service order-management*, `logger.info("Initializing SATUSEHAT monitoring schema components...")` akan terpicu dan *database engine* PostgreSQL akan mengeksekusi blok pembuatan skema dengan aman berkat klausa `IF NOT EXISTS` dan `OR REPLACE`.