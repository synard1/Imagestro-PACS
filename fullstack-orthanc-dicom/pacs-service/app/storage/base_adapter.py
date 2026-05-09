"""
Storage Adapter Base Class
Defines interface for all storage adapters (Local, S3, MinIO, Contabo, etc.)
"""

from abc import ABC, abstractmethod
from typing import Optional, Dict, Any
from pathlib import Path
import logging

logger = logging.getLogger(__name__)


class StorageAdapter(ABC):
    """
    Abstract base class for storage adapters
    
    All storage backends must implement this interface to ensure
    compatibility and allow easy switching between storage providers.
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize storage adapter
        
        Args:
            config: Configuration dictionary specific to the storage adapter
        """
        self.config = config
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
    
    @abstractmethod
    async def store(
        self,
        source_path: str,
        destination_key: str,
        metadata: Optional[Dict[str, str]] = None
    ) -> str:
        """
        Store a file
        
        Args:
            source_path: Local path to the file to store
            destination_key: Storage key/path for the file
            metadata: Optional metadata to attach to the file
            
        Returns:
            Storage location identifier (path, URL, or key)
            
        Raises:
            FileNotFoundError: If source file doesn't exist
            StorageError: If storage operation fails
        """
        pass
    
    @abstractmethod
    async def retrieve(
        self,
        storage_key: str,
        destination_path: Optional[str] = None
    ) -> str:
        """
        Retrieve a file from storage
        
        Args:
            storage_key: Storage key/path of the file
            destination_path: Optional local path to download to
            
        Returns:
            Path to the retrieved file
            
        Raises:
            FileNotFoundError: If file doesn't exist in storage
            StorageError: If retrieval fails
        """
        pass
    
    @abstractmethod
    async def delete(self, storage_key: str) -> bool:
        """
        Delete a file from storage
        
        Args:
            storage_key: Storage key/path of the file
            
        Returns:
            True if deleted successfully, False otherwise
        """
        pass
    
    @abstractmethod
    async def exists(self, storage_key: str) -> bool:
        """
        Check if a file exists in storage
        
        Args:
            storage_key: Storage key/path of the file
            
        Returns:
            True if exists, False otherwise
        """
        pass
    
    @abstractmethod
    async def get_url(
        self,
        storage_key: str,
        expiration: int = 3600
    ) -> str:
        """
        Get a URL to access the file
        
        For local storage, this returns a file:// URL
        For cloud storage, this returns a presigned URL
        
        Args:
            storage_key: Storage key/path of the file
            expiration: URL expiration time in seconds (for presigned URLs)
            
        Returns:
            URL to access the file
        """
        pass
    
    @abstractmethod
    async def get_metadata(self, storage_key: str) -> Dict[str, Any]:
        """
        Get file metadata
        
        Args:
            storage_key: Storage key/path of the file
            
        Returns:
            Dictionary containing file metadata (size, modified time, etc.)
        """
        pass
    
    @abstractmethod
    async def list_files(
        self,
        prefix: Optional[str] = None,
        limit: int = 1000
    ) -> list:
        """
        List files in storage
        
        Args:
            prefix: Optional prefix to filter files
            limit: Maximum number of files to return
            
        Returns:
            List of file keys/paths
        """
        pass
    
    @abstractmethod
    async def get_stats(self) -> Dict[str, Any]:
        """
        Get storage statistics
        
        Returns:
            Dictionary with storage stats (total size, file count, etc.)
        """
        pass
    
    @abstractmethod
    async def health_check(self) -> Dict[str, Any]:
        """
        Check storage connectivity and return health status.

        Returns:
            Dict with keys: 'ok' (bool), 'adapter' (str), 'latency_ms' (int),
            and optional 'error' (str) on failure.
        """
        pass

    def get_adapter_type(self) -> str:
        """
        Get the type of this adapter

        Returns:
            Adapter type string ('local', 's3', 'minio', etc.)
        """
        return self.__class__.__name__.replace('StorageAdapter', '').lower()


class StorageError(Exception):
    """Base exception for storage operations"""
    pass


class StorageConnectionError(StorageError):
    """Exception for storage connection failures"""
    pass


class StorageOperationError(StorageError):
    """Exception for storage operation failures"""
    pass
