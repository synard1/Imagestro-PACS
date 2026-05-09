"""
Migration Script: Make patient_national_id nullable
This script updates the patients table to make patient_national_id nullable
"""
import os
import sys
import psycopg2
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stdout
)
logger = logging.getLogger(__name__)

# Database configuration - try multiple host options
DB_HOST = os.getenv('POSTGRES_HOST') or os.getenv('PGHOST') or 'localhost'
DB_PORT = int(os.getenv('POSTGRES_PORT', os.getenv('PGPORT', '5532')))
DB_CONFIG = {
    'host': DB_HOST,
    'database': os.getenv('POSTGRES_DB', os.getenv('PGDATABASE', 'worklist_db')),
    'user': os.getenv('POSTGRES_USER', os.getenv('PGUSER', 'dicom')),
    'password': os.getenv('POSTGRES_PASSWORD', os.getenv('PGPASSWORD', 'dicom123')),
    'port': DB_PORT
}

logger.info(f"Connecting to database at {DB_CONFIG['host']}:{DB_CONFIG['port']}")

def migrate_nik_nullable():
    """Make patient_national_id column nullable in patients table"""
    conn = None
    cursor = None

    try:
        logger.info("Attempting to connect to database...")
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        logger.info("Database connection established successfully")

        logger.info("Starting migration to make patient_national_id nullable...")

        # Check if patients table exists
        cursor.execute("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'patients'
            )
        """)

        if not cursor.fetchone()[0]:
            logger.warning("Table 'patients' does not exist. Skipping migration.")
            return

        # Check current constraint
        cursor.execute("""
            SELECT is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'patients'
              AND column_name = 'patient_national_id'
        """)

        result = cursor.fetchone()
        if not result:
            logger.warning("Column 'patient_national_id' does not exist. Skipping migration.")
            return

        is_nullable = result[0]

        if is_nullable == 'YES':
            logger.info("Column 'patient_national_id' is already nullable. No migration needed.")
            return

        # Alter column to make it nullable
        logger.info("Altering patient_national_id to allow NULL values...")
        cursor.execute("""
            ALTER TABLE patients
            ALTER COLUMN patient_national_id DROP NOT NULL
        """)

        conn.commit()
        logger.info("Migration completed successfully!")
        logger.info("patient_national_id is now nullable")

    except psycopg2.OperationalError as e:
        logger.error(f"Database connection failed: {str(e)}")
        logger.error(f"Attempted to connect to: {DB_CONFIG['host']}:{DB_CONFIG['port']}")
        logger.error("Please check:")
        logger.error("  1. Database is running")
        logger.error("  2. Correct host/port (try: localhost:5532 or postgres:5432)")
        logger.error("  3. Environment variables are set correctly")
        raise
    except Exception as e:
        logger.error(f"Migration failed: {str(e)}")
        if conn:
            conn.rollback()
        raise
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

if __name__ == '__main__':
    try:
        migrate_nik_nullable()
        logger.info("=" * 60)
        logger.info("Migration Summary:")
        logger.info("- patient_national_id is now optional (nullable)")
        logger.info("- Patients can be created with just MRN if NIK is not available")
        logger.info("=" * 60)
    except Exception as e:
        logger.error(f"Migration script failed: {str(e)}")
        sys.exit(1)
