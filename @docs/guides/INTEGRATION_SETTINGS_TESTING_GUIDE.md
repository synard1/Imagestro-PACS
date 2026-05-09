# INTEGRATION SETTINGS - MANUAL TESTING GUIDE
**Version**: 1.0
**Date**: 2025-11-08

---

## PREREQUISITES

### 1. Backend Services Running
Ensure the following services are running:

- **Settings Gateway**: http://103.42.117.19:8888
- **Local Dev Server** (optional): http://localhost:3001
- **Frontend Dev Server**: http://localhost:5174

### 2. User Account with Permissions
You need a user account with the following permissions:
- `setting:read` - untuk membaca konfigurasi
- `setting:write` - untuk menyimpan konfigurasi

### 3. Browser Console Access
Open Browser DevTools (F12) to monitor:
- Network requests
- Console logs
- LocalStorage values

---

## TESTING CHECKLIST

### PREPARATION

- [ ] Login ke aplikasi dengan user yang memiliki permission `setting:read` dan `setting:write`
- [ ] Buka Browser DevTools (F12)
- [ ] Navigate to Settings > Integration tab
- [ ] Clear browser console untuk hasil yang bersih

---

## TEST 1: DICOM ROUTER - READ OPERATION

### Steps:
1. Klik tab **Integration** di Settings
2. Pilih sub-tab **DICOM Router**
3. Observe form fields yang ter-populate

### Expected Results:
✅ Form fields terisi dengan data dari backend
✅ Console menampilkan: `Loading integration registry from backend...`
✅ Network tab menampilkan request:
   - URL: `http://103.42.117.19:8888/settings/integration_registry`
   - Method: `GET`
   - Status: `200 OK`
   - Headers: Include `Authorization: Bearer <token>`

### Verification in DevTools:

**Console Check:**
```
[Integration Settings] Loading integration registry from backend...
[Integration Settings] Successfully loaded from backend
```

**Network Check:**
- Request URL: `http://103.42.117.19:8888/settings/integration_registry`
- Request Method: GET
- Status Code: 200
- Response Headers: Contains `content-type: application/json`
- Response Body:
  ```json
  {
    "setting": {
      "key": "integration_registry",
      "value": {
        "dicomRouter": {
          "enabled": true/false,
          "apiUrl": "...",
          "timeoutMs": 30000,
          ...
        },
        ...
      }
    }
  }
  ```

### What to Check:
- [ ] Form populated with correct values
- [ ] Network request went to backend (not localhost:3001)
- [ ] No errors in console
- [ ] No fallback to localStorage

**PASS/FAIL**: ____________

**Notes**: ________________________________________

---

## TEST 2: DICOM ROUTER - UPDATE OPERATION

### Test Data:
Use the following test values:
- **Router API URL**: `http://test-router:8080/api/dicom`
- **Organization ID**: `TEST_ORG_001`
- **Router Node AE**: `TEST_ROUTER`
- **Default Station AE**: `TEST_STATION`
- **API Timeout**: `30000`

### Steps:
1. Ensure you're on **Integration > DICOM Router** tab
2. Check "Enable DICOM Router Integration"
3. Fill in the test data above
4. Click **"Save Router Settings"** button
5. Observe Network tab and Console

### Expected Results:
✅ Alert: "Integration settings saved to backend."
✅ Console menampilkan: `Saving integration registry to backend...`
✅ Network tab menampilkan request:
   - URL: `http://103.42.117.19:8888/settings/integration_registry`
   - Method: `PUT`
   - Status: `200 OK`
   - Request Payload contains updated dicomRouter config

### Verification in DevTools:

**Console Check:**
```
[Integration Settings] Saving integration registry to backend...
[Integration Settings] Successfully saved to backend
```

**Network Check:**
- Request URL: `http://103.42.117.19:8888/settings/integration_registry`
- Request Method: PUT
- Status Code: 200
- Request Payload:
  ```json
  {
    "value": {
      "dicomRouter": {
        "enabled": true,
        "apiUrl": "http://test-router:8080/api/dicom",
        "organizationId": "TEST_ORG_001",
        "routerAeTitle": "TEST_ROUTER",
        "defaultStationAe": "TEST_STATION",
        "timeoutMs": 30000
      },
      ...
    },
    "description": "Integration modules registry configuration"
  }
  ```
