#!/usr/bin/env python3
"""
Script to drop duplicate columns from orders table.
This script removes patient_birth_date and patient_sex columns
which are duplicates of birth_date and gender.
"""

import os
import sys
import psycopg2
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stdout
)
logger = logging.getLogger(__name__)

# Database configuration - matching existing services
DB_HOST = 'postgres'
DB_PORT = 5432
DB_PASSWORD = 'dicom123'

# If not running inside a Docker container, assume running on the host
# and connecting to a mapped port from docker-compose.yml.
if not os.path.exists('/.dockerenv'):
    DB_HOST = 'localhost'
    DB_PORT = 5532

DB_CONFIG = {
    'host': os.getenv('POSTGRES_HOST', DB_HOST),
    'database': os.getenv('POSTGRES_DB', 'worklist_db'),
    'user': os.getenv('POSTGRES_USER', 'dicom'),
    'password': os.getenv('POSTGRES_PASSWORD', DB_PASSWORD),
    'port': int(os.getenv('POSTGRES_PORT', DB_PORT))
}

def get_db_connection():
    """Create and return a database connection"""
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        return conn
    except Exception as e:
        logger.error(f"Failed to connect to database: {str(e)}")
        raise

def drop_duplicate_columns():
    """Drop duplicate columns from orders table"""
    logger.info("Starting to drop duplicate columns from orders table...")

    conn = None

    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Check if columns exist before dropping
        cursor.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'orders' AND column_name IN ('patient_birth_date', 'patient_sex')
        """)
        existing_columns = [row[0] for row in cursor.fetchall()]

        if not existing_columns:
            logger.info("No duplicate columns found. Nothing to drop.")
            return

        logger.info(f"Found duplicate columns to drop: {', '.join(existing_columns)}")

        # Drop patient_birth_date if exists
        if 'patient_birth_date' in existing_columns:
            logger.info("Dropping column: patient_birth_date")
            cursor.execute("ALTER TABLE orders DROP COLUMN IF EXISTS patient_birth_date CASCADE")
            logger.info("✓ Successfully dropped patient_birth_date")

        # Drop patient_sex if exists
        if 'patient_sex' in existing_columns:
            logger.info("Dropping column: patient_sex")
            cursor.execute("ALTER TABLE orders DROP COLUMN IF EXISTS patient_sex CASCADE")
            logger.info("✓ Successfully dropped patient_sex")

        # Commit all changes
        conn.commit()
        logger.info("Successfully dropped all duplicate columns!")

        # Verify columns are dropped
        cursor.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'orders'
            ORDER BY ordinal_position
        """)
        remaining_columns = [row[0] for row in cursor.fetchall()]
        logger.info(f"Remaining columns in orders table ({len(remaining_columns)}): {', '.join(remaining_columns[:10])}...")

    except Exception as e:
        logger.error(f"Failed to drop duplicate columns: {str(e)}")
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    try:
        drop_duplicate_columns()
        print("\n✓ Duplicate columns dropped successfully!")
    except Exception as e:
        print(f"\n✗ Error dropping duplicate columns: {str(e)}")
        sys.exit(1)
