#!/usr/bin/env python3
"""
Helper script to align order_procedures status with their parent orders.

Rules:
- Uses orders.status as the primary status; falls back to orders.order_status when status is empty.
- For cancelled orders, sets procedure status to "cancelled" and backfills cancelled_at/cancelled_by.
- For completed orders, sets procedure status to "completed" and backfills completed_at/completed_by.
- Other statuses are copied as-is to procedures (arrived, scheduled, in_progress, etc).
"""

import argparse
import os
import sys
from datetime import datetime, timezone

import shutil
import subprocess
import psycopg2
from psycopg2 import OperationalError
from psycopg2.extras import RealDictCursor, Json


DB_CONFIG = {
    "host": os.getenv("POSTGRES_HOST", "postgres"),
    "database": os.getenv("POSTGRES_DB", "worklist_db"),
    "user": os.getenv("POSTGRES_USER", "dicom"),
    "password": os.getenv("POSTGRES_PASSWORD", "dicom123"),
    "port": int(os.getenv("POSTGRES_PORT", "5432")),
}

CANCELED = {"cancelled", "canceled", "no_show", "void", "deleted"}
COMPLETED = {"completed", "reported", "finalized"}


def ensure_dict(value):
    if isinstance(value, dict):
        return dict(value)
    return {}


def append_history(details, prev_status, new_status, actor):
    details = ensure_dict(details)
    history = details.get("status_history")
    if not isinstance(history, list):
        history = []
    now_iso = datetime.now(timezone.utc).isoformat()
    history.append(
        {
            "from": prev_status or None,
            "to": new_status,
            "at": now_iso,
            "by": actor,
            "source": "sync_order_procedure_status",
        }
    )
    details["status_history"] = history
    details["updated"] = {"at": now_iso, "by": actor}
    return details


def normalize_status(value):
    if value is None:
        return None
    return str(value).strip().lower()