- Response Body: Should return updated settings

### What to Check:
- [ ] Alert message appears
- [ ] Network PUT request sent to backend
- [ ] Request payload contains correct test data
- [ ] Response status is 200
- [ ] No errors in console
- [ ] No fallback to localStorage save

**PASS/FAIL**: ____________

**Notes**: ________________________________________

---

## TEST 3: DICOM ROUTER - TEST CONNECTION

### Steps:
1. On **Integration > DICOM Router** tab
2. Click **"Test Router Connection"** button
3. Observe response

### Expected Results:
- ✅ If router is running: Alert "DICOM Router connection successful!"
- ⚠️ If router is down: Alert "DICOM Router connection failed: ..."
- ✅ Network request to router health endpoint

### Verification in DevTools:

**Network Check:**
- Request URL: Should attempt to connect to configured router API
- Method: GET
- Path: `/health` (or configured health path)

### What to Check:
- [ ] Test connection button functional
- [ ] Appropriate alert message
- [ ] Network request sent to router
- [ ] Error handling works

**PASS/FAIL**: ____________

**Notes**: ________________________________________

---

## TEST 4: DICOM ROUTER - PERSISTENCE CHECK

### Steps:
1. After saving (Test 2), **refresh the page** (F5)
2. Login again if session expired
3. Navigate back to **Settings > Integration > DICOM Router**
4. Verify form fields

### Expected Results:
✅ Form fields populated with previously saved test data
✅ Organization ID: `TEST_ORG_001`
✅ Router AE: `TEST_ROUTER`
✅ All other fields match what was saved

### What to Check:
- [ ] Data persisted after page reload
- [ ] No data loss
- [ ] Data loaded from backend (not localStorage)

**PASS/FAIL**: ____________

**Notes**: ________________________________________

---

## TEST 5: SATUSEHAT - READ OPERATION

### Steps:
1. Klik tab **Integration** di Settings
2. Pilih sub-tab **SatuSehat**
3. Observe form fields

### Expected Results:
✅ Form fields terisi dengan data dari backend
✅ Console menampilkan: `Loading integration registry from backend...`
✅ Network tab menampilkan GET request ke backend

### Verification:
Same as Test 1, but check `satusehat` section of response:
```json
{
  "setting": {
    "value": {
      "satusehat": {
        "enabled": true/false,
        "env": "sandbox",
        "clientId": "...",
        "organizationId": "...",
        ...
      }
    }
  }
}
```

### What to Check:
- [ ] Form populated correctly
- [ ] Network request to backend
- [ ] No errors in console

**PASS/FAIL**: ____________

**Notes**: ________________________________________

---

## TEST 6: SATUSEHAT - UPDATE OPERATION (FIXED)

### Test Data:
- **Environment**: `Sandbox`
- **Organization ID**: `test_org_123`
- **Client ID**: `test_client_id_456`
- **Client Secret**: `test_secret_789`
- **Token Endpoint**: Use default sandbox URL

### Steps:
1. On **Integration > SatuSehat** tab
2. Check "Enable SatuSehat Integration"
3. Select Environment: **Sandbox**
4. Fill in test data above
5. Click **"Save SatuSehat Settings"** button
6. **IMPORTANT**: Observe Network tab

### Expected Results (AFTER FIX):
✅ Alert: "Integration settings saved to backend."
✅ Network tab shows PUT request to backend
✅ Request sent to: `http://103.42.117.19:8888/settings/integration_registry`
✅ Method: `PUT`
✅ Payload includes updated satusehat config

### ⚠️ BEFORE FIX (OLD BEHAVIOR):
❌ Network tab shows NO PUT request
❌ Only localStorage update
❌ Alert: "SatuSehat OAuth2 settings saved." (no backend mention)

### Verification in DevTools:

**Console Check (AFTER FIX):**
```
[Integration Settings] Saving integration registry to backend...
[Integration Settings] Successfully saved to backend
```

