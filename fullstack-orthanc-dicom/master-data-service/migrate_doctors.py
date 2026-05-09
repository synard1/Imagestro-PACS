"""
Doctor Master Data Migration Script
Imports doctors from docs/doctors.json into the master data service database
"""
import os
import sys
import json
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime

# Database configuration
DB_CONFIG = {
    'host': os.getenv('POSTGRES_HOST', 'localhost'),
    'database': os.getenv('POSTGRES_DB', 'worklist_db'),
    'user': os.getenv('POSTGRES_USER', 'dicom'),
    'password': os.getenv('POSTGRES_PASSWORD', 'dicom123'),
    'port': 5432
}

def load_doctors_json():
    """Load doctors from JSON file"""
    json_path = os.path.join(os.path.dirname(__file__), '..', 'docs', 'doctors.json')

    if not os.path.exists(json_path):
        print(f"ERROR: doctors.json not found at {json_path}")
        return None

    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Filter out metadata object
    doctors = [item for item in data if '_meta' not in item]

    print(f"Loaded {len(doctors)} doctors from {json_path}")
    return doctors

def migrate_doctors():
    """Migrate doctors to database"""
    doctors = load_doctors_json()

    if not doctors:
        print("No doctors to migrate")
        return

    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        print("Connected to database successfully")

        migrated_count = 0
        skipped_count = 0
        error_count = 0

        for doctor in doctors:
            try:
                # Map JSON fields to database fields (matching doctors.json format)
                ihs_number = doctor.get('ihs_number')  # Was 'practitioner_id'
                national_id = doctor.get('national_id')  # Was 'nik'
                name = doctor.get('name')
                license_num = doctor.get('license')
                specialty = doctor.get('specialty')
                phone = doctor.get('phone')
                email = doctor.get('email', '')  # Add email field
                birth_date = doctor.get('birth_date')
                gender = doctor.get('gender')

                # Check if doctor already exists
                cursor.execute("""
                    SELECT id FROM doctors
                    WHERE ihs_number = %s OR national_id = %s OR license = %s
                """, (ihs_number, national_id, license_num))

                existing = cursor.fetchone()

                if existing:
                    print(f"⊗ Skipping {name} - already exists (ID: {existing['id']})")
                    skipped_count += 1
                    continue

                # Insert new doctor (matching doctors.json format)
                cursor.execute("""
                    INSERT INTO doctors (
                        ihs_number, national_id, name, license, specialty,
                        phone, email, birth_date, gender, active
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                    ) RETURNING id
                """, (
                    ihs_number, national_id, name, license_num, specialty,
                    phone, email, birth_date, gender, True
                ))

                result = cursor.fetchone()
                doctor_id = result['id']

                print(f"✓ Migrated {name} (ID: {doctor_id})")
                migrated_count += 1

            except Exception as e:
                print(f"✗ Error migrating {doctor.get('name', 'Unknown')}: {str(e)}")
                error_count += 1
                continue

        # Commit all changes
        conn.commit()

        print("\n" + "=" * 60)
        print("Migration Summary:")
        print(f"  ✓ Successfully migrated: {migrated_count}")
        print(f"  ⊗ Skipped (already exists): {skipped_count}")
        print(f"  ✗ Errors: {error_count}")
        print(f"  Total processed: {len(doctors)}")
        print("=" * 60)

        cursor.close()
        conn.close()

    except psycopg2.Error as e:
        print(f"Database error: {str(e)}")
        sys.exit(1)
    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        sys.exit(1)

if __name__ == '__main__':
    print("=" * 60)
    print("Doctor Master Data Migration Script")
    print("=" * 60)
    print(f"Database: {DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['database']}")
    print("=" * 60)

    migrate_doctors()

    print("\nMigration completed!")