# Doctor Update Error - Debug Guide

## Error: "Resource not found" saat Update Doctor

### Gejala Error
```
[doctorService] Update doctor failed: Error: Resource not found.
PUT /doctors/{id} - 404
PUT /api/doctors/{id} - 404
```

### Penyebab Umum

#### 1. **Doctor Sudah Dihapus (Soft Deleted)**
Doctor dengan ID tersebut mungkin sudah di-soft delete (active = false).

**Cara Check:**
```bash
# Test dengan curl
curl -X GET "http://103.42.117.19:8888/doctors/{doctor-id}" \
  -H "Authorization: Bearer {your-jwt-token}"
```

**Expected Response:**
- **404**: Doctor tidak ditemukan atau sudah dihapus
- **200**: Doctor masih ada

#### 2. **ID Tidak Valid**
ID yang digunakan mungkin salah atau sudah expired.

**Solusi:**
- Refresh halaman list doctors
- Copy ID yang baru dari list
- Try edit lagi

#### 3. **Endpoint Path Salah**
Backend mungkin menggunakan path yang berbeda.

**Test Endpoints:**
```bash
# Test endpoint 1
curl -X PUT "http://103.42.117.19:8888/doctors/{id}" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"specialty": "Test Update"}'

# Test endpoint 2
curl -X PUT "http://103.42.117.19:8888/api/doctors/{id}" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"specialty": "Test Update"}'
```

#### 4. **Permission Issue**
JWT token tidak memiliki permission untuk update.

**Check:**
```javascript
// Decode JWT payload
const payload = JSON.parse(atob(token.split('.')[1]))
console.log('Permissions:', payload.permissions)
// Should include: ["*"] atau ["doctor:update"]
```

---

## Quick Debug dengan Node.js

### Test Script
```bash
# Run test script
node test-doctor-update.js "your-jwt-token" "doctor-id"
```

**Script akan:**
1. ✓ Check apakah doctor exists (GET)
2. ✓ Try update doctor (PUT)
3. ✓ Test multiple endpoints
4. ✓ Show detailed error messages

**Example Output:**
```
==================================================
Doctor Update Test
==================================================
Base URL: http://103.42.117.19:8888
Doctor ID: 22703c4c-9033-4d02-9f9b-757c502c3c08
JWT Token: eyJhbGc...

Step 1: Checking if doctor exists...
GET Status: 404
✗ Doctor NOT FOUND (404)

This doctor may have been deleted or never existed.
Please use a valid doctor ID from the list.
```

---

## Perbaikan yang Sudah Diterapkan

### 1. **Enhanced Error Handling di doctorService.js**

```javascript
// Verify doctor exists before update
try {
  const existingDoctor = await getDoctor(doctorId);
  if (!existingDoctor) {
    throw new Error('Doctor not found. The doctor may have been deleted.');
  }
} catch (e) {
  throw new Error('Doctor not found. Please refresh the page and try again.');
}
```

### 2. **Better Error Messages**

```javascript
// Specific error for 404
if (lastErr.status === 404) {
  throw new Error('Doctor not found. The doctor may have been deleted. Please refresh the page.');
}

// Specific error for permissions
if (lastErr.status === 401 || lastErr.status === 403) {
  throw new Error('You do not have permission to update this doctor.');
}

// Conflict handling
if (lastErr.status === 409) {
  throw new Error('Update conflict. Another user may have modified this doctor. Please refresh and try again.');
}
```

### 3. **Enhanced Logging**

```javascript
console.debug('[doctorService] Updating doctor in backend API:', doctorId);
console.debug('[doctorService] Update payload:', doctorData);
console.debug('[doctorService] Trying update endpoint:', ep);
console.debug('[doctorService] Update response:', response);
```

### 4. **DoctorForm.jsx Improvements**

```javascript
// Verify doctor before update
try {
  const doctor = await doctorService.getDoctor(id)
  if (isDoctorProtected(doctor)) {
    toast.notify({ type: 'warning', message: 'Protected data' })
    return
  }
} catch (verifyError) {
  // Doctor not found - redirect to list
  toast.notify({
    type: 'error',
    message: 'Doctor not found. Redirecting...'
  })
  setTimeout(() => nav('/doctors'), 2000)
  return
}
```

---

## Solusi Step-by-Step

### Jika Error Terjadi:

#### Step 1: Check Console Logs
```javascript
// Browser Console → Network tab
// Look for PUT /doctors/{id} request
// Check response status and body
```

