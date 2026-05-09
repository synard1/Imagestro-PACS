"""
HL7 Background Tasks
Handles async processing of HL7 messages and retry logic
"""

import asyncio
import logging
from datetime import datetime
from typing import Dict, Any
from sqlalchemy.orm import Session

from app.celery_app import celery_app
from app.database import SessionLocal
from app.services.hl7_adt_handler import HL7ADTHandlerService
from app.services.hl7_orm_handler import HL7ORMHandlerService
from app.services.hl7_oru_handler import HL7ORUHandlerService
from app.services.hl7_error_handler import HL7ErrorHandlerService
from app.models.hl7_message import HL7Message, HL7ProcessingQueue

logger = logging.getLogger(__name__)


@celery_app.task(name='app.tasks.hl7_tasks.process_adt_message_async', bind=True, max_retries=3)
def process_adt_message_async(self, message_id: str) -> Dict[str, Any]:
    """
    Process ADT message asynchronously

    Args:
        message_id: HL7 message ID

    Returns:
        Processing result
    """
    db = SessionLocal()
    try:
        logger.info(f"Processing ADT message async: {message_id}")

        # Get the message
        message = db.query(HL7Message).filter(HL7Message.id == message_id).first()
        if not message:
            raise ValueError(f"Message not found: {message_id}")

        # Create handler and process
        handler = HL7ADTHandlerService(db)
        hl7_message, ack_message = asyncio.run(handler.process_adt_message(
            raw_message=message.raw_message,
            http_context=None
        ))

        logger.info(f"Successfully processed ADT message async: {message_id}")

        return {
            'status': 'success',
            'message_id': str(hl7_message.id),
            'ack_code': hl7_message.ack_code
        }

    except Exception as e:
        logger.error(f"Failed to process ADT message async: {str(e)}")

        # Handle error
        error_handler = HL7ErrorHandlerService(db)
        asyncio.run(error_handler.handle_error(
            hl7_message_id=message_id,
            error_code=error_handler.ERROR_PROCESSING_FAILED,
            error_message=str(e),
            exception=e
        ))

        # Retry with exponential backoff
        try:
            raise self.retry(exc=e, countdown=2 ** self.request.retries * 60)
        except self.MaxRetriesExceededError:
            logger.error(f"Max retries exceeded for message: {message_id}")
            return {
                'status': 'failed',
                'message_id': message_id,
                'error': str(e)
            }

    finally:
        db.close()


@celery_app.task(name='app.tasks.hl7_tasks.process_orm_message_async', bind=True, max_retries=3)
def process_orm_message_async(self, message_id: str) -> Dict[str, Any]:
    """
    Process ORM message asynchronously

    Args:
        message_id: HL7 message ID

    Returns:
        Processing result
    """
    db = SessionLocal()
    try:
        logger.info(f"Processing ORM message async: {message_id}")

        # Get the message
        message = db.query(HL7Message).filter(HL7Message.id == message_id).first()
        if not message:
            raise ValueError(f"Message not found: {message_id}")

        # Create handler and process
        handler = HL7ORMHandlerService(db)
        hl7_message, ack_message = asyncio.run(handler.process_orm_message(
            raw_message=message.raw_message,
            http_context=None
        ))

        logger.info(f"Successfully processed ORM message async: {message_id}")

        return {
            'status': 'success',
            'message_id': str(hl7_message.id),
            'ack_code': hl7_message.ack_code
        }

    except Exception as e:
        logger.error(f"Failed to process ORM message async: {str(e)}")

        # Handle error
        error_handler = HL7ErrorHandlerService(db)
        asyncio.run(error_handler.handle_error(
            hl7_message_id=message_id,
            error_code=error_handler.ERROR_PROCESSING_FAILED,
            error_message=str(e),
            exception=e
        ))

        # Retry with exponential backoff
        try:
            raise self.retry(exc=e, countdown=2 ** self.request.retries * 60)
        except self.MaxRetriesExceededError:
            logger.error(f"Max retries exceeded for message: {message_id}")
            return {
                'status': 'failed',
                'message_id': message_id,
                'error': str(e)
            }

    finally:
        db.close()


@celery_app.task(name='app.tasks.hl7_tasks.process_oru_message_async', bind=True, max_retries=3)
def process_oru_message_async(self, message_id: str) -> Dict[str, Any]:
    """
    Process ORU message asynchronously

    Args:
        message_id: HL7 message ID

    Returns:
        Processing result
    """
    db = SessionLocal()
    try:
        logger.info(f"Processing ORU message async: {message_id}")

        # Get the message
        message = db.query(HL7Message).filter(HL7Message.id == message_id).first()
        if not message:
            raise ValueError(f"Message not found: {message_id}")

        # Create handler and process
        handler = HL7ORUHandlerService(db)
        hl7_message, ack_message = asyncio.run(handler.process_oru_message(
            raw_message=message.raw_message,
            http_context=None
        ))

        logger.info(f"Successfully processed ORU message async: {message_id}")

        return {
            'status': 'success',
            'message_id': str(hl7_message.id),
            'ack_code': hl7_message.ack_code
        }

    except Exception as e:
        logger.error(f"Failed to process ORU message async: {str(e)}")

        # Handle error
        error_handler = HL7ErrorHandlerService(db)
        asyncio.run(error_handler.handle_error(
            hl7_message_id=message_id,
            error_code=error_handler.ERROR_PROCESSING_FAILED,
            error_message=str(e),
            exception=e
        ))

        # Retry with exponential backoff
        try:
            raise self.retry(exc=e, countdown=2 ** self.request.retries * 60)
        except self.MaxRetriesExceededError:
            logger.error(f"Max retries exceeded for message: {message_id}")
            return {
                'status': 'failed',
                'message_id': message_id,
                'error': str(e)
            }

    finally:
        db.close()


