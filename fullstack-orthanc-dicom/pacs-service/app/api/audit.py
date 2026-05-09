"""
Audit API Endpoints
Provides HIPAA/GDPR compliant audit log access
"""

import logging
from typing import Optional, List
from datetime import datetime
from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import get_db
from app.services.audit_service import AuditService
from app.middleware.rbac import require_permission
from io import StringIO

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("/logs")
async def list_audit_logs(
    user_id: Optional[str] = Query(None, description="Filter by user ID"),
    username: Optional[str] = Query(None, description="Filter by username"),
    action: Optional[str] = Query(None, description="Filter by action"),
    resource_type: Optional[str] = Query(None, description="Filter by resource type"),
    phi_only: bool = Query(False, description="Only show PHI access logs"),
    failed_only: bool = Query(False, description="Only show failed operations"),
    start_date: Optional[datetime] = Query(None, description="Start date filter"),
    end_date: Optional[datetime] = Query(None, description="End date filter"),
    severity: Optional[str] = Query(None, description="Filter by severity"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum results"),
    offset: Optional[int] = Query(None, ge=0, description="Offset for pagination (overrides page when provided)"),
    page: Optional[int] = Query(None, ge=1, description="Page number (1-based)"),
    search: Optional[str] = Query(None, description="General search query"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("audit:view"))
):
    """
    List audit logs with filtering
    
    Returns paginated audit log entries with optional filters.
    """
    try:
        audit_service = AuditService(db)

        effective_offset = offset if offset is not None else 0
        if page:
            effective_offset = (page - 1) * limit

        logs, total_count = await audit_service.get_logs(
            user_id=user_id,
            username=username,
            action=action,
            resource_type=resource_type,
            phi_only=phi_only,
            failed_only=failed_only,
            start_date=start_date,
            end_date=end_date,
            severity=severity,
            limit=limit,
            offset=effective_offset,
            page=page,
            search=search
        )
        
        return {
            "logs": logs,
            "count": total_count,
            "returned": len(logs),
            "limit": limit,
            "offset": effective_offset,
            "page": page if page else (effective_offset // limit) + 1,
            "filters": {
                "user_id": user_id,
                "username": username,
                "action": action,
                "resource_type": resource_type,
                "phi_only": phi_only,
                "failed_only": failed_only,
                "severity": severity
            }
        }
        
    except Exception as e:
        logger.error(f"Failed to list audit logs: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to list audit logs: {str(e)}")


@router.get("/logs/{log_id}")
async def get_audit_log(
    log_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("audit:view"))
):
    """Get specific audit log entry by ID"""
    try:
        # Query single log
        query = text("SELECT * FROM pacs_audit_log WHERE id = :log_id")
        result = db.execute(query, {"log_id": log_id})
        row = result.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Audit log not found")

        r = row._mapping
        return {
            'id': str(r['id']),
            'user_id': str(r['user_id']) if r['user_id'] else None,
            'username': r['username'],
            'user_role': r['user_role'],
            'action': r['action'],
            'resource_type': r['resource_type'],
            'resource_id': r['resource_id'],
            'details': r['details'],
            'ip_address': r['ip_address'],
            'user_agent': r['user_agent'],
            'session_id': r['session_id'],
            'request_method': r['request_method'],
            'request_path': r['request_path'],
            'response_status': r['response_status'],
            'response_time_ms': r['response_time_ms'],
            'phi_accessed': r['phi_accessed'],
            'patient_id': r['patient_id'],
            'study_instance_uid': r['study_instance_uid'],
            'failure_reason': r['failure_reason'],
            'severity': r['severity'],
            'created_at': r['created_at'].isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get audit log: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get audit log: {str(e)}")


@router.get("/stats")
async def get_audit_stats(
    start_date: Optional[datetime] = Query(None, description="Start date (default: 30 days ago)"),
    end_date: Optional[datetime] = Query(None, description="End date (default: now)"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("audit:view"))
):
    """
    Get audit statistics
    
    Returns statistics about audit logs including total events,
    PHI access count, failed operations, unique users, and unique patients.
    """
    try:
        audit_service = AuditService(db)
        stats = await audit_service.get_stats(start_date=start_date, end_date=end_date)
        return stats
        
    except Exception as e:
        logger.error(f"Failed to get audit stats: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get audit stats: {str(e)}")


@router.get("/export")
async def export_audit_logs(
    format: str = Query("json", regex="^(json|csv)$", description="Export format"),
    user_id: Optional[str] = Query(None),
    username: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    phi_only: bool = Query(False),
    failed_only: bool = Query(False),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    severity: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("audit:view"))
):
    """
    Export audit logs to JSON or CSV
    
    Downloads audit logs in the specified format with applied filters.
    """
    try:
        audit_service = AuditService(db)
        
        data = await audit_service.export_logs(
            format=format,
            user_id=user_id,
            username=username,
            action=action,
            resource_type=resource_type,
            phi_only=phi_only,
            failed_only=failed_only,
            start_date=start_date,
            end_date=end_date,
            severity=severity
        )
        
        # Determine content type and filename
        if format == "csv":
            media_type = "text/csv"
            filename = f"audit_logs_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        else:
            media_type = "application/json"
            filename = f"audit_logs_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        
        return StreamingResponse(
            iter([data]),
            media_type=media_type,
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )
        
    except Exception as e:
        logger.error(f"Failed to export audit logs: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to export audit logs: {str(e)}")


@router.get("/actions")
async def list_audit_actions(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("audit:view"))
):
    """List all distinct actions in audit logs"""
    try:
        query = text("SELECT DISTINCT action FROM pacs_audit_log ORDER BY action")
        result = db.execute(query)
        actions = [row[0] for row in result.fetchall()]
        return {"actions": actions}
        
    except Exception as e:
        logger.error(f"Failed to list actions: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/resource-types")
async def list_resource_types(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("audit:view"))
):
    """List all distinct resource types in audit logs"""
    try:
        query = text("SELECT DISTINCT resource_type FROM pacs_audit_log WHERE resource_type IS NOT NULL ORDER BY resource_type")
        result = db.execute(query)
        types = [row[0] for row in result.fetchall()]
        return {"resource_types": types}
        
    except Exception as e:
        logger.error(f"Failed to list resource types: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
