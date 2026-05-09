# Studies Page - User Guide

## Fitur CRUD Studies

### 1. Melihat Daftar Studies (Read)
- Semua studies ditampilkan dalam tabel
- Informasi yang ditampilkan:
  - Study Date/Time
  - Patient (Name & MRN)
  - Accession Number & Study UID
  - Modality (CT, MR, US, dll)
  - Jumlah Series

### 2. Filter & Pencarian
**Filter yang tersedia:**
- **Search Box**: Cari berdasarkan nama patient, MRN, accession number, atau deskripsi
- **Modality**: Filter berdasarkan jenis pemeriksaan (CT, MR, US, XA)
- **Date Range**: Filter berdasarkan tanggal (dari - sampai)
- **Reset Button**: Reset semua filter

**Cara menggunakan:**
1. Ketik kata kunci di search box
2. Pilih modality dari dropdown
3. Pilih tanggal dari dan sampai
4. Klik "Reset" untuk clear semua filter

### 3. Membuat Study Baru (Create)
**Langkah-langkah:**
1. Klik tombol **"➕ Add Study"** di kanan atas
2. Isi form yang muncul:
   - **Study Information**:
     - Study Date (tanggal pemeriksaan)
     - Study Time (waktu pemeriksaan)
     - Accession Number (nomor akses)
     - Description (deskripsi pemeriksaan)
     - Modality (jenis pemeriksaan)
     - Status (scheduled/in_progress/completed/cancelled)
   - **Patient Information**:
     - Patient Name (nama pasien)
     - MRN (Medical Record Number)
     - Birth Date (tanggal lahir)
3. Klik **"Create Study"** untuk simpan
4. Klik **"Cancel"** untuk batal

**Tips:**
- Accession number otomatis di-generate, tapi bisa diubah
- Pastikan semua field required terisi
- Study date default adalah hari ini

### 4. Melihat Detail Series
**Cara melihat series:**
1. Klik tombol **"▼"** di kolom Actions
2. Tabel series akan muncul di bawah study
3. Informasi series yang ditampilkan:
   - Series Number
   - Series UID
   - Modality
   - Description
   - Jumlah Instances
4. Klik **"▲"** untuk hide series

### 5. Mengedit Study (Update)
**Langkah-langkah:**
1. Klik tombol **"⋮ Actions"** pada study yang ingin diedit
2. Pilih **"✏️ Edit Study"** dari dropdown menu
3. Form edit akan muncul dengan data yang sudah terisi
4. Ubah data yang diperlukan
5. Klik **"Update Study"** untuk simpan perubahan
6. Klik **"Cancel"** untuk batal

**Yang bisa diedit:**
- Study date & time
- Accession number
- Description
- Modality
- Status
- Patient information (name, MRN, birth date)

### 6. Menghapus Study (Delete)
**Langkah-langkah:**
1. Klik tombol **"⋮ Actions"** pada study yang ingin dihapus
2. Pilih **"🗑️ Delete Study"** dari dropdown menu
3. Konfirmasi penghapusan di dialog yang muncul
4. Study akan dihapus dari daftar

**Peringatan:**
- Penghapusan bersifat permanen
- Pastikan study yang dihapus sudah benar
- Akan muncul konfirmasi sebelum dihapus

### 7. Membuka Viewer
**Cara membuka viewer:**
1. Klik tombol **"⋮ Actions"** pada study
2. Pilih **"👁️ Open Viewer"** dari dropdown menu
3. DICOM viewer akan terbuka (fitur dalam development)

## Fitur Auto-Scroll

### Apa itu Auto-Scroll?
Ketika Anda mengklik action button pada data di bagian bawah tabel, halaman akan otomatis scroll agar dropdown menu terlihat penuh.

### Cara Kerja:
1. **Klik action button** pada study di bagian bawah
2. **Halaman auto-scroll** dengan smooth animation
3. **Dropdown muncul** setelah scroll selesai
4. **Semua menu terlihat** tanpa perlu scroll manual

### Visual Feedback:
- Button menjadi semi-transparent saat scrolling
- Smooth scroll animation (tidak instant)
- Dropdown fade-in setelah scroll selesai

### Kapan Auto-Scroll Aktif?
- ✅ Ketika dropdown tidak cukup ruang di bawah
- ✅ Ketika study berada di bagian bawah tabel
- ❌ Tidak aktif jika sudah cukup ruang

