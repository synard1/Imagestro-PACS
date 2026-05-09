# Master Data Service RBAC Documentation
File: master-data-service/app.py  
Version: 1.0.0

Master Data Service mengelola:
- Data pasien (patients + relasi klinis)
- Data dokter/practitioner (doctors + qualifications + schedules)
- Global settings (konfigurasi aplikasi)

Service ini TIDAK mengelola user/role/permission sendiri.
Semua keputusan akses didasarkan pada JWT yang diterbitkan oleh Authentication Service.

---

## 1. Mekanisme Autentikasi & Autorisasi

### 1.1. JWT

- `JWT_SECRET` dan `JWT_ALGORITHM` harus konsisten dengan Auth Service.
- Token diambil dari header:
  - `Authorization: Bearer <token>`

### 1.2. verify_token(token)

- Decode JWT.
- Jika gagal atau expired → `None`.
- Jika sukses → payload yang memuat minimal:
  - `user_id`
  - `username`
  - `permissions` (list)

### 1.3. require_auth(required_permissions=[]) (Decorator)

Alur:

1. Ambil header Authorization.
2. Validasi JWT via `verify_token`.
3. Jika invalid → 401.
4. Jika `required_permissions` tidak kosong:
   - Ambil `permissions` dari payload.
   - Panggil `check_permission(user_permissions, required_permissions)`.
   - Jika tidak memenuhi → 403.
5. Set `request.current_user` dengan payload user.
6. Eksekusi handler.

### 1.4. check_permission(user_permissions, required_permissions)

Mendukung:

- `*` (global wildcard)
- `resource:*` (category wildcard, misal `patient:*`)
- Exact match (misal `patient:read`)

Logika:
- Jika user memiliki `*` → selalu diizinkan.
- Jika salah satu `required_permissions` cocok langsung → diizinkan.
- Jika `required_permission` berupa `resource:action`
  dan user punya `resource:*` → diizinkan.
- Jika tidak ada yang match → ditolak.

---

## 2. Pemetaan Permission ke Fitur

Konstanta: `REQUIRED_PERMISSIONS`

- Patient:
  - `read_patient` → `['patient:read', '*']`
  - `create_patient` → `['patient:create', '*']`
  - `update_patient` → `['patient:update', '*']`
  - `delete_patient` → `['patient:delete', '*']`
  - `search_patient` → `['patient:search', '*']`

- Doctor:
  - `read_doctor` → `['doctor:read', 'practitioner:read', '*']`
  - `create_doctor` → `['doctor:create', 'practitioner:create', '*']`
  - `update_doctor` → `['doctor:update', 'practitioner:update', '*']`
  - `delete_doctor` → `['doctor:delete', 'practitioner:delete', '*']`
  - `search_doctor` → `['doctor:search', 'practitioner:search', '*']`

- Settings:
  - `read_setting` → `['setting:read', '*']`
  - `write_setting` → `['setting:write', '*']`

Semua endpoint di bawah menggunakan kombinasi `@require_auth(REQUIRED_PERMISSIONS[...])`.

---

## 3. Patient Endpoints & Permissions

### 3.1. Create

- `POST /patients`
- Requires: `patient:create`
- Validasi field mandatory:
  - `medical_record_number`, `patient_name`, `gender`, `birth_date`
- Cek duplikasi MRN / NIK.
- Insert patient + audit log.

### 3.2. Read (Detail)

- `GET /patients/{patient_id_or_nik}`
- Requires: `patient:read`
- Mendukung:
  - ID (UUID),
  - NIK,
  - MRN.
- Mengembalikan:
  - data pasien,
  - allergies, medical_history, family_history, medications.

### 3.3. Update

- `PUT /patients/{patient_id}`
- Requires: `patient:update`
- Tidak boleh mengubah:
  - Rekam pasien yang ID-nya ada di `PROTECTED_PATIENT_IDS` (SATUSEHAT test patients).
- Dynamic update fields + audit log per field.

### 3.4. Delete (Soft Delete)

- `DELETE /patients/{patient_id}`
- Requires: `patient:delete`
- Soft delete (set `deleted_at`, `active=false`).
- Dilarang untuk `PROTECTED_PATIENT_IDS`.

### 3.5. List & Search

- `GET /patients`
  - Requires: `patient:search`
  - Filter:
    - `patient_national_id`, `medical_record_number`, `patient_name`, `ihs_number`
  - Paging dengan `page`, `page_size`.
- `GET /patients/search`
  - Requires: `patient:search`
  - Legacy endpoint (limit 50).

---

## 4. Doctor/Practitioner Endpoints & Permissions

### 4.1. Create

- `POST /doctors`
- Requires: `doctor:create` atau `practitioner:create`
- Cek unik:
  - `ihs_number`, `national_id`, `license`
- Insert doctor + audit log.

### 4.2. Read (Detail)

- `GET /doctors/{doctor_id_or_identifier}`
- Requires: `doctor:read` atau `practitioner:read`
- Mendukung pencarian:
  - `national_id`, `ihs_number`, `license`, atau `id (UUID)`
