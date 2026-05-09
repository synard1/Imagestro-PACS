#!/usr/bin/env python3
"""
Script to apply the enhanced SATUSEHAT DICOM monitoring schema to the PostgreSQL database.
This script can be run independently or integrated into existing services.
"""

import os
import sys
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
import logging
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stdout
)
logger = logging.getLogger(__name__)

# Database configuration - matching existing services
DB_HOST = 'postgres'
DB_PORT = 5432
DB_PASSWORD = 'orthanc123'

# If not running inside a Docker container, assume running on the host
# and connecting to a mapped port from docker-compose.yml.
if not os.path.exists('/.dockerenv'):
    DB_HOST = 'localhost'
    DB_PORT = 5532

DB_CONFIG = {
    'host': os.getenv('POSTGRES_HOST', DB_HOST),
    'database': os.getenv('POSTGRES_DB', 'orthanc'),
    'user': os.getenv('POSTGRES_USER', 'orthanc'),
    'password': os.getenv('POSTGRES_PASSWORD', DB_PASSWORD),
    'port': int(os.getenv('POSTGRES_PORT', DB_PORT))
}

def _int_env(name, default):
    """Safely parse integer environment variables with fallback."""
    try:
        return int(os.getenv(name, default))
    except (TypeError, ValueError):
        return default

ORDER_NUMBER_PREFIX = os.getenv('ORDER_NUMBER_PREFIX', 'ORD')
ORDER_NUMBER_PAD_LENGTH = _int_env('ORDER_NUMBER_PAD_LENGTH', 5)
ACCESSION_BACKFILL_PREFIX = os.getenv('ACCESSION_BACKFILL_PREFIX', 'ACC')
ACCESSION_BACKFILL_PAD_LENGTH = _int_env('ACCESSION_BACKFILL_PAD_LENGTH', 6)

def get_db_connection():
    """Create and return a database connection"""
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        return conn
    except Exception as e:
        logger.error(f"Failed to connect to database: {str(e)}")
        raise

