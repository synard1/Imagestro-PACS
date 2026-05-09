# Authentication Quick Start Guide

## TL;DR - What Changed

The authentication system has been completely overhauled to fix the login issues:

**Problems Fixed:**
1. ✅ User showing as "Guest" after successful login
2. ✅ Wrong user data loading from users.json after refresh
3. ✅ User data not synced with backend response
4. ✅ No token verification on app startup
5. ✅ No automatic token refresh
6. ✅ Incomplete logout (didn't clear all state)

## Quick Setup

### 1. Backend Authentication (Recommended)

Enable your backend auth module in Settings page or localStorage:

```javascript
// In browser console:
const registry = JSON.parse(localStorage.getItem('api.registry.v1') || '{}')
registry.auth = {
  enabled: true,
  baseUrl: 'http://localhost:8081',  // Your auth backend URL
  healthPath: '/health',
  timeoutMs: 6000,
  loginPath: '/auth/login',
  debug: true  // Enable to see API logs in console
}
localStorage.setItem('api.registry.v1', JSON.stringify(registry))
location.reload()
```

### 2. Test Login

1. Open app: `http://localhost:5173`
2. You'll see login page
3. Enter credentials (from your backend)
4. After successful login:
   - User name should show correctly in top-right
   - User name should show in sidebar
   - Refresh page → user should stay logged in
   - No more "Guest" or wrong user names!

### 3. Test Logout

1. Click "Logout" button in top-right
2. Should redirect to login page
3. All auth data cleared
4. Cannot access protected pages

## Backend Requirements

Your backend auth module needs these endpoints:

### Required Endpoints

```
POST /auth/login       - Login with username/password
GET  /auth/verify      - Verify token and get user data
POST /auth/refresh     - Refresh access token
POST /auth/logout      - Logout (optional, local state always cleared)
```

### Login Response Format

Your backend should return one of these formats:

**Option 1: User data in response (Recommended)**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "user": {
    "id": "user-123",
    "name": "John Doe",
    "username": "johndoe",
    "email": "john@example.com",
    "role": "admin",
    "permissions": ["*"]
  }
}
```

**Option 2: User data from /me endpoint**
```json
// Login response (without user):
{
  "access_token": "...",
  "refresh_token": "...",
  "token_type": "Bearer",
  "expires_in": 3600
}

// Then system calls GET /auth/me:
{
  "id": "user-123",
  "name": "John Doe",
  "username": "johndoe",
  "email": "john@example.com",
  "role": "admin",
  "permissions": ["*"]
}
```

**Option 3: User data from /verify endpoint**

Same as Option 2, but calls `/auth/verify` instead of `/auth/me`

### Flexible User Data Format

The system accepts multiple response formats:

```javascript
// All of these work:
response.user           // Standard
response.data.user      // Nested in data
response.user_data      // Alternative key
response                // Direct user object (from /me or /verify)
```

### Flexible User Fields

The system normalizes different field names:

```javascript
// ID
user.id || user.user_id

// Name
user.name || user.username || user.full_name || 'User'

// Username
user.username || user.name

// Permissions
user.permissions (must be array)
```

## Testing the Fix

### Test 1: Login Shows Correct User

```
1. Login with backend credentials
2. Check top-right corner → Should show your name (not "Guest")
3. Check sidebar → Should show your name and role
4. ✅ PASS if you see correct user data
```

### Test 2: Refresh Preserves User

```
1. Login successfully
2. Press F5 to refresh page
3. Should stay logged in
4. Should show same user data (not different user from users.json)
5. ✅ PASS if user data persists correctly
```

### Test 3: Token Auto-Refresh

```
1. Login successfully
2. Wait for token to expire (or change expires_in to 60 seconds)
3. Open browser console
4. Should see: "Token expiring soon, refreshing..."
5. Should see: "Token refreshed proactively"
6. Should stay logged in
7. ✅ PASS if token refreshes automatically
```

### Test 4: Complete Logout

```
1. Login successfully
2. Click Logout
3. Should redirect to login page
4. Open browser console and check:
   localStorage.getItem('auth.session.v1')     → null
   localStorage.getItem('app.currentUser')     → null
