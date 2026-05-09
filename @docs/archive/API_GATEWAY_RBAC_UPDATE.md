# API Gateway RBAC Enhancement

## 📋 Overview

API Gateway telah diupdate dari **v2.1.0** ke **v2.2.0** dengan fitur Enhanced RBAC (Role-Based Access Control) untuk fully support perubahan pada auth-service.

---

## 🔄 What's Changed

### Version Update
- **Previous:** v2.1.0 - Production Ready with Duplicate Routes Fixed
- **Current:** v2.2.0 - Production Ready with Enhanced RBAC Support

---

## ✨ New Features

### 1. Enhanced Permission Checking

**New Function:** `check_permission(user_permissions, required_permissions)`

Supports advanced permission checking dengan wildcard:
- `*` - Admin wildcard (grants all permissions)
- `category:*` - Category wildcard (e.g., `patient:*` grants `patient:read`, `patient:write`, etc.)
- `category:action` - Specific permission (e.g., `patient:read`)

**Example:**
```python
# User has 'patient:*' permission
user_permissions = ['patient:*', 'worklist:read']

# Can access patient:read, patient:write, patient:update, patient:delete
check_permission(user_permissions, ['patient:read'])  # True
check_permission(user_permissions, ['patient:delete'])  # True

# Cannot access order endpoints
check_permission(user_permissions, ['order:create'])  # False
```

### 2. Improved `require_auth` Decorator

**Enhanced Features:**
- Better logging for permission denials
- Detailed error messages for users
- Wildcard permission support
- OR logic for required permissions (any match grants access)

**Before:**
```python
@require_auth(['*'])  # Only admin
def admin_only_endpoint():
    pass
```

**After:**
```python
@require_auth(['user:read', 'user:manage', '*'])  # user:read OR user:manage OR admin
def user_list_endpoint():
    pass
```

---

## 🔐 New Auth Endpoints

### User Management Endpoints

| Endpoint | Method | Permission | Description |
|----------|--------|------------|-------------|
| `/auth/me` | GET | (authenticated) | Get current user profile |
| `/auth/change-password` | POST | (authenticated) | Change current user password |
| `/auth/users` | GET | `user:read`, `user:manage`, `*` | List all users |
| `/auth/users` | POST | `user:create`, `user:manage`, `*` | Create new user |
| `/auth/users/{id}` | GET | `user:read`, `user:manage`, `*` | Get user by ID |
| `/auth/users/{id}` | PUT | `user:update`, `user:manage`, `*` | Update user |
| `/auth/users/{id}` | DELETE | `user:delete`, `user:manage`, `*` | Delete user (soft delete) |
| `/auth/users/{id}/change-password` | POST | `user:update`, `user:manage`, `*` | Change user password |
| `/auth/users/{id}/activate` | POST | `user:manage`, `*` | Activate user account |
| `/auth/users/{id}/deactivate` | POST | `user:manage`, `*` | Deactivate user account |

### Role Management Endpoints

| Endpoint | Method | Permission | Description |
|----------|--------|------------|-------------|
| `/auth/roles` | GET | `system:admin`, `*` | List all roles |
| `/auth/roles` | POST | `system:admin`, `*` | Create new role |
| `/auth/roles/{name}` | GET | `system:admin`, `*` | Get role details |
| `/auth/roles/{name}/users` | GET | `system:admin`, `*` | Get users in role |
| `/auth/roles/{id}/permissions` | GET | `system:admin`, `*` | Get role permissions |
| `/auth/roles/{id}/permissions` | POST | `system:admin`, `*` | Assign permission to role |
| `/auth/roles/{id}/permissions/{pid}` | DELETE | `system:admin`, `*` | Remove permission from role |

### Permission Management Endpoints

| Endpoint | Method | Permission | Description |
|----------|--------|------------|-------------|
| `/auth/permissions` | GET | `system:admin`, `*` | List all permissions |
| `/auth/permissions` | POST | `system:admin`, `*` | Create new permission |
| `/auth/permissions/check` | POST | (authenticated) | Check user permission |

### User-Role Assignment Endpoints

| Endpoint | Method | Permission | Description |
|----------|--------|------------|-------------|
| `/auth/users/{id}/roles` | GET | `user:read`, `user:manage`, `*` | Get user roles |
| `/auth/users/{id}/roles` | POST | `user:manage`, `*` | Assign role to user |
| `/auth/users/{id}/roles/{rid}` | DELETE | `user:manage`, `*` | Remove role from user |

### User-Permission Assignment Endpoints

