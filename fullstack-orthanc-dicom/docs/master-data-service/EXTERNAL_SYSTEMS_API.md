# External Systems Management API

**Last Updated:** 2025-11-14
**Security Level:** HIGH PRIVILEGE (SUPERADMIN/DEVELOPER ONLY)
**Version:** 1.0

---

## Overview

External Systems Management API memungkinkan pengelolaan sistem eksternal (SIMRS/HIS/RIS) yang terintegrasi dengan PACS. Endpoint ini **HANYA** dapat diakses oleh pengguna dengan role **SUPERADMIN** atau **DEVELOPER**.

### Key Features

- ✅ **CRUD Operations** - Create, Read, Update, Delete external systems
- ✅ **Security** - High-privilege access only (SUPERADMIN/DEVELOPER)
- ✅ **Audit Trail** - Complete logging of all operations
- ✅ **Validation** - Input validation and uniqueness checks
- ✅ **Integration** - Links to procedure mapping system

### Security Model

| Operation | Permission Required | Role Required |
|-----------|---------------------|---------------|
| List Systems | `external_system:read` or `*` | SUPERADMIN, DEVELOPER |
| View System | `external_system:read` or `*` | SUPERADMIN, DEVELOPER |
| Create System | `external_system:manage` or `*` | SUPERADMIN, DEVELOPER |
| Update System | `external_system:manage` or `*` | SUPERADMIN, DEVELOPER |
| Delete System | `external_system:manage` or `*` | SUPERADMIN, DEVELOPER |

---

## Base URL

Via API Gateway:
```
http://your-domain:8888
```

Direct to Master Data Service (internal):
```
http://master-data-service:8002
```

---

## Authentication

All endpoints require JWT authentication dengan Bearer token.

```http
Authorization: Bearer <your_jwt_token>
```

### Getting a Token

```bash
curl -X POST http://your-domain:8888/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "superadmin",
    "password": "YourPassword"
  }'
```

---

## Endpoints

### 1. List All External Systems

**GET** `/external-systems`

List all registered external systems with pagination.

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 1 | Page number |
| `page_size` | integer | 25 | Items per page (max: 100) |
| `system_code` | string | - | Filter by system code |
| `system_type` | string | - | Filter by type (SIMRS/HIS/RIS) |
| `is_active` | boolean | - | Filter by active status |

#### Request Example

```bash
curl -X GET "http://your-domain:8888/external-systems?page=1&page_size=10" \
  -H "Authorization: Bearer $TOKEN"
```

#### Response Example (200 OK)

```json
{
  "status": "success",
  "systems": [
    {
      "id": "9aba1330-d403-4d86-b7e8-d519828bbbb3",
      "system_code": "SIMRS_RSUD",
      "system_name": "SIMRS RSUD Provinsi",
      "system_type": "SIMRS",
      "system_version": "3.2.1",
      "vendor": "PT Solusi Kesehatan Indonesia",
      "base_url": "http://simrs.rsud.local",
      "api_endpoint": "http://simrs.rsud.local/api/v1",
      "auth_type": "bearer_token",
      "is_active": true,
      "contact_person": "Ahmad IT Support",
      "contact_email": "it@rsud.go.id",
      "notes": "SIMRS utama rumah sakit",
      "created_at": "2025-11-14T05:48:05Z",
      "updated_at": "2025-11-14T05:48:05Z"
    }
  ],
  "count": 1,
  "page": 1,
  "page_size": 10,
  "total": 3
}
```

#### Error Responses

**403 Forbidden** - Insufficient permissions
```json
{
  "status": "error",
  "message": "Insufficient permissions to view external systems",
  "required": ["external_system:read", "*"],
  "hint": "Only SUPERADMIN/DEVELOPER can view external systems."
}
```

---

### 2. Get External System by ID

**GET** `/external-systems/{id}`

Get detailed information about a specific external system.

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | UUID/string | Yes | System ID or system_code |

#### Request Example

