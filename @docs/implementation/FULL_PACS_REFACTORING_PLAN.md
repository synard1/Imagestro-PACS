# Full PACS System Refactoring Plan
**Date**: 2025-11-15  
**Project**: MWL-PACS-UI → Full PACS System  
**Current Status**: Mini-PACS (47% Complete)  
**Target**: Industry-Standard Full PACS System

---

## Executive Summary

Berdasarkan analisis mendalam terhadap requirements.md, design.md, dan tasks.md, sistem saat ini adalah **excellent RIS/Order Management System** dengan **basic PACS capabilities (47% complete)**. Untuk menjadi full PACS system yang memenuhi standar industri minimum, diperlukan refactoring komprehensif pada 5 area kritikal.

### Current System Classification
- ✅ **RIS (Radiology Information System)**: 90% Complete
- ✅ **Order Management**: 90% Complete  
- ✅ **Worklist Provider**: 85% Complete
- ⚠️ **PACS Core**: 20% Complete
- ❌ **Full PACS**: 47% Complete

### Critical Gaps (Must-Have)
1. ❌ **DICOM Image Storage** (0% - Priority: CRITICAL)
2. ❌ **DICOM Communication Services** (0% - Priority: CRITICAL)
3. ⚠️ **Diagnostic Quality Viewer** (15% - Priority: HIGH)
4. ❌ **Radiology Reporting System** (10% - Priority: HIGH)
5. ❌ **Backup & Disaster Recovery** (0% - Priority: HIGH)

---

## Phase 1: Critical PACS Features (3-6 months)

### 1.1 DICOM Image Storage & Archive System
**Status**: 0% → Target: 100%  
**Priority**: CRITICAL  
**Estimated Effort**: 6-8 weeks

#### Objectives
- Implement full DICOM Study-Series-Instance hierarchy
- DICOM file storage with metadata extraction
- Storage monitoring and management
- Compression support (lossless/lossy)

#### Components to Refactor/Create

##### A. Database Schema Enhancement
**Files to Modify**:
- `pacs-service/migrations/001_create_pacs_tables.sql`
- `pacs-service/app/models/study.py` ✅ (exists, needs enhancement)
- `pacs-service/app/models/series.py` ✅ (exists, needs enhancement)
- `pacs-service/app/models/instance.py` ✅ (exists, needs enhancement)

**New Files to Create**:
- `pacs-service/app/models/dicom_file.py` (DICOM file metadata)
- `pacs-service/app/models/storage_location.py` (storage paths)
- `pacs-service/migrations/002_enhance_dicom_hierarchy.sql`

**Schema Enhancements**:
```sql
-- Add to pacs_instances table
ALTER TABLE pacs_instances ADD COLUMN IF NOT EXISTS:
  - dicom_file_path VARCHAR(1024)
  - dicom_metadata JSONB
  - transfer_syntax_uid VARCHAR(64)
  - compression_type VARCHAR(32)
  - original_size BIGINT
  - compressed_size BIGINT
  - checksum VARCHAR(64)
  - storage_tier VARCHAR(20) -- hot/warm/cold

-- Add to pacs_studies table
ALTER TABLE pacs_studies ADD COLUMN IF NOT EXISTS:
  - institution_name VARCHAR(255)
  - study_status VARCHAR(32) -- RECEIVED/PROCESSING/COMPLETE/ERROR
  - verification_status VARCHAR(32)
  - archive_status VARCHAR(32)
  - backup_status VARCHAR(32)
  - last_accessed_at TIMESTAMP
```

##### B. DICOM Storage Service
**New Files to Create**:
- `pacs-service/app/services/dicom_storage.py`
- `pacs-service/app/services/dicom_parser.py`
- `pacs-service/app/services/storage_manager.py`
- `pacs-service/app/services/compression_service.py`

**Key Functions**:
```python
# dicom_storage.py
class DicomStorageService:
    async def store_dicom_file(file_path, metadata)
    async def retrieve_dicom_file(instance_uid)
    async def delete_dicom_file(instance_uid)
    async def verify_dicom_integrity(instance_uid)
    async def compress_dicom_file(instance_uid, compression_type)
    
# storage_manager.py
class StorageManager:
    async def get_storage_stats()
    async def check_storage_capacity()
    async def move_to_tier(instance_uid, tier)  # hot/warm/cold
    async def cleanup_old_studies(retention_days)
```

