# Report Types Refactoring - Multi-Type Report Settings

## Overview
Refactored report settings to support multiple report types with independent configurations for Medical, Statistical, Administrative, and Custom reports.

**Date**: 2025-12-29  
**Status**: ✅ Complete  
**Impact**: Breaking Change (Backward Compatible)

---

## Problem Statement

### Original Issue
- Single report settings for all report types
- "Confidential Medical Report" footer not appropriate for statistical reports
- "RADIOLOGY REPORT" title not suitable for administrative reports
- No flexibility for different report categories

### Use Cases
1. **Medical Reports**: Radiology reports with patient data (confidential)
2. **Statistical Reports**: Registration counts, statistics (no patient details)
3. **Administrative Reports**: Internal reports, summaries
4. **Custom Reports**: User-defined report types

---

## Solution

### Multi-Type Settings Architecture

```
Report Settings
├── Medical Reports
│   ├── Header (Blue, Medical Center logo)
│   ├── Footer ("Confidential Medical Report")
│   └── Report ("RADIOLOGY REPORT")
├── Statistical Reports
│   ├── Header (Green, same logo)
│   ├── Footer ("Internal Use Only")
│   └── Report ("STATISTICAL REPORT")
├── Administrative Reports
│   ├── Header (Purple, same logo)
│   ├── Footer ("Administrative Report")
│   └── Report ("ADMINISTRATIVE REPORT")
└── Custom Reports
    ├── Header (Slate, same logo)
    ├── Footer (customizable)
    └── Report ("REPORT")
```

---

## Implementation

### 1. Report Types Enum

```javascript
export const REPORT_TYPES = {
  MEDICAL: 'medical',
  STATISTICAL: 'statistical',
  ADMINISTRATIVE: 'administrative',
  CUSTOM: 'custom'
};
```

### 2. Default Settings by Type

```javascript
const DEFAULT_SETTINGS_BY_TYPE = {
  medical: {
    header: {
      backgroundColor: '#2980B9',  // Blue
      // ... other settings
    },
    footer: {
      leftText: 'Confidential Medical Report',
      // ... other settings
    },
    report: {
      title: 'RADIOLOGY REPORT',
      // ... other settings
    }
  },
  statistical: {
    header: {
      backgroundColor: '#16A34A',  // Green
      // ... other settings
    },
    footer: {
      leftText: 'Internal Use Only',
      centerText: 'Statistical Report',
      // ... other settings
    },
    report: {
      title: 'STATISTICAL REPORT',
      // ... other settings
    }
  },
  administrative: {
    header: {
      backgroundColor: '#7C3AED',  // Purple
      // ... other settings
    },
    footer: {
      leftText: 'Administrative Report',
      // ... other settings
    },
    report: {
      title: 'ADMINISTRATIVE REPORT',
      // ... other settings
    }
  },
  custom: {
    header: {
      backgroundColor: '#64748B',  // Slate
      // ... other settings
    },
    footer: {
      leftText: '',  // Empty, user customizable
      // ... other settings
    },
    report: {
      title: 'REPORT',
      // ... other settings
    }
  }
};
```

### 3. Updated API

#### Get Settings for Specific Type
```javascript
// Old API (single settings)
const settings = getReportSettings();

// New API (type-specific)
const medicalSettings = getReportSettings(REPORT_TYPES.MEDICAL);
const statisticalSettings = getReportSettings(REPORT_TYPES.STATISTICAL);
```

#### Save Settings for Specific Type
```javascript
// Old API
saveReportSettings(settings);

// New API
saveReportSettings(REPORT_TYPES.MEDICAL, settings);
saveReportSettings(REPORT_TYPES.STATISTICAL, settings);
```

#### Get All Settings
```javascript
// New API
const allSettings = getAllReportSettings();
// Returns: { medical: {...}, statistical: {...}, administrative: {...}, custom: {...} }
```

### 4. PDF Generator Integration

```javascript
// Generate PDF with specific report type
const doc = generateReportPDF(reportData, signatureData, REPORT_TYPES.MEDICAL);

// Download with specific type
downloadReportPDF(reportData, signatureData, filename, REPORT_TYPES.STATISTICAL);

// Preview with specific type
previewReportPDF(reportData, signatureData, REPORT_TYPES.ADMINISTRATIVE);
```

