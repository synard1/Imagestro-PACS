# RBAC Backend API Examples

## Permission Endpoints

### GET /auth/permissions

Mengembalikan semua permissions dengan field protected dan hidden_from_tenant_admin.

**Response Format:**

```json
{
  "permissions": {
    "all": [
      {
        "id": "88f4b93c-2b29-47cf-834e-8955fdc6abf8",
        "name": "rbac:manage",
        "description": "Manage RBAC (high privilege)",
        "category": "system",
        "protected": true,
        "hidden_from_tenant_admin": true,
        "is_active": true,
        "created_at": "2025-01-01T00:00:00Z"
      },
      {
        "id": "3a15c686-0a7c-4726-a64f-1b2bacc0ef4b",
        "name": "setting:dev",
        "description": "Manage developer settings",
        "category": "system",
        "protected": true,
        "hidden_from_tenant_admin": true,
        "is_active": true,
        "created_at": "2025-01-01T00:00:00Z"
      },
      {
        "id": "a1b2c3d4-e5f6-47g8-h9i0-j1k2l3m4n5o6",
        "name": "user:read",
        "description": "Read user data",
        "category": "user",
        "protected": false,
        "hidden_from_tenant_admin": false,
        "is_active": true,
        "created_at": "2025-01-01T00:00:00Z"
      },
      {
        "id": "p7q8r9s0-t1u2-43v4-w5x6-y7z8a9b0c1d2",
        "name": "user:create",
        "description": "Create new users",
        "category": "user",
        "protected": false,
        "hidden_from_tenant_admin": false,
        "is_active": true,
        "created_at": "2025-01-01T00:00:00Z"
      }
    ],
    "by_category": {
      "system": [
        {
          "id": "88f4b93c-2b29-47cf-834e-8955fdc6abf8",
          "name": "rbac:manage",
          "description": "Manage RBAC (high privilege)",
          "category": "system",
          "protected": true,
          "hidden_from_tenant_admin": true,
          "is_active": true,
          "created_at": "2025-01-01T00:00:00Z"
        }
      ],
      "user": [
        {
          "id": "a1b2c3d4-e5f6-47g8-h9i0-j1k2l3m4n5o6",
          "name": "user:read",
          "description": "Read user data",
          "category": "user",
          "protected": false,
          "hidden_from_tenant_admin": false,
          "is_active": true,
          "created_at": "2025-01-01T00:00:00Z"
        }
      ]
    }
  }
}
```

### POST /auth/permissions

Membuat permission baru dengan optional protected dan hidden_from_tenant_admin flags.

**Request Body:**

```json
{
  "name": "rbac:manage",
  "description": "Manage RBAC (high privilege)",
  "category": "system",
  "protected": true,
  "hidden_from_tenant_admin": true
}
```

**Response:**

```json
{
  "id": "88f4b93c-2b29-47cf-834e-8955fdc6abf8",
  "name": "rbac:manage",
  "description": "Manage RBAC (high privilege)",
  "category": "system",
  "protected": true,
  "hidden_from_tenant_admin": true,
  "is_active": true,
  "created_at": "2025-01-01T00:00:00Z"
}
```

### PUT /auth/permissions/{id}

Update permission, termasuk mengubah protected dan hidden_from_tenant_admin flags.

**Request Body:**

```json
{
  "name": "rbac:manage",
  "description": "Manage RBAC (high privilege)",
  "category": "system",
  "protected": true,
  "hidden_from_tenant_admin": true
}
```

**Response:**

```json
{
  "id": "88f4b93c-2b29-47cf-834e-8955fdc6abf8",
  "name": "rbac:manage",
  "description": "Manage RBAC (high privilege)",
  "category": "system",
  "protected": true,
  "hidden_from_tenant_admin": true,
  "is_active": true,
  "created_at": "2025-01-01T00:00:00Z",
  "updated_at": "2025-01-02T00:00:00Z"
}
```

### GET /auth/permissions/{id}

Mendapatkan detail permission tertentu.

**Response:**

```json
{
  "id": "88f4b93c-2b29-47cf-834e-8955fdc6abf8",
  "name": "rbac:manage",
  "description": "Manage RBAC (high privilege)",
  "category": "system",
  "protected": true,
  "hidden_from_tenant_admin": true,
  "is_active": true,
  "created_at": "2025-01-01T00:00:00Z"
}
```

## Role Endpoints

### GET /auth/roles

Mengembalikan semua roles dengan optional protected flag.

**Response Format:**

