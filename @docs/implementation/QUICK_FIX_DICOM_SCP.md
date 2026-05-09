# Quick Fix: DICOM SCP Error

## ❌ Error
```
ModuleNotFoundError: No module named 'pynetdicom'
```

---

## ✅ Quick Solutions

### Option 1: Install Minimal (Tercepat - 30 detik)
```bash
chmod +x install-minimal-dicom.sh
./install-minimal-dicom.sh
```

### Option 2: Install Full Dependencies (Lengkap - 2 menit)
```bash
chmod +x install-dicom-dependencies.sh
./install-dicom-dependencies.sh
```

### Option 3: Manual Install (Jika script gagal)
```bash
cd pacs-service
pip install -r requirements.txt
pip install -r requirements-storage.txt
cd ..
```

### Option 4: Install Only Required (Super Minimal)
```bash
pip install pydicom==2.4.4 pynetdicom==2.0.2 pillow psycopg2-binary sqlalchemy python-dotenv
```

---

## 🎯 Recommended: Option 1 (Minimal Install)

Paling cepat, hanya install yang benar-benar diperlukan:

```bash
chmod +x install-minimal-dicom.sh
./install-minimal-dicom.sh
```

Packages yang akan diinstall:
- `pydicom` - DICOM parsing
- `pynetdicom` - DICOM networking (C-STORE, C-ECHO)
- `pillow` - Image processing
- `numpy` - Array operations
- `psycopg2-binary` - PostgreSQL
- `sqlalchemy` - ORM
- `fastapi` - API framework
- `python-dotenv` - Environment variables

---

## ✅ Verify Installation

```bash
python -c "import pynetdicom; print('✓ pynetdicom:', pynetdicom.__version__)"
python -c "import pydicom; print('✓ pydicom:', pydicom.__version__)"
```

Expected output:
```
✓ pynetdicom: 2.0.2
✓ pydicom: 2.4.4
```

---

## 🚀 Start DICOM SCP

Setelah install berhasil:

```bash
./start-dicom-scp.sh
```

Expected output:
```
==========================================
Starting DICOM SCP Daemon
==========================================
AE Title: PACS_SCP
Port: 11112
Storage Path: ./dicom-storage
==========================================
2025-11-16 10:30:00 - dicom_scp - INFO - DICOM SCP initialized: PACS_SCP on port 11112
2025-11-16 10:30:00 - dicom_scp - INFO - Starting DICOM SCP: PACS_SCP on port 11112
2025-11-16 10:30:00 - dicom_scp - INFO - Waiting for connections...
```

---

## 🐛 Troubleshooting

### Error: pip not found
```bash
# Install pip
curl https://bootstrap.pypa.io/get-pip.py -o get-pip.py
python get-pip.py
```

### Error: Permission denied
```bash
# Use sudo (not recommended) or virtual environment
python -m venv venv
source venv/bin/activate
./install-minimal-dicom.sh
```

### Error: Compilation failed (psycopg2)
```bash
# Use binary version
pip install psycopg2-binary
```

### Error: Port 11112 already in use
```bash
# Find process
netstat -tulpn | grep 11112

# Kill process
kill -9 <PID>

# Or use different port
export DICOM_SCP_PORT=11113
./start-dicom-scp.sh
```

---

## 📦 Virtual Environment (Recommended)

Untuk production, gunakan virtual environment:

```bash
# Create venv
python -m venv venv

# Activate
source venv/bin/activate  # Linux/Mac
venv\Scripts\activate     # Windows

# Install dependencies
./install-dicom-dependencies.sh

# Start SCP
./start-dicom-scp.sh

# Deactivate when done
deactivate
```

---

## ✅ Complete Setup Flow

```bash
# 1. Install dependencies
./install-minimal-dicom.sh

# 2. Start DICOM SCP (Terminal 1)
./start-dicom-scp.sh

# 3. Test connection (Terminal 2)
./test-dicom-echo.sh

# 4. Send test file (Terminal 2)
./test-dicom-send.sh src/uploads/modified_SD-720x480.dcm
```

---

**Done!** DICOM SCP sekarang siap menerima images dari modalities! 🎉
