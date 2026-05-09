# Quick Start Doctor Seeder

This guide provides a quick way to seed doctor data into the master data service.

## Prerequisites

1. Python 3.8+
2. PostgreSQL database running
3. Required Python packages installed:
   ```bash
   pip install -r requirements.txt
   ```

## Quick Start

### 1. Prepare the JSON File

Ensure `docs/doctors.json` exists with the following format:

```json
[
  {
    "_meta": {
      "version": "1.0",
      "generated_at": "2025-01-15T10:30:00Z"
    }
  },
  {
    "ihs_number": "10009880728",
    "national_id": "7209061211900001",
    "name": "dr. Alexander",
    "license": "STR-7209061211900001",
    "specialty": "General",
    "phone": "+62-812-0001-0001",
    "email": "dr.alexander@hospital.com",
    "birth_date": "1994-01-01",
    "gender": "M"
  }
]
```

### 2. Set Environment Variables

```bash
export POSTGRES_HOST=localhost
export POSTGRES_DB=worklist_db
export POSTGRES_USER=dicom
export POSTGRES_PASSWORD=dicom123
```

### 3. Run the Seeder

```bash
python seed_doctors.py
```

## Expected Output

```
✓ Connected to database: localhost:5432/worklist_db
✓ Loaded 1 doctors from ../docs/doctors.json
[1/1] Processing...
✓ Created: dr. Alexander (ID: d1a2b3c4-e5f6-7890-abcd-ef1234567890)
✓ All changes committed to database

======================================================================
SEEDING SUMMARY
======================================================================
Total doctors processed: 1
✓ Successfully created:  1
⊗ Skipped (duplicates):  0
✗ Errors:                0
======================================================================
Success Rate: 100.0%
```

## Troubleshooting

### Common Issues

1. **Database Connection Error**
   ```
   ✗ Database connection failed: could not connect to server
   ```
   Solution: Check PostgreSQL is running and credentials are correct.

2. **JSON File Not Found**
   ```
   ✗ JSON file not found: ../docs/doctors.json
   ```
   Solution: Ensure the JSON file exists in the correct location.

3. **Duplicate Doctor**
   ```
   ⊗ Skipped: dr. Alexander (already exists - ID: d1a2b3c4-e5f6-7890-abcd-ef1234567890)
   ```
   Solution: This is normal if the doctor already exists. No action needed.

4. **Missing Required Field**
   ```
   ✗ Failed: dr. Alexander - Name is required
   ```
   Solution: Ensure all required fields (especially `name`) are present.

### Checking Results

Verify doctors were added by querying the database:

```sql
SELECT id, name, ihs_number, email FROM doctors;
```

Or use the API:

```bash
curl -X GET http://localhost:8002/doctors/search \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Next Steps

1. Add more doctors to the JSON file
2. Explore the full API at [DOCTOR_API.md](./DOCTOR_API.md)
3. Review detailed documentation at [SEEDER_GUIDE.md](./SEEDER_GUIDE.md)
4. Check the database schema in [README.md](./README.md)

## Notes

- The seeder automatically skips duplicate doctors
- All operations are logged for audit purposes
- The seeder can be run multiple times safely
- For production use, see [SEEDER_GUIDE.md](./SEEDER_GUIDE.md) for advanced options