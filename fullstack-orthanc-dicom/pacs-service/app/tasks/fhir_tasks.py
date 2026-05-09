"""
FHIR Celery Tasks

Background tasks for FHIR resource processing and HL7-to-FHIR conversion
"""

import logging
from typing import Dict, Any
from celery import Task

from app.celery_app import celery_app
from app.database import SessionLocal
from app.services.fhir.hl7_to_fhir_converter import HL7ToFHIRConverter
from app.services.fhir.fhir_base_service import FHIRBaseService

logger = logging.getLogger(__name__)


# ============================================================================
# HL7 to FHIR Conversion Tasks
# ============================================================================

@celery_app.task(name='app.tasks.fhir_tasks.convert_hl7_to_fhir_async', bind=True, max_retries=3)
def convert_hl7_to_fhir_async(
    self: Task,
    message_type: str,
    message_trigger: str,
    parsed_data: Dict[str, Any],
    hl7_message_id: str = None,
    order_id: str = None,
    source_system: str = None
) -> Dict[str, Any]:
    """
    Convert HL7 message to FHIR resources asynchronously

    Args:
        message_type: HL7 message type (ADT, ORM, ORU)
        message_trigger: HL7 trigger event
        parsed_data: Parsed HL7 message data
        hl7_message_id: Link to source HL7 message
        order_id: Link to orders table
        source_system: Source system identifier

    Returns:
        Dict with conversion results
    """
    db = SessionLocal()
    try:
        logger.info(f"Starting HL7 to FHIR conversion: {message_type}^{message_trigger}")

        converter = HL7ToFHIRConverter(db)
        result = converter.convert_hl7_message_to_fhir(
            message_type=message_type,
            message_trigger=message_trigger,
            parsed_data=parsed_data,
            hl7_message_id=hl7_message_id,
            order_id=order_id,
            source_system=source_system
        )

        if result.get('success'):
            logger.info(f"Successfully converted HL7 to FHIR: {len(result.get('resources_created', []))} resources created")
            return result
        else:
            logger.warning(f"HL7 to FHIR conversion completed with errors: {result.get('errors')}")
            # Retry on failure
            if self.request.retries < self.max_retries:
                raise self.retry(countdown=2 ** self.request.retries * 60)
            return result

    except Exception as e:
        logger.error(f"Failed to convert HL7 to FHIR: {str(e)}")
        db.rollback()

        # Retry with exponential backoff
        if self.request.retries < self.max_retries:
            raise self.retry(exc=e, countdown=2 ** self.request.retries * 60)

        # Return error result after max retries
        return {
            'success': False,
            'message_type': message_type,
            'resources_created': [],
            'errors': [str(e)]
        }

    finally:
        db.close()


@celery_app.task(name='app.tasks.fhir_tasks.convert_adt_to_fhir_async', bind=True, max_retries=3)
def convert_adt_to_fhir_async(
    self: Task,
    parsed_data: Dict[str, Any],
    hl7_message_id: str = None
) -> Dict[str, Any]:
    """
    Convert HL7 ADT message to FHIR Patient resource asynchronously

    Args:
        parsed_data: Parsed HL7 ADT message data
        hl7_message_id: Link to source HL7 message

    Returns:
        Dict with conversion results
    """
    db = SessionLocal()
    try:
        logger.info("Converting ADT to FHIR Patient")

        converter = HL7ToFHIRConverter(db)
        result = converter.convert_adt_to_fhir(
            parsed_data=parsed_data,
            hl7_message_id=hl7_message_id
        )

        if result.get('success'):
            logger.info(f"Successfully converted ADT to FHIR Patient")
            return result
        else:
            logger.warning(f"ADT conversion completed with errors: {result.get('errors')}")
            if self.request.retries < self.max_retries:
                raise self.retry(countdown=2 ** self.request.retries * 60)
            return result

    except Exception as e:
        logger.error(f"Failed to convert ADT to FHIR: {str(e)}")
        db.rollback()

        if self.request.retries < self.max_retries:
            raise self.retry(exc=e, countdown=2 ** self.request.retries * 60)

        return {
            'success': False,
            'message_type': 'ADT',
            'resources_created': [],
            'errors': [str(e)]
        }

    finally:
        db.close()


