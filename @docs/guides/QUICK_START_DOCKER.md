# DICOM SCP Docker - Quick Start

## 🚀 One Command (Recommended)

```bash
chmod +x setup-dicom-scp-complete.sh
./setup-dicom-scp-complete.sh
```

Kemudian:
```bash
./start-dicom-scp.sh
```

---

## 📋 Manual (4 Commands)

```bash
# 1. Copy files
./copy-dicom-files-to-container.sh

# 2. Install
./install-minimal-dicom.sh

# 3. Migrate
./run-migration-005.sh

# 4. Start
./start-dicom-scp.sh
```

---

## ✅ Test

```bash
./test-dicom-echo.sh
```

Expected:
```json
{
  "success": true,
  "status": "online"
}
```

---

## 🛑 Stop

```bash
docker exec pacs-service pkill -f dicom_scp_daemon
```

---

## 📚 Full Guide

See: `COMPLETE_SETUP_GUIDE.md`

---

**That's it!** 🎉
