#!/bin/bash
# ==============================================================================
# PostgreSQL Multi-Database Initialization Script
# ==============================================================================
# This script runs ONLY on first database initialization
# It creates multiple databases and users for different services
# ==============================================================================

set -e  # Exit on error
set -u  # Exit on undefined variable

# Provide sane defaults when running this script manually outside container
POSTGRES_DB="${POSTGRES_DB:-worklist_db}"
POSTGRES_USER="${POSTGRES_USER:-dicom}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-dicom123}"
ORTHANC_DB="${ORTHANC_DB:-orthanc}"
ORTHANC_USER="${ORTHANC_USER:-orthanc}"
ORTHANC_PASSWORD="${ORTHANC_PASSWORD:-orthanc123}"
TZ="${TZ:-UTC}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "========================================================================"
echo "PostgreSQL Multi-Database Initialization"
echo "========================================================================"
echo ""

# ==============================================================================
# Function to create database and user
# ==============================================================================
create_database_and_user() {
    local DB_NAME=$1
    local DB_USER=$2
    local DB_PASS=$3
    local DESCRIPTION=$4
    
    echo -e "${BLUE}Creating database: ${DB_NAME}${NC}"
    echo -e "  User: ${DB_USER}"
    echo -e "  Purpose: ${DESCRIPTION}"
    
    # Create user if not exists
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
        DO \$\$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_catalog.pg_user WHERE usename = '${DB_USER}') THEN
                CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';
                RAISE NOTICE 'User ${DB_USER} created';
            ELSE
                RAISE NOTICE 'User ${DB_USER} already exists';
            END IF;
        END \$\$;
EOSQL
    
    # Create database if not exists
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
        SELECT 'CREATE DATABASE ${DB_NAME} OWNER ${DB_USER} ENCODING ''UTF8'' LC_COLLATE ''en_US.utf8'' LC_CTYPE ''en_US.utf8'''
        WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}')\gexec
EOSQL
    
    # Grant privileges
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
        GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
EOSQL
    
    # Create extensions in the new database
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "${DB_NAME}" <<-EOSQL
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
        CREATE EXTENSION IF NOT EXISTS "pg_trgm";      -- For fuzzy text search
        CREATE EXTENSION IF NOT EXISTS "btree_gin";    -- For better indexing
        CREATE EXTENSION IF NOT EXISTS "pgcrypto";     -- For encryption functions
EOSQL
    
    echo -e "${GREEN}✓ Database ${DB_NAME} created successfully${NC}"
    echo ""
}

# ==============================================================================
# Create Main Databases
# ==============================================================================

echo "Creating main application databases..."
echo ""

# 1. Worklist Database (Auth + MWL Writer)
create_database_and_user \
    "${POSTGRES_DB}" \
    "${POSTGRES_USER}" \
    "${POSTGRES_PASSWORD}" \
    "Authentication, User Management, and Worklist data"

# 2. Orthanc Database
create_database_and_user \
    "${ORTHANC_DB:-orthanc}" \
    "${ORTHANC_USER:-orthanc}" \
    "${ORTHANC_PASSWORD:-orthanc123}" \
    "Orthanc DICOM Server storage"

# ==============================================================================
# Grant Cross-Database Permissions
# ==============================================================================

echo -e "${BLUE}Setting up cross-database permissions...${NC}"

# Allow orthanc user to read from worklist_db (for worklist plugin)
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO ${ORTHANC_USER:-orthanc};
EOSQL

# Allow dicom user to connect to orthanc database (for admin purposes)
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "${ORTHANC_DB:-orthanc}" <<-EOSQL
    GRANT CONNECT ON DATABASE ${ORTHANC_DB:-orthanc} TO ${POSTGRES_USER};
EOSQL

echo -e "${GREEN}✓ Cross-database permissions configured${NC}"
echo ""

# ==============================================================================
# Create Shared Schemas (if needed)
# ==============================================================================

echo -e "${BLUE}Creating shared schemas...${NC}"

