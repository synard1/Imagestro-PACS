"""
Authentication Service with JWT and User Management
Handles login, registration, token management, and RBAC
"""

import os
import sys
import uuid
import secrets
import time
from datetime import datetime, timedelta
from flask import Flask, request, jsonify
from flask_cors import CORS
import jwt
import bcrypt
import psycopg2
from psycopg2.extras import RealDictCursor, Json
from contextlib import contextmanager
from functools import wraps, lru_cache
import logging
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# === Anti-DDoS & Rate Limiting Configuration ===
AUTH_RATE_LIMIT_LOGIN = os.getenv("AUTH_RATE_LIMIT_LOGIN", "5 per minute")
AUTH_RATE_LIMIT_REGISTER = os.getenv("AUTH_RATE_LIMIT_REGISTER", "10 per hour")
AUTH_RATE_LIMIT_VERIFY = os.getenv("AUTH_RATE_LIMIT_VERIFY", "60 per minute")
AUTH_GLOBAL_LIMITS = os.getenv("AUTH_GLOBAL_LIMITS", "1000 per hour;200 per minute")

# Initialize limiter (in-memory by default; can be swapped to Redis in production)
limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=[
        limit.strip() for limit in AUTH_GLOBAL_LIMITS.split(";") if limit.strip()
    ],
    storage_uri=os.getenv("AUTH_LIMITER_STORAGE_URI", "memory://"),
)


def get_client_ip():
    """
    Determine real client IP for audit/logging.
    Priority:
    1. X-Forwarded-For: first IP in the list (original client)
    2. X-Real-IP
    3. request.remote_addr
    """
    try:
        xff = request.headers.get("X-Forwarded-For", "").strip()
        if xff:
            # Use first IP from the chain
            first_ip = xff.split(",")[0].strip()
            if first_ip:
                return first_ip

        x_real = request.headers.get("X-Real-IP", "").strip()
        if x_real:
            return x_real

        return request.remote_addr or ""
    except Exception:
        return request.remote_addr or ""


def get_client_user_agent():
    """
    Determine real client User-Agent for audit/logging.

    We prefer X-Original-User-Agent (set by API Gateway),
    otherwise fall back to the current request's User-Agent.
    """
    try:
        ua = request.headers.get("X-Original-User-Agent")
        if ua:
            return ua
        return request.headers.get("User-Agent")
    except Exception:
        return request.headers.get("User-Agent")


# Configuration
JWT_SECRET = "e665d53ba3f71313a7fc60b24cd17cb4dc7ba53df1846b544d27c99d5a2ab79d"
if not JWT_SECRET:
    logger.warning(
        "JWT_SECRET not set; using ephemeral secret. Tokens may become invalid after restart."
    )
    JWT_SECRET = secrets.token_hex(32)
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = int(os.getenv("JWT_EXPIRATION_HOURS", 24))
REFRESH_TOKEN_DAYS = int(os.getenv("REFRESH_TOKEN_DAYS", 30))

DB_CONFIG = {
    "host": os.getenv("POSTGRES_HOST", "172.28.0.1"),
    "database": os.getenv("POSTGRES_DB", "worklist_db"),
    "user": os.getenv("POSTGRES_USER", "dicom"),
    "password": os.getenv("POSTGRES_PASSWORD", "E4RMTJiyTmfUwk+tztrRKw=="),
    "port": int(os.getenv("POSTGRES_PORT", "5433")),
    "connect_timeout": 10,
    "application_name": "auth_service",
}

# Role definitions with permissions
ROLES = {
    "SUPERADMIN": {
        "permissions": ["*"],  # All permissions, including developer-only
        "description": "Platform Super Administrator / Root",
    },
    "DEVELOPER": {
        # High-privilege but explicit; boleh kelola RBAC & setting sensitif.
        # Tidak wajib memiliki '*' supaya lebih terkontrol.
        "permissions": [
            "rbac:manage",
            "rbac:view",
            "setting:dev",
            "system:logs",
            "system:config",
            "external_system:manage",
            "external_system:read",
        ],
        "description": "Platform engineer / developer with high-privilege access",
    },
    "ADMIN_SECURITY": {
        # Admin keamanan aplikasi:
        # - Bisa kelola role/permission custom,
        # - Tidak bisa menyentuh reserved (SUPERADMIN/DEVELOPER/*/rbac:manage/...).
        "permissions": ["rbac:custom-manage", "rbac:view"],
        "description": "Security admin for managing custom RBAC (non-reserved)",
    },
    "ADMIN": {
        # Operational admin: wide permissions but NOT full wildcard, and NOT developer-only by default
        "permissions": [
            "user:read",
            "user:create",
            "user:update",
            "user:delete",
            "user:manage",
            # RBAC visibility and limited management (non-protected only)
            "rbac:view",
            "rbac:custom-manage",
            "patient:*",
            "patient:read",
            "patient:view",
            "order:*",
            "order:read",
            "order:view",
            "worklist:*",
            "worklist:read",
            "worklist:view",
            "dicom:*",
            "equipment:*",
            "appointment:*",
            "system:config",
            "system:logs",
            # Admin boleh kelola settings umum: read/write
            "setting:read",
            "setting:write",
            "modality:view",
            "modality:manage",
            "node:view",
            "node:manage",
            "procedure:*",
            "mapping:*",
            "storage:manage",
            "audit:view",
            "external_system:read",
            "report:read",
            "report:view",
            "study:read",
            "study:view",
            # PERHATIAN: Tidak ada '*', tidak ada 'setting:dev' di sini
        ],
        "description": "System Administrator (operational, non-developer)",
    },
    "RADIOLOGIST": {
        "permissions": [
            "study:read",
            "study:view",
            "study:*",
            "report:read",
            "report:view",
            "report:create",
            "report:update",
            "order:read",
            "order:view",
            "patient:read",
            "patient:view",
            "worklist:read",
            "worklist:view",
        ],
        "description": "Dokter Radiologi. Membaca citra (studies) dan membuat expertise/report.",
    },
    "TECHNOLOGIST": {
        "permissions": [
            "worklist:read",
            "worklist:view",
            "order:read",
            "order:view",
            "order:update",
            "intake:view",
            "study:read",
            "study:view",
            "study:upload",
            "studies:upload",
            "patient:read",
            "patient:view",
            "modality:view",
        ],
        "description": "Radiografer. Melakukan pemeriksaan, upload DICOM, dan update status order.",
    },
    "CLERK": {
        "permissions": [
            "patient:create",
            "patient:read",
            "patient:view",
            "patient:update",
            "order:create",
            "order:read",
            "order:view",
            "order:update",
            "intake:view",
            "worklist:read",
            "worklist:view",
        ],
        "description": "Pendaftaran/Resepsionis. Mendaftarkan pasien dan membuat order pemeriksaan.",
    },
    "REFERRING_PHYSICIAN": {
        "permissions": [
            "study:read",
            "study:view",
            "report:read",
            "report:view",
            "order:read",
            "order:view",
            "patient:read",
            "patient:view",
        ],
        "description": "Dokter Pengirim. Hanya bisa melihat hasil pemeriksaan pasiennya.",
    },
    "DOCTOR": {
        "permissions": [
            "order:read",
            "order:create",
            "worklist:read",
            "worklist:update",
            "orthanc:read",
        ],
        "description": "Medical Doctor",
    },
    "TECHNICIAN": {
        "permissions": [
            "worklist:read",
            "worklist:update",
            "worklist:scan",
            "orthanc:read",
            "orthanc:write",
        ],
        "description": "Radiology Technician",
    },
    "RECEPTIONIST": {
        "permissions": [
            "order:read",
            "order:create",
            "worklist:create",
            "worklist:read",
            "worklist:search",
        ],
        "description": "Front Desk Receptionist",
    },
    "VIEWER": {
        "permissions": ["worklist:read", "orthanc:read"],
        "description": "Read-only Access",
    },
}


def wait_for_database(max_retries=30, delay=2):
    """Wait for database to be available with retry mechanism"""
    for attempt in range(max_retries):
        try:
            conn = psycopg2.connect(**DB_CONFIG)
            conn.close()
            logger.info("Database connection successful")
            return True
        except psycopg2.OperationalError as e:
            if attempt < max_retries - 1:
                logger.warning(
                    f"Database not ready (attempt {attempt + 1}/{max_retries}): {str(e)}"
                )
                time.sleep(delay)
            else:
                logger.error(
                    f"Failed to connect to database after {max_retries} attempts"
                )
                raise
        except Exception as e:
            logger.error(f"Unexpected database error: {str(e)}")
            raise
    return False


@contextmanager
def get_db_connection():
    conn = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        yield conn
        conn.commit()
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Database error: {str(e)}")
        raise
    finally:
        if conn:
            conn.close()


def init_database():
    """Initialize authentication tables and permission system"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()

            cursor.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

            # Roles table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS roles (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    name VARCHAR(50) UNIQUE NOT NULL,
                    description TEXT,
                    is_active BOOLEAN DEFAULT TRUE,
                    protected BOOLEAN NOT NULL DEFAULT FALSE,
                    hidden_from_tenant_admin BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # Permissions table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS permissions (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    name VARCHAR(100) UNIQUE NOT NULL,
                    description TEXT,
                    category VARCHAR(50),
                    is_active BOOLEAN DEFAULT TRUE,
                    protected BOOLEAN NOT NULL DEFAULT FALSE,
                    hidden_from_tenant_admin BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # Backward-compatible migration: ensure protected columns exist
            cursor.execute("""
                DO $$
                BEGIN
                    -- roles.protected
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'roles' AND column_name = 'protected'
                    ) THEN
                        ALTER TABLE roles
                        ADD COLUMN protected BOOLEAN NOT NULL DEFAULT FALSE;
                    END IF;

                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'roles' AND column_name = 'hidden_from_tenant_admin'
                    ) THEN
                        ALTER TABLE roles
                        ADD COLUMN hidden_from_tenant_admin BOOLEAN NOT NULL DEFAULT FALSE;
                    END IF;

                    -- permissions.protected
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'permissions' AND column_name = 'protected'
                    ) THEN
                        ALTER TABLE permissions
                        ADD COLUMN protected BOOLEAN NOT NULL DEFAULT FALSE;
                    END IF;

                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'permissions' AND column_name = 'hidden_from_tenant_admin'
                    ) THEN
                        ALTER TABLE permissions
                        ADD COLUMN hidden_from_tenant_admin BOOLEAN NOT NULL DEFAULT FALSE;
                    END IF;
                END$$;
            """)

            # Users table (create before mapping tables that reference it)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    username VARCHAR(100) UNIQUE NOT NULL,
                    email VARCHAR(200) UNIQUE NOT NULL,
                    password_hash VARCHAR(200) NOT NULL,
                    full_name VARCHAR(200),
                    phone_number VARCHAR(50),
                    whatsapp VARCHAR(50),
                    telegram VARCHAR(100),
                    details JSONB DEFAULT '{}'::jsonb,
                    role VARCHAR(50) NOT NULL DEFAULT 'VIEWER',
                    role_id UUID REFERENCES roles(id) ON DELETE SET NULL,
                    is_active BOOLEAN DEFAULT TRUE,
                    is_verified BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_login TIMESTAMP,
                    failed_login_attempts INTEGER DEFAULT 0,
                    locked_until TIMESTAMP,
                    tour_completed BOOLEAN DEFAULT FALSE,
                    tour_passed_at TIMESTAMP,
                    tour_version VARCHAR(50)
                )
            """)

            # Migration for tour columns
            cursor.execute("""
                DO $$
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'tour_completed') THEN
                        ALTER TABLE users ADD COLUMN tour_completed BOOLEAN DEFAULT FALSE;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'tour_passed_at') THEN
                        ALTER TABLE users ADD COLUMN tour_passed_at TIMESTAMP;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'tour_version') THEN
                        ALTER TABLE users ADD COLUMN tour_version VARCHAR(50);
                    END IF;
                END$$;
            """)

            # Role-Permission mapping table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS role_permissions (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
                    permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(role_id, permission_id)
                )
            """)

            # User-Permission mapping table (direct permissions)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_permissions (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                    permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, permission_id)
                )
            """)

            # User-Role mapping table (multiple roles per user)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_roles (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, role_id)
                )
            """)

            # Check if users table exists and log its structure
            cursor.execute("""
                SELECT column_name, data_type
                FROM information_schema.columns
                WHERE table_name = 'users'
                ORDER BY ordinal_position
            """)
            existing_columns = cursor.fetchall()
            if existing_columns:
                logger.info(
                    f"Existing users table columns: {[col[0] for col in existing_columns]}"
                )
            else:
                logger.info("Users table does not exist yet")

            # ===== MIGRATION: Add tour columns to users table if they don't exist =====
            logger.info("Checking if tour columns exist in users table...")
            cursor.execute("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'users' AND column_name IN ('tour_completed', 'tour_passed_at', 'tour_version')
            """)
            existing_tour_cols = [row[0] for row in cursor.fetchall()]

            if "tour_completed" not in existing_tour_cols:
                logger.info("Adding tour_completed column to users table...")
                cursor.execute(
                    "ALTER TABLE users ADD COLUMN tour_completed BOOLEAN DEFAULT FALSE"
                )
            if "tour_passed_at" not in existing_tour_cols:
                logger.info("Adding tour_passed_at column to users table...")
                cursor.execute("ALTER TABLE users ADD COLUMN tour_passed_at TIMESTAMP")
            if "tour_version" not in existing_tour_cols:
                logger.info("Adding tour_version column to users table...")
                cursor.execute("ALTER TABLE users ADD COLUMN tour_version VARCHAR(50)")

            if len(existing_tour_cols) < 3:
                logger.info("Tour columns migration completed successfully")
            else:
                logger.info("✓ Tour columns already exist in users table")

            # ===== MIGRATION: Add role_id column to users table if it doesn't exist =====
            logger.info("Checking if role_id column exists in users table...")
            cursor.execute("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'users' AND column_name = 'role_id'
            """)
            role_id_exists = cursor.fetchone()

            if not role_id_exists:
                logger.info(
                    "role_id column not found. Adding role_id column to users table..."
                )
                try:
                    cursor.execute("""
                        ALTER TABLE users
                        ADD COLUMN role_id UUID REFERENCES roles(id) ON DELETE SET NULL
                    """)
                    logger.info("✓ role_id column successfully added to users table")
                except Exception as e:
                    logger.error(f"Failed to add role_id column: {e}")
                    raise
            else:
                logger.info("✓ role_id column already exists in users table")

            # ===== MIGRATION: Add contact & details columns if missing =====
            logger.info("Ensuring contact fields exist on users table...")
            cursor.execute("""
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'users' AND column_name = 'phone_number'
                    ) THEN
                        ALTER TABLE users ADD COLUMN phone_number VARCHAR(50);
                    END IF;

                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'users' AND column_name = 'whatsapp'
                    ) THEN
                        ALTER TABLE users ADD COLUMN whatsapp VARCHAR(50);
                    END IF;

                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'users' AND column_name = 'telegram'
                    ) THEN
                        ALTER TABLE users ADD COLUMN telegram VARCHAR(100);
                    END IF;

                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'users' AND column_name = 'details'
                    ) THEN
                        ALTER TABLE users ADD COLUMN details JSONB DEFAULT '{}'::jsonb;
                    END IF;
                END$$;
            """)

            # ===== CREATE INDEXES (After migration to ensure all columns exist) =====
            logger.info("Creating database indexes...")
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)"
            )
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)")
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id)"
            )  # Now safe to create
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_roles_name ON roles(name)")
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_permissions_name ON permissions(name)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_permissions_category ON permissions(category)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON role_permissions(permission_id)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON user_permissions(user_id)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_user_permissions_permission_id ON user_permissions(permission_id)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id)"
            )
            logger.info("✓ All indexes created successfully")

            # Refresh tokens table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS refresh_tokens (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                    token_hash VARCHAR(200) NOT NULL,
                    expires_at TIMESTAMP NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    revoked_at TIMESTAMP,
                    ip_address VARCHAR(45),
                    user_agent TEXT
                )
            """)

            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at)"
            )

            # Audit log for auth events
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS auth_audit_log (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
                    username VARCHAR(100),
                    action VARCHAR(50) NOT NULL,
                    success BOOLEAN NOT NULL,
                    ip_address VARCHAR(45),
                    user_agent TEXT,
                    details JSONB,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_auth_audit_user_id ON auth_audit_log(user_id)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_auth_audit_action ON auth_audit_log(action)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_auth_audit_created_at ON auth_audit_log(created_at)"
            )

            # Initialize default roles and permissions
            _initialize_roles_and_permissions(cursor)

            # Create default admin user if not exists
            cursor.execute("SELECT id FROM users WHERE username = 'admin'")
            admin_user = cursor.fetchone()
            admin_user_id = admin_user[0] if admin_user else None

            if not admin_user_id:
                admin_password = os.getenv("ADMIN_PASSWORD", "Admin@12345")
                password_hash = bcrypt.hashpw(
                    admin_password.encode(), bcrypt.gensalt()
                ).decode()

                cursor.execute("SELECT id FROM roles WHERE name = 'ADMIN'")
                admin_role = cursor.fetchone()
                admin_role_id = admin_role[0] if admin_role else None

                cursor.execute(
                    """
                    INSERT INTO users (username, email, password_hash, full_name, role, role_id, is_active, is_verified)
                    VALUES ('admin', 'admin@hospital.local', %s, 'System Administrator', 'ADMIN', %s, TRUE, TRUE)
                    RETURNING id
                """,
                    (password_hash, admin_role_id),
                )
                admin_user_id = cursor.fetchone()[0]

                logger.info("Default admin user created")

            # Ensure admin user is in user_roles table for permission lookup
            cursor.execute("SELECT id FROM roles WHERE name = 'ADMIN'")
            admin_role = cursor.fetchone()
            admin_role_id = admin_role[0] if admin_role else None
            if admin_user_id and admin_role_id:
                cursor.execute(
                    "SELECT 1 FROM user_roles WHERE user_id = %s AND role_id = %s",
                    (admin_user_id, admin_role_id),
                )
                if cursor.fetchone() is None:
                    cursor.execute(
                        """
                        INSERT INTO user_roles (user_id, role_id)
                        VALUES (%s, %s)
                        ON CONFLICT (user_id, role_id) DO NOTHING
                    """,
                        (admin_user_id, admin_role_id),
                    )
                    logger.info(
                        "Admin user associated with ADMIN role in user_roles table."
                    )

            # Ensure default SUPERADMIN user exists for developer/superadmin access
            cursor.execute("SELECT id FROM roles WHERE name = 'SUPERADMIN'")
            superadmin_role = cursor.fetchone()
            superadmin_role_id = superadmin_role[0] if superadmin_role else None

            if superadmin_role_id:
                # Check if a superadmin user already exists
                cursor.execute("""
                    SELECT id FROM users
                    WHERE username = 'superadmin' OR email = 'superadmin@hospital.local'
                """)
                superadmin_user = cursor.fetchone()

                if not superadmin_user:
                    superadmin_password = os.getenv(
                        "SUPERADMIN_PASSWORD", "SuperAdmin@12345"
                    )
                    sa_hash = bcrypt.hashpw(
                        superadmin_password.encode(), bcrypt.gensalt()
                    ).decode()

                    cursor.execute(
                        """
                        INSERT INTO users (username, email, password_hash, full_name, role, is_active, is_verified)
                        VALUES (%s, %s, %s, %s, %s, TRUE, TRUE)
                        RETURNING id
                    """,
                        (
                            "superadmin",
                            "superadmin@hospital.local",
                            sa_hash,
                            "Platform Superadmin",
                            "SUPERADMIN",
                        ),
                    )
                    superadmin_user_id = cursor.fetchone()[0]
                    logger.info("Default SUPERADMIN user created (username=superadmin)")

                else:
                    superadmin_user_id = superadmin_user[0]

                # Ensure SUPERADMIN user is associated with SUPERADMIN role in user_roles
                if superadmin_user_id:
                    cursor.execute(
                        """
                        SELECT 1 FROM user_roles
                        WHERE user_id = %s AND role_id = %s
                    """,
                        (superadmin_user_id, superadmin_role_id),
                    )
                    if cursor.fetchone() is None:
                        cursor.execute(
                            """
                            INSERT INTO user_roles (user_id, role_id)
                            VALUES (%s, %s)
                            ON CONFLICT (user_id, role_id) DO NOTHING
                        """,
                            (superadmin_user_id, superadmin_role_id),
                        )
                        logger.info(
                            "SUPERADMIN user linked to SUPERADMIN role in user_roles table."
                        )

            logger.info("Authentication database and permission system initialized")

    except Exception as e:
        logger.error(f"Failed to initialize auth database: {str(e)}")
        raise


