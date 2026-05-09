#!/usr/bin/env python3
"""Run migration 005 - Create DICOM Nodes table"""

import sys
from pathlib import Path

# Add pacs-service to path
sys.path.insert(0, str(Path(__file__).parent / "pacs-service"))

from app.database import engine
from sqlalchemy import text

def run_migration():
    """Run migration 005"""
    migration_file = Path(__file__).parent / "pacs-service" / "migrations" / "005_create_dicom_nodes_tables.sql"
    
    print("=" * 60)
    print("Running Migration 005: Create DICOM Nodes Tables")
    print("=" * 60)
    
    with open(migration_file, 'r') as f:
        sql = f.read()
    
    try:
        with engine.connect() as conn:
            conn.execute(text(sql))
            conn.commit()
        
        print("✓ Migration 005 applied successfully")
        print("✓ DICOM nodes tables created:")
        print("  - dicom_nodes (main configuration)")
        print("  - dicom_associations (connection log)")
        print("  - dicom_operations (operation log)")
        print("✓ Default nodes inserted")
        print("✓ Views and functions created")
        return True
        
    except Exception as e:
        print(f"✗ Migration failed: {e}")
        return False

if __name__ == "__main__":
    success = run_migration()
    sys.exit(0 if success else 1)
