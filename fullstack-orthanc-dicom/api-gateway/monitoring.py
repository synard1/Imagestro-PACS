"""
Monitoring & Observability Instrumentation for API Gateway
Add OpenTelemetry tracing and Prometheus metrics to Flask app

Installation:
    pip install opentelemetry-api opentelemetry-sdk opentelemetry-exporter-jaeger
    pip install opentelemetry-instrumentation-flask opentelemetry-instrumentation-requests
    pip install prometheus-client opentelemetry-exporter-prometheus

Usage in api_gateway.py:
    from monitoring.instrumentation import setup_monitoring
    app = Flask(__name__)
    setup_monitoring(app, service_name="api-gateway")
"""

import os
import time
import logging
from functools import wraps
from datetime import datetime

# OpenTelemetry imports
from opentelemetry import trace, metrics
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.jaeger.thrift import JaegerExporter
from opentelemetry.instrumentation.flask import FlaskInstrumentor
from opentelemetry.instrumentation.requests import RequestsInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.exporter.prometheus import PrometheusMetricReader
from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST

# Logging imports
import json
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

# Authentication metrics
auth_attempts_total = Counter(
    'auth_attempts_total',
    'Total authentication attempts',
    ['result', 'service']
)

auth_failures_total = Counter(
    'auth_failures_total',
    'Total authentication failures',
    ['reason', 'service']
)

# Authorization metrics
permission_checks_total = Counter(
    'permission_checks_total',
    'Total permission checks',
    ['result', 'service']
)

# Service dependency metrics
service_calls_total = Counter(
    'service_calls_total',
    'Total calls to downstream services',
    ['service', 'target_service', 'status']
)

service_call_duration_seconds = Histogram(
    'service_call_duration_seconds',
    'Downstream service call latency',
    ['service', 'target_service'],
    buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0)
)

# Business metrics
orders_created_total = Counter(
    'orders_created_total',
    'Total orders created',
    ['modality', 'status']
)

dicom_studies_processed_total = Counter(
    'dicom_studies_processed_total',
    'Total DICOM studies processed',
    ['status', 'modality']
)

# System health metrics
service_health_status = Gauge(
    'service_health_status',
    'Service health status (1=healthy, 0.5=degraded, 0=unhealthy)',
    ['service', 'component']
)

active_connections = Gauge(
    'active_connections',
    'Current active connections',
    ['service']
)

# Cache metrics
cache_hits_total = Counter(
    'cache_hits_total',
    'Total cache hits',
    ['cache_name']
)

cache_misses_total = Counter(
    'cache_misses_total',
    'Total cache misses',
    ['cache_name']
)

# ============================================================================
# STRUCTURED LOGGING - JSON formatter for Logstash
# ============================================================================

class JSONFormatter(logging.Formatter):
    """Format logs as JSON for easier parsing in Logstash/ELK"""
    
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
            'process_id': os.getpid(),
        }
        
        # Add exception info if present
        if record.exc_info:
            log_obj['exception'] = self.formatException(record.exc_info)
        
        # Add custom attributes
        if hasattr(record, 'user_id'):
            log_obj['user_id'] = record.user_id
        if hasattr(record, 'request_id'):
            log_obj['request_id'] = record.request_id
        if hasattr(record, 'duration'):
            log_obj['duration'] = record.duration
        if hasattr(record, 'status_code'):
            log_obj['status_code'] = record.status_code
        
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
# INSTRUMENTATION MIDDLEWARE
# ============================================================================

def instrument_flask_app(app):
    """Auto-instrument Flask app with OpenTelemetry"""
    FlaskInstrumentor().instrument_app(app)
    RequestsInstrumentor().instrument()
    logger.info("Flask instrumentation completed")

# ============================================================================
# CUSTOM REQUEST TRACKING
# ============================================================================

