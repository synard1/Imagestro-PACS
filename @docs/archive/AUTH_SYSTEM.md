# Authentication System Documentation

## Overview

This document describes the comprehensive, production-ready authentication system implemented in the MWL-PACS UI application. The system is designed to be robust, secure, and future-proof with support for both backend JWT authentication and local mock authentication.

## Architecture

### Core Components

#### 1. Authentication Service (`src/services/authService.js`)

The central authentication service that handles all auth-related operations:

**Key Functions:**

- **`loginBackend(username, password)`**
  - Authenticates user with backend
  - Stores JWT tokens (access & refresh)
  - Normalizes and stores user data
  - Handles multiple response formats from backend
  - Falls back to `/me` or `/verify` endpoint if user data not in login response

- **`logoutBackend()`**
  - Calls backend logout endpoint
  - Clears all local auth data (tokens + user profile)
  - Always clears local state even if backend call fails

- **`refreshToken()`**
  - Refreshes access token using refresh token
  - Updates stored tokens
  - Clears auth on failure

- **`verifyToken()`**
  - Verifies current token with backend
  - Auto-refreshes if token is expired
  - Updates user data from backend
  - Clears auth on verification failure

- **`initializeAuth()`**
  - Called on app startup
  - Checks for existing tokens
  - Verifies token validity
  - Restores user session if valid
  - Returns user data or null

- **`isAuthenticated()`**
  - Checks if user has valid authentication
  - Validates token existence and expiration
  - Validates user data existence

- **`getTimeUntilExpiry()`**
  - Returns milliseconds until token expires
  - Used by auto-refresh mechanism

#### 2. RBAC Service (`src/services/rbac.js`)

Manages user state and role-based access control:

**Key Features:**

- **No hardcoded default users** - Returns `null` if no authenticated user
- **User data validation** - Validates structure before storing
- **Normalized user structure**:
  ```javascript
  {
    id: string,
    name: string,
    username: string | null,
    email: string | null,
    role: string,
    permissions: string[]
  }
  ```
- **Auth change listeners** - Components can subscribe to auth state changes
- **RBAC functions**:
  - `can(permission)` - Check single permission
  - `canAny(permissions[])` - Check if user has any of the permissions
  - `canAll(permissions[])` - Check if user has all permissions
  - Wildcard support: `'*'`, `'admin.*'`, `'patient.*'`
  - Admin role bypass

#### 3. Token Storage (`src/services/auth-storage.js`)

Manages JWT token storage and validation:

**Stored Data:**
```javascript
{
  access_token: string,
  refresh_token: string,
  token_type: string,
  expires_in: number,
  expires_at: number // Calculated: Date.now() + expires_in
}
```

**Key Functions:**
- `setAuth(session)` - Store tokens with calculated expiration
- `getAuth()` - Retrieve stored tokens
- `clearAuth()` - Remove tokens
- `isExpired(auth)` - Check if token is expired
- `getAuthHeader()` - Get Authorization header for API calls

#### 4. Auto Token Refresh (`src/hooks/useTokenRefresh.js`)

Custom React hook for automatic token refresh:

**Behavior:**
- Runs only when backend auth is enabled
- Checks token every 60 seconds
- Refreshes token if expiring within 5 minutes
- Auto-refreshes expired tokens
- Logs out user on refresh failure
- Prevents multiple simultaneous refresh attempts

**Usage:**
```javascript
// In App.jsx
useTokenRefresh()
```

#### 5. Authentication Initialization (`src/App.jsx`)

App initialization with auth verification:

**Flow:**
1. Show loading screen
2. Check if backend auth is enabled
3. Call `initializeAuth()` to verify existing session
4. Update auth state
5. Hide loading screen
6. User redirected to login if not authenticated (via ProtectedRoute)

#### 6. Protected Routes (`src/components/ProtectedRoute.jsx`)

Route protection with flexible authentication:

**Features:**
- Checks backend auth enabled status
- Validates both user data and JWT token
- Supports permission-based access control
- Admin role bypass
- Graceful handling of disabled backend auth
- Redirects to login with return path

