"""
Database Connection with Enhanced Logging
"""

import os
import sys
import time
import logging
from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import OperationalError, DatabaseError

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('/var/log/pacs/database.log')
    ]
)
logger = logging.getLogger(__name__)

# Database configuration from environment
DB_HOST = os.getenv('DB_HOST', 'localhost')
DB_PORT = os.getenv('DB_PORT', '5432')
DB_NAME = os.getenv('DB_NAME', 'pacs_db')
DB_USER = os.getenv('DB_USER', 'postgres')
DB_PASSWORD = os.getenv('DB_PASSWORD', '')

# Build database URL
DATABASE_URL = os.getenv(
    'DATABASE_URL',
    f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)

# Mask password in logs
SAFE_DATABASE_URL = DATABASE_URL.replace(DB_PASSWORD, '***') if DB_PASSWORD else DATABASE_URL

logger.info("=" * 80)
logger.info("Database Configuration")
logger.info("=" * 80)
logger.info(f"Host: {DB_HOST}")
logger.info(f"Port: {DB_PORT}")
logger.info(f"Database: {DB_NAME}")
logger.info(f"User: {DB_USER}")
logger.info(f"Connection URL: {SAFE_DATABASE_URL}")
logger.info("=" * 80)

# Create engine
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    pool_recycle=3600,
    echo=False  # Set to True for SQL query logging
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Read replica configuration (optional - for read scaling)
READ_DB_HOST = os.getenv('READ_DB_HOST', DB_HOST)
READ_DB_PORT = os.getenv('READ_DB_PORT', DB_PORT)
READ_DB_NAME = os.getenv('READ_DB_NAME', DB_NAME)
READ_DB_USER = os.getenv('READ_DB_USER', DB_USER)
READ_DB_PASSWORD = os.getenv('READ_DB_PASSWORD', DB_PASSWORD)

READ_DATABASE_URL = os.getenv(
    'READ_DATABASE_URL',
    f"postgresql://{READ_DB_USER}:{READ_DB_PASSWORD}@{READ_DB_HOST}:{READ_DB_PORT}/{READ_DB_NAME}"
)

SAFE_READ_DATABASE_URL = READ_DATABASE_URL.replace(READ_DB_PASSWORD, '***') if READ_DB_PASSWORD else READ_DATABASE_URL

if READ_DATABASE_URL != DATABASE_URL:
    logger.info("✓ Read replica configured")
    logger.info(f"Read Connection URL: {SAFE_READ_DATABASE_URL}")
    
    read_engine = create_engine(
        READ_DATABASE_URL,
        pool_pre_ping=True,
        pool_size=20,      # Larger pool for read-heavy load
        max_overflow=40,
        pool_recycle=1800, # Shorter recycle for replicas
        echo=False
    )
    
    SessionLocalRead = sessionmaker(autocommit=False, autoflush=False, bind=read_engine)
    
    def get_read_db():
        """Get read-only database session (uses replica if configured)"""
        db = SessionLocalRead()
        try:
            yield db
        finally:
            db.close()
