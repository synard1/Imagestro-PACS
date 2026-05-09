# GET /orders/satusehat-not-synced

Endpoint ini mengembalikan daftar order yang BELUM berhasil tersinkron ke SATUSEHAT.
Digunakan untuk tim follow-up.

## URL

- Internal: `GET /orders/satusehat-not-synced`
- Via API Gateway: `GET /orders/satusehat-not-synced`

## Kriteria data

Order yang dikembalikan memenuhi:

- `status != 'DELETED'`
- `satusehat_synced = FALSE` atau `satusehat_synced IS NULL`

## Query Parameters (opsional)

- `from`:
  - Filter `created_at >= from`
  - `YYYY-MM-DD` atau ISO datetime (`Z` didukung)
- `to`:
  - Filter `created_at < to`
  - Jika `YYYY-MM-DD` → sampai sebelum hari berikutnya
- `modality`:
  - Filter exact modality
- `source`:
  - Filter `order_source` (case-insensitive), contoh: `simrs`, `api`, `pacs`
- `limit`:
  - Default `50`, min `1`, max `500`
- `offset`:
  - Default `0`

## Response

```json
{
  "status": "success",
  "orders": [
    {
      "id": "3f95d3f9-4a1c-4a0f-8b22-92e90e1e2222",
      "order_number": "ORD2025111000002",
      "accession_number": "ACC20251110000124",
      "patient_name": "SITI AMALIA",
      "patient_national_id": "3201010101010002",
      "medical_record_number": "MRN-0002",
      "modality": "MR",
      "procedure_code": "78901-2",
      "procedure_name": "MRI BRAIN",
      "registration_number": "REG-2025-0002",
      "order_source": "api",
      "status": "CREATED",
      "order_status": "CREATED",
      "worklist_status": "CREATED",
      "satusehat_synced": false,
      "satusehat_encounter_id": null,
      "satusehat_service_request_id": null,
      "satusehat_sync_date": null,
      "created_at": "2025-11-10T07:16:00.000000"
    }
  ],
  "count": 1,
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

## Penggunaan

- Dashboard / tab "Belum terkirim ke SATUSEHAT".
- Tim dapat memilih baris dan melakukan:
  - pengecekan data (IHS, encounter, kode LOINC),
  - pemanggilan ulang `POST /orders/{identifier}/sync-satusehat`.
