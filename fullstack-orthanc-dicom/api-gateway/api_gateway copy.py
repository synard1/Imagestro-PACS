"""
API Gateway - Centralized Authentication & Routing
SECURED VERSION dengan akses Orthanc Web UI

Routes requests to appropriate services with JWT validation
Version: 2.1.0 - Production Ready with Duplicate Routes Fixed
"""

import os
import sys
import logging
from flask import Flask, request, jsonify, Response, make_response
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import jwt
import requests
from functools import wraps
import socket

def check_tcp_port(host, port, timeout=1):
    """Check if TCP port is open"""
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except (socket.timeout, ConnectionRefusedError, OSError):
        return False

# Logging configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stdout
)

logger = logging.getLogger(__name__)
app = Flask(__name__)
CORS(app)

# Rate limiting
limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["1000 per hour", "60 per minute"],
    storage_uri="memory://"
)

# Configuration
JWT_SECRET = os.getenv('JWT_SECRET', 'change-this-secret-key')
JWT_ALGORITHM = 'HS256'
ALLOW_ORTHANC_UI_PUBLIC = os.getenv('ALLOW_ORTHANC_UI_PUBLIC', 'true').lower() == 'true'
ADMIN_USERNAME = os.getenv('ADMIN_USERNAME', 'admin')
ADMIN_PASSWORD = os.getenv('ADMIN_PASSWORD', 'Admin@12345')

# Service URLs (internal network)
AUTH_SERVICE_URL = os.getenv('AUTH_SERVICE_URL', 'http://auth-service:5000')
MWL_SERVICE_URL = os.getenv('MWL_SERVICE_URL', 'http://mwl-writer:8000')
ORTHANC_SERVICE_URL = os.getenv('ORTHANC_SERVICE_URL', 'http://orthanc-proxy:8043')
ORDER_SERVICE_URL = os.getenv('ORDER_SERVICE_URL', 'http://order-management:8001')
MODALITY_SIMULATOR_URL = os.getenv('MODALITY_SIMULATOR_URL', 'http://modality-simulator:8090')
ACCESSION_API_URL = os.getenv('ACCESSION_API_URL', 'http://accession-api:8180')
DICOM_ROUTER_URL = os.getenv('DICOM_ROUTER_URL', 'http://dicom-router:11112')
SIMRS_BRIDGE_URL = os.getenv('SIMRS_BRIDGE_URL', 'http://simrs-bridge:8089')
SATUSEHAT_INTEGRATOR_URL = os.getenv('SATUSEHAT_INTEGRATOR_URL', 'http://satusehat-integrator:8081')
ORTHANC_WEB_URL = os.getenv('ORTHANC_WEB_URL', 'http://orthanc:8042')

# Optional services toggles
ENABLE_MODALITY_SIMULATOR = os.getenv('ENABLE_MODALITY_SIMULATOR', 'false').lower() == 'true'
ENABLE_SIMRS_BRIDGE = os.getenv('ENABLE_SIMRS_BRIDGE', 'true').lower() == 'true'

def validate_token(token):
    """Validate JWT token"""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM], leeway=120)
        return payload
    except jwt.ExpiredSignatureError:
        logger.warning("JWT expired during validation")
        return None
    except jwt.InvalidTokenError as e:
        logger.warning(f"JWT invalid during validation: {str(e)}")
        return None

def require_auth(required_permissions=[]):
    """Decorator to require authentication"""
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            # Allow CORS preflight without auth
            if request.method == 'OPTIONS':
                return ('', 204)
            
            auth_header = request.headers.get('Authorization')
            if not auth_header or not auth_header.startswith('Bearer '):
                return jsonify({
                    "status": "error",
                    "message": "Missing or invalid authorization header"
                }), 401
            
            token = auth_header.split(' ')[1]
            user = validate_token(token)
            
            if not user:
                return jsonify({
                    "status": "error",
                    "message": "Invalid or expired token"
                }), 401
            
            # Check permissions
            if required_permissions:
                user_permissions = user.get('permissions', [])
                if '*' not in user_permissions:
                    has_permission = any(p in user_permissions for p in required_permissions)
                    if not has_permission:
                        return jsonify({
                            "status": "error",
                            "message": "Permission denied",
                            "required": required_permissions
                        }), 403
            
            request.current_user = user
            return f(*args, **kwargs)
        return decorated
    return decorator

