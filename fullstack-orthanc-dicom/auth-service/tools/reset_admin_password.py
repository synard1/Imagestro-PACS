#!/usr/bin/env python3
"""
Utility: Reset admin password in the Auth Service database

Usage inside container (examples):
  python -u /app/tools/reset_admin_password.py --password "NewP@ssw0rd"
  python -u /app/tools/reset_admin_password.py --username admin --password "Admin@a8j9qNeSQJRIQ=="
  python -u /app/tools/reset_admin_password.py --email admin@hospital.local --password "Admin@12345"

Reads DB connection from environment:
  POSTGRES_HOST, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_PORT

Notes:
- Resets failed_login_attempts and clears locked_until.
- Uses bcrypt for hashing (same as Auth Service).
"""

import os
import sys
import argparse
import bcrypt
import psycopg2


def parse_args():
    p = argparse.ArgumentParser(description="Reset admin password in Auth Service DB")
    p.add_argument("--username", default=None, help="Target username (default: admin)")
    p.add_argument("--email", default=None, help="Target email (default: admin@hospital.local)")
    p.add_argument("--password", default=None, help="New plaintext password (default: from ADMIN_PASSWORD env)")
    p.add_argument("--dry-run", action="store_true", help="Do not update DB; print what would change")
    return p.parse_args()


def get_db_conn():
    host = os.getenv("POSTGRES_HOST", "postgres")
    db = os.getenv("POSTGRES_DB", "worklist_db")
    user = os.getenv("POSTGRES_USER", "dicom")
    pw = os.getenv("POSTGRES_PASSWORD", "dicom123")
    port = int(os.getenv("POSTGRES_PORT", "5432"))
    return psycopg2.connect(host=host, database=db, user=user, password=pw, port=port, connect_timeout=10)


def main():
    args = parse_args()

    target_username = args.username or "admin"
    target_email = args.email or "admin@hospital.local"

    new_password = args.password or os.getenv("ADMIN_PASSWORD")
    if not new_password:
        print("ERROR: Please provide --password or set ADMIN_PASSWORD env.", file=sys.stderr)
        sys.exit(2)

    password_hash = bcrypt.hashpw(new_password.encode(), bcrypt.gensalt()).decode()

    where_clause = "(username = %s OR email = %s)"

    print(f"Connecting to DB: host={os.getenv('POSTGRES_HOST','postgres')} db={os.getenv('POSTGRES_DB','worklist_db')} user={os.getenv('POSTGRES_USER','dicom')} port={os.getenv('POSTGRES_PORT','5432')}")
    print(f"Target user: username={target_username} email={target_email}")
    print(f"Dry-run: {args.dry_run}")

    if args.dry_run:
        print("Would update users set password_hash=<bcrypt>, failed_login_attempts=0, locked_until=NULL where (username=? or email=?).")
        print(f"New bcrypt hash: {password_hash}")
        sys.exit(0)

    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    UPDATE users
                    SET password_hash = %s,
                        failed_login_attempts = 0,
                        locked_until = NULL
                    WHERE {where_clause}
                    """,
                    (password_hash, target_username, target_email)
                )
                updated = cur.rowcount
                conn.commit()
                if updated == 0:
                    print("No matching admin user found. Consider checking username/email or seeding.", file=sys.stderr)
                    sys.exit(1)
                print(f"Password updated for {updated} user(s).")
                print("You can now login with the new password.")
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()