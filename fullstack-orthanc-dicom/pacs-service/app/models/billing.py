from sqlalchemy import Column, String, Integer, Boolean, ForeignKey, DateTime, Float, Text, JSON
from sqlalchemy.orm import relationship
from app.database import Base
import uuid
from datetime import datetime

class Invoice(Base):
    """Billing invoices for tenants"""
    __tablename__ = "invoices"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String, ForeignKey("tenants.id"), nullable=False)
    subscription_id = Column(String, ForeignKey("subscriptions.id"))
    
    invoice_number = Column(String, unique=True, nullable=False, index=True)
    status = Column(String, default="unpaid")  # draft, unpaid, paid, overdue, void
    
    issue_date = Column(DateTime, default=datetime.utcnow)
    due_date = Column(DateTime)
    paid_at = Column(DateTime, nullable=True)
    voided_at = Column(DateTime, nullable=True)
    
    subtotal = Column(Float, default=0.0)
    tax_rate = Column(Float, default=11.0)  # PPN 11% or 12%
    tax_amount = Column(Float, default=0.0)
    discount_amount = Column(Float, default=0.0)
    grand_total = Column(Float, default=0.0)
    
    currency = Column(String, default="IDR")
    notes = Column(Text)
    pdf_url = Column(String, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    tenant = relationship("Tenant", back_populates="invoices")
    subscription = relationship("Subscription", back_populates="invoices")
    items = relationship("InvoiceItem", back_populates="invoice", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="invoice")

class InvoiceItem(Base):
    """Line items for an invoice"""
    __tablename__ = "invoice_items"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    invoice_id = Column(String, ForeignKey("invoices.id"), nullable=False)
    
    description = Column(String, nullable=False)
    quantity = Column(Integer, default=1)
    unit_price = Column(Float, default=0.0)
    total = Column(Float, default=0.0)
    
    meta_data = Column(JSON, default=dict)  # e.g., {'type': 'subscription', 'period': '2026-04'}

    invoice = relationship("Invoice", back_populates="items")

class Payment(Base):
    """Payment records for invoices"""
    __tablename__ = "payments"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    invoice_id = Column(String, ForeignKey("invoices.id"), nullable=False)
    tenant_id = Column(String, ForeignKey("tenants.id"), nullable=False)
    
    amount = Column(Float, nullable=False)
    currency = Column(String, default="IDR")
    payment_method = Column(String)  # bank_transfer, va, credit_card, manual
    status = Column(String, default="completed")  # pending, completed, failed, refunded
    
    reference_number = Column(String)  # VA number or Transaction ID
    payment_date = Column(DateTime, default=datetime.utcnow)
    notes = Column(Text)
    
    created_at = Column(DateTime, default=datetime.utcnow)

    invoice = relationship("Invoice", back_populates="payments")

class Discount(Base):
    """Discount codes and promotions"""
    __tablename__ = "discounts"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    code = Column(String, unique=True, nullable=False, index=True)
    description = Column(String)
    
    type = Column(String, default="percentage")  # percentage, fixed
    value = Column(Float, nullable=False)
    
    is_active = Column(Boolean, default=True)
    valid_from = Column(DateTime, default=datetime.utcnow)
    valid_until = Column(DateTime, nullable=True)
    
    usage_limit = Column(Integer, nullable=True)
    usage_count = Column(Integer, default=0)

    created_at = Column(DateTime, default=datetime.utcnow)
