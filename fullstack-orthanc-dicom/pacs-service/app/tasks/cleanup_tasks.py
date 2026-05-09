"""
Cleanup Background Tasks
Handles orphan file cleanup and storage maintenance
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, Any
from sqlalchemy.orm import Session

from app.celery_app import celery_app
from app.database import SessionLocal
from app.models.dicom_file import DicomFile
from app.models.storage_location import StorageLocation
from app.services.dicom_storage_service_v2 import DicomStorageServiceV2

logger = logging.getLogger(__name__)


@celery_app.task(name='app.tasks.cleanup_tasks.cleanup_orphan_files')
def cleanup_orphan_files(
    storage_location_id: str = None,
    dry_run: bool = False
) -> Dict[str, Any]:
    """
    Cleanup orphan files from storage

    Args:
        storage_location_id: Optional specific storage location
        dry_run: If True, only report without cleanup

    Returns:
        Cleanup report
    """
    db = SessionLocal()
    try:
        logger.info(f"Starting orphan cleanup (dry_run={dry_run})")

        storage_service = DicomStorageServiceV2(db)

        # Use asyncio to run async method
        import asyncio
        report = asyncio.run(storage_service.scan_orphans(
            storage_location_id=storage_location_id,
            dry_run=dry_run
        ))

        logger.info(f"Orphan cleanup complete: {report}")
        return report

    except Exception as e:
        logger.error(f"Orphan cleanup failed: {e}", exc_info=True)
        return {'error': str(e)}
    finally:
        db.close()


@celery_app.task(name='app.tasks.cleanup_tasks.cleanup_deleted_files')
def cleanup_deleted_files(days_old: int = 365) -> Dict[str, Any]:
    """
    Permanently delete soft-deleted files older than specified days (Zero-Cost strategy: default 365 days)

    Args:
        days_old: Delete files older than this many days

    Returns:
        Cleanup report
    """
    db = SessionLocal()
    try:
        logger.info(f"Cleaning up deleted files older than {days_old} days")

        cutoff_date = datetime.now() - timedelta(days=days_old)

        # Find soft-deleted files older than cutoff
        deleted_files = db.query(DicomFile).filter(
            DicomFile.status == 'deleted',
            DicomFile.updated_at < cutoff_date
        ).all()

        storage_service = DicomStorageServiceV2(db)

        cleaned_count = 0
        failed_count = 0
        total_size_freed = 0

        import asyncio

        for dicom_file in deleted_files:
            try:
                file_size = dicom_file.file_size or 0
                # Fix bug: pass sop_instance_uid string instead of file object
                success = asyncio.run(storage_service.delete_dicom(
                    dicom_file.sop_instance_uid,
                    hard_delete=True
                ))

                if success:
                    cleaned_count += 1
                    total_size_freed += file_size
                else:
                    failed_count += 1

            except Exception as e:
                logger.error(f"Failed to delete file {dicom_file.sop_instance_uid}: {e}")
                failed_count += 1

        report = {
            'task': 'cleanup_deleted_files',
            'cutoff_date': cutoff_date.isoformat(),
            'total_files_found': len(deleted_files),
            'cleaned_count': cleaned_count,
            'failed_count': failed_count,
            'total_size_freed_gb': total_size_freed / (1024 * 1024 * 1024),
            'timestamp': datetime.now().isoformat()
        }

        logger.info(f"Deleted files cleanup complete: {report}")
        return report

    except Exception as e:
        logger.error(f"Deleted files cleanup failed: {e}", exc_info=True)
        return {'error': str(e)}
    finally:
        db.close()


@celery_app.task(name='app.tasks.cleanup_tasks.cleanup_old_archived_files')
def cleanup_old_archived_files(days_old: int = 365) -> Dict[str, Any]:
    """
    Cleanup archived files older than specified days

    Args:
        days_old: Archive retention period in days

    Returns:
        Cleanup report
    """
    db = SessionLocal()
    try:
        logger.info(f"Cleaning up archived files older than {days_old} days")

        cutoff_date = datetime.now() - timedelta(days=days_old)

        # Find archived files older than retention period
        archived_files = db.query(DicomFile).filter(
            DicomFile.status == 'archived',
            DicomFile.storage_tier == 'deleted',
            DicomFile.updated_at < cutoff_date
        ).all()

        storage_service = DicomStorageServiceV2(db)

        cleaned_count = 0
        failed_count = 0
        total_size_freed = 0

        import asyncio

        for dicom_file in archived_files:
            try:
                file_size = dicom_file.file_size or 0
                # Fix bug: pass sop_instance_uid string instead of file object
                success = asyncio.run(storage_service.delete_dicom(
                    dicom_file.sop_instance_uid,
                    hard_delete=True
                ))

                if success:
                    cleaned_count += 1
                    total_size_freed += file_size
                else:
                    failed_count += 1

            except Exception as e:
                logger.error(f"Failed to delete archived file {dicom_file.sop_instance_uid}: {e}")
                failed_count += 1

        report = {
            'task': 'cleanup_old_archived_files',
            'cutoff_date': cutoff_date.isoformat(),
            'retention_days': days_old,
            'total_files_found': len(archived_files),
            'cleaned_count': cleaned_count,
            'failed_count': failed_count,
            'total_size_freed_gb': total_size_freed / (1024 * 1024 * 1024),
            'timestamp': datetime.now().isoformat()
        }

        logger.info(f"Archived files cleanup complete: {report}")
        return report

    except Exception as e:
        logger.error(f"Archived files cleanup failed: {e}", exc_info=True)
        return {'error': str(e)}
    finally:
        db.close()


@celery_app.task(name='app.tasks.cleanup_tasks.verify_file_integrity')
def verify_file_integrity(storage_location_id: str = None) -> Dict[str, Any]:
    """
    Verify file integrity by checking hashes

    Args:
        storage_location_id: Optional specific storage location

    Returns:
        Verification report
    """
    db = SessionLocal()
    try:
        logger.info("Starting file integrity verification")

        # Query active files
        query = db.query(DicomFile).filter(DicomFile.status == 'active')
        if storage_location_id:
            query = query.filter(DicomFile.storage_location_id == storage_location_id)

        files = query.limit(1000).all()  # Batch process

        storage_service = DicomStorageServiceV2(db)

        verified_count = 0
        corrupted_count = 0
        missing_count = 0
        corrupted_files = []

        import asyncio

        for dicom_file in files:
            try:
                # Try to retrieve and verify hash
                temp_path = asyncio.run(storage_service.retrieve_dicom(
                    dicom_file,
                    verify_hash=True
                ))

                if temp_path:
                    verified_count += 1
                    # Cleanup temp file
                    import os
                    if os.path.exists(temp_path) and '/tmp/' in temp_path:
                        os.unlink(temp_path)
                else:
                    missing_count += 1
                    corrupted_files.append({
                        'sop_instance_uid': dicom_file.sop_instance_uid,
                        'file_path': dicom_file.file_path,
                        'reason': 'missing'
                    })

            except Exception as e:
                corrupted_count += 1
                corrupted_files.append({
                    'sop_instance_uid': dicom_file.sop_instance_uid,
                    'file_path': dicom_file.file_path,
                    'reason': str(e)
                })

        report = {
            'task': 'verify_file_integrity',
            'total_checked': len(files),
            'verified_count': verified_count,
            'corrupted_count': corrupted_count,
            'missing_count': missing_count,
            'corrupted_files': corrupted_files[:10],  # Limit to first 10
            'timestamp': datetime.now().isoformat()
        }

        logger.info(f"File integrity verification complete: {report}")
        return report

    except Exception as e:
        logger.error(f"File integrity verification failed: {e}", exc_info=True)
        return {'error': str(e)}
    finally:
        db.close()
