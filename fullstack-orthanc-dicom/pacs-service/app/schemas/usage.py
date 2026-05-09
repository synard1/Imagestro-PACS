from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime


class UsageRecordBase(BaseModel):
    tenant_id: str
    date: Optional[datetime] = None
    period: str = "daily"
    api_calls: int = 0
    api_calls_limit: Optional[int] = None
    storage_bytes: int = 0
    storage_bytes_limit: Optional[int] = None
    active_users: int = 0
    user_limit: Optional[int] = None


class UsageRecordCreate(UsageRecordBase):
    pass


class UsageRecordResponse(UsageRecordBase):
    id: str
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class UsageRecordListResponse(BaseModel):
    items: List[UsageRecordResponse]
    total: int


class UsageAlertBase(BaseModel):
    tenant_id: str
    alert_type: str
    threshold_percent: int = 80


class UsageAlertCreate(UsageAlertBase):
    pass


class UsageAlertUpdate(BaseModel):
    is_enabled: Optional[bool] = None


class UsageAlertResponse(UsageAlertBase):
    id: str
    is_enabled: bool = True
    is_triggered: bool = False
    triggered_at: Optional[datetime] = None
    acknowledged_at: Optional[datetime] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class UsageAlertListResponse(BaseModel):
    items: List[UsageAlertResponse]
    total: int


class UsageSummary(BaseModel):
    tenant_id: str
    tier_name: str = "Free"

    # Current usage
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

    # Status
    is_over_limit: bool = False
    status: str = "active"


class UsageTrend(BaseModel):
    date: str
    api_calls: int = 0
    storage_bytes: int = 0
    active_users: int = 0


class UsageAnalytics(BaseModel):
    tenant_id: str
    period_start: datetime
    period_end: datetime

    # Totals
    total_api_calls: int = 0
    avg_api_calls_per_day: float = 0.0
    total_storage_bytes: int = 0
    peak_storage_bytes: int = 0
    avg_active_users: float = 0.0
    peak_users: int = 0

    # Trends
    api_trend: List[UsageTrend] = []
    storage_trend: List[UsageTrend] = []
    user_trend: List[UsageTrend] = []

    # Comparison
    previous_period_total_api_calls: int = 0
    period_over_period_change: float = 0.0


class BillingEventBase(BaseModel):
    tenant_id: str
    event_type: str
    payload: dict = {}


class BillingEventCreate(BillingEventBase):
    subscription_id: Optional[str] = None


class BillingEventResponse(BillingEventBase):
    id: str
    subscription_id: Optional[str] = None
    webhook_url: Optional[str] = None
    webhook_attempts: int = 0
    is_delivered: bool = False
    delivered_at: Optional[datetime] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class BillingEventListResponse(BaseModel):
    items: List[BillingEventResponse]
    total: int
