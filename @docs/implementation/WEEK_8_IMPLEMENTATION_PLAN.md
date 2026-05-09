# Week 8 Implementation Plan - Phase 1 Completion
**Date**: 2025-12-29  
**Goal**: Complete Phase 1 to 95% - Backend Integration & PDF Export  
**Duration**: 5-7 days

---

## Overview

### Completed (Week 1-7)
- ✅ Layout & Navigation System (100%)
- ✅ Study List Enhancement (100%)
- ✅ DICOM Viewer with Cornerstone.js (90%)
- ✅ Reporting Interface (85%)
- ✅ Digital Signature System (95%)
- ✅ **DICOM Tag Editing (100%)** ← Just completed!

### This Week's Goals
1. **Report Backend Integration** (Priority: HIGH)
2. **PDF Export Implementation** (Priority: HIGH)
3. **Viewer Tool Completion** (Priority: MEDIUM)
4. **Performance Optimization** (Priority: MEDIUM)

---

## Day 1-2: Report Backend Integration

### Goal
Connect reporting system to backend API for persistent storage

### Tasks

#### 1. Create Report API Endpoints (Backend)
**File**: `pacs-service/app/api/reports.py`

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from ..database import get_db
from ..models.report import Report
from ..schemas.report import ReportCreate, ReportUpdate, ReportResponse

router = APIRouter(prefix="/api/reports", tags=["reports"])

@router.post("/", response_model=ReportResponse)
async def create_report(
    report: ReportCreate,
    db: Session = Depends(get_db)
):
    """Create new report"""
    db_report = Report(**report.dict())
    db.add(db_report)
    db.commit()
    db.refresh(db_report)
    return db_report

@router.get("/{report_id}", response_model=ReportResponse)
async def get_report(report_id: str, db: Session = Depends(get_db)):
    """Get report by ID"""
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return report

@router.put("/{report_id}", response_model=ReportResponse)
async def update_report(
    report_id: str,
    report: ReportUpdate,
    db: Session = Depends(get_db)
):
    """Update report"""
    db_report = db.query(Report).filter(Report.id == report_id).first()
    if not db_report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    for key, value in report.dict(exclude_unset=True).items():
        setattr(db_report, key, value)
    
    db.commit()
    db.refresh(db_report)
    return db_report

@router.get("/study/{study_id}", response_model=List[ReportResponse])
async def get_reports_by_study(study_id: str, db: Session = Depends(get_db)):
    """Get all reports for a study"""
    reports = db.query(Report).filter(Report.study_id == study_id).all()
    return reports

@router.delete("/{report_id}")
async def delete_report(report_id: str, db: Session = Depends(get_db)):
    """Delete report"""
    db_report = db.query(Report).filter(Report.id == report_id).first()
    if not db_report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    db.delete(db_report)
    db.commit()
    return {"message": "Report deleted successfully"}
```

#### 2. Create Report Models (Backend)
**File**: `pacs-service/app/models/report.py`

```python
from sqlalchemy import Column, String, Text, DateTime, JSON
from sqlalchemy.sql import func
from ..database import Base

class Report(Base):
    __tablename__ = "reports"

    id = Column(String, primary_key=True, index=True)
    study_id = Column(String, index=True, nullable=False)
    patient_id = Column(String, index=True)
    patient_name = Column(String)
    
    template_id = Column(String)
    template_name = Column(String)
    
    status = Column(String, default="draft")  # draft, preliminary, final
    
    # Report content
    findings = Column(Text)
    impression = Column(Text)
    recommendation = Column(Text)
    technique = Column(Text)
    comparison = Column(Text)
    clinical_history = Column(Text)
    
    # Metadata
    created_by = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    finalized_at = Column(DateTime(timezone=True))
    finalized_by = Column(String)
    
    # Signature
    signature_data = Column(JSON)  # Store signature info
    
    # Additional data
    metadata = Column(JSON)  # Store additional fields
```

#### 3. Create Report Service (Frontend)
**File**: `src/services/reportService.js`

```javascript
import { apiClient } from './http';

/**
 * Report Service
 * Handles report CRUD operations
 */

