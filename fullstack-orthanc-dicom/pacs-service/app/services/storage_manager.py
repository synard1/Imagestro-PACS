"""
Storage Manager Service
Manage DICOM file storage on filesystem
"""

import os
import shutil
import hashlib
import logging
from pathlib import Path
from typing import Optional, Tuple
from datetime import datetime

logger = logging.getLogger(__name__)


class StorageManager:
    """Manage DICOM file storage"""
    
    def __init__(self, base_path: str = None):
        """
        Initialize storage manager

        Args:
            base_path: Base path for DICOM storage (defaults to env STORAGE_PATH or /var/lib/pacs/storage)
        """
        if base_path is None:
            base_path = os.getenv('STORAGE_PATH', '/var/lib/pacs/storage')
        self.base_path = Path(base_path)
        self._ensure_base_path()
    
    def _ensure_base_path(self):
        """Ensure base path exists"""
        try:
            self.base_path.mkdir(parents=True, exist_ok=True)
            logger.info(f"Storage base path: {self.base_path}")
        except Exception as e:
            logger.error(f"Failed to create base path: {str(e)}")
            raise
    
    def store_file(
        self, 
        source_path: str, 
        study_id: str, 
        series_id: str, 
        instance_id: str,
        tier: str = 'hot'
    ) -> str:
        """
        Store DICOM file in organized structure
        
        Args:
            source_path: Source file path
            study_id: Study Instance UID
            series_id: Series Instance UID
            instance_id: SOP Instance UID
            tier: Storage tier (hot/warm/cold)
            
        Returns:
            Target file path
            
        Raises:
            FileNotFoundError: If source file does not exist
            IOError: If file copy fails
        """
        try:
            # Validate source file
            if not os.path.exists(source_path):
                raise FileNotFoundError(f"Source file not found: {source_path}")
            
            # Create directory structure: tier/study/series/
            target_dir = self.base_path / tier / self._sanitize_uid(study_id) / self._sanitize_uid(series_id)
            target_dir.mkdir(parents=True, exist_ok=True)
            
            # Generate filename: instance_id.dcm
            filename = f"{self._sanitize_uid(instance_id)}.dcm"
            target_path = target_dir / filename
            
            # Copy file
            shutil.copy2(source_path, target_path)
            
            logger.info(f"Stored file: {target_path}")
            return str(target_path)
            
        except Exception as e:
            logger.error(f"Failed to store file: {str(e)}")
            raise
    
    def get_file_path(
        self, 
        study_id: str, 
        series_id: str, 
        instance_id: str,
        tier: str = 'hot'
    ) -> Optional[str]:
        """
        Get file path for DICOM instance
        
        Args:
            study_id: Study Instance UID
            series_id: Series Instance UID
            instance_id: SOP Instance UID
            tier: Storage tier
            
        Returns:
            File path if exists, None otherwise
        """
        file_path = (
            self.base_path / tier / 
            self._sanitize_uid(study_id) / 
            self._sanitize_uid(series_id) / 
            f"{self._sanitize_uid(instance_id)}.dcm"
        )
        
        if file_path.exists():
            return str(file_path)
        return None
    
    def delete_file(self, file_path: str) -> bool:
        """
        Delete DICOM file
        
        Args:
            file_path: Path to file
            
        Returns:
            True if deleted, False otherwise
        """
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
                logger.info(f"Deleted file: {file_path}")
                return True
            return False
        except Exception as e:
            logger.error(f"Failed to delete file: {str(e)}")
            return False
    
    def move_file(self, source_path: str, target_tier: str) -> Optional[str]:
        """
        Move file to different storage tier
        
        Args:
            source_path: Current file path
            target_tier: Target storage tier
            
        Returns:
            New file path if successful, None otherwise
        """
        try:
            source = Path(source_path)
            if not source.exists():
                return None
            
            # Extract study/series/instance from path
            parts = source.parts
            instance_file = parts[-1]
            series_id = parts[-2]
            study_id = parts[-3]
            
            # Create target path
            target_dir = self.base_path / target_tier / study_id / series_id
            target_dir.mkdir(parents=True, exist_ok=True)
            target_path = target_dir / instance_file
            
            # Move file
            shutil.move(str(source), str(target_path))
            
            logger.info(f"Moved file from {source_path} to {target_path}")
            return str(target_path)
            
        except Exception as e:
            logger.error(f"Failed to move file: {str(e)}")
            return None
    
    def get_file_hash(self, file_path: str) -> str:
        """
        Calculate SHA256 hash of file
        
        Args:
            file_path: Path to file
            
        Returns:
            SHA256 hash as hex string
        """
        sha256 = hashlib.sha256()
        try:
            with open(file_path, 'rb') as f:
                for chunk in iter(lambda: f.read(4096), b''):
                    sha256.update(chunk)
            return sha256.hexdigest()
        except Exception as e:
            logger.error(f"Failed to calculate hash: {str(e)}")
            raise
    
    def get_file_size(self, file_path: str) -> int:
        """
        Get file size in bytes
        
        Args:
            file_path: Path to file
            
        Returns:
            File size in bytes
        """
        try:
            return os.path.getsize(file_path)
        except Exception as e:
            logger.error(f"Failed to get file size: {str(e)}")
            raise
    
    def get_storage_stats(self, tier: Optional[str] = None) -> dict:
        """
        Get storage statistics
        
        Args:
            tier: Storage tier (optional, all tiers if None)
            
        Returns:
            Dictionary with storage statistics
        """
        try:
            if tier:
                path = self.base_path / tier
            else:
                path = self.base_path
            
            total_size = 0
            file_count = 0
            
            for root, dirs, files in os.walk(path):
                for file in files:
                    if file.endswith('.dcm'):
                        file_path = os.path.join(root, file)
                        total_size += os.path.getsize(file_path)
                        file_count += 1
            
            return {
                'tier': tier or 'all',
                'file_count': file_count,
                'total_size_bytes': total_size,
                'total_size_mb': total_size / (1024 * 1024),
                'total_size_gb': total_size / (1024 * 1024 * 1024)
            }
        except Exception as e:
            logger.error(f"Failed to get storage stats: {str(e)}")
            return {
                'tier': tier or 'all',
                'file_count': 0,
                'total_size_bytes': 0,
                'total_size_mb': 0,
                'total_size_gb': 0
            }
    
    def cleanup_empty_directories(self, tier: Optional[str] = None):
        """
        Remove empty directories
        
        Args:
            tier: Storage tier (optional, all tiers if None)
        """
        try:
            if tier:
                path = self.base_path / tier
            else:
                path = self.base_path
            
            for root, dirs, files in os.walk(path, topdown=False):
                for dir_name in dirs:
                    dir_path = os.path.join(root, dir_name)
                    try:
                        if not os.listdir(dir_path):
                            os.rmdir(dir_path)
                            logger.info(f"Removed empty directory: {dir_path}")
                    except OSError:
                        pass
        except Exception as e:
            logger.error(f"Failed to cleanup directories: {str(e)}")
    
    def _sanitize_uid(self, uid: str) -> str:
        """
        Sanitize UID for use in filesystem
        
        Args:
            uid: DICOM UID
            
        Returns:
            Sanitized UID
        """
        # Replace invalid filesystem characters
        return uid.replace('/', '_').replace('\\', '_').replace(':', '_')


# Singleton instance
_storage_manager_instance = None

def get_storage_manager(base_path: str = None) -> StorageManager:
    """Get singleton storage manager instance"""
    global _storage_manager_instance
    if _storage_manager_instance is None:
        if base_path is None:
            base_path = os.getenv('STORAGE_PATH', '/var/lib/pacs/storage')
        _storage_manager_instance = StorageManager(base_path)
    return _storage_manager_instance
