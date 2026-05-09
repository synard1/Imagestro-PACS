# Schema Index (SATUSEHAT DICOM Stack)

Dokumen ini menjadi index referensi skema untuk integrasi SATUSEHAT + DICOM di stack ini.
Seluruh schema dirancang agar:
- Konsisten dengan scripts/apply_satusehat_schema.py
- Sejalan dengan implementasi di order-management dan layanan terkait

Setiap dokumen menggunakan pola:
- Mode:
  - Input: boleh diisi dari request/external system (terkontrol).
  - Output: dikembalikan ke client/layanan lain.
  - Internal: hanya dikelola otomatis oleh sistem.
- Use:
  - SATUSEHAT: dipakai dalam integrasi FHIR/SATUSEHAT.
  - MWL: dipakai/di-mapping ke Modality Worklist / DICOM.
  - Audit: logging, monitoring, traceability.
- Sumber:
  - body / generate / sync / migrate / relation / heuristic.

Schema utama:

1) Orders
   - File: schema-orders.md
   - Peran:
     - Master order radiologi.
     - Sumber accession_number, kontekstual SATUSEHAT & MWL.
     - Terhubung ke patients, satusehat_service_requests, satusehat_imaging_studies, satusehat_encounters.
   - Catatan penting:
     - Kolom `order_source` digunakan untuk memonitor asal order:
       - Di-set otomatis oleh Order Management:
         - body.order_source
         - header X-Order-Source
         - atau heuristik (User-Agent / path)
       - Contoh nilai: simrs, pacs, api.
       - Dapat difilter via: GET /orders/list?source=simrs

2) Patients
   - File: schema-patients.md
   - Peran:
     - Master Patient Index (MPI) lokal.
     - Menyimpan identitas (NIK, MRN, IHS), demografi, kontak.
     - Direferensikan oleh orders, studies, encounters.

3) SATUSEHAT Service Requests
   - File: schema-satusehat_service_requests.md
   - Peran:
     - Log dan detail FHIR ServiceRequest per order.
     - Menyimpan payload, response, identifier, status sr_state.
     - Digunakan view v_order_prereq_status dan monitoring integrasi.

4) SATUSEHAT Imaging Studies
   - File: schema-satusehat_imaging_studies.md
   - Peran:
     - Mapping hasil DICOM (files/instances) ke FHIR ImagingStudy.
     - Menyimpan payload, response, wado_url, status is_state.
     - Mengikat order_id + file_id dengan resource ImagingStudy SATUSEHAT.

5) SATUSEHAT Encounters
   - File: schema-satusehat_encounters.md
   - Peran:
     - Representasi Encounter FHIR yang dikaitkan dengan order/patient.
     - Menjadi prasyarat untuk ServiceRequest dan ImagingStudy.
     - Dipakai di view v_order_prereq_status dan monitoring alur.

Rekomendasi:
- Gunakan file-file ini sebagai referensi tunggal ketika:
  - Menambah kolom skema terkait SATUSEHAT/DICOM.
  - Membuat dokumentasi untuk tim integrasi/SIMRS.
  - Menulis migrasi DB tambahan: selalu sinkronkan perubahan ke dokumen schema-*.