```json
{
  "roles": [
    {
      "id": "role-uuid-1",
      "name": "SUPERADMIN",
      "description": "Super administrator with full access",
      "protected": true,
      "is_active": true,
      "created_at": "2025-01-01T00:00:00Z"
    },
    {
      "id": "role-uuid-2",
      "name": "ADMIN",
      "description": "Administrator",
      "protected": false,
      "is_active": true,
      "created_at": "2025-01-01T00:00:00Z"
    }
  ]
}
```

### POST /auth/roles

Membuat role baru dengan optional protected flag.

**Request Body:**

```json
{
  "name": "CUSTOM_ADMIN",
  "description": "Custom administrator role",
  "protected": false
}
```

**Response:**

```json
{
  "id": "role-uuid-3",
  "name": "CUSTOM_ADMIN",
  "description": "Custom administrator role",
  "protected": false,
  "is_active": true,
  "created_at": "2025-01-01T00:00:00Z"
}
```

### PUT /auth/roles/{id}

Update role, termasuk mengubah protected flag.

**Request Body:**

```json
{
  "name": "CUSTOM_ADMIN",
  "description": "Custom administrator role",
  "protected": true
}
```

**Response:**

```json
{
  "id": "role-uuid-3",
  "name": "CUSTOM_ADMIN",
  "description": "Custom administrator role",
  "protected": true,
  "is_active": true,
  "created_at": "2025-01-01T00:00:00Z",
  "updated_at": "2025-01-02T00:00:00Z"
}
```

## Authorization Rules

### Creating/Updating Protected Permissions

Backend harus enforce bahwa hanya SUPERADMIN/DEVELOPER yang dapat:
- Set `protected: true`
- Set `hidden_from_tenant_admin: true`
- Modify permissions yang sudah `protected: true`

**Example Backend Check:**

```python
# Flask/Python example
@app.route('/auth/permissions', methods=['POST'])
@require_auth(['rbac:manage'])
def create_permission():
    data = request.json
    user = get_current_user()
    
    # Check if user is trying to create protected permission
    if data.get('protected') or data.get('hidden_from_tenant_admin'):
        if not is_high_priv_user(user):
            return {'error': 'Only SUPERADMIN/DEVELOPER can create protected permissions'}, 403
    
    # Create permission
    permission = Permission.create(**data)
    return permission.to_dict(), 201
```

### Filtering Hidden Permissions

Backend dapat filter hidden permissions untuk non-high-priv users, atau frontend dapat filter berdasarkan `hidden_from_tenant_admin` flag.

**Example Backend Filter:**

```python
@app.route('/auth/permissions', methods=['GET'])
@require_auth(['rbac:view'])
def get_permissions():
    user = get_current_user()
    
    # Get all permissions
    permissions = Permission.query.all()
    
    # Filter hidden permissions for non-high-priv users
    if not is_high_priv_user(user):
        permissions = [p for p in permissions if not p.hidden_from_tenant_admin]
    
    return {
        'permissions': {
            'all': [p.to_dict() for p in permissions],
            'by_category': group_by_category(permissions)
        }
    }, 200
```

## Frontend Integration

### Handling Protected Permissions

Frontend sudah handle protected permissions dengan:

1. **Checking `protected` flag dari backend**
   ```javascript
   const isProtected = permission.protected === true;
   ```

2. **Filtering hidden permissions untuk non-high-priv users**
   ```javascript
   if (!isHighPriv) {
     permissionsArray = permissionsArray.filter(perm => 
       perm.hidden_from_tenant_admin !== true
     );
   }
   ```

3. **Showing/hiding edit/delete buttons**
   ```javascript
   const permProtection = getPermissionProtectionInfo(permission, currentUser);
   
   {permProtection.canEdit && <EditButton />}
   {permProtection.canDelete && <DeleteButton />}
   ```

## Migration Checklist

Jika backend belum support protected permissions, berikut checklist untuk implementasi:

- [ ] Add `protected` column ke permissions table (default: false)
- [ ] Add `hidden_from_tenant_admin` column ke permissions table (default: false)
- [ ] Add `protected` column ke roles table (default: false)
- [ ] Update GET /auth/permissions endpoint untuk return field baru
- [ ] Update GET /auth/roles endpoint untuk return field baru
- [ ] Update POST /auth/permissions endpoint untuk accept field baru
- [ ] Update PUT /auth/permissions/{id} endpoint untuk accept field baru
- [ ] Update POST /auth/roles endpoint untuk accept field baru
- [ ] Update PUT /auth/roles/{id} endpoint untuk accept field baru
- [ ] Add authorization check untuk protected operations
- [ ] Add filtering untuk hidden permissions (optional, frontend dapat handle)
- [ ] Update API documentation

