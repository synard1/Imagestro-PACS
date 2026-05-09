import logging
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from app.models.subscription import Subscription, Product
from app.models.billing import Invoice, InvoiceItem
from app.services.invoice_generator import BillingService
from app.services.usage_service import UsageService
import uuid

logger = logging.getLogger(__name__)

class SubscriptionManager:
    @staticmethod
    def process_daily_lifecycle(db: Session):
        """Main entry point for daily subscription maintenance"""
        logger.info("Starting daily subscription lifecycle processing")

        # 1. Check for expiring subscriptions and generate invoices (H-7)
        SubscriptionManager.generate_renewal_invoices(db)

        # 2. Check for overdue invoices and update subscription status
        SubscriptionManager.enforce_billing_policies(db)

        # 3. Handle expired subscriptions
        SubscriptionManager.handle_expirations(db)

    @staticmethod
    def generate_renewal_invoices(db: Session, days_notice: int = 7):
        """Generate invoices for subscriptions expiring in X days"""
        target_date = (datetime.utcnow() + timedelta(days=days_notice)).date()

        # Find active subscriptions expiring soon that don't have a draft/unpaid invoice yet
        expiring_subs = db.query(Subscription).filter(
            Subscription.status == "active",
            Subscription.auto_renew == True,
            Subscription.is_active == True
        ).all()

        for sub in expiring_subs:
            if sub.expires_at and sub.expires_at.date() == target_date:
                # Check if an invoice for the next period already exists
                existing_invoice = db.query(Invoice).filter(
                    Invoice.subscription_id == sub.id,
                    Invoice.status.in_(["unpaid", "paid", "overdue"]),
                    Invoice.issue_date >= datetime.utcnow() - timedelta(days=30) # Simple check
                ).first()

                if not existing_invoice:
                    logger.info(f"Generating renewal invoice for tenant {sub.tenant_id}, subscription {sub.id}")

                    # Create items based on the product
                    items_data = [
                        {
                            "description": f"Subscription Renewal: {sub.product.name} (Period renewal)",
                            "quantity": 1,
                            "unit_price": sub.product.price,
                            "meta_data": {"type": "renewal", "product_id": sub.product_id}
                        }
                    ]
                    
                    # 1b. Check for Overages from PREVIOUS month
                    last_month_dt = datetime.utcnow() - timedelta(days=15) # middle of last month to be safe
                    overage_items = UsageService.calculate_monthly_overage(
                        db, sub.tenant_id, last_month_dt.month, last_month_dt.year
                    )
                    if overage_items:
                        items_data.extend(overage_items)

                    try:
                        BillingService.create_invoice(
                            db,
                            tenant_id=sub.tenant_id,
                            items_data=items_data,
                            subscription_id=sub.id,
                            due_days=days_notice,
                            tax_rate=11.0 # Default PPN
                        )
                    except Exception as e:
                        logger.error(f"Failed to generate renewal invoice for {sub.id}: {str(e)}")

    @staticmethod
    def enforce_billing_policies(db: Session):
        """Check for overdue invoices and transition subscription states"""
        now = datetime.utcnow()

        # Find unpaid/overdue invoices
        unpaid_invoices = db.query(Invoice).filter(
            Invoice.status.in_(["unpaid", "overdue"])
        ).all()

        for inv in unpaid_invoices:
            if not inv.due_date:
                continue

            # Transition invoice to overdue if past due date
            if inv.status == "unpaid" and inv.due_date < now:
                inv.status = "overdue"
                db.commit()

            # Update associated subscription status
            if inv.subscription_id:
                sub = db.query(Subscription).filter(Subscription.id == inv.subscription_id).first()
                if not sub or sub.status == "cancelled":
                    continue

                days_overdue = (now - inv.due_date).days

                if days_overdue >= 8:
                    # Suspension (H+8)
                    if sub.status != "suspended":
                        logger.warning(f"Suspending subscription {sub.id} due to 8+ days overdue invoice")
                        sub.status = "suspended"
                        sub.is_active = False
                elif days_overdue >= 1:
                    # Grace Period (H+1 to H+7)
                    if sub.status != "past_due":
                        logger.info(f"Setting subscription {sub.id} to past_due")
                        sub.status = "past_due"

        db.commit()

    @staticmethod
    def handle_expirations(db: Session):
        """Transition subscriptions to expired state if past expires_at and no renewal"""
        now = datetime.utcnow()

        expired_subs = db.query(Subscription).filter(
            Subscription.status.in_(["active", "past_due"]),
            Subscription.expires_at < now
        ).all()

        for sub in expired_subs:
            # If auto-renew is off or no payment received, mark as expired
            logger.info(f"Marking subscription {sub.id} as expired")
            sub.status = "expired"
            sub.is_active = False

        db.commit()

    @staticmethod
    def calculate_proration(db: Session, subscription_id: str, new_product_id: str):
        """
        Calculate proration for upgrading/downgrading a subscription.
        Returns a dictionary with credit from old plan and cost for new plan.
        """
        sub = db.query(Subscription).filter(Subscription.id == subscription_id).first()
        new_product = db.query(Product).filter(Product.id == new_product_id).first()

        if not sub or not new_product:
            raise Exception("Subscription or Product not found")

        now = datetime.utcnow()
        if not sub.expires_at or sub.expires_at <= now:
            # No remaining time to prorate, just return full price of new product
            return {
                "credit": 0.0,
                "new_cost": new_product.price,
                "total_delta": new_product.price,
                "days_remaining": 0
            }

        total_period = sub.expires_at - sub.started_at
        remaining_period = sub.expires_at - now

        total_days = total_period.days or 30 # fallback
        remaining_days = remaining_period.days

        # Credit from existing plan (unused portion)
        credit = (sub.product.price / total_days) * remaining_days
        
        # Cost of new plan for remaining period
        new_cost = (new_product.price / total_days) * remaining_days
        
        total_delta = max(0, new_cost - credit)

        return {
            "credit": round(credit, 2),
            "new_cost": round(new_cost, 2),
            "total_delta": round(total_delta, 2),
            "days_remaining": remaining_days
        }
