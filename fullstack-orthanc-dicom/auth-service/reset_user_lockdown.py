import os
import sys
import psycopg2
from datetime import datetime, timedelta

# Configuration (mirrored from auth_service.py)
DB_CONFIG = {
    'host': os.getenv('POSTGRES_HOST', 'postgres'),
    'database': os.getenv('POSTGRES_DB', 'worklist_db'),
    'user': os.getenv('POSTGRES_USER', 'dicom'),
    'password': os.getenv('POSTGRES_PASSWORD', 'dicom123'),
    'port': 5432,
    'connect_timeout': 10,
    'application_name': 'auth_service_reset_lockdown'
}

def reset_user_lockdown(identifier, is_id=False):
    """
    Resets the failed_login_attempts and locked_until fields for a user.
    Can identify the user by username/email or by user ID.
    """
    conn = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()

        if is_id:
            query = """
                UPDATE users
                SET failed_login_attempts = 0,
                    locked_until = NULL
                WHERE id = %s
                RETURNING username, email, failed_login_attempts, locked_until
            """
            cursor.execute(query, (identifier,))
        else:
            query = """
                UPDATE users
                SET failed_login_attempts = 0,
                    locked_until = NULL
                WHERE username = %s OR email = %s
                RETURNING username, email, failed_login_attempts, locked_until
            """
            cursor.execute(query, (identifier, identifier))

        updated_user = cursor.fetchone()
        if updated_user:
            conn.commit()
            print(f"Successfully reset lockdown for user '{updated_user[0]}' (email: {updated_user[1]}).")
            print(f"New state: failed_login_attempts={updated_user[2]}, locked_until={updated_user[3]}")
            return True
        else:
            print(f"Error: User with identifier '{identifier}' not found.")
            return False

    except psycopg2.Error as e:
        if conn:
            conn.rollback()
        print(f"Database error: {e}")
        return False
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        return False
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python reset_user_lockdown.py <username_or_email> [--id]")
        print("  <username_or_email>: The username or email of the user to unlock.")
        print("  --id: Optional flag. If present, the first argument is treated as a user ID (UUID).")
        sys.exit(1)

    identifier = sys.argv[1]
    is_id_flag = "--id" in sys.argv

    print(f"Attempting to reset lockdown for user: {identifier} (by {'ID' if is_id_flag else 'username/email'})...")
    reset_user_lockdown(identifier, is_id=is_id_flag)
