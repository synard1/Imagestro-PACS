# Phase 2 Day 3: Stage 3 - DICOM SCU (Query/Retrieve)

**Date**: November 16, 2025  
**Status**: Ready to Start  
**Complexity**: Medium  
**Priority**: HIGH

---

## 🎯 Goal

Implement DICOM SCU (Service Class User) for querying and retrieving images from remote PACS/modalities.

---

## 📊 Implementation Plan

### Stage 3.1: C-FIND (Query) - 1 hour

**Features**:
- Query remote PACS by Patient ID, Study UID, etc.
- Support all query levels (Patient, Study, Series, Instance)
- Return matching results

**Deliverables**:
- `dicom_find.py` - C-FIND client service
- Query API endpoints
- Test scripts

### Stage 3.2: C-MOVE (Retrieve) - 1 hour

**Features**:
- Retrieve images from remote PACS
- Send to local SCP or other destination
- Track transfer status

**Deliverables**:
- `dicom_move.py` - C-MOVE client service
- Retrieve API endpoints
- Test scripts

### Stage 3.3: Integration & Testing - 1 hour

**Features**:
- API integration
- Test with Orthanc or other PACS
- Documentation

**Deliverables**:
- Complete Q/R API
- Test suite
- Documentation

---

## 🏗️ Architecture

```
┌─────────────────┐
│   Frontend      │
│   (React UI)    │
└────────┬────────┘
         │ REST API
         ↓
┌─────────────────┐
│  DICOM SCU      │
│  (C-FIND/MOVE)  │
└────────┬────────┘
         │ DICOM Protocol
         ↓
┌─────────────────┐
│  Remote PACS    │
│  (Orthanc, etc) │
└────────┬────────┘
         │ C-MOVE
         ↓
┌─────────────────┐
│  Local SCP      │
│  (Our PACS)     │
└─────────────────┘
```

---

## 📦 Components to Build

### 1. C-FIND Service
```python
# app/services/dicom_find.py
class DicomFindService:
    def query_patients(self, remote_ae, patient_id=None)
    def query_studies(self, remote_ae, patient_id=None, study_uid=None)
    def query_series(self, remote_ae, study_uid)
    def query_instances(self, remote_ae, series_uid)
```

### 2. C-MOVE Service
```python
# app/services/dicom_move.py
class DicomMoveService:
    def move_study(self, remote_ae, study_uid, dest_ae)
    def move_series(self, remote_ae, series_uid, dest_ae)
    def move_instance(self, remote_ae, instance_uid, dest_ae)
```

### 3. API Endpoints
```python
# app/routers/dicom_query.py
POST /api/dicom/query/patients
POST /api/dicom/query/studies
POST /api/dicom/query/series
POST /api/dicom/retrieve/study
POST /api/dicom/retrieve/series
```

---

## 🧪 Testing Strategy

### Test 1: Query Orthanc
```bash
# Query studies from Orthanc
curl -X POST http://localhost:8003/api/dicom/query/studies \
  -H "Content-Type: application/json" \
  -d '{
    "remote_ae": "ORTHANC",
    "patient_id": "12345"
  }'
```

### Test 2: Retrieve Study
```bash
# Retrieve study from Orthanc to local PACS
curl -X POST http://localhost:8003/api/dicom/retrieve/study \
  -H "Content-Type: application/json" \
  -d '{
    "remote_ae": "ORTHANC",
    "study_uid": "1.2.826...",
    "destination_ae": "PACS_SCP"
  }'
```

---

## ✅ Success Criteria

### Stage 3.1 Complete When:
- ✅ Can query remote PACS (C-FIND)
- ✅ Returns patient list
- ✅ Returns study list
- ✅ Returns series list
- ✅ API endpoints working

### Stage 3.2 Complete When:
- ✅ Can retrieve studies (C-MOVE)
- ✅ Images transferred to local SCP
- ✅ Transfer status tracked
- ✅ API endpoints working

### Stage 3.3 Complete When:
- ✅ Full Q/R workflow tested
- ✅ Integration with SCP verified
- ✅ Documentation complete
- ✅ Production ready

---

## 🚀 Let's Start!

**Ready to implement Stage 3?**

Say "yes" or "lanjutkan stage 3" to begin!

---

**Document Version**: 1.0  
**Created**: November 16, 2025  
**Status**: Planning Complete - Ready to Implement
