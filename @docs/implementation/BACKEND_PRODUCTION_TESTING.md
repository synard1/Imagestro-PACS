# Backend Production Testing Guide

**Server**: 103.42.117.19  
**Date**: November 16, 2025  
**Status**: Ready for testing

---

## 🌐 Service Endpoints

| Service | URL | Port | Description |
|---------|-----|------|-------------|
| PACS Service | http://103.42.117.19:8003 | 8003 | REST API |
| OHIF Viewer | http://103.42.117.19:3006 | 3006 | Medical Image Viewer |
| Orthanc Web | http://103.42.117.19:8043 | 8043 | DICOM Server Web UI |
| Orthanc DICOM | 103.42.117.19:4242 | 4242 | DICOM Protocol |

---

## Phase 1: Health Checks

### 1.1 PACS Service Health Check

```bash
# Basic health check
curl http://103.42.117.19:8003/api/health

# Expected response:
# {
#   "status": "healthy",
#   "service": "PACS Service",
#   "version": "1.0.0",
#   "database": "healthy",
#   "timestamp": "2025-11-16T..."
# }
```

**Browser Test**:
- Open: http://103.42.117.19:8003/api/health
- Should see JSON response with "status": "healthy"

### 1.2 API Documentation

```bash
# Check API docs
curl http://103.42.117.19:8003/api/docs

# Or open in browser:
# http://103.42.117.19:8003/api/docs
```

**Browser Test**:
- Open: http://103.42.117.19:8003/api/docs
- Should see Swagger UI with all endpoints

### 1.3 Orthanc Health Check

```bash
# Check Orthanc system info
curl http://103.42.117.19:8043/system

# Expected response:
# {
#   "Version": "1.x.x",
#   "DatabaseVersion": 6,
#   "IsHttpServerSecure": false,
#   ...
# }
```

**Browser Test**:
- Open: http://103.42.117.19:8043
- Should see Orthanc web interface
- Login with credentials (if required)

### 1.4 OHIF Viewer

**Browser Test**:
- Open: http://103.42.117.19:3006
- Should see OHIF viewer interface
- Should show study list (if any studies exist)

---

## Phase 2: Database Migration Testing

### 2.1 Check Current Database State

```bash
# SSH to server
ssh user@103.42.117.19

# Check if migration tables exist
docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db -c "\dt reports*"

# Expected output:
#              List of relations
#  Schema |        Name         | Type  |  Owner
# --------+---------------------+-------+--------
#  public | report_attachments  | table | dicom
#  public | report_history      | table | dicom
#  public | reports             | table | dicom
```

### 2.2 Run Report Backend Migration (If Not Done)

```bash
# SSH to server
ssh user@103.42.117.19

# Navigate to project
cd /home/apps/full-pacs

# Run migration
docker exec -it pacs-service python /app/migrations/init_pacs_db.py

# Or manually:
docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db -f /path/to/003_create_report_tables.sql
```

### 2.3 Verify Migration

```bash
# Check reports table structure
docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db -c "\d reports"

# Check if UUID migration is needed
docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'reports' AND column_name = 'id';"

# If shows 'integer', run UUID migration
# If shows 'uuid', UUID migration already done
```

---

## Phase 3: Report API Testing

### 3.1 Create Test Report

```bash
# Create a test report
curl -X POST http://103.42.117.19:8003/api/reports \
  -H "Content-Type: application/json" \
  -d '{
    "study_id": "1.2.840.113619.2.55.3.123456789",
    "patient_id": "TEST001",
    "patient_name": "Test Patient",
    "template_id": "ct_brain",
    "modality": "CT",
    "body_part": "Brain",
    "clinical_history": "Headache for 2 weeks",
    "findings": "No acute intracranial abnormality detected. Brain parenchyma appears normal.",
    "impression": "Normal CT brain study.",
    "created_by": "dr.test"
  }'

# Save the report_id from response for next tests
# Example response:
# {
#   "id": "550e8400-e29b-41d4-a716-446655440000",
#   "report_id": "RPT-ABC123DEF456",
#   "status": "draft",
#   ...
# }
```

