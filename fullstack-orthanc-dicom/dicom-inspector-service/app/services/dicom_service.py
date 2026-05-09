import pydicom
import structlog
import os
from datetime import datetime
from typing import Dict, Any, List

logger = structlog.get_logger()

class DicomService:
    def __init__(self, storage_dir: str = "/tmp/dicom-inspector"):
        self.storage_dir = storage_dir
        if not os.path.exists(self.storage_dir):
            os.makedirs(self.storage_dir)

    def inspect_file(self, file_path: str) -> Dict[str, Any]:
        """
        Inspects a DICOM file and returns metadata and AWS-style tags.
        """
        try:
            ds = pydicom.dcmread(file_path)
            
            metadata = {
                "file_size": os.path.getsize(file_path),
                "transfer_syntax": str(ds.file_meta.TransferSyntaxUID),
                "implementation_class_uid": str(ds.file_meta.ImplementationClassUID),
            }

            # AWS-style tags (flattened DICOM tags)
            # Reference: Common DICOM tags used in cloud imaging
            tags = {}
            for element in ds:
                if element.tag.group < 0x0008:
                    continue
                
                # Use name as key, handle binary data or long lists
                key = element.name.replace(" ", "")
                if element.VR == "SQ":
                    tags[key] = f"Sequence with {len(element.value)} items"
                elif element.VR == "OB" or element.VR == "OW":
                    tags[key] = f"Binary data ({len(element.value)} bytes)"
                else:
                    val = element.value
                    if isinstance(val, pydicom.multival.MultiValue):
                        val = [str(v) for v in val]
                    else:
                        val = str(val)
                    tags[key] = val

            return {
                "metadata": metadata,
                "tags": tags,
                "timestamp": datetime.utcnow().isoformat()
            }
        except Exception as e:
            logger.error("dicom_inspection_failed", file_path=file_path, error=str(e))
            raise ValueError(f"Failed to parse DICOM file: {str(e)}")

    def get_summary(self, ds: pydicom.dataset.Dataset) -> Dict[str, Any]:
        """
        Extracts key summary fields.
        """
        return {
            "PatientName": str(getattr(ds, "PatientName", "N/A")),
            "PatientID": str(getattr(ds, "PatientID", "N/A")),
            "StudyInstanceUID": str(getattr(ds, "StudyInstanceUID", "N/A")),
            "SeriesInstanceUID": str(getattr(ds, "SeriesInstanceUID", "N/A")),
            "Modality": str(getattr(ds, "Modality", "N/A")),
            "StudyDate": str(getattr(ds, "StudyDate", "N/A")),
        }