5. Try to access /dashboard → Should redirect to login
6. ✅ PASS if all auth data cleared
```

## Common Issues & Solutions

### "Authentication module is not enabled"

**Solution:** Enable auth in Settings or localStorage:

```javascript
const registry = JSON.parse(localStorage.getItem('api.registry.v1') || '{}')
registry.auth = { enabled: true, baseUrl: 'http://your-backend:port' }
localStorage.setItem('api.registry.v1', JSON.stringify(registry))
location.reload()
```

### Still seeing "Guest" after login

**Check:**
1. Open browser console during login
2. Look for "Backend login successful:" log
3. Check if response contains user data
4. If no user data, check backend /me or /verify endpoint

**Debug:**
```javascript
// In console after login:
localStorage.getItem('app.currentUser')  // Should show user data
localStorage.getItem('auth.session.v1')  // Should show tokens
```

### Wrong user after refresh

**Solution:**
```javascript
// Clear old cached data:
localStorage.removeItem('app.currentUser')
localStorage.removeItem('auth.session.v1')
// Then login again
```

### Token refresh failing

**Check:**
1. Backend /auth/refresh endpoint is working
2. Refresh token is valid
3. Backend accepts `{ "refresh_token": "..." }` in request body

**Debug:**
```javascript
// In console:
const auth = JSON.parse(localStorage.getItem('auth.session.v1'))
console.log('Expires at:', new Date(auth.expires_at))
console.log('Current time:', new Date())
```

## Environment Variables

```bash
# .env file
VITE_ENABLE_LOCAL_AUTH=true   # Enable local mock auth for testing
VITE_API_BASE_URL=http://localhost:8000  # Default API URL
```

## Development vs Production

### Development (Current)

- Local auth enabled for testing
- Mock users available
- Debug logging enabled

### Production (Recommended)

```bash
# .env.production
VITE_ENABLE_LOCAL_AUTH=false  # Disable mock auth
```

```javascript
// Backend config
{
  "auth": {
    "enabled": true,
    "baseUrl": "https://your-production-backend.com",
    "debug": false  // Disable debug logs
  }
}
```

## File Changes Summary

### New Files

- `src/hooks/useTokenRefresh.js` - Auto token refresh
- `AUTH_SYSTEM.md` - Complete documentation
- `AUTH_QUICK_START.md` - This file

### Modified Files

- `src/services/authService.js` - ⭐ Complete overhaul
- `src/services/rbac.js` - ⭐ Removed hardcoded defaults
- `src/App.jsx` - ⭐ Added auth initialization
- `src/pages/Login.jsx` - ⭐ Better error handling
- `src/components/Layout.jsx` - ⭐ Proper logout
- `src/components/ProtectedRoute.jsx` - Better auth checking

### Key Changes in authService.js

**Before:**
```javascript
// Only set user if response.user exists
if (response.user) {
  setCurrentUser(response.user)
}
```

**After:**
```javascript
// Try multiple locations and formats
let userData = response.user || response.data?.user || response.user_data

// If not in login response, fetch from backend
if (!userData) {
  userData = await getCurrentUserFromBackend()
}

// Normalize user data
const normalizedUser = {
  id: userData.id || userData.user_id,
  name: userData.name || userData.username || 'User',
  // ... more normalization
}

setCurrentUser(normalizedUser)
```

### Key Changes in rbac.js

**Before:**
```javascript
const defaultUser = {
  id: 'u-100',
  name: 'Rani Technologist',  // ❌ Hardcoded!
  role: 'technologist',
  permissions: [...]
}

function load() {
  const raw = localStorage.getItem(KEY)
  if (!raw) return { ...defaultUser }  // ❌ Returns default
  return { ...defaultUser, ...parsed }  // ❌ Merges with default
}
```

**After:**
```javascript
// ✅ No default user!

function load() {
  const raw = localStorage.getItem(KEY)
  if (!raw) return null  // ✅ Returns null if no user

  // Validate user data
  if (!parsed.id) return null  // ✅ Validates structure

  return {
    id: parsed.id,
    name: parsed.name || 'User',
    // ... normalized structure
  }
}
```

### Key Changes in App.jsx

**Before:**
```javascript
export default function App() {
  const { currentUser } = useAuth()

  return <Routes>...</Routes>  // ❌ No auth initialization
}
```

**After:**
```javascript
export default function App() {
  const { currentUser } = useAuth()
  const [isInitializing, setIsInitializing] = useState(true)

  useTokenRefresh()  // ✅ Auto token refresh

  useEffect(() => {
    // ✅ Initialize auth on mount
    initializeAuth().finally(() => setIsInitializing(false))
  }, [])

  if (isInitializing) return <AppLoading />  // ✅ Show loading

  return <Routes>...</Routes>
}
```

## Next Steps

1. ✅ Test login with your backend
2. ✅ Verify user data shows correctly
3. ✅ Test refresh page
4. ✅ Test logout
5. ✅ Test token auto-refresh
6. 📖 Read [AUTH_SYSTEM.md](./AUTH_SYSTEM.md) for complete documentation
7. 🚀 Deploy to production with proper security

## Need Help?

1. **Check browser console** - All errors logged there
2. **Check backend logs** - Verify backend is responding correctly
3. **Read full docs** - [AUTH_SYSTEM.md](./AUTH_SYSTEM.md)
4. **Clear localStorage** - When in doubt, start fresh
5. **Enable debug mode** - Set `debug: true` in auth config

---

**Quick Links:**
- [Complete Documentation](./AUTH_SYSTEM.md)
- [Backend API Requirements](./AUTH_SYSTEM.md#backend-integration)
- [Troubleshooting Guide](./AUTH_SYSTEM.md#troubleshooting)
