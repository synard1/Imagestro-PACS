# Doctor CRUD - Comprehensive Testing Guide

## Hasil Analisis

### Backend Configuration
- **Backend URL**: `http://103.42.117.19:8888`
- **Arsitektur**: API Gateway (bukan langsung ke Master Data Service)
- **Health Check**: ✅ Working di `/health`
- **Auth Required**: ✅ Semua endpoint doctor memerlukan valid JWT token

### Endpoint Paths
- **BUKAN** `/master-data/doctors` ❌
- **CORRECT**: `/doctors` ✅ (API Gateway handles routing)

### API Gateway Status
```json
{
  "service": "api-gateway",
  "services": {
    "accession-api": "healthy",
    "auth": "healthy",
    "dicom-router": "healthy",
    "master-data-service": "healthy",  ← Backend service OK
    "mwl": "healthy",
    "orders": "healthy",
    "orthanc": "healthy",
    "satusehat-integrator": "healthy"
  },
  "status": "healthy",
  "version": "2.2.0"
}
```

---

## Prerequisites

### 1. Mendapatkan Valid JWT Token

Ada beberapa cara untuk mendapatkan JWT token:

#### Option A: Dari UI (Recommended untuk Testing)
```
1. Login ke aplikasi melalui browser
2. Buka Developer Tools (F12)
3. Pilih tab "Application" atau "Storage"
4. Buka "Local Storage" → URL aplikasi
5. Copy nilai dari key "token"
```

#### Option B: Dari Auth API
```bash
curl -X POST http://103.42.117.19:8888/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "your-username",
    "password": "your-password"
  }'
```

Response:
```json
{
  "status": "success",
  "token": "eyJhbGc...",  ← Copy this token
  "user": {...}
}
```

### 2. Set Environment Variable (Optional)
```bash
# Linux/Mac
export JWT_TOKEN="your-actual-jwt-token-here"

# Windows CMD
set JWT_TOKEN=your-actual-jwt-token-here

# Windows PowerShell
$env:JWT_TOKEN="your-actual-jwt-token-here"
```

---

## Method 1: Using Python Test Script (Recommended)

### Installation
```bash
pip install requests
```

### Usage

#### With Command Line Argument
```bash
python test_doctor_crud.py "eyJhbGc..."
```

#### With Environment Variable
```bash
# Set token first
export JWT_TOKEN="eyJhbGc..."

# Run test
python test_doctor_crud.py
```

### What the Script Tests
1. ✓ Health Check (no auth required)
2. ✓ List all doctors
3. ✓ Create new doctor
4. ✓ Get doctor detail by ID
5. ✓ Update doctor
6. ✓ Search/filter doctors
7. ✓ Verify update was successful
8. ✓ Delete doctor (soft delete)
9. ✓ Verify deletion

### Expected Output
```
==================================================
Doctor CRUD Comprehensive Test Suite
==================================================

==================================================
TEST 0: Health Check
==================================================
[OK] Health check passed

==================================================
TEST 1: List All Doctors (Initial)
==================================================
[OK] List doctors successful
  Used endpoint: /doctors
  Found 15 doctors

... (more tests)

==================================================
TEST SUMMARY
==================================================
Total Tests: 25
Passed: 25
Failed: 0
Warnings: 0

[OK] All tests passed successfully!
```

---

## Method 2: Manual Testing with cURL

### Set Variables
```bash
# Set these first
BASE_URL="http://103.42.117.19:8888"
JWT_TOKEN="your-actual-jwt-token-here"
```

### TEST 1: Health Check (No Auth)
```bash
curl -X GET "${BASE_URL}/health"
```

Expected: HTTP 200
```json
{
  "service": "api-gateway",
  "status": "healthy",
  ...
}
```

### TEST 2: List Doctors
```bash
curl -X GET "${BASE_URL}/doctors" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json"
```

Expected: HTTP 200 dengan array doctors

### TEST 3: Create Doctor
```bash
curl -X POST "${BASE_URL}/doctors" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Dr. Test Doctor",
    "national_id": "1234567890123456",
    "license": "DOC12345",
    "specialty": "General Practice",
    "birth_date": "1980-01-15",
    "gender": "M",
    "phone": "+628123456789",
    "email": "test@example.com"
  }'
```

Expected: HTTP 201
```json
{
  "status": "success",
  "message": "Doctor created successfully",
  "doctor_id": "uuid-here"
}
```

**⚠️ IMPORTANT**: Save the `doctor_id` untuk testing selanjutnya!

### TEST 4: Get Doctor Detail
```bash
DOCTOR_ID="uuid-from-create"

curl -X GET "${BASE_URL}/doctors/${DOCTOR_ID}" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json"
```

Alternative - By National ID:
```bash
curl -X GET "${BASE_URL}/doctors/1234567890123456" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json"
```

### TEST 5: Update Doctor
```bash
curl -X PUT "${BASE_URL}/doctors/${DOCTOR_ID}" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "specialty": "Cardiology",
    "phone": "+628987654321",
    "email": "updated@example.com"
  }'
```

Expected: HTTP 200
```json
{
  "status": "success",
  "message": "Doctor updated successfully",
  "doctor": {...}
}
```

### TEST 6: Search/Filter Doctors

#### By Name
```bash
curl -X GET "${BASE_URL}/doctors?name=Test" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json"
```

#### By Specialty
```bash
curl -X GET "${BASE_URL}/doctors?specialty=Cardiology" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json"
```

#### Active Only
```bash
curl -X GET "${BASE_URL}/doctors?active=true" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json"
```

#### Combined Filters
```bash
curl -X GET "${BASE_URL}/doctors?specialty=Cardiology&active=true" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json"
```

