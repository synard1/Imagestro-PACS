# Fix: Token Authentication Issue

## 🐛 Problem

**Error:** "Failed to load users: Invalid or expired token"

**Cause:** Mismatch antara cara authService menyimpan token dan cara userService mengambil token.

### Root Cause Analysis

1. **authService** menyimpan token menggunakan `auth-storage.js`:
   - Key: `'auth.session.v1'`
   - Format: `{ access_token, refresh_token, token_type, expires_in, expires_at }`

2. **userService** mencoba mengambil token dengan:
   - Key: `'token'` (SALAH!)
   - Format: String langsung

**Result:** userService tidak bisa menemukan token yang disimpan oleh authService.

---

## ✅ Solution Applied

### Files Modified

#### 1. `src/services/userService.js`

**Changes:**

a) **Import auth-storage utilities:**
```javascript
import { getAuth, isExpired } from './auth-storage';
```

b) **Updated getAuthHeader() function:**
```javascript
const getAuthHeader = () => {
  const auth = getAuth();  // Use auth-storage

  if (!auth || !auth.access_token) {
    throw new Error('No authentication token found. Please login again.');
  }

  if (isExpired(auth)) {
    throw new Error('Authentication token has expired. Please login again.');
  }

  const tokenType = auth.token_type || 'Bearer';

  return {
    'Authorization': `${tokenType} ${auth.access_token}`,
    'Content-Type': 'application/json',
  };
};
```

c) **Updated login() function:**
- Removed `localStorage.setItem('token', ...)`
- Token storage now handled by authService
- Added note to use `authService.loginBackend()` instead

d) **Updated logout() function:**
- Added deprecation warning
- Recommend using `authService.logoutBackend()` instead

---

## 🔍 How Token Storage Works Now

### Login Flow

```
User Login → authService.loginBackend()
    ↓
Backend API Response
    ↓
authService stores token via setAuth()
    ↓
localStorage.setItem('auth.session.v1', JSON.stringify({
    access_token: "...",
    refresh_token: "...",
    token_type: "Bearer",
    expires_in: 3600,
    expires_at: 1234567890
}))
```

### API Request Flow (UserManagement)

```
User Action → userService.getUsers()
    ↓
getAuthHeader() called
    ↓
getAuth() from auth-storage
    ↓
Check token exists & not expired
    ↓
Return: { 'Authorization': 'Bearer <token>' }
    ↓
API Request with correct header
```

---

## 🧪 Testing Instructions

### 1. Clear Browser Storage
```javascript
// Open browser console (F12)
localStorage.clear();
sessionStorage.clear();
location.reload();
```

### 2. Login Again
```
URL: http://localhost:5173/login
Username: admin
Password: Admin@12345
```

### 3. Verify Token Storage
```javascript
// In browser console
const auth = JSON.parse(localStorage.getItem('auth.session.v1'));
console.log('Token:', auth.access_token);
console.log('Expires at:', new Date(auth.expires_at).toLocaleString());
```

### 4. Navigate to User Management
```
Menu: User Management → User Admin
URL: http://localhost:5173/user-management
```

### 5. Expected Results
- ✅ Users list loads successfully
- ✅ No "Invalid or expired token" error
- ✅ Can create/edit/delete users
- ✅ Search and filter work

---

## 🔐 Token Lifecycle

### Storage Location
```javascript
localStorage key: 'auth.session.v1'
```

