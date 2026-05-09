"""
DICOM Parser Service
Parse DICOM files and extract metadata using pydicom
"""

import logging
from typing import Dict, Any, Optional
from datetime import datetime, date, time
from pathlib import Path

try:
    from pydicom import dcmread
    from pydicom.errors import InvalidDicomError
    PYDICOM_AVAILABLE = True
except ImportError:
    PYDICOM_AVAILABLE = False
    logging.warning("pydicom not installed. DICOM parsing will not work.")

logger = logging.getLogger(__name__)


class DicomParser:
    """Parse DICOM files and extract metadata"""
    
    def __init__(self):
        if not PYDICOM_AVAILABLE:
            raise ImportError("pydicom is required for DICOM parsing. Install with: pip install pydicom")
    
    def parse_file(self, file_path: str) -> Dict[str, Any]:
        """
        Parse DICOM file and extract metadata
        
        Args:
            file_path: Path to DICOM file
            
        Returns:
            Dictionary with DICOM metadata
            
        Raises:
            InvalidDicomError: If file is not valid DICOM
            FileNotFoundError: If file does not exist
        """
        try:
            # Read DICOM file
            ds = dcmread(file_path, force=True)
            
            # Extract metadata
            metadata = {
                # DICOM Identifiers
                'study_id': self._get_tag(ds, 'StudyInstanceUID'),
                'series_id': self._get_tag(ds, 'SeriesInstanceUID'),
                'instance_id': self._get_tag(ds, 'SOPInstanceUID'),
                'sop_class_uid': self._get_tag(ds, 'SOPClassUID'),
                'sop_instance_uid': self._get_tag(ds, 'SOPInstanceUID'),
                
                # Patient Information
                'patient_id': self._get_tag(ds, 'PatientID'),
                'patient_name': self._format_patient_name(ds),
                'patient_birth_date': self._parse_date(self._get_tag(ds, 'PatientBirthDate')),
                'patient_gender': self._get_tag(ds, 'PatientSex'),
                
                # Study Information
                'study_date': self._parse_date(self._get_tag(ds, 'StudyDate')),
                'study_time': self._parse_time(self._get_tag(ds, 'StudyTime')),
                'study_description': self._get_tag(ds, 'StudyDescription'),
                'accession_number': self._get_tag(ds, 'AccessionNumber'),
                
                # Series Information
                'series_number': self._get_int(ds, 'SeriesNumber'),
                'series_description': self._get_tag(ds, 'SeriesDescription'),
                'modality': self._get_tag(ds, 'Modality'),
                'body_part': self._get_tag(ds, 'BodyPartExamined'),
                
                # Instance Information
                'instance_number': self._get_int(ds, 'InstanceNumber'),
                
                # Image Information
                'rows': self._get_int(ds, 'Rows'),
                'columns': self._get_int(ds, 'Columns'),
                'bits_allocated': self._get_int(ds, 'BitsAllocated'),
                'bits_stored': self._get_int(ds, 'BitsStored'),
                'number_of_frames': self._get_int(ds, 'NumberOfFrames', default=1),
                'pixel_spacing': self._get_pixel_spacing(ds),
                'slice_thickness': self._get_float(ds, 'SliceThickness'),
                
                # Transfer Syntax
                'transfer_syntax_uid': self._get_transfer_syntax(ds),
                
                # Additional metadata
                'manufacturer': self._get_tag(ds, 'Manufacturer'),
                'manufacturer_model': self._get_tag(ds, 'ManufacturerModelName'),
                'station_name': self._get_tag(ds, 'StationName'),
                'institution_name': self._get_tag(ds, 'InstitutionName'),
            }
            
            logger.info(f"Successfully parsed DICOM file: {file_path}")
            return metadata
            
        except InvalidDicomError as e:
            logger.error(f"Invalid DICOM file: {file_path} - {str(e)}")
            raise
        except FileNotFoundError as e:
            logger.error(f"File not found: {file_path}")
            raise
        except Exception as e:
            logger.error(f"Error parsing DICOM file: {file_path} - {str(e)}")
            raise
    
    def validate_dicom(self, file_path: str) -> bool:
        """
        Validate if file is valid DICOM
        
        Args:
            file_path: Path to file
            
        Returns:
            True if valid DICOM, False otherwise
        """
        try:
            dcmread(file_path, stop_before_pixels=True)
            return True
        except Exception as e:
            logger.warning(f"File is not valid DICOM: {file_path} - {str(e)}")
            return False
    
    def get_pixel_data(self, file_path: str) -> Optional[Any]:
        """
        Get pixel data from DICOM file
        
        Args:
            file_path: Path to DICOM file
            
        Returns:
            Pixel array or None if not available
        """
        try:
            ds = dcmread(file_path)
            if hasattr(ds, 'pixel_array'):
                return ds.pixel_array
            return None
        except Exception as e:
            logger.error(f"Error getting pixel data: {file_path} - {str(e)}")
            return None
    
    def is_compressed(self, file_path: str) -> bool:
        """
        Check if DICOM file is compressed
        
        Args:
            file_path: Path to DICOM file
            
        Returns:
            True if compressed, False otherwise
        """
        try:
            ds = dcmread(file_path, stop_before_pixels=True)
            transfer_syntax = self._get_transfer_syntax(ds)
            
            # Common compressed transfer syntaxes
            compressed_syntaxes = [
                '1.2.840.10008.1.2.4.50',   # JPEG Baseline
                '1.2.840.10008.1.2.4.51',   # JPEG Extended
                '1.2.840.10008.1.2.4.57',   # JPEG Lossless
                '1.2.840.10008.1.2.4.70',   # JPEG Lossless SV1
                '1.2.840.10008.1.2.4.90',   # JPEG 2000 Lossless
                '1.2.840.10008.1.2.4.91',   # JPEG 2000
                '1.2.840.10008.1.2.5',      # RLE Lossless
            ]
            
            return transfer_syntax in compressed_syntaxes
        except Exception:
            return False
    
    # Helper methods
    
    def _get_tag(self, ds, tag_name: str, default: str = '') -> str:
        """Get DICOM tag value as string"""
        try:
            value = getattr(ds, tag_name, default)
            return str(value) if value else default
        except Exception:
            return default
    
    def _get_int(self, ds, tag_name: str, default: Optional[int] = None) -> Optional[int]:
        """Get DICOM tag value as integer"""
        try:
            value = getattr(ds, tag_name, default)
            return int(value) if value is not None else default
        except (ValueError, TypeError):
            return default
    
    def _get_float(self, ds, tag_name: str, default: Optional[float] = None) -> Optional[float]:
        """Get DICOM tag value as float"""
        try:
            value = getattr(ds, tag_name, default)
            return float(value) if value is not None else default
        except (ValueError, TypeError):
            return default
    
    def _format_patient_name(self, ds) -> str:
        """Format patient name from DICOM"""
        try:
            name = getattr(ds, 'PatientName', '')
            if name:
                # Convert from DICOM format (Last^First^Middle) to readable format
                parts = str(name).split('^')
                if len(parts) >= 2:
                    return f"{parts[1]} {parts[0]}"
                return str(name)
            return ''
        except Exception:
            return ''
    
    def _parse_date(self, date_str: str) -> Optional[date]:
        """Parse DICOM date (YYYYMMDD) to Python date"""
        if not date_str or date_str == '':
            return None
        try:
            # DICOM date format: YYYYMMDD
            return datetime.strptime(date_str, '%Y%m%d').date()
        except ValueError:
            logger.warning(f"Invalid date format: {date_str}")
            return None
    
    def _parse_time(self, time_str: str) -> Optional[time]:
        """Parse DICOM time (HHMMSS.FFFFFF) to Python time"""
        if not time_str or time_str == '':
            return None
        try:
            # DICOM time format: HHMMSS.FFFFFF or HHMMSS
            time_str = time_str.split('.')[0]  # Remove fractional seconds
            return datetime.strptime(time_str, '%H%M%S').time()
        except ValueError:
            logger.warning(f"Invalid time format: {time_str}")
            return None
    
    def _get_pixel_spacing(self, ds) -> Optional[str]:
        """Get pixel spacing as string"""
        try:
            spacing = getattr(ds, 'PixelSpacing', None)
            if spacing:
                return f"{spacing[0]}\\{spacing[1]}"
            return None
        except Exception:
            return None
    
    def _get_transfer_syntax(self, ds) -> str:
        """Get transfer syntax UID"""
        try:
            if hasattr(ds, 'file_meta') and hasattr(ds.file_meta, 'TransferSyntaxUID'):
                return str(ds.file_meta.TransferSyntaxUID)
            return '1.2.840.10008.1.2'  # Default: Implicit VR Little Endian
        except Exception:
            return '1.2.840.10008.1.2'


# Singleton instance
_parser_instance = None

def get_dicom_parser() -> DicomParser:
    """Get singleton DICOM parser instance"""
    global _parser_instance
    if _parser_instance is None:
        _parser_instance = DicomParser()
    return _parser_instance
