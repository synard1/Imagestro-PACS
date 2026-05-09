# Migration 005 - Installation & Running Guide

## 🚨 Error: ModuleNotFoundError: No module named 'sqlalchemy'

Jika Anda mendapat error ini, berarti dependencies Python belum terinstall.

---

## ✅ Solusi: 3 Cara Menjalankan Migration

### Cara 1: Install Dependencies Python (Recommended)

```bash
# Masuk ke direktori pacs-service
cd pacs-service

# Install dependencies
pip install -r requirements.txt

# Atau install minimal dependencies
pip install psycopg2-binary sqlalchemy python-dotenv

# Kembali ke root
cd ..

# Run migration
python run-migration-005.py
```

---

### Cara 2: Gunakan Script Sederhana (Tanpa SQLAlchemy)

```bash
# Script ini hanya butuh psycopg2
pip install psycopg2-binary

# Run migration
python run-migration-005-simple.py
```

---

### Cara 3: Gunakan psql Langsung (Paling Mudah)

**Linux/Mac:**
```bash
chmod +x run-migration-005.sh
./run-migration-005.sh
```

**Windows:**
```cmd
run-migration-005.bat
```

**Manual psql:**
```bash
# Set password
export PGPASSWORD=pacs_password

# Run migration
psql -h localhost -p 5432 -U pacs_user -d pacs_db \
  -f pacs-service/migrations/005_create_dicom_nodes_tables.sql
```

---

## 🔧 Setup Environment Variables

Buat file `.env` di root project:

```bash
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=pacs_db
DB_USER=pacs_user
DB_PASSWORD=pacs_password

# DICOM SCP Configuration
DICOM_SCP_AE_TITLE=PACS_SCP
DICOM_SCP_PORT=11112
DICOM_STORAGE_PATH=./dicom-storage
```

---

## 📋 Verifikasi Migration Berhasil

### 1. Check Tables

```sql
-- Connect to database
psql -h localhost -U pacs_user -d pacs_db

-- List DICOM tables
\dt dicom_*

-- Expected output:
-- dicom_nodes
-- dicom_associations
-- dicom_operations
```

### 2. Check Default Nodes

```sql
SELECT ae_title, name, node_type, is_active 
FROM dicom_nodes 
ORDER BY ae_title;

-- Expected output:
-- CT_MODALITY  | CT Scanner      | modality | f
-- PACS_SCP     | Local PACS SCP  | pacs     | t
```

### 3. Check Views

```sql
-- Active nodes
SELECT * FROM v_active_dicom_nodes;

-- Node statistics
SELECT * FROM v_dicom_node_stats;
```

---

## 🐛 Troubleshooting

### Error: psycopg2 not installed

```bash
pip install psycopg2-binary
```

### Error: connection refused

```bash
# Check PostgreSQL is running
systemctl status postgresql  # Linux
brew services list           # Mac
sc query postgresql-x64-14   # Windows

# Check connection
psql -h localhost -U pacs_user -d pacs_db -c "SELECT 1"
```

### Error: database does not exist

```bash
# Create database
createdb -h localhost -U postgres pacs_db

# Or via psql
psql -h localhost -U postgres -c "CREATE DATABASE pacs_db;"
```

### Error: role does not exist

```bash
# Create user
psql -h localhost -U postgres -c "CREATE USER pacs_user WITH PASSWORD 'pacs_password';"
psql -h localhost -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE pacs_db TO pacs_user;"
```

---

## 📦 Full Setup dari Awal

```bash
# 1. Install PostgreSQL (jika belum)
# Linux: sudo apt install postgresql
# Mac: brew install postgresql
# Windows: Download dari postgresql.org

# 2. Create database & user
sudo -u postgres psql << EOF
CREATE DATABASE pacs_db;
CREATE USER pacs_user WITH PASSWORD 'pacs_password';
GRANT ALL PRIVILEGES ON DATABASE pacs_db TO pacs_user;
\q
EOF

# 3. Install Python dependencies
cd pacs-service
pip install -r requirements.txt
cd ..

# 4. Setup environment
cp .env.example .env
# Edit .env dengan database credentials

# 5. Run migration
python run-migration-005.py

# Atau gunakan cara alternatif:
# python run-migration-005-simple.py
# ./run-migration-005.sh
# run-migration-005.bat
```

---

## ✅ Success Output

Jika berhasil, Anda akan melihat:

```
============================================================
Running Migration 005: Create DICOM Nodes Tables
============================================================
Database: pacs_user@localhost:5432/pacs_db

✓ Connected to database
✓ Migration 005 applied successfully

✓ DICOM nodes tables created:
  - dicom_nodes (main configuration)
  - dicom_associations (connection log)
  - dicom_operations (operation log)
✓ Default nodes inserted
✓ Views and functions created

Tables created:
  ✓ dicom_associations
  ✓ dicom_nodes
  ✓ dicom_operations

Default nodes:
  ✓ Active   PACS_SCP         - Local PACS SCP (pacs)
  ○ Inactive CT_MODALITY      - CT Scanner (modality)

============================================================
Migration Complete!
============================================================
```

---

## 🎯 Next Steps

Setelah migration berhasil:

1. **Start DICOM SCP Daemon**
   ```bash
   ./start-dicom-scp.sh
   ```

2. **Test Connection**
   ```bash
   ./test-dicom-echo.sh
   ```

3. **Start PACS Service**
   ```bash
   cd pacs-service
   uvicorn app.main:app --host 0.0.0.0 --port 8003
   ```

4. **Test API**
   ```bash
   curl http://localhost:8003/api/dicom/nodes
   ```

---

## 📚 Files Available

- `run-migration-005.py` - Original (needs SQLAlchemy)
- `run-migration-005-simple.py` - Simple version (only needs psycopg2)
- `run-migration-005.sh` - Bash script (uses psql)
- `run-migration-005.bat` - Windows batch (uses psql)

**Pilih yang paling mudah untuk environment Anda!**
