# Schema Orders

Dokumen ini merangkum skema "orders" dan informasi terkait penggunaan kolom. Tujuannya adalah untuk memberikan panduan yang komprehensif, robust, production-ready, dan future-proof untuk pengelolaan skema order.

## Kolom

| Nama Kolom | Tipe Data | Input/Output/Internal | Digunakan di SATUSEHAT | Digunakan di MWL | Digunakan di Audit | Deskripsi | Contoh Nilai | Validasi | Keamanan | Skalabilitas & Perubahan di Masa Depan |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `id` | `UUID` | Output | Tidak | Tidak | Ya | ID unik yang dihasilkan sistem untuk setiap order. Digunakan sebagai primary key. | `a1b2c3d4-e5f6-7890-1234-567890abcdef` | UUID valid | Tidak relevan | Pertimbangkan UUID versi 4 untuk menghindari collision. |
| `org_id` | `VARCHAR(50)` | Input | Tidak | Tidak | Tidak | ID organisasi yang terkait dengan order. Digunakan untuk identifikasi organisasi di SATUSEHAT. | `100000001` | Alfanumerik, panjang maksimal 50 karakter | Validasi terhadap daftar organisasi yang terdaftar. | Pertimbangkan menggunakan UUID di masa depan untuk fleksibilitas. |
| `patient_id` | `UUID` | Internal | Tidak | Ya | Tidak | ID pasien yang terkait dengan order. Merupakan foreign key ke tabel `patients`. | `f1g2h3i4-j5k6-9123-4567-890123ghijklmn` | UUID valid, referensi ke tabel `patients` | Tidak relevan | Pastikan indeks pada kolom ini untuk performa query. | Pertimbangkan sharding tabel `patients` jika skala besar. |
| `order_number` | `VARCHAR(50)` | Output | Tidak | Tidak | Ya | Nomor order unik yang dihasilkan sistem. | `ORD2024010100001` | Alfanumerik, panjang maksimal 50 karakter, format yang konsisten | Pastikan keunikan nomor order. | Tidak relevan | Pertimbangkan format yang lebih fleksibel untuk mengakomodasi pertumbuhan. |
| `accession_number` | `VARCHAR(50)` | Output | Ya | Ya | Ya | Nomor aksesi unik yang dihasilkan oleh Accession API. | `ACC2024010100001` | Alfanumerik, panjang maksimal 50 karakter, format yang konsisten | Pastikan keunikan nomor aksesi. | Tidak relevan | Pertimbangkan format yang lebih fleksibel untuk mengakomodasi pertumbuhan. |
| `modality` | `VARCHAR(10)` | Input | Tidak | Ya | Ya | Modalitas pemeriksaan radiologi (CT, MRI, US, dll.). | `CT` | Enumerasi (CT, MRI, US, XR, dll.) | Validasi terhadap daftar modalitas yang diizinkan. | Tidak relevan | Gunakan tabel lookup untuk modalitas jika daftar bertambah besar. |
| `procedure_code` | `VARCHAR(50)` | Input | Ya | Ya | Ya | Kode prosedur pemeriksaan radiologi (LOINC atau kode lokal). | `71819-7` | Alfanumerik, panjang maksimal 50 karakter | Validasi terhadap standar kode prosedur yang digunakan. | Tidak relevan | Gunakan tabel lookup untuk kode prosedur jika standar berubah. |
| `procedure_name` | `VARCHAR(200)` | Input | Ya | Ya | Ya | Nama prosedur pemeriksaan radiologi. | `Computed tomography of chest` | String, panjang maksimal 200 karakter | Validasi terhadap daftar nama prosedur yang diizinkan. | Tidak relevan | Pertimbangkan internasionalisasi nama prosedur. |
| `loinc_code` | `VARCHAR(50)` | Input | Ya (sebelum sync SATUSEHAT) | Ya | Ya | Kode LOINC final untuk ServiceRequest SATUSEHAT. Boleh kosong saat create order awal, namun wajib terisi sebelum sync. | `24723-1` | Alfanumerik, panjang maksimal 50 karakter | Validasi terhadap daftar LOINC yang digunakan. | Tidak relevan | Pertimbangkan referensi ke tabel master LOINC untuk konsistensi. |
| `loinc_name` | `VARCHAR(200)` | Input | Ya (sebelum sync SATUSEHAT) | Ya | Ya | Nama/label display untuk kode LOINC. Bisa diisi otomatis dari prosedur, dapat diperbarui sebelum sync. | `CT Chest W Contrast` | String, panjang maksimal 200 karakter | Validasi panjang dan karakter khusus. | Tidak relevan | Pertimbangkan internasionalisasi label apabila dibutuhkan. |
| `referring_doctor` | `VARCHAR(200)` | Input | Tidak | Ya | Ya | Nama dokter yang merujuk pasien untuk pemeriksaan. | `Dr. John Doe` | String, panjang maksimal 200 karakter | Validasi terhadap format nama yang benar. | Tidak relevan | Pertimbangkan referensi ke tabel dokter untuk informasi yang lebih lengkap. |
| `attending_nurse` | `VARCHAR(200)` | Input | Tidak | Tidak | Tidak | Nama perawat yang bertugas saat pemeriksaan. | `Jane Smith` | String, panjang maksimal 200 karakter | Validasi terhadap format nama yang benar. | Tidak relevan | Pertimbangkan referensi ke tabel perawat untuk informasi yang lebih lengkap. |
| `scheduled_at` | `TIMESTAMPTZ` | Input | Tidak | Ya | Ya | Waktu pemeriksaan radiologi dijadwalkan. | `2024-01-01T10:00:00Z` | Format ISO 8601 UTC | Validasi terhadap rentang waktu yang diizinkan. | Tidak relevan | Pertimbangkan timezone yang berbeda. |
| `patient_national_id` | `VARCHAR(16)` | Input | Ya | Ya | Ya | Nomor Induk Kependudukan (NIK) pasien. | `1234567890123456` | Numerik, panjang 16 karakter | Validasi terhadap format NIK yang benar. | Enkripsi jika diperlukan oleh regulasi. | Pertimbangkan format ID nasional yang berbeda di masa depan. |
| `patient_name` | `VARCHAR(200)` | Input | Ya | Ya | Ya | Nama lengkap pasien. | `John Doe` | String, panjang maksimal 200 karakter | Validasi terhadap format nama yang benar. | Tidak relevan | Pertimbangkan internasionalisasi nama pasien. |
| `gender` | `VARCHAR(10)` | Input | Ya | Ya | Ya | Jenis kelamin pasien. | `Male` | Enumerasi (Male, Female, Other) | Validasi terhadap daftar jenis kelamin yang diizinkan. | Tidak relevan | Pertimbangkan opsi jenis kelamin yang lebih inklusif. |
| `birth_date` | `DATE` | Input | Ya | Ya | Ya | Tanggal lahir pasien. | `1990-01-01` | Format YYYY-MM-DD | Validasi terhadap rentang tanggal yang valid. | Tidak relevan | Pertimbangkan format tanggal yang berbeda. |
| `medical_record_number` | `VARCHAR(50)` | Input | Ya | Ya | Ya | Nomor rekam medis pasien. | `MRN12345` | Alfanumerik, panjang maksimal 50 karakter | Validasi terhadap format nomor rekam medis yang benar. | Enkripsi jika diperlukan oleh regulasi. | Pertimbangkan format nomor rekam medis yang berbeda di masa depan. |
| `satusehat_ihs_number` | `VARCHAR(64)` | Input/Internal | Ya | Tidak | Tidak | ID pasien di sistem SATUSEHAT (IHS Number). Bisa diinput atau diambil dari sistem SATUSEHAT. | `P1234567890` | Alfanumerik, panjang maksimal 64 karakter | Validasi terhadap format IHS Number yang benar. | Amankan akses ke sistem SATUSEHAT. | Pertimbangkan perubahan format IHS Number di masa depan. |
| `registration_number` | `VARCHAR(50)` | Input | Tidak | Tidak | Ya | Nomor registrasi pasien di sistem rumah sakit. | `REG20240101001` | Alfanumerik, panjang maksimal 50 karakter | Validasi terhadap format nomor registrasi yang benar. | Tidak relevan | Pertimbangkan format nomor registrasi yang berbeda di masa depan. |
| `status` | `VARCHAR(20)` | Internal | Tidak | Tidak | Ya | Status order secara umum (CREATED, DELETED). | `CREATED` | Enumerasi (CREATED, SCHEDULED, COMPLETED, DELETED, CANCELED) | Validasi terhadap daftar status yang diizinkan. | Tidak relevan | Pertimbangkan status yang lebih rinci di masa depan. |
| `created_at` | `TIMESTAMPTZ` | Internal | Tidak | Tidak | Ya | Waktu order dibuat di sistem. | `2024-01-01T00:00:00Z` | Format ISO 8601 UTC | Otomatis dihasilkan oleh sistem. | Tidak relevan | Pertimbangkan timezone yang berbeda. |
| `updated_at` | `TIMESTAMPTZ` | Internal | Tidak | Tidak | Ya | Waktu order terakhir diupdate. | `2024-01-01T00:00:00Z` | Format ISO 8601 UTC | Otomatis dihasilkan oleh sistem. | Tidak relevan | Pertimbangkan timezone yang berbeda. |
| `details` | `JSONB` | Internal | Tidak | Tidak | Ya | Detail tambahan terkait order dalam format JSON, digunakan untuk menyimpan informasi audit trail. | `{"created_by": "admin", "notes": "Order created"}` | JSON valid | Validasi terhadap skema JSON yang telah ditentukan. | Amankan data sensitif dalam JSON. | Pertimbangkan skema JSON yang lebih fleksibel di masa depan. |
| `procedure_description` | `TEXT` | Input | Tidak | Ya | Tidak | Deskripsi lengkap mengenai prosedur yang akan dilakukan. | `CT scan with contrast` | String, panjang tidak terbatas | Tidak ada validasi khusus. | Tidak relevan | Pertimbangkan batasan panjang jika diperlukan. |
| `patient_phone` | `VARCHAR(20)` | Input | Tidak | Tidak | Tidak | Nomor telepon pasien. | `+6281234567890` | String, panjang maksimal 20 karakter | Validasi terhadap format nomor telepon yang benar. | Enkripsi jika diperlukan oleh regulasi. | Pertimbangkan format nomor telepon yang berbeda di masa depan. |
| `patient_address` | `TEXT` | Input | Tidak | Tidak | Tidak | Alamat lengkap pasien. | `123 Main Street, Jakarta` | String, panjang tidak terbatas | Tidak ada validasi khusus. | Enkripsi jika diperlukan oleh regulasi. | Pertimbangkan format alamat yang berbeda di masa depan. |
| `order_status` | `VARCHAR(50)` | Internal | Tidak | Tidak | Ya | Status order yang lebih spesifik (SCHEDULED, SYNCED). | `SCHEDULED` | Enumerasi (CREATED, SCHEDULED, SYNCED, COMPLETED, etc.) | Validasi terhadap daftar status yang diizinkan. | Tidak relevan | Pertimbangkan status yang lebih rinci di masa depan. |
| `worklist_status` | `VARCHAR(50)` | Internal | Tidak | Tidak | Ya | Status pembuatan worklist (CREATED). | `CREATED` | Enumerasi (CREATED, FAILED, etc.) | Validasi terhadap daftar status yang diizinkan. | Tidak relevan | Pertimbangkan status yang lebih rinci di masa depan. |
| `imaging_status` | `VARCHAR(50)` | Internal | Tidak | Tidak | Tidak | Status proses imaging (belum diimplementasikan). | `IN_PROGRESS` | Enumerasi (NOT_STARTED, IN_PROGRESS, COMPLETED, etc.) | Validasi terhadap daftar status yang diizinkan. | Tidak relevan | Implementasikan status yang lebih rinci di masa depan. |
| `clinical_indication` | `TEXT` | Input | Tidak | Tidak | Tidak | Indikasi klinis pemeriksaan. | `Chest pain` | String, panjang tidak terbatas | Tidak ada validasi khusus. | Tidak relevan | Pertimbangkan batasan panjang jika diperlukan. |
| `clinical_notes` | `TEXT` | Input | Tidak | Tidak | Tidak | Catatan klinis tambahan. | `Patient reports shortness of breath` | String, panjang tidak terbatas | Tidak ada validasi khusus. | Tidak relevan | Pertimbangkan batasan panjang jika diperlukan. |
| `ordering_physician_name` | `VARCHAR(200)` | Input | Tidak | Ya | Ya | Nama lengkap dokter yang memesan pemeriksaan. | `Dr. Jane Smith` | String, panjang maksimal 200 karakter | Validasi terhadap format nama yang benar. | Tidak relevan | Pertimbangkan referensi ke tabel dokter untuk informasi yang lebih lengkap. |
| `performing_physician_name` | `VARCHAR(200)` | Input | Tidak | Tidak | Tidak | Nama lengkap dokter yang melakukan pemeriksaan. | `Dr. Peter Jones` | String, panjang maksimal 200 karakter | Validasi terhadap format nama yang benar. | Tidak relevan | Pertimbangkan referensi ke tabel dokter untuk informasi yang lebih lengkap. |
| `ordering_station_aet` | `VARCHAR(64)` | Input | Tidak | Ya | Ya | Application Entity Title (AET) dari stasiun kerja yang memesan pemeriksaan. | `RADIOLOGY_STATION` | Alfanumerik, panjang maksimal 64 karakter | Validasi terhadap daftar AET yang diizinkan. | Tidak relevan | Gunakan tabel lookup untuk AET jika daftar bertambah besar. |
| `satusehat_encounter_id` | `VARCHAR(100)` | Input/Internal | Ya | Tidak | Tidak | ID Encounter di sistem SATUSEHAT. | `1234567890` | Alfanumerik, panjang maksimal 100 karakter | Validasi terhadap format Encounter ID yang benar. | Amankan akses ke sistem SATUSEHAT. | Pertimbangkan perubahan format Encounter ID di masa depan. |
| `satusehat_service_request_id` | `VARCHAR(100)` | Internal | Ya | Tidak | Tidak | ID ServiceRequest yang dibuat di sistem SATUSEHAT. | `SR1234567890` | Alfanumerik, panjang maksimal 100 karakter | Otomatis dihasilkan oleh sistem. | Amankan akses ke sistem SATUSEHAT. | Pertimbangkan perubahan format ServiceRequest ID di masa depan. |
| `satusehat_synced` | `BOOLEAN` | Internal | Tidak | Tidak | Ya | Flag yang menandakan apakah order sudah disinkronkan ke SATUSEHAT atau belum. | `TRUE` | Boolean (TRUE, FALSE) | Otomatis dihasilkan oleh sistem. | Tidak relevan | Tidak ada perubahan yang diharapkan. |
| `satusehat_sync_date` | `TIMESTAMPTZ` | Internal | Tidak | Tidak | Ya | Waktu order berhasil disinkronkan ke SATUSEHAT. | `2024-01-01T00:00:00Z` | Format ISO 8601 UTC | Otomatis dihasilkan oleh sistem. | Tidak relevan | Pertimbangkan timezone yang berbeda. |

