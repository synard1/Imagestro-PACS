
import asyncio
import logging
import os
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.dicom_file import DicomFile
from app.services.dicom_storage_service_v2 import DicomStorageServiceV2
from app.services.storage_adapter_manager import get_storage_adapter_manager
from pathlib import Path

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

async def fix_dicom_file_sizes():
    """
    Iterates through DicomFile records, and if file_size is 0, attempts to
    retrieve the file from storage to re-calculate and update its size.
    """
    db: Session = next(get_db())
    storage_service = DicomStorageServiceV2(db)
    
    logger.info("Starting DICOM file size fix script...")
    
    fixed_count = 0
    skipped_count = 0
    error_count = 0

    try:
        # Fetch all DicomFiles with file_size = 0
        dicom_files_to_fix = db.query(DicomFile).filter(
            DicomFile.file_size == 0,
            DicomFile.status == 'active'
        ).all()

        logger.info(f"Found {len(dicom_files_to_fix)} active DicomFiles with file_size = 0.")

        for dicom_file in dicom_files_to_fix:
            logger.info(f"Processing DicomFile: {dicom_file.sop_instance_uid} (ID: {dicom_file.id})")
            
            if not dicom_file.storage_location_id:
                logger.warning(
                    f"Skipping DicomFile {dicom_file.sop_instance_uid}: "
                    "No storage_location_id specified. Cannot retrieve."
                )
                skipped_count += 1
                continue
            
            try:
                # Retrieve file to a temporary location
                temp_path = await storage_service.retrieve_dicom(dicom_file)

                if temp_path:
                    new_file_size = Path(temp_path).stat().st_size
                    if new_file_size > 0:
                        dicom_file.file_size = new_file_size
                        dicom_file.updated_at = datetime.now()
                        db.add(dicom_file)
                        db.commit()
                        fixed_count += 1
                        logger.info(
                            f"Updated file_size for {dicom_file.sop_instance_uid} "
                            f"from 0 to {new_file_size} bytes."
                        )
                        # Optionally update storage location stats as well if this was a significant fix
                        await storage_service._update_storage_stats(
                            str(dicom_file.storage_location_id), 
                            new_file_size, 
                            increment=True # Treat as increment if it was previously 0
                        )
                    else:
                        logger.warning(
                            f"Retrieved file for {dicom_file.sop_instance_uid} is still 0 bytes. "
                            "No update performed."
                        )
                        skipped_count += 1
                    
                    # Clean up temp file
                    if temp_path and temp_path.startswith(tempfile.gettempdir()):
                        try:
                            os.unlink(temp_path)
                        except Exception as e:
                            logger.warning(f"Failed to delete temporary file {temp_path}: {e}")
                else:
                    logger.error(f"Failed to retrieve file for {dicom_file.sop_instance_uid}. Skipping.")
                    error_count += 1
            except Exception as e:
                db.rollback()
                logger.error(
                    f"Error processing DicomFile {dicom_file.sop_instance_uid} (ID: {dicom_file.id}): {e}", 
                    exc_info=True
                )
                error_count += 1
    except Exception as e:
        logger.critical(f"A critical error occurred in fix_dicom_file_sizes: {e}", exc_info=True)
    finally:
        db.close()
        logger.info("DICOM file size fix script finished.")
        logger.info(f"Summary: Fixed {fixed_count}, Skipped {skipped_count}, Errors {error_count}")

if __name__ == "__main__":
    asyncio.run(fix_dicom_file_sizes())
