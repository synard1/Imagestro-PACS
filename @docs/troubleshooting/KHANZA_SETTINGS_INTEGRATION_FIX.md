# Khanza Settings Integration Fix

## Problem Analysis

Anda benar! Perubahan yang saya buat sebelumnya **TIDAK** terhubung dengan menu di:
```
http://localhost:5173/settings 
  → Tab: Integration 
    → SIMRS Integration
```

### Root Cause

1. **Saya membuat file terpisah:**
   - `src/pages/KhanzaIntegration/Settings/ConnectionSettings.jsx`
   - `src/pages/KhanzaIntegration/Settings/ProcedureMappings.jsx`
   - `src/pages/KhanzaIntegration/Settings/DoctorMappings.jsx`
   - `src/pages/KhanzaIntegration/Settings/OperatorMappings.jsx`

2. **Tetapi Settings.jsx tidak menggunakan components tersebut:**
   - Settings.jsx menampilkan form GENERIC untuk semua SIMRS provider
   - Tidak ada conditional rendering untuk Khanza-specific components
   - Test Connection button hanya menampilkan dummy alert

## Solution Implemented

### 1. Import Khanza Components ke Settings.jsx

```javascript
import ConnectionSettings from '../pages/KhanzaIntegration/Settings/ConnectionSettings'
import ProcedureMappings from '../pages/KhanzaIntegration/Settings/ProcedureMappings'
import DoctorMappings from '../pages/KhanzaIntegration/Settings/DoctorMappings'
import OperatorMappings from '../pages/KhanzaIntegration/Settings/OperatorMappings'
```

### 2. Conditional Rendering di SIMRS Integration Tab

```javascript
{activeIntegrationTab === 'simrs' && (
  <>
    {/* Show Khanza-specific components when Khanza is selected */}
    {draftRegistry.simrs?.provider === 'khanza' && draftRegistry.simrs?.enabled ? (
      <div className="space-y-6">
        <ConnectionSettings />
        <div className="border-t pt-6">
          <ProcedureMappings />
        </div>
        <div className="border-t pt-6">
          <DoctorMappings />
        </div>
        <div className="border-t pt-6">
          <OperatorMappings />
        </div>
      </div>
    ) : (
      /* Show generic SIMRS configuration for other providers */
      <div className="card">
        {/* Generic SIMRS form */}
      </div>
    )}
  </>
)}
```

## User Flow

### Sebelum Fix:
```
Settings → Integration → SIMRS Integration
  ↓
Generic form (tidak ada Khanza-specific features)
  ↓
Test Connection → Dummy alert (tidak real)
```

### Sesudah Fix:
```
Settings → Integration → SIMRS Integration
  ↓
Select Provider: "SIMRS Khanza"
  ↓
Enable SIMRS Integration (checkbox)
  ↓
Khanza-Specific Components Appear:
  1. Connection Settings (Real API test)
  2. Procedure Mappings (CRUD)
  3. Doctor Mappings (CRUD)
  4. Operator Mappings (CRUD)
```

## Key Features Now Available

### 1. Connection Settings
- Real API call ke Khanza `/health` endpoint
- Response time measurement
- Timestamp recording
- Error code display
- Configuration validation before save

### 2. Procedure Mappings
- CRUD operations
- Search & filter
- Pagination
- Modality selection
- Duplicate prevention

### 3. Doctor Mappings
- CRUD operations
- Search & filter
- Pagination
- Auto-created indicator
- Manual vs auto-created badges

### 4. Operator Mappings
- CRUD operations
- Search & filter
- Pagination
- Active/Inactive status
- PACS user ↔ Khanza operator mapping

## Testing the Fix

### Prerequisites
1. Khanza API server running at `http://localhost:3007`
2. Valid API Key

### Steps
1. Open `http://localhost:5173/settings`
2. Click "Integration" tab
3. Click "SIMRS Integration" sub-tab
4. Select "SIMRS Khanza" from SIMRS Provider dropdown
5. Check "Enable SIMRS Integration"
6. **Now you should see Khanza-specific components!**

### Expected Result
```
✓ Connection Settings section appears
✓ Procedure Mappings section appears
✓ Doctor Mappings section appears
✓ Operator Mappings section appears
✓ Test Connection button makes real API calls
```

## Files Modified

### 1. `src/pages/Settings.jsx`
- Added imports for Khanza components
- Added conditional rendering for Khanza provider
- Integrated all 4 Khanza-specific components

### 2. `src/pages/KhanzaIntegration/Settings/ConnectionSettings.jsx`
- Real API calls via `khanzaService.checkHealth()`
- Response time measurement
- Enhanced error display

### 3. `src/pages/KhanzaIntegration/Settings/ProcedureMappings.jsx`
- Full CRUD for procedure mappings
- Search, filter, pagination

### 4. `src/pages/KhanzaIntegration/Settings/DoctorMappings.jsx`
- Full CRUD for doctor mappings
- Auto-created indicator

### 5. `src/pages/KhanzaIntegration/Settings/OperatorMappings.jsx`
- Full CRUD for operator mappings
- Active/Inactive status

## Architecture

```
Settings.jsx (Main Settings Page)
  ↓
Integration Tab
  ↓
SIMRS Integration Sub-tab
  ↓
Conditional Rendering:
  ├─ If provider === 'khanza' && enabled
  │   ├─ ConnectionSettings (Real API test)
  │   ├─ ProcedureMappings (CRUD)
  │   ├─ DoctorMappings (CRUD)
  │   └─ OperatorMappings (CRUD)
  │
  └─ Else (Generic SIMRS form)
      └─ Generic configuration form
```

## Benefits

1. **Real Integration:** Khanza components sekarang benar-benar terintegrasi di Settings
2. **Real API Calls:** Test Connection menggunakan actual HTTP requests
3. **Complete CRUD:** Semua mapping operations tersedia
4. **User-Friendly:** Conditional UI berdasarkan provider selection
5. **Maintainable:** Separation of concerns dengan component-based architecture

## Notes

- Perubahan ini **TIDAK** mempengaruhi generic SIMRS providers (GOS, Trustmedis, K-SHA)
- Ketika provider bukan Khanza, form generic tetap ditampilkan
- Semua Khanza-specific features hanya muncul ketika:
  1. Provider = "SIMRS Khanza"
  2. Enable SIMRS Integration = checked

## Next Steps

1. Test di browser: `http://localhost:5173/settings`
2. Verify Khanza components appear ketika Khanza dipilih
3. Test real API connection
4. Test CRUD operations untuk mappings