def _initialize_roles_and_permissions(cursor):
    """Initialize default roles and permissions"""
    try:
        # Define all permissions
        permissions_data = [
            # User management
            ("user:read", "Read user information", "user"),
            ("user:create", "Create new users", "user"),
            ("user:update", "Update user information", "user"),
            ("user:delete", "Delete users", "user"),
            ("user:manage", "Full user management", "user"),
            # Patient management
            ("patient:read", "Read patient information", "patient"),
            ("patient:create", "Create new patients", "patient"),
            ("patient:update", "Update patient information", "patient"),
            ("patient:delete", "Delete patients", "patient"),
            ("patient:*", "Full patient management", "patient"),
            # Order management
            ("order:read", "Read orders", "order"),
            ("order:create", "Create new orders", "order"),
            ("order:update", "Update orders", "order"),
            ("order:delete", "Delete orders", "order"),
            ("order:*", "Full order management", "order"),
            # Worklist management
            ("worklist:read", "Read worklist items", "worklist"),
            ("worklist:create", "Create worklist items", "worklist"),
            ("worklist:update", "Update worklist items", "worklist"),
            ("worklist:delete", "Delete worklist items", "worklist"),
            ("worklist:scan", "Perform scans", "worklist"),
            ("worklist:search", "Search worklist", "worklist"),
            ("worklist:*", "Full worklist management", "worklist"),
            # DICOM/Orthanc management
            ("dicom:read", "Read DICOM images", "dicom"),
            ("dicom:write", "Upload DICOM images", "dicom"),
            ("dicom:delete", "Delete DICOM images", "dicom"),
            ("dicom:*", "Full DICOM management", "dicom"),
            # Equipment management
            ("equipment:read", "Read equipment information", "equipment"),
            ("equipment:create", "Add new equipment", "equipment"),
            ("equipment:update", "Update equipment", "equipment"),
            ("equipment:delete", "Remove equipment", "equipment"),
            ("equipment:*", "Full equipment management", "equipment"),
            # Appointment management
            ("appointment:read", "Read appointments", "appointment"),
            ("appointment:create", "Create appointments", "appointment"),
            ("appointment:update", "Update appointments", "appointment"),
            ("appointment:delete", "Delete appointments", "appointment"),
            ("appointment:*", "Full appointment management", "appointment"),
            # Modality management
            ("modality:view", "View modalities", "modality"),
            ("modality:manage", "Manage modalities", "modality"),
            # Node management
            ("node:view", "View PACS nodes", "node"),
            ("node:manage", "Manage PACS nodes", "node"),
            # Procedure management
            ("procedure:read", "Read procedures", "procedure"),
            ("procedure:create", "Create procedures", "procedure"),
            ("procedure:update", "Update procedures", "procedure"),
            ("procedure:delete", "Delete procedures", "procedure"),
            ("procedure:*", "Full procedure management", "procedure"),
            # Mapping management
            ("mapping:read", "Read procedure mappings", "mapping"),
            ("mapping:create", "Create procedure mappings", "mapping"),
            ("mapping:update", "Update procedure mappings", "mapping"),
            ("mapping:delete", "Delete procedure mappings", "mapping"),
            ("mapping:*", "Full mapping management", "mapping"),
            # Storage & audit
            ("storage:manage", "Manage PACS storage and retention", "storage"),
            ("audit:view", "View audit logs", "audit"),
            # Study & report permissions
            ("study:read", "View studies", "study"),
            ("study:view", "View studies (alias read)", "study"),
            ("study:upload", "Upload DICOM studies", "study"),
            ("studies:upload", "Upload DICOM studies (legacy alias)", "study"),
            ("study:*", "Full study management", "study"),
            ("report:read", "View reports", "report"),
            ("report:view", "View reports (alias read)", "report"),
            ("report:create", "Create reports", "report"),
            ("report:update", "Update reports", "report"),
            # Intake & aliases for view/read semantics
            ("intake:view", "View intake records", "intake"),
            ("order:view", "View orders (alias read)", "order"),
            ("patient:view", "View patient records (alias read)", "patient"),
            ("worklist:view", "View worklist items (alias read)", "worklist"),
            # System administration & RBAC
            ("system:admin", "System administration", "system"),
            ("system:config", "System configuration", "system"),
            ("system:logs", "View system logs", "system"),
            ("rbac:view", "View RBAC configuration", "system"),
            ("rbac:manage", "Manage all RBAC (high privilege only)", "system"),
            (
                "rbac:custom-manage",
                "Manage custom (non-reserved) roles and permissions",
                "system",
            ),
            ("setting:read", "Read application settings", "system"),
            ("setting:write", "Update application settings", "system"),
            ("setting:dev", "Manage sensitive developer-only settings", "system"),
            # External Systems Integration (High privilege only)
            (
                "external_system:read",
                "View external systems (SIMRS/HIS/RIS)",
                "integration",
            ),
            (
                "external_system:manage",
                "Manage external systems (SUPERADMIN/DEVELOPER only)",
                "integration",
            ),
            ("*", "All permissions", "system"),
        ]

        # Insert permissions
        for perm_name, perm_desc, perm_category in permissions_data:
            cursor.execute(
                """
                INSERT INTO permissions (name, description, category)
                VALUES (%s, %s, %s)
                ON CONFLICT (name) DO NOTHING
            """,
                (perm_name, perm_desc, perm_category),
            )

        # Insert roles
        for role_name, role_info in ROLES.items():
            cursor.execute(
                """
                INSERT INTO roles (name, description)
                VALUES (%s, %s)
                ON CONFLICT (name) DO NOTHING
            """,
                (role_name, role_info["description"]),
            )

        # Map role permissions
        for role_name, role_info in ROLES.items():
            cursor.execute("SELECT id FROM roles WHERE name = %s", (role_name,))
            role_result = cursor.fetchone()
            if not role_result:
                continue
            role_id = role_result[0]

            for permission in role_info["permissions"]:
                cursor.execute(
                    "SELECT id FROM permissions WHERE name = %s", (permission,)
                )
                perm_result = cursor.fetchone()
                if perm_result:
                    perm_id = perm_result[0]
                    cursor.execute(
                        """
                        INSERT INTO role_permissions (role_id, permission_id)
                        VALUES (%s, %s)
                        ON CONFLICT (role_id, permission_id) DO NOTHING
                    """,
                        (role_id, perm_id),
                    )

        # Tandai roles inti sebagai protected
        cursor.execute("""
            UPDATE roles
            SET protected = TRUE
            WHERE UPPER(name) IN ('SUPERADMIN', 'DEVELOPER', 'ADMIN_SECURITY', 'SETTINGS_CLIENT')
        """)

        # Sembunyikan role super-sensitif dari admin tenant biasa
        cursor.execute("""
            UPDATE roles
            SET hidden_from_tenant_admin = TRUE
            WHERE UPPER(name) IN ('SUPERADMIN', 'DEVELOPER', 'ADMIN_SECURITY', 'SETTINGS_CLIENT')
        """)

        # Tandai permissions inti sebagai protected
        cursor.execute("""
            UPDATE permissions
            SET protected = TRUE
            WHERE name IN (
                '*',
                'rbac:manage',
                'rbac:view',
                'rbac:custom-manage',
                'setting:dev',
                'system:admin'
            )
        """)

        # Sembunyikan permission sensitif dari admin tenant biasa
        cursor.execute("""
            UPDATE permissions
            SET hidden_from_tenant_admin = TRUE
            WHERE name IN (
                '*',
                'rbac:manage',
                'setting:dev',
                'system:admin',
                'external_system:manage'
            )
        """)

        logger.info(
            "Default roles and permissions initialized (protected flags applied)"
        )

    except Exception as e:
        logger.error(f"Failed to initialize roles and permissions: {str(e)}")
        raise


def _collect_user_permissions(cursor, user_id):
    """
    Shared helper to fetch permissions for a user using an existing cursor.
    Lets callers reuse the same DB connection to avoid extra connection attempts
    (helpful to prevent request timeouts if the DB is slow to respond).
    """
    permissions = []

    # Get permissions through roles (multiple roles support)
    cursor.execute(
        """
        SELECT DISTINCT p.name, p.description, p.category
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        JOIN role_permissions rp ON r.id = rp.role_id
        JOIN permissions p ON rp.permission_id = p.id
        WHERE ur.user_id = %s AND r.is_active = TRUE AND p.is_active = TRUE
    """,
        (user_id,),
    )

    for row in cursor.fetchall():
        # Support both tuple-based and RealDictCursor rows
        name = row["name"] if isinstance(row, dict) else row[0]
        description = row["description"] if isinstance(row, dict) else row[1]
        category = row["category"] if isinstance(row, dict) else row[2]
        permissions.append(
            {
                "name": name,
                "description": description,
                "category": category,
                "source": "role",
            }
        )

    # Get direct permissions
    cursor.execute(
        """
        SELECT DISTINCT p.name, p.description, p.category
        FROM user_permissions up
        JOIN permissions p ON up.permission_id = p.id
        WHERE up.user_id = %s AND p.is_active = TRUE
    """,
        (user_id,),
    )

    for row in cursor.fetchall():
        name = row["name"] if isinstance(row, dict) else row[0]
        description = row["description"] if isinstance(row, dict) else row[1]
        category = row["category"] if isinstance(row, dict) else row[2]
        permissions.append(
            {
                "name": name,
                "description": description,
                "category": category,
                "source": "direct",
            }
        )

    # Remove duplicates while preserving order
    seen = set()
    unique_permissions = []
    for perm in permissions:
        if perm["name"] not in seen:
            seen.add(perm["name"])
            unique_permissions.append(perm)

    return unique_permissions


