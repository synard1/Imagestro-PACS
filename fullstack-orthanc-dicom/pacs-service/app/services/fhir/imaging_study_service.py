import logging
from typing import Dict, Any, Optional, List
from datetime import datetime
import httpx
import os
from app.models.study import Study
from app.models.dicom_file import DicomFile
from app.database import SessionLocal

logger = logging.getLogger(__name__)

SATUSEHAT_GATEWAY_URL = os.getenv("SATUSEHAT_GATEWAY_URL", "http://satusehat-integrator:8081")

class ImagingStudyService:
    @staticmethod
    def create_fhir_resource(study: Study, instances: List[DicomFile]) -> Dict[str, Any]:
        """
        Create FHIR ImagingStudy resource from Study and its instances.
        """
        # Base ImagingStudy structure
        resource = {
            "resourceType": "ImagingStudy",
            "status": "available",
            "subject": {
                "reference": f"Patient/{study.patient_id}", # This should be SATUSEHAT Patient ID
                "display": study.patient_name
            },
            "started": study.study_date.isoformat() if study.study_date else datetime.utcnow().isoformat(),
            "identifier": [
                {
                    "use": "official",
                    "system": "http://sys-ids.kemkes.go.id/acsn",
                    "value": study.accession_number
                }
            ],
            "procedureCode": [
                {
                    "coding": [
                        {
                            "system": "http://loinc.org",
                            "code": study.procedure_code,
                            "display": study.procedure_description
                        }
                    ]
                }
            ],
            "series": []
        }
        
        # Group instances by series
        series_map = {}
        for inst in instances:
            s_uid = inst.series_instance_uid
            if s_uid not in series_map:
                series_map[s_uid] = []
            series_map[s_uid].append(inst)
            
        for s_uid, s_instances in series_map.items():
            first_inst = s_instances[0]
            series_entry = {
                "uid": s_uid,
                "number": first_inst.series_number or 1,
                "modality": {
                    "system": "http://dicom.nema.org/resources/ontology/DCM",
                    "code": study.modality
                },
                "instance": []
            }
            
            for inst in s_instances:
                instance_entry = {
                    "uid": inst.sop_instance_uid,
                    "sopClass": {
                        "system": "http://dicom.nema.org/resources/ontology/DCM",
                        "code": inst.sop_class_uid
                    },
                    "number": inst.instance_number or 1
                }
                series_entry["instance"].append(instance_entry)
                
            resource["series"].append(series_entry)
            
        return resource

    @staticmethod
    async def submit_to_satusehat(resource: Dict[str, Any]) -> Dict[str, Any]:
        """
        Submit FHIR resource to SATUSEHAT via integrator service.
        """
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"{SATUSEHAT_GATEWAY_URL}/satusehat/ImagingStudy",
                    json=resource,
                    timeout=30.0
                )
                
                if resp.status_code in (200, 201):
                    return {
                        "success": True, 
                        "id": resp.json().get("id"),
                        "data": resp.json()
                    }
                else:
                    logger.error(f"SATUSEHAT submission failed: {resp.status_code} - {resp.text}")
                    return {
                        "success": False,
                        "error": f"Gateway error: {resp.status_code}",
                        "details": resp.text
                    }
        except Exception as e:
            logger.error(f"Failed to submit to SATUSEHAT: {str(e)}")
            return {"success": False, "error": str(e)}
