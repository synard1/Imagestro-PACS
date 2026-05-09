#!/usr/bin/env python3
"""
Backfill worklist_items from existing orders.

Rules:
- Skip orders with status in EXCLUDED_STATUSES (draft/created/cancel*/deleted/no_show).
- Only insert when no worklist_items row exists for the order_id.
- SPS status is derived from order status using SPS_STATUS_MAPPING.
"""
import os
import sys
import time
import uuid
from datetime import datetime, date, time as dtime

import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

# Load environment variables from .env if present (same pattern as run-worklist-migration)
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

DB_CONFIG = {
    "host": os.getenv("POSTGRES_HOST", "localhost"),
    "port": int(os.getenv("POSTGRES_PORT", 5532)),
    "database": os.getenv("POSTGRES_DB", "worklist_db"),
    "user": os.getenv("POSTGRES_USER", "dicom"),
    "password": os.getenv("POSTGRES_PASSWORD", "dicom123"),
    "connect_timeout": 10,
}

# Status handling
EXCLUDED_STATUSES = {
    "draft",
    "created",
    "cancel",
    "cancelled",
    "canceled",
    "deleted",
    "void",
    "no_show",
}

SPS_STATUS_MAPPING = {
    "scheduled": "SCHEDULED",
    "enqueued": "SCHEDULED",
    "rescheduled": "SCHEDULED",
    "arrived": "ARRIVED",
    "in_progress": "STARTED",
    "completed": "COMPLETED",
    "reported": "COMPLETED",
    "finalized": "COMPLETED",
    "cancelled": "DISCONTINUED",
    "canceled": "DISCONTINUED",
    "no_show": "DISCONTINUED",
}

DEFAULT_AE_TITLE = os.getenv("MWL_STATION_AET", "SCANNER01")


def _generate_study_uid() -> str:
    """Generate a Study Instance UID."""
    ts = int(time.time())
    rand = uuid.uuid4().hex[:12]
    return f"1.2.840.113619.{ts}.{rand}"


def _derive_sps_status(order_status: str) -> str:
    if not order_status:
        return "SCHEDULED"
    normalized = order_status.strip().lower()
    return SPS_STATUS_MAPPING.get(normalized, "SCHEDULED")


def _split_scheduled_at(scheduled_at):
    """Return (date, time) tuple from scheduled_at timestamp or defaults."""
    if scheduled_at is None:
        today = date.today()
        return today, dtime(hour=9, minute=0)
    if isinstance(scheduled_at, datetime):
        return scheduled_at.date(), scheduled_at.time().replace(microsecond=0)
    # Fallback: try to parse ISO string
    try:
        dt = datetime.fromisoformat(str(scheduled_at))
        return dt.date(), dt.time().replace(microsecond=0)
    except Exception:
        today = date.today()
        return today, dtime(hour=9, minute=0)


def fetch_candidates(cursor):
    """Fetch orders without a worklist_items row and not in excluded statuses."""
    cursor.execute(
        """
        SELECT o.*
        FROM orders o
        LEFT JOIN worklist_items w ON w.order_id = o.id
        WHERE w.id IS NULL
          AND COALESCE(o.accession_number, '') <> ''
          AND LOWER(COALESCE(o.status, '')) NOT IN %s
        """,
        (tuple(EXCLUDED_STATUSES),),
    )
    return cursor.fetchall() or []


def insert_worklist(cursor, order_row):
    """Insert a worklist_items record derived from an order row."""
    scheduled_date, scheduled_time = _split_scheduled_at(order_row.get("scheduled_at"))

    patient_identifier = (
        order_row.get("patient_id")
        or order_row.get("medical_record_number")
        or order_row.get("patient_national_id")
        or "UNKNOWN"
    )

    gender_raw = order_row.get("gender")
    patient_sex = None
    if gender_raw:
        patient_sex = str(gender_raw).strip()[:1].upper()

    payload = {
        "order_id": order_row.get("id"),
        "study_instance_uid": _generate_study_uid(),
        "accession_number": order_row.get("accession_number"),
        "sps_id": f"SPS-{order_row.get('order_number') or uuid.uuid4().hex[:12].upper()}",
        "sps_status": _derive_sps_status(order_row.get("status")),
        "scheduled_procedure_step_start_date": scheduled_date,
        "scheduled_procedure_step_start_time": scheduled_time,
        "scheduled_procedure_step_description": order_row.get("procedure_description")
        or order_row.get("procedure_name")
        or "Unknown",
        "modality": order_row.get("modality") or "OT",
        "scheduled_station_ae_title": order_row.get("ordering_station_aet") or DEFAULT_AE_TITLE,
        "scheduled_station_name": None,
        "patient_id": patient_identifier,
        "patient_name": order_row.get("patient_name") or "Unknown Patient",
        "patient_birth_date": order_row.get("birth_date"),
        "patient_sex": patient_sex,
        "requested_procedure_description": order_row.get("procedure_description")
        or order_row.get("procedure_name"),
        "study_description": order_row.get("procedure_name") or order_row.get("procedure_description"),
        "referring_physician_name": order_row.get("referring_doctor"),
        "priority": order_row.get("priority") or "ROUTINE",
    }

    cursor.execute(
        """
        INSERT INTO worklist_items (
            order_id,
            study_instance_uid,
            accession_number,
            sps_id,
            sps_status,
            scheduled_procedure_step_start_date,
            scheduled_procedure_step_start_time,
            scheduled_procedure_step_description,
            modality,
            scheduled_station_ae_title,
            scheduled_station_name,
            patient_id,
            patient_name,
            patient_birth_date,
            patient_sex,
            requested_procedure_description,
            study_description,
            referring_physician_name,
            priority
        ) VALUES (
            %(order_id)s,
            %(study_instance_uid)s,
            %(accession_number)s,
            %(sps_id)s,
            %(sps_status)s,
            %(scheduled_procedure_step_start_date)s,
            %(scheduled_procedure_step_start_time)s,
            %(scheduled_procedure_step_description)s,
            %(modality)s,
            %(scheduled_station_ae_title)s,
            %(scheduled_station_name)s,
            %(patient_id)s,
            %(patient_name)s,
            %(patient_birth_date)s,
            %(patient_sex)s,
            %(requested_procedure_description)s,
            %(study_description)s,
            %(referring_physician_name)s,
            %(priority)s
        )
        ON CONFLICT DO NOTHING
        """,
        payload,
    )


def main():
    print("Connecting to database:", DB_CONFIG["host"], DB_CONFIG["database"])
    try:
        with psycopg2.connect(**DB_CONFIG) as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                candidates = fetch_candidates(cursor)
                print(f"Found {len(candidates)} order(s) without worklist_items")

                inserted = 0
                for row in candidates:
                    status = (row.get("status") or "").lower()
                    if status in EXCLUDED_STATUSES:
                        continue
                    insert_worklist(cursor, row)
                    inserted += 1

                conn.commit()
                print(f"Inserted {inserted} worklist record(s)")
    except Exception as exc:
        print(f"Error syncing orders to worklist_items: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
