# List All Orders (Detailed View)

Endpoint:
- GET /orders/all/details

Description:
Mengembalikan daftar lengkap seluruh field order (non-DELETED).
Dipakai untuk kebutuhan admin, audit, atau analisis.

Authentication:
- Authorization: Bearer <JWT>
- Recommended permission: order:read

Behavior:
- SELECT * FROM orders WHERE status != 'DELETED'
- Mengembalikan semua kolom, termasuk metadata SATUSEHAT, worklist, dan details.

Success Response (200) contoh (dipotong):

```json
{
  "status": "success",
  "orders": [
    {
      "id": "c5b7f0d8-....",
      "org_id": "....",
      "patient_id": "....",
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
      "satusehat_ihs_number": null,
      "registration_number": "REG-20251107-0001",
      "status": "CREATED",
      "order_status": "CREATED",
      "worklist_status": null,
      "imaging_status": null,
      "satusehat_encounter_id": null,
      "satusehat_service_request_id": null,
      "satusehat_synced": false,
      "created_at": "2025-11-07T09:59:10Z",
      "updated_at": "2025-11-07T09:59:10Z",
      "details": {
        "created": { "...": "..." },
        "updated": null,
        "deleted": null
      }
    }
  ],
  "count": 1
}
```

Errors:
- 500: error saat query database.

Usage Notes:
- Endpoint ini dapat sangat besar; gunakan untuk tooling internal, bukan untuk UI publik langsung.
