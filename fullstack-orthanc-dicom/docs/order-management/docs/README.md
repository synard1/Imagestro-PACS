# Order Management Service - Dokumentasi Fitur (Sinkron dengan Kode)

Service:
- File utama: order_management_service.py
- Tujuan:
  - Simulator order radiologi (SIMRS Order Simulator).
  - Generator order_number dan integrasi accession-api.
  - Integrasi SATUSEHAT (ServiceRequest) dan MWL.
  - Monitoring sumber order (`order_source`) dan pipeline status.

DB utama:
- Tabel: orders
- Lihat: schema-orders.md (sumber kebenaran skema).
- Kolom penting tambahan:
  - order_source: sumber order (simrs/api/pacs/unknown/...).

Autoload/migrasi:
- Saat start:
  - wait_for_database() memastikan konektivitas.
  - init_database():
    - Membuat/menyesuaikan tabel orders + indeks + constraint.
    - Menambahkan kolom-kolom unified schema (lihat schema-orders.md).
    - Menambahkan kolom order_source jika belum ada:
      - ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_source VARCHAR(50)
    - Backfill order_number, accession_number, patient_id, dsb.
    - Menjaga konsistensi dengan master patients / satusehat_orgs bila tersedia.
  - Log ke stdout untuk setiap langkah penting.

Keamanan:
- JWT:
  - JWT_SECRET, JWT_ALGORITHM=HS256.
  - Decorator require_auth(required_permissions) digunakan untuk endpoint tertentu (complete_flow).
- Akses:
  - Direkomendasikan diakses via API Gateway.
  - Protected fields (tidak bisa diubah via update_order):
    - id, order_number, accession_number, created_at, updated_at, satusehat_service_request_id, order_source.
- Audit:
  - log_order_action() tulis ke /var/log/orders/audit.log.
  - Kolom details (JSONB) menyimpan metadata created/updated/deleted.

Sumber Order (order_source):
- Di-set otomatis di create_order_unified via resolve_order_source(data):
  - Prioritas:
    1. body.order_source
    2. header X-Order-Source
    3. Heuristik:
       - User-Agent mengandung "simrs" atau header X-SIMRS-Client -> "simrs"
       - User-Agent mengandung "pacs" atau "router" atau "dicom" -> "pacs"
       - Path mengandung "complete-flow" atau "orders/create" -> "api"
       - Default -> "api"
- Disimpan di kolom orders.order_source.
- Tidak bisa diubah via PUT /orders/<id> (protected_fields).
- Dipakai di:
  - GET /orders/list?source=...
  - GET /orders/source-stats
  - GET /orders/source-status-stats

---

## Endpoint

Semua response dalam JSON dengan pola:

- Success:
  - { "status": "success", ... }
- Error:
  - { "status": "error", "message": "...", ... }

### 1. Health & Info

1. GET `/`
   - Deskripsi singkat service + daftar endpoint utama.

2. GET `/health`
   - Mengecek konektivitas DB.
   - Response:
     - { "status": "healthy", "service": "order-management", "database": "healthy|unhealthy", "timestamp": ... }

---

### 2. Create Order

1. POST `/orders/create_unified`
2. POST `/orders/create`
   - `/orders/create` adalah wrapper ke `create_order_unified`.

Body minimal (wajib):

- modality
- patient_name
- gender
- birth_date
- (salah satu) patient_national_id atau medical_record_number
- referring_doctor/referring_physician (akan dinormalisasi ke referring_doctor)

Field penting lain (opsional tapi direkomendasi):

- procedure_code, procedure_name
- scheduled_at
- registration_number
- satusehat_ihs_number / ihs_number / satusehat_patient_id / patientId
- attending_nurse
- clinical_indication, clinical_notes
- order_source (opsional; override default heuristik jika trusted)

Perilaku:

- Validasi required.
- Cek duplikasi (1 jam terakhir) dengan kombinasi:
  - registration_number, procedure_code, procedure_name, patient_name, medical_record_number.
- Menentukan patient (ensure_patient_record) dan org_id (resolve_default_org_uuid).
- Menentukan accession_number:
  - Jika ada di request (accession_number/accession_no):
    - Dipakai apa adanya (selama tidak melanggar unique).
  - Jika tidak ada:
    - Panggil ACCESSION_API_URL `/accession/create`.
- Menentukan order_source via resolve_order_source.
- Generate:
  - order_id (UUID)
  - order_number (via generate_order_number, unik)
