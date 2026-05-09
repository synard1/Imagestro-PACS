"""
Signature API Routes
Digital signature verification and management
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import Optional
import logging

from app.database import get_db
from app.models.signature import ReportSignature, SignatureAuditLog
from app.middleware.auth import get_current_user, require_roles
from datetime import datetime

logger = logging.getLogger(__name__)

router = APIRouter(tags=["signatures"])


@router.get("/verify/{signature_hash}")
async def verify_signature(
    signature_hash: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Verify signature status by hash
    Returns signature details and revocation status
    """
    try:
        # Get signature from database
        signature = db.query(ReportSignature).filter(
            ReportSignature.signature_hash == signature_hash
        ).first()

        # Get client info
        client_ip = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent")

        # Signature not found
        if not signature:
            logger.warning(f"Signature verification failed: hash={signature_hash} not found by user {current_user['username']}")
            return {
                "valid": False,
                "status": "not_found",
                "message": "Signature not found in database",
                "signature_hash": signature_hash
            }

        # Log verification attempt
        audit_log = SignatureAuditLog(
            signature_id=signature.id,
            signature_hash=signature_hash,
            action="verified",
            performed_by=current_user["user_id"],
            ip_address=client_ip,
            user_agent=user_agent,
            details={"status": signature.status}
        )
        db.add(audit_log)
        db.commit()

        # Signature is revoked
        if signature.status == 'revoked':
            logger.info(f"Signature verified as REVOKED: hash={signature_hash}")
            return {
                "valid": False,
                "status": "revoked",
                "message": "This signature has been revoked",
                "signature": {
                    "hash": signature.signature_hash,
                    "radiologist_name": signature.radiologist_name,
                    "license_number": signature.license_number,
                    "signed_at": signature.signed_at.isoformat() if signature.signed_at else None,
                    "revoked_at": signature.revoked_at.isoformat() if signature.revoked_at else None,
                    "revoked_by": signature.revoked_by,
                    "revocation_reason": signature.revocation_reason
                }
            }

        # Signature is active
        logger.info(f"Signature verified as ACTIVE: hash={signature_hash}")
        return {
            "valid": True,
            "status": "active",
            "message": "Signature is valid and active",
            "signature": {
                "hash": signature.signature_hash,
                "radiologist_name": signature.radiologist_name,
                "license_number": signature.license_number,
                "signed_at": signature.signed_at.isoformat() if signature.signed_at else None,
                "signature_method": signature.signature_method
            }
        }

    except Exception as e:
        logger.error(f"Error verifying signature: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error verifying signature: {str(e)}")


@router.post("/create")
async def create_signature(
    report_id: str,
    signature_hash: str,
    radiologist_id: str,
    radiologist_name: str,
    license_number: Optional[str] = None,
    signature_method: str = "password",
    signature_data: Optional[dict] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["superadmin", "developer", "radiologist"]))
):
    """
    Create a new signature record
    Called when a report is signed
    """
    try:
        # Check if signature already exists
        existing = db.query(ReportSignature).filter(
            ReportSignature.signature_hash == signature_hash
        ).first()

        if existing:
            logger.warning(f"Signature already exists: hash={signature_hash}")
            return {
                "success": False,
                "message": "Signature already exists",
                "signature_id": str(existing.id)
            }

        # Create new signature
        signature = ReportSignature(
            report_id=report_id,
            signature_hash=signature_hash,
            radiologist_id=radiologist_id,
            radiologist_name=radiologist_name,
            license_number=license_number,
            signature_method=signature_method,
            signature_data=signature_data,
            signed_at=datetime.now(),
            status='active'
        )

        db.add(signature)
        db.commit()
        db.refresh(signature)

        # Log creation
        audit_log = SignatureAuditLog(
            signature_id=signature.id,
            signature_hash=signature_hash,
            action="created",
            performed_by=current_user["user_id"],
            details={"method": signature_method, "signed_for": radiologist_id}
        )
        db.add(audit_log)
        db.commit()

        logger.info(f"Signature created: hash={signature_hash}, report_id={report_id} by {current_user['username']}")

        return {
            "success": True,
            "message": "Signature created successfully",
            "signature_id": str(signature.id),
            "signature_hash": signature_hash
        }

    except Exception as e:
        db.rollback()
        logger.error(f"Error creating signature: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error creating signature: {str(e)}")


@router.put("/{signature_hash}/revoke")
async def revoke_signature(
    signature_hash: str,
    revoked_by: str,
    revocation_reason: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_roles(["superadmin", "developer", "radiologist"]))
):
    """
    Revoke a signature
    Called when a report signature needs to be invalidated
    """
    try:
        # Find signature
        signature = db.query(ReportSignature).filter(
            ReportSignature.signature_hash == signature_hash,
            ReportSignature.status == 'active'
        ).first()

        if not signature:
            logger.warning(f"Signature not found or already revoked: hash={signature_hash}")
            return {
                "success": False,
                "message": "Signature not found or already revoked"
            }

        # Get client info
        client_ip = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent")

        # Revoke signature
        signature.status = 'revoked'
        signature.revoked_at = datetime.now()
        signature.revoked_by = current_user["user_id"]
        signature.revocation_reason = revocation_reason

        db.commit()

        # Log revocation
        audit_log = SignatureAuditLog(
            signature_id=signature.id,
            signature_hash=signature_hash,
            action="revoked",
            performed_by=current_user["user_id"],
            ip_address=client_ip,
            user_agent=user_agent,
            details={"reason": revocation_reason, "original_revoked_by_param": revoked_by}
        )
        db.add(audit_log)
        db.commit()

        logger.info(f"Signature revoked: hash={signature_hash}, by={current_user['username']}")

        return {
            "success": True,
            "message": "Signature revoked successfully",
            "signature_id": str(signature.id),
            "revoked_at": signature.revoked_at.isoformat()
        }

    except Exception as e:
        db.rollback()
        logger.error(f"Error revoking signature: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error revoking signature: {str(e)}")


@router.get("/{signature_hash}")
async def get_signature(
    signature_hash: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Get signature details by hash
    """
    try:
        signature = db.query(ReportSignature).filter(
            ReportSignature.signature_hash == signature_hash
        ).first()

        if not signature:
            raise HTTPException(status_code=404, detail="Signature not found")

        return {
            "success": True,
            "signature": signature.to_dict()
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting signature: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting signature: {str(e)}")


@router.get("/report/{report_id}")
async def get_report_signatures(
    report_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Get all signatures for a report
    """
    try:
        signatures = db.query(ReportSignature).filter(
            ReportSignature.report_id == report_id
        ).order_by(ReportSignature.signed_at.desc()).all()

        return {
            "success": True,
            "count": len(signatures),
            "signatures": [sig.to_dict() for sig in signatures]
        }

    except Exception as e:
        logger.error(f"Error getting report signatures: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting report signatures: {str(e)}")