def get_user_permissions(user_id):
    """Get all permissions for a user (from roles and direct permissions)"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            return _collect_user_permissions(cursor, user_id)

    except Exception as e:
        logger.error(f"Failed to get user permissions: {str(e)}")
        return []


def check_user_permission(user_id, permission_name):
    """Check if user has specific permission (from roles or direct permissions)"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()

            # Check for wildcard permission first (through roles)
            cursor.execute(
                """
                SELECT COUNT(*) AS count
                FROM user_roles ur
                JOIN roles r ON ur.role_id = r.id
                JOIN role_permissions rp ON r.id = rp.role_id
                JOIN permissions p ON rp.permission_id = p.id
                WHERE ur.user_id = %s AND p.name = '*' 
                AND r.is_active = TRUE AND p.is_active = TRUE
            """,
                (user_id,),
            )

            if cursor.fetchone()[0] > 0:
                return True

            # Check for wildcard permission (direct)
            cursor.execute(
                """
                SELECT COUNT(*) AS count
                FROM user_permissions up
                JOIN permissions p ON up.permission_id = p.id
                WHERE up.user_id = %s AND p.name = '*' AND p.is_active = TRUE
            """,
                (user_id,),
            )

            if cursor.fetchone()[0] > 0:
                return True

            # Check for specific permission (through roles)
            cursor.execute(
                """
                SELECT COUNT(*) AS count
                FROM user_roles ur
                JOIN roles r ON ur.role_id = r.id
                JOIN role_permissions rp ON r.id = rp.role_id
                JOIN permissions p ON rp.permission_id = p.id
                WHERE ur.user_id = %s AND p.name = %s
                AND r.is_active = TRUE AND p.is_active = TRUE
            """,
                (user_id, permission_name),
            )

            if cursor.fetchone()[0] > 0:
                return True

            # Check for specific permission (direct)
            cursor.execute(
                """
                SELECT COUNT(*) AS count
                FROM user_permissions up
                JOIN permissions p ON up.permission_id = p.id
                WHERE up.user_id = %s AND p.name = %s AND p.is_active = TRUE
            """,
                (user_id, permission_name),
            )

            if cursor.fetchone()[0] > 0:
                return True

            # Check for category wildcard (e.g., 'patient:*' for 'patient:read')
            if ":" in permission_name:
                category = permission_name.split(":")[0]
                wildcard_permission = f"{category}:*"

                # Check through roles
                cursor.execute(
                    """
                    SELECT COUNT(*) AS count
                    FROM user_roles ur
                    JOIN roles r ON ur.role_id = r.id
                    JOIN role_permissions rp ON r.id = rp.role_id
                    JOIN permissions p ON rp.permission_id = p.id
                    WHERE ur.user_id = %s AND p.name = %s
                    AND r.is_active = TRUE AND p.is_active = TRUE
                """,
                    (user_id, wildcard_permission),
                )

                if cursor.fetchone()[0] > 0:
                    return True

                # Check direct permissions
                cursor.execute(
                    """
                    SELECT COUNT(*) AS count
                    FROM user_permissions up
                    JOIN permissions p ON up.permission_id = p.id
                    WHERE up.user_id = %s AND p.name = %s AND p.is_active = TRUE
                """,
                    (user_id, wildcard_permission),
                )

                return cursor.fetchone()[0] > 0

            return False

    except Exception as e:
        logger.error(f"Failed to check user permission: {str(e)}")
        return False


# ============= Permission Caching Functions =============


@lru_cache(maxsize=1000)
def _get_cached_user_permissions(user_id):
    """Get cached user permissions (both from roles and direct)"""
    return get_user_permissions(user_id)


@lru_cache(maxsize=500)
def _check_cached_user_permission(user_id, permission_name):
    """Check cached user permission"""
    return check_user_permission(user_id, permission_name)


def clear_user_permission_cache(user_id=None):
    """Clear permission cache for specific user or all users"""
    if user_id:
        # Clear specific user cache
        _get_cached_user_permissions.cache_clear()
        _check_cached_user_permission.cache_clear()
    else:
        # Clear all cache
        _get_cached_user_permissions.cache_clear()
        _check_cached_user_permission.cache_clear()


def get_cached_user_permissions(user_id):
    """Get user permissions with caching"""
    return _get_cached_user_permissions(user_id)


def check_cached_user_permission(user_id, permission_name):
    """Check user permission with caching"""
    return _check_cached_user_permission(user_id, permission_name)


def check_permission(user_permissions, required_permissions):
    """
    Check if user has any of the required permissions
    Supports wildcard permissions (*, category:*)
    """
    if not required_permissions:
        return True

    user_permissions = user_permissions or []

    # Global wildcard
    if "*" in user_permissions:
        return True

    for required in required_permissions:
        # Direct match
        if required in user_permissions:
            return True

        # Category wildcard (e.g., 'patient:*' for 'patient:read')
        if ":" in required:
            category = required.split(":", 1)[0]
            if f"{category}:*" in user_permissions:
                return True

    return False


def is_high_priv_user(user: dict) -> bool:
    """
    High-privilege user checker.

    Digunakan untuk melindungi operasi sangat sensitif:
    - Memiliki permission '*'  (SUPERADMIN absolut), ATAU
    - Memiliki permission 'rbac:manage', ATAU
    - Memiliki role 'SUPERADMIN' atau 'DEVELOPER'.
    """
    if not user:
        return False

    perms = user.get("permissions") or []
    role = (user.get("role") or "").upper()
    roles = {role}

    # Jika endpoint lain menambahkan daftar roles ke user, normalisasi di sini
    extra_roles = user.get("roles") or []
    for r in extra_roles:
        if isinstance(r, dict) and r.get("name"):
            roles.add(str(r["name"]).upper())
        elif isinstance(r, str):
            roles.add(r.upper())

    if "*" in perms:
        return True
    if "rbac:manage" in perms:
        return True
    if "SUPERADMIN" in roles or "DEVELOPER" in roles:
        return True

    return False


def require_high_priv(f):
    """
    Decorator: butuh autentikasi + high-priv (SUPERADMIN/DEVELOPER/rbac:manage/*).
    Dipakai khusus endpoint manajemen RBAC & cache internal.
    """

    @wraps(f)
    def wrapper(*args, **kwargs):
        user = get_current_user_from_token()
        if not user:
            return jsonify(
                {"status": "error", "message": "Authentication required"}
            ), 401
        if not is_high_priv_user(user):
            return jsonify(
                {
                    "status": "error",
                    "message": "High-privilege role required",
                    "hint": "Only SUPERADMIN/DEVELOPER may access this endpoint",
                }
            ), 403
        request.current_user = user
        return f(*args, **kwargs)

    return wrapper


def can_custom_manage(user: dict) -> bool:
    """
    Custom RBAC manager:
    - Boleh bila high-priv (is_high_priv_user) ATAU memiliki 'rbac:custom-manage'.
    - Dipakai untuk operasi yang boleh dilakukan admin keamanan tapi dibatasi.
    """
    if not user:
        return False
    if is_high_priv_user(user):
        return True
    perms = user.get("permissions") or []
    return "rbac:custom-manage" in perms


def can_assign_role_to_user(user: dict, role_row: dict) -> bool:
    """
    Determine if the acting user may assign/remove a role to/from another user.
    High-priv: allowed.
    Tenant admin (rbac:custom-manage): only if role is not protected and not hidden.
    """
    if not user or not role_row:
        return False
    if is_high_priv_user(user):
        return True
    if not can_custom_manage(user):
        return False
    if role_row.get("protected") or role_row.get("hidden_from_tenant_admin"):
        return False
    return True


def role_visible_to_user(role_row: dict, user: dict) -> bool:
    """Check if a role should be visible to the acting user."""
    if not role_row:
        return False
    if is_high_priv_user(user):
        return True
    return not bool(role_row.get("hidden_from_tenant_admin"))


def permission_visible_to_user(permission_row: dict, user: dict) -> bool:
    """Check if a permission should be visible to the acting user."""
    if not permission_row:
        return False
    if is_high_priv_user(user):
        return True
    return not bool(permission_row.get("hidden_from_tenant_admin"))


def can_manage_role_resource(user: dict, role_row: dict) -> bool:
    """
    Determine if user may mutate a role (assign/delete/update).
    High-priv always allowed. Tenant admins with rbac:custom-manage
    may manage only non-protected & non-hidden roles.
    """
    if not user or not role_row:
        return False
    if is_high_priv_user(user):
        return True
    if not can_custom_manage(user):
        return False
    if role_row.get("protected") or role_row.get("hidden_from_tenant_admin"):
        return False
    return True


def can_manage_permission_resource(user: dict, permission_row: dict) -> bool:
    """
    Determine if user may mutate a permission or attach/detach it.
    High-priv always allowed. Tenant admins with rbac:custom-manage
    may manage only non-protected & non-hidden permissions.
    """
    if not user or not permission_row:
        return False
    if is_high_priv_user(user):
        return True
    if not can_custom_manage(user):
        return False
    if permission_row.get("protected") or permission_row.get(
        "hidden_from_tenant_admin"
    ):
        return False
    return True


def can_attach_permission(user: dict, permission_row: dict) -> bool:
    """
    Determine if user may assign/detach a permission to/from a role or user.
    Protected permissions may still be attached by tenant admins as long as they are visible;
    hidden permissions remain restricted to high-priv.
    """
    if not user or not permission_row:
        return False
    if is_high_priv_user(user):
        return True
    if not can_custom_manage(user):
        return False
    return not permission_row.get("hidden_from_tenant_admin")


def fetch_role(cursor, role_id=None, role_name=None):
    """Fetch role metadata by id or name using existing cursor."""
    if not cursor or (role_id is None and role_name is None):
        return None
    if role_id:
        cursor.execute(
            """
            SELECT id, name, description, is_active, protected, hidden_from_tenant_admin
            FROM roles
            WHERE id = %s
        """,
            (role_id,),
        )
    else:
        cursor.execute(
            """
            SELECT id, name, description, is_active, protected, hidden_from_tenant_admin
            FROM roles
            WHERE name = %s
        """,
            (role_name,),
        )
    return cursor.fetchone()


def fetch_permission(cursor, permission_id):
    """Fetch permission metadata by id using existing cursor."""
    if not cursor or permission_id is None:
        return None
    cursor.execute(
        """
        SELECT id, name, description, category, is_active, protected, hidden_from_tenant_admin
        FROM permissions
        WHERE id = %s
    """,
        (permission_id,),
    )
    return cursor.fetchone()


RESERVED_ROLE_NAMES = {"SUPERADMIN", "DEVELOPER"}
# Roles yang tidak boleh diberikan oleh non-high-priv bisa ditambah di sini, misal "ADMIN_SECURITY"
EXTENDED_RESERVED_ROLE_NAMES = {"SUPERADMIN", "DEVELOPER", "ADMIN_SECURITY"}

# Roles yang dianggap high-priv dalam konteks visibilitas user
HIGH_PRIV_ROLES = {"SUPERADMIN", "DEVELOPER", "ADMIN_SECURITY", "SETTINGS_CLIENT"}


def is_ui_settings_user(user_row: dict) -> bool:
    """
    Identifikasi akun 'ui-settings' (user teknis UI) yang tidak boleh
    muncul di list user untuk admin biasa.

    Kriteria default:
      - role == 'UI_SETTINGS' (case-insensitive), ATAU
      - username diawali 'ui-settings', ATAU
      - email mengandung '+ui-settings'.

    Hanya SUPERADMIN/DEVELOPER (high-priv) yang boleh melihat user tipe ini.
    """
    if not user_row:
        return False

    role = str(user_row.get("role") or "").strip().upper()
    username = str(user_row.get("username") or "").strip().lower()
    email = str(user_row.get("email") or "").strip().lower()

    if role == "UI_SETTINGS":
        return True
    if username.startswith("ui-settings"):
        return True
    if "+ui-settings" in email:
        return True

    return False


RESERVED_PERMISSIONS = {
    "*",
    "rbac:manage",
    "rbac:view",
    "rbac:custom-manage",
    "setting:dev",
}


def require_permission(required_permissions):
    """Decorator to require specific permission(s)"""
    if isinstance(required_permissions, str):
        required_permissions = [required_permissions]

    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            user = get_current_user_from_token()
            if not user:
                return jsonify(
                    {"status": "error", "message": "Authentication required"}
                ), 401

            user_permissions = user.get("permissions", [])

            if not check_permission(user_permissions, required_permissions):
                return jsonify(
                    {
                        "status": "error",
                        "message": "Insufficient permissions",
                        "required": required_permissions,
                        "hint": "Contact administrator to request access",
                    }
                ), 403

            request.current_user = user
            return f(*args, **kwargs)

        return decorated_function

    return decorator


def hash_password(password):
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password, password_hash):
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def generate_tokens(user):
    """Generate access token and refresh token"""
    user_id = user["id"]
    permissions_from_db = get_user_permissions(user_id)
    permissions_list = [p["name"] for p in permissions_from_db]
    details_payload = user.get("details") or {}

    # Access token (short-lived)
    access_payload = {
        "user_id": str(user_id),
        "username": user.get("username"),
        "email": user.get("email"),
        "full_name": user.get("full_name"),
        "phone_number": user.get("phone_number"),
        "whatsapp": user.get("whatsapp"),
        "telegram": user.get("telegram"),
        "details": details_payload,
        "role": user.get("role"),
        "permissions": permissions_list,
        "tenant_id": str(user.get("tenant_id")) if user.get("tenant_id") else None,
        "hospital_id": str(user.get("tenant_id")) if user.get("tenant_id") else None, # Compatibility
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS),
        "iat": datetime.utcnow(),
        "type": "access",
    }
    access_token = jwt.encode(access_payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

    # Refresh token (long-lived)
    refresh_token = secrets.token_urlsafe(32)
    refresh_token_hash = bcrypt.hashpw(
        refresh_token.encode(), bcrypt.gensalt()
    ).decode()

    return access_token, refresh_token, refresh_token_hash


def log_auth_event(user_id, username, action, success, details=None, conn=None):
    """Log authentication events with real client IP behind gateway"""
    try:
        client_ip = get_client_ip()
        user_agent = get_client_user_agent()

        if conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO auth_audit_log (user_id, username, action, success, ip_address, user_agent, details)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
                (
                    user_id,
                    username,
                    action,
                    success,
                    client_ip,
                    user_agent,
                    Json(details) if details else None,
                ),
            )
        else:
            with get_db_connection() as conn_ref:
                cursor = conn_ref.cursor()
                cursor.execute(
                    """
                    INSERT INTO auth_audit_log (user_id, username, action, success, ip_address, user_agent, details)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                    (
                        user_id,
                        username,
                        action,
                        success,
                        client_ip,
                        user_agent,
                        Json(details) if details else None,
                    ),
                )
    except Exception as e:
        logger.error(f"Failed to log auth event: {str(e)}")


def get_current_user_from_token():
    """Extract current user from JWT token"""
    try:
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return None

        token = auth_header.split(" ")[1]
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])

        user_id = payload.get("user_id")
        if not user_id:
            return None

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute(
                """
                SELECT id, username, email, full_name, phone_number, whatsapp, telegram, details, role, is_active,
                       tour_completed, tour_passed_at, tour_version
                FROM users WHERE id = %s AND is_active = TRUE
            """,
                (user_id,),
            )

            user = cursor.fetchone()
            if user:
                permissions_from_db = get_user_permissions(user["id"])
                user["permissions"] = [p["name"] for p in permissions_from_db]
                user["details"] = user.get("details") or {}

                # Format timestamps for JSON response if they exist
                if user.get("tour_passed_at") and hasattr(
                    user["tour_passed_at"], "isoformat"
                ):
                    user["tour_passed_at"] = user["tour_passed_at"].isoformat()
            return user

    except jwt.InvalidTokenError:
        return None
    except Exception as e:
        logger.error(f"Error getting current user: {str(e)}")
        return None


def require_auth(f):
    """Decorator to require authentication"""

    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = get_current_user_from_token()
        if not user:
            return jsonify(
                {"status": "error", "message": "Authentication required"}
            ), 401

        # Add user to request context
        request.current_user = user
        return f(*args, **kwargs)

    return decorated_function


# ============= RBAC Management Functions =============


def assign_role_to_user(user_id, role_id):
    """Assign a role to a user"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO user_roles (user_id, role_id)
                VALUES (%s, %s)
                ON CONFLICT (user_id, role_id) DO NOTHING
            """,
                (user_id, role_id),
            )
            conn.commit()

            # Clear cache for this user
            clear_user_permission_cache(user_id)
            return True
    except Exception as e:
        logger.error(f"Failed to assign role to user: {str(e)}")
        return False


def remove_role_from_user(user_id, role_id):
    """Remove a role from a user"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                DELETE FROM user_roles 
                WHERE user_id = %s AND role_id = %s
            """,
                (user_id, role_id),
            )
            conn.commit()

            # Clear cache for this user
            clear_user_permission_cache(user_id)
            return True
    except Exception as e:
        logger.error(f"Failed to remove role from user: {str(e)}")
        return False


def assign_permission_to_user(user_id, permission_id):
    """Assign a direct permission to a user"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO user_permissions (user_id, permission_id)
                VALUES (%s, %s)
                ON CONFLICT (user_id, permission_id) DO NOTHING
            """,
                (user_id, permission_id),
            )
            conn.commit()

            # Clear cache for this user
            clear_user_permission_cache(user_id)
            return True
    except Exception as e:
        logger.error(f"Failed to assign permission to user: {str(e)}")
        return False


def remove_permission_from_user(user_id, permission_id):
    """Remove a direct permission from a user"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                DELETE FROM user_permissions 
                WHERE user_id = %s AND permission_id = %s
            """,
                (user_id, permission_id),
            )
            conn.commit()

            # Clear cache for this user
            clear_user_permission_cache(user_id)
            return True
    except Exception as e:
        logger.error(f"Failed to remove permission from user: {str(e)}")
        return False


def assign_permission_to_role(role_id, permission_id):
    """Assign a permission to a role"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO role_permissions (role_id, permission_id)
                VALUES (%s, %s)
                ON CONFLICT (role_id, permission_id) DO NOTHING
            """,
                (role_id, permission_id),
            )
            conn.commit()

            # Clear all cache since role permissions affect multiple users
            clear_user_permission_cache()
            return True
    except Exception as e:
        logger.error(f"Failed to assign permission to role: {str(e)}")
        return False


def remove_permission_from_role(role_id, permission_id):
    """Remove a permission from a role"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                DELETE FROM role_permissions 
                WHERE role_id = %s AND permission_id = %s
            """,
                (role_id, permission_id),
            )
            conn.commit()

            # Clear all cache since role permissions affect multiple users
            clear_user_permission_cache()
            return True
    except Exception as e:
        logger.error(f"Failed to remove permission from role: {str(e)}")
        return False


def get_user_roles(user_id):
    """Get all roles assigned to a user"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute(
                """
                SELECT r.id, r.name, r.description, r.is_active
                FROM user_roles ur
                JOIN roles r ON ur.role_id = r.id
                WHERE ur.user_id = %s AND r.is_active = TRUE
                ORDER BY r.name
            """,
                (user_id,),
            )

            roles = cursor.fetchall()
            return roles
    except Exception as e:
        logger.error(f"Failed to get user roles: {str(e)}")
        return []


