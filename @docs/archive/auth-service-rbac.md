# Authentication Service RBAC Documentation

## Frontend Integration Notes

- The UI consumes user, role, and permission endpoints via the API Gateway (`/auth/*`).
- After login, the UI stores access and refresh tokens; the access token includes effective permissions used for client-side gating.
- The user management UI (`src/pages/UserManagement.jsx`) now fetches from backend through `src/services/userService.js` which targets gateway `/auth/*` endpoints.
- Ensure tokens contain correct permissions; UI uses them to control visibility (e.g., `user:manage`, `user:read`, or `*`).
File: auth-service/auth_service.py  
Version: 2.0 – Central RBAC Authority

Authentication Service adalah sumber kebenaran (Source of Truth) untuk:
- Users
- Roles
- Permissions
- Mapping:
  - user_roles
  - role_permissions
  - user_permissions

Semua service lain (API Gateway, Master Data, dsb.) hanya membaca klaim JWT yang dihasilkan di sini.

---

## 1. Struktur Data RBAC

Tabel inti:

- `users`
  - Informasi akun, status, keamanan login.
- `roles`
  - Definisi role (nama, deskripsi, is_active).
- `permissions`
  - Definisi permission:
    - `name` (unik)
    - `description`
    - `category`
    - `is_active`
- `user_roles`
  - N:M users ↔ roles.
- `role_permissions`
  - N:M roles ↔ permissions.
- `user_permissions`
  - Additional direct permissions per user.
- `refresh_tokens`
  - Manajemen refresh token.
- `auth_audit_log`
  - Audit login/aksi penting.

Inisialisasi awal:
- `_initialize_roles_and_permissions` membuat default roles & permissions.
- `init_database` juga membuat:
  - default `admin` (role ADMIN)
  - default `superadmin` (role SUPERADMIN)

---

## 2. Default Roles

Ringkasan utama (lihat kode untuk lengkap):

- `SUPERADMIN`
  - permissions: `['*']`
  - Root / platform owner.
- `DEVELOPER`
  - permissions:
    - `rbac:manage`, `rbac:view`
    - `setting:dev`
    - `system:logs`, `system:config`
- `ADMIN_SECURITY`
  - permissions:
    - `rbac:custom-manage`
    - `rbac:view`
  - Fokus pada custom RBAC non-reserved.
- `ADMIN`
  - permissions termasuk:
    - `user:read/create/update/delete/manage`
    - `patient:*`, `order:*`, `worklist:*`, `dicom:*`, dll.
    - `setting:read`, `setting:write`
  - Tidak memiliki `*` dan tidak memiliki `setting:dev`.
- `DOCTOR`, `TECHNICIAN`, `RECEPTIONIST`, `VIEWER`
  - Sesuai peran klinis/operasional.

---

## 3. Reserved Roles dan Permissions

Digunakan untuk membatasi apa yang boleh disentuh admin biasa.

- `RESERVED_ROLE_NAMES`:
  - `{"SUPERADMIN", "DEVELOPER"}`
- `EXTENDED_RESERVED_ROLE_NAMES`:
  - `{"SUPERADMIN", "DEVELOPER", "ADMIN_SECURITY"}`
- `HIGH_PRIV_ROLES`:
  - `{"SUPERADMIN", "DEVELOPER", "ADMIN_SECURITY"}`

- `RESERVED_PERMISSIONS`:
  - `"*"`
  - `"rbac:manage"`
  - `"rbac:view"`
  - `"rbac:custom-manage"`
  - `"setting:dev"`

Reserved items hanya boleh dibuat/dimodifikasi/dihapus oleh high-priv user.

---

## 4. Kategori User: High-Priv dan Custom RBAC Manager

### 4.1. High-Priv User – `is_high_priv_user(user)`

User dianggap high-privilege jika:

- Memiliki `"*"` dalam `permissions`, ATAU
- Memiliki `"rbac:manage"` dalam `permissions`, ATAU
- Memiliki role `"SUPERADMIN"` atau `"DEVELOPER"`.

Dipakai untuk:
- operasi sangat sensitif RBAC,
- mengelola reserved roles/permissions,
- cache control.

### 4.2. Custom RBAC Manager – `can_custom_manage(user)`

