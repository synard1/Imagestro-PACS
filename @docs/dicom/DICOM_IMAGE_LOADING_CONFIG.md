# DICOM Image Loading Configuration Guide

## Overview

The DICOM viewer supports multiple strategies for loading images from different storage backends. This guide explains how to configure the image loading strategy based on your deployment setup.

## Configuration Options

### 1. Image Load Strategy (`VITE_DICOM_IMAGE_LOAD_STRATEGY`)

Controls how DICOM images are retrieved and loaded in the viewer.

#### Available Strategies

| Strategy | Description | Speed | Reliability | Use Case |
|----------|-------------|-------|-------------|----------|
| `presigned-url` | Direct S3 access using presigned URLs | ⚡⚡⚡ Fastest | ⚠️ Requires CORS | S3 with proper CORS config |
| `wado-rs` | Load via WADO-RS backend endpoint | ⚠️ Slower | ✅ Most reliable | Any S3 config, local storage |
| `auto` | Try presigned URL first, fallback to WADO-RS | ⚡⚡ Fast | ✅✅ Very reliable | **Recommended (default)** |

#### Strategy Details

##### `presigned-url` (Fastest)
- **How it works**: Viewer receives presigned S3 URLs from backend, loads directly from S3
- **Pros**:
  - Fastest loading (direct S3 access)
  - No backend overhead
  - Scales well with many concurrent users
- **Cons**:
  - Requires S3 CORS configuration
  - May fail if CORS headers are missing
  - Exposes S3 bucket name in browser
- **When to use**:
  - S3 is properly configured with CORS headers
  - You want maximum performance
  - You have control over S3 configuration

##### `wado-rs` (Most Reliable)
- **How it works**: Viewer requests images via WADO-RS endpoint, backend proxies from S3
- **Pros**:
  - Works with any S3 configuration
  - Backend handles all S3 authentication
  - No CORS issues
  - More secure (S3 details hidden from client)
- **Cons**:
  - Slower (backend must download then send to client)
  - Higher backend CPU/memory usage
  - Bandwidth goes through backend
- **When to use**:
  - S3 CORS is not configured
  - You have CORS issues with presigned URLs
  - You want maximum security
  - Backend has sufficient resources

##### `auto` (Recommended)
- **How it works**: Tries presigned URL first, automatically falls back to WADO-RS if it fails
- **Pros**:
  - Best of both worlds
  - Fast when S3 CORS works
  - Reliable fallback when it doesn't
  - No manual intervention needed
- **Cons**:
  - Slightly more complex error handling
  - May have mixed performance (some images fast, some slow)
- **When to use**:
  - You're unsure about S3 CORS configuration
  - You want automatic optimization
  - **This is the recommended default**

### 2. Image Load Timeout (`VITE_DICOM_IMAGE_LOAD_TIMEOUT_MS`)

How long to wait for an image to load before timing out (in milliseconds).

#### Recommended Values

| Network Type | Timeout | Notes |
|--------------|---------|-------|
| Local/Fast | 30,000 ms (30s) | Local storage, same datacenter |
| Standard | 60,000 ms (60s) | S3 in same region, good network |
| Slow | 90,000 ms (90s) | S3 in different region, standard network |
| Very Slow | 120,000 ms (120s) | International S3, slow network |

#### Factors Affecting Timeout

- **File size**: Larger files need more time
- **Network speed**: Slower networks need more time
- **S3 region**: Different regions have different latency
- **Backend load**: Busy backend may need more time
- **Image load strategy**: `presigned-url` may be faster than `wado-rs`

## Configuration Examples

### Example 1: Fast S3 with CORS (Recommended)

```env
# Use presigned URLs for maximum speed
VITE_DICOM_IMAGE_LOAD_STRATEGY=presigned-url
VITE_DICOM_IMAGE_LOAD_TIMEOUT_MS=60000
```

**When to use**: S3 is in same region, CORS is properly configured

### Example 2: S3 with CORS Issues

```env
# Use WADO-RS endpoint to avoid CORS
VITE_DICOM_IMAGE_LOAD_STRATEGY=wado-rs
VITE_DICOM_IMAGE_LOAD_TIMEOUT_MS=90000
```

**When to use**: S3 CORS is not configured or problematic

### Example 3: Automatic Optimization (Recommended Default)

```env
# Try presigned URL first, fallback to WADO-RS
VITE_DICOM_IMAGE_LOAD_STRATEGY=auto
VITE_DICOM_IMAGE_LOAD_TIMEOUT_MS=90000
```

**When to use**: You want automatic optimization without manual configuration

### Example 4: International S3 Deployment

```env
# Presigned URL with longer timeout for international S3
VITE_DICOM_IMAGE_LOAD_STRATEGY=presigned-url
VITE_DICOM_IMAGE_LOAD_TIMEOUT_MS=120000
```

**When to use**: S3 is in different region, network is slow

### Example 5: Local Storage Only

