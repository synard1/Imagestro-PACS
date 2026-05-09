import os
import math
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional

import psycopg2
from psycopg2.extras import DictCursor


def get_db_conn():
    return psycopg2.connect(
        host=os.getenv("POSTGRES_HOST", "postgres"),
        port=int(os.getenv("POSTGRES_PORT", "5432")),
        dbname=os.getenv("POSTGRES_DB", "worklist_db"),
        user=os.getenv("POSTGRES_USER", "dicom"),
        password=os.getenv("POSTGRES_PASSWORD", "dicom123"),
    )


def parse_date_param(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        # interpret as local date, normalize to UTC boundaries later
        return datetime.strptime(value, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        raise ValueError("Invalid date format, expected YYYY-MM-DD")


def normalize_range(start_date: Optional[datetime], end_date: Optional[datetime]) -> (datetime, datetime):
    now_utc = datetime.now(timezone.utc)

    if end_date is None:
        end_date = now_utc
    if start_date is None:
        start_date = end_date - timedelta(days=30)

    # floor start to 00:00:00, ceil end to 23:59:59.999
    start = start_date.replace(hour=0, minute=0, second=0, microsecond=0)
    end = end_date.replace(hour=23, minute=59, second=59, microsecond=999000)

    if start > end:
        raise ValueError("startDate must be <= endDate")

    return start, end


def build_filters(modality: Optional[str], priority: Optional[str], statuses: Optional[str]) -> Dict[str, Any]:
    filters = {
        "modality": modality if modality and modality.lower() != "all" else "all",
        "priority": priority if priority and priority.lower() != "all" else "all",
        "statuses": None,
    }

    if statuses:
        parts = [s.strip() for s in statuses.split(",") if s.strip()]
        filters["statuses"] = parts if parts else None

    return filters


def effective_where_clause(start: datetime, end: datetime, filters: Dict[str, Any]) -> tuple:
    """
    Build SQL WHERE clause + params.
    Date filter: use scheduled_at; fallback created_at if scheduled_at is null.
    """
    where = []
    params = []

    # primary date column expression
    date_expr = "COALESCE(scheduled_at, created_at)"

    where.append(f"{date_expr} BETWEEN %s AND %s")
    params.extend([start, end])

    if filters["modality"] != "all":
        where.append("modality = %s")
        params.append(filters["modality"])

    if filters["priority"] != "all":
        where.append("priority = %s")  # Note: priority column may not exist, will be handled in query
        params.append(filters["priority"])

    if filters["statuses"]:
        where.append("status = ANY(%s)")
        params.append(filters["statuses"])

    clause = "WHERE " + " AND ".join(where)
    return clause, params


def fetch_report_summary(
    start: datetime,
    end: datetime,
    filters: Dict[str, Any],
) -> Dict[str, Any]:
    where_clause, params = effective_where_clause(start, end, filters)

    conn = get_db_conn()
    try:
        with conn.cursor(cursor_factory=DictCursor) as cur:
            # 1) Totals + status buckets + averages + satusehat
            cur.execute(
                f"""
                WITH base AS (
                    SELECT
                        id,
                        accession_number,
                        patient_name,
                        modality,
                        status,
                        order_status,
                        created_at,
                        scheduled_at,
                        completed_at,
                        referring_doctor,
                        satusehat_synced,
                        satusehat_sync_date
                    FROM orders
                    {where_clause}
                )
                SELECT
                    COUNT(*) AS total_orders,
                    COUNT(*) FILTER (WHERE order_status = 'completed' OR status = 'COMPLETED') AS completed,
                    COUNT(*) FILTER (WHERE order_status = 'scheduled' OR status = 'SCHEDULED') AS scheduled,
                    COUNT(*) FILTER (WHERE order_status = 'in_progress' OR status = 'IN_PROGRESS') AS in_progress,
                    COUNT(*) FILTER (WHERE order_status = 'cancelled' OR status = 'CANCELLED' OR status = 'DELETED') AS cancelled,
                    COUNT(*) FILTER (WHERE satusehat_synced = TRUE) AS satusehat_synced,
                    COUNT(*) FILTER (WHERE satusehat_synced = FALSE OR satusehat_synced IS NULL) AS satusehat_pending,
                    COUNT(*) FILTER (WHERE satusehat_synced = FALSE AND satusehat_sync_date IS NOT NULL) AS satusehat_failed,
                    AVG(EXTRACT(EPOCH FROM (completed_at - COALESCE(scheduled_at, created_at))) / 3600.0)
                        FILTER (WHERE completed_at IS NOT NULL AND (scheduled_at IS NOT NULL OR created_at IS NOT NULL))
                        AS avg_turnaround_hours,
                    AVG(EXTRACT(EPOCH FROM (COALESCE(scheduled_at, created_at) - created_at)) / 3600.0)
                        FILTER (WHERE (scheduled_at IS NOT NULL OR created_at IS NOT NULL) AND created_at IS NOT NULL)
                        AS avg_wait_hours
                FROM base;
                """,
                params,
            )
            totals_row = cur.fetchone()

            # 2) Trends per day
            cur.execute(
                f"""
                WITH base AS (
                    SELECT
                        COALESCE(scheduled_at, created_at) AS ref_date,
                        status,
                        order_status,
                        satusehat_synced,
                        created_at,
                        completed_at
                    FROM orders
                    {where_clause}
                )
                SELECT
                    DATE(ref_date) AS day,
                    COUNT(*) AS created,
                    COUNT(*) FILTER (WHERE order_status = 'completed' OR status = 'COMPLETED') AS completed,
                    COUNT(*) FILTER (WHERE satusehat_synced = TRUE) AS synced
                FROM base
                GROUP BY DATE(ref_date)
                ORDER BY day;
                """,
                params,
            )
            trends_rows = cur.fetchall()

            # 3) Modality breakdown
            cur.execute(
                f"""
                SELECT
                    modality AS name,
                    COUNT(*) AS count,
                    COUNT(*) FILTER (WHERE order_status = 'completed' OR status = 'COMPLETED') AS completed
                FROM orders
                {where_clause}
                GROUP BY modality
                ORDER BY count DESC;
                """,
                params,
            )
            modality_rows = cur.fetchall()

            # 4) Doctor performance (top 10)
            cur.execute(
                f"""
                SELECT
                    COALESCE(referring_doctor, 'Unknown') AS name,
                    COUNT(*) AS orders,
                    COUNT(*) FILTER (WHERE order_status = 'completed' OR status = 'COMPLETED') AS completed
                FROM orders
                {where_clause}
                GROUP BY COALESCE(referring_doctor, 'Unknown')
                HAVING COUNT(*) > 0
                ORDER BY orders DESC
                LIMIT 10;
                """,
                params,
            )
            doctor_rows = cur.fetchall()

            # 5) Status breakdown
            cur.execute(
                f"""
                SELECT
                    status,
                    COUNT(*) AS count
                FROM orders
                {where_clause}
                GROUP BY status;
                """,
                params,
            )
            status_rows = cur.fetchall()

            # 6) Priority breakdown (only if priority column exists)
            priority_rows = []
            try:
                cur.execute(
                    f"""
                    SELECT
                        priority,
                        COUNT(*) AS count
                    FROM orders
                    {where_clause}
                    GROUP BY priority
                    """,
                    params,
                )
                priority_rows = cur.fetchall()
            except Exception:
                # Priority column doesn't exist, skip this query
                pass

            # 7) Long running orders (top 10 pending)
            cur.execute(
                f"""
                WITH base AS (
                    SELECT
                        id,
                        accession_number,
                        patient_name,
                        modality,
                        status,
                        order_status,
                        scheduled_at,
                        created_at
                    FROM orders
                    {where_clause}
                        AND (order_status = 'scheduled' OR status = 'SCHEDULED' OR order_status = 'in_progress' OR status = 'IN_PROGRESS')
                        AND COALESCE(scheduled_at, created_at) IS NOT NULL
                )
                SELECT
                    id,
                    accession_number,
                    patient_name,
                    modality,
                    status,
                    COALESCE(scheduled_at, created_at) AS scheduled_at,
                    EXTRACT(EPOCH FROM (NOW() AT TIME ZONE 'UTC' - COALESCE(scheduled_at, created_at))) / 3600.0
                        AS waiting_hours
                FROM base
                ORDER BY waiting_hours DESC
                LIMIT 10;
                """,
                params,
            )
            long_running_rows = cur.fetchall()

        # Build response pieces

        # Fill trends for each day in range
        trends_map = {row["day"]: row for row in trends_rows}
        trends: List[Dict[str, Any]] = []
        day = start.date()
        while day <= end.date():
            row = trends_map.get(day)
            trends.append(
                {
                    "date": day.isoformat(),
                    "created": int(row["created"]) if row else 0,
                    "completed": int(row["completed"]) if row else 0,
                    "synced": int(row["synced"]) if row else 0,
                }
            )
            day += timedelta(days=1)

        modality_breakdown = [
            {
                "name": r["name"] or "Unknown",
                "count": int(r["count"]),
                "completed": int(r["completed"]),
            }
            for r in modality_rows
        ]

        doctor_performance = []
        for r in doctor_rows:
            completed = int(r["completed"])
            orders = int(r["orders"])
            rate = int(round((completed / orders) * 100)) if orders > 0 else 0
            doctor_performance.append(
                {
                    "name": r["name"],
                    "orders": orders,
                    "completed": completed,
                    "completionRate": rate,
                }
            )

        status_breakdown = [
            {"status": r["status"], "count": int(r["count"])} for r in status_rows
        ]

        priority_breakdown = []
        if priority_rows:
            priority_breakdown = [
                {"priority": r["priority"], "count": int(r["count"])}
                for r in priority_rows
                if r["priority"] is not None
            ]

        long_running_orders = [
            {
                "id": str(r["id"]),
                "accession": r["accession_number"],
                "patient": r["patient_name"],
                "modality": r["modality"],
                "status": r["status"],
                "scheduledAt": (
                    r["scheduled_at"].astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
                    if r["scheduled_at"] is not None
                    else None
                ),
                "waitingHours": round(float(r["waiting_hours"]), 1)
                if r["waiting_hours"] is not None
                else None,
            }
            for r in long_running_rows
        ]

        total_orders = int(totals_row["total_orders"]) if totals_row and totals_row["total_orders"] is not None else 0

        # Basic bottleneck heuristics (bisa di-improve sesuai kebutuhan)
        bottlenecks: List[Dict[str, Any]] = []
        if total_orders > 0:
            if totals_row and totals_row["satusehat_failed"]:
                bottlenecks.append(
                    {
                        "label": "SATUSEHAT sync failures",
                        "count": int(totals_row["satusehat_failed"]),
                        "severity": "high",
                    }
                )
            # Orders waiting > 24h
            wait_24h = sum(1 for o in long_running_orders if (o["waitingHours"] or 0) > 24)
            if wait_24h > 0:
                bottlenecks.append(
                    {
                        "label": "Orders waiting > 24h",
                        "count": wait_24h,
                        "severity": "medium",
                    }
                )

        response = {
            "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "range": {
                "start": start.isoformat().replace("+00:00", "Z"),
                "end": end.isoformat().replace("+00:00", "Z"),
            },
            "filtersApplied": {
                "modality": filters["modality"] if filters["modality"] else "all",
                "priority": filters["priority"] if filters["priority"] else "all",
                "statuses": (
                    filters["statuses"]
                    if filters["statuses"] is not None
                    else ["scheduled", "in_progress", "completed", "cancelled"]
                ),
            },
            "totals": {
                "orders": total_orders,
                "completed": int(totals_row["completed"] or 0),
                "scheduled": int(totals_row["scheduled"] or 0),
                "inProgress": int(totals_row["in_progress"] or 0),
                "cancelled": int(totals_row["cancelled"] or 0),
                "satusehatSynced": int(totals_row["satusehat_synced"] or 0),
                "averageTurnaroundHours": round(float(totals_row["avg_turnaround_hours"]), 1)
                if totals_row and totals_row["avg_turnaround_hours"] is not None
                else 0.0,
                "averageWaitHours": round(float(totals_row["avg_wait_hours"]), 1)
                if totals_row and totals_row["avg_wait_hours"] is not None
                else 0.0,
            },
            "trends": trends,
            "modalityBreakdown": modality_breakdown,
            "doctorPerformance": doctor_performance,
            "statusBreakdown": status_breakdown,
            "priorityBreakdown": priority_breakdown,
            "satusehat": {
                "synced": int(totals_row["satusehat_synced"] or 0),
                "pending": int(totals_row["satusehat_pending"] or 0),
                "failed": int(totals_row["satusehat_failed"] or 0),
            },
            "bottlenecks": bottlenecks,
            "longRunningOrders": long_running_orders,
        }

        return response

    finally:
        conn.close()


def handle_report_summary_request(request_args) -> (Dict[str, Any], int):
    """
    Framework-agnostic handler. `request_args` should support .get(key).
    Returns (payload, http_status).
    """
    try:
        start_raw = request_args.get("startDate")
        end_raw = request_args.get("endDate")
        modality = request_args.get("modality")
        priority = request_args.get("priority")
        statuses = request_args.get("statuses")

        start_param = parse_date_param(start_raw)
        end_param = parse_date_param(end_raw)
        start, end = normalize_range(start_param, end_param)
        filters = build_filters(modality, priority, statuses)

        data = fetch_report_summary(start, end, filters)
        return data, 200
    except ValueError as ve:
        return {"error": str(ve)}, 400
    except Exception as e:
        # In real deployment: log stack trace
        return {"error": "Internal server error", "detail": str(e)}, 500
