
# SATUSEHAT DICOM Monitoring — Database Documentation (Unified v2+v3)
_Last updated: 2025-11-05 18:42:03 UTC_

Dokumen ini menjelaskan **alur**, **fungsi**, dan **cara pakai** dari skema database “All-in-One” untuk monitoring DICOM → NIDR/WADO → FHIR (**ServiceRequest**, **Encounter**, **ImagingStudy**) yang telah digabung dengan dukungan **S3 object storage** dan **backup ke S3**.

> DBMS: PostgreSQL 14+ (disarankan 15+). Gunakan UTC di semua `timestamptz`.

---

## 1. Gambaran Umum & Tujuan

### 1.1 Masalah yang diselesaikan
- Melacak status end‑to‑end dari pemeriksaan radiologi mulai dari **Order/Accession**, pembuatan **ServiceRequest** & **Encounter**, upload objek DICOM ke **NIDR/S3**, sampai POST **ImagingStudy** ke SATUSEHAT.
- Menyediakan **gating**: memastikan **SR** dan **Encounter** valid **sebelum** mengirim **ImagingStudy**.
- Observabilitas: **error, retry, SLA**, kapasitas **S3**, dan **backup database**.

### 1.2 Prinsip desain
- **Idempotent** (berbasis UID/Accession/UNIQUE key).
- **Auditability** (payload request/response disimpan).
- **Extensibility** (kolom fleksibel `jsonb` untuk metadata vendor/versi).
- **Compliance** (token & secret disimpan sebagai **referensi**).

---

## 2. Arsitektur & Alur End-to-End

```mermaid
flowchart LR
  A[Modality/PACS] -->|DICOM| B[Router/Collector]
  B -->|Parse Tags| C[(DB: patients/studies/series/instances)]
  C -->|Verify Accession| D[(orders)]
  D -->|Create SR| E[(satusehat_service_requests)]
  E -->|Link Encounter| F[(satusehat_encounters)]
  B -->|Upload DICOM| G[(object_stores/object_objects)] 
  G -->|NIDR Response (WADO)| H[(nidr_uploads + instances.wado_url)]
  H -->|Create ImagingStudy| I[(satusehat_imaging_studies)]
  I -->|FHIR POST| J[(fhir_transactions)]
  subgraph Monitoring
    K[(study_jobs)] --- L[(error_events)]
    L --- M[(retry_queue)]
    N[(audit_logs)]
    O[(system_health_log)]
    P[(backup_jobs)]
  end
```

**Ringkas alur:**
1) Modality/PACS kirim DICOM → Router parse tags → isi `patients/studies/series/instances`.
2) SIMRS/SIMPUS membuat **Order** (punya **AccessionNumber**).  
3) Buat **ServiceRequest** (SR), mirror Accession ke `sr_identifier_value`; referensikan **Encounter**.  
4) Upload DICOM → catat ke **S3** (`object_objects`) + respons NIDR (WADO).  
5) Setelah **SR** dan **Encounter** valid → **POST ImagingStudy** (gunakan WADO URL), catat transaksi & hasil.  
6) **study_jobs/error/retry** merekam pipeline, **views** bantu gating & SLA.

---

## 3. Model Data — Tabel & Fungsi (per modul)

### 3.1 Master & Konfigurasi
- **`orgs`**: organisasi/fasyankes (menyimpan `satusehat_org_id`).
- **`dicom_nodes`**: registry node DICOM (role, AE, host/port).
- **`api_credentials`, `api_tokens`**: kredensial & token (via **reference** ke secret manager).

### 3.2 Core Bisnis & Metadata DICOM
- **`orders`**: entri operasional, berisi **Accession** (`accession_no`), modality, prosedur, dll. **UNIQUE(org_id, accession_no)**.
- **`files`**: artefak file terkait order (PDF, ZIP, dsb). Kompatibel untuk `storage_path` “s3://...”. 
- **`dicom_metadata`**: ringkas info DICOM per file (Study/Series/SOP UID, accession, deskripsi).

### 3.3 FHIR: ServiceRequest, Encounter, ImagingStudy
- **`satusehat_service_requests`**: SR lifecycle + **identifier (Accession)**, **encounter_ref_id**, subject, code/category/bodySite, waktu (occurrence).
- **`satusehat_encounters`**: Encounter lifecycle (status/class/period/type, lokasi, peserta, reason), link opsional ke `orders` & `patients`.
- **`satusehat_imaging_studies`**: hasil POST ImagingStudy (request/response/wado), **back-link** ke SR & Encounter (opsional FK).

### 3.4 DICOM Hierarchy (granular tracking)
- **`patients`** → **`studies`** → **`series`** → **`instances`** (simpan UID, ukuran, `wado_url`, checksums).

### 3.5 Pipeline & Integrasi
- **`study_jobs`**: status pipeline **RECEIVED→...→COMPLETED**.
- **`nidr_uploads`**: batch upload ke NIDR (bytes, count, response).
- **`fhir_transactions`**: catat request/response FHIR (status HTTP, resource id).
- **`error_events`**, **`retry_queue`**, **`audit_logs`**: logging terstruktur, retry, dan jejak audit.

