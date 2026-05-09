"""
Rate Limiting Middleware
Protects API endpoints from abuse with token bucket algorithm
"""

import logging
import time
from typing import Dict, Callable
from fastapi import Request, Response, HTTPException
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.status import HTTP_429_TOO_MANY_REQUESTS
import redis
import json

logger = logging.getLogger(__name__)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Rate limiting middleware using Redis for distributed rate limiting

    Features:
    - Token bucket algorithm
    - Per-IP and per-user rate limiting
    - Configurable limits per endpoint
    - Redis-based for multi-instance support
    """

    def __init__(
        self,
        app,
        redis_url: str = "redis://localhost:6379/0",
        default_rate: int = 100,  # requests per window
        default_window: int = 60,  # window in seconds
        enabled: bool = True
    ):
        """
        Initialize rate limiting middleware

        Args:
            app: FastAPI application
            redis_url: Redis connection URL
            default_rate: Default number of requests allowed per window
            default_window: Time window in seconds
            enabled: Whether rate limiting is enabled
        """
        super().__init__(app)
        self.enabled = enabled
        self.default_rate = default_rate
        self.default_window = default_window

        # Endpoint-specific rate limits (requests per minute)
        self.endpoint_limits = {
            '/api/bulk/upload': (10, 60),  # 10 uploads per minute
            '/api/bulk/download': (20, 60),  # 20 downloads per minute
            '/api/bulk/search': (60, 60),  # 60 searches per minute
            '/api/dicom/upload': (30, 60),  # 30 uploads per minute
            '/api/metrics': (120, 60),  # 120 requests per minute
            '/api/studies': (100, 60),  # 100 requests per minute
        }

        # Initialize Redis connection
        try:
            self.redis_client = redis.from_url(
                redis_url,
                decode_responses=True,
                socket_timeout=2,
                socket_connect_timeout=2
            )
            # Test connection
            self.redis_client.ping()
            logger.info(f"Rate limiting initialized with Redis: {redis_url}")
        except Exception as e:
            logger.warning(f"Redis connection failed, rate limiting disabled: {e}")
            self.enabled = False
            self.redis_client = None

    def _get_client_identifier(self, request: Request) -> str:
        """
        Get unique identifier for client

        Args:
            request: FastAPI request

        Returns:
            Client identifier (IP or user ID)
        """
        # Try to get user ID from headers
        user_id = request.headers.get('X-User-ID')
        if user_id:
            return f"user:{user_id}"

        # Fall back to IP address
        forwarded = request.headers.get('X-Forwarded-For')
        if forwarded:
            # Get first IP in chain
            ip = forwarded.split(',')[0].strip()
        else:
            ip = request.client.host if request.client else 'unknown'

        return f"ip:{ip}"

    def _get_rate_limit(self, path: str) -> tuple[int, int]:
        """
        Get rate limit for specific endpoint

        Args:
            path: Request path

        Returns:
            Tuple of (rate, window)
        """
        # Check for exact match
        if path in self.endpoint_limits:
            return self.endpoint_limits[path]

        # Check for prefix match
        for endpoint_pattern, limits in self.endpoint_limits.items():
            if path.startswith(endpoint_pattern):
                return limits

        # Return default
        return (self.default_rate, self.default_window)

    def _check_rate_limit(
        self,
        client_id: str,
        path: str
    ) -> tuple[bool, Dict]:
        """
        Check if request is within rate limit

        Args:
            client_id: Client identifier
            path: Request path

        Returns:
            Tuple of (is_allowed, info_dict)
        """
        if not self.enabled or not self.redis_client:
            return True, {}

        try:
            rate, window = self._get_rate_limit(path)
            current_time = int(time.time())
            window_start = current_time - window

            # Redis key for this client+endpoint
            key = f"ratelimit:{client_id}:{path}:{current_time // window}"

            # Increment request count
            pipe = self.redis_client.pipeline()
            pipe.incr(key)
            pipe.expire(key, window * 2)  # Keep for 2 windows
            results = pipe.execute()

            current_count = results[0]

            # Check if over limit
            is_allowed = current_count <= rate

            info = {
                'limit': rate,
                'remaining': max(0, rate - current_count),
                'reset': (current_time // window + 1) * window,
                'window': window
            }

            if not is_allowed:
                logger.warning(
                    f"Rate limit exceeded: {client_id} on {path} "
                    f"({current_count}/{rate} in {window}s)"
                )

            return is_allowed, info

        except Exception as e:
            logger.error(f"Rate limit check failed: {e}", exc_info=True)
            # On error, allow request (fail open)
            return True, {}

    async def dispatch(
        self,
        request: Request,
        call_next: Callable
    ) -> Response:
        """
        Process request with rate limiting

        Args:
            request: Incoming request
            call_next: Next middleware/handler

        Returns:
            Response
        """
        # Skip rate limiting for health checks and docs
        if request.url.path in ['/api/health', '/api/docs', '/api/redoc', '/api/openapi.json', '/api']:
            return await call_next(request)

        # Get client identifier
        client_id = self._get_client_identifier(request)

        # Check rate limit
        is_allowed, limit_info = self._check_rate_limit(
            client_id,
            request.url.path
        )

        # Add rate limit headers to response
        def add_rate_limit_headers(response: Response):
            if limit_info:
                response.headers['X-RateLimit-Limit'] = str(limit_info['limit'])
                response.headers['X-RateLimit-Remaining'] = str(limit_info['remaining'])
                response.headers['X-RateLimit-Reset'] = str(limit_info['reset'])
            return response

        if not is_allowed:
            # Rate limit exceeded
            retry_after = limit_info.get('reset', 0) - int(time.time())

            return JSONResponse(
                status_code=HTTP_429_TOO_MANY_REQUESTS,
                content={
                    'error': 'Rate limit exceeded',
                    'message': f"Too many requests. Please try again in {retry_after} seconds.",
                    'limit': limit_info.get('limit'),
                    'retry_after': retry_after
                },
                headers={
                    'Retry-After': str(retry_after),
                    'X-RateLimit-Limit': str(limit_info.get('limit', 0)),
                    'X-RateLimit-Remaining': '0',
                    'X-RateLimit-Reset': str(limit_info.get('reset', 0))
                }
            )

        # Process request
        response = await call_next(request)

        # Add rate limit headers
        response = add_rate_limit_headers(response)

        return response


class InMemoryRateLimiter:
    """
    Simple in-memory rate limiter (fallback when Redis not available)
    Not suitable for multi-instance deployments
    """

    def __init__(self, default_rate: int = 100, default_window: int = 60):
        """Initialize in-memory rate limiter"""
        self.default_rate = default_rate
        self.default_window = default_window
        self.requests: Dict[str, list] = {}

    def check_rate_limit(
        self,
        client_id: str,
        rate: int = None,
        window: int = None
    ) -> tuple[bool, Dict]:
        """
        Check rate limit using in-memory storage

        Args:
            client_id: Client identifier
            rate: Request limit (uses default if None)
            window: Time window in seconds (uses default if None)

        Returns:
            Tuple of (is_allowed, info_dict)
        """
        rate = rate or self.default_rate
        window = window or self.default_window
        current_time = time.time()
        window_start = current_time - window

        # Initialize if not exists
        if client_id not in self.requests:
            self.requests[client_id] = []

        # Clean old requests
        self.requests[client_id] = [
            req_time for req_time in self.requests[client_id]
            if req_time > window_start
        ]

        # Check limit
        current_count = len(self.requests[client_id])
        is_allowed = current_count < rate

        if is_allowed:
            # Add current request
            self.requests[client_id].append(current_time)

        info = {
            'limit': rate,
            'remaining': max(0, rate - current_count - 1) if is_allowed else 0,
            'reset': int(current_time + window),
            'window': window
        }

        return is_allowed, info

    def cleanup_old_entries(self, max_age: int = 3600):
        """
        Cleanup old entries to prevent memory leak

        Args:
            max_age: Maximum age of entries to keep
        """
        current_time = time.time()
        cutoff_time = current_time - max_age

        # Remove clients with no recent requests
        clients_to_remove = []
        for client_id, timestamps in self.requests.items():
            if not timestamps or max(timestamps) < cutoff_time:
                clients_to_remove.append(client_id)

        for client_id in clients_to_remove:
            del self.requests[client_id]

        logger.debug(f"Cleaned up {len(clients_to_remove)} old rate limit entries")


class RateLimiter:
    """
    Simple callable rate limiter dependency for FastAPI endpoints.

    Usage:
        @router.get("/endpoint", dependencies=[Depends(RateLimiter(calls=100, period=60))])
        async def endpoint(...):
            ...

    This is a lightweight, in-memory rate limiter suitable for single-instance deployments
    or for endpoints that need custom limits independent of the global middleware.
    """

    def __init__(self, calls: int = 100, period: int = 60):
        """
        Initialize rate limiter

        Args:
            calls: Number of allowed calls in period
            period: Time period in seconds
        """
        self.calls = calls
        self.period = period
        # Use module-level storage for simplicity; not shared across instances but that's okay
        self._requests: Dict[str, list] = {}

    def _get_client_id(self, request: Request) -> str:
        """Get client identifier from request"""
        # Try user ID from header
        user_id = request.headers.get('X-User-ID')
        if user_id:
            return f"user:{user_id}"

        # Fall back to IP
        forwarded = request.headers.get('X-Forwarded-For')
        if forwarded:
            ip = forwarded.split(',')[0].strip()
        else:
            ip = request.client.host if request.client else 'unknown'

        return f"ip:{ip}"

    async def __call__(self, request: Request) -> bool:
        """
        Check rate limit for this request
        Returns True if allowed, raises HTTPException if limit exceeded
        """
        client_id = self._get_client_id(request)
        current_time = time.time()

        # Initialize client tracking if needed
        if client_id not in self._requests:
            self._requests[client_id] = []

        # Clean old requests
        cutoff = current_time - self.period
        self._requests[client_id] = [
            req_time for req_time in self._requests[client_id]
            if req_time > cutoff
        ]

        request_count = len(self._requests[client_id])

        if request_count >= self.calls:
            # Rate limit exceeded
            oldest_request = min(self._requests[client_id]) if self._requests[client_id] else current_time
            reset_time = oldest_request + self.period
            retry_after = int(reset_time - current_time)

            raise HTTPException(
                status_code=429,
                detail={
                    "error": "Rate limit exceeded",
                    "message": f"Too many requests. Try again in {retry_after} seconds.",
                    "limit": self.calls,
                    "retry_after": retry_after
                },
                headers={
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Limit": str(self.calls),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(int(reset_time))
                }
            )

        # Allow request and record it
        self._requests[client_id].append(current_time)
        return True
