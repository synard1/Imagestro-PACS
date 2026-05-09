"""
Storage Configuration API
Manages storage adapter configuration and testing
"""

import logging
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.config import settings
from app.storage.adapter_factory import StorageAdapterFactory, get_storage_adapter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/storage-config", tags=["storage-config"])


class StorageConfigRequest(BaseModel):
    """Storage configuration request"""
    adapter_type: str
    config: Dict[str, Any]


@router.get("/current")
async def get_current_config():
    """
    Get current storage configuration
    
    Returns the active storage adapter type and its configuration.
    """
    try:
        adapter = get_storage_adapter()
        adapter_type = adapter.get_adapter_type() if hasattr(adapter, 'get_adapter_type') else 'local'

        return {
            "adapter_type": adapter_type,
            "config": {
                "storage_path": settings.storage_path,
                "max_storage_gb": settings.max_storage_gb
            },
            "available_adapters": StorageAdapterFactory.list_available_adapters()
        }
    except Exception as e:
        logger.error(f"Failed to get storage config: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/providers")
async def list_providers():
    """
    List available storage providers
    
    Returns list of supported storage adapter types.
    """
    try:
        adapters = StorageAdapterFactory.list_available_adapters()
        
        provider_details = []
        for adapter in adapters:
            details = {
                "type": adapter,
                "name": adapter.upper(),
                "requires_config": adapter != 'local'
            }
            
            if adapter == 'local':
                details['description'] = "Local filesystem storage"
                details['fields'] = ['base_path']
            elif adapter in ['s3', 'minio', 'contabo', 'wasabi', 's3-compatible']:
                details['description'] = "S3-compatible object storage"
                details['fields'] = ['bucket_name', 'access_key', 'secret_key', 'region', 'endpoint_url']
            
            provider_details.append(details)
        
        return {"providers": provider_details}
        
    except Exception as e:
        logger.error(f"Failed to list providers: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/test")
async def test_connection(config_request: StorageConfigRequest):
    """
    Test storage adapter connection
    
    Validates configuration and tests connectivity to the storage backend.
    """
    try:
        adapter_type = config_request.adapter_type
        config = config_request.config
        
        # Create adapter with provided config
        adapter = StorageAdapterFactory.create_adapter(adapter_type, config)
        
        # Test connection by getting stats
        stats = await adapter.get_stats()
        
        return {
            "success": True,
            "message": f"Successfully connected to {adapter_type} storage",
            "stats": stats
        }
        
    except Exception as e:
        logger.error(f"Storage connection test failed: {str(e)}")
        return {
            "success": False,
            "message": f"Connection failed: {str(e)}",
            "error": str(e)
        }


@router.get("/stats")
async def get_storage_stats():
    """
    Get current storage statistics
    
    Returns statistics from the active storage adapter.
    """
    try:
        adapter = get_storage_adapter()
        stats = await adapter.get_stats()
        return stats
        
    except Exception as e:
        logger.error(f"Failed to get storage stats: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def check_storage_health():
    """
    Check storage health
    
    Verifies that the storage backend is accessible and functioning.
    """
    try:
        adapter = get_storage_adapter()
        
        # Try to get stats as health check
        stats = await adapter.get_stats()
        
        return {
            "healthy": True,
            "adapter_type": adapter.get_adapter_type(),
            "file_count": stats.get('file_count', 0),
            "total_size_gb": stats.get('total_size_gb', 0)
        }
        
    except Exception as e:
        logger.error(f"Storage health check failed: {str(e)}")
        return {
            "healthy": False,
            "error": str(e)
        }
