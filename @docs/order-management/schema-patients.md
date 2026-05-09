# Schema "patients" (Unified)

Sumber kebenaran:
- Dibuat oleh scripts/apply_satusehat_schema.py (tabel `patients`).
- Dipakai sebagai Master Patient untuk orders, studies, Encounter, dll.

Legend:
- Mode:
  - Input: dapat/diizinkan diisi dari proses upstream/ETL/admin tool.
  - Output: dikembalikan ke konsumen (service lain/UI).
  - Internal: dikelola otomatis, bukan input langsung dari client publik.
- Use:
  - SATUSEHAT: terkait identitas/relasi dengan SATUSEHAT/FHIR.
  - MWL: relevan ke DICOM / worklist.
  - Audit: pelacakan, konsistensi, integrasi internal.
- Sumber:
  - body: dari payload layanan internal/admin (bukan publik random).
  - sync: hasil sinkronisasi dengan SATUSEHAT atau sistem lain.
  - generate: diisi otomatis.
  - migrate: hasil migrasi/normalisasi.
  - relation: referensi ke tabel lain.

---

- id
  - Mode: Internal, Output
  - Use: Audit, relasi (orders, studies, encounters)
  - Sumber: generate (gen_random_uuid())

- org_id
  - Mode: Internal
  - Use: SATUSEHAT (org context), Audit, multi-tenant
  - Sumber: relation (satusehat_orgs)
  - Catatan: scope organisasi.

- patient_id_local
  - Mode: Input
  - Use: Audit, integrasi lokal
  - Sumber: body/migrate
  - Catatan: Local ID; UNIQUE per org_id.

- patient_name
  - Mode: Input
  - Use: SATUSEHAT (subjek), MWL, Audit
  - Sumber: body/sync/migrate

- birth_date
  - Mode: Input
  - Use: SATUSEHAT, MWL, Audit
  - Sumber: body/sync/migrate

- sex
  - Mode: Input
  - Use: MWL / kompat lama
  - Sumber: body/migrate
  - Catatan: Field lama; gunakan `gender` sebagai canonical.

- identifiers (jsonb)
  - Mode: Input, Internal
  - Use: Audit, integrasi kompleks
  - Sumber: body/sync/migrate
  - Catatan: Key-value identifiers lain.

- satusehat_patient_id
  - Mode: Input, Internal, Output
  - Use: SATUSEHAT
  - Sumber: sync (hasil dari SATUSEHAT) / body
  - Catatan: Legacy; canonical: ihs_number.

- patient_national_id
  - Mode: Input
  - Use: SATUSEHAT, Audit, dedupe
  - Sumber: body/sync/migrate
  - Catatan: NIK; UNIQUE.

- medical_record_number
  - Mode: Input
  - Use: Audit, referensi SIMRS
  - Sumber: body/migrate/sync

- ihs_number
  - Mode: Input, Internal, Output
  - Use: SATUSEHAT (IHS), Audit
  - Sumber: sync/migrate/body
  - Catatan: UNIQUE; identitas utama pasien di SATUSEHAT.

- gender
  - Mode: Input
  - Use: SATUSEHAT, MWL, Audit
  - Sumber: body/sync/migrate
  - Catatan: Enum (male/female/other/unknown).

- address
  - Mode: Input
  - Use: SATUSEHAT (opsional), Audit
  - Sumber: body/sync

- phone
  - Mode: Input
  - Use: Audit, kontak
  - Sumber: body/sync

- email
  - Mode: Input
  - Use: Audit, kontak
  - Sumber: body/sync

- nationality
  - Mode: Input
  - Use: Audit
  - Sumber: body/sync

- ethnicity
  - Mode: Input
  - Use: Audit
  - Sumber: body/sync

- religion
  - Mode: Input
  - Use: Audit
  - Sumber: body/sync

- marital_status
  - Mode: Input
  - Use: Audit
  - Sumber: body/sync
  - Catatan: Enum (single/married/divorced/widowed).

- occupation
  - Mode: Input
  - Use: Audit
  - Sumber: body/sync

- education_level
  - Mode: Input
  - Use: Audit
  - Sumber: body/sync

- emergency_contact_name
  - Mode: Input
  - Use: Audit
  - Sumber: body

- emergency_contact_phone
  - Mode: Input
  - Use: Audit
  - Sumber: body

- emergency_contact_relationship
  - Mode: Input
  - Use: Audit
  - Sumber: body

- insurance_provider
  - Mode: Input
  - Use: SATUSEHAT (supportingInfo), Audit
  - Sumber: body/sync

- insurance_policy_number
  - Mode: Input
  - Use: Audit
  - Sumber: body/sync

- insurance_member_id
  - Mode: Input
  - Use: Audit
  - Sumber: body/sync

- active
  - Mode: Internal, Output
  - Use: Audit, filter
  - Sumber: generate/body (by admin tools)
  - Catatan: Flag status pasien.

- created_at
  - Mode: Internal, Output
  - Use: Audit
  - Sumber: generate (DEFAULT now())

- updated_at
  - Mode: Internal, Output
  - Use: Audit
  - Sumber: internal update

- deleted_at
  - Mode: Internal, Output
  - Use: Audit
  - Sumber: internal (soft delete)

---

Tabel terkait (ringkas):

- patient_allergies / patient_medical_history / patient_family_history /
  patient_medications / patient_audit_log:
  - Fokus: detail klinis, riwayat, audit per pasien.
  - Mode: Internal/Input via admin/ETL.
  - Use: Audit, klinis internal; bisa jadi sumber supportingInfo FHIR.