@celery_app.task(name='app.tasks.fhir_tasks.convert_orm_to_fhir_async', bind=True, max_retries=3)
def convert_orm_to_fhir_async(
    self: Task,
    parsed_data: Dict[str, Any],
    hl7_message_id: str = None,
    order_id: str = None
) -> Dict[str, Any]:
    """
    Convert HL7 ORM message to FHIR Patient and ServiceRequest resources asynchronously

    Args:
        parsed_data: Parsed HL7 ORM message data
        hl7_message_id: Link to source HL7 message
        order_id: Link to orders table

    Returns:
        Dict with conversion results
    """
    db = SessionLocal()
    try:
        logger.info("Converting ORM to FHIR Patient + ServiceRequest")

        converter = HL7ToFHIRConverter(db)
        result = converter.convert_orm_to_fhir(
            parsed_data=parsed_data,
            hl7_message_id=hl7_message_id,
            order_id=order_id
        )

        if result.get('success'):
            logger.info(f"Successfully converted ORM to FHIR: {len(result.get('resources_created', []))} resources")
            return result
        else:
            logger.warning(f"ORM conversion completed with errors: {result.get('errors')}")
            if self.request.retries < self.max_retries:
                raise self.retry(countdown=2 ** self.request.retries * 60)
            return result

    except Exception as e:
        logger.error(f"Failed to convert ORM to FHIR: {str(e)}")
        db.rollback()

        if self.request.retries < self.max_retries:
            raise self.retry(exc=e, countdown=2 ** self.request.retries * 60)

        return {
            'success': False,
            'message_type': 'ORM',
            'resources_created': [],
            'errors': [str(e)]
        }

    finally:
        db.close()


@celery_app.task(name='app.tasks.fhir_tasks.convert_oru_to_fhir_async', bind=True, max_retries=3)
def convert_oru_to_fhir_async(
    self: Task,
    parsed_data: Dict[str, Any],
    hl7_message_id: str = None,
    order_id: str = None
) -> Dict[str, Any]:
    """
    Convert HL7 ORU message to FHIR DiagnosticReport and Observation resources asynchronously

    Args:
        parsed_data: Parsed HL7 ORU message data
        hl7_message_id: Link to source HL7 message
        order_id: Link to orders table

    Returns:
        Dict with conversion results
    """
    db = SessionLocal()
    try:
        logger.info("Converting ORU to FHIR DiagnosticReport + Observations")

        converter = HL7ToFHIRConverter(db)
        result = converter.convert_oru_to_fhir(
            parsed_data=parsed_data,
            hl7_message_id=hl7_message_id,
            order_id=order_id
        )

        if result.get('success'):
            logger.info(f"Successfully converted ORU to FHIR: {len(result.get('resources_created', []))} resources")
            return result
        else:
            logger.warning(f"ORU conversion completed with errors: {result.get('errors')}")
            if self.request.retries < self.max_retries:
                raise self.retry(countdown=2 ** self.request.retries * 60)
            return result

    except Exception as e:
        logger.error(f"Failed to convert ORU to FHIR: {str(e)}")
        db.rollback()

        if self.request.retries < self.max_retries:
            raise self.retry(exc=e, countdown=2 ** self.request.retries * 60)

        return {
            'success': False,
            'message_type': 'ORU',
            'resources_created': [],
            'errors': [str(e)]
        }

    finally:
        db.close()


# ============================================================================
# Maintenance Tasks
# ============================================================================

