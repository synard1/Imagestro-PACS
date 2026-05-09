# List All Orders (Simple View)

Endpoint:
- GET /orders/all

Description:
Mengembalikan daftar ringkas order untuk kebutuhan overview cepat atau dropdown.

Authentication:
- Authorization: Bearer <JWT>
- Recommended permission: order:read

Behavior:
- Mengambil subset kolom:
  - id
  - order_number
  - accession_number
  - patient_name
  - modality
  - status
  - created_at
- Hanya menampilkan order yang `status != 'DELETED'`.

Success Response (200):

```json
{
  "status": "success",
  "orders": [
    {
      "id": "c5b7f0d8-....",
      "order_number": "ORD2025110700001",
      "accession_number": "ACC20251107000001",
      "patient_name": "John Doe",
      "modality": "CT",
      "status": "CREATED",
      "created_at": "2025-11-07T10:00:00Z"
    }
  ],
  "count": 1
}
```

Error (500):

```json
{
  "status": "error",
  "message": "Error listing all orders: <detail>"
}
```