##### C. API Endpoints
**Files to Modify**:
- `pacs-service/app/api/studies.py` (enhance existing)
- `pacs-service/app/api/storage.py` (enhance existing)

**New Endpoints**:
```python
POST   /pacs/studies/upload          # Upload DICOM files
GET    /pacs/studies/{uid}/files     # List DICOM files
GET    /pacs/instances/{uid}/download # Download DICOM file
POST   /pacs/instances/{uid}/compress # Compress instance
GET    /pacs/storage/capacity         # Storage capacity info
POST   /pacs/storage/verify           # Verify integrity
```

---

### 1.2 DICOM Communication Services (C-STORE, C-FIND, C-MOVE)
**Status**: 0% → Target: 100%  
**Priority**: CRITICAL  
**Estimated Effort**: 8-10 weeks

#### Objectives
- Implement DICOM SCP (Service Class Provider)
- Support C-STORE (receive images from modalities)
- Support C-FIND (query/retrieve)
- Support C-MOVE/C-GET (send images)
- Support C-ECHO (connectivity verification)

#### Components to Create

##### A. DICOM SCP Service
**New Files to Create**:
- `pacs-service/app/services/dicom_scp.py`
- `pacs-service/app/services/dicom_scu.py`
- `pacs-service/app/services/dicom_router.py`
- `pacs-service/app/services/dicom_validator.py`
- `pacs-service/app/config/dicom_config.py`

**Key Classes**:
```python
# dicom_scp.py
class DicomSCP:
    def start_scp_server(ae_title, port)
    def handle_c_store(dataset, context)
    def handle_c_find(dataset, context)
    def handle_c_move(dataset, context)
    def handle_c_echo(context)
    
# dicom_router.py
class DicomRouter:
    def route_study(study_uid, destination_aet)
    def auto_route_by_modality(modality)
    def route_to_workstation(study_uid, workstation_aet)
```

##### B. DICOM Node Management
**Files to Modify**:
- `server-data/dicomNodes.json` (existing)
- `src/services/api.js` (add DICOM node CRUD)

**New Files to Create**:
- `pacs-service/app/models/dicom_node.py`
- `pacs-service/app/api/dicom_nodes.py`
- `pacs-service/migrations/003_create_dicom_nodes.sql`

**Schema**:
```sql
CREATE TABLE dicom_nodes (
    id UUID PRIMARY KEY,
    ae_title VARCHAR(16) NOT NULL UNIQUE,
    host VARCHAR(255) NOT NULL,
    port INTEGER NOT NULL,
    node_type VARCHAR(20), -- MODALITY/WORKSTATION/PACS/ROUTER
    modality VARCHAR(16),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    auto_route BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);
```

##### C. DICOM Service Daemon
**New Files to Create**:
- `pacs-service/dicom_daemon.py` (separate process)
- `pacs-service/supervisord.conf` (process management)
- `docker-compose.pacs.yml` (update with DICOM ports)

**Configuration**:
```yaml
# docker-compose.pacs.yml additions
pacs-dicom-scp:
  build: ./pacs-service
  command: python dicom_daemon.py
  ports:
    - "11112:11112"  # DICOM C-STORE port
  environment:
    - DICOM_AE_TITLE=PACS_SCP
    - DICOM_PORT=11112
```

---

### 1.3 Diagnostic Quality Viewer Enhancement
**Status**: 15% → Target: 80%  
**Priority**: HIGH  
**Estimated Effort**: 4-6 weeks

#### Objectives
- Upgrade viewer to diagnostic quality
- Add windowing tools (brightness/contrast)
- Add measurement tools (distance, angle, area)
- Add zoom, pan, rotate functionality
- Multi-viewport support
- Hanging protocols

#### Components to Refactor

##### A. Frontend Viewer Enhancement
**Files to Modify**:
- `src/pages/DicomViewer.jsx` (major refactor)
- `src/services/dicomService.js` (new service)

**New Files to Create**:
- `src/components/viewer/DicomCanvas.jsx`
- `src/components/viewer/ViewerToolbar.jsx`
- `src/components/viewer/WindowingControls.jsx`
- `src/components/viewer/MeasurementTools.jsx`
- `src/components/viewer/ViewportManager.jsx`
- `src/hooks/useDicomViewer.js`
- `src/utils/dicomRendering.js`

