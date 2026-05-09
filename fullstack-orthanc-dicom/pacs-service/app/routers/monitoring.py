"""
Monitoring API
Enhanced health checks and metrics for production monitoring
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.health_monitor import get_health_monitor
from app.services.metrics import get_metrics_service
from app.middleware.auth import require_roles

router = APIRouter(prefix="/api/monitoring", tags=["Monitoring"])


@router.get("/health/detailed", dependencies=[Depends(require_roles(["superadmin"]))])
def get_detailed_health(db: Session = Depends(get_db)):
    """
    Get comprehensive system health status
    
    Includes:
    - Database health
    - Disk space
    - Memory usage
    - DICOM SCP status
    - Recent errors
    """
    monitor = get_health_monitor()
    return monitor.get_comprehensive_health(db)


@router.get("/metrics", dependencies=[Depends(require_roles(["superadmin"]))])
def get_metrics(db: Session = Depends(get_db)):
    """
    Get system metrics and statistics
    
    Includes:
    - Storage metrics
    - DICOM operation metrics
    - Performance metrics
    """
    metrics_service = get_metrics_service()
    return metrics_service.get_system_metrics(db)


@router.get("/status")
def get_quick_status(db: Session = Depends(get_db)):
    """
    Quick status check for load balancers
    
    Returns simple status for health checks
    """
    try:
        monitor = get_health_monitor()
        health = monitor.get_comprehensive_health(db)
        
        return {
            "status": health.get("status", "unknown"),
            "timestamp": health.get("timestamp"),
            "uptime_seconds": health.get("uptime_seconds")
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e)
        }
