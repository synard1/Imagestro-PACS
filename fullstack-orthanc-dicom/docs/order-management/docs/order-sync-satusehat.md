# Sync Order to SATUSEHAT

Endpoint:
- POST /orders/<identifier>/sync-satusehat

Description:
Menyinkronkan sebuah order menjadi FHIR ServiceRequest di SATUSEHAT menggunakan accession_number
sebagai identifier. Setelah sukses, order ditandai telah tersinkronisasi.

Authentication:
- Authorization: Bearer <JWT>
- Recommended permission: order:sync

Path Parameter:
- identifier:
  - id (UUID) ATAU
  - accession_number

Note:
- Implementasi mencoba:
  - Jika identifier UUID → by id,
  - Jika bukan UUID → by accession_number.

Request:
- Content-Type: application/json (opsional)
- Body (opsional, untuk override/menyediakan data yang belum ada di order):

  - satusehat_ihs_number / satusehat_patient_id / patientId / ihs_number (string, required jika belum ada di order)
  - satusehat_encounter_id / encounterId (string, required jika belum ada di order)
  - loinc_code / procedure_code (string, required jika belum ada di order)
  - requester_ref (string, optional, override default `SATUSEHAT_REQUESTER_REF`)
  - performer_ref (string, optional, override default `SATUSEHAT_PERFORMER_REF`)

Requirements:
- satusehat_ihs_number (ID Patient di SATUSEHAT)
- satusehat_encounter_id (Encounter di SATUSEHAT)
- procedure_code/loinc_code (kode LOINC valid untuk pemeriksaan)

Behavior:
1. Ambil order dari DB.
2. Validasi:
   - Jika tidak ada → 404.
   - Jika tidak ada ihs_number atau encounter_id → 400.
   - Jika tidak ada loinc/procedure_code → 400.
3. Bangun payload ServiceRequest:
   - identifier.system = `${ACSN_SYSTEM_BASE}/${SATUSEHAT_ORG_ID}`
   - identifier.value = accession_number
4. Ambil OAuth token dari SATUSEHAT (client_credentials).
5. POST ke `${SATUSEHAT_FHIR_BASE}/ServiceRequest`.
6. Jika sukses:
   - Ambil `id` ServiceRequest.
   - Update order:
     - `satusehat_ihs_number`
     - `satusehat_encounter_id`
     - `satusehat_service_request_id`
     - `satusehat_synced = true`
     - `satusehat_sync_date = now()`
     - `order_status = 'SYNCED'`
     - `details.updated` (audit)
   - Tulis audit log `SATUSEHAT_SYNCED`.
7. Jika gagal:
   - Kembalikan 502 dan isi `upstream` + ringkasan OperationOutcome.

Success Response (200):

```json
{
  "status": "success",
  "message": "ServiceRequest dibuat di SATUSEHAT",
  "accession_number": "ACC20251107000001",
  "satusehat_ihs_number": "1000000000123456",
  "satusehat_encounter_id": "enc-123",
  "satusehat_service_request_id": "sr-123",
  "upstream": {
    "status": 201,
    "x_request_id": "....",
    "url": "https://..."
  }
}
```

Error Responses:
- 400 Bad Request:
  - satusehat_ihs_number atau encounter_id tidak tersedia.
  - procedure_code/loinc_code tidak ada.

- 404 Not Found:
  - Order tidak ditemukan.

- 502 Bad Gateway:
  - SATUSEHAT API error (status >= 300).
  - Body berisi:
    - `message`: ringkasan OperationOutcome atau snippet body.
    - `upstream`: status & x-request-id.
    - `sent`: payload ServiceRequest (untuk debug internal).

- 500 Internal Server Error:
  - Error lain di sisi service.

Production Notes:
- Lindungi endpoint ini dengan permission ketat, karena menyentuh sistem nasional.
- Simpan dan review `upstream.x_request_id` untuk troubleshooting dengan SATUSEHAT.

## Updated Behavior (SatuSehat Integration v2)

On successful sync, the service now:

- Sets:
  - `satusehat_synced = true`
  - `satusehat_sync_date = CURRENT_TIMESTAMP`
  - `satusehat_service_request_id = <ServiceRequest.id from SatuSehat>`
  - `order_status = 'SYNCED'`
  - `updated_at = CURRENT_TIMESTAMP`
- Updates `details` JSONB with:
  - `details.satusehat_sync`:
    - `status`: `"success"`
    - `service_request_id`: ServiceRequest ID from SatuSehat
    - `ihs_number`: patient IHS used
    - `encounter_id`: encounter used
    - `synced_at`: ISO8601 UTC timestamp of sync
    - `upstream`: compact info from SatuSehat response
      - `status`: HTTP status code
      - `x_request_id`: trace id if available
      - `url`: target FHIR endpoint
  - `details.updated`:
    - `by`: user identifier (or `system`)
    - `at`: ISO8601 UTC timestamp
    - `action`: `"SATUSEHAT_SYNC"`

These fields are used by the status endpoints and UI dashboards to show per-order SatuSehat integration status.
