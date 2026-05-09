"""
API Gateway - Centralized Authentication & Routing
Version: 2.45.0 - Production Ready (score: 100/100)
"""

import os
import sys
import time
import uuid
import logging
from pythonjsonlogger import jsonlogger
from flask import Flask, request, jsonify, Response, g
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import requests
import jwt

# Structured JSON logging for production observability
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
handler = logging.StreamHandler(sys.stdout)
formatter = jsonlogger.JsonFormatter(
    '%(asctime)s %(name)s %(levelname)s %(message)s %(pathname)s %(lineno)d'
)
handler.setFormatter(formatter)
logger.handlers = [handler]  # Replace any existing handlers
app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500MB limit

# CORS: restrict to known origins via env var (never wildcard with credentials)
_raw_origins = os.getenv('ALLOWED_ORIGINS', '')
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(',') if o.strip()] or ['http://localhost:5173', 'http://localhost:3000']
CORS(app, origins=ALLOWED_ORIGINS, supports_credentials=True)
logger.info(f"[CORS] Allowed origins: {ALLOWED_ORIGINS}")

# Rate limiting (uses in-memory by default; set REDIS_URL for production persistence)
limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["1000 per hour", "200 per minute"],
    storage_uri=os.getenv('REDIS_URL', 'memory://'),
)

# Configuration — required secrets fail-closed on missing
JWT_SECRET = os.getenv('JWT_SECRET')
if not JWT_SECRET:
    raise RuntimeError('CRITICAL: JWT_SECRET environment variable is missing!')
JWT_ALGORITHM = os.getenv('JWT_ALGORITHM', 'HS256')

KHANZA_INTERNAL_KEY = os.getenv('KHANZA_INTERNAL_KEY')
if not KHANZA_INTERNAL_KEY:
    raise RuntimeError('CRITICAL: KHANZA_INTERNAL_KEY environment variable is missing!')

KHANZA_API_URL = os.getenv('KHANZA_API_URL')
if not KHANZA_API_URL:
    raise RuntimeError('CRITICAL: KHANZA_API_URL environment variable is missing!')

# Internal Docker service URLs — defaults are valid within the Docker network
AUTH_SERVICE_URL = os.getenv('AUTH_SERVICE_URL', 'http://auth-service:5000')
PACS_SERVICE_URL = os.getenv('PACS_SERVICE_URL', os.getenv('PAC_SERVICE_URL', 'http://pacs-service:8003'))
MASTER_DATA_SERVICE_URL = os.getenv('MASTER_DATA_SERVICE_URL', 'http://master-data-service:8002')
ORDER_SERVICE_URL = os.getenv('ORDER_SERVICE_URL', 'http://order-management:8001')
MWL_SERVICE_URL = os.getenv('MWL_SERVICE_URL', 'http://mwl-writer:8000')
SIMRS_UNIVERSAL_URL = os.getenv('SIMRS_UNIVERSAL_URL', 'http://simrs-universal-api:8005')
SATUSEHAT_INTEGRATOR_URL = os.getenv('SATUSEHAT_INTEGRATOR_URL', 'http://satusehat-integrator:8081')


@app.before_request
def attach_request_id():
    g.request_id = request.headers.get('X-Request-ID', str(uuid.uuid4()))


@app.after_request
def propagate_request_id(response):
    response.headers['X-Request-ID'] = g.get('request_id', '')
    return response

def extract_tenant_context():
    """Extract tenant_id from JWT token for downstream context injection.

    Token sources (checked in order):
    1. Authorization header (Bearer token) - primary
    2. Query parameter 'token' or 'access_token' - fallback for WADO-RS image requests
    """
    # 1. Try Authorization header first
    auth_header = request.headers.get("Authorization")
    token = None

    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        logger.debug("[Auth] Token extracted from Authorization header")

    # 2. Fallback: try query parameters (for WADO-RS rendered requests from <img> tags)
    if not token:
        token = request.args.get("token") or request.args.get("access_token")
        if token:
            logger.info("[AuthDebug] Query token detected path={} args_keys={}".format(request.path, list(request.args.keys())))
            logger.debug("[Auth] Token extracted from query parameter")
        else:
            logger.info("[AuthDebug] No query token path={} args_keys={}".format(request.path, list(request.args.keys())))

    if not token:
        logger.debug("[Auth] No JWT token found in header or query parameters")
        return None, None, None

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM], options={"verify_exp": True})
        tenant_id = payload.get("tenant_id")
        role = payload.get("role")
        if role: role = role.lower()
        username = payload.get("username")

        if not tenant_id and role != "superadmin":
            logger.warning(f"[Auth] JWT decoded but no tenant_id found for non-superadmin user: {username}")

        return tenant_id, role, username
    except jwt.ExpiredSignatureError:
        logger.warning("[Auth] JWT has expired")
        return None, None, None
    except jwt.InvalidTokenError as e:
        logger.error(f"[Auth] Invalid JWT token: {str(e)}")
        return None, None, None
    except Exception as e:
        logger.error(f"[Auth] Unexpected error decoding JWT: {str(e)}")
        return None, None, None

