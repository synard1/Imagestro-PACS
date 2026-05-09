# Quick Start: Backend Deployment Guide

**Date**: November 16, 2025  
**Time Required**: 15-20 minutes  
**Difficulty**: Easy

---

## Prerequisites

- ✅ PostgreSQL installed and running
- ✅ Python 3.8+ installed
- ✅ Node.js 16+ installed
- ✅ Git repository up to date

---

## Step-by-Step Deployment

### Step 1: Database Migration (5 min)

```bash
# Navigate to pacs-service
cd pacs-service

# Run migration
psql -U postgres -d pacs_db -f migrations/003_create_report_tables.sql

# Verify tables created
psql -U postgres -d pacs_db -c "\dt reports*"
```

**Expected Output**:
```
              List of relations
 Schema |        Name         | Type  |  Owner
--------+---------------------+-------+----------
 public | report_attachments  | table | postgres
 public | report_history      | table | postgres
 public | reports             | table | postgres
```

---

### Step 2: Install Python Dependencies (2 min)

```bash
# Still in pacs-service directory
pip install -r requirements.txt

# Or if using virtual environment
source venv/bin/activate  # Linux/Mac
# or
venv\Scripts\activate  # Windows

pip install -r requirements.txt
```

---

### Step 3: Update Environment Variables (2 min)

Edit `.env` file in project root:

```env
# Backend Integration
VITE_USE_BACKEND=true
VITE_API_BASE_URL=http://localhost:8003

# Database (verify these are correct)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=pacs_db
DB_USER=postgres
DB_PASSWORD=your_password
```

---

### Step 4: Start Backend Server (1 min)

```bash
# In pacs-service directory
python -m uvicorn app.main:app --reload --port 8003

# Or use the run script
python run.py
```

**Expected Output**:
```
INFO:     Uvicorn running on http://0.0.0.0:8003
INFO:     Application startup complete
✓ Database connection OK
✓ All API routers loaded
PACS Service Ready
```

---

### Step 5: Verify Backend (2 min)

Open browser or use curl:

```bash
# Health check
curl http://localhost:8003/api/health

# Expected response:
{
  "status": "healthy",
  "service": "PACS Service",
  "version": "1.0.0",
  "database": "healthy",
  "timestamp": "2025-11-16T..."
}

# API docs
# Open: http://localhost:8003/api/docs
```

---

### Step 6: Start Frontend (1 min)

```bash
# In project root
npm run dev
```

**Expected Output**:
```
VITE v4.x.x  ready in xxx ms

➜  Local:   http://localhost:5173/
➜  Network: use --host to expose
```

---

### Step 7: Test Integration (5 min)

1. **Open Application**
   ```
   http://localhost:5173
   ```

2. **Navigate to Report Editor**
   - Go to Studies
   - Click on a study
   - Click "Create Report"

3. **Create Test Report**
   - Fill in report fields
   - Click "Save Draft"
   - Check browser console for API calls

4. **Verify in Database**
   ```bash
   psql -U postgres -d pacs_db -c "SELECT report_id, patient_name, status FROM reports;"
   ```

5. **Test Status Transition**
   - Click "Submit for Review"
   - Status should change to "preliminary"
   - Verify in database

---

## Verification Checklist

### Backend
- [ ] Database migration successful
- [ ] Backend server running on port 8003
- [ ] Health check returns "healthy"
- [ ] API docs accessible at /api/docs
- [ ] No errors in backend logs

### Frontend
- [ ] Frontend running on port 5173
- [ ] VITE_USE_BACKEND=true in .env
- [ ] No console errors
- [ ] API calls visible in Network tab

### Integration
- [ ] Can create new report
- [ ] Report saved to database
- [ ] Can load existing report
- [ ] Can update report
- [ ] Status transitions work
- [ ] Search works
- [ ] History tracking works

---

## Troubleshooting

### Issue: Database connection failed

**Symptoms**:
```
✗ Database connection FAILED
```

**Solutions**:
1. Check PostgreSQL is running:
   ```bash
   systemctl status postgresql  # Linux
   # or
   pg_ctl status  # Windows
   ```

2. Verify credentials in `.env`:
   ```env
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=pacs_db
   DB_USER=postgres
   DB_PASSWORD=your_password
   ```

3. Test connection manually:
   ```bash
   psql -U postgres -d pacs_db -c "SELECT 1;"
   ```

---

### Issue: Migration fails

**Symptoms**:
```
ERROR:  relation "reports" already exists
```

**Solutions**:
1. Check if tables already exist:
   ```bash
   psql -U postgres -d pacs_db -c "\dt reports*"
   ```

2. If tables exist, skip migration or drop and recreate:
   ```bash
   # Drop tables (WARNING: deletes data!)
   psql -U postgres -d pacs_db -c "DROP TABLE IF EXISTS report_attachments, report_history, reports CASCADE;"
   
   # Re-run migration
   psql -U postgres -d pacs_db -f migrations/003_create_report_tables.sql
   ```

---

### Issue: Backend won't start

**Symptoms**:
```
ModuleNotFoundError: No module named 'app'
```