```bash
curl -X GET "http://your-domain:8888/external-systems/SIMRS_RSUD" \
  -H "Authorization: Bearer $TOKEN"
```

#### Response Example (200 OK)

```json
{
  "status": "success",
  "system": {
    "id": "9aba1330-d403-4d86-b7e8-d519828bbbb3",
    "system_code": "SIMRS_RSUD",
    "system_name": "SIMRS RSUD Provinsi",
    "system_type": "SIMRS",
    "system_version": "3.2.1",
    "vendor": "PT Solusi Kesehatan Indonesia",
    "description": "Sistem Informasi Manajemen Rumah Sakit RSUD Provinsi",
    "base_url": "http://simrs.rsud.local",
    "api_endpoint": "http://simrs.rsud.local/api/v1",
    "auth_type": "bearer_token",
    "auth_config": {
      "token_endpoint": "/oauth/token",
      "client_id": "pacs_client"
    },
    "contact_person": "Ahmad IT Support",
    "contact_email": "it@rsud.go.id",
    "notes": "SIMRS utama rumah sakit",
    "is_active": true,
    "created_at": "2025-11-14T05:48:05Z",
    "updated_at": "2025-11-14T05:48:05Z"
  }
}
```

#### Error Responses

**404 Not Found** - System not found
```json
{
  "status": "error",
  "message": "External system not found"
}
```

---

### 3. Create External System

**POST** `/external-systems`

Create a new external system registration.

**⚠️ SUPERADMIN/DEVELOPER ONLY**

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `system_code` | string | Yes | Unique system code (e.g., SIMRS_RSUD) |
| `system_name` | string | Yes | Display name |
| `system_type` | string | Yes | Type: SIMRS, HIS, RIS, or PACS |
| `system_version` | string | No | Version number |
| `vendor` | string | No | Vendor/manufacturer name |
| `description` | string | No | Detailed description |
| `base_url` | string | No | Base URL of the system |
| `api_endpoint` | string | No | API endpoint URL |
| `auth_type` | string | No | Auth type: basic_auth, bearer_token, api_key, oauth2 |
| `auth_config` | object | No | Authentication configuration (JSON) |
| `contact_person` | string | No | Contact person name |
| `contact_email` | string | No | Contact email |
| `notes` | string | No | Additional notes |
| `is_active` | boolean | No | Active status (default: true) |

#### Request Example

```bash
curl -X POST "http://your-domain:8888/external-systems" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "system_code": "HIS_HOSPITAL",
    "system_name": "HIS Hospital XYZ",
    "system_type": "HIS",
    "system_version": "5.0.1",
    "vendor": "PT Digital Health Solutions",
    "description": "Hospital Information System untuk Hospital XYZ",
    "base_url": "https://his.hospitalxyz.com",
    "api_endpoint": "https://his.hospitalxyz.com/api/v2",
    "auth_type": "bearer_token",
    "auth_config": {
      "token_endpoint": "/auth/token",
      "client_id": "pacs_integration",
      "scopes": ["read", "write"]
    },
    "contact_person": "John Doe",
    "contact_email": "john.doe@hospitalxyz.com",
    "notes": "Production HIS system",
    "is_active": true
  }'
```

#### Response Example (201 Created)

```json
{
  "status": "success",
  "message": "External system created successfully",
  "system": {
    "id": "f1a2b3c4-d5e6-7890-abcd-ef1234567890",
    "system_code": "HIS_HOSPITAL",
    "system_name": "HIS Hospital XYZ",
    "system_type": "HIS",
    ...
  }
}
```

#### Error Responses

**400 Bad Request** - Validation error
```json
{
  "status": "error",
  "message": "Missing required fields: system_code, system_name, system_type"
}
```

**403 Forbidden** - Insufficient privileges
```json
{
  "status": "error",
  "message": "High-privilege role required",
  "hint": "Only SUPERADMIN or DEVELOPER can create external systems."
}
```

**409 Conflict** - Duplicate system_code
```json
{
  "status": "error",
  "message": "System code already exists"
}
```

---

