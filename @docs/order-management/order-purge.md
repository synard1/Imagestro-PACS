# Purge Order (Hard Delete)

Endpoint:
- DELETE /orders/<identifier>/purge

Description:
Menghapus order secara permanen dari database (hard delete).
Dirancang hanya untuk kasus khusus:
- data testing
- koreksi data salah yang tidak boleh dipertahankan
- compliance tertentu

Authentication:
- Authorization: Bearer <JWT>
- Recommended permission: order:delete
- Production: sebaiknya hanya role admin/superadmin yang memiliki akses.

Path Parameter:
- identifier:
  - id (UUID) ATAU
  - order_number ATAU
  - accession_number

Behavior:
1. Cari order dengan identifier:
   - UUID → by id
   - else → by accession_number/order_number
2. Jika tidak ditemukan → 404.
3. Jika ditemukan:
   - Jalankan `DELETE FROM orders WHERE id = :id`.
   - Tulis audit log `ORDER_PURGED` ke `/var/log/orders/audit.log`.

Success (200):

```json
{
  "status": "success",
  "message": "Order purged successfully",
  "order_id": "c5b7f0d8-....",
  "accession_number": "ACC20251107000001"
}
```

Errors:
- 404 Not Found:

```json
{
  "status": "error",
  "message": "Order not found"
}
```

- 500 Internal Server Error.

Production Notes:
- Tidak ada mekanisme undo.
- Hanya gunakan untuk kebutuhan operasi yang disetujui & tercatat.
- Disarankan panggil purge hanya pada order yang sudah di-soft delete sebelumnya.
