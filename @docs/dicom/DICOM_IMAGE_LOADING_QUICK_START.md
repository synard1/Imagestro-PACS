# DICOM Image Loading - Quick Start Guide

## TL;DR

Add these to your `.env` file:

```env
# Recommended: Auto-optimize (try S3 first, fallback to backend)
VITE_DICOM_IMAGE_LOAD_STRATEGY=auto
VITE_DICOM_IMAGE_LOAD_TIMEOUT_MS=90000
```

## Quick Configuration

### For Fast S3 Access (Recommended if S3 CORS is configured)

```env
VITE_DICOM_IMAGE_LOAD_STRATEGY=presigned-url
VITE_DICOM_IMAGE_LOAD_TIMEOUT_MS=60000
```

### For Reliable Backend Proxy (Recommended if S3 CORS is NOT configured)

```env
VITE_DICOM_IMAGE_LOAD_STRATEGY=wado-rs
VITE_DICOM_IMAGE_LOAD_TIMEOUT_MS=90000
```

### For Automatic Optimization (Recommended Default)

```env
VITE_DICOM_IMAGE_LOAD_STRATEGY=auto
VITE_DICOM_IMAGE_LOAD_TIMEOUT_MS=90000
```

## What Each Strategy Does

| Strategy | How It Works | Speed | When to Use |
|----------|------------|-------|-----------|
| `presigned-url` | Direct S3 access | ⚡⚡⚡ Fast | S3 CORS configured |
| `wado-rs` | Backend proxy | ⚠️ Slower | S3 CORS not configured |
| `auto` | Try S3, fallback to backend | ⚡⚡ Fast | **Recommended** |

## Timeout Values

- **30s** - Local storage, fast network
- **60s** - S3 same region, good network
- **90s** - S3 different region, standard network (default)
- **120s** - International S3, slow network

## How to Apply Configuration

### Development

1. Edit `.env` in project root
2. Add the configuration lines above
3. Restart dev server: `npm run dev`

### Production

1. Edit `.env.production` or set environment variables
2. Build: `npm run build`
3. Deploy

## Verify Configuration

Check browser console when loading DICOM images:

```
[DicomImageLoadConfig] Image load strategy: auto
[DicomImageLoadConfig] Image load timeout: 90000 ms
[CachedImageLoader] Using presigned URL for S3-stored file
```

Or if using WADO-RS:

```
[DicomImageLoadConfig] Image load strategy: wado-rs
[CachedImageLoader] Using WADO-RS endpoint
```

## Troubleshooting

### Images timeout with `presigned-url`

→ Switch to `auto` or `wado-rs`

### Images timeout with `wado-rs`

→ Increase timeout: `VITE_DICOM_IMAGE_LOAD_TIMEOUT_MS=120000`

### CORS errors in browser console

→ Switch to `wado-rs` strategy

## For More Details

See `DICOM_IMAGE_LOADING_CONFIG.md` for comprehensive guide.
