# DICOM Cleanup Scripts

Scripts untuk membersihkan data DICOM yang tidak digunakan (orphaned) dari database dan storage.

## 📋 Table of Contents

- [Overview](#overview)
- [Scripts Available](#scripts-available)
- [Quick Start](#quick-start)
- [Detailed Usage](#detailed-usage)
- [What Gets Deleted](#what-gets-deleted)
- [Safety Features](#safety-features)
- [Troubleshooting](#troubleshooting)

---

## Overview

DICOM cleanup scripts ini dirancang untuk:
- **Menemukan** DICOM files dan studies yang tidak terhubung ke worklist manapun
- **Menghapus** data orphaned dari database (dicom_files, pacs_studies, series, instances)
- **Menghapus** file fisik dari storage (`/var/lib/pacs/storage/`)
- **Mencegah** disk penuh akibat data yang tidak terpakai

### Kapan Harus Menjalankan Cleanup?

✅ **Jalankan cleanup jika:**
- Storage disk usage tinggi (>80%)
- Banyak data test/dummy yang perlu dibersihkan
- Setelah migrasi atau import data yang gagal
- Maintenance rutin (misalnya setiap bulan)

❌ **JANGAN jalankan cleanup jika:**
- Ada proses upload DICOM yang sedang berjalan
- Anda belum yakin data mana yang orphaned
- Belum menjalankan `preview` mode terlebih dahulu

---

## Scripts Available

### 1. **cleanup_orphaned_dicom.py** (Python Script)
**Location:** `pacs-service/scripts/cleanup_orphaned_dicom.py`

Python script utama yang melakukan cleanup.

**Features:**
- Dry-run mode (preview tanpa menghapus)
- Execute mode (hapus dengan konfirmasi)
- Force mode (hapus tanpa konfirmasi)
- Detailed statistics dan error reporting

### 2. **cleanup-orphaned-dicom.sh** (Bash Wrapper)
**Location:** `/home/apps/full-pacs/cleanup-orphaned-dicom.sh`

Bash wrapper untuk menjalankan Python script di dalam Docker container.

**Features:**
- User-friendly interface
- Container health check
- Color-coded output
- Multiple run modes

### 3. **find_orphaned_dicom.sql** (SQL Queries)
**Location:** `pacs-service/scripts/find_orphaned_dicom.sql`

SQL queries untuk manual inspection.

**Features:**
- Find orphaned DICOM files
- Find orphaned studies
- Find files with invalid paths
- Find soft-deleted studies
- Statistics dan recommendations

---

## Quick Start

### Method 1: Using Bash Wrapper (Recommended)

```bash
cd /home/apps/full-pacs

# 1. Preview apa yang akan dihapus (AMAN - tidak menghapus apapun)
./cleanup-orphaned-dicom.sh preview

# 2. Hapus data orphaned (dengan konfirmasi)
./cleanup-orphaned-dicom.sh delete

# 3. Hapus tanpa konfirmasi (HATI-HATI!)
./cleanup-orphaned-dicom.sh force
```

### Method 2: Using Docker Exec

```bash
# Preview mode
docker exec pacs-service python /app/scripts/cleanup_orphaned_dicom.py --dry-run

# Execute mode (with confirmation)
docker exec -it pacs-service python /app/scripts/cleanup_orphaned_dicom.py --execute

# Force mode (no confirmation - DANGEROUS!)
docker exec -it pacs-service python /app/scripts/cleanup_orphaned_dicom.py --execute --force
```

### Method 3: Using SQL (Manual)

```bash
# Run SQL queries untuk investigation
docker exec -e PGPASSWORD="dicom2024!@#" dicom-postgres-secured \
  psql -U dicom -d worklist_db -f /path/to/find_orphaned_dicom.sql
```

---

## Detailed Usage

### Preview Mode (Dry-Run) - RECOMMENDED FIRST STEP

**Purpose:** Lihat apa yang akan dihapus tanpa benar-benar menghapus.

```bash
./cleanup-orphaned-dicom.sh preview
```

**Output Example:**
```
================================================================================
ORPHANED DICOM DATA SUMMARY
================================================================================

📁 DICOM Files (not linked to any worklist): 15

Sample (first 10):
  1. Patient: John Doe             | Size: 2.50 MB | Created: 2025-11-20 10:30:15
     Path: /var/lib/pacs/storage/dicom/uploads/20251120_103015_abc123.dcm
  ...

📊 Studies (not linked to any worklist): 5

Sample (first 10):
  1. Patient: Jane Smith           | Modality: CT    | Date: 2025-11-19
  ...

💾 Total orphaned file size: 45.20 MB (0.04 GB)
================================================================================

💡 This was a DRY RUN. No data was actually deleted.
```

### Delete Mode (With Confirmation)

**Purpose:** Hapus data orphaned dengan konfirmasi manual.

```bash
./cleanup-orphaned-dicom.sh delete
```

**You will be asked:**
```
⚠️  WARNING: About to DELETE 20 items (PERMANENT!)
   - This action CANNOT be undone
   - Physical files will be removed from disk

Type 'DELETE' to confirm:
```

Type `DELETE` (all caps) to proceed, atau cancel dengan Ctrl+C.

### Force Mode (No Confirmation) - DANGEROUS!

**Purpose:** Hapus langsung tanpa konfirmasi (untuk automation/cron jobs).

```bash
./cleanup-orphaned-dicom.sh force
```

**⚠️ WARNING:** Mode ini akan langsung menghapus tanpa konfirmasi!

---

## What Gets Deleted

### 1. Orphaned DICOM Files

**Criteria:** Files di `dicom_files` table yang tidak terhubung ke `worklist_items` manapun.

**Includes:**
- Database record di `dicom_files` table
- Physical file di storage path (e.g., `/var/lib/pacs/storage/dicom/uploads/`)

**Query Logic:**
```sql
SELECT df.*
FROM dicom_files df
LEFT JOIN worklist_items wi ON wi.study_instance_uid = df.study_id
WHERE wi.id IS NULL
```

### 2. Orphaned Studies

**Criteria:** Studies di `pacs_studies` table yang tidak terhubung ke `worklist_items` manapun.

**Includes:**
- Study record di `pacs_studies` table
- Related series di `pacs_series` table (CASCADE delete via FK constraint)
- Related instances di `pacs_instances` table (CASCADE delete via FK constraint)

**Query Logic:**
```sql
-- Find orphaned studies
SELECT ps.*
FROM pacs_studies ps
LEFT JOIN worklist_items wi ON wi.study_instance_uid = ps.study_instance_uid
WHERE wi.id IS NULL AND ps.deleted_at IS NULL;

-- Delete cascade (automatic via FK constraints)
DELETE FROM pacs_studies WHERE study_instance_uid = '<study_uid>';
-- This will automatically CASCADE delete from:
--   - pacs_series (via FK: study_instance_uid)
--   - pacs_instances (via FK: series_instance_uid)
```

**Database Schema:**
```
pacs_studies (parent)
  └── pacs_series (child - CASCADE DELETE)
      └── pacs_instances (grandchild - CASCADE DELETE)
```

### 3. Files with Invalid Paths (Bonus)

Script juga akan cleanup files dengan path lama/invalid:
- `/data/dicom-storage/...` (old path format)
- Missing physical files

---

## Safety Features

### ✅ Built-in Safety Mechanisms

1. **Dry-Run by Default**
   - Script memerlukan explicit `--execute` flag untuk menghapus
   - Default mode adalah `--dry-run` (preview only)

2. **Manual Confirmation**
   - User harus mengetik `DELETE` (all caps) untuk konfirmasi
   - Tidak bisa di-bypass kecuali menggunakan `--force`

3. **Detailed Preview**
   - Menampilkan sample data yang akan dihapus
   - Total size dan count
   - File paths untuk verification

4. **Transaction Safety**
   - Database operations menggunakan transactions
   - Automatic rollback jika error
   - All-or-nothing deletion per file

5. **Error Tracking**
   - Melacak semua errors yang terjadi
   - Menampilkan error summary di akhir
   - Continue on error (tidak stop di error pertama)

6. **Container Health Check**
   - Bash wrapper memeriksa container status sebelum run
   - Memastikan script tersedia di container

### ⚠️ Important Warnings

- **PERMANENT DELETION:** Data yang dihapus tidak bisa di-restore
- **PHYSICAL FILES:** File fisik akan dihapus dari disk
- **NO UNDO:** Tidak ada undo/rollback untuk file deletion
- **BACKUP FIRST:** Selalu backup database sebelum cleanup besar

---

## Workflow Recommended

### Best Practice Workflow:

```bash
# Step 1: Preview apa yang akan dihapus
./cleanup-orphaned-dicom.sh preview

# Step 2: Review output, pastikan data yang akan dihapus memang orphaned

# Step 3: (Optional) Backup database
docker exec dicom-postgres-secured pg_dump -U dicom worklist_db > backup_before_cleanup_$(date +%Y%m%d).sql

# Step 4: Jalankan cleanup dengan konfirmasi
./cleanup-orphaned-dicom.sh delete

# Step 5: Verify hasil cleanup
docker exec -e PGPASSWORD="dicom2024!@#" dicom-postgres-secured \
  psql -U dicom -d worklist_db -c "SELECT COUNT(*) FROM dicom_files;"
```

---

## Troubleshooting

### Problem: "Container is not running"

**Solution:**
```bash
docker ps | grep pacs-service
docker start pacs-service
```

### Problem: "Script not found in container"

**Solution:**
```bash
# Copy script to container
docker cp pacs-service/scripts/cleanup_orphaned_dicom.py pacs-service:/app/scripts/
docker exec pacs-service chmod +x /app/scripts/cleanup_orphaned_dicom.py
```

### Problem: "Database connection failed"

**Solution:**
```bash
# Check database container
docker ps | grep postgres

# Check environment variables
docker exec pacs-service env | grep DB_
```

### Problem: "Permission denied" saat hapus file

**Solution:**
```bash
# Check file permissions
docker exec pacs-service ls -la /var/lib/pacs/storage/

# Run with proper permissions (if needed)
docker exec -u root pacs-service python /app/scripts/cleanup_orphaned_dicom.py --dry-run
```

### Problem: False positives (data yang seharusnya tidak dihapus)

**Solution:**
- Review query logic di script
- Check apakah worklist-dicom linking sudah benar
- Jalankan SQL investigation queries secara manual
- Report bug jika ada masalah dengan query

---

## Automation (Cron Job)

### Setup Automatic Monthly Cleanup

**Create cron job:**
```bash
crontab -e
```

**Add this line:**
```cron
# Cleanup orphaned DICOM data setiap tanggal 1 jam 2 pagi
0 2 1 * * /home/apps/full-pacs/cleanup-orphaned-dicom.sh force >> /var/log/dicom-cleanup.log 2>&1
```

**⚠️ WARNING:** Gunakan `force` mode hanya jika Anda yakin cleanup aman dilakukan otomatis!

**Safer option with manual review:**
```cron
# Generate report setiap minggu, review manual sebelum cleanup
0 2 * * 1 /home/apps/full-pacs/cleanup-orphaned-dicom.sh preview >> /var/log/dicom-cleanup-report.log 2>&1
```

---

## SQL Investigation Queries

Untuk manual investigation, gunakan queries di `find_orphaned_dicom.sql`:

```bash
# Run all queries
docker exec -e PGPASSWORD="dicom2024!@#" dicom-postgres-secured \
  psql -U dicom -d worklist_db -f /app/scripts/find_orphaned_dicom.sql

# Run specific query
docker exec -e PGPASSWORD="dicom2024!@#" dicom-postgres-secured \
  psql -U dicom -d worklist_db -c "
    SELECT COUNT(*) as orphaned_files
    FROM dicom_files df
    LEFT JOIN worklist_items wi ON wi.study_instance_uid = df.study_id
    WHERE wi.id IS NULL;
  "
```

---

## Support & Contributing

**Questions or Issues?**
- Check troubleshooting section
- Review logs: `docker logs pacs-service`
- Check database manually dengan SQL queries

**Want to improve the script?**
- Edit `pacs-service/scripts/cleanup_orphaned_dicom.py`
- Test with `--dry-run` first
- Update documentation

---

## Script Locations

| File | Location | Purpose |
|------|----------|---------|
| Python Script | `pacs-service/scripts/cleanup_orphaned_dicom.py` | Main cleanup logic |
| Bash Wrapper | `/home/apps/full-pacs/cleanup-orphaned-dicom.sh` | User-friendly wrapper |
| SQL Queries | `pacs-service/scripts/find_orphaned_dicom.sql` | Manual investigation |
| Documentation | `pacs-service/scripts/README_CLEANUP.md` | This file |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-11-20 | Initial release |

---

**Last Updated:** 2025-11-20
**Maintained By:** PACS Development Team
