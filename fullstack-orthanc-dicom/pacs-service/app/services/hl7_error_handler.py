"""
HL7 Error Handler Service
Handles HL7 message processing errors, retries, and dead letter queue
"""

import logging
from typing import Dict, Any, Optional
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.models.hl7_message import HL7Message, HL7ProcessingQueue

logger = logging.getLogger(__name__)


class HL7ErrorHandlerService:
    """Service for handling HL7 message processing errors"""

    # Error codes
    ERROR_INVALID_FORMAT = 'HL7_001'
    ERROR_UNSUPPORTED_VERSION = 'HL7_002'
    ERROR_UNSUPPORTED_MESSAGE_TYPE = 'HL7_003'
    ERROR_MISSING_REQUIRED_FIELD = 'HL7_004'
    ERROR_DUPLICATE_MESSAGE = 'HL7_005'
    ERROR_DATABASE_ERROR = 'HL7_006'
    ERROR_PROCESSING_FAILED = 'HL7_007'
    ERROR_VALIDATION_FAILED = 'HL7_008'
    ERROR_PATIENT_NOT_FOUND = 'HL7_009'
    ERROR_ORDER_NOT_FOUND = 'HL7_010'
    ERROR_TIMEOUT = 'HL7_011'
    ERROR_UNKNOWN = 'HL7_999'

    def __init__(self, db: Session):
        """
        Initialize HL7 error handler service

        Args:
            db: Database session
        """
        self.db = db
        self.error_descriptions = {
            self.ERROR_INVALID_FORMAT: 'Invalid HL7 message format',
            self.ERROR_UNSUPPORTED_VERSION: 'Unsupported HL7 version',
            self.ERROR_UNSUPPORTED_MESSAGE_TYPE: 'Unsupported message type or trigger',
            self.ERROR_MISSING_REQUIRED_FIELD: 'Missing required field in message',
            self.ERROR_DUPLICATE_MESSAGE: 'Duplicate message control ID',
            self.ERROR_DATABASE_ERROR: 'Database operation failed',
            self.ERROR_PROCESSING_FAILED: 'Message processing failed',
            self.ERROR_VALIDATION_FAILED: 'Message validation failed',
            self.ERROR_PATIENT_NOT_FOUND: 'Patient not found in system',
            self.ERROR_ORDER_NOT_FOUND: 'Order not found in system',
            self.ERROR_TIMEOUT: 'Processing timeout exceeded',
            self.ERROR_UNKNOWN: 'Unknown error occurred',
        }

    async def handle_error(
        self,
        hl7_message_id: str,
        error_code: str,
        error_message: str,
        error_details: Optional[Dict[str, Any]] = None,
        exception: Optional[Exception] = None
    ) -> bool:
        """
        Handle HL7 message processing error

        Args:
            hl7_message_id: HL7 message ID
            error_code: Error code
            error_message: Error message
            error_details: Additional error details
            exception: Original exception if available

        Returns:
            True if error was handled successfully
        """
        try:
            # Get the message
            message = self.db.query(HL7Message).filter(HL7Message.id == hl7_message_id).first()
            if not message:
                logger.error(f"HL7 message not found: {hl7_message_id}")
                return False

            # Update message with error information
            message.status = 'FAILED'
            message.error_code = error_code
            message.error_message = error_message
            message.error_details = error_details or {}

            # Add exception info if available
            if exception:
                message.error_details['exception_type'] = type(exception).__name__
                message.error_details['exception_message'] = str(exception)

            # Increment retry count
            message.retry_count += 1

            # Check if message should go to dead letter queue
            if message.retry_count >= message.max_retries:
                message.status = 'DEAD_LETTER'
                logger.warning(
                    f"Message moved to dead letter queue: {hl7_message_id}, "
                    f"Retries: {message.retry_count}/{message.max_retries}"
                )
            else:
                logger.info(
                    f"Message marked as FAILED: {hl7_message_id}, "
                    f"Retries: {message.retry_count}/{message.max_retries}"
                )

            message.updated_at = datetime.now()
            self.db.commit()

            return True

        except Exception as e:
            logger.error(f"Failed to handle error for message {hl7_message_id}: {str(e)}")
            self.db.rollback()
            return False

    async def handle_queue_error(
        self,
        queue_item_id: str,
        error_message: str,
        schedule_retry: bool = True
    ) -> bool:
        """
        Handle processing queue error

        Args:
            queue_item_id: Queue item ID
            error_message: Error message
            schedule_retry: Whether to schedule retry

        Returns:
            True if error was handled successfully
        """
        try:
            # Get the queue item
            queue_item = self.db.query(HL7ProcessingQueue).filter(
                HL7ProcessingQueue.id == queue_item_id
            ).first()

            if not queue_item:
                logger.error(f"Queue item not found: {queue_item_id}")
                return False

            # Update queue item
            queue_item.status = 'FAILED'
            queue_item.last_error = error_message
            queue_item.retry_count += 1

            # Schedule retry with exponential backoff
            if schedule_retry and queue_item.retry_count < queue_item.max_retries:
                backoff_minutes = 2 ** queue_item.retry_count  # 2, 4, 8, 16 minutes
                queue_item.next_retry_at = datetime.now() + timedelta(minutes=backoff_minutes)
                queue_item.status = 'FAILED'  # Will be picked up by retry worker

                logger.info(
                    f"Scheduled retry for queue item {queue_item_id} in {backoff_minutes} minutes, "
                    f"Retry {queue_item.retry_count}/{queue_item.max_retries}"
                )
            else:
                queue_item.status = 'DEAD_LETTER'
                logger.warning(
                    f"Queue item moved to dead letter: {queue_item_id}, "
                    f"Retries: {queue_item.retry_count}/{queue_item.max_retries}"
                )

            queue_item.updated_at = datetime.now()
            self.db.commit()

            return True

        except Exception as e:
            logger.error(f"Failed to handle queue error for {queue_item_id}: {str(e)}")
            self.db.rollback()
            return False

    async def retry_failed_messages(self, batch_size: int = 10) -> int:
        """
        Retry failed messages that are due for retry

        Args:
            batch_size: Number of messages to retry in batch

        Returns:
            Number of messages retried
        """
        try:
            # Find failed queue items ready for retry
            query = """
                SELECT id, hl7_message_id
                FROM hl7_processing_queue
                WHERE status = 'FAILED'
                  AND retry_count < max_retries
                  AND next_retry_at <= NOW()
                ORDER BY priority ASC, next_retry_at ASC
                LIMIT :batch_size
            """

            result = self.db.execute(text(query), {'batch_size': batch_size})
            items = result.fetchall()

            retried_count = 0
            for item in items:
                queue_item = self.db.query(HL7ProcessingQueue).filter(
                    HL7ProcessingQueue.id == item.id
                ).first()

                if queue_item:
                    queue_item.status = 'QUEUED'
                    queue_item.next_retry_at = None
                    queue_item.updated_at = datetime.now()
                    retried_count += 1

                    logger.info(f"Requeued message for retry: {queue_item.hl7_message_id}")

            self.db.commit()

            if retried_count > 0:
                logger.info(f"Retried {retried_count} failed messages")

            return retried_count

        except Exception as e:
            logger.error(f"Failed to retry messages: {str(e)}")
            self.db.rollback()
            return 0

    async def get_dead_letter_messages(
        self,
        limit: int = 50,
        offset: int = 0
    ) -> Dict[str, Any]:
        """
        Get messages in dead letter queue

        Args:
            limit: Maximum number of messages to return
            offset: Offset for pagination

        Returns:
            Dictionary with messages and count
        """
        try:
            # Get dead letter messages
            messages = self.db.query(HL7Message).filter(
                HL7Message.status == 'DEAD_LETTER'
            ).order_by(
                HL7Message.created_at.desc()
            ).limit(limit).offset(offset).all()

            # Get total count
            total_count = self.db.query(HL7Message).filter(
                HL7Message.status == 'DEAD_LETTER'
            ).count()

            return {
                'messages': [msg.to_list_dict() for msg in messages],
                'total': total_count,
                'limit': limit,
                'offset': offset
            }

        except Exception as e:
            logger.error(f"Failed to get dead letter messages: {str(e)}")
            return {'messages': [], 'total': 0, 'limit': limit, 'offset': offset}

    async def reprocess_dead_letter_message(self, message_id: str) -> bool:
        """
        Reprocess a message from dead letter queue

        Args:
            message_id: Message ID to reprocess

        Returns:
            True if message was requeued successfully
        """
        try:
            message = self.db.query(HL7Message).filter(HL7Message.id == message_id).first()

            if not message:
                logger.error(f"Message not found: {message_id}")
                return False

            if message.status != 'DEAD_LETTER':
                logger.warning(f"Message is not in dead letter queue: {message_id}")
                return False

            # Reset message status
            message.status = 'RECEIVED'
            message.retry_count = 0
            message.error_message = None
            message.error_details = None
            message.error_code = None
            message.updated_at = datetime.now()

            # Reset queue item if exists
            queue_item = self.db.query(HL7ProcessingQueue).filter(
                HL7ProcessingQueue.hl7_message_id == message_id
            ).first()

            if queue_item:
                queue_item.status = 'QUEUED'
                queue_item.retry_count = 0
                queue_item.next_retry_at = None
                queue_item.last_error = None
                queue_item.updated_at = datetime.now()

            self.db.commit()

            logger.info(f"Requeued dead letter message: {message_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to reprocess dead letter message {message_id}: {str(e)}")
            self.db.rollback()
            return False

    def get_error_description(self, error_code: str) -> str:
        """
        Get human-readable error description

        Args:
            error_code: Error code

        Returns:
            Error description
        """
        return self.error_descriptions.get(error_code, f'Unknown error code: {error_code}')

    async def get_error_statistics(self, hours: int = 24) -> Dict[str, Any]:
        """
        Get error statistics for monitoring

        Args:
            hours: Number of hours to look back

        Returns:
            Dictionary with error statistics
        """
        try:
            cutoff_time = datetime.now() - timedelta(hours=hours)

            # Get error counts by error code
            query = """
                SELECT
                    error_code,
                    COUNT(*) as count,
                    COUNT(DISTINCT patient_id) as affected_patients,
                    MAX(created_at) as last_occurrence
                FROM hl7_messages
                WHERE status IN ('FAILED', 'DEAD_LETTER')
                  AND created_at >= :cutoff_time
                GROUP BY error_code
                ORDER BY count DESC
            """

            result = self.db.execute(text(query), {'cutoff_time': cutoff_time})
            error_counts = []

            for row in result:
                error_counts.append({
                    'error_code': row.error_code,
                    'description': self.get_error_description(row.error_code) if row.error_code else 'Unknown',
                    'count': row.count,
                    'affected_patients': row.affected_patients,
                    'last_occurrence': row.last_occurrence.isoformat() if row.last_occurrence else None
                })

            # Get dead letter queue size
            dlq_size = self.db.query(HL7Message).filter(
                HL7Message.status == 'DEAD_LETTER'
            ).count()

            # Get failed messages ready for retry
            retry_queue_size = self.db.query(HL7ProcessingQueue).filter(
                HL7ProcessingQueue.status == 'FAILED',
                HL7ProcessingQueue.retry_count < HL7ProcessingQueue.max_retries,
                HL7ProcessingQueue.next_retry_at <= datetime.now()
            ).count()

            return {
                'time_window_hours': hours,
                'error_counts': error_counts,
                'dead_letter_queue_size': dlq_size,
                'retry_queue_size': retry_queue_size
            }

        except Exception as e:
            logger.error(f"Failed to get error statistics: {str(e)}")
            return {
                'time_window_hours': hours,
                'error_counts': [],
                'dead_letter_queue_size': 0,
                'retry_queue_size': 0
            }
