"""
DICOM Upload API
Handles DICOM file uploads with automatic tag extraction and updates
"""

import asyncio
import logging
import os
import shutil
import hashlib
from typing import Optional
from pathlib import Path
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, status, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import get_db
from app.middleware.auth import get_current_user
from app.models.dicom_file import DicomFile
from app.models.dicom_tag_audit import DicomTagAuditLog
from app.models.worklist import WorklistItem
from app.services.dicom_parser import get_dicom_parser
from app.services.dicom_tag_updater import get_dicom_tag_updater
from app.services.dicom_tag_synchronizer import get_dicom_tag_synchronizer
from app.services.dicom_hierarchy import store_dicom_hierarchy
from app.services.dicom_storage_service_v2 import get_dicom_storage_service_v2
from app.utils.logger import get_logger
from app.utils.audit_helper import AuditHelper
import pydicom

logger = get_logger(__name__)
router = APIRouter(prefix="/api/dicom", tags=["dicom-upload"])


# Configuration
# Use STORAGE_PATH from environment (matches Docker volume mount)
STORAGE_PATH = os.getenv("STORAGE_PATH", "/var/lib/pacs/storage")
DEFAULT_UPLOAD_DIR = os.path.join(STORAGE_PATH, "dicom", "uploads")
UPLOAD_DIR = os.getenv("DICOM_UPLOAD_DIR", DEFAULT_UPLOAD_DIR)
MAX_FILE_SIZE = int(os.getenv("MAX_DICOM_SIZE", 100 * 1024 * 1024))  # 100MB default

logger.info(f"DICOM upload directory: {UPLOAD_DIR} (STORAGE_PATH: {STORAGE_PATH})")