---

## UI Changes

### Report Settings Page

#### Tab Navigation
```
┌─────────────────────────────────────────────────────────┐
│  ← Report Settings                    [Export] [Import] │
│                                        [Reset]  [Save]   │
├─────────────────────────────────────────────────────────┤
│  [Medical Report] [Statistical Report] [Administrative] │
│  [Custom Report]                                         │
├─────────────────────────────────────────────────────────┤
│  ... settings for selected type ...                     │
└─────────────────────────────────────────────────────────┘
```

#### Features
- Tab-based navigation between report types
- Independent settings for each type
- Save button saves current type only
- Export/Import handles all types
- Reset resets current type to defaults

---

## Storage Structure

### localStorage Format

```json
{
  "medical": {
    "header": { ... },
    "footer": { ... },
    "report": { ... }
  },
  "statistical": {
    "header": { ... },
    "footer": { ... },
    "report": { ... }
  },
  "administrative": {
    "header": { ... },
    "footer": { ... },
    "report": { ... }
  },
  "custom": {
    "header": { ... },
    "footer": { ... },
    "report": { ... }
  }
}
```

---

## Migration Guide

### Backward Compatibility

The system is backward compatible. Old settings (single type) will be treated as medical report settings.

```javascript
// Old settings in localStorage
{
  "header": { ... },
  "footer": { ... },
  "report": { ... }
}

// Automatically migrated to
{
  "medical": {
    "header": { ... },
    "footer": { ... },
    "report": { ... }
  },
  "statistical": { ...defaults... },
  "administrative": { ...defaults... },
  "custom": { ...defaults... }
}
```

### Code Migration

#### Before (Single Type)
```javascript
// Get settings
const settings = getReportSettings();

// Generate PDF
const doc = generateReportPDF(reportData, signatureData);

// Download
downloadReportPDF(reportData, signatureData, filename);
```

#### After (Multi-Type)
```javascript
// Get settings for specific type
const settings = getReportSettings(REPORT_TYPES.MEDICAL);

// Generate PDF with type
const doc = generateReportPDF(reportData, signatureData, REPORT_TYPES.MEDICAL);

// Download with type
downloadReportPDF(reportData, signatureData, filename, REPORT_TYPES.MEDICAL);
```

#### Backward Compatible (Default to Medical)
```javascript
// Still works! Defaults to MEDICAL type
const settings = getReportSettings();
const doc = generateReportPDF(reportData, signatureData);
downloadReportPDF(reportData, signatureData, filename);
```

---

## Use Cases

### Use Case 1: Medical Radiology Report
```javascript
import { REPORT_TYPES } from './services/reportSettingsService';

const reportData = {
  patientName: 'John Doe',
  patientId: 'P12345',
  findings: '...',
  impression: '...'
};

// Use medical settings (blue header, confidential footer)
downloadReportPDF(reportData, signatureData, 'radiology-report.pdf', REPORT_TYPES.MEDICAL);
```

### Use Case 2: Statistical Registration Report
```javascript
const reportData = {
  title: 'Monthly Registration Statistics',
  period: 'January 2025',
  totalRegistrations: 1250,
  byModality: { CT: 450, MRI: 380, XR: 420 }
  // No patient details
};

// Use statistical settings (green header, "Internal Use Only" footer)
downloadReportPDF(reportData, null, 'registration-stats.pdf', REPORT_TYPES.STATISTICAL);
```

### Use Case 3: Administrative Summary
```javascript
const reportData = {
  title: 'Quarterly Performance Summary',
  quarter: 'Q4 2024',
  metrics: { ... }
};

// Use administrative settings (purple header, "Administrative Report" footer)
downloadReportPDF(reportData, null, 'quarterly-summary.pdf', REPORT_TYPES.ADMINISTRATIVE);
```

### Use Case 4: Custom Report
```javascript
const reportData = {
  title: 'Custom Analysis Report',
  content: '...'
};

// Use custom settings (user-defined)
downloadReportPDF(reportData, null, 'custom-report.pdf', REPORT_TYPES.CUSTOM);
```

---

## Benefits

### 1. Flexibility
- Different settings for different report types
- Appropriate headers/footers for each category
- Customizable per use case

