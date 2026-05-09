# Schema "satusehat_encounters"

Sumber kebenaran:
- Dibuat oleh scripts/apply_satusehat_schema.py (tabel `satusehat_encounters`).
- Menyimpan representasi Encounter FHIR yang terkait dengan:
  - patients
  - orders
  - alur pelayanan yang menjadi konteks ServiceRequest dan ImagingStudy.

Legend:
- Mode:
  - Input: diisi oleh service/pipeline (dari SATUSEHAT atau HIS).
  - Output: dibaca untuk monitoring dan korelasi.
  - Internal: dikelola otomatis; tidak diisi manual oleh klien publik.
- Use:
  - SATUSEHAT: mapping Encounter.
  - Audit: prasyarat dan jejak untuk ServiceRequest/ImagingStudy.
- Sumber:
  - relation: foreign key.
  - sync: hasil baca/response dari SATUSEHAT.
  - generate: dari alur internal jika membuat Encounter.
  - body: dari sistem HIS internal (jika diintegrasikan).

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
  - Catatan: Encounter terkait order spesifik (jika applicable).

- patient_id
  - Mode: Internal
  - Use: SATUSEHAT, Audit
  - Sumber: relation (FK ke patients.id)

- encounter_id
  - Mode: Internal, Output
  - Use: SATUSEHAT, Audit
  - Sumber: sync/generate
  - Catatan: ID Encounter di SATUSEHAT; UNIQUE.

- status
  - Mode: Internal, Output
  - Use: SATUSEHAT, Audit
  - Sumber: sync/generate
  - Nilai: planned/arrived/triaged/in-progress/onleave/finished/cancelled/entered-in-error/unknown
  - Catatan: Dipakai di v_order_prereq_status untuk cek readiness.

---

Field FHIR struktur:

- class_system, class_code, class_display
  - Mode: Internal, Output
  - Use: SATUSEHAT
  - Sumber: sync
  - Catatan: Encounter.class (rawat jalan/inap/dll).

- type_codings (jsonb)
- service_type_coding (jsonb)
- priority_coding (jsonb)
  - Mode: Internal, Output
  - Use: SATUSEHAT
  - Sumber: sync

- subject_ref_type, subject_ref_id
  - Mode: Internal, Output
  - Use: SATUSEHAT
  - Sumber: sync
  - Catatan: Biasanya Patient/<id>.

- episode_of_care_refs, based_on_refs (jsonb)
  - Mode: Internal, Output
  - Use: SATUSEHAT, Audit

- participant_refs, appointment_refs (jsonb)
  - Mode: Internal, Output
  - Use: SATUSEHAT

- period_start, period_end
  - Mode: Internal, Output
  - Use: SATUSEHAT, Audit
  - Sumber: sync
  - Catatan: Durasi encounter.

- length_value, length_unit/system/code
  - Mode: Internal, Output
  - Use: SATUSEHAT, SLA
  - Sumber: sync

- reason_codings, reason_reference_refs (jsonb)
  - Mode: Internal, Output
  - Use: SATUSEHAT

- diagnosis (jsonb)
  - Mode: Internal, Output
  - Use: SATUSEHAT

- account_refs (jsonb)
  - Mode: Internal, Output
  - Use: SATUSEHAT / billing context

- hospitalization (jsonb)
  - Mode: Internal, Output
  - Use: SATUSEHAT

- location_refs (jsonb)
  - Mode: Internal, Output
  - Use: SATUSEHAT

- service_provider_ref, part_of_ref (text)
  - Mode: Internal, Output
  - Use: SATUSEHAT

- request_payload (jsonb), response (jsonb)
  - Mode: Internal, Output
  - Use: SATUSEHAT, Audit
  - Sumber: generate/sync
  - Catatan: Jika sistem ini melakukan create/update Encounter ke SATUSEHAT.

- created_at, updated_at
  - Mode: Internal, Output
  - Use: Audit
  - Sumber: generate / internal update
  - Catatan: Timestamp otomatis saat record dibuat dan diupdate.

- created_by, updated_by
  - Mode: Internal, Output
  - Use: Audit
  - Sumber: relation (FK ke users.id)
  - Catatan: Menyimpan user ID yang melakukan create dan update terakhir.
    - created_by: set sekali saat record pertama kali dibuat
    - updated_by: diupdate setiap kali record diubah

- deleted_at, deleted_by
  - Mode: Internal, Output
  - Use: Audit, Soft Delete
  - Sumber: relation (FK ke users.id untuk deleted_by)
  - Catatan: Untuk soft delete functionality.
    - deleted_at: timestamp kapan record di-soft delete (NULL = tidak dihapus)
    - deleted_by: user yang melakukan soft delete
    - Record dengan deleted_at IS NOT NULL dianggap sudah dihapus

---

Penggunaan praktis:

- Tabel ini menghubungkan konteks kunjungan (Encounter) dengan order dan patient.
- Digunakan di view:
  - v_order_prereq_status
    - mengecek apakah Encounter valid (enc_ok).
  - v_ready_for_imaging_study
    - memastikan Encounter + ServiceRequest sudah siap sebelum ImagingStudy.
- Sebaiknya hanya diisi oleh:
  - proses integrasi SATUSEHAT,
  - sinkronisasi HIS/SIMRS yang terkontrol.
