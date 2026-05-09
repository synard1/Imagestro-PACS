# List Orders

Endpoint:
- Service (internal): GET /orders/list
- Via API Gateway: GET /orders

Description:
Mengambil daftar order dengan filter dasar untuk kebutuhan dashboard / monitoring.
Endpoint ini hanya mengembalikan kolom-kolom utama (ringkas), bukan seluruh detail order.

Authentication:
- Authorization: Bearer <JWT>
- Recommended permission: order:read

Query Parameters:
- status (string, optional)
  - Filter berdasarkan kolom `status`.
- date (string, optional, format YYYY-MM-DD)
  - Filter berdasarkan `scheduled_at::date`.
- modality (string, optional)
  - Filter berdasarkan `modality`.
- limit (int, optional, default 100, max 500)
- offset (int, optional, default 0)

Behavior:
- Secara default mengecualikan order dengan `status = 'DELETED'`.
- Data diurutkan `created_at DESC`.
- Hanya mengembalikan kolom utama berikut per record:
  - id
  - order_number
  - accession_number
  - patient_name
  - patient_national_id
  - medical_record_number
  - modality
  - procedure_code
  - procedure_name
  - registration_number
  - status
  - order_status
  - worklist_status
  - satusehat_synced
  - scheduled_at
  - created_at

Example Request:
- GET /orders?status=CREATED&modality=CT&limit=20

Example Success Response (200):

```json
{
  "status": "success",
  "orders": [
    {
      "id": "c5b7f0d8-....",
      "order_number": "ORD2025110700001",
      "accession_number": "ACC20251107000001",
      "patient_name": "John Doe",
      "patient_national_id": "1234567890123456",
      "medical_record_number": "MRN-001",
      "modality": "CT",
      "procedure_code": "CTHEAD",
      "procedure_name": "CT Scan Head",
      "registration_number": "REG202511070001",
      "status": "CREATED",
      "order_status": "CREATED",
      "worklist_status": null,
      "satusehat_synced": false,
      "scheduled_at": "2025-11-07T10:00:00Z",
      "created_at": "2025-11-07T09:59:10Z"
    }
  ],
  "count": 1,
  "total": 1,
  "limit": 20,
  "offset": 0
}
```

Error (500):

```json
{
  "status": "error",
  "message": "Error listing orders: <detail>"
}
```

Production Notes:
- Gunakan filter & pagination untuk menghindari query berat.
- Endpoint ini sudah cukup untuk tampilan list di UI.
- Untuk ringkasan alternatif ada `/orders/all`, dan untuk detail penuh gunakan:
  - `GET /orders/<identifier>` atau
  - `GET /orders/all/details` (internal/admin).
