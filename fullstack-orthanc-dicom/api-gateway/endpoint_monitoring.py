"""
Enhanced Endpoint-Level Monitoring for API Gateway (Flask)
Track individual endpoints dengan detail: latency, errors, throughput

Features:
- Track setiap endpoint URL secara terpisah
- Identifikasi endpoint yang slow/stuck
- Hitung slowest/fastest endpoints
- Track endpoint-specific errors
- Monitor endpoint availability
"""

import os
import time
import logging
import json
from functools import wraps
from datetime import datetime
from typing import Optional, Dict
import re

from flask import Flask, request, g
from prometheus_client import Counter, Histogram, Gauge
import logging.handlers

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

# Endpoint availability (last 5 minutes)
endpoint_availability = Gauge(
    'endpoint_availability_percent',
    'Endpoint availability percentage (last 5min)',
    ['method', 'endpoint', 'service']
)

# Endpoint slowness indicators
endpoint_slowest_duration_seconds = Gauge(
    'endpoint_slowest_duration_seconds',
    'Slowest request duration per endpoint',
    ['method', 'endpoint', 'service']
)

endpoint_avg_duration_seconds = Gauge(
    'endpoint_avg_duration_seconds',
    'Average request duration per endpoint',
    ['method', 'endpoint', 'service']
)

endpoint_p95_duration_seconds = Gauge(
    'endpoint_p95_duration_seconds',
    'P95 request duration per endpoint',
    ['method', 'endpoint', 'service']
)

endpoint_p99_duration_seconds = Gauge(
    'endpoint_p99_duration_seconds',
    'P99 request duration per endpoint',
    ['method', 'endpoint', 'service']
)

# Stuck request detection
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

# ============================================================================
# ENDPOINT PERFORMANCE TRACKING (Per-endpoint statistics)
# ============================================================================

class EndpointStats:
    """Track performance statistics per endpoint"""
    
    def __init__(self):
        self.endpoints: Dict[str, dict] = {}
    
    def record(self, method: str, endpoint: str, duration: float, status_code: int, error_type: Optional[str] = None):
        """Record metrics for an endpoint"""
        
        key = f"{method} {endpoint}"
        
        if key not in self.endpoints:
            self.endpoints[key] = {
                'total_requests': 0,
                'total_errors': 0,
                'total_duration': 0,
                'durations': [],
                'status_codes': {},
                'error_types': {},
                'max_duration': 0,
                'min_duration': float('inf'),
            }
        
        stats = self.endpoints[key]
        stats['total_requests'] += 1
        stats['total_duration'] += duration
        stats['durations'].append(duration)
        stats['max_duration'] = max(stats['max_duration'], duration)
        stats['min_duration'] = min(stats['min_duration'], duration)
        
        # Track status codes
        if status_code not in stats['status_codes']:
            stats['status_codes'][status_code] = 0
        stats['status_codes'][status_code] += 1
        
        # Track errors
        if status_code >= 400:
            stats['total_errors'] += 1
            if error_type not in stats['error_types']:
                stats['error_types'][error_type] = 0
            stats['error_types'][error_type] += 1
        
        # Keep only last 1000 durations for percentile calculation
        if len(stats['durations']) > 1000:
            stats['durations'] = stats['durations'][-1000:]
    
    def get_slowest_endpoints(self, top_n: int = 10) -> list:
        """Get slowest endpoints by average duration"""
        
        endpoints_by_avg = [
            {
                'endpoint': key,
                'avg_duration': stats['total_duration'] / stats['total_requests'],
                'total_requests': stats['total_requests'],
                'error_rate': (stats['total_errors'] / stats['total_requests']) * 100,
                'max_duration': stats['max_duration'],
            }
            for key, stats in self.endpoints.items()
        ]
        
        return sorted(endpoints_by_avg, key=lambda x: x['avg_duration'], reverse=True)[:top_n]
    
    def get_most_error_prone_endpoints(self, top_n: int = 10) -> list:
        """Get endpoints with highest error rates"""
        
        endpoints_by_error = [
            {
                'endpoint': key,
                'error_rate': (stats['total_errors'] / stats['total_requests']) * 100 if stats['total_requests'] > 0 else 0,
                'total_errors': stats['total_errors'],
                'total_requests': stats['total_requests'],
            }
            for key, stats in self.endpoints.items()
            if stats['total_requests'] > 0
        ]
        
        return sorted(endpoints_by_error, key=lambda x: x['error_rate'], reverse=True)[:top_n]
    
    def get_stuck_endpoints(self, threshold_seconds: int = 10) -> list:
        """Get endpoints with requests taking >threshold seconds"""
        
        stuck = []
        for key, stats in self.endpoints.items():
            if stats['max_duration'] > threshold_seconds:
                slow_count = sum(1 for d in stats['durations'] if d > threshold_seconds)
                stuck.append({
                    'endpoint': key,
                    'max_duration': stats['max_duration'],
                    'stuck_count': slow_count,
                    'stuck_percentage': (slow_count / len(stats['durations'])) * 100 if stats['durations'] else 0,
                })
        
        return sorted(stuck, key=lambda x: x['max_duration'], reverse=True)

