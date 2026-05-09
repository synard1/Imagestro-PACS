"""
Storage Background Tasks
Handles storage stats updates and health checks
"""

import logging
from datetime import datetime
from typing import Dict, Any
from sqlalchemy.orm import Session

from app.celery_app import celery_app
from app.database import SessionLocal
from app.models.storage_location import StorageLocation
from app.services.storage_adapter_manager import get_storage_adapter_manager

logger = logging.getLogger(__name__)


@celery_app.task(name='app.tasks.storage_tasks.update_all_storage_stats')
def update_all_storage_stats() -> Dict[str, Any]:
    """
    Update statistics for all storage locations

    Returns:
        Update report
    """
    db = SessionLocal()
    try:
        logger.info("Updating all storage location statistics")

        locations = db.query(StorageLocation).filter(
            StorageLocation.is_active == True
        ).all()

        adapter_manager = get_storage_adapter_manager(db)

        updated_count = 0
        failed_count = 0
        results = []

        import asyncio

        for location in locations:
            try:
                adapter = asyncio.run(adapter_manager.get_adapter(str(location.id)))

                if adapter:
                    stats = asyncio.run(adapter.get_stats())

                    # Update location stats
                    if stats:
                        location.current_size_gb = stats.get('total_size_gb', 0)
                        location.current_files = stats.get('file_count', 0)
                        location.last_check = datetime.now()
                        db.commit()

                        updated_count += 1
                        results.append({
                            'location_id': str(location.id),
                            'name': location.name,
                            'status': 'updated',
                            'size_gb': location.current_size_gb,
                            'files': location.current_files,
                            'usage_percentage': location.usage_percentage
                        })
                else:
                    failed_count += 1
                    results.append({
                        'location_id': str(location.id),
                        'name': location.name,
                        'status': 'failed',
                        'reason': 'adapter_not_available'
                    })

            except Exception as e:
                logger.error(f"Failed to update stats for {location.name}: {e}")
                failed_count += 1
                results.append({
                    'location_id': str(location.id),
                    'name': location.name,
                    'status': 'error',
                    'error': str(e)
                })

        report = {
            'task': 'update_all_storage_stats',
            'total_locations': len(locations),
            'updated_count': updated_count,
            'failed_count': failed_count,
            'results': results,
            'timestamp': datetime.now().isoformat()
        }

        logger.info(f"Storage stats update complete: {report}")
        return report

    except Exception as e:
        logger.error(f"Storage stats update failed: {e}", exc_info=True)
        return {'error': str(e)}
    finally:
        db.close()


@celery_app.task(name='app.tasks.storage_tasks.health_check_all_storages')
def health_check_all_storages() -> Dict[str, Any]:
    """
    Perform health check on all storage locations

    Returns:
        Health check report
    """
    db = SessionLocal()
    try:
        logger.info("Performing health check on all storage locations")

        locations = db.query(StorageLocation).all()

        adapter_manager = get_storage_adapter_manager(db)

        healthy_count = 0
        unhealthy_count = 0
        results = []

        import asyncio

        for location in locations:
            try:
                is_healthy = asyncio.run(adapter_manager.health_check(str(location.id)))

                # Update location online status
                was_online = location.is_online
                location.is_online = is_healthy
                location.last_check = datetime.now()
                db.commit()

                if is_healthy:
                    healthy_count += 1
                    results.append({
                        'location_id': str(location.id),
                        'name': location.name,
                        'status': 'healthy',
                        'tier': location.tier
                    })
                else:
                    unhealthy_count += 1
                    results.append({
                        'location_id': str(location.id),
                        'name': location.name,
                        'status': 'unhealthy',
                        'tier': location.tier
                    })

                # Log status change
                if was_online and not is_healthy:
                    logger.warning(f"Storage {location.name} went offline")
                elif not was_online and is_healthy:
                    logger.info(f"Storage {location.name} is back online")

            except Exception as e:
                logger.error(f"Health check failed for {location.name}: {e}")
                unhealthy_count += 1
                results.append({
                    'location_id': str(location.id),
                    'name': location.name,
                    'status': 'error',
                    'error': str(e)
                })

        report = {
            'task': 'health_check_all_storages',
            'total_locations': len(locations),
            'healthy_count': healthy_count,
            'unhealthy_count': unhealthy_count,
            'results': results,
            'timestamp': datetime.now().isoformat()
        }

        logger.info(f"Storage health check complete: {report}")
        return report

    except Exception as e:
        logger.error(f"Storage health check failed: {e}", exc_info=True)
        return {'error': str(e)}
    finally:
        db.close()


@celery_app.task(name='app.tasks.storage_tasks.update_storage_stats')
def update_storage_stats(storage_location_id: str) -> Dict[str, Any]:
    """
    Update statistics for a specific storage location

    Args:
        storage_location_id: Storage location ID

    Returns:
        Update report
    """
    db = SessionLocal()
    try:
        logger.info(f"Updating storage stats for location: {storage_location_id}")

        location = db.query(StorageLocation).filter(
            StorageLocation.id == storage_location_id
        ).first()

        if not location:
            return {
                'task': 'update_storage_stats',
                'storage_location_id': storage_location_id,
                'status': 'not_found',
                'timestamp': datetime.now().isoformat()
            }

        adapter_manager = get_storage_adapter_manager(db)

        import asyncio
        adapter = asyncio.run(adapter_manager.get_adapter(storage_location_id))

        if not adapter:
            return {
                'task': 'update_storage_stats',
                'storage_location_id': storage_location_id,
                'status': 'adapter_not_available',
                'timestamp': datetime.now().isoformat()
            }

        stats = asyncio.run(adapter.get_stats())

        # Update location stats
        if stats:
            old_size = location.current_size_gb
            old_files = location.current_files

            location.current_size_gb = stats.get('total_size_gb', 0)
            location.current_files = stats.get('file_count', 0)
            location.last_check = datetime.now()
            db.commit()

            report = {
                'task': 'update_storage_stats',
                'storage_location_id': storage_location_id,
                'name': location.name,
                'status': 'updated',
                'old_size_gb': old_size,
                'new_size_gb': location.current_size_gb,
                'old_files': old_files,
                'new_files': location.current_files,
                'usage_percentage': location.usage_percentage,
                'timestamp': datetime.now().isoformat()
            }

            logger.info(f"Storage stats updated: {report}")
            return report
        else:
            return {
                'task': 'update_storage_stats',
                'storage_location_id': storage_location_id,
                'status': 'no_stats',
                'timestamp': datetime.now().isoformat()
            }

    except Exception as e:
        logger.error(f"Storage stats update failed: {e}", exc_info=True)
        return {'error': str(e)}
    finally:
        db.close()
