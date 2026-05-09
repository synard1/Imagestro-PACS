# Worklist API Configuration

## Konfigurasi Backend

Worklist sekarang menggunakan backend API yang sama dengan modul lainnya:

```javascript
worklist: {
  enabled: true,
  baseUrl: "http://103.42.117.19:8888",
  healthPath: "/health",
  timeoutMs: 6000,
}
```

## Endpoint yang Digunakan

- `GET /api/worklist` - Mendapatkan daftar worklist dengan filter
- `GET /api/worklist/:id` - Mendapatkan detail worklist item
- `GET /api/worklist/summary` - Mendapatkan ringkasan/statistik worklist
- `PATCH /api/orders/:id/status` - Update status order
- `POST /api/orders/:id/reschedule` - Reschedule order
- `POST /api/orders/:id/cancel` - Cancel order

## Troubleshooting CORS Error

Jika masih muncul error CORS atau request ke `localhost:8003`:

### 1. Clear Browser Cache & LocalStorage

Buka browser console (F12) dan jalankan:

```javascript
// Clear localStorage
localStorage.clear()

// Atau hanya clear API config
localStorage.removeItem("api.registry.v1")
localStorage.removeItem("api.registry.v2")
localStorage.removeItem("api.registry.v3")

// Reload page
location.reload()
```

### 2. Gunakan Reset Utility

```javascript
// Di browser console
resetApiConfig()
```

### 3. Hard Refresh Browser

- Chrome/Edge: `Ctrl + Shift + R` atau `Ctrl + F5`
- Firefox: `Ctrl + Shift + R`
- Safari: `Cmd + Shift + R`

### 4. Verifikasi Konfigurasi

Buka browser console dan cek konfigurasi aktif:

```javascript
// Import dan load registry
import { loadRegistry } from './services/api-registry'
const config = loadRegistry()
console.log('Worklist config:', config.worklist)
```

Seharusnya menampilkan:
```javascript
{
  enabled: true,
  baseUrl: "http://103.42.117.19:8888",
  healthPath: "/health",
  timeoutMs: 6000
}
```

## Backend Requirements

Backend API harus menyediakan endpoint worklist dengan struktur response:

```javascript
// GET /api/worklist
[
  {
    id: "string",
    order_number: "string",
    accession_no: "string",
    patient_id: "string",
    patient_name: "string",
    patient_sex: "M|F|O",
    patient_dob: "YYYY-MM-DD",
    modality: "CT|MR|CR|DX|US|etc",
    requested_procedure: "string",
    scheduled_date: "YYYY-MM-DD",
    scheduled_time: "HH:MM",
    status: "scheduled|arrived|in_progress|completed|etc",
    priority: "stat|urgent|routine|etc",
    station_ae_title: "string"
  }
]
```

## CORS Configuration

Backend harus mengizinkan CORS dari frontend:

```python
# FastAPI example
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Atau specify domain frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## Version History

- **v3** (Current) - Worklist menggunakan `http://103.42.117.19:8888`
- **v2** - Audit menggunakan `http://103.42.117.19:8888`
- **v1** - Initial configuration
