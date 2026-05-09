from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.models.billing import Invoice, Payment, Discount
from app.schemas.billing import (
    InvoiceResponse,
    InvoiceListResponse,
    InvoiceCreate,
    InvoiceUpdate,
    PaymentResponse,
    PaymentCreate,
    DiscountResponse,
    DiscountCreate,
    DiscountListResponse
)
from app.services.invoice_generator import BillingService
from app.middleware.auth import get_current_user
from app.middleware.rbac import require_permission
import uuid
from datetime import datetime

router = APIRouter(prefix="/api/billing", tags=["billing"])

@router.get("/invoices", response_model=InvoiceListResponse)
async def list_invoices(
    tenant_id: Optional[str] = None,
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("billing:view")),
):
    # RBAC: Tenants only see their own invoices
    target_tenant_id = tenant_id
    if current_user.get("role") != "SUPERADMIN":
        user_tenant_id = current_user.get("tenant_id")
        if not user_tenant_id:
            raise HTTPException(status_code=403, detail="Access denied")
        target_tenant_id = user_tenant_id

    query = db.query(Invoice)
    if target_tenant_id:
        query = query.filter(Invoice.tenant_id == target_tenant_id)
    if status:
        query = query.filter(Invoice.status == status)

    total = query.count()
    items = query.order_by(Invoice.issue_date.desc()).offset((page - 1) * limit).limit(limit).all()
    
    return {"items": items, "total": total}

@router.get("/invoices/{id}", response_model=InvoiceResponse)
async def get_invoice(
    id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("billing:view")),
):
    invoice = db.query(Invoice).filter(Invoice.id == id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
        
    # RBAC check
    if current_user.get("role") != "SUPERADMIN" and invoice.tenant_id != current_user.get("tenant_id"):
        raise HTTPException(status_code=403, detail="Access denied")
        
    return invoice

@router.post("/invoices", response_model=InvoiceResponse)
async def create_invoice(
    invoice_data: InvoiceCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("billing:manage")),
):
    # Billing management required for creation
    return BillingService.create_invoice(
        db, 
        tenant_id=str(invoice_data.tenant_id),
        items_data=[item.model_dump() for item in invoice_data.items],
        subscription_id=str(invoice_data.subscription_id) if invoice_data.subscription_id else None,
        tax_rate=invoice_data.tax_rate
    )

@router.post("/payments", response_model=PaymentResponse)
async def record_payment(
    payment_data: PaymentCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("billing:manage")),
):
    try:
        return BillingService.record_payment(
            db,
            invoice_id=str(payment_data.invoice_id),
            amount=payment_data.amount,
            method=payment_data.payment_method,
            ref_number=payment_data.reference_number
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/discounts", response_model=DiscountListResponse)
async def list_discounts(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("billing:view")),
):
    discounts = db.query(Discount).all()
    return {"items": discounts, "total": len(discounts)}

@router.post("/discounts", response_model=DiscountResponse)
async def create_discount(
    discount_data: DiscountCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("billing:manage")),
):
    db_discount = Discount(**discount_data.model_dump())
    db.add(db_discount)
    db.commit()
    db.refresh(db_discount)
    return db_discount
