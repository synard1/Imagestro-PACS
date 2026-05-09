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
import pydicom
from pydicom.uid import DeflatedExplicitVRLittleEndian

from app.models.dicom_file import DicomFile
from app.models.storage_location import StorageLocation
from app.services.storage_adapter_manager import get_storage_adapter_manager
from app.storage.base_adapter import StorageAdapter

logger = logging.getLogger(__name__)


class DicomStorageServiceV2:
    """
    Enhanced DICOM storage service with multi-backend support

    Features:
    - Multi-backend upload support (S3, Local, MinIO, etc.)
    - Automatic storage selection based on tier
    - File migration between tiers
    - Hash verification
    - Storage stats tracking
    """

    def __init__(self, db: Session):
        """
        Initialize DICOM storage service

        Args:
            db: Database session
        """
        self.db = db
        self.adapter_manager = get_storage_adapter_manager(db)
        logger.info("DicomStorageServiceV2 initialized")

    async def store_dicom(
        self,
        source_path: str,
        tier: str = 'hot',
        metadata: Optional[Dict[str, Any]] = None,
        storage_location_id: Optional[str] = None
    ) -> Optional[DicomFile]:
        """
        Store DICOM file to storage backend

        Args:
            source_path: Path to source DICOM file
            tier: Storage tier (hot/warm/cold)
            metadata: Optional DICOM metadata dict
            storage_location_id: Optional specific storage location ID

        Returns:
            DicomFile instance or None on failure
        """
        try:
            # Validate source file exists
            if not Path(source_path).exists():
                logger.error(f"Source file not found: {source_path}")
                return None

            # Parse DICOM metadata if not provided
            if metadata is None:
                metadata = await self._parse_dicom_metadata(source_path)
                if not metadata:
                    logger.error("Failed to parse DICOM metadata")
                    return None

            # Calculate file hash and size early for deduplication and stats
            file_hash = await self._calculate_file_hash(source_path)
            file_size = Path(source_path).stat().st_size

            # Deduplication: check if identical content already stored
            existing_by_hash = self.db.query(DicomFile).filter(
                DicomFile.file_hash == file_hash,
                DicomFile.status == 'active'
            ).first()
            if existing_by_hash:
                logger.info(
                    f"Deduplicated: identical content (hash {file_hash[:16]}...) "
                    f"already exists for {existing_by_hash.sop_instance_uid}"
                )
                existing_by_hash.accessed_at = datetime.now()
                self.db.commit()
                setattr(existing_by_hash, "_was_updated", True)
                return existing_by_hash

            # Compression: create compressed version if beneficial
            to_upload = source_path
            original_size = file_size
            is_compressed = False
            compression_ratio = 1.0
            transfer_syntax_uid = None

            try:
                compressed_path, compressed_size, comp_hash, comp_ts_uid = \
                    await self._compress_dicom(source_path)
                if compressed_size < original_size * 0.98:  # 2%+ reduction
                    to_upload = compressed_path
                    file_size = compressed_size
                    file_hash = comp_hash
                    is_compressed = True
                    compression_ratio = original_size / compressed_size
                    transfer_syntax_uid = comp_ts_uid
                    logger.info(
                        f"Compressed {original_size}B -> {compressed_size}B "
                        f"(ratio {compression_ratio:.2f}x)"
                    )
                else:
                    # Cleanup non-beneficial compressed temp
                    os.unlink(compressed_path)
            except Exception as comp_e:
                logger.warning(f"Compression failed, using original: {comp_e}")

            # Get storage location
            if storage_location_id:
                storage_location = self.db.query(StorageLocation).filter(
                    StorageLocation.id == storage_location_id
                ).first()
            else:
                storage_location = await self.adapter_manager.get_active_storage_location(tier)

            if not storage_location:
                logger.error(f"No available storage location (quota/health) for tier: {tier}")
                return None

            # Final quota check (race condition protection)
            size_gb = file_size / (1024 * 1024 * 1024)
            if (storage_location.max_size_gb and 
                storage_location.current_size_gb + size_gb > storage_location.max_size_gb):
                logger.error(
                    f"Quota exceeded for {storage_location.name}: "
                    f"{storage_location.current_size_gb:.2f} + {size_gb:.2f} > {storage_location.max_size_gb} GB"
                )
                return None

            # Get adapter for storage location
            adapter = await self.adapter_manager.get_adapter(str(storage_location.id))
            if not adapter:
                logger.error(f"Failed to get adapter for storage location: {storage_location.name}")
                return None

            # Generate storage key
            study_id = metadata.get('study_id', 'unknown')
            series_id = metadata.get('series_id', 'unknown')
            instance_id = metadata.get('instance_id', 'unknown')
            storage_key = f"dicom/{study_id}/{series_id}/{instance_id}.dcm"

            logger.info(f"Storing DICOM to {storage_location.name}: {storage_key}")

            # Upload to storage
            success = await adapter.store(to_upload, storage_key)
            if not success:
                logger.error(f"Failed to upload file to storage: {storage_key}")
                if is_compressed:
                    try:
                        os.unlink(to_upload)
                    except Exception:
                        pass
                return None

            if is_compressed:
                try:
                    os.unlink(to_upload)
                except Exception:
                    logger.warning("Failed to cleanup compressed temp file")

            # Sanitize metadata for JSON storage
            sanitized_metadata = self._sanitize_metadata(metadata)

            # Check for existing DICOM file
            existing_file = None
            sop_instance_uid = metadata.get('sop_instance_uid')
            if sop_instance_uid:
                existing_file = self.db.query(DicomFile).filter(
                    DicomFile.sop_instance_uid == sop_instance_uid
                ).first()

            if existing_file:
                old_location_id = existing_file.storage_location_id
                old_size = existing_file.file_size or 0

                existing_file.study_id = study_id
                existing_file.series_id = series_id
                existing_file.instance_id = instance_id
                existing_file.sop_class_uid = metadata.get('sop_class_uid', existing_file.sop_class_uid)
                existing_file.file_path = storage_key
                existing_file.file_size = file_size
                existing_file.file_hash = file_hash
                existing_file.storage_tier = tier
                existing_file.storage_location_id = storage_location.id
                existing_file.patient_id = metadata.get('patient_id')
                existing_file.patient_name = metadata.get('patient_name')
                existing_file.study_date = metadata.get('study_date')
                existing_file.modality = metadata.get('modality')
                existing_file.is_compressed = is_compressed
                existing_file.compression_ratio = compression_ratio
                existing_file.original_size = original_size
                existing_file.transfer_syntax_uid = transfer_syntax_uid
                existing_file.status = 'active'
                merged_meta = existing_file.dicom_metadata or {}
                merged_meta.update(sanitized_metadata)
                merged_meta['synchronized_storage_key'] = storage_key
                existing_file.dicom_metadata = merged_meta
                existing_file.updated_at = datetime.now()

                self.db.commit()

                await self._update_storage_stats(storage_location.id, file_size, increment=True)
                if old_location_id:
                    await self._update_storage_stats(old_location_id, old_size, increment=False)

                setattr(existing_file, "_was_updated", True)
                logger.info(
                    f"Updated existing DICOM file: {instance_id} "
                    f"to {storage_location.name} (size: {file_size} bytes)"
                )

                return existing_file

            # Create DicomFile record
            dicom_file = DicomFile(
                study_id=study_id,
                series_id=series_id,
                instance_id=instance_id,
                sop_instance_uid=metadata.get('sop_instance_uid'),
                sop_class_uid=metadata.get('sop_class_uid', ''),
                file_path=storage_key,
                file_size=file_size,
                file_hash=file_hash,
                storage_tier=tier,
                storage_location_id=storage_location.id,
                patient_id=metadata.get('patient_id'),
                patient_name=metadata.get('patient_name'),
                study_date=metadata.get('study_date'),
                modality=metadata.get('modality'),
                is_compressed=is_compressed,
                compression_ratio=compression_ratio,
                original_size=original_size,
                transfer_syntax_uid=transfer_syntax_uid,
                status='active',
                dicom_metadata=sanitized_metadata
            )

            self.db.add(dicom_file)
            self.db.commit()

            # Track storage key for synchronized file
            metadata_dict = dicom_file.dicom_metadata or {}
            metadata_dict['synchronized_storage_key'] = storage_key
            dicom_file.dicom_metadata = metadata_dict
            self.db.commit()

            # Update storage location stats
            await self._update_storage_stats(storage_location.id, file_size, increment=True)

            logger.info(
                f"Successfully stored DICOM file: {instance_id} "
                f"to {storage_location.name} (size: {file_size} bytes)"
            )

            return dicom_file

        except Exception as e:
            logger.error(f"Error storing DICOM file: {e}", exc_info=True)
            self.db.rollback()
            return None

    async def retrieve_dicom(
        self,
        dicom_file: DicomFile,
        destination_path: Optional[str] = None,
        verify_hash: bool = False,
        storage_key_override: Optional[str] = None
    ) -> Optional[str]:
        """
        Retrieve DICOM file from storage

        Args:
            dicom_file: DicomFile instance
            destination_path: Optional destination path (uses temp if not provided)
            verify_hash: Whether to verify file hash after retrieval

        Returns:
            Path to retrieved file or None on failure
        """
        try:
            storage_key = storage_key_override or dicom_file.file_path

            # Check if storage_location_id is set
            if dicom_file.storage_location_id:
                # Get adapter for storage location
                adapter = await self.adapter_manager.get_adapter(
                    str(dicom_file.storage_location_id)
                )

                if not adapter:
                    logger.error(
                        f"Failed to get adapter for storage location: "
                        f"{dicom_file.storage_location_id}"
                    )
                    return None

                # Create destination path if not provided
                if not destination_path:
                    # Create temp file
                    temp_fd, destination_path = tempfile.mkstemp(suffix='.dcm')
                    os.close(temp_fd)

                # Retrieve from storage
                logger.info(f"Retrieving DICOM from storage: {storage_key}")
                success = await adapter.retrieve(storage_key, destination_path)

                if not success:
                    logger.error(f"Failed to retrieve file from storage: {storage_key}")
                    return None

            else:
                # Backward compatibility: storage_location_id is NULL
                # Assume file is stored locally at file_path
                logger.warning(
                    f"File has no storage_location_id, assuming local path: "
                    f"{dicom_file.file_path}"
                )

                if not Path(dicom_file.file_path).exists():
                    logger.error(f"Local file not found: {dicom_file.file_path}")
                    return None

                if destination_path:
                    # Copy to destination
                    import shutil
                    shutil.copy2(dicom_file.file_path, destination_path)
                else:
                    destination_path = dicom_file.file_path

            # Verify hash if requested
            if verify_hash:
                retrieved_hash = await self._calculate_file_hash(destination_path)
                if retrieved_hash != dicom_file.file_hash:
                    logger.error(
                        f"Hash verification failed for {dicom_file.instance_id}: "
                        f"expected {dicom_file.file_hash}, got {retrieved_hash}"
                    )
                    return None
                logger.debug(f"Hash verification passed for {dicom_file.instance_id}")

            # Update accessed_at timestamp
            dicom_file.accessed_at = datetime.now()
            self.db.commit()

            logger.info(f"Successfully retrieved DICOM: {dicom_file.instance_id}")
            return destination_path

        except Exception as e:
            logger.error(f"Error retrieving DICOM file: {e}", exc_info=True)
            return None

    async def archive_dicom_file(
        self,
        dicom_file: DicomFile,
        archive_date: datetime,
        reason: str = "study_deleted"
    ) -> Optional[str]:
        """
        Move DICOM artifacts into deleted/{date}/... for audit trail
        """
        try:
            if not dicom_file.storage_location_id:
                logger.warning(
                    "Cannot archive file %s without storage_location_id",
                    dicom_file.sop_instance_uid
                )
                return None

            adapter = await self.adapter_manager.get_adapter(
                str(dicom_file.storage_location_id)
            )
            if not adapter:
                logger.error(
                    "Adapter unavailable while archiving %s",
                    dicom_file.sop_instance_uid
                )
                return None

            archive_prefix = archive_date.strftime("deleted/%Y%m%d")
            metadata = dicom_file.dicom_metadata or {}

            keys_to_archive: List[Tuple[str, str]] = []
            seen = set()

            primary_key = metadata.get('synchronized_storage_key') or dicom_file.file_path
            if primary_key and primary_key not in seen:
                keys_to_archive.append(('synchronized_storage_key', primary_key))
                seen.add(primary_key)

            original_key = metadata.get('original_storage_key')
            if original_key and original_key not in seen:
                keys_to_archive.append(('original_storage_key', original_key))
                seen.add(original_key)

            archived_any = False
            for field_name, storage_key in keys_to_archive:
                archive_key = f"{archive_prefix}/{storage_key.lstrip('/')}"
                if adapter.get_adapter_type() == 'local':
                    archived = await self._archive_local_file(adapter, storage_key, archive_key)
                else:
                    archived = await self._archive_remote_file(adapter, storage_key, archive_key)

                if archived:
                    metadata[field_name] = archive_key
                    archived_any = True

            if not archived_any:
                logger.warning(f"No files archived for {dicom_file.sop_instance_uid}")
                return None

            metadata.update(
                {
                    "archived_at": archive_date.isoformat(),
                    "archived_reason": reason,
                }
            )
            dicom_file.dicom_metadata = metadata
            dicom_file.file_path = metadata.get('synchronized_storage_key', dicom_file.file_path)
            dicom_file.storage_tier = 'deleted'
            dicom_file.status = 'archived'
            dicom_file.updated_at = datetime.now()
            self.db.commit()
            logger.info(
                "Archived DICOM %s to prefix %s",
                dicom_file.sop_instance_uid,
                archive_prefix
            )
            return metadata.get('synchronized_storage_key')

        except Exception as e:
            logger.error(f"Failed to archive DICOM file: {e}", exc_info=True)
            self.db.rollback()
            return None

    async def migrate_file(
        self,
        dicom_file: DicomFile,
        target_tier: str,
        target_storage_location_id: Optional[str] = None,
        delete_source: bool = False
    ) -> bool:
        """
        Migrate file to different tier or storage location

        Args:
            dicom_file: DicomFile to migrate
            target_tier: Target storage tier
            target_storage_location_id: Optional specific target location
            delete_source: Whether to delete source file after migration

        Returns:
            True if migration successful, False otherwise
        """
        try:
            logger.info(
                f"Migrating file {dicom_file.instance_id} "
                f"from tier {dicom_file.storage_tier} to {target_tier}"
            )

            # Get source adapter
            source_adapter = None
            if dicom_file.storage_location_id:
                source_adapter = await self.adapter_manager.get_adapter(
                    str(dicom_file.storage_location_id)
                )

            # Retrieve file to temp location
            temp_path = await self.retrieve_dicom(dicom_file, verify_hash=True)
            if not temp_path:
                logger.error("Failed to retrieve file for migration")
                return False

            # Get target storage location
            if target_storage_location_id:
                target_location = self.db.query(StorageLocation).filter(
                    StorageLocation.id == target_storage_location_id
                ).first()
            else:
                target_location = await self.adapter_manager.get_active_storage_location(
                    target_tier
                )

            if not target_location:
                logger.error(f"No target storage location found for tier: {target_tier}")
                return False

            # Get target adapter
            target_adapter = await self.adapter_manager.get_adapter(str(target_location.id))
            if not target_adapter:
                logger.error("Failed to get target adapter")
                return False

            # Upload to target storage
            success = await target_adapter.store(temp_path, dicom_file.file_path)
            if not success:
                logger.error("Failed to upload file to target storage")
                return False

            # Update database record
            old_storage_location_id = dicom_file.storage_location_id
            old_tier = dicom_file.storage_tier

            dicom_file.storage_location_id = target_location.id
            dicom_file.storage_tier = target_tier
            dicom_file.updated_at = datetime.now()

            self.db.commit()

            # Update storage stats
            await self._update_storage_stats(
                target_location.id,
                dicom_file.file_size,
                increment=True
            )

            if old_storage_location_id:
                await self._update_storage_stats(
                    old_storage_location_id,
                    dicom_file.file_size,
                    increment=False
                )

            # Delete source file if requested
            if delete_source and source_adapter and old_storage_location_id:
                try:
                    await source_adapter.delete(dicom_file.file_path)
                    logger.info(f"Deleted source file after migration: {dicom_file.file_path}")
                except Exception as e:
                    logger.warning(f"Failed to delete source file: {e}")

            # Clean up temp file
            if temp_path and temp_path.startswith(tempfile.gettempdir()):
                try:
                    os.unlink(temp_path)
                except Exception as e:
                    logger.warning(f"Failed to delete temp file: {e}")

            logger.info(
                f"Successfully migrated file {dicom_file.instance_id} "
                f"from {old_tier} to {target_tier}"
            )

            return True

        except Exception as e:
            logger.error(f"Error migrating file: {e}", exc_info=True)
            self.db.rollback()
            return False

    async def delete_dicom(
        self,
        dicom_file: DicomFile,
        hard_delete: bool = False
    ) -> bool:
        """
        Delete DICOM file

        Args:
            dicom_file: DicomFile to delete
            hard_delete: If True, delete from storage. If False, only mark as deleted

        Returns:
            True if successful, False otherwise
        """
        try:
            if hard_delete:
                # Delete from storage
                if dicom_file.storage_location_id:
                    adapter = await self.adapter_manager.get_adapter(
                        str(dicom_file.storage_location_id)
                    )
                    if adapter:
                        await adapter.delete(dicom_file.file_path)
                        logger.info(f"Deleted file from storage: {dicom_file.file_path}")

                # Delete database record
                self.db.delete(dicom_file)

                # Update storage stats
                if dicom_file.storage_location_id:
                    await self._update_storage_stats(
                        dicom_file.storage_location_id,
                        dicom_file.file_size,
                        increment=False
                    )
            else:
                # Soft delete
                dicom_file.status = 'deleted'
                dicom_file.updated_at = datetime.now()

            self.db.commit()
            logger.info(f"Successfully deleted DICOM: {dicom_file.instance_id}")
            return True

        except Exception as e:
            logger.error(f"Error deleting DICOM file: {e}", exc_info=True)
            self.db.rollback()
            return False

    def _sanitize_metadata(self, metadata: Dict[str, Any]) -> Dict[str, Any]:
        """
        Sanitize metadata to ensure all values are JSON-serializable

        Args:
            metadata: Original metadata dict

        Returns:
            Sanitized metadata dict
        """
        def to_json_serializable(value):
            if value is None:
                return None
            if isinstance(value, (str, int, float, bool)):
                return value
            if isinstance(value, dict):
                return {k: to_json_serializable(v) for k, v in value.items()}
            if isinstance(value, (list, tuple)):
                return [to_json_serializable(v) for v in value]
            # Convert date/datetime objects to ISO string
            if hasattr(value, 'isoformat'):
                return value.isoformat()
            return str(value)

        return {k: to_json_serializable(v) for k, v in metadata.items()}

    async def _parse_dicom_metadata(self, file_path: str) -> Optional[Dict[str, Any]]:
        """
        Parse DICOM file metadata

        Args:
            file_path: Path to DICOM file

        Returns:
            Dictionary with metadata or None
        """
        try:
            ds = pydicom.dcmread(file_path, stop_before_pixels=True)

            metadata = {
                'study_id': str(ds.get('StudyInstanceUID', '')),
                'series_id': str(ds.get('SeriesInstanceUID', '')),
                'instance_id': str(ds.get('SOPInstanceUID', '')),
                'sop_instance_uid': str(ds.get('SOPInstanceUID', '')),
                'sop_class_uid': str(ds.get('SOPClassUID', '')),
                'patient_id': str(ds.get('PatientID', '')),
                'patient_name': str(ds.get('PatientName', '')),
                'study_date': str(ds.get('StudyDate', '')) if ds.get('StudyDate') else None,
                'modality': str(ds.get('Modality', '')),
                'study_description': str(ds.get('StudyDescription', '')),
                'series_description': str(ds.get('SeriesDescription', '')),
            }

            return metadata

        except Exception as e:
            logger.error(f"Error parsing DICOM metadata: {e}", exc_info=True)
            return None

    async def _calculate_file_hash(self, file_path: str) -> str:
        """
        Calculate SHA256 hash of file

        Args:
            file_path: Path to file

        Returns:
            SHA256 hash as hex string
        """
        sha256_hash = hashlib.sha256()
        with open(file_path, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()

    async def _compress_dicom(self, source_path: str) -> Tuple[str, int, str, str]:
        """
        Compress DICOM file using pydicom deflate compression
        
        Args:
            source_path: Path to original DICOM file
            
        Returns:
            (compressed_path, compressed_size_bytes, sha256_hash, transfer_syntax_uid)
        """
        def _sync_compress(path: str) -> Tuple[str, int, str, str]:
            ds = pydicom.dcmread(path)
            ds.compress(DeflatedExplicitVRLittleEndian)
            fd, temp_path = tempfile.mkstemp(suffix='.dcm')
            os.close(fd)
            ds.save_as(temp_path, write_like_original=False)
            new_size = os.path.getsize(temp_path)
            sha256_hash = hashlib.sha256()
            with open(temp_path, "rb") as f:
                for byte_block in iter(lambda: f.read(4096), b""):
                    sha256_hash.update(byte_block)
            new_hash = sha256_hash.hexdigest()
            new_ts_uid = str(ds.transfer_syntax_uid)
            return temp_path, new_size, new_hash, new_ts_uid
        
        return await asyncio.to_thread(_sync_compress, source_path)

    async def _update_storage_stats(
        self,
        storage_location_id: str,
        file_size: int,
        increment: bool = True
    ):
        """
        Update storage location statistics

        Args:
            storage_location_id: Storage location UUID
            file_size: File size in bytes
            increment: True to increment, False to decrement
        """
        try:
            storage_location = self.db.query(StorageLocation).filter(
                StorageLocation.id == storage_location_id
            ).first()

            if storage_location:
                size_gb = file_size / (1024 * 1024 * 1024)

                if increment:
                    storage_location.current_size_gb += size_gb
                    storage_location.current_files += 1
                else:
                    storage_location.current_size_gb = max(0, storage_location.current_size_gb - size_gb)
                    storage_location.current_files = max(0, storage_location.current_files - 1)

                storage_location.updated_at = datetime.now()
                self.db.commit()

                logger.debug(
                    f"Updated storage stats for {storage_location.name}: "
                    f"{storage_location.current_files} files, "
                    f"{storage_location.current_size_gb:.2f} GB"
                )

        except Exception as e:
            logger.error(f"Error updating storage stats: {e}")
            self.db.rollback()

    async def scan_orphans(
        self,
        storage_location_id: Optional[str] = None,
        dry_run: bool = True
    ) -> Dict[str, Any]:
        """
        Scan for orphan files (storage not in DB) and orphan DB entries (no file in storage)

        Args:
            storage_location_id: Optional specific location ID, None for all
            dry_run: If True, report only; False to auto-cleanup

        Returns:
            Dict with 'storage_orphans', 'db_orphans', 'report', 'cleaned_count'
        """
        try:
            report = {
                'storage_location_id': storage_location_id,
                'storage_orphans': [],
                'db_orphans': [],
                'cleaned_storage': 0,
                'cleaned_db': 0,
                'timestamp': datetime.now().isoformat()
            }

            # Query relevant DicomFiles
            query = self.db.query(DicomFile).filter(
                DicomFile.status.in_(['active', 'archived', 'deleted'])
            )
            if storage_location_id:
                query = query.filter(DicomFile.storage_location_id == storage_location_id)
            db_files = query.all()

            # Group DB keys by location
            db_keys_by_loc: Dict[str, set] = {}
            for df in db_files:
                loc_id = str(df.storage_location_id)
                if loc_id not in db_keys_by_loc:
                    db_keys_by_loc[loc_id] = set()
                db_keys_by_loc[loc_id].add(df.file_path)

            # Scan each storage location
            locations = self.db.query(StorageLocation).filter(StorageLocation.is_active == True).all()
            if storage_location_id:
                loc = self.db.query(StorageLocation).filter(StorageLocation.id == storage_location_id).first()
                if loc:
                    locations = [loc]

            for loc in locations:
                loc_id = str(loc.id)
                adapter = await self.adapter_manager.get_adapter(loc_id)
                if not adapter:
                    logger.warning(f"No adapter for location: {loc.name}")
                    continue

                # Get storage files
                storage_keys = await adapter.list_files()
                storage_set = set(storage_keys)

                # Storage orphans: files not in DB
                db_set = db_keys_by_loc.get(loc_id, set())
                storage_orphans = list(storage_set - db_set)
                report['storage_orphans'].extend(storage_orphans)

                # DB orphans: DB entries not in storage (verify exists)
                db_orphans = []
                for key in db_set - storage_set:
                    if not await adapter.exists(key):
                        db_orphans.append(key)
                report['db_orphans'].extend(db_orphans)

                # Cleanup if not dry_run
                if not dry_run:
                    cleaned_storage = 0
                    for key in storage_orphans:
                        if await adapter.delete(key):
                            cleaned_storage += 1
                    report['cleaned_storage'] += cleaned_storage

                    cleaned_db = 0
                    for key in db_orphans:
                        # Find and delete DB records
                        files_to_del = self.db.query(DicomFile).filter(
                            DicomFile.file_path == key,
                            DicomFile.storage_location_id == loc.id
                        ).all()
                        for df in files_to_del:
                            self.db.delete(df)
                            cleaned_db += 1
                        # Update stats
                        if cleaned_db > 0:
                            await self._update_storage_stats(loc_id, 0, increment=False)  # Approx
                    report['cleaned_db'] += cleaned_db

            if not dry_run:
                self.db.commit()

            logger.info(f"Orphan scan complete: {report}")
            return report

        except Exception as e:
            logger.error(f"Orphan scan failed: {e}", exc_info=True)
            self.db.rollback()
            return {'error': str(e)}
    
    async def retrieve_by_storage_key(
        self,
        storage_location_id: str,
        storage_key: str,
        destination_path: Optional[str] = None
    ) -> Optional[str]:
        """
        Retrieve arbitrary storage key from a storage location
        """
        try:
            adapter = await self.adapter_manager.get_adapter(str(storage_location_id))
            if not adapter:
                logger.error(f"Adapter not found for storage location: {storage_location_id}")
                return None

            if not destination_path:
                temp_fd, destination_path = tempfile.mkstemp(suffix='.dcm')
                os.close(temp_fd)

            success = await adapter.retrieve(storage_key, destination_path)
            if not success:
                logger.error(f"Failed to retrieve storage key: {storage_key}")
                return None

            return destination_path
        except Exception as e:
            logger.error(f"Failed to retrieve storage key {storage_key}: {e}", exc_info=True)
            return None

    async def _archive_local_file(
        self,
        adapter: StorageAdapter,
        storage_key: str,
        archive_key: str
    ) -> Optional[str]:
        """Move file within local filesystem storage"""
        base_path = Path(getattr(adapter, 'base_path', '/var/lib/pacs/storage'))
        source = Path(storage_key)
        if not source.is_absolute():
            source = base_path / storage_key
        if not source.exists():
            logger.warning(f"Local file not found for archiving: {source}")
            return None

        target = base_path / archive_key
        target.parent.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(shutil.move, source, target)
        logger.info(f"Moved local file to archive: {archive_key}")
        return archive_key

    async def _archive_remote_file(
        self,
        adapter: StorageAdapter,
        storage_key: str,
        archive_key: str
    ) -> Optional[str]:
        """Copy file to archive prefix in remote storage and delete original"""
        temp_fd, temp_path = tempfile.mkstemp(suffix='.dcm')
        os.close(temp_fd)
        try:
            retrieved = await adapter.retrieve(storage_key, temp_path)
            if not retrieved:
                logger.error(f"Failed to download {storage_key} for archiving")
                return None
            await adapter.store(temp_path, archive_key)
            await adapter.delete(storage_key)
            logger.info(f"Archived remote file to {archive_key} (removed {storage_key})")
            return archive_key
        except Exception as e:
            logger.error(f"Remote archive failed for {storage_key}: {e}")
            return None
        finally:
            try:
                os.unlink(temp_path)
            except Exception:
                pass


def get_dicom_storage_service_v2(db: Session) -> DicomStorageServiceV2:
    """
    Get DICOM storage service V2 instance

    Args:
        db: Database session

    Returns:
        DicomStorageServiceV2 instance
    """
    return DicomStorageServiceV2(db)
