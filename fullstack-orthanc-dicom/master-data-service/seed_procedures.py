#!/usr/bin/env python3
"""
Seed script untuk mengisi database procedures dengan data prosedur radiologi umum.
"""
import os
import sys
import json
import psycopg2
from psycopg2.extras import RealDictCursor
import logging

from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Database configuration
# Database configuration
DB_CONFIG = {
    'host': os.getenv('POSTGRES_HOST', 'localhost'),
    'database': os.getenv('POSTGRES_DB', 'worklist_db'),
    'user': os.getenv('POSTGRES_USER', 'dicom'),
    'password': os.getenv('POSTGRES_PASSWORD', 'dicom123'),
    'port': int(os.getenv('POSTGRES_PORT', '5432'))
}

def load_seed_data():
    """Load seed data from JSON file"""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    seed_file = os.path.join(script_dir, 'procedures_seed.json')

    try:
        with open(seed_file, 'r') as f:
            data = json.load(f)
        return data.get('procedures', [])
    except FileNotFoundError:
        logger.error(f"Seed file not found: {seed_file}")
        return []
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON in seed file: {e}")
        return []

def seed_procedures():
    """Seed procedures into database"""
    procedures = load_seed_data()

    if not procedures:
        logger.error("No procedures to seed")
        return False

    conn = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        inserted = 0
        skipped = 0

        for proc in procedures:
            # Check if procedure already exists
            cursor.execute("SELECT id FROM procedures WHERE code = %s", (proc['code'],))
            existing = cursor.fetchone()

            if existing:
                logger.info(f"Skipping existing procedure: {proc['code']} - {proc['name']}")
                skipped += 1
                continue

            # Insert procedure
            cursor.execute("""
                INSERT INTO procedures (
                    code, name, display_name, category, modality, body_part, description,
                    loinc_code, loinc_display, icd10_code, icd10_display, icd9_cm_code,
                    cpt_code, satusehat_code, satusehat_system, duration_minutes,
                    prep_instructions, contrast_required, sedation_required,
                    radiation_dose_range, cost_estimate, active, sort_order
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s, %s
                )
            """, (
                proc['code'], proc['name'], proc.get('display_name'), proc.get('category'),
                proc.get('modality'), proc.get('body_part'), proc.get('description'),
                proc.get('loinc_code'), proc.get('loinc_display'), proc.get('icd10_code'),
                proc.get('icd10_display'), proc.get('icd9_cm_code'), proc.get('cpt_code'),
                proc.get('satusehat_code'), proc.get('satusehat_system'),
                proc.get('duration_minutes'), proc.get('prep_instructions'),
                proc.get('contrast_required', False), proc.get('sedation_required', False),
                proc.get('radiation_dose_range'), proc.get('cost_estimate'),
                proc.get('active', True), proc.get('sort_order', 0)
            ))

            logger.info(f"Inserted procedure: {proc['code']} - {proc['name']}")
            inserted += 1

        conn.commit()

        logger.info("=" * 80)
        logger.info(f"Seeding completed:")
        logger.info(f"  - Inserted: {inserted} procedures")
        logger.info(f"  - Skipped: {skipped} procedures (already exist)")
        logger.info(f"  - Total: {len(procedures)} procedures in seed file")
        logger.info("=" * 80)

        return True

    except psycopg2.Error as e:
        logger.error(f"Database error: {e}")
        if conn:
            conn.rollback()
        return False
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        if conn:
            conn.rollback()
        return False
    finally:
        if conn:
            conn.close()

def main():
    """Main function"""
    logger.info("=" * 80)
    logger.info("Master Data Service - Procedures Seeding Script")
    logger.info("=" * 80)

    # Check database connection
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        conn.close()
        logger.info("✓ Database connection successful")
    except psycopg2.Error as e:
        logger.error(f"✗ Database connection failed: {e}")
        sys.exit(1)

    # Seed procedures
    success = seed_procedures()

    if success:
        logger.info("✓ Procedures seeded successfully")
        sys.exit(0)
    else:
        logger.error("✗ Failed to seed procedures")
        sys.exit(1)

if __name__ == '__main__':
    main()
