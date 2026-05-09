# API Gateway RBAC Documentation
File: api-gateway/api_gateway.py  
Version: 2.2.0 – Production Ready with Enhanced RBAC

## 1. Peran API Gateway terhadap RBAC

- API Gateway tidak menyimpan user, role, atau permission.
- Sumber kebenaran (Source of Truth / SoT) RBAC: Authentication Service.
- Gateway:
  - Memvalidasi JWT (HS256, JWT_SECRET).
  - Membaca klaim:
    - user_id
    - username
    - role (legacy)
    - permissions (list string)
  - Menegakkan izin untuk setiap route menggunakan:
    - `@require_auth(required_permissions=[...])`
    - `check_permission()` dengan dukungan:
      - `*` (global wildcard)
      - `category:*` (mis. `patient:*`)
      - exact permission (mis. `user:read`)

Gateway hanya meneruskan request ke microservice lain jika klaim di token memenuhi aturan izin.

---

## 2. High-Privilege di API Gateway

Fungsi: `is_superadmin_or_dev(user)`

Seorang user dianggap high-privilege (boleh mengelola/lihat RBAC sangat sensitif) jika:

- Memiliki `*` di `permissions`, ATAU
- Memiliki role `superadmin` (case-insensitive), ATAU
- Memiliki role `developer` (case-insensitive).

Catatan penting:

- Permission `system:admin` TIDAK otomatis dianggap superadmin.
- Admin dengan `system:admin` bisa mengakses endpoint administratif tertentu,
  namun data super-sensitif (seperti `*`, `setting:dev`) tetap difilter atau dibatasi.

---

## 3. Dekorator Keamanan

### 3.1. `require_auth(required_permissions=[])`

- Jika `required_permissions` kosong:
  - Hanya butuh JWT valid.
- Jika tidak kosong:
  - User harus memiliki salah satu permission yang diminta, atau wildcard yang relevan.

Pola yang digunakan:

- `*` → semua diizinkan.
- `category:*` → semua aksi pada kategori tersebut diizinkan.
- Exact match → harus ada di `permissions`.

Jika gagal:
- 401 untuk token tidak valid/absen.
- 403 untuk permission tidak cukup.

---

## 4. API Users via Gateway

Semua endpoint di bawah mem-proxy ke Auth Service, dengan enforcement awal di gateway.

- `GET /auth/users`
  - `@require_auth(['user:read', 'user:manage', '*'])`
  - List users (filter lanjutan dilakukan di Auth Service).
- `POST /auth/users`
  - `@require_auth(['user:create', 'user:manage', '*'])`
- `GET /auth/users/{user_id}`
  - `@require_auth(['user:read', 'user:manage', '*'])`
- `PUT /auth/users/{user_id}`
  - `@require_auth(['user:update', 'user:manage', '*'])`
- `DELETE /auth/users/{user_id}`
  - `@require_auth(['user:delete', 'user:manage', '*'])`
- `POST /auth/users/{user_id}/change-password`
  - `@require_auth(['user:update', 'user:manage', '*'])`
- `POST /auth/users/{user_id}/activate`
  - `@require_auth(['user:manage', '*'])`
- `POST /auth/users/{user_id}/deactivate`
  - `@require_auth(['user:manage', '*'])`

Manajemen role/permission per user:

- `GET /auth/users/{user_id}/roles`
  - `@require_auth(['user:read', 'user:manage', '*'])`
- `POST /auth/users/{user_id}/roles`
  - `@require_auth(['user:manage', '*'])`
- `DELETE /auth/users/{user_id}/roles/{role_id}`
  - `@require_auth(['user:manage', '*'])`
- `GET /auth/users/{user_id}/permissions`
  - `@require_auth(['user:read', 'user:manage', '*'])`
- `POST /auth/users/{user_id}/permissions`
  - `@require_auth(['user:manage', '*'])`
- `DELETE /auth/users/{user_id}/permissions/{permission_id}`
  - `@require_auth(['user:manage', '*'])`

---

## 5. API Roles via Gateway

- `GET /auth/roles`
  - `@require_auth(['system:admin', '*'])`
  - Jika `is_superadmin_or_dev(user)`:
    - akses penuh.
  - Jika hanya `system:admin`:
    - diizinkan melihat roles (saat ini tanpa filter super-sensitif).
- `POST /auth/roles`
  - `@require_auth(['system:admin', '*'])`
  - Hanya `is_superadmin_or_dev` yang boleh membuat role.
- `GET /auth/roles/{role_name}`
  - `@require_auth(['system:admin', '*'])`
  - Hanya `is_superadmin_or_dev` yang boleh.
- `GET /auth/roles/{role_name}/users`
  - `@require_auth(['system:admin', '*'])`
  - Hanya `is_superadmin_or_dev`.
- `GET /auth/roles/{role_id}/permissions`
  - `@require_auth(['system:admin', '*'])`
  - Hanya `is_superadmin_or_dev`.
- `POST /auth/roles/{role_id}/permissions`
  - `@require_auth(['system:admin', '*'])`
  - Hanya `is_superadmin_or_dev`.
- `DELETE /auth/roles/{role_id}/permissions/{permission_id}`
  - `@require_auth(['system:admin', '*'])`
  - Hanya `is_superadmin_or_dev`.

---

## 6. API Permissions via Gateway

### 6.1. List Permissions

- `GET /auth/permissions`
  - `@require_auth(['system:admin', '*'])`
  - Jika `is_superadmin_or_dev(user)`:
    - Response apa adanya dari Auth Service (full, termasuk `*`, `setting:dev`, dll).
  - Jika hanya `system:admin`:
    - Gateway memanggil Auth Service lalu mem-filter:
      - menyembunyikan:
        - `*`
        - `setting:dev`
      - (bisa diperluas untuk permission sensitif lain).

### 6.2. Create Permission

- `POST /auth/permissions`
  - `@require_auth(['system:admin', '*'])`
  - Hanya `is_superadmin_or_dev` yang boleh.
  - Dilarang membuat permission `"*"` (global wildcard) via endpoint ini (auto 400).

### 6.3. Check Permission

- `POST /auth/permissions/check`
  - `@require_auth()`
  - Proxy ke Auth Service.

---

## 7. RBAC Cache di Gateway

- `POST /auth/cache/clear`
  - `@require_auth(['system:admin', '*'])`
  - Hanya `is_superadmin_or_dev`.
- `GET /auth/cache/stats`
  - `@require_auth(['system:admin', '*'])`
  - Hanya `is_superadmin_or_dev`.

---

## 8. Ringkasan Perbedaan Superadmin/Developer vs Admin di Gateway

- Superadmin/Developer:
  - Ditentukan dari klaim token (role/permissions dari Auth Service).
  - Boleh:
    - Mengelola roles dan permissions sensitif,
    - Membaca semua permissions (termasuk `*`, `setting:dev`),
    - Mengelola cache RBAC.
- Admin:
  - Menggunakan permission seperti `system:admin`, `user:manage`, dsb.
  - Boleh:
    - Manajemen user operasional,
    - Melihat roles,
    - Melihat permissions non-sensitif.
  - Tidak boleh:
    - Membuat/menghapus role/permission high-priv,
    - Melihat maupun membuat permission `*` dan permission developer-only.

API Gateway wajib selalu dianggap lapisan enforcer di depan; definisi hak akses final berada di Auth Service.
