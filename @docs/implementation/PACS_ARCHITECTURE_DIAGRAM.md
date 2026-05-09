# PACS System Architecture - Visual Diagrams
**Date**: 2025-11-15

---

## Current System Architecture (Before Refactoring)

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser (React SPA)                      │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Orders   │  │ Patients │  │ Settings │  │ Reports  │   │
│  │ (90%)    │  │ (90%)    │  │ (70%)    │  │ (10%)    │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                 │
│  │ Worklist │  │ Studies  │  │ Viewer   │                 │
│  │ (85%)    │  │ (60%)    │  │ (15%)    │                 │
│  └──────────┘  └──────────┘  └──────────┘                 │
├─────────────────────────────────────────────────────────────┤
│                    API Layer (REST)                          │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │ Node.js Server   │  │ PACS Service     │               │
│  │ (Express)        │  │ (FastAPI)        │               │
│  │ - Orders CRUD    │  │ - Studies (40%)  │               │
│  │ - File Upload    │  │ - Storage (20%)  │               │
│  │ - Auth           │  │ - Reports (10%)  │               │
│  └──────────────────┘  └──────────────────┘               │
├─────────────────────────────────────────────────────────────┤
│                    Data Layer                                │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │ PostgreSQL       │  │ File Storage     │               │
│  │ - Orders         │  │ - Uploads        │               │
│  │ - Patients       │  │ - DICOM (basic)  │               │
│  │ - Users          │  │                  │               │
│  └──────────────────┘  └──────────────────┘               │
└─────────────────────────────────────────────────────────────┘

Status: Mini-PACS (47% Complete)
Missing: DICOM Communication, Advanced Viewer, Reporting
```

---

## Target System Architecture (After Refactoring)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Browser (React SPA + Cornerstone.js)                  │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    PACS Layout System                            │   │
│  │  ┌──────────┐  ┌────────────────────────────┐  ┌──────────┐   │   │
│  │  │Worklist  │  │   Main Workspace           │  │ Tools    │   │   │
│  │  │Panel     │  │   - Study List             │  │ Panel    │   │   │
│  │  │          │  │   - DICOM Viewer           │  │          │   │   │
│  │  │- Today   │  │   - Report Editor          │  │- W/L     │   │   │
│  │  │- Pending │  │   - Multi-viewport         │  │- Measure │   │   │
│  │  │- All     │  │                            │  │- Annotate│   │   │
│  │  └──────────┘  └────────────────────────────┘  └──────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    Component Library                              │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │  │
│  │  │ Viewer  │ │ Study   │ │ Report  │ │ Worklist│ │ Admin   │  │  │
│  │  │ (90%)   │ │ List    │ │ Editor  │ │ (90%)   │ │ (80%)   │  │  │
│  │  │         │ │ (90%)   │ │ (90%)   │ │         │ │         │  │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────────────┤
│                         API Gateway Layer                                │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  REST API          WADO-RS           WebSocket                   │  │
│  │  /api/studies      /wado-rs/...     /ws/notifications           │  │
│  │  /api/reports      /wado-uri/...    /ws/status                  │  │
│  │  /api/patients                                                   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────────────┤
│                        Backend Services                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐    │
│  │ Node.js Server   │  │ PACS Service     │  │ DICOM Daemon     │    │
│  │ (Express)        │  │ (FastAPI)        │  │ (pynetdicom)     │    │
│  │                  │  │                  │  │                  │    │
│  │ - Orders CRUD    │  │ - Study Mgmt     │  │ - C-STORE SCP    │    │
│  │ - File Upload    │  │ - DICOM Storage  │  │ - C-FIND SCP     │    │
│  │ - Auth/RBAC      │  │ - WADO Service   │  │ - C-MOVE SCP     │    │
│  │ - Reporting      │  │ - Report Mgmt    │  │ - C-ECHO SCP     │    │
│  │ - Integration    │  │ - Backup Service │  │ - Routing        │    │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘    │
├─────────────────────────────────────────────────────────────────────────┤
│                          Data Layer                                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐    │
│  │ PostgreSQL       │  │ DICOM Storage    │  │ Backup Storage   │    │
│  │                  │  │                  │  │                  │    │
│  │ - Studies        │  │ - DICOM Files    │  │ - DB Backups     │    │
│  │ - Series         │  │ - Metadata       │  │ - DICOM Backups  │    │
│  │ - Instances      │  │ - Thumbnails     │  │ - Incremental    │    │
│  │ - Reports        │  │ - Compressed     │  │                  │    │
│  │ - Patients       │  │                  │  │                  │    │
│  │ - Users/RBAC     │  │                  │  │                  │    │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘    │
├─────────────────────────────────────────────────────────────────────────┤
│                    External Integrations                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐    │
│  │ Modalities       │  │ External PACS    │  │ SatuSehat        │    │
│  │ (DICOM C-STORE)  │  │ (DICOM Q/R)      │  │ (HL7 FHIR)       │    │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘

Status: Full PACS (90%+ Complete)
Features: Complete DICOM, Advanced Viewer, Full Reporting, Backup/DR
```

