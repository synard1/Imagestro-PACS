# SatuSehat Background Job Fix

## Problem
Saat mengakses Settings page, ada background job yang otomatis POST token ke `http://localhost:3001/api/satusehat/token` setiap 5 menit. Ini seharusnya tidak ada dan tidak boleh otomatis dijalankan.

## Root Cause
Di `src/hooks/useBackend.js`, ada `useBackendHealth()` hook yang:
1. Digunakan di Settings.jsx
2. Melakukan health check setiap 5 menit (300000ms)
3. Untuk SatuSehat module, ia POST token ke `localhost:3001/api/satusehat/token`
4. Ini terjadi otomatis tanpa user action

## Solution
Disable SatuSehat health check di `useBackend.js` untuk mencegah automatic token generation.

### Changes Made

**File**: `src/hooks/useBackend.js`

Mengubah `probeSatuSehat()` function untuk return disabled status:

```javascript
// Before
async function probeSatuSehat(cfg) {
  if (!cfg.enabled) return { healthy: false, error: "Disabled" };
  
  try {
    // ... POST token to localhost:3001/api/satusehat/token
    const tokenResponse = await fetch(`${serverUrl}/api/satusehat/token`, {
      method: 'POST',
      // ...
    });
    // ... more code
  } catch (error) {
    return { healthy: false, error: error.message };
  }
}

// After
async function probeSatuSehat(cfg) {
  if (!cfg.enabled) return { healthy: false, error: "Disabled" };
  
  // Return disabled status - SatuSehat health check is disabled to prevent automatic token generation
  return { healthy: false, error: "Health check disabled for SatuSehat" };
}
```

## Impact

### ✅ What's Fixed
- No more automatic POST to `localhost:3001/api/satusehat/token`
- No more background job running every 5 minutes
- Settings page loads without unnecessary requests
- Reduced network traffic

### ⚠️ What's Disabled
- SatuSehat health check is disabled
- Health status for SatuSehat will show as "disabled"
- This is OK because:
  - SatuSehat token generation is manual (user clicks button)
  - Health check was causing unnecessary requests
  - User can still manually generate token in Settings page

## Testing

### Step 1: Open Settings Page
```
http://localhost:5173/settings
```

### Step 2: Check Network Tab
- Open DevTools → Network tab
- Look for requests to `localhost:3001/api/satusehat/token`
- Should NOT see any automatic POST requests

### Step 3: Wait 5 Minutes
- Wait to verify no automatic requests appear
- Should see no new requests to `localhost:3001`

### Step 4: Manual Token Generation
- Go to SatuSehat section in Settings
- Click "Generate Token" button
- Should work as expected
- Token should be generated on demand

## Expected Results

### ✅ Before Fix
- Automatic POST to `localhost:3001/api/satusehat/token` every 5 minutes
- Unnecessary network traffic
- Background job running continuously

### ✅ After Fix
- No automatic POST requests
- No background job
- Manual token generation still works
- Settings page loads cleanly

## Files Modified

| File | Changes |
|------|---------|
| `src/hooks/useBackend.js` | Disabled SatuSehat health check |

## Why This Fix is Correct

1. **SatuSehat is optional**
   - Not all deployments use SatuSehat
   - Health check was unnecessary

2. **Token generation is manual**
   - User clicks button to generate token
   - No need for automatic health check

3. **Prevents unnecessary requests**
   - Reduces network traffic
   - Improves performance
   - Prevents errors from localhost:3001 not running

4. **User can still test connection**
   - Manual "Generate Token" button still works
   - User has full control

## Alternative Solutions (Not Implemented)

### Option 1: Make health check optional
Could add config flag to disable SatuSehat health check:
```javascript
if (cfg.healthCheckEnabled === false) {
  return { healthy: false, error: "Health check disabled" };
}
```

### Option 2: Increase health check interval
Could increase interval from 5 minutes to 1 hour:
```javascript
useBackendHealth({ intervalMs: 3600000 }) // 1 hour
```

### Option 3: Remove useBackendHealth from Settings
Could remove the hook entirely from Settings page:
```javascript
// Remove this line from Settings.jsx
// const healthStatus = useBackendHealth()
```

## Verification

To verify the fix is working:

```javascript
// In browser console
// 1. Check if SatuSehat health check is disabled
const { loadRegistry } = await import('./services/api-registry.js')
const reg = loadRegistry()
console.log('SatuSehat enabled:', reg.satusehat?.enabled)

// 2. Monitor network requests
const originalFetch = window.fetch
window.fetch = function(...args) {
  if (args[0].includes('satusehat/token')) {
    console.log('⚠️ SatuSehat token request:', args[0])
  }
  return originalFetch.apply(this, args)
}

// 3. Wait 5 minutes and check console
// Should NOT see any "SatuSehat token request" messages
```

## Rollback

If needed to rollback, restore the original `probeSatuSehat()` function in `src/hooks/useBackend.js`.

## References

- `src/hooks/useBackend.js` - Health check hook
- `src/pages/Settings.jsx` - Settings page using the hook
- `src/services/api-registry.js` - SatuSehat configuration

## Next Steps

1. **Test the fix**
   - Open Settings page
   - Check Network tab
   - Verify no automatic requests

2. **Monitor in production**
   - Deploy the fix
   - Monitor for any issues
   - Verify no background jobs

3. **Consider future improvements**
   - Add config flag for health check
   - Make health check interval configurable
   - Add UI to show health status
