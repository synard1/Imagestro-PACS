import psycopg2
import logging

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DB_CONFIG = {
    "host": "172.28.0.1",
    "database": "worklist_db",
    "user": "dicom",
    "password": "E4RMTJiyTmfUwk+tztrRKw==",
    "port": 5433
}

def run_migration():
    conn = None
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        logger.info("Starting Tenant & Subscription System migration...")

        # 1. Tenants Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tenants (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(255) NOT NULL,
                slug VARCHAR(100) UNIQUE NOT NULL,
                domain VARCHAR(255) UNIQUE,
                is_active BOOLEAN DEFAULT TRUE,
                verified BOOLEAN DEFAULT FALSE,
                metadata JSONB DEFAULT '{}',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # 2. Tenant Invitations
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tenant_invitations (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
                email VARCHAR(255) NOT NULL,
                role VARCHAR(50) DEFAULT 'admin',
                token VARCHAR(255) UNIQUE NOT NULL,
                expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                accepted_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # 3. Feature Flags
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS feature_flags (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
                name VARCHAR(100) NOT NULL,
                is_enabled BOOLEAN DEFAULT FALSE,
                overrides JSONB DEFAULT '{}',
                UNIQUE(tenant_id, name)
            );
        """)

        # 4. Usage Records
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS usage_records (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
                metric_name VARCHAR(100) NOT NULL,
                quantity BIGINT DEFAULT 0,
                unit VARCHAR(50),
                recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                metadata JSONB DEFAULT '{}'
            );
        """)

        # 5. Usage Alerts
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS usage_alerts (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
                metric_name VARCHAR(100) NOT NULL,
                threshold BIGINT NOT NULL,
                alert_level VARCHAR(20) DEFAULT 'warning',
                is_resolved BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # 6. Billing Events
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS billing_events (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
                event_type VARCHAR(100) NOT NULL,
                amount DECIMAL(15,2),
                currency VARCHAR(10) DEFAULT 'IDR',
                status VARCHAR(50) DEFAULT 'pending',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        """)

        conn.commit()
        logger.info("Migration successful!")
        
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Migration failed: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    run_migration()
