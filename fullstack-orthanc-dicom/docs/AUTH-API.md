# Authentication Service API Documentation (via API Gateway)

Dokumentasi ini menggambarkan fitur dan REST API Authentication Service (`auth-service/auth_service.py`) sebagaimana diakses melalui API Gateway (`api-gateway/api_gateway.py`).

Semua akses eksternal dilakukan melalui API Gateway. Auth-service tidak diekspos langsung.

- Base URL Publik (Gateway):
  - `http://<HOST>:8888`
- Semua path di bawah adalah path di API Gateway.
- Auth-service internal:
  - `AUTH_SERVICE_URL` (default: `http://auth-service:5000`)

---

## 1. Gambaran Umum

### 1.1 Fitur Utama

- JWT Authentication:
  - Access Token HS256
  - Payload menyertakan `role` dan daftar `permissions` efektif.
- Role-Based Access Control (RBAC):
  - Role default: `ADMIN`, `DOCTOR`, `TECHNICIAN`, `RECEPTIONIST`, `VIEWER`.
  - Wildcard: `*` dan `category:*` (misal `patient:*`).
- User Management:
  - CRUD user, aktivasi/deaktivasi, ganti password, pagination, search.
- Role Management:
  - CRUD role, mapping role-permission, mapping user-role.
- Permission Management:
  - CRUD permission, assign ke role/user, cek permission.
- Audit Logging:
  - Login, register, perubahan user, dsb.
- Security:
  - Rate limiting (Gateway + Auth-service).
  - Account lockout pada login gagal berulang.
  - Password hashing (bcrypt).
- Performance:
  - Permission cache (LRU) dengan endpoint untuk clear dan statistik.

### 1.2 Konvensi Response

Umum:

```json
// sukses
{
  "status": "success",
  "...": "data"
}

// gagal
{
  "status": "error",
  "message": "Deskripsi error",
  "detail": "...",      // opsional
  "required": ["..."],  // opsional (untuk error permission)
  "hint": "..."         // opsional
}
```

### 1.3 Header Penting

- `Content-Type: application/json`
- `Authorization: Bearer <access_token>` (untuk endpoint yang protected)

---

## 2. Health & Info

### 2.1 GET `/health`

- Deskripsi:
  - Health check API Gateway + status layanan backend (auth, mwl, orthanc, dll.).
- Auth:
  - Tidak perlu.
- Query:
  - `detailed` (opsional, `true`/`false`)
- Contoh response ringkas:

```json
{
  "status": "healthy",
  "service": "api-gateway",
  "version": "2.2.0",
  "services": {
    "auth": "healthy",
    "mwl": "healthy",
    "orthanc": "healthy",
    "orders": "healthy",
    "accession-api": "healthy",
    "dicom-router": "healthy",
    "satusehat-integrator": "healthy",
    "master-data-service": "healthy"
  }
}
```

### 2.2 GET `/`

- Deskripsi:
  - Informasi umum API Gateway dan daftar grup endpoint.
- Auth:
  - Tidak perlu.

---

## 3. Autentikasi

> Semua endpoint di bagian ini menggunakan prefix `/auth` pada API Gateway.

### 3.1 POST `/auth/login`

- Deskripsi:
  - Login dengan `username` atau `email` dan `password`.
  - Mengembalikan:
    - `access_token` (JWT)
    - `refresh_token` (string acak, di-hash di DB)
- Rate limiting:
  - Gateway: `GATEWAY_LOGIN_LIMIT`
  - Auth-service: `AUTH_RATE_LIMIT_LOGIN`
- Body:

```json
{
  "username": "admin",      // atau email
  "password": "Admin@12345"
}
```

- Response 200:

```json
{
  "status": "success",
  "message": "Login successful",
  "access_token": "<jwt>",
  "refresh_token": "<refresh-token>",
  "token_type": "Bearer",
  "expires_in": 86400,
  "user": {
    "id": "uuid",
    "username": "admin",
    "email": "admin@hospital.local",
    "full_name": "System Administrator",
    "role": "ADMIN",
    "permissions": ["*"]
  }
}
```

