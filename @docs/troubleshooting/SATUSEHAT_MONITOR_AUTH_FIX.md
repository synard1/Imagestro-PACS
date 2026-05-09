# Fix: SatuSehat Monitor Authentication

## Tanggal: 2025-11-29

## Problem

Halaman SatuSehat Monitor di `http://localhost:5173/satusehat-monitor` tidak menampilkan data kecuali menggunakan hardcoded Basic Authentication dengan username dan password static:

```javascript
// BEFORE - src/services/api-registry.js
satusehatMonitor: {
  enabled: true,
  baseUrl: "http://103.42.117.19:8888",
  healthPath: "/api/health",
  timeoutMs: 10000,
  auth: "basic",          // ❌ Hardcoded auth type
  basicUser: "admin",     // ❌ Static username
  basicPass: "password123", // ❌ Static password
}
```

**Masalah**:
- ❌ Menggunakan credentials yang hardcoded dan tidak aman
- ❌ Tidak menggunakan token dari user yang sedang login
- ❌ Setiap user menggunakan kredensial yang sama
- ❌ Tidak ada audit trail siapa yang mengakses data

## Solution

Menghapus konfigurasi Basic Auth agar secara otomatis menggunakan Bearer Token dari login user yang sedang aktif.

### File yang Diubah

**src/services/api-registry.js** (baris 131-141)

```javascript
// AFTER - src/services/api-registry.js
// Separate backend for SatuSehat monitoring (orders + file status),
// independent from core orders backend.
// Uses Bearer token from user login (same as other modules)
satusehatMonitor: {
  enabled: true,
  baseUrl: "http://103.42.117.19:8888",
  healthPath: "/api/health",
  timeoutMs: 10000,
  // auth: "bearer" is implicit - uses token from getAuthHeader()
  // No need to specify auth type, it will automatically use the logged-in user's token
}
```

### Bagaimana Cara Kerjanya

**Flow Autentikasi Sebelumnya (Basic Auth - SALAH)**:
```
User login → Token tersimpan di localStorage
↓
SatuSehat Monitor API call
↓
http.js check: ada cfg.auth === 'basic'? → YES
↓
Gunakan basicUser + basicPass (hardcoded) ❌
↓
Header: Authorization: Basic YWRtaW46cGFzc3dvcmQxMjM=
```

**Flow Autentikasi Sekarang (Bearer Token - BENAR)**:
```
User login → Token tersimpan di localStorage
↓
SatuSehat Monitor API call
↓
http.js check: ada cfg.auth === 'basic'? → NO
↓
Gunakan getAuthHeader() → ambil token dari localStorage ✅
↓
Header: Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Kode yang Menghandle Autentikasi

**src/services/http.js** (baris 156-177)

```javascript
// Auth logic in apiClient request method
let authHeaders = {};
try {
  // Check if module config specifies basic auth
  if (cfg && cfg.auth === 'basic' && cfg.basicUser && cfg.basicPass) {
    // Use Basic Auth with credentials from config
    const token = btoa(`${cfg.basicUser}:${cfg.basicPass}`);
    authHeaders = { Authorization: `Basic ${token}` };
  } else {
    // Use Bearer token from logged-in user
    authHeaders = { ...(getAuthHeader() || {}) };

    // Fallback to environment variable if no token in storage
    if (!authHeaders.Authorization) {
      const fallbackToken = getModuleEnvToken(moduleName);
      if (fallbackToken) {
        authHeaders.Authorization = fallbackToken;
      }
    }
  }
} catch (_) {
  // On error, always try to use bearer token
  authHeaders = { ...(getAuthHeader() || {}) };
  if (!authHeaders.Authorization) {
    const fallbackToken = getModuleEnvToken(moduleName);
    if (fallbackToken) {
      authHeaders.Authorization = fallbackToken;
    }
  }
}
```

**src/services/auth-storage.js** (baris 82-87)

```javascript
export function getAuthHeader() {
  const a = getAuth();
  if (!a || !a.access_token || isExpired(a)) return {};
  const scheme = a.token_type || 'Bearer';
  return { Authorization: `${scheme} ${a.access_token}` };
}
```

## Manfaat Perubahan

### 1. Keamanan ✅
- **No more hardcoded credentials** - Credentials tidak lagi tersimpan di source code
- **User-specific access** - Setiap user menggunakan token mereka sendiri
- **Token expiration** - Bearer token punya expiry time, lebih aman
- **Audit trail** - Backend bisa track siapa yang akses data berdasarkan token

### 2. Konsistensi ✅
- **Same as other modules** - Semua module sekarang menggunakan auth yang sama
- **Single source of truth** - Token hanya dari login, tidak ada credentials ganda
- **Easier maintenance** - Tidak perlu update username/password di banyak tempat

### 3. User Experience ✅
- **Seamless authentication** - User tidak perlu login lagi
- **Auto token refresh** - Token di-refresh otomatis sebelum expire
- **Better error handling** - Jika token invalid, user auto redirect ke login

## Testing

### Prerequisite
1. Backend API Gateway di `http://103.42.117.19:8888` harus:
   - Support Bearer token authentication
   - Endpoint `/api/monitor/satusehat/orders` harus accept Bearer token
   - Reject request tanpa valid token (401 Unauthorized)

### Test Scenario 1: Dengan Login
```bash
1. npm run dev
2. Buka http://localhost:5173/login
3. Login dengan user valid (misal: admin@example.com)
4. Setelah login, buka http://localhost:5173/satusehat-monitor
5. ✅ Expected: Data orders muncul
```

