# Week 8 Day 2 - Report Backend Integration Plan

**Date**: November 16, 2025  
**Goal**: Integrate reporting system with backend database  
**Priority**: HIGH  
**Estimated Time**: 6-8 hours

---

## Overview

Currently, reports are stored in localStorage. We need to integrate with the backend database for:
- Persistent storage
- Multi-user access
- Report versioning
- Search and filtering
- Audit trail

---

## Architecture

```
Frontend (React)
       ↓
Report Service (API Client)
       ↓
FastAPI Backend
       ↓
PostgreSQL Database
```

---

## Implementation Steps

### Step 1: Database Schema (30 min)

Create migration file: `pacs-service/migrations/003_create_report_tables.sql`

```sql
-- Reports table
CREATE TABLE reports (
    id SERIAL PRIMARY KEY,
    report_id VARCHAR(50) UNIQUE NOT NULL,
    study_id VARCHAR(100) NOT NULL,
    patient_id VARCHAR(50) NOT NULL,
    patient_name VARCHAR(200) NOT NULL,
    
    -- Report content
    template_id VARCHAR(50) NOT NULL,
    modality VARCHAR(20),
    body_part VARCHAR(100),
    
    -- Report sections
    clinical_history TEXT,
    technique TEXT,
    comparison TEXT,
    findings TEXT NOT NULL,
    impression TEXT NOT NULL,
    recommendation TEXT,
    
    -- Workflow
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    -- draft, preliminary, final, amended, cancelled
    
    -- Metadata
    created_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(100),
    updated_at TIMESTAMP,
    finalized_by VARCHAR(100),
    finalized_at TIMESTAMP,
    
    -- Signature
    signature_id VARCHAR(100),
    signature_method VARCHAR(20),
    signature_data TEXT,
    signature_timestamp TIMESTAMP,
    
    -- Versioning
    version INTEGER NOT NULL DEFAULT 1,
    parent_report_id VARCHAR(50),
    
    -- Soft delete
    deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(100),
    
    CONSTRAINT fk_study FOREIGN KEY (study_id) REFERENCES studies(study_instance_uid),
    CONSTRAINT chk_status CHECK (status IN ('draft', 'preliminary', 'final', 'amended', 'cancelled'))
);

-- Report history table (for versioning)
CREATE TABLE report_history (
    id SERIAL PRIMARY KEY,
    report_id VARCHAR(50) NOT NULL,
    version INTEGER NOT NULL,
    
    -- Snapshot of report data
    report_data JSONB NOT NULL,
    
    -- Change tracking
    changed_by VARCHAR(100) NOT NULL,
    changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    change_reason TEXT,
    
    CONSTRAINT fk_report FOREIGN KEY (report_id) REFERENCES reports(report_id),
    UNIQUE (report_id, version)
);

-- Report attachments table
CREATE TABLE report_attachments (
    id SERIAL PRIMARY KEY,
    report_id VARCHAR(50) NOT NULL,
    attachment_type VARCHAR(50) NOT NULL,
    -- pdf, image, signature, qr_code
    
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size INTEGER,
    mime_type VARCHAR(100),
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100) NOT NULL,
    
    CONSTRAINT fk_report_attachment FOREIGN KEY (report_id) REFERENCES reports(report_id)
);

-- Indexes for performance
CREATE INDEX idx_reports_study_id ON reports(study_id);
CREATE INDEX idx_reports_patient_id ON reports(patient_id);
CREATE INDEX idx_reports_status ON reports(status);
CREATE INDEX idx_reports_created_at ON reports(created_at);
CREATE INDEX idx_reports_finalized_at ON reports(finalized_at);
CREATE INDEX idx_report_history_report_id ON report_history(report_id);
CREATE INDEX idx_report_attachments_report_id ON report_attachments(report_id);
```

### Step 2: SQLAlchemy Models (45 min)

Create: `pacs-service/app/models/report.py`

