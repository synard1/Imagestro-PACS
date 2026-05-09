# Schema "satusehat_service_requests"

Sumber kebenaran:
- Dibuat oleh scripts/apply_satusehat_schema.py (tabel `satusehat_service_requests`).
- Menyimpan jejak sinkronisasi FHIR ServiceRequest ke SATUSEHAT per `order`.

Legend:
- Mode:
  - Input: dapat diisi oleh proses aplikasi (bukan langsung oleh client eksternal).
  - Output: dibaca/dikembalikan ke caller (monitoring/debug API).
  - Internal: diisi/diubah otomatis oleh backend/script; jangan diisi manual.
- Use:
  - SATUSEHAT: berhubungan langsung dengan integrasi FHIR/SATUSEHAT.
  - Audit: trace, debugging, monitoring pipeline.
- Sumber:
  - generate: dibentuk dari data order ketika akan kirim ServiceRequest.
  - sync: hasil dari response SATUSEHAT.
  - relation: foreign key ke tabel lain.
  - body: jika ada pengisian dari aplikasi internal (jarang dari klien publik).

---

- id
  - Mode: Internal, Output
  - Use: Audit, relasi
  - Sumber: generate (gen_random_uuid())

- order_id
  - Mode: Internal
  - Use: SATUSEHAT (link ke order), Audit
  - Sumber: relation (FK ke orders.id)
  - Catatan: Satu order dapat memiliki beberapa record ServiceRequest (retry/varian).

- service_request_id
  - Mode: Internal, Output
  - Use: SATUSEHAT, Audit
  - Sumber: sync (ID ServiceRequest dari SATUSEHAT)
  - Catatan: Referensi resource FHIR yang dibuat.

- status (sr_state: created/sent/failed)
  - Mode: Internal, Output
  - Use: SATUSEHAT, Audit
  - Sumber: generate/sync
  - Contoh:
    - created: payload disiapkan tapi belum sukses terkirim.
    - sent: berhasil dikirim/diterima.
    - failed: percobaan kirim gagal.

- request_payload (jsonb)
  - Mode: Internal, Output (read-only)
  - Use: SATUSEHAT, Audit
  - Sumber: generate (payload FHIR ServiceRequest yang dikirim)
  - Catatan: Untuk debugging apa yang dikirim.

- response (jsonb)
  - Mode: Internal, Output
  - Use: SATUSEHAT, Audit
  - Sumber: sync (response FHIR dari SATUSEHAT)
  - Catatan: Menyimpan body respons penuh.

- created_at
  - Mode: Internal, Output
  - Use: Audit
  - Sumber: generate (DEFAULT now())

- updated_at
  - Mode: Internal, Output
  - Use: Audit
  - Sumber: internal (update status/respons)

---

Enhanced FHIR alignment fields:

- sr_identifier_system
  - Mode: Internal, Output
  - Use: SATUSEHAT
  - Sumber: generate (mis. ACSN_SYSTEM_BASE/org)
  - Catatan: System untuk identifier ServiceRequest (berbasis accession).

- sr_identifier_value
  - Mode: Internal, Output
  - Use: SATUSEHAT
  - Sumber: generate (biasanya accession_number)
  - Catatan: Memudahkan lookup dan korelasi.

- subject_ref_type
  - Mode: Internal, Output
  - Use: SATUSEHAT
  - Sumber: generate/sync
  - Contoh: "Patient"

- subject_ref_id
  - Mode: Internal, Output
  - Use: SATUSEHAT
  - Sumber: generate/sync
  - Contoh: IHS/ID patient di SATUSEHAT.

- encounter_ref_id
  - Mode: Internal, Output
  - Use: SATUSEHAT
  - Sumber: body/sync (diambil dari order atau request sync)
  - Contoh: Encounter/<id>

- requester_ref_id
  - Mode: Internal, Output
  - Use: SATUSEHAT
  - Sumber: generate/body/sync
  - Contoh: Practitioner/Nxxxx, Organization/xxxx.

- intent
  - Mode: Internal, Output
  - Use: SATUSEHAT
  - Sumber: generate (mis. "order")

- priority
  - Mode: Internal, Output
  - Use: SATUSEHAT
  - Sumber: generate/body

- category_codings, code_codings, body_site_codings, reason_codings (jsonb)
  - Mode: Internal, Output
  - Use: SATUSEHAT
  - Sumber: generate/body
  - Catatan: Struktur coding FHIR (LOINC, SNOMED, dsb).

- occurrence_start, occurrence_end
  - Mode: Internal, Output
  - Use: SATUSEHAT
  - Sumber: generate/body
  - Catatan: Waktu tindakan direncanakan.

---

Additional extended fields:

- based_on_refs, replaces_refs (jsonb)
  - Mode: Internal, Output
  - Use: SATUSEHAT, Audit
  - Sumber: generate/body
  - Catatan: Referensi permintaan sebelumnya/berkaitan.

- requisition_system, requisition_value
  - Mode: Internal, Output
  - Use: SATUSEHAT
  - Sumber: generate/body
  - Catatan: Identifier requisition bila ada.

- authored_on
  - Mode: Internal, Output
  - Use: SATUSEHAT
  - Sumber: generate

- performer_type_coding (jsonb)
  - Mode: Internal, Output
  - Use: SATUSEHAT
  - Sumber: generate/body

- location_refs, reason_reference_refs, insurance_refs,
  supporting_info_refs, specimen_refs, relevant_history_refs (jsonb)
  - Mode: Internal, Output
  - Use: SATUSEHAT
  - Sumber: generate/body
  - Catatan: Menyimpan referensi lanjutan FHIR.

- note (jsonb)
  - Mode: Internal, Output
  - Use: SATUSEHAT, Audit
  - Sumber: generate/body
  - Catatan: Catatan klinis/operasional (misalnya dari clinical_notes).

- patient_instruction (text)
  - Mode: Internal, Output
  - Use: SATUSEHAT
  - Sumber: body/generate

---

Penggunaan praktis:

- Tabel ini tidak diisi langsung oleh SIMRS/user:
  - Diisi oleh service integrasi saat:
    - Menyusun payload ServiceRequest dari `orders`.
    - Mengirim ke SATUSEHAT.
    - Menyimpan respons (id, status, detail).
- Monitoring:
  - Dapat dibuat endpoint read-only untuk menampilkan history ServiceRequest per order.
  - Kombinasi dengan view `v_order_prereq_status` untuk cek prasyarat ImagingStudy.
