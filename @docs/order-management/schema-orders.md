# Schema "orders" (Unified)

Single source of truth untuk tabel `orders` sebagaimana dibentuk oleh:
- scripts/apply_satusehat_schema.py (align_orders_table)
- order-management/order_management_service.py

Catatan umum:
- Operasi utama yang menggunakan schema ini:
  - create_order_unified (/orders/create, /orders/complete-flow)
  - sync_to_satusehat (/orders/<id>/sync-satusehat)
  - create_worklist_from_order (/orders/<id>/create-worklist)
  - list/get/update/delete/purge
- Soft-delete: menggunakan kolom `status` + `details.deleted`.
- Jangan mengubah schema manual di luar script/schema ini.

Legend per kolom:
- Mode:
  - Input: dapat/diizinkan dikirim oleh client API (request).
  - Output: dikembalikan di response API.
  - Internal: diisi/diubah otomatis oleh sistem (jangan diisi manual).
- Use (bisa lebih dari satu):
  - SATUSEHAT: dipakai langsung untuk integrasi SATUSEHAT/FHIR.
  - MWL: dipakai langsung/di-mapping ke Modality Worklist/DICOM.
  - Audit: untuk jejak log, monitoring, atau referensi internal.
- Sumber (utama):
  - body: nilai datang dari body request client.
  - sync: nilai hasil proses sync ke SATUSEHAT / eksternal.
  - generate: nilai digenerate oleh order-management / script schema.
  - migrate: nilai hasil normalisasi/migrasi schema.
  - relation: nilai dari relasi tabel lain.
  - heuristic: nilai hasil deteksi otomatis (mis. dari header/User-Agent/path).

---

- id
  - Mode: Output, Internal
  - Use: Audit, relasi
  - Sumber: generate
  - Catatan: PK. Identitas utama order.

- org_id
  - Mode: Internal
  - Use: SATUSEHAT (konteks organisasi), Audit, relasi
  - Sumber: generate/relation
  - Catatan: Jangan diisi manual via API OM.

- patient_id
  - Mode: Internal
  - Use: Audit, relasi ke patients
  - Sumber: relation (ensure_patient_record)

- order_number
  - Mode: Output, Internal
  - Use: Audit, referensi bisnis lokal
  - Sumber: generate

- accession_number
  - Mode: Input (opsional), Output, Internal
  - Use: SATUSEHAT, MWL, Audit
  - Sumber: body/generate/sync

- modality
  - Mode: Input
  - Use: MWL, SATUSEHAT (konteks), Audit
  - Sumber: body

- procedure_code
  - Mode: Input
  - Use: SATUSEHAT, Audit
  - Sumber: body

- procedure_name
  - Mode: Input
  - Use: MWL, Audit
  - Sumber: body/migrate

- procedure_description
  - Mode: Input
  - Use: MWL, Audit
  - Sumber: body

- referring_doctor
  - Mode: Input
  - Use: Audit
  - Sumber: body (normalisasi dari referring_physician)

- attending_nurse
  - Mode: Input
  - Use: Audit
  - Sumber: body

- ordering_physician_name
  - Mode: Input (update/migrasi), Internal
  - Use: MWL, Audit
  - Sumber: body/migrate

- performing_physician_name
  - Mode: Input
  - Use: Audit
  - Sumber: body

- ordering_station_aet
  - Mode: Input (update/migrasi), Internal
  - Use: MWL, Audit
  - Sumber: body/migrate

- scheduled_at
  - Mode: Input
  - Use: MWL, Audit
  - Sumber: body

- worklist_status
  - Mode: Internal, Output
  - Use: MWL, Audit
  - Sumber: internal

- imaging_status
  - Mode: Internal, Output
  - Use: Audit
  - Sumber: internal

- patient_national_id
  - Mode: Input
  - Use: SATUSEHAT, MWL, Audit
  - Sumber: body/migrate

- medical_record_number
  - Mode: Input
  - Use: Audit, dedupe
  - Sumber: body

- patient_name
  - Mode: Input
  - Use: SATUSEHAT, MWL, Audit
  - Sumber: body

- gender
  - Mode: Input
  - Use: SATUSEHAT, MWL, Audit
  - Sumber: body

- birth_date
  - Mode: Input
  - Use: SATUSEHAT, MWL, Audit
  - Sumber: body

- patient_phone
  - Mode: Input
  - Use: Audit
  - Sumber: body

- patient_address
  - Mode: Input
  - Use: Audit
  - Sumber: body

- satusehat_ihs_number
  - Mode: Input (opsional), Internal, Output
  - Use: SATUSEHAT, Audit
  - Sumber: body/sync/migrate

- registration_number
  - Mode: Input
  - Use: Audit, dedupe
  - Sumber: body

- satusehat_encounter_id
  - Mode: Input (sync), Internal, Output
  - Use: SATUSEHAT, Audit
  - Sumber: body/sync

- satusehat_service_request_id
  - Mode: Internal, Output
  - Use: SATUSEHAT, Audit
  - Sumber: sync

- satusehat_synced
  - Mode: Internal, Output
  - Use: SATUSEHAT, Audit
  - Sumber: sync

- satusehat_sync_date
  - Mode: Internal, Output
  - Use: SATUSEHAT, Audit
  - Sumber: sync

- clinical_indication
  - Mode: Input
  - Use: SATUSEHAT (note), Audit
  - Sumber: body

- clinical_notes
  - Mode: Input
  - Use: SATUSEHAT (note), Audit
  - Sumber: body

- status
  - Mode: Internal, Output
  - Use: Audit
  - Sumber: internal

- order_status
  - Mode: Internal, Output
  - Use: SATUSEHAT/MWL/Audit
  - Sumber: internal

- created_at
  - Mode: Internal, Output
  - Use: Audit
  - Sumber: internal

- updated_at
  - Mode: Internal, Output
  - Use: Audit
  - Sumber: internal

- order_source
  - Mode: Input terbatas, Internal, Output
  - Use: Audit, monitoring sumber data
  - Sumber:
    - body.order_source (jika ada),
    - header X-Order-Source (jika ada),
    - heuristic (User-Agent, path complete-flow/create → "api", dsb).
  - Nilai umum:
    - "simrs": order dari SIMRS / UI SIMRS,
    - "pacs": order dari PACS / router / DICOM sisi perangkat,
    - "api": default dari API Gateway / integrasi lain.
  - Catatan:
    - Dipakai untuk filter ?source= di /orders/list.
    - Di-set otomatis oleh `resolve_order_source`; client boleh override secara eksplisit jika trusted.

- details
  - Mode: Internal, Output (read-only)
  - Use: Audit
  - Sumber: internal (ensure_audit_structure)
  - Catatan: menyimpan created/updated/deleted metadata.

---

Catatan implementasi penting tambahan:

- order_source:
  - Ditambahkan ke schema via init_database:
    - ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_source VARCHAR(50)
  - Diisi di create_order_unified.
  - Tersedia di:
    - response create_order,
    - /orders/list,
    - /orders/all,
    - /orders/all/details,
    - /orders/<id>.
  - Filter:
    - /orders/list?source=simrs
    - /orders/list?source=pacs
    - /orders/list?source=api

- Protected fields (tidak boleh di-update via PUT /orders/<id>):
  - id, order_number, accession_number, created_at, updated_at, satusehat_service_request_id.
  - order_source saat ini tidak diblok eksplisit melalui PUT; jika ingin dibuat read-only penuh, kita bisa tambahkan ke set protected_fields.