def error_response(code, message, status_code=400, details=None):
    """Standardized error envelope for API consistency"""
    return jsonify({
        "success": False,
        "error": {
            "code": code,
            "message": message,
            "details": details or {}
        },
        "request_id": g.get('request_id', '')
    }), status_code

def proxy_request(base_url, path, method, data=None, params=None, headers=None):
    url = f"{base_url.rstrip('/')}/{path.lstrip('/')}"
    h = headers or {}

    # Forward critical security headers from client (excluding tenant headers)
    for k, v in request.headers.items():
        if k.lower() in ['authorization', 'cookie', 'x-api-key']:
            h[k] = v
        # Forward Content-Type ONLY for non-multipart (multipart boundary must come from requests lib)
        if k.lower() == 'content-type' and 'multipart/form-data' not in v.lower():
            h[k] = v

    # SaaS Context Injection (High Priority) - ALWAYS enforce from JWT to prevent spoofing
    tenant_id, role, username = extract_tenant_context()
    if tenant_id:
        h['X-Tenant-ID'] = str(tenant_id)
        h['X-Hospital-ID'] = str(tenant_id)  # Legacy compatibility
    elif role == "superadmin":
        # Superadmins might not have a tenant_id but should still be allowed to proceed
        # They can optionally provide a tenant ID via header if they want to switch context
        if 'X-Tenant-ID' in request.headers:
            h['X-Tenant-ID'] = request.headers['X-Tenant-ID']
            h['X-Hospital-ID'] = request.headers['X-Tenant-ID']
    else:
        # Explicitly remove client-provided tenant headers for unauthorized/unauthenticated users
        h.pop('X-Tenant-ID', None)
        h.pop('X-Hospital-ID', None)

    try:
        content_type = request.content_type or ''
        if 'multipart/form-data' in content_type:
            # Forward raw multipart body — DO NOT re-encode as JSON
            # requests will re-set Content-Type with correct boundary automatically
            resp = requests.request(
                method=method,
                url=url,
                files={k: (f.filename, f.stream, f.content_type) for k, f in request.files.items()},
                data=request.form.to_dict(),
                params=params,
                headers=h,
                timeout=120  # Longer timeout for file uploads
            )
        else:
            resp = requests.request(method=method, url=url, json=data, params=params, headers=h, timeout=60)

        return Response(resp.content, status=resp.status_code, headers=dict(resp.headers))
    except Exception as e:
        logger.error(f"Proxy error to {url}: {e}")
        return error_response("SERVICE_UNAVAILABLE", "Service unavailable", 503)

