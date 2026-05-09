# Quick Test Guide - SatuSehat Monitor Auth Fix

## 🚀 Quick Start

### 1. Clear Old Config (IMPORTANT!)
```bash
# Di browser DevTools Console
localStorage.removeItem('api.registry.v3')
localStorage.removeItem('api.registry.v2')
localStorage.removeItem('api.registry.v1')
window.location.reload()
```

### 2. Start Development Server
```bash
npm run dev
```

### 3. Login
```
1. Buka: http://localhost:5173/login
2. Login dengan credentials yang valid
3. Pastikan redirect ke dashboard setelah login
```

### 4. Test SatuSehat Monitor
```
1. Buka: http://localhost:5173/satusehat-monitor
2. ✅ EXPECTED: Data muncul
3. ❌ FAIL: Jika 401 atau data kosong, lihat troubleshooting
```

## 🔍 Verify Auth Headers

### Check Network Request
```
1. Buka DevTools → Network tab
2. Refresh halaman SatuSehat Monitor
3. Find request ke: /api/monitor/satusehat/orders
4. Click request → Headers tab
5. Scroll ke Request Headers
6. Look for:
   Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

✅ CORRECT: Authorization header ada dengan Bearer token
❌ WRONG:
   - No Authorization header
   - Authorization: Basic ... (should be Bearer now!)
   - Authorization header kosong
```

### Check localStorage Token
```javascript
// Di DevTools Console
const auth = JSON.parse(localStorage.getItem('auth.session.v1'))
console.log('Token exists:', !!auth?.access_token)
console.log('Token type:', auth?.token_type)
console.log('Expires at:', new Date(auth?.expires_at))

// ✅ Should show:
// Token exists: true
// Token type: Bearer
// Expires at: (future date)
```

### Check API Registry Config
```javascript
// Di DevTools Console
const reg = JSON.parse(localStorage.getItem('api.registry.v3')) || {}
console.log('SatuSehat Monitor Config:', reg.satusehatMonitor)

// ✅ CORRECT: Should NOT have these fields:
//    - auth: "basic"
//    - basicUser: "admin"
//    - basicPass: "password123"

// ✅ CORRECT: Should only have:
//    - enabled: true
//    - baseUrl: "http://103.42.117.19:8888"
//    - healthPath: "/api/health"
//    - timeoutMs: 10000
```

## 🧪 Test Scenarios

### ✅ Scenario 1: Happy Path
```
1. Login berhasil
2. Token tersimpan di localStorage
3. Buka SatuSehat Monitor
4. Request menggunakan Bearer token
5. Data muncul

Result: PASS ✅
```

### ✅ Scenario 2: No Login
```
1. Buka incognito window
2. Langsung buka /satusehat-monitor tanpa login
3. Redirect ke /login

Result: PASS ✅ (protected route works)
```

### ✅ Scenario 3: Expired Token
```
1. Login normal
2. Manually set token expired:
   const auth = JSON.parse(localStorage.getItem('auth.session.v1'))
   auth.expires_at = Date.now() - 1000
   localStorage.setItem('auth.session.v1', JSON.stringify(auth))
3. Refresh SatuSehat Monitor
4. Should auto-refresh token OR redirect to login

Result: PASS ✅
```

## 🐛 Troubleshooting

### Problem: Still using Basic Auth
**Symptom**:
```
Network tab shows:
Authorization: Basic YWRtaW46cGFzc3dvcmQxMjM=
```

**Solution**:
```javascript
// 1. Clear registry
localStorage.removeItem('api.registry.v3')
localStorage.removeItem('api.registry.v2')
localStorage.removeItem('api.registry.v1')

// 2. Reload page
window.location.reload()

// 3. Verify config is clean
const reg = JSON.parse(localStorage.getItem('api.registry.v3'))
console.log(reg?.satusehatMonitor)
// Should NOT have: auth, basicUser, basicPass
```

### Problem: 401 Unauthorized
**Symptom**:
```
Console error: HTTP 401: Unauthorized
Data tidak muncul
```

**Solution**:
```javascript
// 1. Check token exists
const auth = JSON.parse(localStorage.getItem('auth.session.v1'))
console.log('Has token:', !!auth?.access_token)

// 2. If no token, re-login
// 3. If has token, check if expired
console.log('Expired?', auth.expires_at < Date.now())

// 4. Check request headers di Network tab
// Pastikan Authorization: Bearer <token> terkirim

// 5. If token valid but still 401, check backend:
//    - Backend harus accept Bearer token
//    - Backend harus validate token dengan benar
```

### Problem: No Authorization Header
**Symptom**:
```
Network tab shows request tanpa Authorization header
```

**Solution**:
```javascript
// 1. Check auth storage
import { getAuthHeader } from './services/auth-storage'
console.log(getAuthHeader())
// Should return: { Authorization: "Bearer ..." }

// 2. If empty, check login
const user = JSON.parse(localStorage.getItem('currentUser'))
console.log('Current user:', user)

// 3. If no user, re-login
```

### Problem: CORS Error
**Symptom**:
```
Access to fetch at 'http://103.42.117.19:8888/api/monitor/satusehat/orders'
from origin 'http://localhost:5173' has been blocked by CORS policy
```

**Solution**:
Backend perlu set CORS headers:
```
Access-Control-Allow-Origin: http://localhost:5173
Access-Control-Allow-Headers: Authorization, Content-Type
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Credentials: true
```

### Problem: Data Kosong
**Symptom**:
```
No error, tapi data array kosong
```

**Solution**:
```javascript
// 1. Check response di Network tab
// Click request → Response tab
// Pastikan backend return data

// 2. Check if backend has data
// Mungkin memang belum ada orders

// 3. Check console for errors
// Mungkin ada error parsing response
```

## 📊 Success Criteria

✅ Login berhasil dan token tersimpan
✅ SatuSehat Monitor dapat diakses
✅ Request menggunakan Bearer token (BUKAN Basic)
✅ Data orders muncul dengan benar
✅ No console errors
✅ Tanpa login, redirect ke /login
✅ Config tidak punya basicUser/basicPass

## 🎯 One-Liner Test

```javascript
// Run this in console after login
fetch('http://103.42.117.19:8888/api/monitor/satusehat/orders', {
  headers: JSON.parse(localStorage.getItem('auth.session.v1'))?.access_token
    ? { 'Authorization': `Bearer ${JSON.parse(localStorage.getItem('auth.session.v1')).access_token}` }
    : {}
})
.then(r => r.json())
.then(d => console.log('✅ SUCCESS:', d))
.catch(e => console.error('❌ FAIL:', e))
```

✅ **If this returns data, auth is working!**

## 📝 Report Issues

Jika masih ada masalah setelah mengikuti troubleshooting:

1. **Capture screenshots**:
   - Network tab (request headers)
   - Console tab (errors)
   - Application tab → Local Storage

2. **Copy info**:
```javascript
// Run in console
const debug = {
  auth: JSON.parse(localStorage.getItem('auth.session.v1')),
  registry: JSON.parse(localStorage.getItem('api.registry.v3')),
  user: JSON.parse(localStorage.getItem('currentUser')),
  url: window.location.href
}
console.log('DEBUG INFO:', JSON.stringify(debug, null, 2))
// Copy output
```

3. **Report dengan**:
   - Debug info dari step 2
   - Screenshots dari step 1
   - Describe apa yang terjadi vs expected behavior
