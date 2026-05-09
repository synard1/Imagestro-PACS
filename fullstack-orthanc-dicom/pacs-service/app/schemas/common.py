"""
Common Schemas
Shared Pydantic models
"""

from pydantic import BaseModel, Field
from typing import Optional, Any, List, Generic, TypeVar
from datetime import datetime


class HealthResponse(BaseModel):
    """Health check response"""
    status: str = Field(..., description="Service status")
    service: str = Field(..., description="Service name")
    version: str = Field(..., description="Service version")
    database: str = Field(..., description="Database status")
    orthanc: str = Field(..., description="Orthanc status")
    timestamp: datetime = Field(..., description="Check timestamp")


class ErrorResponse(BaseModel):
    """Error response"""
    status: str = Field(default="error", description="Status")
    error_code: str = Field(..., description="Error code")
    message: str = Field(..., description="Error message")
    details: Optional[dict] = Field(None, description="Additional details")


T = TypeVar('T')


class PaginatedResponse(BaseModel, Generic[T]):
    """Paginated response"""
    status: str = Field(default="success")
    data: List[T] = Field(..., description="Data items")
    count: int = Field(..., description="Number of items in this page")
    page: int = Field(..., description="Current page number")
    page_size: int = Field(..., description="Page size")
    total: int = Field(..., description="Total number of items")
    total_pages: int = Field(..., description="Total number of pages")


class SuccessResponse(BaseModel):
    """Generic success response"""
    status: str = Field(default="success")
    message: str = Field(..., description="Success message")
    data: Optional[Any] = Field(None, description="Response data")
