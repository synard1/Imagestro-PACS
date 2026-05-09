from pydantic import BaseModel, ConfigDict
from uuid import UUID
from typing import List, Optional, Union, Dict, Any
from datetime import datetime


class ProductBase(BaseModel):
    name: str
    code: str
    tier: str = "free"
    description: Optional[str] = None
    price: float = 0.0
    currency: str = "IDR"
    billing_cycle: str = "monthly"
    max_users: Optional[int] = None
    max_storage_gb: Optional[int] = None
    max_api_calls_per_day: Optional[int] = None
    overage_storage_price: float = 0.0
    overage_api_price: float = 0.0
    features: List[str] = []
    spec: Dict[str, Any] = {}
    color: str = "#6b7280"
    is_featured: bool = False
    is_active: bool = True


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    billing_cycle: Optional[str] = None
    max_users: Optional[int] = None
    max_storage_gb: Optional[int] = None
    max_api_calls_per_day: Optional[int] = None
    overage_storage_price: Optional[float] = None
    overage_api_price: Optional[float] = None
    features: Optional[List[str]] = None
    spec: Optional[Dict[str, Any]] = None
    color: Optional[str] = None
    is_featured: Optional[bool] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


class ProductResponse(ProductBase):
    id: Union[str, UUID]
    sort_order: int = 0
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class ProductListResponse(BaseModel):
    items: List[ProductResponse]
    total: int


class SubscriptionBase(BaseModel):
    tenant_id: Union[str, UUID]
    product_id: Union[str, UUID]
    billing_email: Optional[str] = None
    billing_address: Optional[str] = None
    tax_id: Optional[str] = None
    trial_ends_at: Optional[datetime] = None
    started_at: datetime = datetime.utcnow()
    expires_at: Optional[datetime] = None
    auto_renew: bool = True
    notes: Optional[str] = None


class SubscriptionCreate(SubscriptionBase):
    pass


class SubscriptionUpdate(BaseModel):
    product_id: Optional[str] = None
    status: Optional[str] = None
    billing_email: Optional[str] = None
    billing_address: Optional[str] = None
    tax_id: Optional[str] = None
    expires_at: Optional[datetime] = None
    auto_renew: Optional[bool] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class SubscriptionResponse(SubscriptionBase):
    id: Union[str, UUID]
    status: str
    trial_started_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    renewal_at: Optional[datetime] = None
    is_active: bool = True
    created_at: datetime
    product: Optional[ProductResponse] = None
    tenant: Optional["TenantResponse"] = None
    model_config = ConfigDict(from_attributes=True)


class SubscriptionListResponse(BaseModel):
    items: List[SubscriptionResponse]
    total: int


class SubscriptionWithDetails(BaseModel):
    tenant_id: Union[str, UUID]
    tenant_name: str
    tenant_code: str
    product_name: str
    product_tier: str
    status: str
    started_at: datetime
    expires_at: Optional[datetime] = None
    auto_renew: bool = True
    max_users: Optional[int] = None
    max_storage_gb: Optional[int] = None
    max_api_calls_per_day: Optional[int] = None
    price: float = 0.0
    currency: str = "IDR"
    is_active: bool


class UsageResponse(BaseModel):
    tenant_id: Union[str, UUID]
    storage_bytes: int
    api_calls_today: int
    storage_limit_gb: Optional[int]
    api_limit_per_day: Optional[int]
    tier_name: str
    status: str


class FeatureFlagBase(BaseModel):
    feature_key: str
    is_enabled: bool = False


class FeatureFlagCreate(FeatureFlagBase):
    tenant_id: Union[str, UUID]


class FeatureFlagUpdate(BaseModel):
    is_enabled: Optional[bool] = None
    config: Optional[str] = None


class FeatureFlagResponse(FeatureFlagBase):
    id: Union[str, UUID]
    tenant_id: Union[str, UUID]
    feature_name: Optional[str] = None
    description: Optional[str] = None
    is_tier_override: bool = False
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class FeatureFlagListResponse(BaseModel):
    items: List[FeatureFlagResponse]
    total: int


from app.schemas.tenant import TenantResponse

SubscriptionResponse.model_rebuild()
