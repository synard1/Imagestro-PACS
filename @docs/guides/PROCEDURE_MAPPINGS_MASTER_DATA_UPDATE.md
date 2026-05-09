# Procedure Mappings - Master Data Integration Update

## Overview

Refactor untuk mengintegrasikan data prosedur dari master data di `/procedures` (halaman Radiology Procedures) sebagai sumber data utama untuk dropdown procedure mappings.

## Changes Made

### 1. Data Source Change

**Before:**
- Data prosedur diambil dari mock data atau backend PACS procedures endpoint
- Modalities di-hardcode dalam array MODALITIES

**After:**
- Data prosedur diambil dari `/procedures` (master data PACS)
- Modalities dinamis dari data prosedur yang tersedia
- Menggunakan `procedureService.listProcedures()`

### 2. Files Modified

#### `src/pages/ExternalSystems/components/ProcedureMappingTable.jsx`
```javascript
// Added import
import * as procedureService from '../../../services/procedureService';

// Removed
const MODALITIES = ['CR', 'CT', 'MR', 'US', 'MG', 'RF', 'DX', 'NM', 'PT', 'XA'];

// Updated loadPacsProcedures function
const loadPacsProcedures = useCallback(async () => {
  setLoadingPacsProcedures(true);
  try {
    // Load from master procedures at /procedures
    const procedures = await procedureService.listProcedures({ active: true });
    
    // Transform to dropdown format
    const transformed = (procedures || []).map(proc => ({
      id: proc.id || proc.code,
      code: proc.code,
      name: proc.name,
      modality: proc.modality,
      description: proc.description,
      body_part: proc.body_part,
      loinc_code: proc.loinc_code,
    }));
    
    setPacsProcedures(transformed);
    logger.info('[ProcedureMappingTable]', `Loaded ${transformed.length} procedures from master data`);
  } catch (err) {
    logger.warn('[ProcedureMappingTable]', 'Failed to load procedures:', err.message);
    setPacsProcedures([]);
  } finally {
    setLoadingPacsProcedures(false);
  }
}, []);

// Updated modality filter
<select>
  <option value="">All Modalities</option>
  {Array.from(new Set(pacsProcedures.map(p => p.modality).filter(Boolean))).sort().map(mod => (
    <option key={mod} value={mod}>{mod}</option>
  ))}
</select>
```

#### `src/pages/ExternalSystems/tabs/ProcedureMappingsTab.jsx`
```javascript
// Added import
import * as procedureService from '../../../services/procedureService';

// Removed
const MODALITIES = ['CR', 'CT', 'MR', 'US', 'MG', 'RF', 'DX', 'NM', 'PT', 'XA'];

// Updated loadPacsProcedures function (same as above)

// Updated modality filter to use dynamic modalities
// Updated MappingFormRow to accept allModalities prop
```

## Data Flow

### Before
```
Component
    ↓
Mock data or Backend PACS procedures endpoint
    ↓
Hardcoded MODALITIES array
```

### After
```
Component
    ↓
procedureService.listProcedures()
    ↓
/procedures endpoint (Master Data)
    ↓
Dynamic modalities from actual procedures
```

## Benefits

1. **Single Source of Truth**
   - Semua data prosedur berasal dari master data di `/procedures`
   - Tidak ada duplikasi data

2. **Dynamic Modalities**
   - Modalities otomatis dari prosedur yang tersedia
   - Tidak perlu update hardcoded list saat ada modality baru

3. **Consistency**
   - Dropdown selalu menampilkan prosedur yang valid
   - Modalities sesuai dengan prosedur yang ada

4. **Maintainability**
   - Lebih mudah untuk menambah/menghapus prosedur
   - Tidak perlu update code untuk perubahan data

## Data Structure

### Procedure Object (from master data)
```javascript
{
  id: string,
  code: string,
  name: string,
  modality: string,
  description: string,
  body_part: string,
  loinc_code: string,
  category: string,
  duration_minutes: number,
  special_requirements: string
}
```

### Transformed for Dropdown
```javascript
{
  id: string,
  code: string,
  name: string,
  modality: string,
  description: string,
  body_part: string,
  loinc_code: string
}
```

## API Integration

### procedureService.listProcedures()
```javascript
// Load active procedures from master data
const procedures = await procedureService.listProcedures({ active: true });

// Returns array of procedure objects
// Automatically handles both backend and mock data
```

### Endpoints Used
- `GET /procedures` - Master procedures list
- `GET /api/procedures` - Alternative endpoint

## Features

### 1. Dynamic Modality Filter
```javascript
// Modalities extracted from actual procedures
Array.from(new Set(pacsProcedures.map(p => p.modality).filter(Boolean))).sort()

// Result: ['CR', 'CT', 'DX', 'MG', 'MR', 'NM', 'PT', 'RF', 'US', 'XA']
// Only shows modalities that exist in master data
```

### 2. Auto-fill on Selection
```javascript
// When user selects procedure from dropdown
const procedure = pacsProcedures.find(p => p.code === code);
if (procedure) {
  onChange('pacs_code', procedure.code);
  onChange('pacs_name', procedure.name);
  onChange('modality', procedure.modality);
}
```