```env
# WADO-RS for local storage (no S3)
VITE_DICOM_IMAGE_LOAD_STRATEGY=wado-rs
VITE_DICOM_IMAGE_LOAD_TIMEOUT_MS=30000
```

**When to use**: DICOM files are stored locally, not in S3

## Setting Configuration

### Development Environment

Edit `.env` file in project root:

```bash
# .env
VITE_DICOM_IMAGE_LOAD_STRATEGY=auto
VITE_DICOM_IMAGE_LOAD_TIMEOUT_MS=90000
```

### Production Environment

Use `.env.production` or environment variables:

```bash
# .env.production
VITE_DICOM_IMAGE_LOAD_STRATEGY=presigned-url
VITE_DICOM_IMAGE_LOAD_TIMEOUT_MS=60000
```

Or set via environment variables:

```bash
export VITE_DICOM_IMAGE_LOAD_STRATEGY=presigned-url
export VITE_DICOM_IMAGE_LOAD_TIMEOUT_MS=60000
npm run build
```

## Troubleshooting

### Images Timeout with `presigned-url`

**Problem**: Images fail to load with timeout error

**Solutions**:
1. Check S3 CORS configuration
2. Increase timeout: `VITE_DICOM_IMAGE_LOAD_TIMEOUT_MS=120000`
3. Switch to `auto` or `wado-rs` strategy

### Images Timeout with `wado-rs`

**Problem**: Images fail to load via WADO-RS endpoint

**Solutions**:
1. Check backend is running and accessible
2. Check backend logs for errors
3. Increase timeout: `VITE_DICOM_IMAGE_LOAD_TIMEOUT_MS=120000`
4. Check backend has sufficient resources (CPU, memory)

### CORS Errors with `presigned-url`

**Problem**: Browser console shows CORS errors

**Solutions**:
1. Configure S3 CORS headers (see S3 CORS Configuration below)
2. Switch to `wado-rs` strategy
3. Use `auto` strategy (will fallback to WADO-RS)

### Mixed Performance (Some Images Fast, Some Slow)

**Problem**: Using `auto` strategy, some images load fast, others slow

**This is normal behavior**:
- Fast images: Loaded via presigned URL
- Slow images: Loaded via WADO-RS (presigned URL failed)
- This is the intended behavior of `auto` strategy

**To optimize**:
1. Fix S3 CORS configuration to make all images fast
2. Or switch to `wado-rs` for consistent (but slower) performance

## S3 CORS Configuration

If using `presigned-url` strategy, configure S3 CORS:

### AWS S3 CORS Configuration

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedOrigins": ["http://localhost:5173", "https://yourdomain.com"],
    "ExposeHeaders": ["ETag", "x-amz-version-id"],
    "MaxAgeSeconds": 3000
  }
]
```

### Contabo S3 CORS Configuration

Similar to AWS S3, configure CORS in Contabo storage settings:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedOrigins": ["http://localhost:5173", "https://yourdomain.com"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

### MinIO CORS Configuration

```bash
mc cors set --allow-empty http://minio/bucket \
  '{"AllowedHeaders":["*"],"AllowedMethods":["GET","HEAD"],"AllowedOrigins":["http://localhost:5173","https://yourdomain.com"],"ExposeHeaders":["ETag"],"MaxAgeSeconds":3000}'
```

## Performance Comparison

### Load Time Comparison (20MB DICOM file)

| Strategy | S3 Same Region | S3 Different Region | Local Storage |
|----------|----------------|-------------------|---------------|
| `presigned-url` | 2-3s | 5-8s | N/A |
| `wado-rs` | 3-5s | 8-12s | 1-2s |
| `auto` | 2-3s* | 5-8s* | 1-2s* |

*`auto` uses presigned URL when available, falls back to WADO-RS

### Bandwidth Usage

| Strategy | Backend Bandwidth | Client Bandwidth |
|----------|------------------|------------------|
| `presigned-url` | None (direct S3) | Full file size |
| `wado-rs` | Full file size | Full file size |
| `auto` | Minimal (fallback only) | Full file size |

## Best Practices

1. **Start with `auto`**: It's the safest default
2. **Monitor performance**: Check browser DevTools Network tab
3. **Adjust timeout based on actual usage**: Don't set too high or too low
4. **Configure S3 CORS properly**: Enables `presigned-url` strategy
5. **Test with real files**: Use actual DICOM files, not small test files
6. **Monitor backend resources**: If using `wado-rs`, ensure backend has enough CPU/memory

## Related Configuration

- **DICOM Viewer Mode**: `VITE_DICOM_VIEWER_MODE` (simple or enhanced)
- **Backend API URL**: `VITE_PACS_API_URL` (for WADO-RS endpoint)
- **API Timeout**: `VITE_API_TIMEOUT_MS` (general API timeout)

## Support

For issues or questions:
1. Check browser console for error messages
2. Check backend logs for errors
3. Verify S3 configuration and CORS headers
4. Try different strategies to isolate the issue
5. Contact support with configuration details
