# Desain Integrasi Encounter & ServiceRequest SIMRS ↔ PACS (Order Management)

Dokumen ini mendeskripsikan pola integrasi antara SIMRS dan stack PACS/Order Management untuk:

- Encounter SIMRS (berbasis `registration_number`)
- ServiceRequest SATUSEHAT (atau referensi ServiceRequest dari SIMRS)

dengan asumsi:

- 1 `registration_number` SIMRS = 1 Encounter (kunjungan pasien per hari).
- 1 Encounter dapat digunakan oleh beberapa order/prosedur PACS pada hari yang sama.
- Stack PACS menggunakan:
  - API Gateway (`/api-gateway/api_gateway.py`)
  - Order Management Service (`/order-management/order_management_service.py`)

Endpoint teknis yang dirujuk di sini sudah tersedia atau mudah diaktifkan dalam kode saat ini.

---

## Glossary

- **PACS**: Dalam konteks ini merujuk ke Order Management Service dan layanan terkait dalam stack DICOM.
- **Encounter SIMRS**: Data kunjungan pasien di SIMRS; diidentifikasi oleh `registration_number`.
- **SatuSehat Encounter**: FHIR `Encounter` ID di ekosistem SATUSEHAT.
- **ServiceRequest**: FHIR `ServiceRequest` di SATUSEHAT untuk order/prosedur radiologi.
- **Gateway**: API Gateway sebagai satu-satunya entry point dari luar stack.

---

## Konsep Umum Integrasi

### Kunci Integrasi Encounter: `registration_number`

- `registration_number` adalah identitas kunjungan pasien di SIMRS.
- 1 `registration_number` mewakili 1 Encounter SIMRS pada 1 hari.
- Beberapa order/prosedur radiologi pada hari yang sama:
  - menggunakan `registration_number` yang sama,
  - berbagi Encounter yang sama.

### Target pada sisi PACS / Order Management

Untuk setiap order di PACS:

- Menyimpan `registration_number` (jika berasal dari SIMRS).
- Menyimpan informasi Encounter SIMRS ke:
  - `orders.details.simrs_encounter`
- Menyimpan referensi SatuSehat Encounter ke:
  - `orders.satusehat_encounter_id`
  - dan `orders.details.simrs_encounter.satusehat_encounter_id`
- Menyimpan referensi ServiceRequest ke:
  - `orders.satusehat_service_request_id`
  - dan `orders.details.simrs_servicerequest.servicerequest_id`

### Kriteria Readiness Sync (ringkasan)

Endpoint `GET /orders/{identifier}/satusehat-readiness` menggunakan aturan ketat:

Order hanya dianggap `ready_to_sync = true` jika:

1. `patient_ihs` status `ready`.
2. `encounter` status `ready` (memiliki `satusehat_encounter_id`).
3. `order_data` status `ready` (modality/procedure terisi).
4. `dicom_files` status `ready` dan ada minimal 1 DICOM terkait.
5. `doctor_ihs` status `ready`.
6. `service_request`:
   - `status == "synced"` dan
   - `value` (ID ServiceRequest) terisi.

Jika salah satu belum terpenuhi, `ready_to_sync = false` dan message menjelaskan area yang perlu diperbaiki.

---

## Integrasi Encounter (Push & Pull)

### Mode A — SIMRS Push Encounter ke PACS

SIMRS sebagai _source of truth_:

1. **Pembuatan Order**
   - SIMRS membuat order di PACS via Gateway:
     - `POST /orders` (-> `/orders/create_unified`).
   - Body mencakup:
     - `registration_number`
     - data pasien
     - data prosedur
     - dll.

2. **Push Encounter ke Order**

   - Endpoint (via Gateway):

     `POST /orders/{identifier}/simrs-encounter`

     - `{identifier}`:
       - `orders.id` (UUID), atau
       - `orders.accession_number`, atau
       - `orders.order_number`.
     - Auth:
       - JWT via Gateway.
       - Default permission via `/orders/<path>`:
         - `POST` → `order:create` atau `*` (dapat disesuaikan).

   - Contoh Request:

     ```json
     {
       "source": "simrs",
       "registration_number": "REG-2025-0001",
       "satusehat_encounter_id": "9c51e4ed-7f2a-4ae8-9a12-1234567890ab",
       "raw": {
         "mrn": "MRN-123",
         "unit": "RAD",
         "doctor_code": "D001",
         "doctor_name": "dr. Radiolog",
         "visit_date": "2025-01-10",
         "visit_time": "08:15:00",
         "other_fields": "bebas sesuai SIMRS"
       }
     }
     ```

   - Perilaku:
     - `registration_number` wajib.
     - Jika `orders.registration_number` sudah ada dan berbeda → `409`.
     - Simpan:

       ```json
       "simrs_encounter": {
         "source": "simrs",
         "registration_number": "REG-2025-0001",
         "satusehat_encounter_id": "Encounter/9c51e4ed-7f2a-4ae8-9a12-1234567890ab",
         "linked_at": "<timestamp>",
         "raw": { "...payload SIMRS..." }
       }
       ```

     - Isi:
       - `orders.registration_number` (bila kosong),
       - `orders.satusehat_encounter_id` (bila dikirim),
       - `details.updated` + audit log.

