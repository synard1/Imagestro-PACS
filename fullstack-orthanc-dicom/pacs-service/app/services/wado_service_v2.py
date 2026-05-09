"""
WADO Service V2
Enhanced WADO-RS service with presigned URL support and multi-storage backend
"""
import logging
import io
import os
from typing import Optional, List, Dict, Any, Union
from sqlalchemy.orm import Session
from sqlalchemy import and_

try:
    from pydicom import dcmread
    from PIL import Image
    import numpy as np
    IMAGING_AVAILABLE = True
except ImportError:
    IMAGING_AVAILABLE = False
    logging.warning("PIL, numpy or pydicom not available. Image processing will be limited.")

from app.models.dicom_file import DicomFile
from app.services.storage_adapter_manager import get_storage_adapter_manager
from app.services.dicom_storage_service_v2 import DicomStorageServiceV2

logger = logging.getLogger(__name__)


class WadoServiceV2:
    """
    Enhanced WADO-RS service with multi-storage support
    """

    def __init__(self, db: Session):
        """
        Initialize WADO service V2
        """
        self.db = db
        self.adapter_manager = get_storage_adapter_manager(db)
        self.storage_service = DicomStorageServiceV2(db)
        logger.info("WadoServiceV2 initialized")

    async def get_instance(
        self,
        study_id: str,
        series_id: str,
        instance_id: str,
        use_presigned_url: bool = False,
        use_original: bool = False
    ) -> Union[bytes, str, None]:
        """
        Get DICOM instance by Study/Series/Instance UIDs
        """
        try:
            # Query DICOM file using multiple UIDs for robustness
            dicom_file = self.db.query(DicomFile).filter(
                and_(
                    DicomFile.study_id == study_id,
                    DicomFile.series_id == series_id,
                    DicomFile.status.in_(['active', 'archived'])
                ),
                (DicomFile.instance_id == instance_id) | (DicomFile.sop_instance_uid == instance_id)
            ).first()

            if not dicom_file:
                logger.warning(
                    f"DICOM instance not found: "
                    f"Study={study_id}, Series={series_id}, Instance={instance_id}"
                )
                return None

            # If presigned URL requested and storage supports it
            if use_presigned_url:
                presigned_url = await self.get_instance_url(
                    study_id, series_id, instance_id, use_original=use_original
                )
                if presigned_url:
                    return presigned_url
                else:
                    logger.warning("Presigned URL not available, falling back to direct download")

            # Retrieve file path
            file_path = await self.storage_service.retrieve_dicom(dicom_file)
            if not file_path or not os.path.exists(file_path):
                logger.error(f"Failed to retrieve DICOM path: {instance_id}")
                return None

            # Read file data
            with open(file_path, 'rb') as f:
                data = f.read()

            logger.info(f"Successfully retrieved DICOM instance: {instance_id}")
            return data

        except Exception as e:
            logger.error(f"Error retrieving DICOM instance: {e}", exc_info=True)
            return None

    async def get_instance_url(
        self,
        study_id: str,
        series_id: str,
        instance_id: str,
        expiration: int = 3600,
        use_original: bool = False
    ) -> Optional[str]:
        """
        Get presigned URL for DICOM instance
        """
        try:
            # Query DICOM file
            dicom_file = self.db.query(DicomFile).filter(
                and_(
                    DicomFile.study_id == study_id,
                    DicomFile.series_id == series_id,
                    DicomFile.status.in_(['active', 'archived'])
                ),
                (DicomFile.instance_id == instance_id) | (DicomFile.sop_instance_uid == instance_id)
            ).first()

            if not dicom_file:
                logger.warning(f"DICOM instance not found for presigned URL: {instance_id}")
                return None

            # Check if file has storage location
            if not dicom_file.storage_location_id:
                return None

            # Get adapter
            adapter = await self.adapter_manager.get_adapter(str(dicom_file.storage_location_id))
            if not adapter or not hasattr(adapter, 'get_url'):
                return None

            # Generate presigned URL
            storage_key = self._resolve_storage_key(dicom_file, use_original)
            return await adapter.get_url(storage_key, expiration)

        except Exception as e:
            logger.error(f"Error generating presigned URL: {e}", exc_info=True)
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
        Get rendered JPEG image from DICOM instance
        """
        if not IMAGING_AVAILABLE:
            return None

        try:
            # Retrieve DICOM file path
            dicom_file = self.db.query(DicomFile).filter(
                and_(
                    DicomFile.study_id == study_id,
                    DicomFile.series_id == series_id,
                    DicomFile.status.in_(['active', 'archived'])
                ),
                (DicomFile.instance_id == instance_id) | (DicomFile.sop_instance_uid == instance_id)
            ).first()

            if not dicom_file:
                return None

            file_path = await self.storage_service.retrieve_dicom(dicom_file)
            if not file_path or not os.path.exists(file_path):
                return None

            # Render image
            ds = dcmread(file_path)
            if not hasattr(ds, 'pixel_array'):
                return None

            pixel_array = ds.pixel_array

            if window_center is not None and window_width is not None:
                pixel_array = self._apply_windowing(pixel_array, window_center, window_width)
            else:
                pixel_array = self._normalize_pixels(pixel_array)

            if len(pixel_array.shape) == 2:
                image = Image.fromarray(pixel_array.astype('uint8'), mode='L')
            else:
                image = Image.fromarray(pixel_array.astype('uint8'), mode='RGB')

            output_buffer = io.BytesIO()
            image.save(output_buffer, format='JPEG', quality=quality)
            return output_buffer.getvalue()

        except Exception as e:
            logger.error(f"Failed to render image (V2): {e}", exc_info=True)
            return None

    async def get_thumbnail(
        self,
        study_id: str,
        series_id: str,
        instance_id: str,
        size: int = 200
    ) -> Optional[bytes]:
        """
        Get thumbnail JPEG image from DICOM instance with disk caching
        """
        # Define thumbnail cache path
        cache_dir = f"/var/lib/pacs/storage/dicom/thumbnails/{study_id}/{series_id}"
        cache_path = f"{cache_dir}/{instance_id}_{size}.jpg"

        # Check cache
        if os.path.exists(cache_path):
            try:
                with open(cache_path, 'rb') as f:
                    return f.read()
            except Exception as e:
                logger.warning(f"Failed to read cached thumbnail: {e}")

        try:
            # Query DICOM file
            dicom_file = self.db.query(DicomFile).filter(
                and_(
                    DicomFile.study_id == study_id,
                    DicomFile.series_id == series_id,
                    DicomFile.status.in_(['active', 'archived'])
                ),
                (DicomFile.instance_id == instance_id) | (DicomFile.sop_instance_uid == instance_id)
            ).first()

            if not dicom_file:
                return None

            # Retrieve DICOM file path
            file_path = await self.storage_service.retrieve_dicom(dicom_file)
            if not file_path or not os.path.exists(file_path):
                return None

            if not IMAGING_AVAILABLE:
                return None

            # Render thumbnail
            ds = dcmread(file_path)
            if not hasattr(ds, 'pixel_array'):
                return None

            pixel_array = ds.pixel_array
            pixel_array = self._normalize_pixels(pixel_array)

            if len(pixel_array.shape) == 2:
                image = Image.fromarray(pixel_array.astype('uint8'), mode='L')
            else:
                image = Image.fromarray(pixel_array.astype('uint8'), mode='RGB')

            image.thumbnail((size, size), Image.Resampling.LANCZOS)
            output_buffer = io.BytesIO()
            image.save(output_buffer, format='JPEG', quality=85)
            thumbnail_bytes = output_buffer.getvalue()

            # Save to cache
            try:
                os.makedirs(cache_dir, exist_ok=True)
                with open(cache_path, 'wb') as f:
                    f.write(thumbnail_bytes)
            except Exception as cache_error:
                logger.warning(f"Failed to cache thumbnail: {cache_error}")

            return thumbnail_bytes

        except Exception as e:
            logger.error(f"Failed to generate thumbnail (V2): {e}")
            return None

    def _normalize_pixels(self, pixel_array: np.ndarray) -> np.ndarray:
        """Normalize pixel values to 0-255 range"""
        try:
            pmin = pixel_array.min()
            pmax = pixel_array.max()
            if pmax == pmin:
                return np.zeros_like(pixel_array)
            return ((pixel_array - pmin) / (pmax - pmin) * 255.0)
        except Exception as e:
            logger.error(f"Failed to normalize pixels: {e}")
            return pixel_array

    def _apply_windowing(
        self,
        pixel_array: np.ndarray,
        window_center: int,
        window_width: int
    ) -> np.ndarray:
        """Apply window/level to pixel array"""
        try:
            lower = window_center - (window_width / 2)
            upper = window_center + (window_width / 2)
            windowed = np.clip(pixel_array, lower, upper)
            return ((windowed - lower) / window_width * 255.0)
        except Exception as e:
            logger.error(f"Failed to apply windowing: {e}")
            return self._normalize_pixels(pixel_array)

    def _resolve_storage_key(self, dicom_file: DicomFile, use_original: bool) -> str:
        """
        Determine storage key based on requested version
        """
        metadata = dicom_file.dicom_metadata or {}
        key = dicom_file.file_path
        
        if use_original:
            original_key = metadata.get('original_storage_key')
            if original_key:
                key = original_key
        else:
            sync_key = metadata.get('synchronized_storage_key')
            if sync_key:
                key = sync_key
                
        # Handle absolute paths in database
        if key and key.startswith('/var/lib/pacs/storage/'):
            key = key.replace('/var/lib/pacs/storage/', '', 1)
            
        return key or dicom_file.file_path

def get_wado_service_v2(db: Session) -> WadoServiceV2:
    return WadoServiceV2(db)
