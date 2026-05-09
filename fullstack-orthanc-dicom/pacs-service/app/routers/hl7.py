"""
HL7 v2.x Integration API
Endpoints for receiving and processing HL7 messages via HTTP REST
"""

import logging
from typing import Optional
from fastapi import APIRouter, Depends, Request, Response, status, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.services.hl7_adt_handler import HL7ADTHandlerService
from app.services.hl7_orm_handler import HL7ORMHandlerService
from app.services.hl7_oru_handler import HL7ORUHandlerService
from app.services.hl7_error_handler import HL7ErrorHandlerService
from app.models.hl7_message import HL7Message

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/hl7", tags=["HL7 Integration"])


class HL7MessageRequest(BaseModel):
    """Request model for HL7 messages"""
    message: str

    class Config:
        json_schema_extra = {
            "example": {
                "message": "MSH|^~\\&|HIS|HOSPITAL|PACS|RADIOLOGY|20231126120000||ADT^A01|MSG001|P|2.5\rPID|1||123456||DOE^JOHN^A||19800101|M"
            }
        }


class HL7MessageResponse(BaseModel):
    """Response model for HL7 messages"""
    status: str
    message_id: Optional[str] = None
    ack_message: str
    error: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {
                "status": "success",
                "message_id": "550e8400-e29b-41d4-a716-446655440000",
                "ack_message": "MSH|^~\\&|PACS|RADIOLOGY|HIS|HOSPITAL|20231126120001||ACK^A01|ACK001|P|2.5\rMSA|AA|MSG001"
            }
        }


# ============================================================================
# ADT Endpoints (Patient Administration)
# ============================================================================

@router.post("/adt", response_model=HL7MessageResponse, status_code=status.HTTP_200_OK)
async def receive_adt_message(
    request: Request,
    hl7_request: HL7MessageRequest,
    db: Session = Depends(get_db)
):
    """
    Receive and process ADT (Admission/Discharge/Transfer) message

    **Supported Trigger Events:**
    - A01: Admit/Visit Notification
    - A04: Register a Patient
    - A05: Pre-admit a Patient
    - A08: Update Patient Information
    - A11: Cancel Admit/Visit Notification
    - A13: Cancel Discharge/End Visit
    - A31: Update Person Information
    - A40: Merge Patient

    **Request Body:**
    - message: Raw HL7 ADT message (HL7 v2.x format with \\r separators)

    **Response:**
    - status: "success" or "error"
    - message_id: UUID of stored HL7 message
    - ack_message: HL7 ACK message (AA, AE, or AR)
    - error: Error message (if status is "error")

    **Example:**
    ```
    POST /api/hl7/adt
    {
        "message": "MSH|^~\\\\&|HIS|HOSPITAL|PACS|RADIOLOGY|20231126120000||ADT^A01|MSG001|P|2.5\\rPID|1||123456||DOE^JOHN^A||19800101|M"
    }
    ```
    """
    try:
        # Extract HTTP context
        http_context = {
            'method': request.method,
            'path': str(request.url.path),
            'client_ip': request.client.host if request.client else None,
            'user_agent': request.headers.get('user-agent'),
        }

        # Process ADT message
        handler = HL7ADTHandlerService(db)
        hl7_message, ack_message = await handler.process_adt_message(
            raw_message=hl7_request.message,
            http_context=http_context
        )

        # Return response based on processing result
        if hl7_message and hl7_message.ack_code == 'AA':
            return HL7MessageResponse(
                status="success",
                message_id=str(hl7_message.id),
                ack_message=ack_message
            )
        else:
            return HL7MessageResponse(
                status="error",
                message_id=str(hl7_message.id) if hl7_message else None,
                ack_message=ack_message,
                error=hl7_message.error_message if hl7_message else "Unknown error"
            )

    except Exception as e:
        logger.error(f"Failed to process ADT message: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process ADT message: {str(e)}"
        )


@router.get("/adt/patient/{patient_id}/history")
async def get_patient_adt_history(
    patient_id: str,
    limit: int = 20,
    db: Session = Depends(get_db)
):
    """
    Get ADT message history for a specific patient

    **Parameters:**
    - patient_id: Patient identifier
    - limit: Maximum number of records to return (default: 20)

    **Response:**
    List of ADT messages for the patient
    """
    try:
        handler = HL7ADTHandlerService(db)
        history = await handler.get_patient_adt_history(patient_id, limit)

        return {
            "patient_id": patient_id,
            "count": len(history),
            "messages": history
        }

    except Exception as e:
        logger.error(f"Failed to get patient ADT history: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get patient history: {str(e)}"
        )


# ============================================================================
# ORM Endpoints (Order Management) - Placeholder
# ============================================================================