@router.post("/upload")
async def upload_dicom_file(
    file: UploadFile = File(..., description="DICOM file to upload (.dcm or .dicom)"),
    category: Optional[str] = Form("dicom", description="File category"),
    description: Optional[str] = Form(None, description="Optional description"),
    order_id: str = Form(..., description="Order ID - REQUIRED"),
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Upload DICOM file with automatic tag extraction

    - **file**: DICOM file (.dcm or .dicom) - REQUIRED
    - **category**: File category (default: "dicom")
    - **description**: Optional description
    - **order_id**: Order ID - REQUIRED (must exist and worklist status must be COMPLETED)

    - Validates order existence and worklist completion status
    - Validates DICOM file
    - Stores file securely
    - Extracts and updates DICOM tags automatically
    - Returns file metadata with extracted tags
    """
    try:
        logger.info(f"Receiving DICOM upload: {file.filename} (size: {file.size} bytes), order_id: {order_id}")

        # VALIDATE ORDER_ID IS REQUIRED
        if not order_id or order_id.strip() == "":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="order_id is required. Please provide a valid order ID."
            )

        # VALIDATE ORDER EXISTS AND WORKLIST STATUS IS COMPLETED
        try:
            from uuid import UUID
            order_uuid = UUID(order_id)
        except (ValueError, AttributeError):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid order_id format: '{order_id}'. Must be a valid UUID."
            )

        # Check if order exists in orders table
        order_query = db.execute(
            text("SELECT id, status FROM orders WHERE id = :order_id"),
            {"order_id": str(order_uuid)}
        ).fetchone()

        if not order_query:
            logger.warning(f"Order not found: {order_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Order with ID '{order_id}' not found. Please create the order first."
            )

        order_status = order_query[1]

        # Check if worklist item exists and is COMPLETED
        worklist_item = db.query(WorklistItem).filter(
            WorklistItem.order_id == order_uuid
        ).first()

        if not worklist_item:
            logger.warning(f"Worklist not found for order: {order_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Worklist not found for order '{order_id}'. Please create a worklist item first."
            )

        # Validate worklist status is COMPLETED
        if worklist_item.sps_status != 'COMPLETED':
            logger.warning(f"Worklist status is '{worklist_item.sps_status}', expected COMPLETED for order: {order_id}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot upload DICOM file. Worklist status is '{worklist_item.sps_status}'. Status must be 'COMPLETED' before uploading DICOM files. Please complete the examination first."
            )

        logger.info(f"✓ Order validation passed: {order_id}, Worklist status: {worklist_item.sps_status}")

        # Validate file presence and basic info
        if not file:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="No file provided. Use 'file' as the form field name."
            )

        if not file.filename:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File has no filename"
            )

        # Validate file type
        if not file.filename.lower().endswith(('.dcm', '.dicom')):
            # Check content type as fallback
            if file.content_type not in ['application/dicom', 'application/octet-stream']:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"File '{file.filename}' must be a DICOM file (.dcm or .dicom). Current content-type: {file.content_type}"
                )
        
        # Generate unique file ID
        file_id = f"{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{os.urandom(8).hex()}"
        
        # Ensure filename has .dcm extension
        filename = file.filename
        if not filename.lower().endswith('.dcm'):
            filename = f"{filename}.dcm"
        
        # Create file path
        file_path = os.path.join(UPLOAD_DIR, f"{file_id}.dcm")
        
        # Ensure upload directory exists right before writing
        upload_dir = os.path.dirname(file_path)
        os.makedirs(upload_dir, exist_ok=True)
        logger.info(f"Ensured upload directory exists: {upload_dir}")
        
        # Read and save file
        content = await file.read()
        
        # Check file size
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File size exceeds maximum allowed size of {MAX_FILE_SIZE / (1024*1024)}MB"
            )
        
        # Calculate checksum
        file_hash = hashlib.sha256(content).hexdigest()
        
        # Save file with full error checking
        logger.info(f"About to save {len(content)} bytes to: {file_path}")
        
        try:
            with open(file_path, 'wb') as f:
                f.write(content)
            if os.path.exists(file_path) and os.path.getsize(file_path) == len(content):
                logger.info(f"✅ File saved successfully: {file_path} ({len(content)} bytes)")
            else:
                raise Exception(f"File save verification failed: {file_path}")
        except Exception as save_error:
            logger.error(f"❌ File save failed: {save_error}")
            raise
        
        # Validate DICOM file with full path verification
        if not os.path.exists(file_path):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"DICOM file missing after save: {file_path}"
            )
        
        parser = get_dicom_parser()
        logger.info(f"Validating DICOM file: {file_path}")
        if not parser.validate_dicom(file_path):
            # Clean up invalid file
            if os.path.exists(file_path):
                os.remove(file_path)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid DICOM file"
            )
        
        # Parse DICOM metadata (with persistence check)
        metadata = parser.parse_file(file_path)
        logger.info(f"Parsed DICOM metadata: {metadata.get('patient_id')}, {metadata.get('study_id')}")

        # MID-PROCESS PERSISTENCE CHECK
        if not os.path.exists(file_path):
            db.rollback()
            raise HTTPException(status_code=500, detail=f"DICOM file vanished during parsing: {file_path}")
        logger.info(f"✅ MID-CHECK OK: {file_path}")

        # Store in hierarchy (Study → Series → Instance) - CRITICAL for /api/studies
        logger.info(f"Creating DICOM hierarchy for Study: {metadata.get('study_id')}")
        hierarchy_success = False
        try:
            ds = pydicom.dcmread(file_path)
            hierarchy_result = store_dicom_hierarchy(db, ds)
            if hierarchy_result.get('success'):
                logger.info(f"✅ Hierarchy created: Study {hierarchy_result.get('study_uid')}")
                hierarchy_success = True
            else:
                logger.error(f"❌ Hierarchy failed: {hierarchy_result.get('error')}")
        except Exception as hierarchy_error:
            logger.error(f"❌ Hierarchy creation FAILED: {hierarchy_error}")
            db.rollback()

        # FORCE FALLBACK Study creation if hierarchy failed
        if not hierarchy_success:
            logger.info("🔄 Creating FALLBACK Study record")
            try:
                from app.models.study import Study
                study_uid = metadata.get('study_instance_uid') or metadata.get('study_id', '')
                if study_uid:
                    existing = db.query(Study).filter(Study.study_instance_uid == study_uid).first()
                    if not existing:
                        # Helper to convert empty strings to None
                        def clean_value(value):
                            return None if value == '' or value is None else value

                        study = Study(
                            study_instance_uid=study_uid,
                            patient_name=metadata.get('patient_name', ''),
                            patient_id=clean_value(metadata.get('patient_id')),  # UUID field
                            patient_birth_date=metadata.get('patient_birth_date'),
                            patient_gender=clean_value(metadata.get('patient_gender')),
                            study_date=metadata.get('study_date'),
                            study_time=metadata.get('study_time'),
                            study_id=clean_value(metadata.get('study_id')),  # DICOM StudyID
                            modality=metadata.get('modality', ''),
                            study_description=clean_value(metadata.get('study_description')),
                            accession_number=clean_value(metadata.get('accession_number')),
                            referring_physician=clean_value(metadata.get('referring_physician')),
                            order_id=None  # Will be linked later if needed
                        )
                        db.add(study)
                        db.flush()  # Flush but NO COMMIT yet
                        logger.info(f"✅ FALLBACK Study flushed: {study_uid}")
                    else:
                        # If study was soft-deleted, restore it
                        if existing.deleted_at is not None:
                            logger.warning(f"Study {study_uid} was soft-deleted, restoring...")
                            existing.deleted_at = None
                            db.flush()
                            logger.info(f"✅ FALLBACK Study restored: {study_uid}")
                        else:
                            logger.info(f"✅ Study already exists: {study_uid}")
            except Exception as fallback_error:
                logger.error(f"Fallback Study creation failed: {fallback_error}")

        # CRITICAL MID-HIERARCHY FILE CHECK
        if not os.path.exists(file_path):
            db.rollback()
            raise HTTPException(status_code=500, detail=f"DICOM file vanished during hierarchy: {file_path}")
        logger.info(f"✅ HIERARCHY CHECK OK: {file_path}")

        # Check if DICOM file already exists (by SOP Instance UID)
        sop_instance_uid = metadata.get('sop_instance_uid', '')
        existing_file = db.query(DicomFile).filter(
            DicomFile.sop_instance_uid == sop_instance_uid
        ).first()
        
        if existing_file:
            # File already exists - update it instead of creating new
            logger.info(f"DICOM file already exists (SOP Instance UID: {sop_instance_uid}), updating...")

            # Check if existing file path is still valid
            existing_path_valid = os.path.exists(existing_file.file_path) if existing_file.file_path else False

            if existing_path_valid:
                # Existing file is valid, remove the duplicate new upload
                if os.path.exists(file_path):
                    os.remove(file_path)
                    logger.info(f"Removed duplicate file: {file_path}")
            else:
                # Existing file path is invalid/missing, use the new uploaded file
                logger.warning(f"Existing file path invalid: {existing_file.file_path}, updating to new path: {file_path}")
                existing_file.file_path = file_path  # Update to new valid path

            # Update existing record with new metadata
            existing_file.file_size = len(content)
            existing_file.file_hash = file_hash
            existing_file.patient_id = metadata.get('patient_id')
            existing_file.patient_name = metadata.get('patient_name')
            existing_file.patient_birth_date = metadata.get('patient_birth_date')
            existing_file.patient_gender = metadata.get('patient_gender')
            existing_file.study_date = metadata.get('study_date')
            existing_file.study_time = metadata.get('study_time')
            existing_file.study_description = metadata.get('study_description')
            existing_file.modality = metadata.get('modality')
            existing_file.body_part = metadata.get('body_part')
            existing_file.series_number = metadata.get('series_number')
            existing_file.instance_number = metadata.get('instance_number')
            existing_file.updated_at = datetime.utcnow()
            
            # Update metadata
            if not existing_file.dicom_metadata:
                existing_file.dicom_metadata = {}
            existing_file.dicom_metadata.update({
                'filename': filename,
                'category': category,
                'description': description,
                'order_id': order_id,
                'last_uploaded_at': datetime.utcnow().isoformat()
            })
            
            db.flush()  # Flush updates
            db.refresh(existing_file)
            dicom_file = existing_file
            
            logger.info(f"Updated existing DicomFile record: {dicom_file.id}")
            
            # Use existing file path for tag updates (don't try to read deleted temp file)
            tag_update_file_path = existing_file.file_path
        else:
            # Create new database record
            dicom_file = DicomFile(
                study_id=metadata.get('study_id', ''),
                series_id=metadata.get('series_id', ''),
                instance_id=metadata.get('instance_id', ''),
                sop_class_uid=metadata.get('sop_class_uid', ''),
                sop_instance_uid=sop_instance_uid,
                file_path=file_path,
                file_size=len(content),
                file_hash=file_hash,
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
                is_compressed=parser.is_compressed(file_path),
                status='active',
                dicom_metadata={
                    'filename': filename,
                    'category': category,
                    'description': description,
                    'order_id': order_id,
                    'uploaded_at': datetime.utcnow().isoformat()
                }
            )
            
            db.add(dicom_file)
            db.flush()  # Flush to get ID but NO COMMIT
            logger.info(f"Created new DicomFile record (FLUSHED): {dicom_file.id}")
        
        logger.info(f"Created DicomFile record: {dicom_file.id}")
        
        # Determine correct file path for tag updates (FIX variable scope bug)
        tag_file_path = file_path  # Default for new files
        if existing_file:  # Only for existing files (where we deleted temp file)
            tag_file_path = existing_file.file_path
        
        # Update DICOM tags (OPTIONAL - don't fail upload if tag update fails)
        dicom_tags = {}
        try:
            tag_updater = get_dicom_tag_updater()
            dicom_tags = await tag_updater.update_tags_on_upload(
                db=db,
                file_path=tag_file_path,
                dicom_file_id=str(dicom_file.id)
            )
            logger.info(f"✅ Updated DICOM tags for file: {dicom_file.id}")
        except Exception as tag_error:
            logger.warning(f"⚠️ Tag update failed (upload still successful): {tag_error}")
            dicom_tags = {}
        
        # ALL DB OPERATIONS FLUSHED - NOW FINAL FILE PERSISTENCE CHECK + COMMIT
        # Determine which file path to verify (handle duplicate case where new file was deleted)
        final_check_path = existing_file.file_path if existing_file else file_path
        logger.info(f"🔍 FINAL FILE CHECK before commit: {final_check_path}")

        # CRITICAL: FINAL PERSISTENCE VERIFICATION
        if not os.path.exists(final_check_path):
            logger.error(f"❌ FINAL FAILURE: File MISSING {final_check_path}!")
            db.rollback()  # ROLLBACK ALL DB CHANGES
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"DICOM file failed to persist in storage: {final_check_path}. Upload failed."
            )

        final_size = os.path.getsize(final_check_path)
        expected_size = len(content)
        # For existing files, don't check size match (may have been modified)
        if not existing_file and final_size != expected_size:
            logger.error(f"❌ FINAL FAILURE: Size mismatch {final_check_path} (exp={expected_size}, got={final_size})!")
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"DICOM file corrupted in storage: {final_check_path} (size mismatch)."
            )

        logger.info(f"✅ FINAL CHECK PASS: {final_check_path} ({final_size}B) - COMMITTING!")

        # ALL CHECKS PASS - NOW COMMIT EVERYTHING
        db.commit()
        logger.info(f"✅ FULL COMMIT: File + DB + Hierarchy for {dicom_file.id}")

        # AUDIT LOG: DICOM file uploaded
        try:
            await AuditHelper.log_dicom_uploaded(
                db=db,
                dicom_file_id=str(dicom_file.id),
                request=request,
                details={
                    'filename': filename,
                    'file_size': len(content),
                    'order_id': order_id,
                    'category': category,
                    'sop_instance_uid': metadata.get('sop_instance_uid'),
                    'modality': metadata.get('modality'),
                    'study_description': metadata.get('study_description'),
                    'was_updated': is_update
                },
                patient_id=metadata.get('patient_id'),
                study_instance_uid=metadata.get('study_instance_uid') or metadata.get('study_id')
            )
        except Exception as audit_error:
            logger.warning(f"Audit log failed for DICOM upload: {audit_error}")

        # NOW safe to do optional tag updates (won't affect main flow)
        tag_file_path = file_path  # Default for new files
        if existing_file:
            tag_file_path = existing_file.file_path
        
        # Return response
        is_update = existing_file is not None
        return JSONResponse(
            status_code=status.HTTP_200_OK if is_update else status.HTTP_201_CREATED,
            content={
                "success": True,
                "message": f"DICOM file {'updated' if is_update else 'uploaded'} successfully - File persisted: {final_check_path}",
                "is_update": is_update,
                "file": {
                    "id": str(dicom_file.id),
                    "filename": filename,
                    "file_size": len(content),
                    "file_hash": file_hash,
                    "category": category,
                    "uploaded_at": dicom_file.created_at.isoformat()
                },
                "dicom_metadata": {
                    "patient_id": metadata.get('patient_id'),
                    "patient_name": metadata.get('patient_name'),
                    "study_id": metadata.get('study_id'),
                    "series_id": metadata.get('series_id'),
                    "modality": metadata.get('modality'),
                    "study_date": metadata.get('study_date').isoformat() if metadata.get('study_date') else None,
                    "study_description": metadata.get('study_description')
                },
                "dicom_tags": dicom_tags
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to upload DICOM file: {str(e)}", exc_info=True)
        
        # Clean up file if it was created
        if 'file_path' in locals() and os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception as cleanup_error:
                logger.warning(f"Failed to cleanup file {file_path}: {cleanup_error}")
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload DICOM file: {str(e)}"
        )

@router.get("/files/{file_id}/tags")
async def get_dicom_tags(
    file_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Get DICOM tags for a specific file
    """
    try:
        dicom_file = db.query(DicomFile).filter(DicomFile.id == file_id).first()
        
        if not dicom_file:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="DICOM file not found"
            )
        
        # Extract AWS compatible tags from metadata
        aws_tags = dicom_file.dicom_metadata.get('aws_dicom_tags', {}) if dicom_file.dicom_metadata else {}
        
        return {
            "file_id": str(dicom_file.id),
            "filename": dicom_file.dicom_metadata.get('filename') if dicom_file.dicom_metadata else None,
            "dicom_tags": aws_tags,
            "metadata": {
                "patient_id": dicom_file.patient_id,
                "patient_name": dicom_file.patient_name,
                "patient_gender": dicom_file.patient_gender,
                "study_id": dicom_file.study_id,
                "series_id": dicom_file.series_id,
                "modality": dicom_file.modality,
                "study_date": dicom_file.study_date.isoformat() if dicom_file.study_date else None,
                "study_description": dicom_file.study_description
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get DICOM tags: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get DICOM tags: {str(e)}"
        )

@router.post("/files/{file_id}/refresh-tags")
async def refresh_dicom_tags(
    file_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Refresh DICOM tags for a specific file
    Re-parses the DICOM file and updates tags
    """
    try:
        dicom_file = db.query(DicomFile).filter(DicomFile.id == file_id).first()
        
        if not dicom_file:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="DICOM file not found"
            )
        
        if not os.path.exists(dicom_file.file_path):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="DICOM file not found on disk"
            )
        
        # Update tags
        tag_updater = get_dicom_tag_updater()
        dicom_tags = await tag_updater.update_tags_on_upload(
            db=db,
            file_path=dicom_file.file_path,
            dicom_file_id=file_id
        )
        
        return {
            "success": True,
            "message": "DICOM tags refreshed successfully",
            "file_id": file_id,
            "dicom_tags": dicom_tags
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to refresh DICOM tags: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to refresh DICOM tags: {str(e)}"
        )

@router.post("/upload-v2")
async def upload_dicom_file_v2(
    file: UploadFile = File(..., description="DICOM file to upload (.dcm or .dicom)"),
    tier: str = Form('hot', description="Storage tier: hot, warm, or cold"),
    category: Optional[str] = Form("dicom", description="File category"),
    description: Optional[str] = Form(None, description="Optional description"),
    order_id: Optional[str] = Form(None, description="Optional order ID"),
    sync_tags: bool = Form(False, description="Synchronize DICOM tags with worklist data"),
    preserve_original: bool = Form(True, description="Keep original file for audit when syncing"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Upload DICOM file using Storage Service V2 (Multi-backend support)
    
    This endpoint supports:
    - Multiple storage backends (S3, Local, MinIO, etc.)
    - Automatic storage tier selection
    - Optional DICOM tag synchronization (same as /api/dicom/upload-sync)
    - DICOM hierarchy creation
    - Hash verification
    
    Args:
        file: DICOM file to upload
        tier: Storage tier (hot/warm/cold) - default: hot
        category: File category
        description: Optional description
        order_id: Optional order ID for worklist linkage
        sync_tags: Enable tag synchronization (requires order_id)
        preserve_original: Keep original DICOM for audit when syncing
        
    Returns:
        JSON response with upload status and file metadata
    """
    import tempfile
    
    def attach_common_metadata(target):
        """Attach shared metadata fields before storing"""
        target['category'] = category
        target['description'] = description
        target['order_id'] = order_id
        target['filename'] = file.filename
    
    try:
        logger.info(f"📤 V2 Upload started: {file.filename} (tier={tier}, sync_tags={sync_tags})")
        
        # Validate file type
        if not file.filename:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Filename is required"
            )
        
        if not file.filename.lower().endswith(('.dcm', '.dicom')):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only DICOM files (.dcm, .dicom) are allowed"
            )
        
        # Read file content
        content = await file.read()
        
        # Check file size
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File size exceeds maximum allowed size of {MAX_FILE_SIZE / (1024*1024)}MB"
            )
        
        # Create temp file to validate and parse DICOM
        temp_fd, temp_path = tempfile.mkstemp(suffix='.dcm')
        try:
            # Write to temp file
            os.write(temp_fd, content)
            os.close(temp_fd)
            
            # Validate DICOM
            parser = get_dicom_parser()
            if not parser.validate_dicom(temp_path):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid DICOM file"
                )
            
            # Parse metadata
            metadata = parser.parse_file(temp_path)
            attach_common_metadata(metadata)
            logger.info(f"✅ Parsed DICOM: {metadata.get('patient_id')}, Study={metadata.get('study_id')}")

            upload_source_path = temp_path
            audit_log = None
            tag_sync_result = None
            worklist_summary = None
            audit_original_path = None
            audit_synchronized_path = None
            
            if sync_tags:
                logger.info("🔄 Tag synchronization requested for upload-v2")
                order_uuid, worklist_item = _validate_order_and_worklist(db, order_id)
                worklist_summary = {
                    "id": str(worklist_item.id),
                    "patient_name": worklist_item.patient_name,
                    "patient_id": worklist_item.patient_id,
                    "accession_number": worklist_item.accession_number
                }
                
                try:
                    synchronizer = get_dicom_tag_synchronizer()
                    original_file_path, synchronized_file_path, audit_info = synchronizer.synchronize_tags(
                        temp_path,
                        worklist_item,
                        preserve_original=preserve_original,
                        db=db
                    )
                    upload_source_path = synchronized_file_path
                    audit_original_path = original_file_path
                    audit_synchronized_path = synchronized_file_path
                    
                    # Re-parse synchronized file for accurate metadata
                    metadata = parser.parse_file(synchronized_file_path)
                    attach_common_metadata(metadata)
                    metadata['tag_synchronized'] = True
                    metadata['original_file_path'] = original_file_path if preserve_original else None
                    metadata['synchronized_file_path'] = synchronized_file_path
                    
                    audit_log = DicomTagAuditLog(
                        worklist_id=worklist_item.id,
                        order_id=order_uuid,
                        sop_instance_uid=metadata.get('sop_instance_uid'),
                        study_instance_uid=metadata.get('study_id'),
                        series_instance_uid=metadata.get('series_id'),
                        accession_number=worklist_item.accession_number,
                        original_file_path=original_file_path,
                        synchronized_file_path=synchronized_file_path,
                        original_file_size=audit_info.get('file_size_original'),
                        synchronized_file_size=audit_info.get('file_size_synchronized'),
                        original_tags=audit_info.get('original_tags'),
                        synchronized_tags=audit_info.get('synchronized_tags'),
                        tag_changes=audit_info.get('changes'),
                        patient_id=worklist_item.patient_id,
                        patient_name=worklist_item.patient_name,
                        operation_type='TAG_SYNC',
                        performed_by='SYSTEM',
                        operation_reason='Synchronize DICOM tags with PACS worklist data (partial bridging)',
                        is_bridged='PARTIAL',
                        requires_review='N',
                        sync_status='SUCCESS'
                    )
                    db.add(audit_log)
                    db.flush()
                    
                    tag_sync_result = {
                        "synchronized": True,
                        "changes_count": len(audit_info.get('changes', {})),
                        "changes": audit_info.get('changes'),
                        "original_file": original_file_path,
                        "synchronized_file": synchronized_file_path,
                        "audit_log_id": str(audit_log.id)
                    }
                except Exception as sync_error:
                    logger.error(f"Tag synchronization failed: {sync_error}", exc_info=True)
                    upload_source_path = temp_path
                    tag_sync_result = {
                        "synchronized": False,
                        "error": str(sync_error)
                    }
            else:
                tag_sync_result = {
                    "synchronized": False,
                    "reason": "Tag synchronization disabled"
                }
                logger.info("Tag synchronization skipped (sync_tags=False)")
            
            if audit_log:
                metadata['audit_log_id'] = str(audit_log.id)
            metadata['tag_synchronized'] = tag_sync_result.get('synchronized', False)
            
            # Initialize storage service V2
            storage_service = get_dicom_storage_service_v2(db)
            
            # Store DICOM using V2 service
            dicom_file = await storage_service.store_dicom(
                source_path=upload_source_path,
                tier=tier,
                metadata=metadata
            )
            
            if not dicom_file:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to store DICOM file"
                )
            
            if audit_log:
                audit_log.dicom_file_id = dicom_file.id
                db.commit()
            
            logger.info(
                f"✅ V2 Upload successful: {dicom_file.instance_id} "
                f"to {dicom_file.storage_tier} tier"
            )

            # Archive tag sync files to storage backend
            if audit_log and audit_synchronized_path:
                original_key, synchronized_key = await _upload_tag_sync_artifacts(
                    storage_service.adapter_manager,
                    dicom_file.storage_location_id,
                    audit_log,
                    audit_original_path,
                    audit_synchronized_path
                )

                metadata_updates = dicom_file.dicom_metadata or {}

                if original_key:
                    tag_sync_result['original_file'] = original_key
                    audit_log.original_file_path = original_key
                    metadata_updates['original_storage_key'] = original_key
                if synchronized_key:
                    tag_sync_result['synchronized_file'] = synchronized_key
                    audit_log.synchronized_file_path = synchronized_key
                    metadata_updates['synchronized_storage_key'] = synchronized_key

                if metadata_updates != dicom_file.dicom_metadata:
                    dicom_file.dicom_metadata = metadata_updates
                db.commit()
            
            # Try to create DICOM hierarchy (study/series/instance)
            try:
                ds = pydicom.dcmread(upload_source_path)
                hierarchy_result = store_dicom_hierarchy(db, ds)
                if hierarchy_result.get('success'):
                    logger.info(f"✅ Hierarchy created: Study {hierarchy_result.get('study_uid')}")
                else:
                    logger.warning(f"⚠️ Hierarchy creation failed: {hierarchy_result.get('error')}")
            except Exception as hierarchy_error:
                logger.warning(f"⚠️ Hierarchy creation error: {hierarchy_error}")
            
            # Return response
            was_updated = getattr(dicom_file, "_was_updated", False)
            response_message = (
                "DICOM file updated successfully using V2 service"
                if was_updated else
                "DICOM file uploaded successfully using V2 service"
            )
            response_status = status.HTTP_200_OK if was_updated else status.HTTP_201_CREATED

            return _build_upload_v2_response(
                dicom_file=dicom_file,
                message=response_message,
                status_code=response_status,
                tag_sync_result=tag_sync_result,
                worklist_summary=worklist_summary,
                source_filename=file.filename
            )
            
        finally:
            # Clean up temp file
            if os.path.exists(temp_path):
                try:
                    os.unlink(temp_path)
                except Exception as e:
                    logger.warning(f"Failed to delete temp file: {e}")
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ V2 Upload failed: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Upload failed: {str(e)}"
        )


