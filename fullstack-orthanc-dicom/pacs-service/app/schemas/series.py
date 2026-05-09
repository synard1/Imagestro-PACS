"""
Series Schemas
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class SeriesBase(BaseModel):
    """Base Series schema"""
    series_instance_uid: str
    study_instance_uid: str
    series_number: Optional[int] = None
    series_description: Optional[str] = None
    modality: Optional[str] = None
    body_part_examined: Optional[str] = None


class SeriesResponse(SeriesBase):
    """Series response schema"""
    number_of_instances: int = 0
    storage_size: int = 0
    orthanc_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True
