# DICOM SCP Testing Guide

Complete guide untuk testing DICOM SCP functionality.

---

## ✅ Test 1: C-ECHO (Connection Test)

Test koneksi ke DICOM SCP.

```bash
./test-dicom-echo.sh
```

**Expected Output:**
```json
{
  "success": true,
  "status": "online",
  "message": "Connection successful (response time: 23.1ms)",
  "response_time_ms": 23.1
}
```

**What it tests:**
- ✅ SCP daemon running
- ✅ Port 11112 listening
- ✅ DICOM association works
- ✅ C-ECHO response

---

## ✅ Test 2: C-STORE (Send DICOM File)

Send DICOM file ke SCP untuk disimpan.

```bash
# Default file
./test-dicom-send.sh

# Custom file
./test-dicom-send.sh uploads/modified_SD-720x480.dcm

# With custom parameters
./test-dicom-send.sh uploads/file.dcm PACS_SCP localhost 11112
```

**Expected Output:**
```
==========================================
Sending DICOM File (C-STORE)
==========================================
File: uploads/modified_SD-720x480.dcm
Target AE Title: PACS_SCP
Host: localhost
Port: 11112
==========================================
Patient ID: 12345
Study UID: 1.2.840.113619.2.55.3...
Instance UID: 1.2.840.113619.2.55.3...

Connecting to SCP...
✓ Association established
Sending C-STORE...
✓ C-STORE successful
✓ Association released
==========================================
Done
==========================================
```

**What it tests:**
- ✅ C-STORE handler works
- ✅ DICOM file parsing
- ✅ Database storage
- ✅ File system storage

---

## ✅ Test 3: Verify in Database

Check apakah DICOM file tersimpan di database.

```bash
docker exec pacs-service bash -c "
export PGPASSWORD='${DB_PASSWORD}'
psql -h dicom-postgres-secured -U dicom -d worklist_db \
  -c 'SELECT study_instance_uid, patient_id, patient_name, study_date FROM studies ORDER BY created_at DESC LIMIT 5;'
"
```

**Expected Output:**
```
           study_instance_uid            | patient_id | patient_name | study_date
-----------------------------------------+------------+--------------+------------
 1.2.840.113619.2.55.3.2831622185.123... | 12345      | Test Patient | 20250116
```

---

## ✅ Test 4: Check DICOM Operations Log

View log operasi DICOM.

```bash
docker exec pacs-service bash -c "
export PGPASSWORD='${DB_PASSWORD}'
psql -h dicom-postgres-secured -U dicom -d worklist_db \
  -c 'SELECT * FROM v_recent_dicom_operations LIMIT 10;'
"
```

---

## ✅ Test 5: API Endpoints

### List DICOM Nodes
```bash
curl http://localhost:8003/api/dicom/nodes
```

### Get Specific Node
```bash
curl http://localhost:8003/api/dicom/nodes/{node_id}
```

### Test Node Connection
```bash
curl -X POST http://localhost:8003/api/dicom/nodes/test-connection \
  -H "Content-Type: application/json" \
  -d '{
    "ae_title": "PACS_SCP",
    "host": "localhost",
    "port": 11112,
    "timeout": 30
  }'
```

### List Studies
```bash
curl http://localhost:8003/api/studies
```

---

## ✅ Test 6: Monitor Logs

### Real-time SCP Logs
```bash
docker exec pacs-service tail -f /var/log/pacs/dicom_scp.log
```

### Container Logs
```bash
docker-compose -f docker-compose.pacs.yml logs -f pacs-service
```

### Last 50 Lines
```bash
docker exec pacs-service tail -50 /var/log/pacs/dicom_scp.log
```

---

## ✅ Test 7: Statistics

### Node Statistics
```bash
docker exec pacs-service bash -c "
export PGPASSWORD='${DB_PASSWORD}'
psql -h dicom-postgres-secured -U dicom -d worklist_db \
  -c 'SELECT * FROM v_dicom_node_stats;'
"
```

### Active Nodes
```bash
docker exec pacs-service bash -c "
export PGPASSWORD='${DB_PASSWORD}'
psql -h dicom-postgres-secured -U dicom -d worklist_db \
  -c 'SELECT * FROM v_active_dicom_nodes;'
"
```

