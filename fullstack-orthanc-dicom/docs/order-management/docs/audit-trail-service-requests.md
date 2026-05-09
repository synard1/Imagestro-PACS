# Audit Trail untuk satusehat_service_requests

## Overview

Tabel `satusehat_service_requests` sekarang memiliki kolom-kolom audit trail lengkap untuk melacak siapa dan kapan setiap operasi dilakukan:

### Kolom Audit Trail

| Kolom | Tipe | Deskripsi |
|-------|------|-----------|
| `created_at` | timestamptz | Timestamp saat record pertama kali dibuat (auto) |
| `created_by` | uuid | User ID yang membuat record (FK ke users.id) |
| `updated_at` | timestamptz | Timestamp update terakhir (auto update) |
| `updated_by` | uuid | User ID yang terakhir update record (FK ke users.id) |
| `deleted_at` | timestamptz | Timestamp soft delete (NULL = tidak dihapus) |
| `deleted_by` | uuid | User ID yang melakukan soft delete (FK ke users.id) |

## Catatan Penting

Table `satusehat_service_requests` adalah **history table** yang menyimpan multi-entry untuk audit trail ServiceRequest. Artinya:
- Tidak menggunakan UPSERT (ON CONFLICT), tapi INSERT biasa
- Setiap insert membuat record baru untuk melacak history perubahan
- Soft delete tetap tersedia untuk menandai record yang tidak valid

## Penggunaan

### 1. Insert ServiceRequest dengan Audit Trail

Fungsi `insert_satusehat_service_request()` sudah otomatis menangani audit trail:

```python
# Parameter actor_id adalah user yang melakukan operasi
insert_satusehat_service_request(
    cursor,
    order_row,
    sr_id="ServiceRequest/67890",
    status="received",
    request_payload={"resourceType": "ServiceRequest", ...},
    response_payload=response_data,
    extra={
        "encounter_ref_id": "Encounter/12345",
        "subject_ref_id": "Patient/98765",
    },
    actor_id=current_user_id  # UUID user dari session/token
)
```

**Behavior:**
- Setiap insert membuat **record baru** (tidak update existing)
- `created_by` dan `updated_by` di-set ke `actor_id`
- Ini untuk history/audit trail ServiceRequest

### 2. Soft Delete ServiceRequest

Untuk soft delete (menandai record sebagai dihapus tanpa benar-benar menghapus dari database):

```python
# Soft delete service request
success = soft_delete_satusehat_service_request(
    cursor,
    service_request_id="ServiceRequest/67890",
    actor_id=current_user_id
)

if success:
    print("ServiceRequest berhasil di-soft delete")
else:
    print("ServiceRequest sudah dihapus atau tidak ditemukan")
```

**Behavior:**
- Set `deleted_at` = NOW()
- Set `deleted_by` = actor_id
- Update `updated_at` dan `updated_by`
- Hanya update record yang `deleted_at IS NULL` (belum dihapus)
- Returns `True` jika berhasil, `False` jika tidak ada row yang terpengaruh
- **Bisa soft delete multiple records** jika ada lebih dari 1 record dengan service_request_id yang sama

### 3. Query dengan Filter Soft Delete

Untuk exclude record yang sudah di-soft delete:

```sql
-- Hanya ambil service request yang belum dihapus
SELECT *
FROM satusehat_service_requests
WHERE deleted_at IS NULL;

-- Ambil service request yang sudah dihapus
SELECT *
FROM satusehat_service_requests
WHERE deleted_at IS NOT NULL;

-- History lengkap untuk order tertentu (termasuk yang dihapus)
SELECT *
FROM satusehat_service_requests
WHERE order_id = '<order_uuid>'
ORDER BY created_at DESC;
```

### 4. Query Audit Trail

Melihat history audit:

```sql
-- Siapa yang membuat service request ini?
SELECT
    sr.service_request_id,
    sr.created_at,
    u.username as created_by_username,
    u.email as created_by_email,
    sr.status
FROM satusehat_service_requests sr
LEFT JOIN users u ON sr.created_by = u.id
WHERE sr.service_request_id = 'ServiceRequest/67890'
ORDER BY sr.created_at DESC;

-- Full audit trail untuk service request (created, updated, deleted)
SELECT
    sr.id,
    sr.service_request_id,
    sr.status,
    sr.created_at,
    cu.username as created_by,
    sr.updated_at,
    uu.username as updated_by,
    sr.deleted_at,
    du.username as deleted_by
FROM satusehat_service_requests sr
LEFT JOIN users cu ON sr.created_by = cu.id
LEFT JOIN users uu ON sr.updated_by = uu.id
LEFT JOIN users du ON sr.deleted_by = du.id
WHERE sr.service_request_id = 'ServiceRequest/67890'
ORDER BY sr.created_at DESC;

-- History service requests untuk order tertentu
SELECT
    sr.service_request_id,
    sr.status,
    sr.created_at,
    u.username as created_by,
    sr.deleted_at IS NOT NULL as is_deleted
FROM satusehat_service_requests sr
LEFT JOIN users u ON sr.created_by = u.id
WHERE sr.order_id = '<order_uuid>'
ORDER BY sr.created_at DESC;
```