**Libraries to Add**:
```json
// package.json additions
{
  "dependencies": {
    "@cornerstonejs/core": "^1.0.0",
    "@cornerstonejs/tools": "^1.0.0",
    "@cornerstonejs/dicom-image-loader": "^1.0.0",
    "cornerstone-wado-image-loader": "^4.0.0",
    "dicom-parser": "^1.8.0"
  }
}
```

##### B. WADO-RS Service
**New Files to Create**:
- `pacs-service/app/api/wado.py`
- `pacs-service/app/services/wado_service.py`

**Endpoints**:
```python
GET /pacs/wado-rs/studies/{study_uid}/series/{series_uid}/instances/{instance_uid}
GET /pacs/wado-rs/studies/{study_uid}/thumbnail
GET /pacs/wado-rs/studies/{study_uid}/metadata
```

---

### 1.4 Radiology Reporting System
**Status**: 10% → Target: 90%  
**Priority**: HIGH  
**Estimated Effort**: 4-5 weeks

#### Objectives
- Complete reporting interface
- Report templates
- Report workflow (DRAFT → PRELIMINARY → FINAL)
- Report approval mechanism
- PDF export
- DICOM SR support (optional)

#### Components to Refactor/Create

##### A. Backend Enhancement
**Files to Modify**:
- `pacs-service/app/models/report.py` ✅ (exists, needs enhancement)
- `pacs-service/app/api/reports.py` ✅ (exists, needs enhancement)

**New Files to Create**:
- `pacs-service/app/models/report_template.py`
- `pacs-service/app/services/report_service.py`
- `pacs-service/app/services/pdf_generator.py`
- `pacs-service/migrations/004_enhance_reports.sql`

**Schema Enhancements**:
```sql
CREATE TABLE report_templates (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    modality VARCHAR(16),
    procedure_code VARCHAR(50),
    template_content TEXT,
    sections JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE pacs_reports ADD COLUMN IF NOT EXISTS:
  - template_id UUID REFERENCES report_templates(id)
  - report_version INTEGER DEFAULT 1
  - previous_version_id UUID REFERENCES pacs_reports(id)
  - signed_at TIMESTAMP
  - signature_data TEXT
```

##### B. Frontend Reporting Interface
**New Files to Create**:
- `src/pages/ReportEditor.jsx`
- `src/components/reports/ReportForm.jsx`
- `src/components/reports/TemplateSelector.jsx`
- `src/components/reports/ReportPreview.jsx`
- `src/components/reports/ReportWorkflow.jsx`
- `src/services/reportService.js`

**Features**:
- Rich text editor for findings/impression
- Template-based reporting
- Voice-to-text integration (optional)
- Report approval workflow
- PDF export with letterhead
- Digital signature support

---

### 1.5 Backup & Disaster Recovery
**Status**: 0% → Target: 100%  
**Priority**: HIGH  
**Estimated Effort**: 3-4 weeks

#### Objectives
- Automated backup mechanism
- Backup retention policies
- Restore procedures
- Data replication
- Disaster recovery documentation

#### Components to Create

##### A. Backup Service
**New Files to Create**:
- `pacs-service/app/services/backup_service.py`
- `pacs-service/app/services/restore_service.py`
- `pacs-service/backup_daemon.py`
- `scripts/backup-pacs.sh`
- `scripts/restore-pacs.sh`

**Key Functions**:
```python
# backup_service.py
class BackupService:
    async def backup_database()
    async def backup_dicom_files(study_uid)
    async def backup_full_system()
    async def verify_backup(backup_id)
    async def cleanup_old_backups(retention_days)
    
# restore_service.py
class RestoreService:
    async def restore_database(backup_id)
    async def restore_study(study_uid, backup_id)
    async def restore_full_system(backup_id)
    async def verify_restore(restore_id)
```

##### B. Backup Configuration
**New Files to Create**:
- `pacs-service/config/backup_config.yaml`
- `docs/DISASTER_RECOVERY_PLAN.md`
- `docs/BACKUP_PROCEDURES.md`

**Configuration**:
```yaml
# backup_config.yaml
backup:
  enabled: true
  schedule: "0 2 * * *"  # Daily at 2 AM
  retention:
    daily: 7
    weekly: 4
    monthly: 12
  destinations:
    - type: local
      path: /backup/pacs
    - type: s3
      bucket: pacs-backup
      region: ap-southeast-1
  compression: gzip
  encryption: aes256
```

