# Install & Start DICOM SCP - One Command

## 🚀 Quick Start (Copy-Paste)

### Linux/Mac - One Liner
```bash
pip install pydicom==2.4.4 pynetdicom==2.0.2 pillow psycopg2-binary sqlalchemy python-dotenv && ./start-dicom-scp.sh
```

### Windows - One Liner
```cmd
pip install pydicom==2.4.4 pynetdicom==2.0.2 pillow psycopg2-binary sqlalchemy python-dotenv && start-dicom-scp.bat
```

---

## 📋 Step by Step

### 1. Install Dependencies (Pilih salah satu)

**Quick (30 detik):**
```bash
./install-minimal-dicom.sh
```

**Full (2 menit):**
```bash
cd pacs-service
pip install -r requirements.txt
pip install -r requirements-storage.txt
cd ..
```

**Manual:**
```bash
pip install pydicom pynetdicom pillow numpy psycopg2-binary sqlalchemy fastapi uvicorn python-dotenv
```

### 2. Start DICOM SCP

```bash
./start-dicom-scp.sh
```

### 3. Test (Terminal baru)

```bash
# Test connection
./test-dicom-echo.sh

# Send test file
./test-dicom-send.sh src/uploads/modified_SD-720x480.dcm
```

---

## ✅ Verify Running

```bash
# Check process
ps aux | grep dicom_scp

# Check port
netstat -tulpn | grep 11112

# Check logs
tail -f pacs-service/dicom_scp.log
```

---

## 🎯 Production Setup

```bash
# 1. Create virtual environment
python -m venv venv
source venv/bin/activate

# 2. Install dependencies
cd pacs-service
pip install -r requirements.txt
pip install -r requirements-storage.txt
cd ..

# 3. Setup environment
cp .env.example .env
# Edit .env

# 4. Run migration
./run-migration-005.sh

# 5. Start services
# Terminal 1: DICOM SCP
./start-dicom-scp.sh

# Terminal 2: FastAPI
cd pacs-service
uvicorn app.main:app --host 0.0.0.0 --port 8003

# Terminal 3: Frontend
npm run dev
```

---

## 📊 Monitor

```bash
# View logs
tail -f pacs-service/dicom_scp.log

# Check database
psql -h localhost -U pacs_user -d pacs_db -c "SELECT COUNT(*) FROM studies;"

# API status
curl http://localhost:8003/api/dicom/nodes
```

---

## 🛑 Stop Services

```bash
# Stop DICOM SCP
pkill -f dicom_scp_daemon

# Or find and kill
ps aux | grep dicom_scp
kill <PID>
```

---

**Ready!** DICOM SCP siap menerima images! 🎉