**Network Check (AFTER FIX):**
- Request URL: `http://103.42.117.19:8888/settings/integration_registry`
- Request Method: PUT
- Status Code: 200
- Request Payload:
  ```json
  {
    "value": {
      "satusehat": {
        "enabled": true,
        "env": "sandbox",
        "clientId": "test_client_id_456",
        "clientSecret": "test_secret_789",
        "organizationId": "test_org_123",
        ...
      },
      ...
    }
  }
  ```

### What to Check:
- [ ] **CRITICAL**: Network PUT request sent (NOT just localStorage)
- [ ] Alert message mentions "backend"
- [ ] Request payload contains correct test data
- [ ] Response status is 200
- [ ] No errors in console

**PASS/FAIL**: ____________

**Notes**: ________________________________________

---

## TEST 7: SATUSEHAT - PERSISTENCE CHECK

### Steps:
1. After saving (Test 6), **refresh the page**
2. Login if needed
3. Navigate to **Settings > Integration > SatuSehat**
4. Verify form fields

### Expected Results:
✅ Form populated with previously saved test data
✅ Organization ID: `test_org_123`
✅ Client ID: `test_client_id_456`
✅ Environment: Sandbox

### What to Check:
- [ ] Data persisted after page reload
- [ ] Data loaded from backend
- [ ] All fields match saved values

**PASS/FAIL**: ____________

**Notes**: ________________________________________

---

## TEST 8: SATUSEHAT - TEST CONNECTION

### Prerequisites:
- Valid SatuSehat credentials (get from Kemenkes)
- Or use test credentials provided by backend team

### Steps:
1. On **Integration > SatuSehat** tab
2. Enter valid credentials
3. Click **"Test Connection"** button
4. Wait for OAuth2 token fetch

### Expected Results:
- ✅ If credentials valid: Alert showing token received
- ⚠️ If credentials invalid: Alert with error message
- ✅ Token stored in localStorage for session

### Verification:
**Console Check:**
```
[SatuSehat] Fetching OAuth2 token...
[SatuSehat] Token received successfully
```

**Network Check:**
- Request to SatuSehat token endpoint
- Method: POST
- Payload contains client credentials

**LocalStorage Check:**
Open DevTools > Application > LocalStorage > check for:
- `satusehat_token`
- `satusehat_token_expiry`

### What to Check:
- [ ] Test connection functional
- [ ] OAuth2 flow works
- [ ] Token stored correctly
- [ ] Expiry time calculated
- [ ] Clear token button works

**PASS/FAIL**: ____________

**Notes**: ________________________________________

---

## TEST 9: FALLBACK BEHAVIOR (CRITICAL)

### Purpose:
Verify that system properly handles backend unavailability

### Setup:
1. Save test data to backend (use Tests 2 & 6)
2. **Stop backend service** or block network to `103.42.117.19:8888`

### Test 9A: Read with Backend Down

**Steps:**
1. Refresh the page
2. Navigate to Settings > Integration
3. Observe behavior

**Expected Results (Current Implementation with Fallback):**
⚠️ Falls back to local dev server (localhost:3001)
⚠️ Or falls back to localStorage
⚠️ Console warning: "Failed to fetch from backend, using fallback"

**Expected Results (Strict Mode - Recommended):**
❌ Error message: "Cannot load settings - backend unavailable"
❌ Form disabled or shows error state
❌ No silent fallback

### What to Check:
- [ ] Error is visible to user
- [ ] No silent data loss
- [ ] Clear indication of backend unavailability

**Current Behavior**: ____________

**Notes**: ________________________________________

### Test 9B: Update with Backend Down

**Steps:**
1. With backend still down
2. Try to save changes
3. Observe behavior

**Expected Results (Current Implementation):**
⚠️ May silently save to localStorage only
⚠️ Console warning shown

**Expected Results (Strict Mode - Recommended):**
❌ Error alert: "Cannot save - backend unavailable"
❌ Changes not saved
❌ User instructed to retry later

### What to Check:
- [ ] User notified of failure
- [ ] Data not silently saved to wrong location
- [ ] Clear error message

**Current Behavior**: ____________

**Notes**: ________________________________________

---

## TEST 10: CROSS-TAB SYNC

### Purpose:
Verify that settings sync across multiple browser tabs

