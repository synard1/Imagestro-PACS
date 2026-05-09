# Quick Test - Files Already Updated!

Files sudah berhasil di-copy ke container! ✅

## 🚀 Test Sekarang

### Step 1: Restart SCP Daemon
```bash
./start-dicom-scp.sh
```

Expected output:
```
==========================================
Starting DICOM SCP Daemon in Container
==========================================
✓ Container 'pacs-service' is running

AE Title: PACS_SCP
Port: 11112
Storage Path: /var/lib/pacs/dicom-storage
==========================================

2025-11-16 XX:XX:XX - dicom_scp - INFO - DICOM SCP initialized
2025-11-16 XX:XX:XX - dicom_scp - INFO - Starting DICOM SCP
2025-11-16 XX:XX:XX - dicom_scp - INFO - Waiting for connections...
```

### Step 2: Test C-STORE (Terminal Baru)
```bash
./test-dicom-send-simple.sh
```

Expected output:
```
==========================================
Creating & Sending Test DICOM File
==========================================
✓ Test DICOM file created
Patient ID: TEST123
Study UID: 1.2.276...

Sending to SCP...
Connecting to SCP...
✓ Association established
Sending C-STORE...
✓ C-STORE successful
  Study UID: 1.2.276...
  Patient ID: TEST123
✓ Association released
==========================================
✓ Test Complete
==========================================
```

### Step 3: Verify in Database
```bash
docker exec pacs-service bash -c "
export PGPASSWORD='${DB_PASSWORD}'
psql -h dicom-postgres-secured -U dicom -d worklist_db \
  -c 'SELECT patient_id, study_instance_uid, created_at FROM studies ORDER BY created_at DESC LIMIT 5;'
"
```

Expected: Should show TEST123 patient

### Step 4: Check Logs
```bash
docker exec pacs-service tail -20 /var/log/pacs/dicom_scp.log
```

Expected: Should show successful C-STORE

---

## ✅ Success Criteria

- [x] Files copied to container ✅
- [ ] SCP daemon restarted
- [ ] C-STORE successful
- [ ] Study in database
- [ ] No errors in logs

---

## 🐛 If Test Fails

### Check SCP is running
```bash
docker exec pacs-service ps aux | grep dicom_scp
```

### Check logs for errors
```bash
docker exec pacs-service tail -50 /var/log/pacs/dicom_scp.log
```

### Restart container if needed
```bash
docker-compose -f docker-compose.pacs.yml restart pacs-service
sleep 5
./start-dicom-scp.sh
```

---

**Ready to test!** Run `./start-dicom-scp.sh` now! 🚀
