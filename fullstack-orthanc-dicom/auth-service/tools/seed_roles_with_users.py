"""
Seeder untuk roles dan users default sesuai kebutuhan PACS/RIS.
Jalankan dengan menyesuaikan env koneksi PostgreSQL, contoh:
POSTGRES_HOST=localhost POSTGRES_PORT=5532 POSTGRES_PASSWORD=... python tools/seed_roles_with_users.py
"""
import os
import sys
import logging
from typing import Dict, List, Tuple

import bcrypt
import psycopg2
from psycopg2.extras import RealDictCursor, Json


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)


DB_CONFIG = {
    "host": os.getenv("POSTGRES_HOST", "localhost"),
    "port": int(os.getenv("POSTGRES_PORT", 5532)),
    "database": os.getenv("POSTGRES_DB", "worklist_db"),
    "user": os.getenv("POSTGRES_USER", "dicom"),
    "password": os.getenv("POSTGRES_PASSWORD", "dicom123"),
    "connect_timeout": int(os.getenv("POSTGRES_CONNECT_TIMEOUT", 10)),
    "application_name": "auth_roles_seeder",
}

# Permissions yang dibutuhkan agar sinkron dengan contoh role yang diminta
PERMISSIONS: Dict[str, Tuple[str, str]] = {
    "user:read": ("Read user information", "user"),
    "user:create": ("Create new users", "user"),
    "user:update": ("Update user information", "user"),
    "user:delete": ("Delete users", "user"),
    "user:manage": ("Full user management", "user"),

    "patient:read": ("Read patient information", "patient"),
    "patient:view": ("View patient information (alias read)", "patient"),
    "patient:create": ("Create new patients", "patient"),
    "patient:update": ("Update patient information", "patient"),
    "patient:*": ("Full patient management", "patient"),

    "order:read": ("Read orders", "order"),
    "order:view": ("View orders (alias read)", "order"),
    "order:create": ("Create new orders", "order"),
    "order:update": ("Update orders", "order"),
    "order:delete": ("Delete orders", "order"),
    "order:*": ("Full order management", "order"),

    "worklist:read": ("Read worklist items", "worklist"),
    "worklist:view": ("View worklist items (alias read)", "worklist"),
    "worklist:create": ("Create worklist items", "worklist"),
    "worklist:update": ("Update worklist items", "worklist"),
    "worklist:delete": ("Delete worklist items", "worklist"),
    "worklist:scan": ("Perform scans", "worklist"),
    "worklist:search": ("Search worklist", "worklist"),
    "worklist:*": ("Full worklist management", "worklist"),

    "dicom:*": ("Full DICOM management", "dicom"),
    "equipment:*": ("Full equipment management", "equipment"),
    "appointment:*": ("Full appointment management", "appointment"),

    "system:config": ("System configuration", "system"),
    "system:logs": ("View system logs", "system"),
    "setting:read": ("Read application settings", "system"),
    "setting:write": ("Update application settings", "system"),
    "setting:dev": ("Manage sensitive developer-only settings", "system"),
    "rbac:view": ("View RBAC configuration", "system"),
    "rbac:manage": ("Manage RBAC (high privilege)", "system"),
    "rbac:custom-manage": ("Manage custom (non-reserved) roles/permissions", "system"),

    "modality:view": ("View modalities", "modality"),
    "modality:manage": ("Manage modalities", "modality"),
    "node:view": ("View PACS nodes", "node"),
    "node:manage": ("Manage PACS nodes", "node"),
    "storage:manage": ("Manage PACS storage and retention", "storage"),
    "audit:view": ("View audit logs", "audit"),

    "procedure:read": ("Read procedures", "procedure"),
    "procedure:create": ("Create procedures", "procedure"),
    "procedure:update": ("Update procedures", "procedure"),
    "procedure:delete": ("Delete procedures", "procedure"),
    "procedure:*": ("Full procedure management", "procedure"),

    "mapping:read": ("Read procedure mappings", "mapping"),
    "mapping:create": ("Create procedure mappings", "mapping"),
    "mapping:update": ("Update procedure mappings", "mapping"),
    "mapping:delete": ("Delete procedure mappings", "mapping"),
    "mapping:*": ("Full mapping management", "mapping"),

    "external_system:read": ("View external systems", "integration"),
    "report:read": ("View reports", "report"),
    "report:view": ("View reports (alias read)", "report"),
    "report:create": ("Create reports", "report"),
    "report:update": ("Update reports", "report"),

    "study:read": ("View studies", "study"),
    "study:view": ("View studies (alias read)", "study"),
    "study:upload": ("Upload DICOM studies", "study"),
    "studies:upload": ("Upload DICOM studies (legacy alias)", "study"),
    "study:*": ("Full study management", "study"),

    "intake:view": ("View intake records", "intake"),
    "*": ("All permissions", "system"),
}

