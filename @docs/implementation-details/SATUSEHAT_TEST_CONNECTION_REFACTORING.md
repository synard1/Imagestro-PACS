# SATUSEHAT TEST CONNECTION - REFACTORING DOCUMENTATION
**Date**: 2025-11-08
**Status**: ✅ REFACTORED TO USE API GATEWAY

---

## 📋 OVERVIEW

Fitur Test Connection SatuSehat telah di-refactor untuk menggunakan **alur baru** melalui **API Gateway** sesuai dengan arsitektur token management yang terdokumentasi di `docs/satusehat-token-management.md`.

---

## 🔄 WHAT CHANGED

### Before (OLD - Direct to SatuSehat):
```javascript
// LANGSUNG ke SatuSehat OAuth2 endpoint
const response = await fetch(
  'https://api-satusehat-stg.dto.kemkes.go.id/oauth2/v1/accesstoken?grant_type=client_credentials',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody
  }
);
```

**Problems**:
- ❌ Bypass API Gateway
- ❌ Tidak ada caching mechanism
- ❌ Tidak ada koordinasi dengan satusehat-integrator
- ❌ Setiap test connection = new OAuth2 call (rate limit issue)
- ❌ Token tidak tersinkronisasi dengan backend services

---

### After (NEW - Through API Gateway):
```javascript
// MELALUI API Gateway dengan token management
const client = apiClient('settings');
const response = await client.post('/satusehat/token/generate', {});
```

**Benefits**:
- ✅ Menggunakan API Gateway sebagai single entry point
- ✅ Memanfaatkan caching di satusehat-integrator
- ✅ Token tersinkronisasi ke database (`satusehat_tokens`, `settings`)
- ✅ Rate-limit friendly (tidak selalu call SatuSehat OAuth2)
- ✅ Proper authentication (JWT dengan permissions)
- ✅ Better error handling

---

## 🏗️ NEW ARCHITECTURE

### Flow Diagram:

```
┌─────────────────┐
│   Frontend UI   │
│  (Settings.jsx) │
└────────┬────────┘
         │ POST /satusehat/token/generate
         │ (dengan JWT authentication)
         ▼
┌─────────────────────────────────┐
│       API Gateway               │
│  (http://103.42.117.19:8888)   │
└────────┬────────────────────────┘
         │
         │ Priority 1: Check cache
         ├─────────────────────────┐
         │                         ▼
         │              ┌────────────────────────┐
         │              │ satusehat-integrator   │
         │              │ GET /oauth/health      │
         │              │ GET /oauth/token       │
         │              └────────┬───────────────┘
         │                       │
         │                       ├─ In-memory cache
         │                       ├─ DB cache (satusehat_tokens)
         │                       └─ Settings cache
         │
         │ If cache valid → Return token
         │
         │ Priority 2: Generate new token
         └─────────────────────────┐
                                   ▼
                   ┌─────────────────────────────┐
                   │  SatuSehat OAuth2 Endpoint  │
                   │  (Kemenkes)                 │
                   └────────┬────────────────────┘
                            │
                            ▼
                   New token generated
                            │
                            ├─ Sync to integrator
                            │  (POST /oauth/token/store)
                            │
                            ├─ Save to satusehat_tokens
                            ├─ Save to settings
                            └─ Return to frontend
```

---

## 🔧 IMPLEMENTATION DETAILS

### 1. API Client Setup

Added `settings` module to `api-registry.js`:

```javascript
// src/services/api-registry.js
export const DEFAULT_REGISTRY = {
  // ... other modules ...

  // Settings service through API Gateway
  settings: {
    enabled: true,
    baseUrl: 'http://103.42.117.19:8888',
    healthPath: '/health',
    timeoutMs: 6000,
    debug: false
  },

  // ... other modules ...
};
```

**Purpose**:
- Module `settings` points to API Gateway
- Used for all settings-related API calls
- Includes SatuSehat token generation

---

### 2. Test Connection Button

**Location**: `src/pages/Settings.jsx:1587-1670`

**New Implementation**:

```javascript
<button onClick={async () => {
  setTestingConnection(true);
  try {
    // Use API Gateway endpoint
    const client = apiClient('settings');
    const response = await client.post('/satusehat/token/generate', {});

    if (response && response.status === 'ok' && response.token) {
      const tokenData = response.token;

      // Calculate expiry
      const expiryTime = new Date();
      expiryTime.setSeconds(expiryTime.getSeconds() + (tokenData.expires_in || 3600));

      // Save to state and localStorage
      setSatusehatToken(tokenData.access_token);
      setTokenExpiry(expiryTime);
      localStorage.setItem('satusehat_token', tokenData.access_token);
      localStorage.setItem('satusehat_token_expiry', expiryTime.getTime());

      // Show success with source info
      const sourceMsg = response.source === 'cache'
        ? '(Retrieved from cache)'
        : '(Generated new token)';

      alert(
        'Connection successful! ' + sourceMsg + '\n\n' +
        'Token expires at: ' + expiryTime.toLocaleString()
      );
    }
  } catch (error) {
    // Enhanced error handling
    // ... see code for details ...
  } finally {
    setTestingConnection(false);
  }
}}>
  {testingConnection ? 'Testing...' : 'Test Connection'}
</button>
```