**Expected Result**:
- Status: 201 Created
- Response contains report_id (e.g., RPT-ABC123DEF456)
- Response contains UUID id
- Status is "draft"

### 3.2 Get Report by ID

```bash
# Replace RPT-ABC123DEF456 with actual report_id from previous step
curl http://103.42.117.19:8003/api/reports/RPT-ABC123DEF456

# Expected response:
# {
#   "report_id": "RPT-ABC123DEF456",
#   "patient_name": "Test Patient",
#   "status": "draft",
#   ...
# }
```

**Expected Result**:
- Status: 200 OK
- Response contains full report data

### 3.3 Update Report

```bash
# Update report findings
curl -X PUT http://103.42.117.19:8003/api/reports/RPT-ABC123DEF456 \
  -H "Content-Type: application/json" \
  -d '{
    "findings": "Updated findings: No acute intracranial abnormality. Mild age-related changes noted.",
    "impression": "Updated impression: Normal CT brain with age-related changes.",
    "updated_by": "dr.test"
  }'

# Expected response:
# {
#   "report_id": "RPT-ABC123DEF456",
#   "findings": "Updated findings: ...",
#   "updated_at": "2025-11-16T...",
#   ...
# }
```

**Expected Result**:
- Status: 200 OK
- Findings and impression updated
- updated_at timestamp changed

### 3.4 Update Report Status

```bash
# Change status to preliminary
curl -X PATCH http://103.42.117.19:8003/api/reports/RPT-ABC123DEF456/status \
  -H "Content-Type: application/json" \
  -d '{
    "status": "preliminary",
    "updated_by": "dr.test"
  }'

# Expected response:
# {
#   "report_id": "RPT-ABC123DEF456",
#   "status": "preliminary",
#   ...
# }
```

**Expected Result**:
- Status: 200 OK
- Status changed to "preliminary"

### 3.5 Search Reports

```bash
# Search by patient_id
curl "http://103.42.117.19:8003/api/reports?patient_id=TEST001&limit=10"

# Search by status
curl "http://103.42.117.19:8003/api/reports?status=preliminary&limit=10"

# Search by modality
curl "http://103.42.117.19:8003/api/reports?modality=CT&limit=10"

# Expected response:
# [
#   {
#     "report_id": "RPT-ABC123DEF456",
#     "patient_id": "TEST001",
#     ...
#   }
# ]
```

**Expected Result**:
- Status: 200 OK
- Array of reports matching criteria

### 3.6 Get Report History

```bash
# Get report history
curl http://103.42.117.19:8003/api/reports/RPT-ABC123DEF456/history

# Expected response:
# [
#   {
#     "version": 2,
#     "changed_by": "dr.test",
#     "change_reason": "Status changed to preliminary",
#     "changed_at": "2025-11-16T...",
#     ...
#   },
#   {
#     "version": 1,
#     "changed_by": "dr.test",
#     "change_reason": "Report created",
#     "changed_at": "2025-11-16T...",
#     ...
#   }
# ]
```

**Expected Result**:
- Status: 200 OK
- Array of history entries
- Ordered by version (newest first)

### 3.7 Get Report Statistics

```bash
# Get statistics
curl http://103.42.117.19:8003/api/reports/stats/summary

# Expected response:
# {
#   "total_reports": 1,
#   "recent_reports_7d": 1,
#   "by_status": {
#     "draft": 0,
#     "preliminary": 1,
#     "final": 0
#   }
# }
```

**Expected Result**:
- Status: 200 OK
- Statistics object with counts

---

## Phase 4: Frontend Integration Testing

### 4.1 Update Frontend .env

```bash
# SSH to server
ssh user@103.42.117.19

# Navigate to frontend
cd /home/apps/full-pacs

# Update .env file
cat >> .env << 'EOF'
# Backend Integration
VITE_USE_BACKEND=true
VITE_API_BASE_URL=http://103.42.117.19:8003
EOF

# Restart frontend
docker-compose restart frontend
# or
npm run dev
```