- Error utama:
  - `401` Invalid credentials
  - `403` Account locked / inactive
  - Proteksi lockout:
    - Jika gagal berkali-kali, `locked_until` di-set + respon sisa waktu.

---

### 3.2 POST `/auth/register`

- Deskripsi:
  - Registrasi user baru.
- Auth:
  - Saat ini tidak diproteksi khusus oleh Gateway (disarankan dikontrol di environment produksi).
- Body:

```json
{
  "username": "user1",
  "email": "user1@example.com",
  "password": "StrongPass1!",
  "full_name": "User Satu",
  "role": "VIEWER"
}
```

- Response 201:

```json
{
  "status": "success",
  "message": "User registered successfully",
  "user": {
    "id": "uuid",
    "username": "user1",
    "email": "user1@example.com",
    "role": "VIEWER"
  }
}
```

- Error:
  - `400` validasi gagal
  - `409` username/email sudah ada

---

### 3.3 POST `/auth/verify`

- Deskripsi:
  - Verifikasi JWT (valid/expired/invalid).
- Input:
  - Via Header: `Authorization: Bearer <token>`
  - Atau Body:

```json
{
  "token": "<jwt>"
}
```

- Response 200 (valid):

```json
{
  "status": "success",
  "valid": true,
  "payload": {
    "user_id": "uuid",
    "username": "admin",
    "role": "ADMIN",
    "permissions": ["*"]
  }
}
```

- Response 401:
  - `Token expired` atau `Invalid token: ...`

---

### 3.4 GET `/auth/me`

- Deskripsi:
  - Ambil profil user saat ini dari JWT.
- Auth:
  - Wajib Bearer token.
- Response 200:

```json
{
  "status": "success",
  "user": {
    "id": "uuid",
    "username": "admin",
    "email": "admin@hospital.local",
    "full_name": "System Administrator",
    "role": "ADMIN",
    "is_active": true,
    "permissions": ["*"]
  }
}
```

---

## 4. User Management

> Diakses via Gateway dengan prefix `/auth/users`.

Permission (melalui JWT + Gateway + Auth-service):
- `user:read`, `user:create`, `user:update`, `user:delete`, `user:manage`, atau `*`.
- Beberapa endpoint memperbolehkan user mengelola dirinya sendiri.

### 4.1 GET `/auth/users`

- Deskripsi:
  - List user dengan pagination dan filter.
- Permission:
  - `user:read` atau `user:manage` atau `*`
- Query:
  - `page` (default `1`)
  - `limit` (default `20`, max `100`)
  - `search` (opsional; ILIKE username/email/full_name)
  - `role` (opsional; harus role valid)
- Response 200 (ringkas):

```json
{
  "status": "success",
  "data": {
    "users": [
      {
        "id": "uuid",
        "username": "admin",
        "email": "admin@hospital.local",
        "full_name": "System Administrator",
        "role": "ADMIN",
        "is_active": true,
        "is_verified": true,
        "created_at": "...",
        "last_login": "...",
        "failed_login_attempts": 0,
        "permissions": ["*"]
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "total_pages": 1,
      "has_next": false,
      "has_prev": false
    }
  }
}
```

---

### 4.2 POST `/auth/users`

- Deskripsi:
  - Membuat user baru oleh admin/manager.
- Permission:
  - `user:create` atau `user:manage` atau `*`
- Body:

```json
{
  "username": "tech1",
  "email": "tech1@example.com",
  "password": "StrongPass1!",
  "full_name": "Tech One",
  "role": "TECHNICIAN",
  "is_active": true
}
```

- Response 201:
  - Data user + permissions efektif.
- Error:
  - `400` invalid
  - `409` username/email sudah ada

