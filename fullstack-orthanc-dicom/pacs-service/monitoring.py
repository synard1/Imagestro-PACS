"""
Monitoring & Observability Instrumentation for PACS Service (FastAPI)
Add OpenTelemetry tracing and Prometheus metrics to FastAPI app

Installation:
    pip install opentelemetry-api opentelemetry-sdk opentelemetry-exporter-jaeger
    pip install opentelemetry-instrumentation-fastapi opentelemetry-instrumentation-requests
    pip install prometheus-client opentelemetry-exporter-prometheus

Usage in pacs-service/app/main.py:
    from app.monitoring import setup_monitoring, setup_metrics_routes
    
    app = FastAPI()
    setup_monitoring(app, service_name="pacs-service")
    setup_metrics_routes(app)
"""

import os
import time
import logging
import json
from datetime import datetime
from typing import Callable

# FastAPI/Starlette imports
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import StreamingResponse

# OpenTelemetry imports
from opentelemetry import trace, metrics
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.jaeger.thrift import JaegerExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.requests import RequestsInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.exporter.prometheus import PrometheusMetricReader
from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST

# Logging imports
import logging.handlers

logger = logging.getLogger(__name__)

# ============================================================================
# PROMETHEUS METRICS - Custom business metrics
# ============================================================================

# Request metrics
http_requests_total = Counter(
    'http_requests_total',
    'Total HTTP requests',
    ['method', 'endpoint', 'status_code', 'service']
)

http_request_duration_seconds = Histogram(
    'http_request_duration_seconds',
    'HTTP request latency in seconds',
    ['method', 'endpoint', 'status_code', 'service'],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1.0, 2.5, 5.0, 7.5, 10.0)
)

# DICOM processing metrics
dicom_studies_processed_total = Counter(
    'dicom_studies_processed_total',
    'Total DICOM studies processed',
    ['status', 'modality', 'service']
)

dicom_processing_duration_seconds = Histogram(
    'dicom_processing_duration_seconds',
    'DICOM processing latency in seconds',
    ['operation', 'modality', 'service'],
    buckets=(0.1, 0.5, 1.0, 2.5, 5.0, 10.0, 25.0, 50.0)
)

dicom_files_stored_total = Counter(
    'dicom_files_stored_total',
    'Total DICOM files stored',
    ['modality', 'service']
)

# Database metrics
database_query_duration_seconds = Histogram(
    'database_query_duration_seconds',
    'Database query latency in seconds',
    ['operation', 'table', 'service'],
    buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0)
)

database_queries_total = Counter(
    'database_queries_total',
    'Total database queries',
    ['operation', 'table', 'status', 'service']
)

# Cache metrics
cache_hits_total = Counter(
    'cache_hits_total',
    'Total cache hits',
    ['cache_name', 'service']
)

cache_misses_total = Counter(
    'cache_misses_total',
    'Total cache misses',
    ['cache_name', 'service']
)

cache_evictions_total = Counter(
    'cache_evictions_total',
    'Total cache evictions',
    ['cache_name', 'service']
)

# Storage metrics
storage_usage_bytes = Gauge(
    'storage_usage_bytes',
    'Current storage usage in bytes',
    ['mount_point', 'service']
)

storage_available_bytes = Gauge(
    'storage_available_bytes',
    'Available storage in bytes',
    ['mount_point', 'service']
)

# System health metrics
service_health_status = Gauge(
    'service_health_status',
    'Service health status (1=healthy, 0.5=degraded, 0=unhealthy)',
    ['service', 'component']
)

# Order metrics
orders_created_total = Counter(
    'orders_created_total',
    'Total orders created',
    ['status', 'service']
)

orders_processed_total = Counter(
    'orders_processed_total',
    'Total orders processed',
    ['status', 'service']
)

# ============================================================================
# STRUCTURED LOGGING - JSON formatter
# ============================================================================

class JSONFormatter(logging.Formatter):
    """Format logs as JSON for Logstash/ELK"""
    
    def format(self, record):
        log_obj = {
            'timestamp': datetime.utcnow().isoformat(),
            'level': record.levelname,
            'logger': record.name,
            'service': os.getenv('SERVICE_NAME', 'pacs-service'),
            'message': record.getMessage(),
            'module': record.module,
            'function': record.funcName,
            'line': record.lineno,
            'process_id': os.getpid(),
        }
        
        if record.exc_info:
            log_obj['exception'] = self.formatException(record.exc_info)
        
        # Add custom attributes
        for attr in ['request_id', 'user_id', 'duration', 'status_code', 'study_id', 'patient_id']:
            if hasattr(record, attr):
                log_obj[attr] = getattr(record, attr)
        
        return json.dumps(log_obj)

