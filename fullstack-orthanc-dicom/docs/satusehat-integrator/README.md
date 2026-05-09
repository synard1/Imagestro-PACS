SATUSEHAT Integrator (Bun)

Service ringan berbasis Bun untuk integrasi API SATUSEHAT pada alur DICOM Router.

Fitur:
- OAuth Client SATUSEHAT (client_credentials)
- FHIR client: pencarian ServiceRequest by AccessionNumber, Encounter by Subject
- Pembuatan Encounter minimal/advanced (identifier resmi dan serviceProvider)
- Pembuatan ImagingStudy minimal dengan basedOn → ServiceRequest
- Orkestrasi proses DICOM: ambil file dari Orthanc dan siapkan upload ke SATUSEHAT DICOM Store (placeholder)
- Logging semua request/response SATUSEHAT ke PostgreSQL (opsional)
- Penyimpanan token SATUSEHAT ke PostgreSQL (opsional)

Endpoint:
- GET `/health` → status
- GET `/satusehat/oauth/token` → akses token (debug)
- GET `/satusehat/servicerequest?subject=<id>` → pencarian generic (subject, encounter, identifier, dsb.)
- GET `/satusehat/servicerequest/<id>` → detail ServiceRequest by ID
- GET `/satusehat/servicerequest/search?subject=<id>&accessionNumber=<acsn>` → pencarian khusus img-accession-no
- GET `/satusehat/encounter?subject=<id>`
- GET `/satusehat/encounter/<id>`
- GET `/satusehat/patient?identifier=https://fhir.kemkes.go.id/id/nik|9271060312000001`
- GET `/satusehat/patient/<id>`
- POST `/satusehat/imagingstudy` → { patientId, serviceRequestId, accessionNumber? }
- POST `/satusehat/dicom/process` → { subjectId, accessionNumber, patientId?, orthancInstanceId?|filePath? }

Konfigurasi env (contoh di `.env.example`):
- `SATUSEHAT_URL` (atau `SATUSEHAT_BASE`), `FHIR_BASE`, `OAUTH_PATH`, `CLIENT_ID`, `CLIENT_SECRET`, `ORG_ID` (atau `ORG_IHS`)
- `ACSN_SYSTEM_BASE`, `IMG_ACSN_SYSTEM`, `ENCOUNTER_SYSTEM_BASE`
- `ORTHANC_URL`, `ORTHANC_USERNAME`, `ORTHANC_PASSWORD`
- Database logging (opsional): `DATABASE_URL` atau `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`

Catatan:
- Upload ke SATUSEHAT DICOM Store belum diimplementasikan karena endpoint detail tidak tersedia di repo. Endpoint placeholder mengembalikan 501.
- Jika konfigurasi database tidak diset, logging SATUSEHAT akan otomatis di-skip. Jika diset, service akan membuat tabel `satusehat_http_logs` secara otomatis saat pertama kali digunakan.
- Alur ServiceRequest mengikuti dokumentasi resmi (identifier `img-accession-no`). Jika memakai sistem `accessionno/{ORG}`, update env `IMG_ACSN_SYSTEM` sesuai kebutuhan.
- [Dokumentasi Penyimpanan Token](TOKEN_STORAGE.md) - Informasi tentang penyimpanan token SATUSEHAT di database