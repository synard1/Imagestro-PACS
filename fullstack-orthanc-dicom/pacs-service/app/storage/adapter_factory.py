"""
Storage Adapter Factory
Creates appropriate storage adapter based on configuration
"""

from typing import Dict, Any, Optional, Tuple
import os
import logging
from sqlalchemy.orm import Session
from app.storage.base_adapter import StorageAdapter
from app.storage.local_adapter import LocalStorageAdapter

logger = logging.getLogger(__name__)


class StorageAdapterFactory:
    """Factory for creating storage adapters"""

    @staticmethod
    def create_adapter(adapter_type: str = None, config: Dict[str, Any] = None) -> StorageAdapter:
        """
        Create storage adapter based on type
        """
        # Default to 'local' if not specified
        if adapter_type is None:
            adapter_type = os.getenv('STORAGE_ADAPTER', 'local').lower()

        if config is None:
            config = {}

        if adapter_type == 'local':
            return LocalStorageAdapter(config)

        elif adapter_type in ['s3', 'minio', 'contabo', 'wasabi', 'backblaze', 'r2', 'cloudflare', 's3-compatible']:
            try:
                from app.storage.s3_adapter import S3StorageAdapter

                # Auto-configure provider-specific defaults
                if adapter_type == 'minio' and not config.get('endpoint_url'):
                    config['endpoint_url'] = os.getenv('MINIO_ENDPOINT_URL', 'http://localhost:9000')
                    config['addressing_style'] = 'path'

                elif adapter_type == 'contabo' and not config.get('endpoint_url'):
                    region = config.get('region', os.getenv('CONTABO_REGION', 'eu2'))
                    config['endpoint_url'] = f'https://{region}.contabostorage.com'

                elif adapter_type == 'wasabi' and not config.get('endpoint_url'):
                    region = config.get('region', os.getenv('WASABI_REGION', 's3'))
                    config['endpoint_url'] = f'https://{region}.wasabisys.com'

                elif adapter_type == 'backblaze':
                    if not config.get('endpoint_url'):
                        region = config.get('region', 'us-west-004')
                        config['endpoint_url'] = f'https://s3.{region}.backblazeb2.com'
                    # Backblaze B2 requires path-style addressing
                    config['addressing_style'] = 'path'

                elif adapter_type in ['r2', 'cloudflare']:
                    # Cloudflare R2 default region is 'auto'
                    if not config.get('region'):
                        config['region'] = 'auto'
                    # Usually auto or virtual addressing style works best for R2
                    if not config.get('addressing_style'):
                        config['addressing_style'] = 'auto'

                return S3StorageAdapter(config)

            except ImportError as e:
                raise ImportError(
                    f"S3 adapter requires boto3. Install with: pip install boto3\n"
                    f"Error: {str(e)}"
                )

        else:
            raise ValueError(f"Unknown storage adapter type: {adapter_type}")

    @staticmethod
    def get_default_config(adapter_type: str) -> Dict[str, Any]:
        if adapter_type == 'local':
            return {
                'base_path': os.getenv('STORAGE_PATH', '/var/lib/pacs/storage')
            }

        elif adapter_type in ['s3', 'minio', 'contabo', 'wasabi', 'backblaze', 'r2', 'cloudflare', 's3-compatible']:
            return {
                'bucket_name': os.getenv('S3_BUCKET_NAME', ''),
                'access_key': os.getenv('S3_ACCESS_KEY', ''),
                'secret_key': os.getenv('S3_SECRET_KEY', ''),
                'region': os.getenv('S3_REGION', 'us-east-1'),
                'endpoint_url': os.getenv('S3_ENDPOINT_URL', None),
                'use_ssl': os.getenv('S3_USE_SSL', 'true').lower() == 'true',
                'addressing_style': os.getenv('S3_ADDRESSING_STYLE', 'auto')
            }

        return {}


# Cache for adapter instances to avoid repeated lookups/initialization
_tenant_adapters = {}
_backend_id_adapters = {}


def get_storage_adapter(db: Session, tenant_id: Optional[str] = None, config_overrides: Optional[Dict[str, Any]] = None) -> StorageAdapter:
    """
    Backward compatible wrapper: returns only the adapter
    """
    adapter, _ = get_storage_adapter_with_id(db, tenant_id, config_overrides)
    return adapter

def get_storage_adapter_with_id(db: Session, tenant_id: Optional[str] = None, config_overrides: Optional[Dict[str, Any]] = None) -> Tuple[StorageAdapter, Optional[str]]:
    """
    Get active storage adapter and its backend ID for a tenant or system default.
    """
    from app.models.storage_backend import StorageBackend

    cache_key = str(tenant_id) if tenant_id else 'system'

    # Look up active config in DB
    query = db.query(StorageBackend).filter(StorageBackend.is_active == True)
    if tenant_id:
        # Prioritize tenant-specific active storage
        backend = query.filter(StorageBackend.tenant_id == tenant_id).first()
        if not backend:
            # Fallback to system-wide active storage
            backend = query.filter(StorageBackend.tenant_id == None).first()
    else:
        # System-wide active storage
        backend = query.filter(StorageBackend.tenant_id == None).first()

    adapter = None
    backend_id = str(backend.id) if backend else None

    if backend:
        config = backend.config.copy()
        if config_overrides:
            config.update(config_overrides)

        adapter = StorageAdapterFactory.create_adapter(backend.type, config)
    else:
        # Final fallback to environment variables
        adapter_type = os.getenv('STORAGE_ADAPTER', 'local')
        config = StorageAdapterFactory.get_default_config(adapter_type)
        if config_overrides:
            config.update(config_overrides)

        adapter = StorageAdapterFactory.create_adapter(adapter_type, config)

    # Note: We DON'T cache when overrides (like dynamic callbacks) are used
    if not config_overrides:
        _tenant_adapters[cache_key] = adapter
        if backend:
            _backend_id_adapters[str(backend.id)] = adapter

    return adapter, backend_id


def get_adapter_by_id(db: Session, storage_id: str, config_overrides: Optional[Dict[str, Any]] = None) -> StorageAdapter:
    """
    Get specific storage adapter by its backend ID (for retrieval).
    """
    from app.models.storage_backend import StorageBackend

    backend = db.query(StorageBackend).filter(StorageBackend.id == storage_id).first()
    if not backend:
        # If ID not found, return default system adapter
        return get_storage_adapter(db, None, config_overrides)

    config = backend.config.copy()
    if config_overrides:
        config.update(config_overrides)

    adapter = StorageAdapterFactory.create_adapter(backend.type, config)
    return adapter


def clear_adapter_cache(tenant_id: Optional[str] = None):
    """Clear cached adapters (useful when config changes)"""
    global _tenant_adapters, _backend_id_adapters
    if tenant_id:
        _tenant_adapters.pop(str(tenant_id), None)
    else:
        _tenant_adapters.clear()
    _backend_id_adapters.clear()