### Steps:
1. Open app in **Tab A**
2. Open app in **Tab B** (new tab, same browser)
3. Login in both tabs
4. In **Tab A**: Change DICOM Router config, click Save
5. In **Tab B**: Refresh page or navigate away and back
6. Observe if changes appear in Tab B

### Expected Results:
✅ Changes saved in Tab A appear in Tab B after refresh
✅ Both tabs show same data
✅ Data sourced from backend (not just localStorage sync)

### What to Check:
- [ ] Data syncs across tabs
- [ ] No stale data issues
- [ ] Backend is source of truth

**PASS/FAIL**: ____________

**Notes**: ________________________________________

---

## TEST 11: PERMISSION DENIED SCENARIO

### Setup:
1. Login with user that has `setting:read` but NOT `setting:write`
2. Or simulate 403 error

### Steps:
1. Navigate to Settings > Integration
2. Change some values
3. Click Save

### Expected Results:
❌ Alert: "Permission denied" or similar
❌ HTTP 403 response
❌ Changes not saved
⚠️ Yellow warning banner shown (if implemented)

### What to Check:
- [ ] Permission error handled gracefully
- [ ] User informed clearly
- [ ] No silent failure
- [ ] Form can be made read-only for users without write permission

**PASS/FAIL**: ____________

**Notes**: ________________________________________

---

## TEST 12: NO CRUD VERIFICATION

### Purpose:
Verify documentation is correct about missing CRUD features

### Steps:
1. Navigate to Settings > Integration > DICOM Router
2. Look for buttons/UI elements

### What to Check:
- [ ] ❌ NO "Add New Router" button
- [ ] ❌ NO list/table of multiple routers
- [ ] ❌ NO "Delete Router" button
- [ ] ❌ NO "Edit Router" modal
- [ ] ✅ ONLY single configuration form

### Repeat for SatuSehat:
- [ ] ❌ NO "Add Organization" button
- [ ] ❌ NO list/table of organizations
- [ ] ❌ NO "Delete Organization" button
- [ ] ✅ ONLY single OAuth2 config form

**Confirmed**: This is NOT a CRUD system

**Notes**: ________________________________________

---

## SUMMARY CHECKLIST

### Critical Tests (Must Pass):
- [ ] Test 2: DICOM Router UPDATE sends to backend
- [ ] Test 6: SatuSehat UPDATE sends to backend (FIXED)
- [ ] Test 4: DICOM Router persistence
- [ ] Test 7: SatuSehat persistence

### Important Tests:
- [ ] Test 1: DICOM Router READ from backend
- [ ] Test 5: SatuSehat READ from backend
- [ ] Test 9: Fallback behavior understood
- [ ] Test 11: Permission handling

### Nice to Have:
- [ ] Test 3: DICOM Router connection test
- [ ] Test 8: SatuSehat OAuth2 test
- [ ] Test 10: Cross-tab sync
- [ ] Test 12: No CRUD confirmation

---

## ISSUE REPORTING

If any test fails, report with:
1. **Test Number & Name**
2. **Expected Result**
3. **Actual Result**
4. **Screenshots** (Network tab, Console, UI)
5. **Browser & Version**
6. **Backend Status** (up/down)
7. **User Permissions**

---

## AUTOMATED TEST SCRIPT

For automated backend testing (requires auth):

```bash
# Note: Requires authentication token
node test-integration-settings.js
```

**Current Issue**: Script returns 401 because it needs auth token
**Solution**: Login through UI first, copy token from localStorage, add to script

---

## ROLLBACK PROCEDURE

If issues found after fix deployment:

### Rollback SatuSehat Save Button:
```bash
git diff Settings.jsx
# Verify the change at line 1583
git checkout HEAD~1 -- src/pages/Settings.jsx
```

Or manually change back:
```javascript
// BEFORE FIX (rollback to this):
onClick={() => {
  saveRegistry(draftRegistry);
  setRegistry({ ...draftRegistry });
  alert('SatuSehat OAuth2 settings saved.');
}}

// AFTER FIX (current):
onClick={onSaveRegistry}
```

---

**Testing Guide Version**: 1.0
**Last Updated**: 2025-11-08
**Next Review**: After fix deployment
