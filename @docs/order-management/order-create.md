# Create Order (Unified)

Endpoint:
- POST /orders/create
- Recommended usage: via API Gateway: POST http://api-gateway:8888/orders/create

Description:
Membuat satu order radiologi dengan skema unified. Jika accession_number tidak diberikan,
service akan meminta ke Accession API. Juga menyiapkan/mengaitkan rekam pasien di Master Data
jika skema patients tersedia.

Authentication:
- Required: Authorization: Bearer <JWT>
- Recommended permissions:
  - order:create
  - patient:create (indirect, jika integrasi master-data aktif)
  - accession:create (melalui Accession API via gateway)
- Production: enforce via API Gateway RBAC.

Idempotency / Anti-duplicate:
- Service melakukan dedup check dalam window 1 jam berdasarkan kombinasi:
  - registration_number
  - procedure_code
  - procedure_name
  - patient_name
  - medical_record_number
- Jika kombinasi sama dalam 1 jam terakhir → HTTP 409.

Request:
- Content-Type: application/json
- Body fields (utama):

  - modality (string, required)
  - patient_name (string, required)
  - gender (string, required: 'male' / 'female')
  - birth_date (string, required, format: YYYY-MM-DD)
  - patient_national_id (string, optional)
  - medical_record_number (string, optional; salah satu NIK/MRN wajib)
  - procedure_code (string, optional tapi direkomendasikan, digunakan untuk LOINC)
  - procedure_name (string, optional; deskripsi prosedur)
  - referring_doctor / referring_physician (string, required secara efektif; akan dinormalkan ke referring_doctor)
  - scheduled_at (string, optional, ISO8601)
  - registration_number (string, optional; kuat untuk dedup)
  - satusehat_ihs_number / ihs_number / satusehat_patient_id / patientId (string, optional)
  - satusehat_encounter_id / encounterId (string, optional)
  - accession_number / accession_no (string, optional; jika sudah disediakan, tidak akan generate)

Notes:
- Minimal: modality, patient_name, gender, birth_date, dan NIK atau MRN.
- Jika accession_number tidak dikirim:
  - Service akan call: POST {ACCESSION_API_URL}/accession/create
  - Error pada Accession API → 502.

Example Request:

```json
{
  "modality": "CT",
  "patient_name": "John Doe",
  "gender": "male",
  "birth_date": "1985-01-02",
  "patient_national_id": "1234567890123456",
  "medical_record_number": "MRN-001",
  "procedure_code": "CTHEAD",
  "procedure_name": "CT Scan Head",
  "referring_doctor": "Dr. Smith",
  "scheduled_at": "2025-11-07T10:00:00Z",
  "registration_number": "REG-20251107-0001"
}
```

Success Response:
- HTTP 201 Created

```json
{
  "status": "success",
  "order": {
    "id": "c5b7f0d8-...-...",
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
    "referring_doctor": "Dr. Smith",
    "patient_id": "uuid-of-patient-if-available",
    "satusehat_encounter_id": null,
    "details": {
      "created": {
        "by": "john.sso@example.com",
        "at": "2025-11-07T09:59:10Z",
        "user_id": "user-uuid",
        "username": "john"
      },
      "updated": null,
      "deleted": null
    },
    "status": "CREATED"
  }
}
```

Error Responses (utama):

- 400 Bad Request:
  - Missing required fields atau format invalid.

  ```json
  {
    "status": "error",
    "message": "Missing required fields: modality, patient_name, ..."
  }
  ```

- 400 Bad Request:
  - Tidak ada NIK maupun MRN.

  ```json
  {
    "status": "error",
    "message": "Either patient_national_id or medical_record_number must be provided"
  }
  ```

- 409 Conflict:
  - Duplikasi dalam 1 jam terakhir.

  ```json
  {
    "status": "error",
    "message": "Duplicate order detected within 1 hour for the same registration_number, procedure_code, procedure_name, patient_name, and medical_record_number"
  }
  ```

- 502 Bad Gateway:
  - Masalah dengan Accession API.

- 500 Internal Server Error:
  - Error tak terduga (cek log service / gateway).

Production Notes:
- Selalu panggil melalui API Gateway untuk memastikan JWT & RBAC konsisten.
- Log audit order tersimpan di `/var/log/orders/audit.log`.
