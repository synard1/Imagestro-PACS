# Token Debug Guide - Perbaikan Token Tidak Tersimpan

## Masalah yang Diperbaiki

**Masalah:** Token tidak tersimpan di browser sehingga saat refresh otomatis logout.

**Root Cause:** Error handling yang terlalu agresif - token di-clear meskipun sudah berhasil disimpan.

**Yang Terjadi Sebelumnya:**
```javascript
loginBackend() {
  // 1. Login → Sukses ✓
  // 2. setAuth() → Token saved ✓
  // 3. Fetch user data → GAGAL (endpoint tidak ada)
  // 4. catch block → clearAuth() ❌ TOKEN DIHAPUS!
  // 5. User navigate, tapi token hilang
  // 6. Refresh page → tidak ada token → logout
}
```

**Sekarang Sudah Diperbaiki:**
```javascript
loginBackend() {
  let tokenSaved = false

  // 1. Login → Sukses ✓
  // 2. setAuth() → Token saved ✓
  // 3. tokenSaved = true ✓
  // 4. Fetch user data → GAGAL
  // 5. catch block → CHECK tokenSaved
  // 6. if (!tokenSaved) clearAuth() // Only clear if token NOT saved
  // 7. Token tetap ada ✓
  // 8. Refresh page → token ada → stay logged in ✓
}
```

---

## Cara Testing dengan Debug Logs

### Step 1: Clear Existing Data

Sebelum test, bersihkan data lama:

```javascript
// Buka browser console (F12) dan run:
localStorage.clear()
location.reload()
```

### Step 2: Login dengan Backend

1. Login dengan credentials backend Anda
2. **Buka browser console (F12)** - Anda akan melihat log seperti ini:

```
[AUTH] Attempting login...
[AUTH] Login response received
[AUTH] Saving tokens to localStorage...
[AUTH-STORAGE] Saving auth to localStorage: {key: "auth.session.v1", token_length: 245, expires_at: "2025-10-31T..."}
[AUTH-STORAGE] Auth saved and verified successfully
[AUTH] Tokens saved successfully
[AUTH] Token save verified
[AUTH] User data found in response.user
[AUTH] Setting current user: John Doe
[RBAC] Setting current user: {id: "123", name: "John Doe", role: "admin", permissions_count: 5}
[RBAC] User saved to localStorage successfully
[AUTH] Login completed successfully
```

### Step 3: Verifikasi Token Tersimpan

Setelah login, check di console:

```javascript
// Check token
const token = localStorage.getItem('auth.session.v1')
console.log('Token:', token ? 'EXISTS ✓' : 'NOT FOUND ❌')
console.log('Token data:', JSON.parse(token || '{}'))

// Check user
const user = localStorage.getItem('app.currentUser')
console.log('User:', user ? 'EXISTS ✓' : 'NOT FOUND ❌')
console.log('User data:', JSON.parse(user || '{}'))
```

**Expected Output:**
```javascript
Token: EXISTS ✓
Token data: {
  access_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  refresh_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  token_type: "Bearer",
  expires_in: 3600,
  expires_at: 1730388123456
}

User: EXISTS ✓
User data: {
  id: "123",
  name: "John Doe",
  username: "johndoe",
  email: "john@example.com",
  role: "admin",
  permissions: ["*"]
}
```

### Step 4: Test Refresh Page

1. Press **F5** atau refresh browser
2. **Check console logs:**

```
[AUTH] Initializing authentication...
[AUTH] Existing token found, verifying...
[AUTH-STORAGE] Auth loaded from localStorage: {has_token: true, token_length: 245, expires_at: "2025-10-31T...", is_expired: false}
[AUTH] Verifying token with backend...
[AUTH] Token verification successful
[AUTH] User data updated: John Doe
[RBAC] Setting current user: {id: "123", name: "John Doe", role: "admin", permissions_count: 5}
[AUTH] Auth initialization successful
```

3. **Anda harus tetap login** - tidak redirect ke login page
4. **User name tetap benar** - tidak berubah jadi "Guest" atau user lain

### Step 5: Test Multiple Refreshes

Refresh beberapa kali (F5 berulang kali):

```
✓ Refresh 1 → Stay logged in, same user
✓ Refresh 2 → Stay logged in, same user
✓ Refresh 3 → Stay logged in, same user
```

---

## Debug Scenarios

### Scenario 1: Token Tidak Tersimpan

**Symptoms:**
- Login berhasil
- Tapi saat refresh langsung logout

