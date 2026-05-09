# Soft Delete Order

Endpoint:
- DELETE /orders/<identifier>

Description:
Melakukan soft delete pada order:
- Menandai status sebagai `DELETED`
- Mengisi metadata `details.deleted` dengan informasi actor & timestamp
- Tidak menghapus record secara fisik (masih dapat di-audit)

Authentication:
- Authorization: Bearer <JWT>
- Recommended permission: order:delete

Path Parameter:
- identifier:
  - id (UUID) ATAU
  - order_number ATAU
  - accession_number

Behavior:
1. Cari order by:
   - id (UUID), jika gagal → cari `accession_number` atau `order_number`.
2. Jika tidak ditemukan → 404.
3. Jika sudah di-soft delete (status `DELETED` atau sudah punya `details.deleted`) → 409.
4. Jika valid:
   - Update:
     - `status = 'DELETED'`
     - `updated_at = CURRENT_TIMESTAMP`
     - `details.deleted = { by, at }`
   - Tulis audit log ke `/var/log/orders/audit.log`.

Success (200):

```json
{
  "status": "success",
  "message": "Order deleted successfully",
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

- 409 Conflict (sudah soft delete):

```json
{
  "status": "error",
  "message": "Order already soft deleted. Use DELETE /orders/<identifier>/purge to remove it permanently."
}
```

- 500 Internal Server Error.

Production Notes:
- Soft delete adalah default. Gunakan purge hanya untuk kasus khusus (GDPR, test data, dsb).
- Batasi akses dengan RBAC sehingga hanya admin yang bisa delete.
