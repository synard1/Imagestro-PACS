# Master Data Service

Master Data Service menyediakan layanan terpusat untuk:
- Master data pasien
- Master data dokter/practitioner
- Kualifikasi dokter
- Global settings/service configuration
- Audit trail
Dengan proteksi JWT dan izin berbasis permission.

Service ini berjalan di dalam jaringan internal, biasanya diakses via API Gateway.

## Informasi Umum

- Bahasa: Python + Flask
- Port default kontainer: 8002
- Auth: JWT (HS256)
- Database: PostgreSQL

### Environment Variables

Wajib / penting:
- POSTGRES_HOST (default: postgres)
- POSTGRES_DB (default: worklist_db)
- POSTGRES_USER (default: dicom)
- POSTGRES_PASSWORD (default: dicom123)
- JWT_SECRET (wajib override di production)
- JWT_ALGORITHM (default: HS256)

Opsional:
- LOG_LEVEL
- TZ

## Skema Database (Ringkas)

1. patients
   - id (UUID, PK)
   - patient_national_id (NIK, unik, nullable)
   - ihs_number (unik, nullable)
   - medical_record_number (MRN, NOT NULL)
   - patient_name, gender, birth_date, address, phone, email, dst
   - emergency_contact_*, insurance_*
   - active (bool, default true)
   - created_at, updated_at, deleted_at (soft delete)
   - Index: national_id, ihs_number, mrn, name, birth_date, active (where active)

2. patient_allergies
3. patient_medical_history
4. patient_family_history
5. patient_medications
   - Semua terkait ke patients.id (ON DELETE CASCADE)

6. patient_audit_log
   - Log aksi CREATE/UPDATE/DELETE pasien

7. doctors
   - id (UUID, PK)
   - ihs_number (unik bila tidak null)
   - national_id (unik)
   - name (NOT NULL)
   - license (unik)
   - specialty, phone, email, gender (M/F), birth_date
   - active, created_at, updated_at, deleted_at
   - Index untuk national_id, license, name, specialty, active

8. doctor_qualifications
   - Kualifikasi dokter (FK ke doctors.id)

9. doctor_schedules
   - Jadwal praktik dokter (FK ke doctors.id)

10. doctor_audit_log
    - Log aksi terhadap data dokter dan kualifikasinya

11. settings
    - id (UUID, PK)
    - key (unik, NOT NULL)
    - value (JSONB, NOT NULL)
    - description
    - created_at, updated_at

Init schema dijalankan pada startup melalui `init_database()`.

## Autentikasi & Otorisasi

Semua endpoint (kecuali /health) menggunakan JWT Bearer:

- Header:
  - Authorization: Bearer <token>

Payload JWT minimal:
- `sub`: user id / username
- `permissions`: array string permission, contoh:
  - `["*", "patient:read", "patient:create", "doctor:read", "setting:write"]`
- Jika `'*'` ada, dianggap full access.

Permission yang digunakan:

- patient:read
- patient:create
- patient:update
- patient:delete
- patient:search
- doctor:read / practitioner:read
- doctor:create / practitioner:create
- doctor:update / practitioner:update
- doctor:delete / practitioner:delete
- doctor:search / practitioner:search
- setting:read
- setting:write

Mapping di-code:
- Dibungkus dalam `REQUIRED_PERMISSIONS` dan dicek oleh decorator `@require_auth`.

## Health Check

GET /health
- Status: 200
- Response:
  - `{"status":"healthy","service":"master-data-service","version":"1.0.0"}`

Tidak butuh auth (bisa disesuaikan via gateway).

---

## API: Patients

Semua respons menggunakan pola:
- `status`: "success" / "error"
- `message`: jika relevan
- `data`/`patient`/`patients`: payload

### 1. Create Patient

POST /patients
- Permissions: patient:create
- Body (minimum):
  - medical_record_number (string, required)
  - patient_name (string, required)
  - gender ("male" / "female", required)
  - birth_date (YYYY-MM-DD, required)
- Opsional (beberapa):
  - patient_national_id (NIK, unik jika diisi)
  - ihs_number
  - address, phone, email, nationality, ethnicity, religion, marital_status,
    occupation, education_level,
    emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
    insurance_provider, insurance_policy_number, insurance_member_id
- Validasi:
  - Cek duplikasi MRN (wajib)
  - Cek duplikasi patient_national_id jika diisi
- Response 201:
  - `{"status":"success","message":"Patient created successfully","patient_id":"..."}`

### 2. Get Patient Detail

GET /patients/{id_or_nik}
- Permissions: patient:read
- Path:
  - Jika 36 char -> diasumsikan UUID id.
  - Jika tidak -> dicari sebagai patient_national_id atau medical_record_number.
- Response 200:
  - `patient`: berisi kolom patients +:
    - allergies: list dari patient_allergies
    - medical_history: list
    - family_history: list
    - medications: list