**Debug:**

```javascript
// After login, immediately check:
console.log('[DEBUG] Token check:', {
  token: localStorage.getItem('auth.session.v1') ? 'EXISTS' : 'MISSING',
  user: localStorage.getItem('app.currentUser') ? 'EXISTS' : 'MISSING'
})
```

**Jika token MISSING:**

Check console logs untuk error:
```
[AUTH-STORAGE] Failed to save auth to localStorage!
// atau
[AUTH] Token save verification failed!
```

**Possible Causes:**
1. localStorage blocked (incognito mode?)
2. localStorage full (quota exceeded)
3. Browser extensions blocking localStorage

**Solution:**
- Try normal browser window (not incognito)
- Clear old localStorage data
- Disable browser extensions temporarily

### Scenario 2: Token Tersimpan Tapi Tetap Logout

**Symptoms:**
- `localStorage.getItem('auth.session.v1')` returns data
- Tapi tetap redirect ke login

**Debug:**

```javascript
// Check initializeAuth logs
// Look for:
[AUTH] Auth initialization failed: ...
[AUTH] Clearing auth during initialization
```

**Possible Causes:**
1. Backend /verify endpoint returning error
2. Token expired
3. Network error

**Check:**

```javascript
// Check if token expired
const auth = JSON.parse(localStorage.getItem('auth.session.v1'))
console.log('Token expired?', Date.now() >= auth.expires_at)
console.log('Expires at:', new Date(auth.expires_at))
console.log('Current time:', new Date())
```

### Scenario 3: Token Tersimpan Tapi User Data Salah

**Symptoms:**
- Login berhasil dengan user A
- Refresh → muncul user B (dari users.json)

**Debug:**

```javascript
// Check what's in localStorage
const user = JSON.parse(localStorage.getItem('app.currentUser'))
console.log('Stored user:', user)

// vs current user in memory
import { getCurrentUser } from './src/services/rbac'
console.log('Current user:', getCurrentUser())
```

**Possible Causes:**
- Old data from previous login
- setCurrentUser() failed

**Solution:**
```javascript
// Clear old data
localStorage.removeItem('app.currentUser')
// Login again
```

---

## Troubleshooting Commands

### Full Debug Check

```javascript
// Run this in console after login:
function debugAuth() {
  const token = localStorage.getItem('auth.session.v1')
  const user = localStorage.getItem('app.currentUser')

  console.log('=== AUTH DEBUG ===')
  console.log('Token exists:', !!token)
  if (token) {
    const parsed = JSON.parse(token)
    console.log('Token data:', {
      has_access: !!parsed.access_token,
      has_refresh: !!parsed.refresh_token,
      expires_at: new Date(parsed.expires_at).toISOString(),
      is_expired: Date.now() >= parsed.expires_at,
      time_left: Math.floor((parsed.expires_at - Date.now()) / 1000 / 60) + ' minutes'
    })
  }

  console.log('User exists:', !!user)
  if (user) {
    const parsed = JSON.parse(user)
    console.log('User data:', {
      id: parsed.id,
      name: parsed.name,
      role: parsed.role,
      permissions: parsed.permissions?.length || 0
    })
  }

  console.log('=== END DEBUG ===')
}

debugAuth()
```

### Force Logout

```javascript
// If stuck, force clear everything:
localStorage.removeItem('auth.session.v1')
localStorage.removeItem('app.currentUser')
location.href = '/login'
```

### Test Token Refresh

```javascript
// Manually trigger token refresh:
import { refreshToken } from './src/services/authService'
await refreshToken()
console.log('Token refreshed!')
debugAuth() // Check new token
```

---

## Expected Console Logs

### Successful Login Flow

```
[AUTH] Attempting login...
[AUTH] Login response received
[AUTH] Saving tokens to localStorage...
[AUTH-STORAGE] Saving auth to localStorage: ...
[AUTH-STORAGE] Auth saved and verified successfully
[AUTH] Tokens saved successfully
[AUTH] Token save verified
[AUTH] User data found in response.user
[AUTH] Setting current user: John Doe
[RBAC] Setting current user: ...
[RBAC] User saved to localStorage successfully
[AUTH] Login completed successfully
```

### Successful Refresh Flow

```
[AUTH] Initializing authentication...
[AUTH] Existing token found, verifying...
[AUTH-STORAGE] Auth loaded from localStorage: ...
[AUTH] Verifying token with backend...
[AUTH] Token verification successful
[AUTH] User data updated: John Doe
[RBAC] Setting current user: ...
[AUTH] Auth initialization successful
```