---

### 4.3 GET `/auth/users/{user_id}`

- Deskripsi:
  - Ambil detail user.
- Auth & Permission:
  - User boleh melihat dirinya sendiri.
  - Untuk melihat user lain:
    - `user:read` atau `user:manage` atau `*`
- Response:
  - 200: detail user + permissions[]
  - 403: jika akses user lain tanpa hak
  - 404: jika tidak ditemukan

---

### 4.4 PUT `/auth/users/{user_id}`

- Deskripsi:
  - Update data user.
- Permission:
  - Pemilik akun:
    - dapat update field tertentu (bukan role/is_active).
  - Admin/manager:
    - `user:update` atau `user:manage` atau `*` untuk ubah user lain atau ubah role/is_active.
- Body (subset):

```json
{
  "username": "newname",
  "email": "new@example.com",
  "full_name": "Nama Baru",
  "role": "DOCTOR",
  "is_active": true
}
```

- Response:
  - 200: user updated
  - 400: tidak ada field valid
  - 403: tidak berhak
  - 409: konflik username/email

---

### 4.5 DELETE `/auth/users/{user_id}`

- Deskripsi:
  - Soft delete (set `is_active = false`), revoke semua refresh token user tersebut.
- Permission:
  - `user:delete` atau `user:manage` atau `*`
- Aturan:
  - Tidak boleh menghapus akun sendiri.
- Response:
  - 200: success
  - 400: jika mencoba delete diri sendiri
  - 404: user tidak ditemukan

---

### 4.6 POST `/auth/users/{user_id}/change-password`

- Deskripsi:
  - Ganti password user.
- Permission:
  - User sendiri:
    - wajib `current_password` benar.
  - Admin/user:manage:
    - boleh ganti tanpa `current_password`.
- Body:

```json
{
  "new_password": "NewStrongPass1!",
  "current_password": "OldPass"  // wajib jika bukan admin/user:manage
}
```

- Efek:
  - Semua refresh token user di-revoke.
- Response:
  - 200: Password changed successfully

---

### 4.7 POST `/auth/users/{user_id}/activate`

- Permission:
  - `user:manage` atau `*`
- Efek:
  - `is_active = true`
- Response:
  - 200 / 400 / 404

---

### 4.8 POST `/auth/users/{user_id}/deactivate`

- Permission:
  - `user:manage` atau `*`
- Aturan:
  - Tidak boleh deactivate diri sendiri.
- Efek:
  - `is_active = false`
- Response:
  - 200 / 400 / 404

---

## 5. Role Management

> Prefix: `/auth/roles`  
> Permission: `system:admin` atau `*`

Role dapat didefinisikan di DB dan dipetakan ke permission.
Tersedia juga konstanta `ROLES` sebagai default.

### 5.1 GET `/auth/roles`

- Deskripsi:
  - List semua role dari tabel `roles`.
- Response:

```json
{
  "status": "success",
  "roles": [
    {
      "id": "uuid",
      "name": "ADMIN",
      "description": "System Administrator",
      "is_active": true,
      "created_at": "..."
    }
  ]
}
```

---

### 5.2 GET `/auth/roles/{role_name}`

- Deskripsi:
  - Detail role berdasarkan nama (mengacu ke `ROLES` + jumlah user).
- Response:

```json
{
  "status": "success",
  "role": {
    "name": "ADMIN",
    "description": "System Administrator",
    "permissions": ["*"],
    "user_count": 1
  }
}
```

- `404` jika role_name tidak dikenal.

---

### 5.3 GET `/auth/roles/{role_name}/users`

- Deskripsi:
  - List user dengan `role` (field legacy di tabel `users`).
- Query:
  - `page`, `limit`
- Response:
  - 200: `data.users` + `pagination`

---

### 5.4 POST `/auth/roles`

- Body:

```json
{
  "name": "RAD-NURSE",
  "description": "Radiology Nurse"
}
```

