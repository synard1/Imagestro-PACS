"""
WADO-RS Service
Web Access to DICOM Objects - RESTful Services
Implements DICOMweb standard for image retrieval
"""

from __future__ import annotations

import logging
import io
from typing import Optional, List, Dict, Any
from pathlib import Path

try:
    from pydicom import dcmread
    from PIL import Image
    import numpy as np
    IMAGING_AVAILABLE = True
except ImportError:
    IMAGING_AVAILABLE = False
    logging.warning("PIL or numpy not available. Image processing will be limited.")

from sqlalchemy.orm import Session
from app.services.dicom_storage import DicomStorageService

logger = logging.getLogger(__name__)


class WadoService:
    """WADO-RS service for DICOMweb image retrieval"""
    
    def __init__(self, db: Session):
        """
        Initialize WADO service
        
        Args:
            db: Database session
        """
        self.db = db
        self.storage_service = DicomStorageService(db)
    
    async def get_study_instances(self, study_id: str) -> List[Dict[str, Any]]:
        """
        Get all instances in a study
        
        Args:
            study_id: Study Instance UID
            
        Returns:
            List of instance metadata
        """
        try:
            files = await self.storage_service.search_dicom(
                study_id=study_id,
                limit=10000  # Large limit for all instances
            )
            
            return [f.to_dict() for f in files]
            
        except Exception as e:
            logger.error(f"Failed to get study instances: {str(e)}")
            raise
    
    async def get_series_instances(
        self, 
        study_id: str, 
        series_id: str
    ) -> List[Dict[str, Any]]:
        """
        Get all instances in a series
        
        Args:
            study_id: Study Instance UID
            series_id: Series Instance UID
            
        Returns:
            List of instance metadata
        """
        try:
            files = await self.storage_service.search_dicom(
                study_id=study_id,
                series_id=series_id,
                limit=10000
            )
            
            return [f.to_dict() for f in files]
            
        except Exception as e:
            logger.error(f"Failed to get series instances: {str(e)}")
            raise
    
    async def get_instance(
        self, 
        study_id: str, 
        series_id: str, 
        instance_id: str
    ) -> Optional[bytes]:
        """
        Get DICOM instance file
        
        Args:
            study_id: Study Instance UID
            series_id: Series Instance UID
            instance_id: SOP Instance UID
            
        Returns:
            DICOM file bytes or None
        """
        try:
            logger.info(f"Getting instance {instance_id} from study {study_id}")
            
            # Try to get by sop_instance_uid first
            file = await self.storage_service.get_dicom(instance_id)
            if file:
                if not Path(file.file_path).exists():
                    logger.error(f"DICOM file not found: {file.file_path}")
                    return None
                with open(file.file_path, 'rb') as f:
                    data = f.read()
                    logger.info(f"Read {len(data)} bytes from {file.file_path}")
                    return data
            
            # Fallback: search by study and series
            files = await self.storage_service.search_dicom(
                study_id=study_id,
                series_id=series_id,
                limit=100
            )
            
            # Find matching instance
            for f in files:
                if f.sop_instance_uid == instance_id or f.instance_id == instance_id:
                    if not Path(f.file_path).exists():
                        logger.error(f"DICOM file not found: {f.file_path}")
                        continue
                    # Read file
                    with open(f.file_path, 'rb') as file:
                        data = file.read()
                        logger.info(f"Read {len(data)} bytes from {f.file_path}")
                        return data
            
            logger.warning(f"Instance {instance_id} not found")
            return None
            
        except Exception as e:
            logger.error(f"Failed to get instance {instance_id}: {str(e)}")
            return None
            
        except Exception as e:
            logger.error(f"Failed to get instance: {str(e)}")
            raise
    
    async def get_instance_metadata(
        self, 
        study_id: str, 
        series_id: str, 
        instance_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get instance metadata without pixel data
        
        Args:
            study_id: Study Instance UID
            series_id: Series Instance UID
            instance_id: SOP Instance UID
            
        Returns:
            Instance metadata or None
        """
        try:
            # Try to get by sop_instance_uid first
            file = await self.storage_service.get_dicom(instance_id)
            if file:
                return file.to_dict()
            
            # Fallback: search by study and series
            files = await self.storage_service.search_dicom(
                study_id=study_id,
                series_id=series_id,
                limit=100
            )
            
            for f in files:
                if f.sop_instance_uid == instance_id or f.instance_id == instance_id:
                    return f.to_dict()
            
            return None
            
        except Exception as e:
            logger.error(f"Failed to get instance metadata: {str(e)}")
            raise

    
    async def get_thumbnail(
        self, 
        study_id: str, 
        series_id: str, 
        instance_id: str,
        size: int = 200
    ) -> Optional[bytes]:
        """
        Get thumbnail image (JPEG)
        
        Args:
            study_id: Study Instance UID
            series_id: Series Instance UID
            instance_id: SOP Instance UID
            size: Thumbnail size (default 200px)
            
        Returns:
            JPEG image bytes or None
        """
        if not IMAGING_AVAILABLE:
            logger.warning("Image processing not available")
            return None
        
        try:
            # Try to get by sop_instance_uid first
            file = await self.storage_service.get_dicom(instance_id)
            if file:
                return self._generate_thumbnail(file.file_path, size)
            
            # Fallback: search by study and series
            files = await self.storage_service.search_dicom(
                study_id=study_id,
                series_id=series_id,
                limit=100
            )
            
            for f in files:
                if f.sop_instance_uid == instance_id or f.instance_id == instance_id:
                    return self._generate_thumbnail(f.file_path, size)
            
            return None
            
        except Exception as e:
            logger.error(f"Failed to generate thumbnail: {str(e)}")
            return None
    
    def _generate_thumbnail(self, file_path: str, size: int) -> Optional[bytes]:
        """
        Generate thumbnail from DICOM file
        
        Args:
            file_path: Path to DICOM file
            size: Thumbnail size
            
        Returns:
            JPEG bytes or None
        """
        try:
            # Read DICOM file
            ds = dcmread(file_path)
            
            # Get pixel array
            if not hasattr(ds, 'pixel_array'):
                logger.warning(f"No pixel data in {file_path}")
                return None
            
            pixel_array = ds.pixel_array
            
            # Normalize to 0-255
            pixel_array = self._normalize_pixels(pixel_array)
            
            # Convert to PIL Image
            if len(pixel_array.shape) == 2:
                # Grayscale
                image = Image.fromarray(pixel_array.astype('uint8'), mode='L')
            else:
                # RGB
                image = Image.fromarray(pixel_array.astype('uint8'), mode='RGB')
            
            # Resize to thumbnail
            image.thumbnail((size, size), Image.Resampling.LANCZOS)
            
            # Convert to JPEG
            buffer = io.BytesIO()
            image.save(buffer, format='JPEG', quality=85)
            buffer.seek(0)
            
            return buffer.getvalue()
            
        except Exception as e:
            logger.error(f"Failed to generate thumbnail: {str(e)}")
            return None
    
    def _normalize_pixels(self, pixel_array: np.ndarray) -> np.ndarray:
        """
        Normalize pixel values to 0-255 range
        
        Args:
            pixel_array: Input pixel array
            
        Returns:
            Normalized pixel array
        """
        try:
            # Get min and max
            pmin = pixel_array.min()
            pmax = pixel_array.max()
            
            # Avoid division by zero
            if pmax == pmin:
                return np.zeros_like(pixel_array)
            
            # Normalize to 0-255
            normalized = ((pixel_array - pmin) / (pmax - pmin) * 255.0)
            
            return normalized
            
        except Exception as e:
            logger.error(f"Failed to normalize pixels: {str(e)}")
            return pixel_array
    
    async def get_frame(
        self, 
        study_id: str, 
        series_id: str, 
        instance_id: str,
        frame_number: int,
        quality: int = 90
    ) -> Optional[bytes]:
        """
        Get specific frame from multi-frame DICOM instance
        
        Args:
            study_id: Study Instance UID
            series_id: Series Instance UID
            instance_id: SOP Instance UID or UUID
            frame_number: 1-based frame number
            quality: JPEG quality (1-100)
            
        Returns:
            JPEG frame image bytes or None
        """
        if not IMAGING_AVAILABLE:
            logger.warning("Image processing not available for frames")
            return None
        
        try:
            # Find the DICOM file
            files = await self.storage_service.search_dicom(
                study_id=study_id,
                series_id=series_id,
                limit=100
            )
            
            dicom_file = None
            for f in files:
                if f.sop_instance_uid == instance_id or f.instance_id == instance_id:
                    dicom_file = f
                    break
            
            if not dicom_file:
                logger.warning(f"DICOM instance not found: {instance_id}")
                return None
            
            return self._render_frame(
                dicom_file.file_path, 
                frame_number, 
                quality
            )
            
        except Exception as e:
            logger.error(f"Failed to get frame {frame_number}: {str(e)}")
            return None
    
    async def get_rendered_image(
        self, 
        study_id: str, 
        series_id: str, 
        instance_id: str,
        window_center: Optional[int] = None,
        window_width: Optional[int] = None,
        quality: int = 90
    ) -> Optional[bytes]:
        """
        Get rendered image with windowing applied
        
        Args:
            study_id: Study Instance UID
            series_id: Series Instance UID
            instance_id: SOP Instance UID
            window_center: Window center for display
            window_width: Window width for display
            quality: JPEG quality (1-100)
            
        Returns:
            JPEG image bytes or None
        """
        if not IMAGING_AVAILABLE:
            return None
        
        try:
            files = await self.storage_service.search_dicom(
                study_id=study_id,
                series_id=series_id,
                limit=1
            )
            
            for f in files:
                if f.sop_instance_uid == instance_id or f.instance_id == instance_id:
                    return self._render_image(
                        f.file_path, 
                        window_center, 
                        window_width, 
                        quality
                    )
            
            return None
            
        except Exception as e:
            logger.error(f"Failed to render image: {str(e)}")
            return None
    
    def _render_image(
        self, 
        file_path: str,
        window_center: Optional[int],
        window_width: Optional[int],
        quality: int
    ) -> Optional[bytes]:
        """
        Render DICOM image with windowing
        
        Args:
            file_path: Path to DICOM file
            window_center: Window center
            window_width: Window width
            quality: JPEG quality
            
        Returns:
            JPEG bytes or None
        """
        try:
            # Read DICOM
            ds = dcmread(file_path)
            
            if not hasattr(ds, 'pixel_array'):
                return None
            
            pixel_array = ds.pixel_array
            
            # Apply windowing if specified
            if window_center is not None and window_width is not None:
                pixel_array = self._apply_windowing(
                    pixel_array, 
                    window_center, 
                    window_width
                )
            else:
                # Auto-normalize
                pixel_array = self._normalize_pixels(pixel_array)
            
            # Convert to image
            if len(pixel_array.shape) == 2:
                image = Image.fromarray(pixel_array.astype('uint8'), mode='L')
            else:
                image = Image.fromarray(pixel_array.astype('uint8'), mode='RGB')
            
            # Save as JPEG
            buffer = io.BytesIO()
            image.save(buffer, format='JPEG', quality=quality)
            buffer.seek(0)
            
            return buffer.getvalue()
            
        except Exception as e:
            logger.error(f"Failed to render image: {str(e)}")
            return None
    
    def _render_frame(
        self, 
        file_path: str,
        frame_number: int,
        quality: int
    ) -> Optional[bytes]:
        """
        Render specific frame from multi-frame DICOM as JPEG
        
        Args:
            file_path: Path to DICOM file
            frame_number: 1-based frame number
            quality: JPEG quality (1-100)
            
        Returns:
            JPEG bytes or None
        """
        try:
            logger.info(f"Rendering frame {frame_number} from {file_path}")
            
            # Read DICOM file
            ds = dcmread(file_path, force=True)
            logger.info(f"DICOM loaded. Pixel array: {getattr(ds, 'pixel_array', None) is not None}")
            
            if not hasattr(ds, 'pixel_array') or ds.pixel_array is None:
                logger.warning(f"No pixel data in {file_path}")
                return None
            
            pixel_array = ds.pixel_array
            logger.info(f"Pixel array shape: {pixel_array.shape}, dtype: {pixel_array.dtype}")
            
            # Handle single-frame vs multi-frame
            if len(pixel_array.shape) == 2 or pixel_array.shape[0] == 1:
                logger.info("Single-frame instance")
                frame_pixels = pixel_array[0] if len(pixel_array.shape) > 2 else pixel_array
            else:
                # Multi-frame: extract specific frame (0-based index)
                if frame_number < 1 or frame_number > pixel_array.shape[0]:
                    logger.warning(f"Frame {frame_number} out of range (1-{pixel_array.shape[0]})")
                    return None
                
                logger.info(f"Extracting frame {frame_number-1} from {pixel_array.shape[0]} frames")
                frame_pixels = pixel_array[frame_number - 1]
            
            logger.info(f"Frame pixels shape: {frame_pixels.shape}")
            
            # Normalize pixels to 0-255 uint8
            frame_pixels = self._normalize_pixels(frame_pixels).astype(np.uint8)
            
            # Convert to PIL Image
            if len(frame_pixels.shape) == 2:
                image = Image.fromarray(frame_pixels, mode='L')
            elif frame_pixels.shape[-1] == 3:
                image = Image.fromarray(frame_pixels, mode='RGB')
            else:
                # Convert to grayscale
                if len(frame_pixels.shape) == 3:
                    frame_pixels = np.mean(frame_pixels, axis=-1).astype(np.uint8)
                image = Image.fromarray(frame_pixels, mode='L')
            
            logger.info(f"PIL image created: {image.size}, mode: {image.mode}")
            
            # Save as JPEG
            buffer = io.BytesIO()
            image.save(buffer, format='JPEG', quality=quality, optimize=True)
            buffer.seek(0)
            result = buffer.getvalue()
            logger.info(f"JPEG generated: {len(result)} bytes")
            
            return result
            
        except Exception as e:
            logger.exception(f"Failed to render frame {frame_number} from {file_path}: {str(e)}")
            return None
    
    def _apply_windowing(
        self, 
        pixel_array: np.ndarray,
        window_center: int,
        window_width: int
    ) -> np.ndarray:
        """
        Apply window/level to pixel array
        
        Args:
            pixel_array: Input pixels
            window_center: Window center
            window_width: Window width
            
        Returns:
            Windowed pixel array (0-255)
        """
        try:
            # Calculate window bounds
            lower = window_center - (window_width / 2)
            upper = window_center + (window_width / 2)
            
            # Clip values
            windowed = np.clip(pixel_array, lower, upper)
            
            # Normalize to 0-255
            windowed = ((windowed - lower) / window_width * 255.0)
            
            return windowed
            
        except Exception as e:
            logger.error(f"Failed to apply windowing: {str(e)}")
            return self._normalize_pixels(pixel_array)


# Singleton instance
_wado_service_cache = {}

def get_wado_service(db: Session) -> WadoService:
    """Get WADO service instance"""
    # Note: Not using singleton here as db session should be per-request
    return WadoService(db)
