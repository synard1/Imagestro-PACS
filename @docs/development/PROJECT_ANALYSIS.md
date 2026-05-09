# Project Analysis & Roadmap: MWL-PACS-UI

## 1. Comprehensive Project Analysis

### 1.1 Backend (`pacs-service`)
*   **Architecture:** Modern, asynchronous microservice built with **FastAPI** and **SQLAlchemy**.
*   **DICOM Standards:**
    *   **WADO-RS:** Well-implemented (`app/api/wado.py`) supporting retrieval of studies, series, instances, frames, and metadata.
    *   **DICOM SCP:** Basic `dicom_scp_daemon.py` exists for receiving images, but needs verification for concurrency and error handling.
    *   **QIDO-RS / STOW-RS:** Partial implementation via `dicom_query` and `dicom_upload`. Full standard compliance needs verification.
*   **Data Storage:** Currently relies on local file system. Production systems typically require Object Storage (S3/MinIO) for scalability.
*   **Integration:** **HL7 Integration** implemented (Mock/Service layer) with Dashboard and Configuration UI. **MWL SCP** configuration and service layer implemented.
*   **Security:** JWT-based authentication and Role-Based Access Control (RBAC) are present.

### 1.2 Frontend (`src`)
*   **Architecture:** **React** + **Vite** SPA. Modular component structure.
*   **Viewer:** `DicomViewerEnhanced` utilizes **Cornerstone3D**.
    *   **Current Features:** Window/Level, Pan, Zoom, Scroll, basic measurements (Length, Angle, ROI, Cobb). **Structured Reporting (SR)** display supported via `SRViewport`.
    *   **Missing High-End Features:** Multiplanar Reconstruction (MPR), 3D Volume Rendering, Fusion, Hanging Protocols.
*   **State Management:** React Context and Hooks (`useAuth`, `useViewportTools`).
*   **Performance:** Lazy loading implemented for routes.

---

## 2. Feature Roadmap for Production Readiness

To meet industry standards (IHE, DICOM, HIPAA) and compete with commercial PACS, the following features are recommended:

### Phase 1: Core Compliance & Stability (The Foundation)
1.  **Robust DICOM SCP/SCU:**
    *   Ensure `dicom_scp_daemon` handles concurrent associations (C-STORE).
    *   Implement C-MOVE SCU to retrieve studies from other nodes.
    *   **Feature:** "DICOM Node Management" UI to configure external PACS/Modalities.
2.  **Full DICOMweb Support:**
    *   Verify full **QIDO-RS** (Query) compliance for advanced filtering.
    *   Verify **STOW-RS** (Store) for web-based uploads.
3.  **Scalable Storage Adapter:**
    *   Abstract storage layer to support **S3 / MinIO / Azure Blob**.
    *   **Feature:** "Storage Lifecycle Management" (Archiving/Tiering).
4.  **Audit Trails (HIPAA/GDPR):**
    *   Comprehensive logging of *who* accessed *what* PHI and *when*.
    *   **Feature:** "Audit Log Viewer" for compliance officers.

### Phase 2: Clinical Workflow & Integration (The Ecosystem) - **COMPLETE**
5.  **HL7 Integration (RIS/HIS):** ✅
    *   Implement MLLP Listener for HL7 messages.
    *   **ORM (Order Entry):** Create worklist items from HIS orders.
    *   **ORU (Results):** Send reports back to HIS.
6.  **Modality Worklist (MWL) SCP:** ✅
    *   Ensure modalities can query the PACS for patient/study details to automate data entry.
7.  **Structured Reporting (SR):** ✅
    *   Support DICOM SR storage and display.
    *   **Feature:** "Report Editor" with templates and auto-population from DICOM tags.

### Phase 3: Advanced Visualization (The "Wow" Factor)
8.  **Multiplanar Reconstruction (MPR):**
    *   View Coronal/Sagittal planes from Axial data in real-time.
9.  **3D Volume Rendering:**
    *   Cinematic rendering, MIP (Maximum Intensity Projection), VR (Volume Rendering).
10. **Hanging Protocols:**
    *   Auto-arrange viewports based on study description (e.g., "Chest X-Ray" = 1x1, "CT Abdomen" = 2x2 + MPR).
11. **Key Image Notes (KIN) & Presentation States (GSPS):**
    *   Save windowing, zoom, and annotations permanently as DICOM objects.

### Phase 4: Enterprise Features
12. **Anonymization Service:**
    *   Export studies with PHI removed for research/teaching.
13. **Patient Portal:**
    *   Secure, limited access for patients to view their own images.
14. **AI Integration Pipeline:**
    *   Hooks to send images to AI models and receive secondary capture overlays/SR.