3. **Multi-Order**
   - SIMRS panggil endpoint yang sama untuk setiap order dengan `registration_number` yang sama.
   - Semua order tersebut share Encounter yang sama.

### Mode B — PACS Pull Encounter dari SIMRS

Dipakai bila SIMRS hanya expose REST API.

1. Prasyarat:

   - SIMRS menyediakan:
     - `GET /encounters/by-registration/{registration_number}`
   - OM dikonfigurasi:
     - `SIMRS_API_BASE_URL` (contoh: `http://simrs-api:8080`)

2. Flow:

   - Order sudah dibuat di PACS.
   - Operator/layanan memanggil:

     `POST /orders/{identifier}/simrs-encounter`

     ```json
     {
       "source": "simrs",
       "registration_number": "REG-2025-0001",
       "fetch": true
     }
     ```

   - OM:
     - Memanggil:
       - `GET {SIMRS_API_BASE_URL}/encounters/by-registration/REG-2025-0001`
     - Menyimpan response ke `details.simrs_encounter.raw`.
     - Mengisi `registration_number` dan `satusehat_encounter_id` jika ada.

---

## Integrasi ServiceRequest (Push & Pull)

ServiceRequest wajib ada (status `synced` + ID) agar readiness dianggap siap.

### Mode A — SIMRS Push ServiceRequest ke PACS

SIMRS (atau integrator SIMRS) membuat ServiceRequest ke SATUSEHAT, lalu mengirimkan ID-nya ke PACS.

1. **SIMRS Create/Own ServiceRequest**
   - SIMRS:
     - Build dan kirim FHIR `ServiceRequest` ke SATUSEHAT.
     - Mendapat `ServiceRequest/{id}`.

2. **Push ke PACS**

   - Endpoint (via Gateway):

     `POST /orders/{identifier}/simrs-servicerequest`

   - Body:

     ```json
     {
       "source": "simrs",
       "registration_number": "REG-2025-0001",
       "servicerequest_id": "ServiceRequest/abcd-1234",
       "raw": {
         "resourceType": "ServiceRequest",
         "status": "active",
         "intent": "order",
         "code": { "coding": [{ "system": "http://loinc.org", "code": "18747-6" }] },
         "subject": { "reference": "Patient/P02478375538" },
         "encounter": { "reference": "Encounter/9c51e4ed-..." }
       }
     }
     ```

3. **Perilaku di Order Management**

   - Validasi:
     - `registration_number` wajib.
     - `servicerequest_id` wajib.
     - Jika order sudah punya `registration_number`, harus sama.
   - Normalisasi:
     - Jika hanya ID → dibungkus `ServiceRequest/{id}`.
   - Simpan:
     - `orders.registration_number` (jika kosong).
     - `orders.satusehat_service_request_id = servicerequest_id`.
     - `details.simrs_servicerequest`:

       ```json
       "simrs_servicerequest": {
         "source": "simrs",
         "registration_number": "REG-2025-0001",
         "servicerequest_id": "ServiceRequest/abcd-1234",
         "linked_at": "<timestamp>",
         "raw": { "...payload SR..." }
       }
       ```

     - `details.updated` + audit `ATTACH_SIMRS_SERVICEREQUEST`.

4. **Dampak ke Readiness**

   - Dengan `satusehat_service_request_id` terisi:
     - `validation.service_request` akan dianggap `synced`.
     - Salah satu syarat ready terpenuhi (selama poin lain juga ready).

### Mode B — PACS Request ServiceRequest dari SIMRS

PACS/Order Management meminta SIMRS membuat/mengembalikan ServiceRequest.