### TEST 7: Delete Doctor (Soft Delete)
```bash
curl -X DELETE "${BASE_URL}/doctors/${DOCTOR_ID}" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json"
```

Expected: HTTP 200

### TEST 8: Verify Soft Delete
```bash
curl -X GET "${BASE_URL}/doctors/${DOCTOR_ID}" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json"
```

Expected: HTTP 404 atau HTTP 200 dengan `"active": false`

---

## Method 3: Using PowerShell (Windows)

```powershell
# Setup
$BASE_URL = "http://103.42.117.19:8888"
$JWT_TOKEN = "your-actual-jwt-token-here"
$headers = @{
    "Authorization" = "Bearer $JWT_TOKEN"
    "Content-Type" = "application/json"
}

# Test 1: List Doctors
Invoke-RestMethod -Uri "$BASE_URL/doctors" -Method GET -Headers $headers

# Test 2: Create Doctor
$body = @{
    name = "Dr. Test Doctor"
    national_id = "1234567890123456"
    license = "DOC12345"
    specialty = "General Practice"
    birth_date = "1980-01-15"
    gender = "M"
} | ConvertTo-Json

$result = Invoke-RestMethod -Uri "$BASE_URL/doctors" -Method POST -Headers $headers -Body $body
$doctorId = $result.doctor_id

# Test 3: Get Doctor
Invoke-RestMethod -Uri "$BASE_URL/doctors/$doctorId" -Method GET -Headers $headers

# Test 4: Update Doctor
$updateBody = @{
    specialty = "Cardiology"
    phone = "+628987654321"
} | ConvertTo-Json

Invoke-RestMethod -Uri "$BASE_URL/doctors/$doctorId" -Method PUT -Headers $headers -Body $updateBody

# Test 5: Delete Doctor
Invoke-RestMethod -Uri "$BASE_URL/doctors/$doctorId" -Method DELETE -Headers $headers
```

---

## Common Issues & Solutions

### Issue 1: 401 Unauthorized
**Symptom**: `{"status": "error", "message": "Unauthorized"}`

**Causes**:
- JWT token tidak valid
- Token expired
- Token tidak memiliki permission yang tepat

**Solution**:
1. Generate token baru dari UI atau auth API
2. Pastikan token memiliki permission `"*"` atau `"doctor:*"`
3. Check payload JWT token:
```bash
# Decode JWT token (bagian kedua setelah split by '.')
echo "paste-payload-part-here" | base64 -d
```

### Issue 2: 404 Not Found
**Symptom**: `404 Not Found` untuk semua endpoint

**Causes**:
- Backend tidak running
- Endpoint path salah

**Solution**:
1. Check health endpoint:
```bash
curl http://103.42.117.19:8888/health
```
2. Pastikan menggunakan `/doctors` bukan `/master-data/doctors`

### Issue 3: Update Tidak Berhasil
**Symptom**: Update returns 200 tapi data tidak berubah

**Causes**:
- Payload tidak sesuai format backend
- Protected data (SATUSEHAT test data)
- Field name salah

**Solution**:
1. Verify doctor bukan protected data
2. Check response message
3. Test dengan minimal payload:
```bash
curl -X PUT "${BASE_URL}/doctors/${DOCTOR_ID}" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"specialty": "New Specialty"}'
```
4. Verify perubahan:
```bash
curl -X GET "${BASE_URL}/doctors/${DOCTOR_ID}" \
  -H "Authorization: Bearer ${JWT_TOKEN}"
```

### Issue 4: Connection Refused
**Symptom**: `Connection refused` atau timeout

**Causes**:
- Backend server tidak running
- Network issue
- Firewall blocking

**Solution**:
1. Ping server:
```bash
ping 103.42.117.19
```
2. Check if port accessible:
```bash
curl -v http://103.42.117.19:8888/health
```
3. Contact system administrator jika masalah persists

---

## Field Mappings

### Backend → UI Mapping
| Backend Field | UI Field | Type | Required | Notes |
|--------------|----------|------|----------|-------|
| `name` | `name` | string | ✅ | Doctor full name |
| `national_id` | `national_id` | string(16) | ✅ | 16 digit NIK |
| `license` | `license` | string | ⚠️ | Unique, required for create |
| `ihs_number` | `ihs_number` | string | ❌ | Can be null |
| `specialty` | `specialty` | string | ✅ | Doctor specialty |
| `phone` | `phone` | string | ❌ | Phone number |
| `email` | `email` | string | ❌ | Email address |
| `gender` | `gender` | enum | ❌ | "M" or "F" |
| `birth_date` | `birth_date` | date | ✅ | Format: YYYY-MM-DD |
| `active` | `active` | boolean | ❌ | Default: true |

### Protected Data (Cannot Edit/Delete)
SATUSEHAT test data dengan NIK:
- 7209061211900001
- 3322071302900002
- 3171071609900003
- 3207192310600004
- 6408130207800005
- 3217040109800006
- 3519111703800007
- 5271002009700008
- 3313096403900009
- 3578083008700010

---

## Next Steps

1. ✅ Generate/dapatkan valid JWT token
2. ✅ Run Python test script atau manual curl tests
3. ✅ Verify all CRUD operations working
4. ✅ Test with different user roles/permissions
5. ✅ Document any issues found
6. ✅ Update frontend if needed based on API behavior

## Support

Jika menemukan masalah:
1. Check error messages dan HTTP status codes
2. Verify JWT token valid dan memiliki permissions
3. Review API logs (jika accessible)
4. Contact backend team jika issue persists

---

**Last Updated**: 2025-11-07
**Backend Version**: API Gateway 2.2.0
**Master Data Service**: healthy ✅
