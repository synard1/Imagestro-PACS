#!/usr/bin/env python3
"""
Run Worklist Migration
Executes the 006_create_worklist_tables.sql migration
"""
import os
import sys
import psycopg2
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(env_path)

# Database configuration
DB_CONFIG = {
    'host': os.getenv('POSTGRES_HOST', 'localhost'),
    'port': int(os.getenv('POSTGRES_PORT', 5532)), 
    'database': os.getenv('POSTGRES_DB', 'worklist_db'),
    'user': os.getenv('POSTGRES_USER', 'dicom'),
    'password': os.getenv('POSTGRES_PASSWORD', 'dicom123'),
    'connect_timeout': 10
}

MIGRATION_FILE = Path(__file__).parent / 'migrations' / '006_create_worklist_tables.sql'


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


def run_migration():
    """Run the worklist migration"""
    print_header("Running Worklist Migration")
    
    # Check migration file exists
    if not MIGRATION_FILE.exists():
        print_error(f"Migration file not found: {MIGRATION_FILE}")
        return False
    
    print(f"Database: {DB_CONFIG['database']}")
    print(f"Host: {DB_CONFIG['host']}:{DB_CONFIG['port']}")
    print(f"User: {DB_CONFIG['user']}")
    print(f"Migration file: {MIGRATION_FILE}")
    print()
    
    import time
    
    # Wait for database with retry
    max_retries = 30
    conn = None
    for attempt in range(max_retries):
        try:
            print(f"[{attempt+1}/{max_retries}] Connecting to database...")
            conn = psycopg2.connect(**DB_CONFIG)
            break
        except psycopg2.OperationalError as e:
            if "the database system is starting up" in str(e).lower():
                print_error(f"DB starting up (attempt {attempt+1}/{max_retries})...")
                if attempt < max_retries - 1:
                    time.sleep(2 * (2 ** min(attempt // 5, 3)))
                    continue
            raise
    try:
        conn.autocommit = False
        cursor = conn.cursor()
        print_success("Connected to database")
        
        # Read migration file
        print("Reading migration file...")
        with open(MIGRATION_FILE, 'r') as f:
            migration_sql = f.read()
        print_success(f"Read migration file ({len(migration_sql)} bytes)")
        
        # Execute migration
        print("Executing migration...")
        cursor.execute(migration_sql)
        conn.commit()
        print_success("Migration executed successfully")
        
        # Verify tables created
        print("\nVerifying tables...")
        cursor.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('worklist_items', 'worklist_history', 'schedule_slots')
            ORDER BY table_name
        """)
        tables = cursor.fetchall()
        
        if len(tables) == 3:
            print_success("All tables created:")
            for table in tables:
                print(f"  - {table[0]}")
        else:
            print_error(f"Expected 3 tables, found {len(tables)}")
            return False
        
        # Check table counts
        print("\nChecking table counts...")
        cursor.execute("""
            SELECT 
                'worklist_items' as table_name, 
                COUNT(*) as count 
            FROM worklist_items
            UNION ALL
            SELECT 
                'worklist_history' as table_name, 
                COUNT(*) as count 
            FROM worklist_history
            UNION ALL
            SELECT 
                'schedule_slots' as table_name, 
                COUNT(*) as count 
            FROM schedule_slots
        """)
        counts = cursor.fetchall()
        for table_name, count in counts:
            print(f"  - {table_name}: {count} rows")
        
        # Check indexes
        print("\nVerifying indexes...")
        cursor.execute("""
            SELECT indexname 
            FROM pg_indexes 
            WHERE tablename IN ('worklist_items', 'worklist_history', 'schedule_slots')
            ORDER BY indexname
        """)
        indexes = cursor.fetchall()
        print_success(f"Created {len(indexes)} indexes")
        
        # Check triggers
        print("\nVerifying triggers...")
        cursor.execute("""
            SELECT trigger_name, event_object_table
            FROM information_schema.triggers
            WHERE event_object_table IN ('worklist_items', 'schedule_slots', 'orders')
            AND trigger_name LIKE '%worklist%'
            ORDER BY trigger_name
        """)
        triggers = cursor.fetchall()
        print_success(f"Created {len(triggers)} triggers:")
        for trigger_name, table_name in triggers:
            print(f"  - {trigger_name} on {table_name}")
        
        # Check views
        print("\nVerifying views...")
        cursor.execute("""
            SELECT table_name 
            FROM information_schema.views 
            WHERE table_schema = 'public' 
            AND table_name LIKE 'v_worklist%'
            ORDER BY table_name
        """)
        views = cursor.fetchall()
        print_success(f"Created {len(views)} views:")
        for view in views:
            print(f"  - {view[0]}")
        
        # Check functions
        print("\nVerifying functions...")
        cursor.execute("""
            SELECT routine_name 
            FROM information_schema.routines 
            WHERE routine_schema = 'public' 
            AND routine_name LIKE '%worklist%'
            ORDER BY routine_name
        """)
        functions = cursor.fetchall()
        print_success(f"Created {len(functions)} functions:")
        for func in functions:
            print(f"  - {func[0]}")
        
        cursor.close()
        conn.close()
        
        print_header("Migration Completed Successfully")
        return True
        
    except psycopg2.Error as e:
        print_error(f"Database error: {e}")
        if conn:
            try:
                conn.rollback()
                conn.close()
            except:
                pass
        return False
    except Exception as e:
        print_error(f"Unexpected error: {e}")
        if conn:
            try:
                conn.rollback()
                conn.close()
            except:
                pass
        return False


if __name__ == '__main__':
    success = run_migration()
    sys.exit(0 if success else 1)