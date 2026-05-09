"""
Report Schemas
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from uuid import UUID


class ReportBase(BaseModel):
    """Base Report schema"""
    study_instance_uid: str
    report_type: str = "RADIOLOGY"
    report_title: Optional[str] = None
    clinical_indication: Optional[str] = None
    findings: Optional[str] = None
    impression: Optional[str] = None
    recommendations: Optional[str] = None


class ReportCreate(ReportBase):
    """Create Report schema"""
    pass


class ReportUpdate(BaseModel):
    """Update Report schema"""
    report_title: Optional[str] = None
    clinical_indication: Optional[str] = None
    findings: Optional[str] = None
    impression: Optional[str] = None
    recommendations: Optional[str] = None
    report_status: Optional[str] = None


class ReportResponse(ReportBase):
    """Report response schema"""
    id: UUID
    order_id: Optional[UUID] = None
    report_status: str
    reporting_physician: Optional[str] = None
    reported_at: Optional[datetime] = None
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True
