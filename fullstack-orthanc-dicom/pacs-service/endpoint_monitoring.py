"""
Enhanced Endpoint-Level Monitoring for PACS Service (FastAPI)
Track individual endpoints dengan detail: latency, errors, throughput, DICOM specifics

Features:
- Track setiap endpoint URL secara terpisah
- Identifikasi endpoint yang slow/stuck
- DICOM-specific endpoint metrics
- Request/response size tracking
- Slow endpoint detection & alerting
"""

import os
import time
import logging
import json
import re
from datetime import datetime
from typing import Optional, Dict, List
from collections import defaultdict

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from prometheus_client import Counter, Histogram, Gauge

logger = logging.getLogger(__name__)

# ============================================================================
# ENDPOINT-LEVEL METRICS (Granular tracking per endpoint)
# ============================================================================

# Per-endpoint request metrics
endpoint_requests_total = Counter(
    'endpoint_requests_total',
    'Total requests per endpoint',
    ['method', 'endpoint', 'status_code', 'service']
)

endpoint_request_duration_seconds = Histogram(
    'endpoint_request_duration_seconds',
    'Request duration per endpoint (detailed)',
    ['method', 'endpoint', 'status_code', 'service'],
    buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1.0, 2.5, 5.0, 10.0, 30.0)
)

endpoint_request_size_bytes = Histogram(
    'endpoint_request_size_bytes',
    'Request payload size per endpoint',
    ['method', 'endpoint', 'service'],
    buckets=(100, 1000, 10000, 100000, 1000000)
)

endpoint_response_size_bytes = Histogram(
    'endpoint_response_size_bytes',
    'Response payload size per endpoint',
    ['method', 'endpoint', 'service'],
    buckets=(100, 1000, 10000, 100000, 1000000)
)

endpoint_errors_total = Counter(
    'endpoint_errors_total',
    'Total errors per endpoint',
    ['method', 'endpoint', 'status_code', 'error_type', 'service']
)

endpoint_slow_requests_total = Counter(
    'endpoint_slow_requests_total',
    'Requests exceeding threshold per endpoint',
    ['method', 'endpoint', 'threshold_ms', 'service']
)

# Current request count (in-flight requests)
endpoint_requests_inflight = Gauge(
    'endpoint_requests_inflight',
    'Current in-flight requests per endpoint',
    ['method', 'endpoint', 'service']
)

endpoint_stuck_requests_total = Counter(
    'endpoint_stuck_requests_total',
    'Requests taking >threshold seconds per endpoint',
    ['method', 'endpoint', 'threshold_seconds', 'service']
)

endpoint_max_duration_ever = Gauge(
    'endpoint_max_duration_ever',
    'Maximum duration ever recorded per endpoint',
    ['method', 'endpoint', 'service']
)

# DICOM-specific endpoint metrics
dicom_endpoint_studies_total = Counter(
    'dicom_endpoint_studies_total',
    'DICOM studies processed per endpoint',
    ['endpoint', 'status', 'service']
)

dicom_endpoint_processing_duration_seconds = Histogram(
    'dicom_endpoint_processing_duration_seconds',
    'DICOM processing duration per endpoint',
    ['endpoint', 'operation', 'service'],
    buckets=(0.1, 0.5, 1.0, 2.5, 5.0, 10.0, 25.0, 50.0)
)

# ============================================================================
# ENDPOINT PERFORMANCE TRACKING
# ============================================================================

