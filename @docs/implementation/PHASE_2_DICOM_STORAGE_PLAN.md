# Phase 2: DICOM Storage & Archive Implementation Plan

**Start Date**: November 16, 2025 (Week 8 Day 3)  
**Duration**: 10 weeks (Week 8-17)  
**Status**: Starting  
**Priority**: CRITICAL

---

## 🎯 Phase 2 Goals

Transform the system from **Professional PACS UI** to **Full PACS System** with:
1. DICOM file storage and archiving
2. DICOM communication services (C-STORE, C-FIND, C-MOVE)
3. WADO-RS image retrieval
4. Study distribution and routing
5. Integration with modalities

**Target**: Increase Full PACS completion from **82%** to **90%+**

---

## 📊 Phase 2 Overview

### Components to Build
| Component | Priority | Duration | Complexity |
|-----------|----------|----------|------------|
| DICOM Storage | CRITICAL | 2 weeks | High |
| WADO-RS | CRITICAL | 1 week | Medium |
| DICOM SCP/SCU | CRITICAL | 4 weeks | Very High |
| Study Distribution | HIGH | 2 weeks | Medium |
| Node Management | HIGH | 1 week | Low |

### Dependencies
```
Phase 1 (Complete) ✅
    ↓
DICOM Storage (Week 8-9)
    ↓
WADO-RS (Week 9)
    ↓
DICOM Communication (Week 10-13)
    ↓
Study Distribution (Week 14-15)
    ↓
Integration Testing (Week 16-17)
```

---

## Week 8 Day 3-4: DICOM Storage Foundation

### Goal
Create the foundation for DICOM file storage, including database schema, storage service, and file management.

### 1. Database Schema Enhancement

#### Tables to Create
```sql
-- DICOM file storage
CREATE TABLE dicom_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id VARCHAR(64) NOT NULL,
    series_id VARCHAR(64) NOT NULL,
    instance_id VARCHAR(64) NOT NULL,
    sop_class_uid VARCHAR(64) NOT NULL,
    sop_instance_uid VARCHAR(64) NOT NULL UNIQUE,
    
    -- File information
    file_path TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    file_hash VARCHAR(64) NOT NULL,
    storage_tier VARCHAR(20) DEFAULT 'hot',
    
    -- DICOM metadata
    patient_id VARCHAR(64),
    patient_name VARCHAR(255),
    study_date DATE,
    study_time TIME,
    modality VARCHAR(16),
    body_part VARCHAR(64),
    
    -- Image information
    rows INTEGER,
    columns INTEGER,
    bits_allocated INTEGER,
    bits_stored INTEGER,
    number_of_frames INTEGER DEFAULT 1,
    
    -- Compression
    transfer_syntax_uid VARCHAR(64),
    is_compressed BOOLEAN DEFAULT FALSE,
    compression_ratio FLOAT,
    
    -- Status
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes
    INDEX idx_study_id (study_id),
    INDEX idx_series_id (series_id),
    INDEX idx_instance_id (instance_id),
    INDEX idx_sop_instance_uid (sop_instance_uid),
    INDEX idx_patient_id (patient_id),
    INDEX idx_study_date (study_date),
    INDEX idx_modality (modality),
    INDEX idx_storage_tier (storage_tier),
    INDEX idx_status (status)
);

-- Storage locations
CREATE TABLE storage_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    path TEXT NOT NULL,
    tier VARCHAR(20) NOT NULL, -- hot, warm, cold
    max_size_gb INTEGER,
    current_size_gb FLOAT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_tier (tier),
    INDEX idx_is_active (is_active)
);

-- Storage statistics
CREATE TABLE storage_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    total_files INTEGER DEFAULT 0,
    total_size_gb FLOAT DEFAULT 0,
    files_by_modality JSONB,
    files_by_tier JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(date)
);
```

#### Migration File
**File**: `pacs-service/migrations/004_create_dicom_storage_tables.sql`

### 2. DICOM Storage Service

