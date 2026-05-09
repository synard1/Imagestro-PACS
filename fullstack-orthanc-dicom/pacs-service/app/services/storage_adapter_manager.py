"""
Storage Adapter Manager Service
Manages storage adapters with caching, health checks, and failover support
"""
import logging
import os
from datetime import datetime, timedelta
from typing import Dict, Optional, Any
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.models.storage_location import StorageLocation
from app.storage.adapter_factory import StorageAdapterFactory
from app.storage.base_adapter import StorageAdapter

logger = logging.getLogger(__name__)


class StorageAdapterManager:
    """
    Central service for managing storage adapters

    Features:
    - Adapter caching with TTL
    - Health monitoring per storage location
    - Auto-failover to backup storage
    - Metrics collection
    """

    def __init__(self, db: Session, cache_ttl_seconds: int = 1800):
        """
        Initialize storage adapter manager

        Args:
            db: Database session
            cache_ttl_seconds: Adapter cache TTL (default: 30 minutes)
        """
        self.db = db
        self.cache_ttl = timedelta(seconds=cache_ttl_seconds)

        # Adapter cache: {storage_location_id: (adapter, expiry_time)}
        self._adapter_cache: Dict[str, tuple[StorageAdapter, datetime]] = {}

        # Health status cache: {storage_location_id: (is_healthy, last_check)}
        self._health_status: Dict[str, tuple[bool, datetime]] = {}

        logger.info(f"StorageAdapterManager initialized with cache TTL: {cache_ttl_seconds}s")

    async def get_adapter(self, storage_location_id: str) -> Optional[StorageAdapter]:
        """
        Get storage adapter for a specific storage location

        Args:
            storage_location_id: UUID of storage location

        Returns:
            StorageAdapter instance or None if location not found/inactive
        """
        # Check cache first
        if storage_location_id in self._adapter_cache:
            adapter, expiry = self._adapter_cache[storage_location_id]
            if datetime.now() < expiry:
                logger.debug(f"Using cached adapter for location: {storage_location_id}")
                return adapter
            else:
                # Cache expired
                del self._adapter_cache[storage_location_id]
                logger.debug(f"Cache expired for location: {storage_location_id}")

        # Get storage location from database
        storage_location = self.db.query(StorageLocation).filter(
            StorageLocation.id == storage_location_id
        ).first()

        if not storage_location:
            logger.error(f"Storage location not found: {storage_location_id}")
            return None

        if not storage_location.is_active:
            logger.warning(f"Storage location is inactive: {storage_location.name}")
            return None

        # Create adapter
        adapter = await self._create_adapter(storage_location)

        if adapter:
            # Cache the adapter
            expiry = datetime.now() + self.cache_ttl
            self._adapter_cache[storage_location_id] = (adapter, expiry)
            logger.info(f"Created and cached adapter for: {storage_location.name}")

        return adapter

    async def get_active_storage_location(
        self,
        tier: str = 'hot',
        adapter_type: Optional[str] = None
    ) -> Optional[StorageLocation]:
        """
        Get active storage location by tier and optionally by adapter type

        Selects based on:
        1. Active status
        2. Online status
        3. Highest priority
        4. Available capacity

        Args:
            tier: Storage tier (hot/warm/cold)
            adapter_type: Optional adapter type filter (s3/local/minio)

        Returns:
            StorageLocation or None
        """
        query = self.db.query(StorageLocation).filter(
            StorageLocation.tier == tier,
            StorageLocation.is_active == True,
            StorageLocation.is_online == True
        )

        # Filter by adapter type if specified
        if adapter_type:
            query = query.filter(StorageLocation.adapter_type == adapter_type)

        # Get candidates ordered by priority then size (smallest first)
        candidates = query.order_by(
            desc(StorageLocation.priority),
            StorageLocation.current_size_gb
        ).all()

        # Select first candidate with available quota (<90% usage or no max_size)
        storage_location = None
        for candidate in candidates:
            if candidate.max_size_gb is None or candidate.usage_percentage < 90:
                storage_location = candidate
                break

        if storage_location:
            logger.info(
                f"Selected storage location: {storage_location.name} "
                f"(tier={tier}, priority={storage_location.priority}, "
                f"usage={storage_location.usage_percentage:.1f}%)"
            )
        else:
            skipped = [c.name for c in candidates if c.max_size_gb and c.usage_percentage >= 90]
            logger.warning(
                f"No storage location with available quota for tier: {tier}. "
                f"Skipped full/near-full: {skipped}"
            )

        return storage_location

    async def health_check(self, storage_location: StorageLocation) -> bool:
        """
        Perform health check on storage location

        Args:
            storage_location: StorageLocation to check

        Returns:
            True if healthy, False otherwise
        """
        # Check cache first (5 minute TTL for health checks)
        cache_key = str(storage_location.id)
        if cache_key in self._health_status:
            is_healthy, last_check = self._health_status[cache_key]
            if datetime.now() - last_check < timedelta(minutes=5):
                logger.debug(f"Using cached health status for: {storage_location.name}")
                return is_healthy

        logger.info(f"Performing health check for: {storage_location.name}")

        try:
            # Create adapter
            adapter = await self._create_adapter(storage_location)

            if not adapter:
                logger.error(f"Failed to create adapter for: {storage_location.name}")
                self._update_health_status(storage_location, False)
                return False

            # Test adapter connectivity; health_check() returns a dict {'ok': bool, ...}
            health_result = await adapter.health_check()
            is_healthy = health_result.get('ok', False) if isinstance(health_result, dict) else bool(health_result)

            # Update health status in cache and database
            self._update_health_status(storage_location, is_healthy)

            logger.info(
                f"Health check result for {storage_location.name}: "
                f"{'HEALTHY' if is_healthy else 'UNHEALTHY'}"
            )

            return is_healthy

        except Exception as e:
            logger.error(
                f"Health check failed for {storage_location.name}: {e}",
                exc_info=True
            )
            self._update_health_status(storage_location, False)
            return False

    async def _create_adapter(self, storage_location: StorageLocation) -> Optional[StorageAdapter]:
        """
        Create storage adapter from storage location config

        Args:
            storage_location: StorageLocation instance

        Returns:
            StorageAdapter instance or None
        """
        try:
            # Prepare configuration
            config = storage_location.config or {}

            # Set path-derived defaults only if not already present in config
            # (StorageBackend.config may supply bucket_name/base_path directly)
            if 'bucket_name' not in config:
                config['bucket_name'] = storage_location.path  # S3: path = bucket name
            if 'base_path' not in config:
                config['base_path'] = storage_location.path    # Local: path = directory

            # Handle credentials from environment variables OR direct values
            if 'credentials' in config:
                creds = config['credentials']

                # Try environment variable reference first
                if 'access_key_env' in creds:
                    config['access_key'] = os.getenv(creds['access_key_env'], '')
                elif 'access_key' in creds:
                    # Use direct value
                    config['access_key'] = creds['access_key']

                # Try environment variable reference first
                if 'secret_key_env' in creds:
                    config['secret_key'] = os.getenv(creds['secret_key_env'], '')
                elif 'secret_key' in creds:
                    # Use direct value
                    config['secret_key'] = creds['secret_key']

            # Determine adapter type
            adapter_type = storage_location.adapter_type or config.get('type', 'local')

            # Create adapter using factory
            adapter = StorageAdapterFactory.create_adapter(adapter_type, config)

            if not adapter:
                logger.error(f"Failed to create adapter for type: {adapter_type}")
                return None

            logger.debug(f"Created adapter: {adapter_type} for {storage_location.name}")
            return adapter

        except Exception as e:
            logger.error(
                f"Error creating adapter for {storage_location.name}: {e}",
                exc_info=True
            )
            return None

    def _update_health_status(self, storage_location: StorageLocation, is_healthy: bool):
        """
        Update health status in cache and database

        Args:
            storage_location: StorageLocation to update
            is_healthy: Health status
        """
        # Update cache
        cache_key = str(storage_location.id)
        self._health_status[cache_key] = (is_healthy, datetime.now())

        # Update database
        try:
            storage_location.is_online = is_healthy
            storage_location.last_check = datetime.now()
            self.db.commit()
            logger.debug(f"Updated health status in database for: {storage_location.name}")
        except Exception as e:
            logger.error(f"Failed to update health status in database: {e}")
            self.db.rollback()

    async def get_fallback_adapter(self, tier: str) -> Optional[StorageAdapter]:
        """
        Get fallback adapter when primary storage is unavailable

        Args:
            tier: Storage tier

        Returns:
            Fallback StorageAdapter or None
        """
        logger.warning(f"Attempting to get fallback adapter for tier: {tier}")

        # Get all active locations for tier, ordered by priority
        locations = self.db.query(StorageLocation).filter(
            StorageLocation.tier == tier,
            StorageLocation.is_active == True
        ).order_by(desc(StorageLocation.priority)).all()

        # Try each location in order of priority
        for location in locations:
            try:
                is_healthy = await self.health_check(location)
                if is_healthy:
                    adapter = await self.get_adapter(str(location.id))
                    if adapter:
                        logger.info(f"Using fallback storage: {location.name}")
                        return adapter
            except Exception as e:
                logger.error(f"Failed to get fallback adapter from {location.name}: {e}")
                continue

        logger.error(f"No fallback adapter available for tier: {tier}")
        return None

    def clear_cache(self):
        """Clear adapter and health status caches"""
        self._adapter_cache.clear()
        self._health_status.clear()
        logger.info("Cleared adapter and health status caches")

    def get_cache_stats(self) -> Dict[str, Any]:
        """
        Get cache statistics

        Returns:
            Dictionary with cache stats
        """
        now = datetime.now()
        active_adapters = sum(
            1 for _, expiry in self._adapter_cache.values() if expiry > now
        )

        return {
            'total_cached_adapters': len(self._adapter_cache),
            'active_cached_adapters': active_adapters,
            'health_status_cache_size': len(self._health_status),
            'cache_ttl_seconds': self.cache_ttl.total_seconds()
        }


# Singleton instance
_storage_adapter_manager: Optional[StorageAdapterManager] = None


def get_storage_adapter_manager(db: Session) -> StorageAdapterManager:
    """
    Get or create singleton storage adapter manager

    Args:
        db: Database session

    Returns:
        StorageAdapterManager instance
    """
    global _storage_adapter_manager

    if _storage_adapter_manager is None:
        cache_ttl = int(os.getenv('STORAGE_ADAPTER_CACHE_TTL', '1800'))
        _storage_adapter_manager = StorageAdapterManager(db, cache_ttl_seconds=cache_ttl)

    return _storage_adapter_manager