### 2. Professionalism
- Medical reports look medical (blue, confidential)
- Statistical reports look analytical (green, internal)
- Administrative reports look official (purple)

### 3. Compliance
- Confidential marking only on medical reports
- Clear distinction between report types
- Appropriate disclaimers per category

### 4. Scalability
- Easy to add new report types
- Independent configuration
- No interference between types

---

## Testing

### Test Cases

#### Test 1: Switch Between Types
1. Open Report Settings
2. Configure Medical Report settings
3. Switch to Statistical Report tab
4. Verify different default settings
5. Configure Statistical Report
6. Save
7. Switch back to Medical Report
8. Verify Medical settings unchanged

#### Test 2: PDF Generation
1. Generate medical report PDF
2. Verify blue header, "Confidential" footer
3. Generate statistical report PDF
4. Verify green header, "Internal Use Only" footer
5. Generate administrative report PDF
6. Verify purple header, "Administrative" footer

#### Test 3: Export/Import
1. Configure all report types
2. Export settings
3. Reset all to defaults
4. Import settings
5. Verify all types restored correctly

#### Test 4: Backward Compatibility
1. Clear localStorage
2. Set old format settings
3. Load page
4. Verify migrated to new format
5. Verify medical type has old settings
6. Verify other types have defaults

---

## Files Modified

### Services
- `src/services/reportSettingsService.js` - Added multi-type support
- `src/services/pdfGenerator.js` - Added reportType parameter

### Pages
- `src/pages/settings/ReportSettings.jsx` - Added tab navigation

### Documentation
- `REPORT_TYPES_REFACTORING.md` - This file

---

## API Reference

### reportSettingsService.js

#### Constants
```javascript
export const REPORT_TYPES = {
  MEDICAL: 'medical',
  STATISTICAL: 'statistical',
  ADMINISTRATIVE: 'administrative',
  CUSTOM: 'custom'
};
```

#### Functions

**getReportSettings(reportType)**
- Get settings for specific report type
- Default: REPORT_TYPES.MEDICAL
- Returns: Settings object

**getAllReportSettings()**
- Get settings for all report types
- Returns: Object with all types

**saveReportSettings(reportType, settings)**
- Save settings for specific type
- Returns: { success: boolean }

**saveAllReportSettings(allSettings)**
- Save settings for all types
- Returns: { success: boolean }

### pdfGenerator.js

**generateReportPDF(reportData, signatureData, reportType)**
- Generate PDF with specific report type settings
- Default reportType: REPORT_TYPES.MEDICAL
- Returns: jsPDF document

**downloadReportPDF(reportData, signatureData, filename, reportType)**
- Download PDF with specific report type
- Default reportType: REPORT_TYPES.MEDICAL
- Returns: { success: boolean, filename: string }

**previewReportPDF(reportData, signatureData, reportType)**
- Preview PDF with specific report type
- Default reportType: REPORT_TYPES.MEDICAL
- Returns: { success: boolean }

---

## Future Enhancements

### Planned
- [ ] User-defined custom report types
- [ ] Report type templates
- [ ] Bulk configuration
- [ ] Report type inheritance
- [ ] Conditional settings based on data

### Nice to Have
- [ ] Report type icons
- [ ] Color themes per type
- [ ] Report type descriptions
- [ ] Usage statistics per type
- [ ] Report type permissions

---

## Troubleshooting

### Issue: Settings not saving for specific type
**Solution**: Ensure you're calling `saveReportSettings(type, settings)` with correct type

### Issue: Wrong settings applied to PDF
**Solution**: Pass correct reportType to `generateReportPDF()`

### Issue: Old settings lost after update
**Solution**: Settings are automatically migrated. Check localStorage for `pacs_report_settings`

---

## Summary

✅ **Completed**:
- Multi-type report settings
- Independent configuration per type
- Tab-based UI navigation
- Backward compatibility
- PDF generator integration
- Complete documentation

🎯 **Impact**:
- More flexible report system
- Appropriate settings per report category
- Better compliance and professionalism
- Scalable architecture

---

**Status**: Production Ready ✅  
**Last Updated**: 2025-12-29  
**Breaking Changes**: None (Backward Compatible)