**Usage:**
```javascript
<ProtectedRoute permissions={['order.create']}>
  <OrderForm />
</ProtectedRoute>

<ProtectedRoute permissions={['order.view', 'order.*']} any>
  <Orders />
</ProtectedRoute>
```

#### 7. Enhanced Login (`src/pages/Login.jsx`)

Improved login page with comprehensive error handling:

**Features:**
- Dual mode: Backend auth & Local mock auth
- Input validation with user-friendly error messages
- Auto-clear errors on user input
- Auto-focus on first input
- Loading states
- Network error handling
- HTTP status code error mapping
- Return path preservation

**Error Handling:**
- Network errors: "Cannot connect to server"
- Timeout errors: "Request timed out"
- 401: "Invalid username or password"
- 403: "Access denied"
- 500: "Server error"
- Module disabled: "Authentication service not available"

#### 8. Logout Functionality (`src/components/Layout.jsx`)

Complete logout with backend integration:

**Features:**
- Calls backend logout endpoint if enabled
- Clears all local auth data
- Loading state during logout
- Graceful error handling
- Always redirects to login even on failure

## Authentication Flow

### 1. Initial App Load

```
App Mount
  ↓
Check Backend Auth Enabled
  ↓
initializeAuth()
  ↓
Get Stored Tokens
  ↓
Token Exists? → Yes → verifyToken()
                        ↓
                     Valid? → Yes → Restore Session
                               No  → Clear Auth
  ↓
Token Exists? → No → Clear Auth
  ↓
Hide Loading Screen
  ↓
User Navigates to Protected Route
  ↓
ProtectedRoute Check
  ↓
Authenticated? → Yes → Show Content
                 No  → Redirect to Login
```

### 2. Login Flow

```
User Submits Credentials
  ↓
Validate Input
  ↓
loginBackend(username, password)
  ↓
POST /auth/login
  ↓
Response Received
  ↓
Extract Tokens → setAuth()
  ↓
Extract User Data
  ↓
User Data Missing? → Yes → GET /me or /verify
                      No  → Continue
  ↓
Normalize User Data
  ↓
setCurrentUser()
  ↓
Navigate to Requested Page
  ↓
Start Auto Token Refresh
```

### 3. Token Refresh Flow

```
Every 60 seconds
  ↓
Check Token Expiry
  ↓
Expires in < 5 min? → Yes → refreshToken()
                              ↓
                           POST /auth/refresh
                              ↓
                           Success? → Yes → Update Tokens
                                      No  → Logout User
  ↓
Token Expired? → Yes → refreshToken()
                       ↓
                    Success? → Yes → Update Tokens
                              No  → Logout User
```

### 4. Logout Flow

```
User Clicks Logout
  ↓
Show Loading State
  ↓
Backend Auth Enabled? → Yes → POST /auth/logout
                               (ignore errors)
  ↓
clearAuth()
  ↓
clearCurrentUser()
  ↓
Navigate to /login
```

## Backend Integration

### Required Backend Endpoints

#### 1. Login
```
POST /auth/login
Content-Type: application/json

Request:
{
  "username": "string",
  "password": "string"
}

Response:
{
  "access_token": "string",
  "refresh_token": "string",
  "token_type": "Bearer",
  "expires_in": 3600,
  "user": {
    "id": "string",
    "name": "string",
    "username": "string",
    "email": "string",
    "role": "string",
    "permissions": ["string"]
  }
}

// User data is optional in login response.
// If missing, system will call /me or /verify endpoint.
```

#### 2. Token Verification
```
GET /auth/verify
Authorization: Bearer {access_token}

Response:
{
  "user": {
    "id": "string",
    "name": "string",
    "username": "string",
    "email": "string",
    "role": "string",
    "permissions": ["string"]
  }
}

// OR return user data directly:
{
  "id": "string",
  "name": "string",
  ...
}
```