```python
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, CheckConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class Report(Base):
    __tablename__ = "reports"
    
    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(String(50), unique=True, nullable=False, index=True)
    study_id = Column(String(100), ForeignKey("studies.study_instance_uid"), nullable=False, index=True)
    patient_id = Column(String(50), nullable=False, index=True)
    patient_name = Column(String(200), nullable=False)
    
    # Report content
    template_id = Column(String(50), nullable=False)
    modality = Column(String(20))
    body_part = Column(String(100))
    
    # Report sections
    clinical_history = Column(Text)
    technique = Column(Text)
    comparison = Column(Text)
    findings = Column(Text, nullable=False)
    impression = Column(Text, nullable=False)
    recommendation = Column(Text)
    
    # Workflow
    status = Column(String(20), nullable=False, default='draft', index=True)
    
    # Metadata
    created_by = Column(String(100), nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    updated_by = Column(String(100))
    updated_at = Column(DateTime)
    finalized_by = Column(String(100))
    finalized_at = Column(DateTime, index=True)
    
    # Signature
    signature_id = Column(String(100))
    signature_method = Column(String(20))
    signature_data = Column(Text)
    signature_timestamp = Column(DateTime)
    
    # Versioning
    version = Column(Integer, nullable=False, default=1)
    parent_report_id = Column(String(50))
    
    # Soft delete
    deleted = Column(Boolean, default=False)
    deleted_at = Column(DateTime)
    deleted_by = Column(String(100))
    
    # Relationships
    study = relationship("Study", back_populates="reports")
    history = relationship("ReportHistory", back_populates="report", cascade="all, delete-orphan")
    attachments = relationship("ReportAttachment", back_populates="report", cascade="all, delete-orphan")
    
    __table_args__ = (
        CheckConstraint("status IN ('draft', 'preliminary', 'final', 'amended', 'cancelled')", name='chk_status'),
    )

class ReportHistory(Base):
    __tablename__ = "report_history"
    
    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(String(50), ForeignKey("reports.report_id"), nullable=False, index=True)
    version = Column(Integer, nullable=False)
    
    # Snapshot
    report_data = Column(JSONB, nullable=False)
    
    # Change tracking
    changed_by = Column(String(100), nullable=False)
    changed_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    change_reason = Column(Text)
    
    # Relationships
    report = relationship("Report", back_populates="history")

class ReportAttachment(Base):
    __tablename__ = "report_attachments"
    
    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(String(50), ForeignKey("reports.report_id"), nullable=False, index=True)
    attachment_type = Column(String(50), nullable=False)
    
    file_name = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_size = Column(Integer)
    mime_type = Column(String(100))
    
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    created_by = Column(String(100), nullable=False)
    
    # Relationships
    report = relationship("Report", back_populates="attachments")
```

### Step 3: FastAPI Endpoints (90 min)

Create: `pacs-service/app/api/reports.py`

