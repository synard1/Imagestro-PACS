"""
CSRF Protection Middleware for FastAPI
Validates CSRF tokens for state-changing requests
"""

from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
import secrets
import hashlib
import time
import logging
from typing import Optional

logger = logging.getLogger(__name__)


class CSRFMiddleware(BaseHTTPMiddleware):
    """
    CSRF Protection Middleware
    
    Validates CSRF tokens for POST, PUT, PATCH, DELETE requests.
    Tokens are validated using HMAC-based verification.
    """
    
    def __init__(
        self,
        app,
        secret_key: str,
        token_header: str = "X-CSRF-Token",
        exempt_paths: Optional[list] = None,
        token_expiry: int = 3600  # 1 hour in seconds
    ):
        super().__init__(app)
        self.secret_key = secret_key
        self.token_header = token_header
        self.exempt_paths = exempt_paths or [
            "/api/health",
            "/api/docs",
            "/api/redoc",
            "/api/openapi.json",
        ]
        self.token_expiry = token_expiry
        
    def _is_exempt(self, path: str) -> bool:
        """Check if path is exempt from CSRF protection"""
        for exempt_path in self.exempt_paths:
            if path.startswith(exempt_path):
                return True
        return False
    
    def _is_state_changing(self, method: str) -> bool:
        """Check if HTTP method is state-changing"""
        return method in ["POST", "PUT", "PATCH", "DELETE"]
    
    def _generate_token_signature(self, token: str, timestamp: str) -> str:
        """Generate HMAC signature for token"""
        message = f"{token}:{timestamp}"
        signature = hashlib.sha256(
            f"{message}:{self.secret_key}".encode()
        ).hexdigest()
        return signature
    
    def _validate_token(self, token: str) -> bool:
        """
        Validate CSRF token
        
        Token format: {random_token}:{timestamp}:{signature}
        """
        try:
            parts = token.split(":")
            if len(parts) != 3:
                logger.warning(f"Invalid CSRF token format: {len(parts)} parts")
                return False
            
            random_token, timestamp_str, provided_signature = parts
            
            # Check token expiry
            try:
                timestamp = int(timestamp_str)
                current_time = int(time.time())
                
                if current_time - timestamp > self.token_expiry:
                    logger.warning(f"CSRF token expired: {current_time - timestamp}s old")
                    return False
            except ValueError:
                logger.warning(f"Invalid timestamp in CSRF token: {timestamp_str}")
                return False
            
            # Validate signature
            expected_signature = self._generate_token_signature(
                random_token, 
                timestamp_str
            )
            
            if provided_signature != expected_signature:
                logger.warning("CSRF token signature mismatch")
                return False
            
            return True
            
        except Exception as e:
            logger.error(f"Error validating CSRF token: {e}")
            return False
    
    async def dispatch(self, request: Request, call_next):
        """Process request and validate CSRF token if needed"""
        
        # Skip CSRF check for exempt paths
        if self._is_exempt(request.url.path):
            return await call_next(request)
        
        # Skip CSRF check for safe methods (GET, HEAD, OPTIONS)
        if not self._is_state_changing(request.method):
            return await call_next(request)

        # Skip CSRF check if API authentication is present (Bearer or API Key)
        # CSRF attacks target cookie-based authentication. If using tokens/keys, CSRF is not a threat vector.
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            return await call_next(request)
            
        api_key = request.headers.get("X-API-Key")
        if api_key:
            return await call_next(request)
        
        # Get CSRF token from header
        csrf_token = request.headers.get(self.token_header)
        
        if not csrf_token:
            logger.warning(
                f"CSRF token missing for {request.method} {request.url.path} "
                f"from {request.client.host if request.client else 'unknown'}"
            )
            from starlette.responses import JSONResponse
            return JSONResponse(
                status_code=403,
                content={
                    "error": "CSRF token missing",
                    "message": "CSRF token is required for this request",
                    "header": self.token_header
                }
            )
        
        # Validate CSRF token
        if not self._validate_token(csrf_token):
            logger.warning(
                f"Invalid CSRF token for {request.method} {request.url.path} "
                f"from {request.client.host if request.client else 'unknown'}"
            )
            from starlette.responses import JSONResponse
            return JSONResponse(
                status_code=403,
                content={
                    "error": "Invalid CSRF token",
                    "message": "The provided CSRF token is invalid or expired"
                }
            )
        
        # Token is valid, proceed with request
        logger.debug(f"CSRF token validated for {request.method} {request.url.path}")
        return await call_next(request)


def generate_csrf_token(secret_key: str) -> str:
    """
    Generate a new CSRF token
    
    Token format: {random_token}:{timestamp}:{signature}
    """
    random_token = secrets.token_urlsafe(32)
    timestamp = str(int(time.time()))
    
    # Generate signature
    signature = hashlib.sha256(
        f"{random_token}:{timestamp}:{secret_key}".encode()
    ).hexdigest()
    
    token = f"{random_token}:{timestamp}:{signature}"
    return token
