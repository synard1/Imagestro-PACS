#!/usr/bin/env python3
"""
Comprehensive Database Analysis Script
Menganalisis masalah schema database di semua service yang terkait
"""

import os
import sys
import psycopg2
from psycopg2.extras import RealDictCursor
import json
from datetime import datetime
from dotenv import load_dotenv

def print_header(title):
    print(f"\n{'='*60}")
    print(f" {title}")
    print(f"{'='*60}")

def print_section(title):
    print(f"\n{'-'*40}")
    print(f" {title}")
    print(f"{'-'*40}")

def test_connection(config, service_name):
    """Test database connection with given config"""
    print_section(f"Testing {service_name} Connection")
    print(f"Host: {config['host']}:{config['port']}")
    print(f"Database: {config['dbname']}")
    print(f"User: {config['user']}")
    
    try:
        conn = psycopg2.connect(**config)
        print("✅ Connection successful!")
        
        # Test basic query
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT version();")
            version = cur.fetchone()
            print(f"PostgreSQL Version: {version['version']}")
            
        conn.close()
        return True
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        return False

def analyze_schema(config, service_name):
    """Analyze database schema"""
    print_section(f"Analyzing Schema via {service_name}")
    
    try:
        conn = psycopg2.connect(**config)
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Check if sim_orders table exists
            cur.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'sim_orders'
                );
            """)
            table_exists = cur.fetchone()['exists']
            
            if not table_exists:
                print("❌ Table 'sim_orders' does not exist!")
                return False
            
            print("✅ Table 'sim_orders' exists")
            
            # Get column information for satusehat_service_request_id
            cur.execute("""
                SELECT column_name, data_type, character_maximum_length, is_nullable
                FROM information_schema.columns 
                WHERE table_schema = 'public' 
                AND table_name = 'sim_orders' 
                AND column_name = 'satusehat_service_request_id';
            """)
            column_info = cur.fetchone()
            
            if not column_info:
                print("❌ Column 'satusehat_service_request_id' does not exist!")
                return False
            
            print("✅ Column 'satusehat_service_request_id' exists")
            print(f"   Data Type: {column_info['data_type']}")
            print(f"   Max Length: {column_info['character_maximum_length']}")
            print(f"   Nullable: {column_info['is_nullable']}")
            
            # Check current data in the column
            cur.execute("""
                SELECT id, satusehat_service_request_id, 
                       LENGTH(satusehat_service_request_id) as current_length
                FROM sim_orders 
                WHERE satusehat_service_request_id IS NOT NULL 
                LIMIT 5;
            """)
            sample_data = cur.fetchall()
            
            if sample_data:
                print("\n📊 Sample data:")
                for row in sample_data:
                    print(f"   ID: {row['id']}")
                    print(f"   Service Request ID: {row['satusehat_service_request_id']}")
                    print(f"   Length: {row['current_length']}")
                    print()
            else:
                print("📊 No existing data in satusehat_service_request_id column")
            
            # Get all columns for reference
            cur.execute("""
                SELECT column_name, data_type, character_maximum_length
                FROM information_schema.columns 
                WHERE table_schema = 'public' 
                AND table_name = 'sim_orders' 
                ORDER BY ordinal_position;
            """)
            all_columns = cur.fetchall()
            
            print("\n📋 All columns in sim_orders table:")
            for col in all_columns:
                max_len = f"({col['character_maximum_length']})" if col['character_maximum_length'] else ""
                print(f"   {col['column_name']}: {col['data_type']}{max_len}")
        
        conn.close()
        return True
        
    except Exception as e:
        print(f"❌ Schema analysis failed: {e}")
        return False

def attempt_schema_fix(config, service_name):
    """Attempt to fix the schema"""
    print_section(f"Attempting Schema Fix via {service_name}")
    
    try:
        conn = psycopg2.connect(**config)
        with conn.cursor() as cur:
            # Try to alter the column
            print("🔧 Attempting to alter satusehat_service_request_id to VARCHAR(100)...")
            cur.execute("""
                ALTER TABLE sim_orders 
                ALTER COLUMN satusehat_service_request_id 
                TYPE VARCHAR(100);
            """)
            conn.commit()
            print("✅ Schema alteration successful!")
            
            # Verify the change
            cur.execute("""
                SELECT character_maximum_length
                FROM information_schema.columns 
                WHERE table_schema = 'public' 
                AND table_name = 'sim_orders' 
                AND column_name = 'satusehat_service_request_id';
            """)
            new_length = cur.fetchone()[0]
            print(f"✅ Verified: New max length is {new_length}")
            
        conn.close()
        return True
        
    except Exception as e:
        print(f"❌ Schema fix failed: {e}")
        return False

def test_data_insertion(config, service_name):
    """Test inserting data with various lengths"""
    print_section(f"Testing Data Insertion via {service_name}")
    
    test_cases = [
        ("a", "Single character"),
        ("test-short", "Short string"),
        ("a" * 20, "20 characters (old limit)"),
        ("a" * 50, "50 characters"),
        ("550e8400-e29b-41d4-a716-446655440000", "UUID format (36 chars)"),
        ("a" * 100, "100 characters (new limit)")
    ]
    
    try:
        conn = psycopg2.connect(**config)
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Find a test order
            cur.execute("SELECT id FROM sim_orders LIMIT 1;")
            test_order = cur.fetchone()
            
            if not test_order:
                print("❌ No orders found for testing")
                return False
            
            test_order_id = test_order['id']
            print(f"🧪 Using test order ID: {test_order_id}")
            
            for test_value, description in test_cases:
                try:
                    print(f"\n   Testing {description} ({len(test_value)} chars)...")
                    cur.execute("""
                        UPDATE sim_orders 
                        SET satusehat_service_request_id = %s 
                        WHERE id = %s
                    """, (test_value, test_order_id))
                    conn.commit()
                    print(f"   ✅ Success: '{test_value[:20]}{'...' if len(test_value) > 20 else ''}'")
                    
                except Exception as e:
                    print(f"   ❌ Failed: {e}")
                    conn.rollback()
        
        conn.close()
        return True
        
    except Exception as e:
        print(f"❌ Data insertion test failed: {e}")
        return False

from dotenv import load_dotenv

def main():
    load_dotenv('/home/apps/fullstack-orthanc-dicom/.env')
    print_header("COMPREHENSIVE DATABASE ANALYSIS")
    print(f"Timestamp: {datetime.now().isoformat()}")
    
    # Configuration for different services
    configs = {
        "simrs-order-ui (localhost:5532)": {
            "host": "localhost",
            "port": 5532,
            "dbname": "worklist_db",
            "user": "dicom",
            "password": os.getenv("POSTGRES_PASSWORD", "dicom123"),
            "connect_timeout": 10
        }
    }
    
    successful_configs = []
    
    # Test all connections
    print_header("CONNECTION TESTS")
    for service_name, config in configs.items():
        if test_connection(config, service_name):
            successful_configs.append((service_name, config))
    
    if not successful_configs:
        print("\n❌ No successful database connections found!")
        print("\n🔍 Possible issues:")
        print("   1. PostgreSQL container is not running")
        print("   2. Port mapping is incorrect")
        print("   3. Database credentials are wrong")
        print("   4. Network connectivity issues")
        return
    
    # Use the first successful connection for analysis
    working_service, working_config = successful_configs[0]
    print(f"\n✅ Using {working_service} for detailed analysis")
    
    # Analyze schema
    print_header("SCHEMA ANALYSIS")
    if not analyze_schema(working_config, working_service):
        print("❌ Schema analysis failed, cannot continue")
        return
    
    # Attempt schema fix
    print_header("SCHEMA FIX ATTEMPT")
    if attempt_schema_fix(working_config, working_service):
        # Re-analyze after fix
        print_header("POST-FIX SCHEMA VERIFICATION")
        analyze_schema(working_config, working_service)
        
        # Test data insertion
        print_header("DATA INSERTION TESTS")
        test_data_insertion(working_config, working_service)
    
    print_header("ANALYSIS COMPLETE")
    print("📋 Summary:")
    print(f"   - Successful connections: {len(successful_configs)}")
    print(f"   - Working configuration: {working_service}")
    print("\n💡 Next steps:")
    print("   1. Restart simrs-order-ui application")
    print("   2. Test the PATCH endpoint with various payloads")
    print("   3. Monitor application logs for any remaining issues")

if __name__ == "__main__":
    main()