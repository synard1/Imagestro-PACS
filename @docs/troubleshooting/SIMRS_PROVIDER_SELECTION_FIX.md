# SIMRS Provider Selection Fix

## Problem

Opsi pemilihan SIMRS provider di tab Integration → SIMRS Integration **hilang** ketika user membuka Settings.

### Root Cause

Conditional rendering di Settings.jsx hanya menampilkan form provider selection ketika provider **BUKAN** Khanza:

```javascript
// WRONG - Provider selection hanya muncul di else block
{draftRegistry.simrs?.provider === 'khanza' && draftRegistry.simrs?.enabled ? (
  // Khanza components
) : (
  // Provider selection form (HANYA di sini!)
)}
```

Ini berarti:
- Jika user belum memilih provider → form tidak muncul
- Jika user memilih Khanza → form hilang
- User tidak bisa mengubah provider setelah memilih Khanza

## Solution

### Struktur Baru

```javascript
{activeIntegrationTab === 'simrs' && (
  <div className="space-y-6">
    {/* Provider Selection - ALWAYS SHOW */}
    <div className="card">
      <h2>SIMRS Integration</h2>
      <div>
        <label>Enable SIMRS Integration</label>
        <input type="checkbox" ... />
      </div>
      <div>
        <label>SIMRS Provider</label>
        <select>
          <option value="generic">Generic SIMRS</option>
          <option value="khanza">SIMRS Khanza</option>
          {/* ... other providers ... */}
        </select>
      </div>
      
      {/* Generic SIMRS fields - ONLY if NOT Khanza */}
      {draftRegistry.simrs?.provider !== 'khanza' && (
        <>
          <div>Base URL</div>
          <div>Authentication Type</div>
          {/* ... other generic fields ... */}
        </>
      )}
    </div>

    {/* Khanza Components - ONLY if Khanza is selected */}
    {draftRegistry.simrs?.provider === 'khanza' && draftRegistry.simrs?.enabled && (
      <div className="space-y-6">
        <ConnectionSettings />
        <ProcedureMappings />
        <DoctorMappings />
        <OperatorMappings />
      </div>
    )}
  </div>
)}
```

## Key Changes

1. **Provider Selection Always Visible**
   - Form untuk memilih provider SELALU ditampilkan
   - User bisa mengubah provider kapan saja

2. **Generic Fields Conditional**
   - Generic SIMRS fields hanya muncul jika provider !== 'khanza'
   - Ini menghindari duplikasi form

3. **Khanza Components Conditional**
   - Khanza-specific components hanya muncul jika:
     - provider === 'khanza' AND
     - enabled === true

## User Flow

### Sebelum Fix ❌
```
Open Settings → Integration → SIMRS Integration
    ↓
Form tidak muncul (provider selection hilang!)
    ↓
User tidak bisa memilih provider
```

### Sesudah Fix ✅
```
Open Settings → Integration → SIMRS Integration
    ↓
Provider selection form SELALU muncul
    ↓
User bisa memilih provider
    ↓
IF provider === 'khanza':
    ├─ Generic fields hilang
    └─ Khanza components muncul
ELSE:
    ├─ Generic fields muncul
    └─ Khanza components hilang
```

## Testing

1. **Open Settings**
   ```
   http://localhost:5173/settings
   ```

2. **Navigate to Integration Tab**
   ```
   Click: Integration tab
   ```

3. **Click SIMRS Integration**
   ```
   Click: SIMRS Integration sub-tab
   ```

4. **Verify Provider Selection Visible** ✅
   ```
   Should see:
   - Enable SIMRS Integration [checkbox]
   - SIMRS Provider [dropdown]
   ```

5. **Select Different Providers**
   ```
   Select: Generic SIMRS
   → Generic fields appear
   
   Select: SIMRS Khanza
   → Generic fields disappear
   → Khanza components appear
   
   Select: SIMRS GOS v2
   → Generic fields appear
   → Khanza components disappear
   ```

6. **Verify Khanza Components**
   ```
   When Khanza is selected:
   - Connection Settings ✅
   - Procedure Mappings ✅
   - Doctor Mappings ✅
   - Operator Mappings ✅
   ```

## Files Modified

- `src/pages/Settings.jsx`
  - Restructured SIMRS Integration section
  - Provider selection now always visible
  - Generic fields conditional on provider !== 'khanza'
  - Khanza components conditional on provider === 'khanza' && enabled

## Benefits

✅ Provider selection always visible
✅ User can change provider anytime
✅ No duplicate forms
✅ Clean conditional rendering
✅ Better UX flow
