# Orders Endpoint Fix

## Masalah
Error 404 Not Found saat frontend mencoba fetch orders dari endpoint:
```
GET /api/external-systems/{system_id}/orders?page=1&page_size=10&start_date=...&end_date=...
```

## Root Cause
Backend tidak memiliki endpoint `/orders` untuk external systems.

## Solusi

### Backend (pacs-service)
Menambahkan endpoint baru di `pacs-service/app/api/external_systems.py`:

```python
@router.get("/{system_id}/orders", response_model=dict)
async def list_orders(
    system_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    search: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """List orders from external system with pagination and filtering"""
    # Validate system exists
    # Return paginated orders list
```

### Endpoint Details

**URL**: `GET /api/external-systems/{system_id}/orders`

**Query Parameters**:
- `page` (int, default: 1): Page number (1-based)
- `page_size` (int, default: 10, max: 100): Items per page
- `search` (string, optional): Search by order number, patient name, or MRN
- `start_date` (string, optional): Start date (YYYY-MM-DD)
- `end_date` (string, optional): End date (YYYY-MM-DD)

**Response**:
```json
{
  "items": [
    {
      "id": "order-id",
      "order_number": "ORD-001",
      "patient_name": "John Doe",
      "patient_mrn": "MRN-001",
      "procedure_name": "Chest X-Ray",
      "request_date": "2025-12-06",
      "priority": "routine",
      "status": "pending",
      "is_imported": false
    }
  ],
  "total": 100,
  "page": 1,
  "page_size": 10,
  "total_pages": 10,
  "has_next_page": true,
  "has_previous_page": false
}
```

**Status Codes**:
- `200 OK`: Success
- `404 Not Found`: External system not found
- `500 Internal Server Error`: Server error

## Current Implementation Status

### Phase 1: Endpoint Structure ✅
- Endpoint created with proper validation
- Returns empty list with correct pagination structure
- Proper error handling

### Phase 2: Integration (TODO)
The endpoint currently returns empty list. To fully implement:

1. **Get External System Configuration**
   - Retrieve base URL, auth type, credentials
   - Decrypt credentials if needed

2. **Call External System API**
   - Khanza: Call `/radiologi` endpoint with filters
   - Generic: Call configured order endpoint
   - Handle different response formats

3. **Map Response Data**
   - Map external system fields to standard format
   - Apply search and date filters
   - Implement pagination

4. **Cache Results (Optional)**
   - Cache orders for performance
   - Invalidate cache on new imports

## Frontend Integration

Frontend (`src/services/unifiedImportService.js`) already has `listOrders` function that calls this endpoint.

### Usage Example
```javascript
const result = await listOrders(systemId, {
  page: 1,
  pageSize: 10,
  search: 'patient name',
  startDate: '2025-12-06',
  endDate: '2025-12-06'
});

console.log(result.items); // Array of orders
console.log(result.total); // Total count
```

## Testing

1. **Endpoint Exists**
   ```bash
   curl http://localhost:8003/api/external-systems/{system_id}/orders
   ```
   Should return 200 with empty items array

2. **Pagination Works**
   ```bash
   curl "http://localhost:8003/api/external-systems/{system_id}/orders?page=2&page_size=20"
   ```

3. **Filtering Works**
   ```bash
   curl "http://localhost:8003/api/external-systems/{system_id}/orders?search=patient&start_date=2025-12-06"
   ```

4. **Frontend Integration**
   - Open External Systems page
   - Click on a system
   - Click "Order Browser" tab
   - Should show empty list (no error)

## Next Steps

1. Implement actual order fetching from external systems
2. Add support for Khanza API integration
3. Add caching for performance
4. Add import status tracking
5. Add error handling for external system API failures

## Files Modified
- `pacs-service/app/api/external_systems.py`
  - Added `list_orders` endpoint
  - Added proper validation and error handling
