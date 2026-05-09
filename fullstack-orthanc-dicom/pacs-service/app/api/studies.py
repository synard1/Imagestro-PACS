"""
Studies API Endpoints
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
import logging
import os
import httpx
from datetime import datetime
from uuid import UUID

from app.config import settings
from app.database import get_db
from app.models.dicom_file import DicomFile  # NEW: For /files endpoint
from sqlalchemy import func
from app.models.worklist import WorklistItem
from app.middleware.rbac import require_permission
from app.schemas.study import StudyResponse, StudyList
from app.schemas.common import PaginatedResponse
from app.models.study import Study
from app.models.series import Series
from app.models.instance import Instance
from app.schemas.series import SeriesResponse
from app.services.dicom_storage_service_v2 import get_dicom_storage_service_v2
from app.utils.audit_helper import AuditHelper

logger = logging.getLogger(__name__)

async def _delete_from_orthanc(orthanc_id: str):
    """Helper to delete a study from Orthanc"""
    if not orthanc_id:
        return False
    
    url = f"{settings.orthanc_url}/studies/{orthanc_id}"
    auth = (settings.orthanc_username, settings.orthanc_password)
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.delete(url, auth=auth, timeout=10.0)
            if response.status_code == 200:
                logger.info(f"Successfully deleted study {orthanc_id} from Orthanc")
                return True
            else:
                logger.warning(f"Failed to delete study {orthanc_id} from Orthanc: {response.status_code}")
                return False
    except Exception as e:
        logger.error(f"Error calling Orthanc API to delete study {orthanc_id}: {e}")
        return False

router = APIRouter(prefix="/api/studies", tags=["studies"])


@router.get("", response_model=PaginatedResponse[StudyList])
async def list_studies(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(25, ge=1, le=100, description="Page size"),
    patient_name: Optional[str] = Query(None, description="Filter by patient name"),
    accession_number: Optional[str] = Query(None, description="Filter by accession number"),
    modality: Optional[str] = Query(None, description="Filter by modality"),
    study_date_from: Optional[str] = Query(None, description="Filter by study date from (YYYY-MM-DD)"),
    study_date_to: Optional[str] = Query(None, description="Filter by study date to (YYYY-MM-DD)"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("study:view"))
):
    """
    List studies with pagination and filtering
    Requires: SUPERADMIN or DEVELOPER role
    """
    logger.info(f"List studies requested")
    
    # Build query - include soft-delete filter
    query = db.query(Study).filter(Study.deleted_at.is_(None))
    
    # Apply filters (safe)
    if patient_name:
        query = query.filter(Study.patient_name.ilike(f"%{patient_name}%"))
    if accession_number:
        query = query.filter(Study.accession_number == accession_number)
    if modality:
        query = query.filter(Study.modality == modality)
    if study_date_from:
        query = query.filter(Study.study_date >= study_date_from)
    if study_date_to:
        query = query.filter(Study.study_date <= study_date_to)
    
    # Get total count
    total = query.count()
    
    # Apply pagination - SAFE order_by (created_at always exists)
    offset = (page - 1) * page_size
    studies = query.order_by(Study.created_at.desc()).offset(offset).limit(page_size).all()
    
    # Calculate total pages
    total_pages = (total + page_size - 1) // page_size
    
    # SAFE serialization - use model_dump (exclude missing fields)
    study_list_data = []
    for study in studies:
        try:
            # Get first instance for thumbnail
            thumbnail_series_uid = None
            thumbnail_instance_uid = None
            
            first_series = db.query(Series.series_instance_uid).filter(
                Series.study_instance_uid == study.study_instance_uid
            ).order_by(Series.series_number.asc()).first()
            
            if first_series:
                thumbnail_series_uid = first_series[0]
                first_instance = db.query(Instance.sop_instance_uid).filter(
                    Instance.series_instance_uid == thumbnail_series_uid
                ).order_by(Instance.instance_number.asc()).first()
                
                if first_instance:
                    thumbnail_instance_uid = first_instance[0]

            study_data = StudyList.model_validate(study).model_dump(exclude_unset=True)
            study_data['thumbnail_series_uid'] = thumbnail_series_uid
            study_data['thumbnail_instance_uid'] = thumbnail_instance_uid
            study_list_data.append(study_data)
        except Exception as e:
            logger.error(f"Serialization error for study {study.study_instance_uid}: {e}")
            # Fallback to basic dict
            study_list_data.append({
                "study_instance_uid": getattr(study, 'study_instance_uid', ''),
                "patient_name": getattr(study, 'patient_name', ''),
                "modality": getattr(study, 'modality', ''),
                "study_date": getattr(study, 'study_date', None),
                "created_at": getattr(study, 'created_at', None),
                "thumbnail_series_uid": None,
                "thumbnail_instance_uid": None
            })
    
    return PaginatedResponse(
        data=study_list_data,
        count=len(studies),
        page=page,
        page_size=page_size,
        total=total,
        total_pages=total_pages
    )


@router.get("/{study_uid}", response_model=StudyResponse)
async def get_study(
    study_uid: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("study:view"))
):
    """
    Get study details by UID
    Requires: SUPERADMIN or DEVELOPER role
    """
    logger.info(f"Get study {study_uid} requested")

    study = db.query(Study).filter(
        Study.study_instance_uid == study_uid
        # Study.deleted_at.is_(None)  # SAFE: removed
    ).first()

    if not study:
        raise HTTPException(
            status_code=404,
            detail={
                "status": "error",
                "error_code": "STUDY_NOT_FOUND",
                "message": f"Study with UID {study_uid} not found"
            }
        )

    # DLM Tracking Update
    try:
        study.view_count = (study.view_count or 0) + 1
        study.last_accessed_at = func.now()
        db.commit()
    except Exception as e:
        db.rollback()
        logger.warning(f"Failed to update DLM tracking for study {study_uid}: {e}")

    # Enrich missing linkage from worklist/order when available
    try:
        updated = False

        # Try to backfill order_id from worklist (study UID first, then accession number)
        if not study.order_id:
            worklist = db.query(WorklistItem).filter(
                WorklistItem.study_instance_uid == study_uid
            ).first()

            if not worklist and study.accession_number:
                worklist = db.query(WorklistItem).filter(
                    WorklistItem.accession_number == study.accession_number
                ).first()

            if worklist and worklist.order_id:
                study.order_id = worklist.order_id
                updated = True

        # Pull patient/order data when order_id is present
        if study.order_id:
            order_row = db.execute(
                text("""
                    SELECT id, medical_record_number, patient_id, patient_name, birth_date, gender
                    FROM orders
                    WHERE id = :order_id
                """),
                {"order_id": str(study.order_id)}
            ).fetchone()

            if order_row:
                if not study.patient_medical_record_number and order_row.medical_record_number:
                    study.patient_medical_record_number = order_row.medical_record_number
                    updated = True

                if not study.patient_name and order_row.patient_name:
                    study.patient_name = order_row.patient_name
                    updated = True

                if not study.patient_birth_date and order_row.birth_date:
                    study.patient_birth_date = order_row.birth_date
                    updated = True

                if not study.patient_gender and order_row.gender:
                    gender_map = {
                        "male": "M",
                        "female": "F",
                        "other": "O",
                        "unknown": "U"
                    }
                    gender_value = gender_map.get(
                        str(order_row.gender).lower(),
                        str(order_row.gender)[:1].upper()
                    )
                    study.patient_gender = gender_value
                    updated = True

                if not study.patient_id and order_row.patient_id:
                    try:
                        study.patient_id = UUID(str(order_row.patient_id))
                        updated = True
                    except (ValueError, TypeError):
                        logger.warning(
                            f"Order {order_row.id} patient_id '{order_row.patient_id}' is not a valid UUID; skipping patient_id link"
                        )

        if updated:
            db.commit()
            db.refresh(study)
            logger.info(f"Backfilled study {study_uid} with order/patient details")
    except Exception as enrich_error:
        logger.warning(f"Failed to enrich study {study_uid} from worklist/order: {enrich_error}")

    # AUDIT LOG: Study accessed (PHI tracking for HIPAA compliance)
    # MOVED HERE: Now we have full enriched data including patient_name and accession_number
    try:
        await AuditHelper.log_study_accessed(
            db=db,
            study_uid=study_uid,
            request=request,
            details={
                'accession_number': study.accession_number,
                'modality': study.modality,
                'study_date': study.study_date.isoformat() if study.study_date else None,
                'patient_name': study.patient_name
            },
            patient_id=str(study.patient_id) if study.patient_id else None
        )
    except Exception as audit_error:
        logger.warning(f"Audit log failed for study access: {audit_error}")

    return StudyResponse.model_validate(study)  # v2: from_orm → model_validate


@router.get("/{study_uid}/series", response_model=List[SeriesResponse])
async def get_study_series(
    study_uid: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("study:view"))
):
    """
    Get all series for a specific study
    Requires: SUPERADMIN or DEVELOPER role
    """
    logger.info(f"Get series for study {study_uid} requested")

    # First verify the study exists
    study = db.query(Study).filter(
        Study.study_instance_uid == study_uid
    ).first()

    if not study:
        raise HTTPException(
            status_code=404,
            detail={
                "status": "error",
                "error_code": "STUDY_NOT_FOUND",
                "message": f"Study with UID {study_uid} not found"
            }
        )

    # Get all series for this study
    series_list = db.query(Series).filter(
        Series.study_instance_uid == study_uid
    ).order_by(Series.series_number).all()

    logger.info(f"Found {len(series_list)} series for study {study_uid}")

    # Compute accurate instance counts and storage sizes from dicom_files
    for series_obj in series_list:
        instance_count = db.query(func.count(DicomFile.id)).filter(
            DicomFile.series_id == series_obj.series_instance_uid
        ).scalar()
        series_obj.number_of_instances = instance_count

        storage_size = db.query(func.coalesce(func.sum(DicomFile.file_size), 0)).filter(
            DicomFile.series_id == series_obj.series_instance_uid
        ).scalar()
        series_obj.storage_size = storage_size

    return [SeriesResponse.model_validate(series) for series in series_list]


@router.get("/{study_uid}/files")
async def get_study_files(
    study_uid: str,
    db: Session = Depends(get_db)
):
    """
    Get physical files for study (safe)
    """
    logger.info(f"Get files for study {study_uid}")
    
    files = db.query(DicomFile).filter(
        DicomFile.study_id == study_uid
    ).order_by(DicomFile.created_at.desc()).all()
    
    file_list = []
    for f in files:
        try:
            file_data = {
                "id": str(f.id),
                "file_path": getattr(f, 'file_path', ''),
                "filename": f.dicom_metadata.get("filename") if hasattr(f, 'dicom_metadata') and f.dicom_metadata else None,
                "file_size": getattr(f, 'file_size', 0),
                "sop_instance_uid": getattr(f, 'sop_instance_uid', ''),
                "created_at": f.created_at.isoformat() if f.created_at else None,
                "exists": os.path.exists(f.file_path) if hasattr(f, 'file_path') and f.file_path else False
            }
            file_list.append(file_data)
        except Exception as e:
            logger.error(f"File serialization error: {e}")
            file_list.append({"error": str(e), "study_uid": study_uid})
    
    return file_list


@router.delete("/{study_uid}")
async def delete_study(
    study_uid: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("study:delete"))
):
    """
    Soft delete a study and its files, and remove from Orthanc
    Requires: SUPERADMIN or DEVELOPER role
    """
    logger.info(f"Delete study {study_uid} requested by {current_user.get('username')}")

    # 1. Find the study to get Orthanc ID
    study = db.query(Study).filter(Study.study_instance_uid == study_uid).first()
    if not study:
        raise HTTPException(status_code=404, detail="Study not found")

    # 2. Delete from Orthanc if exists
    if study.orthanc_id:
        await _delete_from_orthanc(study.orthanc_id)

    # 3. Archive files in application storage
    storage_service = get_dicom_storage_service_v2(db)
    archive_date = datetime.utcnow()

    dicom_files = db.query(DicomFile).filter(
        DicomFile.study_id == study_uid
    ).all()

    for dicom_file in dicom_files:
        try:
            await storage_service.archive_dicom_file(
                dicom_file,
                archive_date,
                reason="study_deleted"
            )
        except Exception as e:
            logger.error(f"Failed to archive file {dicom_file.sop_instance_uid}: {e}")

    # 4. Mark study as deleted in DB
    study.deleted_at = datetime.utcnow()
    db.commit()
    
    # 5. AUDIT LOG: Study deleted
    try:
        await AuditHelper.log_study_deleted(
            db=db,
            study_uid=study_uid,
            request=request,
            details={
                'accession_number': study.accession_number,
                'patient_name': study.patient_name,
                'reason': 'User requested deletion'
            },
            patient_id=str(study.patient_id) if study.patient_id else None
        )
    except Exception as audit_error:
        logger.warning(f"Audit log failed for study deletion: {audit_error}")

    logger.info(f"Study {study_uid} deleted successfully")
    
    return {
        "status": "success",
        "message": "Study deleted successfully",
        "study_uid": study_uid
    }


@router.post("/{study_uid}/archive")
async def archive_study(
    study_uid: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_permission("study:archive"))
):
    """
    Mark a study as archived
    Requires: SUPERADMIN or DEVELOPER role
    """
    logger.info(f"Archive study {study_uid} requested by {current_user.get('username')}")

    study = db.query(Study).filter(
        Study.study_instance_uid == study_uid,
        Study.deleted_at.is_(None)
    ).first()

    if not study:
        raise HTTPException(status_code=404, detail="Study not found or already deleted")

    study.archived_at = datetime.utcnow()
    db.commit()
    
    # AUDIT LOG: Study archived
    try:
        await AuditHelper.log_study_archived(
            db=db,
            study_uid=study_uid,
            request=request,
            details={
                'accession_number': study.accession_number,
                'patient_name': study.patient_name
            },
            patient_id=str(study.patient_id) if study.patient_id else None
        )
    except Exception as audit_error:
        logger.warning(f"Audit log failed for study archiving: {audit_error}")

    logger.info(f"Study {study_uid} archived successfully")
    
    return {
        "status": "success",
        "message": "Study archived successfully",
        "study_uid": study_uid
    }