def align_orders_table(cursor):
    """Ensure the orders table matches the unified schema expected by order-management service."""
    logger.info("Aligning orders table schema...")

    cursor.execute("DROP VIEW IF EXISTS v_ready_for_imaging_study CASCADE")
    cursor.execute("DROP VIEW IF EXISTS v_orders_missing_prereq CASCADE")
    cursor.execute("DROP VIEW IF EXISTS v_order_prereq_status CASCADE")

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS orders (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            org_id UUID NOT NULL REFERENCES satusehat_orgs(id) ON DELETE CASCADE,
            patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
            order_number VARCHAR(50) UNIQUE NOT NULL,
            accession_number VARCHAR(50) UNIQUE,
            modality VARCHAR(10),
            procedure_code VARCHAR(50),
            procedure_name VARCHAR(200),
            scheduled_at TIMESTAMPTZ,
            patient_national_id VARCHAR(16),
            patient_name VARCHAR(200),
            gender VARCHAR(10),
            birth_date DATE,
            medical_record_number VARCHAR(50),
            satusehat_ihs_number VARCHAR(64),
            registration_number VARCHAR(50),
            status VARCHAR(20) DEFAULT 'CREATED',
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now(),
            details JSONB NOT NULL DEFAULT jsonb_build_object(
                'created', jsonb_build_object('by', NULL, 'at', now()),
                'updated', NULL,
                'deleted', NULL
            )
        )
    """)

    cursor.execute("""
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'orders' AND column_name = 'order_number'
    """)
    if cursor.fetchone() is None:
        cursor.execute("ALTER TABLE orders ADD COLUMN order_number VARCHAR(50)")

    cursor.execute("""
        WITH ranked AS (
            SELECT
                id,
                COALESCE(created_at, CURRENT_TIMESTAMP) AS created_ts,
                ROW_NUMBER() OVER (
                    ORDER BY COALESCE(created_at, CURRENT_TIMESTAMP), id::text
                ) AS rn
            FROM orders
            WHERE order_number IS NULL OR order_number = ''
        )
        UPDATE orders o
        SET order_number = CONCAT(
            %s,
            TO_CHAR(r.created_ts, 'YYYYMMDD'),
            LPAD(r.rn::text, %s, '0')
        )
        FROM ranked r
        WHERE o.id = r.id
    """, (ORDER_NUMBER_PREFIX, ORDER_NUMBER_PAD_LENGTH))

    cursor.execute("SELECT COUNT(*) FROM orders WHERE order_number IS NULL OR order_number = ''")
    if cursor.fetchone()[0] == 0:
        cursor.execute("ALTER TABLE orders ALTER COLUMN order_number SET NOT NULL")
    else:
        logger.warning("Detected orders without order_number; NOT NULL enforcement skipped.")

    cursor.execute("""
        SELECT COUNT(*) FROM (
            SELECT order_number
            FROM orders
            WHERE order_number IS NOT NULL AND order_number <> ''
            GROUP BY order_number
            HAVING COUNT(*) > 1
        ) duplicates
    """)
    if cursor.fetchone()[0] == 0:
        cursor.execute("""
            SELECT 1
            FROM pg_constraint
            WHERE conrelid = 'orders'::regclass
              AND contype = 'u'
              AND conname = 'orders_order_number_key'
        """)
        if cursor.fetchone() is None:
            cursor.execute("ALTER TABLE orders ADD CONSTRAINT orders_order_number_key UNIQUE (order_number)")
    else:
        logger.warning("order_number duplicates found; unique constraint not applied.")

    cursor.execute("""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'orders' AND column_name = 'ihs_number'
            ) THEN
                BEGIN
                    ALTER TABLE orders RENAME COLUMN ihs_number TO satusehat_ihs_number;
                EXCEPTION WHEN duplicate_column THEN
                    NULL;
                END;
            END IF;

            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'orders' AND column_name = 'requesting_physician'
            ) AND NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'orders' AND column_name = 'ordering_physician_name'
            ) THEN
                ALTER TABLE orders RENAME COLUMN requesting_physician TO ordering_physician_name;
            END IF;

            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'orders' AND column_name = 'patient_nik'
            ) AND NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'orders' AND column_name = 'patient_national_id'
            ) THEN
                ALTER TABLE orders RENAME COLUMN patient_nik TO patient_national_id;
            ELSIF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'orders' AND column_name = 'patient_nik'
            ) AND EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'orders' AND column_name = 'patient_national_id'
            ) THEN
                UPDATE orders
                         SET patient_national_id = COALESCE(patient_national_id, patient_nik)
                         WHERE patient_national_id IS NULL AND patient_nik IS NOT NULL;
            END IF;

            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'orders' AND column_name = 'accession_no'
            ) AND NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'orders' AND column_name = 'accession_number'
            ) THEN
                ALTER TABLE orders RENAME COLUMN accession_no TO accession_number;
            END IF;

            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'orders' AND column_name = 'requested_procedure'
            ) AND NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'orders' AND column_name = 'procedure_name'
            ) THEN
                ALTER TABLE orders RENAME COLUMN requested_procedure TO procedure_name;
            END IF;

            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'orders' AND column_name = 'station_ae_title'
            ) AND NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'orders' AND column_name = 'ordering_station_aet'
            ) THEN
                ALTER TABLE orders RENAME COLUMN station_ae_title TO ordering_station_aet;
            END IF;

            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'orders' AND column_name = 'satusehat_patient_id'
            ) THEN
                BEGIN
                    ALTER TABLE orders RENAME COLUMN satusehat_patient_id TO satusehat_ihs_number;
                EXCEPTION WHEN duplicate_column THEN
                    UPDATE orders
                             SET satusehat_ihs_number = COALESCE(satusehat_ihs_number, satusehat_patient_id);
                    ALTER TABLE orders DROP COLUMN satusehat_patient_id;
                END;
            END IF;
        END
        $$;
    """)

    required_columns = [
        ("org_id", "VARCHAR(50)"),
        ("accession_number", "VARCHAR(50)"),
        ("modality", "VARCHAR(10)"),
        ("procedure_code", "VARCHAR(50)"),
        ("procedure_name", "VARCHAR(200)"),
        ("procedure_description", "TEXT"),
        ("scheduled_at", "TIMESTAMPTZ"),
        ("patient_national_id", "VARCHAR(16)"),
        ("patient_name", "VARCHAR(200)"),
        ("gender", "VARCHAR(10)"),
        ("birth_date", "DATE"),
        ("patient_phone", "VARCHAR(20)"),
        ("patient_address", "TEXT"),
        ("medical_record_number", "VARCHAR(50)"),
        ("satusehat_ihs_number", "VARCHAR(64)"),
        ("registration_number", "VARCHAR(50)"),
        ("status", "VARCHAR(20) DEFAULT 'CREATED'"),
        ("order_status", "VARCHAR(50) DEFAULT 'CREATED'"),
        ("worklist_status", "VARCHAR(50)"),
        ("imaging_status", "VARCHAR(50)"),
        ("clinical_indication", "TEXT"),
        ("clinical_notes", "TEXT"),
        ("ordering_physician_name", "VARCHAR(200)"),
        ("performing_physician_name", "VARCHAR(200)"),
        ("ordering_station_aet", "VARCHAR(64)"),
        ("satusehat_encounter_id", "VARCHAR(100)"),
        ("satusehat_service_request_id", "VARCHAR(100)"),
        ("satusehat_synced", "BOOLEAN DEFAULT FALSE"),
        ("satusehat_sync_date", "TIMESTAMPTZ"),
        ("created_at", "TIMESTAMPTZ DEFAULT now()"),
        ("updated_at", "TIMESTAMPTZ DEFAULT now()"),
        ("details", "JSONB NOT NULL DEFAULT jsonb_build_object('created', jsonb_build_object('by', NULL, 'at', now()), 'updated', NULL, 'deleted', NULL)")
    ]
    for column_name, definition in required_columns:
        cursor.execute(f"ALTER TABLE orders ADD COLUMN IF NOT EXISTS {column_name} {definition}")

    cursor.execute("""
        SELECT is_nullable
        FROM information_schema.columns
        WHERE table_name = 'orders' AND column_name = 'ordering_station_aet'
    """)
    nullable_row = cursor.fetchone()
    if nullable_row and str(nullable_row[0]).strip().lower() == 'no':
        try:
            cursor.execute("ALTER TABLE orders ALTER COLUMN ordering_station_aet DROP NOT NULL")
            logger.info("Relaxed orders.ordering_station_aet constraint to allow NULL values.")
        except Exception as ordering_aet_err:
            logger.warning(f"Unable to relax orders.ordering_station_aet nullability: {ordering_aet_err}")

    cursor.execute("ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'CREATED'")
    cursor.execute("ALTER TABLE orders ALTER COLUMN order_status SET DEFAULT 'CREATED'")
    cursor.execute("ALTER TABLE orders ALTER COLUMN created_at SET DEFAULT now()")
    cursor.execute("ALTER TABLE orders ALTER COLUMN updated_at SET DEFAULT now()")

    cursor.execute("""
        UPDATE orders
        SET status = 'CREATED'
        WHERE status IS NULL
    """)
    cursor.execute("""
        UPDATE orders
        SET order_status = COALESCE(order_status, status, 'CREATED')
        WHERE order_status IS NULL
    """)
    cursor.execute("""
        UPDATE orders
        SET created_at = COALESCE(created_at, now()),
            updated_at = COALESCE(updated_at, created_at)
    """)

    cursor.execute("""
        ALTER TABLE orders
        ALTER COLUMN details SET DEFAULT jsonb_build_object(
            'created', jsonb_build_object('by', NULL, 'at', now()),
            'updated', NULL,
            'deleted', NULL
        )
    """)
    cursor.execute("""
        UPDATE orders
        SET details = jsonb_build_object(
            'created', jsonb_build_object(
                'by', COALESCE((details -> 'created' ->> 'by')::text, NULL),
                'at', COALESCE((details -> 'created' ->> 'at')::timestamptz, created_at)
            ),
            'updated', details -> 'updated',
            'deleted', details -> 'deleted'
        )
        WHERE details IS NULL
    """)

    cursor.execute("""
        UPDATE orders
        SET satusehat_synced = COALESCE(satusehat_synced, FALSE)
    """)

    cursor.execute("""
        WITH ranked AS (
            SELECT
                id,
                COALESCE(created_at, CURRENT_TIMESTAMP) AS created_ts,
                ROW_NUMBER() OVER (
                    ORDER BY COALESCE(created_at, CURRENT_TIMESTAMP), id::text
                ) AS rn
            FROM orders
            WHERE accession_number IS NULL OR accession_number = ''
        )
        UPDATE orders o
        SET accession_number = CONCAT(
            %s,
            TO_CHAR(r.created_ts, 'YYYYMMDD'),
            LPAD(r.rn::text, %s, '0')
        )
        FROM ranked r
        WHERE o.id = r.id
    """, (ACCESSION_BACKFILL_PREFIX, ACCESSION_BACKFILL_PAD_LENGTH))

    cursor.execute("""
        SELECT COUNT(*) FROM (
            SELECT accession_number
            FROM orders
            WHERE accession_number IS NOT NULL AND accession_number <> ''
            GROUP BY accession_number
            HAVING COUNT(*) > 1
        ) duplicates
    """)
    if cursor.fetchone()[0] == 0:
        cursor.execute("""
            SELECT 1
            FROM pg_constraint
            WHERE conrelid = 'orders'::regclass
              AND contype = 'u'
              AND conname = 'orders_accession_number_key'
        """)
        if cursor.fetchone() is None:
            cursor.execute("ALTER TABLE orders ADD CONSTRAINT orders_accession_number_key UNIQUE (accession_number)")
    else:
        logger.warning("accession_number duplicates found; unique constraint not applied.")

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_orders_patient_national_id ON orders(patient_national_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_orders_registration_number ON orders(registration_number)")

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS order_counters (
            scope VARCHAR(20) NOT NULL,
            period_key VARCHAR(8) NOT NULL,
            counter INTEGER NOT NULL DEFAULT 0,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (scope, period_key)
        )
    """)

