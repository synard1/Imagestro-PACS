# GET /orders/satusehat-stats

Endpoint ini memberikan ringkasan agregat status integrasi SATUSEHAT untuk orders.
Cocok untuk card summary di dashboard.

## URL

- Internal: `GET /orders/satusehat-stats`
- Via API Gateway: `GET /orders/satusehat-stats`

## Kriteria

- Hanya menghitung order dengan `status != 'DELETED'`.

## Query Parameters (opsional)

- `from`:
  - Filter `created_at >= from`
  - Format:
    - `YYYY-MM-DD`
    - atau ISO datetime (`Z` didukung)
- `to`:
  - Filter `created_at < to`
  - Jika `YYYY-MM-DD` → sampai sebelum hari berikutnya
- `modality`:
  - Filter exact modality
- `source`:
  - Filter `order_source` (case-insensitive)

## Response

```json
{
  "status": "success",
  "total_orders": 120,
  "synced": 80,
  "not_synced": 40,
  "synced_percentage": 66.67,
  "not_synced_percentage": 33.33,
  "filters": {
    "from": "2025-11-01",
    "to": "2025-11-10",
    "modality": "CT",
    "source": "simrs"
  }
}
```

## Penggunaan

- Menampilkan ringkasan di dashboard:
  - Total order
  - Berapa yang sudah terkirim ke SATUSEHAT
  - Berapa yang belum, dalam persen
- Dapat digabung dengan:
  - `GET /orders/satusehat-status` untuk tabel detail
  - `GET /orders/satusehat-not-synced` untuk daftar follow-up
