# Create Worklist from Order

Endpoint:
- POST /orders/<identifier>/create-worklist

Description:
Membangun DICOM Modality Worklist (MWL) berdasarkan data order, dan mengirimkannya
ke layanan MWL Writer.

Authentication:
- Authorization: Bearer <JWT>
- Recommended permission: worklist:create
- Biasanya dipanggil via API Gateway yang mem-forward token ke MWL service.

Path Parameter:
- identifier:
  - id (UUID) ATAU
  - accession_number

Behavior (ringkas):
1. Ambil order:
   - Jika identifier UUID → by id.
   - Jika bukan → by accession_number.
2. Jika tidak ditemukan → 404.
3. Hitung scheduled_date & scheduled_time dari `scheduled_at` jika tersedia.
4. Bangun payload MWL:

   ```json
   {
     "patient_name": "DOE^JOHN",
     "patient_id": "1234567890123456",
     "patient_birth_date": "19850102",
     "patient_sex": "male",
     "accession_number": "ACC20251107000001",
     "procedure_description": "CT Scan Head",
     "modality": "CT",
     "scheduled_date": "20251107",
     "scheduled_time": "100000",
     "physician_name": "SMITH^DR",
     "station_aet": "SCANNER01"
   }
   ```

   - `patient_name` diubah ke format DICOM `LAST^FIRST` sederhana (replace spasi dengan `^`).
   - `station_aet` menggunakan `MWL_STATION_AET` (env, default `SCANNER01`).

5. Kirim ke:
   - POST `${MWL_SERVICE_URL}/worklist/create`
   - Forward header Authorization jika tersedia.
6. Jika sukses:
   - Update order:
     - `worklist_status = 'CREATED'`
     - `order_status = 'SCHEDULED'`
     - `details.updated` diisi.
   - Tulis audit log `WORKLIST_CREATED`.
7. Jika gagal call MWL:
   - Return 500 dengan pesan error.

Success Response (200):

```json
{
  "status": "success",
  "message": "Worklist created successfully",
  "accession_number": "ACC20251107000001",
  "worklist": {
    "...": "response dari MWL Writer"
  }
}
```

Error Responses:
- 404 Not Found:
  - Order tidak ditemukan.

- 500 Internal Server Error:
  - Gagal memanggil MWL service.

Production Notes:
- Endpoint ini mengikat antara Order dan MWL, gunakan permission khusus.
- Pastikan MWL Writer hanya dapat diakses dari internal/gateway.