| Endpoint | Method | Permission | Description |
|----------|--------|------------|-------------|
| `/auth/users/{id}/permissions` | GET | `user:read`, `user:manage`, `*` | Get user permissions |
| `/auth/users/{id}/permissions` | POST | `user:manage`, `*` | Assign permission to user |
| `/auth/users/{id}/permissions/{pid}` | DELETE | `user:manage`, `*` | Remove permission from user |

### Cache Management Endpoints

| Endpoint | Method | Permission | Description |
|----------|--------|------------|-------------|
| `/auth/cache/clear` | POST | `system:admin`, `*` | Clear permission cache |
| `/auth/cache/stats` | GET | `system:admin`, `*` | Get cache statistics |

---

## 🔧 Technical Changes

### File: `api-gateway/api_gateway.py`

**1. Enhanced Permission Checking (Lines 84-109)**
```python
def check_permission(user_permissions, required_permissions):
    """
    Check if user has any of the required permissions
    Supports wildcard permissions (*, category:*)
    """
    if not required_permissions:
        return True

    # Admin wildcard permission
    if '*' in user_permissions:
        return True

    # Check each required permission
    for required in required_permissions:
        # Direct match
        if required in user_permissions:
            return True

        # Check category wildcard (e.g., 'patient:*' for 'patient:read')
        if ':' in required:
            category = required.split(':')[0]
            category_wildcard = f"{category}:*"
            if category_wildcard in user_permissions:
                return True

    return False
```

**2. Enhanced `require_auth` Decorator (Lines 111-168)**
- Added better logging
- Added permission checking with wildcard support
- Added detailed error messages

**3. New Auth Route Handlers (Lines 329-549)**
- 40+ new specific route handlers
- Organized by categories (User, Role, Permission, Cache)
- Each endpoint dengan proper permission requirements
- Catch-all proxy untuk backward compatibility

---

## 📊 Permission Matrix

### Permission Categories

| Category | Permissions | Description |
|----------|-------------|-------------|
| `user` | `read`, `create`, `update`, `delete`, `manage` | User management |
| `patient` | `read`, `create`, `update`, `delete`, `*` | Patient data |
| `order` | `read`, `create`, `update`, `delete`, `*` | Order management |
| `worklist` | `read`, `create`, `update`, `delete`, `scan`, `search`, `*` | Worklist operations |
| `dicom` / `orthanc` | `read`, `write`, `delete`, `*` | DICOM/Orthanc access |
| `accession` | `read`, `create`, `update`, `delete`, `admin` | Accession numbers |
| `system` | `admin`, `config`, `logs` | System administration |
| `*` | - | Wildcard (all permissions) |

### Role Permissions (from auth-service)

| Role | Key Permissions |
|------|----------------|
| **ADMIN** | `*` (all) |
| **DOCTOR** | `order:read`, `order:create`, `worklist:read`, `worklist:update`, `orthanc:read` |
| **TECHNICIAN** | `worklist:read`, `worklist:update`, `worklist:scan`, `orthanc:read`, `orthanc:write` |
| **RECEPTIONIST** | `order:read`, `order:create`, `worklist:create`, `worklist:read`, `worklist:search` |
| **VIEWER** | `worklist:read`, `orthanc:read` |

---

## 🔄 Migration Guide

### For Frontend Developers

**Before (v2.1.0):**
```javascript
// Login and get token
const response = await fetch('http://localhost:8888/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
});
const { access_token } = await response.json();

// Token contains basic user info
const payload = jwt_decode(access_token);
console.log(payload.role);  // 'ADMIN'
console.log(payload.permissions);  // ['*']
```

**After (v2.2.0):**
```javascript
// Login (same)
const response = await fetch('http://localhost:8888/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
});
const { access_token, user } = await response.json();

// Get full user profile with permissions
const profileResponse = await fetch('http://localhost:8888/auth/me', {
    headers: { 'Authorization': `Bearer ${access_token}` }
});
const profile = await profileResponse.json();

console.log(profile.user.role);  // 'ADMIN'
console.log(profile.user.permissions);  // Array of permission objects with details

// Check specific permission
const checkResponse = await fetch('http://localhost:8888/auth/permissions/check', {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({ permission: 'patient:read' })
});
const { has_permission } = await checkResponse.json();

// List all users (admin only)
const usersResponse = await fetch('http://localhost:8888/auth/users?page=1&limit=20', {
    headers: { 'Authorization': `Bearer ${access_token}` }
});
const { data } = await usersResponse.json();

// Assign role to user (admin only)
await fetch(`http://localhost:8888/auth/users/${userId}/roles`, {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({ role_id: roleId })
});
```

### For Backend Services

**No changes required** - All existing auth integrations remain compatible. Gateway forwards JWT tokens unchanged.

---

## 🚀 Deployment

### Development
```bash
# Rebuild dan restart api-gateway
docker-compose up -d --build api-gateway