### 4.2 Test Frontend Report Creation

**Browser Test**:
1. Open frontend: http://103.42.117.19:5173 (or your frontend URL)
2. Navigate to Studies
3. Click on a study
4. Click "Create Report"
5. Fill in report fields:
   - Clinical History: "Test from frontend"
   - Findings: "Test findings"
   - Impression: "Test impression"
6. Click "Save Draft"
7. Check browser console for API calls
8. Should see POST request to http://103.42.117.19:8003/api/reports
9. Should see success message

### 4.3 Verify in Database

```bash
# Check report in database
docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db -c "SELECT report_id, patient_name, status, created_at FROM reports ORDER BY created_at DESC LIMIT 5;"

# Expected output:
#     report_id     |  patient_name  |   status    |       created_at
# ------------------+----------------+-------------+---------------------
#  RPT-XYZ789ABC123 | Test Patient 2 | draft       | 2025-11-16 10:30:00
#  RPT-ABC123DEF456 | Test Patient   | preliminary | 2025-11-16 10:00:00
```

---

## Phase 5: Performance Testing

### 5.1 Create Multiple Reports

```bash
# Create 10 test reports
for i in {1..10}; do
  curl -X POST http://103.42.117.19:8003/api/reports \
    -H "Content-Type: application/json" \
    -d "{
      \"study_id\": \"1.2.3.4.$i\",
      \"patient_id\": \"PERF$i\",
      \"patient_name\": \"Performance Test $i\",
      \"template_id\": \"ct_brain\",
      \"findings\": \"Test findings $i\",
      \"impression\": \"Test impression $i\",
      \"created_by\": \"test_user\"
    }" &
done
wait

echo "Created 10 reports"
```

### 5.2 Measure Response Time

```bash
# Measure GET request time
time curl http://103.42.117.19:8003/api/reports?limit=50

# Measure POST request time
time curl -X POST http://103.42.117.19:8003/api/reports \
  -H "Content-Type: application/json" \
  -d '{
    "study_id": "1.2.3.4.5",
    "patient_id": "PERF_TIME",
    "patient_name": "Time Test",
    "template_id": "ct_brain",
    "findings": "Test",
    "impression": "Test",
    "created_by": "test"
  }'

# Expected: < 1 second for both
```

### 5.3 Check Database Performance

```bash
# Check query performance
docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db -c "EXPLAIN ANALYZE SELECT * FROM reports WHERE patient_id = 'PERF1';"

# Check table size
docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db -c "SELECT pg_size_pretty(pg_total_relation_size('reports'));"

# Check index usage
docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db -c "SELECT schemaname, tablename, indexname, idx_scan FROM pg_stat_user_indexes WHERE tablename = 'reports' ORDER BY idx_scan DESC;"
```

---

## Phase 6: Error Handling Testing

### 6.1 Test Invalid Data

```bash
# Missing required field (findings)
curl -X POST http://103.42.117.19:8003/api/reports \
  -H "Content-Type: application/json" \
  -d '{
    "study_id": "1.2.3.4",
    "patient_id": "TEST",
    "patient_name": "Test",
    "template_id": "ct_brain",
    "impression": "Test",
    "created_by": "test"
  }'

# Expected: 422 Unprocessable Entity
```

### 6.2 Test Non-Existent Report

```bash
# Get non-existent report
curl http://103.42.117.19:8003/api/reports/RPT-NONEXISTENT

# Expected: 404 Not Found
```

### 6.3 Test Invalid Status Transition

```bash
# Try to change final report to draft (invalid)
# First create and finalize a report, then try to change back
curl -X PATCH http://103.42.117.19:8003/api/reports/RPT-ABC123DEF456/status \
  -H "Content-Type: application/json" \
  -d '{
    "status": "draft",
    "updated_by": "test"
  }'

# Expected: 400 Bad Request (if report is final)
```

---

## Phase 7: Orthanc Integration Testing

### 7.1 Upload DICOM File to Orthanc

