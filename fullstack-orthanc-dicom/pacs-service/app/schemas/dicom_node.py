from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class DicomNodeBase(BaseModel):
    name: str
    ae_title: str
    ip_address: str
    port: int
    description: Optional[str] = None
    is_active: Optional[bool] = True

class DicomNodeCreate(DicomNodeBase):
    pass

class DicomNodeUpdate(BaseModel):
    name: Optional[str] = None
    ae_title: Optional[str] = None
    ip_address: Optional[str] = None
    port: Optional[int] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

class DicomNode(DicomNodeBase):
    id: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class DicomEchoResult(BaseModel):
    success: bool
    message: str
    timestamp: datetime = Field(default_factory=datetime.now)