- Return:
  - data dokter,
  - qualifications,
  - schedules.

### 4.3. Update

- `PUT /doctors/{doctor_id}`
- Requires: `doctor:update` atau `practitioner:update`
- Dynamic update + audit log.

### 4.4. Delete (Soft Delete)

- `DELETE /doctors/{doctor_id}`
- Requires: `doctor:delete` atau `practitioner:delete`
- Soft delete (set `deleted_at`, `active=false`) + audit log.

### 4.5. List & Search

- `GET /doctors`
  - Requires: `doctor:search` atau `practitioner:search`
  - List dengan filter (ihs_number, national_id, name, license, specialty, active).
- `GET /doctors/all`
  - Requires: `doctor:search` atau `practitioner:search`
  - Alias untuk list aktif.
- `GET /doctors/search`
  - Requires: `doctor:search` atau `practitioner:search`
  - Maks 100 data.

### 4.6. Qualifications

- `GET /doctors/{doctor_id}/qualifications`
  - Requires: `doctor:read` atau `practitioner:read`
- `POST /doctors/{doctor_id}/qualifications`
  - Requires: `doctor:update` atau `practitioner:update`
- `PUT /doctors/{doctor_id}/qualifications/{qualification_id}`
  - Requires: `doctor:update` atau `practitioner:update`
- `DELETE /doctors/{doctor_id}/qualifications/{qualification_id}`
  - Requires: `doctor:update` atau `practitioner:update`

---

## 5. Settings Endpoints & Permissions

### 5.1. Konsep is_dev_user(user)

Fungsi: `is_dev_user(user)`

User dianggap high-priv di konteks settings jika:
- Memiliki `"*"` di permissions, ATAU
- Memiliki `"setting:dev"`, ATAU
- Memiliki `"rbac:manage"`.

Ini selaras dengan kebijakan di Auth Service / Gateway
untuk membedakan admin biasa vs superadmin/developer.

### 5.2. List Settings

- `GET /settings`
- Requires: `setting:read`
- Perilaku:
  - Jika `is_dev_user(user)`:
    - mengembalikan semua settings (termasuk `is_sensitive = TRUE`).
  - Jika bukan:
    - hanya mengembalikan settings dengan `is_sensitive = FALSE`.

### 5.3. Create Setting

- `POST /settings`
- Requires: `setting:write`
- Body:
  - `key`, `value`, opsional `description`, `is_sensitive`.
- Aturan:
  - `is_sensitive = TRUE` hanya boleh jika `is_dev_user(user)`.
  - Jika admin biasa coba membuat sensitive setting → 403.

### 5.4. Get Setting by Key

- `GET /settings/{key}`
- Requires: `setting:read`
- Jika `is_sensitive = TRUE` dan user bukan `is_dev_user`:
  - 403 (tidak boleh akses nilai setting sensitif).

### 5.5. Update Setting

- `PUT /settings/{key}`
- Requires: `setting:write`
- Aturan:
  - Jika setting existing `is_sensitive = TRUE`:
    - hanya `is_dev_user(user)` boleh update.
  - Perubahan flag `is_sensitive` (false→true atau true→false):
    - hanya boleh oleh `is_dev_user(user)`.
  - Admin biasa hanya boleh update setting non-sensitif.

### 5.6. Delete Setting

- `DELETE /settings/{key}`
- Requires: `setting:write`
- Jika `is_sensitive = TRUE`:
  - hanya `is_dev_user(user)` yang boleh delete.

---

## 6. Peran Superadmin/Developer vs Admin di Master Data Service

Master Data Service hanya membaca klaim `permissions` dari JWT, definisi role dan hak ada di Auth Service.

### Superadmin / Developer (via JWT)

Ciri:
- Memiliki `*`, atau `setting:dev`, atau `rbac:manage` pada permissions.

Hak efektif:
- Akses penuh ke pasien dan dokter (karena punya wildcard).
- Akses penuh ke semua settings:
  - baca/ubah/hapus settings sensitif.

### Admin (misal role ADMIN dari Auth Service)

- Dengan:
  - `patient:*`, `doctor:*`, `setting:read`, `setting:write`, dll.
- Hak:
  - Kelola pasien dan dokter sesuai izin granular.
  - Kelola settings non-sensitif.
- Batasan:
  - Tidak bisa melihat/mengelola settings sensitif (butuh `setting:dev`/high-priv).
  - Tidak ada kemampuan memodifikasi definisi user/role/permission (itu hanya di Auth Service).

---

## 7. Ringkasan

- Master Data Service:
  - Tidak menyimpan definisi RBAC; hanya menegakkan permission dari JWT.
  - `*` dan wildcard kategori (`patient:*`, `doctor:*`) bekerja penuh.
  - Perbedaan superadmin/developer vs admin hanya muncul dalam konteks:
    - akses settings sensitif,
    - luasnya cakupan permissions yang diberi oleh Auth Service.
- Untuk pengelolaan users, roles, permissions:
  - gunakan endpoint Auth Service melalui API Gateway sesuai dokumen terkait.
