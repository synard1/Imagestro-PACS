# FHIR R4 Integration - Quick Start Guide

**Panduan Cepat Integrasi FHIR R4 untuk PACS System**

---

## 🚀 Memulai FHIR Workers

### 1. Start FHIR Celery Workers
```bash
cd /home/apps/full-pacs/pacs-service
docker compose -f docker-compose.celery.yml up -d celery-worker-fhir-conversion celery-worker-fhir-maintenance redis
```

### 2. Verifikasi Workers Running
```bash
docker ps | grep fhir
```

**Expected Output:**
```
pacs-celery-fhir-conversion     Up
pacs-celery-fhir-maintenance    Up
pacs-redis                      Up
```

### 3. Check Worker Logs
```bash
# FHIR Conversion Worker
docker logs pacs-celery-fhir-conversion --tail 50

# FHIR Maintenance Worker
docker logs pacs-celery-fhir-maintenance --tail 50
```

---

## 📤 Mengirim HL7 Messages dengan Auto-Conversion FHIR

### ADT Message (Patient Admission)
```bash
curl -X POST http://localhost:8003/api/hl7/adt \
  -H "Content-Type: application/json" \
  -d '{
    "message": "MSH|^~\\&|HIS|HOSPITAL|PACS|RADIOLOGY|20251128001500||ADT^A01|MSG00001|P|2.5\rEVN|A01|20251128001500\rPID|1||P123456^^^HIS^MRN||SMITH^JOHN^A||19850615|M|||123 MAIN ST^^JAKARTA^^12345^ID||555-1234|||S||P123456\rPV1|1|I|ICU^101^A|E|||D987^JONES^ROBERT^^^DR|||MED||||1|||D987^JONES^ROBERT^^^DR|IN|V123456"
  }'
```

### ORM Message (New Order)
```bash
curl -X POST http://localhost:8003/api/hl7/orm \
  -H "Content-Type: application/json" \
  -d '{
    "message": "MSH|^~\\&|HIS|HOSPITAL|PACS|RADIOLOGY|20251128001800||ORM^O01|MSG00002|P|2.5\rPID|1||P123456^^^HIS^MRN||SMITH^JOHN^A||19850615|M\rPV1|1|I|ICU^101^A|E|||D987^JONES^ROBERT^^^DR\rORC|NW|ORD123456|FIL123456||SC||||20251128001800\rOBR|1|ORD123456|FIL123456|IMG001^CHEST X-RAY^RADLEX|||20251128001800"
  }'
```

### ORU Message (Result Report)
```bash
curl -X POST http://localhost:8003/api/hl7/oru \
  -H "Content-Type: application/json" \
  -d '{
    "message": "MSH|^~\\&|PACS|RADIOLOGY|HIS|HOSPITAL|20251128002100||ORU^R01|MSG00003|P|2.5\rPID|1||P123456^^^HIS^MRN||SMITH^JOHN^A||19850615|M\rORC|RE|ORD123456|FIL123456||CM\rOBR|1|ORD123456|FIL123456|IMG001^CHEST X-RAY^RADLEX|R|20251128002100\rOBX|1|TX|FINDINGS||Normal chest radiograph||||||F"
  }'
```

---

## 🔍 Memeriksa FHIR Resources di Database

### 1. Cek Resources yang Dibuat
```bash
docker exec dicom-postgres-secured psql -U dicom -d worklist_db -c "
SELECT resource_type, resource_id, version_id, created_at
FROM fhir_resources
WHERE is_deleted = false
ORDER BY created_at DESC
LIMIT 10;
"
```

### 2. Cek Patient Resources
```bash
docker exec dicom-postgres-secured psql -U dicom -d worklist_db -c "
SELECT * FROM v_fhir_patients;
"
```

### 3. Cek Statistics
```bash
docker exec dicom-postgres-secured psql -U dicom -d worklist_db -c "
SELECT * FROM v_fhir_resource_statistics;
"
```