# ============================================================================
# JAEGER TRACING SETUP
# ============================================================================

def setup_jaeger_tracing(service_name, jaeger_host='jaeger', jaeger_port=6831):
    """Configure Jaeger distributed tracing"""
    
    jaeger_exporter = JaegerExporter(
        agent_host_name=jaeger_host,
        agent_port=int(jaeger_port),
    )
    
    tracer_provider = TracerProvider()
    tracer_provider.add_span_processor(
        BatchSpanProcessor(jaeger_exporter)
    )
    trace.set_tracer_provider(tracer_provider)
    
    logger.info(f"Jaeger tracing initialized: {jaeger_host}:{jaeger_port}")

# ============================================================================
# PROMETHEUS METRICS SETUP
# ============================================================================

def setup_prometheus_metrics():
    """Setup Prometheus metrics endpoint"""
    prometheus_reader = PrometheusMetricReader()
    metrics.set_meter_provider(MeterProvider(metric_readers=[prometheus_reader]))
    logger.info("Prometheus metrics initialized")

# ============================================================================
# FASTAPI REQUEST TRACKING MIDDLEWARE
# ============================================================================

class RequestTrackingMiddleware(BaseHTTPMiddleware):
    """Middleware to track request metrics and structured logs"""
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        import uuid
        
        # Generate request ID
        request_id = request.headers.get('X-Request-ID', str(uuid.uuid4()))
        
        # Extract user info from JWT
        user_id = None
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            try:
                import jwt
                token = auth_header.split(' ')[1]
                payload = jwt.decode(token, os.getenv('JWT_SECRET', 'secret'), algorithms=['HS256'])
                user_id = payload.get('user_id')
            except:
                pass
        
        # Store in request state for use in handlers
        request.state.request_id = request_id
        request.state.user_id = user_id
        request.state.start_time = time.time()
        
        # Log request start
        logger.info(
            f"Request started",
            extra={
                'request_id': request_id,
                'user_id': user_id,
                'method': request.method,
                'path': request.url.path,
                'ip': request.client.host,
            }
        )
        
        try:
            # Call the next middleware/handler
            response = await call_next(request)
            
            # Calculate duration
            duration = time.time() - request.state.start_time
            
            # Record metrics
            http_requests_total.labels(
                method=request.method,
                endpoint=request.url.path,
                status_code=response.status_code,
                service='pacs-service'
            ).inc()
            
            http_request_duration_seconds.labels(
                method=request.method,
                endpoint=request.url.path,
                status_code=response.status_code,
                service='pacs-service'
            ).observe(duration)
            
            # Log request completion
            logger.info(
                f"Request completed",
                extra={
                    'request_id': request_id,
                    'user_id': user_id,
                    'endpoint': request.url.path,
                    'status_code': response.status_code,
                    'duration': duration,
                }
            )
            
            # Add request ID to response header
            response.headers['X-Request-ID'] = request_id
            
            return response
            
        except Exception as e:
            duration = time.time() - request.state.start_time
            
            logger.error(
                f"Request failed",
                extra={
                    'request_id': request_id,
                    'user_id': user_id,
                    'endpoint': request.url.path,
                    'duration': duration,
                    'error': str(e),
                },
                exc_info=True
            )
            
            http_requests_total.labels(
                method=request.method,
                endpoint=request.url.path,
                status_code=500,
                service='pacs-service'
            ).inc()
            
            raise

# ============================================================================
# INSTRUMENTATION FUNCTIONS
# ============================================================================

def instrument_fastapi_app(app):
    """Auto-instrument FastAPI app with OpenTelemetry"""
    FastAPIInstrumentor().instrument_app(app)
    RequestsInstrumentor().instrument()
    logger.info("FastAPI instrumentation completed")

def setup_logging_to_logstash(logstash_host='logstash', logstash_port=5000):
    """Setup structured logging to Logstash"""
    logstash_handler = logging.handlers.SocketHandler(logstash_host, logstash_port)
    logstash_handler.setFormatter(JSONFormatter())
    
    root_logger = logging.getLogger()
    root_logger.addHandler(logstash_handler)
    
    logger.info(f"Logstash logging configured: {logstash_host}:{logstash_port}")

# ============================================================================
# MAIN SETUP FUNCTION
# ============================================================================

