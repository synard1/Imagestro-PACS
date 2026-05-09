"""
Impersonate API Endpoints
Provides superadmin user impersonation functionality for testing and troubleshooting
"""

import logging
from typing import Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, Query, HTTPException, Body
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.impersonate_service import ImpersonateService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/impersonate", tags=["impersonate"])


# ============================================================================
# Request/Response Models
# ============================================================================

class StartImpersonateRequest(BaseModel):
    """Request model for starting impersonate session"""
    target_user_id: str = Field(..., alias="targetUserId")
    reason: Optional[str] = None
    
    class Config:
        populate_by_name = True


class StopImpersonateRequest(BaseModel):
    """Request model for stopping impersonate session"""
    session_id: Optional[str] = Field(None, alias="sessionId")
    
    class Config:
        populate_by_name = True


# ============================================================================
# API Endpoints
# ============================================================================

@router.post("/start")
async def start_impersonate(
    request: StartImpersonateRequest,
    db: Session = Depends(get_db)
):
    """
    Start an impersonate session
    
    Allows a superadmin to start impersonating another user for testing and troubleshooting.
    
    Args:
        request: Start impersonate request details
        
    Returns:
        Session data with session ID, start time, and timeout info
        
    Raises:
        HTTPException: If impersonate fails (user not found, already impersonating, etc.)
    """
    try:
        # Get current user from request context (would be set by auth middleware)
        # TODO: Replace "00000000-0000-0000-0000-000000000000" with the actual original_user_id from authentication context (e.g., JWT token).
        # This placeholder is used for development/testing to avoid UUID validation errors when auth is not fully configured.
        original_user_id = "00000000-0000-0000-0000-000000000000"
        
        impersonate_service = ImpersonateService(db)
        
        # Start impersonate session
        success, session_data, error_msg = await impersonate_service.start_impersonate(
            original_user_id=original_user_id,
            target_user_id=request.target_user_id,
            reason=request.reason
        )
        
        if not success:
            logger.warning(f"Failed to start impersonate: {error_msg}")
            
            # Map error messages to HTTP status codes
            error_status_map = {
                "USER_NOT_FOUND": 404,
                "USER_INACTIVE": 400,
                "CANNOT_IMPERSONATE_SUPERADMIN": 403,
                "CANNOT_IMPERSONATE_SERVICE_ACCOUNT": 403,
                "NESTED_IMPERSONATE_NOT_ALLOWED": 409,
                "INVALID_USER_ID": 400,
                "VALIDATION_ERROR": 400,
            }
            
            status_code = error_status_map.get(error_msg, 500)
            raise HTTPException(status_code=status_code, detail=error_msg)
        
        return {
            "success": True,
            "session": session_data
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting impersonate session: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to start impersonate session")


@router.post("/stop")
async def stop_impersonate(
    request: StopImpersonateRequest,
    db: Session = Depends(get_db)
):
    """
    Stop an impersonate session
    
    Stops the current impersonate session and returns to the superadmin's original identity.
    
    Args:
        request: Stop impersonate request details
        
    Returns:
        Session data with end time and duration
        
    Raises:
        HTTPException: If no active session found
    """
    try:
        # Get current user from request context
        original_user_id = "00000000-0000-0000-0000-000000000000"  # This should come from auth context
        
        impersonate_service = ImpersonateService(db)
        
        # Stop impersonate session
        success, session_data, error_msg = await impersonate_service.stop_impersonate(
            original_user_id=original_user_id,
            session_id=request.session_id
        )
        
        if not success:
            logger.warning(f"Failed to stop impersonate: {error_msg}")
            
            if error_msg == "NO_ACTIVE_SESSION":
                raise HTTPException(status_code=404, detail="No active impersonate session found")
            elif error_msg == "INVALID_USER_ID":
                raise HTTPException(status_code=400, detail="Invalid user ID format")
            else:
                raise HTTPException(status_code=500, detail="Failed to stop impersonate session")
        
        return {
            "success": True,
            "message": "Impersonate session stopped",
            "session": session_data
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error stopping impersonate session: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to stop impersonate session")


@router.get("/status")
async def get_impersonate_status(
    db: Session = Depends(get_db)
):
    """
    Get current impersonate session status
    
    Returns information about the current active impersonate session, if any.
    
    Returns:
        Session status with active session data or empty if not impersonating
    """
    try:
        # Get current user from request context
        original_user_id = "00000000-0000-0000-0000-000000000000"  # This should come from auth context
        
        impersonate_service = ImpersonateService(db)
        
        # Get active session
        session_data = await impersonate_service.get_active_session(original_user_id)
        
        if session_data:
            return {
                "isImpersonating": True,
                "session": session_data
            }
        else:
            return {
                "isImpersonating": False
            }
        
    except Exception as e:
        logger.error(f"Error getting impersonate status: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get impersonate status")


@router.get("/history")
async def get_impersonate_history(
    start_date: Optional[datetime] = Query(None, description="Filter by start date"),
    end_date: Optional[datetime] = Query(None, description="Filter by end date"),
    target_user_id: Optional[str] = Query(None, description="Filter by target user ID"),
    status: Optional[str] = Query(None, description="Filter by status (active, completed, timeout, error)"),
    search: Optional[str] = Query(None, description="Search by target user name or email"),
    limit: int = Query(20, ge=1, le=100, description="Maximum results"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    db: Session = Depends(get_db)
):
    """
    Get impersonate session history
    
    Returns a paginated list of impersonate sessions performed by the current superadmin.
    
    Args:
        start_date: Filter by start date
        end_date: Filter by end date
        target_user_id: Filter by target user ID
        status: Filter by session status
        search: Search by target user name or email
        limit: Maximum results per page
        offset: Offset for pagination
        
    Returns:
        Paginated list of impersonate sessions with metadata
    """
    try:
        # Get current user from request context
        original_user_id = "00000000-0000-0000-0000-000000000000"  # This should come from auth context
        
        impersonate_service = ImpersonateService(db)
        
        # Build filters
        filters = {}
        if start_date:
            filters['start_date'] = start_date
        if end_date:
            filters['end_date'] = end_date
        if target_user_id:
            filters['target_user_id'] = target_user_id
        if status:
            filters['status'] = status
        if search:
            filters['search'] = search
        
        # Get history
        sessions, total_count = await impersonate_service.get_session_history(
            original_user_id=original_user_id,
            limit=limit,
            offset=offset,
            filters=filters if filters else None
        )
        
        return {
            "success": True,
            "data": sessions,
            "total": total_count,
            "returned": len(sessions),
            "limit": limit,
            "offset": offset,
            "page": (offset // limit) + 1,
            "filters": {
                "startDate": start_date.isoformat() if start_date else None,
                "endDate": end_date.isoformat() if end_date else None,
                "targetUserId": target_user_id,
                "status": status,
                "search": search
            }
        }
        
    except Exception as e:
        logger.error(f"Error getting impersonate history: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get impersonate history")


@router.get("/history/{session_id}")
async def get_impersonate_session_detail(
    session_id: str,
    db: Session = Depends(get_db)
):
    """
    Get detailed information about a specific impersonate session
    
    Args:
        session_id: ID of the impersonate session
        
    Returns:
        Detailed session information including actions performed
        
    Raises:
        HTTPException: If session not found
    """
    try:
        from app.models.impersonate_session import ImpersonateSession
        import uuid
        
        # Get session
        session = db.query(ImpersonateSession).filter(
            ImpersonateSession.id == uuid.UUID(session_id)
        ).first()
        
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        return {
            "success": True,
            "session": session.to_dict()
        }
        
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session ID format")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting session detail: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get session detail")
