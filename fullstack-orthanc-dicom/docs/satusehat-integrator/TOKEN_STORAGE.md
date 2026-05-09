# SATUSEHAT Token Storage

This document describes the token storage functionality added to the SATUSEHAT integrator service.

## Overview

The SATUSEHAT integrator now stores token generation data in a PostgreSQL database table. This allows for:

1. Auditing token requests
2. Debugging authentication issues
3. Monitoring token usage
4. Tracking token expiration

## Database Schema

The token data is stored in the `satusehat_tokens` table with the following schema:

```sql
CREATE TABLE IF NOT EXISTS satusehat_tokens (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  client_id TEXT NOT NULL,
  organization_name TEXT,
  developer_email TEXT,
  token_type TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_in INTEGER,
  issued_at BIGINT,
  scope TEXT,
  status TEXT,
  raw_response JSONB,
  request_data JSONB
);
```

## Indexes

The following indexes are created for performance:

```sql
CREATE INDEX IF NOT EXISTS idx_satusehat_tokens_client_id ON satusehat_tokens(client_id);
CREATE INDEX IF NOT EXISTS idx_satusehat_tokens_created_at ON satusehat_tokens(created_at);
CREATE INDEX IF NOT EXISTS idx_satusehat_tokens_access_token ON satusehat_tokens(access_token);
```

## Usage

The token storage is automatically enabled when a database connection is configured. Tokens are saved each time a new token is fetched from the SATUSEHAT API.

## Running Migrations

To manually create the token storage table, run:

```bash
npm run migrate
```

## Testing

To test the token storage functionality, run:

```bash
npm run test-token
```

## Configuration

The token storage uses the same database configuration as the existing HTTP logging functionality:

- `DATABASE_URL` - Complete database connection string
- `PGHOST` - PostgreSQL host
- `PGPORT` - PostgreSQL port (default: 5432)
- `PGDATABASE` - PostgreSQL database name
- `PGUSER` - PostgreSQL username
- `PGPASSWORD` - PostgreSQL password

If no database configuration is provided, token storage will be silently skipped (similar to HTTP logging).