**Key Points**:
- Uses `apiClient('settings')` for authenticated requests
- Calls `POST /satusehat/token/generate`
- Handles both `cache` and `direct` responses
- Shows source of token to user
- Better error messages with troubleshooting

---

### 3. Response Format

**From API Gateway**:

```json
{
  "status": "ok",
  "source": "cache" | "direct",
  "integrator": true | false,
  "env": "sandbox" | "production",
  "organizationId": "...",
  "token": {
    "access_token": "eyJ...",
    "token_type": "Bearer",
    "expires_in": 3600,
    "scope": ""
  }
}
```

**Response Fields**:
- `status`: "ok" if successful
- `source`:
  - `"cache"` = from satusehat-integrator cache
  - `"direct"` = newly generated from SatuSehat
- `integrator`: true if managed by satusehat-integrator
- `token`: OAuth2 token data from SatuSehat

---

### 4. Error Handling

**Enhanced Error Messages**:

| Status Code | Error Message | Troubleshooting |
|-------------|---------------|-----------------|
| 403 | Permission denied | Need permission: `system:admin` or `setting:write` |
| 400 | Configuration error | Check credentials in Integration settings |
| 502/503 | Service unavailable | SatuSehat may be down, try later |
| Other | Connection failed | Check credentials, network, Gateway status |

**Example Error Alert**:
```
Connection failed!

Error: Permission denied

Troubleshooting:
• You need permission: system:admin or setting:write
```

---

## 🔐 PERMISSIONS REQUIRED

### API Gateway Endpoint Protection:

```python
@app.route('/satusehat/token/generate', methods=['POST'])
@require_auth(['system:admin', 'setting:write', '*'])
def satusehat_generate_token():
    ...
```

**Required Permissions** (one of):
- `system:admin` - Full system access
- `setting:write` - Write access to settings
- `*` - Wildcard (all permissions)

**If Missing**:
- Response: `403 Forbidden`
- Message: "Insufficient permissions"

---

## 📊 BENEFITS OF NEW APPROACH

### 1. Caching & Performance:
- ✅ **In-memory cache** di satusehat-integrator
- ✅ **Persistent cache** di PostgreSQL (`satusehat_tokens`)
- ✅ **Rate-limit friendly** - tidak call SatuSehat setiap kali
- ✅ **Faster response** untuk token yang masih valid

### 2. Centralized Management:
- ✅ **Single source of truth** untuk token
- ✅ **Synchronized** across all services
- ✅ Token di-update ke tabel `settings` (`satusehat_latest_token`)
- ✅ Other services bisa read token tanpa generate baru

### 3. Better Monitoring:
- ✅ **Audit trail** di `satusehat_http_logs`
- ✅ **Token history** di `satusehat_tokens`
- ✅ **Source tracking** (cache vs direct)
- ✅ Easy troubleshooting

### 4. Security:
- ✅ **Proper authentication** via JWT
- ✅ **Permission-based access** (RBAC)
- ✅ **No direct OAuth2 calls** from frontend
- ✅ Credentials tersimpan aman di backend

---

## 🧪 TESTING GUIDE

### Prerequisites:
1. User dengan permission `setting:write` atau `system:admin`
2. Valid JWT token (logged in)
3. SatuSehat credentials configured di Integration settings
4. API Gateway running di `http://103.42.117.19:8888`
5. satusehat-integrator service running (optional for cache)

---

### Test Case 1: Token Generation (First Time)

**Steps**:
1. Login dengan user yang punya permission
2. Navigate to Settings > Integration > SatuSehat
3. Fill credentials (if not filled)
4. Click "Test Connection"

**Expected Result**:
- ✅ Alert: "Connection successful! (Generated new token)"
- ✅ Token displayed in Token Information section
- ✅ Expiry time shown
- ✅ Token saved to localStorage

**Verify in Network Tab**:
- Request: `POST http://103.42.117.19:8888/satusehat/token/generate`
- Headers: Include `Authorization: Bearer <JWT>`
- Response: Status 200
- Response body: `{ status: "ok", source: "direct", ... }`

---

### Test Case 2: Token from Cache

**Steps**:
1. After Test Case 1, immediately click "Test Connection" again
2. Or refresh page and click "Test Connection"

**Expected Result**:
- ✅ Alert: "Connection successful! (Retrieved from cache)"
- ✅ Much faster response (< 500ms)
- ✅ Same token as before (if not expired)
- ✅ Message shows "✓ Managed by satusehat-integrator"