def setup_monitoring(app, service_name='pacs-service'):
    """
    Complete monitoring setup for FastAPI application
    
    Args:
        app: FastAPI application instance
        service_name: Service name for identification
    """
    
    # Setup Jaeger tracing
    jaeger_host = os.getenv('JAEGER_HOST', 'jaeger')
    jaeger_port = os.getenv('JAEGER_PORT', '6831')
    setup_jaeger_tracing(service_name, jaeger_host, jaeger_port)
    
    # Setup Prometheus metrics
    setup_prometheus_metrics()
    
    # Instrument FastAPI app
    instrument_fastapi_app(app)
    
    # Add request tracking middleware
    app.add_middleware(RequestTrackingMiddleware)
    
    # Setup logging to Logstash
    logstash_host = os.getenv('LOGSTASH_HOST', 'logstash')
    logstash_port = int(os.getenv('LOGSTASH_PORT', '5000'))
    setup_logging_to_logstash(logstash_host, logstash_port)
    
    logger.info(f"Monitoring initialized for {service_name}")
    logger.info(f"  - Jaeger: {jaeger_host}:{jaeger_port}")
    logger.info(f"  - Prometheus: /api/metrics endpoint")
    logger.info(f"  - Logstash: {logstash_host}:{logstash_port}")

# ============================================================================
# METRICS ENDPOINTS FOR FASTAPI
# ============================================================================

def setup_metrics_routes(app):
    """Add metrics endpoint to FastAPI app"""
    from fastapi.responses import Response
    
    @app.get("/api/metrics", tags=["monitoring"])
    async def metrics():
        """Prometheus metrics endpoint"""
        return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
    
    logger.info("Metrics endpoint registered at /api/metrics")

# ============================================================================
# HEALTH CHECK ENDPOINT
# ============================================================================

def setup_health_checks(app, db=None, redis_client=None):
    """Register detailed health checks for FastAPI"""
    from fastapi.responses import JSONResponse
    import psutil
    
    @app.get("/api/health", tags=["monitoring"])
    async def health():
        """Detailed health check endpoint"""
        
        health_data = {
            'status': 'healthy',
            'timestamp': datetime.utcnow().isoformat(),
            'service': 'pacs-service',
            'version': os.getenv('APP_VERSION', 'unknown'),
            'components': {}
        }
        
        # Check database
        if db:
            try:
                from sqlalchemy import text
                start = time.time()
                db.execute(text("SELECT 1"))
                duration = time.time() - start
                health_data['components']['database'] = {
                    'status': 'healthy' if duration < 1 else 'degraded',
                    'latency_ms': round(duration * 1000, 2)
                }
                service_health_status.labels(service='pacs-service', component='database').set(1)
            except Exception as e:
                health_data['components']['database'] = {
                    'status': 'unhealthy',
                    'error': str(e)
                }
                health_data['status'] = 'unhealthy'
                service_health_status.labels(service='pacs-service', component='database').set(0)
        
        # Check Redis/Cache
        if redis_client:
            try:
                start = time.time()
                redis_client.ping()
                duration = time.time() - start
                health_data['components']['cache'] = {
                    'status': 'healthy',
                    'latency_ms': round(duration * 1000, 2)
                }
                service_health_status.labels(service='pacs-service', component='cache').set(1)
            except Exception as e:
                health_data['components']['cache'] = {
                    'status': 'unhealthy',
                    'error': str(e)
                }
                health_data['status'] = 'degraded'
                service_health_status.labels(service='pacs-service', component='cache').set(0.5)
        
        # Check disk space
        try:
            disk = psutil.disk_usage('/var/lib/orthanc/db')
            available_percent = (disk.free / disk.total) * 100
            health_data['components']['disk'] = {
                'status': 'healthy' if available_percent > 15 else ('degraded' if available_percent > 5 else 'unhealthy'),
                'available_percent': round(available_percent, 2),
                'available_bytes': disk.free,
                'total_bytes': disk.total
            }
            storage_available_bytes.labels(mount_point='/var/lib/orthanc/db', service='pacs-service').set(disk.free)
            storage_usage_bytes.labels(mount_point='/var/lib/orthanc/db', service='pacs-service').set(disk.used)
        except Exception as e:
            health_data['components']['disk'] = {'status': 'unknown', 'error': str(e)}
        
        # Check memory
        try:
            memory = psutil.virtual_memory()
            health_data['components']['memory'] = {
                'status': 'healthy' if memory.percent < 85 else 'degraded',
                'used_percent': round(memory.percent, 2),
                'available_bytes': memory.available,
                'total_bytes': memory.total
            }
        except Exception as e:
            health_data['components']['memory'] = {'status': 'unknown', 'error': str(e)}
        
        # Determine overall status
        for component, status in health_data['components'].items():
            if status.get('status') == 'unhealthy':
                health_data['status'] = 'unhealthy'
                break
            elif status.get('status') == 'degraded' and health_data['status'] == 'healthy':
                health_data['status'] = 'degraded'
        
        status_code = 200 if health_data['status'] in ['healthy', 'degraded'] else 503
        return JSONResponse(health_data, status_code=status_code)
    
    logger.info("Health check endpoint registered at /api/health")
