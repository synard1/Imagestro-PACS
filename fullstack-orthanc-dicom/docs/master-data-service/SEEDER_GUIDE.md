# Doctor Data Seeder Guide

This guide explains how to use the doctor data seeder to import SATUSEHAT-compliant doctor information into the master data service.

## Overview

The doctor data seeder (`seed_doctors.py`) imports doctor information from a JSON file (`docs/doctors.json`) into the PostgreSQL database. It's designed to work with the SATUSEHAT doctors.json format and provides detailed logging and error handling.

## JSON File Format

The seeder expects a JSON file with the following structure:

```json
[
  {
    "_meta": {
      "version": "1.0",
      "generated_at": "2025-01-15T10:30:00Z",
      "total_records": 2
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
  },
  {
    "ihs_number": "10006926841",
    "national_id": "3322071302900002",
    "name": "dr. Yoga Yandika, Sp.A",
    "license": "STR-3322071302900002",
    "specialty": "Pediatrics",
    "phone": "+62-812-0002-0002",
    "email": "yoga@hospital.com",
    "birth_date": "1995-02-02",
    "gender": "M"
  }
]
```

## Field Mapping

| JSON Field | Database Field | Required | Description |
|------------|----------------|----------|-------------|
| `ihs_number` | `ihs_number` | No | IHS (Indeks Halaman Sehat) number |
| `national_id` | `national_id` | No | National ID (NIK in Indonesia) |
| `name` | `name` | Yes | Full name |
| `license` | `license` | No | Professional license number |
| `specialty` | `specialty` | No | Medical specialty |
| `phone` | `phone` | No | Contact phone |
| `email` | `email` | No | Email address |
| `birth_date` | `birth_date` | No | Date of birth (YYYY-MM-DD) |
| `gender` | `gender` | No | Gender (M/F) |

## Running the Seeder

### Basic Usage

```bash
# From within the master-data-service directory
python seed_doctors.py
```

### Custom JSON File

```bash
# Use a custom JSON file
python seed_doctors.py /path/to/custom/doctors.json
```

### Environment Variables

The seeder uses the following environment variables:

```bash
POSTGRES_HOST=localhost      # Database host
POSTGRES_DB=worklist_db      # Database name
POSTGRES_USER=dicom          # Database user
POSTGRES_PASSWORD=dicom123   # Database password
POSTGRES_PORT=5432          # Database port
```

## Seeder Features

### Duplicate Detection

The seeder automatically detects duplicates based on:
- `ihs_number`
- `national_id`
- `license`

If any of these fields match an existing doctor, the seeder will skip that record.

### Detailed Logging

The seeder provides detailed logging with:
- Progress indicators
- Success/failure status for each doctor
- Summary statistics
- Error details

### Transaction Safety

All database operations are wrapped in transactions:
- Changes are committed only if all operations succeed
- Automatic rollback on any error
- Data consistency guaranteed

## Output Example

```
2025-01-15 10:30:00,000 - INFO - ✓ Connected to database: localhost:5432/worklist_db
2025-01-15 10:30:00,050 - INFO - ✓ Loaded 2 doctors from ../docs/doctors.json
2025-01-15 10:30:00,100 - INFO - 
2025-01-15 10:30:00,100 - INFO - Starting seeding process...
2025-01-15 10:30:00,100 - INFO - ----------------------------------------------------------------------
2025-01-15 10:30:00,100 - INFO - [1/2] Processing...
2025-01-15 10:30:00,150 - INFO - ✓ Created: dr. Alexander (ID: d1a2b3c4-e5f6-7890-abcd-ef1234567890)
2025-01-15 10:30:00,150 - INFO - [2/2] Processing...
2025-01-15 10:30:00,200 - INFO - ✓ Created: dr. Yoga Yandika, Sp.A (ID: e2b3c4d5-f6a7-8901-bcde-f23456789012)
2025-01-15 10:30:00,200 - INFO - ----------------------------------------------------------------------
2025-01-15 10:30:00,200 - INFO - ✓ All changes committed to database
2025-01-15 10:30:00,200 - INFO - 
2025-01-15 10:30:00,200 - INFO - ======================================================================
2025-01-15 10:30:00,200 - INFO - SEEDING SUMMARY
2025-01-15 10:30:00,200 - INFO - ======================================================================
2025-01-15 10:30:00,200 - INFO - Total doctors processed: 2
2025-01-15 10:30:00,200 - INFO - ✓ Successfully created:  2
2025-01-15 10:30:00,200 - INFO - ⊗ Skipped (duplicates):  0
2025-01-15 10:30:00,200 - INFO - ✗ Errors:                0
2025-01-15 10:30:00,200 - INFO - ======================================================================
2025-01-15 10:30:00,200 - INFO - Success Rate: 100.0%
2025-01-15 10:30:00,200 - INFO - 
```

## Error Handling

The seeder handles various error conditions:

1. **Database Connection Errors** - Logs connection failures and exits
2. **JSON Parsing Errors** - Validates JSON format and reports issues
3. **Data Validation Errors** - Checks required fields
4. **Database Errors** - Handles constraint violations and other DB issues
5. **Duplicate Records** - Skips existing records without error

## Best Practices

1. **Backup First** - Always backup your database before seeding
2. **Validate JSON** - Ensure your JSON file is valid before running
3. **Test Environment** - Run in a test environment first
4. **Monitor Logs** - Watch the detailed logs for any issues
5. **Check Summary** - Review the summary statistics after completion

## Troubleshooting

### Common Issues

1. **Database Connection Failed**
   - Check POSTGRES_* environment variables
   - Ensure PostgreSQL is running
   - Verify database credentials

2. **JSON File Not Found**
   - Confirm `docs/doctors.json` exists
   - Check file permissions
   - Use absolute path if needed

3. **Duplicate Records**
   - Seeder automatically skips duplicates
   - Check summary for skipped count
   - No action needed unless unexpected

4. **Permission Denied**
   - Ensure database user has proper permissions
   - Check PostgreSQL user roles

### Getting Help

For detailed error information, check:
- Console output for immediate errors
- Log files for detailed information
- Database connection status
- JSON file validity

## Integration with Other Services

The seeder can be integrated into:
- CI/CD pipelines
- Deployment scripts
- Data migration workflows
- Testing environments

### As a Module

The seeder can be imported as a module:

```python
from seed_doctors import DoctorSeeder

# Create seeder instance
seeder = DoctorSeeder('/path/to/doctors.json')

# Run seeding
stats = seeder.seed_all()

# Check results
print(f"Created: {stats['created']} doctors")
```

## Security Considerations

1. **Database Credentials** - Store securely in environment variables
2. **File Permissions** - Restrict access to JSON files
3. **Network Security** - Use secure connections to database
4. **Audit Trail** - All operations are logged for compliance

## Performance

The seeder is optimized for:
- Batch processing
- Efficient database operations
- Minimal memory usage
- Progress tracking

For large datasets (>10,000 doctors), consider:
- Processing in smaller batches
- Monitoring system resources
- Using dedicated database connections