#### Step 2: Verify Doctor Exists
```javascript
// In browser console:
const doctorId = 'your-doctor-id'
const token = localStorage.getItem('token')

fetch(`http://103.42.117.19:8888/doctors/${doctorId}`, {
  headers: { 'Authorization': `Bearer ${token}` }
})
.then(r => r.json())
.then(console.log)
.catch(console.error)
```

#### Step 3: Check JWT Token
```javascript
// In browser console:
const token = localStorage.getItem('token')
const payload = JSON.parse(atob(token.split('.')[1]))
console.log('Token payload:', payload)
console.log('Permissions:', payload.permissions)
```

#### Step 4: Try dengan Fresh Token
```bash
# Login ulang untuk dapat token baru
# Atau refresh token jika ada refresh endpoint
```

#### Step 5: Test dengan curl
```bash
# Get fresh JWT token
TOKEN="your-fresh-token"
DOCTOR_ID="doctor-id-from-list"

# Test GET first
curl -X GET "http://103.42.117.19:8888/doctors/${DOCTOR_ID}" \
  -H "Authorization: Bearer ${TOKEN}"

# If GET works, try PUT
curl -X PUT "http://103.42.117.19:8888/doctors/${DOCTOR_ID}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "specialty": "Updated Specialty",
    "phone": "+628123456789"
  }'
```

---

## Preventive Measures

### 1. **Auto-Refresh List**
```javascript
// After delete, refresh list
await doctorService.deleteDoctor(doctorId)
await loadDoctors() // Refresh
```

### 2. **Check Before Edit**
```javascript
// Before navigating to edit form
const doctor = await doctorService.getDoctor(id)
if (!doctor) {
  toast.notify({ type: 'error', message: 'Doctor not found' })
  return
}
nav(`/doctors/${id}/edit`)
```

### 3. **Handle Stale Data**
```javascript
// Periodically check if data is still valid
useEffect(() => {
  const interval = setInterval(() => {
    // Re-fetch doctor data
    loadDoctor(id)
  }, 60000) // Every 60 seconds

  return () => clearInterval(interval)
}, [id])
```

---

## Common Scenarios

### Scenario 1: Doctor Baru Dihapus User Lain
```
User A: Opens edit form for Doctor X
User B: Deletes Doctor X
User A: Tries to save changes
Result: ✗ Doctor not found error

Solution:
✓ Error message shown
✓ Auto-redirect to list after 2 seconds
✓ User sees updated list without deleted doctor
```

### Scenario 2: Token Expired
```
User: Opens edit form (token valid)
... 30 minutes pass ...
User: Tries to save (token expired)
Result: ✗ Unauthorized error

Solution:
✓ Error message: "You do not have permission..."
✓ User should login again
✓ Consider implementing token refresh
```

### Scenario 3: Protected Data
```
User: Tries to edit SATUSEHAT test doctor
Result: ✗ Warning shown, edit blocked

Solution:
✓ Check protection before allowing edit
✓ Show warning toast
✓ Form submission blocked
```

---

## Testing Checklist

After implementing fixes:

- [ ] Test update existing active doctor ✓
- [ ] Test update with invalid ID ✓
- [ ] Test update deleted doctor ✓
- [ ] Test update protected doctor ✓
- [ ] Test update without permission ✓
- [ ] Test update with expired token ✓
- [ ] Verify error messages are user-friendly ✓
- [ ] Verify auto-redirect works ✓
- [ ] Check console logs are helpful ✓

---

## API Expected Behavior

### Successful Update (200)
```json
{
  "status": "success",
  "message": "Doctor updated successfully",
  "doctor": {
    "id": "...",
    "name": "...",
    "specialty": "Updated Specialty",
    ...
  }
}
```

### Doctor Not Found (404)
```json
{
  "status": "error",
  "message": "Doctor not found"
}
```

### Unauthorized (401)
```json
{
  "status": "error",
  "message": "Unauthorized"
}
```

### Forbidden (403)
```json
{
  "status": "error",
  "message": "You do not have permission to perform this action"
}
```

---

## Contact Support

Jika masalah persist setelah mengikuti guide ini:

1. Capture error logs dari browser console
2. Note doctor ID yang bermasalah
3. Check JWT token payload
4. Test dengan curl commands
5. Share findings dengan backend team

---

**Last Updated**: 2025-11-07
**Version**: 1.0.0
