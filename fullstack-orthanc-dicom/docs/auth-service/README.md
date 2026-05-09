# Auth Service

Authentication & Authorization service with:
- JWT-based auth
- Database-backed RBAC (roles, permissions, mappings)
- Strong separation between high-privilege and normal admins
- Audit logging and security hardening

Dokumentasi ini sudah disesuaikan 1:1 dengan implementasi terbaru di `auth_service.py`.

---

## Fitur Utama

1. JWT Authentication
2. Multi-level RBAC:
   - Role & permission disimpan di database
   - User bisa punya banyak role + direct permissions
3. High-Privilege Separation:
   - SUPERADMIN / DEVELOPER / rbac:manage
   - ADMIN_SECURITY (rbac:custom-manage)
   - ADMIN dan peran operasional lain (DOCTOR, TECHNICIAN, dll)
4. Perlindungan terhadap privilege escalation:
   - Admin biasa tidak bisa membuat / memberi hak SUPERADMIN/DEVELOPER/*
   - Admin custom hanya bisa kelola role/permission "custom", non-reserved
5. Audit Logging:
   - login, register, perubahan penting
6. Rate Limiting & Security:
   - Pembatasan request login/register/verify
   - Account lockout
7. Koneksi Database yang robust:
   - Retry saat startup
   - Health check dengan pengecekan DB

---

## Arsitektur RBAC

Struktur data inti (lihat `auth_service.py` -> `init_database`):

- `roles`:
  - Menyimpan definisi role
- `permissions`:
  - Menyimpan definisi permission
- `role_permissions`:
  - Mapping many-to-many role → permission
- `user_roles`:
  - Mapping many-to-many user → role
- `user_permissions`:
  - Direct permission untuk user

Permission efektif user = gabungan:
- semua permission dari roles aktif user
- semua direct permission user
- dengan dukungan:
  - wildcard global `*`
  - wildcard kategori, misal `patient:*`

---

## Roles Bawaan

Didefinisikan di konstanta `ROLES` dan di-inject saat startup.

1) SUPERADMIN

- Permissions:
  - `['*']` → semua permissions tanpa batas.
- Tujuan:
  - Root platform. Bisa melakukan SEMUA operasi:
    - manage semua roles & permissions,
    - memberi/mencabut peran high-privilege,
    - clear cache,
    - kelola setting sensitif, dll.

2) DEVELOPER

- Permissions:
  - `rbac:manage`
  - `rbac:view`
  - `setting:dev`
  - `system:logs`
  - `system:config`
- Tujuan:
  - Engineer / devops dengan akses penuh ke konfigurasi RBAC dan setting sensitif,
    tanpa harus memakai wildcard `*` jika tidak diperlukan.

3) ADMIN_SECURITY (opsional untuk dipakai di operasional)

- Permissions:
  - `rbac:custom-manage`
  - `rbac:view`
- Tujuan:
  - Admin keamanan untuk mengelola ROLE & PERMISSION "custom"
    TANPA bisa menyentuh lapisan SUPERADMIN/DEVELOPER.
- Boleh:
  - Membuat role custom non-reserved.
  - Mengelola mapping role-permission custom.
  - Meng-assign role/permission custom ke user.
- Tidak boleh:
  - Membuat/mengubah/menghapus:
    - `SUPERADMIN`, `DEVELOPER`, `ADMIN_SECURITY`
  - Membuat/meng-assign permission:
    - `*`, `rbac:manage`, `rbac:view`, `rbac:custom-manage`, `setting:dev`.

4) ADMIN

- Permissions (ringkasan):
  - Manajemen user (user:*)
  - Manajemen operasional: patient:*, order:*, worklist:*, dll
  - setting:read, setting:write (non-sensitif)
- Tujuan:
  - Admin operasional sistem.
- Tidak bisa:
  - Akses endpoint structural RBAC.
  - Membuat/cabut SUPERADMIN/DEVELOPER/ADMIN_SECURITY.
  - Menyentuh setting sangat sensitif.

5) Roles lain (DOCTOR, TECHNICIAN, RECEPTIONIST, VIEWER)

- Sudah didefinisikan dengan permission sesuai peran klinis/operasional.
- Tidak punya hak ke RBAC core.

---

## Konsep High-Priv dan Custom-Manage

Fungsi kunci di `auth_service.py`:

1) `is_high_priv_user(user)`

High-privilege jika:
- Memiliki permission `*`, atau
- Memiliki permission `rbac:manage`, atau
- Role utamanya / salah satu rolenya adalah `SUPERADMIN` atau `DEVELOPER`.

High-priv boleh:
- Full manage RBAC (roles, permissions, mapping).
- Clear / lihat cache RBAC.
- Kelola setting sensitif.

2) `can_custom_manage(user)`

Custom RBAC manager jika:
- `is_high_priv_user(user)` → otomatis ya, ATAU
- Memiliki permission `rbac:custom-manage`.

Custom-manage boleh melakukan operasi RBAC dengan batasan:
- Hanya untuk role NON-reserved,
- Hanya untuk permission NON-reserved.

3) Reserved constants

- `RESERVED_ROLE_NAMES = {"SUPERADMIN", "DEVELOPER"}`
- `EXTENDED_RESERVED_ROLE_NAMES = {"SUPERADMIN", "DEVELOPER", "ADMIN_SECURITY"}`
- `RESERVED_PERMISSIONS = {"*", "rbac:manage", "rbac:view", "rbac:custom-manage", "setting:dev"}`

Semua operasi yang dilakukan oleh user dengan `rbac:custom-manage`
tetap dicek terhadap daftar ini untuk mencegah privilege escalation.

---

## Perilaku Endpoint Penting (1:1 dengan Kode)

Berikut ringkasan endpoint terkait RBAC sesuai implementasi terbaru.

### 1. Role Management

- `GET /auth/roles`
  - Hanya: HIGH-PRIV (via `require_high_priv`).
  - Menampilkan semua roles.

- `POST /auth/roles`
  - Auth di dalam fungsi:
    - HIGH-PRIV:
      - Boleh membuat role apa pun.
    - can_custom_manage:
      - Boleh membuat role SELAMA nama bukan reserved
        (`SUPERADMIN`, `DEVELOPER`, `ADMIN_SECURITY`).
    - Lainnya:
      - 403.

- `PUT /auth/roles/<role_id>`
  - HIGH-PRIV:
    - Boleh update role apa pun.
  - can_custom_manage:
    - Boleh update role NON-reserved.
    - Tidak boleh rename menjadi nama reserved.
  - Lainnya:
    - 403.

- `DELETE /auth/roles/<role_id>`
  - Hanya: HIGH-PRIV.
  - Menghapus role (custom / non-custom).

### 2. Permission Management

Semua endpoint di sini HANYA untuk HIGH-PRIV:

- `GET /auth/permissions`
- `GET /auth/permissions/<permission_id>`
- `POST /auth/permissions`
- `PUT /auth/permissions/<permission_id>`
- `DELETE /auth/permissions/<permission_id>`

Admin biasa dan ADMIN_SECURITY tidak bisa:
- Membuat permission `*` atau permission high-priv lainnya,
- Melihat atau mengubah definisi permission sensitif dari sisi service.

(Front-end atau API Gateway dapat menambahkan filtering tambahan untuk display.)

### 3. Role-Permission Mapping

- `POST /auth/roles/<role_id>/permissions`
  - HIGH-PRIV:
    - Boleh assign permission apa pun ke role apa pun.
  - can_custom_manage:
    - Hanya boleh:
      - role NON-reserved,
      - permission NON-reserved.
  - Lainnya: 403.

- `DELETE /auth/roles/<role_id>/permissions/<permission_id>`
  - HIGH-PRIV:
    - Boleh remove mapping apa pun.
  - can_custom_manage:
    - Hanya mapping antara role NON-reserved dan permission NON-reserved.
  - Lainnya: 403.

### 4. User-Role Mapping

- `POST /auth/users/<user_id>/roles`
  - Decorator: `require_permission(['user:manage', '*'])`
  - Tambahan di body:
    - HIGH-PRIV:
      - Boleh assign role apa pun ke user.
    - can_custom_manage:
      - Hanya boleh assign role NON-reserved
        (tidak boleh SUPERADMIN/DEVELOPER/ADMIN_SECURITY).
    - Lainnya:
      - 403.

- `DELETE /auth/users/<user_id>/roles/<role_id>`
  - Sama pola:
    - HIGH-PRIV: boleh hapus apa pun.
    - can_custom_manage: hanya role NON-reserved.
    - Lainnya: 403.

### 5. User-Permission Mapping (direct)

- `POST /auth/users/<user_id>/permissions`
  - `require_permission(['user:manage', '*'])` + pengecekan tambahan:
    - HIGH-PRIV:
      - Boleh assign permission apa pun.
    - can_custom_manage:
      - Hanya permission NON-reserved.
    - Lainnya: 403.

- `DELETE /auth/users/<user_id>/permissions/<permission_id>`
  - Sama:
    - HIGH-PRIV:
      - Boleh hapus permission apa pun.
    - can_custom_manage:
      - Hanya permission NON-reserved.
    - Lainnya: 403.

### 6. Cache Management

- `POST /auth/cache/clear`
- `GET /auth/cache/stats`

Hanya:
- HIGH-PRIV (`require_high_priv`).

---

## Contoh Implementasi

Berikut beberapa skenario praktis.

### A. Setup SUPERADMIN dan ADMIN_SECURITY

1) SUPERADMIN default

- Dibuat otomatis jika belum ada:
  - username: `superadmin`
  - password: dari `SUPERADMIN_PASSWORD` atau default `SuperAdmin@12345`
- Memiliki `*` → high-priv penuh.

2) Buat user dengan role ADMIN_SECURITY

Langkah (via SUPERADMIN):

- Login sebagai SUPERADMIN → dapat JWT.
- Panggil:

```bash
# 1. Buat user baru
curl -X POST http://auth-service:5000/auth/users \
  -H "Authorization: Bearer <SUPERADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "rbac-admin",
    "email": "rbac-admin@hospital.local",
    "password": "Str0ngPass!",
    "full_name": "RBAC Security Admin",
    "role": "ADMIN_SECURITY",
    "is_active": true
  }'
```

User `rbac-admin` sekarang memiliki:
- `rbac:custom-manage`
- `rbac:view`
- Bisa mengelola RBAC custom (lihat di bawah).

### B. Admin Security membuat role custom

Login sebagai `rbac-admin`, dapat token `RBAC_ADMIN_TOKEN`.

1) Buat role custom

```bash
curl -X POST http://auth-service:5000/auth/roles \
  -H "Authorization: Bearer <RBAC_ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "REPORTING_MANAGER",
    "description": "Can manage reporting features"
  }'
```

- Diterima:
  - Karena `REPORTING_MANAGER` bukan reserved.

2) (Opsional, via SUPERADMIN) buat permission custom `report:*` jika belum didefinisikan.

Permission high-level (definisinya) hanya bisa dibuat oleh HIGH-PRIV.
Setelah permission `report:view` / `report:manage` ada di DB, `rbac-admin` dapat menggunakannya jika tidak masuk RESERVED_PERMISSIONS.

3) Assign permission custom ke role custom

Misal sudah ada permission dengan id `perm-report-view` (bukan reserved):

```bash
curl -X POST http://auth-service:5000/auth/roles/<role_id_REPORTING_MANAGER>/permissions \
  -H "Authorization: Bearer <RBAC_ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{ "permission_id": "<perm-report-view>" }'
```

- Diizinkan:
  - Role non-reserved,
  - Permission non-reserved,
  - User punya `rbac:custom-manage`.

4) Assign role custom ke user biasa

```bash
curl -X POST http://auth-service:5000/auth/users/<some_user_id>/roles \
  -H "Authorization: Bearer <RBAC_ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{ "role_id": "<role_id_REPORTING_MANAGER>" }'
```

- Diizinkan:
  - Role non-reserved.
- Jika mencoba assign `SUPERADMIN` atau `DEVELOPER`:
  - Akan mendapat 403.

### C. Proteksi privilege escalation

Contoh yang sekarang DITOLAK oleh service:

- Admin/ADMIN_SECURITY mencoba:
  - Membuat role bernama `SUPERADMIN` → 403.
  - Assign role SUPERADMIN/DEVELOPER/ADMIN_SECURITY ke user lain → 403.
  - Memberikan permission `*` atau `rbac:manage` ke user lain → 403.
  - Menghapus/ubah mapping permission high-priv dari SUPERADMIN → 403 (untuk non-high-priv).

Semua ini dicek di server-side (bukan hanya UI), sehingga aman walaupun ada klien berbahaya.

---

## Environment Variables (Ringkas)

Utama:
- `POSTGRES_HOST`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `JWT_EXPIRATION_HOURS`
- `REFRESH_TOKEN_DAYS`
- `ADMIN_PASSWORD` (untuk admin default)
- `SUPERADMIN_PASSWORD` (untuk superadmin default)

Rate-limit & lainnya:
- `AUTH_RATE_LIMIT_LOGIN`
- `AUTH_RATE_LIMIT_REGISTER`
- `AUTH_RATE_LIMIT_VERIFY`
- `AUTH_GLOBAL_LIMITS`
- `AUTH_LIMITER_STORAGE_URI`

---

## Cara Menjalankan & Testing Singkat

```bash
# Build dan jalankan hanya auth-service
docker compose build auth-service
docker compose up auth-service

# Health check
curl http://localhost:5000/health

# Login superadmin (default)
curl -X POST http://localhost:5000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"superadmin","password":"SuperAdmin@12345"}'
```

Gunakan token SUPERADMIN untuk:
- Inisialisasi role/permission custom,
- Menetapkan ADMIN_SECURITY, dsb.

Dokumentasi ini mencerminkan implementasi saat ini di `auth_service.py`.
Jika kamu ingin menambah role/permission baru, pastikan mengikuti pola:
- Reserved untuk high-priv,
- Custom untuk admin keamanan, dengan guard yang sudah tersedia.
