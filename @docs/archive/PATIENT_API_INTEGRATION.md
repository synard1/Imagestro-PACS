# Patient API Integration Documentation

## Overview

This document describes the integration of the Patient Master Data API with the MWL-PACS UI frontend application. The integration enables the UI to interact with the centralized Patient Master Data Service for managing patient information.

## Table of Contents

1. [Architecture](#architecture)
2. [API Endpoints](#api-endpoints)
3. [Frontend Implementation](#frontend-implementation)
4. [Configuration](#configuration)
5. [Testing Guide](#testing-guide)
6. [Troubleshooting](#troubleshooting)

---

## Architecture

### System Components

```
┌─────────────────────┐
│  MWL-PACS UI        │
│  (React Frontend)   │
└──────────┬──────────┘
           │
           │ HTTP/REST
           │
┌──────────▼──────────┐
│  Patient API        │
│  (Backend Service)  │
│  Port: 8888         │
└──────────┬──────────┘
           │
           │ SQL
           │
┌──────────▼──────────┐
│  PostgreSQL         │
│  (Database)         │
└─────────────────────┘
```

### Integration Flow

1. **User Interface** → User interacts with Patients page
2. **patientService.js** → Routes request to backend API or local storage
3. **apiClient** → Makes HTTP request with authentication
4. **Backend API** → Processes request and interacts with database
5. **Response** → Returns data to UI for display

---

## API Endpoints

### Base URL

**Testing Environment:**
```
http://103.42.117.19:8888
```

**Default Configuration:**
```javascript
patients: {
  enabled: false,
  baseUrl: 'http://103.42.117.19:8888',
  healthPath: '/health',
  timeoutMs: 6000
}
```

### Available Endpoints

#### 1. List All Patients

**Endpoint:** `GET /patients`

**Description:** Retrieves all patients from the database

**Authentication:** Required (JWT Bearer Token)

**Response Format:**
```json
{
  "status": "success",
  "data": {
    "patients": [
      {
        "id": "uuid",
        "patient_national_id": "9271060312000001",
        "ihs_number": "IHS123456",
        "medical_record_number": "MR-001",
        "patient_name": "John Doe",
        "gender": "male",
        "birth_date": "1990-01-01",
        "phone": "08123456789",
        "email": "john@example.com",
        "address": "123 Main St",
        "created_at": "2025-01-01T00:00:00Z",
        "updated_at": "2025-01-01T00:00:00Z",
        "active": true
      }
    ]
  }
}
```

#### 2. Search Patients

**Endpoint:** `GET /patients/search`

**Description:** Search patients by various criteria

**Query Parameters:**
- `search` - General search term (searches across name, NIK, MRN)
- `name` - Patient name (partial match)
- `nik` - National ID (exact match)
- `mrn` - Medical Record Number (exact match)
- `ihs_number` - IHS Number (exact match)
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20)

**Example:**
```
GET /patients/search?name=john&page=1&limit=10
```

**Response Format:**
```json
{
  "status": "success",
  "data": {
    "patients": [...],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 100,
      "total_pages": 10
    }
  }
}
```

#### 3. Get Patient by ID or NIK

**Endpoint:** `GET /patients/<patient_id_or_nik>`

**Description:** Retrieve a specific patient by ID (UUID) or NIK

**Example:**
```
GET /patients/550e8400-e29b-41d4-a716-446655440000
GET /patients/9271060312000001
```

**Response Format:**
```json
{
  "status": "success",
  "data": {
    "patient": {
      "id": "uuid",
      "patient_national_id": "9271060312000001",
      ...
    }
  }
}
```

#### 4. Create Patient

**Endpoint:** `POST /patients`

**Description:** Create a new patient record

**Required Fields:**
- `patient_national_id` (string, 16 chars) - NIK
- `medical_record_number` (string) - MRN
- `patient_name` (string) - Full name
- `gender` (string) - "male" or "female"
- `birth_date` (string) - Format: "YYYY-MM-DD"

**Optional Fields:**
- `ihs_number` (string) - SATUSEHAT Patient ID
- `phone` (string)
- `email` (string)
- `address` (string)
- `nationality` (string)
- `ethnicity` (string)
- `religion` (string)
- `marital_status` (string) - "single", "married", "divorced", "widowed"
- `occupation` (string)
- `education_level` (string)
- `emergency_contact_name` (string)
- `emergency_contact_phone` (string)
- `emergency_contact_relationship` (string)
- `insurance_provider` (string)
- `insurance_policy_number` (string)
- `insurance_member_id` (string)

**Request Body Example:**
```json
{
  "patient_national_id": "9271060312000001",
  "medical_record_number": "MR-001",
  "patient_name": "John Doe",
  "gender": "male",
  "birth_date": "1990-01-01",
  "phone": "08123456789",
  "email": "john@example.com",
  "address": "123 Main St"
}
```

**Response Format:**
```json
{
  "status": "success",
  "message": "Patient created successfully",
  "data": {
    "patient": {
      "id": "uuid",
      ...
    }
  }
}
```

#### 5. Update Patient

**Endpoint:** `PUT /patients/<patient_id>`

**Description:** Update an existing patient record

**Note:** `patient_national_id` and `medical_record_number` cannot be changed

**Request Body Example:**
```json
{
  "patient_name": "John Doe Updated",
  "phone": "08199999999",
  "address": "456 New St"
}
```

**Response Format:**
```json
{
  "status": "success",
  "message": "Patient updated successfully",
  "data": {
    "patient": {
      "id": "uuid",
      ...
    }
  }
}
```

#### 6. Delete Patient

**Endpoint:** `DELETE /patients/<patient_id>`

**Description:** Soft delete a patient (sets `deleted_at` timestamp, keeps data)

**Response Format:**
```json
{
  "status": "success",
  "message": "Patient deleted successfully"
}
```

---

## Frontend Implementation

### File Structure

```
src/
├── services/
│   ├── patientService.js       # Patient API client
│   ├── api-registry.js         # API configuration registry
│   ├── http.js                 # HTTP client wrapper
│   └── api.js                  # Fallback local storage API
├── pages/
│   └── Patients.jsx            # Patient list page
└── components/
    └── PatientActionButtons.jsx # Patient actions
```

### patientService.js

The `patientService.js` module provides a unified interface for patient operations with automatic fallback to local storage when backend API is disabled.

**Key Features:**
- ✅ Automatic backend detection via registry
- ✅ Fallback to local mock data
- ✅ Error handling and logging
- ✅ Response normalization
- ✅ Authentication headers via apiClient

**Example Usage:**
```javascript
import * as patientService from '../services/patientService';

// List all patients
const patients = await patientService.listPatients();

// Search patients
const results = await patientService.searchPatients({
  name: 'John',
  page: 1,
  limit: 10
});

// Get specific patient
const patient = await patientService.getPatient('uuid-or-nik');

// Create patient
const newPatient = await patientService.createPatient({
  patient_national_id: '9271060312000001',
  medical_record_number: 'MR-001',
  patient_name: 'John Doe',
  gender: 'male',
  birth_date: '1990-01-01'
});

// Update patient
const updated = await patientService.updatePatient('uuid', {
  phone: '08123456789'
});

// Delete patient
await patientService.deletePatient('uuid');
```

### API Registry Configuration

The API registry controls whether to use backend API or local storage.

**Configuration File:** `src/services/api-registry.js`

**Default Configuration:**
```javascript
patients: {
  enabled: false,                         // Toggle backend API
  baseUrl: 'http://103.42.117.19:8888',  // Backend API URL
  healthPath: '/health',                  // Health check endpoint
  timeoutMs: 6000                         // Request timeout
}
```

---

## Configuration

### 1. Enable Backend API

#### Via Settings UI

1. Navigate to **Settings** → **API Configuration**
2. Find the **patients** module
3. Toggle **Enabled** to ON
4. Set **Base URL** to: `http://103.42.117.19:8888`
5. Click **Save Configuration**

#### Via Browser Console

```javascript
// Get current registry
const registry = JSON.parse(localStorage.getItem('api.registry.v1')) || {};

// Enable patients API
registry.patients = {
  enabled: true,
  baseUrl: 'http://103.42.117.19:8888',
  healthPath: '/health',
  timeoutMs: 6000
};

// Save configuration
localStorage.setItem('api.registry.v1', JSON.stringify(registry));

// Reload page
window.location.reload();
```

### 2. Environment Variables

No specific environment variables needed. All configuration is stored in the API registry (localStorage).

### 3. Authentication

The Patient API requires JWT authentication. Authentication tokens are automatically included by the `apiClient` wrapper.

**Token Storage:** `localStorage.getItem('auth.tokens')`

**Token Format:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "Bearer",
  "expires_at": 1735689600000
}
```

---

## Testing Guide

### Prerequisites

1. ✅ Backend API running at `http://103.42.117.19:8888`
2. ✅ Valid JWT authentication token
3. ✅ User with `patient:read`, `patient:create`, `patient:update`, `patient:delete` permissions

### Test Steps

#### 1. Enable Patient API

```javascript
// In browser console
const registry = JSON.parse(localStorage.getItem('api.registry.v1')) || {};
registry.patients = {
  enabled: true,
  baseUrl: 'http://103.42.117.19:8888',
  healthPath: '/health',
  timeoutMs: 6000
};
localStorage.setItem('api.registry.v1', JSON.stringify(registry));
window.location.reload();
```

#### 2. Verify API Connection

**Check Storage Indicator:**
- Navigate to **/patients** page
- Look for storage indicator at top of page
- Should show: **☁️ External API** (not 💾 Browser Storage)

**Check Console Logs:**
```javascript
// Open browser console (F12)
// Look for logs:
[patientService] Backend enabled: true
[patientService] listPatients - Backend enabled: true
[patientService] Using backend API
```

#### 3. Test List Patients

1. Navigate to `/patients` page
2. Verify patients load from backend
3. Check network tab for API call: `GET http://103.42.117.19:8888/patients`

**Expected Result:**
- Patient list displays
- No errors in console
- Network request shows 200 OK response

#### 4. Test Search Patients

1. Use search box at top of page
2. Enter search term (name, NIK, or MRN)
3. Verify search results update

**Expected Behavior:**
- API call: `GET /patients/search?search=<term>`
- Results filtered correctly
- Fast response time

#### 5. Test Create Patient

1. Click **Add Patient** button
2. Fill in required fields:
   - NIK (16 digits)
   - MRN
   - Name
   - Gender
   - Birth Date
3. Submit form

**Expected Result:**
- API call: `POST /patients`
- Success message displayed
- Patient appears in list
- Page refreshes with new data

#### 6. Test Update Patient

1. Click **Edit** button on a patient
2. Modify patient information
3. Save changes

**Expected Result:**
- API call: `PUT /patients/<id>`
- Success message displayed
- Changes reflected immediately

#### 7. Test Delete Patient

1. Click **Delete** button on a patient
2. Confirm deletion

**Expected Result:**
- API call: `DELETE /patients/<id>`
- Patient removed from list
- Success message displayed

### Manual API Testing with cURL

#### List Patients
```bash
curl -X GET http://103.42.117.19:8888/patients \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json"
```

#### Create Patient
```bash
curl -X POST http://103.42.117.19:8888/patients \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "patient_national_id": "9271060312000001",
    "medical_record_number": "MR-TEST-001",
    "patient_name": "Test Patient",
    "gender": "male",
    "birth_date": "1990-01-01"
  }'
```

#### Get Patient
```bash
curl -X GET http://103.42.117.19:8888/patients/9271060312000001 \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

#### Update Patient
```bash
curl -X PUT http://103.42.117.19:8888/patients/<patient_id> \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "08123456789",
    "address": "New Address"
  }'
```

#### Delete Patient
```bash
curl -X DELETE http://103.42.117.19:8888/patients/<patient_id> \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

## Troubleshooting

### Issue: "Module 'patients' not found in registry"

**Solution:**
```javascript
// Enable patients module
const registry = JSON.parse(localStorage.getItem('api.registry.v1')) || {};
registry.patients = {
  enabled: true,
  baseUrl: 'http://103.42.117.19:8888',
  healthPath: '/health',
  timeoutMs: 6000
};
localStorage.setItem('api.registry.v1', JSON.stringify(registry));
window.location.reload();
```

### Issue: "No authentication token found"

**Cause:** Not logged in or token expired

**Solution:**
1. Navigate to `/login` page
2. Login with valid credentials
3. Backend auth must be enabled
4. Token will be stored automatically

### Issue: "Failed to load patients: Network error"

**Possible Causes:**
1. Backend API not running
2. Incorrect base URL
3. CORS not configured
4. Firewall blocking connection

**Solution:**
1. Verify backend is running: `curl http://103.42.117.19:8888/health`
2. Check base URL in registry: `http://103.42.117.19:8888` (no trailing slash)
3. Check CORS settings on backend
4. Test connection from browser console

### Issue: Storage indicator shows "Browser Storage" instead of "External API"

**Cause:** Patients module not enabled in registry

**Solution:**
1. Open browser console
2. Check registry:
   ```javascript
   const registry = JSON.parse(localStorage.getItem('api.registry.v1'));
   console.log(registry.patients);
   ```
3. Verify `enabled: true`
4. If false, enable via Settings UI or console

### Issue: "Request timeout"

**Cause:** Backend API slow or not responding

**Solution:**
1. Increase timeout in registry:
   ```javascript
   registry.patients.timeoutMs = 10000; // 10 seconds
   ```
2. Check backend server performance
3. Check network latency

### Issue: Data format mismatch

**Symptoms:**
- Patients don't display correctly
- Missing fields
- Console errors about undefined properties

**Solution:**
Check response format in Network tab:
1. Open DevTools → Network
2. Find API call to `/patients`
3. Check Response tab
4. Verify structure matches expected format:
   ```json
   {
     "status": "success",
     "data": {
       "patients": [...]
     }
   }
   ```

### Debug Mode

Enable detailed logging:

```javascript
// In browser console
localStorage.setItem('debug', 'true');

// Set log level to debug
const registry = JSON.parse(localStorage.getItem('api.registry.v1'));
registry.patients.debug = true;
localStorage.setItem('api.registry.v1', JSON.stringify(registry));

// Reload
window.location.reload();
```

---

## Best Practices

### 1. Error Handling

Always wrap API calls in try-catch:
```javascript
try {
  const patients = await patientService.listPatients();
  setData(patients);
} catch (error) {
  logger.error('Failed to load patients:', error);
  showErrorToast(error.message);
}
```

### 2. Loading States

Show loading indicator during API calls:
```javascript
const [loading, setLoading] = useState(false);

const loadPatients = async () => {
  setLoading(true);
  try {
    const data = await patientService.listPatients();
    setRows(data);
  } catch (error) {
    handleError(error);
  } finally {
    setLoading(false);
  }
};
```

### 3. Data Normalization

Always normalize response data:
```javascript
// Backend might return different formats
const data = await patientService.listPatients();

// Normalize
let patients = Array.isArray(data) ? data : data.patients || [];
```

### 4. Caching

Consider implementing client-side caching for frequently accessed data:
```javascript
const cache = new Map();

const getCachedPatient = async (id) => {
  if (cache.has(id)) {
    return cache.get(id);
  }

  const patient = await patientService.getPatient(id);
  cache.set(id, patient);
  return patient;
};
```

---

## Performance Considerations

### 1. Pagination

Always use pagination for large datasets:
```javascript
const patients = await patientService.listPatients({
  page: 1,
  limit: 20
});
```

### 2. Search Debouncing

Debounce search input to reduce API calls:
```javascript
const [searchTerm, setSearchTerm] = useState('');

const debouncedSearch = useMemo(
  () => debounce((value) => {
    patientService.searchPatients({ search: value });
  }, 500),
  []
);

const handleSearch = (e) => {
  const value = e.target.value;
  setSearchTerm(value);
  debouncedSearch(value);
};
```

### 3. Request Timeouts

Set appropriate timeouts based on expected response time:
- Fast queries: 3000ms
- Normal queries: 6000ms
- Heavy queries: 10000ms

---

## Security Considerations

### 1. Authentication

- Always include JWT token in requests
- Tokens auto-refreshed by `apiClient`
- Expired tokens trigger re-authentication

### 2. Authorization

Backend enforces permissions:
- `patient:read` - View patients
- `patient:create` - Create patients
- `patient:update` - Update patients
- `patient:delete` - Delete patients

### 3. Input Validation

- Backend validates all input
- Frontend should also validate for better UX
- NIK must be exactly 16 digits
- Gender must be "male" or "female"
- Birth date must be valid date format

### 4. Sensitive Data

- Patient data is sensitive (PHI)
- Always use HTTPS in production
- Never log full patient records
- Implement proper access controls

---

## Support & Maintenance

### Log Files

Check application logs:
```javascript
// View API logs
console.log(window.__API_LOGS__);

// Filter patient-related logs
window.__API_LOGS__.filter(log => log.module === 'patients');
```

### Health Check

Check API health:
```javascript
fetch('http://103.42.117.19:8888/health')
  .then(r => r.json())
  .then(console.log);
```

### Version Information

Frontend version: Check `package.json`
Backend version: Check API `/health` endpoint

---

## Changelog

### Version 1.0.0 (2025-01-03)

#### Added
- Initial Patient API integration
- `patientService.js` module
- Support for all CRUD operations
- Search functionality
- Automatic backend/local fallback
- Error handling and logging
- Storage indicator

#### Changed
- Updated `Patients.jsx` to use new service
- Updated `api-registry.js` with patients module

#### Features
- List patients
- Search patients by name/NIK/MRN
- Create new patients
- Update patient information
- Delete patients (soft delete)
- Automatic token management
- Response normalization

---

## References

- [Patient Schema Documentation](./master-patient/PATIENT_SCHEMA_DOCUMENTATION.md)
- [Patient Schema Integration](./master-patient/PATIENT_SCHEMA_INTEGRATION.md)
- [API Registry Documentation](../README.md#api-registry)
- [Authentication Guide](../README.md#authentication)

---

## License

© 2025 MWL-PACS Project. All rights reserved.
