#!/usr/bin/env python3
"""
Procedure Mapping Seed Script
Seeds external systems and procedure mappings for SIMRS/HIS integration
"""
import os
import sys
import json
import psycopg2
from psycopg2.extras import RealDictCursor

# Database configuration
DB_CONFIG = {
    'host': os.getenv('POSTGRES_HOST', 'dicom-postgres-secured'),
    'database': os.getenv('POSTGRES_DB', 'worklist_db'),
    'user': os.getenv('POSTGRES_USER', 'dicom'),
    'password': os.getenv('POSTGRES_PASSWORD', 'dicom123'),
    'port': 5432
}

def load_json_file(filename):
    """Load JSON data from file"""
    filepath = os.path.join(os.path.dirname(__file__), filename)
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"❌ Error: File {filename} not found")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"❌ Error: Invalid JSON in {filename}: {e}")
        sys.exit(1)

def seed_external_systems(conn):
    """Seed external systems data"""
    print("\n" + "=" * 80)
    print("Seeding External Systems")
    print("=" * 80)

    systems = load_json_file('external_systems_seed.json')
    cursor = conn.cursor(cursor_factory=RealDictCursor)

    inserted = 0
    skipped = 0
    system_ids = {}

    for system in systems:
        try:
            # Check if system already exists
            cursor.execute(
                "SELECT id FROM external_systems WHERE system_code = %s",
                (system['system_code'],)
            )
            existing = cursor.fetchone()

            if existing:
                system_ids[system['system_code']] = existing['id']
                print(f"⚠️  Skipped: {system['system_code']} (already exists)")
                skipped += 1
                continue

            # Insert external system
            cursor.execute("""
                INSERT INTO external_systems (
                    system_code, system_name, system_type, system_version, vendor,
                    base_url, api_endpoint, auth_type, contact_person,
                    contact_email, is_active, notes,
                    code, name, type, version
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (
                system['system_code'],
                system['system_name'],
                system['system_type'],
                system.get('system_version'),
                system.get('vendor'),
                system.get('base_url'),
                system.get('api_endpoint'),
                system.get('auth_type'),
                system.get('contact_person'),
                system.get('contact_email'),
                system.get('is_active', True),
                system.get('notes'),
                system['system_code'],
                system['system_name'],
                system['system_type'],
                system.get('system_version')
            ))

            result = cursor.fetchone()
            system_ids[system['system_code']] = result['id']
            print(f"✓ Inserted: {system['system_code']} - {system['system_name']}")
            inserted += 1

        except Exception as e:
            print(f"❌ Error inserting {system.get('system_code', 'unknown')}: {str(e)}")
            continue

    conn.commit()

    print(f"\nSeeding completed:")
    print(f"  - Inserted: {inserted} systems")
    print(f"  - Skipped: {skipped} systems (already exist)")
    print(f"  - Total: {len(systems)} systems in seed file")

    return system_ids

def get_procedure_id_by_code(conn, code):
    """Get procedure UUID by code"""
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    cursor.execute("SELECT id FROM procedures WHERE code = %s", (code,))
    result = cursor.fetchone()
    return result['id'] if result else None

def seed_procedure_mappings(conn, system_ids):
    """Seed procedure mappings data"""
    print("\n" + "=" * 80)
    print("Seeding Procedure Mappings")
    print("=" * 80)

    mappings = load_json_file('procedure_mappings_seed.json')
    cursor = conn.cursor(cursor_factory=RealDictCursor)

    inserted = 0
    skipped = 0
    errors = []

    for mapping in mappings:
        try:
            # Get external system ID
            system_code = mapping['external_system_code']
            if system_code not in system_ids:
                errors.append(f"External system not found: {system_code}")
                skipped += 1
                continue

            external_system_id = system_ids[system_code]

            # Get PACS procedure ID
            pacs_procedure_id = get_procedure_id_by_code(conn, mapping['pacs_procedure_code'])
            if not pacs_procedure_id:
                errors.append(f"PACS procedure not found: {mapping['pacs_procedure_code']} for mapping {mapping['external_code']}")
                skipped += 1
                continue

            # Check if mapping already exists
            cursor.execute("""
                SELECT id FROM procedure_mappings
                WHERE external_system_id = %s AND external_code = %s
            """, (external_system_id, mapping['external_code']))

            if cursor.fetchone():
                print(f"⚠️  Skipped: {system_code}:{mapping['external_code']} (already exists)")
                skipped += 1
                continue

            # Insert mapping
            cursor.execute("""
                INSERT INTO procedure_mappings (
                    external_system_id, external_code, external_name, external_description,
                    pacs_procedure_id, mapping_type, confidence_level, notes,
                    is_active, mapped_by
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (
                external_system_id,
                mapping['external_code'],
                mapping.get('external_name'),
                mapping.get('external_description'),
                pacs_procedure_id,
                mapping.get('mapping_type', 'exact'),
                mapping.get('confidence_level', 100),
                mapping.get('notes'),
                True,
                'seed_script'
            ))

            print(f"✓ Mapped: {system_code}:{mapping['external_code']} → {mapping['pacs_procedure_code']}")
            inserted += 1

        except Exception as e:
            error_msg = f"Error inserting mapping {mapping.get('external_code', 'unknown')}: {str(e)}"
            errors.append(error_msg)
            print(f"❌ {error_msg}")
            skipped += 1
            continue

    conn.commit()

    print(f"\nSeeding completed:")
    print(f"  - Inserted: {inserted} mappings")
    print(f"  - Skipped: {skipped} mappings")
    print(f"  - Total: {len(mappings)} mappings in seed file")

    if errors:
        print(f"\n⚠️  Errors encountered:")
        for error in errors[:10]:  # Show first 10 errors
            print(f"  - {error}")
        if len(errors) > 10:
            print(f"  ... and {len(errors) - 10} more errors")

    return inserted

def verify_seeding(conn):
    """Verify seeded data"""
    print("\n" + "=" * 80)
    print("Verification")
    print("=" * 80)

    cursor = conn.cursor(cursor_factory=RealDictCursor)

    # Count external systems
    cursor.execute("SELECT COUNT(*) as count FROM external_systems")
    system_count = cursor.fetchone()['count']
    print(f"\n✓ External Systems: {system_count}")

    # Count mappings
    cursor.execute("SELECT COUNT(*) as count FROM procedure_mappings")
    mapping_count = cursor.fetchone()['count']
    print(f"✓ Procedure Mappings: {mapping_count}")

    # Count by system
    cursor.execute("""
        SELECT es.system_code, es.system_name, COUNT(pm.id) as mapping_count
        FROM external_systems es
        LEFT JOIN procedure_mappings pm ON es.id = pm.external_system_id
        GROUP BY es.id, es.system_code, es.system_name
        ORDER BY mapping_count DESC
    """)

    print("\n📊 Mappings by System:")
    for row in cursor.fetchall():
        print(f"  - {row['system_code']}: {row['mapping_count']} mappings")

    # Show sample mappings
    cursor.execute("""
        SELECT
            es.system_code,
            pm.external_code,
            pm.external_name,
            p.code as pacs_code,
            p.name as pacs_name,
            pm.mapping_type,
            pm.confidence_level
        FROM procedure_mappings pm
        JOIN external_systems es ON pm.external_system_id = es.id
        LEFT JOIN procedures p ON pm.pacs_procedure_id = p.id
        ORDER BY es.system_code, pm.external_code
        LIMIT 5
    """)

    print("\n📋 Sample Mappings:")
    for row in cursor.fetchall():
        print(f"  {row['system_code']}:{row['external_code']} → {row['pacs_code']}")
        print(f"     {row['external_name']} → {row['pacs_name']}")
        print(f"     Type: {row['mapping_type']}, Confidence: {row['confidence_level']}%")

def main():
    """Main seeding function"""
    print("=" * 80)
    print("Procedure Mapping Seeding Script")
    print("=" * 80)

    try:
        # Connect to database
        print("\n🔌 Connecting to database...")
        conn = psycopg2.connect(**DB_CONFIG)
        print("✓ Database connection successful")

        # Seed external systems
        system_ids = seed_external_systems(conn)

        # Seed procedure mappings
        seed_procedure_mappings(conn, system_ids)

        # Verify seeding
        verify_seeding(conn)

        conn.close()

        print("\n" + "=" * 80)
        print("✅ Seeding completed successfully!")
        print("=" * 80)

    except psycopg2.OperationalError as e:
        print(f"\n❌ Database connection failed: {str(e)}")
        print("\nPlease ensure:")
        print("  1. PostgreSQL is running")
        print("  2. Database 'worklist_db' exists")
        print("  3. Database credentials are correct")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Seeding failed: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    main()
