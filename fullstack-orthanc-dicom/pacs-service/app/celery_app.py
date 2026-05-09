"""
Celery Application for Background Tasks
Handles storage cleanup, migration, and monitoring jobs
"""

from celery import Celery
from celery.schedules import crontab
import os
from app.config import settings

# Create Celery application
celery_app = Celery(
    'pacs_service',
    broker=os.getenv('CELERY_BROKER_URL', 'redis://localhost:6379/0'),
    backend=os.getenv('CELERY_RESULT_BACKEND', 'redis://localhost:6379/0'),
    include=[
        'app.tasks.storage_tasks',
        'app.tasks.cleanup_tasks',
        'app.tasks.migration_tasks',
        'app.tasks.storage_migration',
        'app.tasks.hl7_tasks',
        'app.tasks.fhir_tasks',
        'app.tasks.thumbnail_tasks',
        'app.tasks.order_tasks',
        'app.tasks.impersonate_tasks',
        'app.tasks.subscription_tasks',
        'app.tasks.usage_tasks'
    ]
)

# Celery configuration
celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    task_track_started=True,
    task_time_limit=3600,  # 1 hour hard limit
    task_soft_time_limit=3300,  # 55 minutes soft limit
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=100,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
)

# Periodic task schedule
celery_app.conf.beat_schedule = {
    'cleanup-orphan-files-daily': {
        'task': 'app.tasks.cleanup_tasks.cleanup_orphan_files',
        'schedule': crontab(hour=2, minute=0),  # Run at 2 AM daily
        'kwargs': {'dry_run': False}
    },
    'migrate-cold-files-weekly': {
        'task': 'app.tasks.migration_tasks.migrate_old_files_to_cold',
        'schedule': crontab(day_of_week=0, hour=3, minute=0),  # Sunday 3 AM
        'kwargs': {'days_threshold': 90}
    },
    'update-storage-stats-hourly': {
        'task': 'app.tasks.storage_tasks.update_all_storage_stats',
        'schedule': crontab(minute=0),  # Every hour
    },
    'health-check-storage-every-15min': {
        'task': 'app.tasks.storage_tasks.health_check_all_storages',
        'schedule': crontab(minute='*/15'),  # Every 15 minutes
    },
    # HL7 Maintenance Tasks
    'retry-failed-hl7-messages-every-30min': {
        'task': 'app.tasks.hl7_tasks.retry_failed_messages',
        'schedule': crontab(minute='*/30'),  # Every 30 minutes
        'kwargs': {'batch_size': 10}
    },
    'cleanup-old-hl7-messages-monthly': {
        'task': 'app.tasks.hl7_tasks.cleanup_old_hl7_messages',
        'schedule': crontab(day_of_month=1, hour=1, minute=0),  # 1st of month at 1 AM
        'kwargs': {'days_threshold': 365}
    },
    'generate-hl7-statistics-hourly': {
        'task': 'app.tasks.hl7_tasks.generate_hl7_statistics',
        'schedule': crontab(minute=0),  # Every hour
        'kwargs': {'hours': 24}
    },
    'monitor-hl7-dlq-every-15min': {
        'task': 'app.tasks.hl7_tasks.monitor_dead_letter_queue',
        'schedule': crontab(minute='*/15'),  # Every 15 minutes
        'kwargs': {'alert_threshold': 10}
    },
    # Order Monitoring Tasks
    'check-stagnant-orders-hourly': {
        'task': 'app.tasks.order_tasks.check_stagnant_orders',
        'schedule': crontab(minute=15),  # Hourly at :15
        'kwargs': {'hours': 6, 'limit': 50}
    },
    # FHIR Maintenance Tasks
    'cleanup-old-fhir-versions-monthly': {
        'task': 'app.tasks.fhir_tasks.cleanup_old_fhir_versions',
        'schedule': crontab(day_of_month=15, hour=2, minute=0),  # 15th of month at 2 AM
        'kwargs': {'days_to_keep': 90}
    },
    'generate-fhir-statistics-hourly': {
        'task': 'app.tasks.fhir_tasks.generate_fhir_statistics',
        'schedule': crontab(minute=0),  # Every hour
    },
    'validate-fhir-links-daily': {
        'task': 'app.tasks.fhir_tasks.validate_fhir_resource_links',
        'schedule': crontab(hour=4, minute=0),  # Daily at 4 AM
    },
    # Thumbnail Generation Tasks
    'generate-missing-thumbnails-hourly': {
        'task': 'app.tasks.thumbnail_tasks.generate_missing_thumbnails',
        'schedule': crontab(minute=30),  # Every hour at :30
        'kwargs': {'batch_size': 50, 'size': 'medium'}
    },
    'cleanup-orphan-thumbnails-daily': {
        'task': 'app.tasks.thumbnail_tasks.cleanup_orphan_thumbnails',
        'schedule': crontab(hour=3, minute=30),  # Daily at 3:30 AM
    },
    # Impersonate Session Tasks
    'cleanup-expired-impersonate-sessions-every-5min': {
        'task': 'app.tasks.impersonate_tasks.cleanup_expired_impersonate_sessions',
        'schedule': crontab(minute='*/5'),  # Every 5 minutes
    },
    'send-impersonate-timeout-warnings-every-5min': {
        'task': 'app.tasks.impersonate_tasks.send_timeout_warnings',
        'schedule': crontab(minute='*/5'),  # Every 5 minutes
        'kwargs': {'warning_minutes': 5}
    },
    'log-active-impersonate-sessions-hourly': {
        'task': 'app.tasks.impersonate_tasks.log_active_sessions',
        'schedule': crontab(minute=0),  # Every hour
    },
    'generate-impersonate-statistics-daily': {
        'task': 'app.tasks.impersonate_tasks.generate_impersonate_statistics',
        'schedule': crontab(hour=1, minute=0),  # Daily at 1 AM
        'kwargs': {'hours': 24}
    },
    # Subscription Lifecycle Tasks
    'process-subscription-lifecycle-daily': {
        'task': 'app.tasks.subscription_tasks.process_subscription_lifecycle',
        'schedule': crontab(hour=0, minute=30),  # Daily at 00:30 AM
    },
    'enforce-billing-policies-hourly': {
        'task': 'app.tasks.subscription_tasks.check_overdue_invoices',
        'schedule': crontab(minute=45),  # Every hour at :45
    },
    # Usage Tracking Tasks
    'collect-global-usage-hourly': {
        'task': 'app.tasks.usage_tasks.collect_all_tenant_usage',
        'schedule': crontab(minute=0),  # Every hour
    },
}

