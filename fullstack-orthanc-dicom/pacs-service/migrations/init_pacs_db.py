#!/usr/bin/env python3
"""
PACS Database Initialization Script
Runs database migrations for PACS tables
"""

import os
import sys
import psycopg2
from psycopg2 import sql
from datetime import datetime

# Database connection parameters from environment
DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'dicom-postgres-secured'),
    'port': int(os.getenv('DB_PORT', 5432)),
    'database': os.getenv('DB_NAME', 'worklist_db'),
    'user': os.getenv('DB_USER', 'dicom'),
    'password': os.getenv('DB_PASSWORD', ''),
}

MIGRATIONS_DIR = os.path.dirname(os.path.abspath(__file__))

def print_header(message):
    """Print formatted header"""
    print("\n" + "=" * 80)
    print(message)
    print("=" * 80 + "\n")

def print_success(message):
    """Print success message"""
    print(f"✓ {message}")

def print_error(message):
    """Print error message"""
    print(f"✗ {message}", file=sys.stderr)

def print_info(message):
    """Print info message"""
    print(f"ℹ {message}")

def wait_for_database(max_retries=30, retry_interval=2):
    """Wait for database to be ready"""
    import time
    
    print_info("Waiting for database to be ready...")
    
    for attempt in range(max_retries):
        try:
            conn = psycopg2.connect(**DB_CONFIG)
            conn.close()
            print_success("Database is ready")
            return True
        except psycopg2.OperationalError as e:
            if attempt < max_retries - 1:
                print_info(f"Database not ready, retrying... ({attempt + 1}/{max_retries})")
                time.sleep(retry_interval)
            else:
                print_error(f"Database not ready after {max_retries} attempts")
                return False
    
    return False

def create_migrations_table(conn):
    """Create migrations tracking table if not exists"""
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS pacs_migrations (
                id SERIAL PRIMARY KEY,
                migration_name VARCHAR(255) UNIQUE NOT NULL,
                applied_at TIMESTAMPTZ DEFAULT NOW(),
                success BOOLEAN DEFAULT TRUE,
                error_message TEXT
            )
        """)
        conn.commit()
        print_success("Migrations tracking table ready")

def get_applied_migrations(conn):
    """Get list of applied migrations"""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT migration_name 
            FROM pacs_migrations 
            WHERE success = TRUE
            ORDER BY id
        """)
        return [row[0] for row in cur.fetchall()]

def apply_migration(conn, migration_file):
    """Apply a single migration file"""
    migration_name = os.path.basename(migration_file)
    
    print_info(f"Applying migration: {migration_name}")
    
    try:
        # Read migration SQL
        with open(migration_file, 'r', encoding='utf-8') as f:
            migration_sql = f.read()
        
        # Execute migration
        with conn.cursor() as cur:
            cur.execute(migration_sql)
        
        # Record successful migration
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO pacs_migrations (migration_name, success)
                VALUES (%s, TRUE)
                ON CONFLICT (migration_name) DO UPDATE
                SET applied_at = NOW(), success = TRUE, error_message = NULL
            """, (migration_name,))
        
        conn.commit()
        print_success(f"Migration applied: {migration_name}")
        return True
        
    except Exception as e:
        conn.rollback()
        
        # Record failed migration
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO pacs_migrations (migration_name, success, error_message)
                    VALUES (%s, FALSE, %s)
                    ON CONFLICT (migration_name) DO UPDATE
                    SET applied_at = NOW(), success = FALSE, error_message = EXCLUDED.error_message
                """, (migration_name, str(e)))
            conn.commit()
        except:
            pass
        
        print_error(f"Migration failed: {migration_name}")
        print_error(f"Error: {str(e)}")
        return False

def run_migrations(conn):
    """Run all pending migrations"""
    print_header("Running PACS Database Migrations")
    
    # Get applied migrations
    applied = get_applied_migrations(conn)
    print_info(f"Already applied: {len(applied)} migrations")
    
    # Get all migration files
    migration_files = sorted([
        os.path.join(MIGRATIONS_DIR, f)
        for f in os.listdir(MIGRATIONS_DIR)
        if f.endswith('.sql')
    ])
    
    if not migration_files:
        print_info("No migration files found")
        return True
    
    print_info(f"Found {len(migration_files)} migration file(s)")
    
    # Apply pending migrations
    pending = [f for f in migration_files if os.path.basename(f) not in applied]
    
    if not pending:
        print_success("All migrations already applied")
        return True
    
    print_info(f"Pending migrations: {len(pending)}")
    
    success_count = 0
    for migration_file in pending:
        if apply_migration(conn, migration_file):
            success_count += 1
        else:
            print_error("Migration failed, stopping")
            return False
    
    print_success(f"Applied {success_count} migration(s)")
    return True

def verify_tables(conn):
    """Verify that PACS tables exist"""
    print_header("Verifying PACS Tables")
    
    expected_tables = [
        'pacs_studies',
        'pacs_series',
        'pacs_instances',
        'pacs_reports',
        'pacs_storage_stats',
        'pacs_audit_log',
        'pacs_migrations'
    ]
    
    with conn.cursor() as cur:
        cur.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name LIKE 'pacs_%'
            ORDER BY table_name
        """)
        existing_tables = [row[0] for row in cur.fetchall()]
    
    print_info(f"Found {len(existing_tables)} PACS table(s)")
    
    all_exist = True
    for table in expected_tables:
        if table in existing_tables:
            print_success(f"Table exists: {table}")
        else:
            print_error(f"Table missing: {table}")
            all_exist = False
    
    return all_exist

def get_table_counts(conn):
    """Get row counts for PACS tables"""
    print_header("PACS Tables Statistics")
    
    tables = [
        'pacs_studies',
        'pacs_series',
        'pacs_instances',
        'pacs_reports',
        'pacs_storage_stats',
        'pacs_audit_log'
    ]
    
    for table in tables:
        try:
            with conn.cursor() as cur:
                cur.execute(f"SELECT COUNT(*) FROM {table}")
                count = cur.fetchone()[0]
                print_info(f"{table}: {count} row(s)")
        except Exception as e:
            print_error(f"Error counting {table}: {str(e)}")

def main():
    """Main execution"""
    print_header("PACS Database Initialization")
    print_info(f"Database: {DB_CONFIG['database']}@{DB_CONFIG['host']}:{DB_CONFIG['port']}")
    print_info(f"User: {DB_CONFIG['user']}")
    print_info(f"Timestamp: {datetime.now().isoformat()}")
    
    # Wait for database
    if not wait_for_database():
        print_error("Database not available")
        sys.exit(1)
    
    # Connect to database
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        print_success("Connected to database")
    except Exception as e:
        print_error(f"Failed to connect to database: {str(e)}")
        sys.exit(1)
    
    try:
        # Create migrations table
        create_migrations_table(conn)
        
        # Run migrations
        if not run_migrations(conn):
            print_error("Migrations failed")
            sys.exit(1)
        
        # Verify tables
        if not verify_tables(conn):
            print_error("Table verification failed")
            sys.exit(1)
        
        # Show statistics
        get_table_counts(conn)
        
        print_header("PACS Database Initialization Complete")
        print_success("All migrations applied successfully")
        print_success("Database is ready for PACS operations")
        
    except Exception as e:
        print_error(f"Initialization failed: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    
    finally:
        conn.close()

if __name__ == '__main__':
    main()
