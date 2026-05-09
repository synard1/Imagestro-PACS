"""
ML Integration Router - Proxies requests to pacs-ml-service
"""
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, status
from fastapi.responses import JSONResponse
import httpx
from typing import Optional, Dict, Any
import logging
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ml", tags=["ml"])

class MLResponse(BaseModel):
    study_uid: str
    predictions: list
    quality_score: float
    status: str

ML_SERVICE_URL = "http://pacs-ml-service:8004/api"

@router.get("/health")
async def ml_health():
    """Check ML service health"""
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(f"{ML_SERVICE_URL}/health")
            resp.raise_for_status()
            return {"status": "healthy", "ml_service": resp.json()}
        except Exception as e:
            logger.error(f"ML health check failed: {e}")
            raise HTTPException(status_code=503, detail="ML service unavailable")

@router.get("/models")
async def list_ml_models():
    """List available ML models"""
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{ML_SERVICE_URL}/ml/models")
        resp.raise_for_status()
        return resp.json()

@router.post("/analyze", response_model=MLResponse)
async def analyze_study(
    file: UploadFile = File(..., media_type="application/dicom"),
    model_version: Optional[str] = "v0.1-dummy"
):
    """
    Analyze DICOM instance with ML service
    """
    async with httpx.AsyncClient() as client:
        try:
            contents = await file.read()
            resp = await client.post(
                f"{ML_SERVICE_URL}/ml/analyze",
                files={"file": ("file.dcm", contents, "application/dicom")},
                params={"model_version": model_version}
            )
            resp.raise_for_status()
            result = resp.json()
            
            # Enrich with PACS context if needed
            result["integrated_by"] = "pacs-service"
            result["timestamp"] = "2025-12-02T01:00:00Z"
            
            return result
        except httpx.HTTPStatusError as e:
            logger.error(f"ML analysis HTTP error: {e}")
            raise HTTPException(status_code=e.response.status_code, detail=e.response.text)
        except Exception as e:
            logger.error(f"ML analysis failed: {e}")
            raise HTTPException(status_code=500, detail="ML analysis failed")