### Token Structure
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "expires_at": 1736259600000
}
```

### Expiration Handling
- Token checked for expiration before each API call
- If expired, user receives clear error message
- User redirected to login if authentication fails

---

## 📚 Related Files

### Core Authentication
- `src/services/authService.js` - Login/logout/token refresh
- `src/services/auth-storage.js` - Token storage utilities
- `src/services/userService.js` - User management API

### Components
- `src/pages/Login.jsx` - Login form
- `src/pages/UserManagement.jsx` - User management UI

### Utilities
- `src/utils/logger.js` - Logging utility

---

## 🚨 Important Notes

### For Developers

1. **Always use auth-storage utilities:**
   ```javascript
   import { getAuth, setAuth, clearAuth, isExpired } from './auth-storage';
   ```

2. **Never access localStorage directly for auth:**
   ```javascript
   // ❌ WRONG
   const token = localStorage.getItem('token');

   // ✅ CORRECT
   const auth = getAuth();
   const token = auth?.access_token;
   ```

3. **Use authService for authentication:**
   ```javascript
   // ❌ WRONG - Don't create custom login
   fetch('/auth/login', ...).then(...)

   // ✅ CORRECT - Use authService
   import { loginBackend } from './services/authService';
   await loginBackend(username, password);
   ```

4. **Check token expiration:**
   ```javascript
   import { isExpired } from './auth-storage';

   const auth = getAuth();
   if (isExpired(auth)) {
     // Token expired, redirect to login
   }
   ```

### Token Expiration

- Default: 3600 seconds (1 hour)
- Configurable via backend
- Auto-refresh available (if refresh_token provided)

---

## 🔄 Migration Guide

### If You Have Custom Auth Code

#### Old Code (WRONG):
```javascript
// Saving token
localStorage.setItem('token', accessToken);

// Getting token
const token = localStorage.getItem('token');
const headers = {
  'Authorization': `Bearer ${token}`
};
```

#### New Code (CORRECT):
```javascript
// Saving token (handled by authService)
import { loginBackend } from './services/authService';
await loginBackend(username, password);

// Getting token
import { getAuth } from './services/auth-storage';
const auth = getAuth();
const headers = {
  'Authorization': `${auth.token_type} ${auth.access_token}`
};

// Or use getAuthHeader() from userService
import { getAuthHeader } from './services/userService';
const headers = getAuthHeader();
```

---

## ✅ Verification Checklist

After fix, verify:

- [ ] Login works and token is saved
- [ ] Token stored in `localStorage['auth.session.v1']`
- [ ] User Management page loads without errors
- [ ] Can view users list
- [ ] Can create new user
- [ ] Can edit user
- [ ] Can delete user
- [ ] Can search/filter users
- [ ] Token expiration handled gracefully
- [ ] Logout clears token properly

---

## 🐛 Troubleshooting

### Issue: Still getting "Invalid token" error

**Solution:**
1. Clear all browser storage
2. Hard refresh (Ctrl+Shift+R)
3. Login again
4. Check console for errors

### Issue: Token not found after login

**Solution:**
1. Check if authService.loginBackend() was used
2. Verify `auth.session.v1` exists in localStorage
3. Check browser console for storage errors

### Issue: Token expires too quickly

**Solution:**
1. Check backend token expiration settings
2. Verify `expires_in` value in localStorage
3. Consider implementing token refresh

---

## 📞 Support

If issues persist:

1. **Check Console Logs:**
   - Look for `[AUTH]` prefixed messages
   - Check for `[AUTH-STORAGE]` messages
   - Review any error stack traces

2. **Verify Backend:**
   ```bash
   curl http://103.42.117.19:8888/health
   curl -X POST http://103.42.117.19:8888/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username":"admin","password":"Admin@12345"}'
   ```

3. **Check Token in localStorage:**
   ```javascript
   console.log(localStorage.getItem('auth.session.v1'));
   ```

---

## 📝 Changelog

### Fix Applied (2025-11-01)

- ✅ Fixed token retrieval in userService
- ✅ Added import for auth-storage utilities
- ✅ Updated getAuthHeader() to use getAuth()
- ✅ Added token expiration check
- ✅ Removed duplicate token storage in login()
- ✅ Added deprecation warnings
- ✅ Created comprehensive documentation

---

## 🎯 Next Steps

1. Test all user management features
2. Verify token refresh mechanism
3. Implement token expiration warning (optional)
4. Add token refresh on 401 errors (optional)
5. Consider implementing "Remember me" feature (optional)

---

**Status:** ✅ FIXED - Ready for testing

**Last Updated:** 2025-11-01