### 5. Restore Soft Deleted Record

Jika perlu restore record yang sudah di-soft delete:

```sql
-- Restore semua records untuk service_request_id tertentu
UPDATE satusehat_service_requests
SET
    deleted_at = NULL,
    deleted_by = NULL,
    updated_at = NOW(),
    updated_by = '<user_id_who_restores>'
WHERE service_request_id = 'ServiceRequest/67890'
AND deleted_at IS NOT NULL;

-- Restore record spesifik by ID
UPDATE satusehat_service_requests
SET
    deleted_at = NULL,
    deleted_by = NULL,
    updated_at = NOW(),
    updated_by = '<user_id_who_restores>'
WHERE id = '<specific_record_uuid>'
AND deleted_at IS NOT NULL;
```

Atau buat helper function di Python:

```python
def restore_satusehat_service_request(cursor, service_request_id, actor_id=None):
    """Restore soft-deleted service request records"""
    cursor.execute(
        """
        UPDATE satusehat_service_requests
        SET
            deleted_at = NULL,
            deleted_by = NULL,
            updated_at = NOW(),
            updated_by = %s
        WHERE service_request_id = %s
        AND deleted_at IS NOT NULL
        """,
        (actor_id, service_request_id)
    )
    return cursor.rowcount
```

## Migration untuk Database Existing

Jika database sudah ada, jalankan migration script:

```bash
python3 scripts/migrate_add_audit_columns_service_requests.py
```

Script ini akan:
1. Menambahkan kolom `created_by`, `updated_by`, `deleted_at`, `deleted_by`
2. Membuat index untuk performa query
3. Idempoten (aman dijalankan berulang kali)

## Best Practices

1. **Selalu pass actor_id**: Pastikan setiap operasi mencatat user yang melakukannya
2. **History table**: Gunakan INSERT untuk membuat history baru, bukan UPDATE existing record
3. **Soft delete untuk cleanup**: Gunakan soft delete untuk menandai record yang tidak valid
4. **Filter deleted_at**: Jangan lupa filter `WHERE deleted_at IS NULL` di query untuk exclude soft deleted records
5. **Index yang tepat**: Index sudah dibuat untuk `created_by`, `updated_by`, dan partial index untuk `deleted_at`

## Perbedaan dengan satusehat_encounters

| Aspek | satusehat_encounters | satusehat_service_requests |
|-------|---------------------|---------------------------|
| Pattern | UPSERT (ON CONFLICT) | INSERT (multi-entry) |
| Purpose | Single source of truth | History/audit trail |
| Update | Update existing record | Insert new record |
| Records per ID | 1 (latest) | Multiple (history) |

## Contoh Integration dengan Flask Endpoint

```python
@app.route("/orders/<identifier>/simrs-servicerequest", methods=["POST"])
@require_auth
def attach_simrs_service_request(identifier):
    # Get current user from auth token/session
    current_user_id = get_current_user_id()

    # ... existing code ...

    if sr_id:
        insert_satusehat_service_request(
            cursor,
            order_row,
            sr_id,
            status="received",
            request_payload=request_data,
            response_payload=response_data,
            extra={
                "encounter_ref_id": encounter_id,
                "subject_ref_id": patient_id,
            },
            actor_id=current_user_id  # Track who did this operation
        )

    # ... rest of code ...
```

## Monitoring & Reporting

Query untuk monitoring aktivitas:

```sql
-- Service requests dibuat hari ini oleh user
SELECT
    u.username,
    COUNT(*) as service_requests_created_today
FROM satusehat_service_requests sr
JOIN users u ON sr.created_by = u.id
WHERE DATE(sr.created_at) = CURRENT_DATE
AND sr.deleted_at IS NULL
GROUP BY u.username;

-- Service requests yang di-soft delete dalam 7 hari terakhir
SELECT
    sr.service_request_id,
    sr.status,
    sr.deleted_at,
    u.username as deleted_by
FROM satusehat_service_requests sr
LEFT JOIN users u ON sr.deleted_by = u.id
WHERE sr.deleted_at >= NOW() - INTERVAL '7 days'
ORDER BY sr.deleted_at DESC;

-- Activity log per order
SELECT
    sr.order_id,
    COUNT(*) as total_entries,
    COUNT(*) FILTER (WHERE sr.deleted_at IS NULL) as active_entries,
    COUNT(*) FILTER (WHERE sr.deleted_at IS NOT NULL) as deleted_entries,
    MIN(sr.created_at) as first_entry,
    MAX(sr.created_at) as last_entry
FROM satusehat_service_requests sr
GROUP BY sr.order_id;
```
