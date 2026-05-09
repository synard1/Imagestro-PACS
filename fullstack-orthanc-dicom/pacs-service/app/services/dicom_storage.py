"""
DICOM Storage Service
Main service for storing and retrieving DICOM files
"""

import logging
from pathlib import Path
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import func, and_

from app.models.dicom_file import DicomFile
from app.models.storage_location import StorageLocation
from app.services.dicom_parser import get_dicom_parser
from app.services.storage_manager import StorageManager

logger = logging.getLogger(__name__)


class DicomStorageService:
    """Main DICOM storage service"""
    
    def __init__(self, db: Session):
        """
        Initialize DICOM storage service
        
        Args:
            db: Database session
        """
        self.db = db
        self.parser = get_dicom_parser()
        self._storage_managers: Dict[str, StorageManager] = {}
        self._default_storage_manager: Optional[StorageManager] = None

    async def store_dicom(self, file_path: str, tier: str = 'hot') -> DicomFile:
        """
        Store DICOM file
        
        Args:
            file_path: Path to DICOM file
            tier: Storage tier (hot/warm/cold)
            
        Returns:
            DicomFile object
            
        Raises:
            ValueError: If file is not valid DICOM
            Exception: If storage fails
        """
        try:
            # 1. Validate DICOM
            if not self.parser.validate_dicom(file_path):
                raise ValueError("Invalid DICOM file")
            
            # 2. Parse metadata
            metadata = self.parser.parse_file(file_path)
            
            # 3. Check if file already exists
            existing = self.db.query(DicomFile).filter(
                DicomFile.sop_instance_uid == metadata['sop_instance_uid']
            ).first()
            
            if existing:
                logger.warning(f"DICOM file already exists: {metadata['sop_instance_uid']}")
                return existing
            
            # 4. Store file
            storage_location = self._get_storage_location_for_tier(tier)
            storage_manager = self._get_storage_manager_for_location(storage_location)
            stored_path = storage_manager.store_file(
                file_path,
                metadata['study_id'],
                metadata['series_id'],
                metadata['instance_id'],
                tier
            )
            
            # 5. Calculate hash and size
            file_hash = storage_manager.get_file_hash(stored_path)
            file_size = storage_manager.get_file_size(stored_path)
            
            # 7. Check if compressed
            is_compressed = self.parser.is_compressed(stored_path)
            
            # 8. Save to database
            dicom_file = DicomFile(
                study_id=metadata['study_id'],
                series_id=metadata['series_id'],
                instance_id=metadata['instance_id'],
                sop_class_uid=metadata['sop_class_uid'],
                sop_instance_uid=metadata['sop_instance_uid'],
                file_path=stored_path,
                file_hash=file_hash,
                file_size=file_size,
                storage_tier=tier,
                storage_location_id=storage_location.id if storage_location else None,
                patient_id=metadata.get('patient_id'),
                patient_name=metadata.get('patient_name'),
                patient_birth_date=metadata.get('patient_birth_date'),
                patient_gender=metadata.get('patient_gender'),
                study_date=metadata.get('study_date'),
                study_time=metadata.get('study_time'),
                study_description=metadata.get('study_description'),
                modality=metadata.get('modality'),
                body_part=metadata.get('body_part'),
                series_number=metadata.get('series_number'),
                instance_number=metadata.get('instance_number'),
                rows=metadata.get('rows'),
                columns=metadata.get('columns'),
                bits_allocated=metadata.get('bits_allocated'),
                bits_stored=metadata.get('bits_stored'),
                number_of_frames=metadata.get('number_of_frames', 1),
                pixel_spacing=metadata.get('pixel_spacing'),
                slice_thickness=metadata.get('slice_thickness'),
                transfer_syntax_uid=metadata.get('transfer_syntax_uid'),
                is_compressed=is_compressed,
                status='active',
                dicom_metadata={
                    'manufacturer': metadata.get('manufacturer'),
                    'manufacturer_model': metadata.get('manufacturer_model'),
                    'station_name': metadata.get('station_name'),
                    'institution_name': metadata.get('institution_name'),
                }
            )
            
            self.db.add(dicom_file)
            self.db.commit()
            self.db.refresh(dicom_file)
            
            logger.info(f"Stored DICOM file: {dicom_file.sop_instance_uid}")
            return dicom_file
            
        except Exception as e:
            self.db.rollback()
            logger.error(f"Failed to store DICOM file: {str(e)}")
            raise

    
    async def get_dicom(self, sop_instance_uid: str) -> Optional[DicomFile]:
        """
        Get DICOM file by SOP Instance UID
        
        Args:
            sop_instance_uid: SOP Instance UID
            
        Returns:
            DicomFile object or None
        """
        return self.db.query(DicomFile).filter(
            DicomFile.sop_instance_uid == sop_instance_uid,
            DicomFile.status.in_(['active', 'archived'])
        ).first()
    
    async def get_dicom_by_id(self, file_id: str) -> Optional[DicomFile]:
        """
        Get DICOM file by ID
        
        Args:
            file_id: File UUID
            
        Returns:
            DicomFile object or None
        """
        return self.db.query(DicomFile).filter(
            DicomFile.id == file_id,
            DicomFile.status.in_(['active', 'archived'])
        ).first()
    
    async def search_dicom(
        self,
        study_id: Optional[str] = None,
        series_id: Optional[str] = None,
        patient_id: Optional[str] = None,
        modality: Optional[str] = None,
        study_date_from: Optional[str] = None,
        study_date_to: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
        include_archived: bool = False
    ) -> List[DicomFile]:
        """
        Search DICOM files

        Args:
            study_id: Study Instance UID
            series_id: Series Instance UID
            patient_id: Patient ID
            modality: Modality
            study_date_from: Study date from (YYYY-MM-DD)
            study_date_to: Study date to (YYYY-MM-DD)
            limit: Maximum results
            offset: Offset for pagination
            include_archived: Include archived/deleted files (default: False)

        Returns:
            List of DicomFile objects
        """
        # Filter by status - exclude archived files by default
        if include_archived:
            query = self.db.query(DicomFile).filter(DicomFile.status.in_(['active', 'archived']))
        else:
            query = self.db.query(DicomFile).filter(DicomFile.status == 'active')
        
        if study_id:
            query = query.filter(DicomFile.study_id == study_id)
        if series_id:
            query = query.filter(DicomFile.series_id == series_id)
        if patient_id:
            query = query.filter(DicomFile.patient_id == patient_id)
        if modality:
            query = query.filter(DicomFile.modality == modality)
        if study_date_from:
            query = query.filter(DicomFile.study_date >= study_date_from)
        if study_date_to:
            query = query.filter(DicomFile.study_date <= study_date_to)
        
        return query.order_by(DicomFile.created_at.desc()).limit(limit).offset(offset).all()
    
    async def delete_dicom(self, sop_instance_uid: str, hard_delete: bool = False) -> bool:
        """
        Delete DICOM file
        
        Args:
            sop_instance_uid: SOP Instance UID
            hard_delete: If True, delete file from filesystem
            
        Returns:
            True if deleted, False otherwise
        """
        try:
            dicom_file = await self.get_dicom(sop_instance_uid)
            if not dicom_file:
                return False
            
            if hard_delete:
                # Delete from filesystem
                storage_manager = self._get_storage_manager_for_file(dicom_file)
                storage_manager.delete_file(dicom_file.file_path)
                # Delete from database
                self.db.delete(dicom_file)
            else:
                # Soft delete
                dicom_file.status = 'deleted'
            
            self.db.commit()
            logger.info(f"Deleted DICOM file: {sop_instance_uid}")
            return True
            
        except Exception as e:
            self.db.rollback()
            logger.error(f"Failed to delete DICOM file: {str(e)}")
            return False
    
    async def get_storage_stats(self) -> Dict[str, Any]:
        """
        Get storage statistics
        
        Returns:
            Dictionary with storage statistics
        """
        try:
            # Total files and size
            total_files = self.db.query(func.count(DicomFile.id)).filter(
                DicomFile.status == 'active'
            ).scalar()
            
            total_size = self.db.query(func.sum(DicomFile.file_size)).filter(
                DicomFile.status == 'active'
            ).scalar() or 0
            
            # Files by modality
            files_by_modality = dict(
                self.db.query(
                    DicomFile.modality,
                    func.count(DicomFile.id)
                ).filter(
                    DicomFile.status == 'active'
                ).group_by(DicomFile.modality).all()
            )
            
            # Files by tier
            files_by_tier = dict(
                self.db.query(
                    DicomFile.storage_tier,
                    func.count(DicomFile.id)
                ).filter(
                    DicomFile.status == 'active'
                ).group_by(DicomFile.storage_tier).all()
            )
            
            return {
                'total_files': total_files,
                'total_size_bytes': total_size,
                'total_size_gb': total_size / (1024 ** 3),
                'files_by_modality': files_by_modality,
                'files_by_tier': files_by_tier
            }
            
        except Exception as e:
            logger.error(f"Failed to get storage stats: {str(e)}")
            return {
                'total_files': 0,
                'total_size_bytes': 0,
                'total_size_gb': 0,
                'files_by_modality': {},
                'files_by_tier': {}
            }

    def _get_storage_location_for_tier(self, tier: str) -> StorageLocation:
        """Get active filesystem storage location for a tier"""
        location = self.db.query(StorageLocation).filter(
            StorageLocation.tier == tier,
            StorageLocation.is_active == True,
            StorageLocation.is_online == True
        ).order_by(StorageLocation.priority.desc()).first()

        if not location:
            raise ValueError(f"No active storage location configured for tier '{tier}'")

        adapter_type = (location.adapter_type or '').lower()
        if adapter_type not in ('', 'local', 'filesystem'):
            raise ValueError(
                f"Storage location '{location.name}' uses adapter '{location.adapter_type}'. "
                "Use the v2 upload API for non-local storage backends."
            )

        return location

    def _get_storage_manager_for_location(self, location: StorageLocation) -> StorageManager:
        """Return a cached StorageManager built from DB path settings"""
        base_path = self._resolve_base_path(location)
        if base_path not in self._storage_managers:
            self._storage_managers[base_path] = StorageManager(base_path)
        return self._storage_managers[base_path]

    def _get_storage_manager_for_file(self, dicom_file: DicomFile) -> StorageManager:
        """Resolve storage manager for a stored file"""
        if dicom_file.storage_location_id:
            location = self.db.query(StorageLocation).filter(
                StorageLocation.id == dicom_file.storage_location_id
            ).first()
            if location:
                return self._get_storage_manager_for_location(location)

        if not self._default_storage_manager:
            logger.warning(
                "Falling back to default STORAGE_PATH for file %s because storage_location_id is missing",
                dicom_file.sop_instance_uid
            )
            self._default_storage_manager = StorageManager()
        return self._default_storage_manager

    def _resolve_base_path(self, location: StorageLocation) -> str:
        """Normalize storage path and remove tier suffixes"""
        raw_path = Path(location.path).expanduser()
        tier = (location.tier or '').strip().lower()

        if tier and raw_path.name.lower() == tier:
            normalized = raw_path.parent
        else:
            normalized = raw_path

        normalized_path = str(normalized)
        if not normalized_path:
            raise ValueError(f"Invalid storage path configured for location '{location.name}'")

        return normalized_path
