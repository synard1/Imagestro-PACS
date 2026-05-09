import os
import sys
import bcrypt
import psycopg2
from datetime import datetime

# Database configuration (should be available as environment variables in the container)
DB_CONFIG = {
    'host': os.getenv('POSTGRES_HOST', 'postgres'),
    'database': os.getenv('POSTGRES_DB', 'worklist_db'),
    'user': os.getenv('POSTGRES_USER', 'dicom'),
    'password': os.getenv('POSTGRES_PASSWORD', 'dicom123'),
    'port': int(os.getenv('POSTGRES_PORT', 5432)),
}

def hash_password(password):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def reset_admin_password_in_db(admin_email, new_password):
    conn = None
    try:
        print(f"Attempting to connect to database: {DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['database']}")
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()

        hashed_password = hash_password(new_password)

        print(f"Resetting password for admin user with email: {admin_email}")
        cursor.execute(
            "UPDATE users SET password_hash = %s, updated_at = %s WHERE email = %s",
            (hashed_password, datetime.now(), admin_email)
        )
        conn.commit()

        if cursor.rowcount == 0:
            print(f"Error: User with email '{admin_email}' not found in the database.")
            return False
        else:
            print(f"Successfully reset password for '{admin_email}'.")
            return True

    except Exception as e:
        print(f"Database error: {e}")
        return False
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python reset_password_internal.py <admin_email> <new_password>")
        sys.exit(1)

    admin_email = sys.argv[1]
    new_password = sys.argv[2]

    if len(new_password) < 8:
        print("Error: New password must be at least 8 characters long.")
        sys.exit(1)

    if reset_admin_password_in_db(admin_email, new_password):
        sys.exit(0)
    else:
        sys.exit(1)
