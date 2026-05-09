"""
Audit Context Middleware
Captures user information from requests for audit logging
"""

import logging
import time
from typing import Callable
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

logger = logging.getLogger(__name__)


class AuditContextMiddleware(BaseHTTPMiddleware):
    """
    Middleware to capture and store user/request context for audit logging

    This middleware:
    - Extracts user information from headers or JWT tokens
    - Stores user info in request.state for access by audit helpers
    - Tracks request timing for performance auditing
    - Captures response status for audit logs
    """

    def __init__(self, app: ASGIApp):
        super().__init__(app)

    async def dispatch(
        self, request: Request, call_next: Callable
    ) -> Response:
        """
        Process request and inject audit context

        Args:
            request: FastAPI Request
            call_next: Next middleware/route handler

        Returns:
            Response from the route handler
        """
        # Start timing
        start_time = time.time()

        # Extract user information from various sources
        user_id = None
        username = None
        user_role = None

        # Priority 1: Check custom headers (for external integrations)
        user_id = request.headers.get('X-User-ID')
        username = request.headers.get('X-Username')
        user_role = request.headers.get('X-User-Role')

        # Priority 2: Check Authorization header (JWT token)
        if not user_id:
            auth_header = request.headers.get('Authorization')
            if auth_header and auth_header.startswith('Bearer '):
                try:
                    # Extract from JWT token
                    user_info = self._extract_user_from_jwt(auth_header)
                    user_id = user_info.get('user_id')
                    username = user_info.get('username')
                    user_role = user_info.get('role')
                except Exception as e:
                    logger.warning(f"Failed to extract user from JWT: {e}")

        # Priority 3: Check session (if session middleware is enabled)
        if not user_id:
            try:
                user_id = request.session.get('user_id')
                username = request.session.get('username')
                user_role = request.session.get('user_role')
            except (AttributeError, AssertionError):
                # SessionMiddleware not installed, skip session check
                pass

        # Store in request.state for access by audit helpers
        request.state.user_id = user_id
        request.state.username = username or 'anonymous'
        request.state.user_role = user_role or 'UNKNOWN'
        request.state.audit_start_time = start_time

        # Also store session ID if available
        request.state.session_id = request.headers.get('X-Session-ID')

        # Process request
        response = await call_next(request)

        # Calculate response time
        end_time = time.time()
        response_time_ms = int((end_time - start_time) * 1000)

        # Store response info in state
        request.state.response_time_ms = response_time_ms
        request.state.response_status = response.status_code

        # AUTOMATIC AUDIT LOGGING (Background Task)
        # Skip for health checks and internal telemetry
        path = str(request.url.path)
        if not any(skip in path for skip in ['/health', '/metrics', '/docs', '/openapi.json']):
            try:
                from fastapi import BackgroundTasks
                from app.utils.audit_helper import AuditHelper
                from app.database import SessionLocal

                async def log_request_audit():
                    with SessionLocal() as db:
                        await AuditHelper.log_crud_operation(
                            db=db,
                            action=request.method,
                            resource_type="ENDPOINT",
                            resource_id=path,
                            request=request,
                            response_status=response.status_code,
                            response_time_ms=response_time_ms
                        )

                # Use Starlette background task if possible, otherwise just run it
                # Since we are in middleware, we can't easily add to FastAPI BackgroundTasks
                # but we can trigger it manually
                import asyncio
                asyncio.create_task(log_request_audit()) # FIRE AND FORGET
            except Exception as e:
                logger.warning(f"Failed to queue automatic audit log: {e}")

        # Add audit headers to response
        response.headers['X-Response-Time-Ms'] = str(response_time_ms)

        return response

    def _extract_user_from_jwt(self, auth_header: str) -> dict:
        """
        Extract user information from JWT token

        Args:
            auth_header: Authorization header value

        Returns:
            Dictionary with user_id, username, role
        """
        try:
            import jwt
            from app.config import settings

            token = auth_header.replace('Bearer ', '')

            # Decode JWT using actual settings
            payload = jwt.decode(
                token,
                settings.jwt_secret,
                algorithms=[settings.jwt_algorithm],
                options={"verify_exp": False} # More robust for audit context
            )

            return {
                'user_id': payload.get('user_id') or payload.get('sub'),
                'username': payload.get('username') or payload.get('email'),
                'role': payload.get('role') or payload.get('user_role')
            }

        except Exception as e:
            logger.debug(f"JWT decode failed: {e}")
            return {}


def get_current_user_context(request: Request) -> dict:
    """
    Get current user context from request state

    Args:
        request: FastAPI Request

    Returns:
        Dictionary with user_id, username, user_role
    """
    return {
        'user_id': getattr(request.state, 'user_id', None),
        'username': getattr(request.state, 'username', 'anonymous'),
        'user_role': getattr(request.state, 'user_role', 'UNKNOWN')
    }


def get_response_metrics(request: Request) -> dict:
    """
    Get response metrics from request state

    Args:
        request: FastAPI Request

    Returns:
        Dictionary with response_time_ms, response_status
    """
    return {
        'response_time_ms': getattr(request.state, 'response_time_ms', None),
        'response_status': getattr(request.state, 'response_status', None)
    }
