"""
DICOM Storage Service V2
Enhanced DICOM storage service with multi-backend support
"""
import asyncio
import logging
import hashlib
import os
import shutil
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import desc
import pydicom
from pydicom.uid import DeflatedExplicitVRLittleEndian

from app.models.dicom_file import DicomFile
from app.models.storage_location import StorageLocation
from app.services.storage_adapter_manager import get_storage_adapter_manager
from app.storage.base_adapter import StorageAdapter
from app.storage.adapter_factory import StorageAdapterFactory, get_storage_adapter, get_adapter_by_id, get_storage_adapter_with_id

logger = logging.getLogger(__name__)


SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000000'

class DicomStorageServiceV2:
    """
    Enhanced DICOM storage service with multi-backend support
    """

    def __init__(self, db: Session, tenant_id: Optional[str] = None):
        self.db = db
        # Ensure tenant_id is never None for internal logic
        self.tenant_id = tenant_id if tenant_id else SYSTEM_TENANT_ID
        self.adapter_manager = get_storage_adapter_manager(db)
        logger.info(f"DicomStorageServiceV2 initialized (tenant={self.tenant_id})")

    def _increment_r2_ops(self, op_class: str):
        """Increment Class A or B operations count for billing"""
        # Skip tracking for system tenant to avoid FK violations
        if self.tenant_id == SYSTEM_TENANT_ID:
            logger.debug(f"Skipping R2 operation tracking for system tenant")
            return
            
        try:
            from app.models.usage import UsageRecord
            # Use current day UTC
            today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
            
            usage = self.db.query(UsageRecord).filter(
                UsageRecord.tenant_id == self.tenant_id,
                UsageRecord.date >= today,
                UsageRecord.period == "daily"
            ).first()
            
            if not usage:
                usage = UsageRecord(
                    tenant_id=self.tenant_id,
                    date=today,
                    period="daily",
                    class_a_ops=0,
                    class_b_ops=0
                )
                self.db.add(usage)
            
            if op_class == 'A':
                usage.class_a_ops = (usage.class_a_ops or 0) + 1
            elif op_class == 'B':
                usage.class_b_ops = (usage.class_b_ops or 0) + 1
                
            self.db.commit()
            logger.debug(f"Recorded R2 Class {op_class} operation for tenant {self.tenant_id}")
        except Exception as e:
            import traceback
            logger.error(f"Failed to record R2 operation: {e}")
            logger.error(traceback.format_exc())
            self.db.rollback()

    async def store_dicom(
        self,
        source_path: str,
        tier: str = 'hot',
        metadata: Optional[Dict[str, Any]] = None,
        storage_location_id: Optional[str] = None
    ) -> Optional[DicomFile]:
        try:
            if not Path(source_path).exists():
                logger.error(f"Source file not found: {source_path}")
                return None

            if metadata is None:
                metadata = await self._parse_dicom_metadata(source_path)
                if not metadata:
                    logger.error("Failed to parse DICOM metadata")
                    return None

            file_hash = await self._calculate_file_hash(source_path)
            file_size = Path(source_path).stat().st_size

            # Deduplication with Revival Logic (Zero-Cost Multi-Tenant Strategy)
            # Search for file_hash + hospital_id regardless of status
            existing_by_hash = self.db.query(DicomFile).filter(
                DicomFile.file_hash == file_hash,
                DicomFile.hospital_id == self.tenant_id
            ).first()

            if existing_by_hash:
                if existing_by_hash.status == 'deleted':
                    logger.info(f"Reviving soft-deleted record (Zero-Cost): {existing_by_hash.file_path}")
                    existing_by_hash.status = 'active'
                    existing_by_hash.deleted_at = None
                    existing_by_hash.deleted_by = None
                    # Update metadata if provided to ensure it matches the new upload
                    if metadata:
                        existing_by_hash.dicom_metadata = self._sanitize_metadata(metadata)

                existing_by_hash.accessed_at = datetime.utcnow()
                self.db.commit()
                # Skip S3 upload as file already exists
                return existing_by_hash

            # Adapter Selection
            adapter = None
            storage_backend_id = None
            storage_location = None

            if not storage_location_id:
                # Prioritize StorageBackend with operation tracking callback
                adapter, storage_backend_id = get_storage_adapter_with_id(
                    self.db,
                    self.tenant_id,
                    config_overrides={'on_operation': self._increment_r2_ops}
                )
                if adapter:
                    logger.info(f"Using StorageBackend: {storage_backend_id}")

            if not adapter:
                if storage_location_id:
                    storage_location = self.db.query(StorageLocation).filter(StorageLocation.id == storage_location_id).first()
                else:
                    storage_location = await self.adapter_manager.get_active_storage_location(tier)

                if storage_location:
                    adapter = await self.adapter_manager.get_adapter(str(storage_location.id))

            if not adapter:
                logger.error("No available storage adapter")
                return None

            # Generate storage key
            study_id = metadata.get('study_id', 'unknown')
            series_id = metadata.get('series_id', 'unknown')
            instance_id = metadata.get('instance_id', 'unknown')

            p_id = "".join(c for c in metadata.get('patient_id', 'unknown') if c.isalnum())
            t_id = self.tenant_id if self.tenant_id != SYSTEM_TENANT_ID else "default-tenant"
            storage_key = f"{t_id}/dicom/{p_id}/studies/{study_id}/{series_id}/{instance_id}.dcm"

            # Path Collision Check: If logical path already exists but hash is different, proceed with S3 overwrite
            collision = self.db.query(DicomFile).filter(DicomFile.file_path == storage_key).first()
            if collision and collision.file_hash != file_hash:
                logger.warning(f"Storage path collision: {storage_key}. Hash mismatch ({collision.file_hash} vs {file_hash}). Overwriting.")

            # Upload — store() returns destination key (str) on success, raises StorageOperationError on failure
            try:
                await adapter.store(source_path, storage_key)
            except Exception as upload_err:
                logger.error(f"Failed to upload {storage_key}: {upload_err}")
                return None

            sanitized_metadata = self._sanitize_metadata(metadata)

            # Check for existing record
            sop_instance_uid = metadata.get('sop_instance_uid')
            dicom_file = self.db.query(DicomFile).filter(DicomFile.sop_instance_uid == sop_instance_uid).first()

            if not dicom_file:
                dicom_file = DicomFile(
                    study_id=study_id,
                    series_id=series_id,
                    instance_id=instance_id,
                    sop_instance_uid=sop_instance_uid,
                    sop_class_uid=metadata.get('sop_class_uid', ''),
                    file_path=storage_key,
                    file_size=file_size,
                    file_hash=file_hash,
                    hospital_id=self.tenant_id,
                    storage_tier=tier,
                    storage_location_id=storage_location.id if storage_location else None,
                    patient_id=metadata.get('patient_id'),
                    patient_name=metadata.get('patient_name'),
                    modality=metadata.get('modality'),
                    status='active',
                    dicom_metadata=sanitized_metadata
                )
                self.db.add(dicom_file)
            else:
                dicom_file.file_path = storage_key
                dicom_file.file_size = file_size
                dicom_file.file_hash = file_hash
                dicom_file.hospital_id = self.tenant_id
                dicom_file.status = 'active'
                dicom_file.deleted_at = None
                dicom_file.deleted_by = None
                dicom_file.updated_at = datetime.utcnow()
            if storage_backend_id:
                meta = dicom_file.dicom_metadata or {}
                meta['storage_backend_id'] = str(storage_backend_id)
                dicom_file.dicom_metadata = meta

            self.db.commit()

            if storage_location:
                await self._update_storage_stats(storage_location.id, file_size, increment=True)

            return dicom_file

        except Exception as e:
            logger.error(f"Error in store_dicom: {e}", exc_info=True)
            self.db.rollback()
            return None

    async def _get_adapter_for_file(self, dicom_file: DicomFile) -> Optional[StorageAdapter]:
        meta = dicom_file.dicom_metadata or {}
        backend_id = meta.get('storage_backend_id')
        if backend_id:
            try:
                return get_adapter_by_id(
                    self.db, 
                    backend_id, 
                    config_overrides={'on_operation': self._increment_r2_ops}
                )
            except Exception as e:
                logger.error(f"Failed to get backend adapter: {e}")
        if dicom_file.storage_location_id:
            return await self.adapter_manager.get_adapter(str(dicom_file.storage_location_id))
        return None

    async def retrieve_dicom(self, dicom_file: DicomFile, destination_path: Optional[str] = None, verify_hash: bool = False, storage_key_override: Optional[str] = None) -> Optional[str]:
        try:
            storage_key = storage_key_override or dicom_file.file_path
            adapter = await self._get_adapter_for_file(dicom_file)
            if not adapter:
                logger.error(f"No adapter found for file {dicom_file.id}")
                if Path(dicom_file.file_path).is_absolute() and Path(dicom_file.file_path).exists():
                    if destination_path: shutil.copy2(dicom_file.file_path, destination_path)
                    return destination_path or dicom_file.file_path
                return None

            if not destination_path:
                temp_fd, destination_path = tempfile.mkstemp(suffix='.dcm')
                os.close(temp_fd)

            # retrieve() returns destination_path (str) on success, raises on failure
            try:
                await adapter.retrieve(storage_key, destination_path)
            except Exception as retrieve_err:
                logger.error(f"Adapter failed to retrieve {storage_key}: {retrieve_err}")
                return None

            if verify_hash:
                if await self._calculate_file_hash(destination_path) != dicom_file.file_hash:
                    logger.error("Hash verification failed")
                    return None

            dicom_file.accessed_at = datetime.now()
            self.db.commit()
            return destination_path
        except Exception as e:
            logger.error(f"Error in retrieve_dicom: {e}", exc_info=True)
            return None

    async def delete_dicom(self, sop_instance_uid: str, hard_delete: bool = False, user_id: Optional[str] = None) -> bool:
        try:
            dicom_file = await self.get_dicom(sop_instance_uid)
            if not dicom_file: return False

            if hard_delete:
                adapter = await self._get_adapter_for_file(dicom_file)
                if adapter: 
                    await adapter.delete(dicom_file.file_path)
                    # delete is Class A in some context, but R2 says delete is free. 
                    # Usually tracked as Class A mutations.
                    self._increment_r2_ops('A')
                    logger.info(f"Hard-deleted file from storage: {dicom_file.file_path}")
                self.db.delete(dicom_file)
            else:
                # Soft delete (Zero-Cost strategy: keep in S3, mark in DB)
                dicom_file.status = 'deleted'
                dicom_file.deleted_at = datetime.utcnow()
                dicom_file.deleted_by = user_id
                dicom_file.updated_at = datetime.utcnow()
                logger.info(f"Soft-deleted DICOM file: {sop_instance_uid}")

            self.db.commit()
            return True
        except Exception as e:
            logger.error(f"Error in delete_dicom: {e}", exc_info=True)
            self.db.rollback()
            return False

    async def get_dicom(self, sop_instance_uid: str) -> Optional[DicomFile]:
        return self.db.query(DicomFile).filter(DicomFile.sop_instance_uid == sop_instance_uid).first()

    async def search_dicom(self, **kwargs) -> List[DicomFile]:
        query = self.db.query(DicomFile).filter(DicomFile.status == 'active')
        for key, val in kwargs.items():
            if val and hasattr(DicomFile, key):
                query = query.filter(getattr(DicomFile, key) == val)
        return query.order_by(desc(DicomFile.created_at)).limit(kwargs.get('limit', 100)).all()

    async def get_storage_stats(self) -> Dict[str, Any]:
        from sqlalchemy import func
        total_files = self.db.query(func.count(DicomFile.id)).filter(DicomFile.status == 'active').scalar()
        total_size = self.db.query(func.sum(DicomFile.file_size)).filter(DicomFile.status == 'active').scalar() or 0
        return {
            "total_files": total_files,
            "total_size_bytes": total_size,
            "total_size_gb": round(total_size / (1024**3), 2),
            "timestamp": datetime.now().isoformat()
        }

    async def _calculate_file_hash(self, file_path: str) -> str:
        sha256_hash = hashlib.sha256()
        with open(file_path, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()

    async def _parse_dicom_metadata(self, file_path: str) -> Optional[Dict[str, Any]]:
        try:
            ds = pydicom.dcmread(file_path, stop_before_pixels=True)
            return {
                'study_id': str(ds.get('StudyInstanceUID', '')),
                'series_id': str(ds.get('SeriesInstanceUID', '')),
                'instance_id': str(ds.get('SOPInstanceUID', '')),
                'sop_instance_uid': str(ds.get('SOPInstanceUID', '')),
                'sop_class_uid': str(ds.get('SOPClassUID', '')),
                'patient_id': str(ds.get('PatientID', '')),
                'patient_name': str(ds.get('PatientName', '')),
                'modality': str(ds.get('Modality', '')),
            }
        except Exception as e:
            logger.error(f"Error parsing DICOM: {e}")
            return None

    async def _update_storage_stats(self, loc_id: str, size: int, increment: bool = True):
        try:
            loc = self.db.query(StorageLocation).filter(StorageLocation.id == loc_id).first()
            if loc:
                size_gb = size / (1024**3)
                if increment:
                    loc.current_size_gb += size_gb
                    loc.current_files += 1
                else:
                    loc.current_size_gb = max(0, loc.current_size_gb - size_gb)
                    loc.current_files = max(0, loc.current_files - 1)
                self.db.commit()
        except Exception as e:
            logger.error(f"Error updating stats: {e}")
            self.db.rollback()

    def _sanitize_metadata(self, metadata: Dict[str, Any]) -> Dict[str, Any]:
        return {k: str(v) if v is not None else None for k, v in metadata.items()}

    async def scan_orphans(self, **kwargs):
        return {"status": "not_implemented_in_v2_lite"}


def get_dicom_storage_service_v2(db: Session, tenant_id: Optional[str] = None) -> DicomStorageServiceV2:
    return DicomStorageServiceV2(db, tenant_id)
