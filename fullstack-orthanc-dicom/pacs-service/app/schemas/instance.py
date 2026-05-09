"""
Instance Schemas
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class InstanceBase(BaseModel):
    """Base Instance schema"""
    sop_instance_uid: str
    series_instance_uid: str
    instance_number: Optional[int] = None
    sop_class_uid: Optional[str] = None


class InstanceResponse(InstanceBase):
    """Instance response schema"""
    transfer_syntax_uid: Optional[str] = None
    file_size: Optional[int] = None
    file_path: Optional[str] = None
    orthanc_id: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True