#### Backend Service Structure
```
pacs-service/
├── app/
│   ├── models/
│   │   ├── dicom_file.py          # DICOM file model
│   │   ├── storage_location.py    # Storage location model
│   │   └── storage_stats.py       # Storage statistics model
│   ├── services/
│   │   ├── dicom_storage.py       # Main storage service
│   │   ├── dicom_parser.py        # DICOM parsing
│   │   ├── storage_manager.py     # Storage management
│   │   ├── file_manager.py        # File operations
│   │   └── compression_service.py # Compression
│   └── api/
│       ├── storage.py              # Storage API endpoints
│       └── dicom_files.py          # DICOM file endpoints
└── config/
    └── storage_config.yaml         # Storage configuration
```

#### Key Services to Implement

**1. DICOM Parser Service** (`dicom_parser.py`)
```python
from pydicom import dcmread
from typing import Dict, Any

class DicomParser:
    """Parse DICOM files and extract metadata"""
    
    def parse_file(self, file_path: str) -> Dict[str, Any]:
        """Parse DICOM file and extract metadata"""
        ds = dcmread(file_path)
        
        return {
            'study_id': str(ds.StudyInstanceUID),
            'series_id': str(ds.SeriesInstanceUID),
            'instance_id': str(ds.SOPInstanceUID),
            'sop_class_uid': str(ds.SOPClassUID),
            'sop_instance_uid': str(ds.SOPInstanceUID),
            'patient_id': str(ds.PatientID),
            'patient_name': str(ds.PatientName),
            'study_date': ds.StudyDate,
            'study_time': ds.StudyTime,
            'modality': str(ds.Modality),
            'body_part': str(ds.get('BodyPartExamined', '')),
            'rows': int(ds.Rows),
            'columns': int(ds.Columns),
            'bits_allocated': int(ds.BitsAllocated),
            'bits_stored': int(ds.BitsStored),
            'number_of_frames': int(ds.get('NumberOfFrames', 1)),
            'transfer_syntax_uid': str(ds.file_meta.TransferSyntaxUID)
        }
    
    def validate_dicom(self, file_path: str) -> bool:
        """Validate if file is valid DICOM"""
        try:
            dcmread(file_path)
            return True
        except:
            return False
```

**2. Storage Manager Service** (`storage_manager.py`)
```python
import os
import hashlib
from pathlib import Path
from typing import Optional

class StorageManager:
    """Manage DICOM file storage"""
    
    def __init__(self, base_path: str):
        self.base_path = Path(base_path)
        
    def store_file(self, file_path: str, study_id: str, 
                   series_id: str, instance_id: str) -> str:
        """Store DICOM file in organized structure"""
        # Create directory structure: study/series/instance
        target_dir = self.base_path / study_id / series_id
        target_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate filename
        filename = f"{instance_id}.dcm"
        target_path = target_dir / filename
        
        # Copy file
        shutil.copy2(file_path, target_path)
        
        return str(target_path)
    
    def get_file_hash(self, file_path: str) -> str:
        """Calculate SHA256 hash of file"""
        sha256 = hashlib.sha256()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(4096), b''):
                sha256.update(chunk)
        return sha256.hexdigest()
    
    def get_file_size(self, file_path: str) -> int:
        """Get file size in bytes"""
        return os.path.getsize(file_path)
```

**3. DICOM Storage Service** (`dicom_storage.py`)
```python
from sqlalchemy.orm import Session
from app.models.dicom_file import DicomFile
from app.services.dicom_parser import DicomParser
from app.services.storage_manager import StorageManager

class DicomStorageService:
    """Main DICOM storage service"""
    
    def __init__(self, db: Session):
        self.db = db
        self.parser = DicomParser()
        self.storage = StorageManager('/data/dicom-storage')
    
    async def store_dicom(self, file_path: str) -> DicomFile:
        """Store DICOM file"""
        # 1. Validate DICOM
        if not self.parser.validate_dicom(file_path):
            raise ValueError("Invalid DICOM file")
        
        # 2. Parse metadata
        metadata = self.parser.parse_file(file_path)
        
        # 3. Store file
        stored_path = self.storage.store_file(
            file_path,
            metadata['study_id'],
            metadata['series_id'],
            metadata['instance_id']
        )
        
        # 4. Calculate hash and size
        file_hash = self.storage.get_file_hash(stored_path)
        file_size = self.storage.get_file_size(stored_path)
        
        # 5. Save to database
        dicom_file = DicomFile(
            **metadata,
            file_path=stored_path,
            file_hash=file_hash,
            file_size=file_size,
            storage_tier='hot'
        )
        
        self.db.add(dicom_file)
        self.db.commit()
        self.db.refresh(dicom_file)
        
        return dicom_file
    
    async def get_dicom(self, sop_instance_uid: str) -> Optional[DicomFile]:
        """Get DICOM file by SOP Instance UID"""
        return self.db.query(DicomFile).filter(
            DicomFile.sop_instance_uid == sop_instance_uid
        ).first()
    
    async def search_dicom(self, filters: dict) -> list[DicomFile]:
        """Search DICOM files"""
        query = self.db.query(DicomFile)
        
        if 'study_id' in filters:
            query = query.filter(DicomFile.study_id == filters['study_id'])
        if 'series_id' in filters:
            query = query.filter(DicomFile.series_id == filters['series_id'])
        if 'patient_id' in filters:
            query = query.filter(DicomFile.patient_id == filters['patient_id'])
        if 'modality' in filters:
            query = query.filter(DicomFile.modality == filters['modality'])
        
        return query.all()
```

