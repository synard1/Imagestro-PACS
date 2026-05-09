"""
Order Management Service v1.0
SIMRS Order Simulator dengan Accession Number Generator
Menyimpan order data untuk integrasi DICOM-SATUSEHAT
"""
import os
import sys
import uuid
import json
import time
from datetime import datetime, timedelta, date, timezone
from flask import Flask, request, jsonify, g
from flask_cors import CORS
import psycopg2
from psycopg2 import errors
from psycopg2.extras import RealDictCursor, Json
from contextlib import contextmanager
import logging
import requests
import jwt
from functools import wraps

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stdout
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# Configuration
DB_CONFIG = {
    'host': os.getenv('POSTGRES_HOST', 'postgres'),
    'database': os.getenv('POSTGRES_DB', 'worklist_db'),
    'user': os.getenv('POSTGRES_USER', 'dicom'),
    'password': os.getenv('POSTGRES_PASSWORD', 'dicom123'),
    'port': int(os.getenv('POSTGRES_PORT', '5432'))
}

# Storage root for uploaded order files (inside order-management container)
ORDER_FILES_STORAGE_ROOT = os.getenv('ORDER_FILES_STORAGE_ROOT', '/var/lib/orders/files')

def _get_int_env(name, default):
    value = os.getenv(name)
    if value is None or value == "":
        return default
    try:
        return int(value)
    except ValueError:
        logger.warning(f"Invalid integer for {name}: {value!r}. Falling back to {default}.")
        return default

def _get_float_env(name, default):
    value = os.getenv(name)
    if value is None or value == "":
        return default
    try:
        return float(value)
    except ValueError:
        logger.warning(f"Invalid float for {name}: {value!r}. Falling back to {default}.")
        return default

DB_CONNECT_MAX_RETRIES = max(1, _get_int_env('DB_CONNECT_MAX_RETRIES', 5))
DB_CONNECT_RETRY_BASE_DELAY = max(0.5, _get_float_env('DB_CONNECT_RETRY_BASE_DELAY', 2.0))
DB_CONNECT_RETRY_MAX_DELAY = max(DB_CONNECT_RETRY_BASE_DELAY, _get_float_env('DB_CONNECT_RETRY_MAX_DELAY', 10.0))
DB_INIT_MAX_RETRIES = max(DB_CONNECT_MAX_RETRIES, _get_int_env('DB_INIT_MAX_RETRIES', 10))

# External services
SATUSEHAT_BASE_URL = os.getenv('SATUSEHAT_BASE_URL', 'https://api-satusehat-stg.dto.kemkes.go.id')
SATUSEHAT_CLIENT_ID = os.getenv('SATUSEHAT_CLIENT_ID', '')
SATUSEHAT_CLIENT_SECRET = os.getenv('SATUSEHAT_CLIENT_SECRET', '')
SATUSEHAT_ORG_ID = os.getenv('SATUSEHAT_ORGANIZATION_ID', '100000001')
MWL_SERVICE_URL = os.getenv('MWL_SERVICE_URL', 'http://mwl-writer:8000')
ACCESSION_API_URL = os.getenv('ACCESSION_API_URL', 'http://accession-api:8180')
# Order number configuration
ORDER_NUMBER_PREFIX = os.getenv('ORDER_NUMBER_PREFIX', 'ORD')
ORDER_NUMBER_RESET = os.getenv('ORDER_NUMBER_RESET', 'daily').lower()  # 'daily' or 'monthly'
ORDER_NUMBER_PAD_LENGTH = int(os.getenv('ORDER_NUMBER_PAD_LENGTH', '5'))
ACCESSION_BACKFILL_PREFIX = os.getenv('ACCESSION_BACKFILL_PREFIX', 'ACC')
ACCESSION_BACKFILL_PAD_LENGTH = int(os.getenv('ACCESSION_BACKFILL_PAD_LENGTH', '6'))
# Duplication control configuration
DUPLICATE_CHECK_WINDOW_HOURS = int(os.getenv("DUPLICATE_CHECK_WINDOW_HOURS", "24"))
AUTO_CANCEL_ENABLED = os.getenv("AUTO_CANCEL_ENABLED", "true").lower() in ("1", "true", "yes", "on")
DUPLICATE_STRICT_MODE = os.getenv("DUPLICATE_STRICT_MODE", "false").lower() in ("1", "true", "yes", "on")
DUPLICATE_DATE_MATCH_MODE = os.getenv("DUPLICATE_DATE_MATCH_MODE", "same_day")  # same_day, exact_scheduled, flexible
MWL_STATION_AET = os.getenv('MWL_STATION_AET', 'SCANNER01')
# Tambahan konfigurasi SATUSEHAT (FHIR + OAuth + referensi)
SATUSEHAT_FHIR_BASE = f"{SATUSEHAT_BASE_URL}/fhir-r4/v1"
SATUSEHAT_OAUTH_URL = f"{SATUSEHAT_BASE_URL}/oauth2/v1/accesstoken"
SATUSEHAT_REQUESTER_REF = os.getenv('SATUSEHAT_REQUESTER_REF')  # contoh: Practitioner/N10000001
SATUSEHAT_PERFORMER_REF = os.getenv('SATUSEHAT_PERFORMER_REF')  # contoh: Organization/10000004
ACSN_SYSTEM_BASE = os.getenv('ACSN_SYSTEM_BASE', 'http://sys-ids.kemkes.go.id/accessionno')
SATUSEHAT_SYNC_OPTIONAL = os.getenv('SATUSEHAT_SYNC_OPTIONAL', 'true').lower() in ('1', 'true', 'yes', 'on')

ORDERS_ORG_ID_ACCEPTS_TEXT = True
ORDERS_ORG_ID_IS_UUID = False
_CACHED_DEFAULT_ORG_UUID = None
_PATIENTS_TABLE_AVAILABLE = None
_PATIENTS_ORG_COLUMN_STATE = None
_DOCTORS_TABLE_AVAILABLE = None
_ALLOWED_GENDERS = {'male', 'female'}


def _pg_array_to_list(value):
    """Safely normalize Postgres array / text-array representation to list of strings."""
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        v = value.strip()
        # Format "{a,b,c}"
        if v.startswith('{') and v.endswith('}'):
            inner = v[1:-1]
            if inner == '':
                return []
            # Split by comma at top level (no nested braces in our use-case)
            parts = inner.split(',')
            return [p.strip().strip('"') for p in parts if p.strip().strip('"')]
        # Fallback: single value string
        return [v]
    # Fallback for iterable types
    try:
        return [str(x) for x in value if str(x).strip()]
    except TypeError:
        return [str(value)]

# JWT Configuration for Order Management Service
JWT_SECRET = os.getenv('JWT_SECRET', 'change-this-secret-key-in-production') # Use a strong secret in production
JWT_ALGORITHM = 'HS256'

# Permission definitions for Order Management Service
REQUIRED_PERMISSIONS_OM = { # Renamed to avoid conflict
    'complete_flow': ['order:create', '*'],
    'create_order': ['order:create', '*'],
    'sync_satusehat': ['order:sync', '*'],
    'create_worklist': ['worklist:create', '*']
}

# Helper untuk SATUSEHAT

def now_utc_fhir():
    t = datetime.now(timezone.utc) - timedelta(seconds=60)
    return t.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def summarize_operation_outcome(js):
    try:
        if not isinstance(js, dict) or js.get('resourceType') != 'OperationOutcome':
            return None
        msgs = []
        for i in js.get('issue', []):
            det = (i.get('details') or {})
            msg = det.get('text') or i.get('diagnostics') or i.get('code')
            if msg:
                msgs.append(str(msg))
        return " | ".join(msgs) if msgs else None
    except Exception:
        return None


def utc_now_iso():
    """Return current UTC timestamp in ISO format with Z suffix."""
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def ensure_audit_structure(details, created_at=None):
    """Ensure audit metadata dict has created/updated/deleted keys with proper structure."""
    # Handle non-dict details (bool, None, string, etc.)
    if not isinstance(details, dict):
        logger.warning(f"ensure_audit_structure received non-dict details: type={type(details)}, value={details}")
        details = {}

    base = details if isinstance(details, dict) else {}
    result = dict(base)

    # Safely get existing_created
    created_field = base.get('created') if isinstance(base, dict) else None
    existing_created = created_field if isinstance(created_field, dict) else {}

    if not isinstance(result.get('created'), dict):
        if isinstance(created_at, datetime):
            created_at_iso = created_at.replace(microsecond=0).isoformat() + "Z"
        else:
            created_at_iso = existing_created.get('at') or utc_now_iso()
        result['created'] = {
            'by': existing_created.get('by'),
            'at': created_at_iso
        }
    if result.get('updated') is not None and not isinstance(result.get('updated'), dict):
        result['updated'] = None
    if result.get('deleted') is not None and not isinstance(result.get('deleted'), dict):
        result['deleted'] = None
    if 'updated' not in result:
        result['updated'] = None
    if 'deleted' not in result:
        result['deleted'] = None
    return result


def normalize_satusehat_encounter_id(value):
    """
    Normalize SATUSEHAT Encounter ID so we only store the bare identifier without the Encounter/ prefix.
    Accepts raw IDs, Encounter/<id>, or full URLs.
    """
    if value is None:
        return None
    v = str(value).strip()
    if not v:
        return None
    # Split by '/' to support Encounter/<id> and URLs, keep last non-empty segment
    segments = [segment for segment in v.split('/') if segment]
    if not segments:
        return None
    identifier = segments[-1]
    if not identifier:
        return None
    # Remove query/fragment artifacts if present
    identifier = identifier.split('?', 1)[0].split('#', 1)[0].strip()
    return identifier or None


def build_encounter_reference(encounter_id):
    """Return Encounter/<id> reference string from a stored encounter id."""
    enc_id = normalize_satusehat_encounter_id(encounter_id)
    if not enc_id:
        return None
    return f"Encounter/{enc_id}"


def get_satusehat_token():
    if not SATUSEHAT_CLIENT_ID or not SATUSEHAT_CLIENT_SECRET:
        raise Exception("SATUSEHAT_CLIENT_ID/CLIENT_SECRET belum di-set.")
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    params = {"grant_type": "client_credentials"}
    data = {"client_id": SATUSEHAT_CLIENT_ID, "client_secret": SATUSEHAT_CLIENT_SECRET}
    resp = requests.post(SATUSEHAT_OAUTH_URL, params=params, headers=headers, data=data, timeout=30)
    resp.raise_for_status()
    j = resp.json()
    return j.get('access_token')

def verify_token(token):
    """Verify JWT token and return payload"""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        logger.warning("Token expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid token: {str(e)}")
        logger.debug(f"JWT_SECRET length: {len(JWT_SECRET) if JWT_SECRET else 0}, JWT_ALGORITHM: {JWT_ALGORITHM}")
        return None


def decode_token_claims(token):
    """Decode JWT claims without signature verification (for audit/telemetry only)."""
    if not token:
        return None
    try:
        return jwt.decode(
            token,
            options={
                "verify_signature": False,
                "verify_aud": False,
                "verify_iss": False,
                "verify_exp": False,
            },
            algorithms=[JWT_ALGORITHM]
        )
    except Exception as exc:
        logger.warning(f"Unable to decode token for audit context: {exc}")
        return None

def resolve_request_actor():
    """Derive actor information from headers or JWT token."""
    header_user_id = (
        request.headers.get('X-User-ID')
        or request.headers.get('X-Actor-ID')
        or request.headers.get('X-UserId')
    )
    header_username = (
        request.headers.get('X-User-Name')
        or request.headers.get('X-Username')
        or request.headers.get('X-UserName')
    )

    token_payload = None
    auth_header = request.headers.get('Authorization', '')
    token = None
    if auth_header and auth_header.startswith('Bearer '):
        token = auth_header.split(' ', 1)[1].strip()
    if token:
        verified_payload = verify_token(token)
        token_payload = verified_payload if isinstance(verified_payload, dict) else None
        token_verified = bool(token_payload)

        if not token_payload:
            decoded_claims = decode_token_claims(token)
            token_payload = decoded_claims if isinstance(decoded_claims, dict) else None
            if token_payload:
                token_verified = False
                logger.warning("Using unverified JWT claims for audit context; signature verification failed.")

        # Only access token_payload.get() if it's actually a dict
        if token_payload and isinstance(token_payload, dict):
            header_user_id = header_user_id or token_payload.get('user_id') or token_payload.get('sub')
            header_username = header_username or token_payload.get('username') or token_payload.get('email')
            if token_verified:
                try:
                    request.current_user = token_payload  # cache for downstream handlers
                except Exception:
                    pass
        else:
            if token:
                logger.warning(f"Token payload is not a dict: type={type(token_payload)}, value={token_payload}")
    else:
        token_payload = None
        token_verified = False

    preferred_identifier = header_username or header_user_id
    identifier = preferred_identifier or request.headers.get('X-Request-ID') or 'system'

    return {
        'claims': token_payload,
        'id': header_user_id,
        'username': header_username,
        'identifier': identifier,
        'verified': token_verified,
        'raw_token': token
    }

def _normalize_string(value):
    if value is None:
        return None
    if isinstance(value, str):
        cleaned = value.strip()
        return cleaned or None
    return str(value)

def _normalize_gender_value(value, field_label='gender', required=False):
    """Normalize gender input to 'male'/'female' and validate."""
    if value is None or (isinstance(value, str) and value.strip() == ""):
        if required:
            raise ValueError(f"{field_label} is required")
        return None

    value_str = str(value).strip().lower()
    mapping = {
        'male': 'male',
        'm': 'male',
        'l': 'male',
        'pria': 'male',
        'man': 'male',
        'female': 'female',
        'f': 'female',
        'p': 'female',
        'wanita': 'female',
        'woman': 'female'
    }
    normalized = mapping.get(value_str)
    if not normalized:
        raise ValueError(f"{field_label} must be either 'male' or 'female'")
    return normalized


def _normalize_birth_date_value(value, field_label='birth_date', required=False):
    """Normalize various birth_date inputs into a date object."""
    if value is None or (isinstance(value, str) and value.strip() == ""):
        if required:
            raise ValueError(f"{field_label} is required")
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        cleaned = value.strip()
        if not cleaned:
            if required:
                raise ValueError(f"{field_label} is required")
            return None
        # Remove time components if provided
        for separator in ('T', ' '):
            if separator in cleaned:
                cleaned = cleaned.split(separator)[0]
                break
        cleaned = cleaned.replace('/', '-')
        try:
            return datetime.strptime(cleaned, "%Y-%m-%d").date()
        except ValueError:
            raise ValueError(f"{field_label} must be in YYYY-MM-DD format")
    raise ValueError(f"{field_label} must be provided in YYYY-MM-DD format")

def _patients_table_exists(cursor):
    global _PATIENTS_TABLE_AVAILABLE, _PATIENTS_ORG_COLUMN_STATE
    if _PATIENTS_TABLE_AVAILABLE is not None:
        return _PATIENTS_TABLE_AVAILABLE
    try:
        cursor.execute("""
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'patients'
            )
        """)
        exists = bool(cursor.fetchone()[0])
    except Exception as exc:
        logger.error(f"Unable to verify patients table: {exc}")
        exists = False
    _PATIENTS_TABLE_AVAILABLE = exists
    if not exists:
        _PATIENTS_ORG_COLUMN_STATE = None
        logger.error("Table 'patients' not found. Please run master-data migrations.")
    return exists


def _doctors_table_exists(cursor):
    """Check whether doctors table is available (cached)."""
    global _DOCTORS_TABLE_AVAILABLE
    if _DOCTORS_TABLE_AVAILABLE is not None:
        return _DOCTORS_TABLE_AVAILABLE
    try:
        cursor.execute("""
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'doctors'
            )
        """)
        exists = bool(cursor.fetchone()[0])
    except Exception as exc:
        logger.error(f"Unable to verify doctors table: {exc}")
        exists = False
    _DOCTORS_TABLE_AVAILABLE = exists
    if not exists:
        logger.warning("Table 'doctors' not found. Doctor registry sync skipped.")
    return exists

def _get_patients_org_state(cursor, refresh=False):
    """Inspect patients.org_id column metadata and cache the result."""
    global _PATIENTS_ORG_COLUMN_STATE
    if not refresh and _PATIENTS_ORG_COLUMN_STATE is not None:
        return _PATIENTS_ORG_COLUMN_STATE

    state = {
        'exists': False,
        'accepts_text': True,
        'is_uuid': False,
        'not_null': False,
        'data_type': None,
    }
    try:
        cursor.execute("""
            SELECT data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'patients' AND column_name = 'org_id'
        """)
        row = cursor.fetchone()
        if row:
            data_type, is_nullable = row
            dtype_lower = data_type.lower() if isinstance(data_type, str) else None
            state['exists'] = True
            state['data_type'] = dtype_lower or data_type
            state['not_null'] = str(is_nullable).strip().lower() == 'no'
            if dtype_lower == 'uuid':
                state['is_uuid'] = True
                state['accepts_text'] = False
            elif dtype_lower and ('char' in dtype_lower or 'text' in dtype_lower):
                state['accepts_text'] = True
            else:
                state['accepts_text'] = False
            if refresh or _PATIENTS_ORG_COLUMN_STATE is None:
                logger.info(
                    "patients.org_id column detected as %s (nullable=%s)",
                    data_type,
                    'NO' if state['not_null'] else 'YES'
                )
        elif refresh or _PATIENTS_ORG_COLUMN_STATE is None:
            logger.info("patients.org_id column not found; proceeding without organization linkage.")
    except Exception as exc:
        logger.warning(f"Unable to inspect patients.org_id column: {exc}")

    _PATIENTS_ORG_COLUMN_STATE = state
    return state

