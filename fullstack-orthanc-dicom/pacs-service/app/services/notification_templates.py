"""
Notification Templates
Professional HTML/Markdown templates for notifications
"""

from typing import Dict, Any, Optional
from datetime import datetime


class NotificationTemplates:
    """Notification message templates"""

    @staticmethod
    def _format_datetime(value: Any) -> str:
        """Format datetime to human readable format"""
        if not value or value == "-":
            return "-"
        
        try:
            if isinstance(value, datetime):
                dt = value
            else:
                # Try to parse ISO format
                dt = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
            
            # Format as: "13 Nov 2025, 02:08"
            return dt.strftime("%d %b %Y, %H:%M")
        except Exception:
            return str(value)

    @staticmethod
    def format_new_order(order: Dict[str, Any]) -> str:
        """Format new order notification"""
        patient = order.get("patient_name") or "-"
        patient_id = order.get("patient_id") or "-"
        procedure = order.get("procedure_name") or "-"
        modality = order.get("modality") or "-"
        accession = order.get("accession_number") or "-"
        order_number = order.get("order_number") or "-"
        priority = order.get("priority") or "-"
        status = order.get("order_status") or order.get("status") or "-"
        scheduled_raw = order.get("scheduled_at") or order.get("scheduled_start_at") or "-"
        scheduled = NotificationTemplates._format_datetime(scheduled_raw)

        return f"""🆕 *NEW ORDER*

👤 Patient: {patient}
   ID: {patient_id}

📋 Procedure: {procedure}
   Modality: {modality}

📌 Order Details:
   Order #: {order_number}
   Accession: {accession}
   Priority: {priority}
   Status: {status}

📅 Scheduled: {scheduled}"""

    @staticmethod
    def format_stagnant_order(order: Dict[str, Any], stagnant_hours: float) -> str:
        """Format stagnant order notification"""
        patient = order.get("patient_name") or "-"
        patient_id = order.get("patient_id") or "-"
        procedure = order.get("procedure_name") or "-"
        modality = order.get("modality") or "-"
        accession = order.get("accession_number") or "-"
        order_number = order.get("order_number") or "-"
        status = order.get("order_status") or order.get("status") or "-"
        last_update_raw = order.get("last_updated_at") or order.get("updated_at") or "-"
        last_update = NotificationTemplates._format_datetime(last_update_raw)

        return f"""⚠️ *STAGNANT ORDER ALERT*

👤 Patient: {patient}
   ID: {patient_id}

📋 Procedure: {procedure}
   Modality: {modality}

📌 Order Details:
   Order #: {order_number}
   Accession: {accession}
   Status: {status}

⏱️ Idle Time: {stagnant_hours:.1f} hours
📍 Last Update: {last_update}

⚠️ *Action Required*: Please check this order immediately."""

    @staticmethod
    def format_order_scheduled(order: Dict[str, Any]) -> str:
        """Format order scheduled notification"""
        patient = order.get("patient_name") or "-"
        patient_id = order.get("patient_id") or "-"
        procedure = order.get("procedure_name") or "-"
        modality = order.get("modality") or "-"
        accession = order.get("accession_number") or "-"
        order_number = order.get("order_number") or "-"
        scheduled_raw = order.get("scheduled_at") or order.get("scheduled_start_at") or "-"
        scheduled = NotificationTemplates._format_datetime(scheduled_raw)

        return f"""📅 *ORDER SCHEDULED*

👤 Patient: {patient}
   ID: {patient_id}

📋 Procedure: {procedure}
   Modality: {modality}

📌 Order Details:
   Order #: {order_number}
   Accession: {accession}

⏰ Scheduled Time: {scheduled}

✅ Ready for imaging"""

    @staticmethod
    def format_order_completed(order: Dict[str, Any]) -> str:
        """Format order completed notification"""
        patient = order.get("patient_name") or "-"
        patient_id = order.get("patient_id") or "-"
        procedure = order.get("procedure_name") or "-"
        modality = order.get("modality") or "-"
        accession = order.get("accession_number") or "-"
        order_number = order.get("order_number") or "-"

        return f"""✅ *ORDER COMPLETED*

👤 Patient: {patient}
   ID: {patient_id}

📋 Procedure: {procedure}
   Modality: {modality}

📌 Order Details:
   Order #: {order_number}
   Accession: {accession}

📊 Status: Completed and ready for review"""

    @staticmethod
    def get_template(notification_type: str, order: Dict[str, Any], **kwargs) -> str:
        """
        Get formatted notification message
        
        Args:
            notification_type: Type of notification (NEW_ORDER, STAGNANT_ORDER, etc.)
            order: Order data
            **kwargs: Additional parameters (e.g., stagnant_hours)
            
        Returns:
            Formatted message string
        """
        if notification_type == "NEW_ORDER":
            return NotificationTemplates.format_new_order(order)
        elif notification_type == "STAGNANT_ORDER":
            stagnant_hours = kwargs.get("stagnant_hours", 0)
            return NotificationTemplates.format_stagnant_order(order, stagnant_hours)
        elif notification_type == "ORDER_SCHEDULED":
            return NotificationTemplates.format_order_scheduled(order)
        elif notification_type == "ORDER_COMPLETED":
            return NotificationTemplates.format_order_completed(order)
        else:
            # Fallback to generic format
            return f"*{notification_type}*\n\n{order}"