## Tips & Tricks

### Pencarian Cepat
- Gunakan shortcut: Ketik langsung di search box
- Search bekerja real-time (tidak perlu enter)
- Bisa search multiple keywords

### Filter Kombinasi
- Kombinasikan search + modality + date range
- Hasil filter ditampilkan di "X result(s)"
- Reset untuk clear semua filter sekaligus

### Keyboard Shortcuts (Coming Soon)
- `Ctrl/Cmd + F` - Focus ke search box
- `Esc` - Close dropdown/modal
- `Enter` - Submit form

### Mobile Usage
- Tabel bisa di-scroll horizontal
- Dropdown tetap bekerja dengan touch
- Auto-scroll juga bekerja di mobile

## Storage Indicator

### Jenis Storage:
1. **💾 Browser Storage** - Data di localStorage browser
2. **📡 Server Storage** - Data di server dengan sync
3. **☁️ External API** - Data dari backend API

### Cara Melihat:
- Badge di sebelah judul "Studies"
- Hover untuk lihat deskripsi lengkap

## Troubleshooting

### Problem: Data tidak muncul
**Solution:**
- Refresh halaman (F5)
- Check filter, mungkin terlalu restrictive
- Check storage indicator, pastikan backend aktif

### Problem: Dropdown terpotong
**Solution:**
- Auto-scroll seharusnya handle ini
- Jika masih terpotong, scroll manual sedikit
- Report bug jika terjadi terus

### Problem: Form tidak bisa submit
**Solution:**
- Pastikan semua field required terisi
- Check format tanggal (YYYY-MM-DD)
- Check console untuk error message

### Problem: Edit/Delete tidak bekerja
**Solution:**
- Check apakah backend aktif
- Refresh halaman dan coba lagi
- Check network tab untuk error

## Best Practices

### Naming Convention
- **Accession Number**: Gunakan format konsisten (e.g., ACC-YYYY-XXXXX)
- **Description**: Jelas dan deskriptif
- **Patient Name**: Format: Nama Depan Nama Belakang

### Data Entry
- Isi semua field dengan lengkap
- Double-check patient information
- Gunakan modality yang sesuai
- Set status yang tepat

### Organization
- Gunakan filter untuk organize data
- Sort by date untuk lihat yang terbaru
- Expand series hanya saat perlu detail

## Keyboard & Mouse

### Mouse Actions
- **Single Click** - Select/Open
- **Hover** - Show tooltip
- **Right Click** - (Future: Context menu)

### Dropdown Menu
- **Click button** - Open dropdown
- **Click outside** - Close dropdown
- **Click menu item** - Execute action & close

## Notifications

### Success Messages
- ✅ "Study created successfully"
- ✅ "Study updated successfully"
- ✅ "Study deleted successfully"

### Error Messages
- ❌ "Failed to create study: [reason]"
- ❌ "Failed to update study: [reason]"
- ❌ "Failed to delete study: [reason]"

### Info Messages
- ℹ️ "Loading studies..."
- ℹ️ "X result(s) found"

## FAQ

**Q: Berapa banyak studies yang bisa ditampilkan?**
A: Tidak ada limit, semua studies akan ditampilkan. Gunakan filter untuk narrow down.

**Q: Apakah data tersimpan permanen?**
A: Tergantung storage mode. Browser storage hilang jika clear cache. Server storage permanen.

**Q: Bisa import DICOM files?**
A: Fitur upload DICOM sedang dalam development.

**Q: Bisa export data?**
A: Fitur export sedang dalam development.

**Q: Apakah ada limit file size?**
A: Tidak ada limit untuk metadata. DICOM files akan ada limit saat fitur upload ready.

## Support

Jika mengalami masalah atau ada pertanyaan:
1. Check dokumentasi ini
2. Check console untuk error messages
3. Report bug dengan screenshot
4. Contact support team

## Updates & Changelog

### Version 1.0 (Current)
- ✅ Full CRUD operations
- ✅ Filter & search
- ✅ Auto-scroll dropdown
- ✅ Series expansion
- ✅ Storage indicator

### Coming Soon
- 🔄 DICOM file upload
- 🔄 Viewer integration
- 🔄 Export functionality
- 🔄 Bulk operations
- 🔄 Advanced filters
