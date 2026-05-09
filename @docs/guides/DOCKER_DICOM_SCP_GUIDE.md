# DICOM SCP in Docker - Complete Guide

Panduan lengkap menjalankan DICOM SCP di dalam Docker container.

---

## 🚀 Quick Start (3 Langkah)

### 1. Start Container
```bash
docker-compose -f docker-compose.pacs.yml up -d pacs-service
```

### 2. Install Dependencies
```bash
./install-minimal-dicom.sh
```

### 3. Run Migration & Start SCP
```bash
./run-migration-005.sh
./start-dicom-scp.sh
```

---

## 📋 Detailed Steps

### Step 1: Start Docker Services

```bash
# Start all PACS services
docker-compose -f docker-compose.pacs.yml up -d

# Or start only pacs-service
docker-compose -f docker-compose.pacs.yml up -d pacs-service

# Check status
docker-compose -f docker-compose.pacs.yml ps
```

Expected output:
```
NAME            IMAGE                      STATUS
pacs-service    pacs-service:latest        Up
orthanc-server  orthancteam/orthanc:latest Up
```

### Step 2: Install DICOM Dependencies

**Option A: Minimal Install (Recommended)**
```bash
chmod +x install-minimal-dicom.sh
./install-minimal-dicom.sh
```

**Option B: Full Install**
```bash
chmod +x install-dicom-dependencies.sh
./install-dicom-dependencies.sh
```

**Option C: Manual Install**
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

### Step 3: Run Database Migration

```bash
chmod +x run-migration-005.sh
./run-migration-005.sh
```

Expected output:
```
==========================================
Running Migration 005: DICOM Nodes Tables
==========================================
✓ Containers are running

Database: dicom@dicom-postgres-secured:5432/worklist_db
==========================================
✓ Migration 005 applied successfully

Tables created:
 dicom_associations
 dicom_nodes
 dicom_operations

Default nodes:
 PACS_SCP     | Local PACS SCP  | pacs     | t
 CT_MODALITY  | CT Scanner      | modality | f
```

### Step 4: Start DICOM SCP Daemon

```bash
chmod +x start-dicom-scp.sh
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

2025-11-16 10:30:00 - dicom_scp - INFO - DICOM SCP initialized: PACS_SCP on port 11112
2025-11-16 10:30:00 - dicom_scp - INFO - Starting DICOM SCP: PACS_SCP on port 11112
2025-11-16 10:30:00 - dicom_scp - INFO - Waiting for connections...
```

### Step 5: Test Connection (Terminal Baru)

```bash
chmod +x test-dicom-echo.sh
./test-dicom-echo.sh
```

Expected output:
```
==========================================
Testing DICOM Connection (C-ECHO)
==========================================
Target AE Title: PACS_SCP
Host: localhost
Port: 11112
==========================================
{
  "success": true,
  "status": "online",
  "message": "Connection successful (response time: 45.2ms)",
  "response_time_ms": 45.2
}
```

---

## 🔧 Configuration

### Environment Variables (.env)

```bash
# Database
DB_HOST=dicom-postgres-secured
DB_PORT=5432
DB_NAME=worklist_db
DB_USER=dicom
DB_PASSWORD=your_password

# DICOM SCP
DICOM_SCP_AE_TITLE=PACS_SCP
DICOM_SCP_PORT=11112
DICOM_STORAGE_PATH=/var/lib/pacs/dicom-storage

# Orthanc
ORTHANC_PASSWORD=orthanc123
```

### Docker Compose Ports

```yaml
pacs-service:
  ports:
    - "8003:8003"  # FastAPI
    - "11112:11112"  # DICOM SCP (add this if needed)
```

---

## 📊 Monitoring & Management

### View Logs

```bash
# DICOM SCP logs
docker exec pacs-service tail -f /var/log/pacs/dicom_scp.log

# Container logs
docker-compose -f docker-compose.pacs.yml logs -f pacs-service

# All logs
docker-compose -f docker-compose.pacs.yml logs -f
```

### Check Running Processes

```bash
# Check if SCP is running
docker exec pacs-service ps aux | grep dicom_scp

# Check port
docker exec pacs-service netstat -tulpn | grep 11112
```

### Database Queries

```bash
# Connect to database
docker exec pacs-service bash -c "
export PGPASSWORD='${DB_PASSWORD}'
psql -h dicom-postgres-secured -U dicom -d worklist_db
"

# Quick queries
docker exec pacs-service bash -c "
export PGPASSWORD='${DB_PASSWORD}'
psql -h dicom-postgres-secured -U dicom -d worklist_db \
  -c 'SELECT * FROM dicom_nodes;'
"
```

### API Access

```bash
# List DICOM nodes
curl http://localhost:8003/api/dicom/nodes

# Test node connection
curl -X POST http://localhost:8003/api/dicom/nodes/test-connection \
  -H "Content-Type: application/json" \
  -d '{"ae_title":"PACS_SCP","host":"localhost","port":11112}'
```

---

## 🛠️ Troubleshooting

