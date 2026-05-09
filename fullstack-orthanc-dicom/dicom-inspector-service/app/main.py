import os
import uuid
import time
import shutil
import asyncio
import structlog
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.services.dicom_service import DicomService

# Structured Logging
structlog.configure(
    processors=[
        structlog.processors.JSONRenderer()
    ]
)
logger = structlog.get_logger()

app = FastAPI(title="DICOM Inspector Service", version="1.0.0")

STORAGE_DIR = "/tmp/dicom-inspector"
CLEANUP_INTERVAL_SECONDS = 60
FILE_EXPIRY_MINUTES = 10

# In-memory storage (no database)
# Key: inspection_id, Value: inspection_data
inspections: Dict[str, Any] = {}

dicom_service = DicomService(storage_dir=STORAGE_DIR)

class InspectionSummary(BaseModel):
    id: str
    filename: str
    timestamp: str
    status: str

@app.on_event("startup")
async def startup_event():
    """Start the background cleanup task on startup."""
    asyncio.create_task(cleanup_task())
    logger.info("service_started", storage_dir=STORAGE_DIR, cleanup_interval=CLEANUP_INTERVAL_SECONDS)

async def cleanup_task():
    """Background task to delete files older than FILE_EXPIRY_MINUTES."""
    while True:
        try:
            now = time.time()
            expiry_threshold = now - (FILE_EXPIRY_MINUTES * 60)
            
            count = 0
            if os.path.exists(STORAGE_DIR):
                for filename in os.listdir(STORAGE_DIR):
                    file_path = os.path.join(STORAGE_DIR, filename)
                    if os.path.isfile(file_path):
                        if os.path.getmtime(file_path) < expiry_threshold:
                            os.remove(file_path)
                            count += 1
            
            if count > 0:
                logger.info("cleanup_completed", deleted_files=count)
        except Exception as e:
            logger.error("cleanup_failed", error=str(e))
        
        await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)

@app.post("/api/v1/inspect", response_model=Dict[str, Any])
async def inspect_dicom(file: UploadFile = File(...)):
    """
    Upload a DICOM file for inspection.
    """
    inspection_id = str(uuid.uuid4())
    temp_path = os.path.join(STORAGE_DIR, f"{inspection_id}.dcm")
    
    logger.info("inspection_started", inspection_id=inspection_id, filename=file.filename)
    
    try:
        # Save uploaded file
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Process DICOM
        result = dicom_service.inspect_file(temp_path)
        
        # Store result in memory
        inspection_data = {
            "id": inspection_id,
            "filename": file.filename,
            "status": "completed",
            "data": result,
            "timestamp": datetime.utcnow().isoformat()
        }
        inspections[inspection_id] = inspection_data
        
        logger.info("inspection_completed", inspection_id=inspection_id)
        return inspection_data
        
    except ValueError as ve:
        logger.warn("inspection_validation_error", inspection_id=inspection_id, error=str(ve))
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error("inspection_failed", inspection_id=inspection_id, error=str(e))
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/api/v1/inspections", response_model=List[InspectionSummary])
async def list_inspections():
    """
    List all recent inspections.
    """
    return [
        InspectionSummary(
            id=v["id"],
            filename=v["filename"],
            timestamp=v["timestamp"],
            status=v["status"]
        ) for v in inspections.values()
    ]

@app.get("/api/v1/inspections/{id}", response_model=Dict[str, Any])
async def get_inspection(id: str):
    """
    Get detailed results of a specific inspection.
    """
    if id not in inspections:
        raise HTTPException(status_code=404, detail="Inspection not found")
    return inspections[id]

@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
