"""
DICOM Hierarchy Service - EMERGENCY FIX
Handles SQLAlchemy 2.0 text() requirements and missing FK handling
"""
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
import logging

logger = logging.getLogger(__name__)

def create_or_get_study(db: Session, study_uid: str, order_id: str = None, patient_id: str = None):
    """Create or get study with proper SQLAlchemy text() wrappers"""
    try:
        # Check if study exists
        result = db.execute(
            text("SELECT study_instance_uid FROM pacs_studies WHERE study_instance_uid = :study_uid"),
            {"study_uid": study_uid}
        ).fetchone()
        
        if result:
            logger.info(f"✅ Study exists: {study_uid}")
            return result[0]
        
        # Create new study with text() wrapper
        db.execute(text("""
            INSERT INTO pacs_studies (study_instance_uid, order_id, patient_id, patient_name, created_at)
            VALUES (:study_uid, :order_id, :patient_id, :patient_name, NOW())
            ON CONFLICT (study_instance_uid) DO NOTHING
        """), {
            "study_uid": study_uid,
            "order_id": order_id,
            "patient_id": patient_id,
            "patient_name": "Unknown Patient"
        })
        db.commit()
        logger.info(f"✅ Study created: {study_uid}")
        return study_uid
        
    except SQLAlchemyError as e:
        logger.error(f"❌ Study creation failed: {e}")
        db.rollback()
        raise

def store_dicom_hierarchy(db: Session, ds, order_id: str = None):
    """Store DICOM hierarchy with error handling"""
    try:
        study_uid = ds.StudyInstanceUID
        patient_id = str(ds.get('PatientID', 'unknown'))
        
        logger.info(f"Creating hierarchy for Study: {study_uid}")
        create_or_get_study(db, study_uid, order_id, patient_id)
        return True
        
    except Exception as e:
        logger.error(f"❌ Hierarchy failed: {e}")
        db.rollback()
        return False
