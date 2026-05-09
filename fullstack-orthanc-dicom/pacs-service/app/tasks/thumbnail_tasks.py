"""
Thumbnail Generation Background Tasks
Handles automatic thumbnail generation for DICOM files
"""

import logging
from datetime import datetime
from typing import Dict, Any, List
from sqlalchemy.orm import Session

from app.celery_app import celery_app
from app.database import SessionLocal
from app.models.dicom_file import DicomFile
from app.services.thumbnail_generator import ThumbnailGenerator
from app.services.dicom_storage_service_v2 import DicomStorageServiceV2

logger = logging.getLogger(__name__)


@celery_app.task(name='app.tasks.thumbnail_tasks.generate_thumbnail')
def generate_thumbnail(
    dicom_file_id: str,
    sizes: List[str] = None,
    force: bool = False
) -> Dict[str, Any]:
    """
    Generate thumbnails for a specific DICOM file

    Args:
        dicom_file_id: DicomFile ID
        sizes: List of thumbnail sizes to generate (default: all)
        force: Force regeneration even if exists

    Returns:
        Generation report
    """
    db = SessionLocal()
    try:
        logger.info(f"Generating thumbnails for DICOM file: {dicom_file_id}")

        # Get DICOM file record
        dicom_file = db.query(DicomFile).filter(
            DicomFile.id == dicom_file_id
        ).first()

        if not dicom_file:
            return {
                'error': f'DICOM file not found: {dicom_file_id}',
                'timestamp': datetime.now().isoformat()
            }

        # Retrieve DICOM file
        storage_service = DicomStorageServiceV2(db)

        import asyncio
        temp_path = asyncio.run(storage_service.retrieve_dicom(dicom_file))

        if not temp_path:
            return {
                'error': 'Failed to retrieve DICOM file',
                'timestamp': datetime.now().isoformat()
            }

        # Generate thumbnails
        thumbnail_generator = ThumbnailGenerator()

        if sizes:
            # Generate specific sizes
            results = {}
            for size in sizes:
                thumbnail_path = thumbnail_generator.generate(
                    temp_path,
                    dicom_file.file_hash,
                    size=size,
                    force=force
                )
                results[size] = thumbnail_path
        else:
            # Generate all sizes
            results = thumbnail_generator.generate_all_sizes(
                temp_path,
                dicom_file.file_hash,
                force=force
            )

        # Cleanup temp file
        import os
        if '/tmp/' in temp_path:
            try:
                os.unlink(temp_path)
            except Exception:
                pass

        report = {
            'dicom_file_id': dicom_file_id,
            'sop_instance_uid': dicom_file.sop_instance_uid,
            'thumbnails': results,
            'timestamp': datetime.now().isoformat()
        }

        logger.info(f"Thumbnails generated: {len(results)} sizes")
        return report

    except Exception as e:
        logger.error(f"Thumbnail generation failed: {e}", exc_info=True)
        return {'error': str(e)}
    finally:
        db.close()


@celery_app.task(name='app.tasks.thumbnail_tasks.generate_missing_thumbnails')
def generate_missing_thumbnails(
    batch_size: int = 50,
    size: str = 'medium'
) -> Dict[str, Any]:
    """
    Generate thumbnails for DICOM files that don't have them

    Args:
        batch_size: Number of files to process in this batch
        size: Thumbnail size to check/generate

    Returns:
        Generation report
    """
    db = SessionLocal()
    try:
        logger.info(f"Generating missing thumbnails (batch_size={batch_size}, size={size})")

        # Get active DICOM files
        dicom_files = db.query(DicomFile).filter(
            DicomFile.status == 'active'
        ).limit(batch_size).all()

        thumbnail_generator = ThumbnailGenerator()
        storage_service = DicomStorageServiceV2(db)

        generated_count = 0
        failed_count = 0
        skipped_count = 0

        import asyncio
        import os

        for dicom_file in dicom_files:
            try:
                # Check if thumbnail already exists
                existing_thumbnail = thumbnail_generator.get_thumbnail(
                    dicom_file.file_hash,
                    size=size
                )

                if existing_thumbnail:
                    skipped_count += 1
                    continue

                # Retrieve DICOM file
                temp_path = asyncio.run(storage_service.retrieve_dicom(dicom_file))

                if not temp_path:
                    failed_count += 1
                    continue

                # Generate thumbnail
                thumbnail_path = thumbnail_generator.generate(
                    temp_path,
                    dicom_file.file_hash,
                    size=size,
                    force=False
                )

                # Cleanup temp file
                if '/tmp/' in temp_path:
                    try:
                        os.unlink(temp_path)
                    except Exception:
                        pass

                if thumbnail_path:
                    generated_count += 1
                else:
                    failed_count += 1

            except Exception as e:
                logger.error(f"Failed to generate thumbnail for {dicom_file.sop_instance_uid}: {e}")
                failed_count += 1

        report = {
            'task': 'generate_missing_thumbnails',
            'batch_size': batch_size,
            'size': size,
            'total_checked': len(dicom_files),
            'generated_count': generated_count,
            'skipped_count': skipped_count,
            'failed_count': failed_count,
            'timestamp': datetime.now().isoformat()
        }

        logger.info(f"Missing thumbnails generation complete: {report}")
        return report

    except Exception as e:
        logger.error(f"Batch thumbnail generation failed: {e}", exc_info=True)
        return {'error': str(e)}
    finally:
        db.close()