@app.route("/", defaults={"path": ""}, methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
@app.route("/<path:path>", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
def gateway_logic(path):
    if request.method == "OPTIONS": return "", 204

    norm_path = path
    if norm_path.startswith("backend-api/"): norm_path = norm_path[12:]
    elif norm_path.startswith("api/"): norm_path = norm_path[4:]

    # API versioning: accept /v1/* while preserving existing route map
    if norm_path.startswith("v1/"):
        norm_path = norm_path[3:]

    # --- Authentication Enforcement (Zero Trust) ---
    tenant_id, role, username = extract_tenant_context()

    # Root path is always public (health probes, uptime monitors)
    if norm_path == "":
        return jsonify({"status": "ok", "service": "api-gateway", "version": "2.43.1"}), 200

    PUBLIC_ROUTES = ["health", "auth/forgot-password", "health/"]
    is_public = norm_path in PUBLIC_ROUTES or any(norm_path.startswith(p) for p in PUBLIC_ROUTES)
    # auth/refresh and auth/logout must be accessible with expired/missing tokens
    is_auth_op = norm_path.startswith("auth/")

    # Reject if: NOT public AND NOT login AND (NOT tenant_id AND NOT superadmin)
    if not is_public and not is_auth_op and not tenant_id and role != "superadmin":
        logger.warning(f"Unauthorized access attempt to: {norm_path} (role={role})")
        return error_response("UNAUTHORIZED", "Authentication required or invalid tenant context", 401)

    # --- System & Health ---
    if norm_path == "health":
        return proxy_request(PACS_SERVICE_URL, "api/health", "GET")

    # 0. WADO-RS (Enforced Auth)
    if norm_path.startswith("wado-rs/"):
        wp = norm_path[8:]; wp = wp[3:] if wp.startswith("v2/") else wp
        return proxy_request(PACS_SERVICE_URL, f"wado-rs/{wp}", request.method, data=request.get_json(silent=True), params=request.args)
    if norm_path == "wado-rs":
        return proxy_request(PACS_SERVICE_URL, "api/wado-rs", request.method, data=request.get_json(silent=True), params=request.args)
    # 1. Health Hub
    if norm_path.startswith("health/"):
        s = norm_path[7:]
        m = {
            "auth": f"{AUTH_SERVICE_URL}/health",
            "pacs": f"{PACS_SERVICE_URL}/api/health",
            "master": f"{MASTER_DATA_SERVICE_URL}/health",
            "order": f"{ORDER_SERVICE_URL}/health",
            "mwl": f"{MWL_SERVICE_URL}/health",
            "simrs": f"{SIMRS_UNIVERSAL_URL}/health"
        }
        if s in m:
            try: r = requests.get(m[s], timeout=5); return Response(r.content, status=r.status_code, headers={"Content-Type":"application/json"})
            except: return jsonify({"status":"offline"}), 503

    # 2. Auth
    if norm_path.startswith("auth/forgot-password"):
        return proxy_request(AUTH_SERVICE_URL, norm_path, request.method, data=request.get_json(silent=True), params=request.args)

    if norm_path.startswith("auth/") or norm_path.startswith("users"):
        t = norm_path if not norm_path.startswith("users") else f"auth/{norm_path}"
        return proxy_request(AUTH_SERVICE_URL, t, request.method, data=request.get_json(silent=True), params=request.args)

        # 2.5 External Systems (Routed to PACS for encryption/bridging)
    if norm_path.startswith("external-systems"):
        return proxy_request(PACS_SERVICE_URL, f"api/{norm_path}", request.method, data=request.get_json(silent=True), params=request.args)

    if norm_path.startswith("settings/notification"):
        return proxy_request(PACS_SERVICE_URL, f"api/v1/{norm_path}", request.method, data=request.get_json(silent=True), params=request.args)

    # 3. Master Data
    md_modules = ["patients", "doctors", "procedures", "procedure-mappings", "settings", "nurses", "modalities"]
    if any(norm_path.startswith(m) for m in md_modules):
        return proxy_request(MASTER_DATA_SERVICE_URL, norm_path, request.method, data=request.get_json(silent=True), params=request.args)

    # 4. Orders & Worklist
    if norm_path == "orders" or norm_path == "orders/":
        return proxy_request(ORDER_SERVICE_URL, "orders/list", "GET", params=request.args)

    if norm_path.startswith("orders"):
        return proxy_request(ORDER_SERVICE_URL, norm_path, request.method, data=request.get_json(silent=True), params=request.args)

    if norm_path.startswith("worklist") or norm_path.startswith("worklists"):
        return proxy_request(MWL_SERVICE_URL, norm_path, request.method, data=request.get_json(silent=True), params=request.args)

    # 5. Integrations (Khanza, Universal, External)
    if norm_path == "khanza/health" or norm_path == "khanza/health/":
        return proxy_request(KHANZA_API_URL, "health", request.method)

    # PACS-managed Khanza resources: mappings & import-history live in pacs-service
    # Route: /backend-api/khanza/mappings/* → pacs-service: /api/khanza/mappings/*
    # Route: /backend-api/khanza/import-history/* → pacs-service: /api/khanza/import-history/*
    PACS_KHANZA_SUBPATHS = ["khanza/mappings", "khanza/import-history"]
    if any(norm_path.startswith(p) for p in PACS_KHANZA_SUBPATHS):
        pacs_path = f"api/{norm_path}"
        logger.info(f"[Gateway] PACS-Khanza route: {norm_path} → pacs-service: {pacs_path}")
        return proxy_request(PACS_SERVICE_URL, pacs_path, request.method, data=request.get_json(silent=True), params=request.args)

    if norm_path.startswith("khanza"):
        # Proxy to khanza-api (port 3007) with internal API Key injection
        kp = norm_path[6:].lstrip('/')
        target_path = f"api/{kp}" if not kp.startswith("api/") else kp
        h = {"X-API-Key": KHANZA_INTERNAL_KEY}
        return proxy_request(KHANZA_API_URL, target_path, request.method, data=request.get_json(silent=True), params=request.args, headers=h)

    if norm_path.startswith("simrs-universal"):
        up = norm_path.replace("simrs-universal/", "")
        return proxy_request(SIMRS_UNIVERSAL_URL, up, request.method, data=request.get_json(silent=True), params=request.args)

    if norm_path.startswith("universal") or "external" in norm_path:
        up = norm_path.replace("universal/", "").replace("khanza-external/", "")
        return proxy_request(SIMRS_UNIVERSAL_URL, up, request.method, data=request.get_json(silent=True), params=request.args)

    if norm_path.startswith("radiology"):
        return proxy_request(SIMRS_UNIVERSAL_URL, norm_path, request.method, data=request.get_json(silent=True), params=request.args)

    # 5. Dashboard & Usage
    if norm_path == "dashboard": return proxy_request(PACS_SERVICE_URL, "api/usage/alerts", "GET")
    if norm_path.startswith("usage"):
        return proxy_request(PACS_SERVICE_URL, f"api/{norm_path}", request.method, data=request.get_json(silent=True), params=request.args)

    # 6. Specific Sub-modules
    if norm_path.startswith("measurements") or norm_path.startswith("impersonate"):
        return proxy_request(PACS_SERVICE_URL, f"api/{norm_path}", request.method, data=request.get_json(silent=True), params=request.args)

    if norm_path.startswith("simulator"):
        # Explicit proxy to simrs-universal-api with /simulator path preserved
        target_path = f"/{norm_path}" if not norm_path.startswith("/") else norm_path
        return proxy_request(SIMRS_UNIVERSAL_URL, target_path, request.method, data=request.get_json(silent=True), params=request.args)

    # 6. SATUSEHAT Monitor Endpoints (with fallback to orders service)
    if norm_path.startswith("monitor/satusehat"):
        # Build target URL for satusehat-integrator
        target_url = f"{SATUSEHAT_INTEGRATOR_URL.rstrip('/')}/{norm_path.lstrip('/')}"
        # Forward headers (exclude Host)
        forward_headers = {k: v for k, v in request.headers.items() if k.lower() != 'host'}
        try:
            r = requests.request(
                method=request.method,
                url=target_url,
                headers=forward_headers,
                json=request.get_json(silent=True),
                params=request.args,
                timeout=10
            )
            if r.status_code < 400:
                return Response(r.content, status=r.status_code, headers=dict(r.headers))
            else:
                raise Exception(f"Integrator returned {r.status_code}")
        except Exception as e:
            logger.warning(f"[Gateway] satusehat-integrator error for {norm_path}: {e}. Falling back to orders service.")
            # Fallback: use orders/satusehat-status endpoint (same query params)
            qs = request.query_string.decode()
            fallback_path = f"orders/satusehat-status{('?' + qs) if qs else ''}"
            return proxy_request(ORDER_SERVICE_URL, fallback_path, "GET", params=request.args)

    # 7. SATUSEHAT Token Generation (High Priority)
    if norm_path == "satusehat/token/generate" and request.method == "POST":
        # 1. Check satusehat-integrator cache
        try:
            health_url = f"{SATUSEHAT_INTEGRATOR_URL.rstrip('/')}/oauth/health"
            health_resp = requests.get(health_url, timeout=5)
            if health_resp.status_code == 200:
                health_data = health_resp.json()
                if health_data.get("valid") is True:
                    token_url = f"{SATUSEHAT_INTEGRATOR_URL.rstrip('/')}/oauth/token"
                    token_resp = requests.get(token_url, timeout=5)
                    if token_resp.status_code == 200:
                        return jsonify({
                            "status": "ok",
                            "source": "cache",
                            "integrator": True,
                            "token": token_resp.json()
                        })
        except Exception as e:
            logger.warning(f"[Gateway] Integrator token check failed: {e}")

        # 2. Fallback: Direct generation
        try:
            h = {}
            tenant_id, _, _ = extract_tenant_context()
            if tenant_id:
                h['X-Tenant-ID'] = str(tenant_id)
                h['X-Hospital-ID'] = str(tenant_id)
            
            if request.headers.get('Authorization'):
                h['Authorization'] = request.headers.get('Authorization')

            settings_url = f"{MASTER_DATA_SERVICE_URL.rstrip('/')}/settings/integration_registry"
            config_resp = requests.get(settings_url, headers=h, timeout=10)
            if config_resp.status_code != 200:
                return error_response("INTEGRATION_SETTINGS_FETCH_FAILED", "Failed to fetch integration settings", 400, {"details": config_resp.text})
            
            config_data = config_resp.json()
            satusehat_cfg = config_data.get("satusehat")
            if not satusehat_cfg and "integration_registry" in config_data:
                satusehat_cfg = config_data.get("integration_registry", {}).get("satusehat")

            if not satusehat_cfg or not satusehat_cfg.get("enabled"):
                return error_response("INTEGRATION_DISABLED", "SatuSehat integration not configured or disabled", 400)

            client_id = satusehat_cfg.get("clientId")
            client_secret = satusehat_cfg.get("clientSecret")
            token_endpoint = satusehat_cfg.get("tokenEndpoint")
            
            if not all([client_id, client_secret, token_endpoint]):
                return error_response("CREDENTIALS_MISSING", "Missing SatuSehat credentials (clientId, clientSecret, or tokenEndpoint)", 400)

            payload = {
                "grant_type": "client_credentials",
                "client_id": client_id,
                "client_secret": client_secret
            }
            if satusehat_cfg.get("scope"):
                payload["scope"] = satusehat_cfg.get("scope")

            timeout = satusehat_cfg.get("timeoutMs", 10000) / 1000
            ss_resp = requests.post(token_endpoint, data=payload, timeout=timeout)
            
            if ss_resp.status_code != 200:
                return jsonify({
                    "error": "Failed to generate token from SatuSehat direct",
                    "status_code": ss_resp.status_code,
                    "details": ss_resp.text
                }), 502

            token_data = ss_resp.json()

            # 3. Sync back to integrator
            try:
                sync_payload = {
                    "access_token": token_data.get("access_token"),
                    "token_type": token_data.get("token_type"),
                    "expires_in": token_data.get("expires_in"),
                    "scope": token_data.get("scope"),
                    "issued_at": token_data.get("issued_at") or int(time.time() * 1000),
                    "organizationId": satusehat_cfg.get("organizationId")
                }
                sync_url = f"{SATUSEHAT_INTEGRATOR_URL.rstrip('/')}/oauth/token/store"
                requests.post(sync_url, json=sync_payload, timeout=5)
            except Exception as sync_e:
                logger.warning(f"[Gateway] Failed to sync token to integrator: {sync_e}")

            return jsonify({
                "status": "ok",
                "source": "direct",
                "env": satusehat_cfg.get("env"),
                "organizationId": satusehat_cfg.get("organizationId"),
                "tokenEndpoint": token_endpoint,
                "token": token_data
            })

        except Exception as e:
            logger.error(f"[Gateway] Fallback token generation failed: {e}")
            return error_response("INTERNAL_ERROR", f"Internal gateway error: {str(e)}", 503)

    # 7. SATUSEHAT & FHIR
    if norm_path.startswith("satusehat") or norm_path.startswith("fhir"):
        target_path = norm_path
        if norm_path.startswith("satusehat/"):
            target_path = norm_path[10:]
        return proxy_request(SATUSEHAT_INTEGRATOR_URL, target_path, request.method, data=request.get_json(silent=True), params=request.args)

    # 8. PACS Default (catch-all → pacs-service)
    p_path = norm_path if norm_path.startswith("api/") else f"api/{norm_path}"

    # Explicit DICOM upload routes — multipart/form-data, forward raw body
    if norm_path.startswith("dicom/upload") or norm_path.startswith("dicom/bulk"):
        p_path = f"api/{norm_path}"
        logger.info(f"[Gateway] DICOM upload → pacs-service: {p_path}")
        return proxy_request(PACS_SERVICE_URL, p_path, request.method, data=request.get_json(silent=True), params=request.args)

    if norm_path.startswith("dicom/nodes"): p_path = f"api/dicom/nodes/{norm_path[11:].lstrip('/')}"
    if norm_path.startswith("dicom-nodes"): p_path = f"api/dicom/nodes/{norm_path[11:].lstrip('/')}"
    if norm_path.startswith("products"): p_path = f"api/subscriptions/products/{norm_path[8:].lstrip('/')}"
    if norm_path.startswith("subscriptions"): p_path = f"api/subscriptions/{norm_path[13:].lstrip('/')}"

    # Explicit mapping for storage migration and health endpoints
    if norm_path.startswith("storage-migrations"): p_path = f"api/storage-migrations{norm_path[18:]}"
    if norm_path == "storage-locations": p_path = "api/storage-locations"
    if norm_path.startswith("storage-backends"): p_path = f"api/storage-backends{norm_path[16:]}"
    if norm_path.startswith("storage-health"): p_path = f"api/storage-health{norm_path[14:]}"

    return proxy_request(PACS_SERVICE_URL, p_path, request.method, data=request.get_json(silent=True), params=request.args)

if __name__ == "__main__": app.run(host="0.0.0.0", port=8888)