---

## UI Layout Transformation

### Before: Generic Admin Layout
```
┌─────────────────────────────────────────────────┐
│  Logo    [Menu Items]           User Settings   │
├─────────────────────────────────────────────────┤
│                                                  │
│              Generic Content Area                │
│                                                  │
│              (Tables and Forms)                  │
│                                                  │
│                                                  │
└─────────────────────────────────────────────────┘
```

### After: Professional PACS Layout
```
┌─────────────────────────────────────────────────────────────┐
│  [≡] PACS  [Worklist][Studies][Viewer][Reports]  🔍 🔔 👤  │
├──────┬──────────────────────────────────────────────────────┤
│      │                                                       │
│  W   │                                                       │
│  O   │          Main Workspace                              │
│  R   │          - Configurable panels                       │
│  K   │          - Multi-viewport support                    │
│  L   │          - Drag-and-drop                             │
│  I   │          - Context-aware tools                       │
│  S   │                                                       │
│  T   │                                                       │
│      │                                                       │
│  📋  │                                                       │
│  👤  │                                                       │
│  📅  │                                                       │
│      │                                                       │
├──────┴──────────────────────────────────────────────────────┤
│  🟢 Connected | 💾 45GB/500GB | 📊 0 tasks | 🕐 14:30:25   │
└─────────────────────────────────────────────────────────────┘
```

---

## DICOM Viewer Evolution

### Before: Basic Preview (15%)
```
┌─────────────────────────────────────┐
│  [Close]                            │
├─────────────────────────────────────┤
│                                     │
│                                     │
│         Basic Image Display         │
│         (No tools)                  │
│                                     │
│                                     │
└─────────────────────────────────────┘

Features:
- Basic image display
- No windowing
- No measurements
- Single viewport
```

### After: Diagnostic Quality Viewer (90%)
```
┌─────────────────────────────────────────────────────────────┐
│  [Tools] [W/L] [Measure] [Annotate] [Layout] [Cine] [Export]│
├──────┬──────────────────────────────────────────────┬───────┤
│      │  ┌──────────┬──────────┐                     │       │
│ 📁   │  │          │          │                     │ 📊    │
│ S    │  │ Viewport │ Viewport │                     │       │
│ E    │  │    1     │    2     │                     │ Info  │
│ R    │  │          │          │                     │       │
│ I    │  ├──────────┼──────────┤                     │ W/L   │
│ E    │  │          │          │                     │ 400   │
│ S    │  │ Viewport │ Viewport │                     │ 40    │
│      │  │    3     │    4     │                     │       │
│ 🖼️   │  │          │          │                     │ Tools │
│ 🖼️   │  └──────────┴──────────┘                     │ ✏️    │
│ 🖼️   │                                              │ 📏    │
│      │  [◀️] [▶️] [⏸️] Frame: 15/120                │ 📐    │
├──────┴──────────────────────────────────────────────┴───────┤
│  Zoom: 100% | Pan: 0,0 | Angle: 0° | Measurements: 3       │
└─────────────────────────────────────────────────────────────┘

Features:
- Multi-viewport (1x1, 1x2, 2x2, 3x3)
- Windowing (W/L presets)
- Measurements (distance, angle, ROI)
- Annotations
- Cine playback
- Zoom, pan, rotate
- Hanging protocols
- Export (DICOM, JPEG)
```

