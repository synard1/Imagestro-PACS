# User Management Configuration Guide

## Overview

User Management dengan RBAC sekarang mendukung **dual mode operation**:
1. **Backend Mode** - Menggunakan backend API (production)
2. **Local Mock Mode** - Menggunakan data JSON local (development/demo)

Mode ditentukan oleh konfigurasi di **API Registry** (`localStorage['api.registry.v1']`).

---

## 🔧 Configuration

### 1. **Local Mock Mode (Default)**

Untuk development tanpa backend:

```javascript
// Browser Console atau Settings Page
const registry = {
  users: {
    enabled: false,  // ← Set ke false untuk mock mode
    baseUrl: 'http://localhost:8087',
    healthPath: '/api/health',
    timeoutMs: 6000
  }
};

localStorage.setItem('api.registry.v1', JSON.stringify(registry));
location.reload();
```

**Characteristics:**
- ✅ Tidak perlu backend running
- ✅ Data persisten di memory selama browser session
- ✅ Cocok untuk development dan demo
- ✅ Support semua operasi CRUD
- ⚠️ Data reset setiap refresh page
- ⚠️ Tidak ada real authentication

---

### 2. **Backend Mode (Production)**

Untuk production dengan backend API:

```javascript
// Browser Console atau Settings Page
const registry = {
  users: {
    enabled: true,  // ← Set ke true untuk backend mode
    baseUrl: 'http://103.42.117.19:8888',  // Backend URL
    healthPath: '/health',
    timeoutMs: 6000
  }
};

localStorage.setItem('api.registry.v1', JSON.stringify(registry));
location.reload();
```

**Characteristics:**
- ✅ Real authentication & authorization
- ✅ Data persistent di database
- ✅ Production ready
- ✅ Full RBAC support
- ⚠️ Membutuhkan backend API running
- ⚠️ Perlu valid JWT token

---

## 📁 Local Mock Data Source

### `src/data/users.json`
```json
[
  {
    "id": "u-100",
    "name": "Rani Technologist",
    "role": "technologist",
    "permissions": ["worklist.view", "order.view", ...]
  },
  {
    "id": "u-101",
    "name": "Arif Admin",
    "role": "admin",
    "permissions": ["*", ...]
  },
  {
    "id": "u-102",
    "name": "Dina Clerk",
    "role": "clerk",
    "permissions": ["worklist.view", "order.view", ...]
  }
]
```

### `src/services/mockUserService.js`
Implementasi lengkap mock API untuk:
- User CRUD operations
- Role CRUD operations
- Permission CRUD operations
- Role-Permission assignments
- User-Role assignments
- Cache management (no-op)

**In-Memory Data:**
- 3 sample users (dari users.json)
- 4 default roles (ADMIN, TECHNOLOGIST, CLERK, VIEWER)
- 8 default permissions
- Pre-configured relationships

---

## 🔄 How It Works

### Service Layer Architecture

```
UserManagement Component
        ↓
    userService.js ← Check api-registry
        ↓
   /           \
  Backend      Mock
  API ↓        Service ↓
```

### `userService.js` Implementation

```javascript
// Check configuration
const isBackendEnabled = () => {
  const registry = loadRegistry();
  return registry.users?.enabled === true;
};

// Conditional routing
export const getUsers = async (params) => {
  if (!isBackendEnabled()) {
    return mockUserService.getUsers(params);  // Mock
  }

  // Backend API call
  return backendFetch(`/auth/users?${queryParams}`, {
    headers: getAuthHeader(),
  });
};
```

---

## 🧪 Testing

### Test 1: Local Mock Mode

**Steps:**
1. Open browser console (F12)
2. Run configuration for mock mode:
```javascript
const registry = JSON.parse(localStorage.getItem('api.registry.v1') || '{}');
registry.users = { enabled: false };
localStorage.setItem('api.registry.v1', JSON.stringify(registry));
location.reload();
```

3. Navigate to: **User Management → Users**
4. Verify:
   - ✅ 3 users loaded (Rani, Arif, Dina)
   - ✅ Can create new user
   - ✅ Can edit user
   - ✅ Can delete user
   - ✅ Can toggle active status

5. Navigate to: **User Management → Roles**
6. Verify:
   - ✅ 4 roles loaded (ADMIN, TECHNOLOGIST, CLERK, VIEWER)
   - ✅ Can create new role
   - ✅ Can edit role
   - ✅ Can delete role
   - ✅ Can assign/remove permissions

7. Navigate to: **User Management → Permissions**
8. Verify:
   - ✅ 8 permissions loaded
   - ✅ Can create new permission
   - ✅ Can edit permission
   - ✅ Can delete permission

**Expected Result:**
- All operations work without backend
- Success messages appear
- Data persists during session
- No authentication errors

---

### Test 2: Backend Mode

**Prerequisites:**
- Backend API running at configured URL
- Valid JWT token in localStorage