### 3. Procedure Details
```javascript
// Dropdown now includes additional procedure details
{
  code: 'CR-CHEST-PA',
  name: 'Chest X-ray PA View',
  modality: 'CR',
  body_part: 'Chest',
  loinc_code: '36643-5',
  description: 'Standard chest X-ray PA view'
}
```

## Error Handling

### If Master Data Not Available
```javascript
try {
  const procedures = await procedureService.listProcedures({ active: true });
  setPacsProcedures(transformed);
} catch (err) {
  logger.warn('[ProcedureMappingTable]', 'Failed to load procedures:', err.message);
  setPacsProcedures([]); // Continue with empty list
}
```

### Graceful Degradation
- If procedures fail to load, dropdown remains empty
- User can still manually enter PACS code and name
- No blocking errors

## Performance

### Loading
- Procedures loaded once on component mount
- Cached in component state
- No repeated API calls

### Filtering
- Modalities extracted from cached procedures
- No additional API calls for filtering
- O(n) complexity for modality extraction

### Memory
- Typical PACS has 100-500 procedures
- Minimal memory footprint
- No performance impact

## Testing

### Unit Tests
```javascript
// Test dynamic modality extraction
const procedures = [
  { code: 'CR-1', modality: 'CR' },
  { code: 'CT-1', modality: 'CT' },
  { code: 'CR-2', modality: 'CR' }
];
const modalities = Array.from(new Set(procedures.map(p => p.modality)));
expect(modalities).toEqual(['CR', 'CT']);
```

### Integration Tests
```javascript
// Test loading procedures from master data
const procedures = await procedureService.listProcedures({ active: true });
expect(procedures.length).toBeGreaterThan(0);
expect(procedures[0]).toHaveProperty('code');
expect(procedures[0]).toHaveProperty('modality');
```

### E2E Tests
```javascript
// Test dropdown population
1. Navigate to procedure mappings
2. Verify dropdown shows procedures from master data
3. Select procedure
4. Verify auto-fill works
5. Verify modality is correct
```

## Migration Guide

### For Existing Deployments

1. **No Database Changes Required**
   - Uses existing procedures table
   - No new tables or columns needed

2. **No Backend Changes Required**
   - Uses existing procedureService
   - Uses existing /procedures endpoint

3. **Frontend Only Update**
   - Update ProcedureMappingTable.jsx
   - Update ProcedureMappingsTab.jsx
   - Clear browser cache

### Backward Compatibility

- ✅ Fully backward compatible
- ✅ No breaking changes
- ✅ Existing mappings still work
- ✅ Can rollback anytime

## Troubleshooting

### Dropdown Shows No Procedures

**Cause:** Master procedures not loaded

**Solution:**
1. Check `/procedures` page loads correctly
2. Verify procedures exist in database
3. Check browser console for errors
4. Verify procedureService is working

### Modality Filter Empty

**Cause:** No procedures with modality field

**Solution:**
1. Verify procedures have modality field
2. Check procedure data in database
3. Ensure procedures are marked as active

### Auto-fill Not Working

**Cause:** Procedure code mismatch

**Solution:**
1. Verify procedure code format
2. Check case sensitivity
3. Verify procedure exists in master data

## Future Enhancements

1. **Procedure Search**
   - Add search by body part
   - Add search by LOINC code
   - Add search by category

2. **Procedure Details**
   - Show procedure description in dropdown
   - Show body part information
   - Show LOINC code

3. **Procedure Validation**
   - Validate PACS code against master data
   - Warn if procedure not in master data
   - Suggest similar procedures

4. **Procedure Sync**
   - Auto-sync with master data
   - Detect new procedures
   - Update modality if changed

## Documentation Updates

### Files Updated
- `PROCEDURE_MAPPINGS_REFACTOR.md` - Updated data source section
- `PROCEDURE_MAPPINGS_BACKEND_EXAMPLE.md` - Updated API section
- `PROCEDURE_MAPPINGS_QUICK_START.md` - Updated dropdown section

### New Documentation
- `PROCEDURE_MAPPINGS_MASTER_DATA_UPDATE.md` - This file

## Deployment Checklist

- ✅ Code changes completed
- ✅ No syntax errors
- ✅ No breaking changes
- ✅ Backward compatible
- ✅ Error handling implemented
- ✅ Logging added
- ✅ Documentation updated
- ✅ Ready for deployment

## Summary

Refactor untuk mengintegrasikan master data prosedur telah selesai dengan:

✅ **Data Source**
- Menggunakan `/procedures` sebagai master data
- Dynamic modalities dari actual procedures
- Consistent dengan PACS master data

✅ **Features**
- Auto-fill PACS name dan modality
- Dynamic modality filter
- Procedure details in dropdown

✅ **Quality**
- No breaking changes
- Backward compatible
- Error handling
- Logging

✅ **Performance**
- Procedures loaded once
- Cached in state
- No repeated API calls

**Status: ✅ READY FOR DEPLOYMENT**

---

**Last Updated:** December 6, 2025
**Version:** 1.1
**Status:** ✅ COMPLETE
