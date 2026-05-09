# RBAC Protected Permissions Guide

## Overview

Sistem RBAC sekarang mendukung fitur **Protected Permissions** yang memungkinkan administrator untuk menandai permission sebagai "protected" sehingga hanya SUPERADMIN/DEVELOPER yang dapat memodifikasinya.

## Backend Data Structure

Backend API mengembalikan permission dengan field tambahan:

```json
{
  "id": "uuid",
  "name": "rbac:manage",
  "description": "Manage RBAC (high privilege)",
  "category": "system",
  "protected": true,
  "hidden_from_tenant_admin": true,
  "is_active": true,
  "created_at": "2025-01-01T00:00:00Z"
}
```

### Field Penjelasan

- **protected** (boolean): Jika `true`, hanya SUPERADMIN/DEVELOPER yang dapat edit/delete permission ini
- **hidden_from_tenant_admin** (boolean): Jika `true`, permission ini tidak akan terlihat oleh regular tenant admins

## Frontend Implementation

### 1. Permission Modal Form

Ketika membuat atau mengedit permission, UI menampilkan dua checkbox:

```
🔒 Protected Permission
   Hanya SUPERADMIN/DEVELOPER yang dapat memodifikasi permission ini.
   Regular admins tidak bisa edit atau delete.

👁️ Hidden from Tenant Admin
   Permission ini tidak akan terlihat untuk regular tenant admins.
   Hanya SUPERADMIN/DEVELOPER yang dapat melihatnya.
```

### 2. Permission Card Display

Di halaman permissions, setiap permission menampilkan badge jika protected atau hidden:

```
┌─────────────────────────────────────┐
│ rbac:manage 🔒 👁️                   │
│ Manage RBAC (high privilege)        │
│ Category: system                    │
└─────────────────────────────────────┘
```

- **🔒 Badge**: Menunjukkan permission adalah protected
- **👁️ Badge**: Menunjukkan permission adalah hidden dari tenant admins

### 3. Edit/Delete Button Visibility

Tombol Edit dan Delete hanya ditampilkan jika user memiliki permission untuk memodifikasi:

```javascript
// Hanya ditampilkan jika user adalah SUPERADMIN/DEVELOPER
{permProtection.canEdit && (
  <button onClick={() => handleEditPermission(permission)}>
    Edit
  </button>
)}

{permProtection.canDelete && (
  <button onClick={() => handleDeletePermission(permission.id, permission.name)}>
    Delete
  </button>
)}
```

## How to Use

### Creating a Protected Permission

1. Buka **User Management** → **Roles & Permissions** tab
2. Klik **+ Create Permission**
3. Isi form:
   - **Name**: e.g., `rbac:manage`
   - **Description**: e.g., "Manage RBAC (high privilege)"
   - **Category**: e.g., `system`
4. Centang **🔒 Protected Permission** untuk membuat permission protected
5. Centang **👁️ Hidden from Tenant Admin** untuk menyembunyikan dari tenant admins
6. Klik **Create Permission**

### Editing a Protected Permission

Hanya SUPERADMIN/DEVELOPER yang dapat edit protected permissions:

1. Buka **User Management** → **Roles & Permissions** tab
2. Cari permission yang ingin diedit
3. Klik tombol **Edit** (hanya terlihat untuk SUPERADMIN/DEVELOPER)
4. Ubah field yang diperlukan
5. Klik **Update Permission**

### Assigning Protected Permissions to Roles

Protected permissions dapat diassign ke roles oleh siapa saja yang memiliki permission untuk manage roles:

1. Pilih role di panel kiri
2. Klik **+ Assign Permission**
3. Cari permission yang ingin diassign
4. Klik permission untuk assign
5. Permission akan ditambahkan ke role

## API Integration

### Create Permission with Protected Flag

```javascript
const permissionData = {
  name: 'rbac:manage',
  description: 'Manage RBAC (high privilege)',
  category: 'system',
  protected: true,
  hidden_from_tenant_admin: true,
};

await userService.createPermission(permissionData);
```

### Update Permission Protected Status

```javascript
const permissionData = {
  name: 'rbac:manage',
  description: 'Manage RBAC (high privilege)',
  category: 'system',
  protected: true,
  hidden_from_tenant_admin: true,
};

await userService.updatePermission(permissionId, permissionData);
```

## Backend Requirements

Backend API harus support field berikut di permission endpoints:

### POST /auth/permissions

```json
{
  "name": "string (required)",
  "description": "string (optional)",
  "category": "string (optional)",
  "protected": "boolean (optional, default: false)",
  "hidden_from_tenant_admin": "boolean (optional, default: false)"
}
```

