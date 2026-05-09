"""
Subscription Lifecycle Background Tasks
Handles automated invoicing, status transitions, and billing enforcement.
"""

import logging
from datetime import datetime
from sqlalchemy.orm import Session

from app.celery_app import celery_app
from app.database import SessionLocal
from app.services.subscription_manager import SubscriptionManager

logger = logging.getLogger(__name__)


@celery_app.task(name='app.tasks.subscription_tasks.process_subscription_lifecycle')
def process_subscription_lifecycle():
    """Daily task to process all subscription lifecycle events"""
    logger.info("Running automated subscription lifecycle task")
    db = SessionLocal()
    try:
        SubscriptionManager.process_daily_lifecycle(db)
        logger.info("Subscription lifecycle task completed successfully")
    except Exception as e:
        logger.error(f"Error in subscription lifecycle task: {str(e)}")
        db.rollback()
    finally:
        db.close()


@celery_app.task(name='app.tasks.subscription_tasks.check_overdue_invoices')
def check_overdue_invoices():
    """Frequent task to enforce billing policies for overdue payments"""
    logger.info("Running billing enforcement task")
    db = SessionLocal()
    try:
        SubscriptionManager.enforce_billing_policies(db)
        logger.info("Billing enforcement task completed successfully")
    except Exception as e:
        logger.error(f"Error in billing enforcement task: {str(e)}")
        db.rollback()
    finally:
        db.close()