```python
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import uuid

from app.database import get_db
from app.models.report import Report, ReportHistory, ReportAttachment
from pydantic import BaseModel

router = APIRouter(prefix="/api/reports", tags=["reports"])

# Pydantic schemas
class ReportCreate(BaseModel):
    study_id: str
    patient_id: str
    patient_name: str
    template_id: str
    modality: Optional[str] = None
    body_part: Optional[str] = None
    clinical_history: Optional[str] = None
    technique: Optional[str] = None
    comparison: Optional[str] = None
    findings: str
    impression: str
    recommendation: Optional[str] = None
    created_by: str

class ReportUpdate(BaseModel):
    clinical_history: Optional[str] = None
    technique: Optional[str] = None
    comparison: Optional[str] = None
    findings: Optional[str] = None
    impression: Optional[str] = None
    recommendation: Optional[str] = None
    updated_by: str

class ReportStatusUpdate(BaseModel):
    status: str
    updated_by: str
    signature_id: Optional[str] = None
    signature_method: Optional[str] = None
    signature_data: Optional[str] = None

class ReportResponse(BaseModel):
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
    
    class Config:
        from_attributes = True

# Endpoints
@router.post("/", response_model=ReportResponse, status_code=status.HTTP_201_CREATED)
def create_report(report: ReportCreate, db: Session = Depends(get_db)):
    """Create a new report"""
    report_id = f"RPT-{uuid.uuid4().hex[:12].upper()}"
    
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
def get_report(report_id: str, db: Session = Depends(get_db)):
    """Get report by ID"""
    report = db.query(Report).filter(
        Report.report_id == report_id,
        Report.deleted == False
    ).first()
    
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    return report

@router.get("/study/{study_id}", response_model=List[ReportResponse])
def get_reports_by_study(study_id: str, db: Session = Depends(get_db)):
    """Get all reports for a study"""
    reports = db.query(Report).filter(
        Report.study_id == study_id,
        Report.deleted == False
    ).order_by(Report.created_at.desc()).all()
    
    return reports

@router.put("/{report_id}", response_model=ReportResponse)
def update_report(report_id: str, report_update: ReportUpdate, db: Session = Depends(get_db)):
    """Update report content"""
    db_report = db.query(Report).filter(
        Report.report_id == report_id,
        Report.deleted == False
    ).first()
    
    if not db_report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    if db_report.status == 'final':
        raise HTTPException(status_code=400, detail="Cannot edit finalized report")
    
    # Update fields
    for field, value in report_update.dict(exclude_unset=True).items():
        if field != 'updated_by':
            setattr(db_report, field, value)
    
    db_report.updated_by = report_update.updated_by
    db_report.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(db_report)
    
    # Create history entry
    create_history_entry(db, db_report, report_update.updated_by, "Report updated")
    
    return db_report

@router.patch("/{report_id}/status", response_model=ReportResponse)
def update_report_status(report_id: str, status_update: ReportStatusUpdate, db: Session = Depends(get_db)):
    """Update report status (draft → preliminary → final)"""
    db_report = db.query(Report).filter(
        Report.report_id == report_id,
        Report.deleted == False
    ).first()
    
    if not db_report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    # Validate status transition
    valid_transitions = {
        'draft': ['preliminary', 'cancelled'],
        'preliminary': ['final', 'draft', 'cancelled'],
        'final': ['amended'],
        'amended': ['final']
    }
    
    if status_update.status not in valid_transitions.get(db_report.status, []):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status transition from {db_report.status} to {status_update.status}"
        )
    
    db_report.status = status_update.status
    db_report.updated_by = status_update.updated_by
    db_report.updated_at = datetime.utcnow()
    
    if status_update.status == 'final':
        db_report.finalized_by = status_update.updated_by
        db_report.finalized_at = datetime.utcnow()
        
        if status_update.signature_id:
            db_report.signature_id = status_update.signature_id
            db_report.signature_method = status_update.signature_method
            db_report.signature_data = status_update.signature_data
            db_report.signature_timestamp = datetime.utcnow()
    
    db.commit()
    db.refresh(db_report)
    
    # Create history entry
    create_history_entry(db, db_report, status_update.updated_by, f"Status changed to {status_update.status}")
    
    return db_report

@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_report(report_id: str, deleted_by: str, db: Session = Depends(get_db)):
    """Soft delete a report"""
    db_report = db.query(Report).filter(
        Report.report_id == report_id,
        Report.deleted == False
    ).first()
    
    if not db_report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    if db_report.status == 'final':
        raise HTTPException(status_code=400, detail="Cannot delete finalized report")
    
    db_report.deleted = True
    db_report.deleted_at = datetime.utcnow()
    db_report.deleted_by = deleted_by
    
    db.commit()
    
    # Create history entry
    create_history_entry(db, db_report, deleted_by, "Report deleted")

@router.get("/", response_model=List[ReportResponse])
def search_reports(
    patient_id: Optional[str] = None,
    status: Optional[str] = None,
    modality: Optional[str] = None,
    created_by: Optional[str] = None,
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    """Search reports with filters"""
    query = db.query(Report).filter(Report.deleted == False)
    
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
    
    reports = query.order_by(Report.created_at.desc()).offset(offset).limit(limit).all()
    
    return reports

# Helper function
def create_history_entry(db: Session, report: Report, changed_by: str, change_reason: str):
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
```