def _validate_order_and_worklist(db: Session, order_id: Optional[str]):
    """Validate order/worklist info for tag synchronization"""
    if not order_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="order_id is required when sync_tags is enabled"
        )
    
    try:
        order_uuid = UUID(order_id)
    except (ValueError, AttributeError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid order_id format: '{order_id}'. Must be a valid UUID."
        )
    
    order_query = db.execute(
        text("SELECT id FROM orders WHERE id = :order_id"),
        {"order_id": str(order_uuid)}
    ).fetchone()
    
    if not order_query:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order with ID '{order_id}' not found."
        )
    
    worklist_item = db.query(WorklistItem).filter(
        WorklistItem.order_id == order_uuid
    ).first()
    
    if not worklist_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Worklist not found for order '{order_id}'."
        )
    
    if worklist_item.sps_status != 'COMPLETED':
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot upload DICOM. Worklist status is '{worklist_item.sps_status}'. Status must be 'COMPLETED'."
        )
    
    return order_uuid, worklist_item


def _build_upload_v2_response(
    dicom_file: DicomFile,
    message: str,
    status_code: int,
    tag_sync_result: Optional[dict],
    worklist_summary: Optional[dict],
    source_filename: Optional[str] = None
):
    """Format upload-v2 response payload"""
    return JSONResponse(
        status_code=status_code,
        content={
            "success": True,
            "message": message,
            "version": "v2",
            "file": {
                "id": str(dicom_file.id),
                "filename": (
                    dicom_file.dicom_metadata.get('filename')
                    if dicom_file.dicom_metadata else source_filename
                ),
                "file_size": dicom_file.file_size,
                "file_hash": dicom_file.file_hash,
                "storage_tier": dicom_file.storage_tier,
                "storage_location_id": str(dicom_file.storage_location_id) if dicom_file.storage_location_id else None,
                "storage_key": dicom_file.file_path,
                "uploaded_at": dicom_file.created_at.isoformat() if dicom_file.created_at else None
            },
            "dicom_metadata": {
                "patient_id": dicom_file.patient_id,
                "patient_name": dicom_file.patient_name,
                "study_id": dicom_file.study_id,
                "series_id": dicom_file.series_id,
                "instance_id": dicom_file.instance_id,
                "sop_instance_uid": dicom_file.sop_instance_uid,
                "modality": dicom_file.modality,
                "study_date": dicom_file.study_date.isoformat() if dicom_file.study_date else None
            },
            "tag_sync": tag_sync_result,
            "worklist": worklist_summary
        }
    )


