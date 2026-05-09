# PACS Storage Advanced Features - Quick Start

🚀 **Version 2.0** | ✅ **Production Ready**

## What's New

Fitur-fitur advanced storage yang telah diimplementasikan:

### ✅ 1. DICOM Compression (30-70% Savings)
- Automatic Deflate compression saat upload
- Hanya compress jika menghemat >2% space
- Tracking: compression ratio, original size, transfer syntax

### ✅ 2. Hash-based Deduplication
- SHA256 hash check sebelum upload
- Skip duplicate files otomatis
- Update accessed_at untuk existing files

### ✅ 3. Storage Quotas & Enforcement
- Pre-upload quota check
- Reject upload jika melebihi `max_size_gb`
- Automatic stats update after operations

### ✅ 4. Background Jobs (Celery + Redis)
**Scheduled Tasks:**
- 🔄 Orphan cleanup (Daily 2 AM)
- 🔄 Cold migration (Weekly Sunday 3 AM)
- 🔄 Deleted files cleanup (30+ days)
- 🔄 Health checks (Every 15 min)
- 🔄 Stats update (Hourly)

### ✅ 5. Bulk Operations API
- Bulk upload (multiple files/ZIP)
- Bulk download (as ZIP)
- Bulk migration (tier changes)
- Bulk search (advanced filters)

### ✅ 6. Prometheus Metrics
- Storage usage metrics
- DICOM file statistics
- Compression ratios
- System health monitoring

---

## Quick Start

### 1. Install Dependencies
```bash
cd /home/apps/full-pacs/pacs-service
pip install -r requirements.txt
```

### 2. Start Background Services
```bash
# Start Redis + Celery workers
docker-compose -f docker-compose.celery.yml up -d

# Check status
docker-compose -f docker-compose.celery.yml ps
```

### 3. Verify Installation
```bash
# Test API
curl http://localhost:8003/api/metrics/health

# View Flower dashboard
open http://localhost:5555
```

---

## Usage Examples

### Bulk Upload DICOM Files
```bash
curl -X POST http://localhost:8003/api/bulk/upload \
  -F "files=@image1.dcm" \
  -F "files=@image2.dcm" \
  -F "files=@image3.dcm" \
  -F "tier=hot" \
  -F "validate_dicom=true" \
  -F "skip_duplicates=true"
```

### Upload ZIP Archive
```bash
curl -X POST http://localhost:8003/api/bulk/upload/zip \
  -F "zip_file=@study.zip" \
  -F "tier=hot"
```

### Check Metrics
```bash
# Prometheus format
curl http://localhost:8003/api/metrics

# JSON format
curl http://localhost:8003/api/metrics/json
```

### Manual Cleanup Task
```bash
# Python
from app.tasks.cleanup_tasks import cleanup_orphan_files
result = cleanup_orphan_files.delay(dry_run=True)
print(result.get())

# Or via CLI
celery -A app.celery_app call app.tasks.cleanup_tasks.cleanup_orphan_files --args='[]' --kwargs='{"dry_run": true}'
```

---

## Monitoring

### Flower Dashboard (Celery)
- URL: http://localhost:5555
- Monitor: Active tasks, worker status, queue depth

### Prometheus Metrics
- Endpoint: http://localhost:8003/api/metrics
- Grafana: Configure scraping from this endpoint

### Health Check
- Endpoint: http://localhost:8003/api/metrics/health
- Returns: Database status, storage health

---

## API Endpoints

### Bulk Operations
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/bulk/upload` | POST | Upload multiple DICOM files |
| `/api/bulk/upload/zip` | POST | Upload from ZIP archive |
| `/api/bulk/download` | POST | Download files as ZIP |
| `/api/bulk/migrate` | POST | Migrate files to different tier |
| `/api/bulk/search` | POST | Search DICOM files |
| `/api/bulk/tasks/{task_id}` | GET | Get task status |

### Metrics
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/metrics` | GET | Prometheus metrics |
| `/api/metrics/json` | GET | JSON metrics |
| `/api/metrics/health` | GET | Health check |

---

## File Locations

### Code
```
pacs-service/
├── app/
│   ├── celery_app.py              # Celery config
│   ├── tasks/                     # Background tasks
│   │   ├── cleanup_tasks.py       # Orphan cleanup
│   │   ├── migration_tasks.py     # Tier migration
│   │   └── storage_tasks.py       # Stats & health
│   ├── api/
│   │   ├── bulk_operations.py     # Bulk upload/download
│   │   └── metrics.py             # Prometheus metrics
│   └── services/
│       └── dicom_storage_service_v2.py  # Storage service
├── docker-compose.celery.yml      # Celery services
└── requirements.txt               # Dependencies (updated)
```

### Backups
```
backups/20251123_235101/
├── dicom_storage_service_v2.py
├── dicom_file.py
└── storage_location.py
```

---

## Configuration

### Environment Variables
```bash
# .env
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
DATABASE_URL=postgresql://user:pass@host:5432/pacs
```

### Storage Quotas
```sql
-- Set quota for storage location
UPDATE storage_locations
SET max_size_gb = 100
WHERE name = 'Hot Storage';
```

### Scheduled Tasks
Edit `app/celery_app.py` untuk mengubah schedule:
```python
celery_app.conf.beat_schedule = {
    'cleanup-orphan-files-daily': {
        'task': 'app.tasks.cleanup_tasks.cleanup_orphan_files',
        'schedule': crontab(hour=2, minute=0),  # Change time here
        'kwargs': {'dry_run': False}
    },
    # ...
}
```

---

## Troubleshooting

### Celery Workers Not Running
```bash
# Check worker status
celery -A app.celery_app inspect active

# Restart workers
docker-compose -f docker-compose.celery.yml restart
```

### High Memory Usage
```bash
# Check worker memory
docker stats pacs-celery-storage

# Reduce concurrency
# Edit docker-compose.celery.yml: -c 2 (instead of 4)
```

### Storage Quota Issues
```sql
-- Check current usage
SELECT name, tier, current_size_gb, max_size_gb,
       (current_size_gb / max_size_gb * 100) as usage_percent
FROM storage_locations;

-- Update quota
UPDATE storage_locations SET max_size_gb = 200 WHERE id = 'uuid';
```

---

## Performance Tips

1. **Celery Workers:** Adjust concurrency based on workload
   - I/O-bound (upload/download): Higher concurrency (10+)
   - CPU-bound (compression): Lower concurrency (2-4)

2. **Redis Memory:** Monitor with `redis-cli info memory`

3. **Compression Threshold:** Adjust in `dicom_storage_service_v2.py`
   ```python
   if compressed_size < original_size * 0.98:  # 2% minimum savings
   ```

4. **Batch Size:** Adjust migration batch size
   ```python
   migrate_old_files_to_cold.delay(days_threshold=90, batch_size=50)
   ```

---

## Documentation

📖 **Full Documentation:** `/home/apps/full-pacs/PACS_STORAGE_ADVANCED_FEATURES.md`
📊 **Feature Analysis:** `/home/apps/full-pacs/PACS_STORAGE_FEATURES.md`

---

## Support

Untuk pertanyaan atau issues:
1. Check logs: `docker-compose -f docker-compose.celery.yml logs`
2. Check Flower: http://localhost:5555
3. Check metrics: http://localhost:8003/api/metrics/json

---

**🎉 Ready to Use!**

Semua fitur sudah production-ready dan ter-dokumentasi lengkap.