### 4. Update External System

**PUT** `/external-systems/{id}`

Update an existing external system.

**⚠️ SUPERADMIN/DEVELOPER ONLY**

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | UUID/string | Yes | System ID or system_code |

#### Request Body

All fields are optional. Only include fields you want to update.

```json
{
  "system_name": "Updated Name",
  "system_version": "5.1.0",
  "is_active": false,
  "notes": "System under maintenance"
}
```

#### Request Example

```bash
curl -X PUT "http://your-domain:8888/external-systems/HIS_HOSPITAL" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "system_version": "5.1.0",
    "is_active": true,
    "notes": "Updated to version 5.1.0"
  }'
```

#### Response Example (200 OK)

```json
{
  "status": "success",
  "message": "External system updated successfully",
  "system": {
    "id": "f1a2b3c4-d5e6-7890-abcd-ef1234567890",
    "system_code": "HIS_HOSPITAL",
    "system_version": "5.1.0",
    "is_active": true,
    "updated_at": "2025-11-14T10:30:00Z"
  }
}
```

#### Error Responses

**403 Forbidden** - Insufficient privileges
```json
{
  "status": "error",
  "message": "High-privilege role required",
  "hint": "Only SUPERADMIN or DEVELOPER can modify external systems."
}
```

**404 Not Found** - System not found
```json
{
  "status": "error",
  "message": "External system not found"
}
```

**409 Conflict** - Duplicate system_code (if updating system_code)
```json
{
  "status": "error",
  "message": "System code already exists"
}
```

---

### 5. Delete External System

**DELETE** `/external-systems/{id}`

Delete an external system. This will also cascade delete all related procedure mappings.

**⚠️ SUPERADMIN/DEVELOPER ONLY**
**⚠️ DESTRUCTIVE OPERATION - USE WITH CAUTION**

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | UUID/string | Yes | System ID or system_code |

#### Request Example

```bash
curl -X DELETE "http://your-domain:8888/external-systems/HIS_HOSPITAL" \
  -H "Authorization: Bearer $TOKEN"
```

#### Response Example (200 OK)

```json
{
  "status": "success",
  "message": "External system deleted successfully"
}
```

#### Error Responses

**403 Forbidden** - Insufficient privileges
```json
{
  "status": "error",
  "message": "High-privilege role required",
  "hint": "Only SUPERADMIN or DEVELOPER can delete external systems."
}
```

**404 Not Found** - System not found
```json
{
  "status": "error",
  "message": "External system not found"
}
```

---

## System Types

Valid values for `system_type` field:

| Type | Description |
|------|-------------|
| `SIMRS` | Sistem Informasi Manajemen Rumah Sakit |
| `HIS` | Hospital Information System |
| `RIS` | Radiology Information System |
| `PACS` | Picture Archiving and Communication System |
| `LIS` | Laboratory Information System |
| `EMR` | Electronic Medical Record |
| `Other` | Other system types |

---

## Authentication Types

Valid values for `auth_type` field:

| Type | Description | auth_config Example |
|------|-------------|---------------------|
| `basic_auth` | HTTP Basic Authentication | `{"username": "...", "password": "..."}` |
| `bearer_token` | Bearer Token | `{"token": "..."}` |
| `api_key` | API Key | `{"api_key": "...", "header_name": "X-API-Key"}` |
| `oauth2` | OAuth 2.0 | `{"client_id": "...", "client_secret": "...", "token_endpoint": "..."}` |
| `none` | No authentication | `null` |

---

## Integration with Procedure Mappings

External systems are linked to procedure mappings. When an external system is registered, you can:

1. **Create Procedure Mappings**
   ```bash
   POST /procedure-mappings
   {
     "external_system_id": "system-uuid",
     "external_code": "RAD-001",
     "pacs_procedure_id": "procedure-uuid"
   }
   ```

2. **Lookup Mappings**
   ```bash
   POST /procedure-mappings/lookup
   {
     "external_system_id": "system-uuid",
     "external_code": "RAD-001"
   }
   ```