def get_role_permissions(role_id):
    """Get all permissions assigned to a role"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute(
                """
                SELECT p.id, p.name, p.description, p.category, p.protected, p.hidden_from_tenant_admin
                FROM role_permissions rp
                JOIN permissions p ON rp.permission_id = p.id
                WHERE rp.role_id = %s AND p.is_active = TRUE
                ORDER BY p.category, p.name
            """,
                (role_id,),
            )

            permissions = cursor.fetchall()
            return permissions
    except Exception as e:
        logger.error(f"Failed to get role permissions: {str(e)}")
        return []


def get_all_roles():
    """Get all available roles"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("""
                SELECT id, name, description, is_active, created_at, protected, hidden_from_tenant_admin
                FROM roles
                ORDER BY name
            """)

            roles = cursor.fetchall()
            return roles
    except Exception as e:
        logger.error(f"Failed to get all roles: {str(e)}")
        return []


def get_all_permissions():
    """Get all available permissions"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("""
                SELECT id, name, description, category, is_active, created_at, protected, hidden_from_tenant_admin
                FROM permissions
                ORDER BY category, name
            """)

            permissions = cursor.fetchall()
            return permissions
    except Exception as e:
        logger.error(f"Failed to get all permissions: {str(e)}")
        return []


def create_role(name, description=None):
    """Create a new role"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute(
                """
                INSERT INTO roles (name, description)
                VALUES (%s, %s)
                RETURNING id
            """,
                (name, description),
            )
            role_id = cursor.fetchone()["id"]
            conn.commit()
            return role_id
    except Exception as e:
        logger.error(f"Failed to create role: {str(e)}")
        return None


def create_permission(name, description=None, category=None):
    """Create a new permission"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute(
                """
                INSERT INTO permissions (name, description, category)
                VALUES (%s, %s, %s)
                RETURNING id
            """,
                (name, description, category),
            )
            permission_id = cursor.fetchone()["id"]
            conn.commit()
            return permission_id
    except Exception as e:
        logger.error(f"Failed to create permission: {str(e)}")
        return None


def sync_user_roles_with_legacy(user_id, legacy_role):
    """Sync user roles with legacy role field for backward compatibility"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Get role_id for legacy role
            cursor.execute("SELECT id FROM roles WHERE name = %s", (legacy_role,))
            role_result = cursor.fetchone()

            if role_result:
                role_id = role_result["id"]

                # Clear existing roles
                cursor.execute("DELETE FROM user_roles WHERE user_id = %s", (user_id,))

                # Assign new role
                cursor.execute(
                    """
                    INSERT INTO user_roles (user_id, role_id)
                    VALUES (%s, %s)
                """,
                    (user_id, role_id),
                )

                conn.commit()
                return True
    except Exception as e:
        logger.error(f"Failed to sync user roles: {str(e)}")
        return False


@app.route("/", methods=["GET"])
def index():
    return jsonify(
        {
            "service": "Authentication Service",
            "version": "2.0",
            "status": "running",
            "endpoints": {
                "health": "GET /health",
                "authentication": {
                    "login": "POST /auth/login",
                    "register": "POST /auth/register",
                    "refresh": "POST /auth/refresh",
                    "logout": "POST /auth/logout",
                    "verify": "POST /auth/verify",
                    "me": "GET /auth/me",
                    "change_password": "POST /auth/change-password",
                },
                "user_management": {
                    "list_users": "GET /auth/users",
                    "create_user": "POST /auth/users",
                    "get_user": "GET /auth/users/<user_id>",
                    "update_user": "PUT /auth/users/<user_id>",
                    "delete_user": "DELETE /auth/users/<user_id>",
                    "change_user_password": "POST /auth/users/<user_id>/change-password",
                    "activate_user": "POST /auth/users/<user_id>/activate",
                    "deactivate_user": "POST /auth/users/<user_id>/deactivate",
                },
                "role_management": {
                    "list_roles": "GET /auth/roles",
                    "get_role": "GET /auth/roles/<role_name>",
                    "get_role_users": "GET /auth/roles/<role_name>/users",
                },
                "permission_management": {
                    "list_permissions": "GET /auth/permissions",
                    "check_permission": "POST /auth/permissions/check",
                },
            },
            "features": [
                "JWT Authentication",
                "Role-Based Access Control (RBAC)",
                "User Management",
                "Permission Management",
                "Audit Logging",
                "Account Lockout Protection",
                "Password Security",
            ],
        }
    ), 200


@app.route("/health", methods=["GET"])
def health():
    db_status = "unknown"
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            db_status = "healthy"
    except:
        db_status = "unhealthy"

    return jsonify(
        {
            "status": "healthy",
            "database": db_status,
            "timestamp": datetime.now().isoformat(),
        }
    ), 200


@app.route("/metrics", methods=["GET"])
def metrics():
    """Prometheus metrics endpoint"""
    import time
    from flask import Response

    metrics_output = []
    metrics_output.append("# HELP auth_service_up Service uptime status")
    metrics_output.append("# TYPE auth_service_up gauge")
    metrics_output.append("auth_service_up 1")
    metrics_output.append("")
    metrics_output.append("# HELP auth_service_timestamp Service timestamp")
    metrics_output.append("# TYPE auth_service_timestamp gauge")
    metrics_output.append(f"auth_service_timestamp {time.time()}")

    return Response("\n".join(metrics_output), mimetype="text/plain")


