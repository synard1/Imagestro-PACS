# Complete DICOM SCP Setup Guide

## 🚀 One Command Setup

```bash
chmod +x setup-dicom-scp-complete.sh
./setup-dicom-scp-complete.sh
```

Ini akan:
1. ✅ Check/start container
2. ✅ Copy DICOM files ke container
3. ✅ Install dependencies
4. ✅ Run database migration

---

## 📋 Manual Step-by-Step

### Step 1: Start Container
```bash
docker-compose -f docker-compose.pacs.yml up -d pacs-service
```

### Step 2: Copy DICOM Files
```bash
chmod +x copy-dicom-files-to-container.sh
./copy-dicom-files-to-container.sh
```

Files yang di-copy:
- `dicom_scp_daemon.py` → `/app/`
- `app/services/dicom_scp.py` → `/app/app/services/`
- `app/services/dicom_echo.py` → `/app/app/services/`
- `app/models/dicom_node.py` → `/app/app/models/`
- `app/routers/dicom_nodes.py` → `/app/app/routers/`

### Step 3: Install Dependencies
```bash
./install-minimal-dicom.sh
```

### Step 4: Run Migration
```bash
./run-migration-005.sh
```

### Step 5: Start DICOM SCP
```bash
./start-dicom-scp.sh
```

### Step 6: Test (Terminal Baru)
```bash
./test-dicom-echo.sh
```

---

## 🔄 Alternative: Rebuild Container (Permanent Fix)

Untuk production, lebih baik rebuild container:

```bash
# 1. Stop container
docker-compose -f docker-compose.pacs.yml down pacs-service

# 2. Rebuild (Dockerfile sudah updated)
docker-compose -f docker-compose.pacs.yml build pacs-service

# 3. Start
docker-compose -f docker-compose.pacs.yml up -d pacs-service

# 4. Install dependencies (masih perlu karena tidak di Dockerfile)
./install-minimal-dicom.sh

# 5. Run migration
./run-migration-005.sh

# 6. Start SCP
./start-dicom-scp.sh
```

---

## ✅ Verification Checklist

```bash
# 1. Container running
docker ps | grep pacs-service

# 2. Files exist in container
docker exec pacs-service ls -la /app/dicom_scp_daemon.py
docker exec pacs-service ls -la /app/app/services/dicom_scp.py

# 3. Dependencies installed
docker exec pacs-service python -c "import pynetdicom; print('OK')"

# 4. Migration applied
docker exec pacs-service bash -c "
export PGPASSWORD='${DB_PASSWORD}'
psql -h dicom-postgres-secured -U dicom -d worklist_db \
  -c 'SELECT COUNT(*) FROM dicom_nodes;'
"

# 5. SCP running
docker exec pacs-service ps aux | grep dicom_scp

# 6. Port listening
docker exec pacs-service netstat -tulpn | grep 11112

# 7. Test connection
./test-dicom-echo.sh
```

---

## 🐛 Troubleshooting

### Error: dicom_scp_daemon.py not found
```bash
./copy-dicom-files-to-container.sh
```

### Error: Module not found
```bash
./install-minimal-dicom.sh
```

### Error: Table does not exist
```bash
./run-migration-005.sh
```

### Error: Port already in use
```bash
docker exec pacs-service pkill -f dicom_scp_daemon
./start-dicom-scp.sh
```

### Error: Cannot connect to database
```bash
# Check database container
docker ps | grep postgres

# Check connection
docker exec pacs-service bash -c "
export PGPASSWORD='${DB_PASSWORD}'
psql -h dicom-postgres-secured -U dicom -d worklist_db -c 'SELECT 1'
"
```

---

## 📊 Monitor

```bash
# View SCP logs
docker exec pacs-service tail -f /var/log/pacs/dicom_scp.log

# View container logs
docker-compose -f docker-compose.pacs.yml logs -f pacs-service

# Check received studies
docker exec pacs-service bash -c "
export PGPASSWORD='${DB_PASSWORD}'
psql -h dicom-postgres-secured -U dicom -d worklist_db \
  -c 'SELECT study_instance_uid, patient_name, study_date FROM studies ORDER BY created_at DESC LIMIT 10;'
"
```

---

## 🎯 Quick Commands

```bash
# Complete setup
./setup-dicom-scp-complete.sh

# Start SCP
./start-dicom-scp.sh

# Test
./test-dicom-echo.sh

# Stop SCP
docker exec pacs-service pkill -f dicom_scp_daemon

# Restart container
docker-compose -f docker-compose.pacs.yml restart pacs-service

# View logs
docker-compose -f docker-compose.pacs.yml logs -f pacs-service
```

---

## 📝 Scripts Available

- `setup-dicom-scp-complete.sh` - All-in-one setup
- `copy-dicom-files-to-container.sh` - Copy files to container
- `install-minimal-dicom.sh` - Install dependencies
- `run-migration-005.sh` - Run database migration
- `start-dicom-scp.sh` - Start DICOM SCP daemon
- `test-dicom-echo.sh` - Test connection

---

**Ready to go!** 🎉