- 404 jika tidak ditemukan.

### 3. Update Patient

PUT /patients/{id}
- Permissions: patient:update
- Body:
  - Field-field yang ingin di-update dari:
    - ihs_number, medical_record_number, patient_name, gender, birth_date,
      address, phone, email, nationality, ethnicity, religion,
      marital_status, occupation, education_level,
      emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
      insurance_provider, insurance_policy_number, insurance_member_id
- Hanya field yang dikirim yang akan di-update.
- Audit:
  - Setiap field yang berubah dicatat di patient_audit_log.
- Response 200:
  - `{"status":"success","message":"Patient updated successfully","patient":{...}}`

### 4. Delete Patient (Soft Delete)

DELETE /patients/{id}
- Permissions: patient:delete
- Efek:
  - Set `deleted_at = NOW()`, `active = false`
- Audit dicatat.
- Response 200 jika sukses, 404 jika tidak ada.

### 5. List Patients (with Filters & Pagination)

GET /patients
- Permissions: patient:search
- Query (opsional):
  - patient_national_id (like, ILIKE)
  - medical_record_number (like, ILIKE)
  - patient_name (ILIKE)
  - ihs_number (ILIKE)
  - page (default 1)
  - page_size (default 25, max 100)
- Hanya data `deleted_at IS NULL`.
- Response 200:
  - patients: list
  - count: jumlah di halaman
  - page, page_size, total

### 6. Simple Search (Legacy)

GET /patients/search
- Permissions: patient:search
- Query:
  - patient_national_id, medical_record_number, patient_name, ihs_number
- Limit: 50
- Dipertahankan untuk kompatibilitas; gunakan /patients untuk fitur lebih lengkap.

---

## API: Doctors

### 1. Create Doctor

POST /doctors
- Permissions: doctor:create
- Body (minimal):
  - name (required)
- Opsional:
  - ihs_number (unik jika diisi)
  - national_id (unik)
  - license (unik)
  - specialty, phone, email, birth_date, gender ("M"/"F")
- Cek duplikat berdasarkan ihs_number / national_id / license bila ada.
- Response 201:
  - `{"status":"success","message":"Doctor created successfully","doctor_id":"..."}`

### 2. Get Doctor Detail

GET /doctors/{id_or_identifier}
- Permissions: doctor:read
- identifier:
  - Dicari sebagai: national_id OR ihs_number OR license
  - Jika tidak ketemu, dicoba sebagai UUID id
- Hanya `deleted_at IS NULL`.
- Response 200:
  - doctor: data dokter +:
    - qualifications: list dari doctor_qualifications
    - schedules: list dari doctor_schedules
- 404 jika tidak ditemukan.

### 3. Update Doctor

PUT /doctors/{id}
- Permissions: doctor:update
- Body:
  - Field yg bisa di-update:
    - ihs_number (empty string -> diset NULL)
    - national_id, name, license, specialty,
      phone, email, birth_date, gender, active
- Audit:
  - Per field dicatat di doctor_audit_log.
- Response 200:
  - `{"status":"success","message":"Doctor updated successfully","doctor":{...}}`

### 4. Delete Doctor (Soft Delete)

DELETE /doctors/{id}
- Permissions: doctor:delete
- Efek:
  - `deleted_at = NOW()`, `active = false`
- Audit dicatat.
- Response 200 atau 404.

### 5. Search/List Doctors

GET /doctors
- Permissions: doctor:search
- Query (opsional):
  - ihs_number
  - national_id
  - name (ILIKE)
  - license
  - specialty (ILIKE)
  - active (default "true"; jika active=false, tidak dipaksa filter)
- Hanya `deleted_at IS NULL`.
- Limit: 100, order by name ASC.
- Response 200:
  - doctors: list
  - count

GET /doctors/all
- Permissions: doctor:search
- Alias ke `search_doctors` tanpa filter tambahan.
- Secara default memastikan hanya active=true jika tidak ada parameter active.

---

## API: Doctor Qualifications

Semua route qualifications memerlukan JWT dan biasanya permission doctor:update (kecuali list yang read_doctor).

### 1. List Qualifications

GET /doctors/{doctor_id}/qualifications
- Permissions: doctor:read
- Pastikan doctor ada dan tidak deleted.
- Response:
  - qualifications: list
  - count

### 2. Add Qualification

POST /doctors/{doctor_id}/qualifications
- Permissions: doctor:update
- Body:
  - qualification_type (required)
  - qualification_code, institution, year_obtained, expiry_date, issuer, notes (opsional)
- Response 201:
  - qualification_id
- Audit: ADD_QUALIFICATION

### 3. Update Qualification

PUT /doctors/{doctor_id}/qualifications/{qualification_id}
- Permissions: doctor:update
- Body:
  - Salah satu dari: qualification_type, qualification_code, institution,
    year_obtained, expiry_date, issuer, notes
- Response 200:
  - qualification (updated)
