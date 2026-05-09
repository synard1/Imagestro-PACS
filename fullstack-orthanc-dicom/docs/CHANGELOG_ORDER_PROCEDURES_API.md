# Order Procedures API Fix - CORS Error Resolution

## Issue
CORS error when trying to set schedule intake via:
- `PATCH http://103.42.117.19:8888/order-procedures/{id}`
- Payload: `{"scheduled_at":"2025-11-24T22:50","modality":"CT","status":"scheduled"}`

## Root Cause
The `/order-procedures/{id}` endpoint was **missing** from both:
1. Order Management Service (order_management_service.py)
2. API Gateway (api_gateway.py)

The `order_procedures` table existed for multi-procedure order support, but there were no API endpoints to update individual procedures.

## Solution Implemented

### 1. Order Management Service (`order-management/order_management_service.py`)

Added two new endpoints:

#### GET /order-procedures/{id}
- Retrieve single order procedure by ID
- Returns: procedure details including schedule, modality, status, codes

#### PATCH/PUT /order-procedures/{id}
- Update order procedure fields
- Supports updating:
  - `scheduled_at` - Schedule intake time
  - `modality` - Imaging modality (CT, MR, XR, etc.)
  - `status` - Procedure status (scheduled, completed, etc.)
  - `procedure_code` - Procedure code
  - `procedure_name` - Procedure name
  - `loinc_code` - LOINC code
  - `loinc_name` - LOINC name
  - `accession_number` - Accession number
- Includes audit trail (updated_by, updated_at)
- Returns: updated procedure object

### 2. API Gateway (`api-gateway/api_gateway.py`)

Added proxy routes with proper authentication:

```python
# GET /order-procedures/{id}
@require_auth(['order:read', '*'])
def order_procedures_get(procedure_id)

# PATCH/PUT /order-procedures/{id}
@require_auth(['order:update', '*'])
def order_procedures_update(procedure_id)
```

### 3. Updated API Documentation

Added to gateway index response:
```json
"order_procedures": {
  "get": "GET /order-procedures/<id>",
  "update": "PATCH/PUT /order-procedures/<id>"
}
```

## Permissions Required

- **GET**: `order:read` or `*` (wildcard)
- **PATCH/PUT**: `order:update` or `*` (wildcard)

## Usage Examples

### Get Order Procedure
```bash
curl -X GET "http://103.42.117.19:8888/order-procedures/e76d751a-3cb3-47d3-8594-d1e3ddd744f9" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Update Order Procedure (Schedule Intake)
```bash
curl -X PATCH "http://103.42.117.19:8888/order-procedures/e76d751a-3cb3-47d3-8594-d1e3ddd744f9" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "scheduled_at": "2025-11-24T22:50",
    "modality": "CT",
    "status": "scheduled"
  }'
```

### Response Format
```json
{
  "status": "success",
  "message": "Order procedure updated successfully",
  "procedure": {
    "id": "e76d751a-3cb3-47d3-8594-d1e3ddd744f9",
    "order_id": "12345678-1234-1234-1234-123456789012",
    "procedure_code": "CT001",
    "procedure_name": "CT Scan Head",
    "modality": "CT",
    "accession_number": "ACC20250124000001",
    "scheduled_at": "2025-11-24T22:50:00+00:00",
    "sequence_number": 1,
    "status": "scheduled",
    "details": {
      "updated_by": "user@example.com",
      "updated_at": "2025-01-25T10:30:00Z"
    },
    "created_at": "2025-01-24T08:00:00+00:00",
    "updated_at": "2025-01-25T10:30:00+00:00"
  }
}
```

## CORS Handling

The API Gateway already has CORS enabled via:
```python
CORS(app)
```

This allows all origins by default. The `require_auth` decorator handles OPTIONS preflight requests:
```python
if request.method == 'OPTIONS':
    return ('', 204)
```

## Testing

After deployment, verify endpoints work:

```bash
# 1. Check service health
curl http://103.42.117.19:8888/health

# 2. Verify endpoint documentation
curl http://103.42.117.19:8888/ | jq '.endpoints.order_procedures'

# 3. Test GET (with valid JWT token)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://103.42.117.19:8888/order-procedures/YOUR_PROCEDURE_ID

# 4. Test PATCH (with valid JWT token)
curl -X PATCH \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"scheduled_at":"2025-11-24T22:50","modality":"CT","status":"scheduled"}' \
  http://103.42.117.19:8888/order-procedures/YOUR_PROCEDURE_ID
```

## Files Modified

1. **order-management/order_management_service.py** (lines 6030-6237)
   - Added `get_order_procedure()` function
   - Added `update_order_procedure()` function

2. **api-gateway/api_gateway.py**
   - Added order procedures proxy routes (lines 1302-1323)
   - Updated index documentation (line 423-426)

## Deployment

Services have been restarted:
```bash
docker compose restart order-management api-gateway
```

## Related Issues

This fix enables:
- ✅ Schedule intake updates for multi-procedure orders
- ✅ Individual procedure modality changes
- ✅ Per-procedure status tracking
- ✅ Audit trail for procedure modifications
- ✅ Frontend form integration for procedure scheduling

## Notes

- The `order_procedures` table supports multi-procedure orders where a single order can have multiple procedures with different modalities, schedules, and accession numbers
- Each procedure can be tracked independently while maintaining relationship to parent order
- Audit trail is maintained in `details` JSONB field with `updated_by` and `updated_at` metadata
- All updates require valid JWT authentication and appropriate permissions