### PUT /auth/permissions/{id}

```json
{
  "name": "string (optional)",
  "description": "string (optional)",
  "category": "string (optional)",
  "protected": "boolean (optional)",
  "hidden_from_tenant_admin": "boolean (optional)"
}
```

### GET /auth/permissions

Response harus include field `protected` dan `hidden_from_tenant_admin`:

```json
{
  "permissions": {
    "all": [
      {
        "id": "uuid",
        "name": "string",
        "description": "string",
        "category": "string",
        "protected": "boolean",
        "hidden_from_tenant_admin": "boolean",
        "is_active": "boolean",
        "created_at": "timestamp"
      }
    ]
  }
}
```

## Permission Check Logic

### Frontend Permission Check

```javascript
import { isHighPrivUser, getPermissionProtectionInfo } from '../services/rbac';

const currentUser = getCurrentUser();
const isHighPriv = isHighPrivUser(currentUser);

const permProtection = getPermissionProtectionInfo(permission, currentUser);

// Check if user can edit
if (permProtection.canEdit) {
  // Show edit button
}

// Check if user can delete
if (permProtection.canDelete) {
  // Show delete button
}
```

### Protection Info Structure

```javascript
{
  isProtected: boolean,      // Is this permission protected?
  canEdit: boolean,          // Can current user edit?
  canDelete: boolean,        // Can current user delete?
  reason: string             // Why is it protected?
}
```

## Visibility Rules

### For SUPERADMIN/DEVELOPER

- Dapat melihat semua permissions (protected dan hidden)
- Dapat edit dan delete non-protected permissions
- Dapat edit (tapi tidak delete) protected permissions
- Dapat assign/remove permissions dari roles

### For Regular Tenant Admin

- Hanya dapat melihat non-hidden permissions
- Dapat edit dan delete non-protected permissions
- Tidak dapat edit atau delete protected permissions
- Dapat assign/remove non-protected permissions dari roles

## Examples

### System Permissions (Protected & Hidden)

```javascript
{
  name: 'rbac:manage',
  description: 'Manage RBAC (high privilege)',
  category: 'system',
  protected: true,
  hidden_from_tenant_admin: true
}

{
  name: 'setting:dev',
  description: 'Manage developer settings',
  category: 'system',
  protected: true,
  hidden_from_tenant_admin: true
}
```

### Protected but Visible Permissions

```javascript
{
  name: 'system:admin',
  description: 'System administration',
  category: 'system',
  protected: true,
  hidden_from_tenant_admin: false
}
```

### Regular Permissions

```javascript
{
  name: 'user:read',
  description: 'Read user data',
  category: 'user',
  protected: false,
  hidden_from_tenant_admin: false
}
```

## Troubleshooting

### Permission tidak terlihat di UI

- Jika permission memiliki `hidden_from_tenant_admin: true` dan user bukan SUPERADMIN/DEVELOPER, permission tidak akan terlihat
- Solusi: Login sebagai SUPERADMIN/DEVELOPER untuk melihat semua permissions

### Tidak bisa edit permission

- Jika permission memiliki `protected: true` dan user bukan SUPERADMIN/DEVELOPER, tombol edit tidak akan terlihat
- Solusi: Minta SUPERADMIN/DEVELOPER untuk edit permission, atau ubah `protected` flag ke `false`

### Backend tidak mengembalikan protected field

- Pastikan backend API sudah diupdate untuk include field `protected` dan `hidden_from_tenant_admin`
- Jika field tidak ada, frontend akan menggunakan fallback ke reserved permissions list

## Migration from Hardcoded Constants

Jika sebelumnya menggunakan hardcoded constants di `rbacConstants.js`, sekarang sistem menggunakan backend data:

1. Backend mengirim `protected` dan `hidden_from_tenant_admin` flags
2. Frontend menggunakan flags ini untuk determine protection status
3. Fallback ke reserved permissions list jika backend tidak mengirim flags
4. Ini memungkinkan dynamic management tanpa perlu redeploy frontend

## Best Practices

1. **Gunakan Protected untuk System Permissions**: Tandai permissions yang critical sebagai protected
2. **Gunakan Hidden untuk Sensitive Permissions**: Sembunyikan permissions yang hanya untuk SUPERADMIN/DEVELOPER
3. **Dokumentasi**: Selalu tambahkan description yang jelas untuk setiap permission
4. **Kategorisasi**: Gunakan category yang konsisten untuk grouping permissions
5. **Audit**: Monitor siapa yang membuat/mengubah protected permissions

