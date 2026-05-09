# Debug Settings Page Errors

## Steps to Debug

### 1. Open Settings Page
```
http://localhost:5173/settings
```

### 2. Open Browser DevTools
- Press F12
- Go to Console tab

### 3. Check for Errors
Look for messages like:
- `[http] Converting to proxy URL`
- `Failed to fetch`
- `CORS error`
- `404 Not Found`

### 4. Check Network Tab
- Go to Network tab
- Look for failed requests (red)
- Check if requests are going to `/backend-api/*` or direct to `103.42.117.19:8888`

### 5. Common Issues

#### Issue 1: Requests still going to direct backend
**Solution**: 
- Restart dev server: `npm run dev`
- Clear browser cache: Ctrl+Shift+Delete
- Check vite.config.js has proxy config

#### Issue 2: 404 errors on /backend-api/*
**Solution**:
- Backend endpoint might not exist
- Check if endpoint path is correct
- Verify backend is running

#### Issue 3: Authorization errors
**Solution**:
- Check if token is expired
- Re-login
- Check localStorage: `localStorage.getItem('auth.session.v1')`

## Debugging Commands

### In Browser Console

```javascript
// Check if proxy is working
fetch('/backend-api/health')
  .then(r => r.json())
  .then(d => console.log('✅ Proxy works:', d))
  .catch(e => console.error('❌ Proxy failed:', e))

// Check auth token
const auth = JSON.parse(localStorage.getItem('auth.session.v1'))
console.log('Token:', auth?.access_token?.substring(0, 50) + '...')

// Check API logs
console.log(window.__API_LOGS__)

// Check if dev mode
console.log('Is Dev:', import.meta.env.DEV)
```

## Expected Behavior

### Settings Page Should:
1. ✅ Load without CORS errors
2. ✅ Display all configuration tabs
3. ✅ Load settings from backend via proxy
4. ✅ Allow saving settings
5. ✅ Show success/error messages

### Network Requests Should:
1. ✅ Go to `/backend-api/*` (not direct to backend)
2. ✅ Have Authorization header
3. ✅ Return 200 OK status
4. ✅ Have proper response data

## If Still Having Issues

1. **Check vite.config.js**
   ```bash
   grep -A 5 "'/backend-api'" vite.config.js
   ```

2. **Check http.js**
   ```bash
   grep -n "getProxiedUrl" src/services/http.js
   ```

3. **Check settingsService.js**
   ```bash
   grep -n "apiClient('settings')" src/services/settingsService.js
   ```

4. **Restart everything**
   ```bash
   # Kill dev server (Ctrl+C)
   npm run dev
   # Clear browser cache
   # Reload page
   ```

## Specific Settings Endpoints

These endpoints should be called via proxy:

- `GET /settings/accession_config` - Get accession config
- `POST /settings/accession_config` - Save accession config
- `GET /settings/order_number_config` - Get order number config
- `POST /settings/order_number_config` - Save order number config
- `GET /settings/company_profile` - Get company profile
- `POST /settings/company_profile` - Save company profile
- `GET /settings/integration_registry` - Get integration registry
- `POST /settings/integration_registry` - Save integration registry
- `GET /settings/notification_config` - Get notification config
- `POST /settings/notification_config` - Save notification config

All should be accessed as:
```
/backend-api/settings/accession_config
/backend-api/settings/order_number_config
etc.
```

## Monitoring

### Real-time Monitoring
```javascript
// In browser console, run this to monitor all API calls
const originalFetch = window.fetch;
window.fetch = function(...args) {
  console.log('🔵 API Call:', args[0]);
  return originalFetch.apply(this, args)
    .then(r => {
      console.log('✅ Response:', r.status, args[0]);
      return r;
    })
    .catch(e => {
      console.error('❌ Error:', args[0], e);
      throw e;
    });
};
```

## Performance

If Settings page is slow:
1. Check Network tab for slow requests
2. Look for waterfall of requests
3. Check if requests are being retried
4. Verify backend is responsive

## Next Steps

1. Open Settings page
2. Check console for errors
3. Check Network tab for failed requests
4. Report specific error messages
5. We can then fix specific endpoints
