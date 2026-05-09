from sqlalchemy.orm import Session
from app.models.billing import Invoice, InvoiceItem, Payment, Discount
from app.models.tenant import Tenant
from app.models.subscription import Subscription
from datetime import datetime, timedelta
import uuid

class BillingService:
    @staticmethod
    def calculate_invoice_totals(items, tax_rate=11.0, discount_amount=0.0):
        """Calculate subtotal, tax, and grand total for an invoice"""
        subtotal = sum(item.total for item in items)
        taxable_amount = max(0, subtotal - discount_amount)
        tax_amount = (taxable_amount * tax_rate) / 100
        grand_total = taxable_amount + tax_amount
        
        return {
            "subtotal": subtotal,
            "tax_amount": tax_amount,
            "grand_total": grand_total
        }

    @staticmethod
    def create_invoice(db: Session, tenant_id: str, items_data: list, subscription_id: str = None, 
                       due_days: int = 7, tax_rate: float = 11.0, discount_code: str = None):
        """Create a new invoice with line items"""
        # Generate unique invoice number
        timestamp = datetime.utcnow().strftime("%Y%m%d%H%M")
        invoice_number = f"INV-{timestamp}-{str(uuid.uuid4())[:8].upper()}"
        
        # Calculate discount if code provided
        discount_amount = 0.0
        if discount_code:
            discount = db.query(Discount).filter(Discount.code == discount_code, Discount.is_active == True).first()
            if discount:
                # Basic implementation: assuming discount applies to whole subtotal
                temp_subtotal = sum(d['unit_price'] * d.get('quantity', 1) for d in items_data)
                if discount.type == "percentage":
                    discount_amount = (temp_subtotal * discount.value) / 100
                else:
                    discount_amount = min(temp_subtotal, discount.value)
                
                discount.usage_count += 1

        # Create Invoice header
        db_invoice = Invoice(
            tenant_id=tenant_id,
            subscription_id=subscription_id,
            invoice_number=invoice_number,
            issue_date=datetime.utcnow(),
            due_date=datetime.utcnow() + timedelta(days=due_days),
            status="unpaid",
            tax_rate=tax_rate,
            discount_amount=discount_amount,
            currency="IDR"
        )
        
        db.add(db_invoice)
        db.flush()  # Get ID

        # Create Invoice Items
        items = []
        for item_data in items_data:
            qty = item_data.get('quantity', 1)
            price = item_data.get('unit_price', 0.0)
            total = qty * price
            
            db_item = InvoiceItem(
                invoice_id=db_invoice.id,
                description=item_data['description'],
                quantity=qty,
                unit_price=price,
                total=total,
                meta_data=item_data.get('meta_data', {})
            )
            db.add(db_item)
            items.append(db_item)

        # Final totals calculation
        totals = BillingService.calculate_invoice_totals(items, tax_rate, discount_amount)
        db_invoice.subtotal = totals['subtotal']
        db_invoice.tax_amount = totals['tax_amount']
        db_invoice.grand_total = totals['grand_total']

        db.commit()
        db.refresh(db_invoice)
        return db_invoice

    @staticmethod
    def record_payment(db: Session, invoice_id: str, amount: float, method: str, ref_number: str = None):
        """Record a payment against an invoice"""
        invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
        if not invoice:
            raise Exception("Invoice not found")
            
        payment = Payment(
            invoice_id=invoice_id,
            tenant_id=invoice.tenant_id,
            amount=amount,
            payment_method=method,
            reference_number=ref_number,
            status="completed",
            payment_date=datetime.utcnow()
        )
        db.add(payment)
        
        # Check if fully paid
        total_paid = sum(p.amount for p in invoice.payments) + amount
        if total_paid >= invoice.grand_total:
            invoice.status = "paid"
            invoice.paid_at = datetime.utcnow()
            
        db.commit()
        db.refresh(invoice)
        return payment
