# API Gateway

Central entry point untuk seluruh layanan dalam stack DICOM/Healthcare ini.
Menyediakan:
- Routing terpusat
- Validasi JWT
- Role-Based Access Control (RBAC)
- User Management API (via auth-service)
- Rate limiting
- CORS
- Proxy ke layanan internal (master-data, MWL, orders, accession, Orthanc, dsb.)

Service hanya dapat diakses dari luar melalui API Gateway ini (port 8888).

## 1. Arsitektur Autentikasi & RBAC

Komponen utama:

- auth-service
  - Sumber kebenaran (source of truth) untuk:
    - Users
    - Roles
    - Permissions
  - Menerbitkan JWT access token.
  - Menyediakan REST API untuk user management, role management, dan permission management.

- api-gateway
  - Validasi JWT di hampir semua endpoint yang diproteksi.
  - Menerapkan RBAC berdasarkan klaim `permissions` pada JWT.
  - Meneruskan Authorization header ke service di belakangnya.
  - Mengekspose endpoint `/auth/*` sebagai facade ke auth-service.

- master-data-service
  - Contoh service domain yang:
    - Tidak menyimpan user/role sendiri.
    - Menggunakan JWT + permissions yang dikeluarkan oleh auth-service.
    - Menerapkan pengecekan permission tambahan di layer service.

Skema umum alur:

1. User login ke `/auth/login` (via gateway).
2. auth-service memvalidasi kredensial dan mengembalikan JWT.
3. Client menggunakan JWT tersebut (Authorization: Bearer <token>) untuk semua request ke gateway.
4. Gateway:
   - Validasi JWT.
   - Cek permission sesuai aturan RBAC per route.
   - Jika lolos, proxy request ke service internal terkait.

## 2. JWT Payload (Ringkasan)

Contoh isi JWT yang digunakan gateway dan service:

- `sub` / `user_id`
- `username`
- `roles`: array nama role yang dimiliki user
- `permissions`: array final permissions hasil resolusi:
  - dari role-role user
  - plus direct permissions user

Contoh (disederhanakan):

```json
{
  "user_id": "uuid-user",
  "username": "admin",
  "roles": ["system-admin"],
  "permissions": [
    "*",
    "user:manage",
    "system:admin",
    "patient:read",
    "patient:create",
    "doctor:read",
    "setting:read"
  ],
  "exp": 9999999999
}
```

Gateway dan master-data-service membaca nilai `permissions` ini untuk memutuskan akses.

## 3. Model RBAC

Konsep permission yang digunakan:

- `*`
  - Superadmin global, memiliki semua akses.

- `resource:*`
  - Wildcard per resource.
  - Contoh:
    - `patient:*` → semua aksi pasien
    - `doctor:*` → semua aksi dokter
    - `user:*` → semua aksi user

- `resource:action`
  - Contoh:
    - `patient:read`, `patient:create`, `patient:update`, `patient:delete`
    - `doctor:read`, `doctor:create`, ...
    - `user:read`, `user:create`, `user:update`, `user:delete`, `user:manage`
    - `system:admin`
    - `setting:read`, `setting:write`
    - `accession:create`, `worklist:read`, dll.

Gateway menggunakan fungsi:

- `validate_token(token)` untuk verifikasi JWT.
- `check_permission(user_permissions, required_permissions)`:
  - Mengizinkan jika:
    - `*` ada di user_permissions, atau
    - salah satu `required_permissions` ada di user_permissions, atau
    - user punya wildcard kategori, misalnya:
      - required: `patient:read`
      - user punya: `patient:*`

Decorator:

- `@require_auth(required_permissions=[...])`
  - Dipakai di semua route yang butuh auth/RBAC.

## 4. User Management API (melalui API Gateway)

Semua endpoint `/auth/...` di gateway adalah proxy ke auth-service.

Authorization:
- Banyak operation butuh permission tertentu.
- Permission tersebut diperiksa oleh gateway sebelum proxy.
- Untuk operasi yang menyentuh konfigurasi RBAC global (list semua user/roles/permissions, ubah role/permission global),
  gateway juga menerapkan guard tambahan "superadmin/developer only" (lihat bagian 10).

### 4.1. Public Auth

Tidak membutuhkan JWT.

- `POST /auth/login`
  - Body: kredensial user.
  - Response: JWT access token + info user.

- `POST /auth/verify`
  - Verifikasi token (backward compatible).
  - Bisa digunakan oleh service/klien untuk memvalidasi token.

- `POST /auth/register`
  - Registrasi user baru (jika di-enable di auth-service).
  - Rate limited.

