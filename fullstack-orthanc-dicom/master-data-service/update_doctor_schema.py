"""
Doctor Schema Update Script
Updates the doctors table schema to include missing columns
"""
import os
import sys
import time
import psycopg2
from psycopg2.extras import RealDictCursor
import logging
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Database configuration
DB_CONFIG = {
    'host': os.getenv('POSTGRES_HOST', 'localhost'),
    'database': os.getenv('POSTGRES_DB', 'worklist_db'),
    'user': os.getenv('POSTGRES_USER', 'dicom'),
    'password': os.getenv('POSTGRES_PASSWORD', 'dicom123'),
    'port': int(os.getenv('POSTGRES_PORT', '5432'))
}

MAX_RETRIES = 10
RETRY_DELAY = 5  # seconds

def connect_with_retry():
    """Establish database connection with retry mechanism"""
    retries = 0
    while retries < MAX_RETRIES:
        try:
            conn = psycopg2.connect(**DB_CONFIG)
            logger.info(f"✓ Connected to database: {DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['database']}")
            return conn
        except psycopg2.OperationalError as e:
            logger.warning(f"Database connection failed: {e}. Retrying in {RETRY_DELAY} seconds...")
            retries += 1
            time.sleep(RETRY_DELAY)
    
    logger.error("✗ Could not connect to the database after several retries.")
    return None

def check_and_update_schema():
    """Check and update database schema if needed"""
    conn = connect_with_retry()
    if not conn:
        return False

    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            logger.info("Checking doctors table schema...")
            
            # Check if email column exists
            cursor.execute("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'doctors' AND column_name = 'email'
            """)
            
            if not cursor.fetchone():
                logger.info("Adding email column to doctors table...")
                cursor.execute("ALTER TABLE doctors ADD COLUMN email VARCHAR(100)")
                logger.info("✓ Email column added successfully")
            else:
                logger.info("✓ Email column already exists")
                
            # Check if phone column exists
            cursor.execute("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'doctors' AND column_name = 'phone'
            """)
            
            if not cursor.fetchone():
                logger.info("Adding phone column to doctors table...")
                cursor.execute("ALTER TABLE doctors ADD COLUMN phone VARCHAR(20)")
                logger.info("✓ Phone column added successfully")
            else:
                logger.info("✓ Phone column already exists")
            
            # Check if practitioner_id column exists and ihs_number does not
            cursor.execute("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'doctors' AND column_name = 'practitioner_id'
            """)
            practitioner_id_exists = cursor.fetchone()

            cursor.execute("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'doctors' AND column_name = 'ihs_number'
            """)
            ihs_number_exists = cursor.fetchone()

            if practitioner_id_exists and not ihs_number_exists:
                logger.info("Renaming 'practitioner_id' to 'ihs_number' in doctors table...")
                cursor.execute("ALTER TABLE doctors RENAME COLUMN practitioner_id TO ihs_number")
                logger.info("✓ Column 'practitioner_id' renamed to 'ihs_number' successfully")
            elif practitioner_id_exists and ihs_number_exists:
                logger.info("✓ Both 'practitioner_id' and 'ihs_number' columns exist. No rename needed.")
            else:
                logger.info("✓ 'practitioner_id' column does not exist. No rename needed.")
                
            # Update the ihs_number column to drop the NOT NULL constraint
            try:
                cursor.execute("ALTER TABLE doctors ALTER COLUMN ihs_number DROP NOT NULL")
                logger.info("✓ Removed NOT NULL constraint from ihs_number column")
            except psycopg2.Error as e:
                logger.info(f"ℹ ihs_number column already allows NULL values or constraint removal failed: {e}")
                
            # Create unique index for ihs_number that allows NULL values
            try:
                cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_doctors_ihs_number_unique ON doctors (ihs_number) WHERE ihs_number IS NOT NULL")
                logger.info("✓ Unique index for ihs_number created successfully")
            except psycopg2.Error as e:
                logger.warning(f"Warning: Could not create unique index for ihs_number: {e}")
            
            conn.commit()
            logger.info("Schema update completed successfully!")
            return True
            
    except psycopg2.Error as e:
        logger.error(f"Database error: {str(e)}")
        conn.rollback()
        return False
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        conn.rollback()
        return False
    finally:
        if conn:
            conn.close()

if __name__ == '__main__':
    logger.info("=" * 60)
    logger.info("Doctor Schema Update Script")
    logger.info("=" * 60)
    
    success = check_and_update_schema()
    
    if success:
        logger.info("Schema update process finished.")
        sys.exit(0)
    else:
        logger.error("Schema update failed!")
        sys.exit(1)