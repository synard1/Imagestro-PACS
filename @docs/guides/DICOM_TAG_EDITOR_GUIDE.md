# DICOM Tag Editor Guide

## Overview
DICOM Tag Viewer & Editor memungkinkan user untuk melihat, mengedit, dan export DICOM metadata.

## Features

### 1. View DICOM Tags
- Menampilkan semua DICOM tags dalam format table
- Tag, Name, VR (Value Representation), Value, Length
- Search functionality untuk filter tags
- Sortir berdasarkan tag number

### 2. Edit DICOM Tags
- Edit mode untuk mengubah tag values
- Hanya tags tertentu yang bisa diedit (patient info, descriptions)
- UIDs dan pixel data tidak bisa diubah (protected)
- Visual indicator untuk tags yang sudah diedit

### 3. Save/Export Options
- **Update in Storage**: Update file di localStorage
- **Export as New File**: Download file baru dengan tags yang sudah diedit
- **Export Tags as JSON**: Export metadata sebagai JSON file

## Editable Tags

Tags yang bisa diedit:
- ✅ Patient Name (0010,0010)
- ✅ Patient ID (0010,0020)
- ✅ Patient Birth Date (0010,0030)
- ✅ Patient Sex (0010,0040)
- ✅ Accession Number (0008,0050)
- ✅ Study Description (0008,1030)
- ✅ Series Description (0008,103E)
- ✅ Referring Physician Name (0008,0090)
- ✅ Study ID (0020,0010)

Tags yang TIDAK bisa diedit:
- ❌ Study Instance UID
- ❌ Series Instance UID
- ❌ SOP Instance UID
- ❌ Pixel Data
- ❌ Image dimensions (Rows, Columns)
- ❌ Transfer Syntax

## How to Use

### Access Tag Viewer

1. **From Study Details**:
   ```
   Studies → Click Study → View Tags button
   ```

2. **From Viewer** (future):
   ```
   Viewer → Tools → View DICOM Tags
   ```

### View Tags

1. Click "View Tags" button
2. Modal opens showing all DICOM tags
3. Use search box to filter tags
4. Scroll through table to see all metadata

### Edit Tags

1. Click "Edit Mode" button
2. Click "Edit" on any editable tag
3. Enter new value in prompt
4. Tag value updates in table
5. Edited tags highlighted in orange
6. Click "Save Changes" when done

### Save Options

**Option 1: Update in Storage**
- Replaces original file in localStorage
- Changes persist across sessions
- Original file is overwritten

**Option 2: Export as New File**
- Downloads modified DICOM file
- Original file unchanged
- Can specify custom filename

**Option 3: Export Tags as JSON**
- Click "Export" button
- Downloads JSON file with all tags
- Useful for documentation/backup

## Technical Details

### Tag Parsing

Uses `dicom-parser` library:
```javascript
import dicomParser from 'dicom-parser';

const dataSet = dicomParser.parseDicom(byteArray);
const patientName = dataSet.string('x00100010');
```

### Tag Editing

Modifies DICOM file in-place:
```javascript
// Get tag element
const element = dataSet.elements['x00100010'];

// Convert new value to bytes
const valueBytes = new TextEncoder().encode(newValue);

// Overwrite at data offset
for (let i = 0; i < valueBytes.length; i++) {
  modifiedBytes[element.dataOffset + i] = valueBytes[i];
}
```

### Storage Update

Updates localStorage:
```javascript
const files = JSON.parse(localStorage.getItem('pacs_files'));
files[fileIndex].base64Data = modifiedBase64;
localStorage.setItem('pacs_files', JSON.stringify(files));
```

## Use Cases

### 1. Anonymization
```
Edit Mode → Change Patient Name → "Anonymous"
Edit Mode → Change Patient ID → "ANON001"
Save → Export as New File → "anonymized.dcm"
```

### 2. Correction
```
Edit Mode → Fix Patient Name typo
Edit Mode → Update Study Description
Save → Update in Storage
```

### 3. Documentation
```
View Tags → Export → Save as JSON
Use JSON for documentation/records
```