#### 3. Get Current User (Optional)
```
GET /auth/me
Authorization: Bearer {access_token}

Response:
{
  "id": "string",
  "name": "string",
  "username": "string",
  "email": "string",
  "role": "string",
  "permissions": ["string"]
}
```

#### 4. Token Refresh
```
POST /auth/refresh
Content-Type: application/json

Request:
{
  "refresh_token": "string"
}

Response:
{
  "access_token": "string",
  "refresh_token": "string", // Optional: if not provided, old refresh token is reused
  "token_type": "Bearer",
  "expires_in": 3600
}
```

#### 5. Logout
```
POST /auth/logout
Authorization: Bearer {access_token}

Response:
{
  "message": "Logged out successfully"
}

// Logout errors are ignored by frontend
// Local auth is always cleared
```

### Backend Configuration

Configure backend in Settings page or localStorage:

```javascript
// Key: 'api.registry.v1'
{
  "auth": {
    "enabled": true,
    "baseUrl": "http://localhost:8081",
    "healthPath": "/health",
    "timeoutMs": 6000,
    "loginPath": "/auth/login",      // Default: /login
    "logoutPath": "/auth/logout",    // Default: /logout
    "refreshPath": "/auth/refresh",  // Default: /refresh
    "verifyPath": "/auth/verify",    // Default: /verify
    "mePath": "/auth/me",            // Default: /me
    "debug": false
  }
}
```

## Security Features

### 1. Token Security
- Tokens stored in localStorage (consider httpOnly cookies for production)
- Automatic token expiration checking
- Token refresh before expiration
- Clear tokens on logout and auth errors

### 2. Request Security
- Authorization header automatically added to all API requests
- Expired tokens not sent to backend
- Request timeout protection (6 seconds default)

### 3. Error Handling
- All auth errors clear local state
- Network errors don't expose system details
- User-friendly error messages
- Graceful degradation on backend unavailability

### 4. State Consistency
- User state synced with token state
- Auth change notifications to all components
- Automatic cleanup on errors
- Prevention of race conditions in token refresh

## Development Guide

### Testing Authentication Locally

#### 1. Mock/Local Authentication

```javascript
// In .env
VITE_ENABLE_LOCAL_AUTH=true

// In app, select "Local Auth" mode
// Login with:
Name: Any name
Role: admin | technologist | clerk
```

#### 2. Backend Authentication

```javascript
// Enable in Settings or localStorage
{
  "auth": {
    "enabled": true,
    "baseUrl": "http://localhost:8081"
  }
}

// Login with backend credentials
```

### Adding New Protected Routes

```javascript
// 1. Add route with permission check
<Route path="/new-feature" element={
  <ProtectedRoute permissions={['feature.view']}>
    <NewFeature />
  </ProtectedRoute>
} />

// 2. Multiple permissions (all required)
<ProtectedRoute permissions={['feature.view', 'feature.edit']}>
  <NewFeature />
</ProtectedRoute>

// 3. Multiple permissions (any one required)
<ProtectedRoute permissions={['feature.view', 'feature.*']} any>
  <NewFeature />
</ProtectedRoute>

// 4. No permissions (just require authentication)
<ProtectedRoute>
  <NewFeature />
</ProtectedRoute>
```

### Adding New Permission Checks

```javascript
import { can, canAny, canAll } from '../services/rbac'

// Check single permission
if (can('order.create')) {
  // Show create button
}

// Check any of multiple permissions
if (canAny(['order.edit', 'order.*'])) {
  // Show edit button
}

// Check all permissions required
if (canAll(['order.view', 'patient.view'])) {
  // Show order with patient details
}
```

### Extending User Data Structure

If your backend returns additional user fields:

```javascript
// In authService.js, update normalizeUser function
const normalizedUser = {
  id: userData.id || userData.user_id || null,
  name: userData.name || userData.username || 'User',
  username: userData.username || null,
  email: userData.email || null,
  role: userData.role || 'user',
  permissions: Array.isArray(userData.permissions) ? userData.permissions : [],
  // Add your custom fields here:
  department: userData.department || null,
  phone: userData.phone || null,
  avatar: userData.avatar_url || null,
}

// Update rbac.js load() function similarly
```

