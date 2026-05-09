"""
Telegram & WhatsApp Notification Service
Secure backend service for sending notifications via Telegram and WhatsApp
"""

import logging
import requests
import json
from typing import Dict, Any, Optional, List
from datetime import datetime
from enum import Enum
import time

logger = logging.getLogger(__name__)


class NotificationChannel(str, Enum):
    """Notification channels"""
    TELEGRAM = "telegram"
    WHATSAPP = "whatsapp"
    EMAIL = "email"


class TelegramWhatsAppService:
    """
    Secure Telegram & WhatsApp notification service
    
    Features:
    - Secure API key management (stored in database)
    - Rate limiting to prevent spam
    - Audit logging for all sends
    - Retry logic with exponential backoff
    - Message formatting and validation
    """

    def __init__(self, db_session=None):
        """
        Initialize service
        
        Args:
            db_session: Database session for config and audit logging
        """
        self.db_session = db_session
        self.request_timeout = 10
        self.max_retries = 3
        self.retry_delay = 1  # seconds
        
        # Rate limiting
        self.rate_limit_window = 3600  # 1 hour
        self.max_messages_per_window = 100
        self.message_history: Dict[str, List[datetime]] = {}

    def _get_config(self, key: str) -> Optional[str]:
        """
        Get configuration value from database
        
        Args:
            key: Configuration key
            
        Returns:
            Configuration value or None
        """
        if not self.db_session:
            return None
        
        try:
            from app.models.notification_config import NotificationConfig
            config = self.db_session.query(NotificationConfig).filter(
                NotificationConfig.config_key == key,
                NotificationConfig.enabled == True
            ).first()
            
            return config.config_value if config else None
        except Exception as e:
            logger.error(f"Error retrieving config {key}: {e}")
            return None

    def _log_audit(
        self,
        notification_type: str,
        channel: str,
        recipient: str,
        status: str,
        message_preview: str = None,
        error_message: str = None,
        response_time_ms: int = None,
        metadata: Dict[str, Any] = None
    ):
        """
        Log notification send to audit table
        
        Args:
            notification_type: Type of notification
            channel: Channel used
            recipient: Recipient identifier
            status: Send status (success, failed, rate_limited)
            message_preview: Preview of message sent
            error_message: Error message if failed
            response_time_ms: Response time in milliseconds
            metadata: Additional metadata
        """
        if not self.db_session:
            return
        
        try:
            from app.models.notification_config import NotificationAuditLog
            
            audit_log = NotificationAuditLog(
                notification_type=notification_type,
                channel=channel,
                recipient=recipient,
                status=status,
                message_preview=message_preview,
                error_message=error_message,
                response_time_ms=response_time_ms,
                metadata_json=metadata or {}
            )
            
            self.db_session.add(audit_log)
            self.db_session.commit()
            
            logger.info(f"Audit logged: {notification_type} via {channel} - {status}")
        except Exception as e:
            logger.error(f"Error logging audit: {e}")

    def _check_rate_limit(self, key: str) -> bool:
        """
        Check if message is within rate limit
        
        Args:
            key: Rate limit key
            
        Returns:
            True if allowed, False if rate limited
        """
        now = datetime.now()
        cutoff = datetime.fromtimestamp(now.timestamp() - self.rate_limit_window)
        
        if key not in self.message_history:
            self.message_history[key] = []
        
        # Remove old entries
        self.message_history[key] = [
            ts for ts in self.message_history[key]
            if ts > cutoff
        ]
        
        # Check limit
        if len(self.message_history[key]) >= self.max_messages_per_window:
            logger.warning(f"Rate limit exceeded for key: {key}")
            return False
        
        # Add current timestamp
        self.message_history[key].append(now)
        return True

    def send_telegram(
        self,
        message: str,
        notification_type: str = "general",
        metadata: Dict[str, Any] = None,
        retry: int = 0
    ) -> Dict[str, Any]:
        """
        Send Telegram message
        
        Args:
            message: Message text (supports Markdown)
            notification_type: Type of notification for audit logging
            metadata: Additional metadata
            retry: Current retry attempt
            
        Returns:
            Result dictionary with success status and details
        """
        start_time = time.time()
        
        try:
            # Get configuration from database
            bot_token = self._get_config("telegram_bot_token")
            chat_id = self._get_config("telegram_chat_id")
            
            if not bot_token or not chat_id:
                msg = "Telegram notification skipped (not configured or disabled)"
                logger.info(msg)
                return {
                    "success": False,
                    "status": "skipped",
                    "error": msg,
                    "channel": NotificationChannel.TELEGRAM.value
                }
            
            # Check rate limit
            rate_limit_key = f"telegram_{chat_id}"
            if not self._check_rate_limit(rate_limit_key):
                error_msg = "Rate limit exceeded for Telegram"
                self._log_audit(
                    notification_type=notification_type,
                    channel=NotificationChannel.TELEGRAM.value,
                    recipient=chat_id,
                    status="rate_limited",
                    message_preview=message[:100],
                    metadata=metadata
                )
                return {
                    "success": False,
                    "error": error_msg,
                    "channel": NotificationChannel.TELEGRAM.value
                }
            
            # Send message
            url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
            payload = {
                "chat_id": chat_id,
                "text": message,
                "parse_mode": "Markdown"
            }
            
            response = requests.post(
                url,
                json=payload,
                timeout=self.request_timeout
            )
            
            response_time_ms = int((time.time() - start_time) * 1000)
            
            if response.status_code == 200:
                data = response.json()
                if data.get("ok"):
                    logger.info(f"Telegram message sent successfully")
                    self._log_audit(
                        notification_type=notification_type,
                        channel=NotificationChannel.TELEGRAM.value,
                        recipient=chat_id,
                        status="success",
                        message_preview=message[:100],
                        response_time_ms=response_time_ms,
                        metadata=metadata
                    )
                    return {
                        "success": True,
                        "channel": NotificationChannel.TELEGRAM.value,
                        "message_id": data.get("result", {}).get("message_id"),
                        "response_time_ms": response_time_ms
                    }
                else:
                    error_msg = data.get("description", "Unknown error")
                    logger.error(f"Telegram API error: {error_msg}")
                    self._log_audit(
                        notification_type=notification_type,
                        channel=NotificationChannel.TELEGRAM.value,
                        recipient=chat_id,
                        status="failed",
                        message_preview=message[:100],
                        error_message=error_msg,
                        response_time_ms=response_time_ms,
                        metadata=metadata
                    )
                    return {
                        "success": False,
                        "error": error_msg,
                        "channel": NotificationChannel.TELEGRAM.value
                    }
            else:
                error_msg = f"HTTP {response.status_code}: {response.text}"
                logger.error(f"Telegram request failed: {error_msg}")
                
                # Retry on server errors
                if response.status_code >= 500 and retry < self.max_retries:
                    logger.info(f"Retrying Telegram send (attempt {retry + 1}/{self.max_retries})")
                    time.sleep(self.retry_delay * (2 ** retry))  # Exponential backoff
                    return self.send_telegram(message, notification_type, metadata, retry + 1)
                
                self._log_audit(
                    notification_type=notification_type,
                    channel=NotificationChannel.TELEGRAM.value,
                    recipient=chat_id,
                    status="failed",
                    message_preview=message[:100],
                    error_message=error_msg,
                    response_time_ms=int((time.time() - start_time) * 1000),
                    metadata=metadata
                )
                return {
                    "success": False,
                    "error": error_msg,
                    "channel": NotificationChannel.TELEGRAM.value
                }
        
        except requests.Timeout:
            error_msg = "Telegram request timeout"
            logger.error(error_msg)
            
            if retry < self.max_retries:
                logger.info(f"Retrying Telegram send (attempt {retry + 1}/{self.max_retries})")
                time.sleep(self.retry_delay * (2 ** retry))
                return self.send_telegram(message, notification_type, metadata, retry + 1)
            
            return {
                "success": False,
                "error": error_msg,
                "channel": NotificationChannel.TELEGRAM.value
            }
        
        except Exception as e:
            error_msg = f"Telegram error: {str(e)}"
            logger.error(error_msg, exc_info=True)
            return {
                "success": False,
                "error": error_msg,
                "channel": NotificationChannel.TELEGRAM.value
            }

    def send_whatsapp(
        self,
        message: str,
        notification_type: str = "general",
        metadata: Dict[str, Any] = None,
        retry: int = 0
    ) -> Dict[str, Any]:
        """
        Send WhatsApp message via Evolution API
        
        Args:
            message: Message text
            notification_type: Type of notification for audit logging
            metadata: Additional metadata
            retry: Current retry attempt
            
        Returns:
            Result dictionary with success status and details
        """
        start_time = time.time()
        
        try:
            # Get configuration from database
            api_key = self._get_config("whatsapp_api_key")
            instance_name = self._get_config("whatsapp_instance_name")
            target_number = self._get_config("whatsapp_target_number")
            base_url = self._get_config("whatsapp_base_url")
            
            if not all([api_key, instance_name, target_number, base_url]):
                msg = "WhatsApp notification skipped (not configured or disabled)"
                logger.info(msg)
                return {
                    "success": False,
                    "status": "skipped",
                    "error": msg,
                    "channel": NotificationChannel.WHATSAPP.value
                }
            
            # Check rate limit
            rate_limit_key = f"whatsapp_{target_number}"
            if not self._check_rate_limit(rate_limit_key):
                error_msg = "Rate limit exceeded for WhatsApp"
                self._log_audit(
                    notification_type=notification_type,
                    channel=NotificationChannel.WHATSAPP.value,
                    recipient=target_number,
                    status="rate_limited",
                    message_preview=message[:100],
                    metadata=metadata
                )
                return {
                    "success": False,
                    "error": error_msg,
                    "channel": NotificationChannel.WHATSAPP.value
                }
            
            # Send message
            base_url = base_url.rstrip('/')
            url = f"{base_url}/message/sendText/{instance_name}"
            
            headers = {
                "Content-Type": "application/json",
                "apikey": api_key
            }
            
            payload = {
                "number": target_number,
                "text": message
            }
            
            response = requests.post(
                url,
                json=payload,
                headers=headers,
                timeout=self.request_timeout
            )
            
            response_time_ms = int((time.time() - start_time) * 1000)
            
            if response.status_code in [200, 201]:
                data = response.json()
                logger.info(f"WhatsApp message sent successfully")
                self._log_audit(
                    notification_type=notification_type,
                    channel=NotificationChannel.WHATSAPP.value,
                    recipient=target_number,
                    status="success",
                    message_preview=message[:100],
                    response_time_ms=response_time_ms,
                    metadata=metadata
                )
                return {
                    "success": True,
                    "channel": NotificationChannel.WHATSAPP.value,
                    "message_id": data.get("key", {}).get("id") if isinstance(data.get("key"), dict) else data.get("id"),
                    "response_time_ms": response_time_ms
                }
            else:
                error_msg = f"HTTP {response.status_code}: {response.text}"
                logger.error(f"WhatsApp request failed: {error_msg}")
                
                # Retry on server errors
                if response.status_code >= 500 and retry < self.max_retries:
                    logger.info(f"Retrying WhatsApp send (attempt {retry + 1}/{self.max_retries})")
                    time.sleep(self.retry_delay * (2 ** retry))
                    return self.send_whatsapp(message, notification_type, metadata, retry + 1)
                
                self._log_audit(
                    notification_type=notification_type,
                    channel=NotificationChannel.WHATSAPP.value,
                    recipient=target_number,
                    status="failed",
                    message_preview=message[:100],
                    error_message=error_msg,
                    response_time_ms=int((time.time() - start_time) * 1000),
                    metadata=metadata
                )
                return {
                    "success": False,
                    "error": error_msg,
                    "channel": NotificationChannel.WHATSAPP.value
                }
        
        except requests.Timeout:
            error_msg = "WhatsApp request timeout"
            logger.error(error_msg)
            
            if retry < self.max_retries:
                logger.info(f"Retrying WhatsApp send (attempt {retry + 1}/{self.max_retries})")
                time.sleep(self.retry_delay * (2 ** retry))
                return self.send_whatsapp(message, notification_type, metadata, retry + 1)
            
            return {
                "success": False,
                "error": error_msg,
                "channel": NotificationChannel.WHATSAPP.value
            }
        
        except Exception as e:
            error_msg = f"WhatsApp error: {str(e)}"
            logger.error(error_msg, exc_info=True)
            return {
                "success": False,
                "error": error_msg,
                "channel": NotificationChannel.WHATSAPP.value
            }

    def send_notification(
        self,
        message: str,
        channels: List[str] = None,
        notification_type: str = "general",
        metadata: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """
        Send notification to multiple channels
        
        Args:
            message: Message text
            channels: List of channels (telegram, whatsapp)
            notification_type: Type of notification
            metadata: Additional metadata
            
        Returns:
            Results dictionary with status for each channel
        """
        if channels is None:
            channels = [NotificationChannel.TELEGRAM.value, NotificationChannel.WHATSAPP.value]
        
        results = {
            "success": False,
            "channels": {}
        }
        
        for channel in channels:
            if channel == NotificationChannel.TELEGRAM.value:
                results["channels"]["telegram"] = self.send_telegram(
                    message, notification_type, metadata
                )
            elif channel == NotificationChannel.WHATSAPP.value:
                results["channels"]["whatsapp"] = self.send_whatsapp(
                    message, notification_type, metadata
                )
        
        # Overall success if at least one channel succeeded
        results["success"] = any(
            result.get("success", False)
            for result in results["channels"].values()
        )
        
        return results

    def test_telegram(self) -> Dict[str, Any]:
        """Test Telegram connection"""
        test_message = "🔔 *Test Notification*\n\nTelegram integration is working correctly!"
        return self.send_telegram(
            test_message,
            notification_type="test",
            metadata={"test": True}
        )

    def test_whatsapp(self) -> Dict[str, Any]:
        """Test WhatsApp connection"""
        test_message = "🔔 *Test Notification*\n\nWhatsApp integration is working correctly!"
        return self.send_whatsapp(
            test_message,
            notification_type="test",
            metadata={"test": True}
        )