### 4. Cek Resources by HL7 Message ID
```bash
# Ganti dengan message_id dari response
MESSAGE_ID="77ca63e2-c950-4e0b-941f-83480a8e1084"

docker exec dicom-postgres-secured psql -U dicom -d worklist_db -c "
SELECT resource_type, resource_id, created_at
FROM fhir_resources
WHERE hl7_message_id = '$MESSAGE_ID' AND is_deleted = false;
"
```

---

## 🌐 Menggunakan FHIR REST API

### Get Patient by ID
```bash
curl http://localhost:8003/api/fhir/Patient/P123456
```

### Search Patient by Identifier
```bash
curl http://localhost:8003/api/fhir/Patient?identifier=P123456
```

### Get All Patients
```bash
curl http://localhost:8003/api/fhir/Patient
```

### Get ServiceRequest by ID
```bash
curl http://localhost:8003/api/fhir/ServiceRequest/ORD123456
```

### Get DiagnosticReport
```bash
curl http://localhost:8003/api/fhir/DiagnosticReport?identifier=FIL123456
```

### Get Observations for a Report
```bash
curl http://localhost:8003/api/fhir/Observation?report=FIL123456
```

---

## ⚙️ Konfigurasi FHIR

### Check Auto-Conversion Status
```bash
docker exec dicom-postgres-secured psql -U dicom -d worklist_db -c "
SELECT config_key, config_value, description
FROM fhir_config
WHERE config_key = 'fhir.auto_convert_hl7';
"
```

### Enable/Disable Auto-Conversion
```bash
# Enable
docker exec dicom-postgres-secured psql -U dicom -d worklist_db -c "
UPDATE fhir_config
SET config_value = 'true'
WHERE config_key = 'fhir.auto_convert_hl7';
"

# Disable
docker exec dicom-postgres-secured psql -U dicom -d worklist_db -c "
UPDATE fhir_config
SET config_value = 'false'
WHERE config_key = 'fhir.auto_convert_hl7';
"
```

### View All FHIR Configurations
```bash
docker exec dicom-postgres-secured psql -U dicom -d worklist_db -c "
SELECT config_key, config_value, config_type, description
FROM fhir_config
ORDER BY config_key;
"
```

---

## 📊 Monitoring & Troubleshooting

### 1. Monitor Celery Tasks via Flower
```bash
# Start Flower dashboard (jika belum running)
docker compose -f docker-compose.celery.yml up -d flower

# Akses dashboard
# Browser: http://localhost:5555
```

### 2. Check Redis Queue Length
```bash
# Check fhir_conversion queue
docker exec pacs-redis redis-cli LLEN fhir_conversion

# Check fhir_maintenance queue
docker exec pacs-redis redis-cli LLEN fhir_maintenance
```

### 3. View Recent PACS Logs
```bash
docker logs pacs-service --tail 100 | grep -i fhir
```

### 4. Check Celery Worker Status
```bash
# Active tasks
docker exec pacs-celery-fhir-conversion celery -A app.celery_app inspect active

# Worker stats
docker exec pacs-celery-fhir-conversion celery -A app.celery_app inspect stats
```

### 5. View Failed Tasks
```bash
docker exec dicom-postgres-secured psql -U dicom -d worklist_db -c "
SELECT task_name, status, error_message, created_at
FROM fhir_transactions
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 10;
"
```

---

## 🧪 Testing

### Run Test Script
```bash
cd /home/apps/full-pacs/pacs-service
bash tests/test_fhir_curl.sh
```

### Manual Conversion Test
```bash
curl -X POST http://localhost:8003/api/fhir/convert/hl7 \
  -H "Content-Type: application/json" \
  -d '{
    "message": "MSH|^~\\&|HIS|HOSPITAL|PACS|RADIOLOGY|20251128001500||ADT^A01|MSG00001|P|2.5\rEVN|A01|20251128001500\rPID|1||P123456^^^HIS^MRN||SMITH^JOHN^A||19850615|M",
    "message_type": "ADT"
  }'
```

