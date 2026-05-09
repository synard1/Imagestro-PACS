"""
Authentication Service with JWT and User Management
Handles login, registration, token management, and RBAC
"""
import os
import sys
import uuid
import secrets
import time
from datetime import datetime, timedelta, timezone
from flask import Flask, request, jsonify
from flask_cors import CORS
import jwt
import bcrypt
import psycopg2
from psycopg2.extras import RealDictCursor
from contextlib import contextmanager
from functools import wraps
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stdout
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, resources={
    r"/auth/*": {"origins": "*"},
    r"/health": {"origins": "*"}
})

# Configure Flask to handle JSON properly
app.config['JSON_SORT_KEYS'] = False

# Configuration
JWT_SECRET = os.getenv('JWT_SECRET', secrets.token_hex(32))
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = int(os.getenv('JWT_EXPIRATION_HOURS', 24))
REFRESH_TOKEN_DAYS = int(os.getenv('REFRESH_TOKEN_DAYS', 30))

DB_CONFIG = {
    'host': os.getenv('POSTGRES_HOST', 'postgres'),
    'database': os.getenv('POSTGRES_DB', 'worklist_db'),
    'user': os.getenv('POSTGRES_USER', 'dicom'),
    'password': os.getenv('POSTGRES_PASSWORD', 'dicom123'),
    'port': 5432,
    'connect_timeout': 10,
    'application_name': 'auth_service'
}

# Role definitions with permissions
ROLES = {
    'ADMIN': {
        'permissions': ['*'],  # All permissions
        'description': 'System Administrator'
    },
    'DOCTOR': {
        'permissions': ['order:read', 'order:create', 'worklist:read', 'worklist:update', 'orthanc:read'],
        'description': 'Medical Doctor'
    },
    'TECHNICIAN': {
        'permissions': ['worklist:read', 'worklist:update', 'worklist:scan', 'orthanc:read', 'orthanc:write'],
        'description': 'Radiology Technician'
    },
    'RECEPTIONIST': {
        'permissions': ['order:read', 'order:create', 'worklist:create', 'worklist:read', 'worklist:search'],
        'description': 'Front Desk Receptionist'
    },
    'VIEWER': {
        'permissions': ['worklist:read', 'orthanc:read'],
        'description': 'Read-only Access'
    }
}

def wait_for_database(max_retries=30, delay=2):
    """Wait for database to be available with retry mechanism"""
    for attempt in range(max_retries):
        try:
            conn = psycopg2.connect(**DB_CONFIG)
            conn.close()
            logger.info("Database connection successful")
            return True
        except psycopg2.OperationalError as e:
            if attempt < max_retries - 1:
                logger.warning(f"Database not ready (attempt {attempt + 1}/{max_retries}): {str(e)}")
                time.sleep(delay)
            else:
                logger.error(f"Failed to connect to database after {max_retries} attempts")
                raise
        except Exception as e:
            logger.error(f"Unexpected database error: {str(e)}")
            raise
    return False

@contextmanager
def get_db_connection():
    conn = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        yield conn
        conn.commit()
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Database error: {str(e)}")
        raise
    finally:
        if conn:
            conn.close()