### 4. Quality Control
```
View Tags → Check metadata completeness
Verify all required tags present
Check for data quality issues
```

## Limitations

### 1. Value Length
- New value must fit in existing space
- If too long, edit is skipped
- Padded with spaces if shorter

### 2. VR Constraints
- Must match Value Representation type
- String values only (no binary editing)
- Date format must be YYYYMMDD

### 3. Storage Limits
- localStorage ~10MB limit
- Large files may fail to update
- Consider export instead of update

### 4. DICOM Compliance
- Modified files may not be fully compliant
- Test with DICOM validator
- Some viewers may reject modified files

## Best Practices

### 1. Backup First
```
Before editing:
1. Export original as backup
2. Make edits
3. Test modified file
4. Keep both versions
```

### 2. Validate Changes
```
After editing:
1. View tags again
2. Verify changes applied
3. Test in viewer
4. Check file integrity
```

### 3. Document Changes
```
1. Export tags as JSON before edit
2. Export tags as JSON after edit
3. Keep change log
4. Note reason for changes
```

### 4. Test Compatibility
```
1. Export modified file
2. Test in external viewer
3. Verify all tags readable
4. Check image displays correctly
```

## Troubleshooting

### Tags Not Loading
**Problem**: Modal shows loading forever

**Solutions**:
- Check console for errors
- Verify instance ID is correct
- Ensure file exists in localStorage
- Try refreshing page

### Edit Not Saving
**Problem**: Changes don't persist

**Solutions**:
- Check if tag is editable
- Verify new value length
- Check localStorage quota
- Try export instead of update

### Export Fails
**Problem**: Download doesn't start

**Solutions**:
- Check browser download settings
- Verify file size not too large
- Try different filename
- Check console for errors

### Modified File Won't Open
**Problem**: Viewer rejects modified file

**Solutions**:
- Check DICOM compliance
- Verify tag values are valid
- Test with different viewer
- Use original file as reference

## API Reference

### DicomTagViewer Component

```jsx
<DicomTagViewer
  instanceId="instance_xxx"
  onClose={() => setShowModal(false)}
  editable={true}
  onSave={handleSave}
/>
```

**Props**:
- `instanceId`: Instance ID from localStorage
- `onClose`: Callback when modal closes
- `editable`: Enable edit mode (default: false)
- `onSave`: Callback when saving (editedTags, dataSet)

### dicomTagService Functions

```javascript
// Save with edited tags
await saveDicomWithEditedTags(instanceId, editedTags, dataSet);

// Export as file
await exportDicomWithEditedTags(instanceId, editedTags, dataSet, fileName);

// Update in storage
await updateDicomInStorage(instanceId, editedTags, dataSet);

// Get tags as JSON
const tags = await getDicomTagsAsJson(instanceId);
```

## Security Considerations

### 1. Patient Privacy
- Be careful when editing patient info
- Follow HIPAA/privacy regulations
- Use anonymization for sharing
- Keep audit trail of changes

### 2. Data Integrity
- Don't modify critical tags
- Maintain DICOM compliance
- Validate all changes
- Keep original files

### 3. Access Control
- Limit who can edit tags
- Log all modifications
- Require authentication
- Implement approval workflow

## Future Enhancements

1. **Batch Editing**: Edit multiple files at once
2. **Tag Templates**: Save common edit patterns
3. **Validation Rules**: Enforce tag value formats
4. **Audit Trail**: Track all changes with timestamps
5. **Undo/Redo**: Revert changes before saving
6. **Advanced Search**: Filter by VR, value patterns
7. **Tag Groups**: Organize tags by category
8. **Compare**: Compare tags between files

## Summary

DICOM Tag Editor provides:
- ✅ View all DICOM metadata
- ✅ Edit patient and study information
- ✅ Export modified files
- ✅ Update files in storage
- ✅ Export tags as JSON
- ✅ Search and filter tags
- ✅ Protected critical tags

Perfect for:
- Anonymization
- Data correction
- Quality control
- Documentation
- Research workflows
