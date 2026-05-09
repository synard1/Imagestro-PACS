# Studies Backend Integration

## Overview
Studies page sekarang fully integrated dengan backend API melalui api-registry configuration.

## Configuration

### API Registry (`src/services/api-registry.js`)
```javascript
studies: {
  enabled: true,                          // Toggle backend integration
  baseUrl: "http://103.42.117.19:8888",  // Backend API URL
  healthPath: "/health",                  // Health check endpoint
  timeoutMs: 6000,                        // Request timeout
  debug: false,                           // Debug logging
}
```

### Enable/Disable Backend
```javascript
// Enable backend
const registry = loadRegistry();
registry.studies.enabled = true;
saveRegistry(registry);

// Disable backend (use mock data)
registry.studies.enabled = false;
saveRegistry(registry);
```

## API Endpoints

### Base URL
```
http://103.42.117.19:8888
```

### Endpoints

#### 1. List Studies
```
GET /api/studies
Query Parameters:
  - search: string (optional) - Search in patient name, MRN, accession, description
  - modality: string (optional) - Filter by modality (CT, MR, US, XA, etc)
  - dateFrom: string (optional) - Filter from date (YYYY-MM-DD)
  - dateTo: string (optional) - Filter to date (YYYY-MM-DD)
  - limit: number (optional) - Limit results

Response: Array of Study objects
```

#### 2. Get Study
```
GET /api/studies/:id
Path Parameters:
  - id: string - Study ID or Study Instance UID

Response: Study object
```

#### 3. Create Study
```
POST /api/studies
Headers:
  Content-Type: application/json

Body:
{
  "studyDate": "2025-11-19",
  "studyTime": "10:30:00",
  "accessionNumber": "ACC-2025-00111",
  "description": "CT Head Non-Contrast",
  "modality": "CT",
  "status": "scheduled",
  "patient": {
    "name": "John Doe",
    "mrn": "MRN0011",
    "birthDate": "1990-01-01"
  }
}

Response: Created Study object
```

#### 4. Update Study
```
PUT /api/studies/:id
Path Parameters:
  - id: string - Study ID

Headers:
  Content-Type: application/json

Body: Same as Create (partial updates supported)

Response: Updated Study object
```

#### 5. Delete Study
```
DELETE /api/studies/:id
Path Parameters:
  - id: string - Study ID

Response: { success: true }
```

## Data Model

### Study Object
```javascript
{
  "studyId": "STU-CT-01",                              // Unique ID
  "studyInstanceUID": "1.2.826.0.1.3680043...",       // DICOM UID
  "studyDate": "2025-11-19",                          // Date (YYYY-MM-DD)
  "studyTime": "10:30:00",                            // Time (HH:MM:SS)
  "accessionNumber": "ACC-2025-00111",                // Accession number
  "description": "CT Head Non-Contrast",              // Study description
  "modality": "CT",                                   // Modality code
  "status": "completed",                              // Status
  "patient": {
    "name": "John Doe",                               // Patient name
    "mrn": "MRN0011",                                 // Medical Record Number
    "birthDate": "1990-01-01"                         // Birth date
  },
  "series": [                                         // Array of series
    {
      "seriesId": "SER-CT-01",
      "seriesInstanceUID": "1.2.826...",
      "modality": "CT",
      "seriesNumber": 1,
      "description": "Axial 5mm",
      "instances": [...]
    }
  ]
}
```

### Status Values
- `scheduled` - Study scheduled
- `in_progress` - Study in progress
- `completed` - Study completed
- `cancelled` - Study cancelled

### Modality Values
- `CT` - Computed Tomography
- `MR` - Magnetic Resonance
- `US` - Ultrasound
- `XA` - X-Ray Angiography
- `CR` - Computed Radiography
- `DR` - Digital Radiography

## Service Layer (`src/services/studiesService.js`)

### Functions

#### listStudies(options)
```javascript
import { listStudies } from './services/studiesService';

const studies = await listStudies({
  search: 'John',
  modality: 'CT',
  dateFrom: '2025-11-01',
  dateTo: '2025-11-30',
  limit: 50
});
```

#### getStudy(id)
```javascript
import { getStudy } from './services/studiesService';

const study = await getStudy('STU-CT-01');
```

#### createStudy(data)
```javascript
import { createStudy } from './services/studiesService';

const newStudy = await createStudy({
  studyDate: '2025-11-19',
  studyTime: '10:30:00',
  accessionNumber: 'ACC-2025-00111',
  description: 'CT Head Non-Contrast',
  modality: 'CT',
  status: 'scheduled',
  patient: {
    name: 'John Doe',
    mrn: 'MRN0011',
    birthDate: '1990-01-01'
  }
});
```

#### updateStudy(id, data)
```javascript
import { updateStudy } from './services/studiesService';

const updated = await updateStudy('STU-CT-01', {
  status: 'completed',
  description: 'CT Head Non-Contrast - Updated'
});
```

#### deleteStudy(id)
```javascript
import { deleteStudy } from './services/studiesService';

await deleteStudy('STU-CT-01');
```

## Fallback Behavior

### Backend Unavailable
When backend is enabled but unavailable:
1. Service attempts to fetch from backend
2. On error, shows notification
3. Falls back to mock data
4. User can continue working

### Mock Data Mode
When backend is disabled:
1. Uses local `src/data/studies.json`
2. All operations work in-memory
3. Data persists during session only
4. No network requests

