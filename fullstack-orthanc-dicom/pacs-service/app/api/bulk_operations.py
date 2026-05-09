"""
Bulk Operations API
Handles bulk upload, download, and search operations
"""

import logging
import tempfile
import zipfile
import shutil
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, BackgroundTasks, Query
from fastapi.responses import StreamingResponse, FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.middleware.rbac import require_permission
from app.models.dicom_file import DicomFile
from app.services.dicom_storage_service_v2 import DicomStorageServiceV2
from app.tasks.cleanup_tasks import cleanup_orphan_files
from app.tasks.migration_tasks import migrate_to_tier

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/bulk", tags=["Bulk Operations"])


# ============================================================================
# Pydantic Models
# ============================================================================

class BulkUploadRequest(BaseModel):
    """Bulk upload request model"""
    tier: str = 'hot'
    validate_dicom: bool = True
    skip_duplicates: bool = True


class BulkUploadResponse(BaseModel):
    """Bulk upload response model"""
    task_id: str
    total_files: int
    uploaded_count: int
    failed_count: int
    skipped_count: int
    total_size_bytes: int
    results: List[Dict[str, Any]]
    timestamp: str


class BulkDownloadRequest(BaseModel):
    """Bulk download request model"""
    file_ids: List[str]
    format: str = 'zip'  # zip or tar
    include_metadata: bool = True


class BulkSearchRequest(BaseModel):
    """Bulk search request model"""
    patient_id: Optional[str] = None
    study_date_from: Optional[str] = None
    study_date_to: Optional[str] = None
    modality: Optional[str] = None
    storage_tier: Optional[str] = None
    limit: int = 1000


class BulkMigrationRequest(BaseModel):
    """Bulk migration request model"""
    file_ids: List[str]
    target_tier: str
    delete_source: bool = True


# ============================================================================
# Bulk Upload Endpoints
# ============================================================================

@router.post("/upload", response_model=BulkUploadResponse)
async def bulk_upload_dicom(
    files: List[UploadFile] = File(...),
    tier: str = Query('hot', description="Storage tier (hot/warm/cold)"),
    validate_dicom: bool = Query(True, description="Validate DICOM files"),
    skip_duplicates: bool = Query(True, description="Skip duplicate files"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("storage:manage"))
):
    """
    Bulk upload multiple DICOM files

    Args:
        files: List of DICOM files to upload
        tier: Storage tier for files
        validate_dicom: Whether to validate DICOM format
        skip_duplicates: Whether to skip duplicates
        db: Database session

    Returns:
        Upload results
    """
    logger.info(f"Bulk upload started: {len(files)} files")

    storage_service = DicomStorageServiceV2(db)

    uploaded_count = 0
    failed_count = 0
    skipped_count = 0
    total_size_bytes = 0
    results = []

    temp_dir = tempfile.mkdtemp()

    try:
        for upload_file in files:
            file_result = {
                'filename': upload_file.filename,
                'status': 'pending',
                'message': None
            }

            try:
                # Save uploaded file to temp
                temp_path = Path(temp_dir) / upload_file.filename
                with open(temp_path, 'wb') as f:
                    content = await upload_file.read()
                    f.write(content)
                    file_size = len(content)
                    total_size_bytes += file_size

                # Validate DICOM if requested
                if validate_dicom:
                    import pydicom
                    try:
                        pydicom.dcmread(str(temp_path), stop_before_pixels=True)
                    except Exception as e:
                        file_result['status'] = 'invalid'
                        file_result['message'] = f"Invalid DICOM: {str(e)}"
                        failed_count += 1
                        results.append(file_result)
                        continue

                # Store DICOM
                dicom_file = await storage_service.store_dicom(
                    source_path=str(temp_path),
                    tier=tier
                )

                if dicom_file:
                    # Check if was deduplicated
                    if hasattr(dicom_file, '_was_updated') and dicom_file._was_updated and skip_duplicates:
                        file_result['status'] = 'skipped'
                        file_result['message'] = 'Duplicate file (deduplicated)'
                        file_result['sop_instance_uid'] = dicom_file.sop_instance_uid
                        skipped_count += 1
                    else:
                        file_result['status'] = 'success'
                        file_result['message'] = 'Uploaded successfully'
                        file_result['sop_instance_uid'] = dicom_file.sop_instance_uid
                        file_result['file_id'] = str(dicom_file.id)
                        file_result['size_bytes'] = file_size
                        uploaded_count += 1
                else:
                    file_result['status'] = 'failed'
                    file_result['message'] = 'Upload failed'
                    failed_count += 1

            except Exception as e:
                logger.error(f"Error uploading {upload_file.filename}: {e}")
                file_result['status'] = 'error'
                file_result['message'] = str(e)
                failed_count += 1

            results.append(file_result)

        # Cleanup temp directory
        shutil.rmtree(temp_dir, ignore_errors=True)

        response = BulkUploadResponse(
            task_id=f"bulk_upload_{datetime.now().strftime('%Y%m%d%H%M%S')}",
            total_files=len(files),
            uploaded_count=uploaded_count,
            failed_count=failed_count,
            skipped_count=skipped_count,
            total_size_bytes=total_size_bytes,
            results=results,
            timestamp=datetime.now().isoformat()
        )

        logger.info(
            f"Bulk upload completed: {uploaded_count} uploaded, "
            f"{failed_count} failed, {skipped_count} skipped"
        )

        return response

    except Exception as e:
        logger.error(f"Bulk upload failed: {e}", exc_info=True)
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Bulk upload failed: {str(e)}")


