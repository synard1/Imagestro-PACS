# Quick Test Reference Card

**Server**: 103.42.117.19  
**Date**: November 16, 2025

---

## 🚀 Quick Start

### Run Automated Tests

```bash
# Make script executable
chmod +x test-backend.sh

# Run all tests
./test-backend.sh

# Expected output:
# ✓ ALL TESTS PASSED!
```

---

## 🌐 Service URLs

| Service | URL | Quick Test |
|---------|-----|------------|
| **PACS API** | http://103.42.117.19:8003/api/docs | Open in browser |
| **Health Check** | http://103.42.117.19:8003/api/health | `curl http://103.42.117.19:8003/api/health` |
| **Orthanc** | http://103.42.117.19:8043 | Open in browser |
| **OHIF Viewer** | http://103.42.117.19:3006 | Open in browser |

---

## 📝 Quick API Tests

### Create Report
```bash
curl -X POST http://103.42.117.19:8003/api/reports \
  -H "Content-Type: application/json" \
  -d '{
    "study_id": "1.2.3.4.5",
    "patient_id": "P001",
    "patient_name": "Test Patient",
    "template_id": "ct_brain",
    "findings": "Test findings",
    "impression": "Test impression",
    "created_by": "dr.test"
  }'
```

### Get Report
```bash
curl http://103.42.117.19:8003/api/reports/RPT-ABC123
```

### Search Reports
```bash
curl "http://103.42.117.19:8003/api/reports?patient_id=P001&limit=10"
```

### Get Statistics
```bash
curl http://103.42.117.19:8003/api/reports/stats/summary
```

---

## 🔍 Quick Checks

### Check Services Running
```bash
# SSH to server
ssh user@103.42.117.19

# Check Docker containers
docker ps | grep -E "pacs-service|orthanc|ohif"

# Expected: 3 containers running
```

### Check Logs
```bash
# PACS Service logs
docker logs pacs-service --tail=50

# Orthanc logs
docker logs orthanc-server --tail=50

# Database logs
docker logs dicom-postgres-secured --tail=50
```

### Check Database
```bash
# Connect to database
docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db

# List tables
\dt reports*

# Count reports
SELECT COUNT(*) FROM reports;

# Exit
\q
```

---

## ✅ Success Indicators

### All Green ✓
- Health check returns `"status": "healthy"`
- API docs accessible at /api/docs
- Can create reports (201 Created)
- Can get reports (200 OK)
- Can search reports (200 OK)
- Response time < 1 second
- No errors in logs

### Red Flags ✗
- Health check returns error
- 500 Internal Server Error
- Database connection failed
- Response time > 3 seconds
- Errors in logs

---

## 🐛 Quick Troubleshooting

### Issue: Service Not Responding
```bash
# Check if container running
docker ps | grep pacs-service

# Restart if needed
docker restart pacs-service

# Check logs
docker logs pacs-service --tail=100
```

### Issue: Database Connection Failed
```bash
# Check database container
docker ps | grep postgres

# Check database logs
docker logs dicom-postgres-secured --tail=50

# Test connection
docker exec pacs-service ping dicom-postgres-secured
```

### Issue: 404 Not Found
```bash
# Check API prefix
curl http://103.42.117.19:8003/api/health

# Check routes
curl http://103.42.117.19:8003/api/docs
```

---

## 📊 Test Checklist

### Quick Test (5 minutes)
- [ ] Health check returns healthy
- [ ] API docs accessible
- [ ] Create one test report
- [ ] Get report by ID
- [ ] No errors in logs

### Full Test (15 minutes)
- [ ] Run automated test script
- [ ] Create multiple reports
- [ ] Test all CRUD operations
- [ ] Test search and filter
- [ ] Check performance
- [ ] Verify database

### Production Ready (30 minutes)
- [ ] All quick tests pass
- [ ] All full tests pass
- [ ] Frontend integration works
- [ ] Performance acceptable
- [ ] Monitoring setup
- [ ] Documentation updated

---

## 🔗 Useful Links

- **Full Testing Guide**: BACKEND_PRODUCTION_TESTING.md
- **API Documentation**: http://103.42.117.19:8003/api/docs
- **Orthanc Explorer**: http://103.42.117.19:8043
- **OHIF Viewer**: http://103.42.117.19:3006

---

## 📞 Support

If tests fail:
1. Check BACKEND_PRODUCTION_TESTING.md for detailed troubleshooting
2. Check logs: `docker logs pacs-service`
3. Check database: `docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db`
4. Review PACS_SERVICE_LOGGING_FIX.md for enhanced logging

---

**Quick Test Command**:
```bash
./test-backend.sh
```

**Expected Result**: ✓ ALL TESTS PASSED!

---

**Last Updated**: November 16, 2025