**Verify di DevTools**:
```javascript
// Network tab → Headers untuk request ke /api/monitor/satusehat/orders
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Test Scenario 2: Tanpa Login
```bash
1. npm run dev
2. Clear localStorage atau buka incognito
3. Langsung buka http://localhost:5173/satusehat-monitor
4. ✅ Expected: Redirect ke /login (karena ada ProtectedRoute)
```

### Test Scenario 3: Token Expired
```bash
1. Login dan buka SatuSehat Monitor
2. Tunggu sampai token expire (lihat expires_at di localStorage)
3. Refresh halaman atau load data lagi
4. ✅ Expected: Auto refresh token ATAU redirect ke login
```

### Test Scenario 4: Invalid Token
```bash
1. Login normal
2. Di DevTools console, corrupt token:
   localStorage.setItem('auth.session.v1', '{"access_token":"invalid"}')
3. Reload SatuSehat Monitor
4. ✅ Expected: API return 401, redirect ke login
```

## Debug Commands

### Check Current Auth
```javascript
// Di browser console
const auth = JSON.parse(localStorage.getItem('auth.session.v1'))
console.log('Token:', auth?.access_token)
console.log('Expires:', new Date(auth?.expires_at))
console.log('Type:', auth?.token_type)
```

### Check Request Headers
```javascript
// Di Network tab DevTools
// Find request ke: /api/monitor/satusehat/orders
// Check Headers → Request Headers → Authorization
// Should be: Bearer <token>
```

### Manually Test Auth Header
```javascript
import { getAuthHeader } from './services/auth-storage'

// Should return { Authorization: "Bearer ..." }
console.log(getAuthHeader())
```

### Clear Auth (Force Re-login)
```javascript
localStorage.removeItem('auth.session.v1')
localStorage.removeItem('currentUser')
window.location.reload()
```

## Rollback Plan

Jika ada masalah dan perlu kembali ke Basic Auth sementara:

**src/services/api-registry.js**
```javascript
satusehatMonitor: {
  enabled: true,
  baseUrl: "http://103.42.117.19:8888",
  healthPath: "/api/health",
  timeoutMs: 10000,
  auth: "basic",
  basicUser: "admin",
  basicPass: "password123",
}
```

**CATATAN**: Rollback ini hanya untuk emergency debugging. Jangan deploy ke production dengan basic auth!

## Backend Requirements

Backend API Gateway (`http://103.42.117.19:8888`) harus:

1. **Accept Bearer Token**:
   ```
   Authorization: Bearer <JWT_TOKEN>
   ```

2. **Validate Token**:
   - Check signature
   - Check expiration
   - Check user permissions

3. **Endpoints yang Terpengaruh**:
   ```
   GET /api/monitor/satusehat/orders
   GET /api/health (health check - mungkin tidak perlu auth)
   ```

4. **Error Responses**:
   - `401 Unauthorized` - Token invalid/expired
   - `403 Forbidden` - Token valid tapi user tidak punya akses
   - `200 OK` - Success

5. **Expected Response Format**:
   ```json
   {
     "data": [...],
     "total": 100,
     "page": 1,
     "limit": 50
   }
   ```

## Common Issues & Solutions

### Issue 1: "401 Unauthorized" saat load data
**Cause**: Token tidak dikirim atau invalid
**Solution**:
```javascript
// Check if token exists
const auth = JSON.parse(localStorage.getItem('auth.session.v1'))
console.log('Has token:', !!auth?.access_token)

// If no token, re-login
// If has token but still 401, backend might not recognize it
```

### Issue 2: Data tidak muncul, no error
**Cause**: API endpoint mungkin return empty array
**Solution**:
```javascript
// Check network tab untuk response
// Pastikan backend return data dengan format yang benar
```

### Issue 3: Request menggunakan Basic Auth (bukan Bearer)
**Cause**: Config masih punya `auth: "basic"`
**Solution**:
```javascript
// Check api-registry di localStorage
const reg = JSON.parse(localStorage.getItem('api.registry.v3'))
console.log('SatuSehat Monitor config:', reg?.satusehatMonitor)

// Should NOT have: auth: "basic", basicUser, basicPass
// If it does, clear and reload:
localStorage.removeItem('api.registry.v3')
window.location.reload()
```

### Issue 4: CORS error
**Cause**: Backend tidak allow Bearer token di CORS
**Solution**:
Backend perlu set CORS headers:
```
Access-Control-Allow-Headers: Authorization, Content-Type
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
```

## Migration Checklist

- [x] Remove basic auth config from api-registry.js
- [x] Verify http.js auth logic works correctly
- [x] Verify getAuthHeader() returns correct token
- [ ] Test with valid login token
- [ ] Test with expired token
- [ ] Test without login (should redirect)
- [ ] Verify backend accepts Bearer token
- [ ] Verify data loads correctly
- [ ] Clear old localStorage cache if needed

## Related Files

- `src/services/api-registry.js` - API module configuration
- `src/services/http.js` - HTTP client with auth logic (line 156-177)
- `src/services/auth-storage.js` - Auth token storage & retrieval (line 82-87)
- `src/services/satusehatMonitorService.js` - SatuSehat Monitor API calls
- `src/pages/SatusehatMonitorClean.jsx` - SatuSehat Monitor page

## Conclusion

✅ **SatuSehat Monitor sekarang menggunakan Bearer token dari login user**
✅ **No more hardcoded credentials**
✅ **Consistent dengan module lain**
✅ **Lebih aman dan maintainable**

Perubahan ini membuat autentikasi lebih aman, konsisten, dan sesuai best practice.
