# MWL-PACS System - SaaS Service Tier Features

This document outlines the feature grouping for the MWL-PACS system organized into three SaaS service tiers. All tiers include core PACS functionality (DICOM, studies, modality worklist) as foundational components.

## Tier 1: Basic PACS - Essential Package

Suitable for small clinics or departments requiring fundamental PACS capabilities.

### Core PACS Features (Included in all tiers)
- ✅ DICOM Image Storage (Studies/Series/Instances)
- ✅ DICOM Communication (C-STORE, C-ECHO)
- ✅ Modality Worklist (MWL) Support
- ⚠️ Basic Viewer (DICOM viewing capabilities) - Partially implemented
- ✅ Patient Management
- ✅ Study Management
- ⚠️ Basic Query/Retrieve (QIDO-RS, WADO-RS) - Partially implemented

### Additional Tier 1 Features
- ✅ Simple file upload/download
- ✅ Basic reporting system
- ✅ User authentication & RBAC
- ✅ Basic audit logging
- ⚠️ Local storage management - Limited implementation
- ✅ Worklist management

## Tier 2: Professional PACS - Standard Package

Designed for medium-sized healthcare facilities requiring advanced PACS functionality.

### All Tier 1 features plus:
- ⏳ Advanced DICOM Communication (C-FIND, C-MOVE) - In development
- ✅ DICOM Node Management (multiple modalities/PACS connections)
- ⚠️ Enhanced Viewer with measurement tools - Partially implemented
- ⏳ STOW-RS (Store transactions) - In development
- ⏳ Storage tiering (hot/warm/cold storage) - Planned
- ⏳ S3/MinIO storage adapters - In development
- ✅ Basic monitoring & health checks
- ⏳ Structured Reporting (SR) support - Planned
- ✅ HL7 Integration (ORM/ORU)
- ⏳ Backup & restore capabilities - In development
- ✅ Image compression & optimization
- ⏳ Basic analytics - Planned

## Tier 3: Enterprise PACS - Premium Package

Comprehensive PACS capabilities for large healthcare systems and enterprise deployments.

### All Tier 1 & 2 features plus:
- ⏳ Advanced Viewer (MPR, 3D rendering, fusion) - Planned
- ⏳ AI/ML Integration pipeline - Planned
- ⏳ Advanced analytics & dashboards - Planned
- ⏳ Multi-factor authentication - Planned
- ⏳ End-to-end encryption - Planned
- ⏳ HIPAA/GDPR compliance tools - Planned
- ⏳ Automated alerting & monitoring - Planned
- ⏳ Load balancing & auto-scaling - Planned
- ⏳ CDN integration - Planned
- ⏳ Anonymization services - Planned
- ⏳ Patient portal - Planned
- ⏳ Enterprise integrations (EHR/EMR) - Planned
- ⏳ Advanced backup strategies - Planned
- ⏳ Usage analytics & cost optimization - Planned
- ⏳ Workflow optimization tools - Planned

## Legend
- ✅ Available/Implemented
- ⚠️ Partially implemented
- ⏳ In development/Planned