# Global endpoint stats tracker
endpoint_stats = EndpointStats()

# ============================================================================
# STRUCTURED LOGGING - JSON formatter with endpoint context
# ============================================================================

class EndpointJSONFormatter(logging.Formatter):
    """Format logs as JSON with endpoint context"""
    
    def format(self, record):
        log_obj = {
            'timestamp': datetime.utcnow().isoformat(),
            'level': record.levelname,
            'logger': record.name,
            'service': os.getenv('SERVICE_NAME', 'api-gateway'),
            'message': record.getMessage(),
            'module': record.module,
            'function': record.funcName,
            'line': record.lineno,
        }
        
        # Add endpoint context if available
        if hasattr(record, 'endpoint'):
            log_obj['endpoint'] = record.endpoint
        if hasattr(record, 'method'):
            log_obj['method'] = record.method
        if hasattr(record, 'duration'):
            log_obj['duration_ms'] = record.duration
        if hasattr(record, 'status_code'):
            log_obj['status_code'] = record.status_code
        if hasattr(record, 'request_id'):
            log_obj['request_id'] = record.request_id
        if hasattr(record, 'user_id'):
            log_obj['user_id'] = record.user_id
        
        if record.exc_info:
            log_obj['exception'] = self.formatException(record.exc_info)
        
        return json.dumps(log_obj)

# ============================================================================
# ENDPOINT MONITORING MIDDLEWARE
# ============================================================================