```bash
# Upload DICOM file
curl -X POST http://103.42.117.19:8043/instances \
  -H "Content-Type: application/dicom" \
  --data-binary @/path/to/dicom/file.dcm

# Or use Orthanc web interface:
# http://103.42.117.19:8043
# Click "Upload" and select DICOM file
```

### 7.2 Query Studies from Orthanc

```bash
# Get all studies
curl http://103.42.117.19:8043/studies

# Get specific study
curl http://103.42.117.19:8043/studies/{study-id}

# Get study instances
curl http://103.42.117.19:8043/studies/{study-id}/instances
```

### 7.3 Test OHIF Viewer with Orthanc

**Browser Test**:
1. Open OHIF: http://103.42.117.19:3006
2. Should see studies from Orthanc
3. Click on a study
4. Should load images in viewer
5. Test viewer tools (zoom, pan, windowing)

---

## Phase 8: Monitoring & Logs

### 8.1 Check Service Logs

```bash
# PACS Service logs
docker logs pacs-service --tail=100 -f

# Orthanc logs
docker logs orthanc-server --tail=100 -f

# OHIF logs
docker logs ohif-viewer --tail=100 -f

# Database logs
docker logs dicom-postgres-secured --tail=100 -f
```

### 8.2 Check Database Connections

```bash
# Active connections
docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db -c "SELECT count(*) FROM pg_stat_activity WHERE datname = 'worklist_db';"

# Connection details
docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db -c "SELECT pid, usename, application_name, client_addr, state FROM pg_stat_activity WHERE datname = 'worklist_db';"
```

### 8.3 Check Disk Usage

```bash
# Check Docker volumes
docker system df -v

# Check database size
docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db -c "SELECT pg_database_size('worklist_db');"

# Check Orthanc storage
du -sh /home/apps/full-pacs/data/orthanc-storage
```

---

## Testing Checklist

### ✅ Phase 1: Health Checks
- [ ] PACS Service health check returns "healthy"
- [ ] API documentation accessible
- [ ] Orthanc web interface accessible
- [ ] OHIF viewer loads

### ✅ Phase 2: Database Migration
- [ ] Reports tables exist
- [ ] UUID migration status checked
- [ ] Table structure verified

### ✅ Phase 3: Report API
- [ ] Create report successful
- [ ] Get report by ID works
- [ ] Update report works
- [ ] Update status works
- [ ] Search reports works
- [ ] Get history works
- [ ] Get statistics works

### ✅ Phase 4: Frontend Integration
- [ ] Frontend .env updated
- [ ] Frontend can create reports
- [ ] Reports visible in database
- [ ] No console errors

### ✅ Phase 5: Performance
- [ ] Multiple reports created successfully
- [ ] Response time < 1 second
- [ ] Database queries optimized

### ✅ Phase 6: Error Handling
- [ ] Invalid data rejected
- [ ] Non-existent report returns 404
- [ ] Invalid status transition rejected

### ✅ Phase 7: Orthanc Integration
- [ ] DICOM upload works
- [ ] Studies queryable
- [ ] OHIF viewer displays images

### ✅ Phase 8: Monitoring
- [ ] Logs accessible
- [ ] Database connections healthy
- [ ] Disk usage acceptable

---

## Success Criteria

✅ **All tests passed when**:
- All health checks return healthy status
- Reports can be created, read, updated
- Status transitions work correctly
- Frontend integration working
- Performance acceptable (< 1s response)
- Error handling working
- Orthanc integration working
- Logs show no errors

---

## Next Steps After Testing

### If All Tests Pass:
1. ✅ Mark backend as production-ready
2. ✅ Update documentation
3. ✅ Train users
4. ✅ Monitor for 24-48 hours
5. ✅ Plan Phase 2 features

### If Tests Fail:
1. ❌ Document failures
2. ❌ Check logs for errors
3. ❌ Fix issues
4. ❌ Re-run tests
5. ❌ Update documentation

---

**Testing Date**: November 16, 2025  
**Tester**: [Your Name]  
**Status**: Ready to begin  
**Server**: 103.42.117.19
