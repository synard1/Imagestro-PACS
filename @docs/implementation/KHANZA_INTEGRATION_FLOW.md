# Khanza Integration Flow - Before & After

## BEFORE FIX ❌

```
http://localhost:5173/settings
    ↓
Settings Page
    ↓
Integration Tab
    ↓
SIMRS Integration Sub-tab
    ↓
Generic SIMRS Form (untuk semua provider)
    ├─ Enable SIMRS Integration [checkbox]
    ├─ SIMRS Provider [dropdown]
    │   ├─ Generic SIMRS (Custom)
    │   ├─ SIMRS Khanza ← User selects this
    │   ├─ SIMRS GOS v2
    │   ├─ Trustmedis
    │   └─ K-SHA
    ├─ Base URL [input]
    ├─ Authentication Type [dropdown]
    ├─ Timeout [input]
    ├─ Username/Password [inputs]
    ├─ Bearer Token [input]
    ├─ Test Connection [button] → Shows DUMMY ALERT ❌
    └─ Save SIMRS Settings [button]

❌ MASALAH:
   - Tidak ada Khanza-specific components
   - Test Connection hanya dummy alert
   - Tidak bisa manage procedure mappings
   - Tidak bisa manage doctor mappings
   - Tidak bisa manage operator mappings
```

## AFTER FIX ✅

```
http://localhost:5173/settings
    ↓
Settings Page
    ↓
Integration Tab
    ↓
SIMRS Integration Sub-tab
    ↓
Conditional Rendering:
    ├─ IF provider === 'khanza' && enabled:
    │   ↓
    │   ✅ Khanza-Specific Components:
    │   │
    │   ├─ 1. Connection Settings
    │   │   ├─ API URL [input]
    │   │   ├─ API Key [password]
    │   │   ├─ Timeout [input]
    │   │   ├─ Test Connection [button] → REAL API CALL ✅
    │   │   │   ├─ Measures response time
    │   │   │   ├─ Shows timestamp
    │   │   │   ├─ Displays error code if failed
    │   │   │   └─ Validates before save
    │   │   └─ Save Configuration [button]
    │   │
    │   ├─ 2. Procedure Mappings
    │   │   ├─ Search [input]
    │   │   ├─ Filter by Modality [dropdown]
    │   │   ├─ Filter by Status [dropdown]
    │   │   ├─ Add New Mapping [button]
    │   │   ├─ Mappings Table:
    │   │   │   ├─ Khanza Code
    │   │   │   ├─ Khanza Name
    │   │   │   ├─ PACS Code
    │   │   │   ├─ PACS Name
    │   │   │   ├─ Modality
    │   │   │   ├─ Edit [button]
    │   │   │   └─ Delete [button]
    │   │   └─ Pagination
    │   │
    │   ├─ 3. Doctor Mappings
    │   │   ├─ Search [input]
    │   │   ├─ Filter by Creation Type [dropdown]
    │   │   ├─ Add New Mapping [button]
    │   │   ├─ Mappings Table:
    │   │   │   ├─ Khanza Code
    │   │   │   ├─ Khanza Name
    │   │   │   ├─ PACS Doctor ID
    │   │   │   ├─ Created (Auto/Manual badge)
    │   │   │   ├─ Edit [button]
    │   │   │   └─ Delete [button]
    │   │   └─ Pagination
    │   │
    │   └─ 4. Operator Mappings
    │       ├─ Search [input]
    │       ├─ Filter by Status [dropdown]
    │       ├─ Add New Mapping [button]
    │       ├─ Mappings Table:
    │       │   ├─ PACS Username
    │       │   ├─ PACS User ID
    │       │   ├─ Khanza Operator Code
    │       │   ├─ Khanza Operator Name
    │       │   ├─ Status (Active/Inactive badge)
    │       │   ├─ Edit [button]
    │       │   └─ Delete [button]
    │       └─ Pagination
    │
    └─ ELSE (provider !== 'khanza'):
        ↓
        Generic SIMRS Form (untuk provider lain)
        ├─ Enable SIMRS Integration [checkbox]
        ├─ SIMRS Provider [dropdown]
        ├─ Base URL [input]
        ├─ Authentication Type [dropdown]
        ├─ Timeout [input]
        ├─ Username/Password [inputs]
        ├─ Bearer Token [input]
        ├─ Test Connection [button] → Generic test
        └─ Save SIMRS Settings [button]

✅ KEUNTUNGAN:
   ✓ Khanza-specific components muncul otomatis
   ✓ Test Connection menggunakan real API calls
   ✓ Bisa manage procedure mappings (CRUD)
   ✓ Bisa manage doctor mappings (CRUD)
   ✓ Bisa manage operator mappings (CRUD)
   ✓ Response time measurement
   ✓ Error code display
   ✓ Timestamp recording
   ✓ Pagination support
   ✓ Search & filter functionality
```