export const reportService = {
  /**
   * Create new report
   */
  async createReport(reportData) {
    try {
      const response = await apiClient.post('/reports', reportData);
      return response.data;
    } catch (error) {
      console.error('[ReportService] Create failed:', error);
      throw error;
    }
  },

  /**
   * Get report by ID
   */
  async getReport(reportId) {
    try {
      const response = await apiClient.get(`/reports/${reportId}`);
      return response.data;
    } catch (error) {
      console.error('[ReportService] Get failed:', error);
      throw error;
    }
  },

  /**
   * Update report
   */
  async updateReport(reportId, reportData) {
    try {
      const response = await apiClient.put(`/reports/${reportId}`, reportData);
      return response.data;
    } catch (error) {
      console.error('[ReportService] Update failed:', error);
      throw error;
    }
  },

  /**
   * Get reports by study ID
   */
  async getReportsByStudy(studyId) {
    try {
      const response = await apiClient.get(`/reports/study/${studyId}`);
      return response.data;
    } catch (error) {
      console.error('[ReportService] Get by study failed:', error);
      throw error;
    }
  },

  /**
   * Delete report
   */
  async deleteReport(reportId) {
    try {
      await apiClient.delete(`/reports/${reportId}`);
    } catch (error) {
      console.error('[ReportService] Delete failed:', error);
      throw error;
    }
  },

  /**
   * Finalize report
   */
  async finalizeReport(reportId, signatureData) {
    try {
      const response = await apiClient.put(`/reports/${reportId}`, {
        status: 'final',
        finalized_at: new Date().toISOString(),
        signature_data: signatureData
      });
      return response.data;
    } catch (error) {
      console.error('[ReportService] Finalize failed:', error);
      throw error;
    }
  }
};

export default reportService;
```

#### 4. Update ReportEditor to Use Backend
**File**: `src/pages/reporting/ReportEditor.jsx` (Update)

Add backend integration:
```javascript
import reportService from '../../services/reportService';

// In ReportEditor component:
const handleSave = async () => {
  try {
    setSaving(true);
    
    const reportData = {
      id: reportId || `report_${Date.now()}`,
      study_id: studyId,
      patient_id: study.patientId,
      patient_name: study.patientName,
      template_id: selectedTemplate.id,
      template_name: selectedTemplate.name,
      status: reportStatus,
      findings: reportContent.findings,
      impression: reportContent.impression,
      recommendation: reportContent.recommendation,
      technique: reportContent.technique,
      comparison: reportContent.comparison,
      clinical_history: reportContent.clinicalHistory,
      created_by: 'current_user', // Get from auth context
      metadata: {
        modality: study.modality,
        study_date: study.studyDate
      }
    };

    if (reportId) {
      await reportService.updateReport(reportId, reportData);
    } else {
      const newReport = await reportService.createReport(reportData);
      setReportId(newReport.id);
    }

    alert('Report saved successfully!');
  } catch (error) {
    console.error('Failed to save report:', error);
    alert('Failed to save report. Please try again.');
  } finally {
    setSaving(false);
  }
};
```

---

## Day 3-4: PDF Export Implementation

### Goal
Generate professional PDF reports with QR code signatures

### Tasks

#### 1. Install jsPDF
```bash
npm install jspdf jspdf-autotable
```

#### 2. Create PDF Generator Service
**File**: `src/services/pdfGenerator.js`

```javascript
import jsPDF from 'jspdf';
import 'jspdf-autotable';

/**
 * PDF Generator Service
 * Generate professional medical reports as PDF
 */