@celery_app.task(name='app.tasks.thumbnail_tasks.cleanup_orphan_thumbnails')
def cleanup_orphan_thumbnails() -> Dict[str, Any]:
    """
    Remove thumbnails for deleted DICOM files

    Returns:
        Cleanup report
    """
    db = SessionLocal()
    try:
        logger.info("Cleaning up orphaned thumbnails...")

        # Get all active DICOM file hashes
        active_hashes = set(
            hash_row[0] for hash_row in
            db.query(DicomFile.file_hash).filter(
                DicomFile.status == 'active',
                DicomFile.file_hash.isnot(None)
            ).all()
        )

        logger.info(f"Found {len(active_hashes)} active DICOM files")

        # Cleanup orphaned thumbnails
        thumbnail_generator = ThumbnailGenerator()
        report = thumbnail_generator.cleanup_orphans(active_hashes)

        report['task'] = 'cleanup_orphan_thumbnails'
        report['active_files'] = len(active_hashes)
        report['timestamp'] = datetime.now().isoformat()

        logger.info(f"Orphaned thumbnails cleanup complete: {report}")
        return report

    except Exception as e:
        logger.error(f"Thumbnail cleanup failed: {e}", exc_info=True)
        return {'error': str(e)}
    finally:
        db.close()


@celery_app.task(name='app.tasks.thumbnail_tasks.regenerate_thumbnails')
def regenerate_thumbnails(
    modality: str = None,
    batch_size: int = 100
) -> Dict[str, Any]:
    """
    Regenerate thumbnails for specific modality or all files

    Args:
        modality: Optional modality filter (e.g., 'CT', 'MR')
        batch_size: Number of files to process

    Returns:
        Regeneration report
    """
    db = SessionLocal()
    try:
        logger.info(f"Regenerating thumbnails (modality={modality}, batch={batch_size})")

        # Query DICOM files
        query = db.query(DicomFile).filter(DicomFile.status == 'active')

        if modality:
            query = query.filter(DicomFile.modality == modality)

        dicom_files = query.limit(batch_size).all()

        thumbnail_generator = ThumbnailGenerator()
        storage_service = DicomStorageServiceV2(db)

        regenerated_count = 0
        failed_count = 0

        import asyncio
        import os

        for dicom_file in dicom_files:
            try:
                # Retrieve DICOM file
                temp_path = asyncio.run(storage_service.retrieve_dicom(dicom_file))

                if not temp_path:
                    failed_count += 1
                    continue

                # Regenerate all sizes
                results = thumbnail_generator.generate_all_sizes(
                    temp_path,
                    dicom_file.file_hash,
                    force=True  # Force regeneration
                )

                # Cleanup temp file
                if '/tmp/' in temp_path:
                    try:
                        os.unlink(temp_path)
                    except Exception:
                        pass

                # Count successful generations
                success_count = sum(1 for path in results.values() if path)
                if success_count > 0:
                    regenerated_count += 1
                else:
                    failed_count += 1

            except Exception as e:
                logger.error(f"Failed to regenerate thumbnails for {dicom_file.sop_instance_uid}: {e}")
                failed_count += 1

        report = {
            'task': 'regenerate_thumbnails',
            'modality': modality,
            'batch_size': batch_size,
            'total_processed': len(dicom_files),
            'regenerated_count': regenerated_count,
            'failed_count': failed_count,
            'timestamp': datetime.now().isoformat()
        }

        logger.info(f"Thumbnail regeneration complete: {report}")
        return report

    except Exception as e:
        logger.error(f"Thumbnail regeneration failed: {e}", exc_info=True)
        return {'error': str(e)}
    finally:
        db.close()
