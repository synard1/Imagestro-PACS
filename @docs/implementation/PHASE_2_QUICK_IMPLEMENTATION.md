# Phase 2: DICOM Storage & Backend Integration - Quick Implementation
**Date**: November 16, 2025  
**Status**: IN PROGRESS  
**Goal**: Integrate PACS backend with frontend

---

## 🎯 Objectives

### Critical Path (Next 3 Steps)
1. ✅ **Digital Signature System** - COMPLETE
2. 🔄 **DICOM Storage Integration** - IN PROGRESS
3. ⏳ **Study Management Backend** - NEXT
4. ⏳ **Real DICOM Viewer Integration** - NEXT

---

## Step 1: DICOM Storage Service Integration

### Backend Status Check
```bash
# Check if PACS service is running
curl http://localhost:8003/pacs/health

# Expected response:
{
  "status": "healthy",
  "service": "PACS Service",
  "version": "1.0.0",
  "database": "healthy",
  "orthanc": "healthy"
}
```

### Frontend Service Layer

**File**: `src/services/pacsService.js`

```javascript
/**
 * PACS Service
 * Integration with PACS backend API
 */

const PACS_API_URL = import.meta.env.VITE_PACS_API_URL || 'http://localhost:8003';
const API_PREFIX = '/pacs';

// ============================================================================
// Studies API
// ============================================================================

export async function getStudies(filters = {}) {
  const params = new URLSearchParams();
  
  if (filters.patientName) params.append('patient_name', filters.patientName);
  if (filters.patientId) params.append('patient_id', filters.patientId);
  if (filters.accessionNumber) params.append('accession_number', filters.accessionNumber);
  if (filters.studyDate) params.append('study_date', filters.studyDate);
  if (filters.modality) params.append('modality', filters.modality);
  if (filters.startDate) params.append('start_date', filters.startDate);
  if (filters.endDate) params.append('end_date', filters.endDate);
  
  const response = await fetch(`${PACS_API_URL}${API_PREFIX}/studies?${params}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch studies: ${response.statusText}`);
  }
  
  return response.json();
}

export async function getStudy(studyInstanceUid) {
  const response = await fetch(`${PACS_API_URL}${API_PREFIX}/studies/${studyInstanceUid}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch study: ${response.statusText}`);
  }
  
  return response.json();
}

export async function getStudySeries(studyInstanceUid) {
  const response = await fetch(`${PACS_API_URL}${API_PREFIX}/studies/${studyInstanceUid}/series`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch series: ${response.statusText}`);
  }
  
  return response.json();
}

export async function getSeriesInstances(seriesInstanceUid) {
  const response = await fetch(`${PACS_API_URL}${API_PREFIX}/series/${seriesInstanceUid}/instances`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch instances: ${response.statusText}`);
  }
  
  return response.json();
}

// ============================================================================
// DICOM Files API
// ============================================================================

export async function getDicomFile(instanceUid) {
  const response = await fetch(`${PACS_API_URL}${API_PREFIX}/instances/${instanceUid}/file`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch DICOM file: ${response.statusText}`);
  }
  
  return response.blob();
}

export async function getDicomMetadata(instanceUid) {
  const response = await fetch(`${PACS_API_URL}${API_PREFIX}/instances/${instanceUid}/metadata`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch metadata: ${response.statusText}`);
  }
  
  return response.json();
}

export async function getDicomThumbnail(instanceUid, size = 'medium') {
  const response = await fetch(`${PACS_API_URL}${API_PREFIX}/instances/${instanceUid}/thumbnail?size=${size}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch thumbnail: ${response.statusText}`);
  }
  
  return response.blob();
}

// ============================================================================
// Upload API
// ============================================================================

export async function uploadDicomFile(file, metadata = {}) {
  const formData = new FormData();
  formData.append('file', file);
  
  if (metadata.patientId) formData.append('patient_id', metadata.patientId);
  if (metadata.orderId) formData.append('order_id', metadata.orderId);
  
  const response = await fetch(`${PACS_API_URL}${API_PREFIX}/upload`, {
    method: 'POST',
    body: formData,
  });
  
  if (!response.ok) {
    throw new Error(`Failed to upload DICOM file: ${response.statusText}`);
  }
  
  return response.json();
}

// ============================================================================
// Storage Stats API
// ============================================================================

export async function getStorageStats() {
  const response = await fetch(`${PACS_API_URL}${API_PREFIX}/storage/stats`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch storage stats: ${response.statusText}`);
  }
  
  return response.json();
}

