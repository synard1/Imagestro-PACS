"""
DICOM Upload API with Tag Synchronization
Handles DICOM file uploads with automatic tag synchronization to worklist data
Maintains both original and synchronized files for audit trail
"""

import logging
import os
import hashlib
from typing import Optional
from pathlib import Path
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import get_db
from app.models.dicom_file import DicomFile
from app.models.worklist import WorklistItem
from app.models.dicom_tag_audit import DicomTagAuditLog
from app.services.dicom_parser import get_dicom_parser
from app.services.dicom_tag_synchronizer import get_dicom_tag_synchronizer
from app.services.dicom_hierarchy import store_dicom_hierarchy
from app.utils.logger import get_logger
import pydicom

logger = get_logger(__name__)
router = APIRouter(prefix="/api/dicom", tags=["dicom-upload-sync"])


# Configuration
STORAGE_PATH = os.getenv("STORAGE_PATH", "/var/lib/pacs/storage")
DEFAULT_UPLOAD_DIR = os.path.join(STORAGE_PATH, "dicom", "temp_uploads")
UPLOAD_DIR = os.getenv("DICOM_UPLOAD_DIR", DEFAULT_UPLOAD_DIR)
MAX_FILE_SIZE = int(os.getenv("MAX_DICOM_SIZE", 100 * 1024 * 1024))  # 100MB default

logger.info(f"DICOM upload (with sync) directory: {UPLOAD_DIR}")


