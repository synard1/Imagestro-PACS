"""
Global Error Handler Middleware
Catches and formats all errors with user-friendly messages
"""

import logging
import traceback
from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from sqlalchemy.exc import SQLAlchemyError
from typing import Union

logger = logging.getLogger(__name__)


class ErrorResponse:
    """Standardized error response format"""
    
    @staticmethod
    def format(
        status_code: int,
        error_type: str,
        message: str,
        details: dict = None,
        request_id: str = None
    ) -> dict:
        """
        Format error response
        
        Args:
            status_code: HTTP status code
            error_type: Error type/category
            message: User-friendly error message
            details: Additional error details
            request_id: Request ID for tracking
        
        Returns:
            Formatted error response dict
        """
        response = {
            "status": "error",
            "error": {
                "type": error_type,
                "message": message,
                "code": status_code
            }
        }
        
        if details:
            response["error"]["details"] = details
        
        if request_id:
            response["request_id"] = request_id
        
        return response


async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """Handle HTTP exceptions"""
    logger.warning(
        f"HTTP {exc.status_code} error on {request.method} {request.url.path}: {exc.detail}"
    )
    
    return JSONResponse(
        status_code=exc.status_code,
        content=ErrorResponse.format(
            status_code=exc.status_code,
            error_type="HTTPError",
            message=exc.detail,
            request_id=getattr(request.state, "request_id", None)
        )
    )


async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle validation errors"""
    errors = []
    for error in exc.errors():
        errors.append({
            "field": " -> ".join(str(loc) for loc in error["loc"]),
            "message": error["msg"],
            "type": error["type"]
        })
    
    logger.warning(
        f"Validation error on {request.method} {request.url.path}: {errors}"
    )
    
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content=ErrorResponse.format(
            status_code=422,
            error_type="ValidationError",
            message="Request validation failed",
            details={"errors": errors},
            request_id=getattr(request.state, "request_id", None)
        )
    )


async def database_exception_handler(request: Request, exc: SQLAlchemyError):
    """Handle database errors"""
    logger.error(
        f"Database error on {request.method} {request.url.path}: {exc}",
        exc_info=True
    )
    
    # Don't expose internal database errors to users
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=ErrorResponse.format(
            status_code=500,
            error_type="DatabaseError",
            message="A database error occurred. Please try again later.",
            details={"error_type": type(exc).__name__} if logger.level == logging.DEBUG else None,
            request_id=getattr(request.state, "request_id", None)
        )
    )


async def general_exception_handler(request: Request, exc: Exception):
    """Handle all other exceptions"""
    logger.error(
        f"Unhandled exception on {request.method} {request.url.path}: {exc}",
        exc_info=True
    )
    
    # Log full traceback
    logger.error(f"Traceback: {traceback.format_exc()}")
    
    # User-friendly error message
    message = "An unexpected error occurred. Please try again later."
    
    # In debug mode, include more details
    details = None
    if logger.level == logging.DEBUG:
        details = {
            "error_type": type(exc).__name__,
            "error_message": str(exc),
            "traceback": traceback.format_exc().split("\n")
        }
    
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=ErrorResponse.format(
            status_code=500,
            error_type="InternalServerError",
            message=message,
            details=details,
            request_id=getattr(request.state, "request_id", None)
        )
    )


def register_error_handlers(app):
    """
    Register all error handlers with FastAPI app
    
    Args:
        app: FastAPI application instance
    """
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(SQLAlchemyError, database_exception_handler)
    app.add_exception_handler(Exception, general_exception_handler)
    
    logger.info("Error handlers registered")


# Custom exceptions
class PACSError(Exception):
    """Base exception for PACS-specific errors"""
    pass


class DicomStorageError(PACSError):
    """DICOM storage operation failed"""
    pass


class DicomParsingError(PACSError):
    """DICOM file parsing failed"""
    pass


class DicomCommunicationError(PACSError):
    """DICOM network communication failed"""
    pass


class StorageFullError(PACSError):
    """Storage capacity exceeded"""
    pass


class NodeNotFoundError(PACSError):
    """DICOM node not found"""
    pass