# Task routes
celery_app.conf.task_routes = {
    'app.tasks.storage_tasks.*': {'queue': 'storage'},
    'app.tasks.cleanup_tasks.*': {'queue': 'cleanup'},
    'app.tasks.migration_tasks.*': {'queue': 'migration'},
    'app.tasks.hl7_tasks.process_adt_message_async': {'queue': 'hl7_adt'},
    'app.tasks.hl7_tasks.process_orm_message_async': {'queue': 'hl7_orm'},
    'app.tasks.hl7_tasks.process_oru_message_async': {'queue': 'hl7_oru'},
    'app.tasks.hl7_tasks.retry_failed_messages': {'queue': 'hl7_maintenance'},
    'app.tasks.hl7_tasks.cleanup_old_hl7_messages': {'queue': 'hl7_maintenance'},
    'app.tasks.hl7_tasks.generate_hl7_statistics': {'queue': 'hl7_maintenance'},
    'app.tasks.hl7_tasks.monitor_dead_letter_queue': {'queue': 'hl7_maintenance'},
    # FHIR Task Routes
    'app.tasks.fhir_tasks.convert_hl7_to_fhir_async': {'queue': 'fhir_conversion'},
    'app.tasks.fhir_tasks.convert_adt_to_fhir_async': {'queue': 'fhir_conversion'},
    'app.tasks.fhir_tasks.convert_orm_to_fhir_async': {'queue': 'fhir_conversion'},
    'app.tasks.fhir_tasks.convert_oru_to_fhir_async': {'queue': 'fhir_conversion'},
    'app.tasks.fhir_tasks.cleanup_old_fhir_versions': {'queue': 'fhir_maintenance'},
    'app.tasks.fhir_tasks.generate_fhir_statistics': {'queue': 'fhir_maintenance'},
    'app.tasks.fhir_tasks.validate_fhir_resource_links': {'queue': 'fhir_maintenance'},
    # Thumbnail Task Routes
    'app.tasks.thumbnail_tasks.*': {'queue': 'storage'},
    # Impersonate Task Routes
    'app.tasks.impersonate_tasks.*': {'queue': 'impersonate'},
    # Subscription Task Routes
    'app.tasks.subscription_tasks.*': {'queue': 'billing'},
    # Usage Task Routes
    'app.tasks.usage_tasks.*': {'queue': 'usage'},
}

if __name__ == '__main__':
    celery_app.start()
