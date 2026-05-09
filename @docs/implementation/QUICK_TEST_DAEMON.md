# Quick Test: DICOM Daemon Detection

## 🚀 Quick Start

### 1. Go to Correct Location
```powershell
cd e:\Project\docker\mwl-pacs-ui\pacs-service
```

### 2. Run Test Script
```powershell
.\test-daemon-detection.ps1
```

### 3. Check Results

**Expected Output**:
```
✓ Daemon process found (PID: 12345)
✓ Port 11112 is listening
✓ Health endpoint shows daemon running
```

---

## 🔧 If Daemon Not Running

### Start Daemon
```bash
python dicom_scp_daemon.py
```

### Verify
```bash
curl http://localhost:8003/api/monitoring/health/detailed
```

---

## ✅ Success Check

Health endpoint should show:
```json
{
  "dicom_scp": {
    "status": "healthy",
    "running": true,
    "port": 11112
  }
}
```

---

## 📝 What Changed

1. **Better Detection**: 3 methods (process, port, PID file)
2. **Clear Messages**: Know exactly what's wrong
3. **Easy Testing**: One script to check everything

---

**Ready to test? Run the script in the correct location!**
