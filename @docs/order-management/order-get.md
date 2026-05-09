# Get Order Detail

Endpoint:
- GET /orders/<identifier>

Description:
Mengambil detail satu order berdasarkan:
- id (UUID)
- order_number
- accession_number

Authentication:
- Authorization: Bearer <JWT>
- Recommended permission: order:read

Path Parameter:
- identifier (string)
  - Diinterpretasi berurutan:
    1. Jika valid UUID → cari `id`
    2. Jika bukan UUID → cari `accession_number = identifier OR order_number = identifier`

Behavior:
- Hanya mengembalikan order dengan `status != 'DELETED'`.

Success Response (200):

```json
{
  "status": "success",
  "order": {
    "id": "c5b7f0d8-....",
    "order_number": "ORD2025110700001",
    "accession_number": "ACC20251107000001",
    "modality": "CT",
    "procedure_code": "CTHEAD",
    "procedure_name": "CT Scan Head",
    "scheduled_at": "2025-11-07T10:00:00Z",
    "patient_national_id": "1234567890123456",
    "patient_name": "John Doe",
    "gender": "male",
    "birth_date": "1985-01-02",
    "medical_record_number": "MRN-001",
    "registration_number": "REG-20251107-0001",
    "status": "CREATED",
    "order_status": "CREATED",
    "worklist_status": null,
    "satusehat_encounter_id": null,
    "satusehat_service_request_id": null,
    "satusehat_synced": false,
    "details": {
      "created": { "...": "..." },
      "updated": null,
      "deleted": null
    }
  }
}
```

Error Responses:
- 404 Not Found:

```json
{
  "status": "error",
  "message": "Order not found"
}
```

- 500 Internal Server Error.
