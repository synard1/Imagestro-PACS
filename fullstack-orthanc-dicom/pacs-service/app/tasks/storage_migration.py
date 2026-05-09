"""
Storage Migration Executor Task
Processes cross-backend storage migration jobs
"""

import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.celery_app import celery_app
from app.database import SessionLocal
from app.models.storage_migration import StorageMigration
from app.models.study import Study
from app.models.dicom_file import DicomFile
from app.services.dicom_storage_service_v2 import DicomStorageServiceV2
from app.services.storage_adapter_manager import get_storage_adapter_manager

logger = logging.getLogger(__name__)


@celery_app.task(
    name='app.tasks.storage_migration.execute_provider_migration',
    bind=True,
    max_retries=3,
    default_retry_delay=300  # 5 minutes
)
def execute_provider_migration(self, migration_id: str) -> Dict[str, Any]:
    """
    Execute a storage migration job (cross-backend data transfer).

    Args:
        migration_id: UUID of the StorageMigration record to process

    Returns:
        Migration execution report
    """
    db = SessionLocal()
    try:
        # Fetch migration record
        migration = db.query(StorageMigration).filter(
            StorageMigration.id == migration_id
        ).first()

        if not migration:
            logger.error(f"Migration {migration_id} not found")
            return {'error': 'Migration not found', 'migration_id': migration_id}

        # Check if already processed
        if migration.status not in ['pending', 'running']:
            logger.info(f"Migration {migration_id} status is {migration.status}, skipping")
            return {
                'status': migration.status,
                'migration_id': migration_id,
                'message': f'Migration already {migration.status}'
            }

        # Mark as running
        migration.status = 'running'
        migration.started_at = datetime.now()
        migration.items_completed = 0
        migration.error_message = None
        db.commit()

        logger.info(
            f"Starting migration {migration_id}: "
            f"tenant={migration.tenant_id}, "
            f"from={migration.from_storage_id}, "
            f"to={migration.to_storage_id}, "
            f"scope={migration.scope}"
        )

        # Build query for studies to migrate
        studies_query = db.query(Study).filter(
            Study.storage_id == migration.from_storage_id,
            Study.deleted_at.is_(None)
        )

        # Apply scope filters
        if migration.scope == "tenant":
            studies_query = studies_query.filter(Study.tenant_id == migration.tenant_id)
        elif migration.scope == "patient" and migration.scope_filter:
            patient_id = migration.scope_filter.get("patient_id")
            if patient_id:
                studies_query = studies_query.filter(Study.patient_id == patient_id)
        elif migration.scope == "study" and migration.scope_filter:
            study_uid = migration.scope_filter.get("study_instance_uid")
            if study_uid:
                studies_query = studies_query.filter(Study.study_instance_uid == study_uid)
        elif migration.scope == "date_range" and migration.scope_filter:
            date_from = migration.scope_filter.get("date_from")
            date_to = migration.scope_filter.get("date_to")
            if date_from:
                studies_query = studies_query.filter(Study.study_date >= date_from)
            if date_to:
                studies_query = studies_query.filter(Study.study_date <= date_to)

        # Get all matching studies
        studies = studies_query.all()
        total_studies = len(studies)
        total_files = 0
        migrated_files = 0
        failed_files = 0

        logger.info(f"Migration {migration_id}: Found {total_studies} studies to process")

        # Initialize storage service with tenant context
        storage_service = DicomStorageServiceV2(db, tenant_id=str(migration.tenant_id))

        # Process each study
        for study_idx, study in enumerate(studies, 1):
            try:
                logger.info(
                    f"Migrating study {study_idx}/{total_studies}: "
                    f"{study.study_instance_uid} ({study.patient_name})"
                )

                # Get all series for this study
                series_list = study.series
                if not series_list:
                    logger.warning(f"Study {study.study_instance_uid} has no series, skipping")
                    continue

                # Process each series and its instances
                for series in series_list:
                    instances = series.instances
                    if not instances:
                        continue

                    for dicom_file in instances:
                        total_files += 1
                        try:
                            # Migrate single file
                            success = migrate_single_file(
                                db,
                                storage_service,
                                dicom_file,
                                str(migration.to_storage_id)
                            )

                            if success:
                                migrated_files += 1
                            else:
                                failed_files += 1
                                logger.error(
                                    f"Failed to migrate file "
                                    f"{dicom_file.sop_instance_uid} in study {study.study_instance_uid}"
                                )

                        except Exception as e:
                            failed_files += 1
                            logger.error(
                                f"Error migrating file {dicom_file.sop_instance_uid}: {e}",
                                exc_info=True
                            )

                # After all files in study are processed, update study storage_id
                study.storage_id = migration.to_storage_id
                db.commit()

                logger.info(
                    f"Completed study {study_idx}/{total_studies}: "
                    f"{migrated_files} files migrated, {failed_files} failed"
                )

            except Exception as e:
                logger.error(f"Failed to process study {study.study_instance_uid}: {e}", exc_info=True)
                # Continue with next study

        # Update migration record
        migration.status = 'completed' if failed_files == 0 else 'completed_with_errors'
        migration.items_completed = migrated_files
        migration.completed_at = datetime.now()
        if failed_files > 0:
            migration.error_message = f"Completed with {failed_files} file failures"
        db.commit()

        report = {
            'migration_id': str(migration_id),
            'status': migration.status,
            'tenant_id': str(migration.tenant_id),
            'from_storage_id': str(migration.from_storage_id),
            'to_storage_id': str(migration.to_storage_id),
            'scope': migration.scope,
            'total_studies': total_studies,
            'total_files': total_files,
            'migrated_files': migrated_files,
            'failed_files': failed_files,
            'started_at': migration.started_at.isoformat() if migration.started_at else None,
            'completed_at': migration.completed_at.isoformat() if migration.completed_at else None,
            'duration_seconds': (
                (migration.completed_at - migration.started_at).total_seconds()
                if migration.started_at and migration.completed_at else None
            )
        }

        logger.info(f"Migration {migration_id} complete: {report}")
        return report

    except Exception as e:
        logger.error(f"Migration {migration_id} failed critically: {e}", exc_info=True)

        # Update migration as failed
        try:
            migration = db.query(StorageMigration).filter(
                StorageMigration.id == migration_id
            ).first()
            if migration:
                migration.status = 'failed'
                migration.error_message = str(e)
                migration.completed_at = datetime.now()
                db.commit()
        except Exception as db_err:
            logger.error(f"Failed to update migration status: {db_err}")
            db.rollback()

        # Retry if appropriate
        if self.request.retries < self.max_retries:
            raise self.retry(exc=e, countdown=60)

        return {
            'error': str(e),
            'migration_id': migration_id,
            'status': 'failed'
        }

    finally:
        db.close()