## Keterangan

*   **Input:** Kolom ini menerima data dari luar sistem (misalnya, dari UI atau API request). Validasi input sangat penting untuk mencegah data yang tidak valid masuk ke sistem.
*   **Output:** Kolom ini menghasilkan data yang diberikan ke luar sistem atau digunakan oleh sistem lain. Pastikan data yang dihasilkan sesuai dengan format dan standar yang diharapkan.
*   **Internal:** Kolom ini digunakan secara internal oleh sistem dan tidak diekspos secara langsung ke pengguna. Kolom internal harus dijaga keamanannya dan dioptimalkan untuk performa.
*   **SATUSEHAT:** Menunjukkan apakah kolom ini digunakan dalam proses integrasi dengan platform SATUSEHAT. Pastikan kolom ini sesuai dengan standar dan regulasi SATUSEHAT.
*   **MWL:** Menunjukkan apakah kolom ini digunakan dalam pembuatan Modality Worklist (MWL). Pastikan kolom ini sesuai dengan standar DICOM MWL.
*   **Audit:** Menunjukkan apakah kolom ini dicatat untuk keperluan audit dan pelacakan perubahan data. Data audit harus disimpan dengan aman dan dapat diakses untuk keperluan investigasi.

## Penanganan Perubahan Skema di Masa Depan

