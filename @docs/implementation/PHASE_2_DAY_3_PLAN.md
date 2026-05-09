# Phase 2 Day 3: DICOM Communication Services

**Date**: November 16, 2025  
**Status**: Starting  
**Complexity**: Very High  
**Priority**: CRITICAL

---

## 🎯 Goal

Implement DICOM network communication for receiving and sending DICOM images between PACS and modalities.

---

## 📊 Implementation Plan

### Stage 1: Foundation (1-2 hours)
**Setup**:
- Install pynetdicom
- Create DICOM node model
- Basic configuration

**Deliverables**:
- Database schema for DICOM nodes
- Python models
- Configuration management

### Stage 2: DICOM SCP (2-3 hours)
**C-STORE SCP**:
- Receive images from modalities
- Validate DICOM
- Store to database
- Send C-STORE response

**C-ECHO SCP**:
- Connection testing
- Verification service

**Deliverables**:
- DICOM daemon service
- C-STORE handler
- C-ECHO handler

### Stage 3: DICOM SCU (2-3 hours)
**C-FIND SCU**:
- Query studies/series/instances
- Patient/Study/Series level queries

**C-MOVE SCU**:
- Retrieve images from remote PACS
- Send images to modalities

**Deliverables**:
- C-FIND client
- C-MOVE client
- Query/Retrieve service

### Stage 4: Node Management (1-2 hours)
**Features**:
- Add/Edit/Delete DICOM nodes
- Test connections (C-ECHO)
- Monitor status
- Configuration UI

**Deliverables**:
- Node management API
- Frontend UI (basic)
- Testing tools

---

## 🏗️ Architecture

```
Modality (CT/MRI/XR)
        ↓ C-STORE
DICOM SCP Daemon (Port 11112)
        ↓
  Store Handler
        ↓
  DICOM Storage Service
        ↓
    Database
```

```
Frontend/API
        ↓
  DICOM SCU Client
        ↓ C-FIND/C-MOVE
Remote PACS/Modality
```

---

## 📦 Dependencies

```bash
pip install pynetdicom
```

**pynetdicom** provides:
- DICOM SCP (server)
- DICOM SCU (client)
- C-STORE, C-FIND, C-MOVE, C-ECHO
- Association management

---

## 🎯 Success Criteria

### Stage 1 Complete When:
- ✅ pynetdicom installed
- ✅ DICOM node model created
- ✅ Configuration system ready

### Stage 2 Complete When:
- ✅ DICOM daemon running
- ✅ Can receive C-STORE from modality
- ✅ Images stored to database
- ✅ C-ECHO responds

### Stage 3 Complete When:
- ✅ Can query remote PACS (C-FIND)
- ✅ Can retrieve images (C-MOVE)
- ✅ Can send images to modality

### Stage 4 Complete When:
- ✅ Can manage DICOM nodes via API
- ✅ Can test connections
- ✅ Status monitoring working

---

## 🚀 Let's Start!

**First**: Install pynetdicom and create foundation

---

**Document Version**: 1.0  
**Created**: November 16, 2025  
**Status**: Planning Complete - Ready to Implement