- Response:
  - 201: role baru
  - 409: jika nama sudah ada

---

### 5.5 PUT `/auth/roles/{role_id}`

- Body:

```json
{
  "name": "NEW-NAME",
  "description": "Updated description",
  "is_active": true
}
```

- Response:
  - 200: updated role
  - 404: role tidak ditemukan
  - 409: nama bentrok
- Efek:
  - Permission cache dibersihkan.

---

### 5.6 DELETE `/auth/roles/{role_id}`

- Response:
  - 200 jika berhasil
  - 404 jika tidak ditemukan

---

### 5.7 POST `/auth/roles/{role_id}/permissions`

- Body:

```json
{
  "permission_id": "uuid"
}
```

- Response:
  - 200: Permission assigned to role
  - 404/409 sesuai kasus
- Efek:
  - Clear cache global (karena mempengaruhi banyak user).

---

### 5.8 GET `/auth/roles/{role_id}/permissions`

- Response:
  - 200: list permission yang ter-assign

---

### 5.9 DELETE `/auth/roles/{role_id}/permissions/{permission_id}`

- Response:
  - 200 jika sukses
  - 500 jika gagal

---

## 6. Permission Management

> Prefix: `/auth/permissions`  
> Permission: `system:admin` atau `*`  
> (kecuali `/auth/permissions/check` untuk current user)

### 6.1 GET `/auth/permissions`

- Deskripsi:
  - List seluruh permission yang tersedia.
- Response:

```json
{
  "status": "success",
  "permissions": {
    "all": [
      {
        "id": "uuid",
        "name": "user:read",
        "description": "Read user information",
        "category": "user",
        "is_active": true,
        "created_at": "..."
      }
    ],
    "by_category": {
      "user": [ /* ... */ ],
      "order": [ /* ... */ ],
      "system": [ /* ... */ ]
    }
  }
}
```

---

### 6.2 GET `/auth/permissions/{permission_id}`

- Response:
  - 200: detail permission
  - 404: tidak ada

---

### 6.3 POST `/auth/permissions`

- Body:

```json
{
  "name": "custom:action",
  "description": "Custom permission",
  "category": "custom"
}
```

- Response:
  - 201: permission baru
  - 409: nama sudah ada

---

### 6.4 PUT `/auth/permissions/{permission_id}`

- Body (opsional):

```json
{
  "name": "custom:new",
  "description": "Updated",
  "category": "custom2",
  "is_active": true
}
```

- Response:
  - 200: updated
  - 404/409 sesuai kasus

---

### 6.5 DELETE `/auth/permissions/{permission_id}`

- Response:
  - 200 jika berhasil
  - 404 jika tidak ditemukan

---

### 6.6 POST `/auth/permissions/check`

- Deskripsi:
  - Cek apakah current user memiliki permission tertentu.
- Auth:
  - Wajib Bearer token.
- Body:

```json
{
  "permission": "user:manage"
}
```

- Response 200:

```json
{
  "status": "success",
  "has_permission": true,
  "permission": "user:manage",
  "user_id": "uuid"
}
```

---

## 7. User-Role & User-Permission Mapping

> Prefix:
> - `/auth/users/{user_id}/roles`
> - `/auth/users/{user_id}/permissions`

### 7.1 GET `/auth/users/{user_id}/roles`

- Permission:
  - `user:read` atau `user:manage` atau `*`
- Response:
  - 200: list roles yang dimiliki user

---

### 7.2 POST `/auth/users/{user_id}/roles`

- Permission:
  - `user:manage` atau `*`
- Body:

```json
{
  "role_id": "uuid"
}
```

- Response:
  - 200: Role assigned to user
  - 404 jika user/role invalid atau sudah ter-assign (melalui constraint)

---

### 7.3 DELETE `/auth/users/{user_id}/roles/{role_id}`

- Permission:
  - `user:manage` atau `*`
