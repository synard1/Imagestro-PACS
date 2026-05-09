"""
Local Filesystem Storage Adapter
Wraps existing StorageManager for backward compatibility
"""

import os
import time
import shutil
from typing import Optional, Dict, Any
from pathlib import Path
import asyncio

from app.storage.base_adapter import StorageAdapter, StorageError, StorageOperationError
from app.services.storage_manager import StorageManager
import logging

logger = logging.getLogger(__name__)


class LocalStorageAdapter(StorageAdapter):
    """
    Local filesystem storage adapter
    
    Wraps the existing StorageManager to provide backward compatibility
    while implementing the new adapter interface.
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize local storage adapter
        
        Args:
            config: Configuration dict with 'base_path' key
        """
        super().__init__(config)
        base_path = config.get('base_path', os.getenv('STORAGE_PATH', '/var/lib/pacs/storage'))
        self.storage_manager = StorageManager(base_path)
        self.base_path = Path(self.storage_manager.base_path)
        self.logger.info(f"LocalStorageAdapter initialized with base_path: {self.base_path}")
    
    async def store(
        self,
        source_path: str,
        destination_key: str,
        metadata: Optional[Dict[str, str]] = None
    ) -> str:
        """
        Store file to local filesystem

        Args:
            source_path: Path to source file
            destination_key: Destination path (format: tenant/patient/studies/study/series/instance.dcm)
            metadata: Optional metadata (not used for local storage)

        Returns:
            Absolute path to stored file
        """
        try:
            if not os.path.exists(source_path):
                raise FileNotFoundError(f"Source file not found: {source_path}")

            # Path-agnostic storage using Path.joinpath
            # Supports any hierarchical structure provided in destination_key
            parts = destination_key.split('/')
            target_path = self.base_path.joinpath(*parts)

            # Ensure parent directories exist
            await asyncio.to_thread(target_path.parent.mkdir, parents=True, exist_ok=True)

            # Use shutil.copy2 for storage (metadata preservation)
            await asyncio.to_thread(shutil.copy2, source_path, str(target_path))

            self.logger.info(f"Stored file to local storage: {target_path}")
            return str(target_path)

        except Exception as e:
            self.logger.error(f"Failed to store file: {str(e)}")
            raise StorageOperationError(f"Store operation failed: {str(e)}")
    async def retrieve(
        self,
        storage_key: str,
        destination_path: Optional[str] = None
    ) -> str:
        """
        Retrieve file from local filesystem
        
        Args:
            storage_key: Path to file (absolute or relative to base_path)
            destination_path: Optional destination path (if None, returns original path)
            
        Returns:
            Path to the file
        """
        try:
            # Convert to absolute path if relative
            if not os.path.isabs(storage_key):
                file_path = self.base_path / storage_key
            else:
                file_path = Path(storage_key)
            
            if not file_path.exists():
                raise FileNotFoundError(f"File not found: {file_path}")
            
            # If destination specified, copy file
            if destination_path:
                await asyncio.to_thread(shutil.copy2, str(file_path), destination_path)
                return destination_path
            
            return str(file_path)
            
        except FileNotFoundError:
            raise
        except Exception as e:
            self.logger.error(f"Failed to retrieve file: {str(e)}")
            raise StorageOperationError(f"Retrieve operation failed: {str(e)}")
    
    async def delete(self, storage_key: str) -> bool:
        """
        Delete file from local filesystem
        
        Args:
            storage_key: Path to file
            
        Returns:
            True if deleted successfully
        """
        try:
            # Convert to absolute path if relative
            if not os.path.isabs(storage_key):
                file_path = self.base_path / storage_key
            else:
                file_path = Path(storage_key)
            
            result = await asyncio.to_thread(
                self.storage_manager.delete_file,
                str(file_path)
            )
            
            return result
            
        except Exception as e:
            self.logger.error(f"Failed to delete file: {str(e)}")
            return False
    
    async def exists(self, storage_key: str) -> bool:
        """
        Check if file exists
        
        Args:
            storage_key: Path to file
            
        Returns:
            True if exists
        """
        try:
            if not os.path.isabs(storage_key):
                file_path = self.base_path / storage_key
            else:
                file_path = Path(storage_key)
            
            return await asyncio.to_thread(file_path.exists)
            
        except Exception as e:
            self.logger.error(f"Error checking file existence: {str(e)}")
            return False
    
    async def get_url(
        self,
        storage_key: str,
        expiration: int = 3600
    ) -> str:
        """
        Get file:// URL for local file
        
        Args:
            storage_key: Path to file
            expiration: Not used for local storage
            
        Returns:
            file:// URL
        """
        if not os.path.isabs(storage_key):
            file_path = self.base_path / storage_key
        else:
            file_path = Path(storage_key)
        
        return file_path.as_uri()
    
    async def get_metadata(self, storage_key: str) -> Dict[str, Any]:
        """
        Get file metadata
        
        Args:
            storage_key: Path to file
            
        Returns:
            Metadata dict with size, modified time, etc.
        """
        try:
            if not os.path.isabs(storage_key):
                file_path = self.base_path / storage_key
            else:
                file_path = Path(storage_key)
            
            if not file_path.exists():
                raise FileNotFoundError(f"File not found: {file_path}")
            
            stat = await asyncio.to_thread(file_path.stat)
            
            return {
                'size': stat.st_size,
                'size_mb': stat.st_size / (1024 * 1024),
                'modified': stat.st_mtime,
                'path': str(file_path),
                'type': 'file' if file_path.is_file() else 'directory'
            }
            
        except FileNotFoundError:
            raise
        except Exception as e:
            self.logger.error(f"Failed to get metadata: {str(e)}")
            raise StorageOperationError(f"Get metadata failed: {str(e)}")
    
    async def list_files(
        self,
        prefix: Optional[str] = None,
        limit: int = 1000
    ) -> list:
        """
        List files in storage
        
        Args:
            prefix: Optional directory prefix
            limit: Maximum files to return
            
        Returns:
            List of file paths
        """
        try:
            search_path = self.base_path
            if prefix:
                search_path = self.base_path / prefix
            
            if not search_path.exists():
                return []
            
            files = []
            count = 0
            
            for root, dirs, filenames in os.walk(search_path):
                for filename in filenames:
                    if filename.endswith('.dcm'):
                        file_path = os.path.join(root, filename)
                        # Return relative path from base_path
                        rel_path = os.path.relpath(file_path, self.base_path)
                        files.append(rel_path)
                        count += 1
                        if count >= limit:
                            return files
            
            return files
            
        except Exception as e:
            self.logger.error(f"Failed to list files: {str(e)}")
            return []
    
    async def get_stats(self) -> Dict[str, Any]:
        """
        Get storage statistics

        Returns:
            Storage stats dict
        """
        try:
            stats = await asyncio.to_thread(
                self.storage_manager.get_storage_stats,
                tier=None
            )

            # Add additional info
            stats['adapter_type'] = 'local'
            stats['base_path'] = str(self.base_path)

            return stats

        except Exception as e:
            self.logger.error(f"Failed to get stats: {str(e)}")
            return {
                'adapter_type': 'local',
                'base_path': str(self.base_path),
                'file_count': 0,
                'total_size_bytes': 0,
                'total_size_mb': 0,
                'total_size_gb': 0
            }

    async def health_check(self) -> Dict[str, Any]:
        """Check local storage path accessibility"""
        t0 = time.monotonic()
        try:
            exists = await asyncio.to_thread(self.base_path.exists)
            readable = await asyncio.to_thread(os.access, str(self.base_path), os.R_OK)
            writable = await asyncio.to_thread(os.access, str(self.base_path), os.W_OK)
            latency_ms = int((time.monotonic() - t0) * 1000)
            ok = bool(exists and readable and writable)
            return {
                'ok': ok,
                'adapter': 'LocalStorageAdapter',
                'base_path': str(self.base_path),
                'readable': readable,
                'writable': writable,
                'latency_ms': latency_ms,
            }
        except Exception as e:
            return {'ok': False, 'adapter': 'LocalStorageAdapter', 'error': str(e)}
