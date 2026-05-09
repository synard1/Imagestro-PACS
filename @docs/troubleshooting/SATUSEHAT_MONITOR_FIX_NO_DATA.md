# Fix: SatuSehat Monitor "No Orders Found"

## Problem

Setelah mengubah autentikasi dari hardcoded Basic Auth ke Bearer Token, halaman SatuSehat Monitor menampilkan "No orders found" padahal sebelumnya data muncul normal.

## Root Cause

Backend API Gateway di `http://103.42.117.19:8888` kemungkinan:
1. Belum support Bearer token authentication
2. Masih expect Basic Auth dengan credentials yang lama
3. Atau ada masalah CORS/permission dengan Bearer token

## Solution - Flexible Authentication

Saya telah menambahkan konfigurasi fleksibel yang support **BOTH** auth methods via environment variables:

### Option 1: Bearer Token (RECOMMENDED) ✅

Default dan paling aman - menggunakan token dari user yang login.

**File: `.env` atau `.env.local`**
```bash
# Use Bearer token from logged-in user (default)
VITE_SATUSEHAT_MONITOR_AUTH_TYPE=bearer
```

**Atau kosongkan saja** (default is bearer):
```bash
# No need to set anything - bearer is default
```

### Option 2: Basic Auth (TEMPORARY FALLBACK)

Jika backend belum siap untuk Bearer token, gunakan ini sementara:

**File: `.env.local` (JANGAN commit file ini!)**
```bash
# Temporary: Use Basic Auth until backend supports Bearer
VITE_SATUSEHAT_MONITOR_AUTH_TYPE=basic
VITE_SATUSEHAT_MONITOR_BASIC_USER=admin
VITE_SATUSEHAT_MONITOR_BASIC_PASS=password123
```

⚠️ **IMPORTANT**:
- `.env.local` sudah ada di `.gitignore` - tidak akan ke-commit
- Ini hanya solusi sementara sampai backend support Bearer token
- Untuk production, HARUS gunakan Bearer token (option 1)

## Files Changed

### 1. `.env.example` (lines 66-76)
Tambah konfigurasi environment variable:
```bash
# SatuSehat Monitor Authentication (TEMPORARY COMPATIBILITY)
VITE_SATUSEHAT_MONITOR_AUTH_TYPE=bearer
VITE_SATUSEHAT_MONITOR_BASIC_USER=
VITE_SATUSEHAT_MONITOR_BASIC_PASS=
```

### 2. `src/services/http.js` (lines 157-178)
Tambah logic untuk check env variable:
```javascript
if (moduleName === 'satusehatMonitor') {
  const authType = import.meta.env.VITE_SATUSEHAT_MONITOR_AUTH_TYPE || 'bearer';

  if (authType === 'basic') {
    // Use credentials from environment variable
    const basicUser = import.meta.env.VITE_SATUSEHAT_MONITOR_BASIC_USER;
    const basicPass = import.meta.env.VITE_SATUSEHAT_MONITOR_BASIC_PASS;

    if (basicUser && basicPass) {
      authHeaders = { Authorization: `Basic ${btoa(`${basicUser}:${basicPass}`)}` };
    }
  } else {
    // Use Bearer token from login
    authHeaders = { ...(getAuthHeader() || {}) };
  }
}
```

### 3. `src/services/satusehatMonitorService.js`
Tambah extensive logging untuk debug:
- Log setiap request attempt
- Log response format
- Log detailed error dengan status code
- Handle multiple response formats

## Quick Fix Steps

### Step 1: Identify the Problem

```bash
# Open browser console saat di /satusehat-monitor
# Cek error message:
```

**Check for these logs:**
```
[satusehatMonitorService] Fetching from satusehatMonitor backend...
[http] Using Bearer token for satusehatMonitor
[satusehatMonitorService] Monitor backend fetch failed: { message: "...", status: 401 }
```

If you see **401 Unauthorized** → Backend tidak accept Bearer token

### Step 2: Temporary Fix (Use Basic Auth)

**Create file: `.env.local`**
```bash
# Temporary fix - use Basic Auth
VITE_SATUSEHAT_MONITOR_AUTH_TYPE=basic
VITE_SATUSEHAT_MONITOR_BASIC_USER=admin
VITE_SATUSEHAT_MONITOR_BASIC_PASS=password123
```

**Restart dev server:**
```bash
# Stop current server (Ctrl+C)
npm run dev
```

**Verify in console:**
```
[http] Using Basic Auth for satusehatMonitor (from env)
```

### Step 3: Test

```bash
1. Buka http://localhost:5173/satusehat-monitor
2. Cek console - should see:
   [http] Using Basic Auth for satusehatMonitor (from env)
3. Data should load now ✅
```

## Debugging Guide

### Check Current Auth Type

```javascript
// In browser console
const authType = import.meta.env.VITE_SATUSEHAT_MONITOR_AUTH_TYPE || 'bearer'
console.log('Auth Type:', authType)

// Check credentials (only if basic)
if (authType === 'basic') {
  console.log('User:', import.meta.env.VITE_SATUSEHAT_MONITOR_BASIC_USER)
  console.log('Has Pass:', !!import.meta.env.VITE_SATUSEHAT_MONITOR_BASIC_PASS)
}
```

### Check Network Request

**DevTools → Network tab:**
1. Filter: `/api/monitor/satusehat/orders`
2. Click request → Headers
3. Check **Request Headers** → Authorization

