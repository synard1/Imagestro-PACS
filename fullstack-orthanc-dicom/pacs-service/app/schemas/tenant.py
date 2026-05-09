from pydantic import BaseModel, ConfigDict
from typing import List, Optional, Union
from datetime import datetime
from uuid import UUID


class TenantBase(BaseModel):
    name: str
    code: str
    type: str = "hospital"
    address: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None
    country: str = "Indonesia"
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    contact_person: Optional[str] = None
    contact_email: Optional[str] = None
    tax_id: Optional[str] = None
    external_system_code: Optional[str] = None
    satusehat_org_id: Optional[str] = None
    irc_id: Optional[str] = None


class TenantCreate(TenantBase):
    settings: dict = {}


class TenantUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None
    country: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    contact_person: Optional[str] = None
    contact_email: Optional[str] = None
    tax_id: Optional[str] = None
    external_system_code: Optional[str] = None
    satusehat_org_id: Optional[str] = None
    irc_id: Optional[str] = None
    settings: Optional[dict] = None
    is_active: Optional[bool] = None
    is_verified: Optional[bool] = None


class TenantResponse(TenantBase):
    id: Union[str, UUID]
    settings: dict = {}
    is_active: bool = True
    is_verified: bool = False
    verification_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    
    # Statistics
    study_count: int = 0
    storage_used_gb: float = 0.0
    user_count: int = 0
    
    model_config = ConfigDict(from_attributes=True)


class TenantListResponse(BaseModel):
    items: List[TenantResponse]
    total: int


class TenantWithSubscription(BaseModel):
    subscription: Optional["SubscriptionResponse"] = None
    current_usage: Optional["UsageSummary"] = None
    model_config = ConfigDict(from_attributes=True)


class UsageSummary(BaseModel):
    tenant_id: Union[str, UUID]
    tier_name: str = "Free"
    api_calls_today: int = 0
    api_limit: Optional[int] = None
    api_percent: float = 0.0
    storage_bytes: int = 0
    storage_gb: float = 0.0
    storage_limit_gb: Optional[int] = None
    storage_percent: float = 0.0
    active_users: int = 0
    user_limit: Optional[int] = None
    user_percent: float = 0.0
    is_over_limit: bool = False
    status: str = "active"


class InvitationCreate(BaseModel):
    email: str
    role: str = "ADMIN"


class InvitationResponse(BaseModel):
    id: Union[str, UUID]
    tenant_id: Union[str, UUID]
    email: str
    role: str
    token: str
    expires_at: Optional[datetime] = None
    is_used: bool = False
    created_at: datetime


from app.schemas.subscription import SubscriptionResponse

TenantWithSubscription.model_rebuild()