@celery_app.task(name='app.tasks.fhir_tasks.cleanup_old_fhir_versions')
def cleanup_old_fhir_versions(days_to_keep: int = 90) -> Dict[str, Any]:
    """
    Clean up old FHIR resource versions

    Args:
        days_to_keep: Number of days to keep old versions

    Returns:
        Dict with cleanup results
    """
    db = SessionLocal()
    try:
        logger.info(f"Starting FHIR version cleanup (keeping {days_to_keep} days)")

        base_service = FHIRBaseService(db)

        # Get count before cleanup
        stats_before = base_service.get_statistics()
        total_before = stats_before.get('total_versions', 0)

        # Execute cleanup query
        from sqlalchemy import text
        from datetime import datetime, timedelta

        cutoff_date = datetime.now() - timedelta(days=days_to_keep)

        # Delete old versions (keep latest version of each resource)
        cleanup_query = text("""
            DELETE FROM fhir_resources
            WHERE id IN (
                SELECT fr.id
                FROM fhir_resources fr
                WHERE fr.created_at < :cutoff_date
                  AND fr.version_id < (
                    SELECT MAX(version_id)
                    FROM fhir_resources
                    WHERE resource_type = fr.resource_type
                      AND resource_id = fr.resource_id
                  )
            )
        """)

        result = db.execute(cleanup_query, {'cutoff_date': cutoff_date})
        deleted_count = result.rowcount
        db.commit()

        # Get count after cleanup
        stats_after = base_service.get_statistics()
        total_after = stats_after.get('total_versions', 0)

        logger.info(f"FHIR cleanup completed: deleted {deleted_count} old versions")

        return {
            'success': True,
            'deleted_count': deleted_count,
            'total_before': total_before,
            'total_after': total_after,
            'days_kept': days_to_keep
        }

    except Exception as e:
        logger.error(f"Failed to cleanup old FHIR versions: {str(e)}")
        db.rollback()
        return {
            'success': False,
            'error': str(e)
        }

    finally:
        db.close()


@celery_app.task(name='app.tasks.fhir_tasks.generate_fhir_statistics')
def generate_fhir_statistics() -> Dict[str, Any]:
    """
    Generate FHIR resource statistics

    Returns:
        Dict with statistics
    """
    db = SessionLocal()
    try:
        logger.info("Generating FHIR statistics")

        base_service = FHIRBaseService(db)
        stats = base_service.get_statistics()

        logger.info(f"FHIR statistics: {stats.get('current_resources', 0)} current resources")

        return {
            'success': True,
            'timestamp': str(datetime.now()),
            'statistics': stats
        }

    except Exception as e:
        logger.error(f"Failed to generate FHIR statistics: {str(e)}")
        return {
            'success': False,
            'error': str(e)
        }

    finally:
        db.close()


@celery_app.task(name='app.tasks.fhir_tasks.validate_fhir_resource_links')
def validate_fhir_resource_links() -> Dict[str, Any]:
    """
    Validate FHIR resource links integrity

    Returns:
        Dict with validation results
    """
    db = SessionLocal()
    try:
        logger.info("Validating FHIR resource links")

        from sqlalchemy import text

        # Find broken links (links pointing to deleted resources)
        broken_links_query = text("""
            SELECT COUNT(*)
            FROM fhir_resource_links frl
            WHERE NOT EXISTS (
                SELECT 1 FROM fhir_resources fr
                WHERE fr.id = frl.source_resource_id AND fr.is_deleted = FALSE
            )
            OR NOT EXISTS (
                SELECT 1 FROM fhir_resources fr
                WHERE fr.id = frl.target_resource_id AND fr.is_deleted = FALSE
            )
        """)

        result = db.execute(broken_links_query)
        broken_count = result.scalar()

        logger.info(f"Found {broken_count} broken FHIR resource links")

        return {
            'success': True,
            'broken_links_count': broken_count,
            'timestamp': str(datetime.now())
        }

    except Exception as e:
        logger.error(f"Failed to validate FHIR resource links: {str(e)}")
        return {
            'success': False,
            'error': str(e)
        }

    finally:
        db.close()
