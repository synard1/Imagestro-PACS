# GET /orders/satusehat-status

Endpoint ini memberikan daftar ringkas status integrasi SATUSEHAT untuk banyak order.
Cocok untuk dashboard monitoring di UI.

## URL

- Internal: `GET /orders/satusehat-status`
- Via API Gateway: `GET /orders/satusehat-status` (proxy dari `/orders/<path>`)

## Kriteria data

- Hanya mengambil order dengan `status != 'DELETED'`.

## Query Parameters (opsional)

- `satusehat_synced`:
  - `true`  → hanya order yang sudah berhasil sync ke SATUSEHAT
  - `false` → hanya order yang belum sync (FALSE atau NULL)
  - kosong → semua order (tidak difilter oleh flag ini)
- `from`:
  - Filter `created_at >= from`
  - Format:
    - `YYYY-MM-DD` → jam 00:00 hari itu
    - atau ISO datetime, `Z` didukung
- `to`:
  - Filter `created_at < to`
  - Jika `YYYY-MM-DD` → sampai sebelum hari berikutnya (inclusive by date)
- `modality`:
  - Filter exact modality (contoh: `CT`, `MR`, `CR`)
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
      "order_id": "7a3b9fd0-1e8a-4a2d-9f2b-9a2d7fad1111",
      "order_number": "ORD2025111000001",
      "accession_number": "ACC20251110000123",
      "patient_name": "BUDI SANTOSO",
      "modality": "CT",
      "order_source": "simrs",
      "status": "CREATED",
      "order_status": "SYNCED",
      "satusehat_synced": true,
      "satusehat_sync_date": "2025-11-10T07:20:30.123456",
      "satusehat_service_request_id": "abcd-1234",
      "created_at": "2025-11-10T07:15:23.000000",
      "updated_at": "2025-11-10T07:20:30.123456",
      "satusehat_sync_details": {
        "status": "success",
        "service_request_id": "abcd-1234",
        "ihs_number": "P1234567890",
        "encounter_id": "E987654321",
        "synced_at": "2025-11-10T07:20:30Z",
        "upstream": {
          "status": 201,
          "x_request_id": "req-xyz",
          "url": "https://api-satusehat.../ServiceRequest"
        }
      },
      "updated_audit": {
        "by": "admin@example.com",
        "at": "2025-11-10T07:20:30Z",
        "action": "SATUSEHAT_SYNC"
      }
    }
  ],
  "count": 1,
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

## Catatan

- Endpoint ini dirancang untuk dashboard:
  - menampilkan status sync SatuSehat per order,
  - mudah difilter (synced / not synced, per hari, per modality, per sumber).
