# Schema "satusehat_imaging_studies"

Sumber kebenaran:
- Dibuat oleh scripts/apply_satusehat_schema.py.
- Menyimpan jejak/mapping ImagingStudy FHIR di SATUSEHAT terhadap:
  - orders
  - files (DICOM hasil)
  - konteks FHIR lain (ServiceRequest, Encounter, dsb).

Legend:
- Mode:
  - Input: diisi oleh proses aplikasi/pipeline (bukan user publik langsung).
  - Output: dibaca untuk monitoring/reporting.
  - Internal: dikelola otomatis; jangan diisi manual.
- Use:
  - SATUSEHAT: integrasi ImagingStudy.
  - Audit: trace, debugging, SLA.
- Sumber:
  - relation: foreign key / referensi antar tabel.
  - generate: dibuat dari konteks DICOM + orders.
  - sync: hasil call ke SATUSEHAT.
  - body: jika ada konfigurasi dari internal tools.

---

Kolom utama:

- id
  - Mode: Internal, Output
  - Use: Audit, relasi
  - Sumber: generate (gen_random_uuid())

- order_id
  - Mode: Internal
  - Use: SATUSEHAT, Audit
  - Sumber: relation (FK ke orders.id)
  - Catatan: Mengikat ImagingStudy ke order klinis.

- file_id
  - Mode: Internal
  - Use: Audit, link ke file DICOM
  - Sumber: relation (FK ke files.file_id)

- imaging_study_id
  - Mode: Internal, Output
  - Use: SATUSEHAT, Audit
  - Sumber: sync (ID resource ImagingStudy di SATUSEHAT)

- status (is_state: created/sent/failed)
  - Mode: Internal, Output
  - Use: SATUSEHAT, Audit
  - Sumber: generate/sync
  - Catatan: State pipeline ImagingStudy di SATUSEHAT.

- request_payload (jsonb)
  - Mode: Internal, Output
  - Use: SATUSEHAT, Audit
  - Sumber: generate
  - Catatan: Payload FHIR ImagingStudy yang dikirim.

- response (jsonb)
  - Mode: Internal, Output
  - Use: SATUSEHAT, Audit
  - Sumber: sync
  - Catatan: Response penuh dari SATUSEHAT.

- wado_url
  - Mode: Internal, Output
  - Use: SATUSEHAT, Audit
  - Sumber: generate/sync
  - Catatan: Link akses objek imaging (jika digunakan).

- created_at / updated_at
  - Mode: Internal, Output
  - Use: Audit
  - Sumber: generate / internal update

---

Field FHIR lanjutan (mapping detail ImagingStudy):

- service_request_db_id (uuid)
  - Mode: Internal
  - Use: SATUSEHAT, Audit
  - Sumber: relation (FK opsional ke satusehat_service_requests.id)
  - Catatan: Mengikat ImagingStudy dengan ServiceRequest terkait.

- started / ended
  - Mode: Internal, Output
  - Use: SATUSEHAT, Audit
  - Sumber: generate/body
  - Catatan: Waktu pelaksanaan studi.

- series_count / instance_count
  - Mode: Internal, Output
  - Use: Audit, SLA
  - Sumber: generate (dari DICOM/instances)

- modality_codings (jsonb)
  - Mode: Internal, Output
  - Use: SATUSEHAT
  - Sumber: generate
  - Catatan: Kode modality FHIR-compliant.

- subject_ref_type / subject_ref_id
  - Mode: Internal, Output
  - Use: SATUSEHAT
  - Sumber: generate/sync
  - Contoh: Patient/<ihs>.

- encounter_ref_id
  - Mode: Internal, Output
  - Use: SATUSEHAT
  - Sumber: generate/sync
  - Contoh: Encounter/<id>.

- based_on_refs (jsonb)
  - Mode: Internal, Output
  - Use: SATUSEHAT, Audit
  - Sumber: generate
  - Catatan: Referensi ke ServiceRequest terkait.

- referrer_ref_id, interpreter_ref_id
  - Mode: Internal, Output
  - Use: SATUSEHAT
  - Sumber: generate

- endpoint_refs, procedure_refs, reason_codings, note, description (jsonb/text)
  - Mode: Internal, Output
  - Use: SATUSEHAT, Audit
  - Sumber: generate/body
  - Catatan: Menyimpan atribut ImagingStudy yang lebih lengkap.

---

Penggunaan praktis:

- Diisi oleh pipeline setelah DICOM diterima & siap di-post sebagai ImagingStudy ke SATUSEHAT.
- Dipakai di monitoring:
  - Apakah untuk suatu `order_id` sudah ada ImagingStudy sent/failed.
  - Digunakan di view `v_order_prereq_status` dan `v_ready_for_imaging_study`.
