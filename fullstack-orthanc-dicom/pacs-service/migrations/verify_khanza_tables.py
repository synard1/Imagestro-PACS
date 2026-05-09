#!/usr/bin/env python3
"""
Verify Khanza Integration Tables
Checks for the existence of tables created in the Khanza integration migration.
"""

import psycopg2
import os
import time

# Database configuration
DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'port': os.getenv('DB_PORT', '5432'),
    'database': os.getenv('DB_NAME', 'worklist_db'),
    'user': os.getenv('DB_USER', 'dicom'),
    'password': os.getenv('DB_PASSWORD', os.getenv('POSTGRES_PASSWORD', 'dicom123'))
}

TABLES_TO_CHECK = [
    'khanza_config',
    'khanza_procedure_mappings',
    'khanza_doctor_mappings',

    'khanza_operator_mappings',
    'khanza_import_history'
]

def verify_tables():
    """Verify the existence of the Khanza integration tables"""
    print("=" * 80)
    print("Verifying Khanza Integration Tables")
    print("=" * 80)
    
    all_tables_found = True
    conn = None
    
    # Retry connection
    max_retries = 5
    retry_delay = 3  # seconds
    
    for attempt in range(max_retries):
        try:
            # Connect to database
            print(f"Connecting to database (attempt {attempt + 1}/{max_retries}): {DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['database']}")
            conn = psycopg2.connect(**DB_CONFIG)
            print("✓ Database connection successful.")
            break
        except psycopg2.OperationalError as e:
            if "starting up" in str(e):
                if attempt < max_retries - 1:
                    print(f"Database is starting up. Retrying in {retry_delay} seconds...")
                    time.sleep(retry_delay)
                else:
                    print("✗ Database is still starting up after multiple retries. Aborting.")
                    print(f"Error: {str(e)}")
                    return False
            else:
                print(f"✗ An unexpected connection error occurred: {str(e)}")
                return False
    
    if not conn:
        print("✗ Could not establish a connection to the database.")
        return False

    try:
        cursor = conn.cursor()
        
        for table_name in TABLES_TO_CHECK:
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' AND table_name = %s
                );
            """, (table_name,))
            
            exists = cursor.fetchone()[0]
            
            if exists:
                print(f"✓ Table '{table_name}' found.")
            else:
                print(f"✗ Table '{table_name}' NOT found.")
                all_tables_found = False
        
        # Close connection
        cursor.close()
        conn.close()
        
    except Exception as e:
        print(f"✗ An error occurred during table verification: {str(e)}")
        if conn:
            conn.close()
        return False
        
    print("=" * 80)
    if all_tables_found:
        print("✓ All Khanza integration tables are present.")
    else:
        print("✗ Some Khanza integration tables are missing.")
    
    return all_tables_found

if __name__ == "__main__":
    verify_tables()