- Response:
  - 200 jika berhasil
  - 500 jika gagal

---

### 7.4 GET `/auth/users/{user_id}/permissions`

- Permission:
  - `user:read` atau `user:manage` atau `*`
- Response:
  - 200: daftar effective permissions (berisi nama, deskripsi, kategori, source=role/direct)

---

### 7.5 POST `/auth/users/{user_id}/permissions`

- Permission:
  - `user:manage` atau `*`
- Body:

```json
{
  "permission_id": "uuid"
}
```

- Response:
  - 200: Permission assigned to user
  - 404 jika user/permission invalid

---

### 7.6 DELETE `/auth/users/{user_id}/permissions/{permission_id}`

- Permission:
  - `user:manage` atau `*`
- Response:
  - 200 jika berhasil
  - 500 jika gagal

---

## 8. Cache Management

> Prefix: `/auth/cache`  
> Permission: `system:admin` atau `*`

### 8.1 POST `/auth/cache/clear`

- Body (opsional):

```json
{
  "user_id": "uuid"   // jika diisi, hanya clear cache untuk user ini
}
```

- Jika tanpa `user_id`:
  - Clear semua cache permission.
- Response:
  - 200: pesan sukses.

---

### 8.2 GET `/auth/cache/stats`

- Deskripsi:
  - Menampilkan statistik cache untuk:
    - `_get_cached_user_permissions`
    - `_check_cached_user_permission`
- Response (contoh):

```json
{
  "status": "success",
  "cache_stats": {
    "get_user_permissions": {
      "hits": 10,
      "misses": 5,
      "maxsize": 1000,
      "currsize": 5
    },
    "check_user_permission": {
      "hits": 20,
      "misses": 3,
      "maxsize": 500,
      "currsize": 3
    }
  }
}
```

---

## 9. RBAC & Evaluasi Permission

### 9.1 Role Default

- `ADMIN`:
  - `["*"]` → semua permission.
- `DOCTOR`:
  - Contoh: `order:read`, `order:create`, `worklist:read`, `worklist:update`, `orthanc:read`.
- `TECHNICIAN`:
  - `worklist:read`, `worklist:update`, `worklist:scan`, `orthanc:read`, `orthanc:write`.
- `RECEPTIONIST`:
  - `order:read`, `order:create`, `worklist:create`, `worklist:read`, `worklist:search`.
- `VIEWER`:
  - `worklist:read`, `orthanc:read`.

(Detail presisi mengacu ke konstanta `ROLES` di `auth_service.py`.)

### 9.2 Wildcard & Logika

- `*`:
  - akses penuh.
- `category:*`:
  - misal `patient:*` mencakup semua permission `patient:...`.
- Evaluasi (di Gateway & Auth-service):
  1. Jika user memiliki `*` → langsung diizinkan.
  2. Jika user memiliki permission yang sama persis dengan yang diminta → diizinkan.
  3. Jika permission yang diminta `x:y` dan user punya `x:*` → diizinkan.
  4. Jika tidak ada match → `403` dengan field `required` dan `hint`.

---

## 10. Catatan Integrasi

- Semua klien eksternal sebaiknya hanya menggunakan endpoint Gateway:
  - `http://<HOST>:8888/auth/...`
- Flow umum:
  1. `POST /auth/login` → dapatkan `access_token` (+ `refresh_token`).
  2. Sertakan `Authorization: Bearer <access_token>` untuk:
     - `/auth/me`, `/auth/users/...`, `/auth/roles/...`, `/auth/permissions/...`
     - Endpoint layanan lain yang diproteksi (worklist, orders, patients, dll.).
- API Gateway:
  - Memvalidasi JWT dengan `JWT_SECRET` yang konsisten.
  - Menerapkan rate limiting global dan per-endpoint.
  - Melakukan proxy ke auth-service dan service lain hanya jika token dan permissions valid.

---
