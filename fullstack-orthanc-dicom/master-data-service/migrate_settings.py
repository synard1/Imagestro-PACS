
"""
Settings Table Migration Script
Creates the settings table and seeds it with initial configuration data.
"""
import os
import sys
import time
import json
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

def create_or_update_settings_table():
    """Create or update the settings table and seed initial data"""
    conn = connect_with_retry()
    if not conn:
        return False

    try:
        with conn.cursor() as cursor:
            logger.info("Checking if 'settings' table exists...")
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'settings'
                );
            """)
            if cursor.fetchone()[0]:
                logger.info("✓ 'settings' table already exists.")
            else:
                logger.info("Creating 'settings' table...")
                cursor.execute("""
                    CREATE TABLE settings (
                        id SERIAL PRIMARY KEY,
                        key VARCHAR(255) UNIQUE NOT NULL,
                        value JSONB NOT NULL,
                        description TEXT,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    );
                """)
                logger.info("✓ 'settings' table created successfully.")

            # Create a trigger to automatically update updated_at
            logger.info("Creating or replacing trigger to update 'updated_at' timestamp...")
            cursor.execute("""
                CREATE OR REPLACE FUNCTION update_updated_at_column()
                RETURNS TRIGGER AS $$
                BEGIN
                   NEW.updated_at = NOW();
                   RETURN NEW;
                END;
                $$ language 'plpgsql';
            """)
            cursor.execute("""
                DROP TRIGGER IF EXISTS set_timestamp ON settings;
                CREATE TRIGGER set_timestamp
                BEFORE UPDATE ON settings
                FOR EACH ROW
                EXECUTE PROCEDURE update_updated_at_column();
            """)
            logger.info("✓ Trigger created successfully.")

            # Seed initial data
            initial_settings = [
                {
                    "key": "site_name",
                    "value": {"value": "Radiology Information System"},
                    "description": "The name of the application, displayed in the UI."
                },
                {
                    "key": "maintenance_mode",
                    "value": {"enabled": False},
                    "description": "Enable or disable maintenance mode for the entire application."
                },
                {
                    "key": "dicom_listener_port",
                    "value": {"port": 11112},
                    "description": "The port number for the primary DICOM listener."
                }
            ]

            logger.info("Seeding initial settings...")
            for setting in initial_settings:
                cursor.execute("""
                    INSERT INTO settings (key, value, description)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (key) DO NOTHING;
                """, (setting['key'], json.dumps(setting['value']), setting['description']))
            
            logger.info("✓ Initial settings seeded successfully (if they didn't already exist).")
            
            conn.commit()
            logger.info("Schema and data update completed successfully!")
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
    logger.info("Settings Table Migration Script")
    logger.info("=" * 60)
    
    success = create_or_update_settings_table()
    
    if success:
        logger.info("Migration process finished.")
        sys.exit(0)
    else:
        logger.error("Migration failed!")
        sys.exit(1)