@router.post("/upload/zip")
async def bulk_upload_from_zip(
    zip_file: UploadFile = File(...),
    tier: str = Query('hot', description="Storage tier"),
    validate_dicom: bool = Query(True, description="Validate DICOM files"),
    skip_duplicates: bool = Query(True, description="Skip duplicates"),
    db: Session = Depends(get_db)
):
    """
    Bulk upload DICOM files from a ZIP archive

    Args:
        zip_file: ZIP file containing DICOM files
        tier: Storage tier
        validate_dicom: Validate DICOM format
        skip_duplicates: Skip duplicates
        db: Database session

    Returns:
        Upload results
    """
    logger.info(f"Bulk upload from ZIP: {zip_file.filename}")

    temp_dir = tempfile.mkdtemp()
    extract_dir = Path(temp_dir) / "extracted"
    extract_dir.mkdir()

    try:
        # Save ZIP file
        zip_path = Path(temp_dir) / zip_file.filename
        with open(zip_path, 'wb') as f:
            content = await zip_file.read()
            f.write(content)

        # Extract ZIP
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_dir)

        # Find all DICOM files
        dicom_files = []
        for file_path in extract_dir.rglob('*'):
            if file_path.is_file():
                # Check if it's a DICOM file by extension or content
                if file_path.suffix.lower() in ['.dcm', '.dicom', '']:
                    dicom_files.append(file_path)

        logger.info(f"Found {len(dicom_files)} files in ZIP archive")

        storage_service = DicomStorageServiceV2(db)

        uploaded_count = 0
        failed_count = 0
        skipped_count = 0
        total_size_bytes = 0
        results = []

        for dicom_path in dicom_files:
            file_result = {
                'filename': dicom_path.name,
                'path': str(dicom_path.relative_to(extract_dir)),
                'status': 'pending',
                'message': None
            }

            try:
                file_size = dicom_path.stat().st_size
                total_size_bytes += file_size

                # Validate DICOM if requested
                if validate_dicom:
                    import pydicom
                    try:
                        pydicom.dcmread(str(dicom_path), stop_before_pixels=True)
                    except Exception as e:
                        file_result['status'] = 'invalid'
                        file_result['message'] = f"Invalid DICOM: {str(e)}"
                        failed_count += 1
                        results.append(file_result)
                        continue

                # Store DICOM
                dicom_file = await storage_service.store_dicom(
                    source_path=str(dicom_path),
                    tier=tier
                )

                if dicom_file:
                    if hasattr(dicom_file, '_was_updated') and dicom_file._was_updated and skip_duplicates:
                        file_result['status'] = 'skipped'
                        file_result['message'] = 'Duplicate file'
                        skipped_count += 1
                    else:
                        file_result['status'] = 'success'
                        file_result['message'] = 'Uploaded successfully'
                        file_result['file_id'] = str(dicom_file.id)
                        uploaded_count += 1
                else:
                    file_result['status'] = 'failed'
                    file_result['message'] = 'Upload failed'
                    failed_count += 1

            except Exception as e:
                logger.error(f"Error uploading {dicom_path.name}: {e}")
                file_result['status'] = 'error'
                file_result['message'] = str(e)
                failed_count += 1

            results.append(file_result)

        # Cleanup
        shutil.rmtree(temp_dir, ignore_errors=True)

        return {
            'task_id': f"bulk_upload_zip_{datetime.now().strftime('%Y%m%d%H%M%S')}",
            'total_files': len(dicom_files),
            'uploaded_count': uploaded_count,
            'failed_count': failed_count,
            'skipped_count': skipped_count,
            'total_size_bytes': total_size_bytes,
            'results': results,
            'timestamp': datetime.now().isoformat()
        }

    except Exception as e:
        logger.error(f"Bulk upload from ZIP failed: {e}", exc_info=True)
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Bulk upload failed: {str(e)}")


# ============================================================================
# Bulk Download Endpoints
# ============================================================================

