# Database Initialization Fix

## Problem

After rebuilding master-data-service with `docker compose up -d --build --force-recreate`, the procedures tables are **not created** in the database.

## Root Cause

The Dockerfile uses **gunicorn** to run the application:
```dockerfile
CMD ["gunicorn", "--bind", "0.0.0.0:8002", "--workers", "4", "--chdir", "/app", "app:app"]
```

When gunicorn starts, it **imports** `app.py` as a module. This means:
- ❌ The `if __name__ == '__main__':` block is **never executed**
- ❌ The `init_database()` function is **never called**
- ❌ Database tables are **not created**

## Solution

We've created an **entrypoint script** that:
1. ✅ Waits for PostgreSQL to be ready
2. ✅ Runs `init_database()` via separate script (`init_db.py`)
3. ✅ Then starts gunicorn

### Files Added/Modified

**New Files:**
1. `entrypoint.sh` - Startup script that initializes DB before starting app
2. `init_db.py` - Standalone script to call `init_database()`
3. `rebuild_service.sh` - Helper script to rebuild and restart service

**Modified Files:**
1. `Dockerfile` - Updated to:
   - Install `postgresql-client` (for `pg_isready`)
   - Use `entrypoint.sh` instead of direct CMD
   - Make entrypoint executable

## How to Apply the Fix

### Option 1: Use Rebuild Script (Recommended)

```bash
cd /home/apps/fullstack-orthanc-dicom/master-data-service
./rebuild_service.sh
```

This will:
- Stop and remove current container
- Build new image with entrypoint
- Start service with database initialization
- Show logs and verify tables

### Option 2: Manual Steps

```bash
cd /home/apps/fullstack-orthanc-dicom

# Stop and remove service
docker compose stop master-data-service
docker compose rm -f master-data-service

# Rebuild with new Dockerfile
docker compose build master-data-service

# Start service
docker compose up -d master-data-service

# Watch logs to see initialization
docker compose logs master-data-service -f
```

## Verification

### 1. Check Logs

Look for these messages in logs:
```
========================================
Initializing Master Data Service Database Schema
========================================
Master Data Service database initialized
========================================
Database initialization completed successfully
========================================
Starting gunicorn...
```

View logs:
```bash
docker compose logs master-data-service --tail=50
```

### 2. Check Tables Created

```bash
# Connect to database
docker exec -it postgres psql -U dicom -d worklist_db

# List all tables
\dt

# You should see:
# - patients
# - doctors
# - procedures
# - procedure_modalities
# - procedure_contraindications
# - procedure_equipment
# - procedure_protocols
# - procedure_audit_log
# - loinc_codes
# - settings

# Exit
\q
```

Or one-liner:
```bash
docker exec postgres psql -U dicom -d worklist_db -c "\dt" | grep -i procedure
```

### 3. Check Procedures Table Structure

```bash
docker exec postgres psql -U dicom -d worklist_db -c "\d procedures"
```

Expected output should show columns:
- id (uuid)
- code (varchar)
- name (varchar)
- loinc_code (varchar)
- satusehat_code (varchar)
- etc.

## Seeding Data

After tables are created, seed with sample procedures:

```bash
cd /home/apps/fullstack-orthanc-dicom/master-data-service
python seed_procedures.py
```

Expected output:
```
================================================================================
Master Data Service - Procedures Seeding Script
================================================================================
✓ Database connection successful
Seeding completed:
  - Inserted: 15 procedures
  - Skipped: 0 procedures (already exist)
  - Total: 15 procedures in seed file
================================================================================
```

## Testing API

Once data is seeded, test via API Gateway:

```bash
# List procedures
curl -X GET "http://localhost:8080/procedures" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Search procedures
curl -X GET "http://localhost:8080/procedures/search?q=chest" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get specific procedure
curl -X GET "http://localhost:8080/procedures/CR-CHEST-2V" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Troubleshooting

### Issue: "Database initialization failed"

**Check PostgreSQL is running:**
```bash
docker compose ps postgres
docker compose logs postgres --tail=20
```

**Check credentials in .env:**
```bash
cat .env | grep POSTGRES
```

**Test connection manually:**
```bash
docker exec postgres psql -U dicom -d worklist_db -c "SELECT version();"
```

### Issue: "pg_isready: command not found"

This means the Dockerfile wasn't rebuilt with `postgresql-client`.

**Solution:**
```bash
docker compose build --no-cache master-data-service
docker compose up -d master-data-service
```

### Issue: Tables created but empty

Run the seed script:
```bash
cd master-data-service
python seed_procedures.py
```

### Issue: Permission denied on entrypoint.sh

Make it executable:
```bash
chmod +x master-data-service/entrypoint.sh
docker compose build master-data-service
docker compose up -d master-data-service
```

### Issue: Worker boot errors

Check for Python errors in init_db.py:
```bash
docker compose logs master-data-service --tail=100 | grep -i error
```

## Understanding the Flow

### Before Fix
```
Docker Start → Gunicorn → Import app.py → Run Flask
                                ↓
                        (if __name__ == '__main__' SKIPPED)
                                ↓
                        init_database() NEVER CALLED
                                ↓
                        NO TABLES CREATED ❌
```

### After Fix
```
Docker Start → entrypoint.sh
                    ↓
            Wait for PostgreSQL
                    ↓
            Run init_db.py
                    ↓
            Call init_database()
                    ↓
            TABLES CREATED ✅
                    ↓
            Start Gunicorn → Import app.py → Run Flask
```

## Key Changes in Dockerfile

### Before:
```dockerfile
CMD ["gunicorn", "--bind", "0.0.0.0:8002", "--workers", "4", "--chdir", "/app", "app:app"]
```

### After:
```dockerfile
# Install postgresql-client for pg_isready
RUN apt-get update && apt-get install -y postgresql-client

# Copy and make entrypoint executable
COPY . .
RUN chmod +x /app/entrypoint.sh

# Use entrypoint instead of CMD
ENTRYPOINT ["/app/entrypoint.sh"]
```

## Summary

✅ **Fixed:** Database initialization now runs automatically on service start
✅ **Added:** Proper waiting for PostgreSQL to be ready
✅ **Added:** Clear logging of initialization process
✅ **Added:** Helper scripts for rebuild and testing

## Next Steps

1. **Rebuild service:** `./rebuild_service.sh`
2. **Verify tables:** Check logs and database
3. **Seed data:** Run `seed_procedures.py`
4. **Test API:** Use curl or Postman
5. **Configure permissions:** Ensure users have `procedure:*` permissions

## References

- `entrypoint.sh` - Startup orchestration
- `init_db.py` - Database initialization
- `app.py` - Main application with init_database()
- `seed_procedures.py` - Sample data import
- `PROCEDURES_README.md` - API documentation
- `MIGRATION_GUIDE.md` - Migration strategies