### 3. API Endpoints

#### Storage API (`storage.py`)
```python
from fastapi import APIRouter, UploadFile, File, Depends
from sqlalchemy.orm import Session
from app.services.dicom_storage import DicomStorageService
from app.database import get_db

router = APIRouter(prefix="/api/storage", tags=["storage"])

@router.post("/upload")
async def upload_dicom(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Upload DICOM file"""
    # Save temporary file
    temp_path = f"/tmp/{file.filename}"
    with open(temp_path, "wb") as f:
        f.write(await file.read())
    
    # Store DICOM
    service = DicomStorageService(db)
    dicom_file = await service.store_dicom(temp_path)
    
    # Clean up
    os.remove(temp_path)
    
    return {
        "id": str(dicom_file.id),
        "sop_instance_uid": dicom_file.sop_instance_uid,
        "study_id": dicom_file.study_id,
        "series_id": dicom_file.series_id,
        "file_size": dicom_file.file_size,
        "status": "stored"
    }

@router.get("/files/{sop_instance_uid}")
async def get_dicom_file(
    sop_instance_uid: str,
    db: Session = Depends(get_db)
):
    """Get DICOM file metadata"""
    service = DicomStorageService(db)
    dicom_file = await service.get_dicom(sop_instance_uid)
    
    if not dicom_file:
        raise HTTPException(status_code=404, detail="File not found")
    
    return dicom_file

@router.get("/search")
async def search_dicom_files(
    study_id: Optional[str] = None,
    series_id: Optional[str] = None,
    patient_id: Optional[str] = None,
    modality: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Search DICOM files"""
    filters = {}
    if study_id:
        filters['study_id'] = study_id
    if series_id:
        filters['series_id'] = series_id
    if patient_id:
        filters['patient_id'] = patient_id
    if modality:
        filters['modality'] = modality
    
    service = DicomStorageService(db)
    files = await service.search_dicom(filters)
    
    return files

@router.get("/stats")
async def get_storage_stats(db: Session = Depends(get_db)):
    """Get storage statistics"""
    total_files = db.query(DicomFile).count()
    total_size = db.query(func.sum(DicomFile.file_size)).scalar() or 0
    
    files_by_modality = db.query(
        DicomFile.modality,
        func.count(DicomFile.id)
    ).group_by(DicomFile.modality).all()
    
    return {
        "total_files": total_files,
        "total_size_gb": total_size / (1024**3),
        "files_by_modality": dict(files_by_modality)
    }
```

### 4. Configuration

#### Storage Configuration (`storage_config.yaml`)
```yaml
storage:
  base_path: /data/dicom-storage
  
  tiers:
    hot:
      path: /data/dicom-storage/hot
      max_size_gb: 500
      retention_days: 30
    warm:
      path: /data/dicom-storage/warm
      max_size_gb: 2000
      retention_days: 365
    cold:
      path: /data/dicom-storage/cold
      max_size_gb: 10000
      retention_days: 3650
  
  compression:
    enabled: true
    algorithm: jpeg2000
    quality: 90
  
  backup:
    enabled: true
    schedule: "0 2 * * *"  # Daily at 2 AM
    destination: /backup/dicom
```

