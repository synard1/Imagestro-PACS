"""
Study Schemas
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import date, time, datetime
from uuid import UUID


class StudyBase(BaseModel):
    """Base Study schema"""
    study_instance_uid: str = Field(..., description="Study Instance UID")
    study_id: Optional[str] = Field(None, description="Study ID")
    study_date: Optional[date] = Field(None, description="Study date")
    study_time: Optional[time] = Field(None, description="Study time")
    study_description: Optional[str] = Field(None, description="Study description")
    accession_number: Optional[str] = Field(None, description="Accession number")
    patient_id: Optional[UUID] = Field(None, description="Patient ID")
    patient_name: Optional[str] = Field(None, description="Patient name")
    patient_birth_date: Optional[date] = Field(None, description="Patient birth date")
    patient_gender: Optional[str] = Field(None, description="Patient gender")
    patient_medical_record_number: Optional[str] = Field(None, description="Patient medical record number")
    order_id: Optional[UUID] = Field(None, description="Order ID")
    referring_physician: Optional[str] = Field(None, description="Referring physician")
    modality: Optional[str] = Field(None, description="Modality")


class StudyCreate(StudyBase):
    """Create Study schema"""
    orthanc_id: Optional[str] = Field(None, description="Orthanc ID")


class StudyResponse(StudyBase):
    """Study response schema"""
    number_of_series: int = Field(0, description="Number of series")
    number_of_instances: int = Field(0, description="Number of instances")
    storage_size: int = Field(0, description="Storage size in bytes")
    orthanc_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    deleted_at: Optional[datetime] = None
    archived_at: Optional[datetime] = None
    thumbnail_series_uid: Optional[str] = None
    thumbnail_instance_uid: Optional[str] = None

    class Config:

        from_attributes = True


class StudyList(BaseModel):
    """Study list item (minimal info)"""
    study_instance_uid: str
    study_date: Optional[date] = None
    study_description: Optional[str] = None
    accession_number: Optional[str] = None
    patient_name: Optional[str] = None
    modality: Optional[str] = None
    number_of_series: int = 0
    number_of_instances: int = 0
    thumbnail_series_uid: Optional[str] = None
    thumbnail_instance_uid: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True
