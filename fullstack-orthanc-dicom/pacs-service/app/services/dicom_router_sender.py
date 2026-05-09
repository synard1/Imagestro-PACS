"""
Utility for sending DICOM objects to the SatuSehat DICOM Router (C-STORE SCU).
"""

import logging
from typing import Any, Dict, List, Optional, Sequence, Tuple

from pynetdicom import AE
from pydicom import dcmread
from pydicom.dataset import Dataset
from pydicom.uid import (
    DeflatedExplicitVRLittleEndian,
    ExplicitVRBigEndian,
    ExplicitVRLittleEndian,
    ImplicitVRLittleEndian,
)

logger = logging.getLogger(__name__)

# Prefer explicit little endian, but include common fallbacks
DEFAULT_TRANSFER_SYNTAXES: Sequence[str] = [
    str(ExplicitVRLittleEndian),
    str(ImplicitVRLittleEndian),
    str(DeflatedExplicitVRLittleEndian),
    str(ExplicitVRBigEndian),
]

# Status codes that still mean the object is stored (warnings)
STORE_SUCCESS_CODES = {0x0000, 0xB000, 0xB006, 0xB007}


class DicomRouterSender:
    """Simple C-STORE SCU for the SatuSehat DICOM Router."""

    def __init__(
        self,
        host: str,
        port: int,
        remote_ae_title: str = "DCMROUTER",
        calling_ae_title: str = "PACS_SCU",
        timeout: int = 60,
    ):
        self.host = host
        self.port = port
        self.remote_ae_title = remote_ae_title
        self.calling_ae_title = calling_ae_title
        self.timeout = timeout

    def _build_ae(self, sop_classes: Sequence[str], transfer_syntaxes: Sequence[str]) -> AE:
        """Create AE with requested contexts for the SOP classes we need."""
        ae = AE(ae_title=self.calling_ae_title)

        ts_list = list(dict.fromkeys(transfer_syntaxes or DEFAULT_TRANSFER_SYNTAXES))
        sop_list = sop_classes or []

        for sop_class in sop_list:
            ae.add_requested_context(sop_class, ts_list)

        ae.acse_timeout = self.timeout
        ae.dimse_timeout = self.timeout
        ae.network_timeout = self.timeout
        return ae

    @staticmethod
    def _extract_identifiers(ds: Dataset) -> Dict[str, Optional[str]]:
        """Get useful identifiers from the dataset for logging/response."""
        sop_uid = getattr(ds, "SOPInstanceUID", None) or getattr(
            getattr(ds, "file_meta", None) or {}, "MediaStorageSOPInstanceUID", None
        )
        return {
            "sop_instance_uid": str(sop_uid) if sop_uid else None,
            "study_instance_uid": str(getattr(ds, "StudyInstanceUID", "")) or None,
            "series_instance_uid": str(getattr(ds, "SeriesInstanceUID", "")) or None,
        }

    @staticmethod
    def _extract_metadata(ds: Dataset) -> Dict[str, Any]:
        """Lightweight metadata snapshot to align audit info with router processing."""
        meta: Dict[str, Any] = {}
        for attr in [
            ("accession_number", "AccessionNumber"),
            ("patient_id", "PatientID"),
            ("patient_name", "PatientName"),
            ("study_description", "StudyDescription"),
            ("series_description", "SeriesDescription"),
            ("modality", "Modality"),
            ("study_date", "StudyDate"),
            ("study_time", "StudyTime"),
            ("instance_number", "InstanceNumber"),
            ("station_name", "StationName"),
        ]:
            key, dicom_attr = attr
            value = getattr(ds, dicom_attr, None)
            if value not in (None, ""):
                meta[key] = str(value)
        ts_uid = getattr(getattr(ds, "file_meta", None) or {}, "TransferSyntaxUID", None)
        if ts_uid:
            meta["transfer_syntax_uid"] = str(ts_uid)
        return meta

    def send_files(self, file_paths: List[str]) -> Dict[str, Any]:
        """
        Send one or more DICOM files to the router via C-STORE.

        Returns a summary dict with send counts and per-instance details.
        """

        def _mark_all_failed(message: str) -> Dict[str, Any]:
            """Populate result with failures for every prepared dataset."""
            result["error"] = message
            result["failed"] += len(datasets)
            for path, ds, meta in datasets:
                identifiers = self._extract_identifiers(ds)
                result["details"].append(
                    {
                        **identifiers,
                        "metadata": meta,
                        "status": "failed",
                        "message": message,
                        "path": path,
                        "status_code": None,
                    }
                )
            return result

        result: Dict[str, Any] = {
            "total": len(file_paths),
            "sent": 0,
            "failed": 0,
            "details": [],
            "error": None,
        }

        if not file_paths:
            result["error"] = "No files to send"
            return result

        datasets: List[Tuple[str, Dataset, Dict[str, Any]]] = []
        sop_classes: List[str] = []
        transfer_syntaxes: List[str] = list(DEFAULT_TRANSFER_SYNTAXES)

        # Read datasets first so we can negotiate presentation contexts correctly
        for path in file_paths:
            try:
                ds = dcmread(path, force=True)
                meta = self._extract_metadata(ds)
                datasets.append((path, ds, meta))

                sop_class_uid = getattr(ds, "SOPClassUID", None) or getattr(
                    getattr(ds, "file_meta", None) or {}, "MediaStorageSOPClassUID", None
                )
                if sop_class_uid:
                    sop_classes.append(str(sop_class_uid))

                ts_uid = getattr(getattr(ds, "file_meta", None) or {}, "TransferSyntaxUID", None)
                if ts_uid:
                    transfer_syntaxes.append(str(ts_uid))
            except Exception as e:
                logger.error("Failed to read DICOM file %s: %s", path, e, exc_info=True)
                result["failed"] += 1
                result["details"].append(
                    {
                        "sop_instance_uid": None,
                        "study_instance_uid": None,
                        "series_instance_uid": None,
                        "status": "failed",
                        "message": f"Failed to read file: {e}",
                        "path": path,
                    }
                )

        if not datasets:
            result["error"] = "No readable DICOM files"
            return result

        ae = self._build_ae(
            sop_classes=list(dict.fromkeys(sop_classes)),
            transfer_syntaxes=list(dict.fromkeys(transfer_syntaxes)),
        )

        assoc = None
        logger.info(
            "Connecting to DICOM Router %s:%s as %s (remote AE: %s)",
            self.host,
            self.port,
            self.calling_ae_title,
            self.remote_ae_title,
        )
        try:
            assoc = ae.associate(self.host, self.port, ae_title=self.remote_ae_title)
        except Exception as assoc_error:
            msg = f"Failed to establish association with DICOM Router: {assoc_error}"
            logger.error(msg, exc_info=True)
            return _mark_all_failed(msg)

        if not assoc or not assoc.is_established:
            msg = "Failed to establish association with DICOM Router"
            logger.error(msg)
            return _mark_all_failed(msg)

        try:
            for path, ds, meta in datasets:
                identifiers = self._extract_identifiers(ds)
                try:
                    status = assoc.send_c_store(ds)
                    status_code: Optional[int] = status.Status if status else None
                    success = status and status_code in STORE_SUCCESS_CODES

                    message = (
                        f"Status 0x{status_code:04X}" if status_code is not None else "No status returned"
                    )

                    if success:
                        result["sent"] += 1
                        detail_status = "sent"
                    else:
                        result["failed"] += 1
                        detail_status = "failed"

                    result["details"].append(
                        {
                            **identifiers,
                            "metadata": meta,
                            "status": detail_status,
                            "message": message,
                            "status_code": f"0x{status_code:04X}" if status_code is not None else None,
                            "path": path,
                        }
                    )
                except Exception as send_err:
                    logger.error("C-STORE failed for %s: %s", path, send_err, exc_info=True)
                    result["failed"] += 1
                    result["details"].append(
                        {
                            **identifiers,
                            "metadata": meta,
                            "status": "failed",
                            "message": f"Exception during send: {send_err}",
                            "status_code": None,
                            "path": path,
                        }
                    )
        finally:
            try:
                if assoc:
                    assoc.release()
            except Exception:
                logger.warning("Failed to release association cleanly")

        return result
