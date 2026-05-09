# Order Status Auto-Sync Feature

## Overview

Ketika status **procedure** di-update, status **main order** akan otomatis ter-sync berdasarkan status semua procedure yang ada di order tersebut.

## Problem yang Dipecahkan

**Sebelumnya:**
- Update procedure status → procedure berubah ke "scheduled"
- Main order status → tetap "created" ❌
- Tidak konsisten dan membingungkan user

**Sekarang:**
- Update procedure status → procedure berubah ke "scheduled"
- Main order status → otomatis berubah ke "SCHEDULED" ✅
- Status order selalu reflect kondisi procedures

## Logika Auto-Sync

Status main order ditentukan berdasarkan **agregasi status semua procedures**:

### Priority Rules (dari tertinggi ke terendah):

1. **COMPLETED** - Jika SEMUA procedure completed
   ```
   Procedure 1: completed
   Procedure 2: completed
   → Order Status: COMPLETED
   ```

2. **IN_PROGRESS** - Jika ADA procedure in_progress
   ```
   Procedure 1: scheduled
   Procedure 2: in_progress
   → Order Status: IN_PROGRESS
   ```

3. **SCHEDULED** - Jika SEMUA procedure scheduled (tidak ada yang in_progress/completed)
   ```
   Procedure 1: scheduled
   Procedure 2: scheduled
   → Order Status: SCHEDULED
   ```

4. **SCHEDULED** - Jika ADA procedure scheduled (mixed dengan created)
   ```
   Procedure 1: scheduled
   Procedure 2: created
   → Order Status: SCHEDULED
   ```

5. **CANCELLED** - Jika SEMUA procedure cancelled
   ```
   Procedure 1: cancelled
   Procedure 2: cancelled
   → Order Status: CANCELLED
   ```

6. **CREATED** - Default jika tidak ada kondisi di atas
   ```
   Procedure 1: created
   Procedure 2: created
   → Order Status: CREATED
   ```

## Contoh Use Cases

### Use Case 1: Schedule Intake - Single Procedure
```bash
# Initial State
Order: status = "CREATED"
Procedure 1: status = "created"

# Update procedure
PATCH /order-procedures/{id}
{
  "status": "scheduled",
  "scheduled_at": "2025-11-25T10:00"
}

# Result
Order: status = "SCHEDULED" ✅
Procedure 1: status = "scheduled"
```

### Use Case 2: Schedule Intake - Multi Procedure
```bash
# Initial State
Order: status = "CREATED"
Procedure 1 (CT): status = "created"
Procedure 2 (MR): status = "created"

# Update first procedure
PATCH /order-procedures/{id1}
{ "status": "scheduled" }

# Result after first update
Order: status = "SCHEDULED" ✅
Procedure 1: status = "scheduled"
Procedure 2: status = "created"

# Update second procedure
PATCH /order-procedures/{id2}
{ "status": "scheduled" }

# Final Result
Order: status = "SCHEDULED" ✅
Procedure 1: status = "scheduled"
Procedure 2: status = "scheduled"
```

### Use Case 3: Workflow Progression
```bash
# Step 1: Schedule
PATCH /order-procedures/{id}
{ "status": "scheduled" }
→ Order: SCHEDULED

# Step 2: Patient Arrived
PATCH /order-procedures/{id}
{ "status": "arrived" }
→ Order: SCHEDULED (still scheduled priority)

# Step 3: Exam Started
PATCH /order-procedures/{id}
{ "status": "in_progress" }
→ Order: IN_PROGRESS ✅

# Step 4: Exam Done
PATCH /order-procedures/{id}
{ "status": "completed" }
→ Order: COMPLETED ✅
```

### Use Case 4: Multi-Procedure Different Status
```bash
# State
Procedure 1 (CT Head): in_progress
Procedure 2 (CT Chest): scheduled
Procedure 3 (CT Abdomen): created

# Result
Order: IN_PROGRESS ✅
(karena ada 1 procedure in_progress, itu yang tertinggi priority)
```

## Database Updates

Setiap update procedure akan memicu:

```sql
-- 1. Update procedure
UPDATE order_procedures
SET status = 'scheduled', ...
WHERE id = {procedure_id};

-- 2. Auto-sync main order (automatically)
UPDATE orders
SET
  status = 'SCHEDULED',           -- uppercase untuk backward compat
  order_status = 'scheduled',     -- lowercase untuk new field
  updated_at = CURRENT_TIMESTAMP
WHERE id = {order_id};
```

## Response Format

Response dari update procedure sekarang include `order_status_synced`:

```json
{
  "status": "success",
  "message": "Order procedure updated successfully",
  "order_status_synced": true,
  "procedure": {
    "id": "xxx",
    "order_id": "yyy",
    "status": "scheduled",
    "scheduled_at": "2025-11-25T10:00:00+00:00",
    ...
  }
}
```

## Logging

Log yang dihasilkan:

```
INFO: Updated order procedure {procedure_id} by {user}
INFO: Auto-synced order {order_id} status to 'scheduled' based on procedure statuses: {'scheduled': 1, 'created': 1}
```

## Error Handling

- Jika auto-sync gagal, **tidak akan gagalkan update procedure**
- Error hanya di-log sebagai warning
- User tetap mendapat response sukses untuk update procedure
- Background job atau manual sync bisa dilakukan later

```python
try:
    # Auto-sync order status
    ...
except Exception as sync_err:
    logger.error(f"Failed to auto-sync order status: {sync_err}")
    # Don't fail the request - procedure was updated successfully
```

## Testing

### Test 1: Single Procedure Schedule
```bash
# Get procedure ID from order
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8888/orders/{order_id} | jq '.procedures[0].id'

# Update procedure status
curl -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"scheduled","scheduled_at":"2025-11-25T10:00"}' \
  http://localhost:8888/order-procedures/{procedure_id}

# Verify main order updated
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8888/orders/{order_id} | jq '.status'
# Expected: "SCHEDULED"
```

### Test 2: Multi-Procedure Mixed Status
```bash
# Update procedure 1 → scheduled
curl -X PATCH ... /order-procedures/{proc1_id}

# Update procedure 2 → in_progress
curl -X PATCH ... /order-procedures/{proc2_id}

# Check main order
curl ... /orders/{order_id} | jq '.status'
# Expected: "IN_PROGRESS" (highest priority wins)
```

## Benefits

✅ **Konsistensi Data** - Order status selalu reflect kondisi procedures
✅ **User Experience** - User tidak perlu manual update order status
✅ **Workflow Tracking** - Status order otomatis track progress semua procedures
✅ **Dashboard Accuracy** - Dashboard dan monitoring jadi lebih akurat
✅ **Audit Trail** - Semua perubahan status ter-log dengan detail

## Backward Compatibility

- ✅ Update `status` (uppercase) untuk backward compatibility
- ✅ Update `order_status` (lowercase) untuk field baru
- ✅ Existing code yang baca `status` tetap works
- ✅ Tidak break existing integrations

## Implementation Details

**File Modified:**
- `order-management/order_management_service.py` (lines 6217-6290)

**Function:**
- `update_order_procedure()` - Added auto-sync logic after procedure update

**Deployment:**
- Service restarted: `docker compose restart order-management`

## Future Enhancements

Potential improvements:
- [ ] Webhook notification when order status changes
- [ ] Email notification to patient when all procedures scheduled
- [ ] Dashboard real-time updates via WebSocket
- [ ] Batch status sync for bulk operations
- [ ] Custom status mapping per organization