- Audit: UPDATE_QUALIFICATION per field.

### 4. Delete Qualification

DELETE /doctors/{doctor_id}/qualifications/{qualification_id}
- Permissions: doctor:update
- Response 200 jika sukses, 404 jika tidak.
- Audit: DELETE_QUALIFICATION

---

## API: Settings

Settings digunakan untuk konfigurasi global (JSON-based).

Semua endpoint settings:
- Require JWT dengan setting:read atau setting:write.

### 1. List Settings

GET /settings
- Permissions: setting:read
- Response:
  - settings: list (id, key, value, description, created_at, updated_at)
  - count

### 2. Create Setting

POST /settings
- Permissions: setting:write
- Body:
  - key (string, required, unik)
  - value (any JSON serializable, required)
  - description (string, optional)
- Disimpan sebagai JSONB di kolom value.
- Response 201 atau 409 jika key sudah ada.

### 3. Get Setting by Key

GET /settings/{key}
- Permissions: setting:read
- Response 200:
  - setting
- 404 jika tidak ada.

### 4. Update Setting

PUT /settings/{key}
- Permissions: setting:write
- Body:
  - value (required)
  - description (optional)
- Response 200 atau 404.

### 5. Delete Setting

DELETE /settings/{key}
- Permissions: setting:write
- Response 200 atau 404.

---

## Audit Logging

- Pasien:
  - `log_audit` mencatat:
    - patient_id, action (CREATE/UPDATE/DELETE), field_name, old_value, new_value,
      user_id/username, ip_address, user_agent, created_at.
- Dokter:
  - `log_doctor_audit` mencatat:
    - doctor_id, action (CREATE/UPDATE/DELETE_QUALIFICATION/...), field_name, old_value, new_value,
      user info dan metadata.

Audit ini dapat di-query langsung dari DB untuk kebutuhan compliance.

---

## Catatan Integrasi

- Service ini dirancang untuk diakses melalui API Gateway:
  - Pastikan gateway meneruskan header Authorization.
- Disarankan untuk:
  - Menggunakan JWT yang dikeluarkan oleh auth-service internal.
  - Melimit permission sesuai role (admin, registrasi, radiologi, dsb).
- Semua operasi delete pada patients dan doctors adalah soft delete
  untuk menjaga jejak rekam medis.
## SATUSEHAT Test Patients (Read-Only Seed Data)

Untuk mendukung integrasi dan testing resmi SATUSEHAT, Master Data Service menyediakan mekanisme seed pasien khusus yang bersifat read-only.

1) File patients.json

Lokasi:
- master-data-service/patients.json

Isi:
- Objek `_meta`:
  - Menandai bahwa dataset ini:
    - Protected
    - Digunakan untuk SATUSEHAT integration testing
    - Tidak boleh diubah secara manual
- Beberapa entri pasien contoh dengan field:
  - `id` (UUID v4)
  - `patient_national_id` (NIK)
  - `ihs_number`
  - `medical_record_number`
  - `name`
  - `birth_date`
  - `gender` (M/F)
  - `phone`

2) Script import_patients.py

Lokasi:
- master-data-service/import_patients.py

Fungsi:
- Membaca patients.json.
- Mengabaikan entri `_meta`.
- Memasukkan pasien ke tabel `patients` jika belum ada (idempotent).
- Mengisi:
  - `id`
  - `patient_national_id`
  - `ihs_number`
  - `medical_record_number`
  - `patient_name` (dari `name`)
  - `gender` (dikoversi ke `male` / `female`)
  - `birth_date`
  - `phone`
  - `active = TRUE`

Cara menjalankan (Docker):

- Pastikan service `master-data-service` berjalan dengan volume yang mengarah ke direktori ini.
- Jalankan:

  - `docker exec -it master-data-service python /app/import_patients.py`

(Sesuaikan nama container jika berbeda.)

3) Proteksi Read-Only (PROTECTED_PATIENT_IDS)

Implementasi:
- Di `master-data-service/app.py` didefinisikan:

  - `PROTECTED_PATIENT_IDS = { ... }`

  berisi daftar UUID pasien SATUSEHAT test dari patients.json.

- Endpoint berikut telah diproteksi:
  - `PUT /patients/{id}`
  - `DELETE /patients/{id}`

- Jika `{id}` termasuk dalam `PROTECTED_PATIENT_IDS`:
  - Update akan ditolak dengan:
    - HTTP 403 + pesan:
      - "This patient record is protected and cannot be modified"
  - Delete akan ditolak dengan:
    - HTTP 403 + pesan:
      - "This patient record is protected and cannot be deleted"

- Endpoint GET dan search:
  - Tetap dapat mengembalikan data pasien tersebut (hanya read-only).

Tujuan:
- Menjamin bahwa data resmi SATUSEHAT untuk pengujian/integrasi tidak berubah atau terhapus oleh operasi aplikasi sehari-hari.