### Step 4: Frontend Service (60 min)

Update: `src/services/reportService.js`

```javascript
import { apiClient } from './http';

const API_BASE = '/api/reports';

/**
 * Report Service
 * Handles all report-related API calls
 */

export const reportService = {
  /**
   * Create a new report
   */
  async createReport(reportData) {
    try {
      const response = await apiClient.post(API_BASE, reportData);
      return { success: true, data: response.data };
    } catch (error) {
      console.error('[ReportService] Create failed:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Get report by ID
   */
  async getReport(reportId) {
    try {
      const response = await apiClient.get(`${API_BASE}/${reportId}`);
      return { success: true, data: response.data };
    } catch (error) {
      console.error('[ReportService] Get failed:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Get all reports for a study
   */
  async getReportsByStudy(studyId) {
    try {
      const response = await apiClient.get(`${API_BASE}/study/${studyId}`);
      return { success: true, data: response.data };
    } catch (error) {
      console.error('[ReportService] Get by study failed:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Update report content
   */
  async updateReport(reportId, reportData) {
    try {
      const response = await apiClient.put(`${API_BASE}/${reportId}`, reportData);
      return { success: true, data: response.data };
    } catch (error) {
      console.error('[ReportService] Update failed:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Update report status
   */
  async updateReportStatus(reportId, statusData) {
    try {
      const response = await apiClient.patch(`${API_BASE}/${reportId}/status`, statusData);
      return { success: true, data: response.data };
    } catch (error) {
      console.error('[ReportService] Status update failed:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Delete report (soft delete)
   */
  async deleteReport(reportId, deletedBy) {
    try {
      await apiClient.delete(`${API_BASE}/${reportId}`, {
        params: { deleted_by: deletedBy }
      });
      return { success: true };
    } catch (error) {
      console.error('[ReportService] Delete failed:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Search reports
   */
  async searchReports(filters = {}) {
    try {
      const response = await apiClient.get(API_BASE, { params: filters });
      return { success: true, data: response.data };
    } catch (error) {
      console.error('[ReportService] Search failed:', error);
      return { success: false, error: error.message };
    }
  }
};

export default reportService;
```

### Step 5: Update ReportEditor Component (90 min)

Update `src/pages/reporting/ReportEditor.jsx` to use backend API instead of localStorage.

Key changes:
1. Replace localStorage save with API call
2. Load report from API on mount
3. Auto-save draft every 30 seconds
4. Handle status transitions via API
5. Show save status indicator

### Step 6: Testing (60 min)

1. **Unit Tests**: Test API endpoints
2. **Integration Tests**: Test full workflow
3. **Manual Tests**: Test UI integration

---

## Success Criteria

- [ ] Database migration runs successfully
- [ ] All API endpoints working
- [ ] Frontend can create/read/update reports
- [ ] Status transitions work correctly
- [ ] Report versioning functional
- [ ] Search and filtering work
- [ ] Auto-save working
- [ ] No data loss during transitions

---

## Rollback Plan

If issues occur:
1. Disable backend integration in `.env`
2. Revert to localStorage mode
3. Fix issues
4. Re-enable backend

---

## Timeline

| Task | Duration | Status |
|------|----------|--------|
| Database Schema | 30 min | ⏳ |
| SQLAlchemy Models | 45 min | ⏳ |
| FastAPI Endpoints | 90 min | ⏳ |
| Frontend Service | 60 min | ⏳ |
| Update ReportEditor | 90 min | ⏳ |
| Testing | 60 min | ⏳ |
| **Total** | **6 hours** | ⏳ |

---

**Next**: Start with database schema creation
