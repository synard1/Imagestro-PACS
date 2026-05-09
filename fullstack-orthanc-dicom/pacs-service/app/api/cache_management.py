"""
Cache Management API
Endpoints for managing DICOM file cache
"""

import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.services.dicom_cache import DicomCacheService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cache", tags=["Cache Management"])


# ============================================================================
# Pydantic Models
# ============================================================================

class CacheStatsResponse(BaseModel):
    """Cache statistics response"""
    hits: int
    misses: int
    hit_rate_percent: float
    evictions: int
    current_size_bytes: int
    current_size_mb: float
    current_size_gb: float
    file_count: int
    max_size_gb: float
    usage_percent: float
    timestamp: str


class CacheCleanupResponse(BaseModel):
    """Cache cleanup response"""
    removed_count: int
    removed_size_bytes: int
    removed_size_mb: float
    timestamp: str


# ============================================================================
# API Endpoints
# ============================================================================

@router.get("/stats", response_model=CacheStatsResponse)
async def get_cache_stats(
    db: Session = Depends(get_db)
):
    """
    Get cache statistics

    Returns:
        Cache statistics including hit rate, size, and usage
    """
    try:
        cache_service = DicomCacheService(db=db)
        stats = cache_service.get_stats()

        return CacheStatsResponse(
            **stats,
            timestamp=datetime.now().isoformat()
        )

    except Exception as e:
        logger.error(f"Failed to get cache stats: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cleanup", response_model=CacheCleanupResponse)
async def cleanup_cache(
    max_age_hours: Optional[int] = Query(24, description="Maximum age in hours"),
    db: Session = Depends(get_db)
):
    """
    Cleanup old cache entries

    Args:
        max_age_hours: Remove entries older than this many hours

    Returns:
        Cleanup statistics
    """
    try:
        cache_service = DicomCacheService(max_cache_age_hours=max_age_hours, db=db)
        result = cache_service.cleanup_old_entries()

        if 'error' in result:
            raise HTTPException(status_code=500, detail=result['error'])

        return CacheCleanupResponse(
            **result,
            timestamp=datetime.now().isoformat()
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Cache cleanup failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/clear")
async def clear_cache(
    confirm: bool = Query(False, description="Confirmation required"),
    db: Session = Depends(get_db)
):
    """
    Clear entire cache

    Args:
        confirm: Must be True to confirm clearing entire cache

    Returns:
        Cleanup statistics
    """
    if not confirm:
        raise HTTPException(
            status_code=400,
            detail="Confirmation required. Set confirm=true to clear entire cache."
        )

    try:
        cache_service = DicomCacheService(db=db)
        result = cache_service.clear()

        if 'error' in result:
            raise HTTPException(status_code=500, detail=result['error'])

        return {
            **result,
            'message': 'Cache cleared successfully',
            'timestamp': datetime.now().isoformat()
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to clear cache: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def cache_health_check():
    """
    Cache service health check

    Returns:
        Health status
    """
    try:
        # Simple health check
        cache_service = DicomCacheService()
        stats = cache_service.get_stats()

        return {
            'status': 'healthy',
            'cache_enabled': True,
            'cache_size_gb': stats['current_size_gb'],
            'usage_percent': stats['usage_percent'],
            'timestamp': datetime.now().isoformat()
        }

    except Exception as e:
        logger.error(f"Cache health check failed: {e}")
        return {
            'status': 'unhealthy',
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }
