"""
Order Notification Service
Sends lifecycle notifications for orders (new, scheduled, stagnant, completed)
"""

import logging
from datetime import datetime, date, time, timedelta
from typing import Any, Dict, Optional, List

from sqlalchemy import text, desc
from sqlalchemy.orm import Session

from app.services.telegram_whatsapp_service import TelegramWhatsAppService
from app.services.notification_templates import NotificationTemplates
from app.models.notification_config import NotificationAuditLog

logger = logging.getLogger(__name__)


class OrderNotificationService:
    """Send order lifecycle notifications via Telegram/WhatsApp"""

    def __init__(self, db_session: Session):
        self.db = db_session
        self.sender = TelegramWhatsAppService(db_session=db_session)

    # ------------------------------------------------------------------ #
    # Public helpers
    # ------------------------------------------------------------------ #
    def notify_new_order(self, order_id: Optional[str], context: Optional[Dict[str, Any]] = None):
        """Notify when a new order is created"""
        summary = self._get_order_summary(order_id, context)
        if not summary:
            return None

        return self._send_notification(
            notification_type="NEW_ORDER",
            title="",  # Not used - template generates title
            summary=summary,
            extra_lines=None,  # Not used - template handles formatting
            metadata=context
        )

    def notify_order_scheduled(self, order_id: Optional[str], context: Optional[Dict[str, Any]] = None):
        """Notify when an order gets a schedule/worklist slot"""
        summary = self._get_order_summary(order_id, context)
        if not summary:
            return None

        return self._send_notification(
            notification_type="ORDER_SCHEDULED",
            title="",  # Not used - template generates title
            summary=summary,
            extra_lines=None,  # Not used - template handles formatting
            metadata=context
        )

    def notify_order_completed(self, order_id: Optional[str], context: Optional[Dict[str, Any]] = None):
        """Notify when an order is completed/reported"""
        summary = self._get_order_summary(order_id, context)
        if not summary:
            return None

        return self._send_notification(
            notification_type="ORDER_COMPLETED",
            title="",  # Not used - template generates title
            summary=summary,
            extra_lines=None,  # Not used - template handles formatting
            metadata=context
        )

    def notify_stagnant_order(self, order_id: Optional[str], context: Optional[Dict[str, Any]] = None):
        """Notify when an order is stagnant/stuck"""
        summary = self._get_order_summary(order_id, context)
        if not summary:
            return None

        # Extract the resolved order_id from summary for rate limiting check
        resolved_order_id = summary.get("order_id")
        if resolved_order_id:
            try:
                # Check if a stagnant order notification for this order_id was sent recently
                time_threshold = datetime.now() - timedelta(minutes=180)
                
                # Use func.jsonb_extract_path_text for safer JSONB querying
                last_notification = self.db.query(NotificationAuditLog).filter(
                    NotificationAuditLog.notification_type == "STAGNANT_ORDER",
                    NotificationAuditLog.status == "success", # Only consider successful sends
                    NotificationAuditLog.created_at >= time_threshold,
                    func.jsonb_extract_path_text(NotificationAuditLog.metadata_json, 'order_id') == str(resolved_order_id)
                ).order_by(desc(NotificationAuditLog.created_at)).first()

                if last_notification:
                    logger.info(
                        "Stagnant order notification skipped (already sent within 180 mins) for order ID: %s",
                        resolved_order_id
                    )
                    return {
                        "success": False,
                        "status": "skipped",
                        "reason": "rate_limit_180_minutes",
                        "order_id": resolved_order_id
                    }
            except Exception as e:
                logger.error(f"Error checking rate limit for stagnant order {resolved_order_id}: {e}")
                # Proceed with notification if check fails (fail-open)

        return self._send_notification(
            notification_type="STAGNANT_ORDER",
            title="",  # Not used - template generates title
            summary=summary,
            extra_lines=None,  # Not used - template handles formatting
            metadata=context
        )

    # ------------------------------------------------------------------ #
    # Internals
    # ------------------------------------------------------------------ #
    def _get_order_summary(self, order_id: Optional[str], context: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
        """Build a consistent summary for the order"""
        summary: Dict[str, Any] = {}
        context = context or {}
        summary.update(context)

        lookup_id = order_id or summary.get("order_id")

        if lookup_id:
            try:
                row = self.db.execute(
                    text(
                        """
                        SELECT id, order_number, accession_number, patient_id, patient_name,
                               modality, procedure_name, priority, order_status, status,
                               scheduled_at, updated_at, created_at
                        FROM orders
                        WHERE id = :order_id
                        LIMIT 1
                        """
                    ),
                    {"order_id": lookup_id}
                ).fetchone()
                if row:
                    summary.update(row._mapping)
            except Exception as db_error:
                logger.warning("Unable to load order %s for notification: %s", lookup_id, db_error)

        if not summary:
            logger.warning("Order notification skipped - missing summary (order_id=%s)", order_id)
            return None

        # Normalize keys
        normalized = {
            "order_id": str(summary.get("id") or lookup_id) if (summary.get("id") or lookup_id) else None,
            "order_number": summary.get("order_number"),
            "accession_number": summary.get("accession_number"),
            "patient_id": summary.get("patient_id"),
            "patient_name": summary.get("patient_name"),
            "procedure_name": summary.get("procedure_name"),
            "modality": summary.get("modality"),
            "priority": summary.get("priority"),
            "order_status": summary.get("order_status") or summary.get("status"),
            "scheduled_at": summary.get("scheduled_at") or summary.get("scheduled_datetime"),
            "scheduled_date": summary.get("scheduled_date"),
            "scheduled_time": summary.get("scheduled_time"),
            "slot_date": summary.get("slot_date"),
            "slot_start_time": summary.get("slot_start_time"),
            "updated_at": summary.get("updated_at"),
            "created_at": summary.get("created_at"),
            "placer_order_number": summary.get("placer_order_number"),
        }

        # Remove None values to keep metadata compact
        return {k: v for k, v in normalized.items() if v is not None}

    def _send_notification(
        self,
        notification_type: str,
        title: str,
        summary: Dict[str, Any],
        extra_lines: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None
    ):
        """Format and dispatch the notification message using templates"""
        try:
            # Use template for professional formatting
            stagnant_hours = None
            if metadata:
                sh = metadata.get("stagnant_hours")
                if sh is not None:
                    try:
                        stagnant_hours = float(sh)
                    except (ValueError, TypeError):
                        stagnant_hours = 0
            
            message = NotificationTemplates.get_template(
                notification_type,
                summary,
                stagnant_hours=stagnant_hours
            )
            
            payload_metadata = self._build_metadata(summary, metadata)

            result = self.sender.send_notification(
                message=message,
                notification_type=notification_type,
                metadata=payload_metadata
            )

            if not result.get("success"):
                logger.warning("Notification %s did not succeed for order %s", notification_type, summary.get("order_id"))
            return result
        except Exception as exc:
            logger.error("Failed to send %s notification: %s", notification_type, exc, exc_info=True)
            return None

    def _build_summary_lines(self, summary: Dict[str, Any]) -> List[str]:
        """Base lines used by all notifications"""
        patient = summary.get("patient_name") or "-"
        patient_id = summary.get("patient_id") or "-"
        procedure = summary.get("procedure_name") or "-"
        modality = summary.get("modality") or "-"
        accession = summary.get("accession_number") or "-"
        order_number = summary.get("order_number") or "-"
        priority = summary.get("priority") or "-"
        status = summary.get("order_status") or "-"
        schedule = self._render_schedule(summary, summary)

        lines = [
            f"Patient: {patient} ({patient_id})",
            f"Procedure: {procedure} [{modality}]",
            f"Accession/Order: `{accession}` / `{order_number}`",
            f"Priority: {priority} | Status: {status}",
        ]

        if schedule:
            lines.append(f"Scheduled for: {schedule}")

        return lines

    def _render_schedule(self, data: Dict[str, Any], summary: Dict[str, Any]) -> Optional[str]:
        """Render schedule info from available fields"""
        if not data:
            data = summary

        # scheduled_at could be datetime or string
        scheduled_at = data.get("scheduled_at")
        if scheduled_at:
            return self._format_datetime(scheduled_at)

        # Combine date + time if provided
        date_part = data.get("scheduled_date") or data.get("slot_date")
        time_part = data.get("scheduled_time") or data.get("slot_start_time")
        if date_part and time_part:
            return f"{self._format_date(date_part)} {self._format_time(time_part)}"
        if date_part:
            return self._format_date(date_part)

        return None

    def _build_metadata(self, summary: Dict[str, Any], metadata: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """Merge and serialize metadata for audit logging"""
        combined = {}
        combined.update(summary)
        if metadata:
            combined.update(metadata)

        def _serialize(value: Any):
            if isinstance(value, datetime):
                return value.isoformat()
            if isinstance(value, date):
                return value.isoformat()
            if isinstance(value, time):
                return value.isoformat()
            return value

        return {k: _serialize(v) for k, v in combined.items() if v is not None}

    def _build_source_lines(self, context: Optional[Dict[str, Any]]) -> List[str]:
        """Optional source information lines"""
        if not context:
            return []

        lines: List[str] = []
        if context.get("placer_order_number"):
            lines.append(f"Placer order: {context.get('placer_order_number')}")
        if context.get("hl7_source_system"):
            lines.append(f"Source: {context.get('hl7_source_system')}")
        return lines

    def _format_datetime(self, value: Any) -> str:
        """Format datetime or string safely"""
        if isinstance(value, datetime):
            return value.strftime("%Y-%m-%d %H:%M")
        if isinstance(value, date) and not isinstance(value, datetime):
            return value.strftime("%Y-%m-%d")
        try:
            parsed = datetime.fromisoformat(str(value))
            return parsed.strftime("%Y-%m-%d %H:%M")
        except Exception:
            return str(value)

    def _format_date(self, value: Any) -> str:
        if isinstance(value, date):
            return value.isoformat()
        return str(value)

    def _format_time(self, value: Any) -> str:
        if isinstance(value, time):
            return value.strftime("%H:%M")
        return str(value)