### 3.6 S3 Object Storage
- **`object_stores`**: definisi provider (`S3`/`MINIO`), bucket, region, endpoint, `credentials_ref`, KMS default.
- **`object_objects`**: objek S3 terkait `file_id`/`instance_id` (key, version, ETag, size, kelas storage, SSE/KMS, checksum).
- Opsional: **`object_replicas`**, **`object_restore_requests`**, **`object_retention`** (WORM/Legal Hold).

### 3.7 Backup Database ke S3
- **`backup_jobs`**: record `pg_dump`/`basebackup`/`wal_archive` → store, key, ukuran, checksum, state.

---

## 4. Relasi & Kunci Penting

- **Order ↔ Accession**: `orders.accession_no` adalah kunci operasional; dimirror ke `satusehat_service_requests.sr_identifier_value`.
- **Order ↔ SR ↔ Encounter**:  
  - SR menyimpan `encounter_ref_id` (string `"Encounter/{id}"`).  
  - Encounter disimpan penuh di `satusehat_encounters` (dengan `encounter_id`).  
- **Study/Series/Instance** → mapping UID: `studies.study_instance_uid`, `series.series_instance_uid`, `instances.sop_instance_uid`.
- **S3 objek** dapat terkait ke `files.file_id` **atau** `instances.id` (atau keduanya).  
- **ImagingStudy** back-link ke SR & Encounter untuk audit: `service_request_db_id`, `encounter_db_id` (opsional FK).

---

## 5. Indeks & Kinerja

### 5.1 Indeks inti
- `studies(org_id, accession_number)` dan `studies(org_id, study_instance_uid)` — korelasi cepat.
- `series(study_id)`, `instances(series_id)` — traversal cepat hirarki.
- `study_jobs(current_status)` — dashboard status.
- `transmission_queue(next_retry_at)` — pop item siap dijalankan.

### 5.2 FHIR & Gating
- SR: `idx_sr_order`, `idx_sr_id`, `idx_sr_identifier`, `idx_sr_enc_ref`.
- Encounter: `idx_enc_order`, `idx_enc_id`, `idx_enc_patient`, `idx_enc_period`.

### 5.3 S3 object storage
- `UNIQUE (store_id, object_key, coalesce(version_id,''))` — **idempoten** upload.
- `idx_obj_file`, `idx_obj_inst` — navigasi dari entitas UI.
- `idx_obj_store_key` — cari semua versi key.
- (Opsional) pencarian prefix/contains: `pg_trgm` + GIN `object_key gin_trgm_ops`.

### 5.4 Pertimbangan partisi (opsional)
- Tabel besar: `instances`, `satusehat_transmission_log`, `fhir_transactions`, `backup_jobs`.  
  Pertimbangkan **partisi per bulan** berdasarkan timestamp—tergantung volume.

---

## 6. Views & Kueri Monitoring

### 6.1 Kesiapan ImagingStudy (gating)
- **`v_order_prereq_status`** — status SR & Encounter per Order; plus flag ImagingStudy.
- **`v_orders_missing_prereq`** — masih ada SR **atau** Encounter yang belum OK.
- **`v_ready_for_imaging_study`** — SR **sent** & Encounter **in-progress/finished** & ImagingStudy **belum sent**.

**Contoh pakai:**
```sql
SELECT order_id, accession_no, modality
FROM v_ready_for_imaging_study
ORDER BY sr_last_created DESC
LIMIT 50;
```

### 6.2 SLA & Error
- **`v_study_sla`** — durasi detik dari `RECEIVED` → `COMPLETED`.  
- **`v_failed_studies`** — studi yang gagal di NIDR/FHIR/karantina.

### 6.3 S3 & Backup
- **`v_object_storage_summary`** — total objek & ukuran per store/bucket.
- **`v_orphaned_storage_objects`** — objek tanpa `file_id` & `instance_id` (potensi cleanup).
- **`v_backup_recent`** — 30 backup terakhir + store info.

---

## 7. Mapping FHIR & DICOM (ringkas)

### 7.1 ServiceRequest
- **Identifier**: `sr_identifier_value` ⇔ **AccessionNumber**.  
- **Encounter ref**: `encounter_ref_id` berformat `Encounter/{id}`.  
- **Subject**: `subject_ref_id` → `Patient/{id}`.  
- **Coding**: `category_codings`, `code_codings`, `body_site_codings`, `reason_codings` (array objek coding).  
- **Waktu**: `occurrence_start/end` sesuai jadwal pemeriksaan.

### 7.2 Encounter
- **Status/Class/Type**: `status`, `class_code/system`, `type_codings`.  
- **Period**: `period_start/end` (UTC).  
- **Lokasi & Partisipan**: `location_refs`, `participant_refs`.  
- **Reason**: `reason_codings`.