// ============================================================================
// Health Check
// ============================================================================

export async function checkPacsHealth() {
  try {
    const response = await fetch(`${PACS_API_URL}${API_PREFIX}/health`);
    return response.ok;
  } catch (error) {
    return false;
  }
}

export default {
  getStudies,
  getStudy,
  getStudySeries,
  getSeriesInstances,
  getDicomFile,
  getDicomMetadata,
  getDicomThumbnail,
  uploadDicomFile,
  getStorageStats,
  checkPacsHealth,
};
```

---

## Step 2: Enhanced Study Service with Backend Integration

**File**: `src/services/studyService.js`

```javascript
/**
 * Study Service
 * Abstraction layer for study data with backend/mock fallback
 */

import * as pacsService from './pacsService';

const USE_BACKEND = import.meta.env.VITE_USE_PACS_BACKEND === 'true';

// Mock data fallback
async function getMockStudies() {
  const module = await import('../data/studies.json');
  return module.default || [];
}

// ============================================================================
// Public API
// ============================================================================

export async function fetchStudies(filters = {}) {
  if (USE_BACKEND) {
    try {
      const result = await pacsService.getStudies(filters);
      return {
        studies: result.studies || [],
        total: result.total || 0,
        source: 'backend'
      };
    } catch (error) {
      console.warn('[StudyService] Backend failed, using mock data:', error);
    }
  }
  
  // Fallback to mock data
  const studies = await getMockStudies();
  
  // Apply filters to mock data
  let filtered = studies;
  
  if (filters.patientName) {
    filtered = filtered.filter(s => 
      s.patient_name?.toLowerCase().includes(filters.patientName.toLowerCase())
    );
  }
  
  if (filters.modality && filters.modality !== 'all') {
    filtered = filtered.filter(s => s.modality === filters.modality);
  }
  
  if (filters.status && filters.status !== 'all') {
    filtered = filtered.filter(s => s.status === filters.status);
  }
  
  return {
    studies: filtered,
    total: filtered.length,
    source: 'mock'
  };
}

export async function fetchStudyDetails(studyInstanceUid) {
  if (USE_BACKEND) {
    try {
      const study = await pacsService.getStudy(studyInstanceUid);
      return { study, source: 'backend' };
    } catch (error) {
      console.warn('[StudyService] Backend failed for study details:', error);
    }
  }
  
  // Fallback to mock data
  const studies = await getMockStudies();
  const study = studies.find(s => s.study_instance_uid === studyInstanceUid);
  
  return { study, source: 'mock' };
}

export async function fetchStudySeries(studyInstanceUid) {
  if (USE_BACKEND) {
    try {
      const result = await pacsService.getStudySeries(studyInstanceUid);
      return { series: result.series || [], source: 'backend' };
    } catch (error) {
      console.warn('[StudyService] Backend failed for series:', error);
    }
  }
  
  // Mock series data
  return {
    series: [
      {
        series_instance_uid: 'mock-series-1',
        series_number: 1,
        series_description: 'Mock Series',
        modality: 'CT',
        number_of_instances: 100
      }
    ],
    source: 'mock'
  };
}

export async function getStudyThumbnail(studyInstanceUid) {
  if (USE_BACKEND) {
    try {
      // Get first series, first instance
      const { series } = await fetchStudySeries(studyInstanceUid);
      if (series.length > 0) {
        const instances = await pacsService.getSeriesInstances(series[0].series_instance_uid);
        if (instances.length > 0) {
          const blob = await pacsService.getDicomThumbnail(instances[0].sop_instance_uid);
          return URL.createObjectURL(blob);
        }
      }
    } catch (error) {
      console.warn('[StudyService] Failed to get thumbnail:', error);
    }
  }
  
  // Return placeholder
  return null;
}