class EndpointPerformanceTracker:
    """Track detailed performance metrics per endpoint"""
    
    def __init__(self):
        self.endpoints: Dict[str, dict] = defaultdict(lambda: {
            'total_requests': 0,
            'total_errors': 0,
            'total_duration': 0.0,
            'durations': [],
            'status_codes': defaultdict(int),
            'error_types': defaultdict(int),
            'max_duration': 0.0,
            'min_duration': float('inf'),
            'request_sizes': [],
            'response_sizes': [],
        })
    
    def record(
        self,
        method: str,
        endpoint: str,
        duration: float,
        status_code: int,
        request_size: int = 0,
        response_size: int = 0,
        error_type: Optional[str] = None
    ):
        """Record metrics for an endpoint"""
        
        key = f"{method} {endpoint}"
        stats = self.endpoints[key]
        
        stats['total_requests'] += 1
        stats['total_duration'] += duration
        stats['durations'].append(duration)
        stats['status_codes'][status_code] += 1
        stats['max_duration'] = max(stats['max_duration'], duration)
        stats['min_duration'] = min(stats['min_duration'], duration)
        
        if request_size > 0:
            stats['request_sizes'].append(request_size)
        if response_size > 0:
            stats['response_sizes'].append(response_size)
        
        if status_code >= 400:
            stats['total_errors'] += 1
            if error_type:
                stats['error_types'][error_type] += 1
        
        # Keep only last 1000 durations
        if len(stats['durations']) > 1000:
            stats['durations'] = stats['durations'][-1000:]
            stats['request_sizes'] = stats['request_sizes'][-1000:]
            stats['response_sizes'] = stats['response_sizes'][-1000:]
    
    def get_slowest_endpoints(self, top_n: int = 10) -> List[dict]:
        """Get slowest endpoints by average duration"""
        
        endpoints_list = []
        for key, stats in self.endpoints.items():
            if stats['total_requests'] == 0:
                continue
            
            method, endpoint = key.split(' ', 1)
            avg_duration = stats['total_duration'] / stats['total_requests']
            error_rate = (stats['total_errors'] / stats['total_requests']) * 100
            
            endpoints_list.append({
                'method': method,
                'endpoint': endpoint,
                'avg_duration_ms': avg_duration * 1000,
                'max_duration_ms': stats['max_duration'] * 1000,
                'min_duration_ms': stats['min_duration'] * 1000,
                'total_requests': stats['total_requests'],
                'error_rate_percent': error_rate,
                'total_errors': stats['total_errors'],
            })
        
        return sorted(endpoints_list, key=lambda x: x['avg_duration_ms'], reverse=True)[:top_n]
    
    def get_stuck_endpoints(self, threshold_seconds: int = 5) -> List[dict]:
        """Get endpoints with requests >threshold"""
        
        stuck_list = []
        for key, stats in self.endpoints.items():
            if stats['durations']:
                slow_count = sum(1 for d in stats['durations'] if d > threshold_seconds)
                if slow_count > 0:
                    method, endpoint = key.split(' ', 1)
                    stuck_list.append({
                        'method': method,
                        'endpoint': endpoint,
                        'max_duration_ms': stats['max_duration'] * 1000,
                        'stuck_requests_count': slow_count,
                        'stuck_percentage': (slow_count / len(stats['durations'])) * 100,
                    })
        
        return sorted(stuck_list, key=lambda x: x['max_duration_ms'], reverse=True)
    
    def get_detailed_stats(self, endpoint_key: Optional[str] = None) -> dict:
        """Get detailed statistics for endpoint(s)"""
        
        result = {}
        
        if endpoint_key:
            endpoints_to_check = {endpoint_key: self.endpoints[endpoint_key]} if endpoint_key in self.endpoints else {}
        else:
            endpoints_to_check = self.endpoints
        
        for key, stats in endpoints_to_check.items():
            if stats['total_requests'] == 0:
                continue
            
            method, endpoint = key.split(' ', 1)
            durations_sorted = sorted(stats['durations'])
            
            p50 = durations_sorted[len(durations_sorted) // 2] if durations_sorted else 0
            p95 = durations_sorted[int(len(durations_sorted) * 0.95)] if durations_sorted else 0
            p99 = durations_sorted[int(len(durations_sorted) * 0.99)] if durations_sorted else 0
            
            avg_request_size = (sum(stats['request_sizes']) / len(stats['request_sizes'])) if stats['request_sizes'] else 0
            avg_response_size = (sum(stats['response_sizes']) / len(stats['response_sizes'])) if stats['response_sizes'] else 0
            
            result[key] = {
                'method': method,
                'endpoint': endpoint,
                'total_requests': stats['total_requests'],
                'total_errors': stats['total_errors'],
                'error_rate_percent': (stats['total_errors'] / stats['total_requests'] * 100) if stats['total_requests'] > 0 else 0,
                'avg_duration_ms': (stats['total_duration'] / stats['total_requests']) * 1000,
                'min_duration_ms': stats['min_duration'] * 1000,
                'max_duration_ms': stats['max_duration'] * 1000,
                'p50_duration_ms': p50 * 1000,
                'p95_duration_ms': p95 * 1000,
                'p99_duration_ms': p99 * 1000,
                'avg_request_size_bytes': int(avg_request_size),
                'avg_response_size_bytes': int(avg_response_size),
                'status_codes': dict(stats['status_codes']),
                'error_types': dict(stats['error_types']),
            }
        
        return result

# Global tracker
endpoint_tracker = EndpointPerformanceTracker()

# ============================================================================
# ENDPOINT NORMALIZATION
# ============================================================================

def normalize_endpoint_path(path: str) -> str:
    """
    Normalize URL path to group similar endpoints
    
    Examples:
      /api/patients/123 → /api/patients/{id}
      /api/studies/abc/series/xyz → /api/studies/{id}/series/{id}
      /api/dicom/patient/12345 → /api/dicom/patient/{id}
    """
    
    # Replace UUIDs
    normalized = re.sub(r'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '/{id}', path)
    # Replace numeric IDs
    normalized = re.sub(r'/\d+(?=/|$)', '/{id}', normalized)
    
    return normalized

# ============================================================================
# FASTAPI MIDDLEWARE FOR ENDPOINT MONITORING
# ============================================================================

class EndpointMonitoringMiddleware(BaseHTTPMiddleware):
    """Middleware to track endpoint-level metrics"""
    
    async def dispatch(self, request: Request, call_next) -> Response:
        
        # Normalize endpoint path
        endpoint_normalized = normalize_endpoint_path(request.url.path)
        request.state.endpoint_normalized = endpoint_normalized
        request.state.start_time = time.time()
        
        # Increment in-flight counter
        endpoint_requests_inflight.labels(
            method=request.method,
            endpoint=endpoint_normalized,
            service='pacs-service'
        ).inc()
        
        try:
            response = await call_next(request)
            
            # Calculate metrics
            duration = time.time() - request.state.start_time
            status_code = response.status_code
            
            # Determine error type
            error_type = None
            if status_code >= 500:
                error_type = 'server_error'
            elif status_code >= 400:
                error_type = 'client_error'
            
            # Get request size
            request_size = request.headers.get('content-length', 0)
            try:
                request_size = int(request_size)
            except:
                request_size = 0
            
            # Record metrics
            endpoint_requests_total.labels(
                method=request.method,
                endpoint=endpoint_normalized,
                status_code=status_code,
                service='pacs-service'
            ).inc()
            
            endpoint_request_duration_seconds.labels(
                method=request.method,
                endpoint=endpoint_normalized,
                status_code=status_code,
                service='pacs-service'
            ).observe(duration)
            
            if request_size > 0:
                endpoint_request_size_bytes.labels(
                    method=request.method,
                    endpoint=endpoint_normalized,
                    service='pacs-service'
                ).observe(request_size)
            
            # Track slow requests
            if duration > 1.0:
                endpoint_slow_requests_total.labels(
                    method=request.method,
                    endpoint=endpoint_normalized,
                    threshold_ms='1000',
                    service='pacs-service'
                ).inc()
            
            # Track stuck requests
            if duration > 5.0:
                endpoint_stuck_requests_total.labels(
                    method=request.method,
                    endpoint=endpoint_normalized,
                    threshold_seconds='5',
                    service='pacs-service'
                ).inc()
            
            # Track errors
            if error_type:
                endpoint_errors_total.labels(
                    method=request.method,
                    endpoint=endpoint_normalized,
                    status_code=status_code,
                    error_type=error_type,
                    service='pacs-service'
                ).inc()
            
            # Update max duration gauge
            endpoint_max_duration_ever.labels(
                method=request.method,
                endpoint=endpoint_normalized,
                service='pacs-service'
            ).set(max(
                endpoint_max_duration_ever.labels(
                    method=request.method,
                    endpoint=endpoint_normalized,
                    service='pacs-service'
                )._value.get() or 0,
                duration
            ))
            
            # Record in tracker
            response_size = 0
            if hasattr(response, 'body'):
                response_size = len(response.body)
            
            endpoint_tracker.record(
                request.method,
                endpoint_normalized,
                duration,
                status_code,
                request_size,
                response_size,
                error_type
            )
            
            # Log endpoint metrics
            logger.info(
                f"{request.method} {endpoint_normalized} {status_code}",
                extra={
                    'method': request.method,
                    'endpoint': endpoint_normalized,
                    'status_code': status_code,
                    'duration_ms': duration * 1000,
                    'request_size': request_size,
                    'response_size': response_size,
                }
            )
            
            return response
            
        finally:
            # Decrement in-flight counter
            endpoint_requests_inflight.labels(
                method=request.method,
                endpoint=endpoint_normalized,
                service='pacs-service'
            ).dec()

# ============================================================================
# SETUP FUNCTION
# ============================================================================

def setup_endpoint_monitoring(app):
    """Setup endpoint-level monitoring for FastAPI"""
    
    app.add_middleware(EndpointMonitoringMiddleware)
    logger.info("Endpoint-level monitoring middleware initialized")

# ============================================================================
# DIAGNOSTIC ENDPOINTS
# ============================================================================

def setup_endpoint_diagnostics(app):
    """Add diagnostic endpoints for endpoint performance"""
    from fastapi import HTTPException
    from fastapi.responses import JSONResponse
    
    @app.get("/api/diagnostics/endpoints/slowest")
    async def slowest_endpoints(top: int = 10):
        """Get slowest endpoints"""
        slowest = endpoint_tracker.get_slowest_endpoints(top)
        return {
            'timestamp': datetime.utcnow().isoformat(),
            'service': 'pacs-service',
            'slowest_endpoints': slowest
        }
    
    @app.get("/api/diagnostics/endpoints/stuck")
    async def stuck_endpoints(threshold: int = 5):
        """Get endpoints with requests >threshold seconds"""
        stuck = endpoint_tracker.get_stuck_endpoints(threshold)
        return {
            'timestamp': datetime.utcnow().isoformat(),
            'service': 'pacs-service',
            'threshold_seconds': threshold,
            'stuck_endpoints': stuck
        }
    
    @app.get("/api/diagnostics/endpoints/stats")
    async def endpoint_stats():
        """Get detailed stats for all endpoints"""
        stats = endpoint_tracker.get_detailed_stats()
        return {
            'timestamp': datetime.utcnow().isoformat(),
            'service': 'pacs-service',
            'total_unique_endpoints': len(stats),
            'endpoints': stats
        }
    
    @app.get("/api/diagnostics/endpoints/{endpoint_name}/stats")
    async def endpoint_specific_stats(endpoint_name: str):
        """Get stats for specific endpoint"""
        stats = endpoint_tracker.get_detailed_stats(endpoint_name)
        if not stats:
            raise HTTPException(status_code=404, detail=f"Endpoint {endpoint_name} not found")
        return {
            'timestamp': datetime.utcnow().isoformat(),
            'service': 'pacs-service',
            'endpoint': endpoint_name,
            'stats': stats.get(endpoint_name)
        }
    
    logger.info("Endpoint diagnostics endpoints registered:")
    logger.info("  - GET /api/diagnostics/endpoints/slowest?top=10")
    logger.info("  - GET /api/diagnostics/endpoints/stuck?threshold=5")
    logger.info("  - GET /api/diagnostics/endpoints/stats")
    logger.info("  - GET /api/diagnostics/endpoints/{endpoint}/stats")
