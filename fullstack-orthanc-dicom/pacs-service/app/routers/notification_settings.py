"""
Notification Settings Router
Secure backend API for managing notification configuration
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional, Union
from datetime import datetime, date

from app.database import get_db
from app.models.notification_config import NotificationConfig, NotificationAuditLog
from app.schemas.notification_config import (
    NotificationConfigCreate,
    NotificationConfigUpdate,
    NotificationConfigResponse,
    NotificationConfigSensitiveResponse,
    NotificationAuditLogResponse,
    NotificationAuditLogListResponse,
    NotificationTestRequest,
    NotificationTestResponse,
    NotificationSettingsResponse,
    OrderNotificationRequest
)
from app.services.telegram_whatsapp_service import TelegramWhatsAppService

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/settings/notification",
    tags=["notification-settings"],
    responses={404: {"description": "Not found"}}
)


# ============================================================================
# Configuration Management Endpoints
# ============================================================================

@router.get("/config", response_model=List[NotificationConfigSensitiveResponse])
async def get_notification_config(
    db: Session = Depends(get_db),
    include_disabled: bool = False
):
    """
    Get all notification configuration
    
    Sensitive values (API keys, tokens) are masked in response
    
    Args:
        include_disabled: Include disabled configurations
        
    Returns:
        List of notification configurations
    """
    try:
        query = db.query(NotificationConfig)
        
        if not include_disabled:
            query = query.filter(NotificationConfig.enabled == True)
        
        configs = query.all()
        
        return [
            NotificationConfigSensitiveResponse.from_config(config)
            for config in configs
        ]
    except Exception as e:
        logger.error(f"Error retrieving notification config: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve notification configuration"
        )


@router.get("/config/{config_key}", response_model=NotificationConfigSensitiveResponse)
async def get_notification_config_by_key(
    config_key: str,
    db: Session = Depends(get_db)
):
    """
    Get specific notification configuration by key
    
    Args:
        config_key: Configuration key
        
    Returns:
        Notification configuration (sensitive values masked)
    """
    try:
        config = db.query(NotificationConfig).filter(
            NotificationConfig.config_key == config_key
        ).first()
        
        if not config:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Configuration '{config_key}' not found"
            )
        
        return NotificationConfigSensitiveResponse.from_config(config)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving config {config_key}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve configuration"
        )


@router.post("/config", response_model=NotificationConfigResponse)
async def create_notification_config(
    config: NotificationConfigCreate,
    db: Session = Depends(get_db),
    current_user: str = "system"
):
    """
    Create new notification configuration
    
    Args:
        config: Configuration data
        current_user: Current user (for audit)
        
    Returns:
        Created configuration
    """
    try:
        # Check if key already exists
        existing = db.query(NotificationConfig).filter(
            NotificationConfig.config_key == config.config_key
        ).first()
        
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Configuration '{config.config_key}' already exists"
            )
        
        db_config = NotificationConfig(
            config_key=config.config_key,
            config_value=config.config_value,
            description=config.description,
            is_sensitive=config.is_sensitive,
            enabled=config.enabled,
            updated_by=current_user
        )
        
        db.add(db_config)
        db.commit()
        db.refresh(db_config)
        
        logger.info(f"Created notification config: {config.config_key}")
        
        return NotificationConfigResponse.from_orm(db_config)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating notification config: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create configuration"
        )


@router.put("/config/{config_key}", response_model=NotificationConfigResponse)
async def update_notification_config(
    config_key: str,
    config_update: NotificationConfigUpdate,
    db: Session = Depends(get_db),
    current_user: str = "system"
):
    """
    Update notification configuration
    
    Args:
        config_key: Configuration key
        config_update: Updated configuration data
        current_user: Current user (for audit)
        
    Returns:
        Updated configuration
    """
    try:
        db_config = db.query(NotificationConfig).filter(
            NotificationConfig.config_key == config_key
        ).first()
        
        if not db_config:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Configuration '{config_key}' not found"
            )
        
        # Update fields
        if config_update.config_value is not None:
            db_config.config_value = config_update.config_value
        if config_update.description is not None:
            db_config.description = config_update.description
        if config_update.enabled is not None:
            db_config.enabled = config_update.enabled
        
        db_config.updated_by = current_user
        
        db.commit()
        db.refresh(db_config)
        
        logger.info(f"Updated notification config: {config_key}")
        
        return NotificationConfigResponse.from_orm(db_config)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating notification config: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update configuration"
        )


@router.delete("/config/{config_key}")
async def delete_notification_config(
    config_key: str,
    db: Session = Depends(get_db)
):
    """
    Delete notification configuration
    
    Args:
        config_key: Configuration key
        
    Returns:
        Success message
    """
    try:
        db_config = db.query(NotificationConfig).filter(
            NotificationConfig.config_key == config_key
        ).first()
        
        if not db_config:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Configuration '{config_key}' not found"
            )
        
        db.delete(db_config)
        db.commit()
        
        logger.info(f"Deleted notification config: {config_key}")
        
        return {"message": f"Configuration '{config_key}' deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting notification config: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete configuration"
        )


# ============================================================================
# Settings Status Endpoints
# ============================================================================

@router.get("/status", response_model=NotificationSettingsResponse)
async def get_notification_status(db: Session = Depends(get_db)):
    """
    Get notification settings status
    
    Returns:
        Status of all notification channels
    """
    try:
        def config_exists(key: str) -> bool:
            config = db.query(NotificationConfig).filter(
                NotificationConfig.config_key == key,
                NotificationConfig.enabled == True
            ).first()
            return config is not None
        
        return NotificationSettingsResponse(
            telegram_enabled=config_exists("telegram_bot_token") and config_exists("telegram_chat_id"),
            telegram_bot_token_configured=config_exists("telegram_bot_token"),
            telegram_chat_id_configured=config_exists("telegram_chat_id"),
            
            whatsapp_enabled=all([
                config_exists("whatsapp_api_key"),
                config_exists("whatsapp_instance_name"),
                config_exists("whatsapp_target_number"),
                config_exists("whatsapp_base_url")
            ]),
            whatsapp_api_key_configured=config_exists("whatsapp_api_key"),
            whatsapp_instance_name_configured=config_exists("whatsapp_instance_name"),
            whatsapp_target_number_configured=config_exists("whatsapp_target_number"),
            
            email_enabled=config_exists("email_smtp_host") and config_exists("email_from"),
            email_smtp_configured=config_exists("email_smtp_host")
        )
    except Exception as e:
        logger.error(f"Error getting notification status: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get notification status"
        )


# ============================================================================
# Test Endpoints
# ============================================================================

@router.post("/test", response_model=NotificationTestResponse)
async def test_notification(
    test_request: NotificationTestRequest,
    db: Session = Depends(get_db)
):
    """
    Test notification channel
    
    Args:
        test_request: Test request with channel to test
        
    Returns:
        Test result
    """
    try:
        service = TelegramWhatsAppService(db_session=db)
        
        if test_request.channel == "telegram":
            result = service.test_telegram()
        elif test_request.channel == "whatsapp":
            result = service.test_whatsapp()
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown channel: {test_request.channel}"
            )
        
        return NotificationTestResponse(
            success=result.get("success", False),
            message=result.get("error") if not result.get("success") else "Test sent successfully",
            channel=test_request.channel,
            timestamp=datetime.now()
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error testing notification: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to test notification"
        )


# ============================================================================
# Audit Log Endpoints
# ============================================================================

@router.get("/audit-logs", response_model=NotificationAuditLogListResponse)
async def get_audit_logs(
    db: Session = Depends(get_db),
    notification_type: Optional[str] = None,
    channel: Optional[str] = None,
    status: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    limit: int = 100,
    offset: int = 0
):
    """
    Get notification audit logs
    
    Args:
        notification_type: Filter by notification type
        channel: Filter by channel
        status: Filter by status
        date_from: Filter by start date (inclusive)
        date_to: Filter by end date (inclusive)
        limit: Number of records to return
        offset: Offset for pagination
        
    Returns:
        Paginated list of audit logs
    """
    try:
        query = db.query(NotificationAuditLog)
        
        if notification_type:
            query = query.filter(NotificationAuditLog.notification_type == notification_type)
        if channel:
            query = query.filter(NotificationAuditLog.channel == channel)
        if status:
            query = query.filter(NotificationAuditLog.status == status)
        
        if date_from:
            dt_from = datetime.combine(date_from, datetime.min.time())
            query = query.filter(NotificationAuditLog.created_at >= dt_from)
            
        if date_to:
            dt_to = datetime.combine(date_to, datetime.max.time())
            query = query.filter(NotificationAuditLog.created_at <= dt_to)
        
        # Get total count before pagination
        total = query.count()
        
        logs = query.order_by(
            NotificationAuditLog.created_at.desc()
        ).limit(limit).offset(offset).all()
        
        # Calculate pagination metadata
        page = (offset // limit) + 1 if limit > 0 else 1
        total_pages = (total + limit - 1) // limit if limit > 0 else 1
        
        return NotificationAuditLogListResponse(
            total=total,
            data=[NotificationAuditLogResponse.from_orm(log) for log in logs],
            page=page,
            page_size=limit,
            total_pages=total_pages
        )
    except Exception as e:
        logger.error(f"Error retrieving audit logs: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve audit logs"
        )


@router.get("/audit-logs/stats")
async def get_audit_stats(
    db: Session = Depends(get_db),
    days: int = 7
):
    """
    Get notification statistics
    
    Args:
        days: Number of days to include in stats
        
    Returns:
        Statistics dictionary
    """
    try:
        from sqlalchemy import func
        from datetime import timedelta
        
        cutoff_date = datetime.now() - timedelta(days=days)
        
        query = db.query(NotificationAuditLog).filter(
            NotificationAuditLog.created_at >= cutoff_date
        )
        
        total = query.count()
        success = query.filter(NotificationAuditLog.status == "success").count()
        failed = query.filter(NotificationAuditLog.status == "failed").count()
        rate_limited = query.filter(NotificationAuditLog.status == "rate_limited").count()
        
        # By channel
        by_channel = db.query(
            NotificationAuditLog.channel,
            func.count(NotificationAuditLog.id).label("count")
        ).filter(
            NotificationAuditLog.created_at >= cutoff_date
        ).group_by(NotificationAuditLog.channel).all()
        
        # By type
        by_type = db.query(
            NotificationAuditLog.notification_type,
            func.count(NotificationAuditLog.id).label("count")
        ).filter(
            NotificationAuditLog.created_at >= cutoff_date
        ).group_by(NotificationAuditLog.notification_type).all()
        
        return {
            "period_days": days,
            "total": total,
            "success": success,
            "failed": failed,
            "rate_limited": rate_limited,
            "success_rate": (success / total * 100) if total > 0 else 0,
            "by_channel": {channel: count for channel, count in by_channel},
            "by_type": {ntype: count for ntype, count in by_type}
        }
    except Exception as e:
        logger.error(f"Error getting audit stats: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get audit statistics"
        )


# ============================================================================
# Order Notification Endpoints
# ============================================================================

from fastapi import APIRouter, Depends, HTTPException, status, Body
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional, Union
from datetime import datetime
from pydantic import ValidationError

from app.database import get_db
# ... imports ...

# ... existing code ...

# ============================================================================
# Order Notification Endpoints
# ============================================================================

@router.post("/send-order-notification", response_model=dict)
async def send_order_notification(
    payload: Any = Body(..., description="Single order notification request or list of requests"),
    db: Session = Depends(get_db)
):
    """
    Send notification for a new order
    Called by frontend after order is created.
    Supports single object or list of objects.
    
    Args:
        payload: One or more order notification requests.
            Each request must have:
            - order_id: Order ID
            - notification_type: Type of notification (NEW_ORDER, etc.)
            Optional context fields can be included.
            
    Returns:
        Notification result(s)
    """
    try:
        from app.services.order_notification_service import OrderNotificationService
        
        notifier = OrderNotificationService(db)
        
        # Normalize to list and validate manually
        is_batch = isinstance(payload, list)
        raw_requests = payload if is_batch else [payload]
        
        requests = []
        for raw_req in raw_requests:
            if not isinstance(raw_req, dict):
                 raise HTTPException(status_code=422, detail="Invalid payload format: Items must be dictionaries")
            try:
                # Manually validate to ensure data integrity
                req = OrderNotificationRequest(**raw_req)
                requests.append(req)
            except ValidationError as e:
                raise HTTPException(status_code=422, detail=f"Validation error: {e}")

        results = []
        
        for req in requests:
            # Convert to dict, including extra fields
            order_data = req.model_dump()
            notification_type = order_data.get("notification_type", "NEW_ORDER")
            order_id = order_data.get("order_id")
            
            try:
                result = None
                if notification_type == "NEW_ORDER":
                    result = notifier.notify_new_order(
                        order_id=order_id,
                        context=order_data
                    )
                elif notification_type == "STAGNANT_ORDER":
                    result = notifier.notify_stagnant_order(
                        order_id=order_id,
                        context=order_data
                    )
                elif notification_type == "ORDER_SCHEDULED":
                    result = notifier.notify_order_scheduled(
                        order_id=order_id,
                        context=order_data
                    )
                elif notification_type == "ORDER_COMPLETED":
                    result = notifier.notify_order_completed(
                        order_id=order_id,
                        context=order_data
                    )
                else:
                    logger.warning(f"Unknown notification type: {notification_type} for order {order_id}")
                    results.append({
                        "success": False,
                        "order_id": order_id,
                        "message": f"Unknown notification type: {notification_type}"
                    })
                    continue

                success = result is not None and result.get("success", False)
                message = "Notification sent successfully"
                if result:
                    if not success:
                         message = result.get("error") or result.get("reason") or "Failed"
                    if result.get("status") == "skipped":
                         message = f"Skipped: {result.get('reason', 'unknown reason')}"
                else:
                    message = "Failed to generate notification (missing data?)"
                
                results.append({
                    "success": success,
                    "notification_type": notification_type,
                    "order_id": order_id,
                    "message": message
                })
                
            except Exception as e:
                logger.error(f"Error processing notification for order {order_id}: {e}")
                results.append({
                    "success": False,
                    "order_id": order_id,
                    "message": f"Internal error: {str(e)}"
                })

        # Return single result if single request to maintain backward compatibility structure
        if not is_batch and len(results) == 1:
            return results[0]
            
        return {
            "processed": len(requests),
            "success_count": sum(1 for r in results if r.get("success")),
            "results": results
        }
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending order notification: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send order notification: {str(e)}"
        )
