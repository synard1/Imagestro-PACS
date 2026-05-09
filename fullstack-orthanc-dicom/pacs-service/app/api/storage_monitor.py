"""
Storage Monitor API Endpoints
Real-time storage monitoring with alerts and historical tracking
Requirements: 1.1, 1.2, 1.5
"""

import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.storage_monitor import get_storage_monitor_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/storage-monitor", tags=["storage-monitor"])


@router.get("/stats")
async def get_storage_stats(db: Session = Depends(get_db)):
    """
    Get current storage statistics.
    
    Returns storage usage information including:
    - total_bytes: Total storage capacity
    - used_bytes: Currently used storage
    - available_bytes: Available storage space
    - usage_percentage: Usage as percentage (0-100)
    - total_studies, total_series, total_instances: DICOM object counts
    
    Requirements: 1.1 - Display storage usage dashboard
    """
    try:
        service = get_storage_monitor_service(db)
        stats = service.get_storage_stats()
        return stats
    except Exception as e:
        logger.error(f"Failed to get storage stats: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get storage stats: {str(e)}")


@router.get("/history")
async def get_storage_history(
    days: int = Query(30, ge=1, le=365, description="Number of days of history"),
    db: Session = Depends(get_db)
):
    """
    Get historical storage data for trend analysis.
    
    Args:
        days: Number of days of history to retrieve (1-365, default: 30)
        
    Returns:
        List of historical storage records with timestamps
        
    Requirements: 1.4 - Store history for trend analysis
    """
    try:
        service = get_storage_monitor_service(db)
        history = service.get_storage_history(days=days)
        return {
            "days": days,
            "count": len(history),
            "history": history
        }
    except Exception as e:
        logger.error(f"Failed to get storage history: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get storage history: {str(e)}")


@router.get("/by-modality")
async def get_storage_by_modality(db: Session = Depends(get_db)):
    """
    Get storage usage breakdown by DICOM modality.
    
    Returns storage statistics grouped by modality (CT, MR, US, etc.)
    including study count, series count, instance count, and total size.
    
    Requirements: 1.5 - Storage usage per modality
    """
    try:
        service = get_storage_monitor_service(db)
        modality_stats = service.get_storage_by_modality()
        return {
            "modalities": list(modality_stats.values()),
            "total_modalities": len(modality_stats)
        }
    except Exception as e:
        logger.error(f"Failed to get storage by modality: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get storage by modality: {str(e)}")


@router.get("/alerts")
async def get_storage_alerts(db: Session = Depends(get_db)):
    """
    Get active storage alerts.
    
    Returns list of active alerts based on storage thresholds:
    - Warning: Storage usage >= 80%
    - Critical: Storage usage >= 90%
    
    Requirements: 1.2, 1.3 - Warning and critical alerts
    """
    try:
        service = get_storage_monitor_service(db)
        alerts = service.check_thresholds()
        return {
            "alerts": alerts,
            "count": len(alerts),
            "has_critical": any(a.get("alert_type") == "critical" for a in alerts),
            "has_warning": any(a.get("alert_type") == "warning" for a in alerts)
        }
    except Exception as e:
        logger.error(f"Failed to get storage alerts: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get storage alerts: {str(e)}")


@router.post("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(
    alert_id: str,
    acknowledged_by: str = Query(..., description="Username acknowledging the alert"),
    db: Session = Depends(get_db)
):
    """
    Acknowledge a storage alert.
    
    Args:
        alert_id: UUID of the alert to acknowledge
        acknowledged_by: Username of the person acknowledging
        
    Returns:
        Updated alert record
    """
    try:
        service = get_storage_monitor_service(db)
        alert = service.acknowledge_alert(alert_id, acknowledged_by)
        
        if not alert:
            raise HTTPException(status_code=404, detail="Alert not found")
        
        return alert
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to acknowledge alert: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to acknowledge alert: {str(e)}")


@router.post("/snapshot")
async def record_storage_snapshot(db: Session = Depends(get_db)):
    """
    Record current storage stats to history.
    
    This endpoint should be called periodically (e.g., hourly via cron)
    to build historical data for trend analysis.
    
    Returns:
        Created history record
        
    Requirements: 1.4 - Store history for trend analysis
    """
    try:
        service = get_storage_monitor_service(db)
        history = service.record_storage_snapshot()
        return {
            "message": "Storage snapshot recorded",
            "record": history.to_dict()
        }
    except Exception as e:
        logger.error(f"Failed to record storage snapshot: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to record storage snapshot: {str(e)}")


@router.get("/summary")
async def get_storage_summary(db: Session = Depends(get_db)):
    """
    Get comprehensive storage summary including stats, alerts, and modality breakdown.
    
    This is a convenience endpoint that combines multiple data sources
    for dashboard display.
    
    Requirements: 1.1, 1.2, 1.5 - Dashboard with all storage information
    """
    try:
        service = get_storage_monitor_service(db)
        
        stats = service.get_storage_stats()
        alerts = service.check_thresholds()
        modality_stats = service.get_storage_by_modality()
        
        return {
            "stats": stats,
            "alerts": {
                "items": alerts,
                "count": len(alerts),
                "has_critical": any(a.get("alert_type") == "critical" for a in alerts),
                "has_warning": any(a.get("alert_type") == "warning" for a in alerts)
            },
            "by_modality": list(modality_stats.values())
        }
    except Exception as e:
        logger.error(f"Failed to get storage summary: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get storage summary: {str(e)}")


@router.post("/generate-history")
async def generate_sample_history(
    days: int = Query(30, ge=1, le=365, description="Number of days of history to generate"),
    db: Session = Depends(get_db)
):
    """
    Generate sample historical data for testing/dashboard demo.
    Only generates if no history exists already.
    
    Args:
        days: Number of days of sample history (1-365, default: 30)
    """
    try:
        service = get_storage_monitor_service(db)
        count = service.generate_sample_history(days=days)
        return {
            "message": f"Generated {count} sample historical records",
            "days": days,
            "records_created": count
        }
    except Exception as e:
        logger.error(f"Failed to generate sample history: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate sample history: {str(e)}")
