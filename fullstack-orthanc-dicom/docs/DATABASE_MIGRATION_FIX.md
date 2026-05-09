# Database Migration Fix - Auth Service

## 🐛 Bug Yang Ditemukan

### Root Cause
**File:** `auth-service/auth_service.py`
**Line:** 199 (sebelum fix)

**Masalah:** Index untuk kolom `role_id` dibuat SEBELUM migration yang menambahkan kolom tersebut.

```python
# BUG: Index dibuat sebelum kolom ada
cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id)")  # ❌ ERROR!

# Migration yang menambahkan kolom role_id ada DI BAWAH
# Line 223-245: Migration add role_id column
```

### Impact
1. **Transaction Rollback:** Semua perubahan database dibatalkan saat error
2. **Service Tidak Start:** Auth-service gagal initialize setiap kali restart
3. **Inconsistent State:** Database stuck dengan schema tidak lengkap
4. **Data Loss Risk:** CREATE TABLE baru (roles, permissions) dibatalkan

---

## ✅ Solusi Yang Diterapkan

### Perubahan Urutan Eksekusi

**SEBELUM (❌ SALAH):**
```
1. CREATE TABLE roles
2. CREATE TABLE users (IF NOT EXISTS → skip jika sudah ada)
3. CREATE INDEXES (termasuk idx_users_role_id) ← ERROR! Kolom belum ada
4. Migration add role_id ← Tidak pernah sampai
```

**SESUDAH (✅ BENAR):**
```
1. CREATE TABLE roles
2. CREATE TABLE users (IF NOT EXISTS → skip jika sudah ada)
3. Check existing columns
4. MIGRATION: Add role_id column if not exists ← PENTING!
5. CREATE INDEXES (sekarang aman karena role_id sudah ada)
6. CREATE other tables (refresh_tokens, audit_log)
7. Initialize roles & permissions
8. Create default admin user
```

### Code Changes

**Location:** `auth_service.py:195-246`

```python
# ===== MIGRATION: Add role_id column to users table if it doesn't exist =====
logger.info("Checking if role_id column exists in users table...")
cursor.execute("""
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'role_id'
""")
role_id_exists = cursor.fetchone()

if not role_id_exists:
    logger.info("role_id column not found. Adding role_id column to users table...")
    try:
        cursor.execute("""
            ALTER TABLE users
            ADD COLUMN role_id UUID REFERENCES roles(id) ON DELETE SET NULL
        """)
        logger.info("✓ role_id column successfully added to users table")
    except Exception as e:
        logger.error(f"Failed to add role_id column: {e}")
        raise
else:
    logger.info("✓ role_id column already exists in users table")

# ===== CREATE INDEXES (After migration to ensure all columns exist) =====
logger.info("Creating database indexes...")
cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id)")  # Now safe!
```

---

## 🔒 Keamanan Data (No Data Loss)

### Skenario 1: Database Kosong (Fresh Install)
```
✓ CREATE TABLE users dengan role_id → Success
✓ Migration check → Skip (kolom sudah ada)
✓ CREATE INDEXES → Success
✓ Result: Database lengkap, tidak ada data loss
```

### Skenario 2: Database Lama (Upgrade dari versi sebelumnya)
```
✓ CREATE TABLE users → Skip (sudah ada)
✓ Migration → Add role_id column → Success
✓ CREATE INDEXES → Success
✓ Data existing users → AMAN, tidak tersentuh
✓ Result: Schema di-upgrade, data preserved
```

### Skenario 3: Database Partial (Init gagal sebelumnya)
```
✓ CREATE TABLE users → Skip (sudah ada, tanpa role_id)
✓ CREATE TABLE roles → Success (dibuat ulang)
✓ Migration → Add role_id → Success
✓ CREATE INDEXES → Success
✓ Result: Schema diperbaiki, tidak ada data loss
```

---

## 🚀 Testing & Deployment

### Development Environment
```powershell
# Stop containers
docker-compose down

# Remove old data (safe for development)
Remove-Item -Recurse -Force ".\data\postgres"

# Start with fixed code
docker-compose up -d

# Check logs
docker logs auth-service -f
```

### Production Environment (ZERO DOWNTIME)

**Option 1: Force Recreate Container (Recommended)**
```bash
# Pull latest image
docker-compose pull auth-service

# Recreate hanya auth-service (database tetap jalan)
docker-compose up -d --force-recreate --no-deps auth-service

# Verify
docker logs auth-service --tail 50
```

**Option 2: Manual Migration (Jika diperlukan)**
```sql
-- Connect ke database
psql -h localhost -U dicom -d worklist_db

-- Check apakah kolom ada
SELECT column_name FROM information_schema.columns
WHERE table_name = 'users' AND column_name = 'role_id';

-- Jika tidak ada, tambahkan (dilakukan otomatis oleh service)
ALTER TABLE users ADD COLUMN role_id UUID REFERENCES roles(id) ON DELETE SET NULL;
CREATE INDEX idx_users_role_id ON users(role_id);
```

---

## 📊 Verification Checklist

Setelah deployment, pastikan:

- [ ] Auth-service container running without errors
- [ ] Database memiliki tabel: `users`, `roles`, `permissions`, `user_roles`
- [ ] Kolom `users.role_id` exists dan punya index
- [ ] Default admin user bisa login
- [ ] Existing users (jika ada) tetap bisa login
- [ ] No data loss pada tabel existing

```bash
# Check container status
docker ps | grep auth-service

# Check logs (should see success messages)
docker logs auth-service --tail 50 | grep "✓"

# Expected output:
# ✓ role_id column already exists in users table
# ✓ All indexes created successfully
# Default admin user created
# Authentication Service initialized successfully
```

---

## 🔄 Rollback Plan (Jika Diperlukan)

Jika terjadi masalah setelah update:

```bash
# Rollback ke image sebelumnya
docker-compose down
docker-compose up -d --force-recreate auth-service

# Atau manual remove kolom (DESTRUCTIVE - hanya jika diperlukan)
psql -h localhost -U dicom -d worklist_db
DROP INDEX IF EXISTS idx_users_role_id;
ALTER TABLE users DROP COLUMN IF EXISTS role_id;
```

---

## 📝 Notes

1. **Idempotent:** Migration bisa dijalankan berulang kali tanpa error
2. **Transactional:** Semua perubahan dalam satu transaction (all-or-nothing)
3. **Safe:** Tidak ada DROP atau DELETE data existing
4. **Backward Compatible:** Users lama tetap bisa login dengan kolom `role` (VARCHAR)
5. **Forward Compatible:** New users akan menggunakan `role_id` (UUID) + mapping table

---

## 🎯 Kesimpulan

**Masalah:** Index dibuat sebelum kolom ada → Transaction rollback → Service gagal start
**Solusi:** Pindahkan CREATE INDEXES ke SETELAH migration
**Result:** ✅ Safe migration, ✅ No data loss, ✅ Production ready
