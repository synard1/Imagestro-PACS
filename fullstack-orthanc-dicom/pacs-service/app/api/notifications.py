"""
Notification API Endpoints
Secure proxy for sending notifications via Telegram and WhatsApp
"""

import logging
from typing import Dict, Any
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, Field
import requests
from datetime import datetime

from app.middleware.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


# Request/Response Models
class TelegramConfig(BaseModel):
    """Telegram configuration"""
    bot_token: str = Field(..., description="Telegram Bot Token")
    chat_id: str = Field(..., description="Telegram Chat ID")


class WhatsAppConfig(BaseModel):
    """WhatsApp configuration (Evolution API)"""
    base_url: str = Field(..., description="Evolution API Base URL")
    api_key: str = Field(..., description="Evolution API Key")
    instance_name: str = Field(..., description="WhatsApp Instance Name")
    target_number: str = Field(..., description="Target Phone Number")


class NotificationRequest(BaseModel):
    """Request to send notification"""
    message: str = Field(..., description="Message to send")
    channel: str = Field(..., description="Channel: telegram or whatsapp")


class NotificationTestRequest(BaseModel):
    """Request to test notification channel"""
    channel: str = Field(..., description="Channel: telegram or whatsapp")
    config: Dict[str, Any] = Field(..., description="Channel configuration")


class NotificationResponse(BaseModel):
    """Notification response"""
    success: bool
    message: str
    timestamp: str
    channel: str


# In-memory configuration storage (should be moved to database in production)
_notification_config: Dict[str, Any] = {
    "telegram": {
        "enabled": False,
        "bot_token": "",
        "chat_id": ""
    },
    "whatsapp": {
        "enabled": False,
        "base_url": "",
        "api_key": "",
        "instance_name": "",
        "target_number": ""
    }
}


@router.post("/config/telegram", response_model=dict)
async def configure_telegram(
    config: TelegramConfig,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Configure Telegram notification settings
    Requires admin privileges
    """
    # Check if user has admin privileges
    user_role = current_user.get("role")
    if user_role not in ['admin', 'superadmin']:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can configure notifications"
        )
    
    _notification_config["telegram"] = {
        "enabled": True,
        "bot_token": config.bot_token,
        "chat_id": config.chat_id
    }
    
    logger.info(f"Telegram configuration updated by user {current_user.get('username')}")
    
    return {
        "success": True,
        "message": "Telegram configuration updated successfully"
    }


@router.post("/config/whatsapp", response_model=dict)
async def configure_whatsapp(
    config: WhatsAppConfig,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Configure WhatsApp notification settings
    Requires admin privileges
    """
    # Check if user has admin privileges
    user_role = current_user.get("role")
    if user_role not in ['admin', 'superadmin']:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can configure notifications"
        )
    
    _notification_config["whatsapp"] = {
        "enabled": True,
        "base_url": config.base_url.rstrip('/'),
        "api_key": config.api_key,
        "instance_name": config.instance_name,
        "target_number": config.target_number
    }
    
    logger.info(f"WhatsApp configuration updated by user {current_user.get('username')}")
    
    return {
        "success": True,
        "message": "WhatsApp configuration updated successfully"
    }


@router.get("/config", response_model=dict)
async def get_notification_config(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Get notification configuration (without sensitive data)
    """
    # Return config without sensitive credentials
    safe_config = {
        "telegram": {
            "enabled": _notification_config["telegram"]["enabled"],
            "configured": bool(_notification_config["telegram"].get("bot_token"))
        },
        "whatsapp": {
            "enabled": _notification_config["whatsapp"]["enabled"],
            "configured": bool(_notification_config["whatsapp"].get("api_key")),
            "base_url": _notification_config["whatsapp"].get("base_url", "")
        }
    }
    
    return safe_config


@router.post("/send", response_model=NotificationResponse)
async def send_notification(
    request: NotificationRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Send notification via specified channel
    This is the secure proxy endpoint that frontend should call
    """
    channel = request.channel.lower()
    
    if channel not in ["telegram", "whatsapp"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid channel. Must be 'telegram' or 'whatsapp'"
        )
    
    config = _notification_config.get(channel)
    
    if not config or not config.get("enabled"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{channel.capitalize()} notifications are not enabled"
        )
    
    try:
        if channel == "telegram":
            success = await _send_telegram(request.message, config)
        else:  # whatsapp
            success = await _send_whatsapp(request.message, config)
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to send {channel} notification"
            )
        
        logger.info(f"Notification sent via {channel} by user {current_user.get('username')}")
        
        return NotificationResponse(
            success=True,
            message=f"Notification sent successfully via {channel}",
            timestamp=datetime.now().isoformat(),
            channel=channel
        )
        
    except Exception as e:
        logger.error(f"Error sending {channel} notification: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error sending notification: {str(e)}"
        )