def proxy_request(service_url, path, method, headers=None, data=None, raw_data=None, params=None):
    """Proxy request to backend service"""
    try:
        url = f"{service_url}/{path}"
        safe_params = dict(params or {})
        logger.info(f"[gateway] proxy {method} {url} params={safe_params}")
        
        # Log payload for ServiceRequest debugging
        if path == "servicerequest" and method == "POST":
            if data:
                logger.info(f"[gateway] ServiceRequest payload being sent: {data}")
            elif raw_data:
                try:
                    import json as json_lib
                    parsed_data = json_lib.loads(raw_data.decode('utf-8') if isinstance(raw_data, bytes) else raw_data)
                    logger.info(f"[gateway] ServiceRequest raw payload being sent: {parsed_data}")
                except Exception as e:
                    logger.info(f"[gateway] ServiceRequest raw payload (unparseable): {raw_data[:500]}...")
        
        # Forward authorization header
        if headers is None:
            headers = {}
        auth_header = request.headers.get('Authorization')
        if auth_header:
            headers['Authorization'] = auth_header
        
        # Prepare request kwargs
        request_kwargs = {
            'method': method,
            'url': url,
            'headers': headers,
            'params': params,
            'timeout': 30
        }
        if raw_data is not None:
            request_kwargs['data'] = raw_data
        else:
            request_kwargs['json'] = data
        
        # Make request
        response = requests.request(**request_kwargs)
        ct = response.headers.get('Content-Type', '')
        logger.info(f"[gateway] proxy -> {response.status_code} {url}")
        
        if response.status_code >= 400:
            body_snippet = ''
            try:
                if ('json' in ct) or ('text' in ct):
                    body_snippet = response.text[:512]
                else:
                    body_snippet = f"<{len(response.content)} bytes>"
            except Exception:
                body_snippet = '<unreadable body>'
            logger.warning(f"[gateway] proxy error {method} {url} status={response.status_code} body={body_snippet}")
        
        return Response(
            response.content,
            status=response.status_code,
            headers=dict(response.headers)
        )
        
    except requests.exceptions.RequestException as e:
        logger.error(f"[gateway] proxy exception {method} {service_url}/{path}: {str(e)}")
        return jsonify({
            "status": "error",
            "message": "Service unavailable",
            "detail": str(e)
        }), 503

# ============================================================================
# ROOT & HEALTH ROUTES
# ============================================================================

@app.route('/', methods=['GET'])
def index():
    return jsonify({
        "service": "API Gateway",
        "version": "2.1.0 - Production Ready",
        "status": "running",
        "security": "All services accessed through this gateway only",
        "endpoints": {
            "auth": "/auth/*",
            "worklist": "/worklist/*",
            "orders": "/orders/*",
            "accession": "/accession/*",
            "orthanc_api": "/orthanc/*",
            "orthanc_web_ui": "/orthanc-ui/*",
            "satusehat": "/satusehat/*"
        }
    }), 200

@app.route('/health', methods=['GET'])
def health():
    detailed = request.args.get('detailed', 'false').lower() == 'true'
    services_health = {}

    services = {
        "auth": {"url": AUTH_SERVICE_URL, "health_path": "/health"},
        "mwl": {"url": MWL_SERVICE_URL, "health_path": "/health"},
        "orthanc": {"url": ORTHANC_SERVICE_URL, "health_path": "/health"},
        "orders": {"url": ORDER_SERVICE_URL, "health_path": "/health"},
        "accession-api": {"url": ACCESSION_API_URL, "health_path": "/healthz"},
        "dicom-router": {"url": DICOM_ROUTER_URL, "health_path": None, "tcp_port": 11112},
        "satusehat-integrator": {"url": SATUSEHAT_INTEGRATOR_URL, "health_path": "/health"}
    }

    if ENABLE_MODALITY_SIMULATOR:
        services["modality-simulator"] = {"url": MODALITY_SIMULATOR_URL, "health_path": "/health"}

    if ENABLE_SIMRS_BRIDGE:
        services["simrs-bridge"] = {"url": SIMRS_BRIDGE_URL, "health_path": "/health"}

    for name, service_info in services.items():
        url = service_info["url"]
        health_path = service_info["health_path"]
        tcp_port = service_info.get("tcp_port")

        if health_path is None and tcp_port is None:
            if detailed:
                services_health[name] = {"status": "not applicable", "message": "No health endpoint"}
            else:
                services_health[name] = "not applicable"
            continue

        if health_path is None and tcp_port is not None:
            host = url.split('://')[1].split(':')[0]
            if check_tcp_port(host, tcp_port):
                if detailed:
                    services_health[name] = {"status": "healthy", "type": "TCP", "port": tcp_port}
                else:
                    services_health[name] = "healthy"
            else:
                if detailed:
                    services_health[name] = {"status": "unreachable", "type": "TCP", "port": tcp_port}
                else:
                    services_health[name] = "unreachable"
            continue

        try:
            endpoint = f"{url}{health_path}"
            if detailed:
                endpoint += "?detailed=true"
            
            r = requests.get(endpoint, timeout=5)
            
            if r.status_code == 200:
                if detailed:
                    try:
                        services_health[name] = r.json()
                    except ValueError:
                        services_health[name] = {"status": "healthy", "response": r.text.strip()}
                else:
                    services_health[name] = "healthy"
            else:
                if detailed:
                    services_health[name] = {"status": "unhealthy", "statusCode": r.status_code}
                else:
                    services_health[name] = "unhealthy"
        except requests.exceptions.RequestException as e:
            if detailed:
                services_health[name] = {"status": "unreachable", "error": str(e)}
            else:
                services_health[name] = "unreachable"

    return jsonify({
        "status": "healthy",
        "service": "api-gateway",
        "version": "2.1.0",
        "services": services_health
    }), 200

