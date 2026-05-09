from fastapi import APIRouter, Depends, HTTPException, status, Header, Request
from app.config import settings
from app.middleware.csrf import generate_csrf_token
from app.middleware.auth import decode_token
import logging

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/csrf",
    tags=["Security"]
)

async def verify_access(
    request: Request,
    api_key: str = Header(None, alias="X-API-Key")
):
    """
    Verify access via API Key or JWT Token.
    """
    # 1. Check API Key
    if api_key and api_key == settings.secret_key:
        return True

    # 2. Check JWT Token
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        try:
            decode_token(token)
            return True
        except Exception as e:
            logger.warning(f"CSRF Endpoint - Invalid JWT: {e}")
            pass
            
    # 3. If both fail, deny access
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required. Provide X-API-Key or Bearer Token."
    )

@router.get("/token", dependencies=[Depends(verify_access)])
async def get_csrf_token():
    """
    Generate a new CSRF token.
    The token is valid for 1 hour by default.
    Requires authentication (X-API-Key or Bearer Token).
    """
    token = generate_csrf_token(settings.secret_key)
    return {
        "token": token,
        "expires_in": 3600
    }

@router.post("/refresh", dependencies=[Depends(verify_access)])
async def refresh_csrf_token():
    """
    Refresh an existing CSRF token.
    Returns a new token with a fresh timestamp.
    Requires authentication (X-API-Key or Bearer Token).
    """
    token = generate_csrf_token(settings.secret_key)
    return {
        "token": token,
        "expires_in": 3600
    }