**Steps:**
1. Open browser console (F12)
2. Run configuration for backend mode:
```javascript
const registry = JSON.parse(localStorage.getItem('api.registry.v1') || '{}');
registry.users = {
  enabled: true,
  baseUrl: 'http://103.42.117.19:8888'
};
localStorage.setItem('api.registry.v1', JSON.stringify(registry));
location.reload();
```

3. Navigate to: **User Management**
4. Verify:
   - ✅ Real data from backend loaded
   - ✅ Operations persist to database
   - ✅ Authentication required
   - ✅ Authorization checked

**Expected Result:**
- All operations use real backend API
- Data persists across sessions
- Full RBAC enforced

---

## 🚨 Troubleshooting

### Issue 1: "No authentication token found"
**Cause:** Backend mode enabled but not logged in
**Solution:**
- Login with valid credentials
- OR switch to mock mode for development

### Issue 2: "Failed to load users"
**Cause:** Backend enabled but API not reachable
**Solution:**
```javascript
// Check backend status
const registry = JSON.parse(localStorage.getItem('api.registry.v1') || '{}');
console.log('Users config:', registry.users);

// Switch to mock mode temporarily
registry.users.enabled = false;
localStorage.setItem('api.registry.v1', JSON.stringify(registry));
location.reload();
```

### Issue 3: Users list is empty in mock mode
**Cause:** Mock data not loaded properly
**Solution:**
- Check `src/data/users.json` exists
- Check console for import errors
- Refresh page

### Issue 4: Changes not persisting in mock mode
**Expected Behavior:** Mock mode uses in-memory storage
- Data resets on page refresh
- This is by design for development
- For persistent data, use backend mode

---

## 🔐 Security Considerations

### Mock Mode
- ⚠️ **Development Only** - Not for production
- ⚠️ No real authentication
- ⚠️ No authorization checks
- ⚠️ Data not encrypted
- ⚠️ No audit logging

### Backend Mode
- ✅ Full JWT authentication
- ✅ RBAC authorization
- ✅ Encrypted communication
- ✅ Complete audit trail
- ✅ Production ready

---

## 📊 Feature Comparison

| Feature | Mock Mode | Backend Mode |
|---------|-----------|--------------|
| User CRUD | ✅ | ✅ |
| Role CRUD | ✅ | ✅ |
| Permission CRUD | ✅ | ✅ |
| Role-Permission Assignment | ✅ | ✅ |
| User-Role Assignment | ✅ | ✅ |
| Password Generation | ✅ | ✅ |
| Search & Filter | ✅ | ✅ |
| Pagination | ✅ | ✅ |
| Authentication | ❌ | ✅ |
| Authorization | ❌ | ✅ |
| Data Persistence | ❌ | ✅ |
| Audit Logging | ❌ | ✅ |
| Cache Management | ✅ (no-op) | ✅ |
| Production Ready | ❌ | ✅ |

---

## 💡 Best Practices

### Development
1. Use **mock mode** for:
   - UI development
   - Testing components
   - Demo purposes
   - No backend available

2. Switch to **backend mode** when:
   - Testing integration
   - Validating API contracts
   - Performance testing
   - UAT/staging

### Production
1. **Always use backend mode**
2. Set proper baseUrl in registry
3. Ensure authentication configured
4. Monitor API health
5. Set appropriate timeouts

---

## 🔄 Migration Path

### From Mock to Backend

**Step 1:** Test with backend enabled
```javascript
registry.users.enabled = true;
```

**Step 2:** Verify all operations work

**Step 3:** Deploy to production with backend enabled

### Fallback to Mock

If backend is down, temporarily switch to mock for demo:
```javascript
registry.users.enabled = false;
```

---

## 📝 Configuration Reference

### Complete Registry Object

```javascript
{
  "users": {
    "enabled": false,  // true = backend, false = mock
    "baseUrl": "http://103.42.117.19:8888",  // Backend API URL
    "healthPath": "/health",  // Health check endpoint
    "timeoutMs": 6000  // Request timeout
  },
  // ... other services
}
```

### Access via Console

**Check current config:**
```javascript
const registry = JSON.parse(localStorage.getItem('api.registry.v1') || '{}');
console.log(registry.users);
```

**Toggle mode:**
```javascript
const registry = JSON.parse(localStorage.getItem('api.registry.v1') || '{}');
registry.users = registry.users || {};
registry.users.enabled = !registry.users.enabled;  // Toggle
localStorage.setItem('api.registry.v1', JSON.stringify(registry));
console.log('Users mode:', registry.users.enabled ? 'Backend' : 'Mock');
location.reload();
```

---

## 🎯 Summary

✅ **Dual Mode Support:** Backend & Mock
✅ **Easy Switching:** Via api-registry config
✅ **Development Friendly:** Mock mode with sample data
✅ **Production Ready:** Full backend integration
✅ **Zero Code Changes:** Configuration driven
✅ **Comprehensive RBAC:** Users, Roles, Permissions

**Default State:** Mock mode (enabled: false)
**Recommended for Production:** Backend mode (enabled: true)

---

**Last Updated:** 2025-11-02
**Status:** ✅ Production Ready
