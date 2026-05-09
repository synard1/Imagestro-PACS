from fastapi import Request, Response
from typing import Callable
from fastapi.routing import APIRoute
from fastapi.concurrency import run_in_threadpool
import json
import hashlib
import redis
import os

# Redis connection pool
redis_pool = redis.ConnectionPool.from_url(
    os.getenv('CELERY_BROKER_URL', 'redis://redis:6379/1'),
    decode_responses=True
)

class CacheRoute(APIRoute):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.redis = redis.Redis(connection_pool=redis_pool)
        self.default_ttl = 300  # 5 minutes

    def get_cache_key(self, request: Request) -> str:
        """Generate unique cache key from request"""
        path = request.url.path
        query = request.url.query
        method = request.method
        key_str = f"{method}:{path}?{query}"
        return hashlib.md5(key_str.encode()).hexdigest()

    async def dispatch(self, request: Request) -> Response:
        # Skip caching for non-GET requests
        if request.method != 'GET':
            return await super().dispatch(request)

        cache_key = self.get_cache_key(request)
        cached_response = self.redis.get(cache_key)

        if cached_response:
            # Return cached response
            return Response(
                content=json.loads(cached_response),
                status_code=200,
                media_type="application/json"
            )

        # Process request normally
        response = await super().dispatch(request)

        # Only cache successful responses
        if response.status_code == 200:
            # Get response body for caching
            response_body = b""
            async for chunk in response.body_iterator:
                response_body += chunk
            
            # Create new response with cached body
            response = Response(
                content=response_body,
                status_code=response.status_code,
                headers=dict(response.headers),
                media_type=response.media_type
            )
            
            # Cache the response body
            await run_in_threadpool(
                self.redis.setex,
                cache_key,
                self.default_ttl,
                response_body.decode()
            )

        return response