### 5. Testing

#### Test Cases
```python
# test_dicom_storage.py
import pytest
from app.services.dicom_storage import DicomStorageService

def test_store_dicom(db_session, sample_dicom_file):
    """Test storing DICOM file"""
    service = DicomStorageService(db_session)
    result = await service.store_dicom(sample_dicom_file)
    
    assert result.id is not None
    assert result.sop_instance_uid is not None
    assert result.file_size > 0

def test_get_dicom(db_session, stored_dicom):
    """Test retrieving DICOM file"""
    service = DicomStorageService(db_session)
    result = await service.get_dicom(stored_dicom.sop_instance_uid)
    
    assert result is not None
    assert result.id == stored_dicom.id

def test_search_dicom(db_session, stored_dicoms):
    """Test searching DICOM files"""
    service = DicomStorageService(db_session)
    results = await service.search_dicom({'modality': 'CT'})
    
    assert len(results) > 0
    assert all(r.modality == 'CT' for r in results)
```

---

## Week 8 Day 5-7: WADO-RS Implementation

### Goal
Implement WADO-RS (Web Access to DICOM Objects - RESTful Services) for image retrieval.

### 1. WADO-RS Service

#### Service Structure
```python
# wado_service.py
from fastapi import Response
from fastapi.responses import StreamingResponse
from pydicom import dcmread
from PIL import Image
import io

class WadoService:
    """WADO-RS service for image retrieval"""
    
    def __init__(self, storage_service: DicomStorageService):
        self.storage = storage_service
    
    async def get_study(self, study_id: str) -> list:
        """Get all instances in a study"""
        return await self.storage.search_dicom({'study_id': study_id})
    
    async def get_series(self, study_id: str, series_id: str) -> list:
        """Get all instances in a series"""
        return await self.storage.search_dicom({
            'study_id': study_id,
            'series_id': series_id
        })
    
    async def get_instance(self, study_id: str, series_id: str, 
                          instance_id: str) -> bytes:
        """Get DICOM instance"""
        files = await self.storage.search_dicom({
            'study_id': study_id,
            'series_id': series_id,
            'instance_id': instance_id
        })
        
        if not files:
            raise HTTPException(status_code=404, detail="Instance not found")
        
        with open(files[0].file_path, 'rb') as f:
            return f.read()
    
    async def get_thumbnail(self, study_id: str, series_id: str, 
                           instance_id: str, size: int = 200) -> bytes:
        """Get thumbnail image"""
        files = await self.storage.search_dicom({
            'study_id': study_id,
            'series_id': series_id,
            'instance_id': instance_id
        })
        
        if not files:
            raise HTTPException(status_code=404, detail="Instance not found")
        
        # Read DICOM and extract pixel data
        ds = dcmread(files[0].file_path)
        pixel_array = ds.pixel_array
        
        # Convert to PIL Image
        image = Image.fromarray(pixel_array)
        
        # Resize to thumbnail
        image.thumbnail((size, size))
        
        # Convert to JPEG
        buffer = io.BytesIO()
        image.save(buffer, format='JPEG')
        buffer.seek(0)
        
        return buffer.getvalue()
```

### 2. WADO-RS API Endpoints

```python
# wado.py
from fastapi import APIRouter, Depends
from fastapi.responses import Response, StreamingResponse
from app.services.wado_service import WadoService

router = APIRouter(prefix="/wado-rs", tags=["wado"])

@router.get("/studies/{study_id}")
async def get_study(study_id: str, wado: WadoService = Depends()):
    """Get all instances in a study"""
    instances = await wado.get_study(study_id)
    return instances

@router.get("/studies/{study_id}/series/{series_id}")
async def get_series(study_id: str, series_id: str, 
                     wado: WadoService = Depends()):
    """Get all instances in a series"""
    instances = await wado.get_series(study_id, series_id)
    return instances

@router.get("/studies/{study_id}/series/{series_id}/instances/{instance_id}")
async def get_instance(study_id: str, series_id: str, instance_id: str,
                       wado: WadoService = Depends()):
    """Get DICOM instance"""
    data = await wado.get_instance(study_id, series_id, instance_id)
    return Response(content=data, media_type="application/dicom")

@router.get("/studies/{study_id}/series/{series_id}/instances/{instance_id}/thumbnail")
async def get_thumbnail(study_id: str, series_id: str, instance_id: str,
                        size: int = 200, wado: WadoService = Depends()):
    """Get thumbnail image"""
    data = await wado.get_thumbnail(study_id, series_id, instance_id, size)
    return Response(content=data, media_type="image/jpeg")
```

