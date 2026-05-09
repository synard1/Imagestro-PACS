#!/usr/bin/env python3
"""
Migration script for procedures schema
"""
import os
import sys
import psycopg2
from psycopg2.extras import RealDictCursor
import logging
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Add the current directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

logging.basicConfig(level=logging.INFO)
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

def get_db_connection():
    """Get database connection"""
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        return conn
    except Exception as e:
        logger.error(f"Failed to connect to database: {e}")
        raise

def run_migration():
    """Run the procedures migration"""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Read the schema file
        schema_file = os.path.join(os.path.dirname(__file__), 'procedures_schema.sql')
        with open(schema_file, 'r') as f:
            schema_sql = f.read()
        
        # Execute the schema
        cursor.execute(schema_sql)
        conn.commit()
        
        logger.info("Procedures schema migration completed successfully")
        
        # Insert some sample procedures
        sample_procedures = [
            ('CT_BRAIN', 'CT Brain', 'Computed Tomography of Brain', 'CT', 1, 15, False, True, 'NPO 4 hours', 'Severe contrast allergy'),
            ('CT_CHEST', 'CT Chest', 'Computed Tomography of Chest', 'CT', 1, 20, True, True, 'NPO 4 hours, IV contrast', 'Contrast allergy, renal insufficiency'),
            ('MRI_ABDOMEN', 'MRI Abdomen', 'Magnetic Resonance Imaging of Abdomen', 'MRI', 1, 45, True, True, 'NPO 6 hours, IV contrast', 'Pacemaker, severe claustrophobia'),
            ('XRAY_CHEST_PA', 'X-ray Chest PA', 'X-ray Chest Posteroanterior View', 'XRAY', 1, 5, False, False, '', ''),
            ('US_ABDOMEN', 'Ultrasound Abdomen', 'Ultrasound of Abdomen', 'US', 1, 15, False, False, 'NPO 6 hours', ''),
            ('MAMMO_SCREENING', 'Mammography Screening', 'Screening Mammography', 'MAMMO', 1, 10, False, True, 'No deodorant or powder', ''),
            ('ECG', 'Electrocardiogram', 'Standard 12-lead ECG', 'ECG', 3, 5, False, False, '', ''),
            ('ECHO', 'Echocardiogram', 'Transthoracic Echocardiography', 'US', 2, 30, False, True, '', 'Severe lung disease'),
        ]
        
        insert_procedure_sql = """
        INSERT INTO procedures (procedure_code, procedure_name, procedure_description, modality_type, department_id, estimated_duration, contrast_required, preparation_required, preparation_notes, contraindications, created_by, updated_by)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 1, 1)
        ON CONFLICT (procedure_code) DO NOTHING
        """
        
        cursor.executemany(insert_procedure_sql, sample_procedures)
        conn.commit()
        
        logger.info(f"Inserted {cursor.rowcount} sample procedures")
        
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Migration failed: {e}")
        raise
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    run_migration()