---

## Study List Evolution

### Before: Basic Table (60%)
```
┌─────────────────────────────────────────────────────────────┐
│  Studies                                    [+ New]          │
├─────────────────────────────────────────────────────────────┤
│  Patient Name | ID      | Date       | Modality | Status   │
│  ─────────────────────────────────────────────────────────  │
│  John Doe     | 12345   | 2025-11-15 | CT       | Complete │
│  Jane Smith   | 12346   | 2025-11-14 | MRI      | Pending  │
│  ...                                                         │
└─────────────────────────────────────────────────────────────┘
```

### After: Advanced Study List (90%)
```
┌─────────────────────────────────────────────────────────────┐
│  Studies                                                     │
├─────────────────────────────────────────────────────────────┤
│  [🔍 Search] [📅 Date] [🏥 Modality] [📊 Status] [⚙️ More] │
├─────────────────────────────────────────────────────────────┤
│  [Grid View] [Table View]  [Batch: Select All | Export]     │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ [📷]     │  │ [📷]     │  │ [📷]     │  │ [📷]     │   │
│  │          │  │          │  │          │  │          │   │
│  │ John Doe │  │Jane Smith│  │Bob Jones │  │...       │   │
│  │ CT Brain │  │MRI Spine │  │X-Ray     │  │          │   │
│  │ 2025-11  │  │ 2025-11  │  │ 2025-11  │  │          │   │
│  │ ✅ Done  │  │ ⏳ Pend  │  │ 🔄 Prog  │  │          │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│                                                              │
│  [Load More] Showing 1-20 of 1,234 studies                  │
└─────────────────────────────────────────────────────────────┘

Features:
- Thumbnail preview
- Advanced filtering
- Grid/Table view
- Virtual scrolling
- Batch operations
- Drag-to-viewer
- Export capabilities
```

---

## Reporting Workflow

### Before: Basic Form (10%)
```
┌─────────────────────────────────────┐
│  Report                             │
├─────────────────────────────────────┤
│  Findings:                          │
│  [                                ] │
│  [                                ] │
│                                     │
│  Impression:                        │
│  [                                ] │
│                                     │
│  [Save]                             │
└─────────────────────────────────────┘
```

### After: Professional Reporting (90%)
```
┌─────────────────────────────────────────────────────────────┐
│  Report Editor - CT Brain (John Doe)                        │
├─────────────────────────────────────────────────────────────┤
│  [Template ▼] [Save Draft] [Submit] [Approve] [Sign] [PDF] │
├──────────────────────────────────────┬──────────────────────┤
│  Editor                              │  Preview             │
│  ┌────────────────────────────────┐  │  ┌────────────────┐ │
│  │ Clinical History:              │  │  │ [Report PDF]   │ │
│  │ Patient presents with...       │  │  │                │ │
│  │                                │  │  │ Header         │ │
│  │ Technique:                     │  │  │ Patient Info   │ │
│  │ CT Brain without contrast      │  │  │ Findings       │ │
│  │                                │  │  │ Impression     │ │
│  │ Findings:                      │  │  │ Signature      │ │
│  │ [Rich text editor with         │  │  │                │ │
│  │  formatting, templates,        │  │  │                │ │
│  │  macros, voice-to-text]        │  │  │                │ │
│  │                                │  │  │                │ │
│  │ Impression:                    │  │  │                │ │
│  │ Normal CT brain                │  │  │                │ │
│  └────────────────────────────────┘  │  └────────────────┘ │
├──────────────────────────────────────┴──────────────────────┤
│  Status: Draft | Last saved: 14:30 | Version: 1            │
└─────────────────────────────────────────────────────────────┘

Features:
- Template-based
- Rich text editor
- Live preview
- Workflow (Draft → Preliminary → Final)
- Digital signature
- PDF export
- Version control
```