- Insert ke tabel orders dengan status='CREATED'.
- Mengisi kolom:
  - org_id, patient_id, order_number, accession_number, ... , order_source, details.

Response 201:

- { "status": "success", "order": { ... } }
- Field penting:
  - id, order_number, accession_number, order_source, status, details, dsb.

---

### 3. List & Get Orders

1. GET `/orders/list`

Tujuan:
- List ringan untuk UI / gateway.

Query params:

- status (opsional)
- date (opsional; filter scheduled_at::date)
- modality (opsional)
- source (opsional; filter by order_source, case-insensitive)
- limit (default 100, max 500)
- offset (default 0)

Filter:
- Selalu exclude `status = 'DELETED'`.

Response:

- status, orders[], count, total, limit, offset
- Kolom per order:
  - id, order_number, accession_number,
  - patient_name, patient_national_id, medical_record_number,
  - modality, procedure_code, procedure_name,
  - registration_number,
  - order_source,
  - status, order_status, worklist_status, satusehat_synced,
  - scheduled_at, created_at.

2. GET `/orders/all`

Tujuan:
- List simple seluruh order (non-DELETED) untuk admin/debug.

Response:
- orders[] dengan:
  - id, order_number, accession_number,
  - patient_name, modality,
  - order_source,
  - status, created_at.

3. GET `/orders/all/details`

Tujuan:
- Dump detail (SELECT * FROM orders WHERE status != 'DELETED').

Response:
- orders[] (semua kolom).
- id dinormalisasi ke string.

4. GET `/orders/<identifier>`

identifier:
- id (UUID)
- atau accession_number
- atau order_number

Perilaku:
- Hanya mengembalikan jika status != 'DELETED'.

Response:
- status: success/error
- order: objek lengkap (SELECT *).

---

### 4. SATUSEHAT Integrasi

1. POST `/orders/<identifier>/sync-satusehat`

Tujuan:
- Membuat ServiceRequest di SATUSEHAT untuk order tertentu.

identifier:
- id (UUID) atau accession_number.

Body (opsional):

- satusehat_ihs_number / satusehat_patient_id / patientId / ihs_number
- satusehat_encounter_id / encounterId
- loinc_code / procedure_code
- requester_ref
- performer_ref

Logika:

- Ambil order.
- Resolusi:
  - satusehat_ihs_number: dari body atau order.
  - satusehat_encounter_id: dari body atau order.
  - procedure_code/loinc_code: dari body atau order.
- Validasi wajib:
  - satusehat_ihs_number, satusehat_encounter_id, procedure_code/loinc_code.
- Bangun payload FHIR ServiceRequest:
  - identifier menggunakan accession_number + ACSN_SYSTEM_BASE + SATUSEHAT_ORG_ID.
  - note dari clinical_notes/clinical_indication bila ada.
- Panggil SATUSEHAT OAuth untuk token; POST ServiceRequest.
- Jika sukses:
  - Update orders:
    - satusehat_ihs_number, satusehat_encounter_id, satusehat_service_request_id
    - satusehat_synced=TRUE, satusehat_sync_date=NOW
    - order_status='SYNCED'
    - details.updated diisi.
  - Log audit SATUSEHAT_SYNCED.

Response:
- Success: detail id ServiceRequest, upstream info.
- Error: status=error dengan message dan detail upstream (jika ada).

---

### 5. MWL (Modality Worklist)

1. POST `/orders/<identifier>/create-worklist`

Tujuan:
- Membuat worklist DICOM dari order.

identifier:
- id (UUID) atau accession_number.

Perilaku:

- Ambil order.
- Bangun payload ke MWL Service (`MWL_SERVICE_URL`):
  - PatientName, PatientID (NIK/patient_id),
  - PatientBirthDate, PatientSex,
  - AccessionNumber,
  - RequestedProcedureDescription (procedure_description/procedure_name),
  - Modality,
  - ScheduledDate/Time dari scheduled_at,
  - PhysicianName dari ordering_physician_name,
  - StationAET dari MWL_STATION_AET.
- Panggil `/worklist/create` pada MWL service.
- Jika sukses:
  - Update orders:
    - worklist_status='CREATED'
    - order_status='SCHEDULED'
    - updated_at, details.updated
  - Log WORKLIST_CREATED.

Response:
- Success: status=success, accession_number, payload from MWL.
- Error: status=error dengan message.

---

### 6. Complete Flow

1. GET `/orders/complete-flow`
   - Guard: selalu 405 dengan pesan gunakan POST.