## Troubleshooting

### Issue: User shows as "Guest" after login

**Cause:** Backend response doesn't include user data

**Solutions:**
1. Ensure backend returns `user` object in login response
2. Or implement `/me` or `/verify` endpoint
3. Check browser console for errors
4. Verify token is being stored: `localStorage.getItem('auth.session.v1')`

### Issue: User data wrong after refresh

**Cause:** Old user data in localStorage

**Solutions:**
1. Clear localStorage: `localStorage.removeItem('app.currentUser')`
2. Clear tokens: `localStorage.removeItem('auth.session.v1')`
3. Logout and login again

### Issue: Token refresh failing

**Cause:** Backend refresh endpoint not configured correctly

**Solutions:**
1. Check backend logs for errors
2. Verify refresh token is valid
3. Ensure `/auth/refresh` endpoint accepts refresh_token in body
4. Check token expiration time is reasonable

### Issue: Auto logout after 5 minutes

**Cause:** Token expiring and refresh failing

**Solutions:**
1. Check backend token expiration time (`expires_in`)
2. Verify refresh endpoint is working
3. Check browser console for refresh errors
4. Ensure refresh token is returned from backend

### Issue: "Authentication service not available"

**Cause:** Backend auth module not enabled

**Solutions:**
1. Go to Settings page
2. Enable auth backend in API Registry
3. Or set in localStorage:
   ```javascript
   const registry = JSON.parse(localStorage.getItem('api.registry.v1'))
   registry.auth.enabled = true
   localStorage.setItem('api.registry.v1', JSON.stringify(registry))
   ```

## Production Deployment Checklist

- [ ] Change token storage from localStorage to httpOnly cookies (recommended)
- [ ] Enable HTTPS for all API communications
- [ ] Configure appropriate token expiration times
- [ ] Implement refresh token rotation
- [ ] Add rate limiting on login endpoint
- [ ] Implement account lockout after failed login attempts
- [ ] Add CSRF protection
- [ ] Configure CORS properly
- [ ] Add security headers (CSP, X-Frame-Options, etc.)
- [ ] Disable local mock authentication (`VITE_ENABLE_LOCAL_AUTH=false`)
- [ ] Enable audit logging for auth events
- [ ] Set up monitoring for auth failures
- [ ] Configure session timeout
- [ ] Implement "Remember Me" functionality if needed
- [ ] Add multi-factor authentication (MFA) support
- [ ] Test token refresh mechanism thoroughly
- [ ] Test logout from multiple tabs/devices

## Future Enhancements

### Recommended Improvements

1. **WebSocket/SSE for Real-time Auth Events**
   - Logout from all devices
   - Session hijacking detection
   - Real-time permission updates

2. **Biometric Authentication**
   - Fingerprint
   - Face recognition
   - WebAuthn/FIDO2

3. **Social Login**
   - OAuth2 integration
   - SAML support
   - LDAP/Active Directory

4. **Enhanced Security**
   - JWT blacklisting
   - Refresh token rotation
   - Device fingerprinting
   - Anomaly detection

5. **Better UX**
   - "Stay logged in" checkbox
   - Session timeout warning
   - Password strength meter
   - Password reset flow
   - Email verification

6. **Audit & Compliance**
   - Detailed audit logs
   - GDPR compliance
   - HIPAA compliance (for medical data)
   - Login history
   - Active sessions management

## API Reference

See individual service files for detailed API documentation:

- `src/services/authService.js` - Authentication operations
- `src/services/rbac.js` - Authorization and permissions
- `src/services/auth-storage.js` - Token management
- `src/hooks/useAuth.js` - React hook for auth state
- `src/hooks/useTokenRefresh.js` - Auto-refresh hook

## Support

For issues or questions:
1. Check browser console for errors
2. Review this documentation
3. Check backend logs
4. Contact development team

---

**Version:** 1.0.0
**Last Updated:** 2025-10-31
**Author:** Development Team
