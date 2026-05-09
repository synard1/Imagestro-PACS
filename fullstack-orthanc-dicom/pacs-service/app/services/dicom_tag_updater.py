"""
DICOM Tag Updater Service
Automatically updates DICOM tags when images are uploaded
Based on AWS HealthImaging DICOMTags specification
"""

import logging
from typing import Dict, Any, Optional
from datetime import datetime
from pathlib import Path
from sqlalchemy.orm import Session

from app.services.dicom_parser import get_dicom_parser
from app.models.dicom_file import DicomFile

logger = logging.getLogger(__name__)


class DicomTagUpdater:
    """
    Automatically update DICOM tags when images are uploaded
    Follows AWS HealthImaging DICOMTags specification
    """
    
    def __init__(self):
        self.parser = get_dicom_parser()
    
    async def update_tags_on_upload(
        self,
        db: Session,
        file_path: str,
        dicom_file_id: str
    ) -> Dict[str, Any]:
        """
        Parse DICOM file and update tags in database
        
        Args:
            db: Database session
            file_path: Path to uploaded DICOM file
            dicom_file_id: ID of DicomFile record
            
        Returns:
            Dictionary with extracted tags
        """
        try:
            logger.info(f"Updating DICOM tags for file: {file_path}")
            
            # Parse DICOM file
            metadata = self.parser.parse_file(file_path)
            
            # Extract AWS HealthImaging compatible tags
            dicom_tags = self._extract_aws_compatible_tags(metadata)
            
            # Update database record
            dicom_file = db.query(DicomFile).filter(
                DicomFile.id == dicom_file_id
            ).first()
            
            if not dicom_file:
                raise ValueError(f"DicomFile not found: {dicom_file_id}")
            
            # Update fields
            dicom_file.patient_id = dicom_tags.get('DICOMPatientId')
            dicom_file.patient_name = dicom_tags.get('DICOMPatientName')
            dicom_file.patient_birth_date = metadata.get('patient_birth_date')
            dicom_file.patient_gender = dicom_tags.get('DICOMPatientSex')
            
            dicom_file.study_id = dicom_tags.get('DICOMStudyInstanceUID')
            dicom_file.study_date = metadata.get('study_date')
            dicom_file.study_time = metadata.get('study_time')
            dicom_file.study_description = dicom_tags.get('DICOMStudyDescription')
            
            dicom_file.series_id = dicom_tags.get('DICOMSeriesInstanceUID')
            dicom_file.series_number = dicom_tags.get('DICOMSeriesNumber')
            dicom_file.modality = dicom_tags.get('DICOMSeriesModality')
            dicom_file.body_part = dicom_tags.get('DICOMSeriesBodyPart')
            
            dicom_file.instance_id = metadata.get('instance_id')
            dicom_file.instance_number = metadata.get('instance_number')
            
            # Store full tags in metadata JSON
            if not dicom_file.dicom_metadata:
                dicom_file.dicom_metadata = {}
            
            dicom_file.dicom_metadata['aws_dicom_tags'] = dicom_tags
            dicom_file.dicom_metadata['parsed_at'] = datetime.utcnow().isoformat()
            
            # Mark as modified
            dicom_file.updated_at = datetime.utcnow()
            
            db.commit()
            
            logger.info(f"Successfully updated DICOM tags for file: {dicom_file_id}")
            return dicom_tags
            
        except Exception as e:
            logger.error(f"Failed to update DICOM tags: {str(e)}")
            db.rollback()
            raise
    
    def _extract_aws_compatible_tags(self, metadata: Dict[str, Any]) -> Dict[str, Any]:
        """
        Extract AWS HealthImaging compatible DICOM tags
        
        Based on: https://docs.aws.amazon.com/healthimaging/latest/APIReference/API_DICOMTags.html
        """
        tags = {}
        
        # Patient Information
        tags['DICOMPatientId'] = self._truncate(metadata.get('patient_id', ''), 256)
        tags['DICOMPatientName'] = self._truncate(metadata.get('patient_name', ''), 256)
        tags['DICOMPatientSex'] = self._truncate(metadata.get('patient_gender', ''), 16)
        
        # Patient Birth Date (format: YYYYMMDD)
        if metadata.get('patient_birth_date'):
            birth_date = metadata['patient_birth_date']
            if hasattr(birth_date, 'strftime'):
                tags['DICOMPatientBirthDate'] = birth_date.strftime('%Y%m%d')
            else:
                tags['DICOMPatientBirthDate'] = str(birth_date)[:18]
        else:
            tags['DICOMPatientBirthDate'] = ''
        
        # Study Information
        tags['DICOMStudyInstanceUID'] = self._truncate(
            metadata.get('study_id', ''), 256
        )
        tags['DICOMStudyId'] = self._truncate(
            metadata.get('accession_number', ''), 256
        )
        tags['DICOMStudyDescription'] = self._truncate(
            metadata.get('study_description', ''), 256
        )
        
        # Study Date (format: YYYYMMDD)
        if metadata.get('study_date'):
            study_date = metadata['study_date']
            if hasattr(study_date, 'strftime'):
                tags['DICOMStudyDate'] = study_date.strftime('%Y%m%d')
            else:
                tags['DICOMStudyDate'] = str(study_date)[:18]
        else:
            tags['DICOMStudyDate'] = ''
        
        # Study Time (format: HHMMSS.FFFFFF)
        if metadata.get('study_time'):
            study_time = metadata['study_time']
            if hasattr(study_time, 'strftime'):
                tags['DICOMStudyTime'] = study_time.strftime('%H%M%S')
            else:
                tags['DICOMStudyTime'] = str(study_time)[:28]
        else:
            tags['DICOMStudyTime'] = ''
        
        # Series Information
        tags['DICOMSeriesInstanceUID'] = self._truncate(
            metadata.get('series_id', ''), 256
        )
        tags['DICOMSeriesNumber'] = metadata.get('series_number')
        tags['DICOMSeriesModality'] = self._truncate(
            metadata.get('modality', ''), 16
        )
        tags['DICOMSeriesBodyPart'] = self._truncate(
            metadata.get('body_part', ''), 64
        )
        
        # Accession Number
        tags['DICOMAccessionNumber'] = self._truncate(
            metadata.get('accession_number', ''), 256
        )
        
        # Study/Series counts (these would need to be calculated separately)
        # For now, set to None - can be updated by a separate aggregation process
        tags['DICOMNumberOfStudyRelatedSeries'] = None
        tags['DICOMNumberOfStudyRelatedInstances'] = None
        
        return tags
    
    def _truncate(self, value: str, max_length: int) -> str:
        """Truncate string to maximum length"""
        if not value:
            return ''
        return str(value)[:max_length]


# Singleton instance
_updater_instance = None

def get_dicom_tag_updater() -> DicomTagUpdater:
    """Get singleton DICOM tag updater instance"""
    global _updater_instance
    if _updater_instance is None:
        _updater_instance = DicomTagUpdater()
    return _updater_instance