# Create a shared schema for common functions/views accessible across databases
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create shared schema for common utilities
    CREATE SCHEMA IF NOT EXISTS shared;
    
    -- Grant usage to all users
    GRANT USAGE ON SCHEMA shared TO PUBLIC;
    
    -- Create useful shared functions
    CREATE OR REPLACE FUNCTION shared.generate_accession_number()
    RETURNS TEXT AS \$\$
    BEGIN
        RETURN 'ACC' || TO_CHAR(NOW(), 'YYYYMMDDHH24MISS') || LPAD(FLOOR(RANDOM() * 1000)::TEXT, 3, '0');
    END;
    \$\$ LANGUAGE plpgsql;
    
    -- Create audit trigger function
    CREATE OR REPLACE FUNCTION shared.audit_trigger()
    RETURNS TRIGGER AS \$\$
    BEGIN
        IF TG_OP = 'INSERT' THEN
            NEW.created_at = CURRENT_TIMESTAMP;
            NEW.updated_at = CURRENT_TIMESTAMP;
        ELSIF TG_OP = 'UPDATE' THEN
            NEW.updated_at = CURRENT_TIMESTAMP;
        END IF;
        RETURN NEW;
    END;
    \$\$ LANGUAGE plpgsql;
    
    COMMENT ON SCHEMA shared IS 'Shared utilities and functions across databases';
EOSQL

echo -e "${GREEN}✓ Shared schemas created${NC}"
echo ""

# ==============================================================================
# Setup Database Roles and Security
# ==============================================================================

echo -e "${BLUE}Setting up database roles and security...${NC}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create read-only role
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'readonly') THEN
            CREATE ROLE readonly;
            RAISE NOTICE 'Role readonly created';
        END IF;
    END \$\$;
    
    -- Grant read-only permissions
    GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO readonly;
    GRANT USAGE ON SCHEMA public TO readonly;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO readonly;
    
    -- Create app_user role for application services
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_user') THEN
            CREATE ROLE app_user;
            RAISE NOTICE 'Role app_user created';
        END IF;
    END \$\$;
    
    -- Grant app_user permissions
    GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO app_user;
    GRANT USAGE, CREATE ON SCHEMA public TO app_user;
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_user;
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO app_user;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO app_user;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO app_user;
    
    -- Add existing users to roles
    GRANT app_user TO ${POSTGRES_USER};
    GRANT app_user TO ${ORTHANC_USER:-orthanc};
EOSQL

echo -e "${GREEN}✓ Database roles configured${NC}"
echo ""

# ==============================================================================
# Create Initial Tables for Worklist Database
# ==============================================================================