export const generateReportPDF = (reportData, signatureData = null) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  let yPos = margin;

  // Helper function to add text
  const addText = (text, fontSize = 10, isBold = false) => {
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
    doc.text(text, margin, yPos);
    yPos += fontSize * 0.5;
  };

  // Helper function to check page break
  const checkPageBreak = (requiredSpace = 20) => {
    if (yPos + requiredSpace > pageHeight - margin) {
      doc.addPage();
      yPos = margin;
      return true;
    }
    return false;
  };

  // Header
  doc.setFillColor(41, 128, 185);
  doc.rect(0, 0, pageWidth, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('RADIOLOGY REPORT', pageWidth / 2, 20, { align: 'center' });
  
  yPos = 40;
  doc.setTextColor(0, 0, 0);

  // Patient Information Table
  doc.autoTable({
    startY: yPos,
    head: [['Patient Information', '']],
    body: [
      ['Patient Name', reportData.patientName || 'N/A'],
      ['Patient ID', reportData.patientId || 'N/A'],
      ['Date of Birth', reportData.patientDob || 'N/A'],
      ['Gender', reportData.patientSex || 'N/A'],
      ['Study Date', reportData.studyDate || 'N/A'],
      ['Modality', reportData.modality || 'N/A'],
      ['Accession Number', reportData.accessionNumber || 'N/A']
    ],
    theme: 'grid',
    headStyles: { fillColor: [52, 73, 94], textColor: 255 },
    margin: { left: margin, right: margin }
  });

  yPos = doc.lastAutoTable.finalY + 10;

  // Clinical History
  if (reportData.clinicalHistory) {
    checkPageBreak(30);
    addText('CLINICAL HISTORY:', 12, true);
    yPos += 5;
    doc.setFontSize(10);
    const historyLines = doc.splitTextToSize(
      reportData.clinicalHistory,
      pageWidth - 2 * margin
    );
    doc.text(historyLines, margin, yPos);
    yPos += historyLines.length * 5 + 10;
  }

  // Technique
  if (reportData.technique) {
    checkPageBreak(30);
    addText('TECHNIQUE:', 12, true);
    yPos += 5;
    doc.setFontSize(10);
    const techniqueLines = doc.splitTextToSize(
      reportData.technique,
      pageWidth - 2 * margin
    );
    doc.text(techniqueLines, margin, yPos);
    yPos += techniqueLines.length * 5 + 10;
  }

  // Comparison
  if (reportData.comparison) {
    checkPageBreak(30);
    addText('COMPARISON:', 12, true);
    yPos += 5;
    doc.setFontSize(10);
    const comparisonLines = doc.splitTextToSize(
      reportData.comparison,
      pageWidth - 2 * margin
    );
    doc.text(comparisonLines, margin, yPos);
    yPos += comparisonLines.length * 5 + 10;
  }

  // Findings
  if (reportData.findings) {
    checkPageBreak(30);
    addText('FINDINGS:', 12, true);
    yPos += 5;
    doc.setFontSize(10);
    const findingsLines = doc.splitTextToSize(
      reportData.findings,
      pageWidth - 2 * margin
    );
    doc.text(findingsLines, margin, yPos);
    yPos += findingsLines.length * 5 + 10;
  }

  // Impression
  if (reportData.impression) {
    checkPageBreak(30);
    addText('IMPRESSION:', 12, true);
    yPos += 5;
    doc.setFontSize(10);
    const impressionLines = doc.splitTextToSize(
      reportData.impression,
      pageWidth - 2 * margin
    );
    doc.text(impressionLines, margin, yPos);
    yPos += impressionLines.length * 5 + 10;
  }

  // Recommendation
  if (reportData.recommendation) {
    checkPageBreak(30);
    addText('RECOMMENDATION:', 12, true);
    yPos += 5;
    doc.setFontSize(10);
    const recommendationLines = doc.splitTextToSize(
      reportData.recommendation,
      pageWidth - 2 * margin
    );
    doc.text(recommendationLines, margin, yPos);
    yPos += recommendationLines.length * 5 + 10;
  }

  // Signature Section
  checkPageBreak(60);
  yPos += 10;
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 10;

  // Signature Info
  doc.setFontSize(10);
  doc.text(`Report Date: ${new Date().toLocaleDateString()}`, margin, yPos);
  yPos += 7;
  doc.text(`Radiologist: ${reportData.radiologist || 'Dr. Radiologist'}`, margin, yPos);
  yPos += 7;
  doc.text(`Status: ${reportData.status?.toUpperCase() || 'DRAFT'}`, margin, yPos);

  // Add QR Code if signature exists
  if (signatureData && signatureData.qrCode) {
    const qrSize = 40;
    const qrX = pageWidth - margin - qrSize;
    const qrY = yPos - 20;
    
    try {
      doc.addImage(signatureData.qrCode, 'PNG', qrX, qrY, qrSize, qrSize);
      doc.setFontSize(8);
      doc.text('Scan to verify', qrX + qrSize / 2, qrY + qrSize + 5, { align: 'center' });
    } catch (error) {
      console.error('Failed to add QR code to PDF:', error);
    }
  }

  // Add signature image if exists
  if (signatureData && signatureData.signatureImage) {
    yPos += 10;
    try {
      doc.addImage(signatureData.signatureImage, 'PNG', margin, yPos, 60, 20);
      yPos += 25;
      doc.setFontSize(8);
      doc.text('Digital Signature', margin, yPos);
    } catch (error) {
      console.error('Failed to add signature to PDF:', error);
    }
  }

  // Footer
  const footerY = pageHeight - 10;
  doc.setFontSize(8);
  doc.setTextColor(128, 128, 128);
  doc.text(
    `Generated on ${new Date().toLocaleString()}`,
    pageWidth / 2,
    footerY,
    { align: 'center' }
  );

  return doc;
};