### 3. Frontend Integration

#### Update Viewer Service
```javascript
// wadoService.js
const WADO_BASE_URL = import.meta.env.VITE_WADO_URL || 'http://localhost:8003/wado-rs';

export const wadoService = {
  /**
   * Get study instances
   */
  async getStudy(studyId) {
    const response = await fetch(`${WADO_BASE_URL}/studies/${studyId}`);
    return response.json();
  },
  
  /**
   * Get series instances
   */
  async getSeries(studyId, seriesId) {
    const response = await fetch(
      `${WADO_BASE_URL}/studies/${studyId}/series/${seriesId}`
    );
    return response.json();
  },
  
  /**
   * Get DICOM instance URL
   */
  getInstanceUrl(studyId, seriesId, instanceId) {
    return `${WADO_BASE_URL}/studies/${studyId}/series/${seriesId}/instances/${instanceId}`;
  },
  
  /**
   * Get thumbnail URL
   */
  getThumbnailUrl(studyId, seriesId, instanceId, size = 200) {
    return `${WADO_BASE_URL}/studies/${studyId}/series/${seriesId}/instances/${instanceId}/thumbnail?size=${size}`;
  }
};
```

#### Update Viewer Component
```javascript
// Update DicomViewerEnhanced.jsx to use WADO-RS
import { wadoService } from '../../services/wadoService';

// In loadStudy function:
const instances = await wadoService.getSeries(studyId, seriesId);
const imageUrl = wadoService.getInstanceUrl(studyId, seriesId, instanceId);

// Load image with Cornerstone
await cornerstone.loadImage(imageUrl);
```

---

## Week 9-13: DICOM Communication Services

### Goal
Implement DICOM SCP/SCU services for receiving and sending DICOM images.

### Components
1. **DICOM SCP** (Service Class Provider) - Receive images from modalities
2. **DICOM SCU** (Service Class User) - Send images to other systems
3. **C-STORE** - Store images
4. **C-FIND** - Query images
5. **C-MOVE** - Retrieve images
6. **C-ECHO** - Test connection

### Implementation Details
(To be detailed in next phase)

---

## Week 14-15: Study Distribution & Routing

### Goal
Implement automatic and manual study distribution to other PACS systems.

### Components
1. **Routing Engine** - Rule-based routing
2. **Distribution Queue** - Async distribution
3. **Retry Mechanism** - Handle failures
4. **Status Tracking** - Monitor distribution

### Implementation Details
(To be detailed in next phase)

---

## Success Criteria

### Week 8 Day 3-4 Complete When:
- ✅ Database schema created and migrated
- ✅ DICOM parser service working
- ✅ Storage manager service working
- ✅ DICOM storage service working
- ✅ API endpoints functional
- ✅ File upload working
- ✅ File retrieval working
- ✅ Search working
- ✅ Statistics working
- ✅ Tests passing

### Week 8 Day 5-7 Complete When:
- ✅ WADO-RS service implemented
- ✅ Study retrieval working
- ✅ Series retrieval working
- ✅ Instance retrieval working
- ✅ Thumbnail generation working
- ✅ Frontend integrated
- ✅ Viewer using WADO-RS
- ✅ Performance acceptable

---

## Next Steps

### Immediate (Week 8 Day 3)
1. Create database migration file
2. Implement DICOM parser service
3. Implement storage manager service
4. Create DICOM file model

### Day 4
1. Implement DICOM storage service
2. Create API endpoints
3. Write tests
4. Test file upload

### Day 5-7
1. Implement WADO-RS service
2. Create WADO-RS endpoints
3. Update frontend viewer
4. Test image retrieval

---

**Document Version**: 1.0  
**Created**: November 16, 2025  
**Status**: Ready to Start  
**Priority**: CRITICAL