### Failed Login (No Token Saved)

```
[AUTH] Attempting login...
[AUTH] Login response received
[AUTH] Login response missing access_token
[AUTH] Login failed: ...
[AUTH] Clearing auth state (token was not saved)
[AUTH-STORAGE] Clearing auth from localStorage
[RBAC] Clearing current user
```

### Partial Failure (Token Saved, User Fetch Failed)

```
[AUTH] Attempting login...
[AUTH] Login response received
[AUTH] Saving tokens to localStorage...
[AUTH-STORAGE] Auth saved and verified successfully
[AUTH] Tokens saved successfully
[AUTH] No user data in login response, fetching from backend...
[AUTH] Could not fetch user data after login: ...
[AUTH] Login successful but no user data available
[RBAC] Setting current user: ... (using username as fallback)
[AUTH] Login completed successfully
// ✓ Token TIDAK di-clear meski user fetch failed
```

---

## Backend Response Formats Supported

Your backend can return user data in ANY of these formats:

### Format 1: User in Root (Recommended)
```json
{
  "access_token": "...",
  "refresh_token": "...",
  "user": {
    "id": "123",
    "name": "John Doe",
    "username": "johndoe",
    "role": "admin",
    "permissions": ["*"]
  }
}
```

### Format 2: User in Data Object
```json
{
  "access_token": "...",
  "refresh_token": "...",
  "data": {
    "user": {
      "id": "123",
      "name": "John Doe"
    }
  }
}
```

### Format 3: User Data Alternative Key
```json
{
  "access_token": "...",
  "refresh_token": "...",
  "user_data": {
    "id": "123",
    "name": "John Doe"
  }
}
```

### Format 4: No User in Login (Fetch from /me or /verify)
```json
{
  "access_token": "...",
  "refresh_token": "...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

System will automatically call `GET /auth/me` or `GET /auth/verify` to get user data.

---

## Manual Testing Checklist

- [ ] Clear localStorage
- [ ] Login dengan backend credentials
- [ ] Check console logs - no errors
- [ ] Check `localStorage.getItem('auth.session.v1')` - should exist
- [ ] Check `localStorage.getItem('app.currentUser')` - should exist
- [ ] User name displayed correctly (not "Guest")
- [ ] Refresh page (F5)
- [ ] Still logged in after refresh
- [ ] User name still correct (not changed)
- [ ] Refresh 5 more times
- [ ] Still logged in each time
- [ ] Click Logout
- [ ] Redirected to login page
- [ ] localStorage cleared (check in console)
- [ ] Cannot access /dashboard (redirects to /login)

---

## Known Issues & Solutions

### Issue: "Cannot read property 'access_token' of null"

**Cause:** Backend response format tidak sesuai

**Solution:** Check backend response format. Must have `access_token` field.

### Issue: localStorage Full

**Cause:** Browser localStorage quota exceeded

**Solution:**
```javascript
// Clear all localStorage
localStorage.clear()

// Or selectively clear old keys
Object.keys(localStorage).forEach(key => {
  if (key.startsWith('old_app_')) {
    localStorage.removeItem(key)
  }
})
```

### Issue: Token Expires Too Fast

**Cause:** Backend `expires_in` too short

**Solution:** Configure backend to return longer expiration (e.g., 3600 = 1 hour)

### Issue: Auto-Refresh Not Working

**Cause:** Token expires before auto-refresh kicks in

**Check:**
```javascript
// Auto-refresh checks every 60 seconds
// Refreshes if expires in < 5 minutes

// If your token expires in < 5 minutes, it will refresh immediately
```

---

## Next Steps

Setelah testing:

1. ✅ Jika token tersimpan dan persist setelah refresh → **BERHASIL!**
2. ❌ Jika masih ada masalah → Share console logs untuk debug lebih lanjut
3. 📚 Baca [AUTH_SYSTEM.md](./AUTH_SYSTEM.md) untuk detail lengkap
4. 🚀 Deploy ke production dengan security checklist

---

**Catatan Penting:**

Semua operasi auth sekarang memiliki **extensive logging** dengan prefix:
- `[AUTH]` - authService operations
- `[AUTH-STORAGE]` - Token save/load operations
- `[RBAC]` - User data operations

Jadi Anda bisa dengan mudah track apa yang terjadi di setiap step!