async def _upload_tag_sync_artifacts(
    adapter_manager,
    storage_location_id: Optional[str],
    audit_log: DicomTagAuditLog,
    original_path: Optional[str],
    synchronized_path: Optional[str]
):
    """Upload original/synchronized audit files to configured storage backend"""
    if not storage_location_id:
        return None, None

    adapter = await adapter_manager.get_adapter(str(storage_location_id))
    if not adapter:
        logger.warning("Unable to archive tag sync artifacts: adapter unavailable")
        return None, None

    prefix = f"dicom/audit/{audit_log.id}"
    original_key = None
    synchronized_key = None

    async def _store_file(source_path: str, key: str) -> Optional[str]:
        try:
            if hasattr(adapter, 'get_adapter_type') and adapter.get_adapter_type() == 'local':
                base_path = getattr(adapter, 'base_path', Path('/var/lib/pacs/storage'))
                target_path = Path(base_path) / key
                target_path.parent.mkdir(parents=True, exist_ok=True)
                await asyncio.to_thread(shutil.copy2, source_path, target_path)
                return key

            result = await adapter.store(source_path, key)
            if isinstance(result, str):
                return result
            return key
        except Exception as exc:
            logger.error(f"Failed to archive {key}: {exc}")
            return None

    if original_path and os.path.exists(original_path):
        original_key = f"{prefix}/original_{Path(original_path).name}"
        original_key = await _store_file(original_path, original_key)

    if synchronized_path and os.path.exists(synchronized_path):
        synchronized_key = f"{prefix}/synchronized_{Path(synchronized_path).name}"
        synchronized_key = await _store_file(synchronized_path, synchronized_key)

    return original_key, synchronized_key
