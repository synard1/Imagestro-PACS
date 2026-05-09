#!/usr/bin/env python3
"""
Run SaaS Tables Migration
Usage: python run_saas_migration.py [--host HOST] [--port PORT] [--database DB] [--user USER] [--password PASSWORD]
"""

import psycopg2
import argparse
import sys
import os


def get_connection(host, port, database, user, password):
    return psycopg2.connect(
        host=host, port=port, database=database, user=user, password=password
    )


def run_migration(
    host="localhost", port=5432, database="pacs_db", user="postgres", password=""
):
    print("=" * 80)
    print("SaaS Tables Migration - Creating Multi-Tenant System Tables")
    print("=" * 80)
    print(f"Host: {host}:{port}")
    print(f"Database: {database}")
    print(f"User: {user}")
    print("=" * 80)

    conn = None
    try:
        conn = get_connection(host, port, database, user, password)
        cursor = conn.cursor()

        print("\n[1/8] Creating tenants table...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tenants (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(255) NOT NULL,
                code VARCHAR(100) UNIQUE NOT NULL,
                type VARCHAR(50) DEFAULT 'hospital',
                address TEXT,
                city VARCHAR(100),
                province VARCHAR(100),
                country VARCHAR(100) DEFAULT 'Indonesia',
                phone VARCHAR(50),
                email VARCHAR(255),
                website VARCHAR(255),
                contact_person VARCHAR(255),
                contact_email VARCHAR(255),
                tax_id VARCHAR(50),
                external_system_code VARCHAR(100),
                satusehat_org_id VARCHAR(255),
                irc_id VARCHAR(255),
                settings JSONB DEFAULT '{}',
                is_active BOOLEAN DEFAULT TRUE,
                is_verified BOOLEAN DEFAULT FALSE,
                verification_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        """)
        print("  ✓ tenants table created/verified")

        print("\n[2/8] Creating products table...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS products (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(255) NOT NULL,
                code VARCHAR(100) UNIQUE NOT NULL,
                description TEXT,
                tier VARCHAR(50) DEFAULT 'free',
                price DECIMAL(15, 2) DEFAULT 0.0,
                currency VARCHAR(10) DEFAULT 'IDR',
                billing_cycle VARCHAR(20) DEFAULT 'monthly',
                max_users INTEGER,
                max_storage_gb INTEGER,
                max_api_calls_per_day INTEGER,
                features JSONB DEFAULT '[]',
                spec JSONB DEFAULT '{}',
                color VARCHAR(20) DEFAULT '#6b7280',
                is_featured BOOLEAN DEFAULT FALSE,
                is_active BOOLEAN DEFAULT TRUE,
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        """)
        print("  ✓ products table created/verified")

        print("\n[3/8] Creating subscriptions table...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS subscriptions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
                features JSONB,
                status VARCHAR(50) DEFAULT 'active',
                billing_email VARCHAR(255),
                billing_address TEXT,
                tax_id VARCHAR(50),
                trial_started_at TIMESTAMP WITH TIME ZONE,
                trial_ends_at TIMESTAMP WITH TIME ZONE,
                started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP WITH TIME ZONE,
                cancelled_at TIMESTAMP WITH TIME ZONE,
                renewal_at TIMESTAMP WITH TIME ZONE,
                auto_renew BOOLEAN DEFAULT TRUE,
                notes TEXT,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        """)
        print("  ✓ subscriptions table created/verified")

        print("\n[4/8] Creating usage_records table...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS usage_records (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                period VARCHAR(20) DEFAULT 'daily',
                api_calls INTEGER DEFAULT 0,
                api_calls_limit INTEGER,
                storage_bytes BIGINT DEFAULT 0,
                storage_bytes_limit BIGINT,
                active_users INTEGER DEFAULT 0,
                user_limit INTEGER,
                meta_data JSONB DEFAULT '{}',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        """)
        print("  ✓ usage_records table created/verified")

        print("\n[5/8] Creating usage_alerts table...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS usage_alerts (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                alert_type VARCHAR(50) NOT NULL,
                threshold_percent INTEGER DEFAULT 80,
                is_enabled BOOLEAN DEFAULT TRUE,
                is_triggered BOOLEAN DEFAULT FALSE,
                triggered_at TIMESTAMP WITH TIME ZONE,
                acknowledged_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        """)
        print("  ✓ usage_alerts table created/verified")

        print("\n[6/8] Creating billing_events table...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS billing_events (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
                event_type VARCHAR(100) NOT NULL,
                payload JSONB DEFAULT '{}',
                webhook_url VARCHAR(500),
                webhook_attempts INTEGER DEFAULT 0,
                webhook_response JSONB,
                is_delivered BOOLEAN DEFAULT FALSE,
                delivered_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        """)
        print("  ✓ billing_events table created/verified")

        print("\n[7/8] Creating tenant_invitations table...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tenant_invitations (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                email VARCHAR(255) NOT NULL,
                role VARCHAR(50) DEFAULT 'ADMIN',
                token VARCHAR(255) UNIQUE NOT NULL,
                expires_at TIMESTAMP WITH TIME ZONE,
                used_at TIMESTAMP WITH TIME ZONE,
                is_used BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        """)
        print("  ✓ tenant_invitations table created/verified")

        print("\n[8/8] Creating feature_flags table...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS feature_flags (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                feature_key VARCHAR(100) NOT NULL,
                is_enabled BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(tenant_id, feature_key)
            )
        """)
        print("  ✓ feature_flags table created/verified")

        # Create indexes
        print("\n[Indexing] Creating indexes...")
        indexes = [
            ("idx_tenants_code", "tenants(code)"),
            ("idx_tenants_type", "tenants(type)"),
            ("idx_tenants_is_active", "tenants(is_active)"),
            ("idx_products_code", "products(code)"),
            ("idx_products_tier", "products(tier)"),
            ("idx_subscriptions_tenant_id", "subscriptions(tenant_id)"),
            ("idx_subscriptions_status", "subscriptions(status)"),
            ("idx_usage_records_tenant_date", "usage_records(tenant_id, date)"),
        ]
        for idx_name, idx_col in indexes:
            try:
                cursor.execute(f"CREATE INDEX IF NOT EXISTS {idx_name} ON {idx_col}")
                print(f"  ✓ {idx_name}")
            except Exception as e:
                print(f"  ! {idx_name}: {e}")

        # Seed default products
        print("\n[Seeding] Seeding default products...")
        products = [
            (
                "Free Trial",
                "free-tier",
                "free",
                "Ideal for testing and small clinics",
                0,
                5,
                10,
                1000,
            ),
            (
                "Basic PACS",
                "basic-tier",
                "basic",
                "Standard features for growing imaging centers",
                1500000,
                10,
                50,
                5000,
            ),
            (
                "Professional",
                "pro-tier",
                "professional",
                "Advanced analytics and full SatuSehat integration",
                3500000,
                25,
                200,
                20000,
            ),
            (
                "Enterprise",
                "ent-tier",
                "enterprise",
                "Unlimited power for hospital networks",
                10000000,
                None,
                None,
                None,
            ),
        ]

        for name, code, tier, desc, price, users, storage, api_limit in products:
            cursor.execute(
                """
                INSERT INTO products (name, code, tier, description, price, currency, billing_cycle, 
                    max_users, max_storage_gb, max_api_calls_per_day, features, spec, color, is_featured, sort_order)
                VALUES (%s, %s, %s, %s, %s, 'IDR', 'monthly', %s, %s, %s,
                    '[]', '{}', '#6b7280', %s, %s)
                ON CONFLICT (code) DO NOTHING
            """,
                (
                    name,
                    code,
                    tier,
                    desc,
                    price,
                    users,
                    storage,
                    api_limit,
                    tier == "professional",
                    {"free": 1, "basic": 2, "professional": 3, "enterprise": 4}[tier],
                ),
            )
            print(f"  ✓ {name}")

        conn.commit()
        print("\n" + "=" * 80)
        print("✓ Migration completed successfully!")
        print("=" * 80)
        print("\nTables created:")
        print("  - tenants (Multi-tenant organization)")
        print("  - products (Subscription tiers)")
        print("  - subscriptions (Per-tenant subscriptions)")
        print("  - usage_records (Daily usage tracking)")
        print("  - usage_alerts (Threshold alerts)")
        print("  - billing_events (Billing/webhook events)")
        print("  - tenant_invitations (Invitation codes)")
        print("  - feature_flags (Per-tenant feature toggles)")
        print("\nDefault products seeded: Free, Basic, Professional, Enterprise")
        print("=" * 80)

    except Exception as e:
        if conn:
            conn.rollback()
        print("\n✗ Migration failed!")
        print(f"Error: {e}")
        sys.exit(1)
    finally:
        if conn:
            conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run SaaS tables migration")
    parser.add_argument("--host", default=os.getenv("DB_HOST", "localhost"))
    parser.add_argument("--port", default=int(os.getenv("DB_PORT", "5432")))
    parser.add_argument("--database", default=os.getenv("DB_NAME", "pacs_db"))
    parser.add_argument("--user", default=os.getenv("DB_USER", "postgres"))
    parser.add_argument("--password", default=os.getenv("DB_PASSWORD", ""))
    args = parser.parse_args()

    run_migration(args.host, args.port, args.database, args.user, args.password)
