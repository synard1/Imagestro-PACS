#!/usr/bin/env python3
"""
Simple migration script for procedures schema
This creates a basic procedures table without complex dependencies
"""
import os
import sys
import psycopg2
from psycopg2.extras import RealDictCursor
import logging
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Database configuration
DB_CONFIG = {
    'host': os.getenv('POSTGRES_HOST', 'localhost'),
    'database': os.getenv('POSTGRES_DB', 'worklist_db'),
    'user': os.getenv('POSTGRES_USER', 'dicom'),
    'password': os.getenv('POSTGRES_PASSWORD', 'dicom123'),
    'port': int(os.getenv('POSTGRES_PORT', '5432'))
}

def get_db_connection():
    """Get database connection"""
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        return conn
    except Exception as e:
        logger.error(f"Failed to connect to database: {e}")
        raise

def run_migration():
    """Run the procedures migration - creates basic procedures table"""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        logger.info("Creating basic procedures table...")

        # Create basic procedures table without complex dependencies
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS procedures_legacy (
                id SERIAL PRIMARY KEY,
                procedure_code VARCHAR(50) UNIQUE NOT NULL,
                procedure_name VARCHAR(200) NOT NULL,
                procedure_description TEXT,
                modality_type VARCHAR(50) NOT NULL,
                estimated_duration INTEGER,
                contrast_required BOOLEAN DEFAULT FALSE,
                preparation_required BOOLEAN DEFAULT FALSE,
                preparation_notes TEXT,
                contraindications TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                is_active BOOLEAN DEFAULT TRUE,
                deleted_at TIMESTAMP WITH TIME ZONE NULL
            );
        """)

        # Create indexes
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_procedures_legacy_code
            ON procedures_legacy(procedure_code);
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_procedures_legacy_modality
            ON procedures_legacy(modality_type);
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_procedures_legacy_active
            ON procedures_legacy(is_active);
        """)

        conn.commit()
        logger.info("✓ Basic procedures table created successfully")

        # Insert sample procedures
        logger.info("Inserting sample procedures...")
        sample_procedures = [
            ('CT_BRAIN', 'CT Brain', 'Computed Tomography of Brain', 'CT', 15, False, True, 'NPO 4 hours', 'Severe contrast allergy'),
            ('CT_CHEST', 'CT Chest', 'Computed Tomography of Chest', 'CT', 20, True, True, 'NPO 4 hours, IV contrast', 'Contrast allergy, renal insufficiency'),
            ('MRI_ABDOMEN', 'MRI Abdomen', 'Magnetic Resonance Imaging of Abdomen', 'MRI', 45, True, True, 'NPO 6 hours, IV contrast', 'Pacemaker, severe claustrophobia'),
            ('XRAY_CHEST_PA', 'X-ray Chest PA', 'X-ray Chest Posteroanterior View', 'XRAY', 5, False, False, '', ''),
            ('US_ABDOMEN', 'Ultrasound Abdomen', 'Ultrasound of Abdomen', 'US', 15, False, False, 'NPO 6 hours', ''),
            ('MAMMO_SCREENING', 'Mammography Screening', 'Screening Mammography', 'MAMMO', 10, False, True, 'No deodorant or powder', ''),
        ]

        insert_sql = """
            INSERT INTO procedures_legacy
            (procedure_code, procedure_name, procedure_description, modality_type,
             estimated_duration, contrast_required, preparation_required,
             preparation_notes, contraindications)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (procedure_code) DO NOTHING
        """

        cursor.executemany(insert_sql, sample_procedures)
        conn.commit()

        inserted_count = cursor.rowcount
        logger.info(f"✓ Inserted {inserted_count} sample procedures")

        # Show summary
        cursor.execute("SELECT COUNT(*) FROM procedures_legacy")
        total = cursor.fetchone()[0]
        logger.info(f"✓ Total procedures in database: {total}")

        logger.info("=" * 80)
        logger.info("Migration completed successfully!")
        logger.info("=" * 80)
        logger.info("\nNote: This creates 'procedures_legacy' table for backward compatibility.")
        logger.info("The main 'procedures' table with full features is created via app.py init_database().")
        logger.info("\nTo use the full-featured procedures table, restart the master-data-service.")

    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Migration failed: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    logger.info("=" * 80)
    logger.info("Simple Procedures Migration Script")
    logger.info("=" * 80)

    try:
        run_migration()
        sys.exit(0)
    except Exception as e:
        logger.error("Migration failed!")
        sys.exit(1)
