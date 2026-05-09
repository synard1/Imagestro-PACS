"""
DICOM Router integration endpoints (SatuSehat DICOM Router).

Provides a simple API to push stored DICOM instances to the router via C-STORE.
"""

import asyncio
import os
import tempfile
import uuid
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
import pydicom
import requests

from app.config import settings
from app.database import get_db
from app.models.dicom_file import DicomFile
from app.models.satusehat_router_log import SatusehatRouterLog
from app.models.study import Study
from app.models.worklist import WorklistItem
from app.models.dicom_tag_audit import DicomTagAuditLog
from app.services.dicom_router_sender import DicomRouterSender
from app.services.dicom_storage_service_v2 import get_dicom_storage_service_v2

router = APIRouter(prefix="/api/dicom/router", tags=["DICOM Router"])


class RouterSendRequest(BaseModel):
    """Request payload for sending DICOM objects to the router."""

    study_uid: Optional[str] = Field(None, description="Study Instance UID filter")
    series_uid: Optional[str] = Field(None, description="Series Instance UID filter")
    sop_instance_uid: Optional[str] = Field(None, description="SOP Instance UID filter")
    accession_number: Optional[str] = Field(None, description="Accession number filter")
    worklist_id: Optional[str] = Field(
        None,
        description=(
            "Worklist item ID. When provided, the study UID and accession number will be derived "
            "from the worklist to scope the send and enrich the audit payload."
        ),
    )
    imaging_study_id: Optional[str] = Field(
        None, description="Optional ImagingStudy ID returned by SatuSehat router"
    )

    router_host: Optional[str] = Field(None, description="Override router host")
    router_port: Optional[int] = Field(None, ge=1, le=65535, description="Override router port")
    router_ae_title: Optional[str] = Field(None, description="Override router AE title")
    calling_ae_title: Optional[str] = Field(None, description="Override local AE title")
    timeout: Optional[int] = Field(None, ge=5, le=600, description="Association timeout (seconds)")


class RouterSendDetail(BaseModel):
    sop_instance_uid: Optional[str]
    study_instance_uid: Optional[str]
    series_instance_uid: Optional[str]
    metadata: Optional[dict] = None
    status: str
    message: Optional[str] = None
    status_code: Optional[str] = None


class RouterSendResponse(BaseModel):
    success: bool
    router_host: str
    router_port: int
    router_ae_title: str
    calling_ae_title: str
    worklist_id: Optional[str] = None
    worklist: Optional[dict] = None
    imaging_study_id: Optional[str] = None
    total: int
    sent: int
    failed: int
    details: List[RouterSendDetail]


def _build_sender(request: RouterSendRequest) -> DicomRouterSender:
    """Construct a sender instance from request overrides + defaults."""
    return DicomRouterSender(
        host=request.router_host or settings.dicom_router_host,
        port=request.router_port or settings.dicom_router_port,
        remote_ae_title=request.router_ae_title or settings.dicom_router_ae_title,
        calling_ae_title=request.calling_ae_title or settings.dicom_router_calling_ae_title,
        timeout=request.timeout or settings.dicom_router_timeout,
    )


