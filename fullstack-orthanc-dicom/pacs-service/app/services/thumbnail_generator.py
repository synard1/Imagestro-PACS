"""
DICOM Thumbnail Generator
Automatically generates thumbnails for DICOM images
"""

import logging
import hashlib
import os
from pathlib import Path
from typing import Optional, Tuple
from PIL import Image
import numpy as np
import pydicom
from pydicom.pixel_data_handlers.util import apply_voi_lut

logger = logging.getLogger(__name__)


class ThumbnailGenerator:
    """
    DICOM thumbnail generator

    Features:
    - Automatic thumbnail creation from DICOM files
    - Multiple size presets
    - Windowing support
    - Format conversion (PNG, JPEG)
    - Caching of generated thumbnails
    """

    # Thumbnail size presets
    SIZES = {
        'small': (64, 64),
        'medium': (128, 128),
        'large': (256, 256),
        'preview': (512, 512)
    }

    def __init__(
        self,
        thumbnail_dir: str = "/var/lib/pacs/thumbnails",
        default_size: str = 'medium',
        format: str = 'jpeg',
        quality: int = 85
    ):
        """
        Initialize thumbnail generator

        Args:
            thumbnail_dir: Directory to store thumbnails
            default_size: Default thumbnail size preset
            format: Output format (jpeg/png)
            quality: JPEG quality (1-100)
        """
        self.thumbnail_dir = Path(thumbnail_dir)
        self.thumbnail_dir.mkdir(parents=True, exist_ok=True)

        self.default_size = default_size
        self.format = format.lower()
        self.quality = quality

        logger.info(
            f"ThumbnailGenerator initialized: "
            f"dir={thumbnail_dir}, size={default_size}, format={format}"
        )

    def _get_thumbnail_path(
        self,
        file_hash: str,
        size: str = 'medium'
    ) -> Path:
        """
        Get thumbnail file path

        Args:
            file_hash: Hash of source DICOM file
            size: Thumbnail size preset

        Returns:
            Path to thumbnail file
        """
        # Create subdirectory based on first 2 chars of hash
        subdir = file_hash[:2]
        thumb_subdir = self.thumbnail_dir / subdir / size
        thumb_subdir.mkdir(parents=True, exist_ok=True)

        ext = 'jpg' if self.format == 'jpeg' else 'png'
        return thumb_subdir / f"{file_hash}.{ext}"

    def _extract_pixel_array(
        self,
        dicom_path: str,
        apply_windowing: bool = True
    ) -> Optional[np.ndarray]:
        """
        Extract pixel array from DICOM file

        Args:
            dicom_path: Path to DICOM file
            apply_windowing: Whether to apply VOI LUT windowing

        Returns:
            Numpy array of pixel data or None
        """
        try:
            ds = pydicom.dcmread(dicom_path)

            # Check if pixel data exists
            if not hasattr(ds, 'pixel_array'):
                logger.warning(f"No pixel data in DICOM: {dicom_path}")
                return None

            # Get pixel array
            pixel_array = ds.pixel_array

            # Handle multiframe DICOM (take first frame)
            if len(pixel_array.shape) > 2:
                if len(pixel_array.shape) == 4:  # Color multiframe
                    pixel_array = pixel_array[0]
                elif len(pixel_array.shape) == 3:  # Grayscale multiframe
                    pixel_array = pixel_array[0]

            # Apply windowing if requested and available
            if apply_windowing:
                try:
                    pixel_array = apply_voi_lut(pixel_array, ds)
                except Exception as e:
                    logger.debug(f"Windowing not applied: {e}")

            # Normalize to 8-bit
            pixel_array = self._normalize_to_8bit(pixel_array)

            return pixel_array

        except Exception as e:
            logger.error(f"Failed to extract pixel array: {e}", exc_info=True)
            return None

    def _normalize_to_8bit(self, pixel_array: np.ndarray) -> np.ndarray:
        """
        Normalize pixel array to 8-bit range

        Args:
            pixel_array: Input pixel array

        Returns:
            Normalized 8-bit array
        """
        # Convert to float for processing
        pixel_array = pixel_array.astype(float)

        # Normalize to 0-255 range
        min_val = pixel_array.min()
        max_val = pixel_array.max()

        if max_val > min_val:
            pixel_array = ((pixel_array - min_val) / (max_val - min_val)) * 255.0
        else:
            pixel_array = np.zeros_like(pixel_array)

        # Convert to uint8
        pixel_array = pixel_array.astype(np.uint8)

        return pixel_array

    def _create_thumbnail(
        self,
        pixel_array: np.ndarray,
        size: Tuple[int, int]
    ) -> Image.Image:
        """
        Create thumbnail from pixel array

        Args:
            pixel_array: Source pixel array
            size: Target size (width, height)

        Returns:
            PIL Image thumbnail
        """
        # Handle color vs grayscale
        if len(pixel_array.shape) == 3:
            # RGB image
            mode = 'RGB'
            if pixel_array.shape[2] == 3:
                img = Image.fromarray(pixel_array, mode='RGB')
            elif pixel_array.shape[2] == 4:
                img = Image.fromarray(pixel_array, mode='RGBA')
            else:
                # Unknown color format, convert to grayscale
                pixel_array = np.mean(pixel_array, axis=2).astype(np.uint8)
                img = Image.fromarray(pixel_array, mode='L')
        else:
            # Grayscale image
            img = Image.fromarray(pixel_array, mode='L')

        # Create thumbnail (maintains aspect ratio)
        img.thumbnail(size, Image.Resampling.LANCZOS)

        return img

    def generate(
        self,
        dicom_path: str,
        file_hash: str,
        size: str = None,
        force: bool = False
    ) -> Optional[str]:
        """
        Generate thumbnail for DICOM file

        Args:
            dicom_path: Path to source DICOM file
            file_hash: Hash of DICOM file (for caching)
            size: Thumbnail size preset (small/medium/large/preview)
            force: Force regeneration even if thumbnail exists

        Returns:
            Path to generated thumbnail or None on failure
        """
        try:
            size = size or self.default_size

            if size not in self.SIZES:
                logger.error(f"Invalid thumbnail size: {size}")
                return None

            # Check if thumbnail already exists
            thumbnail_path = self._get_thumbnail_path(file_hash, size)
            if thumbnail_path.exists() and not force:
                logger.debug(f"Thumbnail exists: {thumbnail_path}")
                return str(thumbnail_path)

            # Extract pixel data
            pixel_array = self._extract_pixel_array(dicom_path)
            if pixel_array is None:
                return None

            # Create thumbnail
            target_size = self.SIZES[size]
            thumbnail = self._create_thumbnail(pixel_array, target_size)

            # Save thumbnail
            if self.format == 'jpeg':
                thumbnail.save(
                    thumbnail_path,
                    'JPEG',
                    quality=self.quality,
                    optimize=True
                )
            else:  # PNG
                thumbnail.save(
                    thumbnail_path,
                    'PNG',
                    optimize=True
                )

            logger.info(
                f"Generated thumbnail: {thumbnail_path.name} "
                f"(size={size}, format={self.format})"
            )

            return str(thumbnail_path)

        except Exception as e:
            logger.error(f"Failed to generate thumbnail: {e}", exc_info=True)
            return None

    def generate_all_sizes(
        self,
        dicom_path: str,
        file_hash: str,
        force: bool = False
    ) -> dict:
        """
        Generate thumbnails for all size presets

        Args:
            dicom_path: Path to source DICOM file
            file_hash: Hash of DICOM file
            force: Force regeneration

        Returns:
            Dictionary mapping size to thumbnail path
        """
        results = {}

        for size in self.SIZES.keys():
            thumbnail_path = self.generate(
                dicom_path,
                file_hash,
                size=size,
                force=force
            )
            results[size] = thumbnail_path

        return results

    def get_thumbnail(
        self,
        file_hash: str,
        size: str = None
    ) -> Optional[str]:
        """
        Get existing thumbnail path

        Args:
            file_hash: Hash of DICOM file
            size: Thumbnail size preset

        Returns:
            Path to thumbnail if exists, None otherwise
        """
        size = size or self.default_size
        thumbnail_path = self._get_thumbnail_path(file_hash, size)

        if thumbnail_path.exists():
            return str(thumbnail_path)

        return None

    def delete_thumbnails(self, file_hash: str) -> int:
        """
        Delete all thumbnails for a DICOM file

        Args:
            file_hash: Hash of DICOM file

        Returns:
            Number of thumbnails deleted
        """
        deleted_count = 0

        for size in self.SIZES.keys():
            thumbnail_path = self._get_thumbnail_path(file_hash, size)
            if thumbnail_path.exists():
                try:
                    thumbnail_path.unlink()
                    deleted_count += 1
                except Exception as e:
                    logger.error(f"Failed to delete thumbnail: {e}")

        if deleted_count > 0:
            logger.info(f"Deleted {deleted_count} thumbnails for hash {file_hash[:16]}...")

        return deleted_count

    def cleanup_orphans(self, valid_hashes: set) -> dict:
        """
        Remove thumbnails for deleted DICOM files

        Args:
            valid_hashes: Set of valid file hashes

        Returns:
            Cleanup statistics
        """
        try:
            logger.info("Starting thumbnail cleanup...")

            removed_count = 0
            removed_size = 0

            # Scan all thumbnails
            for thumbnail in self.thumbnail_dir.rglob(f"*.{self.format}"):
                # Extract hash from filename
                file_hash = thumbnail.stem

                if file_hash not in valid_hashes:
                    # Orphaned thumbnail
                    file_size = thumbnail.stat().st_size
                    thumbnail.unlink()

                    removed_count += 1
                    removed_size += file_size

            logger.info(
                f"Thumbnail cleanup complete: "
                f"removed {removed_count} orphaned thumbnails "
                f"({removed_size / 1024 / 1024:.2f} MB)"
            )

            return {
                'removed_count': removed_count,
                'removed_size_bytes': removed_size,
                'removed_size_mb': removed_size / 1024 / 1024
            }

        except Exception as e:
            logger.error(f"Thumbnail cleanup failed: {e}", exc_info=True)
            return {'error': str(e)}

    def get_stats(self) -> dict:
        """
        Get thumbnail storage statistics

        Returns:
            Statistics dictionary
        """
        try:
            total_size = 0
            file_count = 0
            size_breakdown = {size: 0 for size in self.SIZES.keys()}

            for thumbnail in self.thumbnail_dir.rglob(f"*.{self.format}"):
                file_size = thumbnail.stat().st_size
                total_size += file_size
                file_count += 1

                # Determine size category from path
                for size in self.SIZES.keys():
                    if f"/{size}/" in str(thumbnail):
                        size_breakdown[size] += 1
                        break

            return {
                'total_thumbnails': file_count,
                'total_size_bytes': total_size,
                'total_size_mb': round(total_size / 1024 / 1024, 2),
                'size_breakdown': size_breakdown,
                'format': self.format,
                'available_sizes': list(self.SIZES.keys())
            }

        except Exception as e:
            logger.error(f"Failed to get thumbnail stats: {e}")
            return {'error': str(e)}
