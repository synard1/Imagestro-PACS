from pydantic import BaseModel, ConfigDict
from uuid import UUID
from typing import List, Optional, Union, Dict, Any
from datetime import datetime

class InvoiceItemBase(BaseModel):
    description: str
    quantity: int = 1
    unit_price: float = 0.0
    total: float = 0.0
    meta_data: Dict[str, Any] = {}

class InvoiceItemCreate(InvoiceItemBase):
    pass

class InvoiceItemResponse(InvoiceItemBase):
    id: Union[str, UUID]
    invoice_id: Union[str, UUID]
    model_config = ConfigDict(from_attributes=True)

class InvoiceBase(BaseModel):
    tenant_id: Union[str, UUID]
    subscription_id: Optional[Union[str, UUID]] = None
    invoice_number: str
    issue_date: datetime = datetime.utcnow()
    due_date: datetime
    status: str = "unpaid"
    subtotal: float = 0.0
    tax_rate: float = 11.0
    tax_amount: float = 0.0
    discount_amount: float = 0.0
    grand_total: float = 0.0
    currency: str = "IDR"
    notes: Optional[str] = None

class InvoiceCreate(InvoiceBase):
    items: List[InvoiceItemCreate]

class InvoiceUpdate(BaseModel):
    status: Optional[str] = None
    due_date: Optional[datetime] = None
    notes: Optional[str] = None
    paid_at: Optional[datetime] = None
    voided_at: Optional[datetime] = None

class PaymentBase(BaseModel):
    invoice_id: Union[str, UUID]
    tenant_id: Union[str, UUID]
    amount: float
    currency: str = "IDR"
    payment_method: str
    reference_number: Optional[str] = None
    notes: Optional[str] = None
    payment_date: datetime = datetime.utcnow()

class PaymentCreate(PaymentBase):
    pass

class PaymentResponse(PaymentBase):
    id: Union[str, UUID]
    status: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class InvoiceResponse(InvoiceBase):
    id: Union[str, UUID]
    paid_at: Optional[datetime] = None
    voided_at: Optional[datetime] = None
    pdf_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    items: List[InvoiceItemResponse] = []
    payments: List[PaymentResponse] = []
    model_config = ConfigDict(from_attributes=True)

class InvoiceListResponse(BaseModel):
    items: List[InvoiceResponse]
    total: int

class DiscountBase(BaseModel):
    code: str
    description: Optional[str] = None
    type: str = "percentage"
    value: float
    is_active: bool = True
    valid_from: datetime = datetime.utcnow()
    valid_until: Optional[datetime] = None
    usage_limit: Optional[int] = None

class DiscountCreate(DiscountBase):
    pass

class DiscountResponse(DiscountBase):
    id: Union[str, UUID]
    usage_count: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class DiscountListResponse(BaseModel):
    items: List[DiscountResponse]
    total: int