def resolve_default_org_uuid(cursor):
    """Resolve default SATUSEHAT organization UUID from satusehat_orgs."""
    global _CACHED_DEFAULT_ORG_UUID
    if _CACHED_DEFAULT_ORG_UUID:
        return _CACHED_DEFAULT_ORG_UUID

    try:
        cursor.execute("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'satusehat_orgs'
            )
        """)
        table_exists = cursor.fetchone()[0]
        if not table_exists:
            logger.error("Table satusehat_orgs not found; cannot resolve default org_id.")
            return None
    except Exception as exc:
        logger.error(f"Unable to check satusehat_orgs existence: {exc}")
        return None

    env_raw = SATUSEHAT_ORG_ID.strip() if isinstance(SATUSEHAT_ORG_ID, str) else None
    # Attempt direct UUID match first
    if env_raw:
        try:
            declared_uuid = str(uuid.UUID(env_raw))
            cursor.execute("SELECT id FROM satusehat_orgs WHERE id = %s LIMIT 1", (declared_uuid,))
            row = cursor.fetchone()
            if row and row[0]:
                _CACHED_DEFAULT_ORG_UUID = str(row[0])
                logger.info("Using SATUSEHAT_ORG_ID as satusehat_orgs.id: %s", _CACHED_DEFAULT_ORG_UUID)
                return _CACHED_DEFAULT_ORG_UUID
        except ValueError:
            declared_uuid = None
        except Exception as exc:
            logger.warning(f"Failed to resolve SATUSEHAT_ORG_ID as UUID: {exc}")

        # Attempt lookup by satusehat_org_id column
        try:
            cursor.execute("SELECT id FROM satusehat_orgs WHERE satusehat_org_id = %s LIMIT 1", (env_raw,))
            row = cursor.fetchone()
            if row and row[0]:
                _CACHED_DEFAULT_ORG_UUID = str(row[0])
                logger.info(
                    "Resolved SATUSEHAT_ORG_ID '%s' to satusehat_orgs.id %s",
                    env_raw,
                    _CACHED_DEFAULT_ORG_UUID
                )
                return _CACHED_DEFAULT_ORG_UUID
        except Exception as exc:
            logger.warning(f"Failed to resolve SATUSEHAT_ORG_ID via satusehat_org_id column: {exc}")

    # Fallback to first available organization
    try:
        cursor.execute("SELECT id FROM satusehat_orgs ORDER BY created_at NULLS FIRST LIMIT 1")
    except Exception:
        cursor.execute("SELECT id FROM satusehat_orgs LIMIT 1")
    row = cursor.fetchone()
    if row and row[0]:
        _CACHED_DEFAULT_ORG_UUID = str(row[0])
        logger.info("Defaulting orders.org_id to first satusehat_orgs.id: %s", _CACHED_DEFAULT_ORG_UUID)
        return _CACHED_DEFAULT_ORG_UUID

    logger.error("satusehat_orgs table is empty; cannot resolve default org_id.")
    return None

def resolve_order_source(data=None):
    """
    Determine the source of the order for monitoring purposes.

    Priority:
    1. Explicit body["order_source"]
    2. Header "X-Order-Source"
    3. Heuristics (SIMRS / PACS / API / INTERNAL)
    """
    # 1) Explicit from body
    if isinstance(data, dict):
        src = _normalize_string(data.get("order_source"))
        if src:
            return src.lower()

    # 2) Header override
    header_src = _normalize_string(request.headers.get("X-Order-Source"))
    if header_src:
        return header_src.lower()

    # 3) Simple heuristics
    ua = (request.headers.get("User-Agent") or "").lower()
    if "simrs" in ua or request.headers.get("X-SIMRS-Client"):
        return "simrs"
    if "pacs" in ua:
        return "pacs"
    if "router" in ua or "dicom" in ua:
        return "pacs"

    # Fallbacks based on path
    path = (request.path or "").lower()
    if "complete-flow" in path:
        return "api"
    if "orders/create" in path:
        return "api"

    return "api"


def ensure_patient_record(cursor, data, org_uuid=None):
    """Ensure a patient record exists (creating or updating) and return its UUID."""
    if not _patients_table_exists(cursor):
        raise RuntimeError("Master patient registry table 'patients' is not available.")

    patients_org_state = _get_patients_org_state(cursor)
    normalized_org_value = None
    if patients_org_state.get('exists'):
        candidate_org = org_uuid
        if candidate_org is None:
            for candidate_field in ('org_id', 'org_uuid', 'organization_id', 'satusehat_org_id'):
                candidate_org = data.get(candidate_field)
                if candidate_org:
                    break
        candidate_org = _normalize_string(candidate_org)
        if candidate_org:
            if patients_org_state.get('is_uuid'):
                try:
                    normalized_org_value = str(uuid.UUID(candidate_org))
                except ValueError:
                    logger.warning(
                        "Ignoring invalid organization identifier for patients.org_id: %s",
                        candidate_org
                    )
                    normalized_org_value = None
            elif patients_org_state.get('accepts_text'):
                normalized_org_value = candidate_org
        if normalized_org_value is None and patients_org_state.get('is_uuid'):
            normalized_org_value = resolve_default_org_uuid(cursor)

    patient_national_id = _normalize_string(data.get('patient_national_id'))
    medical_record_number = _normalize_string(data.get('medical_record_number'))
    if not patient_national_id and not medical_record_number:
        raise ValueError("patient_national_id or medical_record_number is required.")
    if not patient_national_id:
        patient_national_id = medical_record_number
    if not medical_record_number:
        medical_record_number = f"MRN-{patient_national_id}"

    patient_name = _normalize_string(data.get('patient_name')) or patient_national_id
    gender_raw = _normalize_string(data.get('gender'))
    gender = gender_raw.lower() if gender_raw and gender_raw.lower() in _ALLOWED_GENDERS else None

    birth_date_input = data.get('birth_date')
    birth_date_value = None
    if isinstance(birth_date_input, datetime):
        birth_date_value = birth_date_input.date()
    elif isinstance(birth_date_input, date):
        birth_date_value = birth_date_input
    elif isinstance(birth_date_input, str):
        try:
            birth_date_value = datetime.strptime(birth_date_input[:10], "%Y-%m-%d").date()
        except ValueError:
            logger.error(f"Invalid birth_date format: {birth_date_input}")
            raise ValueError("birth_date must be in YYYY-MM-DD format.")
    if not birth_date_value:
        raise ValueError("birth_date is required to create patient record.")

    ihs_number = _normalize_string(
        data.get('satusehat_ihs_number')
        or data.get('ihs_number')
        or data.get('satusehat_patient_id')
        or data.get('patientId')
    )
    address = _normalize_string(data.get('patient_address') or data.get('address'))
    phone = _normalize_string(data.get('patient_phone') or data.get('phone'))
    email = _normalize_string(data.get('patient_email') or data.get('email'))

    # Try to find existing patient by NIK or MRN
    cursor.execute("SELECT id, ihs_number FROM patients WHERE patient_national_id = %s LIMIT 1", (patient_national_id,))
    row = cursor.fetchone()
    if not row and medical_record_number:
        cursor.execute("SELECT id, ihs_number FROM patients WHERE medical_record_number = %s LIMIT 1", (medical_record_number,))
        row = cursor.fetchone()

    if row:
        patient_id, existing_ihs = str(row[0]), row[1]
        try:
            update_clauses = [
                "medical_record_number = COALESCE(%s, medical_record_number)",
                "patient_name = COALESCE(%s, patient_name)",
                "gender = COALESCE(%s, gender)",
                "birth_date = COALESCE(%s, birth_date)",
                "ihs_number = COALESCE(%s, ihs_number)",
                "address = COALESCE(%s, address)",
                "phone = COALESCE(%s, phone)",
                "email = COALESCE(%s, email)",
                "updated_at = CURRENT_TIMESTAMP"
            ]
            params = [
                medical_record_number,
                patient_name,
                gender,
                birth_date_value,
                ihs_number if ihs_number else existing_ihs,
                address,
                phone,
                email
            ]
            if patients_org_state.get('exists'):
                update_clauses.insert(0, "org_id = COALESCE(%s, org_id)")
                params.insert(0, normalized_org_value)
            cursor.execute(
                f"""
                UPDATE patients
                SET {", ".join(update_clauses)}
                WHERE id = %s
                """,
                (*params, patient_id)
            )
        except Exception as exc:
            logger.warning(f"Failed to refresh patient record {patient_id}: {exc}")
        return patient_id

    patient_uuid = str(uuid.uuid4())
    insert_columns = [
        "id",
        "patient_national_id",
        "ihs_number",
        "medical_record_number",
        "patient_name",
        "gender",
        "birth_date",
        "address",
        "phone",
        "email"
    ]
    insert_values = [
        patient_uuid,
        patient_national_id,
        ihs_number,
        medical_record_number,
        patient_name,
        gender,
        birth_date_value,
        address,
        phone,
        email
    ]
    if patients_org_state.get('exists'):
        insert_columns.insert(1, "org_id")
        insert_values.insert(1, normalized_org_value)

    placeholders = ["%s"] * len(insert_columns)
    cursor.execute(
        f"""
        INSERT INTO patients (
            {", ".join(insert_columns)},
            created_at,
            updated_at
        ) VALUES (
            {", ".join(placeholders)},
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        )
        RETURNING id
        """,
        tuple(insert_values)
    )
    result = cursor.fetchone()
    return str(result[0]) if result else patient_uuid


def ensure_doctor_record(cursor, data):
    """Ensure doctor/practitioner registry is updated when sufficient data provided."""
    if not _doctors_table_exists(cursor):
        return None

    doctor_name = _normalize_string(
        data.get('referring_doctor')
        or data.get('doctor_name')
        or data.get('ordering_physician_name')
    )
    doctor_national_id = _normalize_string(
        data.get('doctor_national_id') or data.get('doctor_nik')
    )
    doctor_ihs_number = _normalize_string(
        data.get('doctor_ihs_number') or data.get('doctor_ihs')
    )
    doctor_license = _normalize_string(
        data.get('doctor_license')
        or data.get('doctor_practice_license')
        or data.get('doctor_registration_number')
        or data.get('doctor_str_number')
    )

    if not doctor_name:
        return None
    if not any([doctor_national_id, doctor_ihs_number, doctor_license]):
        # Not enough identifiers to safely upsert doctor record.
        return None

    doctor_specialty = _normalize_string(data.get('doctor_specialty'))
    doctor_phone = _normalize_string(data.get('doctor_phone'))
    doctor_email = _normalize_string(data.get('doctor_email'))

    doctor_gender_raw = data.get('doctor_gender')
    gender_full = None
    if doctor_gender_raw not in (None, ''):
        gender_full = _normalize_gender_value(doctor_gender_raw, field_label='doctor_gender')
    gender_code = None
    if gender_full:
        gender_code = 'M' if gender_full == 'male' else 'F'

    doctor_birth_input = data.get('doctor_birth_date') or data.get('doctor_dob')
    birth_date_value = None
    if doctor_birth_input not in (None, ''):
        birth_date_value = _normalize_birth_date_value(
            doctor_birth_input,
            field_label='doctor_birth_date'
        )

    doctor_id = None
    lookup_fields = [
        ('national_id', doctor_national_id),
        ('ihs_number', doctor_ihs_number),
        ('license', doctor_license)
    ]
    for column, identifier in lookup_fields:
        if not identifier:
            continue
        cursor.execute(
            f"SELECT id FROM doctors WHERE {column} = %s AND deleted_at IS NULL LIMIT 1",
            (identifier,)
        )
        row = cursor.fetchone()
        if row:
            doctor_id = str(row[0])
            break

    if doctor_id:
        updates = []
        params = []

        def queue(column, value):
            if value not in (None, ''):
                updates.append(f"{column} = %s")
                params.append(value)

        queue('name', doctor_name)
        queue('ihs_number', doctor_ihs_number)
        queue('national_id', doctor_national_id)
        queue('license', doctor_license)
        queue('specialty', doctor_specialty)
        queue('phone', doctor_phone)
        queue('email', doctor_email)
        if birth_date_value:
            updates.append("birth_date = %s")
            params.append(birth_date_value)
        if gender_code:
            updates.append("gender = %s")
            params.append(gender_code)

        if updates:
            set_clause = ", ".join(updates + ["updated_at = CURRENT_TIMESTAMP"])
            cursor.execute(
                f"UPDATE doctors SET {set_clause} WHERE id = %s",
                (*params, doctor_id)
            )
        return doctor_id

    cursor.execute(
        """
        INSERT INTO doctors (
            ihs_number,
            national_id,
            name,
            license,
            specialty,
            phone,
            email,
            birth_date,
            gender
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id
        """,
        (
            doctor_ihs_number,
            doctor_national_id,
            doctor_name,
            doctor_license,
            doctor_specialty,
            doctor_phone,
            doctor_email,
            birth_date_value,
            gender_code
        )
    )
    created = cursor.fetchone()
    return str(created[0]) if created else None

def require_auth(required_permissions=[]):
    """Decorator to require authentication and check permissions"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            auth_header = request.headers.get('Authorization')

            if not auth_header or not auth_header.startswith('Bearer '):
                return jsonify({
                    "status": "error",
                    "message": "Missing or invalid authorization header"
                }), 401

            token = auth_header.split(' ')[1]
            user = verify_token(token)

            if not user:
                logger.warning("Authentication failed: Invalid or expired token")
                return jsonify({
                    "status": "error",
                    "message": "Authentication failed: Invalid or expired token. Please check your credentials and try again."
                }), 401

            # Check permissions if required
            if required_permissions:
                user_permissions = user.get('permissions', [])

                # Admin has all permissions
                if '*' in user_permissions:
                    request.current_user = user
                    return f(*args, **kwargs)

                # Check if user has any of the required permissions
                has_permission = any(perm in user_permissions for perm in required_permissions)

                if not has_permission:
                    # log_audit(None, None, 'PERMISSION_DENIED', None, None, user) # No audit log in OM for now
                    return jsonify({
                        "status": "error",
                        "message": "Permission denied",
                        "required": required_permissions,
                        "user_permissions": user_permissions
                    }), 403

            # Attach user info to request
            request.current_user = user
            return f(*args, **kwargs)

        return decorated_function
    return decorator

def _connect_with_retry(max_attempts=None, base_delay=None, max_delay=None):
    attempts = max_attempts or DB_CONNECT_MAX_RETRIES
    if attempts < 1:
        attempts = 1
    delay = DB_CONNECT_RETRY_BASE_DELAY if base_delay is None else max(0.0, base_delay)
    delay_cap = DB_CONNECT_RETRY_MAX_DELAY if max_delay is None else max(delay, max_delay)
    last_error = None

    for attempt in range(1, attempts + 1):
        try:
            conn = psycopg2.connect(**DB_CONFIG)
            if attempt > 1:
                logger.info("Database connection established on attempt %d", attempt)
            return conn
        except Exception as exc:
            last_error = exc
            if attempt >= attempts:
                break
            sleep_seconds = min(delay * attempt, delay_cap) if delay > 0 else 0
            logger.warning(
                "Database connection attempt %d/%d failed: %s. Retrying in %.1fs",
                attempt,
                attempts,
                exc,
                sleep_seconds
            )
            if sleep_seconds > 0:
                time.sleep(sleep_seconds)
    raise last_error


def wait_for_database(max_attempts=None):
    attempts = max_attempts or DB_INIT_MAX_RETRIES
    try:
        conn = _connect_with_retry(max_attempts=attempts)
    except Exception as exc:
        logger.critical(
            "Database not ready after %d attempt(s). Last error: %s",
            attempts,
            exc
        )
        raise RuntimeError("Database is not ready") from exc
    else:
        conn.close()
        logger.info("Database connectivity verified successfully.")


@contextmanager
def get_db_connection(max_attempts=None):
    conn = None
    try:
        conn = _connect_with_retry(max_attempts=max_attempts)
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


def log_order_action(order_id, order_number, accession_number, action, previous_status=None, payload=None, user_id='system', ip=None):
    """Write a simple audit log for order actions to /var/log/orders/audit.log"""
    try:
        record = {
            'timestamp': datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            'order_id': str(order_id) if order_id else None,
            'order_number': order_number,
            'accession_number': accession_number,
            'action': action,
            'previous_status': previous_status,
            'payload': payload,
            'user_id': user_id,
            'ip': ip
        }
        os.makedirs('/var/log/orders', exist_ok=True)
        with open('/var/log/orders/audit.log', 'a', encoding='utf-8') as f:
            f.write(json.dumps(record) + '\n')
    except Exception as e:
        logger.warning(f"Audit log write failed: {str(e)}")


def upsert_satusehat_encounter(cursor, order_row, encounter_id, request_payload=None, response_payload=None, actor_id=None, status="unknown"):
    """
    Upsert ke tabel satusehat_encounters dengan audit trail.

    - encounter_id: string FHIR Encounter/<id> atau id saja.
    - order_row: row dict dari tabel orders (harus mengandung id, patient_id, dll bila ada).
    - request_payload / response_payload: optional JSON (dict) untuk disimpan.
    - actor_id: siapa yang melakukan operasi (untuk audit).
    """
    if not encounter_id:
        logger.warning("upsert_satusehat_encounter: encounter_id is None/empty")
        return

    raw_encounter = str(encounter_id).strip()
    enc_id = normalize_satusehat_encounter_id(raw_encounter)
    if not enc_id:
        logger.warning("upsert_satusehat_encounter: encounter_id is empty after normalization: %r", encounter_id)
        return

    # Normalisasi menyimpan hanya identifier (tanpa prefix Encounter/).
    order_id = str(order_row.get("id")) if order_row.get("id") else None
    patient_id_raw = order_row.get("patient_id")
    patient_id = None
    if patient_id_raw:
        try:
            # Pastikan patient_id adalah UUID valid
            patient_id = str(uuid.UUID(str(patient_id_raw)))
        except (ValueError, TypeError, AttributeError):
            # Jika bukan UUID valid, set ke NULL
            patient_id = None

    request_json = Json(request_payload) if isinstance(request_payload, dict) else None
    response_json = Json(response_payload) if isinstance(response_payload, dict) else None

    existing_by_order = None
    existing_by_order_id = None
    if order_id:
        try:
            cursor.execute(
                """
                SELECT id, encounter_id
                FROM satusehat_encounters
                WHERE order_id = %s
                ORDER BY updated_at DESC
                LIMIT 1
                """,
                (order_id,)
            )
            existing_by_order = cursor.fetchone()
            if existing_by_order:
                if isinstance(existing_by_order, dict):
                    existing_by_order_id = existing_by_order.get("id")
                    existing_encounter_for_order = existing_by_order.get("encounter_id")
                else:
                    existing_by_order_id = existing_by_order[0]
                    existing_encounter_for_order = existing_by_order[1] if len(existing_by_order) > 1 else None
            else:
                existing_encounter_for_order = None
        except Exception as e:
            existing_encounter_for_order = None
            logger.error(
                "upsert_satusehat_encounter: failed fetching existing encounter for order_id=%s: %s",
                order_id,
                e,
                exc_info=True,
            )
    else:
        existing_encounter_for_order = None

    if existing_by_order_id:
        # Hilangkan potensi duplikasi encounter_id yang sama di order lain sebelum update
        if enc_id:
            try:
                cursor.execute(
                    """
                    UPDATE satusehat_encounters
                    SET
                        encounter_id = NULL,
                        deleted_at = NOW(),
                        deleted_by = %s,
                        updated_at = NOW(),
                        updated_by = %s
                    WHERE encounter_id = %s
                    AND id <> %s
                    """,
                    (
                        actor_id,
                        actor_id,
                        enc_id,
                        existing_by_order_id,
                    )
                )
            except Exception as e:
                logger.warning(
                    "upsert_satusehat_encounter: failed clearing duplicate encounter_id=%s before update: %s",
                    enc_id,
                    e,
                    exc_info=True,
                )

        try:
            cursor.execute(
                """
                UPDATE satusehat_encounters
                SET
                    encounter_id = %s,
                    patient_id = COALESCE(%s, patient_id),
                    request_payload = COALESCE(%s, request_payload),
                    response = COALESCE(%s, response),
                    deleted_at = NULL,
                    deleted_by = NULL,
                    updated_at = NOW(),
                    updated_by = %s
                WHERE id = %s
                """,
                (
                    enc_id,
                    patient_id,
                    request_json,
                    response_json,
                    actor_id,
                    existing_by_order_id,
                )
            )
            logger.info(
                "upsert_satusehat_encounter: updated encounter for order_id=%s (row_id=%s, prev_encounter=%s, new_encounter=%s)",
                order_id,
                existing_by_order_id,
                existing_encounter_for_order,
                enc_id,
            )
            return
        except Exception as e:
            logger.error(
                "upsert_satusehat_encounter: failed updating encounter for order_id=%s: %s",
                order_id,
                e,
                exc_info=True,
            )

    # Jika belum ada record berdasarkan order_id, coba update berdasarkan encounter_id (misal pernah tercatat sebelum order diketahui)
    try:
        cursor.execute(
            """
            UPDATE satusehat_encounters
            SET
                order_id = COALESCE(%s, order_id),
                patient_id = COALESCE(%s, patient_id),
                request_payload = COALESCE(%s, request_payload),
                response = COALESCE(%s, response),
                deleted_at = NULL,
                deleted_by = NULL,
                updated_at = NOW(),
                updated_by = %s
            WHERE encounter_id = %s
            """,
            (
                order_id,
                patient_id,
                request_json,
                response_json,
                actor_id,
                enc_id,
            )
        )
        if cursor.rowcount > 0:
            logger.info(
                "upsert_satusehat_encounter: re-linked encounter_id=%s to order_id=%s",
                enc_id,
                order_id,
            )
            return
    except Exception as e:
        logger.error(
            "upsert_satusehat_encounter: failed updating encounter_id=%s directly when no order record: %s",
            enc_id,
            e,
            exc_info=True,
        )

    # Ambil nilai minimal yang aman; kolom lain tetap nullable.
    # status diwajibkan oleh constraint; gunakan 'unknown' bila tidak diketahui.
    # Gunakan INSERT ... ON CONFLICT(encounter_id) DO UPDATE secara aman.
    logger.info(f"upsert_satusehat_encounter: inserting/updating enc_id={enc_id}, order_id={order_id}, patient_id={patient_id}")
    try:
        cursor.execute(
            """
            INSERT INTO satusehat_encounters (
                encounter_id,
                order_id,
                patient_id,
                status,
                request_payload,
                response,
                created_by,
                updated_at,
                updated_by
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, NOW(), %s
            )
            ON CONFLICT (encounter_id) DO UPDATE
            SET
                order_id = COALESCE(EXCLUDED.order_id, satusehat_encounters.order_id),
                patient_id = COALESCE(EXCLUDED.patient_id, satusehat_encounters.patient_id),
                status = COALESCE(NULLIF(EXCLUDED.status, ''), satusehat_encounters.status),
                request_payload = COALESCE(EXCLUDED.request_payload, satusehat_encounters.request_payload),
                response = COALESCE(EXCLUDED.response, satusehat_encounters.response),
                updated_at = NOW(),
                updated_by = EXCLUDED.updated_by
            """,
            (
                enc_id,
                order_id,
                patient_id,
                status or "unknown",
                request_json,
                response_json,
                actor_id,
                actor_id,
            )
        )
        logger.info(f"upsert_satusehat_encounter: success for enc_id={enc_id}")
    except Exception as e:
        logger.error(f"upsert_satusehat_encounter failed for {enc_id}: {e}", exc_info=True)


def soft_delete_satusehat_encounter(cursor, encounter_id, actor_id=None):
    """
    Soft delete encounter record dengan mengset deleted_at dan deleted_by.

    - encounter_id: ID encounter yang akan di-soft delete
    - actor_id: user yang melakukan soft delete (untuk audit trail)

    Returns: True jika berhasil, False jika gagal
    """
    if not encounter_id:
        logger.warning("soft_delete_satusehat_encounter: encounter_id is None/empty")
        return False

    enc_id = str(encounter_id).strip()
    if not enc_id:
        logger.warning("soft_delete_satusehat_encounter: encounter_id after strip is empty")
        return False

    logger.info(f"soft_delete_satusehat_encounter: deleting enc_id={enc_id}, actor_id={actor_id}")
    try:
        cursor.execute(
            """
            UPDATE satusehat_encounters
            SET
                deleted_at = NOW(),
                deleted_by = %s,
                updated_at = NOW(),
                updated_by = %s
            WHERE encounter_id = %s
            AND deleted_at IS NULL
            """,
            (actor_id, actor_id, enc_id)
        )
        if cursor.rowcount > 0:
            logger.info(f"soft_delete_satusehat_encounter: success for enc_id={enc_id}, rows affected={cursor.rowcount}")
            return True
        else:
            logger.warning(f"soft_delete_satusehat_encounter: no rows affected for enc_id={enc_id}, might already be deleted or not exist")
            return False
    except Exception as e:
        logger.error(f"soft_delete_satusehat_encounter failed for {enc_id}: {e}", exc_info=True)
        return False


def insert_satusehat_service_request(cursor, order_row, sr_id, status, request_payload=None,
                                     response_payload=None, extra=None, actor_id=None):
    """
    Insert record ke satusehat_service_requests untuk audit trail.

    - Tidak ON CONFLICT because tabel ini diposisikan sebagai history/multi-entry.
    - order_id wajib (schema), jadi jika tidak ada order.id, fungsi ini akan skip.
    - sr_id: ServiceRequest ID (string).
    - status: diharapkan sesuai enum sr_state, gunakan 'created'/'synced'/'received' dll.
    - actor_id: user yang melakukan operasi (untuk audit trail).
    """
    if not order_row or not order_row.get("id"):
        logger.warning("insert_satusehat_service_request: order_row or order.id is None")
        return
    if not sr_id:
        logger.warning("insert_satusehat_service_request: sr_id is None/empty")
        return

    order_id = str(order_row["id"])
    sr_id_str = str(sr_id).strip()
    if not sr_id_str:
        logger.warning("insert_satusehat_service_request: sr_id after strip is empty")
        return

    # Bangun kolom tambahan jika tersedia
    extra = extra or {}
    subject_ref_id = extra.get("subject_ref_id")
    subject_ref_type = extra.get("subject_ref_type")
    encounter_ref_id = extra.get("encounter_ref_id")
    requester_ref_id = extra.get("requester_ref_id")
    sr_identifier_system = extra.get("sr_identifier_system")
    sr_identifier_value = extra.get("sr_identifier_value")

    logger.info(f"insert_satusehat_service_request: inserting sr_id={sr_id_str}, order_id={order_id}, status={status}, actor_id={actor_id}")
    try:
        cursor.execute(
            """
            INSERT INTO satusehat_service_requests (
                order_id,
                service_request_id,
                status,
                request_payload,
                response,
                sr_identifier_system,
                sr_identifier_value,
                subject_ref_type,
                subject_ref_id,
                encounter_ref_id,
                requester_ref_id,
                created_by,
                updated_by
            ) VALUES (
                %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s
            )
            """,
            (
                order_id,
                sr_id_str,
                status,
                Json(request_payload) if isinstance(request_payload, dict) else None,
                Json(response_payload) if isinstance(response_payload, dict) else None,
                sr_identifier_system,
                sr_identifier_value,
                subject_ref_type,
                subject_ref_id,
                encounter_ref_id,
                requester_ref_id,
                actor_id,
                actor_id,
            )
        )
        logger.info(f"insert_satusehat_service_request: success for sr_id={sr_id_str}")
    except Exception as e:
        logger.error(f"insert_satusehat_service_request failed for {sr_id_str}: {e}", exc_info=True)


def soft_delete_satusehat_service_request(cursor, service_request_id, actor_id=None):
    """
    Soft delete service request record dengan mengset deleted_at dan deleted_by.

    - service_request_id: ID service request yang akan di-soft delete
    - actor_id: user yang melakukan soft delete (untuk audit trail)

    Returns: True jika berhasil, False jika gagal
    """
    if not service_request_id:
        logger.warning("soft_delete_satusehat_service_request: service_request_id is None/empty")
        return False

    sr_id = str(service_request_id).strip()
    if not sr_id:
        logger.warning("soft_delete_satusehat_service_request: service_request_id after strip is empty")
        return False

    logger.info(f"soft_delete_satusehat_service_request: deleting sr_id={sr_id}, actor_id={actor_id}")
    try:
        cursor.execute(
            """
            UPDATE satusehat_service_requests
            SET
                deleted_at = NOW(),
                deleted_by = %s,
                updated_at = NOW(),
                updated_by = %s
            WHERE service_request_id = %s
            AND deleted_at IS NULL
            """,
            (actor_id, actor_id, sr_id)
        )
        if cursor.rowcount > 0:
            logger.info(f"soft_delete_satusehat_service_request: success for sr_id={sr_id}, rows affected={cursor.rowcount}")
            return True
        else:
            logger.warning(f"soft_delete_satusehat_service_request: no rows affected for sr_id={sr_id}, might already be deleted or not exist")
            return False
    except Exception as e:
        logger.error(f"soft_delete_satusehat_service_request failed for {sr_id}: {e}", exc_info=True)
        return False


# -----------------------------------------------------------------------------
# LIFECYCLE STATUS HELPERS - WORKLIST WORKFLOW ALIGNED
# -----------------------------------------------------------------------------

# Order status workflow - FULLY ALIGNED WITH WORKLIST_SYSTEM_DOCUMENTATION.md
VALID_ORDER_STATUSES = {
    'draft', 'created', 'scheduled', 'enqueued', 'rescheduled',
    'arrived', 'in_progress', 'completed', 'reported', 
    'finalized', 'cancelled', 'no_show'
}

# SPS Status mapping for worklist_items.sps_status (DICOM MWL standard)
# EXACTLY matches WORKLIST_SYSTEM_DOCUMENTATION.md section 6.3
SPS_STATUS_MAPPING = {
    'scheduled': 'SCHEDULED',
    'enqueued': 'SCHEDULED', 
    'rescheduled': 'SCHEDULED',
    'arrived': 'ARRIVED',
    'in_progress': 'STARTED',
    'completed': 'COMPLETED',
    'reported': 'COMPLETED',
    'finalized': 'COMPLETED',
    'cancelled': 'DISCONTINUED',
    'no_show': 'DISCONTINUED'
}

COMPLETED_STATUSES = {'completed', 'reported', 'finalized'}
CANCELED_STATUSES = {'cancelled', 'no_show'}


def is_completed_status(status: str) -> bool:
    """Return True if status represents a completed order (WORKLIST aligned)."""
    if not status:
        return False
    return status.strip().lower() in COMPLETED_STATUSES


def is_canceled_status(status: str) -> bool:
    """Return True if status represents a canceled order (WORKLIST aligned)."""
    if not status:
        return False
    return status.strip().lower() in CANCELED_STATUSES


def _has_required_completion_fields(order_row: dict, pending_updates: dict) -> tuple[bool, str]:
    """
    Validate required fields before allowing status to be set to COMPLETED/REPORTED/FINALIZED states.
    
    WORKLIST aligned rules (section 6):
      - referring_doctor must be present
      - details.icd10 must be present for clinical indication
    """
    # Final referring_doctor after this update
    referring = pending_updates.get('referring_doctor', order_row.get('referring_doctor'))

    # Final details after this update
    existing_details = order_row.get('details')
    if not isinstance(existing_details, dict):
        try:
            existing_details = json.loads(str(existing_details)) if existing_details else {}
        except Exception:
            existing_details = {}

    updated_details = pending_updates.get('details')
    if updated_details is None:
        details = existing_details
    else:
        if isinstance(updated_details, dict):
            tmp = dict(existing_details)
            tmp.update(updated_details)
            details = tmp
        else:
            details = existing_details

    icd10 = None
    if isinstance(details, dict):
        icd10 = details.get('icd10')

    # WORKLIST validation
    if not referring or str(referring).strip() == "":
        return False, "referring_doctor is required before completing the order"

    if not icd10 or str(icd10).strip() == "":
        return False, "details.icd10 is required before completing the order (clinical indication)"

    return True, ""

def generate_order_number():
    """
    Generate order number berdasarkan konfigurasi di database.

    Urutan prioritas:
    1) settings / system_config.key = 'order_number_config' (JSON)
    2) Fallback ke env ORDER_NUMBER_* (compat lama)
    3) Fallback terakhir: sequence / timestamp

    Struktur order_number_config yang didukung (contoh):
    {
      "pattern": "ORD{YYYY}{MM}{DD}{NNNNN}",
      "sequence_digits": 5,
      "counter_reset_policy": "DAILY",   // DAILY|MONTHLY|YEARLY|NONE
      "org_code": "HOSP1"                // optional, {ORG}
    }
    """
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()

            # 1) Ambil config dari settings atau system_config
            config = None

            # Prefer tabel settings jika ada
            try:
                cursor.execute("""
                    SELECT value
                    FROM settings
                    WHERE key = 'order_number_config'
                    ORDER BY updated_at DESC NULLS LAST
                    LIMIT 1
                """)
                row = cursor.fetchone()
                if row:
                    raw = row[0]
                    if isinstance(raw, str):
                        try:
                            config = json.loads(raw)
                        except Exception:
                            config = None
                    elif isinstance(raw, dict):
                        config = raw
            except Exception as _:
                # Abaikan jika tabel/settings belum ada, lanjut cek system_config
                config = None

            # Backward compatibility: cek system_config jika belum dapat
            if config is None:
                try:
                    cursor.execute("""
                        SELECT config_value
                        FROM system_config
                        WHERE config_key = 'order_number_config'
                          AND status = 'active'
                        LIMIT 1
                    """)
                    row = cursor.fetchone()
                    if row:
                        raw = row[0]
                        if isinstance(raw, str):
                            try:
                                config = json.loads(raw)
                            except Exception:
                                config = None
                        elif isinstance(raw, dict):
                            config = raw
                except Exception:
                    config = None

            # 2) Jika config valid, gunakan sepenuhnya
            if isinstance(config, dict):
                pattern = config.get('pattern') or 'ORD{YYYY}{MM}{DD}{NNNNN}'
                sequence_digits = int(config.get('sequence_digits', 5))
                counter_reset_policy = (config.get('counter_reset_policy') or 'DAILY').upper()
                org_code = str(config.get('org_code') or '')

                now = datetime.now()

                # Date components
                year_full = now.strftime('%Y')
                year_short = now.strftime('%y')
                month_2 = now.strftime('%m')
                day_2 = now.strftime('%d')

                # Scope & period key untuk counter
                if counter_reset_policy == 'DAILY':
                    scope = 'daily'
                    period_key = now.strftime('%Y%m%d')
                elif counter_reset_policy == 'MONTHLY':
                    scope = 'monthly'
                    period_key = now.strftime('%Y%m')
                elif counter_reset_policy == 'YEARLY':
                    scope = 'yearly'
                    period_key = now.strftime('%Y')
                else:  # 'NONE' atau nilai lain -> global counter tanpa reset
                    scope = 'global'
                    period_key = 'global'

                # Ambil / increment counter
                cursor.execute(
                    """
                    INSERT INTO order_counters(scope, period_key, counter, updated_at)
                    VALUES (%s, %s, 1, CURRENT_TIMESTAMP)
                    ON CONFLICT (scope, period_key)
                    DO UPDATE SET counter = order_counters.counter + 1,
                                  updated_at = CURRENT_TIMESTAMP
                    RETURNING counter
                    """,
                    (scope, period_key),
                )
                next_val = cursor.fetchone()[0]
                seq_str = str(next_val).zfill(sequence_digits)

                # Bangun order_number dari pattern:
                # dukung placeholder umum:
                # {YYYY}, {YY}, {MM}, {DD}, {NN}, {SEQ}, {NNNNN}, {ORG}
                order_number = pattern
                order_number = order_number.replace('{YYYY}', year_full)
                order_number = order_number.replace('{YY}', year_short)
                order_number = order_number.replace('{MM}', month_2)
                order_number = order_number.replace('{DD}', day_2)
                order_number = order_number.replace('{ORG}', org_code)
                # {SEQ} atau placeholder numerik umum diarahkan ke seq_str
                order_number = order_number.replace('{SEQ}', seq_str)
                order_number = order_number.replace('{NNNNN}', seq_str)
                order_number = order_number.replace('{NN}', seq_str)

                return order_number

            # 3) Fallback ke logic lama (env-based)
            reset = ORDER_NUMBER_RESET if ORDER_NUMBER_RESET in ('daily', 'monthly') else 'daily'
            now = datetime.now()
            date_part = now.strftime('%Y%m%d') if reset == 'daily' else now.strftime('%Y%m')
            scope = reset
            period_key = date_part

            cursor.execute(
                """
                INSERT INTO order_counters(scope, period_key, counter, updated_at)
                VALUES (%s, %s, 1, CURRENT_TIMESTAMP)
                ON CONFLICT (scope, period_key)
                DO UPDATE SET counter = order_counters.counter + 1,
                              updated_at = CURRENT_TIMESTAMP
                RETURNING counter
                """,
                (scope, period_key),
            )
            next_val = cursor.fetchone()[0]
            return f"{ORDER_NUMBER_PREFIX}{date_part}{str(next_val).zfill(ORDER_NUMBER_PAD_LENGTH)}"

    except Exception as e:
        logger.warning(f"Failed to generate order number from database config: {e}")
        # 4) Fallback darurat: gunakan sequence atau timestamp
        try:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT nextval('order_number_seq')")
                seq_val = cursor.fetchone()[0]
                now = datetime.now()
                date_part = now.strftime('%Y%m%d')
                return f"{ORDER_NUMBER_PREFIX}{date_part}{str(seq_val).zfill(ORDER_NUMBER_PAD_LENGTH)}"
        except Exception:
            now = datetime.now()
            timestamp = now.strftime('%Y%m%d%H%M%S')
            return f"{ORDER_NUMBER_PREFIX}{timestamp}"

def init_database():
    """Initialize order management tables and align to unified schema"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
            except Exception as ext_err:
                logger.warning(f"Skipping uuid-ossp extension setup: {ext_err}")

            # Align patients.org_id constraints so legacy nulls do not break inserts
            patients_exists = False
            try:
                cursor.execute("""
                    SELECT EXISTS (
                        SELECT 1
                        FROM information_schema.tables
                        WHERE table_schema = 'public' AND table_name = 'patients'
                    )
                """)
                patients_exists = bool(cursor.fetchone()[0])
            except Exception as patients_check_err:
                logger.warning(f"Unable to verify patients table during initialization: {patients_check_err}")

            if patients_exists:
                patients_org_state = _get_patients_org_state(cursor, refresh=True)
                if patients_org_state.get('exists') and patients_org_state.get('not_null'):
                    try:
                        cursor.execute("ALTER TABLE patients ALTER COLUMN org_id DROP NOT NULL")
                        patients_org_state = _get_patients_org_state(cursor, refresh=True)
                        logger.info("Relaxed patients.org_id constraint to allow NULL values.")
                    except Exception as drop_err:
                        logger.warning(f"Unable to relax patients.org_id constraint: {drop_err}")
            else:
                logger.warning("patients table not found during initialization; patient linkage features may be limited.")

            # Ensure orders table exists
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS orders (
                    id UUID PRIMARY KEY,
                    patient_id UUID,
                    order_number VARCHAR(50) UNIQUE NOT NULL,
                    accession_number VARCHAR(50) UNIQUE,
                    modality VARCHAR(10),
                    procedure_code VARCHAR(50),
                    procedure_name VARCHAR(200),
                    loinc_code VARCHAR(50),
                    loinc_name VARCHAR(200),
                    referring_doctor VARCHAR(200),
                    attending_nurse VARCHAR(200),
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

            # Add canonical columns to existing orders table if missing or update constraints
            # Add org_id if missing
            cursor.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS org_id VARCHAR(50)")

            # Ensure order_number exists and is enforced without breaking legacy data
            cursor.execute("""
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'orders' AND column_name = 'order_number'
            """)
            if cursor.fetchone() is None:
                cursor.execute("ALTER TABLE orders ADD COLUMN order_number VARCHAR(50)")

            # Backfill missing order numbers with deterministic values
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

            # Normalize legacy column names to the unified schema
            cursor.execute("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'orders'
            """)
            existing_columns = {row[0] for row in cursor.fetchall()}

            cursor.execute("""
                SELECT data_type
                FROM information_schema.columns
                WHERE table_name = 'orders' AND column_name = 'org_id'
            """)
            org_type_row = cursor.fetchone()
            normalized_org_type = org_type_row[0].lower() if org_type_row and org_type_row[0] else None
            global ORDERS_ORG_ID_ACCEPTS_TEXT, ORDERS_ORG_ID_IS_UUID
            ORDERS_ORG_ID_ACCEPTS_TEXT = True
            ORDERS_ORG_ID_IS_UUID = False
            if normalized_org_type:
                if 'char' in normalized_org_type or 'text' in normalized_org_type:
                    ORDERS_ORG_ID_ACCEPTS_TEXT = True
                elif normalized_org_type == 'uuid':
                    ORDERS_ORG_ID_ACCEPTS_TEXT = False
                    ORDERS_ORG_ID_IS_UUID = True
                else:
                    ORDERS_ORG_ID_ACCEPTS_TEXT = False
                logger.info(
                    "orders.org_id column detected as %s; accepts_text=%s, is_uuid=%s",
                    normalized_org_type,
                    ORDERS_ORG_ID_ACCEPTS_TEXT,
                    ORDERS_ORG_ID_IS_UUID
                )
            else:
                logger.info("orders.org_id column type detection returned no result; defaulting to text-compatible.")

            def refresh_columns():
                cursor.execute("""
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_name = 'orders'
                """)
                return {row[0] for row in cursor.fetchall()}

            def has_column(name):
                return name in existing_columns

            default_org_uuid = resolve_default_org_uuid(cursor)
            if default_org_uuid:
                target_value = default_org_uuid if ORDERS_ORG_ID_IS_UUID else str(default_org_uuid)
                try:
                    cursor.execute("UPDATE orders SET org_id = %s WHERE org_id IS NULL", (target_value,))
                except Exception as exc:
                    logger.warning(f"Failed to backfill orders.org_id with default organization: {exc}")
            else:
                logger.warning("No default organization UUID resolved; existing orders may lack org_id.")

            if has_column('ihs_number') and not has_column('satusehat_ihs_number'):
                cursor.execute("ALTER TABLE orders RENAME COLUMN ihs_number TO satusehat_ihs_number")
                existing_columns = refresh_columns()

            if has_column('requesting_physician') and not has_column('ordering_physician_name'):
                cursor.execute("ALTER TABLE orders RENAME COLUMN requesting_physician TO ordering_physician_name")
                existing_columns = refresh_columns()

            if has_column('patient_nik'):
                if not has_column('patient_national_id'):
                    cursor.execute("ALTER TABLE orders RENAME COLUMN patient_nik TO patient_national_id")
                    existing_columns = refresh_columns()
                else:
                    cursor.execute("""
                        UPDATE orders
                        SET patient_national_id = COALESCE(patient_national_id, patient_nik)
                        WHERE patient_national_id IS NULL AND patient_nik IS NOT NULL
                    """)

            if has_column('accession_no') and not has_column('accession_number'):
                cursor.execute("ALTER TABLE orders RENAME COLUMN accession_no TO accession_number")
                existing_columns = refresh_columns()

            if has_column('requested_procedure') and not has_column('procedure_name'):
                cursor.execute("ALTER TABLE orders RENAME COLUMN requested_procedure TO procedure_name")
                existing_columns = refresh_columns()

            if has_column('station_ae_title') and not has_column('ordering_station_aet'):
                cursor.execute("ALTER TABLE orders RENAME COLUMN station_ae_title TO ordering_station_aet")
                existing_columns = refresh_columns()

            if has_column('satusehat_patient_id'):
                if not has_column('satusehat_ihs_number'):
                    cursor.execute("ALTER TABLE orders RENAME COLUMN satusehat_patient_id TO satusehat_ihs_number")
                    existing_columns = refresh_columns()
                else:
                    cursor.execute("""
                        UPDATE orders
                        SET satusehat_ihs_number = COALESCE(satusehat_ihs_number, satusehat_patient_id)
                        WHERE satusehat_ihs_number IS NULL AND satusehat_patient_id IS NOT NULL
                    """)
                    cursor.execute("ALTER TABLE orders DROP COLUMN satusehat_patient_id")
                    existing_columns = refresh_columns()

            # Relax NOT NULL constraints for multi-procedure support
            # In multi-procedure orders, procedure details are in order_procedures table
            try:
                cursor.execute("ALTER TABLE orders ALTER COLUMN procedure_name DROP NOT NULL")
                logger.info("Relaxed orders.procedure_name constraint to allow NULL (multi-procedure support)")
            except Exception as relax_err:
                logger.warning(f"Unable to relax procedure_name constraint: {relax_err}")

            try:
                cursor.execute("ALTER TABLE orders ALTER COLUMN modality DROP NOT NULL")
                logger.info("Relaxed orders.modality constraint to allow NULL (multi-procedure support)")
            except Exception as relax_err:
                logger.warning(f"Unable to relax modality constraint: {relax_err}")

            # Ensure all expected columns exist for the unified schema
            # NOTE: new robust lifecycle columns:
            #   - completed_at, completed_by
            #   - cancel_at, cancel_by
            # so we can audit completion/cancellation explicitly.
            required_columns = [
                ("org_id", "VARCHAR(50)"),
                ("patient_id", "UUID"),
                ("order_source", "VARCHAR(50)"),
                ("accession_number", "VARCHAR(50)"),
                ("modality", "VARCHAR(10)"),
                ("procedure_code", "VARCHAR(50)"),
                ("procedure_name", "VARCHAR(200)"),
                ("loinc_code", "VARCHAR(50)"),
                ("loinc_name", "VARCHAR(200)"),
                ("referring_doctor", "VARCHAR(200)"),
                ("attending_nurse", "VARCHAR(200)"),  # Add attending_nurse column after referring_doctor
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
                # Robust lifecycle audit fields
                ("completed_at", "TIMESTAMPTZ"),
                ("completed_by", "TEXT"),
                ("cancel_at", "TIMESTAMPTZ"),
                ("cancel_by", "TEXT"),
                # Legacy alias columns to support older analytics/queries
                ("cancelled_at", "TIMESTAMPTZ"),
                ("cancelled_by", "TEXT"),
                ("created_at", "TIMESTAMPTZ DEFAULT now()"),
                ("updated_at", "TIMESTAMPTZ DEFAULT now()"),
                ("details", "JSONB NOT NULL DEFAULT jsonb_build_object('created', jsonb_build_object('by', NULL, 'at', now()), 'updated', NULL, 'deleted', NULL)")
            ]
            for column_name, definition in required_columns:
                cursor.execute(f"ALTER TABLE orders ADD COLUMN IF NOT EXISTS {column_name} {definition}")

            # Future-proof: Ensure attending_nurse column exists with proper definition
            cursor.execute("ALTER TABLE orders ADD COLUMN IF NOT EXISTS attending_nurse VARCHAR(200)")

            # Backfill LOINC columns using existing procedure data when missing
            cursor.execute("""
                UPDATE orders
                SET
                    loinc_code = COALESCE(loinc_code, procedure_code),
                    loinc_name = COALESCE(loinc_name, procedure_name)
                WHERE loinc_code IS NULL OR loinc_name IS NULL
            """)

            try:
                cursor.execute("""
                    SELECT is_nullable
                    FROM information_schema.columns
                    WHERE table_name = 'orders' AND column_name = 'ordering_station_aet'
                """)
                nullable_row = cursor.fetchone()
                if nullable_row and str(nullable_row[0]).strip().lower() == 'no':
                    cursor.execute("ALTER TABLE orders ALTER COLUMN ordering_station_aet DROP NOT NULL")
                    logger.info("Relaxed orders.ordering_station_aet constraint to allow NULL values.")
            except Exception as ordering_aet_err:
                logger.warning(f"Unable to adjust orders.ordering_station_aet nullability: {ordering_aet_err}")

            # Align defaults and backfill NULLs for key status timestamps
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

            # Backfill accession numbers when missing and re-apply unique constraint safely
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
            accession_dup = cursor.fetchone()[0]
            if accession_dup == 0:
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

            # Indexes
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_orders_patient_national_id ON orders(patient_national_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_orders_registration_number ON orders(registration_number)")

            # Counter table for sequence-based order numbers
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS order_counters (
                    scope VARCHAR(20) NOT NULL,
                    period_key VARCHAR(8) NOT NULL,
                    counter INTEGER NOT NULL DEFAULT 0,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    PRIMARY KEY (scope, period_key)
                )
                """
            )

            # System configuration table for order number settings
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS system_config (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    config_key VARCHAR(100) NOT NULL UNIQUE,
                    config_value JSONB NOT NULL,
                    status VARCHAR(20) DEFAULT 'active',
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ DEFAULT now()
                )
                """
            )

            # Create index for system_config
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_system_config_key ON system_config(config_key)"
            )

            # Insert default order number configuration if not exists
            cursor.execute(
                """
                INSERT INTO system_config (config_key, config_value, status)
                VALUES (%s, %s, 'active')
                ON CONFLICT (config_key) DO NOTHING
                """,
                (
                    'order_number_config',
                    Json({
                        'prefix': ORDER_NUMBER_PREFIX,
                        'reset': ORDER_NUMBER_RESET,
                        'pad_length': ORDER_NUMBER_PAD_LENGTH,
                        'separator': '',
                        'description': 'Order number generation configuration'
                    })
                )
            )

            # -----------------------------------------------------------------------------
            # Files attached to orders (non-destructive, aligned with SATUSEHAT schema)
            # -----------------------------------------------------------------------------
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS order_files (
                    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                    accession_number VARCHAR(50),
                    filename        TEXT NOT NULL,
                    file_type       TEXT NOT NULL,
                    category        TEXT NOT NULL DEFAULT 'other',
                    size_bytes      BIGINT,
                    storage_path    TEXT,
                    checksum_sha256 TEXT,
                    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
                    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
                    created_by      TEXT,
                    source          TEXT
                )
                """
            )

            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_order_files_order_id ON order_files(order_id)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_order_files_accession ON order_files(accession_number)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_order_files_category ON order_files(category)"
            )

            # -----------------------------------------------------------------------------
            # Order Procedures Table - Support for Multiple Procedures per Order (Migration 014)
            # Each procedure has its own accession number and can be scheduled independently
            # -----------------------------------------------------------------------------
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS order_procedures (
                    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
                    order_id uuid NOT NULL,
                    procedure_code character varying(50) NOT NULL,
                    procedure_name character varying(255) NOT NULL,
                    modality character varying(10) NOT NULL,
                    accession_number character varying(50) NOT NULL UNIQUE,
                    scheduled_at timestamp with time zone,
                    status character varying(20) NOT NULL DEFAULT 'created',
                    sequence_number integer NOT NULL DEFAULT 1,
                    loinc_code character varying(50),
                    loinc_name character varying(200),
                    procedure_description text,
                    created_at timestamp with time zone NOT NULL DEFAULT now(),
                    updated_at timestamp with time zone NOT NULL DEFAULT now(),
                    completed_at timestamp with time zone,
                    completed_by character varying(100),
                    cancelled_at timestamp with time zone,
                    cancelled_by character varying(100),
                    cancelled_reason text,
                    details jsonb DEFAULT '{}'::jsonb,
                    CONSTRAINT order_procedures_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
                )
                """
            )

            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_order_procedures_order_id ON order_procedures(order_id)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_order_procedures_accession_number ON order_procedures(accession_number)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_order_procedures_status ON order_procedures(status)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_order_procedures_modality ON order_procedures(modality)"
            )

            # -----------------------------------------------------------------------------
            # SATUSEHAT Monitoring Schema (Types, Tables, Views)
            # -----------------------------------------------------------------------------
            logger.info("Initializing SATUSEHAT monitoring schema components...")
            
            # Enums
            cursor.execute("""
                DO $$ BEGIN
                  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tx_status') THEN
                    CREATE TYPE tx_status AS ENUM('pending','sending','sent','failed','cancelled','retrying');
                  END IF;
                  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sr_state') THEN
                    CREATE TYPE sr_state AS ENUM('created','sent','failed');
                  END IF;
                  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'is_state') THEN
                    CREATE TYPE is_state AS ENUM('created','sent','failed');
                  END IF;
                END $$;
            """)

            # satusehat_orgs
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS satusehat_orgs (
                  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                  satusehat_org_id   text NOT NULL UNIQUE,
                  name               text NOT NULL,
                  created_at         timestamptz NOT NULL DEFAULT now()
                )
            """)

            # satusehat_service_requests
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS satusehat_service_requests (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                    service_request_id text,
                    status sr_state NOT NULL,
                    request_payload jsonb,
                    response jsonb,
                    sr_identifier_system text,
                    sr_identifier_value text,
                    subject_ref_type text,
                    subject_ref_id text,
                    encounter_ref_id text,
                    requester_ref_id text,
                    created_at timestamptz NOT NULL DEFAULT now(),
                    created_by text,
                    updated_at timestamptz NOT NULL DEFAULT now(),
                    updated_by text
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_sr_order ON satusehat_service_requests(order_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_sr_id ON satusehat_service_requests(service_request_id)")

            # satusehat_encounters
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS satusehat_encounters (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
                    patient_id uuid REFERENCES patients(id) ON DELETE CASCADE,
                    encounter_id text UNIQUE,
                    status text NOT NULL CHECK (status IN ('planned', 'arrived', 'triaged', 'in-progress', 'onleave', 'finished', 'cancelled', 'entered-in-error', 'unknown')),
                    class_code text,
                    class_display text,
                    created_at timestamptz NOT NULL DEFAULT now(),
                    updated_at timestamptz NOT NULL DEFAULT now(),
                    actor_id text
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_enc_order ON satusehat_encounters(order_id)")

            # satusehat_imaging_studies
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS satusehat_imaging_studies (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                    imaging_study_id text,
                    status is_state NOT NULL,
                    request_payload jsonb,
                    response jsonb,
                    created_at timestamptz NOT NULL DEFAULT now(),
                    updated_at timestamptz NOT NULL DEFAULT now()
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_is_order ON satusehat_imaging_studies(order_id)")

            # v_order_prereq_status View
            cursor.execute("DROP VIEW IF EXISTS v_order_prereq_status CASCADE")
            cursor.execute("""
                CREATE OR REPLACE VIEW v_order_prereq_status AS
                WITH sr AS (
                  SELECT order_id,
                         max(created_at) AS sr_last_created,
                         bool_or(status = 'sent') AS sr_sent,
                         (array_agg(service_request_id ORDER BY created_at DESC) FILTER (WHERE status = 'sent'))[1] AS sr_id_sent,
                         (array_agg(sr_identifier_value ORDER BY created_at DESC) FILTER (WHERE status = 'sent'))[1] AS sr_identifier_value,
                         (array_agg(encounter_ref_id ORDER BY created_at DESC) FILTER (WHERE status = 'sent'))[1] AS sr_encounter_ref
                  FROM satusehat_service_requests
                  GROUP BY order_id
                ),
                enc AS (
                  SELECT order_id,
                         max(updated_at) AS enc_last_updated,
                         bool_or(status IN ('in-progress', 'finished')) AS enc_ok,
                         (array_agg(encounter_id ORDER BY updated_at DESC) FILTER (WHERE status IN ('in-progress', 'finished')))[1] AS enc_id_ok
                  FROM satusehat_encounters
                  GROUP BY order_id
                ),
                isx AS (
                  SELECT order_id,
                         bool_or(status = 'sent') AS imaging_study_sent
                  FROM satusehat_imaging_studies
                  GROUP BY order_id
                )
                SELECT o.id AS order_id, o.accession_number, o.modality, o.patient_name,
                       sr.sr_sent, sr.sr_id_sent, sr.sr_identifier_value, sr.sr_encounter_ref,
                       enc.enc_ok, enc.enc_id_ok,
                       coalesce(isx.imaging_study_sent,false) AS imaging_study_sent,
                       sr.sr_last_created, enc.enc_last_updated
                FROM orders o
                LEFT JOIN sr   ON sr.order_id = o.id
                LEFT JOIN enc  ON enc.order_id = o.id
                LEFT JOIN isx  ON isx.order_id = o.id
            """)

            logger.info("Order management database aligned to unified schema (including order_files, order_procedures and SATUSEHAT components)")
            try:
                dict_cursor = conn.cursor(cursor_factory=RealDictCursor)
                dict_cursor.execute("""
                    SELECT
                        id,
                        org_id,
                        patient_national_id,
                        medical_record_number,
                        patient_name,
                        gender,
                        birth_date,
                        satusehat_ihs_number
                    FROM orders
                    WHERE patient_id IS NULL
                """)
                missing_patient_rows = dict_cursor.fetchall()
                if missing_patient_rows:
                    logger.info("Backfilling patient references for %d orders", len(missing_patient_rows))
                    patient_cache = {}
                    for row in missing_patient_rows:
                        cache_key = row.get('patient_national_id') or row.get('medical_record_number')
                        patient_uuid = patient_cache.get(cache_key)
                        if not patient_uuid:
                            try:
                                patient_uuid = ensure_patient_record(cursor, row, org_uuid=row.get('org_id'))
                                if cache_key:
                                    patient_cache[cache_key] = patient_uuid
                            except Exception as backfill_err:
                                logger.warning(
                                    "Unable to backfill patient for order %s: %s",
                                    row.get('id'),
                                    backfill_err
                                )
                                continue
                        try:
                            cursor.execute(
                                "UPDATE orders SET patient_id = %s WHERE id = %s",
                                (patient_uuid, str(row.get('id')))
                            )
                        except Exception as update_err:
                            logger.warning(
                                "Failed to update order %s with patient_id: %s",
                                row.get('id'),
                                update_err
                            )
                dict_cursor.close()
            except Exception as backfill_outer_err:
                logger.warning(f"Patient backfill skipped due to error: {backfill_outer_err}")

    except Exception as e:
        logger.error(f"Failed to initialize database: {str(e)}")
        raise

@app.route('/orders/create_unified', methods=['POST'])
@require_auth(['order:create', '*'])
def create_order_unified():
    """
    Create order via single gate and request accession from accession-api.

    Supports two modes:
    1. Single Procedure (Legacy): Single modality/procedure in root of payload
    2. Multiple Procedures (New): Array of procedures in 'procedures' field
       - Each procedure gets unique accession number
       - Each procedure creates separate worklist item
       - Flow: 1 Order = Multiple Procedures = Multiple Worklist Items
    """
    try:
        data = request.get_json() or {}

        # Check if this is a multi-procedure order
        procedures_array = data.get('procedures')
        is_multi_procedure = isinstance(procedures_array, list) and len(procedures_array) > 0

        def assign_if_missing(target, aliases):
            if _normalize_string(data.get(target)):
                return
            for alias in aliases:
                alias_value = data.get(alias)
                if alias_value is None:
                    continue
                if isinstance(alias_value, str) and alias_value.strip() == "":
                    continue
                data[target] = alias_value
                return

        assign_if_missing('gender', ['patient_gender', 'patient_sex', 'sex'])
        assign_if_missing('birth_date', ['patient_birth_date', 'patient_dob', 'dob'])
        assign_if_missing('satusehat_ihs_number', ['patient_ihs_number', 'ihs_number', 'satusehat_patient_id', 'patientId'])

        # Validation differs for multi-procedure vs single procedure
        if is_multi_procedure:
            # Multi-procedure: modality not required at root level, but at procedure level
            required = ['patient_name', 'gender', 'birth_date']
        else:
            # Single procedure: modality required at root level
            required = ['modality', 'patient_name', 'gender', 'birth_date']

        missing = []
        for field in required:
            normalized_value = _normalize_string(data.get(field))
            data[field] = normalized_value
            if normalized_value is None:
                missing.append(field)

        referring_doctor = _normalize_string(
            data.get('referring_doctor') or data.get('referring_physician')
        )
        if not referring_doctor:
            missing.append('referring_doctor')
        else:
            data['referring_doctor'] = referring_doctor

        loinc_code = _normalize_string(data.get('loinc_code'))
        loinc_name = _normalize_string(data.get('loinc_name'))
        data['loinc_code'] = loinc_code
        data['loinc_name'] = loinc_name

        # Ensure legacy procedure fields are always populated for downstream logic
        if loinc_code and not _normalize_string(data.get('procedure_code')):
            data['procedure_code'] = loinc_code
        if loinc_name and not _normalize_string(data.get('procedure_name')):
            data['procedure_name'] = loinc_name

        # Normalize key identifiers used for deduplication
        dedupe_keys = (
            'registration_number',
            'procedure_code',
            'procedure_name',
            'patient_name',
            'medical_record_number'
        )
        dedupe_values = {}
        for key in dedupe_keys:
            normalized = _normalize_string(data.get(key))
            data[key] = normalized
            dedupe_values[key] = normalized
        dedupe_check_enabled = all(dedupe_values.values())

        if missing:
            return jsonify({'status':'error','message': f"Missing required fields: {', '.join(missing)}"}), 400

        try:
            normalized_gender = _normalize_gender_value(data.get('gender'), field_label='gender', required=True)
            data['gender'] = normalized_gender
        except ValueError as gender_err:
            return jsonify({'status': 'error', 'message': str(gender_err)}), 400

        try:
            birth_date_obj = _normalize_birth_date_value(data.get('birth_date'), field_label='birth_date', required=True)
            data['birth_date'] = birth_date_obj.isoformat()
        except ValueError as birth_err:
            return jsonify({'status': 'error', 'message': str(birth_err)}), 400

        # At least one identifier (NIK or MRN) must be provided
        if not data.get('patient_national_id') and not data.get('medical_record_number'):
            return jsonify({
                'status': 'error',
                'message': 'Either patient_national_id or medical_record_number must be provided'
            }), 400

        # Resolve satusehat_ihs_number early (needed for accession generation)
        satusehat_ihs_number = _normalize_string(
            data.get('satusehat_ihs_number')
            or data.get('patient_ihs_number')
            or data.get('ihs_number')
            or data.get('satusehat_patient_id')
            or data.get('patientId')
        )

        # Debug logging for accession_number handling
        logger.info(f"[DEBUG] Raw accession_number from request: {data.get('accession_number')}")
        logger.info(f"[DEBUG] Raw accession_no from request: {data.get('accession_no')}")
        provided_accession = _normalize_string(data.get('accession_number') or data.get('accession_no'))
        logger.info(f"[DEBUG] After _normalize_string: {provided_accession}")
        accession_number = provided_accession
        if accession_number:
            logger.info("Using accession_number supplied by client: %s", accession_number)
        else:
            acc_url = f"{ACCESSION_API_URL}/accession/create"
            acc_payload = {
                'modality': data['modality'],
                'procedure_code': data.get('procedure_code'),
                'procedure_name': data.get('procedure_name'),
                'scheduled_at': data.get('scheduled_at'),
                'patient_national_id': data.get('patient_national_id'),
                'patient_name': data['patient_name'],
                'gender': data['gender'],
                'birth_date': data['birth_date'],
                'medical_record_number': data.get('medical_record_number'),
                'ihs_number': satusehat_ihs_number,
                'registration_number': data.get('registration_number')
            }
            if satusehat_ihs_number:
                acc_payload['satusehat_ihs_number'] = satusehat_ihs_number
            try:
                resp = requests.post(acc_url, json=acc_payload, timeout=15)
            except requests.RequestException as e:
                logger.error(f"Accession API unreachable: {e!s}")
                return jsonify({ 'status': 'error', 'message': 'Cannot reach accession-api' }), 502
            if resp.status_code >= 300:
                logger.error(f"Accession API {resp.status_code}: {resp.text[:300]}")
                return jsonify({ 'status': 'error', 'message': f"Accession API {resp.status_code}" }), 502
            try:
                acc_json = resp.json()
            except Exception:
                logger.error(f"Accession API non-JSON: {resp.text[:300]}")
                return jsonify({ 'status': 'error', 'message': 'Accession API returned non-JSON' }), 502
            accession_number = acc_json.get('accession_number')
            if not accession_number:
                logger.error(f"Missing accession_number in response: {acc_json}")
                return jsonify({ 'status': 'error', 'message': 'Accession number missing from accession-api response' }), 502

        satusehat_encounter_id = normalize_satusehat_encounter_id(
            data.get('satusehat_encounter_id') or data.get('encounterId')
        )

        # Capture external_system_id for universal tracking
        external_system_id = _normalize_string(
            data.get('external_system_id') or data.get('externalSystemId')
        )
        # Determine source of this order for monitoring (simrs/api/pacs/etc)
        order_source = resolve_order_source(data)
        order_id = uuid.uuid4()
        order_number = generate_order_number()
        actor_info = resolve_request_actor()
        actor_claims = actor_info.get('claims') or {}
        actor_user_id = actor_info.get('id') or actor_claims.get('user_id') or actor_claims.get('sub')
        actor_username = actor_info.get('username') or actor_claims.get('username') or actor_claims.get('email')
        actor_identifier = actor_info.get('identifier')
        actor_display = actor_username or actor_user_id or actor_identifier or 'system'
        created_iso = utc_now_iso()
        created_meta = {'by': actor_display, 'at': created_iso}
        if actor_user_id:
            created_meta['user_id'] = actor_user_id
        if actor_username:
            created_meta['username'] = actor_username
        details_payload = ensure_audit_structure({
            'created': created_meta,
            'updated': None,
            'deleted': None
        })
        with get_db_connection() as conn:
            cursor = conn.cursor()

            # Try to get IHS number from master patient data if patient exists
            # (satusehat_ihs_number was already resolved from request data above)
            patient_id_from_master = None

            # Check if patient already exists in master data using the identifiers from the request
            patient_national_id = data.get('patient_national_id')
            medical_record_number = data.get('medical_record_number')

            if patient_national_id or medical_record_number:
                try:
                    # Try to find patient by NIK first, then MRN
                    if patient_national_id:
                        cursor.execute("SELECT id, ihs_number FROM patients WHERE patient_national_id = %s LIMIT 1", (patient_national_id,))
                        existing_patient = cursor.fetchone()
                        if existing_patient:
                            patient_id_from_master = str(existing_patient[0])
                            # Override with IHS from master data if available
                            if existing_patient[1]:
                                satusehat_ihs_number = existing_patient[1]
                                logger.info(f"Found existing patient {patient_id_from_master} with IHS: {satusehat_ihs_number}")

                    # If not found by NIK but have MRN, try by MRN
                    if not patient_id_from_master and medical_record_number:
                        cursor.execute("SELECT id, ihs_number FROM patients WHERE medical_record_number = %s LIMIT 1", (medical_record_number,))
                        existing_patient = cursor.fetchone()
                        if existing_patient:
                            patient_id_from_master = str(existing_patient[0])
                            # Override with IHS from master data if available
                            if existing_patient[1]:
                                satusehat_ihs_number = existing_patient[1]
                                logger.info(f"Found existing patient {patient_id_from_master} with IHS: {satusehat_ihs_number}")

                except Exception as e:
                    logger.warning(f"Failed to lookup patient in master data: {e}")

            # Update data with final IHS number
            data['satusehat_ihs_number'] = satusehat_ihs_number

            # Enhanced duplicate validation based on examination, patient, and date
            if dedupe_check_enabled:
                # Build date matching condition based on configuration
                date_condition = ""
                date_params = []
                
                if DUPLICATE_DATE_MATCH_MODE == "exact_scheduled":
                    # Only match if scheduled_at dates are exactly the same
                    date_condition = """
                        AND scheduled_at IS NOT NULL 
                        AND DATE(scheduled_at) = CURRENT_DATE
                        AND created_at >= (CURRENT_TIMESTAMP - INTERVAL %s)
                    """
                    date_params = [f"{DUPLICATE_CHECK_WINDOW_HOURS} hours"]
                elif DUPLICATE_DATE_MATCH_MODE == "flexible":
                    # Match either scheduled_at or created_at within window
                    date_condition = """
                        AND (
                          (scheduled_at IS NOT NULL AND DATE(scheduled_at) = CURRENT_DATE
                           AND created_at >= (CURRENT_TIMESTAMP - INTERVAL %s))
                          OR (scheduled_at IS NULL AND created_at >= (CURRENT_TIMESTAMP - INTERVAL %s))
                        )
                    """
                    date_params = [f"{DUPLICATE_CHECK_WINDOW_HOURS} hours", f"{DUPLICATE_CHECK_WINDOW_HOURS} hours"]
                else:  # same_day (default)
                    # Match current date for scheduled_at, or created_at within window
                    date_condition = """
                        AND (
                          (scheduled_at IS NOT NULL AND DATE(scheduled_at) = CURRENT_DATE)
                          OR (scheduled_at IS NULL AND created_at >= (CURRENT_TIMESTAMP - INTERVAL %s))
                        )
                    """
                    date_params = [f"{DUPLICATE_CHECK_WINDOW_HOURS} hours"]
                
                # Build patient matching condition based on strict mode
                patient_condition = ""
                patient_params = []
                
                patient_nik = _normalize_string(data.get('patient_national_id'))
                patient_mrn = _normalize_string(data.get('medical_record_number'))
                
                if DUPLICATE_STRICT_MODE and patient_nik and patient_mrn:
                    # Both NIK and MRN must match
                    patient_condition = """
                        COALESCE(patient_national_id, '') = %s 
                        AND COALESCE(medical_record_number, '') = %s
                    """
                    patient_params = [patient_nik, patient_mrn]
                elif patient_nik and patient_mrn:
                    # Either NIK or MRN can match (more flexible)
                    patient_condition = """
                        (COALESCE(patient_national_id, '') = %s OR COALESCE(medical_record_number, '') = %s)
                    """
                    patient_params = [patient_nik, patient_mrn]
                elif patient_nik:
                    # Only NIK provided
                    patient_condition = "COALESCE(patient_national_id, '') = %s"
                    patient_params = [patient_nik]
                elif patient_mrn:
                    # Only MRN provided
                    patient_condition = "COALESCE(medical_record_number, '') = %s"
                    patient_params = [patient_mrn]
                else:
                    # No patient identifier provided, skip duplicate check
                    patient_condition = "FALSE"
                
                # Only check for duplicates if we have patient condition
                if patient_condition != "FALSE":
                    # Prepare all parameters in correct order
                    query_params = []
                    
                    # Add patient parameters
                    query_params.extend(patient_params)
                    
                    # Add modality parameter
                    modality_val = _normalize_string(data.get('modality'))
                    query_params.append(modality_val)
                    
                    # Add procedure parameters
                    proc_code_val = _normalize_string(data.get('procedure_code'))
                    proc_name_val = _normalize_string(data.get('procedure_name'))
                    query_params.append(proc_code_val)
                    query_params.append(proc_name_val)
                    
                    # Add date parameters
                    query_params.extend(date_params)
                    
                    # Build the complete WHERE clause
                    where_clause = f"""
                        COALESCE(status, '') NOT IN ('DELETED', 'CANCELED', 'CANCELLED', 'VOID')
                        AND ({patient_condition})
                        AND COALESCE(modality, '') = %s
                        AND (
                          (COALESCE(procedure_code, '') <> '' AND COALESCE(procedure_code, '') = %s)
                          OR (COALESCE(procedure_code, '') = '' AND COALESCE(procedure_name, '') = %s)
                        )
                        {date_condition}
                    """
                    
                    cursor.execute(f"""
                        SELECT id, order_number, accession_number, status, patient_national_id,
                               medical_record_number, modality, procedure_code, procedure_name,
                               scheduled_at, created_at, details
                        FROM orders
                        WHERE {where_clause}
                        ORDER BY created_at DESC
                        LIMIT 5
                        """,
                        query_params
                    )
                    duplicates = cursor.fetchall()
                else:
                    # No patient condition, no duplicates to check
                    duplicates = []
                duplicates = cursor.fetchall()
                
                if duplicates:
                    duplicate_info = []
                    auto_canceled = []
                    
                    for dup in duplicates:
                        dup_info = {
                            'id': str(dup['id']),
                            'order_number': dup['order_number'],
                            'accession_number': dup['accession_number'],
                            'status': dup['status'],
                            'created_at': dup['created_at'].isoformat() if dup['created_at'] else None
                        }
                        duplicate_info.append(dup_info)
                        
                        # Auto-cancel existing duplicates if enabled
                        if AUTO_CANCEL_ENABLED:
                            try:
                                actor_info = resolve_request_actor()
                                actor_id = (actor_info.get('id') or actor_info.get('username') or 'system')
                                
                                # Update details with deletion info
                                dup_details = ensure_audit_structure(dup.get('details'), dup.get('created_at'))
                                dup_details['deleted'] = {
                                    'by': actor_id,
                                    'at': utc_now_iso(),
                                    'reason': 'AUTO_CANCEL_DUPLICATE_SAME_DAY'
                                }
                                
                                cursor.execute(
                                    """
                                    UPDATE orders
                                    SET status = 'DELETED',
                                        cancel_at = CURRENT_TIMESTAMP,
                                        cancel_by = %s,
                                        details = %s,
                                        updated_at = CURRENT_TIMESTAMP
                                    WHERE id = %s
                                    """,
                                    (actor_id, Json(dup_details), str(dup['id']))
                                )
                                
                                auto_canceled.append(str(dup['id']))
                                
                                # Log the auto-cancel action
                                log_order_action(
                                    dup['id'],
                                    dup['order_number'],
                                    dup['accession_number'],
                                    'ORDER_AUTO_DELETED_DUPLICATE_SAME_DAY',
                                    {"previous_status": dup['status']},
                                    {
                                        "reason": "AUTO_CANCEL_DUPLICATE_SAME_DAY",
                                        "new_order_candidate": str(order_id)
                                    },
                                    actor_id,
                                    request.remote_addr
                                )
                                
                            except Exception as e:
                                logger.error(f"Failed to auto-cancel duplicate order {dup['id']}: {e}")
                    
                    logger.warning(
                        "Duplicate orders detected and auto-canceled: %s",
                        auto_canceled if auto_canceled else "none"
                    )
                    
                    return jsonify({
                        'status': 'error',
                        'message': 'Duplicate order detected for the same patient, examination, and date',
                        'duplicate_orders': duplicate_info,
                        'auto_canceled': auto_canceled,
                        'action_required': 'Please review the canceled orders or proceed with creating a new order'
                    }), 409

            org_uuid = resolve_default_org_uuid(cursor)
            if not org_uuid:
                logger.error("Cannot resolve default organization UUID for new order insertion.")
                return jsonify({
                    'status': 'error',
                    'message': 'No SATUSEHAT organization configured; cannot assign org_id.'
                }), 500
            try:
                patient_uuid = ensure_patient_record(cursor, data, org_uuid=org_uuid)
            except ValueError as patient_err:
                logger.error(f"Patient validation failed: {patient_err}")
                return jsonify({'status': 'error', 'message': str(patient_err)}), 400
            except Exception as patient_err:
                logger.error(f"Failed to ensure patient record: {patient_err}")
                return jsonify({'status': 'error', 'message': 'Failed to prepare patient record'}), 500

            try:
                ensure_doctor_record(cursor, data)
            except ValueError as doctor_err:
                logger.error(f"Doctor validation failed: {doctor_err}")
                return jsonify({'status': 'error', 'message': str(doctor_err)}), 400
            except Exception as doctor_err:
                logger.error(f"Failed to ensure doctor record: {doctor_err}")
                return jsonify({'status': 'error', 'message': 'Failed to prepare doctor record'}), 500

            # Skip the old duplicate detection since we already handled it above
            # The enhanced duplicate detection above already handles auto-cancel
            auto_canceled = []

            # For multi-procedure orders, use first procedure's data as order-level defaults
            if is_multi_procedure and len(procedures_array) > 0:
                first_proc = procedures_array[0]
                order_modality = _normalize_string(first_proc.get('modality'))
                order_proc_code = _normalize_string(first_proc.get('code') or first_proc.get('procedure_code'))
                order_proc_name = _normalize_string(first_proc.get('name') or first_proc.get('procedure_name'))
                order_loinc_code = _normalize_string(first_proc.get('loinc_code'))
                order_loinc_name = _normalize_string(first_proc.get('loinc_name'))
                # Use first procedure's accession or generate one for order-level
                order_accession = accession_number  # Keep the generated/provided one
            else:
                # Single procedure: use root-level data
                order_modality = data.get('modality')
                order_proc_code = data.get('procedure_code')
                order_proc_name = data.get('procedure_name')
                order_loinc_code = data.get('loinc_code')
                order_loinc_name = data.get('loinc_name')
                order_accession = accession_number

            org_id_value = org_uuid if ORDERS_ORG_ID_IS_UUID else str(org_uuid)
            sql = """
                INSERT INTO orders (
                    id,
                    org_id,
                    patient_id,
                    order_number,
                    accession_number,
                    modality,
                    procedure_code,
                    procedure_name,
                    loinc_code,
                    loinc_name,
                    referring_doctor,
                    attending_nurse,
                    scheduled_at,
                    patient_national_id,
                    patient_name,
                    gender,
                    birth_date,
                    medical_record_number,
                    satusehat_ihs_number,
                    registration_number,
                    status,
                    satusehat_encounter_id,
                    order_source,
                    details,
                    external_system_id
                ) VALUES (
                    %s,  -- id
                    %s,  -- org_id
                    %s,  -- patient_id
                    %s,  -- order_number
                    %s,  -- accession_number
                    %s,  -- modality
                    %s,  -- procedure_code
                    %s,  -- procedure_name
                    %s,  -- loinc_code
                    %s,  -- loinc_name
                    %s,  -- referring_doctor
                    %s,  -- attending_nurse
                    %s,  -- scheduled_at
                    %s,  -- patient_national_id
                    %s,  -- patient_name
                    %s,  -- gender
                    %s,  -- birth_date
                    %s,  -- medical_record_number
                    %s,  -- satusehat_ihs_number
                    %s,  -- registration_number
                    'CREATED',
                    %s,  -- satusehat_encounter_id
                    %s,  -- order_source
                    %s,  -- details
                    %s   -- external_system_id
                )
            """
            params = (
                str(order_id),
                org_id_value,
                patient_uuid,
                order_number,
                order_accession,
                order_modality,
                order_proc_code,
                order_proc_name,
                order_loinc_code,
                order_loinc_name,
                referring_doctor,
                data.get('attending_nurse'),
                data.get('scheduled_at'),
                data.get('patient_national_id'),
                data.get('patient_name'),
                data.get('gender'),
                data.get('birth_date'),
                data.get('medical_record_number'),
                satusehat_ihs_number,
                data.get('registration_number'),
                satusehat_encounter_id,
                order_source,
                Json(details_payload),
                external_system_id
            )
            try:
                cursor.execute(sql, params)
            except errors.UniqueViolation as conflict_err:
                conn.rollback()
                logger.warning("Duplicate order constraint for accession/order number: %s", conflict_err)
                conflict_field = 'accession_number' if accession_number else 'order_number'
                message = f"{conflict_field} already exists."
                return jsonify({'status': 'error', 'message': message}), 409

            # Handle multi-procedure order: insert each procedure into order_procedures table
            created_procedures = []
            if is_multi_procedure:
                for idx, proc in enumerate(procedures_array, start=1):
                    # Create savepoint for each procedure to allow partial rollback
                    savepoint_name = f"proc_{idx}"
                    cursor.execute(f"SAVEPOINT {savepoint_name}")

                    proc_code = _normalize_string(proc.get('code') or proc.get('procedure_code'))
                    proc_name = _normalize_string(proc.get('name') or proc.get('procedure_name'))
                    proc_modality = _normalize_string(proc.get('modality'))
                    proc_loinc_code = _normalize_string(proc.get('loinc_code'))
                    proc_loinc_name = _normalize_string(proc.get('loinc_name'))
                    proc_scheduled = proc.get('scheduled_at') or data.get('scheduled_at')

                    # Validate required procedure fields
                    if not proc_code or not proc_name or not proc_modality:
                        logger.warning(f"Skipping procedure {idx}: missing required fields (code, name, or modality)")
                        cursor.execute(f"ROLLBACK TO SAVEPOINT {savepoint_name}")
                        continue

                    # Get accession number for this procedure (either provided or generate)
                    proc_accession = _normalize_string(proc.get('accession_number') or proc.get('accession_no'))
                    if not proc_accession:
                        # Generate accession number for this procedure
                        acc_url = f"{ACCESSION_API_URL}/accession/create"
                        acc_payload = {
                            'modality': proc_modality,
                            'procedure_code': proc_code,
                            'procedure_name': proc_name,
                            'scheduled_at': proc_scheduled,
                            'patient_national_id': data.get('patient_national_id'),
                            'patient_name': data['patient_name'],
                            'gender': data['gender'],
                            'birth_date': data['birth_date'],
                            'medical_record_number': data.get('medical_record_number'),
                            'ihs_number': satusehat_ihs_number,
                            'registration_number': data.get('registration_number')
                        }
                        if satusehat_ihs_number:
                            acc_payload['satusehat_ihs_number'] = satusehat_ihs_number
                        try:
                            resp = requests.post(acc_url, json=acc_payload, timeout=15)
                            if resp.status_code < 300:
                                acc_json = resp.json()
                                proc_accession = acc_json.get('accession_number')
                            else:
                                logger.error(f"Failed to generate accession for procedure {idx}: {resp.status_code}")
                                cursor.execute(f"ROLLBACK TO SAVEPOINT {savepoint_name}")
                                continue
                        except Exception as acc_err:
                            logger.error(f"Accession API error for procedure {idx}: {acc_err}")
                            cursor.execute(f"ROLLBACK TO SAVEPOINT {savepoint_name}")
                            continue

                    if not proc_accession:
                        logger.warning(f"Skipping procedure {idx}: no accession number")
                        cursor.execute(f"ROLLBACK TO SAVEPOINT {savepoint_name}")
                        continue

                    # Insert procedure into order_procedures table
                    try:
                        cursor.execute(
                            """
                            INSERT INTO order_procedures (
                                order_id,
                                procedure_code,
                                procedure_name,
                                modality,
                                accession_number,
                                scheduled_at,
                                sequence_number,
                                loinc_code,
                                loinc_name,
                                status,
                                details
                            ) VALUES (
                                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
                            )
                            RETURNING id
                            """,
                            (
                                str(order_id),
                                proc_code,
                                proc_name,
                                proc_modality,
                                proc_accession,
                                proc_scheduled,
                                idx,
                                proc_loinc_code,
                                proc_loinc_name,
                                'created',
                                Json({'created_by': actor_display, 'created_at': utc_now_iso()})
                            )
                        )
                        proc_result = cursor.fetchone()
                        proc_id = str(proc_result[0]) if proc_result else None

                        created_procedures.append({
                            'id': proc_id,
                            'sequence': idx,
                            'code': proc_code,
                            'name': proc_name,
                            'modality': proc_modality,
                            'accession_number': proc_accession,
                            'scheduled_at': proc_scheduled,
                            'status': 'created'
                        })

                        logger.info(f"Created procedure {idx}/{len(procedures_array)}: {proc_name} ({proc_accession})")
                        # Release savepoint since procedure was inserted successfully
                        cursor.execute(f"RELEASE SAVEPOINT {savepoint_name}")

                    except errors.UniqueViolation as proc_conflict:
                        # Rollback to savepoint to continue processing other procedures
                        cursor.execute(f"ROLLBACK TO SAVEPOINT {savepoint_name}")
                        logger.warning(f"Procedure {idx} accession number conflict: {proc_conflict}")
                        continue
                    except Exception as proc_err:
                        # Rollback to savepoint to continue processing other procedures
                        cursor.execute(f"ROLLBACK TO SAVEPOINT {savepoint_name}")
                        logger.error(f"Failed to insert procedure {idx}: {proc_err}", exc_info=True)
                        continue

            # Log action
            log_order_action(
                order_id, order_number, accession_number, 'ORDER_CREATED',
                None, data,
                actor_user_id or actor_username or actor_display,
                request.remote_addr
            )

        # Build response
        order_response = {
            'id': str(order_id),
            'order_number': order_number,
            'accession_number': order_accession,
            'modality': order_modality,
            'procedure_code': order_proc_code,
            'procedure_name': order_proc_name,
            'loinc_code': order_loinc_code,
            'loinc_name': order_loinc_name,
            'scheduled_at': data.get('scheduled_at'),
            'patient_national_id': data.get('patient_national_id'),
            'patient_name': data.get('patient_name'),
            'gender': data.get('gender'),
            'birth_date': data.get('birth_date'),
            'medical_record_number': data.get('medical_record_number'),
            'satusehat_ihs_number': satusehat_ihs_number,
            'registration_number': data.get('registration_number'),
            'referring_doctor': referring_doctor,
            'patient_id': patient_uuid,
            'satusehat_encounter_id': satusehat_encounter_id,
            'attending_nurse': data.get('attending_nurse'),
            'order_source': order_source,
            'details': details_payload,
            'status': 'CREATED'
        }

        # Add procedures to response if multi-procedure order
        if is_multi_procedure and created_procedures:
            order_response['procedures'] = created_procedures
            order_response['procedure_count'] = len(created_procedures)

        return jsonify({
            'status': 'success',
            'order': order_response
        }), 201
    except Exception as e:
        logger.error(f"Error creating order: {str(e)}")
        return jsonify({ 'status': 'error', 'message': str(e) }), 500

@app.route('/orders/create', methods=['POST'])
@require_auth(['order:create', '*'])
def create_order():
    # Wrapper to use unified implementation
    return create_order_unified()

@app.route('/', methods=['GET'])
def index():
    return jsonify({
        "service": "Order Management Service",
        "version": "1.0",
        "description": "SIMRS Order Simulator with Accession Number Generator & Duplicate Detection",
        "features": [
            "Auto Accession Number generation",
            "Order data persistence",
            "SATUSEHAT integration",
            "MWL Worklist creation",
            "Complete flow automation",
            "Order files upload/download (DICOM, docs, etc.)",
            "Duplicate order detection & auto-cancel",
            "Enhanced filtering & reporting"
        ],
        "status": "running",
        "endpoints": {
            "service_info": "GET /",
            "health_check": "GET /health",
            "create_order": "POST /orders/create",
            "list_orders": "GET /orders/list",
            "get_order": "GET /orders/<id>",
            "update_order": "PUT /orders/<id>",
            "delete_order": "DELETE /orders/<id>",
            "purge_order": "DELETE /orders/<id>/purge",
            "sync_satusehat": "POST /orders/<id>/sync-satusehat",
            "create_worklist": "POST /orders/<id>/create-worklist",
            "complete_flow": "POST /orders/complete-flow",
            "order_files": {
                "list": "GET /orders/<id>/files",
                "upload": "POST /orders/<id>/files",
                "delete": "DELETE /orders/<id>/files/<file_id>",
                "download": "GET /orders/<id>/files/<file_id>/content"
            },
            "duplicate_management": {
                "list_duplicates": "GET /orders/duplicates",
                "auto_cancel_duplicates": "POST /orders/duplicates/auto-cancel"
            },
            "statistics": {
                "source_stats": "GET /orders/source-stats",
                "satusehat_stats": "GET /orders/satusehat-stats",
                "source_status_stats": "GET /orders/source-status-stats",
                "satusehat_not_synced": "GET /orders/satusehat-not-synced"
            }
        },
        "duplicate_detection": {
            "enabled": AUTO_CANCEL_ENABLED,
            "check_window_hours": DUPLICATE_CHECK_WINDOW_HOURS,
            "criteria": [
                "Same patient (NIK or MRN)",
                "Same examination (modality + procedure)",
                "Same date (scheduled_at or created_at)"
            ],
            "auto_cancel_behavior": "Soft delete existing duplicates when creating new order"
        }
    }), 200

@app.route('/health', methods=['GET'])
def health():
    db_status = "unknown"
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            db_status = "healthy"
    except:
        db_status = "unhealthy"
    
    return jsonify({
        "status": "healthy",
        "service": "order-management",
        "database": db_status,
        "timestamp": datetime.now().isoformat()
    }), 200



@app.route('/orders/source-stats', methods=['GET'])
@require_auth(['order:read', '*'])
def source_stats():
    """
    Aggregated count of orders by order_source for dashboard/monitoring.

    Features:
    - Excludes orders with status = 'DELETED'.
    - Normalizes order_source to lower-case; null/empty -> 'unknown'.
    - Optional time filter via ?from= & ?to= based on created_at.
    - Optional time series via ?group_by=day.
    """
    try:
        # Read filters
        from_param = request.args.get('from')
        to_param = request.args.get('to')
        group_by = (request.args.get('group_by') or '').lower().strip()

        def parse_ts(value, is_end=False):
            if not value:
                return None
            v = value.strip()
            # If only date provided, interpret:
            # - from: YYYY-MM-DDT00:00:00Z
            # - to:   YYYY-MM-DDT23:59:59.999Z (implemented as next day start)
            try:
                if len(v) == 10 and v[4] == '-' and v[7] == '-':
                    dt = datetime.strptime(v, "%Y-%m-%d")
                    if is_end:
                        return dt + timedelta(days=1)
                    return dt
                # Otherwise, let datetime parse ISO-like string
                # Note: no timezone conversion; assume UTC-compatible input
                return datetime.fromisoformat(v.replace('Z', '+00:00'))
            except Exception:
                return None

        from_ts = parse_ts(from_param, is_end=False)
        to_ts = parse_ts(to_param, is_end=True)

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Build WHERE conditions
            where_clauses = ["COALESCE(status, '') <> 'DELETED'"]
            params = []

            if from_ts:
                where_clauses.append("created_at >= %s")
                params.append(from_ts)
            if to_ts:
                where_clauses.append("created_at < %s")
                params.append(to_ts)

            where_sql = " AND ".join(where_clauses) if where_clauses else "TRUE"

            # Time series mode
            if group_by == 'day':
                cursor.execute(
                    f"""
                    SELECT
                        DATE(created_at) AS day,
                        COALESCE(NULLIF(LOWER(TRIM(order_source)), ''), 'unknown') AS source,
                        COUNT(*)::bigint AS count
                    FROM orders
                    WHERE {where_sql}
                    GROUP BY DATE(created_at),
                             COALESCE(NULLIF(LOWER(TRIM(order_source)), ''), 'unknown')
                    ORDER BY day ASC, source ASC
                    """,
                    params
                )
                rows = cursor.fetchall()
                if not rows:
                    return jsonify({
                        "status": "success",
                        "mode": "by_day",
                        "total": 0,
                        "sources_summary": [],
                        "by_day": []
                    }), 200

                # Aggregate per day
                by_day_map = {}
                summary_map = {}
                for r in rows:
                    day = r['day'].strftime("%Y-%m-%d")
                    src = r['source']
                    c = int(r['count'])

                    # per-day
                    d = by_day_map.setdefault(day, {"day": day, "total": 0, "sources": {}})
                    d["total"] += c
                    d["sources"][src] = d["sources"].get(src, 0) + c

                    # global summary
                    summary_map[src] = summary_map.get(src, 0) + c

                # Build output structures
                by_day = []
                for day, info in sorted(by_day_map.items()):
                    total_day = info["total"]
                    src_list = []
                    for src, c in sorted(info["sources"].items(), key=lambda x: -x[1]):
                        pct = (c / total_day * 100.0) if total_day > 0 else 0.0
                        src_list.append({
                            "source": src,
                            "count": c,
                            "percentage": round(pct, 2)
                        })
                    by_day.append({
                        "day": day,
                        "total": total_day,
                        "sources": src_list
                    })

                total_all = sum(summary_map.values())
                sources_summary = []
                for src, c in sorted(summary_map.items(), key=lambda x: -x[1]):
                    pct = (c / total_all * 100.0) if total_all > 0 else 0.0
                    sources_summary.append({
                        "source": src,
                        "count": c,
                        "percentage": round(pct, 2)
                    })

                return jsonify({
                    "status": "success",
                    "mode": "by_day",
                    "total": total_all,
                    "sources_summary": sources_summary,
                    "by_day": by_day
                }), 200

            # Default: aggregated summary mode
            cursor.execute(
                f"""
                SELECT
                    COALESCE(NULLIF(LOWER(TRIM(order_source)), ''), 'unknown') AS source,
                    COUNT(*)::bigint AS count
                FROM orders
                WHERE {where_sql}
                GROUP BY COALESCE(NULLIF(LOWER(TRIM(order_source)), ''), 'unknown')
                ORDER BY count DESC
                """,
                params
            )
            rows = cursor.fetchall()

            total = sum(int(r['count']) for r in rows) if rows else 0
            sources = []
            for r in rows:
                c = int(r['count'])
                pct = (c / total * 100.0) if total > 0 else 0.0
                sources.append({
                    "source": r['source'],
                    "count": c,
                    "percentage": round(pct, 2)
                })

            return jsonify({
                "status": "success",
                "mode": "summary",
                "total": total,
                "sources": sources
            }), 200

    except Exception as e:
        logger.error(f"Error generating source stats: {str(e)}", exc_info=True)
        return jsonify({
            "status": "error",
            "message": "Failed to compute order source stats",
            "detail": str(e)
        }), 500


@app.route('/orders/satusehat-not-synced', methods=['GET'])
@require_auth(['order:read', '*'])
def satusehat_not_synced_list():
    """
    List detail orders yang BELUM tersinkron ke SatuSehat (untuk follow-up).

    Kriteria:
      - status != 'DELETED'
      - satusehat_synced = FALSE atau satusehat_synced IS NULL

    Query params:
      - from:   (opsional) created_at >=, YYYY-MM-DD atau ISO (Z didukung)
      - to:     (opsional) created_at <, YYYY-MM-DD -> +1 hari (exclusive)
      - modality: (opsional) filter exact modality
      - source:   (opsional) filter exact order_source (case-insensitive)
      - limit:    (opsional) default 50, max 500
      - offset:   (opsional) default 0

    Response:
      {
        "status": "success",
        "orders": [ ... ],
        "count": 10,
        "total": 123,
        "limit": 50,
        "offset": 0
      }
    """
    try:
        from_param = request.args.get('from')
        to_param = request.args.get('to')
        modality = request.args.get('modality')
        source = request.args.get('source')
        limit = request.args.get('limit', 50, type=int)
        offset = request.args.get('offset', 0, type=int)

        # Boundaries untuk hindari abuse
        if limit is None or limit < 1:
            limit = 1
        if limit > 500:
            limit = 500
        if offset is None or offset < 0:
            offset = 0

        def parse_ts(value, is_end=False):
            if not value:
                return None
            v = value.strip()
            try:
                # YYYY-MM-DD
                if len(v) == 10 and v[4] == '-' and v[7] == '-':
                    dt = datetime.strptime(v, "%Y-%m-%d")
                    return dt + timedelta(days=1) if is_end else dt
                # ISO datetime (dukung Z)
                return datetime.fromisoformat(v.replace('Z', '+00:00'))
            except Exception:
                return None

        from_ts = parse_ts(from_param, is_end=False)
        to_ts = parse_ts(to_param, is_end=True)

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            where_clauses = [
                "status != 'DELETED'",
                "(satusehat_synced = FALSE OR satusehat_synced IS NULL)"
            ]
            params = []

            if from_ts:
                where_clauses.append("created_at >= %s")
                params.append(from_ts)

            if to_ts:
                where_clauses.append("created_at < %s")
                params.append(to_ts)

            if modality:
                where_clauses.append("modality = %s")
                params.append(modality)

            if source:
                where_clauses.append("LOWER(COALESCE(order_source, '')) = %s")
                params.append(source.strip().lower())

            where_sql = " AND ".join(where_clauses) if where_clauses else "TRUE"

            # Hitung total
            cursor.execute(
                f"SELECT COUNT(*) AS total FROM orders WHERE {where_sql}",
                params
            )
            total = int((cursor.fetchone() or {}).get('total') or 0)

            # Ambil page data
            cursor.execute(
                f"""
                SELECT
                    id,
                    order_number,
                    accession_number,
                    patient_name,
                    patient_national_id,
                    medical_record_number,
                    modality,
                    procedure_code,
                    procedure_name,
                    registration_number,
                    order_source,
                    status,
                    order_status,
                    worklist_status,
                    satusehat_synced,
                    satusehat_encounter_id,
                    satusehat_service_request_id,
                    satusehat_sync_date,
                    created_at
                FROM orders
                WHERE {where_sql}
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s
                """,
                params + [limit, offset]
            )
            rows = cursor.fetchall() or []

            # Normalisasi id ke string
            for r in rows:
                if r.get('id') is not None:
                    r['id'] = str(r['id'])

            return jsonify({
                "status": "success",
                "orders": rows,
                "count": len(rows),
                "total": total,
                "limit": limit,
                "offset": offset
            }), 200

    except Exception as e:
        logger.error(f"Error listing SatuSehat not-synced orders: {str(e)}", exc_info=True)
        return jsonify({
            "status": "error",
            "message": "Failed to list SatuSehat not-synced orders",
            "detail": str(e)
        }), 500


@app.route('/orders/satusehat-status', methods=['GET'])
@require_auth(['order:read', '*'])
def list_orders_satusehat_status():
    """
    List SatuSehat status untuk banyak order (untuk dashboard).

    Fitur:
      - Hanya orders dengan status != 'DELETED'.
      - Opsional filter:
          ?satusehat_synced=true|false
          ?from=YYYY-MM-DD atau ISO
          ?to=YYYY-MM-DD atau ISO
          ?modality=CT
          ?source=simrs
      - Pagination:
          ?limit=50 (max 500)
          ?offset=0

    Setiap item mengandung:
      - id, order_number, accession_number
      - patient_name, modality, order_source
      - status, order_status
      - satusehat_synced, satusehat_sync_date, satusehat_service_request_id
      - created_at, updated_at
      - satusehat_sync_details (dari details.satusehat_sync jika ada)
      - updated_audit (dari details.updated jika ada)
    """
    try:
        satusehat_synced_param = request.args.get('satusehat_synced')
        from_param = request.args.get('from')
        to_param = request.args.get('to')
        modality = request.args.get('modality')
        source = request.args.get('source')
        limit = request.args.get('limit', 50, type=int)
        offset = request.args.get('offset', 0, type=int)

        if limit is None or limit < 1:
            limit = 1
        if limit > 500:
            limit = 500
        if offset is None or offset < 0:
            offset = 0

        def parse_ts(value, is_end=False):
            if not value:
                return None
            v = value.strip()
            try:
                if len(v) == 10 and v[4] == '-' and v[7] == '-':
                    dt = datetime.strptime(v, "%Y-%m-%d")
                    return dt + timedelta(days=1) if is_end else dt
                return datetime.fromisoformat(v.replace('Z', '+00:00'))
            except Exception:
                return None

        from_ts = parse_ts(from_param, is_end=False)
        to_ts = parse_ts(to_param, is_end=True)

        # Hanya tampilkan orders yang sudah punya worklist (via worklist_status terisi atau entry di worklist_items)
        where_clauses = [
            "o.status != 'DELETED'",
            "("
            "COALESCE(NULLIF(o.worklist_status, ''), '') <> '' "
            "OR EXISTS (SELECT 1 FROM worklist_items wi WHERE wi.accession_number = o.accession_number)"
            ")"
        ]
        params = []

        # Filter satusehat_synced (treat ImagingStudy sent as synced as well)
        if satusehat_synced_param is not None:
            raw = satusehat_synced_param.strip().lower()
            synced_expr = (
                "o.satusehat_synced = TRUE "
                "OR EXISTS (SELECT 1 FROM satusehat_imaging_studies sis WHERE sis.order_id = o.id AND sis.status = 'sent')"
            )
            not_synced_expr = (
                "(COALESCE(o.satusehat_synced, FALSE) = FALSE) "
                "AND NOT EXISTS (SELECT 1 FROM satusehat_imaging_studies sis WHERE sis.order_id = o.id AND sis.status = 'sent')"
            )
            if raw in ('true', '1', 'yes', 'y'):
                where_clauses.append(f"({synced_expr})")
            elif raw in ('false', '0', 'no', 'n'):
                where_clauses.append(f"({not_synced_expr})")

        if from_ts:
            where_clauses.append("created_at >= %s")
            params.append(from_ts)

        if to_ts:
            where_clauses.append("created_at < %s")
            params.append(to_ts)

        if modality:
            where_clauses.append("modality = %s")
            params.append(modality)

        if source:
            where_clauses.append("LOWER(COALESCE(order_source, '')) = %s")
            params.append(source.strip().lower())

        where_sql = " AND ".join(where_clauses) if where_clauses else "TRUE"

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Total
            cursor.execute(
                f"SELECT COUNT(*) AS total FROM orders o WHERE {where_sql}",
                params
            )
            total = int((cursor.fetchone() or {}).get('total') or 0)

            # Page data
            cursor.execute(
                f"""
                SELECT
                    o.id,
                    o.order_number,
                    o.accession_number,
                    o.patient_name,
                    o.modality,
                    o.order_source,
                    o.status,
                    o.order_status,
                    COALESCE(o.worklist_status, wl.sps_status) AS worklist_status,
                    o.satusehat_synced,
                    o.satusehat_sync_date,
                    o.satusehat_service_request_id,
                    isx.imaging_study_sent,
                    isx.imaging_study_id,
                    isx.imaging_study_sent_at,
                    srl.imaging_study_sent_router,
                    srl.imaging_study_id_router,
                    srl.imaging_study_sent_at_router,
                    o.created_at,
                    o.updated_at,
                    o.details
                FROM orders o
                LEFT JOIN LATERAL (
                    SELECT sps_status
                    FROM worklist_items wi
                    WHERE wi.accession_number = o.accession_number
                    ORDER BY wi.updated_at DESC NULLS LAST, wi.created_at DESC NULLS LAST
                    LIMIT 1
                ) wl ON TRUE
                LEFT JOIN LATERAL (
                    SELECT
                        bool_or(status = 'sent') AS imaging_study_sent,
                        max(imaging_study_id) FILTER (WHERE imaging_study_id IS NOT NULL AND status = 'sent') AS imaging_study_id,
                        max(updated_at) FILTER (WHERE status = 'sent') AS imaging_study_sent_at
                    FROM satusehat_imaging_studies sis
                    WHERE sis.order_id = o.id
                ) isx ON TRUE
                LEFT JOIN LATERAL (
                    SELECT
                        bool_or(COALESCE(success, false)) AS imaging_study_sent_router,
                        max(imaging_study_id) FILTER (WHERE success = TRUE AND imaging_study_id IS NOT NULL) AS imaging_study_id_router,
                        max(created_at) FILTER (WHERE success = TRUE AND imaging_study_id IS NOT NULL) AS imaging_study_sent_at_router
                    FROM satusehat_router_logs srl
                    WHERE (srl.request_payload ->> 'accession_number') = o.accession_number
                ) srl ON TRUE
                WHERE {where_sql}
                ORDER BY o.created_at DESC
                LIMIT %s OFFSET %s
                """,
                params + [limit, offset]
            )
            rows = cursor.fetchall() or []

            results = []
            for r in rows:
                # normalize id
                if r.get('id') is not None:
                    r_id = str(r['id'])
                else:
                    r_id = None

                details = r.get('details')
                if isinstance(details, dict):
                    satusehat_sync_details = details.get('satusehat_sync')
                    updated_audit = details.get('updated')
                else:
                    satusehat_sync_details = None
                    updated_audit = None

                satusehat_synced_effective = (
                    bool(r.get('satusehat_synced'))
                    or bool(r.get('imaging_study_sent'))
                    or bool(r.get('imaging_study_sent_router'))
                )

                results.append({
                    "order_id": r_id,
                    "order_number": r.get('order_number'),
                    "accession_number": r.get('accession_number'),
                    "patient_name": r.get('patient_name'),
                    "modality": r.get('modality'),
                    "order_source": r.get('order_source'),
                    "status": r.get('status'),
                    "order_status": r.get('status') or r.get('order_status'),
                    "worklist_status": r.get('worklist_status'),
                    "satusehat_synced": satusehat_synced_effective,
                    "satusehat_sync_date": r.get('satusehat_sync_date'),
                    "satusehat_service_request_id": r.get('satusehat_service_request_id'),
                    "imaging_study_sent": bool(r.get('imaging_study_sent') or r.get('imaging_study_sent_router')),
                    "imaging_study_id": r.get('imaging_study_id') or r.get('imaging_study_id_router'),
                    "imaging_study_sent_at": r.get('imaging_study_sent_at') or r.get('imaging_study_sent_at_router'),
                    "created_at": r.get('created_at'),
                    "updated_at": r.get('updated_at'),
                    "satusehat_sync_details": satusehat_sync_details,
                    "updated_audit": updated_audit
                })

            return jsonify({
                "status": "success",
                "orders": results,
                "count": len(results),
                "total": total,
                "limit": limit,
                "offset": offset
            }), 200

    except Exception as e:
        logger.error(f"Error listing SatuSehat status for orders: {str(e)}", exc_info=True)
        return jsonify({
            "status": "error",
            "message": "Failed to list SatuSehat status for orders",
            "detail": str(e)
        }), 500


@app.route('/orders/<identifier>/satusehat-status', methods=['GET'])
@require_auth(['order:read', '*'])
def get_order_satusehat_status(identifier):
    """
    Get concise SatuSehat status info for a specific order.

    Identifier:
      - UUID id, atau
      - accession_number, atau
      - order_number

    Hanya mengembalikan order dengan status != 'DELETED'.
    """
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Resolve order by id / accession_number / order_number
            try:
                uuid_obj = uuid.UUID(identifier)
                cursor.execute("""
                    SELECT *
                    FROM orders
                    WHERE id = %s AND status != 'DELETED'
                """, (str(uuid_obj),))
            except ValueError:
                cursor.execute("""
                    SELECT *
                    FROM orders
                    WHERE (accession_number = %s OR order_number = %s)
                      AND status != 'DELETED'
                """, (identifier, identifier))

            order = cursor.fetchone()
            if not order:
                return jsonify({"status": "error", "message": "Order not found"}), 404

            # Normalisasi id
            if order.get('id') is not None:
                order_id = str(order['id'])
            else:
                order_id = None

            # Ambil blok details jika ada
            details = order.get('details')
            if isinstance(details, dict):
                satusehat_sync_details = details.get('satusehat_sync')
                updated_audit = details.get('updated')
            else:
                satusehat_sync_details = None
                updated_audit = None

            cursor.execute(
                """
                SELECT
                    bool_or(status = 'sent') AS imaging_study_sent,
                    max(imaging_study_id) FILTER (WHERE imaging_study_id IS NOT NULL AND status = 'sent') AS imaging_study_id,
                    max(updated_at) FILTER (WHERE status = 'sent') AS imaging_study_sent_at
                FROM satusehat_imaging_studies
                WHERE order_id = %s
                """,
                (order_id,)
            )
            imaging_info = cursor.fetchone() or {}

            cursor.execute(
                """
                SELECT
                    bool_or(COALESCE(success, false)) AS imaging_study_sent_router,
                    max(imaging_study_id) FILTER (WHERE success = TRUE AND imaging_study_id IS NOT NULL) AS imaging_study_id_router,
                    max(created_at) FILTER (WHERE success = TRUE AND imaging_study_id IS NOT NULL) AS imaging_study_sent_at_router
                FROM satusehat_router_logs
                WHERE (request_payload ->> 'accession_number') = %s
                """,
                (order.get('accession_number'),)
            )
            router_info = cursor.fetchone() or {}

            satusehat_synced_effective = (
                bool(order.get('satusehat_synced'))
                or bool(imaging_info.get('imaging_study_sent'))
                or bool(router_info.get('imaging_study_sent_router'))
            )

            resp = {
                "status": "success",
                "order_id": order_id,
                "order_number": order.get('order_number'),
                "accession_number": order.get('accession_number'),
                "satusehat_synced": satusehat_synced_effective,
                "satusehat_sync_date": order.get('satusehat_sync_date'),
                "satusehat_service_request_id": order.get('satusehat_service_request_id'),
                "order_status": order.get('order_status') or order.get('status'),
                "last_updated": order.get('updated_at'),
                "imaging_study_sent": bool(imaging_info.get('imaging_study_sent') or router_info.get('imaging_study_sent_router')),
                "imaging_study_id": imaging_info.get('imaging_study_id') or router_info.get('imaging_study_id_router'),
                "imaging_study_sent_at": imaging_info.get('imaging_study_sent_at') or router_info.get('imaging_study_sent_at_router'),
                "satusehat_sync_details": satusehat_sync_details,
                "updated_audit": updated_audit
            }

            return jsonify(resp), 200

    except Exception as e:
        logger.error(f"Error getting SatuSehat status for order {identifier}: {str(e)}", exc_info=True)
        return jsonify({
            "status": "error",
            "message": "Failed to get SatuSehat status for order",
            "detail": str(e)
        }), 500


@app.route('/orders/<identifier>/satusehat-readiness', methods=['GET'])
@require_auth(['order:read', '*'])
def order_satusehat_readiness(identifier):
    """
    Readiness check sebelum sync ke SATUSEHAT.

    - Identifier boleh UUID id, accession_number, atau order_number.
    - Data sumber: view v_order_prereq_status (encounter, service request, imaging study).
    - ready_to_sync = service_request_sent AND encounter_ok (imaging study optional).
    """
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Resolve order id by id / accession_number / order_number
            try:
                uuid_obj = uuid.UUID(identifier)
                cursor.execute(
                    "SELECT * FROM orders WHERE id = %s",
                    (str(uuid_obj),)
                )
            except ValueError:
                cursor.execute(
                    """
                    SELECT *
                    FROM orders
                    WHERE accession_number = %s OR order_number = %s
                    """,
                    (identifier, identifier)
                )

            order_row = cursor.fetchone()
            if not order_row:
                return jsonify({"status": "error", "message": "Order not found"}), 404

            order_id = order_row.get("id")

            # Normalize SR ID (strip prefix) and upsert SR audit if missing
            sr_raw = order_row.get("satusehat_service_request_id")
            sr_id_norm = None
            if sr_raw:
                sr_str = str(sr_raw).strip()
                sr_id_norm = sr_str.split("/", 1)[-1] if sr_str.lower().startswith("servicerequest/") else sr_str
                if sr_id_norm != sr_str:
                    cursor.execute(
                        "UPDATE orders SET satusehat_service_request_id = %s, updated_at = NOW() WHERE id = %s",
                        (sr_id_norm, order_id)
                    )
            # Normalize encounter ID (strip prefix if present) in order
            satusehat_encounter_id = order_row.get("satusehat_encounter_id")
            if satusehat_encounter_id:
                enc_str = str(satusehat_encounter_id).strip()
                enc_norm = enc_str.split("/", 1)[-1] if enc_str.lower().startswith("encounter/") else enc_str
                if enc_norm != enc_str:
                    cursor.execute(
                        "UPDATE orders SET satusehat_encounter_id = %s, updated_at = NOW() WHERE id = %s",
                        (enc_norm, order_id)
                    )
                    satusehat_encounter_id = enc_norm

            # Auto-heal encounter audit row if order already carries encounter_id
            if satusehat_encounter_id:
                try:
                    # Try update existing to in-progress/finished class
                    cursor.execute(
                        """
                        UPDATE satusehat_encounters
                        SET status = %s, updated_at = NOW()
                        WHERE encounter_id = %s
                          AND status NOT IN ('in-progress','finished')
                        """,
                        ("in-progress", satusehat_encounter_id)
                    )
                    if cursor.rowcount == 0:
                        # Ensure row exists
                        upsert_satusehat_encounter(
                            cursor,
                            order_row,
                            satusehat_encounter_id,
                            status="in-progress"
                        )
                except Exception as heal_err:
                    logger.warning("Auto-heal satusehat_encounter upsert failed: %s", heal_err)

            # Auto-insert SR audit if missing but order has SR ID
            if sr_id_norm:
                cursor.execute(
                    "SELECT 1 FROM satusehat_service_requests WHERE order_id = %s AND service_request_id = %s LIMIT 1",
                    (order_id, sr_id_norm)
                )
                if cursor.fetchone() is None:
                    try:
                        insert_satusehat_service_request(
                            cursor,
                            order_row,
                            sr_id_norm,
                            status="sent",
                            extra={
                                "encounter_ref_id": satusehat_encounter_id,
                                "sr_identifier_value": order_row.get("accession_number")
                            },
                            actor_id=resolve_request_actor().get("id") or resolve_request_actor().get("username") or "system"
                        )
                    except Exception as heal_sr_err:
                        logger.warning("Auto-heal satusehat_service_request insert failed: %s", heal_sr_err)

            # Fetch readiness info from view
            cursor.execute(
                "SELECT * FROM v_order_prereq_status WHERE order_id = %s",
                (order_id,)
            )
            readiness = cursor.fetchone() or {}

            sr_sent = bool(readiness.get("sr_sent"))
            enc_ok = bool(readiness.get("enc_ok"))
            imaging_study_sent = bool(readiness.get("imaging_study_sent"))

            payload = {
                "status": "success",
                "order_id": str(order_id),
                "order_number": order_row.get("order_number"),
                "accession_number": order_row.get("accession_number"),
                "patient_name": order_row.get("patient_name"),
                "modality": order_row.get("modality"),
                "ready_to_sync": sr_sent and enc_ok,
                "checks": {
                    "service_request_sent": sr_sent,
                    "service_request_id": readiness.get("sr_id_sent"),
                    "service_request_identifier": readiness.get("sr_identifier_value"),
                    "service_request_encounter_ref": readiness.get("sr_encounter_ref"),
                    "encounter_ok": enc_ok,
                    "encounter_id": readiness.get("enc_id_ok"),
                    "imaging_study_sent": imaging_study_sent,
                    "service_request_last_created": readiness.get("sr_last_created"),
                    "encounter_last_updated": readiness.get("enc_last_updated"),
                }
            }

            return jsonify(payload), 200

    except Exception as e:
        logger.error(f"Error checking satusehat readiness for {identifier}: {str(e)}", exc_info=True)
        return jsonify({
            "status": "error",
            "message": "Failed to check satusehat readiness",
            "detail": str(e)
        }), 500


@app.route('/orders/<identifier>/satusehat-refs', methods=['PUT', 'PATCH'])
@require_auth(['order:update', '*'])
def update_satusehat_refs(identifier):
    """
    Update referensi SATUSEHAT di order (encounter_id / service_request_id / ihs_number).

    Body (opsional):
      - satusehat_encounter_id / encounter_id / encounterId
      - satusehat_service_request_id / service_request_id / serviceRequestId
      - satusehat_ihs_number / ihs_number / patientId
    """
    try:
        payload = request.get_json(silent=True) or {}
        enc_raw = (
            payload.get("satusehat_encounter_id")
            or payload.get("encounter_id")
            or payload.get("encounterId")
        )
        sr_id_raw = (
            payload.get("satusehat_service_request_id")
            or payload.get("service_request_id")
            or payload.get("serviceRequestId")
        )
        sr_id = None
        if sr_id_raw:
            sr_id_str = str(sr_id_raw).strip()
            # strip prefix "ServiceRequest/"
            sr_id = sr_id_str.split("/", 1)[-1] if sr_id_str.lower().startswith("servicerequest/") else sr_id_str
        ihs_number = (
            payload.get("satusehat_ihs_number")
            or payload.get("ihs_number")
            or payload.get("patientId")
        )

        enc_id = normalize_satusehat_encounter_id(enc_raw) if enc_raw else None
        enc_status = payload.get("encounter_status") or payload.get("encounterStatus") or payload.get("satusehat_encounter_status") or "in-progress"

        if not any([enc_id, sr_id, ihs_number]):
            return jsonify({
                "status": "error",
                "message": "No satusehat reference provided"
            }), 400

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Resolve order
            try:
                uuid_obj = uuid.UUID(identifier)
                cursor.execute(
                    "SELECT * FROM orders WHERE id = %s AND status != 'DELETED'",
                    (str(uuid_obj),)
                )
            except ValueError:
                cursor.execute(
                    """
                    SELECT *
                    FROM orders
                    WHERE (accession_number = %s OR order_number = %s)
                      AND status != 'DELETED'
                    """,
                    (identifier, identifier)
                )

            order_row = cursor.fetchone()
            if not order_row:
                return jsonify({"status": "error", "message": "Order not found"}), 404

            order_id = str(order_row["id"])

            # Build updates
            update_fields = []
            params = []
            if enc_id is not None:
                update_fields.append("satusehat_encounter_id = %s")
                params.append(enc_id)
            if sr_id is not None:
                update_fields.append("satusehat_service_request_id = %s")
                params.append(sr_id)
            if ihs_number is not None:
                update_fields.append("satusehat_ihs_number = %s")
                params.append(ihs_number)

            # Update audit details.updated
            details = order_row.get("details")
            if not isinstance(details, dict):
                details = {}
            details["updated"] = {
                "at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "by": resolve_request_actor().get("id") or resolve_request_actor().get("username") or "system",
                "action": "UPDATE_SATUSEHAT_REFS"
            }
            update_fields.append("details = %s")
            params.append(Json(details))

            update_fields.append("updated_at = %s")
            params.append(datetime.now(timezone.utc))

            params.append(order_id)

            cursor.execute(
                f"""
                UPDATE orders
                SET {", ".join(update_fields)}
                WHERE id = %s
                """,
                tuple(params)
            )

            # Optional: upsert encounter record for audit trail
            if enc_id:
                upsert_satusehat_encounter(
                    cursor,
                    order_row,
                    enc_id,
                    request_payload=payload,
                    response_payload=None,
                    actor_id=resolve_request_actor().get("id") or resolve_request_actor().get("username") or "system",
                    status=enc_status
                )

            # Optional: insert service request audit entry
            if sr_id:
                insert_satusehat_service_request(
                    cursor,
                    order_row,
                    sr_id,
                    status="sent",
                    request_payload=None,
                    response_payload=None,
                    extra={
                        "encounter_ref_id": enc_id,
                        "sr_identifier_value": order_row.get("accession_number")
                    },
                    actor_id=resolve_request_actor().get("id") or resolve_request_actor().get("username") or "system"
                )

            updated = {
                "order_id": order_id,
                "order_number": order_row.get("order_number"),
                "accession_number": order_row.get("accession_number"),
                "satusehat_ihs_number": ihs_number or order_row.get("satusehat_ihs_number"),
                "satusehat_encounter_id": enc_id or order_row.get("satusehat_encounter_id"),
                "satusehat_service_request_id": sr_id or order_row.get("satusehat_service_request_id")
            }

            return jsonify({"status": "success", "order": updated}), 200

    except Exception as e:
        logger.error(f"Error updating satusehat refs for {identifier}: {str(e)}", exc_info=True)
        return jsonify({
            "status": "error",
            "message": "Failed to update satusehat references",
            "detail": str(e)
        }), 500


@app.route('/orders/satusehat-stats', methods=['GET'])
@require_auth(['order:read', '*'])
def satusehat_stats():
    """
    Ringkasan status integrasi SatuSehat untuk orders.

    Query params (opsional):
      - from: filter created_at >= (YYYY-MM-DD atau ISO, 'Z' didukung)
      - to:   filter created_at < (hari berikutnya jika YYYY-MM-DD)
      - modality: filter exact modality
      - source:   filter exact order_source (dibandingkan lower-case)

    Aturan:
      - Hanya menghitung orders dengan status != 'DELETED'.
      - synced:
          satusehat_synced = TRUE
      - not_synced:
          satusehat_synced = FALSE atau NULL

    Contoh response:
      {
        "status": "success",
        "total_orders": 120,
        "synced": 80,
        "not_synced": 40,
        "synced_percentage": 66.67,
        "not_synced_percentage": 33.33,
        "filters": {
          "from": "2025-01-01",
          "to": "2025-01-31",
          "modality": "CT",
          "source": "simrs"
        }
      }
    """
    try:
        from_param = request.args.get('from')
        to_param = request.args.get('to')
        modality = request.args.get('modality')
        source = request.args.get('source')

        def parse_ts(value, is_end=False):
            if not value:
                return None
            v = value.strip()
            try:
                # Jika hanya tanggal (YYYY-MM-DD)
                if len(v) == 10 and v[4] == '-' and v[7] == '-':
                    dt = datetime.strptime(v, "%Y-%m-%d")
                    # to: pakai hari berikutnya (exclusive)
                    return dt + timedelta(days=1) if is_end else dt
                # ISO-like, dukung Z
                return datetime.fromisoformat(v.replace('Z', '+00:00'))
            except Exception:
                return None

        from_ts = parse_ts(from_param, is_end=False)
        to_ts = parse_ts(to_param, is_end=True)

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            where_clauses = ["status != 'DELETED'"]
            params = []

            if from_ts:
                where_clauses.append("created_at >= %s")
                params.append(from_ts)

            if to_ts:
                where_clauses.append("created_at < %s")
                params.append(to_ts)

            if modality:
                where_clauses.append("modality = %s")
                params.append(modality)

            if source:
                where_clauses.append("LOWER(COALESCE(order_source, '')) = %s")
                params.append(source.strip().lower())

            where_sql = " AND ".join(where_clauses) if where_clauses else "TRUE"

            # Hitung total, synced, not_synced dalam satu query
            cursor.execute(
                f"""
                SELECT
                    COUNT(*)::bigint AS total_orders,
                    COUNT(*) FILTER (WHERE satusehat_synced = TRUE)::bigint AS synced,
                    COUNT(*) FILTER (WHERE satusehat_synced = FALSE OR satusehat_synced IS NULL)::bigint AS not_synced
                FROM orders
                WHERE {where_sql}
                """,
                params
            )
            row = cursor.fetchone() or {}
            total = int(row.get('total_orders') or 0)
            synced = int(row.get('synced') or 0)
            not_synced = int(row.get('not_synced') or 0)

            synced_pct = round((synced / total * 100.0), 2) if total > 0 else 0.0
            not_synced_pct = round((not_synced / total * 100.0), 2) if total > 0 else 0.0

            return jsonify({
                "status": "success",
                "total_orders": total,
                "synced": synced,
                "not_synced": not_synced,
                "synced_percentage": synced_pct,
                "not_synced_percentage": not_synced_pct,
                "filters": {
                    "from": from_param,
                    "to": to_param,
                    "modality": modality,
                    "source": source
                }
            }), 200

    except Exception as e:
        logger.error(f"Error generating SatuSehat stats: {str(e)}", exc_info=True)
        return jsonify({
            "status": "error",
            "message": "Failed to compute SatuSehat stats",
            "detail": str(e)
        }), 500


@app.route('/orders/duplicates', methods=['GET'])
@require_auth(['order:read', '*'])
def list_duplicate_orders():
    """
    List potential duplicate orders based on patient, examination, and date criteria.
    
    Query parameters:
    - patient_national_id: Filter by patient NIK
    - medical_record_number: Filter by MRN  
    - modality: Filter by modality
    - procedure_code: Filter by procedure code
    - procedure_name: Filter by procedure name
    - date: Filter by date (YYYY-MM-DD format)
    - status: Filter by status (default: exclude DELETED)
    - limit: Number of results per group (default: 5)
    - window_hours: Lookback window in hours (default: 24)
    
    Returns grouped duplicates with the newest order first in each group.
    """
    try:
        patient_nik = request.args.get('patient_national_id')
        mrn = request.args.get('medical_record_number') 
        modality = request.args.get('modality')
        procedure_code = request.args.get('procedure_code')
        procedure_name = request.args.get('procedure_name')
        date_filter = request.args.get('date')
        status_filter = request.args.get('status', 'exclude_deleted')
        limit = min(max(1, int(request.args.get('limit', 5))), 20)
        window_hours = min(max(1, int(request.args.get('window_hours', 24))), 168)  # Max 1 week
        
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Build WHERE conditions for duplicate detection
            where_clauses = []
            params = []
            
            # Status filter
            if status_filter == 'exclude_deleted':
                where_clauses.append("COALESCE(status, '') NOT IN ('DELETED', 'CANCELED', 'CANCELLED', 'VOID')")
            elif status_filter != 'all':
                where_clauses.append("status = %s")
                params.append(status_filter)
            
            # Patient filters
            if patient_nik:
                where_clauses.append("COALESCE(patient_national_id, '') = %s")
                params.append(patient_nik)
                
            if mrn:
                where_clauses.append("COALESCE(medical_record_number, '') = %s")
                params.append(mrn)
            
            # Examination filters
            if modality:
                where_clauses.append("COALESCE(modality, '') = %s")
                params.append(modality)
                
            if procedure_code:
                where_clauses.append("COALESCE(procedure_code, '') = %s")
                params.append(procedure_code)
            elif procedure_name:
                where_clauses.append("COALESCE(procedure_name, '') = %s")
                params.append(procedure_name)
            
            # Date filter
            if date_filter:
                try:
                    # Validate date format
                    datetime.strptime(date_filter, '%Y-%m-%d')
                    where_clauses.append("DATE(COALESCE(scheduled_at, created_at)) = %s")
                    params.append(date_filter)
                except ValueError:
                    return jsonify({
                        "status": "error",
                        "message": "Invalid date format. Use YYYY-MM-DD."
                    }), 400
            
            # Time window filter
            where_clauses.append("created_at >= (CURRENT_TIMESTAMP - INTERVAL '%s hours')")
            params.append(window_hours)
            
            where_sql = " AND ".join(where_clauses) if where_clauses else "TRUE"
            
            # Group by patient + examination + date to find duplicates
            cursor.execute(f"""
                WITH duplicate_groups AS (
                    SELECT 
                        COALESCE(patient_national_id, medical_record_number) as patient_key,
                        COALESCE(procedure_code, procedure_name) as procedure_key,
                        DATE(COALESCE(scheduled_at, created_at)) as order_date,
                        COUNT(*) as order_count,
                        ARRAY_AGG(id ORDER BY created_at DESC) as order_ids,
                        ARRAY_AGG(order_number ORDER BY created_at DESC) as order_numbers,
                        ARRAY_AGG(accession_number ORDER BY created_at DESC) as accession_numbers,
                        ARRAY_AGG(status ORDER BY created_at DESC) as statuses,
                        ARRAY_AGG(created_at ORDER BY created_at DESC) as created_ats
                    FROM orders
                    WHERE {where_sql}
                    GROUP BY 
                        COALESCE(patient_national_id, medical_record_number),
                        COALESCE(procedure_code, procedure_name),
                        DATE(COALESCE(scheduled_at, created_at))
                    HAVING COUNT(*) > 1
                    ORDER BY order_date DESC, patient_key, procedure_key
                )
                SELECT 
                    patient_key,
                    procedure_key, 
                    order_date,
                    order_count,
                    order_ids,
                    order_numbers,
                    accession_numbers,
                    statuses,
                    created_ats,
                    -- Mark the newest as potential primary
                    order_ids[1] as primary_order_id,
                    order_numbers[1] as primary_order_number
                FROM duplicate_groups
                LIMIT %s
            """, params + [limit])
            
            duplicates = cursor.fetchall()
            
            # Format response
            result = []
            total_duplicate_groups = len(duplicates)
            total_conflicting_orders = sum(d['order_count'] for d in duplicates)
            
            for dup in duplicates:
                group_info = {
                    'patient_key': dup['patient_key'],
                    'procedure_key': dup['procedure_key'],
                    'order_date': dup['order_date'].isoformat(),
                    'order_count': dup['order_count'],
                    'primary_order': {
                        'id': str(dup['primary_order_id']),
                        'order_number': dup['primary_order_number']
                    },
                    'orders': []
                }
                
                for i in range(dup['order_count']):
                    order_info = {
                        'id': str(dup['order_ids'][i]),
                        'order_number': dup['order_numbers'][i],
                        'accession_number': dup['accession_numbers'][i],
                        'status': dup['statuses'][i],
                        'created_at': dup['created_ats'][i].isoformat() if dup['created_ats'][i] else None,
                        'is_primary': i == 0
                    }
                    group_info['orders'].append(order_info)
                
                result.append(group_info)
            
            return jsonify({
                "status": "success",
                "duplicate_groups": result,
                "summary": {
                    "total_duplicate_groups": total_duplicate_groups,
                    "total_conflicting_orders": total_conflicting_orders,
                    "average_orders_per_group": round(total_conflicting_orders / total_duplicate_groups, 1) if total_duplicate_groups > 0 else 0,
                    "window_hours": window_hours,
                    "filters_applied": {
                        "patient_national_id": patient_nik,
                        "medical_record_number": mrn,
                        "modality": modality,
                        "procedure_code": procedure_code,
                        "procedure_name": procedure_name,
                        "date": date_filter,
                        "status": status_filter
                    }
                }
            }), 200
            
    except ValueError as e:
        return jsonify({
            "status": "error",
            "message": f"Invalid parameter: {str(e)}"
        }), 400
    except Exception as e:
        logger.error(f"Error listing duplicate orders: {str(e)}", exc_info=True)
        return jsonify({
            "status": "error",
            "message": "Failed to list duplicate orders",
            "detail": str(e)
        }), 500


@app.route('/orders/source-status-stats', methods=['GET'])
@require_auth(['order:read', '*'])
def source_status_stats():
    """
    Aggregated counts of orders by order_source and status for quality/routing dashboards.

    - Excludes orders with status = 'DELETED'.
    - Optional ?from= & ?to= (created_at range, same rules as /orders/source-stats).
    """
    try:
        from_param = request.args.get('from')
        to_param = request.args.get('to')

        def parse_ts(value, is_end=False):
            if not value:
                return None
            v = value.strip()
            try:
                if len(v) == 10 and v[4] == '-' and v[7] == '-':
                    dt = datetime.strptime(v, "%Y-%m-%d")
                    return dt + timedelta(days=1) if is_end else dt
                return datetime.fromisoformat(v.replace('Z', '+00:00'))
            except Exception:
                return None

        from_ts = parse_ts(from_param, is_end=False)
        to_ts = parse_ts(to_param, is_end=True)

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            where_clauses = ["COALESCE(status, '') <> 'DELETED'"]
            params = []
            if from_ts:
                where_clauses.append("created_at >= %s")
                params.append(from_ts)
            if to_ts:
                where_clauses.append("created_at < %s")
                params.append(to_ts)

            where_sql = " AND ".join(where_clauses) if where_clauses else "TRUE"

            cursor.execute(
                f"""
                SELECT
                    COALESCE(NULLIF(LOWER(TRIM(order_source)), ''), 'unknown') AS source,
                    COALESCE(NULLIF(status, ''), 'UNKNOWN') AS status,
                    COUNT(*)::bigint AS count
                FROM orders
                WHERE {where_sql}
                GROUP BY
                    COALESCE(NULLIF(LOWER(TRIM(order_source)), ''), 'unknown'),
                    COALESCE(NULLIF(status, ''), 'UNKNOWN')
                ORDER BY source, status
                """,
                params
            )
            rows = cursor.fetchall()

            total = sum(int(r['count']) for r in rows) if rows else 0
            by_source = {}
            for r in rows:
                src = r['source']
                st = r['status']
                c = int(r['count'])

                src_entry = by_source.setdefault(src, {
                    "source": src,
                    "total": 0,
                    "statuses": {}
                })
                src_entry["total"] += c
                src_entry["statuses"][st] = src_entry["statuses"].get(st, 0) + c

            sources = []
            for src, info in by_source.items():
                total_src = info["total"]
                status_list = []
                for st, c in sorted(info["statuses"].items(), key=lambda x: -x[1]):
                    pct = (c / total_src * 100.0) if total_src > 0 else 0.0
                    status_list.append({
                        "status": st,
                        "count": c,
                        "percentage": round(pct, 2)
                    })
                pct_src = (total_src / total * 100.0) if total > 0 else 0.0
                sources.append({
                    "source": src,
                    "total": total_src,
                    "percentage_of_all": round(pct_src, 2),
                    "statuses": status_list
                })

            return jsonify({
                "status": "success",
                "total": total,
                "sources": sources
            }), 200

    except Exception as e:
        logger.error(f"Error generating source-status stats: {str(e)}", exc_info=True)
        return jsonify({
            "status": "error",
            "message": "Failed to compute source-status stats",
            "detail": str(e)
        }), 500


@app.route('/orders/<id>', methods=['GET'])
@require_auth(['order:read', '*'])
def get_order(id):
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute(
                """
                SELECT
                    id,
                    order_number,
                    accession_number,
                    patient_name,
                    patient_national_id,
                    medical_record_number,
                    modality,
                    procedure_code,
                    procedure_name,
                    registration_number,
                    order_source,
                    status,
                    order_status,
                    worklist_status,
                    imaging_status,
                    clinical_indication,
                    clinical_notes,
                    referring_doctor,
                    attending_nurse,
                    procedure_description,
                    scheduled_at,
                    patient_phone,
                    patient_address,
                    created_at,
                    updated_at,
                    completed_at,
                    completed_by,
                    cancel_at,
                    cancel_by,
                    details,
                    org_id,
                    satusehat_ihs_number,
                    satusehat_encounter_id,
                    satusehat_service_request_id,
                    satusehat_synced,
                    satusehat_sync_date
                FROM orders
                WHERE id = %s
                """,
                (id,)
            )
            row = cursor.fetchone()
            if not row:
                return jsonify({
                    "status": "error",
                    "message": "Order not found"
                }), 404

            # Normalisasi id ke string
            row['id'] = str(row['id'])
            order_id = row['id']

            # Normalize timestamps to ISO format
            for ts_field in ('created_at', 'updated_at', 'scheduled_at', 'completed_at', 'cancel_at'):
                if row.get(ts_field):
                    row[ts_field] = row[ts_field].isoformat()

            # Fetch procedures for this order
            cursor.execute(
                """
                SELECT
                    id,
                    procedure_code,
                    procedure_name,
                    modality,
                    accession_number,
                    scheduled_at,
                    status,
                    sequence_number,
                    loinc_code,
                    loinc_name,
                    procedure_description,
                    created_at,
                    updated_at,
                    completed_at,
                    completed_by,
                    cancelled_at,
                    cancelled_by,
                    cancelled_reason,
                    details
                FROM order_procedures
                WHERE order_id = %s
                ORDER BY sequence_number
                """,
                (order_id,)
            )
            procedures_rows = cursor.fetchall()

            # Format procedures
            procedures = []
            for proc in procedures_rows:
                proc_dict = {
                    'id': str(proc['id']),
                    'code': proc['procedure_code'],
                    'name': proc['procedure_name'],
                    'modality': proc['modality'],
                    'accession_number': proc['accession_number'],
                    'scheduled_at': proc['scheduled_at'].isoformat() if proc.get('scheduled_at') else None,
                    'status': proc['status'],
                    'sequence': proc['sequence_number'],
                    'loinc_code': proc.get('loinc_code'),
                    'loinc_name': proc.get('loinc_name'),
                    'description': proc.get('procedure_description'),
                    'created_at': proc['created_at'].isoformat() if proc.get('created_at') else None,
                    'updated_at': proc['updated_at'].isoformat() if proc.get('updated_at') else None,
                    'completed_at': proc['completed_at'].isoformat() if proc.get('completed_at') else None,
                    'completed_by': proc.get('completed_by'),
                    'cancelled_at': proc['cancelled_at'].isoformat() if proc.get('cancelled_at') else None,
                    'cancelled_by': proc.get('cancelled_by'),
                    'cancelled_reason': proc.get('cancelled_reason'),
                    'details': proc.get('details')
                }
                procedures.append(proc_dict)

            # Add procedures to order response
            row['procedures'] = procedures
            row['procedure_count'] = len(procedures)

            return jsonify({
                "status": "success",
                "order": row
            }), 200

    except Exception as e:
        logger.error(f"Error getting order: {str(e)}", exc_info=True)
        return jsonify({
            "status": "error",
            "message": "Failed to get order",
            "detail": str(e)
        }), 500


@app.route('/orders/<id>', methods=['PATCH', 'PUT'])
@require_auth(['order:update', '*'])
def update_order(id):
    try:
        data = request.get_json() or {}
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Fetch existing order first
            cursor.execute(
                """
                SELECT
                    id,
                    order_number,
                    accession_number,
                    status,
                    order_status,
                    referring_doctor,
                    details,
                    created_at
                FROM orders
                WHERE id = %s
                """,
                (id,)
            )
            order_row = cursor.fetchone()
            if not order_row:
                return jsonify({
                    "status": "error",
                    "message": "Order not found"
                }), 404

            # Validate status transitions (WORKLIST state machine aligned) - SKIP if same status
            new_status = data.get('status')
            if new_status:
                new_status = new_status.strip().lower()
                
                # 1. Validate new status is in allowed set
                if new_status not in VALID_ORDER_STATUSES:
                    return jsonify({
                        "status": "error", 
                        "message": f"Invalid status '{new_status}'. Allowed: {', '.join(VALID_ORDER_STATUSES)}"
                    }), 400
                
                current_status = order_row.get('status', '').strip().lower()
                
                # ✅ FIX: Allow self-transition (same status updates)
                if new_status == current_status:
                    logger.debug("Status self-transition allowed: %s → %s", current_status, new_status)
                else:
                    # 2. WORKLIST state machine validation (only for actual transitions)
                    allowed_transitions = {
                        'draft': {'created', 'cancelled'},
                        'created': {'scheduled', 'cancelled'},
                        'scheduled': {'enqueued', 'rescheduled', 'arrived', 'cancelled', 'no_show'},
                        'enqueued': {'arrived', 'cancelled', 'no_show'},
                        'rescheduled': {'scheduled'},  # auto-transition
                        'arrived': {'in_progress', 'cancelled'},
                        'in_progress': {'completed', 'cancelled'},
                        'completed': {'reported'},
                        'reported': {'finalized'},
                        'finalized': set()  # terminal
                    }
                    
                    allowed = allowed_transitions.get(current_status, set())
                    if new_status not in allowed and new_status not in CANCELED_STATUSES:
                        return jsonify({
                            "status": "error",
                            "message": f"Invalid transition {current_status} → {new_status}. "
                                     f"Allowed from {current_status}: {', '.join(allowed) or 'none'} "
                                     f"(cancelled/no_show always allowed)"
                        }), 400
                
                # 3. Enhanced requirements for completion states
                if new_status in COMPLETED_STATUSES:
                    mandatory_ok, mandatory_message = _has_required_completion_fields(order_row, data)
                    if not mandatory_ok:
                        return jsonify({
                            "status": "error",
                            "message": f"Cannot transition to {new_status}: {mandatory_message}"
                        }), 400

                # Note: Cancellation does not require completion fields validation
                # Orders can be cancelled at any stage without needing referring_doctor or icd10

            # Update order record
            update_clauses = []
            params = []
            actor_info = resolve_request_actor()
            actor_id = (actor_info.get('id') or actor_info.get('username') or 'system')
            actor_display = (
                actor_info.get('username')
                or actor_info.get('email')
                or actor_info.get('id')
                or 'system'
            )
            actor_ip = request.remote_addr
            current_timestamp = datetime.now(timezone.utc).isoformat()

            # Update status if provided (normalize to lowercase per WORKLIST docs)
            if 'status' in data:
                update_clauses.append("status = %s")
                normalized_status = new_status  # already validated & normalized above
                params.append(normalized_status)

            # Update order_status if provided
            if 'order_status' in data:
                update_clauses.append("order_status = %s")
                params.append(data['order_status'])

            # Update worklist_status if provided
            if 'worklist_status' in data:
                update_clauses.append("worklist_status = %s")
                params.append(data['worklist_status'])

            # Update imaging_status if provided
            if 'imaging_status' in data:
                update_clauses.append("imaging_status = %s")
                params.append(data['imaging_status'])

            # Update clinical_indication if provided
            if 'clinical_indication' in data:
                update_clauses.append("clinical_indication = %s")
                params.append(data['clinical_indication'])

            # Update clinical_notes if provided
            if 'clinical_notes' in data:
                update_clauses.append("clinical_notes = %s")
                params.append(data['clinical_notes'])

            # Update referring_doctor if provided
            if 'referring_doctor' in data:
                update_clauses.append("referring_doctor = %s")
                params.append(data['referring_doctor'])

            # Update attending_nurse if provided
            if 'attending_nurse' in data:
                update_clauses.append("attending_nurse = %s")
                params.append(data['attending_nurse'])

            # Update procedure_description if provided
            if 'procedure_description' in data:
                update_clauses.append("procedure_description = %s")
                params.append(data['procedure_description'])

            # Update scheduled_at if provided
            if 'scheduled_at' in data:
                update_clauses.append("scheduled_at = %s")
                params.append(data['scheduled_at'])

            # Update patient_phone if provided
            if 'patient_phone' in data:
                update_clauses.append("patient_phone = %s")
                params.append(data['patient_phone'])

            # Update patient_address if provided
            if 'patient_address' in data:
                update_clauses.append("patient_address = %s")
                params.append(data['patient_address'])

            # --- AUDIT TRAIL: Update 'details' field ---
            base_details = ensure_audit_structure(order_row.get('details'), order_row.get('created_at'))

            # Merge details from payload if provided
            if 'details' in data and isinstance(data['details'], dict):
                base_details.update(data['details'])

            # Track status change history for audit trail
            previous_status = (order_row.get('status') or '').strip().lower()
            status_history = base_details.get('status_history')
            if not isinstance(status_history, list):
                status_history = []
            if new_status is not None:
                status_history.append({
                    "from": previous_status or None,
                    "to": new_status,
                    "at": current_timestamp,
                    "by": actor_display,
                    "ip": actor_ip
                })
            base_details['status_history'] = status_history

            # Track order_status change history separately
            prev_order_status = (order_row.get('order_status') or '').strip().lower()
            incoming_order_status = data.get('order_status')
            order_status_history = base_details.get('order_status_history')
            if not isinstance(order_status_history, list):
                order_status_history = []
            if incoming_order_status is not None:
                normalized_order_status = str(incoming_order_status).strip().lower()
                order_status_history.append({
                    "from": prev_order_status or None,
                    "to": normalized_order_status or None,
                    "at": current_timestamp,
                    "by": actor_display,
                    "ip": actor_ip
                })
                # Persist normalized value back to payload to keep consistency
                data['order_status'] = normalized_order_status
            base_details['order_status_history'] = order_status_history

            # Always add/update the 'updated' field with current user and timestamp
            base_details["updated"] = {
                "at": current_timestamp,
                "by": actor_display
            }

            # Add the constructed details to the update clauses
            update_clauses.append("details = %s")
            params.append(Json(base_details))
            # --- END AUDIT TRAIL ---

            # Update order_source if provided
            if 'order_source' in data:
                update_clauses.append("order_source = %s")
                params.append(data['order_source'])

            # Update order_number if provided
            if 'order_number' in data:
                update_clauses.append("order_number = %s")
                params.append(data['order_number'])

            # Update accession_number if provided
            if 'accession_number' in data:
                update_clauses.append("accession_number = %s")
                params.append(data['accession_number'])

            # Update modality if provided
            if 'modality' in data:
                update_clauses.append("modality = %s")
                params.append(data['modality'])

            # Update procedure_code if provided
            if 'procedure_code' in data:
                update_clauses.append("procedure_code = %s")
                params.append(data['procedure_code'])

            # Update procedure_name if provided
            if 'procedure_name' in data:
                update_clauses.append("procedure_name = %s")
                params.append(data['procedure_name'])

            # Update loinc_code if provided
            if 'loinc_code' in data:
                update_clauses.append("loinc_code = %s")
                params.append(data['loinc_code'])

            # Update loinc_name if provided
            if 'loinc_name' in data:
                update_clauses.append("loinc_name = %s")
                params.append(data['loinc_name'])

            # Update registration_number if provided
            if 'registration_number' in data:
                update_clauses.append("registration_number = %s")
                params.append(data['registration_number'])

            # Update completed_at and completed_by if NEW status is completed
            if new_status and new_status in COMPLETED_STATUSES:
                update_clauses.append("completed_at = %s")
                params.append(datetime.now(timezone.utc))
                update_clauses.append("completed_by = %s")
                params.append(actor_id)

            cancel_ts = None
            # Update cancel_at and cancel_by if NEW status is canceled
            if new_status and new_status in CANCELED_STATUSES:
                cancel_ts = datetime.now(timezone.utc)
                update_clauses.append("cancel_at = %s")
                params.append(cancel_ts)
                update_clauses.append("cancel_by = %s")
                params.append(actor_id)
                # Legacy aliases to keep downstream queries consistent
                update_clauses.append("cancelled_at = %s")
                params.append(cancel_ts)
                update_clauses.append("cancelled_by = %s")
                params.append(actor_id)

            # Always update updated_at
            update_clauses.append("updated_at = %s")
            params.append(datetime.now(timezone.utc))

            # Add id parameter
            params.append(id)

            # Build SET clause
            set_clause = ", ".join(update_clauses)

            # Execute update and check rowcount
            cursor.execute(
                f"""
                UPDATE orders
                SET {set_clause}
                WHERE id = %s
                """,
                tuple(params)
            )
            
            rows_updated = cursor.rowcount
            if rows_updated == 0:
                logger.warning("No rows updated for order id=%s (may not exist or no changes)", id)
                return jsonify({
                    "status": "error",
                    "message": f"Order {id} not found or no changes needed",
                    "rows_updated": 0
                }), 404

            logger.info("Updated %d row(s) for order %s", rows_updated, id)

            # If order is canceled, cascade cancellation to all order_procedures
            if cancel_ts:
                try:
                    cursor.execute(
                        """
                        SELECT id, status, details
                        FROM order_procedures
                        WHERE order_id = %s
                        """,
                        (id,)
                    )
                    procedures_to_cancel = cursor.fetchall()
                    for proc in procedures_to_cancel:
                        proc_id = str(proc.get('id'))
                        prev_proc_status = (proc.get('status') or '').strip().lower()
                        proc_details = ensure_audit_structure(proc.get('details'))
                        proc_history = proc_details.get('status_history')
                        if not isinstance(proc_history, list):
                            proc_history = []
                        proc_history.append({
                            "from": prev_proc_status or None,
                            "to": "cancelled",
                            "at": cancel_ts.isoformat(),
                            "by": actor_display,
                            "ip": actor_ip
                        })
                        proc_details['status_history'] = proc_history
                        proc_details['updated'] = {"at": cancel_ts.isoformat(), "by": actor_display}

                        cursor.execute(
                            """
                            UPDATE order_procedures
                            SET status = %s,
                                cancelled_at = %s,
                                cancelled_by = %s,
                                updated_at = %s,
                                details = %s
                            WHERE id = %s
                            """,
                            (
                                'cancelled',
                                cancel_ts,
                                actor_id,
                                cancel_ts,
                                Json(proc_details),
                                proc_id
                            )
                        )
                except Exception as proc_cancel_err:
                    logger.warning(
                        "Failed to cascade cancellation to order_procedures for order %s: %s",
                        id,
                        proc_cancel_err,
                        exc_info=True
                    )

            # Fetch UPDATED order row to get new status + confirm accession_number
            cursor.execute("""
                SELECT status, accession_number 
                FROM orders 
                WHERE id = %s
            """, (id,))
            updated_order_row = cursor.fetchone()
            
            # WORKLIST SYNC: Update worklist_items.sps_status using SPS_STATUS_MAPPING
            # Run in isolated transaction to prevent worklist errors from aborting main order transaction
            new_status = None
            new_accession = None
            if updated_order_row:
                if isinstance(updated_order_row, dict):
                    new_status = updated_order_row.get('status', '').strip().lower()
                    new_accession = updated_order_row.get('accession_number')
                else:
                    new_status = (updated_order_row[0] or '').strip().lower()
                    new_accession = updated_order_row[1] if len(updated_order_row) > 1 else None
            
            if new_status and new_accession and new_status in SPS_STATUS_MAPPING:
                sps_status = SPS_STATUS_MAPPING[new_status]
                try:
                    with get_db_connection() as wl_conn:
                        wl_cursor = wl_conn.cursor()
                        wl_cursor.execute("""
                            UPDATE worklist_items 
                            SET sps_status = %s, 
                                updated_at = CURRENT_TIMESTAMP
                            WHERE accession_number = %s AND is_active = TRUE
                        """, (sps_status, new_accession))
                        
                        updated_wl = wl_cursor.rowcount
                        if updated_wl > 0:
                            logger.info(
                                "✓ Synced order status '%s' → SPS '%s' to %d worklist_items "
                                "for accession %s (WORKLIST aligned)",
                                new_status, sps_status, updated_wl, new_accession
                            )
                        wl_conn.commit()
                except Exception as wl_sync_err:
                    logger.warning(
                        "Failed to sync status '%s'→SPS'%s' to worklist_items for accession %s: %s",
                        new_status, sps_status, new_accession, wl_sync_err
                    )
            elif new_status and new_status not in SPS_STATUS_MAPPING:
                logger.debug(
                    "Skipping worklist sync: status '%s' has no SPS mapping (accession=%s)", 
                    new_status, new_accession
                )

            # Log action
            action = 'ORDER_UPDATED'
            if new_status:
                if new_status in COMPLETED_STATUSES:
                    action = 'ORDER_COMPLETED'
                elif new_status in CANCELED_STATUSES:
                    action = 'ORDER_CANCELED'
                elif new_status == 'scheduled':
                    action = 'ORDER_SCHEDULED'
                elif new_status == 'arrived':
                    action = 'ORDER_ARRIVED'
                elif new_status == 'in_progress':
                    action = 'ORDER_IN_PROGRESS'

            log_order_action(
                id, data.get('order_number') or order_row.get('order_number'),
                data.get('accession_number') or order_row.get('accession_number'),
                action,
                order_row.get('status'), data,
                actor_id,
                request.remote_addr
            )

            # Fetch updated order
            cursor.execute(
                """
                SELECT
                    id,
                    order_number,
                    accession_number,
                    patient_name,
                    patient_national_id,
                    medical_record_number,
                    modality,
                    procedure_code,
                    procedure_name,
                    registration_number,
                    order_source,
                    status,
                    order_status,
                    worklist_status,
                    imaging_status,
                    clinical_indication,
                    clinical_notes,
                    referring_doctor,
                    attending_nurse,
                    procedure_description,
                    scheduled_at,
                    patient_phone,
                    patient_address,
                    created_at,
                    updated_at,
                    completed_at,
                    completed_by,
                    cancel_at,
                    cancel_by,
                    details,
                    org_id,
                    satusehat_ihs_number,
                    satusehat_encounter_id,
                    satusehat_service_request_id,
                    satusehat_synced,
                    satusehat_sync_date
                FROM orders
                WHERE id = %s
                """,
                (id,)
            )
            row = cursor.fetchone()
            if not row:
                return jsonify({
                    "status": "error",
                    "message": "Order not found"
                }), 404

            # Normalisasi id ke string
            row['id'] = str(row['id'])

            # Normalize timestamps to ISO format
            for ts_field in ('created_at', 'updated_at', 'scheduled_at', 'completed_at', 'cancel_at'):
                if row.get(ts_field):
                    row[ts_field] = row[ts_field].isoformat()

            return jsonify({
                "status": "success",
                "order": row
            }), 200

    except Exception as e:
        logger.error(f"Error updating order: {str(e)}", exc_info=True)
        return jsonify({
            "status": "error",
            "message": "Failed to update order",
            "detail": str(e)
        }), 500


@app.route('/orders/<id>/status', methods=['PATCH'])
@require_auth(['order:update', '*'])
def update_order_status(id):
    """
    Dedicated endpoint for updating order status.

    This is a convenience endpoint that focuses specifically on status transitions.
    Accepts: { "status": "ARRIVED", "notes": "optional notes" }

    Maps to the general /orders/<id> PATCH endpoint internally.
    """
    try:
        data = request.get_json() or {}

        # Validate that status is provided
        if 'status' not in data:
            return jsonify({
                "status": "error",
                "message": "Status field is required"
            }), 400

        # Forward to the main update_order function by calling it
        # We reuse the same logic to avoid duplication
        return update_order(id)

    except Exception as e:
        logger.error(f"Error updating order status: {str(e)}", exc_info=True)
        return jsonify({
            "status": "error",
            "message": "Failed to update order status",
            "detail": str(e)
        }), 500


@app.route('/orders/<id>', methods=['DELETE'])
@require_auth(['order:delete', '*'])
def delete_order(id):
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()

            # First, check if order exists and is not already deleted
            cursor.execute("SELECT status FROM orders WHERE id = %s", (id,))
            row = cursor.fetchone()
            if not row:
                return jsonify({
                    "status": "error",
                    "message": "Order not found"
                }), 404

            # Check if order is already deleted
            current_status = row[0]
            if current_status in CANCELED_STATUSES:
                return jsonify({
                    "status": "error",
                    "message": "Order is already canceled/deleted"
                }), 400

            # Soft delete order
            cursor.execute(
                """
                UPDATE orders
                SET status = 'DELETED',
                    cancel_at = CURRENT_TIMESTAMP,
                    cancel_by = %s,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
                """,
                (request.current_user.get('id'), id)
            )

            # Log action
            actor_info = resolve_request_actor()
            actor_id = (actor_info.get('id') or actor_info.get('username') or 'system')
            log_order_action(
                id, None, None, 'ORDER_DELETED',
                current_status, None,
                actor_id,
                request.remote_addr
            )

            return jsonify({
                "status": "success",
                "message": "Order deleted"
            }), 200

    except Exception as e:
        logger.error(f"Error deleting order: {str(e)}", exc_info=True)
        return jsonify({
            "status": "error",
            "message": "Failed to delete order",
            "detail": str(e)
        }), 500


@app.route('/orders/<id>/purge', methods=['DELETE'])
@require_auth(['order:delete', '*'])
def purge_order(id):
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()

            # First, check if order exists and is not already deleted
            cursor.execute("SELECT status FROM orders WHERE id = %s", (id,))
            row = cursor.fetchone()
            if not row:
                return jsonify({
                    "status": "error",
                    "message": "Order not found"
                }), 404

            # Check if order is already deleted
            current_status = row[0]
            if current_status in CANCELED_STATUSES:
                return jsonify({
                    "status": "error",
                    "message": "Order is already canceled/deleted"
                }), 400

            # Hard delete order
            cursor.execute("DELETE FROM orders WHERE id = %s", (id,))

            # Log action
            actor_info = resolve_request_actor()
            actor_id = (actor_info.get('id') or actor_info.get('username') or 'system')
            log_order_action(
                id, None, None, 'ORDER_PURGED',
                current_status, None,
                actor_id,
                request.remote_addr
            )

            return jsonify({
                "status": "success",
                "message": "Order purged"
            }), 200

    except Exception as e:
        logger.error(f"Error purging order: {str(e)}", exc_info=True)
        return jsonify({
            "status": "error",
            "message": "Failed to purge order",
            "detail": str(e)
        }), 500


@app.route('/orders/<id>/sync-satusehat', methods=['POST'])
@require_auth(['order:sync', '*'])
def sync_order_to_satusehat(id):
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("SELECT * FROM orders WHERE id = %s", (id,))
            order_row = cursor.fetchone()
            if not order_row:
                return jsonify({
                    "status": "error",
                    "message": "Order not found"
                }), 404

            # Check if order is already synced
            if order_row.get('satusehat_synced'):
                return jsonify({
                    "status": "error",
                    "message": "Order is already synced to SatuSehat"
                }), 400

            # Prepare data for SatuSehat
            patient_id = order_row.get('patient_id')
            if not patient_id:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a patient_id"
                }), 400

            # Prepare encounter data
            encounter_id = order_row.get('satusehat_encounter_id')
            if not encounter_id:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a satusehat_encounter_id"
                }), 400

            # Prepare service request data
            sr_id = order_row.get('satusehat_service_request_id')
            if not sr_id:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a satusehat_service_request_id"
                }), 400

            # Prepare order data
            order_number = order_row.get('order_number')
            if not order_number:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have an order_number"
                }), 400

            # Prepare registration number
            registration_number = order_row.get('registration_number')
            if not registration_number:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a registration_number"
                }), 400

            # Prepare IHS number
            ihs_number = order_row.get('satusehat_ihs_number')
            if not ihs_number:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a satusehat_ihs_number"
                }), 400

            # Prepare procedure code
            procedure_code = order_row.get('procedure_code')
            if not procedure_code:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a procedure_code"
                }), 400

            # Prepare procedure name
            procedure_name = order_row.get('procedure_name')
            if not procedure_name:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a procedure_name"
                }), 400

            # Prepare referring doctor
            referring_doctor = order_row.get('referring_doctor')
            if not referring_doctor:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a referring_doctor"
                }), 400

            # Prepare attending nurse
            attending_nurse = order_row.get('attending_nurse')
            if not attending_nurse:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have an attending_nurse"
                }), 400

            # Prepare scheduled_at
            scheduled_at = order_row.get('scheduled_at')
            if not scheduled_at:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a scheduled_at"
                }), 400

            # Prepare modality
            modality = order_row.get('modality')
            if not modality:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a modality"
                }), 400

            # Prepare patient name
            patient_name = order_row.get('patient_name')
            if not patient_name:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a patient_name"
                }), 400

            # Prepare patient gender
            patient_gender = order_row.get('gender')
            if not patient_gender:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a gender"
                }), 400

            # Prepare patient birth_date
            patient_birth_date = order_row.get('birth_date')
            if not patient_birth_date:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a birth_date"
                }), 400

            # Prepare patient phone
            patient_phone = order_row.get('patient_phone')
            if not patient_phone:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a patient_phone"
                }), 400

            # Prepare patient address
            patient_address = order_row.get('patient_address')
            if not patient_address:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a patient_address"
                }), 400

            # Prepare patient national_id
            patient_national_id = order_row.get('patient_national_id')
            if not patient_national_id:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a patient_national_id"
                }), 400

            # Prepare patient medical_record_number
            patient_medical_record_number = order_row.get('medical_record_number')
            if not patient_medical_record_number:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a medical_record_number"
                }), 400

            # Prepare procedure_description
            procedure_description = order_row.get('procedure_description')
            if not procedure_description:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a procedure_description"
                }), 400

            # Prepare clinical_indication
            clinical_indication = order_row.get('clinical_indication')
            if not clinical_indication:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a clinical_indication"
                }), 400

            # Prepare clinical_notes
            clinical_notes = order_row.get('clinical_notes')
            if not clinical_notes:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a clinical_notes"
                }), 400

            # Prepare details
            details = order_row.get('details')
            if not details:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have details"
                }), 400

            # Prepare created_at
            created_at = order_row.get('created_at')
            if not created_at:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a created_at"
                }), 400

            # Prepare updated_at
            updated_at = order_row.get('updated_at')
            if not updated_at:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have an updated_at"
                }), 400

            # Prepare completed_at
            completed_at = order_row.get('completed_at')
            if not completed_at:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a completed_at"
                }), 400

            # Prepare completed_by
            completed_by = order_row.get('completed_by')
            if not completed_by:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a completed_by"
                }), 400

            # Prepare cancel_at
            cancel_at = order_row.get('cancel_at')
            if not cancel_at:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a cancel_at"
                }), 400

            # Prepare cancel_by
            cancel_by = order_row.get('cancel_by')
            if not cancel_by:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a cancel_by"
                }), 400

            # Prepare order_status
            order_status = order_row.get('order_status')
            if not order_status:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have an order_status"
                }), 400

            # Prepare worklist_status
            worklist_status = order_row.get('worklist_status')
            if not worklist_status:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a worklist_status"
                }), 400

            # Prepare imaging_status
            imaging_status = order_row.get('imaging_status')
            if not imaging_status:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have an imaging_status"
                }), 400

            # Prepare status
            status = order_row.get('status')
            if not status:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a status"
                }), 400

            # Prepare order_source
            order_source = order_row.get('order_source')
            if not order_source:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have an order_source"
                }), 400

            # Prepare org_id
            org_id = order_row.get('org_id')
            if not org_id:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have an org_id"
                }), 400

            # Prepare satusehat_encounter_id
            satusehat_encounter_id = order_row.get('satusehat_encounter_id')
            if not satusehat_encounter_id:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a satusehat_encounter_id"
                }), 400

            # Prepare satusehat_service_request_id
            satusehat_service_request_id = order_row.get('satusehat_service_request_id')
            if not satusehat_service_request_id:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a satusehat_service_request_id"
                }), 400

            # Prepare satusehat_synced
            satusehat_synced = order_row.get('satusehat_synced')
            if not satusehat_synced:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a satusehat_synced"
                }), 400

            # Prepare satusehat_sync_date
            satusehat_sync_date = order_row.get('satusehat_sync_date')
            if not satusehat_sync_date:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a satusehat_sync_date"
                }), 400

            # Prepare id
            order_id = order_row.get('id')
            if not order_id:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have an id"
                }), 400

            # Prepare accessions
            accessions = order_row.get('accessions')
            if not accessions:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have accessions"
                }), 400

            # Prepare files
            files = order_row.get('files')
            if not files:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have files"
                }), 400

            # Prepare patient_id
            patient_id = order_row.get('patient_id')
            if not patient_id:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a patient_id"
                }), 400

            # Prepare patient_national_id
            patient_national_id = order_row.get('patient_national_id')
            if not patient_national_id:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a patient_national_id"
                }), 400

            # Prepare medical_record_number
            medical_record_number = order_row.get('medical_record_number')
            if not medical_record_number:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a medical_record_number"
                }), 400

            # Prepare procedure_code
            procedure_code = order_row.get('procedure_code')
            if not procedure_code:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a procedure_code"
                }), 400

            # Prepare procedure_name
            procedure_name = order_row.get('procedure_name')
            if not procedure_name:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a procedure_name"
                }), 400

            # Prepare referring_doctor
            referring_doctor = order_row.get('referring_doctor')
            if not referring_doctor:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a referring_doctor"
                }), 400

            # Prepare attending_nurse
            attending_nurse = order_row.get('attending_nurse')
            if not attending_nurse:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have an attending_nurse"
                }), 400

            # Prepare procedure_description
            procedure_description = order_row.get('procedure_description')
            if not procedure_description:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a procedure_description"
                }), 400

            # Prepare clinical_indication
            clinical_indication = order_row.get('clinical_indication')
            if not clinical_indication:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a clinical_indication"
                }), 400

            # Prepare clinical_notes
            clinical_notes = order_row.get('clinical_notes')
            if not clinical_notes:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a clinical_notes"
                }), 400

            # Prepare created_at
            created_at = order_row.get('created_at')
            if not created_at:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a created_at"
                }), 400

            # Prepare updated_at
            updated_at = order_row.get('updated_at')
            if not updated_at:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have an updated_at"
                }), 400

            # Prepare details
            details = order_row.get('details')
            if not details:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have details"
                }), 400

            # Prepare id
            order_id = order_row.get('id')
            if not order_id:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have an id"
                }), 400

            # Prepare order_number
            order_number = order_row.get('order_number')
            if not order_number:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have an order_number"
                }), 400

            # Prepare accession_number
            accession_number = order_row.get('accession_number')
            if not accession_number:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have an accession_number"
                }), 400

            # Prepare modality
            modality = order_row.get('modality')
            if not modality:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a modality"
                }), 400

            # Prepare procedure_code
            procedure_code = order_row.get('procedure_code')
            if not procedure_code:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a procedure_code"
                }), 400

            # Prepare procedure_name
            procedure_name = order_row.get('procedure_name')
            if not procedure_name:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a procedure_name"
                }), 400

            # Prepare registration_number
            registration_number = order_row.get('registration_number')
            if not registration_number:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a registration_number"
                }), 400

            # Prepare status
            status = order_row.get('status')
            if not status:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a status"
                }), 400

            # Prepare order_status
            order_status = order_row.get('order_status')
            if not order_status:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have an order_status"
                }), 400

            # Prepare worklist_status
            worklist_status = order_row.get('worklist_status')
            if not worklist_status:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a worklist_status"
                }), 400

            # Prepare imaging_status
            imaging_status = order_row.get('imaging_status')
            if not imaging_status:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have an imaging_status"
                }), 400

            # Prepare clinical_indication
            clinical_indication = order_row.get('clinical_indication')
            if not clinical_indication:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a clinical_indication"
                }), 400

            # Prepare clinical_notes
            clinical_notes = order_row.get('clinical_notes')
            if not clinical_notes:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a clinical_notes"
                }), 400

            # Prepare referring_doctor
            referring_doctor = order_row.get('referring_doctor')
            if not referring_doctor:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a referring_doctor"
                }), 400

            # Prepare attending_nurse
            attending_nurse = order_row.get('attending_nurse')
            if not attending_nurse:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have an attending_nurse"
                }), 400

            # Prepare procedure_description
            procedure_description = order_row.get('procedure_description')
            if not procedure_description:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a procedure_description"
                }), 400

            # Prepare scheduled_at
            scheduled_at = order_row.get('scheduled_at')
            if not scheduled_at:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a scheduled_at"
                }), 400

            # Prepare patient_phone
            patient_phone = order_row.get('patient_phone')
            if not patient_phone:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a patient_phone"
                }), 400

            # Prepare patient_address
            patient_address = order_row.get('patient_address')
            if not patient_address:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a patient_address"
                }), 400

            # Prepare created_at
            created_at = order_row.get('created_at')
            if not created_at:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a created_at"
                }), 400

            # Prepare updated_at
            updated_at = order_row.get('updated_at')
            if not updated_at:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have an updated_at"
                }), 400

            # Prepare completed_at
            completed_at = order_row.get('completed_at')
            if not completed_at:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a completed_at"
                }), 400

            # Prepare completed_by
            completed_by = order_row.get('completed_by')
            if not completed_by:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a completed_by"
                }), 400

            # Prepare cancel_at
            cancel_at = order_row.get('cancel_at')
            if not cancel_at:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a cancel_at"
                }), 400

            # Prepare cancel_by
            cancel_by = order_row.get('cancel_by')
            if not cancel_by:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a cancel_by"
                }), 400

            # Prepare order_source
            order_source = order_row.get('order_source')
            if not order_source:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have an order_source"
                }), 400

            # Prepare org_id
            org_id = order_row.get('org_id')
            if not org_id:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have an org_id"
                }), 400

            # Prepare satusehat_encounter_id
            satusehat_encounter_id = order_row.get('satusehat_encounter_id')
            if not satusehat_encounter_id:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a satusehat_encounter_id"
                }), 400

            # Prepare satusehat_service_request_id
            satusehat_service_request_id = order_row.get('satusehat_service_request_id')
            if not satusehat_service_request_id:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a satusehat_service_request_id"
                }), 400

            # Prepare satusehat_synced
            satusehat_synced = order_row.get('satusehat_synced')
            if not satusehat_synced:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a satusehat_synced"
                }), 400

            # Prepare satusehat_sync_date
            satusehat_sync_date = order_row.get('satusehat_sync_date')
            if not satusehat_sync_date:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a satusehat_sync_date"
                }), 400

            # Prepare id
            order_id = order_row.get('id')
            if not order_id:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have an id"
                }), 400

            # Prepare order_number
            order_number = order_row.get('order_number')
            if not order_number:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have an order_number"
                }), 400

            # Prepare accession_number
            accession_number = order_row.get('accession_number')
            if not accession_number:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have an accession_number"
                }), 400

            # Prepare modality
            modality = order_row.get('modality')
            if not modality:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a modality"
                }), 400

            # Prepare procedure_code
            procedure_code = order_row.get('procedure_code')
            if not procedure_code:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a procedure_code"
                }), 400

            # Prepare procedure_name
            procedure_name = order_row.get('procedure_name')
            if not procedure_name:
                return jsonify({
                    "status": "error",
                    "message": "Order does not have a procedure_name"
                }), 400

            # Enhanced mandatory requirements
            mandatory_ok = (
                _st("patient_ihs") == "ready" and
                _st("encounter") == "ready" and
                _st("order_data") == "ready" and
                _st("dicom_files") == "ready" and
                _st("doctor_ihs") == "ready" and
                _st("registration_number") == "ready" and
                _st("icd10_code") == "ready"
            )

            # Validasi khusus dicom_files: butuh minimal 1 file
            dicom_count = (v.get("dicom_files") or {}).get("count") or 0
            if dicom_count <= 0:
                mandatory_ok = False

            # Validasi service_request
            sr = v.get("service_request") or {}
            sr_status = (sr.get("status") or "").lower()
            sr_value = sr.get("value")
            sr_ok = (sr_status == "synced") and bool(sr_value)

            if mandatory_ok and sr_ok:
                result["ready_to_sync"] = True
                result["message"] = "Fully ready to sync to SATUSEHAT"
            else:
                issues = []
                if _st("patient_ihs") != "ready":
                    issues.append("patient_ihs")
                if _st("encounter") != "ready":
                    issues.append("encounter")
                if _st("order_data") != "ready":
                    issues.append("order_data")
                if _st("doctor_ihs") != "ready":
                    issues.append("doctor_ihs")
                if _st("dicom_files") != "ready" or dicom_count <= 0:
                    issues.append("dicom_files")
                if _st("registration_number") != "ready":
                    issues.append("registration_number")
                if _st("icd10_code") != "ready":
                    issues.append("icd10_code")
                if not sr_ok:
                    issues.append("service_request")

                result["ready_to_sync"] = False
                if issues:
                    result["message"] = (
                        "Not ready to sync. Fix these areas first: " + ", ".join(sorted(set(issues)))
                    )
                else:
                    result["message"] = "Not ready to sync due to unresolved validation issues"

            # 13) Core order data (enhanced validation)
            missing = []
            for field in ("modality", "procedure_code", "procedure_name"):
                if not (order.get(field) or "").strip():
                    missing.append(field)

            # NEW: Check for ICD10 requirement
            if not (order.get("icd10_code") or order.get("icd10")):
                missing.append("icd10_code")

            # NEW: Check for registration number
            if not order.get("registration_number"):
                missing.append("registration_number")

            if missing:
                result["validation"]["order_data"] = {
                    "status": "error",
                    "missing_fields": missing,
                    "message": "Missing required fields: " + ", ".join(missing)
                }
                for f in missing:
                    if f == "modality":
                        result["recommendations"].append("Set modality (e.g. CT, MR, CR)")
                    elif f == "procedure_code":
                        result["recommendations"].append(
                            "Set procedure_code (ideally LOINC code compatible with SATUSEHAT)"
                        )
                    elif f == "procedure_name":
                        result["recommendations"].append("Set procedure_name / exam name")
                    elif f == "icd10_code":
                        result["recommendations"].append("Set icd10_code for medical reason")
                    elif f == "registration_number":
                        result["recommendations"].append("Set registration_number for Encounter")
            else:
                result["validation"]["order_data"] = {
                    "status": "ready",
                    "missing_fields": [],
                    "message": "Core order data is complete"
                }
        return jsonify({
            'status': 'success',
            'order': {
                'id': str(order_id),
                'order_number': order_number,
                'accession_number': accession_number,
                'modality': data.get('modality'),
                'procedure_code': data.get('procedure_code'),
                'procedure_name': data.get('procedure_name'),
                'loinc_code': data.get('loinc_code'),
                'loinc_name': data.get('loinc_name'),
                'scheduled_at': data.get('scheduled_at'),
                'patient_national_id': data.get('patient_national_id'),
                'patient_name': data.get('patient_name'),
                'gender': data.get('gender'),
                'birth_date': data.get('birth_date'),
                'medical_record_number': data.get('medical_record_number'),
                'satusehat_ihs_number': satusehat_ihs_number,
                'registration_number': data.get('registration_number'),
                'referring_doctor': referring_doctor,
                'patient_id': patient_uuid,
                'satusehat_encounter_id': satusehat_encounter_id,
                'attending_nurse': data.get('attending_nurse'),
                'order_source': order_source,
                'details': details_payload,
                'status': 'CREATED'
            }
        }), 201
    except Exception as e:
        logger.error(f"Error creating order: {str(e)}")
        return jsonify({ 'status': 'error', 'message': str(e) }), 500


@app.route('/order-procedures/<procedure_id>', methods=['GET'])
@require_auth(['order:read', '*'])
def get_order_procedure(procedure_id):
    """Get single order procedure by ID"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute(
                """
                SELECT
                    id,
                    order_id,
                    procedure_code,
                    procedure_name,
                    modality,
                    accession_number,
                    scheduled_at,
                    sequence_number,
                    loinc_code,
                    loinc_name,
                    status,
                    details,
                    created_at,
                    updated_at
                FROM order_procedures
                WHERE id = %s
                """,
                (procedure_id,)
            )
            procedure = cursor.fetchone()

            if not procedure:
                return jsonify({
                    "status": "error",
                    "message": "Order procedure not found"
                }), 404

            # Convert UUID to string
            if procedure.get('id'):
                procedure['id'] = str(procedure['id'])
            if procedure.get('order_id'):
                procedure['order_id'] = str(procedure['order_id'])

            return jsonify({
                "status": "success",
                "procedure": procedure
            }), 200

    except Exception as e:
        logger.error(f"Error getting order procedure: {str(e)}", exc_info=True)
        return jsonify({
            "status": "error",
            "message": "Failed to get order procedure",
            "detail": str(e)
        }), 500