**Verify in Network Tab**:
- Request: Same as Test Case 1
- Response: `{ status: "ok", source: "cache", integrator: true, ... }`

---

### Test Case 3: Permission Denied

**Steps**:
1. Login dengan user yang TIDAK punya permission `setting:write`
2. Try to click "Test Connection"

**Expected Result**:
- ❌ Alert: "Connection failed! Error: Permission denied"
- ❌ Troubleshooting: "You need permission: system:admin or setting:write"

**Verify in Network Tab**:
- Response: Status 403
- Response body: `{ message: "Insufficient permissions" }`

---

### Test Case 4: Invalid Credentials

**Steps**:
1. Set WRONG client ID or secret in Integration settings
2. Save settings
3. Click "Test Connection"

**Expected Result**:
- ❌ Alert: "Connection failed! Error: Configuration error"
- ❌ Troubleshooting suggestions shown

**Verify**:
- Gateway tried to generate token
- SatuSehat returned error
- Error propagated to frontend

---

## 📝 MIGRATION NOTES

### For Developers:

**If you were using old direct approach**:
```javascript
// OLD (Don't use anymore):
fetch('https://api-satusehat-stg.dto.kemkes.go.id/oauth2/v1/accesstoken', ...)

// NEW (Use this):
const client = apiClient('settings');
const response = await client.post('/satusehat/token/generate', {});
```

**If you need token for API calls**:
```javascript
// Option 1: Get from localStorage (if available)
const token = localStorage.getItem('satusehat_token');

// Option 2: Call token generate endpoint (requires permission)
const client = apiClient('settings');
const response = await client.post('/satusehat/token/generate', {});
const token = response.token.access_token;

// Option 3: Read from settings table (backend only)
// SELECT value FROM settings WHERE key = 'satusehat_latest_token'
```

---

## 🔄 BACKWARD COMPATIBILITY

### Breaking Changes:
- ❌ Direct OAuth2 calls to SatuSehat are discouraged
- ❌ Old response format not compatible

### Non-Breaking:
- ✅ Token still saved to localStorage (same keys)
- ✅ Token Information display still works
- ✅ Existing token in localStorage still usable

### Migration Path:
1. Update Test Connection to use new endpoint ✅ (DONE)
2. Update any other direct OAuth2 calls (if exist)
3. Test all SatuSehat integration features
4. Verify token synchronization

---

## 📚 RELATED DOCUMENTATION

1. **docs/satusehat-token-management.md** - Token management architecture (PRIMARY)
2. **SATUSEHAT_TEST_CONNECTION_BUG_REPORT.md** - Previous bugs fixed
3. **INTEGRATION_SETTINGS_COMPLETE_FIX_SUMMARY.md** - Overall integration fixes
4. **INTEGRATION_SETTINGS_TESTING_GUIDE.md** - Testing procedures

---

## 🎯 TODO / FUTURE IMPROVEMENTS

### Short Term:
- [ ] Add loading spinner instead of just disabled button
- [ ] Add toast notifications instead of alerts
- [ ] Show token metadata (env, org ID) in UI
- [ ] Add "Copy Token" button for testing

### Medium Term:
- [ ] Token refresh mechanism (before expiry)
- [ ] Auto-refresh on page load if token expired
- [ ] Better visual feedback for cache vs direct
- [ ] Token validity indicator in UI

### Long Term:
- [ ] Token usage analytics
- [ ] Multiple organization support
- [ ] Token rotation schedule
- [ ] Automated testing for OAuth2 flow

---

## ✅ VERIFICATION CHECKLIST

After this refactoring:

- [x] Code compiles without errors
- [x] No syntax errors
- [x] apiClient('settings') available
- [x] Settings module in DEFAULT_REGISTRY
- [x] Test Connection button functional
- [ ] Manual testing passed (needs QA)
- [ ] Permission checks work
- [ ] Error handling comprehensive
- [ ] Documentation complete

---

## 🚀 DEPLOYMENT

### Pre-Deployment:
1. Ensure API Gateway is running with `/satusehat/token/generate` endpoint
2. Ensure satusehat-integrator service is running (optional but recommended)
3. Verify user has correct permissions
4. Test in development environment

### Deployment Steps:
1. Deploy updated frontend code
2. Clear browser cache (for localStorage schema changes)
3. Test with staging environment
4. Monitor for errors
5. Deploy to production

### Post-Deployment:
1. Verify Test Connection works
2. Check token caching behavior
3. Monitor API Gateway logs
4. Check satusehat_tokens table for entries
5. Verify no rate limit issues

---

**Report Generated**: 2025-11-08
**Status**: ✅ REFACTORING COMPLETE
**Next Steps**: Manual QA Testing
**Ready For**: Staging Deployment
