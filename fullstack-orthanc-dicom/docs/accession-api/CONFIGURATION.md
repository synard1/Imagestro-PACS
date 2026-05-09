# Konfigurasi Accession API

Dokumen ini menjelaskan semua opsi konfigurasi yang tersedia untuk Accession API.

## 📋 **Daftar Isi**

1. [Fitur Toggle Validasi](#fitur-toggle-validasi)
2. [Pattern Validasi](#pattern-validasi)
3. [Nilai Valid](#nilai-valid)
4. [Batasan Panjang](#batasan-panjang)
5. [Format dan Default](#format-dan-default)
6. [Pesan Error](#pesan-error)
7. [Contoh Penggunaan](#contoh-penggunaan)

## 🔧 **Fitur Toggle Validasi**

Anda dapat mengaktifkan/menonaktifkan validasi tertentu menggunakan environment variables:

| Variable | Default | Deskripsi |
|----------|---------|-----------|
| `ENABLE_IHS_VALIDATION` | `true` | **Validasi IHS Number** - Dapat dinonaktifkan untuk testing atau sistem legacy |
| `ENABLE_NIK_VALIDATION` | `true` | **Validasi NIK** - Dapat dinonaktifkan untuk testing |
| `ENABLE_BIRTHDATE_VALIDATION` | `true` | **Validasi Tanggal Lahir** - Format dan validasi masa depan |
| `ENABLE_MRN_VALIDATION` | `true` | **Validasi Medical Record Number** - Pattern dan panjang |
| `ENABLE_SEX_VALIDATION` | `true` | **Validasi Jenis Kelamin** - Nilai yang diizinkan |

### Contoh Penggunaan:
```bash
# Nonaktifkan validasi IHS Number untuk testing
ENABLE_IHS_VALIDATION=false

# Nonaktifkan validasi NIK untuk sistem legacy
ENABLE_NIK_VALIDATION=false
```

## 🔍 **Pattern Validasi**

Customize regex patterns untuk validasi field:

| Variable | Default | Deskripsi |
|----------|---------|-----------|
| `NIK_PATTERN` | `^\\d{16}$` | Pattern untuk NIK (16 digit angka) |
| `IHS_PATTERN` | `^P\\d{11}$` | Pattern untuk IHS Number (P + 11 digit) |
| `BIRTHDATE_PATTERN` | `^\\d{4}-\\d{2}-\\d{2}$` | Pattern untuk tanggal lahir (YYYY-MM-DD) |
| `MRN_PATTERN` | `^[a-zA-Z0-9\\-_]+$` | Pattern untuk Medical Record Number |

### Contoh Kustomisasi:
```bash
# Izinkan NIK dengan format berbeda (misal: dengan tanda hubung)
NIK_PATTERN=^\\d{2}-\\d{2}-\\d{2}-\\d{6}-\\d{4}$

# IHS Number dengan prefix berbeda
IHS_PATTERN=^IHS\\d{10}$
```

## ✅ **Nilai Valid**

Daftar nilai yang diizinkan untuk field tertentu:

| Variable | Default | Deskripsi |
|----------|---------|-----------|
| `VALID_MODALITIES` | `CT,MR,CR,DX,US,XA,RF,MG,NM,PT` | Modalitas DICOM yang diizinkan |
| `VALID_SEX_VALUES` | `male,female,other,unknown` | Nilai jenis kelamin sesuai FHIR |

### Contoh Kustomisasi:
```bash
# Tambah modalitas baru
VALID_MODALITIES=CT,MR,CR,DX,US,XA,RF,MG,NM,PT,ES,OT

# Batasi hanya male/female
VALID_SEX_VALUES=male,female
```

## 📏 **Batasan Panjang**

Konfigurasi batasan panjang untuk field:

| Variable | Default | Deskripsi |
|----------|---------|-----------|
| `MRN_MIN_LENGTH` | `1` | Panjang minimum Medical Record Number |
| `MRN_MAX_LENGTH` | `50` | Panjang maksimum Medical Record Number |

## 🎯 **Format dan Default**

Konfigurasi format dan nilai default:

| Variable | Default | Deskripsi |
|----------|---------|-----------|
| `SEQUENCE_PADDING` | `6` | Jumlah digit untuk padding nomor urut |
| `DEFAULT_STATION_AET` | `ORTHANC` | AET default untuk station |
| `DEFAULT_ACCESSION_STATUS` | `issued` | Status default untuk accession |

### Contoh:
```bash
# Gunakan padding 8 digit untuk nomor urut
SEQUENCE_PADDING=8

# Ganti station AET default
DEFAULT_STATION_AET=HOSPITAL_CT
```

## 💬 **Pesan Error**

Customize pesan error untuk setiap validasi:

| Variable | Deskripsi |
|----------|-----------|
| `ERROR_PATIENT_REQUIRED` | Pesan ketika data patient tidak ada |
| `ERROR_NIK_REQUIRED` | Pesan ketika NIK kosong |
| `ERROR_NIK_INVALID` | Pesan ketika format NIK salah |
| `ERROR_IHS_REQUIRED` | Pesan ketika IHS Number kosong |
| `ERROR_IHS_INVALID` | Pesan ketika format IHS Number salah |
| `ERROR_BIRTHDATE_INVALID` | Pesan ketika format tanggal lahir salah |
| `ERROR_BIRTHDATE_FUTURE` | Pesan ketika tanggal lahir di masa depan |
| `ERROR_MRN_INVALID` | Pesan ketika format MRN salah |
| `ERROR_MRN_LENGTH` | Pesan ketika panjang MRN tidak sesuai |
| `ERROR_SEX_INVALID` | Pesan ketika nilai sex tidak valid |
| `ERROR_MODALITY_REQUIRED` | Pesan ketika modality kosong |
| `ERROR_MODALITY_INVALID` | Pesan ketika modality tidak valid |
| `ERROR_SCHEDULED_AT_INVALID` | Pesan ketika format scheduled_at salah |

### Placeholder dalam Pesan Error:
- `{min}` dan `{max}` - untuk batasan panjang
- `{validValues}` - untuk daftar nilai valid
- `{validModalities}` - untuk daftar modalitas valid

## 🔄 **Field Mapping**

API mendukung fleksibilitas dalam penamaan field untuk kompatibilitas dengan berbagai sistem:

### **Tanggal Lahir (Birth Date)**
API menerima kedua format penamaan:
- `birthDate` (camelCase - FHIR standard)
- `birth_date` (snake_case - REST API convention)

**Contoh Request yang Valid:**

```json
// Menggunakan camelCase
{
  "patient": {
    "birthDate": "1990-01-01"
  }
}

// Menggunakan snake_case  
{
  "patient": {
    "birth_date": "1990-01-01"
  }
}
```

**Catatan:** Jika kedua field dikirim, `birthDate` akan diprioritaskan.

## 🆔 **UUID Primary Keys**

Tabel accessions sekarang menggunakan UUID sebagai primary key untuk future-proofing dan konsistensi dengan layanan lain dalam sistem.

### **Fitur:**

- **UUID Generation**: Generasi UUID otomatis menggunakan ekstensi PostgreSQL `uuid-ossp`
- **Backward Compatibility**: ID integer legacy dipertahankan dalam kolom `old_id`
- **API Response**: Accession baru menyertakan `id` (UUID) dan `accession_number`
- **Dual Access**: Accession dapat diambil menggunakan UUID atau accession number

### **API Endpoints:**

```bash
# Get accession by accession number (existing)
GET /api/accessions/{accession_number}

# Get accession by UUID (new)
GET /api/accessions/id/{uuid}
```

### **Format Response:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "accession_number": "CT.250120.001",
  "facility": {
    "code": "RSABC",
    "name": "Default Facility"
  }
}
```

## 🚀 **Contoh Penggunaan**

### 1. **Nonaktifkan Validasi IHS untuk Testing**
```bash
# .env
ENABLE_IHS_VALIDATION=false
```

### 2. **Konfigurasi untuk Rumah Sakit Khusus**
```bash
# .env
VALID_MODALITIES=CT,MR,US
DEFAULT_STATION_AET=RS_KHUSUS_CT
SEQUENCE_PADDING=8
MRN_MIN_LENGTH=5
MRN_MAX_LENGTH=20
```

### 3. **Kustomisasi Pesan Error dalam Bahasa Inggris**
```bash
# .env
ERROR_NIK_REQUIRED=Patient ID (NIK) is required
ERROR_IHS_REQUIRED=IHS Number is required for SATUSEHAT compliance
ERROR_BIRTHDATE_INVALID=Birth date must be in YYYY-MM-DD format
```

### 4. **Mode Development (Validasi Minimal)**
```bash
# .env
ENABLE_IHS_VALIDATION=false
ENABLE_NIK_VALIDATION=false
ENABLE_BIRTHDATE_VALIDATION=false
ENABLE_MRN_VALIDATION=false
ENABLE_SEX_VALIDATION=false
```

### 5. **Mode Production (Validasi Ketat)**
```bash
# .env
ENABLE_IHS_VALIDATION=true
ENABLE_NIK_VALIDATION=true
ENABLE_BIRTHDATE_VALIDATION=true
ENABLE_MRN_VALIDATION=true
ENABLE_SEX_VALIDATION=true
NIK_PATTERN=^\\d{16}$
IHS_PATTERN=^P\\d{11}$
```

## 📝 **Catatan Penting**

1. **Default Behavior**: Jika environment variable tidak diset, sistem akan menggunakan nilai default yang aman dan sesuai standar SATUSEHAT.

2. **Regex Escaping**: Untuk pattern regex, gunakan double backslash (`\\`) dalam file .env.

3. **Boolean Values**: Untuk feature toggles, gunakan `true` atau `false` (case-sensitive).

4. **Restart Required**: Perubahan konfigurasi memerlukan restart aplikasi.

5. **Validation Priority**: Meskipun validasi dinonaktifkan, field yang wajib (seperti patient.name) tetap akan divalidasi.

## 🔄 **Migration dari Hardcoded**

Jika Anda mengupgrade dari versi sebelumnya:

1. Copy file `.env.example` ke `.env`
2. Sesuaikan nilai sesuai kebutuhan
3. Restart aplikasi
4. Test semua endpoint untuk memastikan konfigurasi bekerja

## 🧪 **Testing Konfigurasi**

Untuk memverifikasi konfigurasi bekerja dengan benar:

```bash
# Test dengan IHS validation disabled
curl -X POST http://localhost:3000/api/accessions \
  -H "Content-Type: application/json" \
  -d '{
    "patient": {
      "id": "1234567890123456",
      "name": "Test Patient"
    },
    "modality": "CT"
  }'
```