export default {
  fetchStudies,
  fetchStudyDetails,
  fetchStudySeries,
  getStudyThumbnail,
};
```

---

## Step 3: Update Studies Page to Use New Service

**File**: `src/pages/studies/StudyListEnhanced.jsx` (Update)

Add at the top:
```javascript
import { fetchStudies } from '../../services/studyService';
```

Replace the useEffect that loads studies:
```javascript
useEffect(() => {
  const loadStudies = async () => {
    setLoading(true);
    try {
      const result = await fetchStudies({
        patientName: searchTerm,
        modality: selectedModality !== 'all' ? selectedModality : null,
        status: selectedStatus !== 'all' ? selectedStatus : null,
        startDate: dateRange.start,
        endDate: dateRange.end,
      });
      
      setStudies(result.studies);
      console.log(`[StudyList] Loaded ${result.studies.length} studies from ${result.source}`);
    } catch (error) {
      console.error('[StudyList] Error loading studies:', error);
      setStudies([]);
    } finally {
      setLoading(false);
    }
  };
  
  loadStudies();
}, [searchTerm, selectedModality, selectedStatus, dateRange]);
```

---

## Step 4: Environment Configuration

**File**: `.env` (Add)

```bash
# PACS Backend Configuration
VITE_USE_PACS_BACKEND=false
VITE_PACS_API_URL=http://localhost:8003

# Enable when PACS service is running
# VITE_USE_PACS_BACKEND=true
```

---

## Step 5: PACS Health Indicator Component

**File**: `src/components/pacs/PacsHealthIndicator.jsx`

```javascript
import { useState, useEffect } from 'react';
import { checkPacsHealth } from '../../services/pacsService';

export default function PacsHealthIndicator() {
  const [isHealthy, setIsHealthy] = useState(null);
  const [isChecking, setIsChecking] = useState(true);
  
  useEffect(() => {
    const checkHealth = async () => {
      setIsChecking(true);
      const healthy = await checkPacsHealth();
      setIsHealthy(healthy);
      setIsChecking(false);
    };
    
    checkHealth();
    
    // Check every 30 seconds
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);
  
  if (isChecking) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>
        <span>Checking PACS...</span>
      </div>
    );
  }
  
  return (
    <div className="flex items-center gap-2 text-sm">
      <div className={`w-2 h-2 rounded-full ${
        isHealthy ? 'bg-green-500' : 'bg-red-500'
      }`}></div>
      <span className={isHealthy ? 'text-green-700' : 'text-red-700'}>
        PACS {isHealthy ? 'Connected' : 'Offline'}
      </span>
    </div>
  );
}
```

---

## Testing Checklist

### Without Backend (Mock Mode)
- [ ] Studies load from mock data
- [ ] Filtering works
- [ ] No errors in console
- [ ] Health indicator shows "Offline"

### With Backend (PACS Service Running)
- [ ] Enable `VITE_USE_PACS_BACKEND=true`
- [ ] Start PACS service: `cd pacs-service && python -m uvicorn app.main:app --reload --port 8003`
- [ ] Studies load from backend
- [ ] Health indicator shows "Connected"
- [ ] Thumbnails load (if available)
- [ ] Filtering works with backend

---

## Next Steps

### Immediate (Step 6-8)
1. **Report Integration** - Connect reports to PACS backend
2. **DICOM Upload UI** - Drag & drop DICOM files
3. **Viewer Enhancement** - Load DICOM from backend

### Short Term (Step 9-12)
1. **Real-time Updates** - WebSocket integration
2. **Batch Operations** - Multi-select studies
3. **Export Functions** - Export to CD/USB
4. **Print Functions** - Print studies/reports

---

## Migration Strategy

### Phase A: Dual Mode (Current)
- ✅ Mock data works
- ✅ Backend integration ready
- ✅ User can switch via .env
- ✅ Graceful fallback

### Phase B: Backend Primary
- Backend becomes default
- Mock data as fallback only
- Production ready

### Phase C: Backend Only
- Remove mock data
- Backend required
- Full PACS system

---

**Status**: Ready for Implementation  
**Risk**: Low (Fallback to mock data)  
**Time**: 2-3 hours for Steps 1-5