True jika:
- `is_high_priv_user(user)` OR memiliki `rbac:custom-manage`.

Hak:
- Boleh mengelola roles/permissions NON-reserved.
- Tidak boleh menyentuh:
  - SUPERADMIN / DEVELOPER / ADMIN_SECURITY
  - `"*"` atau permission reserved lainnya.

---

## 5. JWT & Permissions

### 5.1. generate_tokens(user_id, username, role)

- Mengambil permissions efektif via `get_user_permissions(user_id)`:
  - dari roles,
  - dari direct permissions.
- Mengisi payload JWT:
  - `user_id`
  - `username`
  - `role` (legacy)
  - `permissions` (list string)
  - `exp`, `iat`, `type='access'`

### 5.2. get_current_user_from_token()

- Baca Authorization Bearer.
- Decode JWT.
- Ambil user dari DB jika `is_active = TRUE`.
- Ambil permissions dari DB (fresh).
- Set `request.current_user`.

Semua keputusan RBAC endpoint di service ini menggunakan data aktual DB, bukan hanya isi token.

---

## 6. Dekorator Keamanan

- `@require_auth`
  - Pastikan user login.
- `@require_permission([...])`
  - Pastikan user memiliki salah satu permission yang diminta
    (dengan dukungan:
    `*`, `category:*`, exact).
- `@require_high_priv`
  - Hanya untuk SUPERADMIN/DEVELOPER/`rbac:manage`/`*`.
  - Digunakan untuk endpoint RBAC paling sensitif.

---

## 7. API Users

### 7.1. Login & Identity

- `POST /auth/login`
  - Mengembalikan:
    - access_token (dengan permissions),
    - refresh_token.
- `POST /auth/verify`
  - Verifikasi token.
- `GET /auth/me`
  - `@require_auth`
  - Info user saat ini.

### 7.2. Manajemen User

- `GET /auth/users`
  - `@require_permission(['user:read', 'user:manage', '*'])`
  - High-priv:
    - melihat semua user (termasuk high-priv).
  - Non high-priv:
    - hasil otomatis mengecualikan user dengan role dalam `HIGH_PRIV_ROLES`.
- `POST /auth/users`
  - `@require_permission(['user:create', 'user:manage', '*'])`
- `GET /auth/users/{user_id}`
  - `@require_auth`
  - User hanya boleh melihat dirinya sendiri, kecuali punya `user:read`/`user:manage`/`*`.
- `PUT /auth/users/{user_id}`
  - `@require_auth`
  - User hanya boleh update dirinya sendiri.
  - Perubahan `role`/`is_active` butuh `user:manage`/`*`.
- `DELETE /auth/users/{user_id}`
  - `@require_permission(['user:delete', 'user:manage', '*'])`
  - Soft delete + revoke refresh token.
  - Tidak boleh delete dirinya sendiri.
- `POST /auth/users/{user_id}/change-password`
  - `@require_auth`
  - User sendiri:
    - butuh `current_password`.
  - Admin `user:manage`/`*`:
    - bisa ganti tanpa current_password.
- `POST /auth/users/{user_id}/activate`
  - `@require_permission(['user:manage', '*'])`
- `POST /auth/users/{user_id}/deactivate`
  - `@require_permission(['user:manage', '*'])`
  - Tidak boleh menonaktifkan diri sendiri.

### 7.3. User ↔ Roles

- `GET /auth/users/{user_id}/roles`
  - `@require_permission(['user:read', 'user:manage', '*'])`
- `POST /auth/users/{user_id}/roles`
  - `@require_permission(['user:manage', '*'])`
  - High-priv:
    - boleh assign role apapun.
  - `rbac:custom-manage`:
    - hanya role non `EXTENDED_RESERVED_ROLE_NAMES`.
- `DELETE /auth/users/{user_id}/roles/{role_id}`
  - `@require_permission(['user:manage', '*'])`
  - Aturan reserved sama.

### 7.4. User ↔ Permissions (Direct)

- `GET /auth/users/{user_id}/permissions`
  - `@require_permission(['user:read', 'user:manage', '*'])`
