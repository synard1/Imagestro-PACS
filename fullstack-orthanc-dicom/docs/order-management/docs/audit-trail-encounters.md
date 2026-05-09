# Audit Trail untuk satusehat_encounters

## Overview

Tabel `satusehat_encounters` sekarang memiliki kolom-kolom audit trail lengkap untuk melacak siapa dan kapan setiap operasi dilakukan:

### Kolom Audit Trail

| Kolom | Tipe | Deskripsi |
|-------|------|-----------|
| `created_at` | timestamptz | Timestamp saat record pertama kali dibuat (auto) |
| `created_by` | uuid | User ID yang membuat record (FK ke users.id) |
| `updated_at` | timestamptz | Timestamp update terakhir (auto update) |
| `updated_by` | uuid | User ID yang terakhir update record (FK ke users.id) |
| `deleted_at` | timestamptz | Timestamp soft delete (NULL = tidak dihapus) |
| `deleted_by` | uuid | User ID yang melakukan soft delete (FK ke users.id) |

## Penggunaan

### 1. Membuat/Update Encounter (Upsert)

Fungsi `upsert_satusehat_encounter()` sudah otomatis menangani audit trail:

```python
# Parameter actor_id adalah user yang melakukan operasi
upsert_satusehat_encounter(
    cursor,
    order_row,
    encounter_id="Encounter/12345",
    request_payload={"resourceType": "Encounter", ...},
    response_payload=response_data,
    actor_id=current_user_id  # UUID user dari session/token
)
```

**Behavior:**
- **INSERT baru**: `created_by` dan `updated_by` di-set ke `actor_id`
- **UPDATE existing**: Hanya `updated_by` yang diupdate, `created_by` tetap sama (preserve original creator)

### 2. Soft Delete Encounter

Untuk soft delete (menandai record sebagai dihapus tanpa benar-benar menghapus dari database):

```python
# Soft delete encounter
success = soft_delete_satusehat_encounter(
    cursor,
    encounter_id="Encounter/12345",
    actor_id=current_user_id
)

if success:
    print("Encounter berhasil di-soft delete")
else:
    print("Encounter sudah dihapus atau tidak ditemukan")
```

**Behavior:**
- Set `deleted_at` = NOW()
- Set `deleted_by` = actor_id
- Update `updated_at` dan `updated_by`
- Hanya update record yang `deleted_at IS NULL` (belum dihapus)
- Returns `True` jika berhasil, `False` jika tidak ada row yang terpengaruh

### 3. Query dengan Filter Soft Delete

Untuk exclude record yang sudah di-soft delete:

```sql
-- Hanya ambil encounter yang belum dihapus
SELECT *
FROM satusehat_encounters
WHERE deleted_at IS NULL;

-- Ambil encounter yang sudah dihapus
SELECT *
FROM satusehat_encounters
WHERE deleted_at IS NOT NULL;

-- Ambil semua (termasuk yang dihapus)
SELECT *
FROM satusehat_encounters;
```

### 4. Query Audit Trail

Melihat history audit:

```sql
-- Siapa yang membuat encounter ini?
SELECT
    e.encounter_id,
    e.created_at,
    u.username as created_by_username,
    u.email as created_by_email
FROM satusehat_encounters e
LEFT JOIN users u ON e.created_by = u.id
WHERE e.encounter_id = 'Encounter/12345';

-- Siapa yang terakhir update?
SELECT
    e.encounter_id,
    e.updated_at,
    u.username as updated_by_username,
    u.email as updated_by_email
FROM satusehat_encounters e
LEFT JOIN users u ON e.updated_by = u.id
WHERE e.encounter_id = 'Encounter/12345';

-- Full audit trail (created, updated, deleted)
SELECT
    e.encounter_id,
    e.created_at,
    cu.username as created_by,
    e.updated_at,
    uu.username as updated_by,
    e.deleted_at,
    du.username as deleted_by
FROM satusehat_encounters e
LEFT JOIN users cu ON e.created_by = cu.id
LEFT JOIN users uu ON e.updated_by = uu.id
LEFT JOIN users du ON e.deleted_by = du.id
WHERE e.encounter_id = 'Encounter/12345';
```

### 5. Restore Soft Deleted Record

Jika perlu restore record yang sudah di-soft delete:

```sql
UPDATE satusehat_encounters
SET
    deleted_at = NULL,
    deleted_by = NULL,
    updated_at = NOW(),
    updated_by = '<user_id_who_restores>'
WHERE encounter_id = 'Encounter/12345'
AND deleted_at IS NOT NULL;
```

Atau buat helper function di Python:

```python
def restore_satusehat_encounter(cursor, encounter_id, actor_id=None):
    """Restore soft-deleted encounter"""
    cursor.execute(
        """
        UPDATE satusehat_encounters
        SET
            deleted_at = NULL,
            deleted_by = NULL,
            updated_at = NOW(),
            updated_by = %s
        WHERE encounter_id = %s
        AND deleted_at IS NOT NULL
        """,
        (actor_id, encounter_id)
    )
    return cursor.rowcount > 0
```

## Migration untuk Database Existing

Jika database sudah ada, jalankan migration script:

```bash
python3 scripts/migrate_add_audit_columns_encounters.py
```

Script ini akan:
1. Menambahkan kolom `created_by`, `updated_by`, `deleted_at`, `deleted_by`
2. Membuat index untuk performa query
3. Idempoten (aman dijalankan berulang kali)

## Best Practices

1. **Selalu pass actor_id**: Pastikan setiap operasi mencatat user yang melakukannya
2. **Gunakan soft delete**: Untuk data penting seperti encounter, lebih baik soft delete agar bisa di-audit dan restore
3. **Filter deleted_at**: Jangan lupa filter `WHERE deleted_at IS NULL` di query untuk exclude soft deleted records
4. **Index yang tepat**: Index sudah dibuat untuk `created_by`, `updated_by`, dan partial index untuk `deleted_at`

## Contoh Integration dengan Flask Endpoint

```python
@app.route("/orders/<identifier>/satusehat-refs", methods=["POST"])
@require_auth
def attach_satusehat_refs(identifier):
    # Get current user from auth token/session
    current_user_id = get_current_user_id()

    # ... existing code ...

    if enc_id:
        upsert_satusehat_encounter(
            cursor,
            updated_order,
            enc_id,
            request_payload=request_data,
            response_payload=response_data,
            actor_id=current_user_id  # Track who did this operation
        )

    # ... rest of code ...
```

## Monitoring & Reporting

Query untuk monitoring aktivitas:

```sql
-- Encounters dibuat hari ini oleh user
SELECT
    u.username,
    COUNT(*) as encounters_created_today
FROM satusehat_encounters e
JOIN users u ON e.created_by = u.id
WHERE DATE(e.created_at) = CURRENT_DATE
GROUP BY u.username;

-- Encounters yang di-soft delete dalam 7 hari terakhir
SELECT
    e.encounter_id,
    e.deleted_at,
    u.username as deleted_by
FROM satusehat_encounters e
LEFT JOIN users u ON e.deleted_by = u.id
WHERE e.deleted_at >= NOW() - INTERVAL '7 days'
ORDER BY e.deleted_at DESC;
```