@app.route('/order-procedures/<procedure_id>', methods=['PATCH', 'PUT'])
@require_auth(['order:update', '*'])
def update_order_procedure(procedure_id):
    """
    Update order procedure (schedule intake, modality, status, etc.)

    Expected payload:
    {
        "scheduled_at": "2025-11-24T22:50",
        "modality": "CT",
        "status": "scheduled",
        "procedure_code": "...",
        "procedure_name": "...",
        "loinc_code": "...",
        "loinc_name": "..."
    }
    """
    try:
        data = request.get_json() or {}
        actor_info = resolve_request_actor()
        actor_display = actor_info.get('identifier', 'system')

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Check if procedure exists
            cursor.execute(
                "SELECT id, order_id, status, details FROM order_procedures WHERE id = %s",
                (procedure_id,)
            )
            existing = cursor.fetchone()

            if not existing:
                return jsonify({
                    "status": "error",
                    "message": "Order procedure not found"
                }), 404

            # Build update fields
            update_fields = []
            params = []

            if 'scheduled_at' in data:
                update_fields.append("scheduled_at = %s")
                params.append(data['scheduled_at'])

            if 'modality' in data:
                update_fields.append("modality = %s")
                params.append(data['modality'])

            if 'status' in data:
                update_fields.append("status = %s")
                params.append(data['status'])

            if 'procedure_code' in data:
                update_fields.append("procedure_code = %s")
                params.append(data['procedure_code'])

            if 'procedure_name' in data:
                update_fields.append("procedure_name = %s")
                params.append(data['procedure_name'])

            if 'loinc_code' in data:
                update_fields.append("loinc_code = %s")
                params.append(data['loinc_code'])

            if 'loinc_name' in data:
                update_fields.append("loinc_name = %s")
                params.append(data['loinc_name'])

            if 'accession_number' in data:
                update_fields.append("accession_number = %s")
                params.append(data['accession_number'])

            if not update_fields:
                return jsonify({
                    "status": "error",
                    "message": "No update fields provided"
                }), 400

            # Update details with audit trail
            existing_details = existing.get('details') or {}
            if not isinstance(existing_details, dict):
                try:
                    existing_details = json.loads(str(existing_details)) if existing_details else {}
                except Exception:
                    existing_details = {}

            updated_details = dict(existing_details)
            updated_details['updated_by'] = actor_display
            updated_details['updated_at'] = utc_now_iso()

            update_fields.append("details = %s")
            params.append(Json(updated_details))

            update_fields.append("updated_at = CURRENT_TIMESTAMP")

            # Execute update
            params.append(procedure_id)
            cursor.execute(
                f"""
                UPDATE order_procedures
                SET {', '.join(update_fields)}
                WHERE id = %s
                RETURNING
                    id,
                    order_id,
                    procedure_code,
                    procedure_name,
                    modality,
                    accession_number,
                    scheduled_at,
                    sequence_number,
                    loinc_code,
                    loinc_name,
                    status,
                    details,
                    created_at,
                    updated_at
                """,
                params
            )

            updated = cursor.fetchone()

            if updated:
                # Convert UUIDs to strings
                if updated.get('id'):
                    updated['id'] = str(updated['id'])
                if updated.get('order_id'):
                    updated['order_id'] = str(updated['order_id'])

                # Auto-sync main order status based on all procedures
                order_id = str(updated['order_id'])
                try:
                    # Get all procedure statuses for this order
                    cursor.execute(
                        """
                        SELECT status, COUNT(*) as count
                        FROM order_procedures
                        WHERE order_id = %s
                        GROUP BY status
                        """,
                        (order_id,)
                    )
                    status_counts = cursor.fetchall()

                    # Determine main order status based on procedure statuses
                    # Priority: completed > in_progress > scheduled > created
                    total_procedures = sum(row['count'] for row in status_counts)
                    status_map = {row['status']: row['count'] for row in status_counts}

                    new_order_status = None

                    # If all procedures completed
                    if status_map.get('completed', 0) == total_procedures:
                        new_order_status = 'completed'
                    # If any procedure in progress
                    elif status_map.get('in_progress', 0) > 0:
                        new_order_status = 'in_progress'
                    # If all procedures scheduled (and none in progress/completed)
                    elif status_map.get('scheduled', 0) == total_procedures:
                        new_order_status = 'scheduled'
                    # If any procedure scheduled
                    elif status_map.get('scheduled', 0) > 0:
                        new_order_status = 'scheduled'
                    # If all cancelled
                    elif status_map.get('cancelled', 0) == total_procedures:
                        new_order_status = 'cancelled'
                    # Default: keep as created or use most advanced status
                    else:
                        # Use the most "advanced" status found
                        status_priority = ['completed', 'in_progress', 'scheduled', 'created']
                        for s in status_priority:
                            if status_map.get(s, 0) > 0:
                                new_order_status = s
                                break

                    if new_order_status:
                        # Update main order status
                        cursor.execute(
                            """
                            UPDATE orders
                            SET status = %s,
                                order_status = %s,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE id = %s
                            """,
                            (new_order_status.upper(), new_order_status, order_id)
                        )
                        logger.info(
                            f"Auto-synced order {order_id} status to '{new_order_status}' "
                            f"based on procedure statuses: {status_map}"
                        )
                except Exception as sync_err:
                    logger.error(f"Failed to auto-sync order status for {order_id}: {sync_err}")
                    # Don't fail the request, procedure was updated successfully

                logger.info(f"Updated order procedure {procedure_id} by {actor_display}")

                return jsonify({
                    "status": "success",
                    "message": "Order procedure updated successfully",
                    "procedure": updated,
                    "order_status_synced": True
                }), 200
            else:
                return jsonify({
                    "status": "error",
                    "message": "Failed to update order procedure"
                }), 500

    except Exception as e:
        logger.error(f"Error updating order procedure: {str(e)}", exc_info=True)
        return jsonify({
            "status": "error",
            "message": "Failed to update order procedure",
            "detail": str(e)
        }), 500


