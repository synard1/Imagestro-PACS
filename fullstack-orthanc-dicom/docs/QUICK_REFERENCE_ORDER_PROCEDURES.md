# Quick Reference: Order Procedures API

## Endpoints

### 1. Get Procedure Details
```bash
GET /order-procedures/{id}
```

**Authorization:** `order:read` or `*`

**Response:**
```json
{
  "status": "success",
  "procedure": {
    "id": "e76d751a-3cb3-47d3-8594-d1e3ddd744f9",
    "order_id": "12345678-1234-1234-1234-123456789012",
    "procedure_code": "CT001",
    "procedure_name": "CT Scan Head",
    "modality": "CT",
    "accession_number": "ACC20250124000001",
    "scheduled_at": "2025-11-24T22:50:00+00:00",
    "status": "scheduled"
  }
}
```

### 2. Update Procedure (Schedule Intake)
```bash
PATCH /order-procedures/{id}
```

**Authorization:** `order:update` or `*`

**Request Body:**
```json
{
  "scheduled_at": "2025-11-25T10:00",
  "modality": "CT",
  "status": "scheduled"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Order procedure updated successfully",
  "order_status_synced": true,
  "procedure": { ... }
}
```

## Status Flow

```
created → scheduled → arrived → in_progress → completed
           ↓
        cancelled
```

## Auto-Sync Rules

| Procedure Status | → | Order Status |
|------------------|---|--------------|
| All `completed` | → | `COMPLETED` |
| Any `in_progress` | → | `IN_PROGRESS` |
| All `scheduled` | → | `SCHEDULED` |
| Any `scheduled` | → | `SCHEDULED` |
| All `cancelled` | → | `CANCELLED` |
| Default | → | `CREATED` |

## Common Operations

### Schedule Single Procedure
```bash
curl -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "scheduled_at": "2025-11-25T10:00",
    "status": "scheduled"
  }' \
  http://103.42.117.19:8888/order-procedures/e76d751a-3cb3-47d3-8594-d1e3ddd744f9
```

### Change Modality
```bash
curl -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"modality": "MR"}' \
  http://103.42.117.19:8888/order-procedures/{id}
```

### Mark as In Progress
```bash
curl -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "in_progress"}' \
  http://103.42.117.19:8888/order-procedures/{id}
```

### Mark as Completed
```bash
curl -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "completed"}' \
  http://103.42.117.19:8888/order-procedures/{id}
```

## Frontend Integration

### React/Vue Example
```javascript
// Schedule procedure
async function scheduleProcedure(procedureId, scheduledAt) {
  const response = await fetch(
    `http://103.42.117.19:8888/order-procedures/${procedureId}`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        scheduled_at: scheduledAt,
        status: 'scheduled'
      })
    }
  );

  const result = await response.json();

  if (result.status === 'success') {
    console.log('✅ Procedure scheduled');
    console.log('✅ Order status auto-synced:', result.order_status_synced);
    // Refresh order list
    await fetchOrders();
  }
}
```

### Angular Example
```typescript
scheduleProcedure(procedureId: string, scheduledAt: string) {
  return this.http.patch(
    `${this.apiUrl}/order-procedures/${procedureId}`,
    {
      scheduled_at: scheduledAt,
      status: 'scheduled'
    },
    {
      headers: {
        'Authorization': `Bearer ${this.authService.getToken()}`
      }
    }
  ).subscribe(
    (result: any) => {
      if (result.status === 'success') {
        this.toastr.success('Schedule intake berhasil');
        // Main order status akan otomatis update
        this.loadOrders();
      }
    }
  );
}
```

## Error Handling

### 404 - Procedure Not Found
```json
{
  "status": "error",
  "message": "Order procedure not found"
}
```

### 401 - Unauthorized
```json
{
  "status": "error",
  "message": "Missing or invalid authorization header"
}
```

### 403 - Forbidden
```json
{
  "status": "error",
  "message": "Permission denied",
  "required": ["order:update", "*"]
}
```

### 400 - No Fields to Update
```json
{
  "status": "error",
  "message": "No update fields provided"
}
```

## Troubleshooting

### Issue: Status tidak update
**Solution:**
- Check JWT token valid
- Check user punya permission `order:update` atau `*`
- Check procedure ID benar

### Issue: Order status tetap "created"
**Solution:**
- ✅ Fixed! Auto-sync sudah diimplementasi
- Procedure status akan otomatis sync ke main order
- Check logs: `docker logs order-management | grep "Auto-synced"`

### Issue: CORS error
**Solution:**
- ✅ Fixed! Endpoint sudah ditambahkan
- Gateway sudah support CORS global
- Make sure hit via gateway: `http://103.42.117.19:8888/`

## Check Logs

```bash
# Check order-management logs
docker logs -f order-management --tail 100

# Filter for procedure updates
docker logs order-management | grep "Updated order procedure"

# Filter for auto-sync
docker logs order-management | grep "Auto-synced order"
```

## Database Queries

### Check procedure status
```sql
SELECT
  op.id,
  op.procedure_name,
  op.status,
  o.status as order_status
FROM order_procedures op
JOIN orders o ON o.id = op.order_id
WHERE op.id = 'procedure-uuid';
```

### Check all procedures for an order
```sql
SELECT
  procedure_name,
  modality,
  status,
  scheduled_at,
  accession_number
FROM order_procedures
WHERE order_id = 'order-uuid'
ORDER BY sequence_number;
```

### Verify auto-sync working
```sql
SELECT
  o.id,
  o.order_number,
  o.status as order_status,
  COUNT(op.id) as total_procedures,
  COUNT(CASE WHEN op.status = 'scheduled' THEN 1 END) as scheduled_count,
  COUNT(CASE WHEN op.status = 'completed' THEN 1 END) as completed_count
FROM orders o
LEFT JOIN order_procedures op ON op.order_id = o.id
WHERE o.id = 'order-uuid'
GROUP BY o.id, o.order_number, o.status;
```

## Support

- **Documentation:** `/home/apps/fullstack-orthanc-dicom/ORDER_STATUS_AUTO_SYNC.md`
- **Changelog:** `/home/apps/fullstack-orthanc-dicom/CHANGELOG_ORDER_PROCEDURES_API.md`
- **Logs:** `docker logs order-management`