---

## Phase 2: Production Hardening (2-3 months)

### 2.1 Enhanced Security
- Multi-factor authentication (MFA)
- Data encryption at rest
- TLS/SSL for all communications
- HIPAA compliance documentation
- Comprehensive audit trail

### 2.2 Advanced Monitoring
- Image quality monitoring
- Performance dashboard
- Usage analytics
- Automated alerting
- SLA monitoring

### 2.3 Compression & Optimization
- JPEG 2000 compression
- Lossless compression for critical studies
- Image caching
- CDN integration
- Progressive loading

### 2.4 Scalability
- Horizontal scaling support
- Load balancing
- Database replication
- Caching layer (Redis)
- Auto-scaling

### 2.5 Standards Compliance
- Full DICOM 3.0 implementation
- IHE profiles compliance
- HL7 v2.x support
- DICOM Conformance Statement
- HIPAA/GDPR documentation

---

## Phase 3: Advanced Features (3-6 months)

### 3.1 Advanced Viewer
- Multi-planar reconstruction (MPR)
- 3D rendering
- Fusion imaging
- Cine/loop playback
- Comparison view

### 3.2 Mobile Optimization
- Progressive Web App (PWA)
- Mobile-optimized viewer
- Offline viewing
- Touch gestures
- Responsive design

### 3.3 Teaching & Research
- Teaching file collections
- Case sharing
- Data anonymization
- Research data export
- Annotation tools

### 3.4 AI/ML Integration
- AI model integration hooks
- Automated measurements
- CAD (Computer-Aided Detection)
- Quality control automation
- Predictive analytics

### 3.5 Advanced Analytics
- Usage statistics
- Performance metrics
- Cost analysis
- Workflow optimization
- Reporting dashboards

---

## Implementation Strategy

### Backup Strategy
Before any refactoring:
1. Create timestamped backup directory
2. Copy all files to be modified
3. Document original state
4. Version control (Git tags)

### Development Workflow
1. Create feature branch for each component
2. Implement with comprehensive tests
3. Document changes
4. Code review
5. Merge to development
6. Integration testing
7. Merge to main

### Testing Strategy
1. Unit tests for all services
2. Integration tests for APIs
3. DICOM conformance tests
4. Performance tests
5. Security tests
6. User acceptance tests

### Documentation Requirements
For each component:
1. Technical specification
2. API documentation
3. User guide
4. Deployment guide
5. Troubleshooting guide

---

## Risk Assessment

### High Risk Areas
1. **DICOM Communication**: Complex protocol, requires extensive testing
2. **Data Migration**: Existing data must be preserved
3. **Performance**: Large DICOM files can impact performance
4. **Security**: Medical data requires strict security measures

### Mitigation Strategies
1. Extensive testing with real DICOM data
2. Phased rollout with rollback capability
3. Performance monitoring and optimization
4. Security audits and penetration testing

---

## Success Criteria

### Phase 1 Complete When:
- ✅ Can receive DICOM images from modalities (C-STORE)
- ✅ Can store and retrieve DICOM files
- ✅ Can query studies (C-FIND)
- ✅ Diagnostic viewer functional with basic tools
- ✅ Can create and approve radiology reports
- ✅ Automated backup running daily

### Full PACS Complete When:
- ✅ All 15 PACS requirements met (from requirements.md)
- ✅ System completion ≥ 90%
- ✅ Production-ready with DR plan
- ✅ Passes DICOM conformance tests
- ✅ User acceptance testing passed

---

## Timeline Summary

| Phase | Duration | Completion Target |
|-------|----------|-------------------|
| Phase 1: Critical PACS | 3-6 months | 80% |
| Phase 2: Production Hardening | 2-3 months | 90% |
| Phase 3: Advanced Features | 3-6 months | 100% |
| **Total** | **8-15 months** | **Full PACS** |

---

## Next Steps

1. ✅ Review and approve this refactoring plan
2. ✅ Set up backup infrastructure
3. ✅ Create detailed technical specifications for Phase 1.1
4. ✅ Begin DICOM Storage implementation
5. ✅ Set up development environment for DICOM testing

---

**Document Version**: 1.0  
**Last Updated**: 2025-11-15  
**Status**: DRAFT - Awaiting Approval