## Component Integration

```
Settings.jsx
├─ Imports:
│  ├─ ConnectionSettings
│  ├─ ProcedureMappings
│  ├─ DoctorMappings
│  └─ OperatorMappings
│
└─ SIMRS Integration Tab:
   └─ Conditional Rendering:
      ├─ IF khanza + enabled:
      │  ├─ <ConnectionSettings />
      │  ├─ <ProcedureMappings />
      │  ├─ <DoctorMappings />
      │  └─ <OperatorMappings />
      │
      └─ ELSE:
         └─ Generic SIMRS Form
```

## Data Flow

### Test Connection Flow (Real API)

```
User clicks "Test Connection"
    ↓
Validate required fields (URL, API Key)
    ↓
Save draft config temporarily
    ↓
Call khanzaService.checkHealth()
    ↓
Make HTTP GET request to {baseUrl}/health
    ├─ Include X-API-Key header
    ├─ Measure response time
    └─ Handle timeout (30s default)
    ↓
Restore original config
    ↓
Display result with details:
    ├─ Status (Connected/Failed)
    ├─ Message
    ├─ Response Time (ms)
    ├─ Timestamp
    └─ Error Code (if failed)
```

### Procedure Mapping CRUD Flow

```
User clicks "Add New Mapping"
    ↓
Form appears with fields:
    ├─ Khanza Code (required)
    ├─ Khanza Name (required)
    ├─ PACS Code (required)
    ├─ PACS Name (required)
    ├─ Modality (optional)
    └─ Description (optional)
    ↓
User fills form and clicks "Save Mapping"
    ↓
Validate all required fields
    ↓
Call mappingService.createProcedureMapping()
    ↓
Backend creates mapping in database
    ↓
Reload mappings list
    ↓
Show success message
    ↓
Clear form and close
```

## Browser Testing

### Step-by-Step

1. **Open Settings**
   ```
   http://localhost:5173/settings
   ```

2. **Navigate to Integration Tab**
   ```
   Click: Integration tab
   ```

3. **Select SIMRS Integration**
   ```
   Click: SIMRS Integration sub-tab
   ```

4. **Select Khanza Provider**
   ```
   SIMRS Provider dropdown → Select "SIMRS Khanza"
   ```

5. **Enable Integration**
   ```
   Check: "Enable SIMRS Integration" checkbox
   ```

6. **Khanza Components Appear** ✅
   ```
   You should now see:
   - Connection Settings section
   - Procedure Mappings section
   - Doctor Mappings section
   - Operator Mappings section
   ```

7. **Test Connection**
   ```
   Enter API URL: http://localhost:3007
   Enter API Key: your-api-key
   Click: "Test Connection" button
   
   Expected: Real API call with response time
   ```

8. **Manage Mappings**
   ```
   Click: "+ Add New Mapping" in any section
   Fill form and save
   ```

## Verification Checklist

- [ ] Settings page loads without errors
- [ ] Integration tab is visible
- [ ] SIMRS Integration sub-tab is visible
- [ ] SIMRS Provider dropdown shows all options
- [ ] Selecting "SIMRS Khanza" shows Khanza components
- [ ] Connection Settings section appears
- [ ] Procedure Mappings section appears
- [ ] Doctor Mappings section appears
- [ ] Operator Mappings section appears
- [ ] Test Connection button makes real API calls
- [ ] Response time is displayed
- [ ] Timestamp is recorded
- [ ] Error codes are shown on failure
- [ ] CRUD operations work for all mappings
- [ ] Search and filter work
- [ ] Pagination works
- [ ] Selecting other providers shows generic form
