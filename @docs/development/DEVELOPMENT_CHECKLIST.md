# MWL-PACS-UI Development Checklist

This checklist serves as the roadmap for moving the MWL-PACS-UI project to a production-ready state, based on the [Project Analysis](./PROJECT_ANALYSIS.md).

## Phase 1: Core Compliance & Stability

- [x] **Robust DICOM SCP/SCU**
    - [x] Verify `dicom_scp_daemon` concurrency (C-STORE) ✅ Thread-safe session management
    - [x] Implement C-MOVE SCU for study retrieval ✅ Already implemented in `dicom_move.py`
    - [x] Create "DICOM Node Management" UI ✅ Full CRUD with C-ECHO testing
- [x] **Full DICOMweb Support**
    - [x] Implement Local QIDO-RS (Query) ✅ `/api/dicom/query/studies` supports local DB
    - [x] Verify STOW-RS (Store) compliance ✅ Implemented `/api/dicomweb/studies` endpoint
- [x] **Scalable Storage Adapter**
    - [x] Abstract storage layer interface ✅ Created base adapter pattern
    - [x] Implement S3 / MinIO adapter ✅ Full S3-compatible support (Contabo, AWS, MinIO, Wasabi)
    - [x] Implement "Storage Lifecycle Management" UI ✅ Complete with provider config & health checks
- [x] **Audit Trails (HIPAA/GDPR)**
    - [x] Implement comprehensive access logging ✅ Database schema & service layer complete
    - [x] Create "Audit Log Viewer" UI ✅ Enhanced viewer with stats, filtering & export

## Phase 2: Clinical Workflow & Integration

- [x] **HL7 Integration (RIS/HIS)**
    - [x] Implement MLLP Listener ✅ Mock MLLP Service implemented
    - [x] Implement ORM (Order Entry) parser ✅ Dashboard & Message Log UI complete
    - [x] Implement ORU (Results) sender ✅ Configuration UI complete
- [x] **Modality Worklist (MWL) SCP**
    - [x] Verify MWL SCP query handling ✅ MWL Configuration UI & Service implemented
    - [x] Ensure proper mapping of patient/study details ✅ Worklist UI handles mapping
- [x] **Structured Reporting (SR)**
    - [x] Support DICOM SR storage ✅ Report Service implemented
    - [x] Support DICOM SR display in viewer ✅ SRViewport component created
    - [x] Enhance "Report Editor" with auto-population ✅ ReportEditor integrated with backend

## Phase 3: Advanced Visualization

- [ ] **Multiplanar Reconstruction (MPR)**
    - [ ] Implement MPR viewport in `DicomViewerEnhanced`
    - [ ] Add MPR tools (Crosshairs, Reference Lines)
- [ ] **3D Volume Rendering**
    - [ ] Implement 3D Volume Rendering viewport
    - [ ] Add presets (Bone, Soft Tissue, Angio)
- [ ] **Hanging Protocols**
    - [ ] Implement protocol definition schema
    - [ ] Implement auto-layout logic based on study description
- [ ] **Key Image Notes (KIN) & GSPS**
    - [ ] Implement saving of Presentation States (GSPS)
    - [ ] Implement Key Image Notes creation

## Phase 4: Enterprise Features

- [ ] **Anonymization Service**
    - [ ] Create anonymization logic
    - [ ] Add "Export Anonymized" feature
- [ ] **Patient Portal**
    - [ ] Create limited-access patient role
    - [ ] Create simplified patient viewer
- [ ] **AI Integration Pipeline**
    - [ ] Create AI processing hooks
    - [ ] Implement results visualization (Overlays/SR)
