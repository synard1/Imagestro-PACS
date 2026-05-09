#!/usr/bin/env python3
"""
Migration script to add missing columns to external_systems table
"""
import os
import sys
import psycopg2

DB_CONFIG = {
    'host': os.getenv('POSTGRES_HOST', 'dicom-postgres-secured'),
    'database': os.getenv('POSTGRES_DB', 'worklist_db'),
    'user': os.getenv('POSTGRES_USER', 'dicom'),
    'password': os.getenv('POSTGRES_PASSWORD', 'dicom123'),
    'port': 5432
}

def migrate():
    print("=" * 80)
    print("Migrating external_systems table")
    print("=" * 80)

    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()

        print("\n1. Adding missing columns...")

        # Add system_version
        try:
            cursor.execute("ALTER TABLE external_systems ADD COLUMN IF NOT EXISTS system_version VARCHAR(50)")
            print("  ✓ Added system_version")
        except Exception as e:
            print(f"  - system_version: {e}")

        # Add vendor
        try:
            cursor.execute("ALTER TABLE external_systems ADD COLUMN IF NOT EXISTS vendor VARCHAR(200)")
            print("  ✓ Added vendor")
        except Exception as e:
            print(f"  - vendor: {e}")

        # Add api_endpoint
        try:
            cursor.execute("ALTER TABLE external_systems ADD COLUMN IF NOT EXISTS api_endpoint VARCHAR(500)")
            print("  ✓ Added api_endpoint")
        except Exception as e:
            print(f"  - api_endpoint: {e}")

        # Add auth_type
        try:
            cursor.execute("ALTER TABLE external_systems ADD COLUMN IF NOT EXISTS auth_type VARCHAR(50)")
            print("  ✓ Added auth_type")
        except Exception as e:
            print(f"  - auth_type: {e}")

        # Add auth_config
        try:
            cursor.execute("ALTER TABLE external_systems ADD COLUMN IF NOT EXISTS auth_config JSONB")
            print("  ✓ Added auth_config")
        except Exception as e:
            print(f"  - auth_config: {e}")

        # Add contact_person
        try:
            cursor.execute("ALTER TABLE external_systems ADD COLUMN IF NOT EXISTS contact_person VARCHAR(200)")
            print("  ✓ Added contact_person")
        except Exception as e:
            print(f"  - contact_person: {e}")

        # Add contact_email
        try:
            cursor.execute("ALTER TABLE external_systems ADD COLUMN IF NOT EXISTS contact_email VARCHAR(200)")
            print("  ✓ Added contact_email")
        except Exception as e:
            print(f"  - contact_email: {e}")

        # Add notes
        try:
            cursor.execute("ALTER TABLE external_systems ADD COLUMN IF NOT EXISTS notes TEXT")
            print("  ✓ Added notes")
        except Exception as e:
            print(f"  - notes: {e}")

        conn.commit()

        print("\n2. Verifying schema...")
        cursor.execute("""
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'external_systems'
            ORDER BY ordinal_position
        """)
        columns = cursor.fetchall()

        print("\nCurrent columns:")
        for col in columns:
            print(f"  - {col[0]} ({col[1]})")

        conn.close()

        print("\n" + "=" * 80)
        print("✅ Migration completed successfully!")
        print("=" * 80)

    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        sys.exit(1)

if __name__ == '__main__':
    migrate()
