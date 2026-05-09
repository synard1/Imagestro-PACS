"""
DICOM Cache Service
Provides caching layer for frequently accessed DICOM files
"""

import logging
import hashlib
import os
import shutil
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.dicom_file import DicomFile

logger = logging.getLogger(__name__)


class DicomCacheService:
    """
    DICOM file caching service

    Features:
    - LRU cache for frequently accessed files
    - Automatic cache cleanup
    - Cache hit/miss tracking
    - Size-based eviction
    """

    def __init__(
        self,
        cache_dir: str = "/var/lib/pacs/cache",
        max_cache_size_gb: float = 50.0,
        max_cache_age_hours: int = 24,
        db: Optional[Session] = None
    ):
        """
        Initialize DICOM cache service

        Args:
            cache_dir: Directory for cached files
            max_cache_size_gb: Maximum cache size in GB
            max_cache_age_hours: Maximum age for cached files in hours
            db: Database session for tracking
        """
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)

        self.max_cache_size_bytes = int(max_cache_size_gb * 1024 * 1024 * 1024)
        self.max_cache_age = timedelta(hours=max_cache_age_hours)
        self.db = db

        # Stats tracking
        self.stats = {
            'hits': 0,
            'misses': 0,
            'evictions': 0,
            'current_size_bytes': 0,
            'file_count': 0
        }

        # Initialize stats from cache directory
        self._update_stats()

        logger.info(
            f"DicomCacheService initialized: "
            f"dir={cache_dir}, max_size={max_cache_size_gb}GB, "
            f"max_age={max_cache_age_hours}h"
        )

    def _get_cache_key(self, dicom_file: DicomFile) -> str:
        """
        Generate cache key for DICOM file

        Args:
            dicom_file: DicomFile instance

        Returns:
            Cache key (hash)
        """
        # Use file hash as cache key for deduplication
        if dicom_file.file_hash:
            return dicom_file.file_hash[:32]  # Use first 32 chars of hash

        # Fallback to SOP Instance UID
        key_str = f"{dicom_file.sop_instance_uid}_{dicom_file.file_size}"
        return hashlib.md5(key_str.encode()).hexdigest()

    def _get_cache_path(self, cache_key: str) -> Path:
        """Get file path in cache for given key"""
        # Create subdirectories based on first 2 chars of key (256 buckets)
        subdir = cache_key[:2]
        cache_subdir = self.cache_dir / subdir
        cache_subdir.mkdir(exist_ok=True)
        return cache_subdir / f"{cache_key}.dcm"

    def get(self, dicom_file: DicomFile) -> Optional[str]:
        """
        Get DICOM file from cache

        Args:
            dicom_file: DicomFile instance

        Returns:
            Path to cached file or None if not in cache
        """
        cache_key = self._get_cache_key(dicom_file)
        cache_path = self._get_cache_path(cache_key)

        if cache_path.exists():
            # Verify file size matches
            cached_size = cache_path.stat().st_size
            if cached_size == dicom_file.file_size:
                # Update access time
                cache_path.touch()
                self.stats['hits'] += 1

                logger.debug(
                    f"Cache HIT: {dicom_file.sop_instance_uid} "
                    f"(key={cache_key[:8]}...)"
                )

                # Track access in database
                if self.db:
                    try:
                        dicom_file.accessed_at = datetime.now()
                        self.db.commit()
                    except Exception as e:
                        logger.error(f"Failed to update access time: {e}")

                return str(cache_path)
            else:
                # Size mismatch, remove invalid cache entry
                logger.warning(
                    f"Cache size mismatch for {cache_key[:8]}..., "
                    f"expected {dicom_file.file_size}, got {cached_size}"
                )
                cache_path.unlink()

        self.stats['misses'] += 1
        logger.debug(
            f"Cache MISS: {dicom_file.sop_instance_uid} "
            f"(key={cache_key[:8]}...)"
        )
        return None

    def put(
        self,
        dicom_file: DicomFile,
        source_path: str,
        copy: bool = True
    ) -> bool:
        """
        Add DICOM file to cache

        Args:
            dicom_file: DicomFile instance
            source_path: Path to source file
            copy: Whether to copy (True) or move (False) the file

        Returns:
            True if cached successfully
        """
        try:
            source = Path(source_path)
            if not source.exists():
                logger.error(f"Source file not found: {source_path}")
                return False

            cache_key = self._get_cache_key(dicom_file)
            cache_path = self._get_cache_path(cache_key)

            # Check if file size would exceed cache limit
            file_size = source.stat().st_size
            if file_size > self.max_cache_size_bytes:
                logger.warning(
                    f"File too large for cache: {file_size} > {self.max_cache_size_bytes}"
                )
                return False

            # Evict old files if necessary
            while (self.stats['current_size_bytes'] + file_size > self.max_cache_size_bytes):
                if not self._evict_lru():
                    logger.error("Failed to evict LRU entry, cache full")
                    return False

            # Copy or move file to cache
            if copy:
                shutil.copy2(source, cache_path)
            else:
                shutil.move(str(source), str(cache_path))

            # Update stats
            self.stats['current_size_bytes'] += file_size
            self.stats['file_count'] += 1

            logger.debug(
                f"Cached: {dicom_file.sop_instance_uid} "
                f"(key={cache_key[:8]}..., size={file_size})"
            )

            return True

        except Exception as e:
            logger.error(f"Failed to cache file: {e}", exc_info=True)
            return False

    def _evict_lru(self) -> bool:
        """
        Evict least recently used file from cache

        Returns:
            True if evicted successfully
        """
        try:
            # Find oldest accessed file
            oldest_file = None
            oldest_time = datetime.now()

            for cache_file in self.cache_dir.rglob("*.dcm"):
                access_time = datetime.fromtimestamp(cache_file.stat().st_atime)
                if access_time < oldest_time:
                    oldest_time = access_time
                    oldest_file = cache_file

            if oldest_file:
                file_size = oldest_file.stat().st_size
                oldest_file.unlink()

                self.stats['current_size_bytes'] -= file_size
                self.stats['file_count'] -= 1
                self.stats['evictions'] += 1

                logger.debug(
                    f"Evicted LRU: {oldest_file.name} "
                    f"(size={file_size}, age={datetime.now() - oldest_time})"
                )
                return True

            return False

        except Exception as e:
            logger.error(f"Failed to evict LRU: {e}", exc_info=True)
            return False

    def cleanup_old_entries(self) -> Dict[str, int]:
        """
        Remove cache entries older than max_cache_age

        Returns:
            Cleanup statistics
        """
        try:
            logger.info("Starting cache cleanup...")

            removed_count = 0
            removed_size = 0
            cutoff_time = datetime.now() - self.max_cache_age

            for cache_file in self.cache_dir.rglob("*.dcm"):
                access_time = datetime.fromtimestamp(cache_file.stat().st_atime)

                if access_time < cutoff_time:
                    file_size = cache_file.stat().st_size
                    cache_file.unlink()

                    removed_count += 1
                    removed_size += file_size

                    self.stats['current_size_bytes'] -= file_size
                    self.stats['file_count'] -= 1

            logger.info(
                f"Cache cleanup complete: "
                f"removed {removed_count} files ({removed_size / 1024 / 1024:.2f} MB)"
            )

            return {
                'removed_count': removed_count,
                'removed_size_bytes': removed_size,
                'removed_size_mb': removed_size / 1024 / 1024
            }

        except Exception as e:
            logger.error(f"Cache cleanup failed: {e}", exc_info=True)
            return {'error': str(e)}

    def _update_stats(self):
        """Update cache statistics"""
        try:
            total_size = 0
            file_count = 0

            for cache_file in self.cache_dir.rglob("*.dcm"):
                total_size += cache_file.stat().st_size
                file_count += 1

            self.stats['current_size_bytes'] = total_size
            self.stats['file_count'] = file_count

        except Exception as e:
            logger.error(f"Failed to update cache stats: {e}")

    def get_stats(self) -> Dict[str, Any]:
        """
        Get cache statistics

        Returns:
            Cache statistics dictionary
        """
        self._update_stats()

        hit_rate = 0.0
        total_requests = self.stats['hits'] + self.stats['misses']
        if total_requests > 0:
            hit_rate = (self.stats['hits'] / total_requests) * 100

        return {
            'hits': self.stats['hits'],
            'misses': self.stats['misses'],
            'hit_rate_percent': round(hit_rate, 2),
            'evictions': self.stats['evictions'],
            'current_size_bytes': self.stats['current_size_bytes'],
            'current_size_mb': round(self.stats['current_size_bytes'] / 1024 / 1024, 2),
            'current_size_gb': round(self.stats['current_size_bytes'] / 1024 / 1024 / 1024, 2),
            'file_count': self.stats['file_count'],
            'max_size_gb': round(self.max_cache_size_bytes / 1024 / 1024 / 1024, 2),
            'usage_percent': round(
                (self.stats['current_size_bytes'] / self.max_cache_size_bytes) * 100, 2
            ) if self.max_cache_size_bytes > 0 else 0
        }

    def clear(self) -> Dict[str, int]:
        """
        Clear entire cache

        Returns:
            Cleanup statistics
        """
        try:
            logger.warning("Clearing entire cache...")

            removed_count = 0
            removed_size = 0

            for cache_file in self.cache_dir.rglob("*.dcm"):
                file_size = cache_file.stat().st_size
                cache_file.unlink()

                removed_count += 1
                removed_size += file_size

            # Reset stats
            self.stats['current_size_bytes'] = 0
            self.stats['file_count'] = 0

            logger.info(
                f"Cache cleared: "
                f"removed {removed_count} files ({removed_size / 1024 / 1024:.2f} MB)"
            )

            return {
                'removed_count': removed_count,
                'removed_size_bytes': removed_size,
                'removed_size_mb': removed_size / 1024 / 1024
            }

        except Exception as e:
            logger.error(f"Failed to clear cache: {e}", exc_info=True)
            return {'error': str(e)}
