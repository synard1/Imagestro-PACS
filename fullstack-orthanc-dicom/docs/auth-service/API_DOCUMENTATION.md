# Authentication Service API Documentation

## Overview
Authentication Service v2.0 dengan fitur manajemen pengguna yang komprehensif, termasuk Role-Based Access Control (RBAC), manajemen pengguna, dan audit logging.

## Base URL
```
http://localhost:5000
```

## Authentication
Semua endpoint yang memerlukan autentikasi menggunakan Bearer Token dalam header:
```
Authorization: Bearer <jwt_token>
```

## Roles dan Permissions
- **ADMIN**: Akses penuh ke semua fitur (`*` permission)
- **DOCTOR**: Akses ke fitur medis dan pasien
- **TECHNICIAN**: Akses ke peralatan dan prosedur teknis
- **RECEPTIONIST**: Akses ke pendaftaran dan penjadwalan
- **VIEWER**: Akses read-only terbatas

---

## Authentication Endpoints

### 1. Login
```http
POST /auth/login
```

**Request Body:**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Login successful",
  "access_token": "jwt_token",
  "refresh_token": "refresh_token",
  "user": {
    "id": "uuid",
    "username": "string",
    "email": "string",
    "role": "string",
    "permissions": ["array"]
  }
}
```

### 2. Register
```http
POST /auth/register
```

**Request Body:**
```json
{
  "username": "string",
  "email": "string",
  "password": "string",
  "full_name": "string",
  "role": "VIEWER"
}
```

### 3. Refresh Token
```http
POST /auth/refresh
```

**Request Body:**
```json
{
  "refresh_token": "string"
}
```

### 4. Logout
```http
POST /auth/logout
```

### 5. Get Current User
```http
GET /auth/me
```

---

## User Management Endpoints

### 1. List Users (Admin Only)
```http
GET /auth/users?page=1&limit=20&search=&role=
```

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20, max: 100)
- `search`: Search in username, email, full_name
- `role`: Filter by role

**Response:**
```json
{
  "status": "success",
  "data": {
    "users": [
      {
        "id": "uuid",
        "username": "string",
        "email": "string",
        "full_name": "string",
        "role": "string",
        "is_active": true,
        "is_verified": true,
        "created_at": "datetime",
        "last_login": "datetime",
        "permissions": ["array"]
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100,
      "total_pages": 5,
      "has_next": true,
      "has_prev": false
    }
  }
}
```

### 2. Create User (Admin Only)
```http
POST /auth/users
```

**Request Body:**
```json
{
  "username": "string",
  "email": "string",
  "password": "string",
  "full_name": "string",
  "role": "VIEWER",
  "is_active": true
}
```

### 3. Get User
```http
GET /auth/users/{user_id}
```

**Note:** Users can only view their own profile unless they're admin.

### 4. Update User
```http
PUT /auth/users/{user_id}
```

**Request Body:**
```json
{
  "username": "string",
  "email": "string",
  "full_name": "string",
  "role": "string",
  "is_active": true
}
```

**Note:** Non-admin users cannot change `role` or `is_active`.

### 5. Delete User (Admin Only)
```http
DELETE /auth/users/{user_id}
```

**Note:** Soft delete - sets `is_active = false` and revokes all tokens.

### 6. Change User Password
```http
POST /auth/users/{user_id}/change-password
```

**Request Body:**
```json
{
  "new_password": "string",
  "current_password": "string"
}
```

**Note:** `current_password` required for non-admin users.

### 7. Activate User (Admin Only)
```http
POST /auth/users/{user_id}/activate
```

### 8. Deactivate User (Admin Only)
```http
POST /auth/users/{user_id}/deactivate
```

---

## Role Management Endpoints

### 1. List Roles (Admin Only)
```http
GET /auth/roles
```

**Response:**
```json
{
  "status": "success",
  "roles": [
    {
      "name": "ADMIN",
      "description": "Administrator with full access",
      "permissions": ["*"]
    }
  ]
}
```

### 2. Get Role Details (Admin Only)
```http
GET /auth/roles/{role_name}
```

**Response:**
```json
{
  "status": "success",
  "role": {
    "name": "ADMIN",
    "description": "Administrator with full access",
    "permissions": ["*"],
    "user_count": 5
  }
}
```

### 3. Get Role Users (Admin Only)
```http
GET /auth/roles/{role_name}/users?page=1&limit=20
```

---

## Permission Management Endpoints

### 1. List Permissions (Admin Only)
```http
GET /auth/permissions
```

**Response:**
```json
{
  "status": "success",
  "permissions": {
    "all": ["user:read", "user:write", "dicom:read"],
    "by_category": {
      "user": ["user:read", "user:write"],
      "dicom": ["dicom:read", "dicom:write"]
    }
  }
}
```

### 2. Check Permission
```http
POST /auth/permissions/check
```

**Request Body:**
```json
{
  "permission": "user:read"
}
```

**Response:**
```json
{
  "status": "success",
  "has_permission": true,
  "permission": "user:read",
  "user_role": "ADMIN"
}
```

---

## Error Responses

### Standard Error Format
```json
{
  "status": "error",
  "message": "Error description"
}
```

### Common HTTP Status Codes
- `200`: Success
- `201`: Created
- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `409`: Conflict (duplicate data)
- `500`: Internal Server Error

---

## Security Features

1. **JWT Authentication**: Secure token-based authentication
2. **Password Hashing**: bcrypt with salt
3. **Account Lockout**: Protection against brute force attacks
4. **Token Revocation**: Refresh token management
5. **Audit Logging**: All authentication events logged
6. **Role-Based Access Control**: Granular permission system
7. **Input Validation**: Comprehensive request validation

---

## Usage Examples

### Login and Get User List
```bash
# Login
curl -X POST http://localhost:5000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "password"}'

# Use token to get users
curl -X GET http://localhost:5000/auth/users \
  -H "Authorization: Bearer <access_token>"
```

### Create New User
```bash
curl -X POST http://localhost:5000/auth/users \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "newuser",
    "email": "user@example.com",
    "password": "securepassword",
    "full_name": "New User",
    "role": "DOCTOR"
  }'
```

### Check User Permission
```bash
curl -X POST http://localhost:5000/auth/permissions/check \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"permission": "user:write"}'
```