"""
WADO-RS API Endpoints
DICOMweb RESTful Services for image retrieval
Implements WADO-RS standard
"""

import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import StreamingResponse, RedirectResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth import get_current_user
from app.services.wado_service import get_wado_service
from app.services.wado_service_v2 import get_wado_service_v2

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/wado-rs", tags=["wado-rs"])


@router.get("/studies/{study_id}")
async def get_study(
    study_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Get all instances in a study (WADO-RS)
    """
    try:
        wado = get_wado_service(db)
        instances = await wado.get_study_instances(study_id)

        return {
            "study_id": study_id,
            "instance_count": len(instances),
            "instances": instances
        }

    except Exception as e:
        logger.error(f"Failed to get study: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/studies/{study_id}/series/{series_id}")
async def get_series(
    study_id: str,
    series_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Get all instances in a series (WADO-RS)
    """
    try:
        wado = get_wado_service(db)
        instances = await wado.get_series_instances(study_id, series_id)

        return {
            "study_id": study_id,
            "series_id": series_id,
            "instance_count": len(instances),
            "instances": instances
        }

    except Exception as e:
        logger.error(f"Failed to get series: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/studies/{study_id}/series/{series_id}/instances/{instance_id}")
async def get_instance(
    study_id: str,
    series_id: str,
    instance_id: str,
    original: bool = Query(False, description="Return original uploaded file if available"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Get DICOM instance file (WADO-RS)
    """
    try:
        wado_v2 = get_wado_service_v2(db)
        data = await wado_v2.get_instance(
            study_id,
            series_id,
            instance_id,
            use_original=original
        )

        if not data:
            # Fallback to legacy service for backward compatibility
            wado = get_wado_service(db)
            data = await wado.get_instance(study_id, series_id, instance_id)

        if not data:
            raise HTTPException(status_code=404, detail="Instance not found")

        return Response(
            content=data,
            media_type="application/dicom",
            headers={
                "Content-Disposition": f"attachment; filename={instance_id}.dcm"
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get instance: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/studies/{study_id}/series/{series_id}/instances/{instance_id}/original")
async def get_instance_original(
    study_id: str,
    series_id: str,
    instance_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Convenience endpoint for retrieving original uploaded file"""
    return await get_instance(study_id, series_id, instance_id, original=True, db=db, current_user=current_user)


@router.get("/studies/{study_id}/series/{series_id}/instances/{instance_id}/metadata")
async def get_instance_metadata(
    study_id: str,
    series_id: str,
    instance_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Get instance metadata without pixel data (WADO-RS)
    """
    try:
        wado = get_wado_service(db)
        metadata = await wado.get_instance_metadata(study_id, series_id, instance_id)

        if not metadata:
            raise HTTPException(status_code=404, detail="Instance not found")

        return metadata

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get metadata: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/studies/{study_id}/series/{series_id}/instances/{instance_id}/thumbnail")
async def get_thumbnail(
    study_id: str,
    series_id: str,
    instance_id: str,
    size: int = Query(200, ge=50, le=500, description="Thumbnail size in pixels"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Get thumbnail image (JPEG)
    """
    try:
        wado = get_wado_service(db)
        data = await wado.get_thumbnail(study_id, series_id, instance_id, size)

        if not data:
            raise HTTPException(
                status_code=404,
                detail="Thumbnail not available"
            )

        return Response(
            content=data,
            media_type="image/jpeg",
            headers={
                "Cache-Control": "public, max-age=3600"
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get thumbnail: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/studies/{study_id}/series/{series_id}/instances/{instance_id}/rendered")
async def get_rendered_image(
    study_id: str,
    series_id: str,
    instance_id: str,
    window_center: Optional[int] = Query(None, description="Window center"),
    window_width: Optional[int] = Query(None, description="Window width"),
    quality: int = Query(90, ge=1, le=100, description="JPEG quality"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Get rendered image with windowing (JPEG)
    """
    try:
        wado = get_wado_service(db)
        data = await wado.get_rendered_image(
            study_id,
            series_id,
            instance_id,
            window_center,
            window_width,
            quality
        )

        if not data:
            raise HTTPException(
                status_code=404,
                detail="Image not available"
            )

        return Response(
            content=data,
            media_type="image/jpeg",
            headers={
                "Cache-Control": "public, max-age=300"
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to render image: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/studies/{study_id}/series/{series_id}/instances/{instance_id}/frames/{frame_number}")       
async def get_frame(
    study_id: str,
    series_id: str,
    instance_id: str,
    frame_number: int,
    frame: Optional[int] = Query(None, alias="fram", description="Frame number (query param alias)"),     
    quality: int = Query(90, ge=1, le=100, description="JPEG quality"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Get specific frame from multi-frame instance (WADO-RS)
    """
    try:
        # Use frame_number from path, fallback to query param
        frame_num = frame_number if frame_number else (frame or 1)

        wado = get_wado_service(db)
        data = await wado.get_frame(study_id, series_id, instance_id, frame_num, quality)

        if not data:
            raise HTTPException(
                status_code=404,
                detail=f"Frame {frame_num} not available"
            )

        return Response(
            content=data,
            media_type="image/jpeg",
            headers={
                "Content-Type": "image/jpeg",
                "Cache-Control": "public, max-age=300"
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get frame {frame_num}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def wado_health(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    WADO-RS health check
    """
    try:
        wado = get_wado_service(db)

        return {
            "status": "healthy",
            "service": "WADO-RS",
            "version": "1.0.0",
            "user": current_user["username"],
            "endpoints": [
                "/wado-rs/studies/{study_id}",
                "/wado-rs/studies/{study_id}/series/{series_id}",
                "/wado-rs/studies/{study_id}/series/{series_id}/instances/{instance_id}",
                "/wado-rs/studies/{study_id}/series/{series_id}/instances/{instance_id}/metadata",        
                "/wado-rs/studies/{study_id}/series/{series_id}/instances/{instance_id}/thumbnail",       
                "/wado-rs/studies/{study_id}/series/{series_id}/instances/{instance_id}/rendered"
            ]
        }

    except Exception as e:
        logger.error(f"WADO health check failed: {str(e)}")
        raise HTTPException(
            status_code=503,
            detail=f"WADO service unhealthy: {str(e)}"
        )


# ============================================================================
# WADO-RS V2 Endpoints (Multi-storage backend support)
# ============================================================================

@router.get("/v2/studies/{study_id}")
async def get_study_v2(
    study_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Get all instances in a study using V2 service (Multi-storage support)
    """
    try:
        wado_v2 = get_wado_service_v2(db)
        instances = await wado_v2.get_study_instances(study_id)

        # Get presigned URLs for all instances
        results = []
        for instance in instances:
            try:
                # Get presigned URL for this instance
                presigned_url = await wado_v2.get_instance_url(
                    study_id=instance['study_id'],
                    series_id=instance['series_id'],
                    instance_id=instance['instance_id']
                )

                instance_data = {
                    'id': instance['id'],
                    'instance_id': instance['instance_id'],
                    'sop_instance_uid': instance['sop_instance_uid'],
                    'series_id': instance['series_id'],
                    'study_id': instance['study_id'],
                    'patient_id': instance.get('patient_id'),
                    'patient_name': instance.get('patient_name'),
                    'study_date': instance.get('study_date'),
                    'modality': instance.get('modality'),
                    'file_size': instance.get('file_size'),
                    'storage_tier': instance.get('storage_tier')
                }

                # Add presigned URL if available
                if presigned_url:
                    instance_data['presigned_url'] = presigned_url

                results.append(instance_data)

            except Exception as e:
                logger.warning(f"Failed to get presigned URL for instance {instance['instance_id']}: {e}")
                # Still include instance without presigned URL
                results.append(instance)

        return {
            "study_id": study_id,
            "instance_count": len(results),
            "instances": results
        }

    except Exception as e:
        logger.error(f"Failed to get study (V2): {str(e)}", exc_info=True)
        raise HTTPException(status_code=404, detail="Study not found or no instances available")


@router.get("/v2/studies/{study_id}/series/{series_id}")
async def get_series_v2(
    study_id: str,
    series_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Get all instances in a series using V2 service (Multi-storage support)
    """
    try:
        wado_v2 = get_wado_service_v2(db)
        instances = await wado_v2.get_series_instances(study_id, series_id)

        # Get presigned URLs for all instances
        results = []
        for instance in instances:
            try:
                # Get presigned URL for this instance
                presigned_url = await wado_v2.get_instance_url(
                    study_id=instance['study_id'],
                    series_id=instance['series_id'],
                    instance_id=instance['instance_id']
                )

                instance_data = {
                    'id': instance['id'],
                    'instance_id': instance['instance_id'],
                    'sop_instance_uid': instance['sop_instance_uid'],
                    'series_id': instance['series_id'],
                    'study_id': instance['study_id'],
                    'patient_id': instance.get('patient_id'),
                    'patient_name': instance.get('patient_name'),
                    'study_date': instance.get('study_date'),
                    'modality': instance.get('modality'),
                    'file_size': instance.get('file_size'),
                    'storage_tier': instance.get('storage_tier')
                }

                # Add presigned URL if available
                if presigned_url:
                    instance_data['presigned_url'] = presigned_url

                results.append(instance_data)

            except Exception as e:
                logger.warning(f"Failed to get presigned URL for instance {instance['instance_id']}: {e}")
                # Still include instance without presigned URL
                results.append(instance)

        return {
            "study_id": study_id,
            "series_id": series_id,
            "instance_count": len(results),
            "instances": results
        }

    except Exception as e:
        logger.error(f"Failed to get series (V2): {str(e)}", exc_info=True)
        raise HTTPException(status_code=404, detail="Series not found or no instances available")


@router.get("/v2/studies/{study_id}/series/{series_id}/instances/{instance_id}")
async def get_instance_v2(
    study_id: str,
    series_id: str,
    instance_id: str,
    presigned: bool = Query(False, description="Return presigned URL instead of file data"),
    original: bool = Query(False, description="Return original uploaded file if available"),
    redirect: bool = Query(True, description="Redirect to presigned URL for S3 files (faster)"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Get DICOM instance file using V2 service (Multi-storage support)
    """
    try:
        wado_v2 = get_wado_service_v2(db)

        # Try to get presigned URL first (for S3 files)
        if redirect:
            presigned_url = await wado_v2.get_instance_url(
                study_id=study_id,
                series_id=series_id,
                instance_id=instance_id,
                use_original=original
            )

            if presigned_url:
                logger.info(f"Redirecting to presigned URL for {instance_id}")
                return RedirectResponse(url=presigned_url, status_code=307)

        # If presigned URL not available or redirect disabled, get instance data
        result = await wado_v2.get_instance(
            study_id=study_id,
            series_id=series_id,
            instance_id=instance_id,
            use_presigned_url=presigned,
            use_original=original
        )

        if not result:
            raise HTTPException(
                status_code=404,
                detail=f"Instance not found: {instance_id}"
            )

        # If presigned URL requested and available
        if presigned and isinstance(result, str):
            return {
                "success": True,
                "presigned_url": result,
                "instance_id": instance_id,
                "expires_in_seconds": 3600
            }

        # Return DICOM file data
        if isinstance(result, bytes):
            return Response(
                content=result,
                media_type="application/dicom",
                headers={
                    "Content-Disposition": f'attachment; filename="{instance_id}.dcm"'
                }
            )

        raise HTTPException(
            status_code=500,
            detail="Unexpected response format"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get instance (V2): {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/v2/studies/{study_id}/series/{series_id}/instances/{instance_id}/url")
async def get_instance_presigned_url(
    study_id: str,
    series_id: str,
    instance_id: str,
    expiration: int = Query(3600, description="URL expiration in seconds", ge=60, le=86400),
    original: bool = Query(False, description="Return original uploaded file if available"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Get presigned URL for DICOM instance (S3 only)
    """
    try:
        wado_v2 = get_wado_service_v2(db)

        # Get presigned URL
        presigned_url = await wado_v2.get_instance_url(
            study_id=study_id,
            series_id=series_id,
            instance_id=instance_id,
            expiration=expiration,
            use_original=original
        )

        if not presigned_url:
            raise HTTPException(
                status_code=404,
                detail="Presigned URL not available (file may not be in S3 storage)"
            )

        return {
            "success": True,
            "presigned_url": presigned_url,
            "study_id": study_id,
            "series_id": series_id,
            "instance_id": instance_id,
            "expires_in_seconds": expiration
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to generate presigned URL: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/v2/studies/{study_id}/series/{series_id}/instances/{instance_id}/metadata")
async def get_instance_metadata_v2(
    study_id: str,
    series_id: str,
    instance_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Get DICOM instance metadata (V2)
    """
    try:
        wado_v2 = get_wado_service_v2(db)

        metadata = await wado_v2.get_instance_metadata(
            study_id=study_id,
            series_id=series_id,
            instance_id=instance_id
        )

        if not metadata:
            raise HTTPException(
                status_code=404,
                detail=f"Instance metadata not found: {instance_id}"
            )

        return metadata

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get instance metadata (V2): {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/v2/studies/{study_id}/series/{series_id}/instances/{instance_id}/rendered")
async def get_rendered_image_v2(
    study_id: str,
    series_id: str,
    instance_id: str,
    window_center: Optional[int] = Query(None),
    window_width: Optional[int] = Query(None),
    quality: int = Query(90, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Get rendered image with windowing (JPEG) using V2 service
    """
    try:
        try:
            wado_v2 = get_wado_service_v2(db)
            # Get rendered image data
            image_data = await wado_v2.get_rendered_image(
                study_id=study_id,
                series_id=series_id,
                instance_id=instance_id,
                window_center=window_center,
                window_width=window_width,
                quality=quality
            )
        except AttributeError:
            # Fallback to legacy service if V2 doesn't have the method
            logger.info(f"V2 rendered image not available for {instance_id}, falling back to V1")
            wado = get_wado_service(db)
            image_data = await wado.get_rendered_image(
                study_id,
                series_id,
                instance_id,
                window_center,
                window_width,
                quality
            )

        if not image_data:
            raise HTTPException(
                status_code=404,
                detail=f"Rendered image not found: {instance_id}"
            )

        return Response(content=image_data, media_type="image/jpeg")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get rendered image (V2): {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/v2/studies/{study_id}/series/{series_id}/instances/{instance_id}/thumbnail")
async def get_thumbnail_v2(
    study_id: str,
    series_id: str,
    instance_id: str,
    size: int = Query(200, ge=50, le=500, description="Thumbnail size in pixels"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Get thumbnail image (JPEG) using V2 service with disk caching
    """
    try:
        wado_v2 = get_wado_service_v2(db)

        # Get thumbnail data (from cache if available)
        data = await wado_v2.get_thumbnail(study_id, series_id, instance_id, size)

        if not data:
            raise HTTPException(
                status_code=404,
                detail="Thumbnail not available"
            )

        return Response(content=data, media_type="image/jpeg")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get thumbnail (V2): {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