def normalize_endpoint_path(path: str) -> str:
    """
    Normalize URL path to group similar endpoints
    
    Examples:
      /api/patients/123 → /api/patients/{id}
      /api/studies/abc/series/xyz → /api/studies/{id}/series/{id}
      /orthanc/patients/123/studies → /orthanc/patients/{id}/studies
    """
    
    # Replace UUIDs and numeric IDs with {id}
    normalized = re.sub(r'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '/{id}', path)  # UUID
    normalized = re.sub(r'/\d+(?=/|$)', '/{id}', normalized)  # Numeric ID
    
    return normalized

def setup_endpoint_monitoring(app: Flask):
    """Setup endpoint-level monitoring for Flask app"""
    
    @app.before_request
    def before_request():
        """Called before each request"""
        request.start_time = time.time()
        request.endpoint_normalized = normalize_endpoint_path(request.path)
        
        # Increment in-flight counter
        endpoint_requests_inflight.labels(
            method=request.method,
            endpoint=request.endpoint_normalized,
            service='api-gateway'
        ).inc()
    
    @app.after_request
    def after_request(response):
        """Called after each request"""
        
        # Calculate duration
        duration = time.time() - request.start_time
        duration_ms = duration * 1000
        
        # Get endpoint info
        method = request.method
        endpoint = request.endpoint_normalized
        status_code = response.status_code
        
        # Determine error type
        error_type = None
        if status_code >= 500:
            error_type = 'server_error'
        elif status_code >= 400:
            error_type = 'client_error'
        
        # Record metrics
        endpoint_requests_total.labels(
            method=method,
            endpoint=endpoint,
            status_code=status_code,
            service='api-gateway'
        ).inc()
        
        endpoint_request_duration_seconds.labels(
            method=method,
            endpoint=endpoint,
            status_code=status_code,
            service='api-gateway'
        ).observe(duration)
        
        endpoint_slowest_duration_seconds.labels(
            method=method,
            endpoint=endpoint,
            service='api-gateway'
        ).set(max(
            endpoint_slowest_duration_seconds.labels(
                method=method,
                endpoint=endpoint,
                service='api-gateway'
            )._value.get() or 0,
            duration
        ))
        
        endpoint_max_duration_ever.labels(
            method=method,
            endpoint=endpoint,
            service='api-gateway'
        ).set(max(
            endpoint_max_duration_ever.labels(
                method=method,
                endpoint=endpoint,
                service='api-gateway'
            )._value.get() or 0,
            duration
        ))
        
        # Track request size
        content_length = request.content_length or 0
        if content_length > 0:
            endpoint_request_size_bytes.labels(
                method=method,
                endpoint=endpoint,
                service='api-gateway'
            ).observe(content_length)
        
        # Track response size
        response_size = len(response.get_data())
        endpoint_response_size_bytes.labels(
            method=method,
            endpoint=endpoint,
            service='api-gateway'
        ).observe(response_size)
        
        # Track errors
        if error_type:
            endpoint_errors_total.labels(
                method=method,
                endpoint=endpoint,
                status_code=status_code,
                error_type=error_type,
                service='api-gateway'
            ).inc()
        
        # Track slow requests (>1 second)
        if duration > 1.0:
            endpoint_slow_requests_total.labels(
                method=method,
                endpoint=endpoint,
                threshold_ms='1000',
                service='api-gateway'
            ).inc()
        
        # Track stuck requests (>5 seconds)
        if duration > 5.0:
            endpoint_stuck_requests_total.labels(
                method=method,
                endpoint=endpoint,
                threshold_seconds='5',
                service='api-gateway'
            ).inc()
        
        # Record in statistics tracker
        endpoint_stats.record(method, endpoint, duration, status_code, error_type)
        
        # Decrement in-flight counter
        endpoint_requests_inflight.labels(
            method=method,
            endpoint=endpoint,
            service='api-gateway'
        ).dec()
        
        # Log request details
        logger.info(
            f"{method} {endpoint} {status_code}",
            extra={
                'method': method,
                'endpoint': endpoint,
                'status_code': status_code,
                'duration_ms': duration_ms,
                'request_size': content_length,
                'response_size': response_size,
                'user_id': getattr(g, 'user_id', None),
                'request_id': getattr(g, 'request_id', None),
            }
        )
        
        return response
    
    logger.info("Endpoint-level monitoring initialized")

# ============================================================================
# ENDPOINT DIAGNOSTICS ENDPOINTS
# ============================================================================

def setup_endpoint_diagnostics(app: Flask):
    """Setup diagnostic endpoints to view endpoint performance"""
    
    @app.route('/metrics/endpoints/slowest', methods=['GET'])
    def slowest_endpoints():
        """Get slowest endpoints"""
        from flask import jsonify
        
        top_n = request.args.get('top', 10, type=int)
        slowest = endpoint_stats.get_slowest_endpoints(top_n)
        
        return jsonify({
            'timestamp': datetime.utcnow().isoformat(),
            'service': 'api-gateway',
            'slowest_endpoints': slowest
        })
    
    @app.route('/metrics/endpoints/errors', methods=['GET'])
    def error_prone_endpoints():
        """Get endpoints with highest error rates"""
        from flask import jsonify
        
        top_n = request.args.get('top', 10, type=int)
        error_prone = endpoint_stats.get_most_error_prone_endpoints(top_n)
        
        return jsonify({
            'timestamp': datetime.utcnow().isoformat(),
            'service': 'api-gateway',
            'error_prone_endpoints': error_prone
        })
    
    @app.route('/metrics/endpoints/stuck', methods=['GET'])
    def stuck_endpoints():
        """Get endpoints with requests taking >5 seconds"""
        from flask import jsonify
        
        threshold = request.args.get('threshold', 5, type=int)
        stuck = endpoint_stats.get_stuck_endpoints(threshold)
        
        return jsonify({
            'timestamp': datetime.utcnow().isoformat(),
            'service': 'api-gateway',
            'threshold_seconds': threshold,
            'stuck_endpoints': stuck
        })
    
    @app.route('/metrics/endpoints/stats', methods=['GET'])
    def endpoint_stats_endpoint():
        """Get detailed statistics for all endpoints"""
        from flask import jsonify
        
        stats_dict = {}
        for key, stats in endpoint_stats.endpoints.items():
            method, endpoint = key.split(' ', 1)
            
            durations_sorted = sorted(stats['durations'])
            avg_duration = stats['total_duration'] / stats['total_requests'] if stats['total_requests'] > 0 else 0
            p50 = durations_sorted[len(durations_sorted) // 2] if durations_sorted else 0
            p95 = durations_sorted[int(len(durations_sorted) * 0.95)] if durations_sorted else 0
            p99 = durations_sorted[int(len(durations_sorted) * 0.99)] if durations_sorted else 0
            
            stats_dict[key] = {
                'method': method,
                'endpoint': endpoint,
                'total_requests': stats['total_requests'],
                'total_errors': stats['total_errors'],
                'error_rate_percent': (stats['total_errors'] / stats['total_requests'] * 100) if stats['total_requests'] > 0 else 0,
                'avg_duration_ms': avg_duration * 1000,
                'min_duration_ms': stats['min_duration'] * 1000,
                'max_duration_ms': stats['max_duration'] * 1000,
                'p50_duration_ms': p50 * 1000,
                'p95_duration_ms': p95 * 1000,
                'p99_duration_ms': p99 * 1000,
                'status_codes': stats['status_codes'],
                'error_types': stats['error_types'],
            }
        
        return jsonify({
            'timestamp': datetime.utcnow().isoformat(),
            'service': 'api-gateway',
            'total_unique_endpoints': len(stats_dict),
            'endpoints': stats_dict
        })
    
    logger.info("Endpoint diagnostics endpoints registered")
    logger.info("  - GET /metrics/endpoints/slowest?top=10")
    logger.info("  - GET /metrics/endpoints/errors?top=10")
    logger.info("  - GET /metrics/endpoints/stuck?threshold=5")
    logger.info("  - GET /metrics/endpoints/stats")
