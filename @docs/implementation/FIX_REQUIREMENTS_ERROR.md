# Fix: Requirements File Not Found in Container

## ❌ Error
```
ERROR: Could not open requirements file: [Errno 2] No such file or directory: '/app/requirements.txt'
```

---

## ✅ Quick Solutions

### Option 1: Use Minimal Install (Tercepat - Recommended)
```bash
./install-minimal-dicom.sh
```

Ini langsung install packages tanpa perlu requirements file.

### Option 2: Use Robust Install Script
```bash
chmod +x install-dicom-in-container.sh
./install-dicom-in-container.sh
```

Script ini akan:
1. Check requirements di container
2. Jika tidak ada, copy dari host
3. Install packages

### Option 3: Copy Requirements Manually
```bash
# Copy requirements ke container
docker cp pacs-service/requirements.txt pacs-service:/tmp/
docker cp pacs-service/requirements-storage.txt pacs-service:/tmp/

# Install
docker exec pacs-service pip install -r /tmp/requirements.txt
docker exec pacs-service pip install -r /tmp/requirements-storage.txt
```

### Option 4: Direct Install (Paling Cepat)
```bash
docker exec pacs-service pip install \
  pydicom==2.4.4 \
  pynetdicom==2.0.2 \
  pillow \
  numpy \
  psycopg2-binary \
  sqlalchemy \
  python-dotenv
```

---

## 🔧 Permanent Fix: Rebuild Container

Update Dockerfile sudah dilakukan. Rebuild container:

```bash
# Stop container
docker-compose -f docker-compose.pacs.yml down pacs-service

# Rebuild
docker-compose -f docker-compose.pacs.yml build pacs-service

# Start
docker-compose -f docker-compose.pacs.yml up -d pacs-service

# Verify
docker exec pacs-service ls -la /app/requirements*.txt
```

Expected output:
```
-rw-r--r-- 1 root root 1234 Nov 16 10:00 /app/requirements.txt
-rw-r--r-- 1 root root  567 Nov 16 10:00 /app/requirements-storage.txt
```

---

## 🎯 Recommended Flow

**Jika container sudah running (tidak mau rebuild):**
```bash
# 1. Install minimal packages
./install-minimal-dicom.sh

# 2. Run migration
./run-migration-005.sh

# 3. Start SCP
./start-dicom-scp.sh
```

**Jika mau rebuild (untuk production):**
```bash
# 1. Rebuild container dengan Dockerfile baru
docker-compose -f docker-compose.pacs.yml build pacs-service

# 2. Start container
docker-compose -f docker-compose.pacs.yml up -d pacs-service

# 3. Verify requirements ada
docker exec pacs-service ls /app/requirements*.txt

# 4. Run migration
./run-migration-005.sh

# 5. Start SCP
./start-dicom-scp.sh
```

---

## ✅ Verify Installation

```bash
# Check packages
docker exec pacs-service pip list | grep -E "(pydicom|pynetdicom|pillow)"

# Test import
docker exec pacs-service python -c "import pynetdicom; print('OK')"
```

---

## 📝 What Changed

**Dockerfile Updated:**
- ✅ Copy `requirements-storage.txt` to container
- ✅ Copy `dicom_scp_daemon.py` to container
- ✅ Install both requirements files during build

**Scripts Updated:**
- ✅ `install-minimal-dicom.sh` - Direct package install
- ✅ `install-dicom-dependencies.sh` - Direct package install
- ✅ `install-dicom-in-container.sh` - Robust with fallback

---

## 🚀 Quick Start (Updated)

```bash
# Start container
docker-compose -f docker-compose.pacs.yml up -d pacs-service

# Install (choose one)
./install-minimal-dicom.sh              # Fastest
./install-dicom-in-container.sh         # Most robust
./install-dicom-dependencies.sh         # Full install

# Continue
./run-migration-005.sh
./start-dicom-scp.sh
```

---

**Problem Solved!** 🎉
