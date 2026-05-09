"""
Usage Tracking Background Tasks
Handles real-time usage collection and threshold alerting.
"""

import logging
from datetime import datetime
from sqlalchemy.orm import Session

from app.celery_app import celery_app
from app.database import SessionLocal
from app.services.usage_service import UsageService
from app.models.tenant import Tenant

logger = logging.getLogger(__name__)


@celery_app.task(name='app.tasks.usage_tasks.collect_all_tenant_usage')
def collect_all_tenant_usage():
    """Periodic task to collect usage for all active tenants"""
    logger.info("Starting global usage collection task")
    db = SessionLocal()
    try:
        active_tenants = db.query(Tenant).filter(Tenant.is_active == True).all()
        for tenant in active_tenants:
            try:
                UsageService.collect_tenant_usage(db, tenant.id)
            except Exception as e:
                logger.error(f"Failed to collect usage for tenant {tenant.id}: {str(e)}")
        
        logger.info(f"Usage collection completed for {len(active_tenants)} tenants")
    except Exception as e:
        logger.error(f"Critical error in usage collection task: {str(e)}")
    finally:
        db.close()