else:
    logger.info("ℹ No read replica configured - reads will use write connection")
    read_engine = engine
    SessionLocalRead = SessionLocal
    
    def get_read_db():
        """Fallback to write connection when no replica"""
        return get_db()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """Get database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_db_connection(max_retries=30, retry_interval=2):
    """
    Check database connection with detailed logging (write + read replica)
    
    Args:
        max_retries: Maximum number of retry attempts
        retry_interval: Seconds to wait between retries
        
    Returns:
        bool: True if connection successful, False otherwise
    """
    logger.info("=" * 80)
    logger.info("Checking Database Connection")
    logger.info("=" * 80)
    logger.info(f"Target: {DB_HOST}:{DB_PORT}/{DB_NAME}")
    logger.info(f"Max retries: {max_retries}")
    logger.info(f"Retry interval: {retry_interval}s")
    logger.info("=" * 80)
    
    for attempt in range(1, max_retries + 1):
        try:
            logger.info(f"Attempt {attempt}/{max_retries}: Connecting to database...")
            
            # Try to connect
            with engine.connect() as connection:
                # Execute simple query
                result = connection.execute(text("SELECT 1"))
                result.fetchone()
                
                # Get database version
                version_result = connection.execute(text("SELECT version()"))
                db_version = version_result.fetchone()[0]
                
                logger.info("=" * 80)
                logger.info("✓ Write Database Connection Successful!")
                logger.info("=" * 80)
                logger.info(f"Database Version: {db_version[:100]}...")
                logger.info(f"Connection established after {attempt} attempt(s)")
                
                # Check read replica if configured
                if hasattr(locals(), 'read_engine') and read_engine != engine:
                    try:
                        logger.info("Checking read replica connection...")
                        with read_engine.connect() as read_conn:
                            read_result = read_conn.execute(text("SELECT 1"))
                            read_result.fetchone()
                        logger.info("✓ Read replica connection successful")
                    except Exception as read_e:
                        logger.warning(f"⚠ Read replica connection failed: {read_e}")
                        logger.warning("Reads will fallback to write connection")
                else:
                    logger.info("ℹ No read replica to check")
                
                logger.info("=" * 80)
                return True
                
        except OperationalError as e:
            error_msg = str(e.orig) if hasattr(e, 'orig') else str(e)
            
            logger.warning("=" * 80)
            logger.warning(f"✗ Connection Failed (Attempt {attempt}/{max_retries})")
            logger.warning("=" * 80)
            logger.warning(f"Error Type: OperationalError")
            logger.warning(f"Error Message: {error_msg}")
            
            # Provide specific troubleshooting hints
            if "could not connect to server" in error_msg.lower():
                logger.warning("Hint: Database server is not reachable")
                logger.warning(f"  - Check if PostgreSQL is running on {DB_HOST}:{DB_PORT}")
                logger.warning(f"  - Check network connectivity: ping {DB_HOST}")
                logger.warning(f"  - Check firewall rules")
                
            elif "password authentication failed" in error_msg.lower():
                logger.warning("Hint: Authentication failed")
                logger.warning(f"  - Check DB_USER: {DB_USER}")
                logger.warning(f"  - Check DB_PASSWORD is correct")
                logger.warning(f"  - Check pg_hba.conf settings")
                
            elif "database" in error_msg.lower() and "does not exist" in error_msg.lower():
                logger.warning("Hint: Database does not exist")
                logger.warning(f"  - Create database: CREATE DATABASE {DB_NAME};")
                logger.warning(f"  - Check database name spelling")
                
            elif "connection refused" in error_msg.lower():
                logger.warning("Hint: Connection refused")
                logger.warning(f"  - PostgreSQL may not be listening on {DB_HOST}:{DB_PORT}")
                logger.warning(f"  - Check postgresql.conf: listen_addresses")
                logger.warning(f"  - Check if port {DB_PORT} is correct")
                
            elif "timeout" in error_msg.lower():
                logger.warning("Hint: Connection timeout")
                logger.warning(f"  - Network latency too high")
                logger.warning(f"  - Database server overloaded")
                logger.warning(f"  - Check network connectivity")
            
            logger.warning("=" * 80)
            
            if attempt < max_retries:
                logger.info(f"Retrying in {retry_interval} seconds...")
                time.sleep(retry_interval)
            else:
                logger.error("=" * 80)
                logger.error("✗ Database Connection Failed!")
                logger.error("=" * 80)
                logger.error(f"Failed after {max_retries} attempts")
                logger.error(f"Last error: {error_msg}")
                logger.error("=" * 80)
                logger.error("Troubleshooting Steps:")
                logger.error("1. Check if PostgreSQL container is running:")
                logger.error("   docker ps | grep postgres")
                logger.error("2. Check PostgreSQL logs:")
                logger.error("   docker logs dicom-postgres-secured")
                logger.error("3. Check network connectivity:")
                logger.error(f"   docker exec pacs-service ping {DB_HOST}")
                logger.error("4. Verify environment variables:")
                logger.error("   docker exec pacs-service env | grep DB_")
                logger.error("5. Check PostgreSQL is accepting connections:")
                logger.error(f"   docker exec dicom-postgres-secured psql -U {DB_USER} -d {DB_NAME} -c 'SELECT 1'")
                logger.error("=" * 80)
                
                return False
                
        except DatabaseError as e:
            error_msg = str(e.orig) if hasattr(e, 'orig') else str(e)
            
            logger.error("=" * 80)
            logger.error(f"✗ Database Error (Attempt {attempt}/{max_retries})")
            logger.error("=" * 80)
            logger.error(f"Error Type: DatabaseError")
            logger.error(f"Error Message: {error_msg}")
            logger.error("=" * 80)
            
            if attempt < max_retries:
                logger.info(f"Retrying in {retry_interval} seconds...")
                time.sleep(retry_interval)
            else:
                return False
                
        except Exception as e:
            logger.error("=" * 80)
            logger.error(f"✗ Unexpected Error (Attempt {attempt}/{max_retries})")
            logger.error("=" * 80)
            logger.error(f"Error Type: {type(e).__name__}")
            logger.error(f"Error Message: {str(e)}")
            logger.error("=" * 80)
            
            if attempt < max_retries:
                logger.info(f"Retrying in {retry_interval} seconds...")
                time.sleep(retry_interval)
            else:
                return False
    
    return False


def test_db_operations():
    """Test basic database operations (write + read)"""
    logger.info("=" * 80)
    logger.info("Testing Database Operations")
    logger.info("=" * 80)
    
    try:
        with engine.connect() as connection:
            # Test 1: List databases
            logger.info("Test 1: Listing databases...")
            result = connection.execute(text("SELECT datname FROM pg_database WHERE datistemplate = false"))
            databases = [row[0] for row in result]
            logger.info(f"Available databases: {', '.join(databases)}")
            
            # Test 2: List tables
            logger.info("Test 2: Listing tables...")
            result = connection.execute(text("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
                ORDER BY table_name
            """))
            tables = [row[0] for row in result]
            if tables:
                logger.info(f"Existing tables: {', '.join(tables)}")
            else:
                logger.info("No tables found (database is empty)")
            
            # Test 3: Check extensions
            logger.info("Test 3: Checking PostgreSQL extensions...")
            result = connection.execute(text("SELECT extname FROM pg_extension"))
            extensions = [row[0] for row in result]
            logger.info(f"Installed extensions: {', '.join(extensions)}")
            
            logger.info("=" * 80)
            logger.info("✓ Database Operations Test Passed")
            logger.info("=" * 80)
            
            return True
            
    except Exception as e:
        logger.error("=" * 80)
        logger.error("✗ Database Operations Test Failed")
        logger.error("=" * 80)
        logger.error(f"Error: {str(e)}")
        logger.error("=" * 80)
        return False