@router.post("/orm", response_model=HL7MessageResponse, status_code=status.HTTP_200_OK)
async def receive_orm_message(
    request: Request,
    hl7_request: HL7MessageRequest,
    db: Session = Depends(get_db)
):
    """
    Receive and process ORM (Order Management) message

    **Supported Trigger Events:**
    - O01: Order Message

    **Supported Order Control Codes:**
    - NW: New Order
    - CA: Cancel Order
    - DC: Discontinue Order
    - SC: Status Changed
    - OC: Order Canceled
    - XO: Change Order

    **Request Body:**
    - message: Raw HL7 ORM message (HL7 v2.x format with \\r separators)

    **Response:**
    - status: "success" or "error"
    - message_id: UUID of stored HL7 message
    - ack_message: HL7 ACK message (AA, AE, or AR)
    - error: Error message (if status is "error")

    **Example:**
    ```
    POST /api/hl7/orm
    {
        "message": "MSH|^~\\\\&|HIS|HOSPITAL|PACS|RADIOLOGY|20231126120000||ORM^O01|MSG001|P|2.5\\rPID|1||123456||DOE^JOHN^A||19800101|M\\rORC|NW|ORD123|||SC\\rOBR|1||ACC123|CT^CT SCAN HEAD"
    }
    ```
    """
    try:
        # Extract HTTP context
        http_context = {
            'method': request.method,
            'path': str(request.url.path),
            'client_ip': request.client.host if request.client else None,
            'user_agent': request.headers.get('user-agent'),
        }

        # Process ORM message
        handler = HL7ORMHandlerService(db)
        hl7_message, ack_message = await handler.process_orm_message(
            raw_message=hl7_request.message,
            http_context=http_context
        )

        # Return response based on processing result
        if hl7_message and hl7_message.ack_code == 'AA':
            return HL7MessageResponse(
                status="success",
                message_id=str(hl7_message.id),
                ack_message=ack_message
            )
        else:
            return HL7MessageResponse(
                status="error",
                message_id=str(hl7_message.id) if hl7_message else None,
                ack_message=ack_message,
                error=hl7_message.error_message if hl7_message else "Unknown error"
            )

    except Exception as e:
        logger.error(f"Failed to process ORM message: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process ORM message: {str(e)}"
        )


@router.get("/orm/order/{placer_order_number}/history")
async def get_order_orm_history(
    placer_order_number: str,
    limit: int = 20,
    db: Session = Depends(get_db)
):
    """
    Get ORM message history for a specific order

    **Parameters:**
    - placer_order_number: Placer order number from HL7
    - limit: Maximum number of records to return (default: 20)

    **Response:**
    List of ORM messages for the order
    """
    try:
        handler = HL7ORMHandlerService(db)
        history = await handler.get_order_history(placer_order_number, limit)

        return {
            "placer_order_number": placer_order_number,
            "count": len(history),
            "messages": history
        }

    except Exception as e:
        logger.error(f"Failed to get order ORM history: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get order history: {str(e)}"
        )


# ============================================================================
# ORU Endpoints (Observation Results) - Placeholder
# ============================================================================

@router.post("/oru", response_model=HL7MessageResponse, status_code=status.HTTP_200_OK)
async def receive_oru_message(
    request: Request,
    hl7_request: HL7MessageRequest,
    db: Session = Depends(get_db)
):
    """
    Receive and process ORU (Observation Result) message

    **Supported Trigger Events:**
    - R01: Unsolicited transmission of observation message

    **Result Status Codes:**
    - F: Final results
    - P: Preliminary results
    - C: Corrected results
    - X: Cancelled results
    - I: In progress
    - S: Partial results

    **Request Body:**
    - message: Raw HL7 ORU message (HL7 v2.x format with \\r separators)

    **Response:**
    - status: "success" or "error"
    - message_id: UUID of stored HL7 message
    - ack_message: HL7 ACK message (AA, AE, or AR)
    - error: Error message (if status is "error")

    **Example:**
    ```
    POST /api/hl7/oru
    {
        "message": "MSH|^~\\\\&|RIS|HOSPITAL|HIS|HOSPITAL|20231126120000||ORU^R01|MSG001|P|2.5\\rPID|1||123456||DOE^JOHN^A||19800101|M\\rOBR|1||ACC123|CT^CT SCAN HEAD|||F\\rOBX|1|TX|IMPRESSION||Normal study. No acute findings."
    }
    ```
    """
    try:
        # Extract HTTP context
        http_context = {
            'method': request.method,
            'path': str(request.url.path),
            'client_ip': request.client.host if request.client else None,
            'user_agent': request.headers.get('user-agent'),
        }

        # Process ORU message
        handler = HL7ORUHandlerService(db)
        hl7_message, ack_message = await handler.process_oru_message(
            raw_message=hl7_request.message,
            http_context=http_context
        )

        # Return response based on processing result
        if hl7_message and hl7_message.ack_code == 'AA':
            return HL7MessageResponse(
                status="success",
                message_id=str(hl7_message.id),
                ack_message=ack_message
            )
        else:
            return HL7MessageResponse(
                status="error",
                message_id=str(hl7_message.id) if hl7_message else None,
                ack_message=ack_message,
                error=hl7_message.error_message if hl7_message else "Unknown error"
            )

    except Exception as e:
        logger.error(f"Failed to process ORU message: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process ORU message: {str(e)}"
        )


