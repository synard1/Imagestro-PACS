"""
Export API Endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app.services.export_service import ExportService
from app.utils.logger import get_logger
from app.middleware.rbac import require_permission

logger = get_logger(__name__)
router = APIRouter(prefix="/api/export", tags=["export"])

def excel_response(content: bytes, filename: str) -> Response:
    """Helper to create a streaming response for Excel files"""
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename={filename}"
        }
    )

from app.services.audit_service import AuditService

@router.get("/doctors")
async def export_doctors(db: Session = Depends(get_db), current_user: dict = Depends(require_permission("system:export"))):
    """Export doctor mappings to Excel"""
    try:
        # Audit Log - Strict Mode: Fail if log fails
        audit_service = AuditService(db)
        await audit_service.create_log(
            user_id=str(current_user.get('user_id')),
            username=current_user.get('username'),
            user_role=current_user.get('role'),
            action="EXPORT_DATA",
            resource_type="master_data",
            resource_id="doctors",
            details={"format": "xlsx"},
            severity="INFO"
        )

        content = ExportService.export_doctor_mappings(db)
        timestamp = datetime.now().strftime("%Y%m%d")
        return excel_response(content, f"doctor_mappings_{timestamp}.xlsx")
    except Exception as e:
        logger.error(f"Failed to export doctors: {e}")
        # Gagal mengunduh karena sistem audit gagal mencatat aktivitas.
        raise HTTPException(
            status_code=500, 
            detail="Gagal mengunduh karena sistem audit gagal mencatat aktivitas."
        )

@router.get("/modalities")
async def export_modalities(db: Session = Depends(get_db), current_user: dict = Depends(require_permission("system:export"))):
    """Export modalities to Excel"""
    try:
        # Audit Log - Strict Mode
        audit_service = AuditService(db)
        await audit_service.create_log(
            user_id=str(current_user.get('user_id')),
            username=current_user.get('username'),
            user_role=current_user.get('role'),
            action="EXPORT_DATA",
            resource_type="master_data",
            resource_id="modalities",
            details={"format": "xlsx"},
            severity="INFO"
        )

        content = ExportService.export_modalities(db)
        timestamp = datetime.now().strftime("%Y%m%d")
        return excel_response(content, f"modalities_{timestamp}.xlsx")
    except Exception as e:
        logger.error(f"Failed to export modalities: {e}")
        raise HTTPException(
            status_code=500, 
            detail="Gagal mengunduh karena sistem audit gagal mencatat aktivitas."
        )

@router.get("/insurance")
async def export_insurance(db: Session = Depends(get_db), current_user: dict = Depends(require_permission("system:export"))):
    """Export insurance data to Excel"""
    try:
        # Audit Log - Strict Mode
        audit_service = AuditService(db)
        await audit_service.create_log(
            user_id=str(current_user.get('user_id')),
            username=current_user.get('username'),
            user_role=current_user.get('role'),
            action="EXPORT_DATA",
            resource_type="master_data",
            resource_id="insurance",
            details={"format": "xlsx"},
            severity="INFO"
        )

        content = ExportService.export_insurance(db)
        timestamp = datetime.now().strftime("%Y%m%d")
        return excel_response(content, f"insurance_{timestamp}.xlsx")
    except Exception as e:
        logger.error(f"Failed to export insurance: {e}")
        raise HTTPException(
            status_code=500, 
            detail="Gagal mengunduh karena sistem audit gagal mencatat aktivitas."
        )

@router.get("/procedure-mappings")
async def export_procedure_mappings(db: Session = Depends(get_db), current_user: dict = Depends(require_permission("system:export"))):
    """Export procedure mappings to Excel"""
    try:
        # Audit Log - Strict Mode
        audit_service = AuditService(db)
        await audit_service.create_log(
            user_id=str(current_user.get('user_id')),
            username=current_user.get('username'),
            user_role=current_user.get('role'),
            action="EXPORT_DATA",
            resource_type="master_data",
            resource_id="procedure_mappings",
            details={"format": "xlsx"},
            severity="INFO"
        )

        content = ExportService.export_procedure_mappings(db)
        timestamp = datetime.now().strftime("%Y%m%d")
        return excel_response(content, f"procedure_mappings_{timestamp}.xlsx")
    except Exception as e:
        logger.error(f"Failed to export procedure mappings: {e}")
        raise HTTPException(
            status_code=500, 
            detail="Gagal mengunduh karena sistem audit gagal mencatat aktivitas."
        )

@router.get("/audit-logs")
async def export_audit_logs(limit: int = 1000, db: Session = Depends(get_db), current_user: dict = Depends(require_permission("system:export"))):
    """Export audit logs to Excel"""
    try:
        # Audit Log - Strict Mode (Logging access to logs)
        audit_service = AuditService(db)
        await audit_service.create_log(
            user_id=str(current_user.get('user_id')),
            username=current_user.get('username'),
            user_role=current_user.get('role'),
            action="EXPORT_DATA",
            resource_type="security_audit",
            resource_id="audit_logs",
            details={"format": "xlsx", "limit": limit},
            severity="WARNING"
        )

        content = ExportService.export_audit_logs(db, limit=limit)
        timestamp = datetime.now().strftime("%Y%m%d")
        return excel_response(content, f"audit_logs_{timestamp}.xlsx")
    except Exception as e:
        logger.error(f"Failed to export audit logs: {e}")
        raise HTTPException(
            status_code=500, 
            detail="Gagal mengunduh karena sistem audit gagal mencatat aktivitas."
        )
