# Docker DICOM SCP - Quick Start

## 🚀 3 Commands to Start

```bash
# 1. Start container
docker-compose -f docker-compose.pacs.yml up -d pacs-service

# 2. Install & migrate
./install-minimal-dicom.sh && ./run-migration-005.sh

# 3. Start SCP
./start-dicom-scp.sh
```

---

## ✅ Verify

```bash
# Test connection
./test-dicom-echo.sh

# Expected: {"success": true, "status": "online"}
```

---

## 📊 Monitor

```bash
# View logs
docker-compose -f docker-compose.pacs.yml logs -f pacs-service

# Check process
docker exec pacs-service ps aux | grep dicom_scp
```

---

## 🛑 Stop

```bash
# Stop SCP
docker exec pacs-service pkill -f dicom_scp_daemon

# Stop container
docker-compose -f docker-compose.pacs.yml down
```

---

## 🐛 Troubleshoot

```bash
# Container not running?
docker-compose -f docker-compose.pacs.yml up -d pacs-service

# Dependencies missing?
./install-minimal-dicom.sh

# Migration failed?
./run-migration-005.sh

# Can't connect?
docker exec pacs-service netstat -tulpn | grep 11112
```

---

## 📚 Full Guide

See: `DOCKER_DICOM_SCP_GUIDE.md`

---

**All scripts now run inside Docker container!** 🎉