### 4.2. Profil User

Membutuhkan JWT valid.

- `GET /auth/me`
  - Mengembalikan profil user saat ini beserta roles/permissions.

- `POST /auth/change-password`
  - Ganti password user saat ini.
  - Permissions: cukup user yang login.

### 4.3. Manajemen User (Admin)

Semua route ini di-protect dengan permission berbasis user management:

- List users:
  - `GET /auth/users`
  - Permissions:
    - `user:read` atau `user:manage` atau `*`

- Create user:
  - `POST /auth/users`
  - Permissions:
    - `user:create` atau `user:manage` atau `*`

- Get user by ID:
  - `GET /auth/users/{user_id}`
  - Permissions:
    - `user:read` atau `user:manage` atau `*`

- Update user:
  - `PUT /auth/users/{user_id}`
  - Permissions:
    - `user:update` atau `user:manage` atau `*`

- Delete user:
  - `DELETE /auth/users/{user_id}`
  - Permissions:
    - `user:delete` atau `user:manage` atau `*`

- Change password (admin to user):
  - `POST /auth/users/{user_id}/change-password`
  - Permissions:
    - `user:update` atau `user:manage` atau `*`

- Activate user:
  - `POST /auth/users/{user_id}/activate`
  - Permissions:
    - `user:manage` atau `*`

- Deactivate user:
  - `POST /auth/users/{user_id}/deactivate`
  - Permissions:
    - `user:manage` atau `*`

### 4.4. User ↔ Role Management

- Get roles of a user:
  - `GET /auth/users/{user_id}/roles`
  - Permissions:
    - `user:read` atau `user:manage` atau `*`

- Assign role to user:
  - `POST /auth/users/{user_id}/roles`
  - Permissions:
    - `user:manage` atau `*`

- Remove role from user:
  - `DELETE /auth/users/{user_id}/roles/{role_id}`
  - Permissions:
    - `user:manage` atau `*`

### 4.5. User ↔ Permission Management

- Get direct permissions of user:
  - `GET /auth/users/{user_id}/permissions`
  - Permissions:
    - `user:read` atau `user:manage` atau `*`

- Assign direct permission:
  - `POST /auth/users/{user_id}/permissions`
  - Permissions:
    - `user:manage` atau `*`

- Remove direct permission:
  - `DELETE /auth/users/{user_id}/permissions/{permission_id}`
  - Permissions:
    - `user:manage` atau `*`

## 5. Role Management API

Hanya untuk admin sistem/global.

- List roles:
  - `GET /auth/roles`

- Create role:
  - `POST /auth/roles`

- Get role detail:
  - `GET /auth/roles/{role_name}`

- List users by role:
  - `GET /auth/roles/{role_name}/users`

- Get permissions of role:
  - `GET /auth/roles/{role_id}/permissions`

- Assign permission to role:
  - `POST /auth/roles/{role_id}/permissions`

- Remove permission from role:
  - `DELETE /auth/roles/{role_id}/permissions/{permission_id}`

Semua dilindungi:
- `require_auth(['system:admin', '*'])`

## 6. Permission Management API

Juga khusus admin sistem/global.

- List permissions:
  - `GET /auth/permissions`
  - Hanya untuk superadmin/developer (lihat bagian "Superadmin & Developer Guard").

- Create permission:
  - `POST /auth/permissions`
  - Hanya untuk superadmin/developer.

- Check current user's permission:
  - `POST /auth/permissions/check`
  - Body: `{ "permissions": ["patient:read"] }`
  - Mengembalikan apakah user saat ini memiliki salah satu permission diminta.
  - Cukup membutuhkan JWT valid (tidak dibatasi superadmin).

`/auth/permissions` (list/create):
- Di gateway: `require_auth(['system:admin', '*'])` + cek `is_superadmin_or_dev(user)`.

`/auth/permissions/check`:
- `@require_auth()` → butuh login saja.

## 7. RBAC pada Layanan Lain via Gateway

Beberapa contoh penting:

- Master Data (Patients)
  - `/patients` (GET/POST) dan `/patients/<path>`:
    - Memakai decorator `@require_auth()` dan mapping:
      - GET → `patient:read` / `patient:search`
      - POST → `patient:create`
      - PUT → `patient:update`
      - DELETE → `patient:delete`

- Master Data (Doctors/Practitioners)
  - `/doctors`, `/doctors/<path>`:
    - GET → `doctor:read` atau `practitioner:read`
    - POST → `doctor:create` atau `practitioner:create`
    - PUT → `doctor:update` atau `practitioner:update`
    - DELETE → `doctor:delete` atau `practitioner:delete`