@celery_app.task(name='app.tasks.hl7_tasks.retry_failed_messages')
def retry_failed_messages(batch_size: int = 10) -> Dict[str, Any]:
    """
    Retry failed HL7 messages that are due for retry

    Args:
        batch_size: Number of messages to retry in batch

    Returns:
        Retry report
    """
    db = SessionLocal()
    try:
        logger.info(f"Starting HL7 retry job (batch size: {batch_size})")

        error_handler = HL7ErrorHandlerService(db)

        import asyncio
        retried_count = asyncio.run(error_handler.retry_failed_messages(batch_size))

        logger.info(f"HL7 retry job completed: {retried_count} messages retried")

        return {
            'status': 'completed',
            'retried_count': retried_count,
            'batch_size': batch_size,
            'timestamp': datetime.now().isoformat()
        }

    except Exception as e:
        logger.error(f"HL7 retry job failed: {str(e)}")
        return {
            'status': 'failed',
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }

    finally:
        db.close()


@celery_app.task(name='app.tasks.hl7_tasks.cleanup_old_hl7_messages')
def cleanup_old_hl7_messages(days_threshold: int = 365) -> Dict[str, Any]:
    """
    Clean up old HL7 messages older than threshold

    Args:
        days_threshold: Number of days to retain messages

    Returns:
        Cleanup report
    """
    db = SessionLocal()
    try:
        logger.info(f"Starting HL7 message cleanup (threshold: {days_threshold} days)")

        from sqlalchemy import text
        from datetime import timedelta

        cutoff_date = datetime.now() - timedelta(days=days_threshold)

        # Archive old PROCESSED messages
        query = text("""
            DELETE FROM hl7_messages
            WHERE created_at < :cutoff_date
              AND status = 'PROCESSED'
        """)

        result = db.execute(query, {'cutoff_date': cutoff_date})
        deleted_count = result.rowcount
        db.commit()

        logger.info(f"HL7 cleanup completed: {deleted_count} messages deleted")

        return {
            'status': 'completed',
            'deleted_count': deleted_count,
            'days_threshold': days_threshold,
            'cutoff_date': cutoff_date.isoformat(),
            'timestamp': datetime.now().isoformat()
        }

    except Exception as e:
        logger.error(f"HL7 cleanup failed: {str(e)}")
        db.rollback()
        return {
            'status': 'failed',
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }

    finally:
        db.close()


@celery_app.task(name='app.tasks.hl7_tasks.generate_hl7_statistics')
def generate_hl7_statistics(hours: int = 24) -> Dict[str, Any]:
    """
    Generate HL7 processing statistics

    Args:
        hours: Number of hours to look back

    Returns:
        Statistics report
    """
    db = SessionLocal()
    try:
        logger.info(f"Generating HL7 statistics (last {hours} hours)")

        from sqlalchemy import text
        from datetime import timedelta

        cutoff_time = datetime.now() - timedelta(hours=hours)

        # Get message counts by type and status
        query = text("""
            SELECT
                message_type,
                message_trigger,
                status,
                COUNT(*) as count,
                COUNT(DISTINCT patient_id) as unique_patients,
                AVG(EXTRACT(EPOCH FROM (processing_completed_at - processing_started_at))) as avg_processing_time_seconds
            FROM hl7_messages
            WHERE created_at >= :cutoff_time
            GROUP BY message_type, message_trigger, status
            ORDER BY message_type, message_trigger, status
        """)

        result = db.execute(query, {'cutoff_time': cutoff_time})
        statistics = []

        for row in result:
            statistics.append({
                'message_type': row.message_type,
                'message_trigger': row.message_trigger,
                'status': row.status,
                'count': row.count,
                'unique_patients': row.unique_patients,
                'avg_processing_time_seconds': float(row.avg_processing_time_seconds) if row.avg_processing_time_seconds else 0
            })

        # Get error statistics
        error_handler = HL7ErrorHandlerService(db)
        error_stats = asyncio.run(error_handler.get_error_statistics(hours))

        logger.info(f"HL7 statistics generated successfully")

        return {
            'status': 'completed',
            'time_window_hours': hours,
            'statistics': statistics,
            'error_statistics': error_stats,
            'timestamp': datetime.now().isoformat()
        }

    except Exception as e:
        logger.error(f"Failed to generate HL7 statistics: {str(e)}")
        return {
            'status': 'failed',
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }

    finally:
        db.close()


@celery_app.task(name='app.tasks.hl7_tasks.monitor_dead_letter_queue')
def monitor_dead_letter_queue(alert_threshold: int = 10) -> Dict[str, Any]:
    """
    Monitor dead letter queue and alert if threshold exceeded

    Args:
        alert_threshold: Number of messages to trigger alert

    Returns:
        Monitoring report
    """
    db = SessionLocal()
    try:
        logger.info(f"Monitoring HL7 dead letter queue (threshold: {alert_threshold})")

        # Count messages in dead letter queue
        dlq_count = db.query(HL7Message).filter(
            HL7Message.status == 'DEAD_LETTER'
        ).count()

        alert = dlq_count >= alert_threshold

        if alert:
            logger.warning(
                f"HL7 Dead Letter Queue Alert: {dlq_count} messages (threshold: {alert_threshold})"
            )

        return {
            'status': 'completed',
            'dlq_count': dlq_count,
            'alert_threshold': alert_threshold,
            'alert_triggered': alert,
            'timestamp': datetime.now().isoformat()
        }

    except Exception as e:
        logger.error(f"Failed to monitor dead letter queue: {str(e)}")
        return {
            'status': 'failed',
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }

    finally:
        db.close()
