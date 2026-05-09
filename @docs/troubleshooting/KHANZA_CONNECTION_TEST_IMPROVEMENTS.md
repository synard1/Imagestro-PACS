# Khanza Connection Test Improvements

## Overview
Perbaikan pada ConnectionSettings untuk menggunakan real API calls ke Khanza API, bukan dummy notifications.

## Changes Made

### 1. Real API Call Implementation
- **File:** `src/pages/KhanzaIntegration/Settings/ConnectionSettings.jsx`
- **Function:** `handleTestConnection()`

#### Sebelum:
- Menggunakan dummy notification
- Tidak ada validasi real terhadap Khanza API
- Tidak menampilkan detail response

#### Sesudah:
- Menggunakan real HTTP call via `khanzaService.checkHealth()`
- Melakukan actual fetch request ke Khanza API `/health` endpoint
- Menampilkan response time dan timestamp
- Menampilkan error code jika terjadi kegagalan

### 2. Enhanced Test Result Display
Menampilkan informasi detail dari test connection:
- **API URL:** URL yang ditest
- **Response Time:** Waktu response dalam milliseconds
- **Tested at:** Timestamp kapan test dilakukan
- **Error Code:** Kode error jika terjadi kegagalan

### 3. Real API Call Flow

```
User clicks "Test Connection"
    ↓
Validate required fields (URL, API Key)
    ↓
Save draft config temporarily
    ↓
Call khanzaService.checkHealth()
    ↓
Make real HTTP GET request to {baseUrl}/health
    ↓
Include X-API-Key header for authentication
    ↓
Measure response time
    ↓
Restore original config
    ↓
Display result with details
```

### 4. Implementation Details

#### khanzaService.checkHealth()
```javascript
// Makes real HTTP call to Khanza API
const response = await request('GET', healthPath, { retry: true })

// Returns:
{
  status: 'connected' | 'disconnected',
  message: 'Human readable message',
  data: { ... },  // Response data from API
  error: 'ERROR_CODE'  // Error code if failed
}
```

#### request() Function
- Menggunakan native `fetch()` API
- Mengirim X-API-Key header untuk authentication
- Implements timeout handling
- Proper error handling dengan user-friendly messages

### 5. Error Handling
- Validasi field sebelum test
- Timeout handling (default 30 seconds)
- Network error detection
- Authentication error detection (401)
- Permission error detection (403)
- Server error detection (5xx)

### 6. Configuration Persistence
- Draft config diterapkan sementara untuk testing
- Original config di-restore setelah test selesai
- Jika test gagal, original config tetap aman
- Hanya save jika test berhasil

## Testing the Implementation

### Prerequisites
1. Khanza API server harus running di `http://localhost:3007` (atau URL yang dikonfigurasi)
2. API Key harus valid

### Test Steps
1. Buka Settings → Integration → SIMRS Integration
2. Masukkan Khanza API URL (e.g., `http://localhost:3007`)
3. Masukkan API Key
4. Klik "Test Connection"
5. Lihat hasil test dengan detail:
   - Status (Connected/Failed)
   - Response time
   - Timestamp
   - Error code (jika ada)

### Expected Results

#### Success Case
```
✓ Connection Successful
Khanza API is reachable

API URL: http://localhost:3007
Response Time: 145ms
Tested at: 12/5/2025, 10:30:45 AM
```

#### Failure Case
```
✗ Connection Failed
Cannot connect to Khanza API. Please check the API URL and ensure the service is running.

API URL: http://localhost:3007
Error Code: NETWORK_ERROR
Tested at: 12/5/2025, 10:31:20 AM
```

## Benefits

1. **Real Validation:** Actual connection test ke Khanza API, bukan dummy
2. **User Feedback:** Menampilkan response time dan timestamp untuk transparency
3. **Error Details:** Menampilkan error code untuk debugging
4. **Safe Testing:** Original config di-restore jika test gagal
5. **Better UX:** User tahu persis apa yang terjadi saat test

## Files Modified

- `src/pages/KhanzaIntegration/Settings/ConnectionSettings.jsx`
  - Enhanced `handleTestConnection()` function
  - Improved test result display with details
  - Better error handling

## Related Services

- `src/services/khanzaService.js` - Already implements real API calls
- `src/services/http.js` - HTTP client with proper error handling
- `src/utils/logger.js` - Logging for debugging

## Notes

- Test connection tidak mengubah saved configuration
- Configuration hanya di-save jika test berhasil
- Response time diukur dari start hingga response diterima
- Semua error di-log untuk debugging purposes