# Check logs
docker logs api-gateway -f
```

### Production
```bash
# Pull latest image
docker-compose pull api-gateway

# Recreate container
docker-compose up -d --force-recreate --no-deps api-gateway

# Verify
curl http://localhost:8888/
curl http://localhost:8888/health?detailed=true
```

**Expected Output:**
```json
{
  "service": "API Gateway",
  "version": "2.2.0 - Production Ready with Enhanced RBAC",
  "status": "running",
  "features": [
    "JWT Authentication with RBAC",
    "Role-Based Access Control (RBAC)",
    "Permission Management",
    "User Management",
    "Centralized Auth Proxy",
    "Rate Limiting",
    "CORS Support"
  ]
}
```

---

## 🧪 Testing

### Test Authentication
```bash
# Login
curl -X POST http://localhost:8888/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@12345"}'

# Response:
{
  "status": "success",
  "access_token": "eyJ...",
  "user": {
    "id": "uuid",
    "username": "admin",
    "role": "ADMIN",
    "permissions": ["*"]
  }
}
```

### Test Permission Checking
```bash
# Check permission
curl -X POST http://localhost:8888/auth/permissions/check \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"permission":"patient:read"}'

# Response:
{
  "status": "success",
  "has_permission": true,
  "permission": "patient:read",
  "user_role": "ADMIN"
}
```

### Test User Management
```bash
# List users (admin only)
curl http://localhost:8888/auth/users?page=1&limit=10 \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Create user (admin only)
curl -X POST http://localhost:8888/auth/users \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "doctor01",
    "email": "doctor@hospital.com",
    "password": "SecurePass123",
    "full_name": "Dr. John Doe",
    "role": "DOCTOR"
  }'
```

### Test Role Assignment
```bash
# Get user roles
curl http://localhost:8888/auth/users/{user_id}/roles \
  -H "Authorization: Bearer YOUR_TOKEN"

# Assign role
curl -X POST http://localhost:8888/auth/users/{user_id}/roles \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"role_id":"role-uuid"}'
```

---

## 📚 API Documentation

### Error Responses

**401 Unauthorized**
```json
{
  "status": "error",
  "message": "Missing or invalid authorization header"
}
```

**403 Forbidden**
```json
{
  "status": "error",
  "message": "Insufficient permissions",
  "required": ["user:manage", "*"],
  "hint": "Contact administrator to request access"
}
```

**404 Not Found**
```json
{
  "status": "error",
  "message": "User not found"
}
```

**503 Service Unavailable**
```json
{
  "status": "error",
  "message": "Service unavailable",
  "detail": "Connection refused"
}
```

---

## ⚠️ Breaking Changes

**None** - All changes are backward compatible. Existing endpoints continue to work as before.

---

## 🔒 Security Improvements

1. **Granular Permission Control:** Fine-grained access control dengan wildcard support
2. **Enhanced Logging:** Detailed permission denial logging untuk security audit
3. **Better Error Messages:** User-friendly error messages tanpa expose sensitive info
4. **Rate Limiting:** Login endpoint limited to 5/minute, registration to 10/hour
5. **Permission Caching:** Auth-service menggunakan LRU cache untuk performance

---

## 📝 Notes

1. **Backward Compatibility:** Semua existing integrations tetap compatible
2. **JWT Token:** Token format tidak berubah, hanya permission checking yang enhanced
3. **Database:** Menggunakan RBAC database schema dari auth-service
4. **Performance:** Permission checking dilakukan di gateway level untuk faster response
5. **Cache Management:** Admin bisa clear permission cache via API

---

## 🎯 Next Steps

1. **Frontend Update:** Update UI untuk support new endpoints
2. **Admin Panel:** Build admin panel untuk user/role/permission management
3. **Documentation:** Create API documentation dengan Swagger/OpenAPI
4. **Monitoring:** Add metrics untuk permission checking
5. **Testing:** Comprehensive integration tests

---

## 📞 Support

For issues or questions:
- Check logs: `docker logs api-gateway -f`
- Check auth-service: `docker logs auth-service -f`
- Verify database: Check PostgreSQL logs
- Test endpoints: Use provided curl examples above

---

## ✅ Checklist

- [x] Enhanced permission checking with wildcard support
- [x] New RBAC endpoints (40+ routes)
- [x] Improved error handling and logging
- [x] Backward compatibility maintained
- [x] Documentation created
- [ ] Frontend integration
- [ ] Integration tests
- [ ] Performance testing
- [ ] Security audit
