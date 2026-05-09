"""
Storage Configuration Sync Service
Syncs storage configuration from Settings Service API to local database
"""

import os
import logging
import requests
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.models.storage_location import StorageLocation

logger = logging.getLogger(__name__)

# Settings Service Configuration
SETTINGS_SERVICE_URL = os.getenv(
    "SETTINGS_SERVICE_URL",
    "http://103.42.117.19:8888"
)


class StorageConfigSync:
    """
    Sync storage configuration from Settings Service API to database
    """

    def __init__(self, db: Session):
        """
        Initialize storage config sync service

        Args:
            db: Database session
        """
        self.db = db
        self.settings_url = SETTINGS_SERVICE_URL
        logger.info(f"StorageConfigSync initialized with settings URL: {self.settings_url}")

    def fetch_storage_config_from_api(self) -> Optional[Dict[str, Any]]:
        """
        Fetch storage configuration from Settings Service API

        Returns:
            Storage config dict or None if failed
        """
        try:
            url = f"{self.settings_url}/settings/storage_config"
            logger.info(f"Fetching storage config from: {url}")

            response = requests.get(url, timeout=10)
            response.raise_for_status()

            config = response.json()
            logger.info(f"✓ Storage config fetched successfully")
            logger.debug(f"Config data: {config}")

            return config

        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to fetch storage config from API: {e}")
            return None
        except Exception as e:
            logger.error(f"Error fetching storage config: {e}")
            return None

    def sync_storage_location_from_api(
        self,
        tier: str = 'hot',
        force_update: bool = False
    ) -> Optional[StorageLocation]:
        """
        Sync storage location configuration from Settings API to database

        Args:
            tier: Storage tier (hot/warm/cold)
            force_update: Force update even if location exists

        Returns:
            StorageLocation object or None if failed
        """
        try:
            # Fetch config from API
            api_config = self.fetch_storage_config_from_api()

            if not api_config:
                logger.warning("No storage config from API, using existing database config")
                return None

            # Check if active
            is_active = api_config.get('active', False)
            if not is_active:
                logger.warning("Storage config from API is not active")
                return None

            # Extract S3 configuration
            bucket = api_config.get('bucket')
            region = api_config.get('region')
            endpoint = api_config.get('endpoint')
            access_key = api_config.get('access_key')
            secret_key = api_config.get('secret_key')

            if not all([bucket, region, endpoint, access_key, secret_key]):
                logger.error("Incomplete S3 configuration from API")
                return None

            # Determine provider from endpoint
            provider = 'contabo'
            if 'wasabi' in endpoint.lower():
                provider = 'wasabi'
            elif 'amazonaws.com' in endpoint.lower():
                provider = 'aws'
            elif 'minio' in endpoint.lower() or 'localhost' in endpoint.lower():
                provider = 'minio'

            # Create storage location name
            location_name = f"{provider.title()} S3 {tier.title()} Storage"

            # Check if storage location exists
            existing_location = self.db.query(StorageLocation).filter(
                StorageLocation.name == location_name
            ).first()

            if existing_location and not force_update:
                logger.info(f"Storage location already exists: {location_name}")
                return existing_location

            # Prepare configuration
            storage_config = {
                "type": "s3",
                "bucket_name": bucket,
                "region": region,
                "endpoint_url": endpoint,
                "use_ssl": True,
                "addressing_style": "path",
                "credentials": {
                    "access_key": access_key,
                    "secret_key": secret_key
                }
            }

            if existing_location:
                # Update existing location
                logger.info(f"Updating storage location: {location_name}")

                existing_location.path = bucket
                existing_location.tier = tier
                existing_location.adapter_type = 's3'
                existing_location.provider = provider
                existing_location.is_active = True
                existing_location.is_online = True
                existing_location.config = storage_config

                self.db.commit()
                self.db.refresh(existing_location)

                logger.info(f"✓ Storage location updated: {location_name}")
                return existing_location

            else:
                # Create new location
                logger.info(f"Creating new storage location: {location_name}")

                new_location = StorageLocation(
                    name=location_name,
                    path=bucket,
                    tier=tier,
                    adapter_type='s3',
                    provider=provider,
                    priority=10,  # High priority for S3
                    max_size_gb=1000,  # Default 1TB
                    current_size_gb=0,
                    current_files=0,
                    is_active=True,
                    is_online=True,
                    config=storage_config
                )

                self.db.add(new_location)
                self.db.commit()
                self.db.refresh(new_location)

                logger.info(f"✓ Storage location created: {location_name} (ID: {new_location.id})")
                return new_location

        except Exception as e:
            logger.error(f"Failed to sync storage location from API: {e}", exc_info=True)
            self.db.rollback()
            return None

    def sync_all_tiers(self, force_update: bool = False) -> Dict[str, Optional[StorageLocation]]:
        """
        Sync storage locations for all tiers

        Args:
            force_update: Force update even if locations exist

        Returns:
            Dict with tier -> StorageLocation mapping
        """
        results = {}

        for tier in ['hot', 'warm', 'cold']:
            location = self.sync_storage_location_from_api(tier=tier, force_update=force_update)
            results[tier] = location

        return results

    def get_active_storage_config(self) -> Optional[Dict[str, Any]]:
        """
        Get currently active storage configuration (from API or database)

        Returns:
            Active storage config or None
        """
        # Try API first
        api_config = self.fetch_storage_config_from_api()

        if api_config and api_config.get('active'):
            return {
                'source': 'api',
                'config': api_config
            }

        # Fallback to database
        logger.info("Falling back to database storage config")

        # Get highest priority S3 storage location
        s3_location = self.db.query(StorageLocation).filter(
            StorageLocation.adapter_type == 's3',
            StorageLocation.is_active == True,
            StorageLocation.is_online == True
        ).order_by(StorageLocation.priority.desc()).first()

        if s3_location:
            return {
                'source': 'database',
                'location_id': str(s3_location.id),
                'location_name': s3_location.name,
                'config': s3_location.config
            }

        return None

    def verify_storage_health(self) -> Dict[str, Any]:
        """
        Verify storage configuration health

        Returns:
            Health status dict
        """
        health = {
            'api_accessible': False,
            'api_config_valid': False,
            'db_config_valid': False,
            'active_storage': None,
            'errors': []
        }

        # Check API
        try:
            api_config = self.fetch_storage_config_from_api()
            if api_config:
                health['api_accessible'] = True

                if api_config.get('active'):
                    health['api_config_valid'] = True
                    health['active_storage'] = 'api'
        except Exception as e:
            health['errors'].append(f"API check failed: {e}")

        # Check database
        try:
            s3_location = self.db.query(StorageLocation).filter(
                StorageLocation.adapter_type == 's3',
                StorageLocation.is_active == True
            ).first()

            if s3_location:
                health['db_config_valid'] = True
                if not health['active_storage']:
                    health['active_storage'] = 'database'
        except Exception as e:
            health['errors'].append(f"Database check failed: {e}")

        return health


def get_storage_config_sync(db: Session) -> StorageConfigSync:
    """
    Get storage config sync service instance

    Args:
        db: Database session

    Returns:
        StorageConfigSync instance
    """
    return StorageConfigSync(db)