def main(dry_run: bool):
    # If we're not already in the container, prefer executing inside order-management so postgres DNS works.
    if os.getenv("REENTERED_DOCKER") != "1":
        docker_container = os.getenv("OM_CONTAINER", "order-management")
        docker_bin = shutil.which("docker")
        if docker_bin:
            cmd = [
                docker_bin,
                "exec",
                docker_container,
                "env",
                "REENTERED_DOCKER=1",
                "POSTGRES_HOST=postgres",
                "python",
                "/app/scripts/sync_order_procedure_status.py",
            ]
            if dry_run:
                cmd.append("--dry-run")
            print(
                f"Running inside container '{docker_container}' for DB connectivity...",
                flush=True,
            )
            subprocess.check_call(cmd)
            return
        else:
            print("docker not found on host; attempting direct DB connection...")

    # Try multiple hosts to work both inside/outside docker (similar to auto-heal scripts)
    candidates = [
        (DB_CONFIG["host"], DB_CONFIG["port"]),
        ("localhost", 5532),
        ("127.0.0.1", 5532),
        ("localhost", 5432),
        ("127.0.0.1", 5432),
    ]

    last_err = None
    conn = None
    for host, port in candidates:
        try:
            conn = psycopg2.connect(
                host=host,
                port=port,
                database=DB_CONFIG["database"],
                user=DB_CONFIG["user"],
                password=DB_CONFIG["password"],
                connect_timeout=5,
            )
            print(f"Connected to Postgres at {host}:{port}")
            # Disable triggers to avoid legacy trigger errors (e.g., worklist_items without procedure_id)
            with conn.cursor() as cur:
                cur.execute("SET session_replication_role = replica;")
            break
        except OperationalError as exc:
            last_err = exc
            continue
    if conn is None:
        raise last_err or RuntimeError("Unable to connect to Postgres")
    cursor = conn.cursor(cursor_factory=RealDictCursor)

    cursor.execute(
        """
        SELECT
            o.id AS order_id,
            o.status AS order_status,
            o.order_status AS order_order_status,
            o.cancel_at,
            o.cancel_by,
            o.completed_at,
            o.completed_by
        FROM orders o
        WHERE EXISTS (SELECT 1 FROM order_procedures op WHERE op.order_id = o.id)
        """
    )
    orders = cursor.fetchall()

    total_proc_updates = 0          # actual updates written
    total_proc_changes_needed = 0   # updates that would be written (dry-run)
    orders_needing_update = 0
    actor = "sync-script"

    for order in orders:
        order_id = str(order["order_id"])
        target_status = normalize_status(order.get("order_status")) or normalize_status(
            order.get("order_order_status")
        )
        if not target_status:
            continue

        cursor.execute(
            """
            SELECT id, status, cancelled_at, cancelled_by, completed_at, completed_by, details
            FROM order_procedures
            WHERE order_id = %s
            """,
            (order_id,),
        )
        procedures = cursor.fetchall()

        order_changed = False
        for proc in procedures:
            proc_id = str(proc["id"])
            current_status = normalize_status(proc.get("status"))
            updates = []
            params = []
            new_details = proc.get("details")
            change_needed = False

            if target_status in CANCELED:
                change_needed = (
                    current_status != "cancelled"
                    or proc.get("cancelled_at") is None
                    or proc.get("cancelled_by") is None
                )
                if not change_needed:
                    continue
                updates.extend(
                    [
                        "status = %s",
                        "cancelled_at = %s",
                        "cancelled_by = %s",
                        "updated_at = %s",
                        "details = %s",
                    ]
                )
                now_ts = datetime.now(timezone.utc)
                new_details = append_history(
                    new_details,
                    current_status,
                    "cancelled",
                    order.get("cancel_by") or actor,
                )
                params.extend(
                    [
                        "cancelled",
                        order.get("cancel_at") or now_ts,
                        order.get("cancel_by") or actor,
                        now_ts,
                        Json(new_details),
                    ]
                )
            elif target_status in COMPLETED:
                change_needed = (
                    current_status != "completed"
                    or proc.get("completed_at") is None
                    or proc.get("completed_by") is None
                )
                if not change_needed:
                    continue
                updates.extend(
                    [
                        "status = %s",
                        "completed_at = %s",
                        "completed_by = %s",
                        "updated_at = %s",
                        "details = %s",
                    ]
                )
                now_ts = datetime.now(timezone.utc)
                new_details = append_history(
                    new_details,
                    current_status,
                    "completed",
                    order.get("completed_by") or actor,
                )
                params.extend(
                    [
                        "completed",
                        order.get("completed_at") or now_ts,
                        order.get("completed_by") or actor,
                        now_ts,
                        Json(new_details),
                    ]
                )
            else:
                change_needed = current_status != target_status
                if not change_needed:
                    continue
                updates.extend(["status = %s", "updated_at = %s", "details = %s"])
                now_ts = datetime.now(timezone.utc)
                new_details = append_history(new_details, current_status, target_status, actor)
                params.extend([target_status, now_ts, Json(new_details)])

            total_proc_changes_needed += 1
            order_changed = True
            params.append(proc_id)
            if not dry_run:
                cursor.execute(
                    f"UPDATE order_procedures SET {', '.join(updates)} WHERE id = %s", params
                )
                total_proc_updates += 1
        if order_changed:
            orders_needing_update += 1

    if dry_run:
        conn.rollback()
    else:
        conn.commit()

    if dry_run or total_proc_updates == 0:
        print(f"Orders with pending procedure updates: {orders_needing_update}")
        print(f"Procedures needing update: {total_proc_changes_needed}")
        if orders_needing_update == 0 and total_proc_changes_needed == 0:
            print("No procedure status changes needed.")
    else:
        print(f"Orders processed: {len(orders)}")
        print(f"Orders updated: {orders_needing_update}")
        print(f"Procedures updated: {total_proc_updates}")

    cursor.close()
    conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Sync order_procedures status with orders status/order_status."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Do not write changes, just simulate.",
    )
    args = parser.parse_args()
    try:
        main(dry_run=args.dry_run)
    except KeyboardInterrupt:
        sys.exit(1)
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
