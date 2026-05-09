# Comprehensive Debug Guide

## Current Status

### Backend Architecture
1. **Backend API** (`http://103.42.117.19:8888`)
   - Orders, Patients, Doctors, Procedures, Settings, Auth, etc.
   - Requires proxy: `/backend-api` → `http://103.42.117.19:8888`

2. **Local PACS Server** (`http://localhost:8003`)
   - Studies, Worklist, HL7, MWL, Audit, Storage Config, etc.
   - Direct access (no proxy needed)

3. **Local Data Server** (`http://localhost:3001`)
   - Optional local data sync server
   - Direct access (no proxy needed)

## Network Requests Analysis

### ✅ Correct Requests (to localhost:8003)
These are OK and should work:
- `/api/worklist` → `localhost:8003`
- `/api/studies` → `localhost:8003`
- `/api/hl7` → `localhost:8003`
- `/api/audit` → `localhost:8003`

### ✅ Correct Requests (via proxy)
These should go through `/backend-api`:
- `/backend-api/orders` → Vite Proxy → `103.42.117.19:8888/orders`
- `/backend-api/settings` → Vite Proxy → `103.42.117.19:8888/settings`
- `/backend-api/auth` → Vite Proxy → `103.42.117.19:8888/auth`

### ❌ Problem Requests
If you see these, they're errors:
- Direct to `103.42.117.19:8888` (should be via proxy)
- CORS errors on `/backend-api/*`
- 404 errors on `/backend-api/*`

## Debugging Steps

### Step 1: Check Network Tab
Open DevTools → Network tab

Look for:
1. **Requests to `/backend-api/*`**
   - Should return 200 OK
   - Should have proper response data
   - Should NOT have CORS errors

2. **Requests to `localhost:8003`**
   - Should return 200 OK
   - These are local PACS server requests (OK)

3. **Requests to `103.42.117.19:8888` (direct)**
   - Should NOT exist
   - If they do, it's a bug

### Step 2: Check Console
Open DevTools → Console tab

Look for:
- ✅ No CORS errors
- ✅ No "Failed to fetch" errors
- ✅ No 404 errors on `/backend-api/*`

### Step 3: Check Specific Errors

#### Error: "Failed to fetch /backend-api/..."
**Cause**: Backend not running or endpoint doesn't exist
**Solution**: 
- Verify backend is running: `curl http://103.42.117.19:8888/health`
- Check if endpoint exists in backend API

#### Error: "CORS error on /backend-api/..."
**Cause**: Proxy not working
**Solution**:
- Restart dev server: `npm run dev`
- Check vite.config.js has proxy config
- Clear browser cache

#### Error: "404 Not Found on /backend-api/..."
**Cause**: Endpoint path is wrong
**Solution**:
- Check endpoint path in service
- Verify backend API documentation
- Check if endpoint exists

#### Error: "401 Unauthorized"
**Cause**: Token expired or invalid
**Solution**:
- Re-login
- Check localStorage: `localStorage.getItem('auth.session.v1')`
- Check if token is expired

### Step 4: Test Specific Endpoints

#### Test Backend API (via proxy)
```javascript
// In browser console
fetch('/backend-api/health')
  .then(r => r.json())
  .then(d => console.log('✅ Backend API works:', d))
  .catch(e => console.error('❌ Backend API failed:', e))
```

#### Test Local PACS Server
```javascript
// In browser console
fetch('http://localhost:8003/api/health')
  .then(r => r.json())
  .then(d => console.log('✅ PACS Server works:', d))
  .catch(e => console.error('❌ PACS Server failed:', e))
```

#### Test Auth
```javascript
// In browser console
fetch('/backend-api/auth/verify')
  .then(r => r.json())
  .then(d => console.log('✅ Auth works:', d))
  .catch(e => console.error('❌ Auth failed:', e))
```

#### Test Orders
```javascript
// In browser console
fetch('/backend-api/orders?limit=10')
  .then(r => r.json())
  .then(d => console.log('✅ Orders works:', d))
  .catch(e => console.error('❌ Orders failed:', e))
```

#### Test Settings
```javascript
// In browser console
fetch('/backend-api/settings/accession_config')
  .then(r => r.json())
  .then(d => console.log('✅ Settings works:', d))
  .catch(e => console.error('❌ Settings failed:', e))
```

### Step 5: Check Registry Configuration

