# User Management API Documentation

Complete CRUD API documentation for Users, Roles, and Permissions management.

## Table of Contents

1. [Authentication](#authentication)
2. [Users API](#users-api)
3. [Roles API](#roles-api)
4. [Permissions API](#permissions-api)
5. [User-Role Relationships](#user-role-relationships)
6. [User-Permission Relationships](#user-permission-relationships)
7. [Role-Permission Relationships](#role-permission-relationships)
8. [Error Responses](#error-responses)

---

## Authentication

### Login
Authenticate user and get access token.

**Endpoint:** `POST /api/auth/login`

**Request Body:**
```json
{
  "username": "admin",
  "password": "admin123"
}
```

**Response (200 OK):**
```json
{
  "access_token": "abc123...",
  "token_type": "Bearer",
  "expires_in": 86400,
  "user": {
    "id": "uuid",
    "username": "admin",
    "email": "admin@hospital.com",
    "full_name": "System Administrator",
    "roles": ["system-admin"],
    "permissions": ["*"]
  }
}
```

### Get Current User Profile
Get profile of currently authenticated user.

**Endpoint:** `GET /api/auth/me`

**Response (200 OK):**
```json
{
  "id": "uuid",
  "username": "admin",
  "email": "admin@hospital.com",
  "full_name": "System Administrator",
  "roles": ["system-admin"],
  "permissions": ["*"]
}
```

### Change Password (Current User)
Change password for currently authenticated user.

**Endpoint:** `POST /api/auth/change-password`

**Request Body:**
```json
{
  "current_password": "oldpass",
  "new_password": "newpass"
}
```

**Response (200 OK):**
```json
{
  "message": "Password changed successfully"
}
```

---

## Users API

### List All Users
Get list of all users with optional filters.

**Endpoint:** `GET /api/auth/users`

**Query Parameters:**
- `active` (boolean): Filter by active status (`true` or `false`)
- `search` (string): Search by username, email, or full name
- `role` (string): Filter by role name

**Examples:**
```
GET /api/auth/users
GET /api/auth/users?active=true
GET /api/auth/users?search=john
GET /api/auth/users?role=doctor
```

**Response (200 OK):**
```json
{
  "count": 5,
  "users": [
    {
      "id": "uuid",
      "username": "admin",
      "email": "admin@hospital.com",
      "full_name": "System Administrator",
      "active": true,
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T00:00:00.000Z",
      "last_login": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

### Create New User
Create a new user account.

**Endpoint:** `POST /api/auth/users`

**Request Body:**
```json
{
  "username": "newuser",
  "password": "password123",
  "email": "user@hospital.com",
  "full_name": "John Doe",
  "active": true
}
```

**Response (201 Created):**
```json
{
  "id": "uuid",
  "username": "newuser",
  "email": "user@hospital.com",
  "full_name": "John Doe",
  "active": true,
  "created_at": "2024-01-01T00:00:00.000Z",
  "updated_at": "2024-01-01T00:00:00.000Z",
  "last_login": null
}
```

### Get User by ID
Get detailed information about a specific user.

**Endpoint:** `GET /api/auth/users/:id`

**Response (200 OK):**
```json
{
  "id": "uuid",
  "username": "admin",
  "email": "admin@hospital.com",
  "full_name": "System Administrator",
  "active": true,
  "created_at": "2024-01-01T00:00:00.000Z",
  "updated_at": "2024-01-01T00:00:00.000Z",
  "last_login": "2024-01-15T10:30:00.000Z",
  "roles": [
    {
      "id": "role-uuid",
      "name": "system-admin"
    }
  ],
  "direct_permissions": []
}
```

### Update User
Update user information.

**Endpoint:** `PUT /api/auth/users/:id`

**Request Body:**
```json
{
  "email": "newemail@hospital.com",
  "full_name": "Updated Name",
  "active": true
}
```

**Response (200 OK):**
```json
{
  "id": "uuid",
  "username": "admin",
  "email": "newemail@hospital.com",
  "full_name": "Updated Name",
  "active": true,
  "created_at": "2024-01-01T00:00:00.000Z",
  "updated_at": "2024-01-15T10:30:00.000Z",
  "last_login": "2024-01-15T10:30:00.000Z"
}
```

### Delete User (Soft Delete)
Deactivate a user account (soft delete).

**Endpoint:** `DELETE /api/auth/users/:id`

**Response (200 OK):**
```json
{
  "message": "User deleted successfully",
  "user": {
    "id": "uuid",
    "username": "admin",
    "active": false,
    ...
  }
}
```

### Change User Password (Admin)
Admin can change password for any user.

**Endpoint:** `POST /api/auth/users/:id/change-password`

**Request Body:**
```json
{
  "new_password": "newpassword123"
}
```

**Response (200 OK):**
```json
{
  "message": "Password changed successfully"
}
```

### Activate User
Activate a deactivated user account.

**Endpoint:** `POST /api/auth/users/:id/activate`

**Response (200 OK):**
```json
{
  "message": "User activated successfully",
  "user": {
    "id": "uuid",
    "active": true,
    ...
  }
}
```

### Deactivate User
Deactivate a user account.

**Endpoint:** `POST /api/auth/users/:id/deactivate`

**Response (200 OK):**
```json
{
  "message": "User deactivated successfully",
  "user": {
    "id": "uuid",
    "active": false,
    ...
  }
}
```

---

## Roles API

### List All Roles
Get list of all roles.

**Endpoint:** `GET /api/auth/roles`

**Response (200 OK):**
```json
{
  "count": 7,
  "roles": [
    {
      "id": "uuid",
      "name": "system-admin",
      "description": "System Administrator - full access to all system features",
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T00:00:00.000Z",
      "user_count": 1
    }
  ]
}
```

### Create New Role
Create a new role.

**Endpoint:** `POST /api/auth/roles`

**Request Body:**
```json
{
  "name": "custom-role",
  "description": "Custom role description"
}
```

**Response (201 Created):**
```json
{
  "id": "uuid",
  "name": "custom-role",
  "description": "Custom role description",
  "created_at": "2024-01-01T00:00:00.000Z",
  "updated_at": "2024-01-01T00:00:00.000Z"
}
```

### Get Role by ID or Name
Get detailed information about a specific role.

**Endpoint:** `GET /api/auth/roles/:identifier`

**Response (200 OK):**
```json
{
  "id": "uuid",
  "name": "doctor",
  "description": "Doctor/Physician - access to patient data and worklist",
  "created_at": "2024-01-01T00:00:00.000Z",
  "updated_at": "2024-01-01T00:00:00.000Z",
  "permissions": [
    {
      "id": "perm-uuid",
      "name": "patient:read",
      "description": "Read patient information"
    }
  ],
  "user_count": 3
}
```

### Update Role
Update role information.

**Endpoint:** `PUT /api/auth/roles/:id`

**Request Body:**
```json
{
  "name": "updated-role-name",
  "description": "Updated description"
}
```

**Response (200 OK):**
```json
{
  "id": "uuid",
  "name": "updated-role-name",
  "description": "Updated description",
  "created_at": "2024-01-01T00:00:00.000Z",
  "updated_at": "2024-01-15T10:30:00.000Z"
}
```

### Delete Role
Delete a role (only if not assigned to any users).

**Endpoint:** `DELETE /api/auth/roles/:id`

**Response (200 OK):**
```json
{
  "message": "Role deleted successfully",
  "role": {
    "id": "uuid",
    "name": "custom-role",
    ...
  }
}
```

**Error Response (400 Bad Request):**
```json
{
  "error": "Cannot delete role: assigned to 5 user(s)",
  "assigned_users": 5
}
```

### Get Users with Specific Role
Get all users assigned to a specific role.

**Endpoint:** `GET /api/auth/roles/:identifier/users`

**Response (200 OK):**
```json
{
  "role_id": "uuid",
  "role_name": "doctor",
  "users": [
    {
      "id": "user-uuid",
      "username": "doctor1",
      "email": "doctor1@hospital.com",
      "full_name": "Dr. John Smith",
      "active": true,
      "assigned_at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

---

## Permissions API

### List All Permissions
Get list of all permissions.

**Endpoint:** `GET /api/auth/permissions`

**Response (200 OK):**
```json
{
  "count": 40,
  "permissions": [
    {
      "id": "uuid",
      "name": "patient:read",
      "description": "Read patient information",
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T00:00:00.000Z",
      "role_count": 5,
      "user_count": 2
    }
  ]
}
```

### Create New Permission
Create a new permission.

**Endpoint:** `POST /api/auth/permissions`

**Request Body:**
```json
{
  "name": "custom:permission",
  "description": "Custom permission description"
}
```

**Response (201 Created):**
```json
{
  "id": "uuid",
  "name": "custom:permission",
  "description": "Custom permission description",
  "created_at": "2024-01-01T00:00:00.000Z",
  "updated_at": "2024-01-01T00:00:00.000Z"
}
```

### Get Permission by ID
Get detailed information about a specific permission.

**Endpoint:** `GET /api/auth/permissions/:id`

**Response (200 OK):**
```json
{
  "id": "uuid",
  "name": "patient:read",
  "description": "Read patient information",
  "created_at": "2024-01-01T00:00:00.000Z",
  "updated_at": "2024-01-01T00:00:00.000Z",
  "roles": [
    {
      "id": "role-uuid",
      "name": "doctor"
    }
  ],
  "direct_user_count": 2
}
```

### Update Permission
Update permission information.

**Endpoint:** `PUT /api/auth/permissions/:id`

**Request Body:**
```json
{
  "name": "updated:permission",
  "description": "Updated description"
}
```

**Response (200 OK):**
```json
{
  "id": "uuid",
  "name": "updated:permission",
  "description": "Updated description",
  "created_at": "2024-01-01T00:00:00.000Z",
  "updated_at": "2024-01-15T10:30:00.000Z"
}
```

### Delete Permission
Delete a permission (only if not assigned to any roles or users).

**Endpoint:** `DELETE /api/auth/permissions/:id`

**Response (200 OK):**
```json
{
  "message": "Permission deleted successfully",
  "permission": {
    "id": "uuid",
    "name": "custom:permission",
    ...
  }
}
```

**Error Response (400 Bad Request):**
```json
{
  "error": "Cannot delete permission: assigned to 3 role(s) and 2 user(s)",
  "assigned_roles": 3,
  "assigned_users": 2
}
```

### Check Permissions
Check if current user has specific permissions.

**Endpoint:** `POST /api/auth/permissions/check`

**Request Body:**
```json
{
  "permissions": ["patient:read", "patient:create"]
}
```

**Response (200 OK):**
```json
{
  "has_permission": true,
  "required": ["patient:read", "patient:create"],
  "user_permissions": ["*"]
}
```

---

## User-Role Relationships

### Get User's Roles
Get all roles assigned to a user.

**Endpoint:** `GET /api/auth/users/:id/roles`

**Response (200 OK):**
```json
{
  "user_id": "uuid",
  "username": "admin",
  "roles": [
    {
      "id": "role-uuid",
      "name": "system-admin",
      "description": "System Administrator - full access",
      "assigned_at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### Assign Role to User
Assign a role to a user.

**Endpoint:** `POST /api/auth/users/:id/roles`

**Request Body:**
```json
{
  "role_id": "role-uuid"
}
```

**Response (201 Created):**
```json
{
  "message": "Role assigned to user successfully",
  "user_role": {
    "id": "uuid",
    "user_id": "user-uuid",
    "role_id": "role-uuid",
    "created_at": "2024-01-01T00:00:00.000Z"
  }
}
```

### Remove Role from User
Remove a role assignment from a user.

**Endpoint:** `DELETE /api/auth/users/:userId/roles/:roleId`

**Response (200 OK):**
```json
{
  "message": "Role removed from user successfully",
  "removed": {
    "id": "uuid",
    "user_id": "user-uuid",
    "role_id": "role-uuid",
    "created_at": "2024-01-01T00:00:00.000Z"
  }
}
```

---

## User-Permission Relationships

### Get User's Direct Permissions
Get direct permissions assigned to a user (not from roles).

**Endpoint:** `GET /api/auth/users/:id/permissions`

**Response (200 OK):**
```json
{
  "user_id": "uuid",
  "username": "admin",
  "direct_permissions": [
    {
      "id": "perm-uuid",
      "name": "custom:permission",
      "description": "Custom permission",
      "assigned_at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### Assign Permission to User
Assign a direct permission to a user.

**Endpoint:** `POST /api/auth/users/:id/permissions`

**Request Body:**
```json
{
  "permission_id": "perm-uuid"
}
```

**Response (201 Created):**
```json
{
  "message": "Permission assigned to user successfully",
  "user_permission": {
    "id": "uuid",
    "user_id": "user-uuid",
    "permission_id": "perm-uuid",
    "created_at": "2024-01-01T00:00:00.000Z"
  }
}
```

### Remove Permission from User
Remove a direct permission from a user.

**Endpoint:** `DELETE /api/auth/users/:userId/permissions/:permissionId`

**Response (200 OK):**
```json
{
  "message": "Permission removed from user successfully",
  "removed": {
    "id": "uuid",
    "user_id": "user-uuid",
    "permission_id": "perm-uuid",
    "created_at": "2024-01-01T00:00:00.000Z"
  }
}
```

---

## Role-Permission Relationships

### Get Role's Permissions
Get all permissions assigned to a role.

**Endpoint:** `GET /api/auth/roles/:id/permissions`

**Response (200 OK):**
```json
{
  "role_id": "uuid",
  "role_name": "doctor",
  "permissions": [
    {
      "id": "perm-uuid",
      "name": "patient:read",
      "description": "Read patient information",
      "assigned_at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### Assign Permission to Role
Assign a permission to a role.

**Endpoint:** `POST /api/auth/roles/:id/permissions`

**Request Body:**
```json
{
  "permission_id": "perm-uuid"
}
```

**Response (201 Created):**
```json
{
  "message": "Permission assigned to role successfully",
  "role_permission": {
    "id": "uuid",
    "role_id": "role-uuid",
    "permission_id": "perm-uuid",
    "created_at": "2024-01-01T00:00:00.000Z"
  }
}
```

### Remove Permission from Role
Remove a permission from a role.

**Endpoint:** `DELETE /api/auth/roles/:roleId/permissions/:permissionId`

**Response (200 OK):**
```json
{
  "message": "Permission removed from role successfully",
  "removed": {
    "id": "uuid",
    "role_id": "role-uuid",
    "permission_id": "perm-uuid",
    "created_at": "2024-01-01T00:00:00.000Z"
  }
}
```

---

## Error Responses

### 400 Bad Request
```json
{
  "error": "Username and password are required"
}
```

### 401 Unauthorized
```json
{
  "error": "Invalid credentials"
}
```

### 403 Forbidden
```json
{
  "error": "Permission denied"
}
```

### 404 Not Found
```json
{
  "error": "User not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Failed to create user"
}
```

---

## Default Users and Credentials

After running the seed script (`npm run seed:users`), the following default users are created:

| Username | Password | Role | Description |
|----------|----------|------|-------------|
| admin | admin123 | system-admin | Full system access |
| doctor | doctor123 | doctor | Patient and worklist access |
| radiologist | radio123 | radiologist | DICOM and imaging access |
| technician | tech123 | technician | Worklist and order management |
| receptionist | recep123 | receptionist | Patient registration |

## Permission Naming Convention

Permissions follow the pattern: `resource:action`

- `*` - Global superadmin permission
- `resource:*` - All actions on a resource (e.g., `patient:*`)
- `resource:action` - Specific action (e.g., `patient:read`, `patient:create`)

Common actions: `read`, `create`, `update`, `delete`, `manage`, `search`

Common resources: `user`, `patient`, `doctor`, `worklist`, `order`, `accession`, `setting`, `dicom`
