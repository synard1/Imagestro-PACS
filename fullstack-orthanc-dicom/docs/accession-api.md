# Accession API

Generates and stores unique accession numbers with metadata, optionally triggers MWL creation. Written in Hono (TypeScript).

- Base (internal): `http://accession-api:8180`
- Access: used by SIMRS Bridge and potentially Order Management; not directly exposed via gateway routes in code.

## Endpoints

### GET /healthz
- Response: service health status.

### POST /api/accessions
- Headers: `Content-Type: application/json`
- **Field Mandatory (sesuai standar SATUSEHAT):**
  - `patient.id` (NIK): **WAJIB** - 16 digit angka
  - `patient.ihs_number`: **WAJIB** - IHS Number format P + 11 digit angka (contoh: P02478375538)
  - `patient.name`: **WAJIB** - Nama lengkap pasien
  - `modality`: **WAJIB** - Salah satu dari: CT, MR, CR, DX, US, XA, RF, MG, NM, PT
- **Field Optional (Demographic Information):**
  - `patient.birthDate`: **OPSIONAL** - Tanggal lahir format YYYY-MM-DD (FHIR standard)
  - `patient.sex`: **OPSIONAL** - Jenis kelamin: male, female, other, unknown (FHIR standard)
  - `patient.medical_record_number`: **OPSIONAL** - Nomor rekam medis (alphanumeric, 1-50 karakter)
- Body (example):
```json
{
  "modality": "CT",
  "procedure_code": "CTABDOMEN",
  "scheduled_at": "2025-10-22T09:30:00Z",
  "patient": { 
    "id": "1234567890123456",
    "ihs_number": "P02478375538",
    "name": "John Doe",
    "birthDate": "1990-01-01",
    "sex": "male",
    "medical_record_number": "MRN123456"
  },
  "note": "Optional note"
}
```
- **Validasi:**
  - NIK harus 16 digit angka
  - IHS Number harus format P + 11 digit angka (contoh: P02478375538)
  - Nama pasien tidak boleh kosong
  - Modality harus valid sesuai standar DICOM
  - scheduled_at harus format ISO 8601 jika ada
  - birthDate harus format YYYY-MM-DD dan tidak boleh di masa depan (jika ada)
  - sex harus salah satu dari: male, female, other, unknown (jika ada)
  - medical_record_number hanya boleh berisi huruf, angka, tanda hubung (-), dan underscore (_), maksimal 50 karakter (jika ada)
- **Error Response (400):**
```json
{
  "error": "Patient ID (NIK) is required",
  "message": "Field 'patient.id' (NIK) wajib diisi dan tidak boleh kosong"
}
```
- Behavior: Generates accession number using modality, date, sequence; stores details (facility code, issuer, procedure code, scheduled time, patient info) in PostgreSQL.
- Issuer format: `http://sys-ids.kemkes.go.id/acsn/{patient.id}|{accession_number}` (sesuai standar SATUSEHAT)
- Optional: if `ENABLE_MWL=true`, posts to `MWL_WRITER_URL` to generate a DICOM MWL file (with accession, patient, and procedure details).
- Success response (shape):
```json
{
  "accession_number": "CT.250120.000001",
  "issuer": "http://sys-ids.kemkes.go.id/acsn/1234567890123456|CT.250120.000001",
  "facility": "RSABC"
}
```

### GET /api/accessions/:an
- Path param `:an`: accession number.
- Response: accession details by number.

### POST /accession/create
- Headers: `Content-Type: application/json`
- Body (SIMRS example):
```json
{
  "modality": "CT",
  "procedure_code": "CTABDOMEN",
  "procedure_name": "CTABDOMEN 0001",
  "scheduled_at": "2025-10-22T09:30:00Z",
  "patient_national_id": "1234567890123456",
  "patient_name": "John Doe",
  "gender": "male",
  "birth_date": "1990-01-01",
  "medical_record_number": "12345678",
  "ihs_number": "123456789",
  "registration_number": "RJ2025102300001"
}
```
- Behavior: Validates required fields (NIK, birth_date, gender, modality), generates accession number and stores unified payload in `accessions` table.
- Success response:
```json
{
  "id": "<uuid>",
  "accession_number": "CT.251022.000001",
  "issuer": "http://sys-ids.kemkes.go.id/acsn/1234567890123456|CT.251022.000001"
}
```
- **GET /api/accessions/:an**
- Path param `:an`: accession number.
- Response: accession details by number.

### POST /api/hooks/missing-acc
- Purpose: Receives internal hook calls to address missing accession scenarios.
- Body: hook-specific payload (implementation dependent).

### GET /internal/verify-accession
- Purpose: Internal verification endpoint for accession number integrity.

## Notes
- Used by SIMRS Bridge to pre-generate accession numbers for FHIR `ServiceRequest` identifiers.
- Database schema managed in `src/sql.ts`.
- See service env vars in compose: `ACCESSION_API_URL` and Accession API container settings.