@router.post("/upload-sync")
async def upload_dicom_with_sync(
    file: UploadFile = File(..., description="DICOM file to upload (.dcm or .dicom)"),
    order_id: str = Form(..., description="Order ID - REQUIRED"),
    sync_tags: bool = Form(True, description="Enable tag synchronization (default: True)"),
    preserve_original: bool = Form(True, description="Keep original file for audit (default: True)"),
    category: Optional[str] = Form("dicom", description="File category"),
    description: Optional[str] = Form(None, description="Optional description"),
    db: Session = Depends(get_db)
):
    """
    Upload DICOM file with automatic tag synchronization

    This endpoint:
    1. Validates order and worklist status (must be COMPLETED)
    2. Saves uploaded DICOM file temporarily
    3. Synchronizes DICOM tags with worklist/patient data
    4. Stores both original and synchronized files for audit trail
    5. Creates study/series/instance hierarchy
    6. Logs all tag changes for compliance

    Args:
        file: DICOM file (.dcm or .dicom) - REQUIRED
        order_id: Order ID - REQUIRED (must exist and worklist must be COMPLETED)
        sync_tags: Enable tag synchronization (default: True)
        preserve_original: Keep original file for audit trail (default: True)
        category: File category (default: "dicom")
        description: Optional description

    Returns:
        {
            "status": "success",
            "dicom_file": {...},
            "tag_sync": {
                "synchronized": true/false,
                "changes_count": N,
                "original_file": "path",
                "synchronized_file": "path",
                "audit_log_id": "uuid"
            }
        }
    """
    temp_file_path = None

    try:
        logger.info(f"=== DICOM Upload with Tag Sync ===")
        logger.info(f"File: {file.filename}, Order: {order_id}, Sync: {sync_tags}")

        # STEP 1: Validate Order and Worklist
        try:
            order_uuid = UUID(order_id)
        except (ValueError, AttributeError):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid order_id format: '{order_id}'. Must be a valid UUID."
            )

        # Check if order exists
        order_query = db.execute(
            text("SELECT id, status FROM orders WHERE id = :order_id"),
            {"order_id": str(order_uuid)}
        ).fetchone()

        if not order_query:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Order with ID '{order_id}' not found."
            )

        # Get worklist item
        worklist_item = db.query(WorklistItem).filter(
            WorklistItem.order_id == order_uuid
        ).first()

        if not worklist_item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Worklist not found for order '{order_id}'."
            )

        # Validate worklist status
        if worklist_item.sps_status != 'COMPLETED':
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot upload DICOM. Worklist status is '{worklist_item.sps_status}'. Status must be 'COMPLETED'."
            )

        logger.info(f"✓ Worklist validated: patient={worklist_item.patient_name}, accession={worklist_item.accession_number}")

        # STEP 2: Validate and save temp file
        if not file or not file.filename:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No file provided"
            )

        if not file.filename.lower().endswith(('.dcm', '.dicom')):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File must be a DICOM file (.dcm or .dicom)"
            )

        # Create temp directory
        os.makedirs(UPLOAD_DIR, exist_ok=True)

        # Generate temp file path
        file_id = f"{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{os.urandom(8).hex()}"
        temp_file_path = os.path.join(UPLOAD_DIR, f"{file_id}_temp.dcm")

        # Read and save temp file
        content = await file.read()

        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File size exceeds maximum of {MAX_FILE_SIZE / (1024*1024)}MB"
            )

        with open(temp_file_path, 'wb') as f:
            f.write(content)

        logger.info(f"✓ Temp file saved: {temp_file_path} ({len(content)} bytes)")

        # STEP 3: Validate DICOM
        parser = get_dicom_parser()
        if not parser.validate_dicom(temp_file_path):
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid DICOM file"
            )

        # Parse metadata
        metadata = parser.parse_file(temp_file_path)
        logger.info(f"✓ DICOM parsed: SOP={metadata.get('sop_instance_uid')}")

        # STEP 4: Tag Synchronization
        tag_sync_result = None
        original_file_path = temp_file_path
        synchronized_file_path = temp_file_path
        audit_log = None

        if sync_tags:
            logger.info("Starting tag synchronization...")
            try:
                synchronizer = get_dicom_tag_synchronizer()
                original_file_path, synchronized_file_path, audit_info = synchronizer.synchronize_tags(
                    temp_file_path,
                    worklist_item,
                    preserve_original=preserve_original,
                    db=db  # Pass db session to get MRN from patients table
                )

                logger.info(f"✓ Tag sync complete:")
                logger.info(f"  Original: {original_file_path}")
                logger.info(f"  Synchronized: {synchronized_file_path}")
                logger.info(f"  Changes: {len(audit_info.get('changes', {}))} tags")

                # Create audit log
                # Note: parser returns 'study_id' and 'series_id', not 'study_instance_uid' and 'series_instance_uid'
                audit_log = DicomTagAuditLog(
                    worklist_id=worklist_item.id,
                    order_id=order_uuid,
                    sop_instance_uid=metadata.get('sop_instance_uid'),
                    study_instance_uid=metadata.get('study_id'),  # Parser returns 'study_id'
                    series_instance_uid=metadata.get('series_id'),  # Parser returns 'series_id'
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

                logger.info(f"✓ Audit log created: {audit_log.id}")

                tag_sync_result = {
                    "synchronized": True,
                    "changes_count": len(audit_info.get('changes', {})),
                    "changes": audit_info.get('changes'),
                    "original_file": original_file_path,
                    "synchronized_file": synchronized_file_path,
                    "audit_log_id": str(audit_log.id)
                }

            except Exception as sync_error:
                logger.error(f"Tag synchronization failed: {str(sync_error)}", exc_info=True)
                # Continue with original file if sync fails
                synchronized_file_path = temp_file_path
                tag_sync_result = {
                    "synchronized": False,
                    "error": str(sync_error)
                }
        else:
            logger.info("Tag synchronization skipped (sync_tags=False)")
            tag_sync_result = {
                "synchronized": False,
                "reason": "Tag synchronization disabled"
            }

        # STEP 5: Store in database (using synchronized file)
        # Re-parse synchronized file to get updated metadata
        final_metadata = parser.parse_file(synchronized_file_path)

        # Check if DICOM file already exists (by SOP Instance UID)
        sop_instance_uid = final_metadata.get('sop_instance_uid')
        existing_file = db.query(DicomFile).filter(
            DicomFile.sop_instance_uid == sop_instance_uid
        ).first()

        if existing_file:
            # Update existing record instead of creating new one
            logger.info(f"DICOM file already exists (SOP: {sop_instance_uid}), updating record...")

            existing_file.study_id = final_metadata.get('study_id')
            existing_file.series_id = final_metadata.get('series_id')
            existing_file.patient_id = final_metadata.get('patient_id', '')
            existing_file.patient_name = final_metadata.get('patient_name', '')
            existing_file.patient_birth_date = final_metadata.get('patient_birth_date')
            existing_file.patient_gender = final_metadata.get('patient_gender', '')
            existing_file.study_date = final_metadata.get('study_date')
            existing_file.study_time = final_metadata.get('study_time')
            existing_file.study_description = final_metadata.get('study_description', '')
            existing_file.modality = final_metadata.get('modality', '')
            existing_file.body_part = final_metadata.get('body_part', '')
            existing_file.file_path = synchronized_file_path
            existing_file.file_size = os.path.getsize(synchronized_file_path)
            existing_file.file_hash = hashlib.sha256(open(synchronized_file_path, 'rb').read()).hexdigest()
            existing_file.updated_at = datetime.now()

            # Update metadata
            if existing_file.dicom_metadata:
                existing_file.dicom_metadata.update({
                    "category": category,
                    "filename": file.filename,
                    "order_id": str(order_id),
                    "description": description,
                    "uploaded_at": datetime.now().isoformat(),
                    "tag_synchronized": sync_tags,
                    "original_file_path": original_file_path if preserve_original else None,
                    "audit_log_id": str(audit_log.id) if audit_log else None,
                    "re_uploaded": True,
                    "re_uploaded_at": datetime.now().isoformat()
                })
            else:
                existing_file.dicom_metadata = {
                    "category": category,
                    "filename": file.filename,
                    "order_id": str(order_id),
                    "description": description,
                    "uploaded_at": datetime.now().isoformat(),
                    "tag_synchronized": sync_tags,
                    "original_file_path": original_file_path if preserve_original else None,
                    "audit_log_id": str(audit_log.id) if audit_log else None,
                    "re_uploaded": True,
                    "re_uploaded_at": datetime.now().isoformat()
                }

            dicom_file = existing_file
            db.flush()
            logger.info(f"✓ Existing DICOM file updated: {dicom_file.id}")
        else:
            # Create new DicomFile record
            # Note: parser returns 'study_id' and 'series_id', not 'study_instance_uid' and 'series_instance_uid'
            dicom_file = DicomFile(
                sop_instance_uid=final_metadata.get('sop_instance_uid'),
                sop_class_uid=final_metadata.get('sop_class_uid'),
                study_id=final_metadata.get('study_id'),  # Parser returns 'study_id', not 'study_instance_uid'
                series_id=final_metadata.get('series_id'),  # Parser returns 'series_id', not 'series_instance_uid'
                instance_id=final_metadata.get('sop_instance_uid'),
                patient_id=final_metadata.get('patient_id', ''),
                patient_name=final_metadata.get('patient_name', ''),
                patient_birth_date=final_metadata.get('patient_birth_date'),
                patient_gender=final_metadata.get('patient_gender', ''),
                study_date=final_metadata.get('study_date'),
                study_time=final_metadata.get('study_time'),
                study_description=final_metadata.get('study_description', ''),
                modality=final_metadata.get('modality', ''),
                body_part=final_metadata.get('body_part', ''),
                series_number=final_metadata.get('series_number'),
                instance_number=final_metadata.get('instance_number'),
                file_path=synchronized_file_path,
                file_size=os.path.getsize(synchronized_file_path),
                file_hash=hashlib.sha256(open(synchronized_file_path, 'rb').read()).hexdigest(),
                storage_tier='hot',
                rows=final_metadata.get('rows'),
                columns=final_metadata.get('columns'),
                bits_allocated=final_metadata.get('bits_allocated'),
                bits_stored=final_metadata.get('bits_stored'),
                number_of_frames=final_metadata.get('number_of_frames', 1),
                transfer_syntax_uid=final_metadata.get('transfer_syntax_uid'),
                dicom_metadata={
                    "category": category,
                    "filename": file.filename,
                    "order_id": str(order_id),
                    "description": description,
                    "uploaded_at": datetime.now().isoformat(),
                    "tag_synchronized": sync_tags,
                    "original_file_path": original_file_path if preserve_original else None,
                    "audit_log_id": str(audit_log.id) if audit_log else None
                }
            )

            db.add(dicom_file)
            db.flush()
            logger.info(f"✓ New DICOM file record created: {dicom_file.id}")

        # Update audit log with dicom_file_id
        if audit_log:
            audit_log.dicom_file_id = dicom_file.id
            db.flush()

        logger.info(f"✓ DICOM file record created: {dicom_file.id}")

        # STEP 6: Create DICOM hierarchy (Study → Series)
        try:
            ds = pydicom.dcmread(synchronized_file_path)
            hierarchy_result = store_dicom_hierarchy(db, ds)
            if hierarchy_result.get('success'):
                logger.info(f"✓ Hierarchy created: Study {hierarchy_result.get('study_uid')}")
        except Exception as hierarchy_error:
            logger.warning(f"Hierarchy creation failed: {hierarchy_error}")

        # STEP 7: Commit transaction
        db.commit()
        logger.info("✓ Transaction committed successfully")

        # STEP 8: Clean up temp file if it's different from final files
        if temp_file_path and temp_file_path != original_file_path and temp_file_path != synchronized_file_path:
            if os.path.exists(temp_file_path):
                try:
                    os.remove(temp_file_path)
                    logger.info(f"✓ Temp file cleaned up: {temp_file_path}")
                except Exception as cleanup_error:
                    logger.warning(f"Could not remove temp file: {cleanup_error}")

        # Return success response
        return {
            "status": "success",
            "message": "DICOM file uploaded and synchronized successfully",
            "dicom_file": {
                "id": str(dicom_file.id),
                "sop_instance_uid": dicom_file.sop_instance_uid,
                "study_instance_uid": dicom_file.study_id,
                "series_instance_uid": dicom_file.series_id,
                "patient_id": dicom_file.patient_id,
                "patient_name": dicom_file.patient_name,
                "modality": dicom_file.modality,
                "file_size": dicom_file.file_size,
                "file_path": dicom_file.file_path,
                "created_at": dicom_file.created_at.isoformat()
            },
            "tag_sync": tag_sync_result,
            "worklist": {
                "id": str(worklist_item.id),
                "patient_name": worklist_item.patient_name,
                "patient_id": worklist_item.patient_id,
                "accession_number": worklist_item.accession_number
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload with sync failed: {str(e)}", exc_info=True)
        db.rollback()

        # Clean up temp file on error
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except:
                pass

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Upload failed: {str(e)}"
        )


@router.get("/tag-audit/{audit_log_id}")
async def get_tag_audit_log(
    audit_log_id: str,
    db: Session = Depends(get_db)
):
    """
    Get tag synchronization audit log details

    Args:
        audit_log_id: UUID of audit log

    Returns:
        Audit log details with tag changes
    """
    try:
        audit_log = db.query(DicomTagAuditLog).filter(
            DicomTagAuditLog.id == UUID(audit_log_id)
        ).first()

        if not audit_log:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Audit log not found: {audit_log_id}"
            )

        return {
            "status": "success",
            "audit_log": audit_log.to_dict(),
            "changes_summary": audit_log.get_changes_summary()
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get audit log: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/tag-audit")
async def list_tag_audit_logs(
    patient_id: Optional[str] = None,
    order_id: Optional[str] = None,
    sync_status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    """
    List tag synchronization audit logs

    Query Parameters:
        patient_id: Filter by patient ID
        order_id: Filter by order ID
        sync_status: Filter by sync status (SUCCESS, FAILED, PENDING)
        limit: Max results (default: 50)
        offset: Offset for pagination (default: 0)

    Returns:
        List of audit logs
    """
    try:
        query = db.query(DicomTagAuditLog)

        if patient_id:
            query = query.filter(DicomTagAuditLog.patient_id == patient_id)
        if order_id:
            query = query.filter(DicomTagAuditLog.order_id == UUID(order_id))
        if sync_status:
            query = query.filter(DicomTagAuditLog.sync_status == sync_status)

        total = query.count()
        logs = query.order_by(DicomTagAuditLog.synchronized_at.desc()).offset(offset).limit(limit).all()

        return {
            "status": "success",
            "total": total,
            "limit": limit,
            "offset": offset,
            "data": [log.to_dict() for log in logs]
        }

    except Exception as e:
        logger.error(f"Failed to list audit logs: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
