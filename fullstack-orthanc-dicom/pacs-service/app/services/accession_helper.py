import httpx
import os
import logging
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

# Accession API configuration
ACCESSION_API_URL = os.getenv("ACCESSION_API_URL", "http://accession-api:8180")

async def get_next_accession(modality: str, patient_data: Dict[str, Any]) -> Optional[str]:
    """
    Get next accession number from Accession API for a given patient and modality.

    Args:
        modality: DICOM Modality (CT, MR, etc.)
        patient_data: Dictionary containing patient details

    Returns:
        Generated accession number or None if failed
    """
    try:
        # Standardize gender for Accession API
        gender_input = patient_data.get("patient_sex") or patient_data.get("gender") or patient_data.get("sex")
        gender_api = "unknown"
        if gender_input:
            g = str(gender_input).upper()
            if g in ['M', 'L', 'MALE', 'PRIA']:
                gender_api = "male"
            elif g in ['F', 'P', 'FEMALE', 'WANITA']:
                gender_api = "female"
            elif g in ['OTHER', 'O']:
                gender_api = "other"

        # Standardize payload for Accession API
        # It expects fields in its /accession/create endpoint
        payload = {
            "modality": modality,
            "patient_national_id": patient_data.get("patient_national_id") or patient_data.get("patient_id") or patient_data.get("id"),
            "patient_name": patient_data.get("patient_name") or patient_data.get("name"),
            "gender": gender_api,
            "birth_date": patient_data.get("patient_birthdate") or patient_data.get("birth_date") or patient_data.get("birthDate"),
            "medical_record_number": patient_data.get("no_rkm_medis") or patient_data.get("medical_record_number") or patient_data.get("mrn"),
            "registration_number": patient_data.get("no_rawat") or patient_data.get("registration_number") or patient_data.get("visit_id"),
            "procedure_code": patient_data.get("kd_jenis_prw") or patient_data.get("procedure_code"),
            "procedure_name": patient_data.get("nm_perawatan") or patient_data.get("procedure_name"),
            "scheduled_at": patient_data.get("tgl_permintaan") or patient_data.get("scheduled_at")
        }
        
        # Remove None values
        payload = {k: v for k, v in payload.items() if v is not None}
        
        logger.info(f"Requesting accession number from {ACCESSION_API_URL} for patient {payload.get('patient_name')}")
        
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{ACCESSION_API_URL}/accession/create",
                json=payload,
                timeout=10.0
            )
            
            if resp.status_code == 201:
                data = resp.json()
                accession_number = data.get("accession_number")
                logger.info(f"Generated accession number: {accession_number}")
                return accession_number
            else:
                logger.error(f"Accession API error: {resp.status_code} - {resp.text}")
                return None
                
    except Exception as e:
        logger.error(f"Failed to get accession number from API: {str(e)}")
        # Fallback to local generation if API is down might be dangerous for SATUSEHAT uniqueness
        return None