# ============================================================================
# AUTH ROUTES
# ============================================================================

@app.route('/auth/login', methods=['POST'])
@limiter.limit("5 per minute")
def auth_login():
    """Login endpoint - no auth required"""
    return proxy_request(AUTH_SERVICE_URL, 'auth/login', 'POST', data=request.get_json(silent=True))

@app.route('/auth/verify', methods=['POST'])
def auth_verify():
    """Verify token via auth-service"""
    return proxy_request(AUTH_SERVICE_URL, 'auth/verify', 'POST', data=request.get_json(silent=True))

@app.route('/auth/register', methods=['POST'])
@require_auth(['*'])
def auth_register():
    """Register new user - admin only"""
    return proxy_request(AUTH_SERVICE_URL, 'auth/register', 'POST', data=request.get_json(silent=True))

@app.route('/auth/<path:path>', methods=['GET', 'POST', 'PUT', 'DELETE'])
@require_auth()
def auth_proxy(path):
    """Proxy auth requests"""
    return proxy_request(AUTH_SERVICE_URL, f'auth/{path}', request.method, data=request.get_json(silent=True))

# ============================================================================
# WORKLIST ROUTES
# ============================================================================

@app.route('/worklist/create', methods=['POST'])
@require_auth(['worklist:create', '*'])
def worklist_create():
    """Create worklist"""
    return proxy_request(MWL_SERVICE_URL, 'worklist/create', 'POST', data=request.get_json(silent=True))

@app.route('/worklist/list', methods=['GET'])
@require_auth(['worklist:read', '*'])
def worklist_list():
    """List worklists"""
    return proxy_request(MWL_SERVICE_URL, 'worklist/list', 'GET', params=request.args)

@app.route('/worklist/<path:path>', methods=['GET', 'POST', 'PUT', 'DELETE'])
@require_auth(['worklist:read', '*'])
def worklist_proxy(path):
    """Proxy worklist requests"""
    return proxy_request(MWL_SERVICE_URL, f'worklist/{path}', request.method,
                        data=request.get_json(silent=True), params=request.args)

# ============================================================================
# ORDER MANAGEMENT ROUTES
# ============================================================================

@app.route('/orders/<path:path>', methods=['GET', 'POST', 'PUT', 'DELETE'])
@require_auth()
def orders_proxy(path):
    """Proxy order management requests"""
    user = request.current_user
    user_perms = user.get('permissions', [])

    method_required = {
        'GET': ['order:read', '*'],
        'POST': ['order:create', '*'],
        'PUT': ['order:update', '*'],
        'DELETE': ['order:delete', '*']
    }
    required = method_required.get(request.method, ['order:read', '*'])

    if '*' not in user_perms:
        has_permission = any(p in user_perms for p in required)
        if not has_permission:
            return jsonify({
                "status": "error",
                "message": "Permission denied",
                "required": required
            }), 403

    return proxy_request(ORDER_SERVICE_URL, f'orders/{path}', request.method,
                        data=request.get_json(silent=True), params=request.args)

# ============================================================================
# ACCESSION API ROUTES (CONSOLIDATED - NO DUPLICATES)
# ============================================================================