def track_request(f):
    """Decorator to track request metrics and logs"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        from flask import request, g
        
        # Generate request ID if not present
        request_id = request.headers.get('X-Request-ID', str(time.time()))
        g.request_id = request_id
        
        # Extract user info
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
        
        # Track request start
        start_time = time.time()
        endpoint = f"{request.method} {request.path}"
        
        logger.info(f"Request started", extra={
            'request_id': request_id,
            'user_id': user_id,
            'endpoint': endpoint,
            'method': request.method,
            'path': request.path,
            'ip': request.remote_addr,
        })
        
        try:
            # Execute function
            result = f(*args, **kwargs)
            
            # Handle response
            if hasattr(result, 'status_code'):
                status_code = result.status_code
            else:
                status_code = 200
            
            # Record metrics
            duration = time.time() - start_time
            http_requests_total.labels(
                method=request.method,
                endpoint=request.path,
                status_code=status_code,
                service='api-gateway'
            ).inc()
            
            http_request_duration_seconds.labels(
                method=request.method,
                endpoint=request.path,
                status_code=status_code,
                service='api-gateway'
            ).observe(duration)
            
            logger.info(f"Request completed", extra={
                'request_id': request_id,
                'user_id': user_id,
                'endpoint': endpoint,
                'status_code': status_code,
                'duration': duration,
            })
            
            return result
            
        except Exception as e:
            duration = time.time() - start_time
            logger.error(f"Request failed", extra={
                'request_id': request_id,
                'user_id': user_id,
                'endpoint': endpoint,
                'duration': duration,
                'error': str(e),
            }, exc_info=True)
            
            http_requests_total.labels(
                method=request.method,
                endpoint=request.path,
                status_code=500,
                service='api-gateway'
            ).inc()
            
            raise
    
    return decorated_function

# ============================================================================
# MAIN SETUP FUNCTION
# ============================================================================

def setup_monitoring(app, service_name='api-gateway'):
    """
    Complete monitoring setup for Flask application
    
    Args:
        app: Flask application instance
        service_name: Service name for identification
    """
    
    # Setup Jaeger tracing
    jaeger_host = os.getenv('JAEGER_HOST', 'jaeger')
    jaeger_port = os.getenv('JAEGER_PORT', '6831')
    setup_jaeger_tracing(service_name, jaeger_host, jaeger_port)
    
    # Setup Prometheus metrics
    setup_prometheus_metrics()
    
    # Instrument Flask app
    instrument_flask_app(app)
    
    # Setup structured logging to Logstash
    logstash_host = os.getenv('LOGSTASH_HOST', 'logstash')
    logstash_port = int(os.getenv('LOGSTASH_PORT', '5000'))
    
    logstash_handler = logging.handlers.SocketHandler(logstash_host, logstash_port)
    logstash_handler.setFormatter(JSONFormatter())
    
    # Add handler to root logger
    root_logger = logging.getLogger()
    root_logger.addHandler(logstash_handler)
    
    logger.info(f"Monitoring initialized for {service_name}")
    logger.info(f"  - Jaeger: {jaeger_host}:{jaeger_port}")
    logger.info(f"  - Prometheus: /metrics endpoint")
    logger.info(f"  - Logstash: {logstash_host}:{logstash_port}")

# ============================================================================
# METRICS ENDPOINTS FOR FLASK
# ============================================================================

def setup_metrics_routes(app):
    """Add metrics endpoint to Flask app"""
    
    @app.route('/metrics', methods=['GET'])
    def metrics():
        """Prometheus metrics endpoint"""
        from flask import Response
        return Response(generate_latest(), mimetype=CONTENT_TYPE_LATEST)
    
    logger.info("Metrics endpoint registered at /metrics")

# ============================================================================
# HEALTH CHECK WITH METRICS
# ============================================================================

def register_health_checks(app, db=None, redis_client=None):
    """Register detailed health checks"""
    
    @app.route('/health', methods=['GET'])
    def health():
        """Health check endpoint"""
        from flask import jsonify
        import time
        
        health_data = {
            'status': 'healthy',
            'timestamp': datetime.utcnow().isoformat(),
            'service': 'api-gateway',
            'components': {}
        }
        
        # Check database
        if db:
            try:
                start = time.time()
                db.session.execute('SELECT 1')
                duration = time.time() - start
                health_data['components']['database'] = {
                    'status': 'healthy' if duration < 1 else 'degraded',
                    'latency_ms': duration * 1000
                }
                service_health_status.labels(service='api-gateway', component='database').set(1)
            except Exception as e:
                health_data['components']['database'] = {'status': 'unhealthy', 'error': str(e)}
                health_data['status'] = 'unhealthy'
                service_health_status.labels(service='api-gateway', component='database').set(0)
        
        # Check Redis
        if redis_client:
            try:
                start = time.time()
                redis_client.ping()
                duration = time.time() - start
                health_data['components']['cache'] = {
                    'status': 'healthy',
                    'latency_ms': duration * 1000
                }
                service_health_status.labels(service='api-gateway', component='cache').set(1)
            except Exception as e:
                health_data['components']['cache'] = {'status': 'unhealthy', 'error': str(e)}
                health_data['status'] = 'degraded'
                service_health_status.labels(service='api-gateway', component='cache').set(0.5)
        
        status_code = 200 if health_data['status'] == 'healthy' else (503 if health_data['status'] == 'unhealthy' else 200)
        return jsonify(health_data), status_code
    
    logger.info("Health check endpoint registered")
