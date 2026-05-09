"""
Thumbnail API
Endpoints for DICOM thumbnail generation and retrieval
"""

import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from pathlib import Path

from app.database import get_db
from app.models.dicom_file import DicomFile
from app.services.thumbnail_generator import ThumbnailGenerator
from app.tasks.thumbnail_tasks import generate_thumbnail, generate_missing_thumbnails

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/thumbnails", tags=["Thumbnails"])


# ============================================================================
# Pydantic Models
# ============================================================================

class ThumbnailGenerateRequest(BaseModel):
    """Thumbnail generation request"""
    dicom_file_id: str
    sizes: Optional[List[str]] = None
    force: bool = False


class ThumbnailStatsResponse(BaseModel):
    """Thumbnail statistics response"""
    total_thumbnails: int
    total_size_mb: float
    size_breakdown: dict
    format: str
    available_sizes: List[str]
    timestamp: str


# ============================================================================
# API Endpoints
# ============================================================================

@router.get("/{file_id}")
async def get_thumbnail(
    file_id: str,
    size: str = Query('medium', description="Thumbnail size (small/medium/large/preview)"),
    db: Session = Depends(get_db)
):
    """
    Get thumbnail for DICOM file

    Args:
        file_id: DicomFile ID
        size: Thumbnail size preset

    Returns:
        Thumbnail image file
    """
    try:
        # Get DICOM file record
        dicom_file = db.query(DicomFile).filter(DicomFile.id == file_id).first()

        if not dicom_file:
            raise HTTPException(status_code=404, detail="DICOM file not found")

        # Get thumbnail
        thumbnail_generator = ThumbnailGenerator()
        thumbnail_path = thumbnail_generator.get_thumbnail(dicom_file.file_hash, size=size)

        if not thumbnail_path:
            # Thumbnail doesn't exist, generate it
            logger.info(f"Generating thumbnail on-demand for {file_id}")

            # Queue background task for generation
            task = generate_thumbnail.delay(file_id, sizes=[size], force=False)

            raise HTTPException(
                status_code=404,
                detail={
                    'message': 'Thumbnail not found, generation queued',
                    'task_id': task.id,
                    'retry_after': 10
                }
            )

        # Return thumbnail file
        if not Path(thumbnail_path).exists():
            raise HTTPException(status_code=404, detail="Thumbnail file not found")

        return FileResponse(
            path=thumbnail_path,
            media_type='image/jpeg' if thumbnail_path.endswith('.jpg') else 'image/png',
            headers={
                'Cache-Control': 'public, max-age=86400',  # Cache for 24 hours
                'X-Thumbnail-Size': size
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get thumbnail: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate")
async def generate_thumbnails(
    request: ThumbnailGenerateRequest,
    background: bool = Query(True, description="Generate in background"),
    db: Session = Depends(get_db)
):
    """
    Generate thumbnails for DICOM file

    Args:
        request: Generation request
        background: Whether to generate in background (async)

    Returns:
        Generation task information
    """
    try:
        # Verify DICOM file exists
        dicom_file = db.query(DicomFile).filter(
            DicomFile.id == request.dicom_file_id
        ).first()

        if not dicom_file:
            raise HTTPException(status_code=404, detail="DICOM file not found")

        if background:
            # Queue background task
            task = generate_thumbnail.delay(
                request.dicom_file_id,
                sizes=request.sizes,
                force=request.force
            )

            return {
                'message': 'Thumbnail generation queued',
                'task_id': task.id,
                'dicom_file_id': request.dicom_file_id,
                'background': True,
                'timestamp': datetime.now().isoformat()
            }
        else:
            # Generate synchronously (not recommended for API)
            result = generate_thumbnail(
                request.dicom_file_id,
                sizes=request.sizes,
                force=request.force
            )

            if 'error' in result:
                raise HTTPException(status_code=500, detail=result['error'])

            return {
                'message': 'Thumbnails generated successfully',
                'result': result,
                'background': False,
                'timestamp': datetime.now().isoformat()
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to generate thumbnails: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate/missing")
async def generate_missing(
    batch_size: int = Query(50, description="Number of files to process"),
    size: str = Query('medium', description="Thumbnail size to generate"),
    db: Session = Depends(get_db)
):
    """
    Generate missing thumbnails (batch operation)

    Args:
        batch_size: Number of files to process
        size: Thumbnail size to generate

    Returns:
        Task information
    """
    try:
        # Queue background task
        task = generate_missing_thumbnails.delay(
            batch_size=batch_size,
            size=size
        )

        return {
            'message': 'Missing thumbnails generation queued',
            'task_id': task.id,
            'batch_size': batch_size,
            'size': size,
            'timestamp': datetime.now().isoformat()
        }

    except Exception as e:
        logger.error(f"Failed to queue missing thumbnails generation: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{file_id}")
async def delete_thumbnails(
    file_id: str,
    db: Session = Depends(get_db)
):
    """
    Delete all thumbnails for a DICOM file

    Args:
        file_id: DicomFile ID

    Returns:
        Deletion statistics
    """
    try:
        # Get DICOM file record
        dicom_file = db.query(DicomFile).filter(DicomFile.id == file_id).first()

        if not dicom_file:
            raise HTTPException(status_code=404, detail="DICOM file not found")

        # Delete thumbnails
        thumbnail_generator = ThumbnailGenerator()
        deleted_count = thumbnail_generator.delete_thumbnails(dicom_file.file_hash)

        return {
            'message': f'Deleted {deleted_count} thumbnails',
            'dicom_file_id': file_id,
            'deleted_count': deleted_count,
            'timestamp': datetime.now().isoformat()
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete thumbnails: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats", response_model=ThumbnailStatsResponse)
async def get_thumbnail_stats():
    """
    Get thumbnail storage statistics

    Returns:
        Thumbnail statistics
    """
    try:
        thumbnail_generator = ThumbnailGenerator()
        stats = thumbnail_generator.get_stats()

        if 'error' in stats:
            raise HTTPException(status_code=500, detail=stats['error'])

        return ThumbnailStatsResponse(
            **stats,
            timestamp=datetime.now().isoformat()
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get thumbnail stats: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