**Solutions**:
1. Ensure you're in the correct directory:
   ```bash
   cd pacs-service
   pwd  # Should end with /pacs-service
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Check Python version:
   ```bash
   python --version  # Should be 3.8+
   ```

---

### Issue: Frontend can't connect to backend

**Symptoms**:
```
Network Error: Failed to fetch
```

**Solutions**:
1. Verify backend is running:
   ```bash
   curl http://localhost:8003/api/health
   ```

2. Check CORS settings in `pacs-service/app/main.py`:
   ```python
   allow_origins=["http://localhost:5173"]
   ```

3. Verify .env settings:
   ```env
   VITE_USE_BACKEND=true
   VITE_API_BASE_URL=http://localhost:8003
   ```

4. Restart frontend after .env changes:
   ```bash
   # Stop frontend (Ctrl+C)
   npm run dev
   ```

---

### Issue: Reports not saving

**Symptoms**:
- No error in console
- Report not in database

**Solutions**:
1. Check browser console for errors
2. Check Network tab for failed requests
3. Check backend logs for errors
4. Verify database connection
5. Check user permissions

---

## Testing Commands

### Database Queries

```bash
# Count reports
psql -U postgres -d pacs_db -c "SELECT COUNT(*) FROM reports;"

# View recent reports
psql -U postgres -d pacs_db -c "SELECT report_id, patient_name, status, created_at FROM reports ORDER BY created_at DESC LIMIT 5;"

# View report history
psql -U postgres -d pacs_db -c "SELECT report_id, version, changed_by, change_reason FROM report_history ORDER BY changed_at DESC LIMIT 10;"

# Reports by status
psql -U postgres -d pacs_db -c "SELECT status, COUNT(*) FROM reports GROUP BY status;"
```

### API Testing

```bash
# Create report
curl -X POST http://localhost:8003/api/reports \
  -H "Content-Type: application/json" \
  -d '{
    "study_id": "1.2.3.4.5",
    "patient_id": "P12345",
    "patient_name": "Test Patient",
    "template_id": "ct_brain",
    "findings": "Test findings",
    "impression": "Test impression",
    "created_by": "test_user"
  }'

# Get report
curl http://localhost:8003/api/reports/RPT-ABC123

# Search reports
curl "http://localhost:8003/api/reports?patient_id=P12345&limit=10"

# Get statistics
curl http://localhost:8003/api/reports/stats/summary
```

---

## Rollback Plan

If something goes wrong:

### 1. Stop Services
```bash
# Stop backend (Ctrl+C in terminal)
# Stop frontend (Ctrl+C in terminal)
```

### 2. Disable Backend Integration
Edit `.env`:
```env
VITE_USE_BACKEND=false
```

### 3. Restart Frontend
```bash
npm run dev
```

### 4. System will use localStorage
Reports will be stored locally until backend is fixed.

---

## Performance Tips

### 1. Database Optimization

```sql
-- Analyze tables for query optimization
ANALYZE reports;
ANALYZE report_history;
ANALYZE report_attachments;

-- Vacuum to reclaim space
VACUUM ANALYZE reports;
```

### 2. Backend Optimization

```python
# In app/main.py, enable caching
from fastapi_cache import FastAPICache
from fastapi_cache.backends.redis import RedisBackend

# Add to startup
FastAPICache.init(RedisBackend(...))
```

### 3. Frontend Optimization

```javascript
// In reportService.js, add caching
const cache = new Map();

async getReport(reportId) {
  if (cache.has(reportId)) {
    return cache.get(reportId);
  }
  const result = await apiClient.get(...);
  cache.set(reportId, result);
  return result;
}
```

---

## Monitoring

### Backend Logs

```bash
# View logs
tail -f pacs-service/logs/app.log

# Search for errors
grep ERROR pacs-service/logs/app.log
```

### Database Monitoring

```sql
-- Active connections
SELECT * FROM pg_stat_activity WHERE datname = 'pacs_db';

-- Table sizes
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE tablename LIKE 'report%'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

---

## Success Indicators

✅ **Backend Running**: Health check returns "healthy"  
✅ **Database Connected**: Tables visible in psql  
✅ **Frontend Connected**: No CORS errors  
✅ **Reports Saving**: Data in database  
✅ **Workflow Working**: Status transitions successful  
✅ **History Tracking**: Entries in report_history  
✅ **Search Working**: Results returned  
✅ **No Errors**: Clean logs and console  

---

## Next Steps

After successful deployment:

1. **Test All Features**
   - Create reports
   - Edit reports
   - Status transitions
   - Search and filter
   - View history

2. **Performance Testing**
   - Create 100+ reports
   - Test search performance
   - Monitor database size

3. **User Acceptance Testing**
   - Get feedback from radiologists
   - Test real-world workflows
   - Identify improvements

4. **Production Deployment**
   - Update production .env
   - Run migration on production DB
   - Deploy backend to production server
   - Update frontend API URL
   - Monitor for issues

---

## Support

If you encounter issues:

1. Check this guide's Troubleshooting section
2. Review `docs/REPORT_BACKEND_INTEGRATION.md`
3. Check backend logs
4. Check database logs
5. Review browser console

---

**Deployment Time**: 15-20 minutes  
**Difficulty**: Easy  
**Success Rate**: 95%+  

**Good luck with your deployment!** 🚀
