# Frontend Integration Guide - S3 DICOM Access
**Date:** 2025-11-24
**Version:** 2.0
**Status:** Production Ready

---

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Frontend Access Methods](#frontend-access-methods)
4. [Implementation Examples](#implementation-examples)
5. [Best Practices](#best-practices)
6. [Troubleshooting](#troubleshooting)

---

## Overview

This guide explains how frontend applications (React, Vue, Angular) can access DICOM images stored in S3 (Contabo Object Storage) through the PACS API.

### Key Concepts

- **S3 Storage**: DICOM files stored in cloud object storage (Contabo)
- **Presigned URLs**: Time-limited, signed URLs for direct S3 access
- **WADO-RS**: Web Access to DICOM Objects via RESTful Services
- **Soft Delete**: Deleted files archived to `deleted/YYYYMMDD/` directory
- **Status Filtering**: Only 'active' files returned by default

---

## Architecture

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   Frontend  │────────▶│  PACS API   │────────▶│ PostgreSQL  │
│   (React)   │         │  (FastAPI)  │         │  Database   │
└─────────────┘         └─────────────┘         └─────────────┘
       │                       │
       │                       │
       │                       ▼
       │                ┌─────────────┐
       └───────────────▶│   S3 Store  │
        (Presigned URL) │  (Contabo)  │
                        └─────────────┘
```

### Flow Options

**Option 1: Presigned URL (Recommended)**
1. Frontend requests instance metadata from PACS API
2. PACS API returns metadata + presigned S3 URL
3. Frontend downloads directly from S3 using presigned URL
4. **Benefit**: Reduced backend load, faster downloads

**Option 2: Proxy Download**
1. Frontend requests file from PACS API download endpoint
2. PACS API retrieves from S3 and streams to frontend
3. **Benefit**: Better access control, logging, authentication

---

## Frontend Access Methods

### Method 1: WADO-RS V2 with Presigned URLs (Recommended)

**Best for:** Modern DICOM viewers, cornerstone.js, OHIF Viewer

```javascript
// Get all instances in a study with presigned URLs
const response = await fetch(
  `http://localhost:8003/wado-rs/v2/studies/${studyUID}`
);

const data = await response.json();
// Returns:
// {
//   "study_id": "1.2.392.200036...",
//   "instance_count": 5,
//   "instances": [
//     {
//       "instance_id": "1.2.392.200036...",
//       "sop_instance_uid": "1.2.392.200036...",
//       "series_id": "1.2.392.200036...",
//       "presigned_url": "https://contabo.storage.com/pacs/dicom/...?signature=...",
//       "file_size": 20971520,
//       "modality": "CR",
//       "rows": 2048,
//       "columns": 2048
//     }
//   ]
// }

// Download DICOM directly from S3
for (const instance of data.instances) {
  const dicomBuffer = await fetch(instance.presigned_url)
    .then(res => res.arrayBuffer());

  // Load with cornerstone.js
  const imageId = cornerstoneWADOImageLoader.wadouri.fileManager.add(
    new File([dicomBuffer], `${instance.instance_id}.dcm`)
  );

  cornerstone.loadImage(imageId);
}
```

---

### Method 2: Get Single Instance with Presigned URL

**Best for:** Loading specific DICOM instances

```javascript
// Get specific instance metadata
const response = await fetch(
  `http://localhost:8003/wado-rs/v2/studies/${studyUID}/series/${seriesUID}/instances/${instanceUID}`
);

const data = await response.json();
// Returns:
// {
//   "instance": {
//     "id": "71cd0869-eccb-43a0-bcc3-ca64e5c62e9c",
//     "sop_instance_uid": "1.2.392.200036...",
//     "presigned_url": "https://contabo.storage.com/pacs/...",
//     "file_size": 20971520,
//     "modality": "CR",
//     "patient_name": "John^Doe",
//     "study_date": "20251124"
//   }
// }

// Download and display
const blob = await fetch(data.instance.presigned_url)
  .then(res => res.blob());

const imageUrl = URL.createObjectURL(blob);
// Use with img tag or canvas
```

---

### Method 3: Proxy Download via Storage API

**Best for:** Authentication required, access logging, restricted environments

```javascript
// Download through PACS API (backend retrieves from S3)
const fileId = '71cd0869-eccb-43a0-bcc3-ca64e5c62e9c';

const response = await fetch(
  `http://localhost:8003/api/storage/download/${fileId}`,
  {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  }
);

const blob = await response.blob();
const imageUrl = URL.createObjectURL(blob);

// Load with DICOM viewer
cornerstone.loadImage(`wadouri:${imageUrl}`);
```

---

### Method 4: Search and Filter

**Best for:** Building study/series browsers, worklists

```javascript
// Search for DICOM files
const params = new URLSearchParams({
  patient_id: 'P123456',
  modality: 'CR',
  study_date_from: '2025-11-01',
  study_date_to: '2025-11-24',
  limit: 50,
  offset: 0
});

const response = await fetch(
  `http://localhost:8003/api/storage/search?${params}`
);

const data = await response.json();
// Returns:
// {
//   "total": 25,
//   "results": [
//     {
//       "id": "71cd0869-...",
//       "study_id": "1.2.392...",
//       "patient_name": "John^Doe",
//       "study_date": "20251124",
//       "modality": "CR",
//       "instance_count": 5,
//       "presigned_url": "https://..."
//     }
//   ]
// }
```

---

## Implementation Examples

### React + Cornerstone.js Example

```jsx
import React, { useEffect, useState } from 'react';
import cornerstone from 'cornerstone-core';
import cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';

function DicomViewer({ studyUID }) {
  const [instances, setInstances] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStudy();
  }, [studyUID]);

  async function loadStudy() {
    try {
      // Get study instances with presigned URLs
      const response = await fetch(
        `http://localhost:8003/wado-rs/v2/studies/${studyUID}`
      );
      const data = await response.json();

      setInstances(data.instances);

      // Load first instance
      if (data.instances.length > 0) {
        await loadInstance(data.instances[0]);
      }
    } catch (error) {
      console.error('Failed to load study:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadInstance(instance) {
    try {
      // Download DICOM from S3 using presigned URL
      const response = await fetch(instance.presigned_url);
      const arrayBuffer = await response.arrayBuffer();

      // Create blob and add to cornerstone file manager
      const file = new File(
        [arrayBuffer],
        `${instance.instance_id}.dcm`,
        { type: 'application/dicom' }
      );

      const imageId = cornerstoneWADOImageLoader.wadouri.fileManager.add(file);

      // Enable and display image
      const element = document.getElementById('dicom-viewer');
      cornerstone.enable(element);

      const image = await cornerstone.loadImage(imageId);
      cornerstone.displayImage(element, image);

    } catch (error) {
      console.error('Failed to load instance:', error);
    }
  }

  if (loading) return <div>Loading study...</div>;

  return (
    <div>
      <div id="dicom-viewer" style={{ width: '512px', height: '512px' }} />
      <div>
        <h3>Instances ({instances.length})</h3>
        <ul>
          {instances.map((instance, idx) => (
            <li key={instance.instance_id}>
              <button onClick={() => loadInstance(instance)}>
                Instance {idx + 1} - {instance.modality}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default DicomViewer;
```

---

### Vue 3 + OHIF Viewer Example

```vue
<template>
  <div>
    <div v-if="loading">Loading study...</div>
    <div v-else>
      <div id="ohif-viewer" ref="viewer"></div>
      <div class="instance-list">
        <h3>Instances ({{ instances.length }})</h3>
        <button
          v-for="(instance, idx) in instances"
          :key="instance.instance_id"
          @click="loadInstance(instance)"
        >
          {{ idx + 1 }}. {{ instance.modality }} - {{ instance.instance_number }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { initOHIFViewer, loadDicomImage } from '@/utils/ohif';

const props = defineProps({
  studyUID: String
});

const instances = ref([]);
const loading = ref(true);
const viewer = ref(null);

onMounted(async () => {
  await loadStudy();
  initOHIFViewer(viewer.value);
});

async function loadStudy() {
  try {
    const response = await fetch(
      `http://localhost:8003/wado-rs/v2/studies/${props.studyUID}`
    );
    const data = await response.json();

    instances.value = data.instances;

    if (data.instances.length > 0) {
      await loadInstance(data.instances[0]);
    }
  } catch (error) {
    console.error('Failed to load study:', error);
  } finally {
    loading.value = false;
  }
}

async function loadInstance(instance) {
  try {
    // Download from S3 using presigned URL
    const response = await fetch(instance.presigned_url);
    const arrayBuffer = await response.arrayBuffer();

    // Load in OHIF viewer
    await loadDicomImage(arrayBuffer, viewer.value);
  } catch (error) {
    console.error('Failed to load instance:', error);
  }
}
</script>
```

---

### JavaScript Fetch with Error Handling

```javascript
class DicomAPIClient {
  constructor(baseURL) {
    this.baseURL = baseURL || 'http://localhost:8003';
  }

  async getStudy(studyUID, includeArchived = false) {
    try {
      const url = new URL(`${this.baseURL}/wado-rs/v2/studies/${studyUID}`);
      if (includeArchived) {
        url.searchParams.append('include_archived', 'true');
      }

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to get study:', error);
      throw error;
    }
  }

  async downloadInstance(presignedURL) {
    try {
      const response = await fetch(presignedURL);

      if (!response.ok) {
        throw new Error(`S3 download failed: ${response.status}`);
      }

      return await response.arrayBuffer();
    } catch (error) {
      console.error('Failed to download instance:', error);
      throw error;
    }
  }

  async searchStudies(filters) {
    try {
      const params = new URLSearchParams(filters);
      const response = await fetch(
        `${this.baseURL}/api/storage/search?${params}`
      );

      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to search studies:', error);
      throw error;
    }
  }
}

// Usage
const client = new DicomAPIClient('http://localhost:8003');

// Get study
const study = await client.getStudy('1.2.392.200036...');

// Download first instance
const buffer = await client.downloadInstance(study.instances[0].presigned_url);

// Search studies
const results = await client.searchStudies({
  patient_id: 'P123456',
  modality: 'CR',
  study_date_from: '2025-11-01'
});
```

---

## Best Practices

### 1. Use Presigned URLs for Performance

**✅ DO:**
```javascript
// Download directly from S3
const buffer = await fetch(instance.presigned_url)
  .then(res => res.arrayBuffer());
```

**❌ DON'T:**
```javascript
// Don't proxy through backend unless necessary
const buffer = await fetch(`/api/storage/download/${instance.id}`)
  .then(res => res.arrayBuffer());
```

### 2. Cache DICOM Metadata

**✅ DO:**
```javascript
// Cache study metadata
const studyCache = new Map();

async function getStudy(studyUID) {
  if (studyCache.has(studyUID)) {
    return studyCache.get(studyUID);
  }

  const study = await fetch(`/wado-rs/v2/studies/${studyUID}`)
    .then(res => res.json());

  studyCache.set(studyUID, study);
  return study;
}
```

### 3. Handle Presigned URL Expiration

**✅ DO:**
```javascript
async function downloadWithRetry(presignedURL, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(presignedURL);

      if (response.status === 403) {
        // Presigned URL expired, refresh it
        console.warn('Presigned URL expired, refreshing...');
        const newURL = await refreshPresignedURL();
        presignedURL = newURL;
        continue;
      }

      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }

      return await response.arrayBuffer();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}
```

### 4. Filter Deleted/Archived Studies

**✅ DO:**
```javascript
// Default behavior excludes archived files
const activeStudies = await fetch('/api/storage/search?patient_id=P123456')
  .then(res => res.json());

// Explicitly include archived for admin/recovery
const allStudies = await fetch('/api/storage/search?patient_id=P123456&include_archived=true')
  .then(res => res.json());
```

### 5. Prefetch Series for Smooth Scrolling

**✅ DO:**
```javascript
async function prefetchSeries(instances) {
  // Prefetch first 5 instances
  const prefetchPromises = instances.slice(0, 5).map(instance =>
    fetch(instance.presigned_url)
      .then(res => res.arrayBuffer())
      .then(buffer => cacheInstance(instance.instance_id, buffer))
  );

  await Promise.all(prefetchPromises);
}
```

---

## Troubleshooting

### Issue 1: WADO-RS Returns 0 Instances

**Symptoms:**
```json
{
  "study_id": "1.2.392...",
  "instance_count": 0,
  "instances": []
}
```

**Possible Causes:**
1. Study has been deleted (soft delete)
2. Files have status='archived' or 'deleted'
3. Study doesn't exist in database

**Solutions:**
```javascript
// Check if study was deleted
const study = await fetch(`/api/studies/${studyUID}`)
  .then(res => res.json());

if (study.deleted_at) {
  console.log('Study was deleted on:', study.deleted_at);
}

// Try including archived files (admin only)
const data = await fetch(`/wado-rs/v2/studies/${studyUID}?include_archived=true`)
  .then(res => res.json());
```

---

### Issue 2: 404 Not Found on Instance Retrieval

**Symptoms:**
```
GET /wado-rs/studies/.../instances/...
Status: 404 Not Found
```

**Cause:**
Using legacy WADO-RS endpoint with S3-stored files.

**Solution:**
```javascript
// ❌ DON'T use legacy endpoint
const url = `/wado-rs/studies/${studyUID}/series/${seriesUID}/instances/${instanceUID}`;

// ✅ DO use V2 endpoint
const url = `/wado-rs/v2/studies/${studyUID}/series/${seriesUID}/instances/${instanceUID}`;
```

---

### Issue 3: Presigned URL 403 Forbidden

**Symptoms:**
```
GET https://contabo.storage.com/pacs/dicom/...?signature=...
Status: 403 Forbidden
```

**Causes:**
1. Presigned URL expired (default: 1 hour)
2. File was moved/deleted
3. S3 credentials changed

**Solutions:**
```javascript
// Refresh presigned URL
async function refreshPresignedURL(instanceUID) {
  const response = await fetch(`/wado-rs/v2/instances/${instanceUID}`);
  const data = await response.json();
  return data.instance.presigned_url;
}

// Retry with fresh URL
if (response.status === 403) {
  const newURL = await refreshPresignedURL(instanceUID);
  const retryResponse = await fetch(newURL);
}
```

---

### Issue 4: CORS Errors with S3

**Symptoms:**
```
Access to fetch at 'https://contabo.storage.com/...' from origin 'http://localhost:3000'
has been blocked by CORS policy
```

**Cause:**
S3 bucket doesn't allow cross-origin requests.

**Solution:**
Configure S3 bucket CORS policy:

```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["*"],
      "AllowedMethods": ["GET", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["Content-Length", "Content-Type"],
      "MaxAgeSeconds": 3600
    }
  ]
}
```

Or use proxy download:
```javascript
// Download through backend (no CORS issue)
const fileId = instance.id;
const response = await fetch(`/api/storage/download/${fileId}`);
```

---

### Issue 5: Deleted Images Still Appear

**Symptoms:**
Images appear in UI despite study being deleted.

**Causes:**
1. File status not updated to 'archived' or 'deleted'
2. Frontend cache not cleared
3. Orphaned files with 'active' status

**Solutions:**
```javascript
// Force refresh from API (bypass cache)
const response = await fetch(`/wado-rs/v2/studies/${studyUID}`, {
  cache: 'no-store'
});

// Check file status in database
const files = await fetch(`/api/storage/search?study_id=${studyUID}&include_archived=true`)
  .then(res => res.json());

files.results.forEach(file => {
  console.log(`File ${file.instance_id}: status=${file.status}, tier=${file.storage_tier}`);
});
```

---

## API Reference Summary

### WADO-RS V2 Endpoints

| Endpoint | Method | Description | Returns Presigned URL |
|----------|--------|-------------|----------------------|
| `/wado-rs/v2/studies/{study_uid}` | GET | Get all instances in study | ✅ Yes |
| `/wado-rs/v2/studies/{study_uid}/series/{series_uid}` | GET | Get all instances in series | ✅ Yes |
| `/wado-rs/v2/studies/{study_uid}/series/{series_uid}/instances/{instance_uid}` | GET | Get specific instance | ✅ Yes |

### Storage API Endpoints

| Endpoint | Method | Description | Authentication |
|----------|--------|-------------|---------------|
| `/api/storage/search` | GET | Search DICOM files | Optional |
| `/api/storage/download/{file_id}` | GET | Download file via proxy | Optional |
| `/api/dicom/upload-v2` | POST | Upload DICOM to S3 | Required |
| `/api/studies/{study_uid}` | GET | Get study metadata | Optional |
| `/api/studies/{study_uid}` | DELETE | Soft delete study | Required |

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `include_archived` | boolean | false | Include archived/deleted files |
| `patient_id` | string | - | Filter by patient ID |
| `modality` | string | - | Filter by modality (CR, CT, MR, etc.) |
| `study_date_from` | string | - | Filter by study date (YYYY-MM-DD) |
| `study_date_to` | string | - | Filter by study date (YYYY-MM-DD) |
| `limit` | integer | 100 | Maximum results |
| `offset` | integer | 0 | Pagination offset |

---

## Additional Resources

### Related Documentation
- [Soft Delete Implementation Report](/home/apps/full-pacs/backups/SOFT_DELETE_S3_ARCHIVE_IMPLEMENTATION_20251124.md)
- [Comprehensive Test Report](/home/apps/full-pacs/backups/PACS_COMPREHENSIVE_TEST_REPORT_20251124.md)
- [DICOM Cleanup Report](/home/apps/full-pacs/backups/DICOM_CLEANUP_REPORT_20251124.md)

### External Libraries
- **Cornerstone.js**: https://cornerstonejs.org/
- **OHIF Viewer**: https://ohif.org/
- **dcm4che**: https://www.dcm4che.org/

### DICOM Standards
- **WADO-RS Specification**: https://www.dicomstandard.org/using/dicomweb/retrieve-wado-rs
- **DICOMweb**: https://www.dicomstandard.org/using/dicomweb

---

**Document Version:** 1.0
**Last Updated:** 2025-11-24
**Author:** PACS Development Team
**Status:** Production Ready