2. POST `/orders/complete-flow`
   - Protected by JWT + permission `order:create` via @require_auth.

Alur:

1) Create order (memanggil /orders/create_unified).
2) Sync ke SATUSEHAT (memanggil sync_to_satusehat dengan id order).
3) Create Worklist (memanggil create_worklist_from_order).

- SATUSEHAT failure:
  - Jika SATUSEHAT_SYNC_OPTIONAL=true:
    - Flow lanjut (worklist tetap dibuat), satusehat field menunjukkan skipped/error.
  - Jika false:
    - Error diteruskan, flow dianggap gagal.

Response:
- status: success
- accession_number
- order: detail order
- satusehat: hasil sync atau status skipped
- worklist: hasil create worklist
- next_steps: hint langkah berikut.

---

### 7. Delete & Purge

1. DELETE `/orders/<identifier>`

Soft delete:

- Cari order by:
  - id / accession_number / order_number.
- Jika sudah DELETED:
  - 409 dengan pesan gunakan /purge jika mau hard delete.
- Jika belum:
  - Set:
    - status='DELETED'
    - details.deleted = { by, at }
    - updated_at = NOW
  - Log ORDER_DELETED.

2. DELETE `/orders/<identifier>/purge`

Hard delete:

- Cari order.
- Hapus baris dari DB.
- Log ORDER_PURGED.

Catatan:
- Purge tidak mengecek status DELETED terlebih dahulu: gunakan setelah soft delete sesuai SOP.

---

### 8. Update Order (Partial)

1. PUT `/orders/<identifier>`

identifier:
- id (UUID) atau accession_number atau order_number.

Aturan:

- protected_fields (tidak boleh diupdate):
  - id, order_number, accession_number, created_at, updated_at,
  - satusehat_service_request_id, order_source.
- alias_map:
  - requested_procedure -> procedure_name
  - station_ae_title -> ordering_station_aet
  - scheduled_start_at -> scheduled_at
- Field yang tidak ada di row -> dianggap invalid.
- JSON fields:
  - details, metadata (jika ada) -> di-wrap sebagai Json().

Respon:

- Jika ada invalid_fields:
  - 400 + daftar invalid_fields + allowed_fields + hint alias.
- Jika tidak ada field valid:
  - 400 "No valid fields to update".
- Jika sukses:
  - UPDATE + updated_at = NOW
  - Log ORDER_UPDATED
  - 200 dengan order_id & accession_number.

---

### 9. Statistik Sumber & Status

1. GET `/orders/source-stats`

Tujuan:
- Statistik jumlah order per `order_source`.

Query params:

- from (opsional): filter created_at >= from
- to (opsional): filter created_at < to(+1 hari jika hanya YYYY-MM-DD)
- group_by (opsional):
  - kosong / != 'day' -> mode summary
  - 'day' -> mode by_day (time series)

Mode summary:

- Response:
  - status: success
  - mode: "summary"
  - total: total order (non-DELETED, filter applied)
  - sources: [{ source, count, percentage }]

Mode by_day:

- Response:
  - status: success
  - mode: "by_day"
  - total: total semua hari
  - sources_summary: summary global per source
  - by_day: [
      {
        day: "YYYY-MM-DD",
        total: <int>,
        sources: [{ source, count, percentage }, ...]
      },
      ...
    ]

2. GET `/orders/source-status-stats`

Tujuan:
- Statistik status per sumber untuk analisa kualitas routing.

Query params:

- from, to (opsional): sama seperti di atas.

Respon:

- status: success
- total: total order (non-DELETED)
- sources: [
    {
      source: "simrs"/"pacs"/"api"/"unknown"/...,
      total: <int>,
      percentage_of_all: <float>,
      statuses: [
        { status: "CREATED", count: <int>, percentage: <float> },
        { status: "SYNCED", ... },
        ...
      ]
    },
    ...
  ]

---

Dokumen terkait:

- schema-orders.md
  - Deskripsi setiap kolom di tabel `orders` termasuk order_source.
- schema-patients.md
  - Skema master pasien (jika digunakan dalam ekosistem).
- schema-satusehat_service_requests.md
- schema-satusehat_imaging_studies.md
- schema-satusehat_encounters.md
- schema-index.md
  - Index semua schema di atas.

Dokumentasi ini telah diselaraskan 1:1 dengan implementasi terkini di `order_management_service.py`.
Jika fitur baru ditambahkan atau diubah, pastikan update dokumen ini dan schema-* terkait pada saat yang sama.