1.  **Versi Skema:** Pertimbangkan untuk menambahkan versi skema ke tabel `orders` atau menggunakan sistem migrasi database untuk melacak perubahan skema.
2.  **Kolom Opsional:** Gunakan kolom opsional (nullable) untuk mengakomodasi perubahan di masa depan.
3.  **Tabel Lookup:** Gunakan tabel lookup untuk data yang sering berubah atau memiliki nilai yang terbatas (misalnya, modalitas, kode prosedur).
4.  **JSONB:** Gunakan kolom `JSONB` untuk menyimpan data tambahan yang tidak terstruktur.

## Keamanan

1.  **Enkripsi:** Enkripsi data sensitif (misalnya, NIK, nomor rekam medis, nomor telepon) jika diperlukan oleh regulasi.
2.  **Akses Terbatas:** Batasi akses ke data hanya kepada pengguna yang berwenang.
3.  **Audit Trail:** Aktifkan audit trail untuk melacak semua perubahan data.

## Validasi

1.  **Validasi Tipe Data:** Pastikan tipe data yang benar digunakan untuk setiap kolom.
2.  **Validasi Format:** Validasi format data (misalnya, format tanggal, format nomor telepon).
3.  **Validasi Rentang:** Validasi rentang nilai yang diizinkan (misalnya, rentang usia).
4.  **Validasi Keunikan:** Pastikan kolom yang unik benar-benar unik.
5.  **Validasi Referensi:** Pastikan referensi ke tabel lain valid.

**Catatan:** Dokumen ini adalah panduan. Sesuaikan dengan kebutuhan spesifik dan regulasi yang berlaku.