@router.post("/download")
async def bulk_download_dicom(
    request: BulkDownloadRequest,
    db: Session = Depends(get_db)
):
    """
    Bulk download DICOM files as ZIP archive

    Args:
        request: Download request with file IDs
        db: Database session

    Returns:
        ZIP file stream
    """
    logger.info(f"Bulk download requested: {len(request.file_ids)} files")

    storage_service = DicomStorageServiceV2(db)

    # Create temp directory for files
    temp_dir = tempfile.mkdtemp()
    zip_path = Path(temp_dir) / f"dicom_export_{datetime.now().strftime('%Y%m%d%H%M%S')}.zip"

    try:
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            for file_id in request.file_ids:
                try:
                    # Get DICOM file record
                    dicom_file = db.query(DicomFile).filter(DicomFile.id == file_id).first()

                    if not dicom_file:
                        logger.warning(f"File not found: {file_id}")
                        continue

                    # Retrieve file
                    temp_path = await storage_service.retrieve_dicom(dicom_file)

                    if temp_path and Path(temp_path).exists():
                        # Add to ZIP with proper path structure
                        archive_name = f"{dicom_file.study_id}/{dicom_file.series_id}/{dicom_file.instance_id}.dcm"
                        zip_file.write(temp_path, archive_name)

                        # Add metadata if requested
                        if request.include_metadata:
                            metadata = dicom_file.to_dict()
                            import json
                            metadata_name = f"{dicom_file.study_id}/{dicom_file.series_id}/{dicom_file.instance_id}.json"
                            zip_file.writestr(metadata_name, json.dumps(metadata, indent=2))

                        # Cleanup temp file
                        if '/tmp/' in temp_path:
                            Path(temp_path).unlink()

                except Exception as e:
                    logger.error(f"Error downloading file {file_id}: {e}")
                    continue

        # Return ZIP file
        return FileResponse(
            path=str(zip_path),
            filename=zip_path.name,
            media_type='application/zip',
            background=BackgroundTasks().add_task(lambda: shutil.rmtree(temp_dir, ignore_errors=True))
        )

    except Exception as e:
        logger.error(f"Bulk download failed: {e}", exc_info=True)
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Bulk download failed: {str(e)}")


# ============================================================================
# Bulk Migration Endpoints
# ============================================================================

@router.post("/migrate")
async def bulk_migrate_files(
    request: BulkMigrationRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Bulk migrate files to different tier (background task)

    Args:
        request: Migration request
        background_tasks: FastAPI background tasks
        db: Database session

    Returns:
        Task initiation response
    """
    logger.info(f"Bulk migration requested: {len(request.file_ids)} files to {request.target_tier}")

    # Validate tier
    if request.target_tier not in ['hot', 'warm', 'cold']:
        raise HTTPException(status_code=400, detail="Invalid target tier")

    # Queue background task
    task = migrate_to_tier.delay(
        file_ids=request.file_ids,
        target_tier=request.target_tier,
        delete_source=request.delete_source
    )

    return {
        'task_id': task.id,
        'status': 'queued',
        'message': f'Migration task queued for {len(request.file_ids)} files',
        'target_tier': request.target_tier,
        'timestamp': datetime.now().isoformat()
    }


# ============================================================================
# Bulk Search Endpoints
# ============================================================================

@router.post("/search")
async def bulk_search_files(
    request: BulkSearchRequest,
    db: Session = Depends(get_db)
):
    """
    Bulk search for DICOM files

    Args:
        request: Search request
        db: Database session

    Returns:
        Search results
    """
    logger.info(f"Bulk search requested")

    query = db.query(DicomFile).filter(DicomFile.status == 'active')

    # Apply filters
    if request.patient_id:
        query = query.filter(DicomFile.patient_id == request.patient_id)

    if request.study_date_from:
        from datetime import datetime
        date_from = datetime.fromisoformat(request.study_date_from).date()
        query = query.filter(DicomFile.study_date >= date_from)

    if request.study_date_to:
        from datetime import datetime
        date_to = datetime.fromisoformat(request.study_date_to).date()
        query = query.filter(DicomFile.study_date <= date_to)

    if request.modality:
        query = query.filter(DicomFile.modality == request.modality)

    if request.storage_tier:
        query = query.filter(DicomFile.storage_tier == request.storage_tier)

    # Execute query with limit
    files = query.limit(request.limit).all()

    results = [
        {
            'id': str(f.id),
            'sop_instance_uid': f.sop_instance_uid,
            'patient_id': f.patient_id,
            'patient_name': f.patient_name,
            'study_date': f.study_date.isoformat() if f.study_date else None,
            'modality': f.modality,
            'storage_tier': f.storage_tier,
            'file_size': f.file_size,
            'created_at': f.created_at.isoformat() if f.created_at else None
        }
        for f in files
    ]

    return {
        'total_results': len(results),
        'limit': request.limit,
        'results': results,
        'timestamp': datetime.now().isoformat()
    }


# ============================================================================
# Task Status Endpoints
# ============================================================================

@router.get("/tasks/{task_id}")
async def get_task_status(task_id: str):
    """
    Get status of a background task

    Args:
        task_id: Task ID

    Returns:
        Task status
    """
    from celery.result import AsyncResult

    task = AsyncResult(task_id)

    return {
        'task_id': task_id,
        'state': task.state,
        'result': task.result if task.ready() else None,
        'timestamp': datetime.now().isoformat()
    }
