# DICOM Tag Limits Quick Reference

## Commonly Edited Tags

### Patient Information
```
Patient Name (0010,0010)        → Max 256 chars (AWS limit)
Patient ID (0010,0020)          → Max 256 chars (AWS limit)
Patient Birth Date (0010,0030)  → Max 18 chars (AWS limit)
Patient Sex (0010,0040)         → Max 16 chars
```

### Study Information
```
Accession Number (0008,0050)    → Max 256 chars (AWS limit) ✅
Study ID (0020,0010)            → Max 256 chars (AWS limit)
Study Description (0008,1030)   → Max 256 chars (AWS limit)
Study Date (0008,0020)          → Max 18 chars (AWS limit)
Study Time (0008,0030)          → Max 28 chars (AWS limit)
Study Instance UID (0020,000D)  → Max 256 chars (AWS limit)
```

### Series Information
```
Series Description (0008,103E)  → Max 64 chars
Series Instance UID (0020,000E) → Max 256 chars (AWS limit)
Modality (0008,0060)            → Max 16 chars
```

### Other
```
Referring Physician (0008,0090)  → Max 64 chars (PN type)
```

## Validation Logic

1. **Tag-Specific Limit** (if defined) - AWS HealthImaging compatible
2. **VR Type Limit** (fallback) - DICOM standard
3. **Allocated Space** (file-specific) - Physical space in file

**Effective Max = MIN(Tag Limit, Allocated Space)**

## Error Scenarios

### Scenario 1: Value exceeds practical limit
```
Accession Number: 257 characters
❌ Error: "Value exceeds practical limit! Practical Max: 256 characters"
```

### Scenario 2: Value exceeds allocated space
```
Accession Number: 100 characters (but only 50 bytes allocated)
⚠️ Options: Truncate to 50 chars OR Export as new file
```

### Scenario 3: Value fits perfectly
```
Accession Number: 100 characters (256 bytes allocated)
✅ Success: Value saved in-place
```

## References
- AWS HealthImaging: https://docs.aws.amazon.com/healthimaging/latest/APIReference/API_DICOMTags.html
- DICOM Standard: https://dicom.innolitics.com/ciods/enhanced-sr/general-study
