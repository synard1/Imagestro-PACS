# SIMRS Radiology Order Simulator

Service FastAPI + UI sederhana untuk mensimulasikan input order radiologi pada SIMRS hingga pengiriman ke DICOM Router SatuSehat melalui API Gateway.

## Fitur Utama
- Form order lengkap dengan validasi komprehensif (server-side & client-side)
- Integrasi RBAC (login dan Bearer token) ke gateway `103.42.117.19:8888`
- Preview data sebelum submit, notifikasi status, dan cetak/simpan bukti order
- Autocomplete (via localStorage) untuk input berulang (MRN, modality, LOINC)
- Logging terpusat ke file `logs/simrs_order_ui.log`
- API proxy untuk direct testing (POST JSON ke service ini)
- Responsif dan kompatibel dengan browser modern

## Persiapan & Menjalankan (Windows, tanpa Docker)
1. Pastikan Python 3.10+ tersedia.
2. Buat virtualenv dan install dependencies:
   ```powershell
   python -m venv .venv
   .\.venv\Scripts\pip install -r simrs-order-ui\requirements.txt
   ```
3. Jalankan server (port default 8095):
   ```powershell
   .\.venv\Scripts\python -m uvicorn --app-dir simrs-order-ui app:api --host 0.0.0.0 --port 8095
   ```
4. Buka UI: `http://localhost:8095/`

Catatan: Base URL gateway default `http://103.42.117.19:8888`. Bisa diubah via env `GATEWAY_BASE` atau field di UI.

## Konfigurasi
- Env file opsional: `simrs-order-ui/.env`
  ```env
  GATEWAY_BASE=http://103.42.117.19:8888
  ```

## Endpoints (Service ini)
- `GET /` UI form
- `GET /health` status service
- `GET /config` base URL gateway
- `POST /api/auth/login` body: `{ username, password }` → response token dari gateway
- `POST /api/orders/create` Bearer token wajib, body sesuai model server (lihat di JS collectPayload)
- `POST /api/orders/complete-flow` Bearer token wajib, body sama + optional SATUSEHAT referensi (melanjutkan ke DICOM Router via gateway)
- `GET /api/orders/{identifier}` Bearer token wajib, ambil detail order

## Contoh Testing API (tanpa UI)
```powershell
$token = "<JWT dari /api/auth/login>"
Invoke-RestMethod -Uri http://localhost:8095/api/orders/create -Method Post -Headers @{ Authorization = "Bearer $token" } -ContentType "application/json" -Body (@{
    patient = @{ national_id = "3210...16"; ihs_number = $null; medical_record_number = "MRN001"; name = "Budi Santoso"; sex = "male"; birth_date = "1990-01-01" };
    order = @{ modality = "CR"; procedure_code = "24627-2"; procedure_name = "CR chest"; scheduled_at = (Get-Date).ToString("s") + "Z"; registration_number = $null; clinical_notes = "" };
    satusehat = @{ satusehat_patient_id = $null; satusehat_encounter_id = $null }
} | ConvertTo-Json)
```

## Load Testing
Gunakan skrip `load_test.py`:
```powershell
.\.venv\Scripts\python simrs-order-ui\load_test.py --url http://localhost:8095 --concurrency 20 --requests 200 --token <JWT>
```
Skrip ini melakukan banyak request paralel ke endpoint create untuk menilai stabilitas.

## Keamanan & Logging
- RBAC: semua operasi create/complete/get memerlukan Bearer token dari gateway
- Validasi Pydantic ketat untuk semua field input
- Logging request/respons ringkas ke `logs/simrs_order_ui.log`
- UI tidak menyimpan password; token disimpan di `localStorage` untuk sesi simulasi

## Catatan Produksi
- Service ini dirancang modular dan future-proof untuk integrasi lebih lanjut (mis. audit trail, retry, rate limiting)
- Pengiriman data aman dilakukan melalui gateway yang sudah menerapkan kontrol keamanan; service ini hanya proxy terautentikasi
- Untuk integrasi penuh ke deployment produksi, gunakan reverse proxy dan TLS sesuai kebijakan organisasi