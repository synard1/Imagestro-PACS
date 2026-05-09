# DICOM SCP Quick Start Guide

Quick reference for using the DICOM SCP (Storage Service Class Provider).

---

## 🚀 Quick Start (3 Steps)

### 1. Apply Migration
```bash
python run-migration-005.py
```

### 2. Start SCP Daemon
```bash
# Linux/Mac
./start-dicom-scp.sh

# Windows
start-dicom-scp.bat
```

### 3. Test Connection
```bash
# Linux/Mac
./test-dicom-echo.sh

# Windows
test-dicom-echo.bat
```

---

## 📡 Send DICOM Files

### From Command Line
```bash
./test-dicom-send.sh path/to/file.dcm PACS_SCP localhost 11112
```

### From Modality
Configure your modality with:
- **AE Title**: PACS_SCP
- **Host**: Your server IP
- **Port**: 11112

---

## 🔌 API Examples

### List Nodes
```bash
curl http://localhost:8003/api/dicom/nodes
```

### Add Modality
```bash
curl -X POST http://localhost:8003/api/dicom/nodes \
  -H "Content-Type: application/json" \
  -d '{
    "ae_title": "CT_ROOM1",
    "host": "192.168.1.100",
    "port": 104,
    "name": "CT Scanner Room 1",
    "node_type": "MODALITY",
    "modality": "CT"
  }'
```

### Test Connection
```bash
curl -X POST http://localhost:8003/api/dicom/nodes/1/test
```

---

## 📊 Monitor Status

### Check Logs
```bash
tail -f pacs-service/dicom_scp.log
```

### Check Database
```sql
-- View received studies
SELECT * FROM studies ORDER BY created_at DESC LIMIT 10;

-- View DICOM nodes
SELECT * FROM dicom_nodes;
```

---

## 🐛 Common Issues

### Port Already in Use
```bash
# Find process using port
netstat -ano | findstr :11112

# Kill process (Windows)
taskkill /PID <pid> /F
```

### Connection Refused
1. Check SCP is running: `ps aux | grep dicom_scp`
2. Check firewall: Allow port 11112
3. Verify AE title matches

### Storage Fails
1. Check database connection
2. Verify disk space
3. Check logs for errors

---

## 📝 Configuration

### Default Settings
- **AE Title**: PACS_SCP
- **Port**: 11112
- **Storage**: ./dicom-storage

### Custom Settings
```bash
# Via environment variables
export DICOM_SCP_AE_TITLE=MY_PACS
export DICOM_SCP_PORT=11113

# Via command line
python pacs-service/dicom_scp_daemon.py \
  --ae-title MY_PACS \
  --port 11113
```

---

## ✅ Verification

After starting SCP, verify:
1. ✅ Process is running
2. ✅ Port is listening
3. ✅ C-ECHO succeeds
4. ✅ Can receive C-STORE
5. ✅ Images appear in database

---

**Need Help?** Check `PHASE_2_DAY_3_STAGE_2_COMPLETE.md` for detailed documentation.