echo -e "${BLUE}Creating initial table structures...${NC}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Enable required extensions
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    
    -- Create users table
    CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        username VARCHAR(100) UNIQUE NOT NULL,
        email VARCHAR(200) UNIQUE NOT NULL,
        password_hash VARCHAR(200) NOT NULL,
        full_name VARCHAR(200),
        role VARCHAR(50) NOT NULL DEFAULT 'VIEWER',
        is_active BOOLEAN DEFAULT TRUE,
        is_verified BOOLEAN DEFAULT FALSE,
        failed_login_attempts INTEGER DEFAULT 0,
        locked_until TIMESTAMP,
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by VARCHAR(200),
        modified_by VARCHAR(200)
    );
    
    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
    
    -- Create refresh_tokens table
    CREATE TABLE IF NOT EXISTS refresh_tokens (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(200) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        revoked_at TIMESTAMP,
        ip_address VARCHAR(45),
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
    
    -- Create auth_audit_log table
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
    );
    
    CREATE INDEX IF NOT EXISTS idx_auth_audit_user_id ON auth_audit_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_auth_audit_action ON auth_audit_log(action);
    CREATE INDEX IF NOT EXISTS idx_auth_audit_created_at ON auth_audit_log(created_at);
    
    -- Create worklists table
    CREATE TABLE IF NOT EXISTS worklists (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        accession_number VARCHAR(50) UNIQUE NOT NULL,
        patient_id VARCHAR(50) NOT NULL,
        patient_name VARCHAR(200) NOT NULL,
        patient_birth_date VARCHAR(8),
        patient_sex VARCHAR(1),
        modality VARCHAR(10),
        procedure_description TEXT,
        scheduled_date VARCHAR(8),
        scheduled_time VARCHAR(6),
        physician_name VARCHAR(200),
        station_aet VARCHAR(50),
        study_instance_uid VARCHAR(200),
        status VARCHAR(20) DEFAULT 'SCHEDULED',
        filename VARCHAR(200),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by VARCHAR(200),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        modified_by VARCHAR(200),
        deleted_at TIMESTAMP,
        deleted_by VARCHAR(200)
    );
    
    CREATE INDEX IF NOT EXISTS idx_worklists_accession ON worklists(accession_number);
    CREATE INDEX IF NOT EXISTS idx_worklists_patient_id ON worklists(patient_id);
    CREATE INDEX IF NOT EXISTS idx_worklists_status ON worklists(status);
    CREATE INDEX IF NOT EXISTS idx_worklists_scheduled_date ON worklists(scheduled_date);
    CREATE INDEX IF NOT EXISTS idx_worklists_created_at ON worklists(created_at);
    
    -- Create worklist_audit_log table
    CREATE TABLE IF NOT EXISTS worklist_audit_log (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        worklist_id UUID REFERENCES worklists(id) ON DELETE CASCADE,
        accession_number VARCHAR(50),
        action VARCHAR(50) NOT NULL,
        before_data JSONB,
        after_data JSONB,
        user_info VARCHAR(200),
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_worklist_audit_worklist_id ON worklist_audit_log(worklist_id);
    CREATE INDEX IF NOT EXISTS idx_worklist_audit_action ON worklist_audit_log(action);
    CREATE INDEX IF NOT EXISTS idx_worklist_audit_created_at ON worklist_audit_log(created_at);
    
    -- Create audit triggers
    CREATE TRIGGER users_audit_trigger
        BEFORE INSERT OR UPDATE ON users
        FOR EACH ROW
        EXECUTE FUNCTION shared.audit_trigger();
    
    CREATE TRIGGER worklists_audit_trigger
        BEFORE INSERT OR UPDATE ON worklists
        FOR EACH ROW
        EXECUTE FUNCTION shared.audit_trigger();
EOSQL

echo -e "${GREEN}✓ Initial tables created${NC}"
echo ""

# ==============================================================================
# Setup Orthanc Database
# ==============================================================================

echo -e "${BLUE}Setting up Orthanc database...${NC}"

psql -v ON_ERROR_STOP=1 --username "${ORTHANC_USER:-orthanc}" --dbname "${ORTHANC_DB:-orthanc}" <<-EOSQL
    -- Enable extensions
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS "pg_trgm";
    
    -- Orthanc will create its own tables via PostgreSQL plugin
    -- We just need to ensure the database is properly configured
    
    -- Create a metadata table for tracking
    CREATE TABLE IF NOT EXISTS orthanc_metadata (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    INSERT INTO orthanc_metadata (key, value) 
    VALUES ('initialized', 'true'), ('version', '1.0')
    ON CONFLICT (key) DO NOTHING;
EOSQL

echo -e "${GREEN}✓ Orthanc database configured${NC}"
echo ""

# ==============================================================================
# Create Database Statistics Views
# ==============================================================================

echo -e "${BLUE}Creating database statistics views...${NC}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create view for database statistics (use relname; tablename is not a column in pg_stat_user_tables)
    CREATE OR REPLACE VIEW database_stats AS
    SELECT 
        schemaname,
        relname AS tablename,
        pg_size_pretty(pg_total_relation_size(format('%I.%I', schemaname, relname))) AS size,
        n_live_tup AS row_count,
        last_vacuum,
        last_autovacuum,
        last_analyze
    FROM pg_stat_user_tables
    ORDER BY pg_total_relation_size(format('%I.%I', schemaname, relname)) DESC;
    
    -- Grant access to readonly role
    GRANT SELECT ON database_stats TO readonly;
EOSQL

echo -e "${GREEN}✓ Statistics views created${NC}"
echo ""

# ==============================================================================
# Summary
# ==============================================================================

echo "========================================================================"
echo -e "${GREEN}PostgreSQL Multi-Database Initialization Complete!${NC}"
echo "========================================================================"
echo ""
echo "Databases created:"
echo "  1. ${POSTGRES_DB} - User: ${POSTGRES_USER} (Auth & Worklist)"
echo "  2. ${ORTHANC_DB:-orthanc} - User: ${ORTHANC_USER:-orthanc} (DICOM Storage)"
echo ""
echo "Roles created:"
echo "  - readonly: Read-only access"
echo "  - app_user: Application-level access"
echo ""
echo "Extensions enabled:"
echo "  - uuid-ossp: UUID generation"
echo "  - pg_trgm: Fuzzy text search"
echo "  - btree_gin: Better indexing"
echo "  - pgcrypto: Encryption functions"
echo ""
echo "Initial tables:"
echo "  - users, refresh_tokens, auth_audit_log"
echo "  - worklists, worklist_audit_log"
echo ""
echo "========================================================================"
echo ""

# List all databases
echo "Verifying databases..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "\l"

echo ""
echo "Verifying users..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "\du"

echo ""
echo -e "${GREEN}✓ All initialization tasks completed successfully!${NC}"
echo ""