@app.route('/accession/create', methods=['POST'])
@require_auth(['accession:create', '*'])
def accession_create():
    """Create new accession number"""
    user = request.current_user
    logger.info(f"Accession create by user: {user.get('username', 'unknown')}")
    
    try:
        incoming = request.get_json() or {}
        # Backward-compatible transform
        if 'patient' in incoming:
            p = incoming.get('patient') or {}
            transformed = {
                'modality': incoming.get('modality') or incoming.get('modalityType') or incoming.get('modality_type'),
                'procedure_code': incoming.get('procedure_code') or incoming.get('studyDescription'),
                'procedure_name': incoming.get('procedure_name'),
                'scheduled_at': incoming.get('scheduled_at'),
                'patient_national_id': p.get('id'),
                'patient_name': p.get('name'),
                'gender': p.get('sex'),
                'birth_date': p.get('birthDate'),
                'medical_record_number': p.get('medical_record_number'),
                'ihs_number': p.get('ihs_number'),
                'registration_number': incoming.get('registration_number')
            }
            payload = transformed
        else:
            payload = incoming
        
        response = proxy_request(ACCESSION_API_URL, 'accession/create', 'POST', data=payload)
        logger.info(f"Accession create response: {response.status_code}")
        return response
    except Exception as e:
        logger.error(f"Accession create error: {str(e)}")
        return jsonify({"status": "error", "message": "Failed to create accession"}), 503

@app.route('/accession/<accession_number>', methods=['GET'])
@require_auth(['accession:read', '*'])
def accession_get(accession_number):
    """Get accession details by number"""
    user = request.current_user
    logger.info(f"Accession get {accession_number} by: {user.get('username', 'unknown')}")
    
    try:
        response = proxy_request(ACCESSION_API_URL, f'api/accessions/{accession_number}', 'GET', params=request.args)
        return response
    except Exception as e:
        logger.error(f"Accession get error: {str(e)}")
        return jsonify({"status": "error", "message": "Failed to retrieve accession"}), 503

@app.route('/accession/verify', methods=['GET'])
@require_auth(['accession:read', '*'])
def accession_verify():
    """Verify accession number integrity"""
    user = request.current_user
    accession_number = request.args.get('an', '')
    logger.info(f"Accession verify {accession_number} by: {user.get('username', 'unknown')}")
    
    try:
        response = proxy_request(ACCESSION_API_URL, 'internal/verify-accession', 'GET', params=request.args)
        return response
    except Exception as e:
        logger.error(f"Accession verify error: {str(e)}")
        return jsonify({"status": "error", "message": "Failed to verify accession"}), 503

@app.route('/accession/hooks/missing-acc', methods=['POST'])
@require_auth(['accession:admin', '*'])
def accession_missing_hook():
    """Handle missing accession hook (admin only)"""
    user = request.current_user
    logger.info(f"Accession missing hook by: {user.get('username', 'unknown')}")
    
    try:
        response = proxy_request(ACCESSION_API_URL, 'api/hooks/missing-acc', 'POST', data=request.get_json(silent=True))
        return response
    except Exception as e:
        logger.error(f"Accession missing hook error: {str(e)}")
        return jsonify({"status": "error", "message": "Failed to process hook"}), 503

@app.route('/accession/<path:path>', methods=['GET', 'POST', 'PUT', 'DELETE'])
@require_auth()
def accession_proxy(path):
    """Proxy accession requests with method-specific permissions"""
    user = request.current_user
    user_perms = user.get('permissions', [])
    
    method_required = {
        'GET': ['accession:read', '*'],
        'POST': ['accession:create', '*'],
        'PUT': ['accession:update', '*'],
        'DELETE': ['accession:delete', '*']
    }
    required = method_required.get(request.method, ['accession:read', '*'])
    
    if '*' not in user_perms:
        has_permission = any(p in user_perms for p in required)
        if not has_permission:
            logger.warning(f"Permission denied for {user.get('username')} on {request.method} /accession/{path}")
            return jsonify({
                "status": "error",
                "message": "Permission denied",
                "required": required
            }), 403
    
    try:
        response = proxy_request(ACCESSION_API_URL, f'api/{path}', request.method,
                                data=request.get_json(silent=True), params=request.args)
        return response
    except Exception as e:
        logger.error(f"Accession proxy error: {str(e)}")
        return jsonify({"status": "error", "message": "Failed to proxy request"}), 503

# ============================================================================
# API SERVICEREQUEST ROUTES (Frontend Compatibility)
# ============================================================================

