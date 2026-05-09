"""
Order monitoring tasks
Triggers notifications for stagnant orders
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, Any

from sqlalchemy import text

from app.celery_app import celery_app
from app.database import SessionLocal
from app.services.order_notification_service import OrderNotificationService

logger = logging.getLogger(__name__)


@celery_app.task(name="app.tasks.order_tasks.check_stagnant_orders", bind=True, max_retries=1)
def check_stagnant_orders(self, hours: int = 6, limit: int = 50) -> Dict[str, Any]:
    """
    Find orders that have not progressed for a while and send alerts

    Args:
        hours: Threshold in hours to consider an order stagnant
        limit: Maximum number of orders to scan per run
    """
    db = SessionLocal()
    try:
        cutoff = datetime.utcnow() - timedelta(hours=hours)
        now = datetime.utcnow()
        rows = db.execute(
            text(
                """
                SELECT id, order_number, accession_number, patient_name, patient_id,
                       modality, procedure_name, order_status, status,
                       updated_at, created_at, scheduled_at
                FROM orders
                WHERE (order_status IS NULL OR order_status NOT IN ('COMPLETED', 'CANCELLED'))
                  AND updated_at < :cutoff
                  AND (
                    -- Exclude RESCHEDULED orders with future scheduled_at
                    order_status != 'RESCHEDULED'
                    OR scheduled_at IS NULL
                    OR scheduled_at < :now
                  )
                ORDER BY updated_at ASC
                LIMIT :limit
                """
            ),
            {"cutoff": cutoff, "limit": limit, "now": now}
        ).fetchall()

        notifier = OrderNotificationService(db)
        alerted = 0
        for row in rows:
            data = row._mapping
            last_update = data.get("updated_at") or data.get("created_at")
            now = datetime.now(tz=last_update.tzinfo) if last_update and getattr(last_update, "tzinfo", None) else datetime.utcnow()
            stagnant_hours = None
            if last_update:
                stagnant_hours = (now - last_update).total_seconds() / 3600

            notifier.notify_stagnant_order(
                order_id=str(data.get("id")),
                context={
                    "order_number": data.get("order_number"),
                    "accession_number": data.get("accession_number"),
                    "patient_name": data.get("patient_name"),
                    "patient_id": data.get("patient_id"),
                    "procedure_name": data.get("procedure_name"),
                    "modality": data.get("modality"),
                    "order_status": data.get("order_status") or data.get("status"),
                    "last_updated_at": last_update,
                    "stagnant_hours": stagnant_hours
                }
            )
            alerted += 1

        return {"status": "ok", "scanned": len(rows), "alerted": alerted, "cutoff": cutoff.isoformat()}
    except Exception as exc:
        logger.error("Failed to check stagnant orders: %s", exc, exc_info=True)
        return {"status": "error", "error": str(exc)}
    finally:
        db.close()