def _collect_metadata(dicom_file: DicomFile, file_path: str) -> Dict[str, Any]:
    """Combine DB metadata with on-disk DICOM tags to enrich audit/detail logs."""
    meta: Dict[str, Any] = {
        "patient_id": dicom_file.patient_id,
        "patient_name": dicom_file.patient_name,
        "study_description": dicom_file.study_description,
        "series_number": dicom_file.series_number,
        "instance_number": dicom_file.instance_number,
        "modality": dicom_file.modality,
    }
    try:
        ds = pydicom.dcmread(file_path, force=True, stop_before_pixels=True)
        for key, tag in [
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
            value = getattr(ds, tag, None)
            if value not in (None, ""):
                meta[key] = str(value)
        ts_uid = getattr(getattr(ds, "file_meta", None) or {}, "TransferSyntaxUID", None)
        if ts_uid:
            meta["transfer_syntax_uid"] = str(ts_uid)
    except Exception:
        # Do not block on metadata extraction errors
        pass
    # Drop empty keys
    return {k: v for k, v in meta.items() if v not in (None, "", [])}


def _parse_imaging_study_id(body: Any) -> Optional[str]:
    """Best-effort extraction of ImagingStudy ID from various response shapes."""
    if body is None:
        return None
    if isinstance(body, str):
        return body if body else None
    if isinstance(body, list):
        for item in body:
            candidate = _parse_imaging_study_id(item)
            if candidate:
                return candidate
    if isinstance(body, dict):
        for key in ["imagingStudyId", "imagingStudyID", "imaging_study_id", "id"]:
            if key in body and body[key]:
                if key == "id" and body.get("resourceType") not in (None, "ImagingStudy"):
                    continue
                return str(body[key])
        for container_key in ["entry", "data", "results", "items"]:
            if container_key in body:
                return _parse_imaging_study_id(body[container_key])
        if "resource" in body:
            return _parse_imaging_study_id(body["resource"])
    return None


def _lookup_imaging_study_id(accession_number: Optional[str]) -> (Optional[str], Dict[str, Any]):
    """Query API Gateway to find ImagingStudy ID by accession number."""
    if not accession_number:
        return None, {"attempted": False}

    url = f"{settings.satusehat_gateway_url.rstrip('/')}/satusehat/imagingstudy/search/{accession_number}"
    info: Dict[str, Any] = {"attempted": True, "url": url}

    try:
        resp = requests.get(url, timeout=settings.satusehat_lookup_timeout)
        info["status_code"] = resp.status_code
        try:
            body = resp.json()
        except Exception:
            body = resp.text
        info["body"] = body if isinstance(body, (dict, list)) else str(body)[:2000]
        if resp.status_code == 200:
            imaging_study_id = _parse_imaging_study_id(body)
            if imaging_study_id:
                info["imaging_study_id"] = imaging_study_id
                return imaging_study_id, info
    except Exception as e:
        info["error"] = str(e)

    return None, info


@router.post("/send", response_model=RouterSendResponse)
async def send_to_dicom_router(
    request: RouterSendRequest,
    http_request: Request,
    db: Session = Depends(get_db),
):
    """
    Send one or more stored DICOM objects to the SatuSehat DICOM Router using C-STORE.

    At least one of study_uid, series_uid, sop_instance_uid, worklist_id, or accession_number must be provided.
    """
    worklist_item: Optional[WorklistItem] = None
    derived_study_uid: Optional[str] = request.study_uid
    derived_accession: Optional[str] = request.accession_number or None
    worklist_summary: Optional[Dict[str, Any]] = None
    audit_sop_uids: List[str] = []
    audit_series_uids: List[str] = []
    audit_study_uids: List[str] = []
    accession_study_uids: List[str] = []

    if request.worklist_id:
        try:
            worklist_uuid = uuid.UUID(request.worklist_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid worklist_id format. Must be a UUID string.",
            )

        worklist_item = (
            db.query(WorklistItem)
            .filter(WorklistItem.id == worklist_uuid, WorklistItem.is_active == True)  # noqa: E712
            .first()
        )
        if not worklist_item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Worklist item not found or inactive",
            )

        if worklist_item.accession_number:
            derived_accession = worklist_item.accession_number
        if not derived_study_uid:
            derived_study_uid = worklist_item.study_instance_uid
        elif derived_study_uid != worklist_item.study_instance_uid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="study_uid does not match the worklist item's study_instance_uid",
            )

        worklist_summary = {
            "id": str(worklist_item.id),
            "order_id": str(worklist_item.order_id) if worklist_item.order_id else None,
            "study_instance_uid": worklist_item.study_instance_uid,
            "accession_number": worklist_item.accession_number,
            "sps_id": worklist_item.sps_id,
            "sps_status": worklist_item.sps_status,
            "modality": worklist_item.modality,
            "patient_id": worklist_item.patient_id,
            "patient_name": worklist_item.patient_name,
            "scheduled_date": str(worklist_item.scheduled_procedure_step_start_date)
            if worklist_item.scheduled_procedure_step_start_date
            else None,
            "scheduled_time": str(worklist_item.scheduled_procedure_step_start_time)
            if worklist_item.scheduled_procedure_step_start_time
            else None,
        }

        # Collect any linked DICOM identifiers from audit logs to broaden lookup
        audit_logs = (
            db.query(DicomTagAuditLog)
            .filter(DicomTagAuditLog.worklist_id == worklist_uuid)
            .order_by(DicomTagAuditLog.synchronized_at.desc())
            .all()
        )
        for log in audit_logs:
            if log.sop_instance_uid:
                audit_sop_uids.append(log.sop_instance_uid)
            if log.series_instance_uid:
                audit_series_uids.append(log.series_instance_uid)
            if log.study_instance_uid:
                audit_study_uids.append(log.study_instance_uid)

        # Deduplicate collected IDs
        audit_sop_uids = list(dict.fromkeys(audit_sop_uids))
        audit_series_uids = list(dict.fromkeys(audit_series_uids))
        audit_study_uids = list(dict.fromkeys(audit_study_uids))

    # Allow lookup by accession number when no explicit study UID provided
    if request.accession_number and not derived_study_uid:
        accession_study_uids = [
            row.study_instance_uid
            for row in db.query(Study.study_instance_uid)
            .filter(Study.accession_number == request.accession_number)
            .filter(Study.deleted_at.is_(None))
            .all()
        ]
        if accession_study_uids:
            derived_study_uid = accession_study_uids[0]

    # Validation: ensure at least one scope is available (including accession-derived studies)
    if not any(
        [
            derived_study_uid,
            request.series_uid,
            request.sop_instance_uid,
            audit_sop_uids,
            audit_study_uids,
            accession_study_uids,
        ]
    ):
        detail = (
            "Provide at least one of study_uid, series_uid, sop_instance_uid, worklist_id, "
            "or accession_number"
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

    # If accession number was provided but no study found, return a clearer error
    if request.accession_number and not derived_study_uid and not accession_study_uids and not any(
        [request.series_uid, request.sop_instance_uid, audit_sop_uids, audit_study_uids]
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No study found for accession_number={request.accession_number}",
        )

    # Find DICOM files that match the requested scope
    def _fetch_dicom_files(
        study_uids: Optional[List[str]],
        series_uid: Optional[str],
        sop_uids: Optional[List[str]],
    ) -> List[DicomFile]:
        query = db.query(DicomFile).filter(DicomFile.status.in_(["active", "archived"]))
        if study_uids:
            normalized_study_uids = study_uids
            if isinstance(study_uids, str):
                normalized_study_uids = [study_uids]
            unique_study_uids = list(dict.fromkeys(normalized_study_uids))
            if len(unique_study_uids) == 1:
                query = query.filter(DicomFile.study_id == unique_study_uids[0])
            else:
                query = query.filter(DicomFile.study_id.in_(unique_study_uids))
        if series_uid:
            query = query.filter(DicomFile.series_id == series_uid)
        if sop_uids:
            query = query.filter(DicomFile.sop_instance_uid.in_(sop_uids))
        return query.order_by(
            DicomFile.study_id,
            DicomFile.series_id,
            DicomFile.instance_number,
        ).all()

    dicom_files: List[DicomFile] = _fetch_dicom_files(
        [uid for uid in [derived_study_uid] + accession_study_uids if uid],
        request.series_uid,
        [request.sop_instance_uid] if request.sop_instance_uid else None,
    )

    # If nothing found, retry using audit-linked identifiers from the same worklist
    if not dicom_files and worklist_item:
        if audit_sop_uids:
            dicom_files = _fetch_dicom_files(None, None, audit_sop_uids)

        if not dicom_files and audit_series_uids:
            for series_uid in audit_series_uids:
                dicom_files = _fetch_dicom_files(None, series_uid, None)
                if dicom_files:
                    break

        if not dicom_files and audit_study_uids:
            for study_uid in audit_study_uids:
                dicom_files = _fetch_dicom_files([study_uid], None, None)
                if dicom_files:
                    break

        # Final fallback: use worklist study UID even if it differs from request
        if not dicom_files and worklist_item.study_instance_uid:
            dicom_files = _fetch_dicom_files([worklist_item.study_instance_uid], None, None)

    if not dicom_files:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "No DICOM files found for the provided filter or linked worklist. "
                "Ensure the worklist has synchronized studies/instances."
            ),
        )

    storage_service = get_dicom_storage_service_v2(db)
    prepared_files = []
    retrieval_failures: List[RouterSendDetail] = []
    metadata_map: Dict[str, Dict[str, Any]] = {}

    # Prepare files for sending (download from storage if needed)
    for dicom_file in dicom_files:
        dest_path = None
        should_cleanup = False

        try:
            if dicom_file.storage_location_id:
                fd, dest_path = tempfile.mkstemp(suffix=".dcm")
                os.close(fd)
                should_cleanup = True

            retrieved_path = await storage_service.retrieve_dicom(
                dicom_file,
                destination_path=dest_path,
                verify_hash=False,
            )

            if not retrieved_path:
                retrieval_failures.append(
                    RouterSendDetail(
                        sop_instance_uid=dicom_file.sop_instance_uid,
                        study_instance_uid=dicom_file.study_id,
                        series_instance_uid=dicom_file.series_id,
                        status="failed",
                        message="Failed to retrieve file from storage",
                        status_code=None,
                    )
                )
                # Clean up temp file if we created one
                if dest_path and os.path.exists(dest_path):
                    os.remove(dest_path)
                continue

            prepared_files.append((dicom_file, retrieved_path, should_cleanup))
            meta = _collect_metadata(dicom_file, retrieved_path)
            if meta and dicom_file.sop_instance_uid:
                metadata_map[dicom_file.sop_instance_uid] = meta
        except Exception as e:
            retrieval_failures.append(
                RouterSendDetail(
                    sop_instance_uid=dicom_file.sop_instance_uid,
                    study_instance_uid=dicom_file.study_id,
                    series_instance_uid=dicom_file.series_id,
                    status="failed",
                    message=f"Error preparing file: {e}",
                    status_code=None,
                )
            )
            if dest_path and os.path.exists(dest_path):
                os.remove(dest_path)

    sender = _build_sender(request)

    send_result = {"total": 0, "sent": 0, "failed": 0, "details": [], "error": None}
    try:
        if prepared_files:
            send_result = await asyncio.to_thread(
                sender.send_files,
                [path for _, path, _ in prepared_files],
            )
    finally:
        # Clean up temp files created during retrieval
        for dicom_file, path, should_cleanup in prepared_files:
            if should_cleanup and path and os.path.exists(path):
                try:
                    os.remove(path)
                except Exception:
                    # Keep going even if cleanup fails
                    pass

    total = send_result.get("total", 0) + len(retrieval_failures)
    sent = send_result.get("sent", 0)
    failed = send_result.get("failed", 0) + len(retrieval_failures)

    details: List[RouterSendDetail] = retrieval_failures + []
    for item in send_result.get("details", []):
        sop_uid = item.get("sop_instance_uid")
        merged_meta = item.get("metadata") or metadata_map.get(sop_uid) or {}
        details.append(
            RouterSendDetail(
                sop_instance_uid=sop_uid,
                study_instance_uid=item.get("study_instance_uid"),
                series_instance_uid=item.get("series_instance_uid"),
                metadata=merged_meta or None,
                status=item.get("status", "failed"),
                message=item.get("message"),
                status_code=item.get("status_code"),
            )
        )

    # Lookup ImagingStudy ID using accession number if not provided
    imaging_study_id = request.imaging_study_id
    lookup_info: Dict[str, Any] = {}
    
    # NEW: Also trigger direct submission to SATUSEHAT if study data is available
    if derived_accession:
        try:
            from app.services.fhir.imaging_study_service import ImagingStudyService
            from app.models.study import Study
            from app.models.dicom_file import DicomFile
            
            # Find study and its instances
            study = db.query(Study).filter(Study.accession_number == derived_accession).first()
            if study:
                instances = db.query(DicomFile).filter(DicomFile.study_instance_uid == study.study_instance_uid).all()
                if instances:
                    # Create and submit resource
                    fhir_resource = ImagingStudyService.create_fhir_resource(study, instances)
                    submission_result = await ImagingStudyService.submit_to_satusehat(fhir_resource)
                    if submission_result.get("success"):
                        imaging_study_id = submission_result.get("id")
                        logger.info(f"Successfully submitted ImagingStudy to SATUSEHAT: {imaging_study_id}")
        except Exception as e:
            logger.warning(f"Background ImagingStudy submission failed: {str(e)}")

    if not imaging_study_id:
        accession = derived_accession
        if not accession:
            for meta in metadata_map.values():
                accession = meta.get("accession_number")
                if accession:
                    break
        imaging_study_id, lookup_info = _lookup_imaging_study_id(accession)

    response_payload = RouterSendResponse(
        success=failed == 0 and not send_result.get("error"),
        router_host=sender.host,
        router_port=sender.port,
        router_ae_title=sender.remote_ae_title,
        calling_ae_title=sender.calling_ae_title,
        worklist_id=str(worklist_item.id) if worklist_item else None,
        worklist=worklist_summary,
        imaging_study_id=imaging_study_id,
        total=total,
        sent=sent,
        failed=failed,
        details=details,
    )

    # Persist audit log
    client_ip = http_request.client.host if http_request and http_request.client else None
    requested_by = http_request.headers.get("X-User", None) if http_request else None

    log_entry = SatusehatRouterLog(
        study_uid=derived_study_uid or request.study_uid,
        series_uid=request.series_uid,
        sop_instance_uid=request.sop_instance_uid,
        imaging_study_id=imaging_study_id,
        router_host=sender.host,
        router_port=sender.port,
        router_ae_title=sender.remote_ae_title,
        calling_ae_title=sender.calling_ae_title,
        total=total,
        sent=sent,
        failed=failed,
        success=response_payload.success,
        error=send_result.get("error"),
        request_payload=request.model_dump(),
        response_details={
            "send_details": [detail.model_dump() for detail in response_payload.details],
            "lookup": lookup_info or None,
            "worklist": worklist_summary,
        },
        requested_by=requested_by,
        client_ip=client_ip,
    )

    try:
        db.add(log_entry)
        db.commit()
    except Exception:
        db.rollback()

    return response_payload