def init_database():
    """Initialize authentication tables"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            cursor.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
            
            # Users table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    username VARCHAR(100) UNIQUE NOT NULL,
                    email VARCHAR(200) UNIQUE NOT NULL,
                    password_hash VARCHAR(200) NOT NULL,
                    full_name VARCHAR(200),
                    role VARCHAR(50) NOT NULL DEFAULT 'VIEWER',
                    is_active BOOLEAN DEFAULT TRUE,
                    is_verified BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_login TIMESTAMP,
                    failed_login_attempts INTEGER DEFAULT 0,
                    locked_until TIMESTAMP
                )
            """)
            
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)")
            
            # Refresh tokens table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS refresh_tokens (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                    token_hash VARCHAR(200) NOT NULL,
                    expires_at TIMESTAMP NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    revoked_at TIMESTAMP,
                    ip_address VARCHAR(45),
                    user_agent TEXT
                )
            """)
            
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at)")
            
            # Audit log for auth events
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS auth_audit_log (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
                    username VARCHAR(100),
                    action VARCHAR(50) NOT NULL,
                    success BOOLEAN NOT NULL,
                    ip_address VARCHAR(45),
                    user_agent TEXT,
                    details JSONB,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_auth_audit_user_id ON auth_audit_log(user_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_auth_audit_action ON auth_audit_log(action)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_auth_audit_created_at ON auth_audit_log(created_at)")
            
            # Create default admin user if not exists
            cursor.execute("SELECT COUNT(*) FROM users WHERE username = 'admin'")
            if cursor.fetchone()[0] == 0:
                admin_password = os.getenv('ADMIN_PASSWORD', 'Admin@12345')
                password_hash = bcrypt.hashpw(admin_password.encode(), bcrypt.gensalt()).decode()
                
                cursor.execute("""
                    INSERT INTO users (username, email, password_hash, full_name, role, is_active, is_verified)
                    VALUES ('admin', 'admin@hospital.local', %s, 'System Administrator', 'ADMIN', TRUE, TRUE)
                """, (password_hash,))
                
                logger.info("Default admin user created")
                logger.info(f"Admin username: admin, email: admin@hospital.local, password_hash: {password_hash}")
            
            logger.info("Authentication database initialized")
            
    except Exception as e:
        logger.error(f"Failed to initialize auth database: {str(e)}")
        raise

def hash_password(password):
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password, password_hash):
    return bcrypt.checkpw(password.encode(), password_hash.encode())

def generate_tokens(user_id, username, role):
    """Generate access token and refresh token"""
    # Use UTC timezone for consistent timestamps
    now = datetime.now(timezone.utc)
    
    # Access token (short-lived)
    access_payload = {
        'user_id': str(user_id),
        'username': username,
        'role': role,
        'permissions': ROLES.get(role, {}).get('permissions', []),
        'exp': now + timedelta(hours=JWT_EXPIRATION_HOURS),
        'iat': now,
        'type': 'access'
    }
    access_token = jwt.encode(access_payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    
    # Refresh token (long-lived)
    refresh_token = secrets.token_urlsafe(32)
    refresh_token_hash = bcrypt.hashpw(refresh_token.encode(), bcrypt.gensalt()).decode()
    
    return access_token, refresh_token, refresh_token_hash

def log_auth_event(user_id, username, action, success, details=None):
    """Log authentication events"""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO auth_audit_log (user_id, username, action, success, ip_address, user_agent, details)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (
                user_id,
                username,
                action,
                success,
                request.remote_addr,
                request.headers.get('User-Agent'),
                psycopg2.extras.Json(details) if details else None
            ))
    except Exception as e:
        logger.error(f"Failed to log auth event: {str(e)}")

@app.route('/', methods=['GET'])
def index():
    return jsonify({
        "service": "Authentication Service",
        "version": "1.0",
        "status": "running",
        "endpoints": {
            "health": "GET /health",
            "login": "POST /auth/login",
            "register": "POST /auth/register",
            "refresh": "POST /auth/refresh",
            "logout": "POST /auth/logout",
            "verify": "POST /auth/verify",
            "me": "GET /auth/me",
            "users": "GET /auth/users",
            "change_password": "POST /auth/change-password"
        }
    }), 200

@app.route('/health', methods=['GET'])
def health():
    db_status = "unknown"
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            db_status = "healthy"
    except:
        db_status = "unhealthy"
    
    return jsonify({
        "status": "healthy",
        "database": db_status,
        "timestamp": datetime.now().isoformat()
    }), 200

@app.route('/auth/login', methods=['POST'])
def login():
    """User login endpoint"""
    try:
        # Validate request content type
        if not request.is_json:
            logger.warning("Login request content type is not JSON")
            return jsonify({"status": "error", "message": "Content-Type must be application/json"}), 400
        
        data = request.get_json()
        if not data:
            logger.warning("Login request body is empty or invalid JSON")
            return jsonify({"status": "error", "message": "Request body must contain valid JSON"}), 400
            
        username = data.get('username')
        password = data.get('password')
        
        if not username or not password:
            return jsonify({"status": "error", "message": "Username and password required"}), 400
        
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            cursor.execute("""
                SELECT id, username, email, password_hash, full_name, role, is_active, 
                       failed_login_attempts, locked_until
                FROM users 
                WHERE username = %s OR email = %s
            """, (username, username))
            
            user = cursor.fetchone()
            
            if not user:
                log_auth_event(None, username, 'LOGIN', False, {"reason": "user_not_found"})
                return jsonify({"status": "error", "message": "Invalid credentials"}), 401
            
            # Check if account is locked
            if user['locked_until'] and user['locked_until'] > datetime.now():
                log_auth_event(user['id'], username, 'LOGIN', False, {"reason": "account_locked"})
                return jsonify({"status": "error", "message": "Account locked. Try again later"}), 403
            
            # Check if account is active
            if not user['is_active']:
                log_auth_event(user['id'], username, 'LOGIN', False, {"reason": "account_inactive"})
                return jsonify({"status": "error", "message": "Account is inactive"}), 403
            
            # Verify password
            if not verify_password(password, user['password_hash']):
                # Increment failed login attempts
                cursor.execute("""
                    UPDATE users 
                    SET failed_login_attempts = failed_login_attempts + 1,
                        locked_until = CASE 
                            WHEN failed_login_attempts >= 4 THEN CURRENT_TIMESTAMP + INTERVAL '30 minutes'
                            ELSE NULL 
                        END
                    WHERE id = %s
                """, (user['id'],))
                
                log_auth_event(user['id'], username, 'LOGIN', False, {"reason": "invalid_password"})
                return jsonify({"status": "error", "message": "Invalid credentials"}), 401
            
            # Generate tokens
            access_token, refresh_token, refresh_token_hash = generate_tokens(
                user['id'], user['username'], user['role']
            )
            
            # Store refresh token
            cursor.execute("""
                INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
                VALUES (%s, %s, %s, %s, %s)
            """, (
                user['id'],
                refresh_token_hash,
                datetime.now() + timedelta(days=REFRESH_TOKEN_DAYS),
                request.remote_addr,
                request.headers.get('User-Agent')
            ))
            
            # Update last login and reset failed attempts
            cursor.execute("""
                UPDATE users 
                SET last_login = CURRENT_TIMESTAMP, 
                    failed_login_attempts = 0,
                    locked_until = NULL
                WHERE id = %s
            """, (user['id'],))
            
            log_auth_event(user['id'], username, 'LOGIN', True)
            
            return jsonify({
                "status": "success",
                "message": "Login successful",
                "access_token": access_token,
                "refresh_token": refresh_token,
                "token_type": "Bearer",
                "expires_in": JWT_EXPIRATION_HOURS * 3600,
                "user": {
                    "id": str(user['id']),
                    "username": user['username'],
                    "email": user['email'],
                    "full_name": user['full_name'],
                    "role": user['role'],
                    "permissions": ROLES.get(user['role'], {}).get('permissions', [])
                }
            }), 200
            
    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500

@app.route('/auth/register', methods=['POST'])
def register():
    """User registration endpoint"""
    try:
        data = request.get_json()
        username = data.get('username')
        email = data.get('email')
        password = data.get('password')
        full_name = data.get('full_name')
        role = data.get('role', 'VIEWER')
        
        if not username or not email or not password:
            return jsonify({"status": "error", "message": "Username, email, and password required"}), 400
        
        if role not in ROLES:
            return jsonify({"status": "error", "message": f"Invalid role. Must be one of: {', '.join(ROLES.keys())}"}), 400
        
        # Password strength check
        if len(password) < 8:
            return jsonify({"status": "error", "message": "Password must be at least 8 characters"}), 400
        
        password_hash = hash_password(password)
        
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            try:
                cursor.execute("""
                    INSERT INTO users (username, email, password_hash, full_name, role)
                    VALUES (%s, %s, %s, %s, %s)
                    RETURNING id, username, email, role
                """, (username, email, password_hash, full_name, role))
                
                user = cursor.fetchone()
                
                log_auth_event(user[0], username, 'REGISTER', True)
                
                return jsonify({
                    "status": "success",
                    "message": "User registered successfully",
                    "user": {
                        "id": str(user[0]),
                        "username": user[1],
                        "email": user[2],
                        "role": user[3]
                    }
                }), 201
                
            except psycopg2.IntegrityError as e:
                if 'username' in str(e):
                    return jsonify({"status": "error", "message": "Username already exists"}), 409
                elif 'email' in str(e):
                    return jsonify({"status": "error", "message": "Email already exists"}), 409
                else:
                    raise
                    
    except Exception as e:
        logger.error(f"Registration error: {str(e)}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500

@app.route('/auth/verify', methods=['POST'])
def verify_token():
    """Verify JWT token"""
    try:
        # Check if request has proper content type for JSON (if body is expected)
        if request.content_length and request.content_length > 0:
            if not request.is_json:
                logger.warning("Request content type is not JSON")
                return jsonify({"status": "error", "message": "Content-Type must be application/json"}), 400
        
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            logger.warning("Missing or invalid authorization header")
            return jsonify({"status": "error", "message": "Missing or invalid authorization header"}), 401
        
        token = auth_header.split(' ')[1]
        logger.debug(f"Verifying token: {token[:20]}...")
        
        try:
            # Decode token with current JWT_SECRET
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            logger.info(f"Token verified successfully for user: {payload.get('username')}")
            
            return jsonify({
                "status": "success",
                "valid": True,
                "payload": {
                    "user_id": payload.get('user_id'),
                    "username": payload.get('username'),
                    "role": payload.get('role'),
                    "permissions": payload.get('permissions'),
                    "exp": payload.get('exp'),
                    "iat": payload.get('iat')
                }
            }), 200
            
        except jwt.ExpiredSignatureError as e:
            logger.warning(f"Token expired: {str(e)}")
            return jsonify({"status": "error", "valid": False, "message": "Token expired"}), 401
        except jwt.InvalidSignatureError as e:
            logger.error(f"Invalid token signature: {str(e)}")
            return jsonify({"status": "error", "valid": False, "message": "Invalid token signature"}), 401
        except jwt.InvalidTokenError as e:
            logger.error(f"Invalid token: {str(e)}")
            return jsonify({"status": "error", "valid": False, "message": "Invalid token"}), 401
            
    except Exception as e:
        logger.error(f"Token verification error: {str(e)}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500

@app.route('/auth/me', methods=['GET'])
def get_current_user():
    """Get current user info"""
    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            return jsonify({"status": "error", "message": "Missing authorization header"}), 401
        
        token = auth_header.split(' ')[1]
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        
        user_id = payload.get('user_id')
        
        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("""
                SELECT id, username, email, full_name, role, is_active, created_at, last_login
                FROM users WHERE id = %s
            """, (user_id,))
            
            user = cursor.fetchone()
            
            if not user:
                return jsonify({"status": "error", "message": "User not found"}), 404
            
            user['id'] = str(user['id'])
            return jsonify({"status": "success", "user": user}), 200
            
    except jwt.InvalidTokenError:
        return jsonify({"status": "error", "message": "Invalid token"}), 401
    except Exception as e:
        logger.error(f"Get user error: {str(e)}")
        return jsonify({"status": "error", "message": "Internal server error"}), 500

# Error handlers
@app.errorhandler(400)
def bad_request(error):
    logger.warning(f"Bad request: {error}")
    return jsonify({
        "status": "error",
        "message": "Bad request - invalid JSON or missing required fields",
        "error_code": 400
    }), 400

@app.errorhandler(404)
def not_found(error):
    logger.warning(f"Not found: {error}")
    return jsonify({
        "status": "error",
        "message": "Endpoint not found",
        "error_code": 404
    }), 404

@app.errorhandler(405)
def method_not_allowed(error):
    logger.warning(f"Method not allowed: {error}")
    return jsonify({
        "status": "error",
        "message": "Method not allowed",
        "error_code": 405
    }), 405

@app.errorhandler(500)
def internal_error(error):
    logger.error(f"Internal server error: {error}")
    return jsonify({
        "status": "error",
        "message": "Internal server error",
        "error_code": 500
    }), 500

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "service": "auth-service",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }), 200

@app.route('/auth/debug', methods=['GET'])
def debug_jwt():
    """Debug endpoint for JWT configuration"""
    try:
        return jsonify({
            "status": "success",
            "jwt_config": {
                "algorithm": JWT_ALGORITHM,
                "expiration_hours": JWT_EXPIRATION_HOURS,
                "refresh_token_days": REFRESH_TOKEN_DAYS,
                "secret_set": bool(JWT_SECRET),
                "secret_length": len(JWT_SECRET) if JWT_SECRET else 0,
                "secret_first_chars": JWT_SECRET[:8] + "..." if JWT_SECRET else "NOT SET"
            },
            "current_time_utc": datetime.now(timezone.utc).isoformat(),
            "available_roles": list(ROLES.keys())
        }), 200
    except Exception as e:
        logger.error(f"Debug endpoint error: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    logger.info("=" * 80)
    logger.info("Authentication Service starting...")
    logger.info("JWT Secret: " + ("SET" if JWT_SECRET else "NOT SET"))
    logger.info("Token Expiration: {} hours".format(JWT_EXPIRATION_HOURS))
    logger.info("Available Roles: {}".format(', '.join(ROLES.keys())))
    logger.info("=" * 80)
    
    # Wait for database to be available
    logger.info("Waiting for database connection...")
    try:
        wait_for_database()
        logger.info("Database connection established")
    except Exception as e:
        logger.error(f"Failed to connect to database: {str(e)}")
        sys.exit(1)
    
    # Initialize database
    try:
        init_database()
        logger.info("Authentication Service initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize database: {str(e)}")
        sys.exit(1)
    
    logger.info("Authentication Service ready to accept connections")
    app.run(host='0.0.0.0', port=5000, debug=False)
