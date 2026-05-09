"""
Measurements API
Endpoints for saving and retrieving DICOM viewer measurements
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import logging

from app.database import get_db
from app.models.measurement import Measurement
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/measurements", tags=["measurements"])


# ============================================================================
# Pydantic Schemas
# ============================================================================

class MeasurementCreate(BaseModel):
    """Schema for creating a measurement"""
    study_instance_uid: str = Field(..., description="Study UID")
    series_instance_uid: Optional[str] = Field(None, description="Series UID")
    sop_instance_uid: Optional[str] = Field(None, description="SOP Instance UID")
    annotation_uid: str = Field(..., description="Cornerstone annotation UID")
    tool_name: str = Field(..., description="Tool name (Length, Angle, etc.)")
    measurement_data: dict = Field(..., description="Full annotation data")
    value: Optional[float] = Field(None, description="Numeric value")
    unit: Optional[str] = Field(None, description="Unit (mm, degrees, etc.)")
    formatted_value: Optional[str] = Field(None, description="Formatted value")
    viewport_id: Optional[str] = Field(None, description="Viewport ID")
    image_index: Optional[int] = Field(None, description="Image index")
    created_by: Optional[str] = Field(None, description="User who created")

    class Config:
        json_schema_extra = {
            "example": {
                "study_instance_uid": "1.2.840.113619.2.55.1.1762295501.699.1248097254.735",
                "series_instance_uid": "1.2.840.113619.2.55.1.1762295501.699.1248097254.736",
                "sop_instance_uid": "1.2.840.113619.2.55.1.1762295501.699.1248097254.737",
                "annotation_uid": "abc123-def456-ghi789",
                "tool_name": "Length",
                "measurement_data": {"handles": {"points": [[10, 20], [30, 40]]}},
                "value": 42.5,
                "unit": "mm",
                "formatted_value": "42.5 mm",
                "viewport_id": "viewport-0",
                "image_index": 0,
                "created_by": "Dr. John Doe"
            }
        }


class MeasurementResponse(BaseModel):
    """Schema for measurement response"""
    id: str
    study_instance_uid: str
    series_instance_uid: Optional[str]
    sop_instance_uid: Optional[str]
    annotation_uid: str
    tool_name: str
    measurement_data: dict
    value: Optional[float]
    unit: Optional[str]
    formatted_value: Optional[str]
    viewport_id: Optional[str]
    image_index: Optional[int]
    created_by: Optional[str]
    created_at: Optional[str]
    updated_at: Optional[str]

    class Config:
        from_attributes = True


class MeasurementBulkCreate(BaseModel):
    """Schema for bulk creating measurements"""
    measurements: List[MeasurementCreate] = Field(..., description="List of measurements")


# ============================================================================
# API Endpoints
# ============================================================================

@router.post("/", response_model=MeasurementResponse, status_code=status.HTTP_201_CREATED)
async def create_measurement(
    measurement: MeasurementCreate,
    db: Session = Depends(get_db)
):
    """
    Create a new measurement
    """
    try:
        # Check if annotation_uid already exists
        existing = db.query(Measurement).filter(
            Measurement.annotation_uid == measurement.annotation_uid
        ).first()

        if existing:
            logger.warning(f"Measurement with annotation_uid {measurement.annotation_uid} already exists")
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Measurement with annotation UID {measurement.annotation_uid} already exists"
            )

        # Create new measurement
        db_measurement = Measurement(**measurement.model_dump())
        db.add(db_measurement)
        db.commit()
        db.refresh(db_measurement)

        logger.info(f"Created measurement {db_measurement.id} for study {measurement.study_instance_uid}")
        return db_measurement.to_dict()

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating measurement: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create measurement: {str(e)}"
        )


@router.post("/bulk", status_code=status.HTTP_201_CREATED)
async def create_measurements_bulk(
    bulk: MeasurementBulkCreate,
    db: Session = Depends(get_db)
):
    """
    Create multiple measurements at once
    """
    try:
        created_count = 0
        skipped_count = 0
        errors = []

        for measurement in bulk.measurements:
            try:
                # Check if annotation_uid already exists
                existing = db.query(Measurement).filter(
                    Measurement.annotation_uid == measurement.annotation_uid
                ).first()

                if existing:
                    logger.warning(f"Skipping duplicate annotation_uid: {measurement.annotation_uid}")
                    skipped_count += 1
                    continue

                # Create new measurement
                db_measurement = Measurement(**measurement.model_dump())
                db.add(db_measurement)
                created_count += 1

            except Exception as e:
                logger.error(f"Error creating measurement {measurement.annotation_uid}: {e}")
                errors.append({
                    "annotation_uid": measurement.annotation_uid,
                    "error": str(e)
                })

        db.commit()
        logger.info(f"Bulk created {created_count} measurements, skipped {skipped_count}")

        return {
            "created": created_count,
            "skipped": skipped_count,
            "errors": errors,
            "total": len(bulk.measurements)
        }

    except Exception as e:
        db.rollback()
        logger.error(f"Error in bulk create: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to bulk create measurements: {str(e)}"
        )


@router.get("/study/{study_uid}", response_model=List[MeasurementResponse])
async def get_measurements_by_study(
    study_uid: str,
    db: Session = Depends(get_db)
):
    """
    Get all measurements for a study
    """
    try:
        measurements = db.query(Measurement).filter(
            Measurement.study_instance_uid == study_uid,
            Measurement.deleted_at.is_(None)
        ).order_by(Measurement.created_at.desc()).all()

        logger.info(f"Found {len(measurements)} measurements for study {study_uid}")
        return [m.to_dict() for m in measurements]

    except Exception as e:
        logger.error(f"Error fetching measurements: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch measurements: {str(e)}"
        )


@router.delete("/{measurement_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_measurement(
    measurement_id: str,
    db: Session = Depends(get_db)
):
    """
    Delete a measurement (soft delete)
    """
    try:
        measurement = db.query(Measurement).filter(
            Measurement.id == measurement_id
        ).first()

        if not measurement:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Measurement {measurement_id} not found"
            )

        # Soft delete
        measurement.deleted_at = datetime.utcnow()
        db.commit()

        logger.info(f"Deleted measurement {measurement_id}")
        return None

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting measurement: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete measurement: {str(e)}"
        )


@router.delete("/study/{study_uid}", status_code=status.HTTP_200_OK)
async def delete_measurements_by_study(
    study_uid: str,
    db: Session = Depends(get_db)
):
    """
    Delete all measurements for a study
    """
    try:
        measurements = db.query(Measurement).filter(
            Measurement.study_instance_uid == study_uid,
            Measurement.deleted_at.is_(None)
        ).all()

        count = len(measurements)
        for m in measurements:
            m.deleted_at = datetime.utcnow()

        db.commit()
        logger.info(f"Deleted {count} measurements for study {study_uid}")

        return {"deleted": count}

    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting measurements: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete measurements: {str(e)}"
        )
