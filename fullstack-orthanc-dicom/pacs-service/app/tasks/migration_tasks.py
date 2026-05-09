"""
Migration Background Tasks
Handles tier migration and storage optimization
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, Any, List
from sqlalchemy.orm import Session

from app.celery_app import celery_app
from app.database import SessionLocal
from app.models.dicom_file import DicomFile
from app.models.storage_location import StorageLocation
from app.services.dicom_storage_service_v2 import DicomStorageServiceV2

logger = logging.getLogger(__name__)


@celery_app.task(name='app.tasks.migration_tasks.migrate_old_files_to_cold')
def migrate_old_files_to_cold(days_threshold: int = 90, batch_size: int = 100) -> Dict[str, Any]:
    """
    Migrate old files from hot/warm to cold storage

    Args:
        days_threshold: Migrate files older than this many days
        batch_size: Number of files to migrate per batch

    Returns:
        Migration report
    """
    db = SessionLocal()
    try:
        logger.info(f"Starting migration of files older than {days_threshold} days to cold storage")

        cutoff_date = datetime.now() - timedelta(days=days_threshold)

        # Find old files in hot/warm storage that haven't been accessed recently
        old_files = db.query(DicomFile).filter(
            DicomFile.status == 'active',
            DicomFile.storage_tier.in_(['hot', 'warm']),
            DicomFile.created_at < cutoff_date
        ).order_by(DicomFile.accessed_at.asc().nullsfirst()).limit(batch_size).all()

        storage_service = DicomStorageServiceV2(db)

        migrated_count = 0
        failed_count = 0
        total_size_migrated = 0
        failed_files = []

        import asyncio

        for dicom_file in old_files:
            try:
                # Check if file has been accessed recently
                if dicom_file.accessed_at and dicom_file.accessed_at > cutoff_date:
                    continue  # Skip recently accessed files

                success = asyncio.run(storage_service.migrate_file(
                    dicom_file,
                    target_tier='cold',
                    delete_source=True
                ))

                if success:
                    migrated_count += 1
                    total_size_migrated += dicom_file.file_size or 0
                else:
                    failed_count += 1
                    failed_files.append({
                        'sop_instance_uid': dicom_file.sop_instance_uid,
                        'file_path': dicom_file.file_path
                    })

            except Exception as e:
                logger.error(f"Failed to migrate file {dicom_file.sop_instance_uid}: {e}")
                failed_count += 1
                failed_files.append({
                    'sop_instance_uid': dicom_file.sop_instance_uid,
                    'error': str(e)
                })

        report = {
            'task': 'migrate_old_files_to_cold',
            'days_threshold': days_threshold,
            'cutoff_date': cutoff_date.isoformat(),
            'total_candidates': len(old_files),
            'migrated_count': migrated_count,
            'failed_count': failed_count,
            'total_size_migrated_gb': total_size_migrated / (1024 * 1024 * 1024),
            'failed_files': failed_files[:10],  # Limit to first 10
            'timestamp': datetime.now().isoformat()
        }

        logger.info(f"Cold storage migration complete: {report}")
        return report

    except Exception as e:
        logger.error(f"Cold storage migration failed: {e}", exc_info=True)
        return {'error': str(e)}
    finally:
        db.close()


@celery_app.task(name='app.tasks.migration_tasks.migrate_to_tier')
def migrate_to_tier(
    file_ids: List[str],
    target_tier: str,
    delete_source: bool = True
) -> Dict[str, Any]:
    """
    Migrate specific files to target tier

    Args:
        file_ids: List of DicomFile IDs to migrate
        target_tier: Target storage tier (hot/warm/cold)
        delete_source: Whether to delete source after migration

    Returns:
        Migration report
    """
    db = SessionLocal()
    try:
        logger.info(f"Starting migration of {len(file_ids)} files to {target_tier}")

        storage_service = DicomStorageServiceV2(db)

        migrated_count = 0
        failed_count = 0
        total_size_migrated = 0
        results = []

        import asyncio

        for file_id in file_ids:
            try:
                dicom_file = db.query(DicomFile).filter(DicomFile.id == file_id).first()

                if not dicom_file:
                    failed_count += 1
                    results.append({
                        'file_id': file_id,
                        'status': 'not_found'
                    })
                    continue

                success = asyncio.run(storage_service.migrate_file(
                    dicom_file,
                    target_tier=target_tier,
                    delete_source=delete_source
                ))

                if success:
                    migrated_count += 1
                    total_size_migrated += dicom_file.file_size or 0
                    results.append({
                        'file_id': file_id,
                        'sop_instance_uid': dicom_file.sop_instance_uid,
                        'status': 'success',
                        'from_tier': dicom_file.storage_tier,
                        'to_tier': target_tier
                    })
                else:
                    failed_count += 1
                    results.append({
                        'file_id': file_id,
                        'status': 'failed'
                    })

            except Exception as e:
                logger.error(f"Failed to migrate file {file_id}: {e}")
                failed_count += 1
                results.append({
                    'file_id': file_id,
                    'status': 'error',
                    'error': str(e)
                })

        report = {
            'task': 'migrate_to_tier',
            'target_tier': target_tier,
            'total_files': len(file_ids),
            'migrated_count': migrated_count,
            'failed_count': failed_count,
            'total_size_migrated_gb': total_size_migrated / (1024 * 1024 * 1024),
            'results': results,
            'timestamp': datetime.now().isoformat()
        }

        logger.info(f"Tier migration complete: {report}")
        return report

    except Exception as e:
        logger.error(f"Tier migration failed: {e}", exc_info=True)
        return {'error': str(e)}
    finally:
        db.close()


@celery_app.task(name='app.tasks.migration_tasks.rebalance_storage')
def rebalance_storage(tier: str = 'hot') -> Dict[str, Any]:
    """
    Rebalance files across storage locations within a tier

    Args:
        tier: Storage tier to rebalance (hot/warm/cold)

    Returns:
        Rebalance report
    """
    db = SessionLocal()
    try:
        logger.info(f"Starting storage rebalancing for tier: {tier}")

        # Get all active storage locations for the tier
        locations = db.query(StorageLocation).filter(
            StorageLocation.tier == tier,
            StorageLocation.is_active == True,
            StorageLocation.is_online == True
        ).all()

        if len(locations) < 2:
            return {
                'task': 'rebalance_storage',
                'tier': tier,
                'status': 'skipped',
                'reason': 'Less than 2 active locations in tier',
                'timestamp': datetime.now().isoformat()
            }

        # Find overloaded locations (>80% usage)
        overloaded = [loc for loc in locations if loc.usage_percentage > 80]

        # Find underutilized locations (<60% usage)
        underutilized = [loc for loc in locations if loc.usage_percentage < 60]

        if not overloaded or not underutilized:
            return {
                'task': 'rebalance_storage',
                'tier': tier,
                'status': 'balanced',
                'reason': 'No rebalancing needed',
                'timestamp': datetime.now().isoformat()
            }

        storage_service = DicomStorageServiceV2(db)

        rebalanced_count = 0
        failed_count = 0
        total_size_moved = 0

        import asyncio

        # Move files from overloaded to underutilized
        for source_loc in overloaded:
            target_loc = underutilized[0]  # Simple strategy: use first underutilized

            # Get some files from overloaded location
            files_to_move = db.query(DicomFile).filter(
                DicomFile.storage_location_id == source_loc.id,
                DicomFile.status == 'active'
            ).limit(10).all()  # Move 10 files at a time

            for dicom_file in files_to_move:
                try:
                    success = asyncio.run(storage_service.migrate_file(
                        dicom_file,
                        target_tier=tier,
                        target_storage_location_id=str(target_loc.id),
                        delete_source=True
                    ))

                    if success:
                        rebalanced_count += 1
                        total_size_moved += dicom_file.file_size or 0

                        # Refresh location stats
                        db.refresh(source_loc)
                        db.refresh(target_loc)

                        # Check if target is now also overloaded
                        if target_loc.usage_percentage > 80:
                            underutilized.pop(0)
                            if not underutilized:
                                break
                    else:
                        failed_count += 1

                except Exception as e:
                    logger.error(f"Failed to move file {dicom_file.sop_instance_uid}: {e}")
                    failed_count += 1

            if not underutilized:
                break

        report = {
            'task': 'rebalance_storage',
            'tier': tier,
            'rebalanced_count': rebalanced_count,
            'failed_count': failed_count,
            'total_size_moved_gb': total_size_moved / (1024 * 1024 * 1024),
            'overloaded_locations': len(overloaded),
            'underutilized_locations': len(underutilized),
            'timestamp': datetime.now().isoformat()
        }

        logger.info(f"Storage rebalancing complete: {report}")
        return report

    except Exception as e:
        logger.error(f"Storage rebalancing failed: {e}", exc_info=True)
        return {'error': str(e)}
    finally:
        db.close()