def migrate_single_file(
    db: Session,
    storage_service: DicomStorageServiceV2,
    dicom_file: DicomFile,
    target_storage_id: str
) -> bool:
    """
    Migrate a single DICOM file from source to destination storage.

    Args:
        db: Database session
        storage_service: Storage service instance (with tenant context)
        dicom_file: DicomFile record to migrate
        target_storage_id: UUID of target storage backend

    Returns:
        True if successful, False otherwise
    """
    import asyncio

    try:
        # Retrieve file from source storage
        # The file may be in source backend or could be on filesystem if legacy
        temp_path = asyncio.run(storage_service.retrieve_dicom(dicom_file))

        if not temp_path:
            logger.error(f"Failed to retrieve file {dicom_file.sop_instance_uid}")
            return False

        # Read file metadata to ensure we have fresh DICOM tags
        import pydicom
        ds = pydicom.dcmread(temp_path, stop_before_pixels=True)

        # Prepare metadata for storage
        metadata = {
            'study_id': dicom_file.study_id,
            'series_id': dicom_file.series_id,
            'instance_id': dicom_file.instance_id,
            'sop_instance_uid': dicom_file.sop_instance_uid,
            'sop_class_uid': dicom_file.sop_class_uid,
            'patient_id': str(dicom_file.patient_id) if dicom_file.patient_id else 'unknown',
            'patient_name': dicom_file.patient_name or '',
            'modality': dicom_file.modality or '',
        }

        # target_storage_id is a StorageBackend.id
        from app.storage.adapter_factory import get_adapter_by_id
        target_adapter = get_adapter_by_id(db, target_storage_id)

        if not target_adapter:
            logger.error(f"Failed to load target storage adapter {target_storage_id}")
            return False

        # Generate storage key
        p_id = "".join(c for c in str(dicom_file.patient_id or 'unknown') if c.isalnum())
        t_id = storage_service.tenant_id if storage_service.tenant_id != '00000000-0000-0000-0000-000000000000' else "default-tenant"
        storage_key = f"{t_id}/dicom/{p_id}/studies/{dicom_file.study_id}/{dicom_file.series_id}/{dicom_file.instance_id}.dcm"

        # Upload
        asyncio.run(target_adapter.store(temp_path, storage_key))

        import os
        from pathlib import Path
        file_size = Path(temp_path).stat().st_size
        file_hash = asyncio.run(storage_service._calculate_file_hash(temp_path))

        # Update the original DicomFile record to point to new location
        dicom_file.storage_location_id = None  # Clear location ID since we use backend_id
        dicom_file.file_path = storage_key
        dicom_file.file_size = file_size
        dicom_file.file_hash = file_hash

        # Update metadata with storage_backend_id
        meta = dicom_file.dicom_metadata or {}
        meta['storage_backend_id'] = target_storage_id
        dicom_file.dicom_metadata = meta

        db.commit()

        # Cleanup temp file
        try:
            import os
            os.remove(temp_path)
        except OSError:
            pass

        logger.debug(f"Successfully migrated file {dicom_file.sop_instance_uid}")
        return True

    except Exception as e:
        logger.error(
            f"Error in migrate_single_file for {dicom_file.sop_instance_uid}: {e}",
            exc_info=True
        )
        db.rollback()
        return False
