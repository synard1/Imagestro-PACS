"""
Reports API
FastAPI endpoints for radiology reporting system
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import uuid

from app.database import get_db
from app.middleware.rbac import require_permission
from app.models.report import Report, ReportHistory, ReportAttachment
from pydantic import BaseModel, Field


router = APIRouter(prefix="/api/reports", tags=["reports"])


# ============================================================================
# Pydantic Schemas
# ============================================================================

class ReportCreate(BaseModel):
    """Schema for creating a new report"""
    study_id: str = Field(..., description="Study Instance UID")
    patient_id: str = Field(..., description="Patient ID")
    patient_name: str = Field(..., description="Patient Name")
    template_id: str = Field(..., description="Report template ID")
    modality: Optional[str] = Field(None, description="Modality (CT, MRI, etc.)")
    body_part: Optional[str] = Field(None, description="Body part examined")
    clinical_history: Optional[str] = Field(None, description="Clinical history")
    technique: Optional[str] = Field(None, description="Technique used")
    comparison: Optional[str] = Field(None, description="Comparison studies")
    findings: str = Field(..., description="Findings")
    impression: str = Field(..., description="Impression")
    recommendation: Optional[str] = Field(None, description="Recommendations")
    created_by: str = Field(..., description="Username of creator")


class ReportUpdate(BaseModel):
    """Schema for updating report content"""
    clinical_history: Optional[str] = None
    technique: Optional[str] = None
    comparison: Optional[str] = None
    findings: Optional[str] = None
    impression: Optional[str] = None
    recommendation: Optional[str] = None
    updated_by: str = Field(..., description="Username of updater")


class ReportStatusUpdate(BaseModel):
    """Schema for updating report status"""
    status: str = Field(..., description="New status (draft, preliminary, final, amended, cancelled)")
    updated_by: str = Field(..., description="Username of updater")
    signature_id: Optional[str] = Field(None, description="Signature ID if finalizing")
    signature_method: Optional[str] = Field(None, description="Signature method")
    signature_data: Optional[str] = Field(None, description="Signature data")


class ReportResponse(BaseModel):
    """Schema for report response"""
    report_id: str
    study_id: str
    patient_id: str
    patient_name: str
    template_id: str
    modality: Optional[str]
    body_part: Optional[str]
    clinical_history: Optional[str]
    technique: Optional[str]
    comparison: Optional[str]
    findings: str
    impression: str
    recommendation: Optional[str]
    status: str
    created_by: str
    created_at: datetime
    updated_by: Optional[str]
    updated_at: Optional[datetime]
    finalized_by: Optional[str]
    finalized_at: Optional[datetime]
    signature_id: Optional[str]
    signature_method: Optional[str]
    version: int
    parent_report_id: Optional[str]
    
    class Config:
        from_attributes = True


class ReportHistoryResponse(BaseModel):
    """Schema for report history response"""
    id: int
    report_id: str
    version: int
    report_data: dict
    changed_by: str
    changed_at: datetime
    change_reason: Optional[str]
    
    class Config:
        from_attributes = True


# ============================================================================
# Helper Functions
# ============================================================================

def create_history_entry(
    db: Session,
    report: Report,
    changed_by: str,
    change_reason: str
) -> ReportHistory:
    """Create a history entry for report changes"""
    report_data = {
        "report_id": report.report_id,
        "study_id": report.study_id,
        "patient_id": report.patient_id,
        "patient_name": report.patient_name,
        "template_id": report.template_id,
        "modality": report.modality,
        "body_part": report.body_part,
        "clinical_history": report.clinical_history,
        "technique": report.technique,
        "comparison": report.comparison,
        "findings": report.findings,
        "impression": report.impression,
        "recommendation": report.recommendation,
        "status": report.status,
        "signature_id": report.signature_id,
        "version": report.version
    }
    
    history = ReportHistory(
        report_id=report.report_id,
        version=report.version,
        report_data=report_data,
        changed_by=changed_by,
        change_reason=change_reason
    )
    
    db.add(history)
    db.commit()
    db.refresh(history)
    
    return history


def validate_status_transition(current_status: str, new_status: str) -> bool:
    """Validate if status transition is allowed"""
    valid_transitions = {
        'draft': ['preliminary', 'cancelled'],
        'preliminary': ['final', 'draft', 'cancelled'],
        'final': ['amended'],
        'amended': ['final']
    }
    
    return new_status in valid_transitions.get(current_status, [])


# ============================================================================
# API Endpoints
# ============================================================================

@router.post("/", response_model=ReportResponse, status_code=status.HTTP_201_CREATED)
def create_report(report: ReportCreate, db: Session = Depends(get_db)):
    """
    Create a new report
    
    - **study_id**: Study Instance UID
    - **patient_id**: Patient ID
    - **patient_name**: Patient Name
    - **template_id**: Report template ID
    - **findings**: Report findings (required)
    - **impression**: Report impression (required)
    - **created_by**: Username of creator
    """
    # Generate unique report ID
    report_id = f"RPT-{uuid.uuid4().hex[:12].upper()}"
    
    # Create report
    db_report = Report(
        report_id=report_id,
        **report.dict()
    )
    
    db.add(db_report)
    db.commit()
    db.refresh(db_report)
    
    # Create initial history entry
    create_history_entry(db, db_report, report.created_by, "Report created")
    
    return db_report


@router.get("/{report_id}", response_model=ReportResponse)
def get_report(
    report_id: str, 
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("report:view"))
):
    """
    Get report by ID
    
    - **report_id**: Report ID (e.g., RPT-ABC123DEF456)
    """
    report = db.query(Report).filter(
        Report.report_id == report_id,
        Report.deleted == False
    ).first()
    
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report {report_id} not found"
        )
    
    return report


@router.get("/study/{study_id}", response_model=List[ReportResponse])
def get_reports_by_study(study_id: str, db: Session = Depends(get_db)):
    """
    Get all reports for a study
    
    - **study_id**: Study Instance UID
    """
    reports = db.query(Report).filter(
        Report.study_id == study_id,
        Report.deleted == False
    ).order_by(Report.created_at.desc()).all()
    
    return reports


@router.put("/{report_id}", response_model=ReportResponse)
def update_report(
    report_id: str,
    report_update: ReportUpdate,
    db: Session = Depends(get_db)
):
    """
    Update report content
    
    - **report_id**: Report ID
    - **updated_by**: Username of updater
    
    Note: Cannot edit finalized reports
    """
    db_report = db.query(Report).filter(
        Report.report_id == report_id,
        Report.deleted == False
    ).first()
    
    if not db_report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report {report_id} not found"
        )
    
    if db_report.status == 'final':
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot edit finalized report. Create an amendment instead."
        )
    
    # Update fields
    update_data = report_update.dict(exclude_unset=True, exclude={'updated_by'})
    for field, value in update_data.items():
        setattr(db_report, field, value)

    db_report.updated_by = report_update.updated_by
    db_report.updated_at = datetime.utcnow()
    db_report.version += 1  # Increment version for each update

    # Create history entry BEFORE committing (so we can use the new version)
    create_history_entry(db, db_report, report_update.updated_by, "Report updated")

    db.commit()
    db.refresh(db_report)
    
    return db_report


@router.patch("/{report_id}/status", response_model=ReportResponse)
def update_report_status(
    report_id: str,
    status_update: ReportStatusUpdate,
    db: Session = Depends(get_db)
):
    """
    Update report status (workflow transition)
    
    - **report_id**: Report ID
    - **status**: New status (draft, preliminary, final, amended, cancelled)
    - **updated_by**: Username of updater
    
    Valid transitions:
    - draft → preliminary, cancelled
    - preliminary → final, draft, cancelled
    - final → amended
    - amended → final
    """
    db_report = db.query(Report).filter(
        Report.report_id == report_id,
        Report.deleted == False
    ).first()
    
    if not db_report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report {report_id} not found"
        )
    
    # Validate status transition
    if not validate_status_transition(db_report.status, status_update.status):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status transition from {db_report.status} to {status_update.status}"
        )
    
    # Update status
    db_report.status = status_update.status
    db_report.updated_by = status_update.updated_by
    db_report.updated_at = datetime.utcnow()
    db_report.version += 1  # Increment version for status change

    # Handle finalization
    if status_update.status == 'final':
        db_report.finalized_by = status_update.updated_by
        db_report.finalized_at = datetime.utcnow()

        if status_update.signature_id:
            db_report.signature_id = status_update.signature_id
            db_report.signature_method = status_update.signature_method
            db_report.signature_data = status_update.signature_data
            db_report.signature_timestamp = datetime.utcnow()

    # Create history entry BEFORE committing (so we can use the new version)
    create_history_entry(
        db,
        db_report,
        status_update.updated_by,
        f"Status changed to {status_update.status}"
    )

    db.commit()
    db.refresh(db_report)
    
    return db_report


@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_report(
    report_id: str,
    deleted_by: str = Query(..., description="Username of deleter"),
    db: Session = Depends(get_db)
):
    """
    Soft delete a report
    
    - **report_id**: Report ID
    - **deleted_by**: Username of deleter
    
    Note: Cannot delete finalized reports
    """
    db_report = db.query(Report).filter(
        Report.report_id == report_id,
        Report.deleted == False
    ).first()
    
    if not db_report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report {report_id} not found"
        )
    
    if db_report.status == 'final':
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete finalized report"
        )
    
    # Soft delete
    db_report.deleted = True
    db_report.deleted_at = datetime.utcnow()
    db_report.deleted_by = deleted_by
    
    db.commit()
    
    # Create history entry
    create_history_entry(db, db_report, deleted_by, "Report deleted")


@router.get("/", response_model=List[ReportResponse])
def search_reports(
    patient_id: Optional[str] = Query(None, description="Filter by patient ID"),
    status: Optional[str] = Query(None, description="Filter by status"),
    modality: Optional[str] = Query(None, description="Filter by modality"),
    created_by: Optional[str] = Query(None, description="Filter by creator"),
    from_date: Optional[datetime] = Query(None, description="Filter from date"),
    to_date: Optional[datetime] = Query(None, description="Filter to date"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of results"),
    offset: int = Query(0, ge=0, description="Number of results to skip"),
    db: Session = Depends(get_db)
):
    """
    Search reports with filters
    
    - **patient_id**: Filter by patient ID
    - **status**: Filter by status (draft, preliminary, final, etc.)
    - **modality**: Filter by modality (CT, MRI, etc.)
    - **created_by**: Filter by creator username
    - **from_date**: Filter reports created after this date
    - **to_date**: Filter reports created before this date
    - **limit**: Maximum number of results (default: 100, max: 1000)
    - **offset**: Number of results to skip (for pagination)
    """
    query = db.query(Report).filter(Report.deleted == False)
    
    # Apply filters
    if patient_id:
        query = query.filter(Report.patient_id == patient_id)
    if status:
        query = query.filter(Report.status == status)
    if modality:
        query = query.filter(Report.modality == modality)
    if created_by:
        query = query.filter(Report.created_by == created_by)
    if from_date:
        query = query.filter(Report.created_at >= from_date)
    if to_date:
        query = query.filter(Report.created_at <= to_date)
    
    # Execute query with pagination
    reports = query.order_by(Report.created_at.desc()).offset(offset).limit(limit).all()
    
    return reports


@router.get("/{report_id}/history", response_model=List[ReportHistoryResponse])
def get_report_history(report_id: str, db: Session = Depends(get_db)):
    """
    Get report history (all versions)
    
    - **report_id**: Report ID
    """
    # Check if report exists
    report = db.query(Report).filter(Report.report_id == report_id).first()
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report {report_id} not found"
        )
    
    # Get history
    history = db.query(ReportHistory).filter(
        ReportHistory.report_id == report_id
    ).order_by(ReportHistory.version.desc()).all()
    
    return history


@router.get("/stats/summary")
def get_report_stats(db: Session = Depends(get_db)):
    """
    Get report statistics summary
    
    Returns counts by status and recent activity
    """
    from sqlalchemy import func
    
    # Count by status
    status_counts = db.query(
        Report.status,
        func.count(Report.id).label('count')
    ).filter(
        Report.deleted == False
    ).group_by(Report.status).all()
    
    # Recent reports (last 7 days)
    from datetime import timedelta
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    recent_count = db.query(func.count(Report.id)).filter(
        Report.created_at >= seven_days_ago,
        Report.deleted == False
    ).scalar()
    
    # Total reports
    total_count = db.query(func.count(Report.id)).filter(
        Report.deleted == False
    ).scalar()
    
    return {
        "total_reports": total_count,
        "recent_reports_7d": recent_count,
        "by_status": {status: count for status, count in status_counts}
    }
