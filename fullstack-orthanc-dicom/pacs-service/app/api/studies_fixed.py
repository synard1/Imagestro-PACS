"""
Studies API - FIXED VERSION
Direct SQL queries - NO model dependencies
"""
import logging
from sqlalchemy import text
from sqlalchemy.orm import Session
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional

from app.database import get_db
from app.middleware.rbac import check_pacs_access
from app.utils.logger import get_logger

logger = get_logger(__name__)
router = APIRouter(prefix="/api/studies", tags=["studies"])

@router.get("", summary="List studies")
async def list_studies(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    patient_name: Optional[str] = Query(None),
    modality: Optional[str] = Query(None),
    order_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(check_pacs_access)
):
    offset = (page - 1) * page_size
    params = {"offset": offset, "limit": page_size}
    where_clauses = []
    
    if patient_name:
        where_clauses.append("patient_name ILIKE :patient_name")
        params["patient_name"] = f"%{patient_name}%"
    if modality:
        where_clauses.append("modality = :modality")
        params["modality"] = modality
    if order_id:
        where_clauses.append("order_id = :order_id")
        params["order_id"] = order_id
    
    where_sql = "WHERE deleted_at IS NULL " + " AND ".join(where_clauses) if where_clauses else "WHERE deleted_at IS NULL"
    
    count_sql = f"SELECT COUNT(*) FROM pacs_studies {where_sql}"
    studies_sql = f"""
        SELECT study_instance_uid, study_date, study_description, accession_number, 
               patient_name, modality, number_of_series, number_of_instances, created_at
        FROM pacs_studies {where_sql} 
        ORDER BY created_at DESC LIMIT :limit OFFSET :offset
    """
    
    total = db.execute(text(count_sql), params).scalar()
    studies = db.execute(text(studies_sql), params).fetchall()
    
    return {
        "status": "success",
        "data": [dict(row._mapping) for row in studies],
        "count": len(studies),
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": (total + page_size - 1) // page_size
    }

@router.get("/{study_uid}", summary="Get study details")
async def get_study(
    study_uid: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(check_pacs_access)
):
    """Get study details by UID - FIXED"""
    logger.info(f"Get study {study_uid} requested by {current_user.get('username', 'anonymous')}")
    
    study = db.execute(text("""
        SELECT study_instance_uid, study_id, study_date, study_time, study_description,
               accession_number, patient_id, order_id, patient_name, patient_birth_date,
               patient_gender, referring_physician, modality, number_of_series,
               number_of_instances, storage_size, orthanc_id, created_at, updated_at
        FROM pacs_studies 
        WHERE study_instance_uid = :study_uid AND deleted_at IS NULL
    """), {"study_uid": study_uid}).fetchone()
    
    if not study:
        raise HTTPException(
            status_code=404,
            detail=f"Study with UID {study_uid} not found"
        )
    
    return {
        "status": "success",
        "data": dict(study._mapping)
    }