# Role definitions mengikuti contoh yang diberikan
ROLE_DEFINITIONS: Dict[str, Dict[str, List[str]]] = {
    "SUPERADMIN": {
        "description": "Akses penuh ke seluruh sistem termasuk tools developer dan konfigurasi sensitif.",
        "permissions": ["*"],
    },
    "ADMIN": {
        "description": "Administrator operasional. Mengelola user, master data, dan konfigurasi sistem umum.",
        "permissions": [
            "user:manage", "user:read",
            "modality:manage", "modality:view",
            "node:manage", "node:view",
            "procedure:*",
            "mapping:*",
            "storage:manage",
            "audit:view",
            "external_system:read",
            "setting:write", "setting:read",
            "report:view", "report:read",
            "order:view", "order:read",
            "study:view", "study:read",
            "patient:view", "patient:read",
            "worklist:view", "worklist:read"
        ],
    },
    "RADIOLOGIST": {
        "description": "Dokter Radiologi. Membaca citra (studies) dan membuat expertise/report.",
        "permissions": [
            "study:view", "study:read", "study:*",
            "report:view", "report:read", "report:create", "report:update",
            "order:view", "order:read",
            "patient:view", "patient:read",
            "worklist:view", "worklist:read",
        ],
    },
    "TECHNOLOGIST": {
        "description": "Radiografer. Melakukan pemeriksaan, upload DICOM, dan update status order.",
        "permissions": [
            "worklist:view", "worklist:read",
            "order:view", "order:read", "order:update",
            "intake:view",
            "study:view", "study:read", "study:upload", "studies:upload",
            "patient:view", "patient:read",
            "modality:view",
        ],
    },
    "CLERK": {
        "description": "Pendaftaran/Resepsionis. Mendaftarkan pasien dan membuat order pemeriksaan.",
        "permissions": [
            "patient:create", "patient:view", "patient:read", "patient:update",
            "order:create", "order:view", "order:read", "order:update",
            "intake:view",
            "worklist:view", "worklist:read",
        ],
    },
    "REFERRING_PHYSICIAN": {
        "description": "Dokter Pengirim. Hanya bisa melihat hasil pemeriksaan pasiennya.",
        "permissions": [
            "study:view", "study:read",
            "report:view", "report:read",
            "order:view", "order:read",
            "patient:view", "patient:read",
        ],
    },
}

# User seeds (username dan password diminta eksplisit)
USER_SEEDS = [
    {
        "username": "superadmin",
        "email": "superadmin@hospital.local",
        "full_name": "Platform Superadmin",
        "password": os.getenv("SEED_SUPERADMIN_PASSWORD", "SuperAdmin@12345"),
        "role": "SUPERADMIN",
    },
    {
        "username": "admin",
        "email": "admin@hospital.local",
        "full_name": "Operational Admin",
        "password": os.getenv("SEED_ADMIN_PASSWORD", "Admin@12345"),
        "role": "ADMIN",
    },
    {
        "username": "radiologist",
        "email": "radiologist@hospital.local",
        "full_name": "Default Radiologist",
        "password": os.getenv("SEED_RADIOLOGIST_PASSWORD", "Radiologist@12345"),
        "role": "RADIOLOGIST",
    },
    {
        "username": "technologist",
        "email": "technologist@hospital.local",
        "full_name": "Default Technologist",
        "password": os.getenv("SEED_TECHNOLOGIST_PASSWORD", "Technologist@12345"),
        "role": "TECHNOLOGIST",
    },
    {
        "username": "clerk",
        "email": "clerk@hospital.local",
        "full_name": "Default Clerk",
        "password": os.getenv("SEED_CLERK_PASSWORD", "Clerk@12345"),
        "role": "CLERK",
    },
    {
        "username": "referring_physician",
        "email": "referring.physician@hospital.local",
        "full_name": "Default Referring Physician",
        "password": os.getenv("SEED_REFERRING_PASSWORD", "Referring@12345"),
        "role": "REFERRING_PHYSICIAN",
    },
]


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def ensure_permissions(cursor) -> None:
    for name, meta in PERMISSIONS.items():
        cursor.execute(
            """
            INSERT INTO permissions (name, description, category)
            VALUES (%s, %s, %s)
            ON CONFLICT (name) DO UPDATE
            SET description = EXCLUDED.description,
                category = EXCLUDED.category
            """,
            (name, meta[0], meta[1]),
        )


