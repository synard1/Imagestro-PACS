"""
Orthanc Proxy - Secured Access to Orthanc DICOM Server
Provides JWT-authenticated access to Orthanc
"""
import os
import sys
import logging
from flask import Flask, request, Response, jsonify
import requests
import jwt
from functools import wraps
from requests.auth import HTTPBasicAuth

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stdout
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Configuration
ORTHANC_URL = os.getenv('ORTHANC_URL', 'http://orthanc:8042')
ORTHANC_USERNAME = os.getenv('ORTHANC_USERNAME', 'orthanc')
ORTHANC_PASSWORD = os.getenv('ORTHANC_PASSWORD', 'orthanc')
JWT_SECRET = os.getenv('JWT_SECRET', 'change-this-secret-key')
JWT_ALGORITHM = 'HS256'

def validate_token(token):
    """Validate JWT token"""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM], leeway=120)
        return payload
    except Exception as e:
        logger.warning(f"JWT validation failed in orthanc-proxy: {str(e)}")
        return None

def require_auth(required_permissions=[]):
    """Decorator to require authentication"""
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
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
                            "message": "Permission denied"
                        }), 403
            
            request.current_user = user
            return f(*args, **kwargs)
        return decorated
    return decorator

@app.route('/', methods=['GET'])
def index():
    return jsonify({
        "service": "Orthanc Proxy",
        "version": "1.0",
        "status": "running",
        "orthanc_url": ORTHANC_URL
    }), 200

@app.route('/health', methods=['GET'])
def health():
    try:
        auth = HTTPBasicAuth(ORTHANC_USERNAME, ORTHANC_PASSWORD)
        # Attempt to connect to Orthanc's /system endpoint
        response = requests.get(f"{ORTHANC_URL}/modalities", auth=auth, timeout=5)
        logger.info(f"Orthanc /appliance health check response status: {response.status_code}")
        logger.info(f"Orthanc /appliance health check response content: {response.text}")
        
        if response.status_code == 200:
            return jsonify({"status": "healthy", "orthanc_status": "reachable"}), 200
        else:
            return jsonify({"status": "unhealthy", "orthanc_status": f"Orthanc returned status {response.status_code}"}), 500
    except requests.exceptions.RequestException as e:
        logger.error(f"Orthanc health check failed: {str(e)}")
        return jsonify({"status": "unhealthy", "orthanc_status": "unreachable"}), 500

@app.route('/<path:path>', methods=['GET', 'POST', 'PUT', 'DELETE'])
@require_auth(['orthanc:read', '*'])
def proxy_orthanc(path):
    """Proxy all requests to Orthanc with authentication"""
    try:
        url = f"{ORTHANC_URL}/{path}"
        user = request.current_user
        
        # Check write permission for POST/PUT/DELETE
        if request.method in ['POST', 'PUT', 'DELETE']:
            if 'orthanc:write' not in user.get('permissions', []) and '*' not in user.get('permissions', []):
                return jsonify({
                    "status": "error",
                    "message": "Write permission required"
                }), 403
        
        # Forward request to Orthanc with basic auth
        auth = HTTPBasicAuth(ORTHANC_USERNAME, ORTHANC_PASSWORD)
        
        response = requests.request(
            method=request.method,
            url=url,
            headers={key: value for key, value in request.headers if key.lower() != 'host'},
            data=request.get_data(),
            params=request.args,
            auth=auth,
            timeout=30
        )
        
        # Log access
        logger.info(f"Orthanc access by {user.get('username')}: {request.method} /{path}")
        
        return Response(
            response.content,
            status=response.status_code,
            headers=dict(response.headers)
        )
        
    except requests.exceptions.RequestException as e:
        logger.error(f"Orthanc proxy error: {str(e)}")
        return jsonify({
            "status": "error",
            "message": "Orthanc service unavailable"
        }), 503

if __name__ == '__main__':
    logger.info("=" * 80)
    logger.info("Orthanc Proxy starting...")
    logger.info(f"Proxying to: {ORTHANC_URL}")
    logger.info("Authentication: JWT + Basic Auth to Orthanc")
    logger.info("=" * 80)
    
    app.run(host='0.0.0.0', port=8043, debug=False)