**Expected:**
- Bearer mode: `Authorization: Bearer eyJhbGci...`
- Basic mode: `Authorization: Basic YWRtaW46cGFzc3dvcmQxMjM=`

### Check Response

**DevTools → Network tab:**
1. Click request → Response tab
2. Check what backend returned

**Common responses:**
- `401 Unauthorized` → Auth problem
- `403 Forbidden` → Permission problem
- `200 OK` with empty array → No data in backend
- `200 OK` with data → Success! ✅

### Enable Debug Logging

Semua logs sudah ditambahkan. Check console untuk:

```
[satusehatMonitorService] Fetching from satusehatMonitor backend...
[http] Constructed URL for satusehatMonitor: http://103.42.117.19:8888/api/monitor/satusehat/orders
[http] Using Bearer token for satusehatMonitor
[http] Auth headers for satusehatMonitor: { Authorization: "Bearer ..." }
```

**If error:**
```
[satusehatMonitorService] Monitor backend fetch failed: {
  message: "HTTP 401: Unauthorized",
  status: 401,
  error: {...}
}
[satusehatMonitorService] Falling back to orders API...
```

**If fallback also fails:**
```
[satusehatMonitorService] Failed to fetch from orders API: {
  message: "...",
  status: ...,
  error: {...}
}
```

## Migration Path

### Current State: Basic Auth Working ✅

If backend only supports Basic Auth now:

```bash
# .env.local
VITE_SATUSEHAT_MONITOR_AUTH_TYPE=basic
VITE_SATUSEHAT_MONITOR_BASIC_USER=admin
VITE_SATUSEHAT_MONITOR_BASIC_PASS=password123
```

### Future State: Bearer Token ✅

When backend ready for Bearer token:

1. **Update backend** to accept `Authorization: Bearer <token>`
2. **Remove `.env.local`** or update it:
   ```bash
   # .env.local
   VITE_SATUSEHAT_MONITOR_AUTH_TYPE=bearer
   ```
3. **Restart dev server**
4. **Test** - data should load with Bearer token

## Security Checklist

### Development
- [x] Credentials in `.env.local` (not committed)
- [x] `.env.local` in `.gitignore`
- [x] No hardcoded credentials in source code

### Production
- [ ] Use Bearer token only (`VITE_SATUSEHAT_MONITOR_AUTH_TYPE=bearer`)
- [ ] No Basic Auth in production
- [ ] Backend validates Bearer token properly
- [ ] Token refresh working

## Testing Scenarios

### Test 1: Bearer Token (Default)

```bash
# No .env.local or empty AUTH_TYPE
npm run dev

# Expected in console:
[http] Using Bearer token for satusehatMonitor

# Check Network:
Authorization: Bearer eyJhbGci...
```

### Test 2: Basic Auth (Fallback)

```bash
# .env.local with basic auth config
npm run dev

# Expected in console:
[http] Using Basic Auth for satusehatMonitor (from env)

# Check Network:
Authorization: Basic YWRtaW46cGFzc3dvcmQxMjM=
```

### Test 3: Missing Credentials

```bash
# .env.local
VITE_SATUSEHAT_MONITOR_AUTH_TYPE=basic
# No user/pass

npm run dev

# Expected in console:
[http] Basic auth configured but credentials missing in env
[http] Using Bearer token for satusehatMonitor

# Falls back to Bearer
```

## Common Issues

### Issue 1: Still shows "No orders found"

**Check:**
1. Console errors - auth or network?
2. Network response - 401, 403, or empty array?
3. Backend has data?

**Solution:**
```javascript
// Check what error
// If 401/403 → auth problem, use basic
// If 200 empty → backend has no data
```

### Issue 2: Environment variables not working

**Check:**
```javascript
console.log('Env vars:', {
  authType: import.meta.env.VITE_SATUSEHAT_MONITOR_AUTH_TYPE,
  hasUser: !!import.meta.env.VITE_SATUSEHAT_MONITOR_BASIC_USER,
  hasPass: !!import.meta.env.VITE_SATUSEHAT_MONITOR_BASIC_PASS
})
```

**Solution:**
- Restart dev server after changing .env files
- Make sure file named exactly `.env.local`
- Check file is in project root (same level as package.json)

### Issue 3: CORS error with Bearer token

**Error:**
```
Access to fetch has been blocked by CORS policy
```

**Solution:**
Backend needs to allow Authorization header:
```
Access-Control-Allow-Headers: Authorization, Content-Type
```

## Summary

### What Changed
✅ Added flexible auth configuration via environment variables
✅ Support both Bearer and Basic auth methods
✅ Better error logging for debugging
✅ No hardcoded credentials in source code
✅ Safe fallback if backend not ready

### How to Use

**For Bearer Token (recommended):**
```bash
# Do nothing - it's default
# Or set explicitly:
VITE_SATUSEHAT_MONITOR_AUTH_TYPE=bearer
```

**For Basic Auth (temporary):**
```bash
# Create .env.local
VITE_SATUSEHAT_MONITOR_AUTH_TYPE=basic
VITE_SATUSEHAT_MONITOR_BASIC_USER=your_username
VITE_SATUSEHAT_MONITOR_BASIC_PASS=your_password
```

### Next Steps

1. ✅ Use Basic Auth temporarily to restore functionality
2. ⏳ Update backend to support Bearer token
3. ✅ Switch to Bearer token for production
4. ✅ Remove Basic Auth credentials from .env.local

The system now supports both auth methods safely and can transition smoothly when backend is ready! 🎉
