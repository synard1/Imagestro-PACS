# Quick Commands Reference

## 🚀 Essential Commands

### Check System Health
```bash
curl http://localhost:8003/api/monitoring/health/detailed | python -m json.tool
```

### Run Full Test
```bash
./test-daemon-detection.sh
```

### Check Daemon Status
```bash
# Check process
ps aux | grep dicom_scp_daemon

# Check port
netstat -an | grep 11112
# or
ss -tuln | grep 11112

# Check PID file
cat /var/run/dicom_scp.pid
```

---

## 🔧 Daemon Management

### Start Daemon
```bash
cd /path/to/pacs-service
python dicom_scp_daemon.py
```

### Stop Daemon
```bash
pkill -f dicom_scp_daemon
```

### Restart Daemon
```bash
pkill -f dicom_scp_daemon && python dicom_scp_daemon.py
```

### Check Daemon Logs
```bash
tail -f dicom_scp.log
```

---

## 🐳 Docker Commands

### Check Container
```bash
docker ps | grep pacs-service
```

### Container Logs
```bash
docker logs pacs-service
docker logs -f pacs-service  # follow
```

### Execute in Container
```bash
docker exec -it pacs-service bash
```

### Restart Container
```bash
docker-compose restart pacs-service
```

---

## 📊 Monitoring

### Health Check
```bash
# Simple
curl http://localhost:8003/api/health

# Detailed
curl http://localhost:8003/api/monitoring/health/detailed
```

### Check Database
```bash
docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db -c "SELECT COUNT(*) FROM dicom_files;"
```

### Check Storage
```bash
du -sh /var/lib/pacs/dicom-storage
```

---

## 🧪 Testing

### Send Test DICOM
```bash
./test-dicom-storage.sh
```

### Test C-ECHO
```bash
echoscu -aec PACS_SCP localhost 11112
```

### Test C-STORE
```bash
storescu -aec PACS_SCP localhost 11112 test.dcm
```

---

## 🔍 Troubleshooting

### Check Port Usage
```bash
# Who's using port 11112?
lsof -i :11112
# or
netstat -tulpn | grep 11112
```

### Check Disk Space
```bash
df -h /var/lib/pacs/dicom-storage
```

### Check Memory
```bash
free -h
```

### Check Processes
```bash
ps aux | grep python
```

---

## 📝 Logs

### View Logs
```bash
# Daemon log
tail -f dicom_scp.log

# Container log
docker logs -f pacs-service

# System log
journalctl -u pacs-service -f
```

### Clear Logs
```bash
# Truncate log file
> dicom_scp.log

# Rotate logs
mv dicom_scp.log dicom_scp.log.old
```

---

## 🎯 Quick Checks

### Is Everything Running?
```bash
# One-liner health check
curl -s http://localhost:8003/api/monitoring/health/detailed | grep -o '"status":"[^"]*"' | head -1
```

### Count Received Files
```bash
# Database count
docker exec -it dicom-postgres-secured psql -U dicom -d worklist_db -c "SELECT COUNT(*) FROM dicom_files;"

# File system count
find /var/lib/pacs/dicom-storage -name "*.dcm" | wc -l
```

### System Resources
```bash
# Quick resource check
echo "CPU: $(top -bn1 | grep "Cpu(s)" | awk '{print $2}')"
echo "Memory: $(free -h | grep Mem | awk '{print $3 "/" $2}')"
echo "Disk: $(df -h /var/lib/pacs/dicom-storage | tail -1 | awk '{print $3 "/" $2 " (" $5 ")"}')"
```

---

**Quick Reference - Keep this handy!**