```javascript
// In browser console
const { loadRegistry } = await import('./services/api-registry.js')
const reg = loadRegistry()

// Check backend API modules
console.log('Auth baseUrl:', reg.auth.baseUrl)
console.log('Orders baseUrl:', reg.orders.baseUrl)
console.log('Settings baseUrl:', reg.settings.baseUrl)

// Check local PACS modules
console.log('Studies baseUrl:', reg.studies.baseUrl)
console.log('Worklist baseUrl:', reg.worklist.baseUrl)
console.log('Audit baseUrl:', reg.audit.baseUrl)
```

Expected output:
```
Auth baseUrl: /backend-api
Orders baseUrl: /backend-api
Settings baseUrl: /backend-api
Studies baseUrl: http://localhost:8003
Worklist baseUrl: http://localhost:8003
Audit baseUrl: http://localhost:8003
```

### Step 6: Check Config

```javascript
// In browser console
const { getConfig } = await import('./services/config.js')
const cfg = await getConfig()
console.log('API Base URL:', cfg.apiBaseUrl)
console.log('Backend Enabled:', cfg.backendEnabled)
```

Expected output:
```
API Base URL: /backend-api
Backend Enabled: true
```

### Step 7: Monitor All Requests

```javascript
// In browser console
const originalFetch = window.fetch
let requestCount = 0

window.fetch = function(...args) {
  requestCount++
  const url = args[0]
  const method = (args[1]?.method || 'GET').toUpperCase()
  
  console.log(`[${requestCount}] ${method} ${url}`)
  
  return originalFetch.apply(this, args)
    .then(response => {
      console.log(`    ✅ ${response.status}`)
      return response
    })
    .catch(error => {
      console.error(`    ❌ ${error.message}`)
      throw error
    })
}
```

## Common Issues and Solutions

### Issue 1: Settings Page Shows Errors
**Symptoms**: Settings page loads but shows error messages

**Debug**:
1. Check Network tab for failed requests
2. Look for `/backend-api/settings/*` requests
3. Check if they return 200 OK or error status

**Solutions**:
- If 404: Endpoint doesn't exist in backend
- If 401: Token expired, re-login
- If CORS error: Proxy not working, restart dev server
- If timeout: Backend not responding, check if running

### Issue 2: Orders Page Shows No Data
**Symptoms**: Orders page loads but no data displayed

**Debug**:
1. Check Network tab for `/backend-api/orders` request
2. Check response status and data

**Solutions**:
- If 404: Endpoint doesn't exist
- If 401: Token expired
- If 200 but no data: Backend returned empty list (OK)
- If timeout: Backend not responding

### Issue 3: Dashboard Shows Errors
**Symptoms**: Dashboard page shows error messages

**Debug**:
1. Check Network tab for `/backend-api/*` requests
2. Look for failed requests

**Solutions**:
- Same as Settings Page issues

### Issue 4: Worklist/Studies Page Shows Errors
**Symptoms**: Worklist or Studies page shows errors

**Debug**:
1. Check Network tab for `localhost:8003` requests
2. These are local PACS server requests

**Solutions**:
- If 404: Local PACS server not running
- If timeout: Local PACS server not responding
- If connection refused: Local PACS server not running

## Checklist

- [ ] Dev server running: `npm run dev`
- [ ] Backend API running: `curl http://103.42.117.19:8888/health`
- [ ] Local PACS server running (if needed): `curl http://localhost:8003/api/health`
- [ ] Vite proxy configured: Check `vite.config.js`
- [ ] Registry URLs correct: Check `/backend-api` for backend modules
- [ ] Auth token valid: Check localStorage
- [ ] No CORS errors in console
- [ ] Network requests going to correct URLs

## Next Steps

1. **Identify specific error**
   - Check Network tab
   - Check Console
   - Note exact error message

2. **Determine root cause**
   - Is it a backend API error?
   - Is it a local PACS server error?
   - Is it a proxy error?
   - Is it an auth error?

3. **Apply appropriate fix**
   - If backend API: Check backend is running
   - If local PACS: Check local server is running
   - If proxy: Restart dev server
   - If auth: Re-login

4. **Verify fix**
   - Check Network tab
   - Check Console
   - Test specific endpoint
   - Verify data loads correctly

## References

- [Vite Proxy Documentation](https://vitejs.dev/config/server-options.html#server-proxy)
- [CORS MDN Documentation](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [Fetch API Documentation](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)