@app.route('/api/servicerequest/create', methods=['POST', 'OPTIONS'])
def api_servicerequest_create():
    """ServiceRequest creation endpoint for frontend compatibility"""
    logger.info(f"API ServiceRequest create: {request.method}")
    
    # Handle CORS preflight
    if request.method == 'OPTIONS':
        response = make_response()
        response.headers.add("Access-Control-Allow-Origin", "*")
        response.headers.add('Access-Control-Allow-Headers', "*")
        response.headers.add('Access-Control-Allow-Methods', "*")
        return response
    
    # Ensure valid SatuSehat token
    try:
        health_response = requests.get(f"{SATUSEHAT_INTEGRATOR_URL}/oauth/health", timeout=5)
        
        if health_response.status_code == 200:
            health_data = health_response.json()
            if not health_data.get('valid', False):
                logger.info("SatuSehat token invalid, refreshing")
                refresh_response = requests.post(f"{SATUSEHAT_INTEGRATOR_URL}/oauth/refresh", timeout=10)
                if refresh_response.status_code != 200:
                    logger.error("Failed to refresh SatuSehat token")
                    return jsonify({'error': 'token_refresh_failed'}), 503
        else:
            logger.info("SatuSehat health check failed, generating new token")
            token_response = requests.post(f"{SATUSEHAT_INTEGRATOR_URL}/oauth/token", timeout=10)
            if token_response.status_code != 200:
                logger.error("Failed to generate SatuSehat token")
                return jsonify({'error': 'token_generation_failed'}), 503
                
    except requests.RequestException as e:
        logger.error(f"Error checking SatuSehat token: {e}")
        return jsonify({'error': 'service_unavailable'}), 503
    
    # Handle request body
    data = None
    if request.content_type and 'application/json' in request.content_type:
        try:
            data = request.get_json()
            logger.info(f"[gateway] API ServiceRequest payload received from frontend: {data}")
        except Exception as e:
            logger.error(f"[gateway] Failed to parse JSON body: {e}")
            return jsonify({'error': 'invalid_json', 'message': 'Request body is not valid JSON'}), 400
    
    # Forward to satusehat-integrator servicerequest endpoint
    return proxy_request(SATUSEHAT_INTEGRATOR_URL, 'servicerequest', 'POST', data=data)

# ============================================================================
# SATUSEHAT INTEGRATOR ROUTES
# ============================================================================

