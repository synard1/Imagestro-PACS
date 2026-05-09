"""
DICOM Tag Synchronizer Service
Synchronizes DICOM tags with PACS worklist data and maintains audit trail
"""

import os
import shutil
import logging
from typing import Optional, Dict, Tuple
from pathlib import Path
from datetime import datetime
import pydicom
from pydicom.dataset import Dataset

from app.models.worklist import WorklistItem
from app.utils.logger import get_logger

logger = get_logger(__name__)


class DicomTagSynchronizer:
    """
    Synchronizes DICOM file tags with worklist/order data
    Maintains original and synchronized versions for audit trail
    """

    def __init__(self, storage_path: str = None):
        """
        Initialize DicomTagSynchronizer

        Args:
            storage_path: Base storage path for DICOM files
        """
        self.storage_path = storage_path or os.getenv("STORAGE_PATH", "/var/lib/pacs/storage")
        self.original_dir = os.path.join(self.storage_path, "dicom", "original")
        self.synchronized_dir = os.path.join(self.storage_path, "dicom", "synchronized")

        # Create directories if not exist
        os.makedirs(self.original_dir, exist_ok=True)
        os.makedirs(self.synchronized_dir, exist_ok=True)

        logger.info(f"DicomTagSynchronizer initialized: original={self.original_dir}, synchronized={self.synchronized_dir}")


    def synchronize_tags(
        self,
        dicom_file_path: str,
        worklist_item: WorklistItem,
        preserve_original: bool = True,
        db=None
    ) -> Tuple[str, str, Dict]:
        """
        Synchronize DICOM tags with worklist data

        Args:
            dicom_file_path: Path to original DICOM file
            worklist_item: WorklistItem with patient/order data
            preserve_original: If True, keep original file (default: True)

        Returns:
            Tuple of (original_path, synchronized_path, changes_dict)

        Raises:
            FileNotFoundError: If DICOM file not found
            ValueError: If DICOM file is invalid
        """
        try:
            logger.info(f"Starting tag synchronization for file: {dicom_file_path}")
            logger.info(f"Worklist item: patient={worklist_item.patient_name}, accession={worklist_item.accession_number}")

            # Validate input file
            if not os.path.exists(dicom_file_path):
                raise FileNotFoundError(f"DICOM file not found: {dicom_file_path}")

            # Read DICOM file
            try:
                dcm = pydicom.dcmread(dicom_file_path)
            except Exception as e:
                raise ValueError(f"Invalid DICOM file: {str(e)}")

            # Extract original tags for comparison
            original_tags = self._extract_patient_tags(dcm)
            logger.info(f"Original tags: {original_tags}")

            # Generate file names
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            sop_instance_uid = getattr(dcm, 'SOPInstanceUID', 'unknown')
            base_filename = f"{timestamp}_{sop_instance_uid}.dcm"

            original_path = os.path.join(self.original_dir, base_filename)
            synchronized_path = os.path.join(self.synchronized_dir, base_filename)

            # Save original file
            if preserve_original:
                shutil.copy2(dicom_file_path, original_path)
                logger.info(f"Original file saved: {original_path}")
            else:
                original_path = dicom_file_path
                logger.info(f"Using source as original: {original_path}")

            # Synchronize tags with worklist data
            changes = self._update_patient_tags(dcm, worklist_item, db)

            # Save synchronized file
            dcm.save_as(synchronized_path, write_like_original=False)
            logger.info(f"Synchronized file saved: {synchronized_path}")

            # Log changes for audit trail
            if changes:
                logger.info(f"Tag changes applied: {len(changes)} tags modified")
                for tag, (old_val, new_val) in changes.items():
                    logger.info(f"  {tag}: '{old_val}' → '{new_val}'")
            else:
                logger.info("No tag changes needed (already synchronized)")

            # Prepare audit information
            audit_info = {
                "original_file": original_path,
                "synchronized_file": synchronized_path,
                "original_tags": original_tags,
                "synchronized_tags": self._extract_patient_tags(dcm),
                "changes": changes,
                "worklist_id": str(worklist_item.id),
                "order_id": str(worklist_item.order_id),
                "accession_number": worklist_item.accession_number,
                "synchronized_at": datetime.now().isoformat(),
                "file_size_original": os.path.getsize(original_path),
                "file_size_synchronized": os.path.getsize(synchronized_path)
            }

            return original_path, synchronized_path, audit_info

        except Exception as e:
            logger.error(f"Tag synchronization failed: {str(e)}", exc_info=True)
            raise


    def _extract_patient_tags(self, dcm: Dataset) -> Dict:
        """
        Extract patient demographic tags from DICOM dataset

        Args:
            dcm: DICOM dataset

        Returns:
            Dictionary of patient tags
        """
        return {
            "PatientName": str(getattr(dcm, 'PatientName', '')),
            "PatientID": str(getattr(dcm, 'PatientID', '')),
            "PatientBirthDate": str(getattr(dcm, 'PatientBirthDate', '')),
            "PatientSex": str(getattr(dcm, 'PatientSex', '')),
            "AccessionNumber": str(getattr(dcm, 'AccessionNumber', '')),
            "StudyID": str(getattr(dcm, 'StudyID', '')),
            "StudyDescription": str(getattr(dcm, 'StudyDescription', '')),
            "ReferringPhysicianName": str(getattr(dcm, 'ReferringPhysicianName', '')),
        }


    def _update_patient_tags(self, dcm: Dataset, worklist: WorklistItem, db=None) -> Dict:
        """
        Update DICOM patient tags with worklist data

        Args:
            dcm: DICOM dataset to update
            worklist: WorklistItem with correct patient data
            db: Database session (optional, for getting MRN from patients table)

        Returns:
            Dictionary of changes made {tag_name: (old_value, new_value)}
        """
        changes = {}

        # Patient Name
        new_patient_name = self._format_dicom_name(worklist.patient_name)
        old_patient_name = str(getattr(dcm, 'PatientName', ''))
        if old_patient_name != new_patient_name:
            changes['PatientName'] = (old_patient_name, new_patient_name)
            dcm.PatientName = new_patient_name

        # Patient ID (Medical Record Number)
        # Get MRN from patients table instead of using UUID
        new_patient_id = worklist.patient_id or ''  # Default to worklist patient_id

        if db:
            try:
                # Try to get medical_record_number from patients table
                from sqlalchemy import text

                # Check if patient_id is UUID format (needs to be looked up in patients table)
                if len(str(worklist.patient_id)) > 20 and '-' in str(worklist.patient_id):
                    # patient_id looks like UUID, query patients table
                    result = db.execute(
                        text("SELECT medical_record_number FROM patients WHERE id = :patient_uuid"),
                        {"patient_uuid": str(worklist.patient_id)}
                    ).fetchone()

                    if result and result[0]:
                        new_patient_id = result[0]  # Use MRN from patients table
                        logger.info(f"Using MRN from patients table: {new_patient_id}")
                    else:
                        # MRN not found, try patient_id_local
                        result = db.execute(
                            text("SELECT patient_id_local FROM patients WHERE id = :patient_uuid"),
                            {"patient_uuid": str(worklist.patient_id)}
                        ).fetchone()
                        if result and result[0]:
                            new_patient_id = result[0]
                            logger.info(f"Using patient_id_local: {new_patient_id}")
                        else:
                            # Fallback to worklist patient_id
                            logger.warning(f"MRN not found for patient UUID: {worklist.patient_id}, using worklist patient_id")
                else:
                    # patient_id already looks like MRN, use it directly
                    logger.info(f"Using patient_id as MRN: {new_patient_id}")

            except Exception as e:
                logger.warning(f"Could not get MRN from patients table: {str(e)}, using worklist patient_id")
                new_patient_id = worklist.patient_id or ''

        old_patient_id = str(getattr(dcm, 'PatientID', ''))
        if old_patient_id != new_patient_id:
            changes['PatientID'] = (old_patient_id, new_patient_id)
            dcm.PatientID = new_patient_id

        # Patient Birth Date
        if worklist.patient_birth_date:
            new_birth_date = worklist.patient_birth_date.strftime('%Y%m%d')
            old_birth_date = str(getattr(dcm, 'PatientBirthDate', ''))
            if old_birth_date != new_birth_date:
                changes['PatientBirthDate'] = (old_birth_date, new_birth_date)
                dcm.PatientBirthDate = new_birth_date

        # Patient Sex
        new_sex = (worklist.patient_gender or '').upper()
        old_sex = str(getattr(dcm, 'PatientSex', ''))
        if old_sex != new_sex and new_sex:
            changes['PatientSex'] = (old_sex, new_sex)
            dcm.PatientSex = new_sex

        # Accession Number
        new_accession = worklist.accession_number or ''
        old_accession = str(getattr(dcm, 'AccessionNumber', ''))
        if old_accession != new_accession:
            changes['AccessionNumber'] = (old_accession, new_accession)
            dcm.AccessionNumber = new_accession

        # Study ID
        new_study_id = worklist.study_id or ''
        old_study_id = str(getattr(dcm, 'StudyID', ''))
        if old_study_id != new_study_id and new_study_id:
            changes['StudyID'] = (old_study_id, new_study_id)
            dcm.StudyID = new_study_id

        # Study Description
        new_study_desc = worklist.study_description or ''
        old_study_desc = str(getattr(dcm, 'StudyDescription', ''))
        if old_study_desc != new_study_desc and new_study_desc:
            changes['StudyDescription'] = (old_study_desc, new_study_desc)
            dcm.StudyDescription = new_study_desc

        # Referring Physician Name
        if worklist.referring_physician_name:
            new_physician = self._format_dicom_name(worklist.referring_physician_name)
            old_physician = str(getattr(dcm, 'ReferringPhysicianName', ''))
            if old_physician != new_physician:
                changes['ReferringPhysicianName'] = (old_physician, new_physician)
                dcm.ReferringPhysicianName = new_physician

        # Add custom private tag for audit trail
        # Using private creator "PACS_SYNC" (group 0x0009)
        if changes:
            try:
                # Add private tag to indicate this file was synchronized
                private_block = dcm.private_block(0x0009, 'PACS_SYNC', create=True)
                private_block.add_new(0x01, 'LO', 'TAG_SYNCHRONIZED')
                private_block.add_new(0x02, 'DT', datetime.now().strftime('%Y%m%d%H%M%S'))
                private_block.add_new(0x03, 'LO', str(worklist.id))
                logger.info(f"Added private tags for synchronization audit trail")
            except Exception as e:
                logger.warning(f"Could not add private tags: {str(e)}")

        return changes


    def _format_dicom_name(self, name: str) -> str:
        """
        Format name to DICOM PN format (Last^First^Middle^Prefix^Suffix)

        Args:
            name: Name string

        Returns:
            DICOM formatted name
        """
        if not name:
            return ''

        # If already in DICOM format (contains ^), return as-is
        if '^' in name:
            return name

        # Simple conversion: assume "FirstName LastName" format
        # Convert to "LastName^FirstName"
        parts = name.strip().split()
        if len(parts) >= 2:
            # Last name is the last part, rest is first name
            last_name = parts[-1]
            first_name = ' '.join(parts[:-1])
            return f"{last_name}^{first_name}"
        else:
            # Single name, use as last name
            return name.strip()


    def compare_tags(self, original_path: str, synchronized_path: str) -> Dict:
        """
        Compare tags between original and synchronized files

        Args:
            original_path: Path to original DICOM file
            synchronized_path: Path to synchronized DICOM file

        Returns:
            Dictionary of differences
        """
        try:
            dcm_original = pydicom.dcmread(original_path)
            dcm_synchronized = pydicom.dcmread(synchronized_path)

            original_tags = self._extract_patient_tags(dcm_original)
            synchronized_tags = self._extract_patient_tags(dcm_synchronized)

            differences = {}
            for tag in original_tags.keys():
                if original_tags[tag] != synchronized_tags[tag]:
                    differences[tag] = {
                        'original': original_tags[tag],
                        'synchronized': synchronized_tags[tag]
                    }

            return differences

        except Exception as e:
            logger.error(f"Failed to compare tags: {str(e)}")
            raise


    def get_audit_trail(self, dicom_path: str) -> Optional[Dict]:
        """
        Get audit trail information from synchronized DICOM file

        Args:
            dicom_path: Path to DICOM file

        Returns:
            Audit trail information if available
        """
        try:
            dcm = pydicom.dcmread(dicom_path)

            # Check for private tags indicating synchronization
            try:
                private_block = dcm.private_block(0x0009, 'PACS_SYNC')
                if private_block:
                    return {
                        'synchronized': True,
                        'sync_timestamp': str(private_block[0x02].value),
                        'worklist_id': str(private_block[0x03].value)
                    }
            except:
                pass

            return None

        except Exception as e:
            logger.error(f"Failed to get audit trail: {str(e)}")
            return None


# Singleton instance
_synchronizer_instance = None

def get_dicom_tag_synchronizer() -> DicomTagSynchronizer:
    """Get or create DicomTagSynchronizer instance"""
    global _synchronizer_instance
    if _synchronizer_instance is None:
        _synchronizer_instance = DicomTagSynchronizer()
    return _synchronizer_instance
