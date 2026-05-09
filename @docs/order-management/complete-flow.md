# Complete Flow: Create Order → Sync SATUSEHAT → Create Worklist

Endpoint:
- POST /orders/complete-flow

Description:
Menjalankan alur end-to-end dalam satu call terkontrol:

1) Membuat order baru (seperti `POST /orders/create`)
2) Melakukan sync ke SATUSEHAT (ServiceRequest)
3) Membuat Modality Worklist

Dirancang untuk simulasi/alur terintegrasi SIMRS ↔ SATUSEHAT ↔ DICOM, dengan kontrol RBAC ketat.

Authentication:
- Authorization: Bearer <JWT>
- Recommended combined permissions:
  - order:create
  - order:sync
  - worklist:create
  - (atau `*` untuk superadmin)
- Implementasi saat ini memakai decorator `@require_auth(REQUIRED_PERMISSIONS_OM['complete_flow'])`
  di dalam service, namun di production disarankan enforcement utama via API Gateway.

Method Guard:
- GET /orders/complete-flow → 405 dengan instruksi gunakan POST.
- Hanya POST yang valid.

Request:
- Content-Type: application/json
- Body:
  - Body akan diteruskan ke langkah pembuatan order (`/orders/create`).
  - Pastikan memenuhi requirement `order-create`:
    - modality, patient_name, gender, birth_date
    - patient_national_id atau medical_record_number
    - procedure_code/procedure_name, referring_doctor, dll sesuai kebutuhan
  - Untuk SATUSEHAT:
    - satusehat_ihs_number (opsional; jika belum tersedia order sync akan mencoba pakai nilai dari body/order)
    - satusehat_encounter_id
    - loinc_code/procedure_code
  - Jika `SATUSEHAT_SYNC_OPTIONAL` = false, kegagalan sync akan membuat flow gagal.

Behavior Detail:
1) Step 1 – Create Order
   - Memanggil fungsi `create_order()` internal.
   - Jika gagal (status != 201) → langsung return error ke client.
   - Jika sukses → ambil:
     - order_id
     - accession_number

2) Step 2 – Sync to SATUSEHAT
   - Memanggil `sync_to_satusehat(order_id)` internal.
   - Jika status 200:
     - Menyimpan detail respons sebagai `satusehat` di output.
   - Jika gagal:
     - Bila `SATUSEHAT_SYNC_OPTIONAL = true`:
       - Flow TETAP lanjut ke Step 3, dan respon final akan berisi info bahwa SATUSEHAT sync di-skip/failed.
     - Bila `SATUSEHAT_SYNC_OPTIONAL = false`:
       - Flow dihentikan dan error dari sync dikembalikan ke client.

3) Step 3 – Create Worklist
   - Memanggil `create_worklist_from_order(order_id, jwt_token)` internal.
   - Jika gagal → return error ke client.
   - Jika sukses → respons worklist dilampirkan.

Success Response (200):

```json
{
  "status": "success",
  "message": "Complete flow executed successfully",
  "accession_number": "ACC20251107000001",
  "order": {
    "...": "obj order dari step 1"
  },
  "satusehat": {
    "...": "response dari sync-satusehat"
  },
  "worklist": {
    "...": "response dari create-worklist"
  },
  "next_steps": {
    "1": "Simulate scan",
    "2": "DICOM Router will process automatically",
    "3": "ImagingStudy will be created in SATUSEHAT"
  }
}
```

Jika SATUSEHAT sync gagal tapi optional:

```json
{
  "status": "success",
  "message": "Complete flow executed successfully",
  "accession_number": "ACC20251107000001",
  "order": { "...": "..." },
  "satusehat": {
    "status": "skipped",
    "error": {
      "message": "Detail error dari SATUSEHAT"
    }
  },
  "worklist": { "...": "..." }
}
```

Error Responses:
- 400 / 409 dari langkah create (ikut `order-create`).
- 4xx / 5xx dari `sync-satusehat` jika non-optional dan gagal.
- 5xx jika create-worklist gagal.
- Seluruh error mengikuti pola:

```json
{
  "status": "error",
  "message": "<penjelasan>"
}
```

Production Notes:
- Endpoint ini powerful dan harus dibatasi ke role tertentu (misal: system integrator / internal).
- Disarankan memakai endpoint ini via API Gateway dengan kombinasi permission yang jelas.
- Untuk kontrol lebih granular, bisa panggil 3 langkah secara terpisah:
  - /orders/create
  - /orders/<id>/sync-satusehat
  - /orders/<id>/create-worklist
