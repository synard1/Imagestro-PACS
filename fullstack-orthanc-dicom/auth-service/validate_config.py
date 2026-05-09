#!/usr/bin/env python3
"""
Configuration validation script for auth-service
"""
import os
import sys
import psycopg2

def validate_environment():
    """Validate required environment variables"""
    required_vars = [
        'POSTGRES_HOST',
        'POSTGRES_DB', 
        'POSTGRES_USER',
        'POSTGRES_PASSWORD'
    ]
    
    missing_vars = []
    for var in required_vars:
        if not os.getenv(var):
            missing_vars.append(var)
    
    if missing_vars:
        print(f"❌ Missing required environment variables: {', '.join(missing_vars)}")
        return False
    
    print("✅ All required environment variables are set")
    return True

def validate_database_connection():
    """Test database connectivity"""
    try:
        db_config = {
            'host': os.getenv('POSTGRES_HOST', 'postgres'),
            'database': os.getenv('POSTGRES_DB', 'worklist_db'),
            'user': os.getenv('POSTGRES_USER', 'dicom'),
            'password': os.getenv('POSTGRES_PASSWORD', 'dicom123'),
            'port': int(os.getenv('POSTGRES_PORT', '5432')),
            'connect_timeout': 5
        }
        
        conn = psycopg2.connect(**db_config)
        cursor = conn.cursor()
        cursor.execute("SELECT version()")
        version = cursor.fetchone()[0]
        conn.close()
        
        print(f"✅ Database connection successful: {version}")
        return True
        
    except Exception as e:
        print(f"❌ Database connection failed: {str(e)}")
        return False

def main():
    """Main validation function"""
    print("🔍 Validating auth-service configuration...")
    print("=" * 50)
    
    env_ok = validate_environment()
    db_ok = validate_database_connection()
    
    print("=" * 50)
    
    if env_ok and db_ok:
        print("✅ All validations passed! Auth-service should start successfully.")
        sys.exit(0)
    else:
        print("❌ Validation failed! Please fix the issues above.")
        sys.exit(1)

if __name__ == '__main__':
    main()