### Container Not Running

```bash
# Check container status
docker ps -a | grep pacs-service

# Start container
docker-compose -f docker-compose.pacs.yml up -d pacs-service

# View startup logs
docker-compose -f docker-compose.pacs.yml logs pacs-service
```

### Dependencies Not Installed

```bash
# Verify installation
docker exec pacs-service python -c "import pynetdicom; print(pynetdicom.__version__)"

# Reinstall
./install-minimal-dicom.sh
```

### Migration Failed

```bash
# Check database connection
docker exec pacs-service bash -c "
export PGPASSWORD='${DB_PASSWORD}'
psql -h dicom-postgres-secured -U dicom -d worklist_db -c 'SELECT 1'
"

# Re-run migration
./run-migration-005.sh
```

### Port Already in Use

```bash
# Check what's using port 11112
docker exec pacs-service netstat -tulpn | grep 11112

# Kill process
docker exec pacs-service pkill -f dicom_scp_daemon

# Or restart container
docker-compose -f docker-compose.pacs.yml restart pacs-service
```

### Cannot Connect to SCP

```bash
# Check if SCP is running
docker exec pacs-service ps aux | grep dicom_scp

# Check firewall (host machine)
sudo ufw status
sudo ufw allow 11112/tcp

# Test from inside container
docker exec pacs-service ./test-dicom-echo.sh PACS_SCP localhost 11112
```

---

## 🔄 Common Commands

### Start/Stop Services

```bash
# Start all
docker-compose -f docker-compose.pacs.yml up -d

# Stop all
docker-compose -f docker-compose.pacs.yml down

# Restart pacs-service
docker-compose -f docker-compose.pacs.yml restart pacs-service

# View status
docker-compose -f docker-compose.pacs.yml ps
```

### Execute Commands in Container

```bash
# Interactive shell
docker exec -it pacs-service bash

# Run Python script
docker exec pacs-service python /app/script.py

# Run command
docker exec pacs-service ls -la /var/lib/pacs
```

### Copy Files

```bash
# Copy from host to container
docker cp local-file.dcm pacs-service:/tmp/

# Copy from container to host
docker cp pacs-service:/var/log/pacs/dicom_scp.log ./logs/
```

---

## 📦 Complete Setup Script

Buat file `setup-dicom-scp.sh`:

```bash
#!/bin/bash
# Complete DICOM SCP Setup

set -e

echo "=========================================="
echo "DICOM SCP Complete Setup"
echo "=========================================="

# 1. Start containers
echo "1. Starting Docker containers..."
docker-compose -f docker-compose.pacs.yml up -d pacs-service
sleep 5

# 2. Install dependencies
echo "2. Installing dependencies..."
./install-minimal-dicom.sh

# 3. Run migration
echo "3. Running database migration..."
./run-migration-005.sh

# 4. Start SCP
echo "4. Starting DICOM SCP daemon..."
./start-dicom-scp.sh &
SCP_PID=$!
sleep 3

# 5. Test connection
echo "5. Testing connection..."
./test-dicom-echo.sh

echo ""
echo "=========================================="
echo "✓ Setup Complete!"
echo "=========================================="
echo ""
echo "DICOM SCP is running (PID: $SCP_PID)"
echo "Press Ctrl+C to stop"
echo ""

wait $SCP_PID
```

---

## 🎯 Production Deployment

### 1. Update docker-compose.pacs.yml

Add DICOM SCP port:
```yaml
pacs-service:
  ports:
    - "8003:8003"
    - "11112:11112"  # Add this
```

### 2. Persistent Storage

Ensure volumes are properly configured:
```yaml
volumes:
  pacs-storage:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /data/pacs-storage
```

### 3. Auto-start SCP

Add to container startup:
```dockerfile
# In Dockerfile
CMD ["sh", "-c", "python /app/dicom_scp_daemon.py & uvicorn app.main:app --host 0.0.0.0 --port 8003"]
```

### 4. Monitoring

Use Docker healthcheck:
```yaml
healthcheck:
  test: ["CMD", "python", "-c", "from app.services.dicom_echo import test_dicom_connection; exit(0 if test_dicom_connection('PACS_SCP', 'localhost', 11112)['success'] else 1)"]
  interval: 60s
  timeout: 10s
  retries: 3
```

---

## ✅ Verification Checklist

- [ ] Container running: `docker ps | grep pacs-service`
- [ ] Dependencies installed: `docker exec pacs-service python -c "import pynetdicom"`
- [ ] Migration applied: `./run-migration-005.sh`
- [ ] SCP daemon running: `docker exec pacs-service ps aux | grep dicom_scp`
- [ ] Port listening: `docker exec pacs-service netstat -tulpn | grep 11112`
- [ ] C-ECHO successful: `./test-dicom-echo.sh`
- [ ] API accessible: `curl http://localhost:8003/api/dicom/nodes`
- [ ] Logs available: `docker exec pacs-service tail /var/log/pacs/dicom_scp.log`

---

**Status**: Ready for production! 🎉