---

## 🛠️ Maintenance Tasks

### Cleanup Old FHIR Versions (Manual Trigger)
```bash
docker exec pacs-celery-fhir-maintenance celery -A app.celery_app call app.tasks.fhir_tasks.cleanup_old_fhir_versions
```

### Generate FHIR Statistics
```bash
docker exec pacs-celery-fhir-maintenance celery -A app.celery_app call app.tasks.fhir_tasks.generate_fhir_statistics
```

### Validate Resource Links
```bash
docker exec pacs-celery-fhir-maintenance celery -A app.celery_app call app.tasks.fhir_tasks.validate_fhir_resource_links
```

---

## 🚨 Common Issues & Solutions

### Issue 1: Workers tidak menerima tasks
**Gejala:** Task triggered tapi tidak diproses

**Solusi:**
```bash
# 1. Check Redis connection
docker exec pacs-redis redis-cli ping

# 2. Restart workers
docker compose -f docker-compose.celery.yml restart celery-worker-fhir-conversion

# 3. Check network connectivity
docker network inspect pacs-service_pacs-network
```

### Issue 2: Database connection error
**Gejala:** "connection refused" atau "password authentication failed"

**Solusi:**
```bash
# 1. Verify database credentials
docker exec dicom-postgres-secured env | grep POSTGRES_

# 2. Test connection
docker exec pacs-celery-fhir-conversion psql -h dicom-postgres-secured -U dicom -d worklist_db -c "SELECT 1;"

# 3. Check network
docker network connect fullstack-orthanc-dicom_secure-network pacs-celery-fhir-conversion
```

### Issue 3: FHIR resources tidak dibuat
**Gejala:** Task executed tapi resource tidak muncul di database

**Solusi:**
```bash
# 1. Check worker logs for errors
docker logs pacs-celery-fhir-conversion --tail 100

# 2. Check database permissions
docker exec dicom-postgres-secured psql -U dicom -d worklist_db -c "
SELECT has_table_privilege('dicom', 'fhir_resources', 'INSERT');
"

# 3. Verify auto-conversion enabled
docker exec dicom-postgres-secured psql -U dicom -d worklist_db -c "
SELECT config_value FROM fhir_config WHERE config_key = 'fhir.auto_convert_hl7';
"
```

---

## 📚 Reference

### File Locations
- **FHIR Services:** `/home/apps/full-pacs/pacs-service/app/services/fhir_*.py`
- **FHIR Tasks:** `/home/apps/full-pacs/pacs-service/app/tasks/fhir_tasks.py`
- **FHIR API:** `/home/apps/full-pacs/pacs-service/app/routers/fhir.py`
- **Migration:** `/home/apps/full-pacs/pacs-service/migrations/017_create_fhir_tables.sql`
- **Tests:** `/home/apps/full-pacs/pacs-service/tests/test_*.py`
- **Documentation:** `/home/apps/full-pacs/pacs-service/FHIR_*.md`

### Important URLs
- **PACS API:** http://localhost:8003/api
- **FHIR API:** http://localhost:8003/api/fhir
- **API Docs:** http://localhost:8003/docs
- **Flower Dashboard:** http://localhost:5555

### Database Tables
- `fhir_resources` - Main FHIR resource storage
- `fhir_search_params` - Extracted search parameters
- `fhir_resource_links` - Resource relationships
- `fhir_config` - System configuration
- `fhir_transactions` - Task execution history

### Support Contacts
- **Documentation:** See FHIR_INTEGRATION_COMPLETE.md
- **Test Report:** See FHIR_INTEGRATION_TEST_REPORT.md
- **Roadmap:** See FHIR_IMPLEMENTATION_ROADMAP.md

---

**Last Updated:** 2025-11-28
**Version:** 1.0.0
**Status:** Production Ready (pending minor data format alignment)