@app.route('/satusehat/<path:path>', methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'])
def satusehat_proxy(path):
    """Enhanced SatuSehat proxy with automatic token management"""
    logger.info(f"SatuSehat proxy: {request.method} /{path}")
    
    # Handle CORS preflight
    if request.method == 'OPTIONS':
        response = make_response()
        response.headers.add("Access-Control-Allow-Origin", "*")
        response.headers.add('Access-Control-Allow-Headers', "*")
        response.headers.add('Access-Control-Allow-Methods', "*")
        return response
    
    # Token endpoints - no auth required
    if path in ['oauth/token', 'oauth/health', 'oauth/refresh']:
        return proxy_request(SATUSEHAT_INTEGRATOR_URL, path, request.method)
    
    # FHIR endpoints - ensure valid token
    if path.startswith('location') or path in ['patient', 'practitioner', 'encounter', 'servicerequest']:
        try:
            health_response = requests.get(f"{SATUSEHAT_INTEGRATOR_URL}/oauth/health", timeout=5)
            
            if health_response.status_code == 200:
                health_data = health_response.json()
                if not health_data.get('valid', False):
                    logger.info("SatuSehat token invalid, refreshing")
                    refresh_response = requests.post(f"{SATUSEHAT_INTEGRATOR_URL}/oauth/refresh", timeout=10)
                    if refresh_response.status_code != 200:
                        logger.error("Failed to refresh SatuSehat token")
                        return jsonify({'error': 'token_refresh_failed'}), 503
            else:
                logger.info("SatuSehat health check failed, generating new token")
                token_response = requests.post(f"{SATUSEHAT_INTEGRATOR_URL}/oauth/token", timeout=10)
                if token_response.status_code != 200:
                    logger.error("Failed to generate SatuSehat token")
                    return jsonify({'error': 'token_generation_failed'}), 503
                    
        except requests.RequestException as e:
            logger.error(f"Error checking SatuSehat token: {e}")
            return jsonify({'error': 'service_unavailable'}), 503
    
    # Other endpoints require user authentication
    elif not path.startswith('health') and not path.startswith('ready'):
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({'error': 'unauthorized', 'message': 'Missing authorization'}), 401
        
        token = auth_header.split(' ')[1]
        user = validate_token(token)
        if not user:
            return jsonify({'error': 'unauthorized', 'message': 'Invalid token'}), 401
    
    # Handle request body for POST/PUT requests
    data = None
    if request.method in ['POST', 'PUT'] and request.content_type and 'application/json' in request.content_type:
        try:
            data = request.get_json()
            if path == 'servicerequest' and data:
                logger.info(f"[gateway] SatuSehat ServiceRequest payload received from frontend: {data}")
        except Exception as e:
            logger.error(f"[gateway] Failed to parse JSON body: {e}")
            return jsonify({'error': 'invalid_json', 'message': 'Request body is not valid JSON'}), 400
    
    return proxy_request(SATUSEHAT_INTEGRATOR_URL, path, request.method, data=data)

# ============================================================================
# ORTHANC API ROUTES (via Orthanc Proxy)
# ============================================================================

@app.route('/orthanc/<path:path>', methods=['GET', 'POST', 'PUT', 'DELETE'])
@require_auth(['orthanc:read', '*'])
def orthanc_api_proxy(path):
    """Proxy Orthanc API requests through orthanc-proxy"""
    fwd_headers = {k: v for k, v in request.headers if k.lower() != 'host'}
    return proxy_request(
        ORTHANC_SERVICE_URL,
        path,
        request.method,
        headers=fwd_headers,
        raw_data=request.get_data(),
        params=request.args
    )

# ============================================================================
# ORTHANC WEB UI ACCESS (Direct to Orthanc HTTP)
# ============================================================================

@app.route('/orthanc-ui', methods=['GET'])
@app.route('/orthanc-ui/', methods=['GET'])
def orthanc_web_ui_root():
    """Redirect to Orthanc Web UI Explorer"""
    username = 'anonymous'
    if not ALLOW_ORTHANC_UI_PUBLIC:
        auth = request.authorization
        if not auth:
            return jsonify({"status": "error", "message": "Missing authorization"}), 401, \
                   {'WWW-Authenticate': 'Basic realm="Orthanc Gateway"'}
        if auth.username != ADMIN_USERNAME or auth.password != ADMIN_PASSWORD:
            return jsonify({"status": "error", "message": "Invalid credentials"}), 401
        username = auth.username

    logger.info(f"Orthanc Web UI access by: {username}")
    
    try:
        from requests.auth import HTTPBasicAuth
        orthanc_user = os.getenv('ORTHANC_USERNAME', 'orthanc')
        orthanc_pass = os.getenv('ORTHANC_PASSWORD', 'orthanc')
        
        response = requests.get(
            f"{ORTHANC_WEB_URL}/app/explorer.html",
            auth=HTTPBasicAuth(orthanc_user, orthanc_pass),
            timeout=30
        )
        
        return Response(response.content, status=response.status_code, headers=dict(response.headers))
    except Exception as e:
        logger.error(f"Orthanc Web UI error: {str(e)}")
        return jsonify({"status": "error", "message": "Failed to access Orthanc Web UI"}), 503

@app.route('/orthanc-ui/<path:path>', methods=['GET', 'POST', 'PUT', 'DELETE'])
def orthanc_web_ui_proxy(path):
    """Proxy all Orthanc Web UI requests"""
    try:
        username = 'anonymous'
        if not ALLOW_ORTHANC_UI_PUBLIC:
            auth = request.authorization
            if not auth:
                return jsonify({"status": "error", "message": "Missing authorization"}), 401, \
                       {'WWW-Authenticate': 'Basic realm="Orthanc Gateway"'}
            if auth.username != ADMIN_USERNAME or auth.password != ADMIN_PASSWORD:
                return jsonify({"status": "error", "message": "Invalid credentials"}), 401
            username = auth.username
        else:
            if request.method in ['POST', 'PUT', 'DELETE']:
                return jsonify({"status": "error", "message": "Write permission required"}), 403
        
        from requests.auth import HTTPBasicAuth
        orthanc_user = os.getenv('ORTHANC_USERNAME', 'orthanc')
        orthanc_pass = os.getenv('ORTHANC_PASSWORD', 'orthanc')
        
        url = f"{ORTHANC_WEB_URL}/{path}"
        
        response = requests.request(
            method=request.method,
            url=url,
            headers={k: v for k, v in request.headers if k.lower() not in ['host', 'authorization']},
            data=request.get_data(),
            params=request.args,
            auth=HTTPBasicAuth(orthanc_user, orthanc_pass),
            timeout=30,
            allow_redirects=False
        )
        
        logger.info(f"Orthanc Web UI: {username} -> {request.method} /{path}")
        
        excluded_headers = ['content-encoding', 'content-length', 'transfer-encoding', 'connection']
        headers = {k: v for k, v in response.headers.items() if k.lower() not in excluded_headers}
        
        return Response(response.content, status=response.status_code, headers=headers)
        
    except Exception as e:
        logger.error(f"Orthanc Web UI proxy error: {str(e)}")
        return jsonify({"status": "error", "message": "Failed to proxy Orthanc Web UI"}), 503

# ============================================================================
# ORTHANC UI STATIC ASSETS (absolute /ui and /app paths)
# ============================================================================

@app.route('/ui', methods=['GET'])
@app.route('/ui/<path:path>', methods=['GET'])
def orthanc_ui_static_proxy(path=None):
    """Proxy Orthanc Explorer 2 static assets"""
    from requests.auth import HTTPBasicAuth
    if not ALLOW_ORTHANC_UI_PUBLIC:
        auth = request.authorization
        if not auth or auth.username != ADMIN_USERNAME or auth.password != ADMIN_PASSWORD:
            return jsonify({"status": "error"}), 401, {'WWW-Authenticate': 'Basic realm="Orthanc Gateway"'}
    
    orthanc_user = os.getenv('ORTHANC_USERNAME', 'orthanc')
    orthanc_pass = os.getenv('ORTHANC_PASSWORD', 'orthanc')
    url = f"{ORTHANC_WEB_URL}/ui" + (f"/{path}" if path else "")
    
    try:
        resp = requests.get(url, auth=HTTPBasicAuth(orthanc_user, orthanc_pass), timeout=30, allow_redirects=False)
        excluded = ['content-encoding', 'content-length', 'transfer-encoding', 'connection']
        headers = {k: v for k, v in resp.headers.items() if k.lower() not in excluded}
        return Response(resp.content, status=resp.status_code, headers=headers)
    except Exception as e:
        logger.error(f"Orthanc /ui proxy error: {str(e)}")
        return jsonify({"status": "error", "message": "Failed to fetch /ui asset"}), 503

@app.route('/app', methods=['GET'])
@app.route('/app/<path:path>', methods=['GET'])
def orthanc_app_static_proxy(path=None):
    """Proxy Orthanc Explorer v1 static assets"""
    from requests.auth import HTTPBasicAuth
    if not ALLOW_ORTHANC_UI_PUBLIC:
        auth = request.authorization
        if not auth or auth.username != ADMIN_USERNAME or auth.password != ADMIN_PASSWORD:
            return jsonify({"status": "error"}), 401, {'WWW-Authenticate': 'Basic realm="Orthanc Gateway"'}
    
    orthanc_user = os.getenv('ORTHANC_USERNAME', 'orthanc')
    orthanc_pass = os.getenv('ORTHANC_PASSWORD', 'orthanc')
    url = f"{ORTHANC_WEB_URL}/app" + (f"/{path}" if path else "")
    
    try:
        resp = requests.get(url, auth=HTTPBasicAuth(orthanc_user, orthanc_pass), timeout=30, allow_redirects=False)
        excluded = ['content-encoding', 'content-length', 'transfer-encoding', 'connection']
        headers = {k: v for k, v in resp.headers.items() if k.lower() not in excluded}
        return Response(resp.content, status=resp.status_code, headers=headers)
    except Exception as e:
        logger.error(f"Orthanc /app proxy error: {str(e)}")
        return jsonify({"status": "error", "message": "Failed to fetch /app asset"}), 503

# ============================================================================
# ORTHANC API DIRECT (used by UI: absolute root endpoints)
# ============================================================================

def _is_safe_public_ui_call(prefix, subpath):
    """Check if operation is safe for public UI mode"""
    if request.method in ['GET', 'HEAD', 'OPTIONS']:
        return True
    if request.method == 'POST':
        full = f"{prefix}/{subpath}" if subpath else prefix
        if full.startswith('tools/find') or full.startswith('tools/lookup'):
            return True
    return False

def _proxy_orthanc_direct(prefix, subpath=None):
    """Proxy direct Orthanc API calls (used by UI)"""
    from requests.auth import HTTPBasicAuth
    
    if not ALLOW_ORTHANC_UI_PUBLIC:
        auth = request.authorization
        if not auth or auth.username != ADMIN_USERNAME or auth.password != ADMIN_PASSWORD:
            return jsonify({"status": "error"}), 401, {'WWW-Authenticate': 'Basic realm="Orthanc Gateway"'}
    else:
        if not _is_safe_public_ui_call(prefix, subpath):
            return jsonify({"status": "error", "message": "Operation not allowed in public mode"}), 403
    
    orthanc_user = os.getenv('ORTHANC_USERNAME', 'orthanc')
    orthanc_pass = os.getenv('ORTHANC_PASSWORD', 'orthanc')
    url = f"{ORTHANC_WEB_URL}/{prefix}" + (f"/{subpath}" if subpath else "")
    
    try:
        resp = requests.request(
            method=request.method,
            url=url,
            headers={k: v for k, v in request.headers if k.lower() not in ['host', 'authorization']},
            data=request.get_data(),
            params=request.args,
            auth=HTTPBasicAuth(orthanc_user, orthanc_pass),
            timeout=30,
            allow_redirects=False
        )
        excluded = ['content-encoding', 'content-length', 'transfer-encoding', 'connection']
        headers = {k: v for k, v in resp.headers.items() if k.lower() not in excluded}
        return Response(resp.content, status=resp.status_code, headers=headers)
    except Exception as e:
        logger.error(f"Orthanc API direct proxy error [{prefix}]: {str(e)}")
        return jsonify({"status": "error", "message": "Failed to proxy Orthanc API"}), 503

# Minimal set of endpoints used by UI
@app.route('/system', methods=['GET'])
def orthanc_system():
    return _proxy_orthanc_direct('system')

@app.route('/statistics', methods=['GET'])
def orthanc_statistics():
    return _proxy_orthanc_direct('statistics')

@app.route('/tools', methods=['GET', 'POST'])
@app.route('/tools/<path:subpath>', methods=['GET', 'POST'])
def orthanc_tools(subpath=None):
    return _proxy_orthanc_direct('tools', subpath)

@app.route('/instances', methods=['GET'])
@app.route('/instances/<path:subpath>', methods=['GET'])
def orthanc_instances(subpath=None):
    return _proxy_orthanc_direct('instances', subpath)

@app.route('/studies', methods=['GET'])
@app.route('/studies/<path:subpath>', methods=['GET'])
def orthanc_studies(subpath=None):
    return _proxy_orthanc_direct('studies', subpath)

@app.route('/series', methods=['GET'])
@app.route('/series/<path:subpath>', methods=['GET'])
def orthanc_series(subpath=None):
    return _proxy_orthanc_direct('series', subpath)

@app.route('/patients', methods=['GET'])
@app.route('/patients/<path:subpath>', methods=['GET'])
def orthanc_patients(subpath=None):
    return _proxy_orthanc_direct('patients', subpath)

@app.route('/changes', methods=['GET'])
def orthanc_changes():
    return _proxy_orthanc_direct('changes')

@app.route('/peers', methods=['GET'])
@app.route('/peers/<path:subpath>', methods=['GET'])
def orthanc_peers(subpath=None):
    return _proxy_orthanc_direct('peers', subpath)

@app.route('/modalities', methods=['GET'])
@app.route('/modalities/<path:subpath>', methods=['GET'])
def orthanc_modalities(subpath=None):
    return _proxy_orthanc_direct('modalities', subpath)

@app.route('/plugins', methods=['GET'])
@app.route('/plugins/<path:subpath>', methods=['GET'])
def orthanc_plugins(subpath=None):
    return _proxy_orthanc_direct('plugins', subpath)

@app.route('/jobs', methods=['GET'])
@app.route('/jobs/<path:subpath>', methods=['GET'])
def orthanc_jobs(subpath=None):
    return _proxy_orthanc_direct('jobs', subpath)

# ============================================================================
# APPLICATION STARTUP
# ============================================================================

if __name__ == '__main__':
    logger.info("=" * 80)
    logger.info("API Gateway v2.1.0 - Production Ready")
    logger.info(f"Auth Service: {AUTH_SERVICE_URL}")
    logger.info(f"MWL Service: {MWL_SERVICE_URL}")
    logger.info(f"Orthanc Service: {ORTHANC_SERVICE_URL}")
    logger.info(f"Order Service: {ORDER_SERVICE_URL}")
    logger.info(f"Accession API: {ACCESSION_API_URL}")
    logger.info(f"DICOM Router: {DICOM_ROUTER_URL}")
    logger.info(f"SIMRS Bridge: {SIMRS_BRIDGE_URL}")
    logger.info(f"SATUSEHAT Integrator: {SATUSEHAT_INTEGRATOR_URL}")
    logger.info(f"Orthanc Web UI: {ORTHANC_WEB_URL}")
    if ENABLE_MODALITY_SIMULATOR:
        logger.info(f"Modality Simulator: {MODALITY_SIMULATOR_URL}")
    logger.info("=" * 80)
    logger.info("✓ All services accessible ONLY through port 8888")
    logger.info("✓ Orthanc Web UI: http://localhost:8888/orthanc-ui/")
    logger.info("=" * 80)
    
    app.run(host='0.0.0.0', port=8888, debug=False)