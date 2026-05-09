#!/usr/bin/env python3
"""
Run SQL Migration Script
Execute SQL migration files against the database
"""

import psycopg2
import sys
import os
from pathlib import Path

# Database configuration
DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'port': os.getenv('DB_PORT', '5432'),
    'database': os.getenv('DB_NAME', 'worklist_db'),
    'user': os.getenv('DB_USER', 'dicom'),
    'password': os.getenv('DB_PASSWORD', os.getenv('POSTGRES_PASSWORD', 'dicom123'))
}


def run_migration(sql_file):
    """Run a SQL migration file"""
    print(f"Running migration: {sql_file}")
    print("=" * 80)
    
    try:
        # Read SQL file
        with open(sql_file, 'r', encoding='utf-8') as f:
            sql_content = f.read()
        
        # Connect to database
        print(f"Connecting to database: {DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['database']}")
        conn = psycopg2.connect(**DB_CONFIG)
        conn.autocommit = True
        cursor = conn.cursor()
        
        # Execute SQL
        print("Executing SQL...")
        cursor.execute(sql_content)
        
        # Get notices (PostgreSQL messages)
        if conn.notices:
            print("\nDatabase Messages:")
            for notice in conn.notices:
                print(notice.strip())
        
        # Close connection
        cursor.close()
        conn.close()
        
        print("=" * 80)
        print(f"✓ Migration completed successfully: {sql_file}")
        return True
        
    except Exception as e:
        print("=" * 80)
        print(f"✗ Migration failed: {sql_file}")
        print(f"Error: {str(e)}")
        return False


def main():
    """Main function"""
    if len(sys.argv) < 2:
        print("Usage: python run_migration.py <migration_file.sql>")
        print("\nAvailable migrations:")
        migrations_dir = Path(__file__).parent
        for sql_file in sorted(migrations_dir.glob("*.sql")):
            print(f"  - {sql_file.name}")
        sys.exit(1)
    
    sql_file = sys.argv[1]
    
    # Check if file exists
    if not os.path.exists(sql_file):
        # Try relative to migrations directory
        migrations_dir = Path(__file__).parent
        sql_file = migrations_dir / sql_file
        
        if not sql_file.exists():
            print(f"Error: Migration file not found: {sql_file}")
            sys.exit(1)
    
    # Run migration
    success = run_migration(sql_file)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