@router.post("/test", response_model=NotificationResponse)
async def test_notification(
    request: NotificationTestRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Test notification channel with provided configuration
    Used for testing before saving configuration
    """
    channel = request.channel.lower()
    
    if channel not in ["telegram", "whatsapp"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid channel. Must be 'telegram' or 'whatsapp'"
        )
    
    test_message = f"🔔 *Test Notification*\n\nThis is a test message from MWL-PACS system.\nSent at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
    
    try:
        if channel == "telegram":
            config = {
                "bot_token": request.config.get("bot_token", ""),
                "chat_id": request.config.get("chat_id", "")
            }
            success = await _send_telegram(test_message, config)
        else:  # whatsapp
            config = {
                "base_url": request.config.get("base_url", "").rstrip('/'),
                "api_key": request.config.get("api_key", ""),
                "instance_name": request.config.get("instance_name", ""),
                "target_number": request.config.get("target_number", "")
            }
            success = await _send_whatsapp(test_message, config)
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to send test {channel} notification"
            )
        
        logger.info(f"Test notification sent via {channel} by user {current_user.get('username')}")
        
        return NotificationResponse(
            success=True,
            message=f"Test notification sent successfully via {channel}",
            timestamp=datetime.now().isoformat(),
            channel=channel
        )
        
    except Exception as e:
        logger.error(f"Error sending test {channel} notification: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error sending test notification: {str(e)}"
        )


# Helper functions
async def _send_telegram(message: str, config: Dict[str, Any]) -> bool:
    """
    Send message via Telegram Bot API
    """
    bot_token = config.get("bot_token")
    chat_id = config.get("chat_id")
    
    if not bot_token or not chat_id:
        raise ValueError("Telegram bot_token and chat_id are required")
    
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    
    try:
        response = requests.post(
            url,
            json={
                "chat_id": chat_id,
                "text": message,
                "parse_mode": "Markdown"
            },
            timeout=10
        )
        
        data = response.json()
        
        if not data.get("ok"):
            error_desc = data.get("description", "Unknown error")
            logger.error(f"Telegram API error: {error_desc}")
            
            if "chat not found" in error_desc.lower():
                raise ValueError("Telegram Chat ID not found. Please ensure you have started a conversation with the bot.")
            
            raise ValueError(f"Telegram API error: {error_desc}")
        
        return True
        
    except requests.exceptions.RequestException as e:
        logger.error(f"Telegram request failed: {str(e)}")
        raise ValueError(f"Failed to connect to Telegram API: {str(e)}")


async def _send_whatsapp(message: str, config: Dict[str, Any]) -> bool:
    """
    Send message via WhatsApp (Evolution API)
    """
    base_url = config.get("base_url")
    api_key = config.get("api_key")
    instance_name = config.get("instance_name")
    target_number = config.get("target_number")
    
    if not all([base_url, api_key, instance_name, target_number]):
        raise ValueError("WhatsApp configuration incomplete")
    
    url = f"{base_url}/message/sendText/{instance_name}"
    
    try:
        response = requests.post(
            url,
            headers={
                "Content-Type": "application/json",
                "apikey": api_key
            },
            json={
                "number": target_number,
                "text": message
            },
            timeout=10
        )
        
        if not response.ok:
            logger.error(f"WhatsApp API error: {response.status_code} - {response.text}")
            raise ValueError(f"WhatsApp API error: {response.status_code}")
        
        return True
        
    except requests.exceptions.RequestException as e:
        logger.error(f"WhatsApp request failed: {str(e)}")
        raise ValueError(f"Failed to connect to WhatsApp API: {str(e)}")