@app.route("/auth/login", methods=["POST"])
@limiter.limit(lambda: AUTH_RATE_LIMIT_LOGIN)
def login():
    """User login endpoint"""
    try:
        # Debug logging untuk memastikan header yang diterima (sementara, bisa dihapus setelah verifikasi)
        logger.info(
            f"[auth] /auth/login headers: "
            f"X-Forwarded-For={request.headers.get('X-Forwarded-For')}, "
            f"X-Real-IP={request.headers.get('X-Real-IP')}, "
            f"X-Original-User-Agent={request.headers.get('X-Original-User-Agent')}, "
            f"User-Agent={request.headers.get('User-Agent')}"
        )

        # data = request.get_json()
        data = request.get_json(silent=True) or {}
        if not data:
            # Check if it was form data
            username = request.form.get("username")
            password = request.form.get("password")
        else:
            username = data.get("username")
            password = data.get("password")

        if not username or not password:
            return jsonify(
                {"status": "error", "message": "Username and password required"}
            ), 400

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            cursor.execute(
                """
                SELECT id, username, email, password_hash, full_name, role, is_active,
                       phone_number, whatsapp, telegram, details,
                       failed_login_attempts, locked_until,
                       tour_completed, tour_passed_at, tour_version, tenant_id
                FROM users
                WHERE username = %s OR email = %s
            """,
                (username, username),
            )
            user = cursor.fetchone()

            if not user:
                log_auth_event(
                    None, username, "LOGIN", False, {"reason": "user_not_found"}
                )
                return jsonify(
                    {"status": "error", "message": "Invalid credentials"}
                ), 401

            # Check if account is locked
            if user["locked_until"] and user["locked_until"] > datetime.now():
                log_auth_event(
                    user["id"],
                    username,
                    "LOGIN",
                    False,
                    {
                        "reason": "account_locked",
                        "locked_until": user["locked_until"].isoformat(),
                    },
                )
                remaining_time = user["locked_until"] - datetime.now()
                total_seconds = remaining_time.total_seconds()

                if total_seconds < 1:
                    time_rem_str = "less than a second"
                else:
                    remaining_minutes = int(total_seconds // 60)
                    remaining_seconds = int(total_seconds % 60)
                    time_parts = []
                    if remaining_minutes > 0:
                        time_parts.append(f"{remaining_minutes} minute(s)")
                    if remaining_seconds > 0 or remaining_minutes == 0:
                        time_parts.append(f"{remaining_seconds} second(s)")
                    time_rem_str = " and ".join(time_parts)

                return jsonify(
                    {
                        "status": "error",
                        "message": f"Account locked due to multiple failed login attempts. Please try again in {time_rem_str}.",
                        "data": {
                            "locked_until": user["locked_until"].isoformat(),
                            "retry_in_seconds": round(total_seconds),
                        },
                    }
                ), 403

            # Check if account is active
            if not user["is_active"]:
                log_auth_event(
                    user["id"], username, "LOGIN", False, {"reason": "account_inactive"}
                )
                return jsonify(
                    {"status": "error", "message": "Account is inactive"}
                ), 403

            # Verify password
            if not verify_password(password, user["password_hash"]):
                # Increment failed login attempts
                cursor.execute(
                    """
                    UPDATE users 
                    SET failed_login_attempts = failed_login_attempts + 1,
                        locked_until = CASE 
                            WHEN failed_login_attempts >= 4 THEN CURRENT_TIMESTAMP + INTERVAL '30 minutes'
                            ELSE NULL 
                        END
                    WHERE id = %s
                """,
                    (user["id"],),
                )

                log_auth_event(
                    user["id"], username, "LOGIN", False, {"reason": "invalid_password"}
                )
                return jsonify(
                    {"status": "error", "message": "Invalid credentials"}
                ), 401

            # Generate tokens
            access_token, refresh_token, refresh_token_hash = generate_tokens(user)

            # Store refresh token with real client IP
            cursor.execute(
                """
                INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
                VALUES (%s, %s, %s, %s, %s)
            """,
                (
                    user["id"],
                    refresh_token_hash,
                    datetime.now() + timedelta(days=REFRESH_TOKEN_DAYS),
                    get_client_ip(),
                    get_client_user_agent(),
                ),
            )

            # Update last login and reset failed attempts
            cursor.execute(
                """
                UPDATE users 
                SET last_login = CURRENT_TIMESTAMP, 
                    failed_login_attempts = 0,
                    locked_until = NULL
                WHERE id = %s
            """,
                (user["id"],),
            )

            log_auth_event(user["id"], username, "LOGIN", True)

            permissions_from_db = get_user_permissions(user["id"])
            permissions_list = [p["name"] for p in permissions_from_db]

            return jsonify(
                {
                    "status": "success",
                    "message": "Login successful",
                    "access_token": access_token,
                    "refresh_token": refresh_token,
                    "token_type": "Bearer",
                    "expires_in": JWT_EXPIRATION_HOURS * 3600,
                    "user": {
                        "id": str(user["id"]),
                        "username": user["username"],
                        "email": user["email"],
                        "full_name": user["full_name"],
                        "phone_number": user.get("phone_number"),
                        "whatsapp": user.get("whatsapp"),
                        "telegram": user.get("telegram"),
                        "details": user.get("details") or {},
                        "role": user["role"],
                        "permissions": permissions_list,
                        "tour_completed": user.get("tour_completed", False),
                        "tour_passed_at": user.get("tour_passed_at"),
                        "tour_version": user.get("tour_version"),
                    },
                }
            ), 200

    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500


@app.route("/auth/register", methods=["POST"])
@limiter.limit(lambda: AUTH_RATE_LIMIT_REGISTER)
def register():
    """User registration endpoint"""
    try:
        data = request.get_json()
        if data is None:
            return jsonify({"status": "error", "message": "Invalid JSON body"}), 400
        username = data.get("username")
        email = data.get("email")
        password = data.get("password")
        full_name = data.get("full_name")
        role = data.get("role", "VIEWER")
        phone_number = data.get("phone_number")
        whatsapp = data.get("whatsapp")
        telegram = data.get("telegram")
        details = data.get("details")

        if details is not None and not isinstance(details, dict):
            return jsonify(
                {"status": "error", "message": "Details must be a JSON object"}
            ), 400

        if not username or not email or not password:
            return jsonify(
                {"status": "error", "message": "Username, email, and password required"}
            ), 400

        # Password strength check
        if len(password) < 8:
            return jsonify(
                {"status": "error", "message": "Password must be at least 8 characters"}
            ), 400

        password_hash = hash_password(password)
        details = details or {}
        details = details or {}

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            role_row = fetch_role(cursor, role_name=role)
            if not role_row:
                return jsonify({"status": "error", "message": "Invalid role"}), 400
            if role_row.get("hidden_from_tenant_admin"):
                return jsonify(
                    {"status": "error", "message": "Role not available"}
                ), 403

            try:
                cursor.execute(
                    """
                    INSERT INTO users (username, email, password_hash, full_name, phone_number, whatsapp, telegram, details, role, role_id)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id, username, email, role, full_name, phone_number, whatsapp, telegram, details
                """,
                    (
                        username,
                        email,
                        password_hash,
                        full_name,
                        phone_number,
                        whatsapp,
                        telegram,
                        Json(details),
                        role_row["name"],
                        role_row["id"],
                    ),
                )

                user = cursor.fetchone()
                cursor.execute(
                    """
                    INSERT INTO user_roles (user_id, role_id)
                    VALUES (%s, %s)
                    ON CONFLICT (user_id, role_id) DO NOTHING
                """,
                    (user["id"], role_row["id"]),
                )

                log_auth_event(user["id"], username, "REGISTER", True)

                return jsonify(
                    {
                        "status": "success",
                        "message": "User registered successfully",
                        "user": {
                            "id": str(user["id"]),
                            "username": user["username"],
                            "email": user["email"],
                            "role": user["role"],
                            "full_name": user["full_name"],
                            "phone_number": user["phone_number"],
                            "whatsapp": user["whatsapp"],
                            "telegram": user["telegram"],
                            "details": user["details"] or {},
                        },
                    }
                ), 201

            except psycopg2.IntegrityError as e:
                if "username" in str(e):
                    return jsonify(
                        {"status": "error", "message": "Username already exists"}
                    ), 409
                elif "email" in str(e):
                    return jsonify(
                        {"status": "error", "message": "Email already exists"}
                    ), 409
                else:
                    raise

    except Exception as e:
        logger.error(f"Registration error: {str(e)}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500


@app.route("/auth/verify", methods=["POST"])
@limiter.limit(lambda: AUTH_RATE_LIMIT_VERIFY)
def verify_token():
    """Verify JWT token"""
    try:
        auth_header = request.headers.get("Authorization", "")
        token = None
        if auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
        else:
            data = request.get_json(silent=True) or {}
            token = data.get("token") or data.get("access_token")

        if not token:
            return jsonify({"status": "error", "message": "Missing token"}), 401

        try:
            payload = jwt.decode(
                token, JWT_SECRET, algorithms=[JWT_ALGORITHM], leeway=10
            )

            return jsonify(
                {
                    "status": "success",
                    "valid": True,
                    "payload": {
                        "user_id": payload.get("user_id"),
                        "username": payload.get("username"),
                        "email": payload.get("email"),
                        "full_name": payload.get("full_name"),
                        "phone_number": payload.get("phone_number"),
                        "whatsapp": payload.get("whatsapp"),
                        "telegram": payload.get("telegram"),
                        "details": payload.get("details", {}),
                        "role": payload.get("role"),
                        "permissions": payload.get("permissions"),
                    },
                }
            ), 200

        except jwt.ExpiredSignatureError:
            return jsonify(
                {"status": "error", "valid": False, "message": "Token expired"}
            ), 401
        except jwt.InvalidTokenError as e:
            return jsonify(
                {
                    "status": "error",
                    "valid": False,
                    "message": f"Invalid token: {str(e)}",
                }
            ), 401

    except Exception as e:
        logger.error(f"Token verification error: {str(e)}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500


@app.route("/auth/me", methods=["GET"])
@require_auth
def get_current_user():
    """Get current user info"""
    try:
        user = request.current_user
        if not user:
            return jsonify({"status": "error", "message": "User not found"}), 404

        user["id"] = str(user["id"])
        user["details"] = user.get("details") or {}

        # Ensure tour fields are in the response
        user["tour_completed"] = user.get("tour_completed", False)
        user["tour_passed_at"] = user.get("tour_passed_at")
        user["tour_version"] = user.get("tour_version")

        return jsonify({"status": "success", "user": user}), 200

    except Exception as e:
        logger.error(f"Get user error: {str(e)}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500


@app.route("/auth/tour/complete", methods=["PATCH"])
@require_auth
def complete_tour():
    """Update user's guided tour status"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"status": "error", "message": "Invalid JSON body"}), 400

        version = data.get("version", "1.0")
        user_id = request.current_user["id"]

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute(
                """
                UPDATE users 
                SET tour_completed = TRUE, 
                    tour_passed_at = CURRENT_TIMESTAMP,
                    tour_version = %s
                WHERE id = %s
                RETURNING tour_completed, tour_passed_at, tour_version
            """,
                (version, user_id),
            )

            result = cursor.fetchone()
            if (
                result
                and result["tour_passed_at"]
                and hasattr(result["tour_passed_at"], "isoformat")
            ):
                result["tour_passed_at"] = result["tour_passed_at"].isoformat()

            return jsonify(
                {"status": "success", "message": "Tour status updated", "data": result}
            ), 200

    except Exception as e:
        logger.error(f"Complete tour error: {str(e)}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500


@app.route("/auth/onboarding/progress", methods=["PATCH"])
@require_auth
def update_onboarding_progress():
    """Update user's quick start onboarding progress"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"status": "error", "message": "Invalid JSON body"}), 400

        task_id = data.get("taskId")
        version = data.get("version", "1.0")
        completed_at = data.get("completedAt")

        if not task_id:
            return jsonify({"status": "error", "message": "Missing taskId"}), 400

        user_id = request.current_user["id"]

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Fetch current progress
            cursor.execute(
                "SELECT onboarding_progress FROM users WHERE id = %s", (user_id,)
            )
            current_row = cursor.fetchone()
            progress = (
                current_row["onboarding_progress"]
                if current_row and current_row["onboarding_progress"]
                else {}
            )

            # Update specific task
            progress[task_id] = {
                "completed": True,
                "completedAt": completed_at or datetime.now().isoformat(),
                "version": version,
            }

            # Save back to database
            cursor.execute(
                """
                UPDATE users 
                SET onboarding_progress = %s
                WHERE id = %s
                RETURNING onboarding_progress
            """,
                (Json(progress), user_id),
            )

            conn.commit()
            result = cursor.fetchone()

            return jsonify(
                {
                    "status": "success",
                    "message": f"Onboarding task '{task_id}' updated",
                    "data": result["onboarding_progress"],
                }
            ), 200

    except Exception as e:
        logger.error(f"Update onboarding progress error: {str(e)}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500


# User Management Endpoints


@app.route("/auth/users", methods=["GET"])
@require_permission(["user:read", "user:manage", "*"])
def list_users():
    """
    List all users with pagination and search.

    Security:
    - HIGH PRIV (is_high_priv_user == True):
        Melihat semua user.
    - NON HIGH PRIV (admin biasa dengan user:read/user:manage):
        Tidak melihat user dengan role HIGH_PRIV_ROLES
        (SUPERADMIN, DEVELOPER, ADMIN_SECURITY).
    """
    try:
        current_user = getattr(request, "current_user", None)
        is_high_priv = is_high_priv_user(current_user)

        page = int(request.args.get("page", 1))
        limit = int(request.args.get("limit", 20))
        search = request.args.get("search", "")
        role_filter = request.args.get("role", "")

        if page < 1:
            page = 1
        if limit < 1 or limit > 100:
            limit = 20

        offset = (page - 1) * limit

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            where_conditions = ["1=1"]
            params = []

            # Multi-tenancy filtering
            tenant_id = request.headers.get('X-Tenant-ID')
            if tenant_id and not is_high_priv:
                where_conditions.append("u.tenant_id = %s")
                params.append(tenant_id)
                logger.info(f"Filtering users by tenant_id: {tenant_id}")

            # Search filter
            if search:
                where_conditions.append(
                    "(u.username ILIKE %s OR u.email ILIKE %s OR u.full_name ILIKE %s)"
                )
                search_param = f"%{search}%"
                params.extend([search_param, search_param, search_param])

            # Explicit role filter (allow any existing role name)
            if role_filter:
                where_conditions.append("(COALESCE(r.name, u.role) = %s)")
                params.append(role_filter)

            # Visibility filter: non-high-priv tidak boleh melihat user dengan role hidden/high-priv
            if not is_high_priv:
                where_conditions.append(
                    "COALESCE(r.hidden_from_tenant_admin, FALSE) = FALSE"
                )
                placeholders = ", ".join(["%s"] * len(HIGH_PRIV_ROLES))
                where_conditions.append(
                    f"COALESCE(UPPER(u.role), '') NOT IN ({placeholders})"
                )
                params.extend(list(HIGH_PRIV_ROLES))

            where_clause = " AND ".join(where_conditions)

            # Hitung total setelah filter
            cursor.execute(
                f"SELECT COUNT(*) AS count FROM users u LEFT JOIN roles r ON u.role_id = r.id WHERE {where_clause}",
                params,
            )
            total_count = cursor.fetchone()["count"]

            # Ambil data page
            cursor.execute(
                f"""
                SELECT u.id, u.username, u.email, u.full_name, u.phone_number, u.whatsapp, u.telegram, u.details,
                       u.role, u.role_id, u.is_active, u.is_verified,
                       u.created_at, u.last_login, u.failed_login_attempts, u.tenant_id, u.tenant_id as hospital_id
                FROM users u                LEFT JOIN roles r ON u.role_id = r.id
                WHERE {where_clause}
                ORDER BY u.created_at DESC
                LIMIT %s OFFSET %s
            """,
                params + [limit, offset],
            )

            users = cursor.fetchall()

            # Sembunyikan user ui-settings dari non high-priv
            # High-priv (SUPERADMIN/DEVELOPER/*/rbac:manage) tetap melihat semua.
            if not is_high_priv_user(current_user):
                users = [u for u in users if not is_ui_settings_user(u)]

            # Enrich dengan permissions efektif
            for u in users:
                u["id"] = str(u["id"])
                u["details"] = u.get("details") or {}
                perms = get_user_permissions(u["id"])
                u["permissions"] = [p["name"] for p in perms]

            total_pages = (total_count + limit - 1) // limit

            return jsonify(
                {
                    "status": "success",
                    "data": {
                        "users": users,
                        "pagination": {
                            "page": page,
                            "limit": limit,
                            "total": total_count,
                            "total_pages": total_pages,
                            "has_next": page < total_pages,
                            "has_prev": page > 1,
                        },
                    },
                }
            ), 200

    except Exception as e:
        logger.error(f"List users error: {str(e)}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500


@app.route("/auth/users", methods=["POST"])
@require_permission(["user:create", "user:manage", "*"])
def create_user():
    """Create a new user"""
    try:
        data = request.get_json()
        if data is None:
            return jsonify({"status": "error", "message": "Invalid JSON body"}), 400
        current_user = request.current_user
        username = data.get("username")
        email = data.get("email")
        password = data.get("password")
        full_name = data.get("full_name")
        role = data.get("role", "VIEWER")
        is_active = data.get("is_active", True)
        phone_number = data.get("phone_number")
        whatsapp = data.get("whatsapp")
        telegram = data.get("telegram")
        details = data.get("details")

        if details is not None and not isinstance(details, dict):
            return jsonify(
                {"status": "error", "message": "Details must be a JSON object"}
            ), 400

        # Validation
        if not username or not email or not password:
            return jsonify(
                {"status": "error", "message": "Username, email, and password required"}
            ), 400

        if len(password) < 8:
            return jsonify(
                {"status": "error", "message": "Password must be at least 8 characters"}
            ), 400

        tenant_id = data.get("tenant_id") or data.get("hospital_id")
        
        password_hash = hash_password(password)

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            role_row = fetch_role(cursor, role_name=role)
            if not role_row:
                return jsonify({"status": "error", "message": "Invalid role"}), 400
            if not can_assign_role_to_user(current_user, role_row):
                return jsonify(
                    {"status": "error", "message": "Not allowed to assign this role"}
                ), 403

            try:
                cursor.execute(
                    """
                    INSERT INTO users (
                        username, email, password_hash, full_name,
                        phone_number, whatsapp, telegram, details,
                        role, role_id, is_active, tenant_id
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id, username, email, full_name, phone_number, whatsapp, telegram, details, role, is_active, created_at, tenant_id
                """,
                    (
                        username,
                        email,
                        password_hash,
                        full_name,
                        phone_number,
                        whatsapp,
                        telegram,
                        Json(details),
                        role_row["name"],
                        role_row["id"],
                        is_active,
                        tenant_id
                    ),
                )

                user = cursor.fetchone()
                user["id"] = str(user["id"])
                user["details"] = user.get("details") or {}

                # Get role_id for the new user's role
                role_id = role_row["id"]
                cursor.execute(
                    """
                    INSERT INTO user_roles (user_id, role_id)
                    VALUES (%s, %s)
                    ON CONFLICT (user_id, role_id) DO NOTHING
                """,
                    (user["id"], role_id),
                )

                permissions_from_db = get_user_permissions(user["id"])
                user["permissions"] = [p["name"] for p in permissions_from_db]

                # Log the action
                log_auth_event(
                    request.current_user["id"],
                    request.current_user["username"],
                    "CREATE_USER",
                    True,
                    {"created_user": username, "role": role},
                )

                return jsonify(
                    {
                        "status": "success",
                        "message": "User created successfully",
                        "user": user,
                    }
                ), 201

            except psycopg2.IntegrityError as e:
                if "username" in str(e):
                    return jsonify(
                        {"status": "error", "message": "Username already exists"}
                    ), 409
                elif "email" in str(e):
                    return jsonify(
                        {"status": "error", "message": "Email already exists"}
                    ), 409
                else:
                    raise

    except Exception as e:
        logger.error(f"Create user error: {str(e)}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500


@app.route("/auth/users/<user_id>", methods=["GET"])
@require_auth
def get_user(user_id):
    """Get user by ID"""
    try:
        current_user = request.current_user
        # Users can only view their own profile unless they have user:read or user:manage permission
        if (
            not check_permission(
                current_user["permissions"], ["user:read", "user:manage", "*"]
            )
            and str(current_user["id"]) != user_id
        ):
            return jsonify(
                {
                    "status": "error",
                    "message": "Access denied. You can only view your own profile.",
                }
            ), 403

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute(
                """
                SELECT id, username, email, full_name, phone_number, whatsapp, telegram, details,
                       role, is_active, is_verified,
                       created_at, last_login, failed_login_attempts
                FROM users WHERE id = %s
            """,
                (user_id,),
            )

            user = cursor.fetchone()

            if not user:
                return jsonify({"status": "error", "message": "User not found"}), 404

            user["id"] = str(user["id"])
            user["details"] = user.get("details") or {}
            permissions_from_db = get_user_permissions(user["id"])
            user["permissions"] = [p["name"] for p in permissions_from_db]

            return jsonify({"status": "success", "user": user}), 200

    except Exception as e:
        logger.error(f"Get user error: {str(e)}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500


@app.route("/auth/users/<user_id>", methods=["PUT"])
@require_auth
def update_user(user_id):
    """Update user"""
    try:
        data = request.get_json()
        if data is None:
            return jsonify({"status": "error", "message": "Invalid JSON body"}), 400
        current_user = request.current_user

        # Users can only update their own profile unless they have user:update or user:manage permission
        if (
            not check_permission(
                current_user["permissions"], ["user:update", "user:manage", "*"]
            )
            and str(current_user["id"]) != user_id
        ):
            return jsonify({"status": "error", "message": "Access denied."}), 403

        # Non-admin users cannot change role or is_active status unless they have user:manage
        if not check_permission(current_user["permissions"], ["user:manage", "*"]):
            data.pop("role", None)
            data.pop("is_active", None)

        # Build update query dynamically
        update_fields = []
        params = []
        role_update = None

        allowed_fields = [
            "username",
            "email",
            "full_name",
            "role",
            "is_active",
            "phone_number",
            "whatsapp",
            "telegram",
            "details",
            "tenant_id",
            "hospital_id",
        ]

        for field in allowed_fields:
            if field in data:
                if field == "role":
                    role_update = data[field]
                    continue

                if field == "details":
                    if data[field] is not None and not isinstance(data[field], dict):
                        return jsonify(
                            {
                                "status": "error",
                                "message": "Details must be a JSON object",
                            }
                        ), 400
                    update_fields.append(f"{field} = %s")
                    params.append(Json(data[field] or {}))
                    continue

                update_fields.append(f"{field} = %s")
                params.append(data[field])

        # Handle password update separately
        if "password" in data:
            password = data.get("password")
            if len(password) < 8:
                return jsonify(
                    {
                        "status": "error",
                        "message": "Password must be at least 8 characters",
                    }
                ), 400

            password_hash = hash_password(password)
            update_fields.append("password_hash = %s")
            params.append(password_hash)

        if not update_fields:
            return jsonify(
                {"status": "error", "message": "No valid fields to update"}
            ), 400

        # Add updated_at
        update_fields.append("updated_at = CURRENT_TIMESTAMP")
        params.append(user_id)

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Handle role update validation (requires DB)
            if role_update is not None:
                role_row = fetch_role(cursor, role_name=role_update)
                if not role_row:
                    return jsonify({"status": "error", "message": "Invalid role"}), 400
                if not can_assign_role_to_user(current_user, role_row):
                    return jsonify(
                        {
                            "status": "error",
                            "message": "Not allowed to assign this role",
                        }
                    ), 403
                update_fields.insert(0, "role = %s")
                update_fields.insert(1, "role_id = %s")
                params.insert(0, role_row["name"])
                params.insert(1, role_row["id"])

            try:
                cursor.execute(
                    f"""
                    UPDATE users 
                    SET {", ".join(update_fields)}
                    WHERE id = %s
                    RETURNING id, username, email, full_name, phone_number, whatsapp, telegram, details, role, is_active, updated_at
                """,
                    params,
                )

                user = cursor.fetchone()

                if not user:
                    return jsonify(
                        {"status": "error", "message": "User not found"}
                    ), 404

                user["id"] = str(user["id"])
                user["details"] = user.get("details") or {}
                permissions_from_db = _collect_user_permissions(cursor, user["id"])
                user["permissions"] = [p["name"] for p in permissions_from_db]
                clear_user_permission_cache(user["id"])

                # Log the action
                log_auth_event(
                    current_user["id"],
                    current_user["username"],
                    "UPDATE_USER",
                    True,
                    {"updated_user": user["username"], "fields": list(data.keys())},
                    conn=conn,
                )

                return jsonify(
                    {
                        "status": "success",
                        "message": "User updated successfully",
                        "user": user,
                    }
                ), 200

            except psycopg2.IntegrityError as e:
                conn.rollback()
                if "username" in str(e):
                    return jsonify(
                        {"status": "error", "message": "Username already exists"}
                    ), 409
                elif "email" in str(e):
                    return jsonify(
                        {"status": "error", "message": "Email already exists"}
                    ), 409
                else:
                    raise

    except Exception as e:
        logger.error(f"Update user error: {str(e)}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500


@app.route("/auth/users/<user_id>", methods=["DELETE"])
@require_permission(["user:delete", "user:manage", "*"])
def delete_user(user_id):
    """Delete user (soft delete by setting is_active = false)"""
    try:
        current_user = request.current_user

        # Prevent admin from deleting themselves
        if str(current_user["id"]) == user_id:
            return jsonify(
                {"status": "error", "message": "Cannot delete your own account"}
            ), 400

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Check if user exists
            cursor.execute("SELECT username FROM users WHERE id = %s", (user_id,))
            user = cursor.fetchone()

            if not user:
                return jsonify({"status": "error", "message": "User not found"}), 404

            # Soft delete by setting is_active = false
            cursor.execute(
                """
                UPDATE users 
                SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
            """,
                (user_id,),
            )

            # Revoke all refresh tokens for this user
            cursor.execute(
                """
                UPDATE refresh_tokens 
                SET revoked_at = CURRENT_TIMESTAMP
                WHERE user_id = %s AND revoked_at IS NULL
            """,
                (user_id,),
            )

            # Log the action
            log_auth_event(
                current_user["id"],
                current_user["username"],
                "DELETE_USER",
                True,
                {"deleted_user": user["username"]},
            )

            return jsonify(
                {"status": "success", "message": "User deleted successfully"}
            ), 200

    except Exception as e:
        logger.error(f"Delete user error: {str(e)}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500


@app.route("/auth/users/<user_id>/change-password", methods=["POST"])
@require_auth
def change_user_password(user_id):
    """Change user password"""
    try:
        data = request.get_json()
        if data is None:
            return jsonify({"status": "error", "message": "Invalid JSON body"}), 400
        current_user = request.current_user

        new_password = data.get("new_password")
        current_password = data.get("current_password")

        if not new_password:
            return jsonify({"status": "error", "message": "New password required"}), 400

        if len(new_password) < 8:
            return jsonify(
                {"status": "error", "message": "Password must be at least 8 characters"}
            ), 400

        # Users can only change their own password unless they have manage permissions
        if (
            not check_permission(
                current_user["permissions"], ["user:update", "user:manage", "*"]
            )
            and str(current_user["id"]) != user_id
        ):
            return jsonify({"status": "error", "message": "Access denied."}), 403

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Get current user data
            cursor.execute(
                """
                SELECT username, password_hash FROM users WHERE id = %s
            """,
                (user_id,),
            )

            user = cursor.fetchone()
            if not user:
                return jsonify({"status": "error", "message": "User not found"}), 404

            # If not admin/manager, verify current password
            if not check_permission(current_user["permissions"], ["user:manage", "*"]):
                if not current_password:
                    return jsonify(
                        {"status": "error", "message": "Current password required"}
                    ), 400

                if not verify_password(current_password, user["password_hash"]):
                    return jsonify(
                        {"status": "error", "message": "Current password is incorrect"}
                    ), 400

            # Update password
            new_password_hash = hash_password(new_password)
            cursor.execute(
                """
                UPDATE users 
                SET password_hash = %s, updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
            """,
                (new_password_hash, user_id),
            )

            # Revoke all refresh tokens to force re-login
            cursor.execute(
                """
                UPDATE refresh_tokens 
                SET revoked_at = CURRENT_TIMESTAMP
                WHERE user_id = %s AND revoked_at IS NULL
            """,
                (user_id,),
            )

            # Log the action
            log_auth_event(
                current_user["id"],
                current_user["username"],
                "CHANGE_PASSWORD",
                True,
                {"target_user": user["username"]},
            )

            return jsonify(
                {"status": "success", "message": "Password changed successfully"}
            ), 200

    except Exception as e:
        logger.error(f"Change password error: {str(e)}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500


# Role Management Endpoints


@app.route("/auth/roles", methods=["GET"])
@require_auth
def list_roles():
    """
    List available roles.

    Policy:
    - HIGH PRIV (is_high_priv_user):
        Melihat semua roles.
    - NON HIGH PRIV:
        Melihat roles yang tidak hidden_from_tenant_admin.
    """
    try:
        current_user = request.current_user
        all_roles = get_all_roles() or []

        visible_roles = [r for r in all_roles if role_visible_to_user(r, current_user)]
        if is_high_priv_user(current_user):
            visible_roles = all_roles

        return jsonify({"status": "success", "roles": visible_roles}), 200

    except Exception as e:
        logger.error(f"List roles error: {e}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500


@app.route("/auth/roles/<role_name>", methods=["GET"])
@require_auth
def get_role(role_name):
    """Get specific role details (visibility-aware)."""
    try:
        current_user = request.current_user
        if not (
            is_high_priv_user(current_user)
            or check_permission(current_user.get("permissions", []), ["rbac:view", "*"])
        ):
            return jsonify(
                {
                    "status": "error",
                    "message": "Insufficient privilege to view role detail",
                }
            ), 403
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            role_row = fetch_role(cursor, role_name=role_name)
            if not role_row:
                return jsonify({"status": "error", "message": "Role not found"}), 404

            if not role_visible_to_user(role_row, current_user):
                return jsonify(
                    {
                        "status": "error",
                        "message": "Insufficient privilege to view this role",
                    }
                ), 403

            cursor.execute(
                "SELECT COUNT(*) AS count FROM users WHERE role_id = %s OR role = %s",
                (role_row["id"], role_row["name"]),
            )
            user_count = cursor.fetchone()["count"]

            role_row["user_count"] = user_count
            return jsonify({"status": "success", "role": role_row}), 200

    except Exception as e:
        logger.error(f"Get role error: {str(e)}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500


@app.route("/auth/roles/<role_name>/users", methods=["GET"])
@require_auth
def get_role_users(role_name):
    """Get users assigned to a specific role (visibility-aware)."""
    try:
        current_user = request.current_user
        if not (
            is_high_priv_user(current_user)
            or check_permission(current_user.get("permissions", []), ["rbac:view", "*"])
        ):
            return jsonify(
                {
                    "status": "error",
                    "message": "Insufficient privilege to view role users",
                }
            ), 403
        page = int(request.args.get("page", 1))
        limit = int(request.args.get("limit", 20))

        if page < 1:
            page = 1
        if limit < 1 or limit > 100:
            limit = 20

        offset = (page - 1) * limit

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            role_row = fetch_role(cursor, role_name=role_name)
            if not role_row:
                return jsonify({"status": "error", "message": "Role not found"}), 404

            if not role_visible_to_user(role_row, current_user):
                return jsonify(
                    {
                        "status": "error",
                        "message": "Insufficient privilege to view users of this role",
                    }
                ), 403

            cursor.execute(
                "SELECT COUNT(*) AS count FROM users WHERE role_id = %s OR role = %s",
                (role_row["id"], role_row["name"]),
            )
            total_count = cursor.fetchone()["count"]

            cursor.execute(
                """
                SELECT id, username, email, full_name, phone_number, whatsapp, telegram, details,
                       is_active, is_verified, created_at, last_login
                FROM users 
                WHERE role_id = %s OR role = %s
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s
            """,
                (role_row["id"], role_row["name"], limit, offset),
            )

            users = cursor.fetchall()

            # Convert UUIDs to strings and filter ui-settings for non high-priv
            if not is_high_priv_user(current_user):
                users = [u for u in users if not is_ui_settings_user(u)]
            for user in users:
                user["id"] = str(user["id"])
                user["details"] = user.get("details") or {}

            total_pages = (total_count + limit - 1) // limit

            return jsonify(
                {
                    "status": "success",
                    "data": {
                        "role": role_name,
                        "users": users,
                        "pagination": {
                            "page": page,
                            "limit": limit,
                            "total": total_count,
                            "total_pages": total_pages,
                            "has_next": page < total_pages,
                            "has_prev": page > 1,
                        },
                    },
                }
            ), 200

    except Exception as e:
        logger.error(f"Get role users error: {e}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500


# Permission Management Endpoints


@app.route("/auth/permissions", methods=["GET"])
@require_auth
def list_permissions():
    """
    List all available permissions.

    Rules:
    - High-priv user (is_high_priv_user):
        Melihat semua permissions (termasuk wildcard/sensitif).
    - Non high-priv:
        Harus punya 'rbac:view' atau 'system:admin' atau '*'.
        Permission dengan hidden_from_tenant_admin disembunyikan.
    """
    try:
        current_user = getattr(request, "current_user", None)
        if not current_user:
            return jsonify(
                {"status": "error", "message": "Authentication required"}
            ), 401

        perms = current_user.get("permissions") or []

        # High-priv: full list
        if is_high_priv_user(current_user):
            permissions_list = get_all_permissions()

        # Non high-priv but has rbac:view / system:admin / '*': filtered list
        elif check_permission(perms, ["rbac:view", "system:admin", "*"]):
            all_perms = get_all_permissions() or []
            permissions_list = [
                p for p in all_perms if permission_visible_to_user(p, current_user)
            ]

        # Others: forbidden
        else:
            return jsonify(
                {
                    "status": "error",
                    "message": "High-privilege role required to list permissions",
                    "hint": "Requires SUPERADMIN/DEVELOPER or system:admin",
                }
            ), 403

        # Group permissions by category
        permissions_by_category = {}
        for permission in permissions_list or []:
            category = permission.get("category", "general")
            permissions_by_category.setdefault(category, []).append(permission)

        return jsonify(
            {
                "status": "success",
                "permissions": {
                    "all": permissions_list,
                    "by_category": permissions_by_category,
                },
            }
        ), 200

    except Exception as e:
        logger.error(f"List permissions error: {str(e)}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500


@app.route("/auth/permissions/check", methods=["POST"])
@require_auth
def check_current_user_permission():
    """Check if current user has specific permission"""
    try:
        data = request.get_json()
        if data is None:
            return jsonify({"status": "error", "message": "Invalid JSON body"}), 400
        permission = data.get("permission")

        if not permission:
            return jsonify(
                {"status": "error", "message": "Permission name required"}
            ), 400

        current_user = request.current_user
        has_permission = check_permission(current_user["permissions"], [permission])

        return jsonify(
            {
                "status": "success",
                "has_permission": has_permission,
                "permission": permission,
                "user_id": current_user["id"],
            }
        ), 200

    except Exception as e:
        logger.error(f"Check permission error: {str(e)}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500


# User Status Management Endpoints


@app.route("/auth/users/<user_id>/activate", methods=["POST"])
@require_permission(["user:manage", "*"])
def activate_user(user_id):
    """Activate a user account"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Check if user exists
            cursor.execute(
                "SELECT username, is_active FROM users WHERE id = %s", (user_id,)
            )
            user = cursor.fetchone()

            if not user:
                return jsonify({"status": "error", "message": "User not found"}), 404

            if user["is_active"]:
                return jsonify(
                    {"status": "error", "message": "User is already active"}
                ), 400

            # Activate user
            cursor.execute(
                """
                UPDATE users 
                SET is_active = TRUE, updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
            """,
                (user_id,),
            )

            # Log the action
            current_user = request.current_user
            log_auth_event(
                current_user["id"],
                current_user["username"],
                "ACTIVATE_USER",
                True,
                {"activated_user": user["username"]},
            )

            return jsonify(
                {"status": "success", "message": "User activated successfully"}
            ), 200

    except Exception as e:
        logger.error(f"Activate user error: {str(e)}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500


@app.route("/auth/users/<user_id>/deactivate", methods=["POST"])
@require_permission(["user:manage", "*"])
def deactivate_user(user_id):
    """Deactivate a user account"""
    try:
        current_user = request.current_user

        # Prevent admin from deactivating themselves
        if str(current_user["id"]) == user_id:
            return jsonify(
                {"status": "error", "message": "Cannot deactivate your own account"}
            ), 400

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Check if user exists
            cursor.execute(
                "SELECT username, is_active FROM users WHERE id = %s", (user_id,)
            )
            user = cursor.fetchone()

            if not user:
                return jsonify({"status": "error", "message": "User not found"}), 404

            if not user["is_active"]:
                return jsonify(
                    {"status": "error", "message": "User is already inactive"}
                ), 400

            # Deactivate user
            cursor.execute(
                """
                UPDATE users 
                SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
            """,
                (user_id,),
            )

            # Log the action
            log_auth_event(
                current_user["id"],
                current_user["username"],
                "DEACTIVATE_USER",
                True,
                {"deactivated_user": user["username"]},
            )

            return jsonify(
                {"status": "success", "message": "User deactivated successfully"}
            ), 200

    except Exception as e:
        logger.error(f"Deactivate user error: {str(e)}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500


@app.route("/auth/roles/<role_id>", methods=["PUT"])
def update_role(role_id):
    """Update a role's details.

    - High-priv: boleh update role apa pun.
    - rbac:custom-manage: hanya boleh update role non-reserved.
    JSON Body:
    {
        "name": "Optional: New name",
        "description": "Optional: New description",
        "is_active": "Optional: boolean"
    }
    """
    try:
        user = get_current_user_from_token()
        if not user:
            return jsonify(
                {"status": "error", "message": "Authentication required"}
            ), 401

        data = request.get_json()
        if not data:
            return jsonify(
                {"status": "error", "message": "Request body cannot be empty"}
            ), 400

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Ambil role yg mau diupdate untuk cek reserved/protected
            cursor.execute(
                "SELECT id, name, protected FROM roles WHERE id = %s", (role_id,)
            )
            existing = cursor.fetchone()
            if not existing:
                return jsonify({"status": "error", "message": "Role not found"}), 404

            role_name_upper = str(existing["name"]).upper()
            is_protected = bool(existing.get("protected"))
            is_hidden = bool(existing.get("hidden_from_tenant_admin"))

            # Jika role protected, hanya high-priv yang boleh mengubah
            if is_protected and not is_high_priv_user(user):
                return jsonify(
                    {"status": "error", "message": "Cannot modify protected role"}
                ), 403

            # High-priv boleh ubah apa saja.
            # Non-high-priv dengan rbac:custom-manage hanya boleh ubah role non-reserved.
            if is_high_priv_user(user):
                pass
            elif can_custom_manage(user):
                if role_name_upper in RESERVED_ROLE_NAMES:
                    return jsonify(
                        {
                            "status": "error",
                            "message": "Not allowed to modify reserved role",
                        }
                    ), 403
                if is_hidden:
                    return jsonify(
                        {
                            "status": "error",
                            "message": "Not allowed to modify hidden role",
                        }
                    ), 403
            else:
                return jsonify(
                    {
                        "status": "error",
                        "message": "Insufficient privilege to update roles",
                    }
                ), 403

            update_fields = []
            params = []
            if is_high_priv_user(user):
                allowed_fields = [
                    "name",
                    "description",
                    "is_active",
                    "protected",
                    "hidden_from_tenant_admin",
                ]
            else:
                if "protected" in data or "hidden_from_tenant_admin" in data:
                    return jsonify(
                        {
                            "status": "error",
                            "message": "Not allowed to modify protection flags",
                        }
                    ), 403
                allowed_fields = ["name", "description", "is_active"]

            for field in allowed_fields:
                if field in data:
                    if field == "name":
                        new_name = str(data["name"]).strip()
                        # Non-high-priv tidak boleh mengganti nama menjadi reserved
                        if (
                            not is_high_priv_user(user)
                        ) and new_name.upper() in RESERVED_ROLE_NAMES:
                            return jsonify(
                                {
                                    "status": "error",
                                    "message": "Cannot rename role to reserved name",
                                }
                            ), 403
                        params.append(new_name)
                    else:
                        params.append(data[field])
                    update_fields.append(f"{field} = %s")

            if not update_fields:
                return jsonify(
                    {"status": "error", "message": "No valid fields to update"}
                ), 400

            params.append(role_id)

            cursor.execute(
                f"""
                UPDATE roles
                SET {", ".join(update_fields)}, updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
                RETURNING *
            """,
                params,
            )
            updated_role = cursor.fetchone()
            if not updated_role:
                return jsonify({"status": "error", "message": "Role not found"}), 404

            clear_user_permission_cache()
            return jsonify({"status": "success", "role": updated_role}), 200

    except psycopg2.IntegrityError:
        return jsonify({"status": "error", "message": "Role name already exists"}), 409
    except Exception as e:
        logger.error(f"Update role error: {e}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500


@app.route("/auth/roles/<role_id>", methods=["DELETE"])
@require_auth
def delete_role(role_id):
    """Delete a role. High-priv OR custom-manage for non-protected & non-hidden roles."""
    try:
        user = request.current_user
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            role_row = fetch_role(cursor, role_id=role_id)
            if not role_row:
                return jsonify({"status": "error", "message": "Role not found"}), 404
            if role_row.get("protected"):
                return jsonify(
                    {"status": "error", "message": "Cannot delete protected role"}
                ), 403
            if role_row.get("hidden_from_tenant_admin") and not is_high_priv_user(user):
                return jsonify(
                    {"status": "error", "message": "Cannot delete hidden role"}
                ), 403

            if not can_manage_role_resource(user, role_row):
                return jsonify(
                    {
                        "status": "error",
                        "message": "Insufficient privilege to delete this role",
                    }
                ), 403

            cursor.execute("DELETE FROM roles WHERE id = %s RETURNING name", (role_id,))
            deleted_role = cursor.fetchone()
            if not deleted_role:
                return jsonify({"status": "error", "message": "Role not found"}), 404

            clear_user_permission_cache()
            return jsonify(
                {
                    "status": "success",
                    "message": f"Role '{deleted_role['name']}' deleted",
                }
            ), 200
    except Exception as e:
        logger.error(f"Delete role error: {e}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500


@app.route("/auth/roles", methods=["POST"])
def create_role_endpoint():
    """
    Create a new role.

    Allowed:
    - High-priv (SUPERADMIN/DEVELOPER/rbac:manage/*): bebas.
    - rbac:custom-manage: hanya boleh membuat role non-protected/hidden.
    """
    try:
        user = get_current_user_from_token()
        if not user:
            return jsonify(
                {"status": "error", "message": "Authentication required"}
            ), 401

        data = request.get_json()
        if not data or "name" not in data:
            return jsonify({"status": "error", "message": "Role name is required"}), 400

        name = str(data["name"]).strip()
        description = data.get("description")

        # Cek hak akses
        if is_high_priv_user(user):
            # full allowed
            pass
        elif can_custom_manage(user):
            if name.upper() in RESERVED_ROLE_NAMES:
                return jsonify(
                    {
                        "status": "error",
                        "message": "Not allowed to create reserved role",
                    }
                ), 403
        else:
            return jsonify(
                {"status": "error", "message": "Insufficient privilege to create roles"}
            ), 403

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            try:
                cursor.execute(
                    """
                    INSERT INTO roles (name, description, protected, hidden_from_tenant_admin)
                    VALUES (%s, %s, %s, %s)
                    RETURNING *
                """,
                    (
                        name,
                        description,
                        bool(data.get("protected"))
                        if is_high_priv_user(user)
                        else False,
                        bool(data.get("hidden_from_tenant_admin"))
                        if is_high_priv_user(user)
                        else False,
                    ),
                )
                new_role = cursor.fetchone()
                clear_user_permission_cache()
                return jsonify({"status": "success", "role": new_role}), 201
            except psycopg2.IntegrityError:
                return jsonify(
                    {"status": "error", "message": "Role name already exists"}
                ), 409
    except Exception as e:
        logger.error(f"Create role error: {e}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500


@app.route("/auth/permissions/<permission_id>", methods=["GET"])
@require_high_priv
def get_permission(permission_id):
    """Get a single permission by ID. Requires admin privileges."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("SELECT * FROM permissions WHERE id = %s", (permission_id,))
            permission = cursor.fetchone()
            if not permission:
                return jsonify(
                    {"status": "error", "message": "Permission not found"}
                ), 404
            return jsonify({"status": "success", "permission": permission}), 200
    except Exception as e:
        logger.error(f"Get permission error: {e}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500


@app.route("/auth/permissions", methods=["POST"])
@require_auth
def create_permission_endpoint():
    """Create a new permission.
    Requires high-priv OR rbac:custom-manage (non-hidden/protected only).
    JSON Body:
    {
        "name": "new:permission",
        "description": "Description of what this permission allows.",
        "category": "custom"
    }
    """
    try:
        user = request.current_user
        data = request.get_json()
        if not data or "name" not in data:
            return jsonify(
                {"status": "error", "message": "Permission name is required"}
            ), 400

        name = data["name"]
        description = data.get("description")
        category = data.get("category", "custom")

        if not (is_high_priv_user(user) or can_custom_manage(user)):
            return jsonify(
                {
                    "status": "error",
                    "message": "Insufficient privilege to create permissions",
                }
            ), 403

        protected_flag = (
            bool(data.get("protected")) if is_high_priv_user(user) else False
        )
        hidden_flag = (
            bool(data.get("hidden_from_tenant_admin"))
            if is_high_priv_user(user)
            else False
        )
        if not is_high_priv_user(user) and name == "*":
            return jsonify(
                {
                    "status": "error",
                    "message": "Cannot create global wildcard permission",
                }
            ), 403

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            try:
                cursor.execute(
                    """
                    INSERT INTO permissions (name, description, category, protected, hidden_from_tenant_admin)
                    VALUES (%s, %s, %s, %s, %s)
                    RETURNING *
                """,
                    (name, description, category, protected_flag, hidden_flag),
                )
                new_permission = cursor.fetchone()
                return jsonify({"status": "success", "permission": new_permission}), 201
            except psycopg2.IntegrityError:
                return jsonify(
                    {"status": "error", "message": "Permission name already exists"}
                ), 409
    except Exception as e:
        logger.error(f"Create permission error: {e}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500


@app.route("/auth/permissions/<permission_id>", methods=["PUT"])
@require_auth
def update_permission(permission_id):
    """Update a permission's details.
    Requires high-priv OR rbac:custom-manage (non-hidden/protected only).
    JSON Body:
    {
        "name": "Optional: new:name",
        "description": "Optional: New description",
        "category": "Optional: new_category"
    }
    """
    try:
        user = request.current_user
        data = request.get_json()
        if not data:
            return jsonify(
                {"status": "error", "message": "Request body cannot be empty"}
            ), 400

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute(
                "SELECT id, name, protected, hidden_from_tenant_admin FROM permissions WHERE id = %s",
                (permission_id,),
            )
            existing = cursor.fetchone()
            if not existing:
                return jsonify(
                    {"status": "error", "message": "Permission not found"}
                ), 404
            if existing.get("protected") and not is_high_priv_user(user):
                return jsonify(
                    {"status": "error", "message": "Cannot modify protected permission"}
                ), 403
            if existing.get("hidden_from_tenant_admin") and not is_high_priv_user(user):
                return jsonify(
                    {"status": "error", "message": "Cannot modify hidden permission"}
                ), 403

            if not (is_high_priv_user(user) or can_custom_manage(user)):
                return jsonify(
                    {
                        "status": "error",
                        "message": "Insufficient privilege to update permission",
                    }
                ), 403

        update_fields = []
        params = []

        # Only high-priv may change protected/hidden flags
        if is_high_priv_user(user):
            allowed_fields = [
                "name",
                "description",
                "category",
                "is_active",
                "protected",
                "hidden_from_tenant_admin",
            ]
        else:
            if "protected" in data or "hidden_from_tenant_admin" in data:
                return jsonify(
                    {
                        "status": "error",
                        "message": "Not allowed to modify protection flags",
                    }
                ), 403
            allowed_fields = ["name", "description", "category", "is_active"]

        for field in allowed_fields:
            if field in data:
                update_fields.append(f"{field} = %s")
                params.append(data[field])

        if not update_fields:
            return jsonify(
                {"status": "error", "message": "No valid fields to update"}
            ), 400

        params.append(permission_id)

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            try:
                cursor.execute(
                    f"""
                    UPDATE permissions
                    SET {", ".join(update_fields)}
                    WHERE id = %s
                    RETURNING *
                """,
                    params,
                )
                updated_permission = cursor.fetchone()
                if not updated_permission:
                    return jsonify(
                        {"status": "error", "message": "Permission not found"}
                    ), 404

                clear_user_permission_cache()
                return jsonify(
                    {"status": "success", "permission": updated_permission}
                ), 200
            except psycopg2.IntegrityError:
                return jsonify(
                    {"status": "error", "message": "Permission name already exists"}
                ), 409
    except Exception as e:
        logger.error(f"Update permission error: {e}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500


@app.route("/auth/permissions/<permission_id>", methods=["DELETE"])
@require_auth
def delete_permission(permission_id):
    """Delete a permission. High-priv or rbac:custom-manage for non-hidden/non-protected."""
    try:
        user = request.current_user
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            perm_row = fetch_permission(cursor, permission_id)
            if not perm_row:
                return jsonify(
                    {"status": "error", "message": "Permission not found"}
                ), 404
            if perm_row.get("protected"):
                return jsonify(
                    {"status": "error", "message": "Cannot delete protected permission"}
                ), 403
            if perm_row.get("hidden_from_tenant_admin") and not is_high_priv_user(user):
                return jsonify(
                    {"status": "error", "message": "Cannot delete hidden permission"}
                ), 403
            if not can_manage_permission_resource(user, perm_row):
                return jsonify(
                    {
                        "status": "error",
                        "message": "Insufficient privilege to delete this permission",
                    }
                ), 403

            cursor.execute(
                "DELETE FROM permissions WHERE id = %s RETURNING name", (permission_id,)
            )
            deleted_permission = cursor.fetchone()
            if not deleted_permission:
                return jsonify(
                    {"status": "error", "message": "Permission not found"}
                ), 404

            clear_user_permission_cache()
            msg = f"Permission '{deleted_permission['name']}' deleted"
            return jsonify({"status": "success", "message": msg}), 200
    except Exception as e:
        logger.error(f"Delete permission error: {e}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500


@app.route("/auth/roles/<role_id>/permissions", methods=["POST"])
def assign_permission_to_role_endpoint(role_id):
    """
    Assign a permission to a role.

    - High-priv: boleh assign permission apa pun ke role apa pun.
    - rbac:custom-manage:
        - hanya boleh assign permission non-hidden/non-protected
          ke role non-hidden/non-protected.
    """
    try:
        user = get_current_user_from_token()
        if not user:
            return jsonify(
                {"status": "error", "message": "Authentication required"}
            ), 401

        data = request.get_json()
        if not data or "permission_id" not in data:
            return jsonify(
                {"status": "error", "message": "permission_id is required"}
            ), 400

        permission_id = data["permission_id"]

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            role_row = fetch_role(cursor, role_id=role_id)
            if not role_row:
                return jsonify({"status": "error", "message": "Role not found"}), 404

            perm_row = fetch_permission(cursor, permission_id)
            if not perm_row:
                return jsonify(
                    {"status": "error", "message": "Permission not found"}
                ), 404

            if not role_visible_to_user(role_row, user):
                return jsonify(
                    {
                        "status": "error",
                        "message": "Insufficient privilege to modify this role",
                    }
                ), 403

            if not can_manage_role_resource(user, role_row):
                return jsonify(
                    {"status": "error", "message": "Not allowed to modify this role"}
                ), 403

            if not can_attach_permission(user, perm_row):
                return jsonify(
                    {
                        "status": "error",
                        "message": "Not allowed to assign this permission",
                    }
                ), 403

            if assign_permission_to_role(role_id, permission_id):
                return jsonify(
                    {"status": "success", "message": "Permission assigned to role"}
                ), 200
            return jsonify(
                {"status": "error", "message": "Failed to assign permission"}
            ), 500

    except psycopg2.IntegrityError:
        return jsonify(
            {
                "status": "error",
                "message": "Role or permission not found, or assignment already exists",
            }
        ), 404
    except Exception as e:
        logger.error(f"Assign permission to role error: {e}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500


@app.route("/auth/roles/<role_id>/permissions", methods=["GET"])
@require_auth
def get_role_permissions_endpoint(role_id):
    """Get all permissions assigned to a specific role (visibility-aware)."""
    try:
        current_user = request.current_user
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            role_row = fetch_role(cursor, role_id=role_id)
            if not role_row:
                return jsonify({"status": "error", "message": "Role not found"}), 404

            # Need high-priv OR rbac:view AND role must be visible
            if not role_visible_to_user(role_row, current_user):
                return jsonify(
                    {
                        "status": "error",
                        "message": "Insufficient privilege to view this role",
                    }
                ), 403
            if not (
                is_high_priv_user(current_user)
                or check_permission(
                    current_user.get("permissions", []), ["rbac:view", "*"]
                )
            ):
                return jsonify(
                    {
                        "status": "error",
                        "message": "Insufficient privilege to view role permissions",
                    }
                ), 403

        permissions = get_role_permissions(role_id) or []
        filtered = [
            p for p in permissions if permission_visible_to_user(p, current_user)
        ]
        if is_high_priv_user(current_user):
            filtered = permissions

        return jsonify({"status": "success", "permissions": filtered}), 200
    except Exception as e:
        logger.error(f"Get role permissions error: {e}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500


@app.route("/auth/roles/<role_id>/permissions/<permission_id>", methods=["DELETE"])
def remove_permission_from_role_endpoint(role_id, permission_id):
    """
    Remove a permission from a role.

    - High-priv: boleh dari role/permission apa pun.
    - rbac:custom-manage: hanya boleh untuk role & permission non-hidden/non-protected.
    """
    try:
        user = get_current_user_from_token()
        if not user:
            return jsonify(
                {"status": "error", "message": "Authentication required"}
            ), 401

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            role_row = fetch_role(cursor, role_id=role_id)
            if not role_row:
                return jsonify({"status": "error", "message": "Role not found"}), 404

            perm_row = fetch_permission(cursor, permission_id)
            if not perm_row:
                return jsonify(
                    {"status": "error", "message": "Permission not found"}
                ), 404

            if not role_visible_to_user(role_row, user):
                return jsonify(
                    {
                        "status": "error",
                        "message": "Insufficient privilege to modify this role",
                    }
                ), 403
            if not can_manage_role_resource(user, role_row):
                return jsonify(
                    {"status": "error", "message": "Not allowed to modify this role"}
                ), 403
            if not can_attach_permission(user, perm_row):
                return jsonify(
                    {
                        "status": "error",
                        "message": "Not allowed to modify this permission",
                    }
                ), 403

        if remove_permission_from_role(role_id, permission_id):
            return jsonify(
                {"status": "success", "message": "Permission removed from role"}
            ), 200

        return jsonify(
            {"status": "error", "message": "Failed to remove permission"}
        ), 500

    except Exception as e:
        logger.error(f"Remove permission from role error: {e}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500


@app.route("/auth/users/<user_id>/roles", methods=["POST"])
@require_permission(["user:manage", "*"])
def assign_role_to_user_endpoint(user_id):
    """
    Assign a role to a user.

    Enforcement:
    - High-priv: boleh assign role apa pun.
    - rbac:custom-manage: hanya boleh assign role non-protected & non-hidden.
    """
    try:
        current_user = request.current_user
        data = request.get_json()
        if not data or "role_id" not in data:
            return jsonify({"status": "error", "message": "role_id is required"}), 400

        role_id = data["role_id"]

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            role_row = fetch_role(cursor, role_id=role_id)
            if not role_row:
                return jsonify({"status": "error", "message": "Role not found"}), 404

            if not can_assign_role_to_user(current_user, role_row):
                return jsonify(
                    {"status": "error", "message": "Not allowed to assign this role"}
                ), 403

        if assign_role_to_user(user_id, role_id):
            return jsonify(
                {"status": "success", "message": "Role assigned to user"}
            ), 200

        return jsonify({"status": "error", "message": "Failed to assign role"}), 500

    except psycopg2.IntegrityError:
        return jsonify(
            {
                "status": "error",
                "message": "User or role not found, or assignment already exists",
            }
        ), 404
    except Exception as e:
        logger.error(f"Assign role to user error: {e}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500


@app.route("/auth/users/<user_id>/roles/<role_id>", methods=["DELETE"])
@require_permission(["user:manage", "*"])
def remove_role_from_user_endpoint(user_id, role_id):
    """
    Remove a role from a user.

    - High-priv: boleh hapus role apa pun.
    - rbac:custom-manage: hanya boleh hapus role non-protected & non-hidden.
    """
    try:
        current_user = request.current_user

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            role_row = fetch_role(cursor, role_id=role_id)
            if not role_row:
                return jsonify({"status": "error", "message": "Role not found"}), 404

            if not can_assign_role_to_user(current_user, role_row):
                return jsonify(
                    {"status": "error", "message": "Not allowed to modify this role"}
                ), 403

        if remove_role_from_user(user_id, role_id):
            return jsonify(
                {"status": "success", "message": "Role removed from user"}
            ), 200

        return jsonify({"status": "error", "message": "Failed to remove role"}), 500

    except Exception as e:
        logger.error(f"Remove role from user error: {e}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500


@app.route("/auth/users/<user_id>/roles", methods=["GET"])
@require_permission(["user:read", "user:manage", "*"])
def get_user_roles_endpoint(user_id):
    """Get all roles assigned to a specific user."""
    try:
        current_user = request.current_user
        roles = get_user_roles(user_id) or []
        if not is_high_priv_user(current_user):
            roles = [r for r in roles if role_visible_to_user(r, current_user)]
        return jsonify({"status": "success", "roles": roles}), 200
    except Exception as e:
        logger.error(f"Get user roles error: {e}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500


@app.route("/auth/users/<user_id>/permissions", methods=["GET"])
@require_permission(["user:read", "user:manage", "*"])
def get_user_permissions_endpoint(user_id):
    """Get all effective permissions for a user (from roles and direct)."""
    try:
        current_user = request.current_user
        permissions = get_user_permissions(user_id) or []
        if not is_high_priv_user(current_user):
            permissions = [
                p for p in permissions if permission_visible_to_user(p, current_user)
            ]
        return jsonify({"status": "success", "permissions": permissions}), 200
    except Exception as e:
        logger.error(f"Get user permissions error: {e}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500


@app.route("/auth/users/<user_id>/permissions", methods=["POST"])
@require_permission(["user:manage", "*"])
def assign_permission_to_user_endpoint(user_id):
    """
    Assign a direct permission to a user.

    - High-priv: boleh assign permission apa pun.
    - rbac:custom-manage: hanya boleh assign permission non-hidden/non-protected.
    """
    try:
        current_user = request.current_user
        data = request.get_json()
        if not data or "permission_id" not in data:
            return jsonify(
                {"status": "error", "message": "permission_id is required"}
            ), 400

        permission_id = data["permission_id"]

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            perm_row = fetch_permission(cursor, permission_id)
            if not perm_row:
                return jsonify(
                    {"status": "error", "message": "Permission not found"}
                ), 404

            if not can_attach_permission(current_user, perm_row):
                return jsonify(
                    {
                        "status": "error",
                        "message": "Not allowed to assign this permission",
                    }
                ), 403

        if assign_permission_to_user(user_id, permission_id):
            return jsonify(
                {"status": "success", "message": "Permission assigned to user"}
            ), 200

        return jsonify(
            {"status": "error", "message": "Failed to assign permission"}
        ), 500

    except psycopg2.IntegrityError:
        return jsonify(
            {
                "status": "error",
                "message": "User or permission not found, or assignment already exists",
            }
        ), 404
    except Exception as e:
        logger.error(f"Assign permission to user error: {e}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500


@app.route("/auth/users/<user_id>/permissions/<permission_id>", methods=["DELETE"])
@require_permission(["user:manage", "*"])
def remove_permission_from_user_endpoint(user_id, permission_id):
    """
    Remove a direct permission from a user.

    - High-priv: boleh hapus permission apa pun.
    - rbac:custom-manage: hanya boleh hapus permission non-hidden/non-protected.
    """
    try:
        current_user = request.current_user

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            perm_row = fetch_permission(cursor, permission_id)
            if not perm_row:
                return jsonify(
                    {"status": "error", "message": "Permission not found"}
                ), 404

            if not can_attach_permission(current_user, perm_row):
                return jsonify(
                    {
                        "status": "error",
                        "message": "Not allowed to modify this permission",
                    }
                ), 403

        if remove_permission_from_user(user_id, permission_id):
            return jsonify(
                {"status": "success", "message": "Permission removed from user"}
            ), 200

        return jsonify(
            {"status": "error", "message": "Failed to remove permission"}
        ), 500

    except Exception as e:
        logger.error(f"Remove permission from user error: {e}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500


@app.route("/auth/audit/logs", methods=["GET"])
@require_auth
def get_auth_audit_logs():
    """
    List authentication audit logs (auth_audit_log).

    Security:
    - Only for high-privileged operators:
        - SUPERADMIN / DEVELOPER / '*' / 'rbac:manage'
        - or permission 'system:logs'
    - Non-authorized users receive 403.

    Query params:
        page: int (default 1)
        limit: int (default 50, max 200)
        username: filter by username (ILIKE)
        action: filter by action (exact)
        success: true/false
        ip: filter by ip_address (ILIKE)
        ua: filter by user_agent (ILIKE)
        date_from: ISO/date string, filter created_at >=
        date_to: ISO/date string, filter created_at <=
        sort_by: created_at|username|action|success (default: created_at)
        sort_dir: asc|desc (default: desc)
    """
    try:
        current_user = request.current_user

        # Check privilege
        perms = current_user.get("permissions") or []
        is_high = is_high_priv_user(current_user)
        allowed = is_high or ("system:logs" in perms)
        if not allowed:
            return jsonify(
                {
                    "status": "error",
                    "message": "Insufficient privilege to view auth audit logs",
                }
            ), 403

        # Pagination
        try:
            page = int(request.args.get("page", 1))
        except ValueError:
            page = 1
        try:
            limit = int(request.args.get("limit", 50))
        except ValueError:
            limit = 50

        if page < 1:
            page = 1
        if limit < 1:
            limit = 50
        if limit > 200:
            limit = 200

        offset = (page - 1) * limit

        # Filters
        username = request.args.get("username", "").strip()
        action = request.args.get("action", "").strip()
        success_param = request.args.get("success", "").strip().lower()
        ip = request.args.get("ip", "").strip()
        ua = request.args.get("ua", "").strip()
        date_from = request.args.get("date_from", "").strip()
        date_to = request.args.get("date_to", "").strip()

        where_clauses = ["1=1"]
        params = []

        if username:
            where_clauses.append("username ILIKE %s")
            params.append(f"%{username}%")

        if action:
            where_clauses.append("action = %s")
            params.append(action)

        if success_param in ("true", "false"):
            where_clauses.append("success = %s")
            params.append(success_param == "true")

        if ip:
            where_clauses.append("ip_address ILIKE %s")
            params.append(f"%{ip}%")

        if ua:
            where_clauses.append("user_agent ILIKE %s")
            params.append(f"%{ua}%")

        # Date range filters
        if date_from:
            try:
                # Accept 'YYYY-MM-DD' or ISO; let DB parse
                where_clauses.append("created_at >= %s")
                params.append(date_from)
            except Exception:
                pass
        if date_to:
            try:
                where_clauses.append("created_at <= %s")
                params.append(date_to)
            except Exception:
                pass

        # Tambahan proteksi: non-high-priv dengan system:logs tidak boleh lihat log milik user high-priv
        # (SUPERADMIN/DEVELOPER/ADMIN_SECURITY).
        if not is_high:
            # Filter berdasarkan user_id yang terkait role high-priv,
            # dan juga hindari username superadmin jika ada log tanpa relasi user_id.
            high_priv_roles_tuple = tuple(HIGH_PRIV_ROLES)
            # Gunakan subquery aman; psycopg2 butuh placeholder per item.
            placeholders = ", ".join(["%s"] * len(high_priv_roles_tuple))
            where_clauses.append(
                f"""(
                    user_id IS NULL
                    OR user_id NOT IN (
                        SELECT id FROM users WHERE UPPER(role) IN ({placeholders})
                    )
                )"""
            )
            params.extend(high_priv_roles_tuple)

            # Tambahan: hindari eksplicit username superadmin pada log tanpa user_id ter-link.
            where_clauses.append("COALESCE(LOWER(username), '') <> 'superadmin'")

        where_sql = " AND ".join(where_clauses)

        # Sorting (restricted whitelist)
        sort_by = request.args.get("sort_by", "created_at")
        sort_dir = request.args.get("sort_dir", "desc").lower()

        allowed_sort_by = {"created_at", "username", "action", "success"}
        if sort_by not in allowed_sort_by:
            sort_by = "created_at"
        if sort_dir not in ("asc", "desc"):
            sort_dir = "desc"

        order_sql = f"ORDER BY {sort_by} {sort_dir.upper()}, id {sort_dir.upper()}"

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Total count
            cursor.execute(
                f"SELECT COUNT(*) AS count FROM auth_audit_log WHERE {where_sql}",
                params,
            )
            total = cursor.fetchone()["count"]

            # Page data
            cursor.execute(
                f"""
                SELECT
                    id,
                    user_id,
                    username,
                    action,
                    success,
                    ip_address,
                    user_agent,
                    details,
                    created_at
                FROM auth_audit_log
                WHERE {where_sql}
                {order_sql}
                LIMIT %s OFFSET %s
                """,
                params + [limit, offset],
            )
            rows = cursor.fetchall()

        # Normalize types
        for r in rows:
            if r.get("id"):
                r["id"] = str(r["id"])
            if r.get("user_id"):
                r["user_id"] = str(r["user_id"])
            if isinstance(r.get("created_at"), datetime):
                r["created_at"] = r["created_at"].isoformat()

        total_pages = (total + limit - 1) // limit if limit else 1

        return jsonify(
            {
                "status": "success",
                "data": rows,
                "pagination": {
                    "page": page,
                    "limit": limit,
                    "total": total,
                    "total_pages": total_pages,
                    "has_next": page < total_pages,
                    "has_prev": page > 1,
                },
            }
        ), 200

    except Exception as e:
        logger.error(f"Get auth audit logs error: {e}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500


@app.route("/auth/cache/clear", methods=["POST"])
@require_high_priv
def clear_cache_endpoint():
    """Clear the permission cache for all users or a specific user.
    Requires admin privileges.
    JSON Body (Optional): { "user_id": "..." }
    """
    data = request.get_json(silent=True) or {}
    user_id = data.get("user_id")

    if user_id:
        clear_user_permission_cache(user_id)
        logger.info(f"Permission cache cleared for user_id: {user_id}")
        return jsonify(
            {"status": "success", "message": f"Cache cleared for user {user_id}"}
        ), 200
    else:
        clear_user_permission_cache()
        logger.info("Full permission cache cleared.")
        return jsonify(
            {"status": "success", "message": "Full permission cache cleared"}
        ), 200


@app.route("/auth/cache/stats", methods=["GET"])
@require_high_priv
def get_cache_stats_endpoint():
    """Get statistics for the permission caches. Requires admin privileges."""
    return jsonify(
        {
            "status": "success",
            "cache_stats": {
                "get_user_permissions": _get_cached_user_permissions.cache_info()._asdict(),
                "check_user_permission": _check_cached_user_permission.cache_info()._asdict(),
            },
        }
    ), 200


# ============= Application Startup =============

if __name__ == "__main__":
    try:
        wait_for_database()
        init_database()
        logger.info("=" * 50)
        logger.info("Authentication Service v2.0 - Ready")
        logger.info("=" * 50)
        app.run(host="0.0.0.0", port=5000, debug=False)
    except Exception as e:
        logger.critical(f"Failed to start auth service: {e}")
        sys.exit(1)