For complete mapping documentation, see [MAPPING_GUIDE.md](MAPPING_GUIDE.md).

---

## Best Practices

### Security

1. **Limit Access** - Only grant `external_system:manage` permission to SUPERADMIN/DEVELOPER
2. **Audit Logs** - Monitor all external system operations via audit logs
3. **Credential Storage** - Store sensitive credentials in `auth_config` field (encrypted in transit)
4. **Network Security** - Use HTTPS for all external system API endpoints

### Data Management

1. **Unique Codes** - Use clear, descriptive system codes (e.g., `SIMRS_RSUD`, `HIS_SILOAM`)
2. **Documentation** - Use `description` and `notes` fields to document system details
3. **Contact Info** - Always provide contact person and email for troubleshooting
4. **Active Status** - Use `is_active` flag instead of deleting systems

### Integration

1. **Test First** - Test connectivity before marking system as active
2. **Version Tracking** - Update `system_version` when external system is upgraded
3. **Endpoint URLs** - Verify `api_endpoint` URLs are accessible from PACS network
4. **Error Handling** - Monitor mapping failures and update system configuration as needed

---

## Troubleshooting

### Issue: Permission Denied (403)

**Symptom:**
```json
{
  "status": "error",
  "message": "Insufficient permissions to view external systems"
}
```

**Solution:**
- Ensure you're logged in as SUPERADMIN or DEVELOPER
- Check your JWT token contains `external_system:read` or `*` permission
- Verify token hasn't expired

### Issue: System Code Already Exists (409)

**Symptom:**
```json
{
  "status": "error",
  "message": "System code already exists"
}
```

**Solution:**
- Choose a different `system_code`
- Or update the existing system using PUT instead

### Issue: Invalid System Type (400)

**Symptom:**
```json
{
  "status": "error",
  "message": "Invalid system_type. Must be one of: SIMRS, HIS, RIS, PACS, LIS, EMR, Other"
}
```

**Solution:**
- Use one of the valid system types listed above

---

## Examples

### Complete Workflow Example

```bash
# 1. Login as SUPERADMIN
TOKEN=$(curl -s -X POST http://localhost:8888/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"superadmin","password":"SuperAdmin@12345"}' | \
  jq -r '.access_token')

# 2. List existing systems
curl -X GET "http://localhost:8888/external-systems" \
  -H "Authorization: Bearer $TOKEN"

# 3. Create new system
curl -X POST "http://localhost:8888/external-systems" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "system_code": "RIS_MEDIS",
    "system_name": "RIS Medis Indonesia",
    "system_type": "RIS",
    "system_version": "4.1.2",
    "vendor": "PT Medis Technology",
    "is_active": true
  }'

# 4. Get system details
curl -X GET "http://localhost:8888/external-systems/RIS_MEDIS" \
  -H "Authorization: Bearer $TOKEN"

# 5. Update system
curl -X PUT "http://localhost:8888/external-systems/RIS_MEDIS" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "system_version": "4.2.0",
    "notes": "Upgraded to version 4.2.0"
  }'

# 6. Delete system (if needed)
curl -X DELETE "http://localhost:8888/external-systems/RIS_MEDIS" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Related Documentation

- [MAPPING_GUIDE.md](MAPPING_GUIDE.md) - Procedure mapping documentation
- [PROCEDURES_README.md](PROCEDURES_README.md) - Procedures module documentation
- [SUCCESS_VERIFICATION.md](SUCCESS_VERIFICATION.md) - Verification steps

---

## Changelog

### Version 1.0 (2025-11-14)
- Initial release with full CRUD operations
- High-privilege security model (SUPERADMIN/DEVELOPER only)
- Complete API documentation
- Integration with procedure mapping system

---

## Support

For issues or questions:
- Check troubleshooting section above
- Review related documentation
- Contact system administrator

---

**Security Notice:** This API handles sensitive system integration configurations. Only SUPERADMIN and DEVELOPER roles have access. All operations are logged for security audit purposes.