- Settings
  - `/settings`:
    - GET → `setting:read`
    - POST/PUT/DELETE → `setting:write`

- Worklist, Orders, Accession, DICOM Router:
  - Masing-masing route punya mapping method → permission spesifik:
    - `worklist:*`
    - `order:*`
    - `accession:*`
    - `dicom:router`
  - Gateway cek permission sebelum forward.

- Orthanc API dan UI:
  - Diakses lewat route khusus (`/orthanc/*`, `/orthanc-ui/*`, `/ui`, `/app`) dengan kombinasi:
    - JWT + RBAC
    - atau Basic Auth (untuk mode non-public)

## 8. Cara Pakai di Client

Ringkas:

1. Login:
   - `POST http://<gateway>:8888/auth/login`
   - Simpan `access_token`.

2. Set Authorization header:
   - `Authorization: Bearer <access_token>`

3. Panggil endpoint sesuai role/permission:
   - Contoh:
     - `GET /patients` → butuh `patient:read` atau `patient:search`.
     - `POST /auth/users` → butuh `user:create` atau `user:manage` atau `*`.
     - `GET /auth/roles` → butuh `system:admin` atau `*`.

Jika token tidak valid / permission kurang:
- Gateway akan mengembalikan:
  - 401 (unauthorized) jika token salah/expired/missing.
  - 403 (forbidden) jika permission tidak cukup.

## 9. Ringkasan Desain

- User Management dan RBAC:
  - Terpusat di auth-service.
  - Diakses dari luar melalui API Gateway (`/auth/...`).
- Layanan domain lain (master-data-service, MWL, Orders, dsb.):
  - Tidak menduplikasi manajemen user.
  - Mengandalkan JWT + permissions yang sudah dihitung oleh auth-service.
  - Gateway + service sama-sama dapat memvalidasi dan membatasi akses.

## 10. Superadmin & Developer Guard (Hardening RBAC)

API Gateway menambahkan lapisan proteksi ekstra untuk data RBAC sensitif:

Helper di `api_gateway.py`:
- `is_superadmin_or_dev(user)` mengembalikan true jika:
  - User memiliki salah satu:
    - `'*'` di `permissions`
    - `'system:admin'` di `permissions`
    - `'superadmin'` di `roles` (case-insensitive)
    - `'developer'` di `roles` (case-insensitive)

Efeknya:

1. Hanya superadmin/developer yang boleh:
   - Melihat daftar semua user:
     - `GET /auth/users`
   - Melihat dan mengelola definisi roles global:
     - `GET /auth/roles`
     - `POST /auth/roles`
     - `GET /auth/roles/{role_name}`
     - `GET /auth/roles/{role_name}/users`
     - `GET /auth/roles/{role_id}/permissions`
     - `POST /auth/roles/{role_id}/permissions`
     - `DELETE /auth/roles/{role_id}/permissions/{permission_id}`
   - Melihat dan mengelola daftar permissions global:
     - `GET /auth/permissions`
     - `POST /auth/permissions`
   - Mengelola cache RBAC:
     - `POST /auth/cache/clear`
     - `GET /auth/cache/stats`

2. Operasi berikut tetap menggunakan permission granular tanpa wajib superadmin/developer:
   - Manajemen user spesifik (selama punya `user:read/user:update/user:manage`, dsb.):
     - `GET /auth/users/{user_id}`
     - `PUT /auth/users/{user_id}`
     - `DELETE /auth/users/{user_id}`
     - `POST /auth/users/{user_id}/change-password`
     - `POST /auth/users/{user_id}/activate`
     - `POST /auth/users/{user_id}/deactivate`
   - Manajemen role/permission pada level user individual:
     - `GET /auth/users/{user_id}/roles`
     - `POST /auth/users/{user_id}/roles`
     - `DELETE /auth/users/{user_id}/roles/{role_id}`
     - `GET /auth/users/{user_id}/permissions`
     - `POST /auth/users/{user_id}/permissions`
     - `DELETE /auth/users/{user_id}/permissions/{permission_id}`
   - Cek permission untuk user saat ini:
     - `POST /auth/permissions/check`

Dengan demikian:
- User biasa atau admin terbatas tidak bisa melihat atau memetakan seluruh konfigurasi RBAC global,
  maupun role/permission sensitif.
- Hanya superadmin/developer yang memiliki visibility penuh atas users/roles/permissions global.

Dokumentasi ini mencerminkan implementasi aktual di `api_gateway.py` per versi saat ini.
