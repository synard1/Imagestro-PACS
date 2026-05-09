# Dokumentasi API - Manajemen Pengguna (Users)

Dokumen ini merinci semua endpoint API yang terkait dengan manajemen pengguna, peran (roles), dan izin (permissions). Semua endpoint diakses melalui API Gateway.

## Daftar Isi
1.  [Model Data](#model-data)
    *   [User](#user-object)
    *   [Role](#role-object)
    *   [Permission](#permission-object)
2.  [Endpoint Publik](#endpoint-publik)
    *   [POST /auth/register](#post-authregister)
3.  [Endpoint Pengguna Terautentikasi](#endpoint-pengguna-terautentikasi)
    *   [GET /auth/me](#get-authme)
    *   [POST /auth/change-password](#post-authchange-password)
4.  [Endpoint Manajemen Pengguna (Admin)](#endpoint-manajemen-pengguna-admin)
    *   [GET /auth/users](#get-authusers)
    *   [POST /auth/users](#post-authusers)
    *   [GET /auth/users/{user_id}](#get-authusersuser_id)
    *   [PUT /auth/users/{user_id}](#put-authusersuser_id)
    *   [DELETE /auth/users/{user_id}](#delete-authusersuser_id)
    *   [POST /auth/users/{user_id}/change-password](#post-authusersuser_idchange-password)
    *   [POST /auth/users/{user_id}/activate](#post-authusersuser_idactivate)
    *   [POST /auth/users/{user_id}/deactivate](#post-authusersuser_iddeactivate)
5.  [Manajemen Peran & Izin Pengguna (Admin)](#manajemen-peran--izin-pengguna-admin)
    *   [GET /auth/users/{user_id}/roles](#get-authusersuser_idroles)
    *   [POST /auth/users/{user_id}/roles](#post-authusersuser_idroles)
    *   [DELETE /auth/users/{user_id}/roles/{role_id}](#delete-authusersuser_idrolesrole_id)
    *   [GET /auth/users/{user_id}/permissions](#get-authusersuser_idpermissions)


---

## Model Data

### User Object
Objek `User` merepresentasikan seorang pengguna dalam sistem.

```json
{
    "id": "a1b2c3d4-e5f6-7890-1234-567890abcdef",
    "username": "johndoe",
    "email": "johndoe@example.com",
    "full_name": "John Doe",
    "role": "DOCTOR",
    "is_active": true,
    "is_verified": true,
    "created_at": "2025-10-28T10:00:00Z",
    "last_login": "2025-11-01T12:30:00Z",
    "permissions": [
        {
            "name": "order:read",
            "description": "Read orders",
            "category": "order",
            "source": "role"
        },
        {
            "name": "worklist:read",
            "description": "Read worklist items",
            "category": "worklist",
            "source": "role"
        }
    ]
}
```
- **id** (string, UUID): ID unik pengguna.
- **username** (string): Nama pengguna untuk login. Unik.
- **email** (string): Alamat email pengguna. Unik.
- **full_name** (string): Nama lengkap pengguna.
- **role** (string): Peran utama pengguna (contoh: `ADMIN`, `DOCTOR`, `TECHNICIAN`).
- **is_active** (boolean): Status aktif pengguna. Pengguna non-aktif tidak bisa login.
- **is_verified** (boolean): Status verifikasi email (jika diimplementasikan).
- **created_at** (string, ISO 8601): Timestamp kapan pengguna dibuat.
- **last_login** (string, ISO 8601): Timestamp login terakhir.
- **permissions** (array of Permission): Daftar izin yang dimiliki pengguna.

### Role Object
Objek `Role` merepresentasikan sebuah peran yang dapat ditetapkan ke pengguna.

```json
{
    "id": "b2c3d4e5-f6a7-8901-2345-67890abcdef1",
    "name": "DOCTOR",
    "description": "Medical Doctor",
    "is_active": true
}
```

### Permission Object
Objek `Permission` merepresentasikan sebuah hak akses spesifik.
```json
{
    "name": "order:create",
    "description": "Create new orders",
    "category": "order",
    "source": "role"
}
```
- **source** (string): Asal izin (`role` atau `direct`).

---

## Endpoint Publik

Endpoint ini dapat diakses tanpa autentikasi.

### POST /auth/register
Mendaftarkan pengguna baru.

- **Request Body:**
  ```json
  {
      "username": "newuser",
      "email": "newuser@hospital.local",
      "password": "Password123!",
      "full_name": "New User Name",
      "role": "VIEWER"
  }
  ```
  - `role` (opsional, default: `VIEWER`): Peran awal pengguna. Harus salah satu dari peran yang ada.

- **Success Response (201 Created):**
  ```json
  {
      "status": "success",
      "message": "User registered successfully",
      "user": {
          "id": "c3d4e5f6-a7b8-9012-3456-7890abcdef12",
          "username": "newuser",
          "email": "newuser@hospital.local",
          "role": "VIEWER"
      }
  }
  ```

- **Error Responses:**
  - **400 Bad Request:** Jika `username`, `email`, atau `password` tidak ada, atau password terlalu lemah.
  - **409 Conflict:** Jika `username` atau `email` sudah ada.

---

## Endpoint Pengguna Terautentikasi

Endpoint ini memerlukan token autentikasi (`Bearer Token`).

### GET /auth/me
Mendapatkan detail profil pengguna yang sedang login.

- **Headers:**
  - `Authorization: Bearer <your_jwt_token>`

- **Success Response (200 OK):**
  ```json
  {
      "status": "success",
      "user": {
          "id": "a1b2c3d4-e5f6-7890-1234-567890abcdef",
          "username": "johndoe",
          "email": "johndoe@example.com",
          "full_name": "John Doe",
          "role": "DOCTOR",
          "is_active": true,
          "created_at": "2025-10-28T10:00:00Z",
          "last_login": "2025-11-01T12:30:00Z",
          "permissions": [
              // ... daftar izin
          ]
      }
  }
  ```

- **Error Response (401 Unauthorized):** Jika token tidak valid atau tidak ada.

### POST /auth/change-password
Mengubah password pengguna yang sedang login.

- **Headers:**
  - `Authorization: Bearer <your_jwt_token>`

- **Request Body:**
  ```json
  {
      "current_password": "OldPassword123!",
      "new_password": "NewStrongPassword456!"
  }
  ```

- **Success Response (200 OK):**
  ```json
  {
      "status": "success",
      "message": "Password changed successfully"
  }
  ```

- **Error Responses:**
  - **400 Bad Request:** Jika `new_password` tidak ada atau terlalu lemah.
  - **400 Bad Request:** Jika `current_password` tidak ada.
  - **400 Bad Request:** Jika `current_password` salah.
  - **401 Unauthorized:** Jika token tidak valid.

---

## Endpoint Manajemen Pengguna (Admin)

Endpoint ini memerlukan hak akses level admin (`user:manage`, `user:read`, `*`, dll.).

### GET /auth/users
Mendapatkan daftar semua pengguna dengan paginasi dan filter.

- **Permissions:** `user:read`, `user:manage`, `*`
- **Headers:**
  - `Authorization: Bearer <admin_jwt_token>`
- **Query Parameters:**
  - `page` (integer, opsional, default: 1): Nomor halaman.
  - `limit` (integer, opsional, default: 20): Jumlah item per halaman.
  - `search` (string, opsional): Mencari berdasarkan `username`, `email`, atau `full_name`.
  - `role` (string, opsional): Filter berdasarkan peran (contoh: `DOCTOR`).

- **Success Response (200 OK):**
  ```json
  {
      "status": "success",
      "data": {
          "users": [ /* ... daftar User Object ... */ ],
          "pagination": {
              "page": 1,
              "limit": 20,
              "total": 50,
              "total_pages": 3,
              "has_next": true,
              "has_prev": false
          }
      }
  }
  ```

### POST /auth/users
Membuat pengguna baru oleh admin.

- **Permissions:** `user:create`, `user:manage`, `*`
- **Headers:**
  - `Authorization: Bearer <admin_jwt_token>`
- **Request Body:**
  ```json
  {
      "username": "testuser",
      "email": "test@hospital.local",
      "password": "StrongPassword123!",
      "full_name": "Test User",
      "role": "TECHNICIAN",
      "is_active": true
  }
  ```

- **Success Response (201 Created):**
  ```json
  {
      "status": "success",
      "message": "User created successfully",
      "user": { /* ... User Object baru ... */ }
  }
  ```

### GET /auth/users/{user_id}
Mendapatkan detail pengguna spesifik berdasarkan ID.

- **Permissions:** `user:read`, `user:manage`, `*`
- **Headers:**
  - `Authorization: Bearer <admin_jwt_token>`
- **Path Parameters:**
  - `user_id` (string, UUID): ID pengguna yang akan diambil.

- **Success Response (200 OK):**
  ```json
  {
      "status": "success",
      "user": { /* ... User Object ... */ }
  }
  ```
- **Error Response (404 Not Found):** Jika `user_id` tidak ditemukan.

### PUT /auth/users/{user_id}
Memperbarui informasi pengguna.

- **Permissions:** `user:update`, `user:manage`, `*`
- **Headers:**
  - `Authorization: Bearer <admin_jwt_token>`
- **Request Body:** (Hanya sertakan field yang ingin diubah)
  ```json
  {
      "full_name": "Johnathan Doe",
      "role": "DOCTOR",
      "is_active": false
  }
  ```

- **Success Response (200 OK):**
  ```json
  {
      "status": "success",
      "message": "User updated successfully",
      "user": { /* ... User Object yang telah diperbarui ... */ }
  }
  ```

### DELETE /auth/users/{user_id}
Menghapus pengguna (soft delete dengan mengubah `is_active` menjadi `false`).

- **Permissions:** `user:delete`, `user:manage`, `*`
- **Headers:**
  - `Authorization: Bearer <admin_jwt_token>`

- **Success Response (200 OK):**
  ```json
  {
      "status": "success",
      "message": "User deleted successfully"
  }
  ```
- **Error Response (400 Bad Request):** Jika admin mencoba menghapus dirinya sendiri.

### POST /auth/users/{user_id}/change-password
Mengubah password pengguna spesifik oleh admin.

- **Permissions:** `user:update`, `user:manage`, `*`
- **Headers:**
  - `Authorization: Bearer <admin_jwt_token>`
- **Request Body:**
  ```json
  {
      "new_password": "NewPasswordForUser123!"
  }
  ```

- **Success Response (200 OK):**
  ```json
  {
      "status": "success",
      "message": "Password changed successfully"
  }
  ```

### POST /auth/users/{user_id}/activate
Mengaktifkan akun pengguna.

- **Permissions:** `user:manage`, `*`
- **Headers:**
  - `Authorization: Bearer <admin_jwt_token>`

- **Success Response (200 OK):**
  ```json
  {
      "status": "success",
      "message": "User activated"
  }
  ```

### POST /auth/users/{user_id}/deactivate
Menonaktifkan akun pengguna.

- **Permissions:** `user:manage`, `*`
- **Headers:**
  - `Authorization: Bearer <admin_jwt_token>`

- **Success Response (200 OK):**
  ```json
  {
      "status": "success",
      "message": "User deactivated"
  }
  ```

---

## Manajemen Peran & Izin Pengguna (Admin)

### GET /auth/users/{user_id}/roles
Mendapatkan semua peran (roles) yang ditetapkan untuk pengguna tertentu.

- **Permissions:** `user:read`, `user:manage`, `*`
- **Headers:**
  - `Authorization: Bearer <admin_jwt_token>`

- **Success Response (200 OK):**
  ```json
  {
      "status": "success",
      "roles": [
          {
              "id": "b2c3d4e5-f6a7-8901-2345-67890abcdef1",
              "name": "DOCTOR",
              "description": "Medical Doctor",
              "is_active": true
          }
      ]
  }
  ```

### POST /auth/users/{user_id}/roles
Menetapkan peran ke pengguna.

- **Permissions:** `user:manage`, `*`
- **Headers:**
  - `Authorization: Bearer <admin_jwt_token>`
- **Request Body:**
  ```json
  {
      "role_id": "b2c3d4e5-f6a7-8901-2345-67890abcdef1"
  }
  ```
  Atau bisa juga dengan nama peran:
  ```json
  {
      "role_name": "DOCTOR"
  }
  ```

- **Success Response (200 OK):**
  ```json
  {
      "status": "success",
      "message": "Role assigned successfully"
  }
  ```

### DELETE /auth/users/{user_id}/roles/{role_id}
Menghapus peran dari pengguna.

- **Permissions:** `user:manage`, `*`
- **Headers:**
  - `Authorization: Bearer <admin_jwt_token>`

- **Success Response (200 OK):**
  ```json
  {
      "status": "success",
      "message": "Role removed successfully"
  }
  ```

### GET /auth/users/{user_id}/permissions
Mendapatkan semua izin (permissions) yang dimiliki pengguna, baik dari peran maupun yang ditetapkan langsung.

- **Permissions:** `user:read`, `user:manage`, `*`
- **Headers:**
  - `Authorization: Bearer <admin_jwt_token>`

- **Success Response (200 OK):**
  ```json
  {
      "status": "success",
      "permissions": [
          {
              "name": "order:read",
              "description": "Read orders",
              "category": "order",
              "source": "role"
          },
          {
              "name": "patient:read",
              "description": "Read patient information",
              "category": "patient",
              "source": "direct"
          }
      ]
  }
  ```
