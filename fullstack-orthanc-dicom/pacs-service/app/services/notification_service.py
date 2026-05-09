"""
Notification Service
Sends alerts for storage events and system issues
"""

import logging
import smtplib
import json
from datetime import datetime
from typing import Dict, Any, List, Optional
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from enum import Enum
import requests

logger = logging.getLogger(__name__)


class NotificationLevel(str, Enum):
    """Notification severity levels"""
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class NotificationChannel(str, Enum):
    """Notification delivery channels"""
    EMAIL = "email"
    WEBHOOK = "webhook"
    SLACK = "slack"
    TELEGRAM = "telegram"
    LOG = "log"


class NotificationService:
    """
    Multi-channel notification service

    Features:
    - Email notifications
    - Webhook notifications
    - Slack integration
    - Telegram integration
    - Severity-based routing
    - Rate limiting to prevent spam
    """

    def __init__(
        self,
        enabled: bool = True,
        email_enabled: bool = False,
        webhook_enabled: bool = False,
        slack_enabled: bool = False
    ):
        """
        Initialize notification service

        Args:
            enabled: Master enable/disable switch
            email_enabled: Enable email notifications
            webhook_enabled: Enable webhook notifications
            slack_enabled: Enable Slack notifications
        """
        self.enabled = enabled
        self.email_enabled = email_enabled
        self.webhook_enabled = webhook_enabled
        self.slack_enabled = slack_enabled

        # Email configuration
        self.smtp_host = "smtp.gmail.com"
        self.smtp_port = 587
        self.smtp_user = ""
        self.smtp_password = ""
        self.from_email = "pacs-service@example.com"
        self.admin_emails = []

        # Webhook configuration
        self.webhook_url = ""
        self.webhook_timeout = 5

        # Slack configuration
        self.slack_webhook_url = ""
        self.slack_channel = "#pacs-alerts"

        # Notification history (for rate limiting)
        self.notification_history: Dict[str, List[datetime]] = {}
        self.rate_limit_window = 3600  # 1 hour
        self.max_notifications_per_window = 10

        logger.info(
            f"NotificationService initialized: "
            f"enabled={enabled}, email={email_enabled}, webhook={webhook_enabled}"
        )

    def configure_email(
        self,
        smtp_host: str,
        smtp_port: int,
        smtp_user: str,
        smtp_password: str,
        from_email: str,
        admin_emails: List[str]
    ):
        """Configure email notification settings"""
        self.smtp_host = smtp_host
        self.smtp_port = smtp_port
        self.smtp_user = smtp_user
        self.smtp_password = smtp_password
        self.from_email = from_email
        self.admin_emails = admin_emails
        self.email_enabled = True

        logger.info(f"Email notifications configured: {len(admin_emails)} recipients")

    def configure_webhook(self, webhook_url: str, timeout: int = 5):
        """Configure webhook notification settings"""
        self.webhook_url = webhook_url
        self.webhook_timeout = timeout
        self.webhook_enabled = True

        logger.info(f"Webhook notifications configured: {webhook_url}")

    def configure_slack(self, webhook_url: str, channel: str = "#pacs-alerts"):
        """Configure Slack notification settings"""
        self.slack_webhook_url = webhook_url
        self.slack_channel = channel
        self.slack_enabled = True

        logger.info(f"Slack notifications configured: {channel}")

    def _check_rate_limit(self, notification_key: str) -> bool:
        """
        Check if notification is within rate limit

        Args:
            notification_key: Unique key for notification type

        Returns:
            True if allowed, False if rate limited
        """
        now = datetime.now()
        cutoff = datetime.fromtimestamp(now.timestamp() - self.rate_limit_window)

        # Initialize history for this key
        if notification_key not in self.notification_history:
            self.notification_history[notification_key] = []

        # Remove old entries
        self.notification_history[notification_key] = [
            ts for ts in self.notification_history[notification_key]
            if ts > cutoff
        ]

        # Check limit
        if len(self.notification_history[notification_key]) >= self.max_notifications_per_window:
            logger.warning(f"Rate limit exceeded for notification: {notification_key}")
            return False

        # Add current timestamp
        self.notification_history[notification_key].append(now)
        return True

    def send_email(
        self,
        subject: str,
        body: str,
        level: NotificationLevel = NotificationLevel.INFO,
        recipients: List[str] = None
    ) -> bool:
        """
        Send email notification

        Args:
            subject: Email subject
            body: Email body (HTML supported)
            level: Notification level
            recipients: Email recipients (uses admin_emails if None)

        Returns:
            True if sent successfully
        """
        if not self.enabled or not self.email_enabled:
            return False

        try:
            recipients = recipients or self.admin_emails
            if not recipients:
                logger.warning("No email recipients configured")
                return False

            # Create message
            msg = MIMEMultipart('alternative')
            msg['Subject'] = f"[{level.value.upper()}] {subject}"
            msg['From'] = self.from_email
            msg['To'] = ', '.join(recipients)

            # Add body
            html_body = f"""
            <html>
              <body>
                <h2 style="color: {'red' if level == NotificationLevel.CRITICAL else 'orange' if level == NotificationLevel.ERROR else 'blue'};">
                  {subject}
                </h2>
                <p>{body}</p>
                <hr>
                <p style="color: gray; font-size: 12px;">
                  PACS Service Notification<br>
                  Timestamp: {datetime.now().isoformat()}<br>
                  Level: {level.value.upper()}
                </p>
              </body>
            </html>
            """

            msg.attach(MIMEText(html_body, 'html'))

            # Send email
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_user, self.smtp_password)
                server.send_message(msg)

            logger.info(f"Email sent: {subject} to {len(recipients)} recipients")
            return True

        except Exception as e:
            logger.error(f"Failed to send email: {e}", exc_info=True)
            return False

    def send_webhook(
        self,
        title: str,
        message: str,
        level: NotificationLevel = NotificationLevel.INFO,
        metadata: Dict[str, Any] = None
    ) -> bool:
        """
        Send webhook notification

        Args:
            title: Notification title
            message: Notification message
            level: Notification level
            metadata: Additional metadata

        Returns:
            True if sent successfully
        """
        if not self.enabled or not self.webhook_enabled or not self.webhook_url:
            return False

        try:
            payload = {
                'title': title,
                'message': message,
                'level': level.value,
                'timestamp': datetime.now().isoformat(),
                'service': 'PACS Service',
                'metadata': metadata or {}
            }

            response = requests.post(
                self.webhook_url,
                json=payload,
                timeout=self.webhook_timeout
            )

            if response.status_code == 200:
                logger.info(f"Webhook sent: {title}")
                return True
            else:
                logger.warning(f"Webhook failed with status {response.status_code}")
                return False

        except Exception as e:
            logger.error(f"Failed to send webhook: {e}", exc_info=True)
            return False

    def send_slack(
        self,
        title: str,
        message: str,
        level: NotificationLevel = NotificationLevel.INFO,
        fields: Dict[str, str] = None
    ) -> bool:
        """
        Send Slack notification

        Args:
            title: Notification title
            message: Notification message
            level: Notification level
            fields: Additional fields to display

        Returns:
            True if sent successfully
        """
        if not self.enabled or not self.slack_enabled or not self.slack_webhook_url:
            return False

        try:
            # Color based on level
            color_map = {
                NotificationLevel.INFO: '#36a64f',  # Green
                NotificationLevel.WARNING: '#ff9900',  # Orange
                NotificationLevel.ERROR: '#ff0000',  # Red
                NotificationLevel.CRITICAL: '#8b0000'  # Dark red
            }

            # Build attachment fields
            slack_fields = [
                {
                    'title': 'Level',
                    'value': level.value.upper(),
                    'short': True
                },
                {
                    'title': 'Timestamp',
                    'value': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                    'short': True
                }
            ]

            if fields:
                for key, value in fields.items():
                    slack_fields.append({
                        'title': key,
                        'value': str(value),
                        'short': True
                    })

            payload = {
                'channel': self.slack_channel,
                'username': 'PACS Service',
                'icon_emoji': ':hospital:',
                'attachments': [
                    {
                        'color': color_map.get(level, '#808080'),
                        'title': title,
                        'text': message,
                        'fields': slack_fields,
                        'footer': 'PACS Service',
                        'ts': int(datetime.now().timestamp())
                    }
                ]
            }

            response = requests.post(
                self.slack_webhook_url,
                json=payload,
                timeout=self.webhook_timeout
            )

            if response.status_code == 200:
                logger.info(f"Slack notification sent: {title}")
                return True
            else:
                logger.warning(f"Slack notification failed with status {response.status_code}")
                return False

        except Exception as e:
            logger.error(f"Failed to send Slack notification: {e}", exc_info=True)
            return False

    def notify(
        self,
        title: str,
        message: str,
        level: NotificationLevel = NotificationLevel.INFO,
        channels: List[NotificationChannel] = None,
        metadata: Dict[str, Any] = None,
        rate_limit_key: str = None
    ) -> Dict[str, bool]:
        """
        Send notification to multiple channels

        Args:
            title: Notification title
            message: Notification message
            level: Notification level
            channels: List of channels to send to (all enabled if None)
            metadata: Additional metadata
            rate_limit_key: Key for rate limiting (uses title if None)

        Returns:
            Dictionary mapping channel to success status
        """
        if not self.enabled:
            return {}

        # Check rate limit
        rate_key = rate_limit_key or title
        if not self._check_rate_limit(rate_key):
            logger.warning(f"Notification rate limited: {title}")
            return {}

        # Default to all enabled channels
        if channels is None:
            channels = []
            if self.email_enabled:
                channels.append(NotificationChannel.EMAIL)
            if self.webhook_enabled:
                channels.append(NotificationChannel.WEBHOOK)
            if self.slack_enabled:
                channels.append(NotificationChannel.SLACK)
            channels.append(NotificationChannel.LOG)  # Always log

        results = {}

        # Send to each channel
        for channel in channels:
            try:
                if channel == NotificationChannel.EMAIL:
                    results[channel.value] = self.send_email(title, message, level)
                elif channel == NotificationChannel.WEBHOOK:
                    results[channel.value] = self.send_webhook(title, message, level, metadata)
                elif channel == NotificationChannel.SLACK:
                    fields = metadata if metadata else {}
                    results[channel.value] = self.send_slack(title, message, level, fields)
                elif channel == NotificationChannel.LOG:
                    log_method = {
                        NotificationLevel.INFO: logger.info,
                        NotificationLevel.WARNING: logger.warning,
                        NotificationLevel.ERROR: logger.error,
                        NotificationLevel.CRITICAL: logger.critical
                    }.get(level, logger.info)
                    log_method(f"[NOTIFICATION] {title}: {message}")
                    results[channel.value] = True
            except Exception as e:
                logger.error(f"Failed to send notification via {channel.value}: {e}")
                results[channel.value] = False

        return results

    # Convenience methods for common notifications

    def notify_storage_quota_warning(
        self,
        storage_name: str,
        usage_percent: float,
        threshold: float
    ):
        """Send storage quota warning notification"""
        self.notify(
            title=f"Storage Quota Warning: {storage_name}",
            message=f"Storage usage at {usage_percent:.1f}% (threshold: {threshold}%)",
            level=NotificationLevel.WARNING,
            metadata={
                'storage_name': storage_name,
                'usage_percent': usage_percent,
                'threshold': threshold
            },
            rate_limit_key=f"storage_quota_{storage_name}"
        )

    def notify_storage_quota_critical(
        self,
        storage_name: str,
        usage_percent: float
    ):
        """Send storage quota critical notification"""
        self.notify(
            title=f"CRITICAL: Storage Quota Exceeded - {storage_name}",
            message=f"Storage critically full at {usage_percent:.1f}%",
            level=NotificationLevel.CRITICAL,
            metadata={
                'storage_name': storage_name,
                'usage_percent': usage_percent
            },
            rate_limit_key=f"storage_critical_{storage_name}"
        )

    def notify_storage_offline(self, storage_name: str, reason: str = ""):
        """Send storage offline notification"""
        self.notify(
            title=f"Storage Offline: {storage_name}",
            message=f"Storage location went offline. {reason}",
            level=NotificationLevel.ERROR,
            metadata={'storage_name': storage_name, 'reason': reason},
            rate_limit_key=f"storage_offline_{storage_name}"
        )

    def notify_cleanup_complete(self, report: Dict[str, Any]):
        """Send cleanup completion notification"""
        self.notify(
            title="Storage Cleanup Complete",
            message=f"Cleaned {report.get('cleaned_count', 0)} files, "
                    f"freed {report.get('total_size_freed_gb', 0):.2f} GB",
            level=NotificationLevel.INFO,
            metadata=report
        )

    def notify_migration_complete(self, report: Dict[str, Any]):
        """Send migration completion notification"""
        self.notify(
            title="Storage Migration Complete",
            message=f"Migrated {report.get('migrated_count', 0)} files, "
                    f"{report.get('failed_count', 0)} failed",
            level=NotificationLevel.INFO,
            metadata=report
        )
