# Database Migrations

This directory contains database migration scripts for the Accession API.

## Migration 001: UUID Primary Key

**File**: `001_migrate_to_uuid.sql`

**Purpose**: Convert the `accessions` table primary key from `bigserial` to `UUID` for future-proofing and consistency with other services.

### What this migration does:

1. **Enables UUID extension**: Adds `uuid-ossp` extension for UUID generation
2. **Adds UUID column**: Creates new `uuid_id` column with auto-generated UUIDs
3. **Populates existing data**: Generates UUIDs for all existing records
4. **Updates primary key**: Replaces the old `bigserial` primary key with UUID
5. **Preserves old IDs**: Keeps the original IDs in `old_id` column for backward compatibility
6. **Adds indexes**: Creates index on `old_id` for potential legacy queries

### Running the migration:

```bash
# Connect to your PostgreSQL database
psql -h localhost -U orthanc -d orthanc

# Run the migration
\i migrations/001_migrate_to_uuid.sql
```

### Verification:

After running the migration, verify the results:

```sql
-- Check migration status
SELECT 'Migration completed successfully' as status;

-- Verify all records have UUIDs
SELECT COUNT(*) as total_records, COUNT(DISTINCT id) as unique_uuids FROM accessions;

-- Sample data check
SELECT id, old_id, accession_no FROM accessions LIMIT 5;
```

### Rollback (if needed):

If you need to rollback this migration:

```sql
BEGIN;
ALTER TABLE accessions DROP CONSTRAINT accessions_pkey;
ALTER TABLE accessions RENAME COLUMN id TO uuid_id;
ALTER TABLE accessions RENAME COLUMN old_id TO id;
ALTER TABLE accessions ADD CONSTRAINT accessions_pkey PRIMARY KEY (id);
DROP INDEX IF EXISTS idx_accessions_old_id;
ALTER TABLE accessions DROP COLUMN uuid_id;
COMMIT;
```

### Impact:

- **Backward compatibility**: Old integer IDs are preserved in `old_id` column
- **API compatibility**: No changes to API responses (they use `accession_no`, not `id`)
- **Future-proofing**: UUID primary keys provide better scalability and uniqueness
- **Consistency**: Aligns with other services in the system that use UUIDs