/**
 * Download report as PDF
 */
export const downloadReportPDF = (reportData, signatureData = null, filename = null) => {
  const doc = generateReportPDF(reportData, signatureData);
  const pdfFilename = filename || `report_${reportData.patientId}_${Date.now()}.pdf`;
  doc.save(pdfFilename);
};

/**
 * Get PDF as blob
 */
export const getReportPDFBlob = (reportData, signatureData = null) => {
  const doc = generateReportPDF(reportData, signatureData);
  return doc.output('blob');
};

export default {
  generateReportPDF,
  downloadReportPDF,
  getReportPDFBlob
};
```

#### 3. Add PDF Export to ReportEditor
**File**: `src/pages/reporting/ReportEditor.jsx` (Update)

```javascript
import { downloadReportPDF } from '../../services/pdfGenerator';

// Add export handler
const handleExportPDF = () => {
  try {
    const reportData = {
      patientName: study.patientName,
      patientId: study.patientId,
      patientDob: study.patientDob,
      patientSex: study.patientSex,
      studyDate: study.studyDate,
      modality: study.modality,
      accessionNumber: study.accessionNumber,
      clinicalHistory: reportContent.clinicalHistory,
      technique: reportContent.technique,
      comparison: reportContent.comparison,
      findings: reportContent.findings,
      impression: reportContent.impression,
      recommendation: reportContent.recommendation,
      radiologist: 'Dr. Radiologist', // Get from auth
      status: reportStatus
    };

    // Include signature if exists
    const signatureData = signature ? {
      qrCode: signature.qrCode,
      signatureImage: signature.signatureImage
    } : null;

    downloadReportPDF(reportData, signatureData);
  } catch (error) {
    console.error('Failed to export PDF:', error);
    alert('Failed to export PDF. Please try again.');
  }
};

// Add button to UI
<button
  onClick={handleExportPDF}
  className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
>
  Export PDF
</button>
```

---

## Day 5: Viewer Tool Completion

### Goal
Complete remaining viewer tools (Pan, Measurement persistence)

### Tasks

#### 1. Implement Pan Tool
**File**: `src/pages/viewer/DicomViewerEnhanced.jsx` (Update)

```javascript
// Add pan tool handler
const handlePan = () => {
  if (!enabledElement) return;
  
  const PanTool = cornerstoneTools.PanTool;
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.setToolActive('Pan', { mouseButtonMask: 1 });
  setActiveTool('pan');
};
```

#### 2. Implement Measurement Persistence
**File**: `src/services/measurementService.js` (New)

```javascript
/**
 * Measurement Service
 * Save and load measurements for studies
 */

export const measurementService = {
  /**
   * Save measurements for a study
   */
  saveMeasurements(studyId, measurements) {
    const key = `measurements_${studyId}`;
    localStorage.setItem(key, JSON.stringify(measurements));
  },

  /**
   * Load measurements for a study
   */
  loadMeasurements(studyId) {
    const key = `measurements_${studyId}`;
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  },

  /**
   * Clear measurements for a study
   */
  clearMeasurements(studyId) {
    const key = `measurements_${studyId}`;
    localStorage.removeItem(key);
  }
};
```

---

## Day 6-7: Performance Optimization & Testing

### Goal
Optimize performance and fix bugs

### Tasks

#### 1. Image Caching Strategy
- Implement LRU cache for DICOM images
- Preload adjacent series
- Clear cache on memory pressure

#### 2. Virtual Scrolling Optimization
- Optimize study list rendering
- Reduce re-renders
- Implement windowing

#### 3. Memory Management
- Clear unused Cornerstone viewports
- Dispose image loaders properly
- Monitor memory usage

#### 4. Testing
- Cross-browser testing
- Mobile responsiveness
- Error handling
- User acceptance testing

---

## Success Criteria

### Phase 1 Complete When:
- ✅ Reports saved to backend
- ✅ PDF export working with QR codes
- ✅ All viewer tools functional
- ✅ Performance optimized
- ✅ No critical bugs
- ✅ User acceptance passed

---

## Next Steps After Week 8

### Week 9: Polish & User Preferences
1. User settings page
2. Viewer preferences
3. Report preferences
4. Theme customization

### Week 10+: Phase 2 - Core PACS Features
1. DICOM Storage & Archive
2. DICOM Communication Services
3. Study Distribution & Routing

---

**Let's complete Phase 1! 🚀**