## Error Handling

### Network Errors
```javascript
try {
  const studies = await listStudies();
} catch (error) {
  // Error notification shown automatically
  // Fallback to mock data
  console.error('Failed to fetch studies:', error);
}
```

### Validation Errors
```javascript
try {
  await createStudy(invalidData);
} catch (error) {
  // Backend validation error
  // Error notification shown
  console.error('Validation error:', error);
}
```

## Notifications

### Success Messages
- ✅ "Study created successfully"
- ✅ "Study updated successfully"
- ✅ "Study deleted successfully"

### Error Messages
- ❌ "Failed to fetch studies from backend: [error]. Using mock data."
- ❌ "Failed to create study: [error]"
- ❌ "Failed to update study: [error]"
- ❌ "Failed to delete study: [error]"

## Console Logging

### Debug Logs
```javascript
[Studies Service] Backend enabled: true
[Studies Service] Config: { enabled: true, baseUrl: "..." }
[Studies Service] Fetching from: http://103.42.117.19:8888/api/studies
[Studies Service] Received data: 10 studies
```

### Error Logs
```javascript
[Studies Service] Backend error: Network request failed
[Studies Service] Failed to fetch study: 404 Not Found
```

## Testing

### Test Backend Connection
1. Open browser console
2. Navigate to Studies page
3. Check console logs:
   ```
   [Studies Service] Backend enabled: true
   [Studies Service] Fetching from: http://...
   ```
4. Verify data loads from backend

### Test Fallback
1. Disable backend or disconnect network
2. Reload Studies page
3. Should see error notification
4. Should fall back to mock data
5. All features should still work

### Test CRUD Operations
```javascript
// In browser console

// List
const studies = await listStudies();
console.log('Studies:', studies);

// Create
const newStudy = await createStudy({
  studyDate: '2025-11-19',
  studyTime: '10:30:00',
  accessionNumber: 'TEST-001',
  description: 'Test Study',
  modality: 'CT',
  status: 'scheduled',
  patient: {
    name: 'Test Patient',
    mrn: 'TEST-MRN',
    birthDate: '1990-01-01'
  }
});
console.log('Created:', newStudy);

// Update
const updated = await updateStudy(newStudy.studyId, {
  status: 'completed'
});
console.log('Updated:', updated);

// Delete
await deleteStudy(newStudy.studyId);
console.log('Deleted');
```

## Backend Requirements

### Expected Backend Implementation
Backend should implement these endpoints:
- `GET /api/studies` - List with filters
- `GET /api/studies/:id` - Get single
- `POST /api/studies` - Create
- `PUT /api/studies/:id` - Update
- `DELETE /api/studies/:id` - Delete

### Response Format
All responses should be JSON:
```javascript
// Success
{
  "data": [...],
  "success": true
}

// Or just the data directly
[...]

// Error
{
  "error": "Error message",
  "success": false
}
```

### CORS Configuration
Backend must allow CORS from frontend:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, DELETE
Access-Control-Allow-Headers: Content-Type
```

## Troubleshooting

### Issue: Still using mock data despite backend enabled
**Check:**
1. Console logs - is backend enabled?
2. Network tab - are requests being made?
3. Registry - is `studies.enabled = true`?

**Solution:**
```javascript
// In browser console
const registry = loadRegistry();
console.log('Studies config:', registry.studies);

// Force enable
registry.studies.enabled = true;
saveRegistry(registry);
location.reload();
```

### Issue: CORS errors
**Check:**
- Backend CORS configuration
- Request headers

**Solution:**
- Configure backend to allow CORS
- Or use proxy server

### Issue: 404 Not Found
**Check:**
- Backend URL correct?
- Endpoints implemented?

**Solution:**
- Verify backend is running
- Check endpoint paths match

### Issue: Timeout errors
**Check:**
- Backend response time
- Timeout configuration

**Solution:**
```javascript
// Increase timeout
registry.studies.timeoutMs = 10000; // 10 seconds
saveRegistry(registry);
```

## Production Checklist

Before deploying:
- [ ] Backend URL configured correctly
- [ ] All endpoints implemented
- [ ] CORS configured
- [ ] Error handling tested
- [ ] Fallback behavior verified
- [ ] Console logs removed (or set debug: false)
- [ ] Performance tested with large datasets
- [ ] Security reviewed (authentication, authorization)

## Security Considerations

### Authentication
If backend requires authentication:
```javascript
// Add auth token to requests
const token = getAuthToken();
fetchJson(url, {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

### Data Validation
- Validate all inputs before sending to backend
- Sanitize user inputs
- Check response data structure

### Error Messages
- Don't expose sensitive information in errors
- Log detailed errors server-side only
- Show user-friendly messages to users

## Performance

### Optimization Tips
1. **Caching**: Cache frequently accessed studies
2. **Pagination**: Implement pagination for large datasets
3. **Lazy Loading**: Load series data on demand
4. **Debouncing**: Debounce search inputs
5. **Compression**: Enable gzip compression

### Monitoring
- Track API response times
- Monitor error rates
- Log slow queries
- Alert on failures

---

**Status**: ✅ INTEGRATED
**Version**: 1.0
**Last Updated**: 2025-11-19
**Backend URL**: http://103.42.117.19:8888
**Fallback**: Mock data available