@router.get("/oru/study/{accession_number}/history")
async def get_study_oru_history(
    accession_number: str,
    limit: int = 20,
    db: Session = Depends(get_db)
):
    """
    Get ORU message history for a specific study

    **Parameters:**
    - accession_number: Accession number
    - limit: Maximum number of records to return (default: 20)

    **Response:**
    List of ORU messages for the study
    """
    try:
        handler = HL7ORUHandlerService(db)
        history = await handler.get_results_history(accession_number, limit)

        return {
            "accession_number": accession_number,
            "count": len(history),
            "messages": history
        }

    except Exception as e:
        logger.error(f"Failed to get study ORU history: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get study history: {str(e)}"
        )


# ============================================================================
# Administrative Endpoints
# ============================================================================

@router.get("/messages/{message_id}")
async def get_message_details(
    message_id: str,
    db: Session = Depends(get_db)
):
    """
    Get details of a specific HL7 message

    **Parameters:**
    - message_id: HL7 message UUID

    **Response:**
    Complete message details including raw message, parsed data, and processing status
    """
    try:
        message = db.query(HL7Message).filter(HL7Message.id == message_id).first()

        if not message:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Message not found: {message_id}"
            )

        return message.to_dict()

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get message details: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get message details: {str(e)}"
        )


@router.get("/messages")
async def list_messages(
    message_type: Optional[str] = None,
    status: Optional[str] = None,
    patient_id: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    """
    List HL7 messages with optional filters

    **Parameters:**
    - message_type: Filter by message type (ADT, ORM, ORU)
    - status: Filter by status (RECEIVED, PROCESSING, PROCESSED, FAILED, DEAD_LETTER)
    - patient_id: Filter by patient ID
    - limit: Maximum number of records (default: 50)
    - offset: Offset for pagination (default: 0)

    **Response:**
    List of HL7 messages with pagination info
    """
    try:
        query = db.query(HL7Message)

        if message_type:
            query = query.filter(HL7Message.message_type == message_type)
        if status:
            query = query.filter(HL7Message.status == status)
        if patient_id:
            query = query.filter(HL7Message.patient_id == patient_id)

        total = query.count()
        messages = query.order_by(
            HL7Message.created_at.desc()
        ).limit(limit).offset(offset).all()

        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "messages": [msg.to_list_dict() for msg in messages]
        }

    except Exception as e:
        logger.error(f"Failed to list messages: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list messages: {str(e)}"
        )


@router.get("/errors/statistics")
async def get_error_statistics(
    hours: int = 24,
    db: Session = Depends(get_db)
):
    """
    Get error statistics for monitoring

    **Parameters:**
    - hours: Number of hours to look back (default: 24)

    **Response:**
    Error statistics including error counts by type, dead letter queue size, etc.
    """
    try:
        error_handler = HL7ErrorHandlerService(db)
        stats = await error_handler.get_error_statistics(hours)

        return stats

    except Exception as e:
        logger.error(f"Failed to get error statistics: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get error statistics: {str(e)}"
        )


@router.get("/errors/dead-letter")
async def get_dead_letter_messages(
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    """
    Get messages in dead letter queue

    **Parameters:**
    - limit: Maximum number of records (default: 50)
    - offset: Offset for pagination (default: 0)

    **Response:**
    List of messages that failed after maximum retries
    """
    try:
        error_handler = HL7ErrorHandlerService(db)
        result = await error_handler.get_dead_letter_messages(limit, offset)

        return result

    except Exception as e:
        logger.error(f"Failed to get dead letter messages: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get dead letter messages: {str(e)}"
        )


@router.post("/errors/dead-letter/{message_id}/reprocess")
async def reprocess_dead_letter_message(
    message_id: str,
    db: Session = Depends(get_db)
):
    """
    Reprocess a message from dead letter queue

    **Parameters:**
    - message_id: Message UUID to reprocess

    **Response:**
    Success/failure status
    """
    try:
        error_handler = HL7ErrorHandlerService(db)
        success = await error_handler.reprocess_dead_letter_message(message_id)

        if success:
            return {"status": "success", "message": f"Message {message_id} requeued for processing"}
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to reprocess message"
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to reprocess message: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to reprocess message: {str(e)}"
        )


@router.get("/health")
async def hl7_health_check(db: Session = Depends(get_db)):
    """
    Health check endpoint for HL7 integration

    **Response:**
    Health status including message processing statistics
    """
    try:
        from sqlalchemy import text

        # Get message counts by status
        query = text("""
            SELECT status, COUNT(*) as count
            FROM hl7_messages
            WHERE created_at >= NOW() - INTERVAL '24 hours'
            GROUP BY status
        """)

        result = db.execute(query)
        status_counts = {row[0]: row[1] for row in result}

        return {
            "status": "healthy",
            "service": "HL7 Integration",
            "last_24h_statistics": status_counts,
            "endpoints": {
                "adt": "operational",
                "orm": "operational",
                "oru": "operational"
            }
        }

    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return {
            "status": "unhealthy",
            "error": str(e)
        }
