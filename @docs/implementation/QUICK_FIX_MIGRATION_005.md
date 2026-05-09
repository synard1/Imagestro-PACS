# Quick Fix: Migration 005 Error

## ❌ Error
```
ModuleNotFoundError: No module named 'sqlalchemy'
```

---

## ✅ Quick Solutions

### Option 1: Install Dependencies (5 detik)
```bash
pip install psycopg2-binary sqlalchemy python-dotenv
python run-migration-005.py
```

### Option 2: Use Simple Script (10 detik)
```bash
pip install psycopg2-binary
python run-migration-005-simple.py
```

### Option 3: Use psql Directly (Paling Cepat)
```bash
# Linux/Mac
./run-migration-005.sh

# Windows
run-migration-005.bat

# Manual
export PGPASSWORD=pacs_password
psql -h localhost -U pacs_user -d pacs_db \
  -f pacs-service/migrations/005_create_dicom_nodes_tables.sql
```

---

## 🎯 Recommended: Option 3 (psql)

Paling mudah dan tidak perlu install Python packages:

```bash
# Linux/Mac
chmod +x run-migration-005.sh
./run-migration-005.sh

# Windows
run-migration-005.bat
```

---

## ✅ Verify Success

```bash
psql -h localhost -U pacs_user -d pacs_db -c "SELECT * FROM dicom_nodes;"
```

Expected: 2 rows (PACS_SCP, CT_MODALITY)

---

**Done!** Lanjut ke: `./start-dicom-scp.sh`
