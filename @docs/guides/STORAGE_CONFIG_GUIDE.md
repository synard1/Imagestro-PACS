# Storage Configuration Guide

## 📋 Overview

Storage configuration menggunakan format yang sama dengan settings lainnya di backend API. Semua konfigurasi storage disimpan dalam satu key `storage_config` dengan struktur array `configs`.

## 🔧 Format Struktur

```json
{
  "key": "storage_config",
  "value": {
    "configs": [
      {
        "id": "unique-id",
        "name": "Configuration Name",
        "adapter_type": "local|s3|minio|contabo|wasabi|s3-compatible",
        "config": {
          // Provider-specific configuration
        },
        "active": true|false,
        "created_at": "ISO 8601 timestamp",
        "updated_at": "ISO 8601 timestamp"
      }
    ]
  },
  "description": "Storage configurations with multiple S3 providers"
}
```

## 📝 Provider Configuration Examples

### 1. Local Storage
```json
{
  "id": "local-primary",
  "name": "Local Storage Primary",
  "adapter_type": "local",
  "config": {
    "base_path": "/var/lib/pacs/storage"
  },
  "active": true
}
```

### 2. AWS S3
```json
{
  "id": "aws-s3-production",
  "name": "AWS S3 Production",
  "adapter_type": "s3",
  "config": {
    "bucket_name": "my-pacs-production",
    "region": "us-east-1",
    "access_key": "AKIAIOSFODNN7EXAMPLE",
    "secret_key": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    "use_ssl": true
  },
  "active": false
}
```

### 3. MinIO
```json
{
  "id": "minio-development",
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
  "active": false
}
```

### 4. Contabo Object Storage
```json
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
  "active": false
}
```

### 5. Wasabi
```json
{
  "id": "wasabi-archive",
  "name": "Wasabi Archive Storage",
  "adapter_type": "wasabi",
  "config": {
    "bucket_name": "pacs-archive",
    "region": "us-east-1",
    "access_key": "YOUR_WASABI_ACCESS_KEY",
    "secret_key": "YOUR_WASABI_SECRET_KEY",
    "endpoint_url": "https://s3.wasabisys.com",
    "use_ssl": true
  },
  "active": false
}
```

### 6. Custom S3-Compatible
```json
{
  "id": "s3-compatible-custom",
  "name": "Custom S3 Compatible",
  "adapter_type": "s3-compatible",
  "config": {
    "bucket_name": "custom-storage",
    "region": "default",
    "access_key": "YOUR_ACCESS_KEY",
    "secret_key": "YOUR_SECRET_KEY",
    "endpoint_url": "https://your-s3-compatible-endpoint.com",
    "use_ssl": true
  },
  "active": false
}
```

## 🚀 Inject via Postman

### Prerequisites
1. Install Postman
2. Get your JWT token from authentication endpoint
3. Import `Storage-Config-Postman-Collection.json` ke Postman

### Step 1: Setup Environment Variables
Di Postman, set variables:
- `base_url`: `http://103.42.117.19:8888`
- `auth_token`: Your JWT token

### Step 2: Create Initial Configuration (First Time)

**Method:** `POST`
**URL:** `{{base_url}}/settings`
**Headers:**
```
Authorization: Bearer {{auth_token}}
Content-Type: application/json
```

**Body:**
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

### Step 3: Get Current Configuration

**Method:** `GET`
**URL:** `{{base_url}}/settings/storage_config`
**Headers:**
```
Authorization: Bearer {{auth_token}}
```

### Step 4: Update Configuration (Add/Modify/Delete)

**Method:** `PUT`
**URL:** `{{base_url}}/settings/storage_config`
**Headers:**
```
Authorization: Bearer {{auth_token}}
Content-Type: application/json
```

**Body:**
```json
{
  "value": {
    "configs": [
      {
        "id": "local-primary",
        "name": "Local Storage Primary",
        "adapter_type": "local",
        "config": {
          "base_path": "/var/lib/pacs/storage"
        },
        "active": false,
        "created_at": "2025-01-23T00:00:00Z",
        "updated_at": "2025-01-23T00:00:00Z"
      },
      {
        "id": "minio-development",
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
        "active": true,
        "created_at": "2025-01-23T00:00:00Z",
        "updated_at": "2025-01-23T00:00:00Z"
      }
    ]
  },
  "description": "Storage configurations with multiple S3 providers"
}
```

## 🔄 Common Operations

### Add New Configuration
1. GET current configuration
2. Copy the `configs` array
3. Add new config object to array
4. PUT updated configuration

### Set Active Configuration
1. GET current configuration
2. Set all configs `active: false`
3. Set desired config `active: true`
4. Update `updated_at` timestamp
5. PUT updated configuration

### Delete Configuration
1. GET current configuration
2. Remove config object from array
3. PUT updated configuration

## ⚠️ Important Rules

1. **Only ONE active config** - Hanya satu konfigurasi yang boleh `active: true`
2. **Cannot delete active** - Config yang active tidak boleh dihapus via UI
3. **Unique IDs** - Setiap config harus punya `id` yang unique
4. **Full replacement** - PUT endpoint mengganti seluruh array configs

## 🛠️ Using Seed File

### Option 1: Via Postman
1. Open Postman
2. Import `Storage-Config-Postman-Collection.json`
3. Set environment variables (`base_url`, `auth_token`)
4. Run request "3. POST - Create Storage Config (Initial Seed)"

### Option 2: Via cURL
```bash
curl -X POST "http://103.42.117.19:8888/settings" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d @storage-config-seed.json
```

### Option 3: Via Node.js Script
```bash
node seed-storage-config.js --token=YOUR_JWT_TOKEN
```

### Option 4: Via Bash Script
```bash
chmod +x seed-storage-config.sh
./seed-storage-config.sh --token=YOUR_JWT_TOKEN
```

## 📊 Testing Storage Configuration

Setelah inject konfigurasi, test di UI:
1. Navigate to `/storage-management`
2. Lihat di section "Saved Configurations"
3. Klik "Load" untuk load config ke form
4. Klik "Test Connection" untuk verify
5. Klik "Set Active" untuk mengaktifkan

## 🔍 Troubleshooting

### Error 409: Conflict
Setting sudah ada. Gunakan PUT endpoint `/settings/storage_config` untuk update.

### Error 401: Unauthorized
JWT token expired atau tidak valid. Login ulang untuk mendapatkan token baru.

### Error 404: Not Found
Setting belum dibuat. Gunakan POST endpoint `/settings` untuk create.

### Config tidak muncul di UI
1. Clear browser cache
2. Refresh page
3. Check console untuk errors
4. Verify data di backend dengan GET request

## 📦 Files Reference

- `storage-config-seed.json` - Template untuk inject via Postman/cURL
- `storage-config-template.json` - Template untuk development (format lama)
- `Storage-Config-Postman-Collection.json` - Postman collection
- `seed-storage-config.js` - Node.js seeder script
- `seed-storage-config.sh` - Bash seeder script
- `STORAGE_CONFIG_GUIDE.md` - This guide

## 🔐 Security Notes

1. **Never commit credentials** - Jangan commit access_key/secret_key ke git
2. **Use environment variables** - Simpan credentials di environment variables
3. **Rotate keys regularly** - Ganti access keys secara berkala
4. **Limit permissions** - Gunakan IAM dengan least privilege
5. **Enable encryption** - Aktifkan encryption at rest dan in transit
