# Update Order

Endpoint:
- PUT /orders/<identifier>

Description:
Memperbarui field tertentu pada sebuah order tanpa mengubah identity utama.

Authentication:
- Authorization: Bearer <JWT>
- Recommended permission: order:update

Path Parameter:
- identifier:
  - id (UUID) ATAU
  - order_number ATAU
  - accession_number

Aturan:
- Field yang TIDAK boleh di-update:
  - id
  - order_number
  - accession_number
  - created_at
  - updated_at
- Field lain dari tabel `orders` dapat diupdate, contoh umum:
  - modality
  - procedure_code
  - procedure_name
  - scheduled_at
  - patient_name / patient_national_id / medical_record_number
  - clinical_indication / clinical_notes
  - ordering_physician_name
  - status / order_status (gunakan dengan hati-hati; sesuaikan dengan flow bisnis)
- Audit:
  - Mencatat aksi ke `/var/log/orders/audit.log`.

Request:
- Content-Type: application/json
- Body: hanya field yang ingin diubah.

Example:

```json
{
  "procedure_name": "CT Scan Head + Contrast",
  "clinical_indication": "Headache, rule out bleeding",
  "ordering_physician_name": "Dr. Updated"
}
```

Success (200):

```json
{
  "status": "success",
  "message": "Order updated successfully",
  "order_id": "c5b7f0d8-....",
  "accession_number": "ACC20251107000001"
}
```

Errors:
- 404 Not Found:
  - Jika order tidak ditemukan.

- 400 Bad Request:
  - Body kosong atau tidak ada field yang valid untuk update.

- 500 Internal Server Error:
  - Error lain pada database/logika.

Production Notes:
- Rekomendasi: batasi siapa yang boleh mengubah field sensitif (via RBAC).
- Hindari ubah `status` manual tanpa prosedur; gunakan endpoint flow bila memungkinkan.