1. Prasyarat:

   - `SIMRS_API_BASE_URL` dikonfigurasi.
   - SIMRS menyediakan endpoint (contoh):

     `POST /radiology/servicerequests`

     Payload dari OM:
     ```json
     {
       "registration_number": "REG-2025-0001",
       "accession_number": "ACC2025...",
       "order_number": "ORD2025...",
       "modality": "CT",
       "procedure_code": "18747-6",
       "procedure_name": "CT HEAD",
       "satusehat_encounter_id": "Encounter/...",
       "satusehat_ihs_number": "P02478375538"
     }
     ```

     Response SIMRS (disarankan):

     ```json
     {
       "status": "success",
       "servicerequest_id": "ServiceRequest/abcd-1234",
       "payload": { ...FHIR ServiceRequest atau ringkas... }
     }
     ```

2. **Endpoint di Order Management**

   - Via Gateway:

     `POST /orders/{identifier}/request-servicerequest-from-simrs`

   - Body minimal:

     ```json
     {
       "registration_number": "REG-2025-0001"
     }
     ```

3. **Perilaku di Order Management**

   - Resolve order:
     - pastikan `registration_number` (dari body atau order).
   - Build payload ke SIMRS dari data order:
     - registrasi, accession, order_number, modality, procedure, dll.
   - Call:
     - `POST {SIMRS_API_BASE_URL}/radiology/servicerequests`
   - Jika sukses dan `servicerequest_id` tersedia:
     - Normalisasi ke `ServiceRequest/{id}` jika perlu.
     - Simpan:
       - `orders.satusehat_service_request_id`.
       - `details.simrs_servicerequest`:

         ```json
         "simrs_servicerequest": {
           "source": "simrs",
           "registration_number": "REG-2025-0001",
           "servicerequest_id": "ServiceRequest/abcd-1234",
           "linked_at": "<timestamp>",
           "upstream": { "...response dari SIMRS..." }
         }
         ```

       - `details.updated` + audit `REQUEST_SIMRS_SERVICEREQUEST`.

4. **Dampak ke Readiness**

   - Setelah SIMRS memberikan `servicerequest_id` dan disimpan:
     - `service_request` dianggap `synced`.
   - Jika poin lain (`patient_ihs`, `encounter`, `dicom_files`, `doctor_ihs`) juga ready:
     - `ready_to_sync = true`.

---

## Kombinasi Encounter + ServiceRequest

Dua level integrasi dapat dikombinasikan:

- **Encounter:**
  - Mode A: SIMRS push → `/orders/{id}/simrs-encounter`
  - Mode B: PACS pull → `/orders/{id}/simrs-encounter` dengan `fetch:true`

- **ServiceRequest:**
  - Mode A: SIMRS push → `/orders/{id}/simrs-servicerequest`
  - Mode B: PACS pull/request → `/orders/{id}/request-servicerequest-from-simrs`

Dengan kombinasi ini:

1. SIMRS dapat sepenuhnya mengendalikan pembuatan Encounter & ServiceRequest (push).
2. PACS dapat meminta data ketika diperlukan (pull) jika SIMRS belum otomatis push.
3. Readiness `/satusehat-readiness` menjamin:
   - Tidak ada sync jika:
     - belum ada DICOM file,
     - belum ada IHS pasien/dokter,
     - Encounter belum ada,
     - ServiceRequest belum tercatat.

---

## Rekomendasi Implementasi

### Untuk Tim SIMRS (Push-first)

- Gunakan API Gateway:
  - `POST /orders` untuk membuat order radiologi.
  - `POST /orders/{id}/simrs-encounter` untuk mengirim Encounter per `registration_number`.
  - `POST /orders/{id}/simrs-servicerequest` untuk mengirim ID ServiceRequest setelah dibuat.
- Pastikan:
  - Kontrak payload konsisten dengan contoh di atas.

### Untuk Tim PACS / Integrator (Pull / Hybrid)

- Konfigurasi:
  - `SIMRS_API_BASE_URL` di Order Management.
- Minta SIMRS menyediakan:
  - `GET /encounters/by-registration/{registration_number}`
  - `POST /radiology/servicerequests` (create-or-return ServiceRequest)
- Implementasi UI/flow:
  - Tombol:
    - “Ambil Encounter SIMRS” → `POST /orders/{id}/simrs-encounter` (`fetch:true`).
    - “Minta ServiceRequest ke SIMRS” → `POST /orders/{id}/request-servicerequest-from-simrs`.

Dengan ini, integrasi Encounter & ServiceRequest antara SIMRS dan PACS terdokumentasi jelas dan konsisten dengan logika layanan yang ada.
