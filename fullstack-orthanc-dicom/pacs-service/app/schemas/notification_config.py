"""
Notification Configuration Schemas
"""

from pydantic import BaseModel, Field
from pydantic.config import ConfigDict
from typing import Optional, Dict, Any
from datetime import datetime


class NotificationConfigBase(BaseModel):
    """Base notification config schema"""
    config_key: str = Field(..., description="Configuration key")
    config_value: str = Field(..., description="Configuration value")
    description: Optional[str] = Field(None, description="Description")
    is_sensitive: bool = Field(False, description="Is this a sensitive field (API key, token)?")
    enabled: bool = Field(True, description="Is this config enabled?")


class NotificationConfigCreate(NotificationConfigBase):
    """Create notification config"""
    pass


class NotificationConfigUpdate(BaseModel):
    """Update notification config"""
    config_value: Optional[str] = None
    description: Optional[str] = None
    enabled: Optional[bool] = None


class NotificationConfigResponse(NotificationConfigBase):
    """Notification config response"""
    id: int
    created_at: datetime
    updated_at: datetime
    updated_by: Optional[str] = None

    class Config:
        from_attributes = True


class NotificationConfigSensitiveResponse(BaseModel):
    """Notification config response (hides sensitive values)"""
    id: int
    config_key: str
    description: Optional[str]
    is_sensitive: bool
    enabled: bool
    created_at: datetime
    updated_at: datetime
    config_value: Optional[str] = Field(None, description="Masked if sensitive")

    @staticmethod
    def from_config(config):
        """Create response from config, masking sensitive values"""
        value = config.config_value
        if config.is_sensitive:
            # Mask sensitive values
            if len(value) > 4:
                value = value[:2] + "*" * (len(value) - 4) + value[-2:]
            else:
                value = "*" * len(value)
        
        return NotificationConfigSensitiveResponse(
            id=config.id,
            config_key=config.config_key,
            description=config.description,
            is_sensitive=config.is_sensitive,
            enabled=config.enabled,
            created_at=config.created_at,
            updated_at=config.updated_at,
            config_value=value
        )

    class Config:
        from_attributes = True


class NotificationAuditLogResponse(BaseModel):
    """Notification audit log response"""
    id: int
    notification_type: str
    channel: str
    recipient: Optional[str]
    status: str
    message_preview: Optional[str]
    error_message: Optional[str]
    metadata: Optional[Dict[str, Any]] = Field(None, alias="metadata_json")
    created_at: datetime
    response_time_ms: Optional[int]

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class NotificationAuditLogListResponse(BaseModel):
    """Paginated notification audit log response"""
    total: int
    data: list[NotificationAuditLogResponse]
    page: int
    page_size: int
    total_pages: int


class NotificationTestRequest(BaseModel):
    """Test notification request"""
    channel: str = Field(..., description="Channel to test: telegram, whatsapp, email")
    recipient: Optional[str] = Field(None, description="Override recipient for testing")


class NotificationTestResponse(BaseModel):
    """Test notification response"""
    success: bool
    message: str
    channel: str
    timestamp: datetime


class NotificationSettingsResponse(BaseModel):
    """Complete notification settings response"""
    telegram_enabled: bool
    telegram_bot_token_configured: bool
    telegram_chat_id_configured: bool
    
    whatsapp_enabled: bool
    whatsapp_api_key_configured: bool
    whatsapp_instance_name_configured: bool
    whatsapp_target_number_configured: bool
    
    email_enabled: bool
    email_smtp_configured: bool
    
    last_test_result: Optional[Dict[str, Any]] = None
    last_test_timestamp: Optional[datetime] = None


class OrderNotificationRequest(BaseModel):
    """Request to send order notification"""
    order_id: str = Field(..., description="Order ID")
    notification_type: str = Field(..., description="Type of notification (NEW_ORDER, STAGNANT_ORDER, etc.)")
    stagnant_hours: Optional[float] = Field(None, description="Hours stagnant (optional)")
    
    model_config = ConfigDict(extra='allow')
