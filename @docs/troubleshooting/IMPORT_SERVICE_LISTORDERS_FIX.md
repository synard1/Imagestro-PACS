# Import Service listOrders Fix

## Masalah
Error: `importService.listOrders is not a function` saat membuka tab "Order Browser" di halaman Edit External System.

## Root Cause
`OrderBrowserTab.jsx` menggunakan `importService.listOrders()` untuk fetch orders dari external system, tetapi:
- `mockImportService.js` memiliki function `listOrders`
- `unifiedImportService.js` (real service) TIDAK memiliki function `listOrders`

## Solusi
Menambahkan `listOrders` function ke `unifiedImportService.js` yang:
1. Fetch orders dari external system API
2. Support pagination dengan page dan pageSize
3. Support filtering dengan search, startDate, dan endDate
4. Return normalized response dengan items dan pagination info

## Implementasi

### Function Signature
```javascript
export const listOrders = async (externalSystemId, params = {}) => {
  const {
    page = DEFAULT_PAGE,
    pageSize = DEFAULT_PAGE_SIZE,
    search = '',
    startDate = '',
    endDate = '',
  } = params;
  
  // Fetch dari API endpoint:
  // GET /api/external-systems/{externalSystemId}/orders?page=1&page_size=10&search=...&start_date=...&end_date=...
}
```

### Parameters
- `externalSystemId` (string, required): ID dari external system
- `params` (object, optional):
  - `page` (number): Page number (default: 1)
  - `pageSize` (number): Items per page (default: 20)
  - `search` (string): Search query untuk order number, patient name, atau MRN
  - `startDate` (string): Start date dalam format YYYY-MM-DD
  - `endDate` (string): End date dalam format YYYY-MM-DD

### Return Value
```javascript
{
  items: [
    {
      id: "order-id",
      order_number: "ORD-001",
      patient_name: "John Doe",
      patient_mrn: "MRN-001",
      procedure_name: "Chest X-Ray",
      request_date: "2025-12-06",
      priority: "routine",
      status: "pending",
      is_imported: false
    },
    // ... more orders
  ],
  total: 100,
  page: 1,
  pageSize: 10,
  totalPages: 10
}
```

### API Endpoint Required
Backend harus menyediakan endpoint:
```
GET /api/external-systems/{externalSystemId}/orders
Query Parameters:
  - page: number (1-based)
  - page_size: number
  - search: string (optional)
  - start_date: string (optional, YYYY-MM-DD)
  - end_date: string (optional, YYYY-MM-DD)

Response:
{
  items: [...],
  total: number,
  page: number,
  page_size: number,
  total_pages: number
}
```

## File yang Dimodifikasi
- `src/services/unifiedImportService.js`
  - Tambah `listOrders` function
  - Tambah ke export default

## Testing

1. **Buka halaman External Systems**
   - Klik pada sistem yang sudah dikonfigurasi
   - Klik tab "Order Browser"
   - Verifikasi orders ter-load tanpa error

2. **Test Filtering**
   - Ubah date range
   - Verifikasi orders ter-filter
   - Coba search dengan order number, patient name, atau MRN

3. **Test Pagination**
   - Verifikasi pagination controls muncul jika ada banyak orders
   - Klik next/previous page
   - Verifikasi orders ter-update

## Catatan
- Function menggunakan `normalizeListResponse` helper untuk normalize API response
- Error handling sudah included dengan proper logging
- Support untuk mock mode dan real service mode
