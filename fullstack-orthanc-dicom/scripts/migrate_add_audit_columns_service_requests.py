#!/usr/bin/env python3
"""
Migration script: Add audit trail columns to satusehat_service_requests table

This script adds the following columns:
- created_by: user who created the record
- updated_by: user who last updated the record
- deleted_at: soft delete timestamp
- deleted_by: user who deleted the record

Usage:
    python3 scripts/migrate_add_audit_columns_service_requests.py
"""

import os
import sys
import psycopg2
from psycopg2.extras import RealDictCursor

def get_db_connection():
    """Get database connection from environment variables or docker-compose default values"""
    # Default values from docker-compose.yml
    host = os.getenv("DB_HOST", "localhost")
    port = int(os.getenv("DB_PORT", "5532"))  # Changed default port to 5532
    database = os.getenv("DB_NAME", "worklist_db")
    user = os.getenv("DB_USER", "dicom")
    
    # Check if we're running in a Docker container
    if os.path.exists('/.dockerenv'):
        # Inside Docker container, use service name
        host = "postgres"
        user = os.getenv("POSTGRES_USER", "dicom")
        database = os.getenv("POSTGRES_DB", "worklist_db")
        # Inside container, use internal port 5432
        port = 5432
    
    # Default password from docker-compose.yml
    password = os.getenv("DB_PASSWORD", os.getenv("POSTGRES_PASSWORD", "dicom123"))
    
    print(f"Connecting to database: {host}:{port}, database: {database}, user: {user}")
    
    return psycopg2.connect(
        host=host,
        port=port,
        database=database,
        user=user,
        password=password
    )

def column_exists(cursor, table_name, column_name):
    """Check if a column exists in a table"""
    cursor.execute("""
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = %s
            AND column_name = %s
        )
    """, (table_name, column_name))
    return cursor.fetchone()[0]

def migrate_add_audit_columns():
    """Add audit trail columns to satusehat_service_requests table"""
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            print("Starting migration: Add audit trail columns to satusehat_service_requests")

            # Check if table exists
            cursor.execute("""
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.tables
                    WHERE table_name = 'satusehat_service_requests'
                )
            """)
            if not cursor.fetchone()['exists']:
                print("ERROR: Table satusehat_service_requests does not exist!")
                return False

            # Add created_by column
            if not column_exists(cursor, 'satusehat_service_requests', 'created_by'):
                print("Adding column: created_by")
                cursor.execute("""
                    ALTER TABLE satusehat_service_requests
                    ADD COLUMN created_by uuid REFERENCES users(id) ON DELETE SET NULL
                """)
                print("✓ Column created_by added successfully")
            else:
                print("⊙ Column created_by already exists, skipping")

            # Add updated_by column
            if not column_exists(cursor, 'satusehat_service_requests', 'updated_by'):
                print("Adding column: updated_by")
                cursor.execute("""
                    ALTER TABLE satusehat_service_requests
                    ADD COLUMN updated_by uuid REFERENCES users(id) ON DELETE SET NULL
                """)
                print("✓ Column updated_by added successfully")
            else:
                print("⊙ Column updated_by already exists, skipping")

            # Add deleted_at column
            if not column_exists(cursor, 'satusehat_service_requests', 'deleted_at'):
                print("Adding column: deleted_at")
                cursor.execute("""
                    ALTER TABLE satusehat_service_requests
                    ADD COLUMN deleted_at timestamptz
                """)
                print("✓ Column deleted_at added successfully")
            else:
                print("⊙ Column deleted_at already exists, skipping")

            # Add deleted_by column
            if not column_exists(cursor, 'satusehat_service_requests', 'deleted_by'):
                print("Adding column: deleted_by")
                cursor.execute("""
                    ALTER TABLE satusehat_service_requests
                    ADD COLUMN deleted_by uuid REFERENCES users(id) ON DELETE SET NULL
                """)
                print("✓ Column deleted_by added successfully")
            else:
                print("⊙ Column deleted_by already exists, skipping")

            # Create indexes for better query performance
            print("\nCreating indexes for audit columns...")

            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_satusehat_service_requests_created_by
                ON satusehat_service_requests(created_by)
            """)
            print("✓ Index on created_by created")

            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_satusehat_service_requests_updated_by
                ON satusehat_service_requests(updated_by)
            """)
            print("✓ Index on updated_by created")

            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_satusehat_service_requests_deleted_at
                ON satusehat_service_requests(deleted_at)
                WHERE deleted_at IS NOT NULL
            """)
            print("✓ Partial index on deleted_at created")

            conn.commit()
            print("\n✅ Migration completed successfully!")
            return True

    except Exception as e:
        conn.rollback()
        print(f"\n❌ Migration failed: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        conn.close()

if __name__ == "__main__":
    success = migrate_add_audit_columns()
    sys.exit(0 if success else 1)