def apply_schema():
    """Apply the enhanced SATUSEHAT DICOM monitoring schema"""
    logger.info("Starting schema application...")
    
    # Initialize conn to None to avoid unbound variable errors
    conn = None
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Enable required extensions
        cursor.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
        cursor.execute('CREATE EXTENSION IF NOT EXISTS pgcrypto')
        
        # =========================
        # Guarded ENUM creations
        # =========================
        logger.info("Creating ENUM types...")
        
        enum_creations = [
            """
            DO $$ BEGIN
              IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dicom_node_role') THEN
                CREATE TYPE dicom_node_role AS ENUM ('MODALITY','PACS','ROUTER','CONSUMER');
              END IF;
            END $$;
            """,
            """
            DO $$ BEGIN
              IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tx_status') THEN
                CREATE TYPE tx_status AS ENUM('pending','sending','sent','failed','cancelled','retrying');
              END IF;
            END $$;
            """,
            """
            DO $$ BEGIN
              IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'queue_priority') THEN
                CREATE TYPE queue_priority AS ENUM('low','normal','high');
              END IF;
            END $$;
            """,
            """
            DO $$ BEGIN
              IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'queue_state') THEN
                CREATE TYPE queue_state AS ENUM('queued','processing','completed','failed');
              END IF;
            END $$;
            """,
            """
            DO $$ BEGIN
              IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'health_status') THEN
                CREATE TYPE health_status AS ENUM('ok','warning','error');
              END IF;
            END $$;
            """,
            """
            DO $$ BEGIN
              IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sr_state') THEN
                CREATE TYPE sr_state AS ENUM('created','sent','failed');
              END IF;
            END $$;
            """,
            """
            DO $$ BEGIN
              IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'is_state') THEN
                CREATE TYPE is_state AS ENUM('created','sent','failed');
              END IF;
            END $$;
            """,
            """
            DO $$ BEGIN
              IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pipeline_status') THEN
                CREATE TYPE pipeline_status AS ENUM (
                  'RECEIVED','PARSED','VALIDATED',
                  'NIDR_PENDING','NIDR_UPLOADING','NIDR_UPLOADED','NIDR_FAILED',
                  'FHIR_PENDING','FHIR_POSTING','FHIR_POSTED','FHIR_FAILED',
                  'COMPLETED','QUARANTINED','CANCELLED'
                );
              END IF;
            END $$;
            """,
            """
            DO $$ BEGIN
              IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'object_provider') THEN
                CREATE TYPE object_provider AS ENUM ('S3','MINIO');
              END IF;
            END $$;
            """,
            """
            DO $$ BEGIN
              IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'backup_kind') THEN
                CREATE TYPE backup_kind AS ENUM ('pg_dump','basebackup','wal_archive');
              END IF;
            END $$;
            """,
            """
            DO $$ BEGIN
              IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'job_state') THEN
                CREATE TYPE job_state AS ENUM ('QUEUED','RUNNING','SUCCESS','FAILED');
              END IF;
            END $$;
            """
        ]
        
        for enum_sql in enum_creations:
            cursor.execute(enum_sql)
        
        # =========================
        # 1) Master & Config
        # =========================
        logger.info("Creating master and config tables...")
        
        cursor.execute("""
            DO $$
            BEGIN
              IF EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' AND table_name = 'orgs'
              ) AND NOT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'satusehat_orgs'
              ) THEN
                ALTER TABLE orgs RENAME TO satusehat_orgs;
                RAISE NOTICE 'Table "orgs" renamed to "satusehat_orgs"';
              END IF;
            END$$;
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS satusehat_orgs (
              id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              satusehat_org_id   text NOT NULL UNIQUE,
              name               text NOT NULL,
              created_at         timestamptz NOT NULL DEFAULT now()
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS dicom_nodes (
              id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              org_id             uuid NOT NULL REFERENCES satusehat_orgs(id) ON DELETE CASCADE,
              role               dicom_node_role NOT NULL,
              ae_title           text NOT NULL,
              host               text NOT NULL,
              port               integer NOT NULL CHECK (port BETWEEN 1 AND 65535),
              institution_name   text,
              active             boolean NOT NULL DEFAULT true,
              extra              jsonb NOT NULL DEFAULT '{}'::jsonb,
              UNIQUE (org_id, ae_title),
              created_at         timestamptz NOT NULL DEFAULT now()
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS api_credentials (
              id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              org_id             uuid NOT NULL REFERENCES satusehat_orgs(id) ON DELETE CASCADE,
              client_id          text NOT NULL,
              client_secret_ref  text NOT NULL,
              scopes             text[] NOT NULL DEFAULT '{}',
              created_at         timestamptz NOT NULL DEFAULT now()
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS api_tokens (
              id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              org_id             uuid NOT NULL REFERENCES satusehat_orgs(id) ON DELETE CASCADE,
              access_token_ref   text NOT NULL,
              expires_at         timestamptz NOT NULL,
              obtained_at        timestamptz NOT NULL DEFAULT now(),
              source_cred_id     uuid REFERENCES api_credentials(id),
              meta               jsonb NOT NULL DEFAULT '{}'::jsonb
            )
        """)
        
        # =========================
        # 2) Business Core
        # =========================
        logger.info("Creating business core tables...")
        
        align_orders_table(cursor)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS files (
                file_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                filename text NOT NULL,
                file_type text NOT NULL,
                file_size bigint NOT NULL,
                category text NOT NULL DEFAULT 'exam_result',
                description text,
                uploaded_at timestamptz NOT NULL DEFAULT now(),
                uploaded_by text,
                storage_path text
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS dicom_metadata (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                file_id uuid NOT NULL REFERENCES files(file_id) ON DELETE CASCADE,
                sop_class_uid text,
                sop_instance_uid text,
                study_instance_uid text,
                series_instance_uid text,
                patient_id text,
                patient_name text,
                study_date date,
                study_time time with time zone,
                modality text,
                study_description text,
                series_description text,
                accession_number text,
                extracted_at timestamptz NOT NULL DEFAULT now()
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS satusehat_transmission_log (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                file_id uuid NOT NULL REFERENCES files(file_id) ON DELETE CASCADE,
                order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                status tx_status NOT NULL,
                patient_ihs text,
                accession_number text,
                modality text,
                station_ae text,
                service_request text,
                attempt_number int NOT NULL DEFAULT 1,
                response_details jsonb,
                error_message text,
                created_at timestamptz NOT NULL DEFAULT now(),
                updated_at timestamptz NOT NULL DEFAULT now()
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS transmission_queue (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                file_id uuid NOT NULL REFERENCES files(file_id) ON DELETE CASCADE,
                order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                priority queue_priority NOT NULL DEFAULT 'normal',
                status queue_state NOT NULL,
                scheduled_at timestamptz,
                attempts int NOT NULL DEFAULT 0,
                last_attempt_at timestamptz,
                next_retry_at timestamptz,
                error_message text,
                created_at timestamptz NOT NULL DEFAULT now(),
                updated_at timestamptz NOT NULL DEFAULT now()
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS system_health_log (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                status health_status NOT NULL,
                component text NOT NULL,
                message text,
                details jsonb,
                checked_at timestamptz NOT NULL DEFAULT now()
            )
        """)
        
        # =========================
        # 3) FHIR: ServiceRequest + ImagingStudy (base) + Encounter (new)
        # =========================
        logger.info("Creating FHIR tables...")
        
        cursor.execute("""
            DO $$
            BEGIN
              IF EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'service_requests'
              ) THEN
                IF EXISTS (
                  SELECT FROM information_schema.tables
                  WHERE table_schema = 'public' AND table_name = 'satusehat_service_requests'
                ) THEN
                  RAISE WARNING 'Both "service_requests" and "satusehat_service_requests" tables exist. Dropping "service_requests" table.';
                  DROP TABLE service_requests;
                ELSE
                  ALTER TABLE service_requests RENAME TO satusehat_service_requests;
                  RAISE NOTICE 'Table "service_requests" renamed to "satusehat_service_requests"';
                END IF;
              END IF;
            END$$;
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS satusehat_service_requests (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                service_request_id text,
                status sr_state NOT NULL,
                request_payload jsonb,
                response jsonb,
                created_at timestamptz NOT NULL DEFAULT now(),
                created_by uuid REFERENCES users(id) ON DELETE SET NULL,
                updated_at timestamptz NOT NULL DEFAULT now(),
                updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
                deleted_at timestamptz,
                deleted_by uuid REFERENCES users(id) ON DELETE SET NULL,

                -- Enhanced ServiceRequest fields for complete FHIR alignment
                sr_identifier_system text,
                sr_identifier_value  text,
                subject_ref_type     text,
                subject_ref_id       text,
                encounter_ref_id     text,
                requester_ref_id     text,
                intent               text,
                priority             text,
                category_codings     jsonb,
                code_codings         jsonb,
                body_site_codings    jsonb,
                reason_codings       jsonb,
                occurrence_start     timestamptz,
                occurrence_end       timestamptz,
                
                -- Additional FHIR ServiceRequest fields
                based_on_refs        jsonb,  -- References to orders or proposals
                replaces_refs        jsonb,  -- References to previous requests
                requisition_system   text,   -- Identifier system for requisition
                requisition_value    text,   -- Identifier value for requisition
                authored_on          timestamptz,  -- When request was authored
                performer_type_coding jsonb,  -- Type of performer
                location_refs        jsonb,  -- Requested locations
                reason_reference_refs jsonb,  -- References to conditions or observations
                insurance_refs       jsonb,  -- Insurance information references
                supporting_info_refs jsonb,  -- Supporting information references
                specimen_refs        jsonb,  -- Specimen references
                note                 jsonb,  -- Notes related to request
                patient_instruction  text,   -- Patient instructions
                relevant_history_refs jsonb  -- References to relevant history
            )
        """)
        
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_sr_order         ON satusehat_service_requests(order_id);
            CREATE INDEX IF NOT EXISTS idx_sr_id            ON satusehat_service_requests(service_request_id);
            CREATE INDEX IF NOT EXISTS idx_sr_identifier    ON satusehat_service_requests(sr_identifier_value);
            CREATE INDEX IF NOT EXISTS idx_sr_enc_ref       ON satusehat_service_requests(encounter_ref_id);
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS satusehat_imaging_studies (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                file_id uuid NOT NULL REFERENCES files(file_id) ON DELETE CASCADE,
                imaging_study_id text,
                status is_state NOT NULL,
                request_payload jsonb,
                response jsonb,
                wado_url text,
                created_at timestamptz NOT NULL DEFAULT now(),
                updated_at timestamptz NOT NULL DEFAULT now(),
                
                -- Enhanced ImagingStudy fields for complete FHIR alignment
                service_request_db_id uuid REFERENCES satusehat_service_requests(id) ON DELETE SET NULL,
                
                -- Additional FHIR ImagingStudy fields
                started timestamptz,
                ended timestamptz,
                series_count integer,
                instance_count integer,
                modality_codings jsonb,
                subject_ref_type text,
                subject_ref_id text,
                encounter_ref_id text,
                based_on_refs jsonb,  -- References to ServiceRequests
                referrer_ref_id text,
                interpreter_ref_id text,
                endpoint_refs jsonb,  -- References to endpoints
                procedure_refs jsonb,  -- References to procedures
                location_ref_id text,
                reason_codings jsonb,
                note jsonb,
                description text
            )
        """)
        
        # =========================
        # 4) DICOM Hierarchy (continued)
        # =========================
        logger.info("Creating DICOM hierarchy tables...")
        
        # Enhanced Patients Table with comprehensive patient information
        cursor.execute("DROP TABLE IF EXISTS patients CASCADE")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS patients (
              -- Core identifiers (existing)
              id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              org_id uuid REFERENCES satusehat_orgs(id) ON DELETE CASCADE,
              patient_id_local text,
              patient_name text,
              birth_date date,
              sex text,
              identifiers jsonb NOT NULL DEFAULT '{}'::jsonb,
              satusehat_patient_id text,
              UNIQUE (org_id, patient_id_local),
              
              -- Extended patient demographics
              patient_national_id VARCHAR(16) UNIQUE,           -- NIK (Nomor Induk Kependudukan)
              medical_record_number VARCHAR(50),               -- MRN (Medical Record Number)
              ihs_number VARCHAR(64) UNIQUE,                   -- IHS (Indeks Halaman Sehat) number
              gender VARCHAR(10) CHECK (gender IN ('male', 'female', 'other', 'unknown')),
              address TEXT,
              phone VARCHAR(20),
              email VARCHAR(100),
              nationality VARCHAR(50),
              ethnicity VARCHAR(50),
              religion VARCHAR(50),
              marital_status VARCHAR(20) CHECK (marital_status IN ('single', 'married', 'divorced', 'widowed')),
              occupation VARCHAR(100),
              education_level VARCHAR(50),
              
              -- Emergency contact
              emergency_contact_name VARCHAR(200),
              emergency_contact_phone VARCHAR(20),
              emergency_contact_relationship VARCHAR(50),
              
              -- Insurance information
              insurance_provider VARCHAR(100),
              insurance_policy_number VARCHAR(100),
              insurance_member_id VARCHAR(100),
              
              -- Status and audit fields
              active BOOLEAN DEFAULT true,
              created_at timestamptz NOT NULL DEFAULT now(),
              updated_at timestamptz NOT NULL DEFAULT now(),
              deleted_at timestamptz
            )
        """)
        
        # Patient related tables
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS patient_allergies (
              id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              patient_id uuid REFERENCES patients(id) ON DELETE CASCADE,
              allergen VARCHAR(200) NOT NULL,
              reaction VARCHAR(200),
              severity VARCHAR(20) CHECK (severity IN ('mild', 'moderate', 'severe')),
              notes TEXT,
              created_at timestamptz NOT NULL DEFAULT now(),
              updated_at timestamptz NOT NULL DEFAULT now()
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS patient_medical_history (
              id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              patient_id uuid REFERENCES patients(id) ON DELETE CASCADE,
              condition VARCHAR(200) NOT NULL,
              diagnosis_date DATE,
              status VARCHAR(20) CHECK (status IN ('active', 'inactive', 'resolved')),
              notes TEXT,
              created_at timestamptz NOT NULL DEFAULT now(),
              updated_at timestamptz NOT NULL DEFAULT now()
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS patient_family_history (
              id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              patient_id uuid REFERENCES patients(id) ON DELETE CASCADE,
              relative_relationship VARCHAR(50),
              condition VARCHAR(200),
              notes TEXT,
              created_at timestamptz NOT NULL DEFAULT now(),
              updated_at timestamptz NOT NULL DEFAULT now()
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS patient_medications (
              id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              patient_id uuid REFERENCES patients(id) ON DELETE CASCADE,
              medication_name VARCHAR(200) NOT NULL,
              dosage VARCHAR(100),
              frequency VARCHAR(100),
              start_date DATE,
              end_date DATE,
              status VARCHAR(20) CHECK (status IN ('active', 'inactive', 'discontinued')),
              notes TEXT,
              created_at timestamptz NOT NULL DEFAULT now(),
              updated_at timestamptz NOT NULL DEFAULT now()
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS patient_audit_log (
              id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              patient_id uuid REFERENCES patients(id) ON DELETE CASCADE,
              action VARCHAR(50) NOT NULL,
              field_name VARCHAR(100),
              old_value TEXT,
              new_value TEXT,
              user_id VARCHAR(100),
              ip_address VARCHAR(45),
              user_agent TEXT,
              created_at timestamptz NOT NULL DEFAULT now()
            )
        """)
        
        # Enhanced Encounters Table for FHIR Encounter resource
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS satusehat_encounters (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
                patient_id uuid REFERENCES patients(id) ON DELETE CASCADE,
                encounter_id text UNIQUE,
                status text NOT NULL CHECK (status IN ('planned', 'arrived', 'triaged', 'in-progress', 'onleave', 'finished', 'cancelled', 'entered-in-error', 'unknown')),
                class_system text,
                class_code text,
                class_display text,
                type_codings jsonb,  -- Array of coding objects
                service_type_coding jsonb,  -- Single coding object
                priority_coding jsonb,  -- Single coding object
                subject_ref_type text,
                subject_ref_id text,
                episode_of_care_refs jsonb,  -- Array of references
                based_on_refs jsonb,  -- Array of references
                participant_refs jsonb,  -- Array of participant objects
                appointment_refs jsonb,  -- Array of references
                period_start timestamptz,
                period_end timestamptz,
                length_value integer,
                length_unit text,
                length_system text,
                length_code text,
                reason_codings jsonb,  -- Array of coding objects
                reason_reference_refs jsonb,  -- Array of references
                diagnosis jsonb,  -- Array of diagnosis objects
                account_refs jsonb,  -- Array of references
                hospitalization jsonb,  -- Hospitalization details object
                location_refs jsonb,  -- Array of location objects
                service_provider_ref text,
                part_of_ref text,
                request_payload jsonb,
                response jsonb,
                created_at timestamptz NOT NULL DEFAULT now(),
                created_by uuid REFERENCES users(id) ON DELETE SET NULL,
                updated_at timestamptz NOT NULL DEFAULT now(),
                updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
                deleted_at timestamptz,
                deleted_by uuid REFERENCES users(id) ON DELETE SET NULL
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS studies (
              id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              org_id uuid REFERENCES satusehat_orgs(id) ON DELETE CASCADE,
              patient_id uuid REFERENCES patients(id),
              accession_number text,
              study_instance_uid text NOT NULL,
              study_date date,
              study_time time with time zone,
              study_description text,
              referring_physician text,
              institution_name text,
              origin_node_id uuid REFERENCES dicom_nodes(id),
              modality_primary text,
              extra_tags jsonb NOT NULL DEFAULT '{}'::jsonb,
              UNIQUE (org_id, study_instance_uid),
              
              -- Enhanced study information
              study_status VARCHAR(20) CHECK (study_status IN ('scheduled', 'in-progress', 'completed', 'cancelled', 'reported')),
              performing_physician VARCHAR(200),
              reading_physician VARCHAR(200),
              department VARCHAR(100),
              clinical_indication TEXT,
              patient_position VARCHAR(50),
              contrast_media TEXT,
              contrast_route VARCHAR(50),
              contrast_volume DECIMAL(10,2),
              contrast_rate DECIMAL(10,2),
              
              -- Study timestamps
              started_at timestamptz,
              completed_at timestamptz,
              reported_at timestamptz,
              
              -- Quality and reporting
              quality_rating INTEGER CHECK (quality_rating BETWEEN 1 AND 5),
              radiation_dose DECIMAL(10,2),
              procedure_reason TEXT,
              findings TEXT,
              impressions TEXT,
              report_status VARCHAR(20) CHECK (report_status IN ('draft', 'final', 'amended', 'cancelled'))
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS series (
              id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              study_id uuid NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
              series_instance_uid text NOT NULL,
              series_number integer,
              modality text,
              body_part text,
              laterality text,
              series_description text,
              num_instances integer,
              extra_tags jsonb NOT NULL DEFAULT '{}'::jsonb,
              UNIQUE (study_id, series_instance_uid),
              
              -- Enhanced series information
              series_status VARCHAR(20) CHECK (series_status IN ('scheduled', 'in-progress', 'completed', 'cancelled')),
              protocol_name VARCHAR(200),
              patient_position VARCHAR(50),
              contrast_bolus_agent VARCHAR(100),
              scanning_sequence VARCHAR(100),
              sequence_variant VARCHAR(100),
              scan_options VARCHAR(200),
              mr_acquisition_type VARCHAR(50),
              slice_thickness DECIMAL(10,2),
              repetition_time DECIMAL(10,2),
              echo_time DECIMAL(10,2),
              inversion_time DECIMAL(10,2),
              flip_angle INTEGER,
              pixel_spacing VARCHAR(50),
              window_center VARCHAR(50),
              window_width VARCHAR(50),
              
              -- Series timestamps
              started_at timestamptz,
              completed_at timestamptz
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS instances (
              id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              series_id uuid NOT NULL REFERENCES series(id) ON DELETE CASCADE,
              sop_instance_uid text NOT NULL,
              instance_number integer,
              transfer_syntax_uid text,
              file_size_bytes bigint,
              checksum_sha256 text,
              local_path text,
              wado_url text,
              file_id uuid REFERENCES files(file_id),
              extra_tags jsonb NOT NULL DEFAULT '{}'::jsonb,
              UNIQUE (series_id, sop_instance_uid),
              
              -- Enhanced instance information
              instance_status VARCHAR(20) CHECK (instance_status IN ('received', 'processed', 'archived', 'deleted')),
              image_type VARCHAR(100),
              rows INTEGER,
              columns INTEGER,
              bits_allocated INTEGER,
              bits_stored INTEGER,
              high_bit INTEGER,
              pixel_representation INTEGER,
              window_center_raw VARCHAR(50),
              window_width_raw VARCHAR(50),
              rescale_intercept DECIMAL(10,2),
              rescale_slope DECIMAL(10,2),
              kvp DECIMAL(10,2),
              exposure_time INTEGER,
              x_ray_tube_current INTEGER,
              exposure DECIMAL(10,2),
              
              -- Instance timestamps
              received_at timestamptz,
              processed_at timestamptz,
              archived_at timestamptz
            )
        """)
        
        # =========================
        # 5) Pipeline & Integrations
        # =========================
        logger.info("Creating pipeline and integration tables...")
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS study_jobs (
              id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              study_id uuid NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
              current_status pipeline_status NOT NULL DEFAULT 'RECEIVED',
              priority smallint NOT NULL DEFAULT 5,
              received_at timestamptz NOT NULL DEFAULT now(),
              parsed_at timestamptz,
              validated_at timestamptz,
              nidr_started_at timestamptz,
              nidr_completed_at timestamptz,
              fhir_posted_at timestamptz,
              completed_at timestamptz,
              quarantined_reason text,
              counters jsonb NOT NULL DEFAULT '{"retries":0}'::jsonb
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS nidr_uploads (
              id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              study_job_id uuid NOT NULL REFERENCES study_jobs(id) ON DELETE CASCADE,
              batch_no integer NOT NULL,
              status pipeline_status NOT NULL,
              file_count integer NOT NULL DEFAULT 0,
              bytes_uploaded bigint NOT NULL DEFAULT 0,
              nidr_response jsonb NOT NULL DEFAULT '{}'::jsonb,
              started_at timestamptz NOT NULL DEFAULT now(),
              finished_at timestamptz
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS fhir_transactions (
              id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              study_id uuid NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
              request_payload jsonb NOT NULL,
              response_payload jsonb,
              http_status integer,
              endpoint_url text NOT NULL,
              status pipeline_status NOT NULL DEFAULT 'FHIR_PENDING',
              satusehat_resource_id text,
              posted_at timestamptz,
              retried_from_id uuid REFERENCES fhir_transactions(id),
              created_at timestamptz NOT NULL DEFAULT now()
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS error_events (
              id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              occurred_at timestamptz NOT NULL DEFAULT now(),
              org_id uuid REFERENCES satusehat_orgs(id),
              study_id uuid REFERENCES studies(id),
              component text NOT NULL,
              code text,
              message text NOT NULL,
              details jsonb NOT NULL DEFAULT '{}'::jsonb,
              severity text NOT NULL DEFAULT 'ERROR'
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS retry_queue (
              id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              target_type text NOT NULL,
              target_id uuid NOT NULL,
              attempt_no integer NOT NULL DEFAULT 1,
              next_attempt_at timestamptz NOT NULL,
              backoff_seconds integer NOT NULL DEFAULT 300,
              last_error_id uuid REFERENCES error_events(id),
              locked_by text,
              locked_at timestamptz
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS audit_logs (
              id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              at timestamptz NOT NULL DEFAULT now(),
              actor text NOT NULL,
              action text NOT NULL,
              resource_type text NOT NULL,
              resource_id uuid NOT NULL,
              before jsonb,
              after jsonb,
              meta jsonb NOT NULL DEFAULT '{}'::jsonb
            )
        """)
        
        # =========================
        # 6) S3 Object Storage
        # =========================
        logger.info("Creating S3 object storage tables...")
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS object_stores (
              id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              name             text NOT NULL,
              provider         object_provider NOT NULL,
              endpoint         text,
              region           text,
              bucket           text NOT NULL,
              base_path        text,
              credentials_ref  text NOT NULL,
              default_kms_key  text,
              created_at       timestamptz NOT NULL DEFAULT now()
            )
        """)
        
        cursor.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_object_stores_unique ON object_stores (provider, coalesce(endpoint, ''), bucket, coalesce(base_path, ''))
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS object_objects (
              id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              store_id         uuid NOT NULL REFERENCES object_stores(id) ON DELETE RESTRICT,
              file_id          uuid REFERENCES files(file_id) ON DELETE CASCADE,
              instance_id      uuid REFERENCES instances(id) ON DELETE CASCADE,
              object_key       text NOT NULL,
              version_id       text,
              etag             text,
              size_bytes       bigint,
              content_type     text,
              storage_class    text,
              checksum_sha256  text,
              sse_type         text,
              kms_key_id       text,
              created_at       timestamptz NOT NULL DEFAULT now(),
              deleted_at       timestamptz
            )
        """)

        cursor.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_object_objects_unique ON object_objects (store_id, object_key, coalesce(version_id, ''))
        """)
        
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_obj_file   ON object_objects(file_id);
            CREATE INDEX IF NOT EXISTS idx_obj_inst   ON object_objects(instance_id);
            CREATE INDEX IF NOT EXISTS idx_obj_store_key ON object_objects(store_id, object_key);
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS object_replicas (
              id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              src_object_id    uuid NOT NULL REFERENCES object_objects(id) ON DELETE CASCADE,
              dest_store_id    uuid NOT NULL REFERENCES object_stores(id) ON DELETE RESTRICT,
              dest_object_key  text NOT NULL,
              status           text NOT NULL DEFAULT 'PENDING',
              last_synced_at   timestamptz,
              last_error       text
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS object_restore_requests (
              id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              object_id        uuid NOT NULL REFERENCES object_objects(id) ON DELETE CASCADE,
              tier             text NOT NULL DEFAULT 'Standard',
              requested_at     timestamptz NOT NULL DEFAULT now(),
              availability_at  timestamptz,
              status           text NOT NULL DEFAULT 'REQUESTED',
              error_message    text
            )
        """)
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS object_retention (
              object_id        uuid PRIMARY KEY REFERENCES object_objects(id) ON DELETE CASCADE,
              retain_until     timestamptz,
              legal_hold       boolean NOT NULL DEFAULT false
            )
        """)
        
        # =========================
        # 7) Backups to S3
        # =========================
        logger.info("Creating backup tables...")
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS backup_jobs (
              id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              kind             backup_kind NOT NULL,
              started_at       timestamptz NOT NULL DEFAULT now(),
              finished_at      timestamptz,
              state            job_state NOT NULL DEFAULT 'QUEUED',
              store_id         uuid NOT NULL REFERENCES object_stores(id) ON DELETE RESTRICT,
              object_key       text NOT NULL,
              size_bytes       bigint,
              checksum_sha256  text,
              error_message    text,
              meta             jsonb NOT NULL DEFAULT '{}'::jsonb
            )
        """)
        
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_backup_state ON backup_jobs(state, started_at DESC);
        """)
        
        # =========================
        # 8) Indexes (core + pipeline)
        # =========================
        logger.info("Creating indexes...")
        
        index_creations = [
            "CREATE INDEX IF NOT EXISTS idx_studies_org_acc ON studies(org_id, accession_number)",
            "CREATE INDEX IF NOT EXISTS idx_studies_org_uid ON studies(org_id, study_instance_uid)",
            "CREATE INDEX IF NOT EXISTS idx_series_study    ON series(study_id)",
            "CREATE INDEX IF NOT EXISTS idx_instances_series ON instances(series_id)",
            "CREATE INDEX IF NOT EXISTS idx_jobs_status     ON study_jobs(current_status)",
            "CREATE INDEX IF NOT EXISTS idx_fhir_study      ON fhir_transactions(study_id)",
            "CREATE INDEX IF NOT EXISTS idx_errors_study    ON error_events(study_id)",
            "CREATE INDEX IF NOT EXISTS idx_retry_schedule  ON retry_queue(next_attempt_at)",
            "CREATE INDEX IF NOT EXISTS idx_tx_file         ON satusehat_transmission_log(file_id)",
            "CREATE INDEX IF NOT EXISTS idx_queue_next      ON transmission_queue(next_retry_at)",
            
            # Indexes for enhanced patient table
            "CREATE INDEX IF NOT EXISTS idx_patients_org_id ON patients(org_id)",
            "CREATE INDEX IF NOT EXISTS idx_patients_local_id ON patients(patient_id_local)",
            "CREATE INDEX IF NOT EXISTS idx_patients_national_id ON patients(patient_national_id)",
            "CREATE INDEX IF NOT EXISTS idx_patients_ihs_number ON patients(ihs_number)",
            "CREATE INDEX IF NOT EXISTS idx_patients_mrn ON patients(medical_record_number)",
            "CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(patient_name)",
            "CREATE INDEX IF NOT EXISTS idx_patients_birth_date ON patients(birth_date)",
            "CREATE INDEX IF NOT EXISTS idx_patients_active ON patients(active) WHERE active = true",
            
            "CREATE INDEX IF NOT EXISTS idx_patient_allergies_patient_id ON patient_allergies(patient_id)",
            "CREATE INDEX IF NOT EXISTS idx_patient_medical_history_patient_id ON patient_medical_history(patient_id)",
            "CREATE INDEX IF NOT EXISTS idx_patient_family_history_patient_id ON patient_family_history(patient_id)",
            "CREATE INDEX IF NOT EXISTS idx_patient_medications_patient_id ON patient_medications(patient_id)",
            "CREATE INDEX IF NOT EXISTS idx_patient_audit_log_patient_id ON patient_audit_log(patient_id)",
            
            # Indexes for encounters
            "CREATE INDEX IF NOT EXISTS idx_encounter_order ON satusehat_encounters(order_id)",
            "CREATE INDEX IF NOT EXISTS idx_encounter_patient ON satusehat_encounters(patient_id)",
            "CREATE INDEX IF NOT EXISTS idx_encounter_id ON satusehat_encounters(encounter_id)",
            "CREATE INDEX IF NOT EXISTS idx_encounter_status ON satusehat_encounters(status)",
            "CREATE INDEX IF NOT EXISTS idx_encounter_period ON satusehat_encounters(period_start, period_end)"
        ]
        
        for index_sql in index_creations:
            cursor.execute(index_sql)
        
        # =========================
        # 9) Encounter back-links now that table exists
        # =========================
        logger.info("Creating foreign key references...")
        
        cursor.execute("""
            ALTER TABLE satusehat_imaging_studies
              ADD COLUMN IF NOT EXISTS service_request_db_id uuid REFERENCES satusehat_service_requests(id) ON DELETE SET NULL,
              ADD COLUMN IF NOT EXISTS encounter_db_id uuid REFERENCES satusehat_encounters(id) ON DELETE SET NULL
        """)
        
        # =========================
        # 10) Views (monitoring)
        # =========================
        logger.info("Creating monitoring views...")
        
        cursor.execute("""
            DROP VIEW IF EXISTS v_failed_studies;
            CREATE OR REPLACE VIEW v_failed_studies AS
            SELECT s.id AS study_id, s.accession_number, s.study_instance_uid,
                   j.current_status, j.received_at,
                   (SELECT max(e.occurred_at) FROM error_events e WHERE e.study_id = s.id) AS last_error_at
            FROM studies s
            JOIN study_jobs j ON j.study_id = s.id
            WHERE j.current_status IN ('NIDR_FAILED','FHIR_FAILED','QUARANTINED')
        """)
        
        cursor.execute("""
            DROP VIEW IF EXISTS v_study_sla;
            CREATE OR REPLACE VIEW v_study_sla AS
            SELECT s.id AS study_id, s.accession_number, s.study_instance_uid,
                   j.received_at, j.nidr_completed_at, j.fhir_posted_at, j.completed_at,
                   EXTRACT(EPOCH FROM (j.completed_at - j.received_at))::bigint AS seconds_total
            FROM studies s
            JOIN study_jobs j ON j.study_id = s.id
            WHERE j.completed_at IS NOT NULL
        """)
        
        cursor.execute("""
            CREATE OR REPLACE VIEW v_object_storage_summary AS
            WITH latest AS (
              SELECT store_id, object_key, max(created_at) AS max_created_at
              FROM object_objects
              GROUP BY store_id, object_key
            ),
            head AS (
              SELECT o.*
              FROM object_objects o
              JOIN latest l
                ON o.store_id = l.store_id
               AND o.object_key = l.object_key
               AND o.created_at = l.max_created_at
               AND o.deleted_at IS NULL
            )
            SELECT s.id AS store_id, s.name, s.provider, s.endpoint, s.region, s.bucket, coalesce(s.base_path,'') AS base_path,
                   count(*) AS object_count,
                   coalesce(sum(h.size_bytes),0) AS total_size_bytes
            FROM head h
            JOIN object_stores s ON s.id = h.store_id
            GROUP BY s.id, s.name, s.provider, s.endpoint, s.region, s.bucket, s.base_path
            ORDER BY total_size_bytes DESC
        """)
        
        cursor.execute("""
            CREATE OR REPLACE VIEW v_orphaned_storage_objects AS
            SELECT o.*
            FROM object_objects o
            WHERE o.deleted_at IS NULL
              AND o.file_id IS NULL
              AND o.instance_id IS NULL
        """)
        
        cursor.execute("""
            CREATE OR REPLACE VIEW v_backup_recent AS
            SELECT b.*, s.name AS store_name, s.provider, s.bucket
            FROM backup_jobs b
            JOIN object_stores s ON s.id = b.store_id
            ORDER BY b.started_at DESC
            LIMIT 30
        """)
        
        cursor.execute("""
            CREATE OR REPLACE VIEW v_order_prereq_status AS
            WITH sr AS (
              SELECT order_id,
                     max(created_at) AS sr_last_created,
                     bool_or(status = 'sent') AS sr_sent,
                     max(service_request_id) FILTER (WHERE status='sent') AS sr_id_sent,
                     max(sr_identifier_value) AS sr_identifier_value,
                     max(encounter_ref_id) AS sr_encounter_ref
              FROM satusehat_service_requests
              GROUP BY order_id
            ),
            enc AS (
              SELECT order_id,
                     max(updated_at) AS enc_last_updated,
                     bool_or(status IN ('in-progress','finished')) AS enc_ok,
                     max(encounter_id) FILTER (WHERE status IN ('in-progress','finished')) AS enc_id_ok
              FROM satusehat_encounters
              GROUP BY order_id
            ),
            isx AS (
              SELECT order_id,
                     bool_or(status='sent') AS imaging_study_sent
              FROM satusehat_imaging_studies
              GROUP BY order_id
            )
            SELECT o.id AS order_id, o.order_number, o.accession_number, o.modality, o.patient_name,
                   sr.sr_sent, sr.sr_id_sent, sr.sr_identifier_value, sr.sr_encounter_ref,
                   enc.enc_ok, enc.enc_id_ok,
                   coalesce(isx.imaging_study_sent,false) AS imaging_study_sent,
                   sr.sr_last_created, enc.enc_last_updated
            FROM orders o
            LEFT JOIN sr   ON sr.order_id = o.id
            LEFT JOIN enc  ON enc.order_id = o.id
            LEFT JOIN isx  ON isx.order_id = o.id
        """)
        
        cursor.execute("""
            CREATE OR REPLACE VIEW v_orders_missing_prereq AS
            SELECT *
            FROM v_order_prereq_status
            WHERE (NOT coalesce(sr_sent,false)) OR (NOT coalesce(enc_ok,false))
        """)
        
        cursor.execute("""
            CREATE OR REPLACE VIEW v_ready_for_imaging_study AS
            SELECT *
            FROM v_order_prereq_status
            WHERE coalesce(sr_sent,false) = true
              AND coalesce(enc_ok,false)  = true
              AND coalesce(imaging_study_sent,false) = false
        """)
        
        # =========================
        # 11) Seed (minimal demo)
        # =========================
        logger.info("Creating seed data...")
        
        cursor.execute("""
            DO $$
            BEGIN
              IF NOT EXISTS (SELECT 1 FROM satusehat_orgs) THEN
                INSERT INTO satusehat_orgs (satusehat_org_id, name) VALUES ('ORG-EXAMPLE-001','Demo Hospital');
              END IF;
            END$$
        """)
        
        cursor.execute("""
            WITH o AS (SELECT id FROM satusehat_orgs LIMIT 1)
            INSERT INTO dicom_nodes (org_id, role, ae_title, host, port, institution_name)
            SELECT id, 'MODALITY','CT_ROOM1','10.0.0.10',104,'Demo Hospital' FROM o
            ON CONFLICT DO NOTHING
        """)
        
        cursor.execute("""
            DO $$
            DECLARE
                _org_id UUID;
                _patient_id UUID;
            BEGIN
                SELECT id INTO _org_id FROM satusehat_orgs LIMIT 1;

                IF NOT EXISTS (SELECT 1 FROM patients WHERE patient_national_id = '0000000000000001') THEN
                    INSERT INTO patients (org_id, patient_national_id, patient_name, gender, birth_date)
                    VALUES (_org_id, '0000000000000001', 'Budi Santoso', 'male', DATE '1980-01-01')
                    RETURNING id INTO _patient_id;
                ELSE
                    SELECT id INTO _patient_id FROM patients WHERE patient_national_id = '0000000000000001';
                END IF;

                INSERT INTO orders (
                    id, org_id, patient_id, order_number, accession_number, modality, procedure_name, scheduled_at,
                    patient_national_id, patient_name, gender, birth_date, status, order_status, ordering_station_aet
                )
                SELECT
                    gen_random_uuid(),
                    _org_id,
                    _patient_id,
                    CONCAT('ORDSEED-', to_char(clock_timestamp(), 'YYYYMMDDHH24MISS')),
                    CONCAT('ACCSEED-', to_char(clock_timestamp(), 'YYYYMMDDHH24MISS')),
                    'CT',
                    'CT Head Non-Contrast',
                    now(),
                    '0000000000000001',
                    'Budi Santoso',
                    'male',
                    DATE '1980-01-01',
                    'CREATED',
                    'CREATED',
                    'UNKNOWN_AET'
                ON CONFLICT DO NOTHING;
            END$$;
        """)
        
        cursor.execute("""
            INSERT INTO object_stores (name, provider, region, bucket, credentials_ref)
            VALUES ('primary-s3','S3','ap-southeast-3','mwl-pacs-prod','secret://aws/s3/prod')
            ON CONFLICT DO NOTHING
        """)
        
        # Commit all changes
        conn.commit()
        logger.info("Schema application completed successfully!")
        
    except Exception as e:
        logger.error(f"Failed to apply schema: {str(e)}")
        if 'conn' in locals() and conn:
            conn.rollback()
        raise
    finally:
        if 'conn' in locals() and conn:
            conn.close()

if __name__ == "__main__":
    try:
        apply_schema()
        print("SATUSEHAT DICOM monitoring schema applied successfully!")
    except Exception as e:
        print(f"Error applying schema: {str(e)}")
        sys.exit(1)
