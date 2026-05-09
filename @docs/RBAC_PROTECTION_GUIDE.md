# RBAC Protection Guide

## Overview

Sistem RBAC (Role-Based Access Control) ini mendukung arsitektur multi-tenant dimana setiap tenant memiliki ADMIN sendiri, namun roles dan permissions sistem-level dilindungi dari modifikasi oleh admin biasa.

## Hierarki User

```
SUPERADMIN / DEVELOPER (High-Privilege)
├── Bisa melihat SEMUA roles & permissions
├── Bisa CRUD SEMUA roles & permissions (kecuali delete core)
└── Bisa assign SEMUA roles & permissions

ADMIN (User Biasa - Multi-tenant Admin)
├── TIDAK bisa melihat reserved roles/permissions (opsional)
├── TIDAK bisa CRUD reserved roles/permissions
├── Bisa CRUD custom roles/permissions
└── Bisa assign non-reserved roles/permissions ke user
```

## Protected Items

### Reserved Roles
Roles berikut tidak dapat dimodifikasi oleh admin biasa:

| Role | Description |
|------|-------------|
| `SUPERADMIN` | Root / platform owner dengan akses penuh |
| `DEVELOPER` | Developer dengan akses ke fitur development |
| `ADMIN_SECURITY` | Admin khusus untuk keamanan RBAC |

### Reserved Permissions
Permissions berikut tidak dapat dimodifikasi oleh admin biasa:

| Permission | Description |
|------------|-------------|
| `*` | Global wildcard - akses penuh ke semua fitur |
| `rbac:manage` | Manajemen RBAC penuh |
| `rbac:view` | Melihat semua data RBAC |
| `rbac:custom-manage` | Manajemen RBAC custom |
| `setting:dev` | Akses ke settings developer |
| `system:admin` | Administrasi sistem |
| `system:logs` | Akses ke system logs |
| `system:config` | Konfigurasi sistem |

## Implementasi

### Frontend (React)

```javascript
import { 
  isHighPrivUser,
  getRoleProtectionInfo,
  getPermissionProtectionInfo,
  filterRolesForUser,
  filterPermissionsForUser,
} from '../services/rbac';

// Check if current user is high-privilege
const isHighPriv = isHighPrivUser(currentUser);

// Get protection info for a role
const roleProtection = getRoleProtectionInfo(role, currentUser);
// Returns: { isProtected, canEdit, canDelete, reason }

// Filter roles for display
const visibleRoles = filterRolesForUser(roles, currentUser, { hideReserved: true });
```

### Backend (Python/FastAPI)

```python
from app.middleware.rbac import (
    is_high_priv_user,
    can_manage_role,
    can_manage_permission,
    check_role_management_permission,
    check_permission_management_permission,
)

# Check if user is high-privilege
if is_high_priv_user(user):
    # Allow all operations
    pass

# Check before modifying a role
check_role_management_permission(user, role_name)  # Raises HTTPException if not allowed

# Check before modifying a permission
check_permission_management_permission(user, permission_name)  # Raises HTTPException if not allowed
```

## UI Behavior

### Untuk High-Privilege Users (SUPERADMIN/DEVELOPER)
- Melihat semua roles dan permissions
- Tombol Edit tersedia untuk semua items
- Tombol Delete tersedia untuk non-core items
- Badge "🔒 Protected" ditampilkan pada protected items

### Untuk Admin Biasa
- Melihat semua roles dan permissions (dengan badge protected)
- Tombol Edit TIDAK tersedia untuk protected items
- Tombol Delete TIDAK tersedia untuk protected items
- Tidak bisa membuat role/permission dengan nama reserved

## API Responses

### Role dengan Protection Info
```json
{
  "id": "uuid",
  "name": "SUPERADMIN",
  "description": "Root administrator",
  "is_active": true,
  "protection": {
    "isProtected": true,
    "canEdit": false,
    "canDelete": false,
    "reason": "System role - only SUPERADMIN/DEVELOPER can modify"
  }
}
```

### Permission dengan Protection Info
```json
{
  "id": "uuid",
  "name": "*",
  "description": "Global wildcard permission",
  "category": "system",
  "protection": {
    "isProtected": true,
    "canEdit": false,
    "canDelete": false,
    "reason": "System permission - only SUPERADMIN/DEVELOPER can modify"
  }
}
```

## Error Handling

### 403 Forbidden - Protected Role
```json
{
  "detail": "Cannot modify protected role 'SUPERADMIN'. Only SUPERADMIN/DEVELOPER can manage system roles."
}
```

### 403 Forbidden - Protected Permission
```json
{
  "detail": "Cannot modify protected permission '*'. Only SUPERADMIN/DEVELOPER can manage system permissions."
}
```

## Testing

### Test sebagai SUPERADMIN
1. Login sebagai superadmin
2. Buka User Management > Roles & Permissions
3. Verifikasi semua roles terlihat
4. Verifikasi tombol Edit tersedia untuk semua roles
5. Verifikasi tombol Delete tersedia untuk non-core roles

### Test sebagai ADMIN
1. Login sebagai admin biasa
2. Buka User Management > Roles & Permissions
3. Verifikasi protected roles memiliki badge "🔒 Protected"
4. Verifikasi tombol Edit TIDAK tersedia untuk protected roles
5. Verifikasi tombol Delete TIDAK tersedia untuk protected roles
6. Coba buat role dengan nama "SUPERADMIN" - harus gagal

## Files Modified

### Frontend
- `src/services/rbacConstants.js` - Konstanta dan helper functions
- `src/services/rbac.js` - Re-export dan integrasi
- `src/components/RolePermissionManager.jsx` - UI dengan proteksi

### Backend
- `pacs-service/app/middleware/rbac_constants.py` - Konstanta dan helper functions
- `pacs-service/app/middleware/rbac.py` - Middleware dengan proteksi

## Backup Location
```
backups/rbac-protection-YYYYMMDD_HHMMSS/
├── rbac.py.backup
├── rbac.js.backup
├── userService.js.backup
└── RolePermissionManager.jsx.backup
```
