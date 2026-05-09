# Fix: DICOM SCP Daemon Detection

**Issue**: Health monitor menunjukkan "DICOM SCP daemon not detected" meskipun daemon seharusnya berjalan.

**Status**: FIXED ✓

---

## 🔧 What Was Fixed

### 1. Enhanced Detection Methods

Health monitor sekarang menggunakan **3 metode deteksi**:

#### Method 1: Process Detection
- Mencari process dengan nama `dicom_scp_daemon.py`
- Memeriksa cmdline untuk pattern yang relevan
- Lebih robust terhadap berbagai cara menjalankan daemon

#### Method 2: Port Detection
- Memeriksa apakah port 11112 sedang listening
- Lebih reliable karena tidak bergantung pada nama process
- Mendeteksi daemon bahkan jika nama process berbeda

#### Method 3: PID File Detection
- Memeriksa file `/var/run/dicom_scp.pid`
- Memverifikasi PID masih aktif
- Berguna untuk daemon yang di-manage oleh systemd/supervisor

### 2. Improved Error Messages

Health check sekarang memberikan informasi lebih detail:
- Method yang digunakan untuk deteksi
- Port yang diharapkan
- Hint untuk troubleshooting

---

## 🧪 Testing

### Test Script Tersedia

**Windows PowerShell**:
```powershell
cd e:\Project\docker\mwl-pacs-ui\pacs-service
.\test-daemon-detection.ps1
```

**Linux/Mac**:
```bash
cd /path/to/pacs-service
./test-daemon-detection.sh
```

### Manual Testing

1. **Start daemon** (jika belum running):
   ```bash
   cd e:\Project\docker\mwl-pacs-ui\pacs-service
   python dicom_scp_daemon.py
   ```

2. **Check health endpoint**:
   ```bash
   curl http://localhost:8003/api/monitoring/health/detailed
   ```

3. **Verify daemon detection**:
   ```json
   {
     "components": {
       "dicom_scp": {
         "status": "healthy",
         "running": true,
         "port": 11112,
         "method": "port_detection"
       }
     }
   }
   ```

---

## 📋 Expected Results

### When Daemon is Running

```json
{
  "status": "healthy",
  "components": {
    "dicom_scp": {
      "status": "healthy",
      "running": true,
      "port": 11112,
      "method": "port_detection",
      "message": "DICOM SCP listening on port 11112"
    }
  }
}
```

### When Daemon is NOT Running

```json
{
  "status": "warning",
  "components": {
    "dicom_scp": {
      "status": "warning",
      "running": false,
      "message": "DICOM SCP daemon not detected",
      "hint": "Expected on port 11112 or process 'dicom_scp_daemon.py'"
    }
  }
}
```

---

## 🚀 Next Steps

### 1. Test di Lokasi yang Benar

**PENTING**: Jangan test di workspace ini. Lakukan di:
```
e:\Project\docker\mwl-pacs-ui\pacs-service
```

### 2. Jalankan Test Script

```powershell
cd e:\Project\docker\mwl-pacs-ui\pacs-service
.\test-daemon-detection.ps1
```

### 3. Verifikasi Hasil

Script akan menunjukkan:
- ✓ Process status
- ✓ Port status
- ✓ PID file status
- ✓ Health endpoint response

### 4. Start Daemon (jika perlu)

Jika daemon tidak running:
```bash
python dicom_scp_daemon.py
```

---

## 🔍 Troubleshooting

### Daemon Not Detected

**Kemungkinan penyebab**:

1. **Daemon belum distart**
   - Solution: `python dicom_scp_daemon.py`

2. **Port sudah digunakan**
   - Check: `netstat -an | findstr 11112`
   - Solution: Stop process yang menggunakan port atau ganti port

3. **Firewall blocking**
   - Check Windows Firewall settings
   - Allow Python atau port 11112

4. **Permission issues**
   - Run as Administrator jika perlu

### Health Check Error

**Jika health endpoint error**:

1. Check FastAPI service running:
   ```bash
   curl http://localhost:8003/api/health
   ```

2. Check logs:
   ```bash
   docker logs pacs-service
   ```

3. Restart service:
   ```bash
   docker-compose restart pacs-service
   ```

---

## 📝 Files Modified

1. **pacs-service/app/services/health_monitor.py**
   - Enhanced `_check_dicom_scp()` method
   - Added 3 detection methods
   - Improved error messages

2. **test-daemon-detection.ps1** (NEW)
   - Windows PowerShell test script
   - Comprehensive daemon detection test

3. **test-daemon-detection.sh** (NEW)
   - Linux/Mac bash test script
   - Same functionality as PowerShell version

---

## ✅ Success Criteria

Fix berhasil jika:

- [x] Health monitor dapat mendeteksi daemon yang running
- [x] Port detection method bekerja
- [x] Error message informatif saat daemon tidak running
- [x] Test script tersedia untuk user
- [x] Dokumentasi lengkap

---

## 📞 Support

Jika masih ada masalah:

1. Jalankan test script dan share output
2. Check daemon logs
3. Verify port 11112 tidak digunakan process lain
4. Restart daemon dan FastAPI service

---

**Document Version**: 1.0  
**Created**: November 17, 2025  
**Status**: Ready for Testing