---

## 🧪 Complete Test Suite

Run semua tests:

```bash
#!/bin/bash
# complete-test.sh

echo "=========================================="
echo "DICOM SCP Complete Test Suite"
echo "=========================================="

# Test 1: C-ECHO
echo ""
echo "Test 1: C-ECHO (Connection Test)"
./test-dicom-echo.sh
if [ $? -eq 0 ]; then
    echo "✓ C-ECHO passed"
else
    echo "✗ C-ECHO failed"
    exit 1
fi

# Test 2: C-STORE
echo ""
echo "Test 2: C-STORE (Send DICOM File)"
./test-dicom-send.sh uploads/modified_SD-720x480.dcm
if [ $? -eq 0 ]; then
    echo "✓ C-STORE passed"
else
    echo "✗ C-STORE failed"
    exit 1
fi

# Test 3: Database
echo ""
echo "Test 3: Database Verification"
COUNT=$(docker exec pacs-service bash -c "
export PGPASSWORD='${DB_PASSWORD}'
psql -h dicom-postgres-secured -U dicom -d worklist_db -t \
  -c 'SELECT COUNT(*) FROM studies;'
" | tr -d ' ')

if [ "$COUNT" -gt 0 ]; then
    echo "✓ Database has $COUNT studies"
else
    echo "✗ No studies in database"
    exit 1
fi

# Test 4: API
echo ""
echo "Test 4: API Endpoints"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8003/api/dicom/nodes)
if [ "$HTTP_CODE" -eq 200 ]; then
    echo "✓ API accessible"
else
    echo "✗ API not accessible (HTTP $HTTP_CODE)"
    exit 1
fi

echo ""
echo "=========================================="
echo "✓ All Tests Passed!"
echo "=========================================="
```

---

## 📊 Performance Testing

### Test Multiple Files
```bash
for i in {1..10}; do
    echo "Sending file $i..."
    ./test-dicom-send.sh uploads/modified_SD-720x480.dcm
    sleep 1
done
```

### Measure Response Time
```bash
time ./test-dicom-echo.sh
```

### Check Resource Usage
```bash
docker stats pacs-service --no-stream
```

---

## 🐛 Troubleshooting Tests

### C-ECHO Fails
```bash
# Check SCP is running
docker exec pacs-service ps aux | grep dicom_scp

# Check port
docker exec pacs-service netstat -tulpn | grep 11112

# Restart SCP
docker exec pacs-service pkill -f dicom_scp_daemon
./start-dicom-scp.sh
```

### C-STORE Fails
```bash
# Check logs
docker exec pacs-service tail -50 /var/log/pacs/dicom_scp.log

# Check database connection
docker exec pacs-service bash -c "
export PGPASSWORD='${DB_PASSWORD}'
psql -h dicom-postgres-secured -U dicom -d worklist_db -c 'SELECT 1'
"

# Check storage path
docker exec pacs-service ls -la /var/lib/pacs/dicom-storage
```

### Database Empty
```bash
# Check tables exist
docker exec pacs-service bash -c "
export PGPASSWORD='${DB_PASSWORD}'
psql -h dicom-postgres-secured -U dicom -d worklist_db \
  -c '\dt'
"

# Re-run migration
./run-migration-005.sh
```

---

## ✅ Success Criteria

All tests should pass:
- [x] C-ECHO returns success
- [x] C-STORE completes without error
- [x] Studies appear in database
- [x] Files stored in filesystem
- [x] API endpoints accessible
- [x] Logs show successful operations
- [x] No errors in container logs

---

## 📝 Test Results Template

```
DICOM SCP Test Results
Date: 2025-11-16
Tester: [Your Name]

Test 1: C-ECHO
Status: ✓ PASS
Response Time: 23.1ms

Test 2: C-STORE
Status: ✓ PASS
Files Sent: 1
Success Rate: 100%

Test 3: Database
Status: ✓ PASS
Studies Count: 1

Test 4: API
Status: ✓ PASS
HTTP Code: 200

Overall: ✓ ALL TESTS PASSED
```

---

**Ready for Production!** 🎉