def ensure_roles(cursor) -> Dict[str, str]:
    role_ids: Dict[str, str] = {}
    for role_name, role_info in ROLE_DEFINITIONS.items():
        cursor.execute(
            """
            INSERT INTO roles (name, description)
            VALUES (%s, %s)
            ON CONFLICT (name) DO UPDATE
            SET description = EXCLUDED.description
            RETURNING id
            """,
            (role_name, role_info["description"]),
        )
        role_ids[role_name] = cursor.fetchone()[0]
    return role_ids


def ensure_role_permissions(cursor, role_ids: Dict[str, str]) -> None:
    for role_name, role_info in ROLE_DEFINITIONS.items():
        role_id = role_ids[role_name]
        for perm in role_info["permissions"]:
            cursor.execute("SELECT id FROM permissions WHERE name = %s", (perm,))
            perm_row = cursor.fetchone()
            if not perm_row:
                logger.warning("Permission %s belum ada, dilewati untuk role %s", perm, role_name)
                continue
            cursor.execute(
                """
                INSERT INTO role_permissions (role_id, permission_id)
                VALUES (%s, %s)
                ON CONFLICT (role_id, permission_id) DO NOTHING
                """,
                (role_id, perm_row[0]),
            )


def ensure_user(cursor, user_seed: dict, role_ids: Dict[str, str]) -> str:
    """Insert/update user, set role column, dan mapping user_roles."""
    password_hash = hash_password(user_seed["password"])
    cursor.execute(
        "SELECT id FROM users WHERE username = %s",
        (user_seed["username"],),
    )
    existing = cursor.fetchone()

    if existing:
        cursor.execute(
            """
            UPDATE users
            SET email = %s,
                full_name = %s,
                password_hash = %s,
                role = %s,
                role_id = %s,
                is_active = TRUE,
                is_verified = TRUE,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
            RETURNING id
            """,
            (
                user_seed["email"],
                user_seed["full_name"],
                password_hash,
                user_seed["role"],
                role_ids[user_seed["role"]],
                existing[0],
            ),
        )
        user_id = cursor.fetchone()[0]
        logger.info("Updated user %s dengan role %s", user_seed["username"], user_seed["role"])
    else:
        cursor.execute(
            """
            INSERT INTO users (username, email, password_hash, full_name, role, role_id, is_active, is_verified, details)
            VALUES (%s, %s, %s, %s, %s, %s, TRUE, TRUE, %s)
            RETURNING id
            """,
            (
                user_seed["username"],
                user_seed["email"],
                password_hash,
                user_seed["full_name"],
                user_seed["role"],
                role_ids[user_seed["role"]],
                Json({"seeded_by": "seed_roles_with_users.py"}),
            ),
        )
        user_id = cursor.fetchone()[0]
        logger.info("Created user %s dengan role %s", user_seed["username"], user_seed["role"])

    cursor.execute(
        """
        INSERT INTO user_roles (user_id, role_id)
        VALUES (%s, %s)
        ON CONFLICT (user_id, role_id) DO NOTHING
        """,
        (user_id, role_ids[user_seed["role"]]),
    )
    return str(user_id)


def main():
    logger.info("Starting seeder with DB host=%s port=%s db=%s", DB_CONFIG["host"], DB_CONFIG["port"], DB_CONFIG["database"])
    with psycopg2.connect(**DB_CONFIG) as conn:
        with conn.cursor() as cursor:
            cursor.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

            ensure_permissions(cursor)
            role_ids = ensure_roles(cursor)
            ensure_role_permissions(cursor, role_ids)

            seeded_users = []
            for user_seed in USER_SEEDS:
                if user_seed["role"] not in role_ids:
                    logger.warning("Role %s belum dibuat, user %s dilewati", user_seed["role"], user_seed["username"])
                    continue
                user_id = ensure_user(cursor, user_seed, role_ids)
                seeded_users.append({"username": user_seed["username"], "role": user_seed["role"], "id": user_id})

            conn.commit()

        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """
                SELECT u.username, u.email, u.role, r.name as role_name, r.description
                FROM users u
                LEFT JOIN user_roles ur ON u.id = ur.user_id
                LEFT JOIN roles r ON ur.role_id = r.id
                WHERE u.username = ANY(%s)
                ORDER BY u.username
                """,
                ([u["username"] for u in USER_SEEDS],),
            )
            summary = cursor.fetchall()

    logger.info("Seeder selesai. Users tersimpan: %s", seeded_users)
    logger.info("Ringkasan user-role:")
    for row in summary:
        logger.info(
            " - %s (%s) => role=%s | desc=%s",
            row["username"],
            row["email"],
            row["role_name"] or row["role"],
            row["description"],
        )


if __name__ == "__main__":
    main()
