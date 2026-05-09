import logging
from datetime import datetime, date
from sqlalchemy.orm import Session
from sqlalchemy import text, func
from app.models.usage import UsageRecord, UsageAlert
from app.models.tenant import Tenant
from app.models.subscription import Subscription
from app.models.study import Study
from app.database import SessionLocal
import uuid

logger = logging.getLogger(__name__)

class UsageService:
    @staticmethod
    def collect_tenant_usage(db: Session, tenant_id: str):
        """Collect real-time usage metrics for a specific tenant"""
        # 1. Get Active Subscription to know limits
        sub = db.query(Subscription).filter(
            Subscription.tenant_id == tenant_id,
            Subscription.status == "active"
        ).first()
        
        if not sub:
            logger.warning(f"No active subscription for tenant {tenant_id}, usage collection skipped")
            return None

        # 2. Calculate Current Storage (from pacs_studies table)
        # Assuming there is a 'storage_size' column in 'pacs_studies' table (based on Study model)
        storage_bytes = db.query(func.sum(Study.storage_size)).filter(Study.tenant_id == tenant_id).scalar() or 0
        
        # 3. Calculate Active Users (from auth system - would typically query user-service or local users table)
        # For now, let's assume we can count users linked to this tenant
        try:
            # Simple count of users for this tenant
            # This might require joining with user table if it exists in this DB
            active_users = db.execute(text("SELECT COUNT(*) FROM users WHERE tenant_id = :tid"), {"tid": tenant_id}).scalar() or 0
        except:
            active_users = 0

        # 4. Get Daily API Calls (from UsageRecord log for today)
        today = date.today()
        daily_record = db.query(UsageRecord).filter(
            UsageRecord.tenant_id == tenant_id,
            func.date(UsageRecord.date) == today
        ).first()
        
        if not daily_record:
            daily_record = UsageRecord(
                tenant_id=tenant_id,
                date=datetime.utcnow(),
                period="daily",
                api_calls=0
            )
            db.add(daily_record)
            db.flush()

        # Update the record with latest totals
        daily_record.storage_bytes = storage_bytes
        daily_record.storage_bytes_limit = sub.product.max_storage_gb * 1024 * 1024 * 1024 if sub.product.max_storage_gb else 0
        daily_record.active_users = active_users
        daily_record.user_limit = sub.product.max_users
        daily_record.api_calls_limit = sub.product.max_api_calls_per_day
        
        db.commit()
        
        # 5. Check Thresholds and Trigger Alerts
        UsageService.check_usage_thresholds(db, daily_record)
        
        return daily_record

    @staticmethod
    def check_usage_thresholds(db: Session, record: UsageRecord):
        """Check if usage exceeds 80%, 90%, 100% and trigger alerts"""
        metrics = [
            ('storage_limit', record.storage_bytes, record.storage_bytes_limit),
            ('api_limit', record.api_calls, record.api_calls_limit),
            ('user_limit', record.active_users, record.user_limit)
        ]
        
        for alert_type, current, limit in metrics:
            if not limit or limit == 0:
                continue
                
            percent = (current / limit) * 100
            
            # Check for 80, 90, 100 thresholds
            for threshold in [100, 90, 80]:
                if percent >= threshold:
                    # Check if alert already triggered for this threshold today
                    existing = db.query(UsageAlert).filter(
                        UsageAlert.tenant_id == record.tenant_id,
                        UsageAlert.alert_type == alert_type,
                        UsageAlert.threshold_percent == threshold,
                        UsageAlert.created_at >= datetime.utcnow() - timedelta(hours=24)
                    ).first()
                    
                    if not existing:
                        alert = UsageAlert(
                            tenant_id=record.tenant_id,
                            alert_type=alert_type,
                            threshold_percent=threshold,
                            is_triggered=True,
                            triggered_at=datetime.utcnow()
                        )
                        db.add(alert)
                        logger.warning(f"ALERT: Tenant {record.tenant_id} reached {threshold}% of {alert_type}")
                        # Here you would typically send an email/webhook
                    break # only trigger for highest threshold

        db.commit()

    @staticmethod
    def calculate_monthly_overage(db: Session, tenant_id: str, month: int, year: int):
        """Calculate total overage for a specific month to be billed"""
        # Find all daily records for that month
        start_date = datetime(year, month, 1)
        if month == 12:
            end_date = datetime(year + 1, 1, 1)
        else:
            end_date = datetime(year, month + 1, 1)
            
        # For storage, we typically bill based on the MAX storage used during the month
        # or the AVERAGE storage. Let's use MAX for conservative billing.
        max_storage = db.query(func.max(UsageRecord.storage_bytes)).filter(
            UsageRecord.tenant_id == tenant_id,
            UsageRecord.date >= start_date,
            UsageRecord.date < end_date
        ).scalar() or 0
        
        # Get sub to find limits and overage prices
        sub = db.query(Subscription).filter(
            Subscription.tenant_id == tenant_id,
            Subscription.status == "active"
        ).first()
        
        if not sub or not sub.product:
            return []

        overage_items = []
        
        # 1. Storage Overage
        limit_bytes = (sub.product.max_storage_gb or 0) * 1024 * 1024 * 1024
        if max_storage > limit_bytes and sub.product.overage_storage_price > 0:
            overage_gb = (max_storage - limit_bytes) / (1024 * 1024 * 1024)
            overage_items.append({
                "description": f"Storage Overage ({overage_gb:.2f} GB Kelebihan)",
                "quantity": round(overage_gb, 2),
                "unit_price": sub.product.overage_storage_price,
                "total": round(overage_gb * sub.product.overage_storage_price, 2),
                "meta_data": {"type": "overage", "metric": "storage"}
            })
            
        # 2. API Overage (Total Kelebihan dari akumulasi harian)
        # This is complex, usually we just bill if they exceed daily limit 
        # But for SaaS it's often total monthly volume.
        # Let's assume daily limit enforcement but aggregate overages.
        
        return overage_items
