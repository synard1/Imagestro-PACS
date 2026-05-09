# Backend Settings Format for MasterData Service

This document describes the JSON format for storing application settings in the MasterData service backend API.

## Settings Schema

The settings are stored as JSON objects in the `settings` table with the following structure:

```json
{
  "id": "uuid",
  "key": "string (unique)",
  "value": "JSONB (any JSON serializable value)",
  "description": "string (optional)",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

## Application Configuration Settings

For the MWL/PACS UI application, the settings should be stored with the key `app.config` and the following value structure:

```json
{
  "backendEnabled": false,
  "apiBaseUrl": "http://localhost:8000",
  "timeoutMs": 6000,
  "healthIntervalMs": 15000,
  "modalities": ["US", "CT", "MR", "DR", "OT", "SC", "SR", "RF", "NM", "CR", "XA", "MG"],
  "patientDataValidation": true,
  "patientDataEncryption": false,
  "autoSaveInterval": 5,
  "dataRetentionDays": 365,
  "rbacEnabled": true,
  "permissionCaching": true,
  "permissionCacheTTL": 60,
  "sessionTimeout": 30,
  "autoSync": true,
  "conflictResolution": true,
  "syncInterval": 10,
  "offlineBufferSize": 100
}
```

## Example API Request

To create or update settings in the backend, make a POST or PUT request to `/api/settings` with the following payload:

```json
{
  "key": "app.config",
  "value": {
    "backendEnabled": true,
    "apiBaseUrl": "http://103.42.117.19:8888",
    "timeoutMs": 6000,
    "healthIntervalMs": 15000,
    "modalities": ["US", "CT", "MR", "DR", "OT", "SC", "SR", "RF", "NM", "CR", "XA", "MG"],
    "patientDataValidation": true,
    "patientDataEncryption": false,
    "autoSaveInterval": 5,
    "dataRetentionDays": 365,
    "rbacEnabled": true,
    "permissionCaching": true,
    "permissionCacheTTL": 60,
    "sessionTimeout": 30,
    "autoSync": true,
    "conflictResolution": true,
    "syncInterval": 10,
    "offlineBufferSize": 100
  },
  "description": "Application configuration settings"
}
```

## API Endpoints

The MasterData service provides the following endpoints for settings management:

1. **List Settings**: `GET /settings`
   - Permissions: `setting:read`
   - Response: Array of settings objects

2. **Get Setting by Key**: `GET /settings/{key}`
   - Permissions: `setting:read`
   - Response: Single settings object

3. **Create Setting**: `POST /settings`
   - Permissions: `setting:write`
   - Request Body: Settings object with key, value, and optional description
   - Response: Created settings object

4. **Update Setting**: `PUT /settings/{key}`
   - Permissions: `setting:write`
   - Request Body: Settings value and optional description
   - Response: Updated settings object

5. **Delete Setting**: `DELETE /settings/{key}`
   - Permissions: `setting:write`
   - Response: Success confirmation

## Authentication

All settings endpoints require JWT Bearer authentication with appropriate permissions:

- `setting:read` for read operations
- `setting:write` for write operations

The JWT token should be included in the Authorization header:

```
Authorization: Bearer <token>
```

## Example cURL Request

```bash
# Create or update settings
curl -X POST "http://103.42.117.19:8888/settings" \
  -H "Authorization: Bearer <your-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "app.config",
    "value": {
      "backendEnabled": true,
      "apiBaseUrl": "http://103.42.117.19:8888",
      "timeoutMs": 6000,
      "healthIntervalMs": 15000,
      "modalities": ["US", "CT", "MR", "DR", "OT", "SC", "SR", "RF", "NM", "CR", "XA", "MG"],
      "patientDataValidation": true,
      "patientDataEncryption": false,
      "autoSaveInterval": 5,
      "dataRetentionDays": 365,
      "rbacEnabled": true,
      "permissionCaching": true,
      "permissionCacheTTL": 60,
      "sessionTimeout": 30,
      "autoSync": true,
      "conflictResolution": true,
      "syncInterval": 10,
      "offlineBufferSize": 100
    },
    "description": "Application configuration settings"
  }'
```