@app.route('/orders/list', methods=['GET'])
@require_auth(['order:read', '*'])
def list_orders():
    """
    List orders with primary fields only.

    This endpoint is used by the API Gateway as the root list (/orders),
    so response harus ringan dan stabil untuk konsumsi UI/integasi.

    Query Parameters:
    - status (str): Filter by order status.
    - date (str): Filter orders scheduled on a specific date (YYYY-MM-DD).
    - start_date (str): Filter orders created on or after this date (YYYY-MM-DD).
    - end_date (str): Filter orders created on or before this date (YYYY-MM-DD).
    - modality (str): Filter by modality.
    - source (str): Filter by order_source.
    - patient_national_id (str): Filter by patient's national ID (NIK).
    - medical_record_number (str): Filter by patient's medical record number (MRN).
    - procedure_code (str): Filter by procedure code.
    - procedure_name (str): Filter by procedure name.
    - satusehat_synced (bool): Filter by SatuSehat sync status.
    - duplicates (bool): Show potential duplicates.
    - clean (bool): Hide duplicates and show only primary order.
    - limit (int): Number of records to return (default 100, max 500).
    - offset (int): Number of records to skip (for pagination).

    Response (ringkasan struktur):

      {
        "status": "success",
        "orders": [
          {
            "id": "<uuid>",
            "order_number": "ORD2025010100001",
            "accession_number": "ACC20250101000001",
            "patient_name": "John Doe",
            "patient_national_id": "1234567890123456",
            "medical_record_number": "MRN-001",
            "modality": "CT",
            "procedure_code": "CTHEAD",
            "procedure_name": "CT Scan Head",
            "registration_number": "REG-001",
            "order_source": "simrs|api|pacs|unknown",
            "status": "CREATED|SCHEDULED|COMPLETED|CANCELED|DELETED|...",
            "order_status": "<opsional, status lanjutan>",
            "worklist_status": "<status MWL jika ada>",
            "satusehat_synced": true/false,
            "scheduled_at": "2025-01-01T08:00:00Z",
            "created_at": "2025-01-01T07:50:00Z",

            "completed_at": "2025-01-01T09:00:00Z" | null,
            "completed_by": "user@example.com" | null,
            "cancel_at": "2025-01-01T08:10:00Z" | null,
            "cancel_by": "user@example.com" | null
          },
          ...
        ],
        "count": 10,
        "total": 123,
        "limit": 100,
        "offset": 0
      }

    Catatan lifecycle:
    - completed_at / completed_by:
        - Diisi otomatis saat status diupdate ke status selesai
          (is_completed_status: COMPLETED/FINISHED/DONE) jika sebelumnya null.
    - cancel_at / cancel_by:
        - Diisi otomatis saat:
            - DELETE /orders/<id> (soft delete), atau
            - status diupdate ke status batal
              (is_canceled_status: CANCELED/CANCELLED/VOID/DELETED)
          jika sebelumnya null.
    - Nilai tidak di-reset bila status berubah lagi; digunakan untuk audit trail yang robust.
    """
    try:
        status = request.args.get('status')
        date = request.args.get('date')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        modality = request.args.get('modality')
        source = request.args.get('source')
        patient_nik = request.args.get('patient_national_id')
        patient_mrn = request.args.get('medical_record_number')
        procedure_code = request.args.get('procedure_code')
        procedure_name = request.args.get('procedure_name')
        # New: filter by SatuSehat sync flag (?satusehat_synced=true/false)
        satusehat_synced_param = request.args.get('satusehat_synced')
        # New: filter for potential duplicates (?duplicates=true)
        duplicates_only = request.args.get('duplicates')
        # New: hide duplicates and only show primary order per group (?clean=true)
        clean = request.args.get('clean')
        limit = request.args.get('limit', 100, type=int)
        offset = request.args.get('offset', 0, type=int)

        # Boundaries untuk mencegah abuse
        if limit < 1:
            limit = 1
        if limit > 500:
            limit = 500
        if offset < 0:
            offset = 0

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Hanya pilih kolom utama yang relevan untuk tampilan list
            base_query = "status != 'DELETED'"
            params = []

            if status:
                base_query += " AND status = %s"
                params.append(status)

            if date:
                base_query += " AND (scheduled_at::date) = %s"
                params.append(date)

            if start_date:
                base_query += " AND created_at::date >= %s"
                params.append(start_date)

            if end_date:
                base_query += " AND created_at::date <= %s"
                params.append(end_date)

            if modality:
                base_query += " AND modality = %s"
                params.append(modality)

            if source:
                # Normalisasi ke lower-case untuk konsistensi penyimpanan
                base_query += " AND LOWER(COALESCE(order_source, '')) = %s"
                params.append(source.lower())

            # Patient filters
            if patient_nik:
                base_query += " AND COALESCE(patient_national_id, '') = %s"
                params.append(patient_nik)

            if patient_mrn:
                base_query += " AND COALESCE(medical_record_number, '') = %s"
                params.append(patient_mrn)

            # Procedure filters
            if procedure_code:
                base_query += " AND COALESCE(procedure_code, '') = %s"
                params.append(procedure_code)

            if procedure_name:
                base_query += " AND COALESCE(procedure_name, '') = %s"
                params.append(procedure_name)

            # Filter by SatuSehat sync status if provided
            # ?satusehat_synced=true  -> satusehat_synced = TRUE
            # ?satusehat_synced=false -> satusehat_synced IS FALSE OR satusehat_synced IS NULL
            if satusehat_synced_param is not None:
                raw = satusehat_synced_param.strip().lower()
                if raw in ('true', '1', 'yes', 'y'):
                    base_query += " AND satusehat_synced = TRUE"
                elif raw in ('false', '0', 'no', 'n'):
                    base_query += " AND (satusehat_synced = FALSE OR satusehat_synced IS NULL)"
                # nilai lain diabaikan (tidak menambah kondisi)

            # Duplicate detection filter
            if duplicates_only and duplicates_only.lower() in ('true', '1', 'yes', 'y'):
                base_query += " AND (patient_national_id, medical_record_number, modality, procedure_code, procedure_name) IN (SELECT patient_national_id, medical_record_number, modality, procedure_code, procedure_name FROM orders WHERE status != 'DELETED' AND patient_national_id IS NOT NULL AND medical_record_number IS NOT NULL AND modality IS NOT NULL AND procedure_code IS NOT NULL AND procedure_name IS NOT NULL AND created_at >= (CURRENT_TIMESTAMP - INTERVAL '24 hours') ORDER BY created_at DESC LIMIT 5)"

            # Clean duplicates filter
            if clean and clean.lower() in ('true', '1', 'yes', 'y'):
                base_query += " AND id IN (SELECT MIN(id) FROM orders WHERE status != 'DELETED' AND patient_national_id IS NOT NULL AND medical_record_number IS NOT NULL AND modality IS NOT NULL AND procedure_code IS NOT NULL AND procedure_name IS NOT NULL AND created_at >= (CURRENT_TIMESTAMP - INTERVAL '24 hours') GROUP BY patient_national_id, medical_record_number, modality, procedure_code, procedure_name)"

            # Build final query
            query = f"""
                SELECT
                    id,
                    order_number,
                    accession_number,
                    patient_name,
                    patient_national_id,
                    medical_record_number,
                    modality,
                    procedure_code,
                    procedure_name,
                    registration_number,
                    order_source,
                    status,
                    order_status,
                    worklist_status,
                    satusehat_synced,
                    satusehat_encounter_id,
                    satusehat_service_request_id,
                    satusehat_sync_date,
                    created_at,
                    scheduled_at,
                    completed_at,
                    completed_by,
                    cancel_at,
                    cancel_by
                FROM orders
                WHERE {base_query}
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s
            """
            params += [limit, offset]

            cursor.execute(query, params)
            rows = cursor.fetchall() or []

            # Normalisasi id ke string dan tambahkan procedure_count
            for r in rows:
                if r.get('id') is not None:
                    r['id'] = str(r['id'])
                    order_id = r['id']

                    # Count procedures for each order
                    cursor.execute(
                        """
                        SELECT COUNT(*) as count
                        FROM order_procedures
                        WHERE order_id = %s
                        """,
                        (order_id,)
                    )
                    proc_count_row = cursor.fetchone()
                    r['procedure_count'] = proc_count_row['count'] if proc_count_row else 0

                    # Optionally fetch procedure summary (codes and names)
                    if r['procedure_count'] > 0:
                        cursor.execute(
                            """
                            SELECT procedure_code, procedure_name, modality, accession_number
                            FROM order_procedures
                            WHERE order_id = %s
                            ORDER BY sequence_number
                            """,
                            (order_id,)
                        )
                        procedures = cursor.fetchall()
                        r['procedures'] = [
                            {
                                'code': p['procedure_code'],
                                'name': p['procedure_name'],
                                'modality': p['modality'],
                                'accession_number': p['accession_number']
                            }
                            for p in procedures
                        ]

            return jsonify({
                "status": "success",
                "orders": rows,
                "count": len(rows),
                "total": len(rows),
                "limit": limit,
                "offset": offset
            }), 200

    except Exception as e:
        logger.error(f"Error listing orders: {str(e)}", exc_info=True)
        return jsonify({
            "status": "error",
            "message": "Failed to list orders",
            "detail": str(e)
        }), 500


if __name__ == '__main__':
    logger.info("Order Management Service starting...")
    try:
        wait_for_database()
        init_database()
        logger.info("Database initialization completed successfully")
    except Exception as e:
        logger.critical(f"Failed to initialize database: {e}")
        sys.exit(1)

    port = int(os.getenv('PORT', 8001))
    host = os.getenv('HOST', '0.0.0.0')
    debug = os.getenv('FLASK_DEBUG', 'False').lower() in ('true', '1', 'yes')

    logger.info(f"Starting Order Management Service on {host}:{port} (debug={debug})")
    app.run(host=host, port=port, debug=debug)