### 7.3 ImagingStudy
- **WADO URL**: isi dari NIDR (biasanya per-instance di `instances.wado_url`).  
- **Linking**: `service_request_db_id`, `encounter_db_id` opsional untuk audit penuh.

### 7.4 DICOM Tags (umum)
- Patient: `(0010,0020)`, `(0010,0010)`  
- Study: `(0020,000D)`, `(0008,0050)`, `(0008,0020/0030)`, `(0008,1030)`  
- Series: `(0020,000E)`, `(0008,0060)`, `(0008,103E)`  
- Instance: `(0008,0018)`

---

## 8. Operasional: Prosedur Harian

### 8.1 Proses standar
1) **Terima DICOM** → parse & simpan UID (gunakan `study_jobs` set `RECEIVED`).  
2) **Create SR** (berdasarkan Order/Accession) → `satusehat_service_requests` (status `sent` jika sukses).  
3) **Pastikan Encounter** ada & valid (`satusehat_encounters.status` in `in-progress/finished`).  
4) **Cek view `v_ready_for_imaging_study`** → jalankan POST ImagingStudy.  
5) **Catat transaksi** ke `fhir_transactions`, update `satusehat_imaging_studies.status='sent'`.  
6) Update `study_jobs.current_status='COMPLETED'` bila seluruh langkah ok.

### 8.2 Error & Retry
- Tulis error terstruktur ke `error_events` + antrikan ke `retry_queue` (`next_attempt_at`, `backoff_seconds`).  
- Boleh pakai *exponential backoff* & *idempotent check* (UID/Accession/UNIQUE).

### 8.3 Backup & Restore
- Jalankan backup (cron): insert `backup_jobs` (state `QUEUED`→`RUNNING`→`SUCCESS`).  
- Untuk objek S3: restore GLACIER via `object_restore_requests` (tier & status).  
- Terapkan kebijakan retensi di `object_retention` bila perlu (WORM/Legal Hold).

---

## 9. Keamanan & Kepatuhan
- **Token/kunci**: simpan sebagai **reference** (`credentials_ref`, `access_token_ref`) — bukan plaintext.  
- **PII**: batasi paparan data pasien; gunakan view/role untuk minimalisasi akses.  
- **Audit**: gunakan `audit_logs` untuk setiap perubahan penting (before/after).  
- **Timezone**: simpan UTC untuk konsistensi lintas sistem.

---

## 10. Performa & Skala
- Gunakan **indeks** yang direkomendasikan (lihat §5).  
- Pertimbangkan **partisi** tabel log besar berdasarkan tanggal.  
- Aktifkan `pg_trgm` hanya jika perlu pencarian teks bebas pada `object_key` besar.  
- Vacuum/Analyze rutin & monitor bloat.

---

## 11. Migrasi & Kompatibilitas
- Skema **idempotent**: aman untuk di-run berulang.  
- Untuk instalasi yang sudah memakai versi sebelumnya:
  - Jalankan `satusehat_dicom_monitor_schema_all_in_one.sql` – tidak akan merusak data eksisting.
  - Backfill Accession ke `sr_identifier_value` bila kolom SR lama belum terisi.
  - Isi `object_objects` berdasarkan `files.storage_path` (opsional) agar S3 terstruktur.

---

## 12. Contoh Kueri Penting

**Order yang belum memenuhi prasyarat SR/Encounter:**
```sql
SELECT order_id, accession_no, modality
FROM v_orders_missing_prereq
ORDER BY accession_no;
```

**Top error kode dari FHIR 24 jam terakhir:**
```sql
SELECT code, count(*) AS c
FROM error_events
WHERE occurred_at >= now() - interval '24 hours'
  AND component IN ('FHIR','NIDR')
GROUP BY code
ORDER BY c DESC
LIMIT 20;
```

**Penggunaan S3 per store (ringkas):**
```sql
SELECT * FROM v_object_storage_summary ORDER BY total_size_bytes DESC;
```

**Backup terakhir dan statusnya:**
```sql
SELECT started_at, state, object_key, size_bytes
FROM v_backup_recent;
```

---

## 13. Lampiran
- DDL All-in-One: `satusehat_dicom_monitor_schema_all_in_one.sql`
- Saran dashboard: 
  - Pipeline (counts per `study_jobs.current_status`), 
  - Gating (jumlah `v_ready_for_imaging_study` / `v_orders_missing_prereq`), 
  - Error rate (group by `component/code`), 
  - S3 usage (size per store/bucket), 
  - Backup status (last N jobs).

---

### FAQ Singkat
- **Apakah wajib simpan objek per-instance?** Tidak wajib; boleh per-file. Namun menyimpan per-instance memudahkan forensik WADO/UID.  
- **Apakah SR & Encounter harus dibuat dulu?** Ya, gunakan `v_ready_for_imaging_study` sebagai gate.  
- **Apakah skema ini bisa dipakai di MinIO?** Ya, set `object_stores.provider='MINIO'` dan isi `endpoint`.

