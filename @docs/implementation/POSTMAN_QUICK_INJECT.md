# Quick Inject Storage Config via Postman

## 🚀 Quick Start (3 Steps)

### Step 1: Get JWT Token
```http
POST http://103.42.117.19:8888/login
Content-Type: application/json

{
  "username": "admin",
  "password": "your_password"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

Copy the `access_token` value.

---

### Step 2: Create Storage Config (First Time)

**Method:** `POST`
**URL:** `http://103.42.117.19:8888/settings`

**Headers:**
```
Authorization: Bearer YOUR_TOKEN_HERE
Content-Type: application/json
```

**Body (Raw JSON):**
```json
{
  "key": "storage_config",
  "value": {
    "configs": [
      {
        "id": "local-primary",
        "name": "Local Storage Primary",
        "adapter_type": "local",
        "config": {
          "base_path": "/var/lib/pacs/storage"
        },
        "active": true,
        "created_at": "2025-01-23T00:00:00Z",
        "updated_at": "2025-01-23T00:00:00Z"
      }
    ]
  },
  "description": "Storage configurations with multiple S3 providers"
}
```

**Expected Response:** `201 Created` or `409 Conflict` (if already exists)

---

### Step 3: Verify Configuration

**Method:** `GET`
**URL:** `http://103.42.117.19:8888/settings/storage_config`

**Headers:**
```
Authorization: Bearer YOUR_TOKEN_HERE
```

**Expected Response:**
```json
{
  "setting": {
    "key": "storage_config",
    "value": {
      "configs": [...]
    },
    "description": "Storage configurations with multiple S3 providers",
    "created_at": "...",
    "updated_at": "..."
  }
}
```

---

## 📝 Add Multiple Configs

Use this body to add multiple storage providers at once:

```json
{
  "key": "storage_config",
  "value": {
    "configs": [
      {
        "id": "local-primary",
        "name": "Local Storage Primary",
        "adapter_type": "local",
        "config": {
          "base_path": "/var/lib/pacs/storage"
        },
        "active": true,
        "created_at": "2025-01-23T00:00:00Z",
        "updated_at": "2025-01-23T00:00:00Z"
      },
      {
        "id": "minio-dev",
        "name": "MinIO Development",
        "adapter_type": "minio",
        "config": {
          "bucket_name": "pacs-dev",
          "region": "us-east-1",
          "access_key": "minioadmin",
          "secret_key": "minioadmin",
          "endpoint_url": "http://localhost:9000",
          "use_ssl": false
        },
        "active": false,
        "created_at": "2025-01-23T00:00:00Z",
        "updated_at": "2025-01-23T00:00:00Z"
      },
      {
        "id": "contabo-backup",
        "name": "Contabo Object Storage",
        "adapter_type": "contabo",
        "config": {
          "bucket_name": "pacs-backup",
          "region": "eu-central-1",
          "access_key": "YOUR_CONTABO_ACCESS_KEY",
          "secret_key": "YOUR_CONTABO_SECRET_KEY",
          "endpoint_url": "https://eu2.contabostorage.com",
          "use_ssl": true
        },
        "active": false,
        "created_at": "2025-01-23T00:00:00Z",
        "updated_at": "2025-01-23T00:00:00Z"
      }
    ]
  },
  "description": "Storage configurations with multiple S3 providers"
}
```

---

## 🔄 Update Existing Config

If config already exists, use **PUT** instead of POST:

**Method:** `PUT`
**URL:** `http://103.42.117.19:8888/settings/storage_config`

**Body:** (Same JSON structure as above, just the `value` and `description`)
```json
{
  "value": {
    "configs": [...]
  },
  "description": "Storage configurations with multiple S3 providers"
}
```

---

## ⚡ cURL Alternative

If you prefer command line:

```bash
# Get token first
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Inject config
curl -X POST "http://103.42.117.19:8888/settings" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d @storage-config-seed.json

# Or use the bash script
chmod +x seed-storage-config.sh
./seed-storage-config.sh --token=$TOKEN
```

---

## 🎯 Provider Templates

### AWS S3
```json
{
  "id": "aws-s3-prod",
  "name": "AWS S3 Production",
  "adapter_type": "s3",
  "config": {
    "bucket_name": "my-bucket",
    "region": "us-east-1",
    "access_key": "AKIAIOSFODNN7EXAMPLE",
    "secret_key": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    "use_ssl": true
  },
  "active": false
}
```

### MinIO
```json
{
  "id": "minio-local",
  "name": "MinIO Local",
  "adapter_type": "minio",
  "config": {
    "bucket_name": "pacs",
    "region": "us-east-1",
    "access_key": "minioadmin",
    "secret_key": "minioadmin",
    "endpoint_url": "http://localhost:9000",
    "use_ssl": false
  },
  "active": false
}
```

### Contabo
```json
{
  "id": "contabo-eu",
  "name": "Contabo EU Central",
  "adapter_type": "contabo",
  "config": {
    "bucket_name": "my-bucket",
    "region": "eu-central-1",
    "access_key": "YOUR_KEY",
    "secret_key": "YOUR_SECRET",
    "endpoint_url": "https://eu2.contabostorage.com",
    "use_ssl": true
  },
  "active": false
}
```

### Wasabi
```json
{
  "id": "wasabi-us",
  "name": "Wasabi US East",
  "adapter_type": "wasabi",
  "config": {
    "bucket_name": "my-bucket",
    "region": "us-east-1",
    "access_key": "YOUR_KEY",
    "secret_key": "YOUR_SECRET",
    "endpoint_url": "https://s3.wasabisys.com",
    "use_ssl": true
  },
  "active": false
}
```

---

## ✅ Validation Checklist

Before injecting:
- [ ] Only ONE config has `active: true`
- [ ] All `id` values are unique
- [ ] All required fields present (`id`, `name`, `adapter_type`, `config`)
- [ ] Timestamps in ISO 8601 format
- [ ] JWT token is valid and not expired
- [ ] Credentials are correct (if using S3)

---

## 🐛 Common Errors

| Error | Solution |
|-------|----------|
| `409 Conflict` | Use PUT instead of POST |
| `401 Unauthorized` | Get new JWT token |
| `404 Not Found` | Use POST to create first |
| `400 Bad Request` | Check JSON syntax |

---

## 📚 Full Documentation

See `STORAGE_CONFIG_GUIDE.md` for complete documentation.