---

## Data Flow Diagrams

### DICOM Image Reception Flow
```
Modality (CT/MRI/X-Ray)
    │
    │ C-STORE (DICOM)
    ▼
DICOM SCP Daemon (Port 11112)
    │
    ├─► Validate DICOM
    ├─► Extract Metadata
    ├─► Store File
    ├─► Create Thumbnail
    ├─► Update Database
    └─► Route to Destination
        │
        ├─► Workstation
        ├─► External PACS
        └─► Archive
```

### Study Viewing Flow
```
User selects study
    │
    ▼
Load study metadata
    │
    ▼
Fetch DICOM files (WADO-RS)
    │
    ├─► Load from cache (if available)
    └─► Download from server
        │
        ▼
    Parse DICOM
        │
        ▼
    Render in Cornerstone
        │
        ├─► Apply windowing
        ├─► Apply hanging protocol
        └─► Enable tools
```

### Report Creation Flow
```
User opens report editor
    │
    ▼
Select template (optional)
    │
    ▼
Fill in findings/impression
    │
    ├─► Use voice-to-text
    ├─► Insert macros
    └─► Add measurements
        │
        ▼
    Save as draft
        │
        ▼
    Submit for review
        │
        ▼
    Approve and sign
        │
        ▼
    Generate PDF
        │
        └─► Store in database
```

---

## Deployment Architecture

### Development Environment
```
┌─────────────────────────────────────┐
│  Developer Machine                  │
│  ┌───────────────────────────────┐  │
│  │ Vite Dev Server (Port 5173)   │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │ Node.js Server (Port 3001)    │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │ PACS Service (Port 8000)      │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │ PostgreSQL (Port 5432)        │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │ DICOM SCP (Port 11112)        │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

### Production Environment (Docker)
```
┌─────────────────────────────────────────────────────────────┐
│  Docker Host                                                 │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Nginx (Port 80/443)                                    │ │
│  │ - Reverse Proxy                                        │ │
│  │ - SSL Termination                                      │ │
│  │ - Static File Serving                                  │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────┐ │
│  │ React SPA      │  │ Node.js API    │  │ PACS Service │ │
│  │ (Static Files) │  │ (Container)    │  │ (Container)  │ │
│  └────────────────┘  └────────────────┘  └──────────────┘ │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────┐ │
│  │ PostgreSQL     │  │ DICOM Storage  │  │ Backup       │ │
│  │ (Container)    │  │ (Volume)       │  │ (Volume)     │ │
│  └────────────────┘  └────────────────┘  └──────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ DICOM SCP Daemon (Port 11112)                          │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Frontend
```
React 18
├── Cornerstone.js (DICOM Viewer)
├── React Router (Navigation)
├── Tailwind CSS (Styling)
├── Headless UI (Components)
├── Heroicons (Icons)
└── Vite (Build Tool)
```

### Backend
```
Node.js + Express
├── Authentication (JWT)
├── File Upload (Multer)
├── RBAC (Custom)
└── Integration APIs

FastAPI (Python)
├── DICOM Processing (pydicom)
├── PACS Services
├── WADO-RS
└── Report Management

DICOM Daemon (Python)
├── pynetdicom (DICOM SCP/SCU)
├── C-STORE Handler
├── C-FIND Handler
└── C-MOVE Handler
```

### Database
```
PostgreSQL
├── Studies/Series/Instances
├── Reports
├── Patients
├── Users/RBAC
└── Audit Logs
```

### Storage
```
File System
├── DICOM Files
├── Thumbnails
├── Uploads
└── Backups
```

---

**Last Updated**: 2025-11-15  
**Status**: Architecture Defined  
**Next**: Implementation Phase 1