- `POST /auth/users/{user_id}/permissions`
  - `@require_permission(['user:manage', '*'])`
  - High-priv:
    - boleh assign permission apapun.
  - `rbac:custom-manage`:
    - tidak boleh assign `RESERVED_PERMISSIONS`.
- `DELETE /auth/users/{user_id}/permissions/{permission_id}`
  - `@require_permission(['user:manage', '*'])`
  - Aturan reserved sama.

---

## 8. API Roles

### 8.1. List & View

- `GET /auth/roles`
  - `@require_auth`
  - High-priv:
    - melihat semua roles.
  - Non high-priv:
    - otomatis exclude `HIGH_PRIV_ROLES`.
- `GET /auth/roles/{role_name}`
  - `@require_permission(['system:admin', '*'])`
  - Hanya untuk role yang dikenali di ROLES mapping.

- `GET /auth/roles/{role_name}/users`
  - `@require_permission(['system:admin', '*'])`

### 8.2. Create / Update / Delete Role

- `POST /auth/roles`
  - `create_role_endpoint`
  - High-priv:
    - boleh create role apapun.
  - `rbac:custom-manage`:
    - tidak boleh membuat role dengan nama reserved (SUPERADMIN/DEVELOPER).
- `PUT /auth/roles/{role_id}`
  - `update_role`
  - High-priv:
    - boleh update role apapun.
  - `rbac:custom-manage`:
    - hanya role non-reserved,
    - tidak boleh rename menjadi reserved.
- `DELETE /auth/roles/{role_id}`
  - `@require_high_priv`
  - Hanya high-priv.

### 8.3. Role ↔ Permissions

- `GET /auth/roles/{role_id}/permissions`
  - `@require_high_priv`
- `POST /auth/roles/{role_id}/permissions`
  - `assign_permission_to_role_endpoint`
  - High-priv:
    - bebas.
  - `rbac:custom-manage`:
    - hanya role non-reserved,
    - hanya permission non-reserved.
- `DELETE /auth/roles/{role_id}/permissions/{permission_id}`
  - `remove_permission_from_role_endpoint`
  - Aturan sama dengan POST.

---

## 9. API Permissions

### 9.1. List Permissions

- `GET /auth/permissions`
  - `@require_auth`
  - High-priv:
    - full list.
  - Non high-priv:
    - butuh `system:admin` atau `*`,
    - permissions sensitif (`*`, `setting:dev`, `rbac:manage`) difilter.

### 9.2. Check & CRUD

- `POST /auth/permissions/check`
  - `@require_auth`
  - Cek apakah current user punya permission tertentu.
- `GET /auth/permissions/{permission_id}`
  - `@require_high_priv`
- `POST /auth/permissions`
  - `@require_high_priv`
- `PUT /auth/permissions/{permission_id}`
  - `@require_high_priv`
- `DELETE /auth/permissions/{permission_id}`
  - `@require_high_priv`

Reserved permission (mis. `*`) hanya boleh dikelola oleh high-priv dan tidak tersedia untuk admin biasa.

---

## 10. Cache Permission

- `POST /auth/cache/clear`
- `GET /auth/cache/stats`
  - `@require_high_priv`
  - Mengelola/melihat cache hasil permission.

---

## 11. Perbedaan Peran: Superadmin/Developer vs Admin

### Superadmin / Developer (High-Priv)

- Boleh:
  - Mengelola semua roles (termasuk SUPERADMIN/DEVELOPER/ADMIN_SECURITY).
  - Mengelola semua permissions (termasuk `*`, `setting:dev`, `rbac:*`).
  - Melihat semua user termasuk high-priv.
  - Mengelola cache RBAC.

### Admin (ADMIN, system:admin, user:manage, dll.)

- Fokus operasional:
  - CRUD user non-high-priv.
  - Assign roles/permissions non-reserved.
  - Melihat daftar roles dan permissions non-sensitif.
- Tidak boleh:
  - Membuat / mengubah / menghapus SUPERADMIN, DEVELOPER, ADMIN_SECURITY.
  - Membuat / memberi / mencabut `*` atau permission high-priv lain.
  - Melihat konfigurasi penuh RBAC yang disembunyikan untuk non-high-priv.

Authentication Service adalah referensi utama ketika merancang policy permission untuk seluruh sistem.
