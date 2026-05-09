import os
import sys
import bcrypt
import psycopg2
from dotenv import load_dotenv

# Load environment variables from .env file
# This assumes the .env file is in the same directory as the script, or in a parent directory.
load_dotenv()

# Database configuration from .env and auth_service.py defaults
DB_CONFIG = {
    'host': os.getenv('POSTGRES_HOST', 'postgres'),
    'database': os.getenv('POSTGRES_DB', 'worklist_db'),
    'user': os.getenv('POSTGRES_USER', 'dicom'),
    'password': os.getenv('POSTGRES_PASSWORD', 'dicom123'),
    'port': 5432,
}

ADMIN_EMAIL = os.getenv('ADMIN_EMAIL', 'admin@hospital.local')

def hash_password(password):
    # bcrypt expects bytes, so encode the password
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def reset_admin_password_in_db(new_password):
    conn = None
    try:
        print(f"Attempting to connect to database: {DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['database']}")
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()

        hashed_password = hash_password(new_password)

        print(f"Resetting password for admin user with email: {ADMIN_EMAIL}")
        cursor.execute(
            "UPDATE users SET password_hash = %s, updated_at = CURRENT_TIMESTAMP WHERE email = %s",
            (hashed_password, ADMIN_EMAIL)
        )
        conn.commit()

        if cursor.rowcount == 0:
            print(f"Error: User with email '{ADMIN_EMAIL}' not found in the database.")
            return False
        else:
            print(f"Successfully reset password for '{ADMIN_EMAIL}'.")
            return True

    except Exception as e:
        print(f"Database error: {e}")
        return False
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python reset_admin_password.py <new_password>")
        sys.exit(1)

    new_password = sys.argv[1]

    if len(new_password) < 8:
        print("Error: New password must be at least 8 characters long.")
        sys.exit(1)

    print("\n--- Admin Password Reset Script ---")
    print("This script will update the password for the admin user directly in the PostgreSQL database.")
    print(f"Target Admin Email: {ADMIN_EMAIL}")
    print(f"Database Host: {DB_CONFIG['host']}")
    print(f"Database Name: {DB_CONFIG['database']}")
    print(f"Database User: {DB_CONFIG['user']}")
    print("\nWARNING: Ensure you have a backup of your database before proceeding.")
    
    confirm = input("Type 'yes' to confirm and proceed with the password reset: ")
    if confirm.lower() == 'yes':
        if reset_admin_password_in_db(new_password):
            print("\nPassword reset process completed.")
        else:
            print("\nPassword reset failed.")
    else:
        print("Password reset cancelled by user.")
        sys.exit(0)
