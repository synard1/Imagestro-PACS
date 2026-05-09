# UI Menu Gap Analysis
**Date**: November 17, 2025  
**Status**: Complete Analysis  
**Purpose**: Identify modules/features without UI menu access

---

## 📊 Executive Summary

**Total Pages**: 45 pages  
**Pages with Menu Access**: 32 pages (71%)  
**Pages WITHOUT Menu Access**: 13 pages (29%)  
**Critical Missing**: 5 pages  
**Test/Debug Pages**: 4 pages  
**Deprecated/Backup**: 4 pages

---

## ✅ Pages WITH Menu Access (32)

### Main Navigation
1. ✅ **Dashboard** - `/dashboard` → Menu: "Dashboard"
2. ✅ **Worklist** - `/worklist` → Menu: "Worklist"
3. ✅ **Orders** - `/orders` → Menu: "Orders"
4. ✅ **Reports** - `/reports` → Menu: "Reports (PDF)"
5. ✅ **Studies** - `/studies` → Menu: "Studies"
6. ✅ **Auth Audit Logs** - `/auth-audit-logs` → Menu: "Auth Audit Logs"
7. ✅ **Settings** - `/settings` → Menu: "Settings"

### Master Data Submenu
8. ✅ **Patients** - `/patients` → Menu: "Master Data > Patients"
9. ✅ **Doctors** - `/doctors` → Menu: "Master Data > Doctors"
10. ✅ **Procedures** - `/procedures` → Menu: "Master Data > Procedures"
11. ✅ **Mappings** - `/mappings` → Menu: "Master Data > Procedure Mappings"
12. ✅ **External Systems** - `/external-systems-docs` → Menu: "Master Data > External Systems (Docs)"

### User Management Submenu (nested under Master Data)
13. ✅ **Users** - `/users` → Menu: "Master Data > User Management > Users"
14. ✅ **Roles** - `/roles` → Menu: "Master Data > User Management > Roles"
15. ✅ **Permissions** - `/permissions` → Menu: "Master Data > User Management > Permissions"

### Tools Submenu (for superadmin/developer only)
16. ✅ **SatuSehat Monitor** - `/satusehat-monitor` → Menu: "Tools > SatuSehat Monitor"
17. ✅ **DICOM Viewer** - `/dicom-viewer` → Menu: "Tools > DICOM Viewer (Upload)"
18. ✅ **DICOM Viewer Demo** - `/dicom-viewer-demo` → Menu: "Tools > DICOM Viewer Demo"
19. ✅ **DICOM UID Generator** - `/dicom-uid-generator` → Menu: "Tools > DICOM UID Generator"

### Form Pages (accessed via parent pages)
20. ✅ **OrderForm** - `/orders/new`, `/orders/:id` → Accessed from Orders page
21. ✅ **PatientForm** - `/patients/new`, `/patients/:id` → Accessed from Patients page
22. ✅ **DoctorForm** - `/doctors/new`, `/doctors/:id` → Accessed from Doctors page
23. ✅ **ProcedureForm** - `/procedures/new`, `/procedures/:id` → Accessed from Procedures page
24. ✅ **MappingForm** - `/mappings/new`, `/mappings/:id` → Accessed from Mappings page
25. ✅ **ExternalSystemDocForm** - `/external-systems-docs/new`, `/external-systems-docs/:id` → Accessed from External Systems page

### Viewer Pages (accessed via Studies)
26. ✅ **StudyDetail** - `/study/:studyId` → Accessed from Studies page
27. ✅ **DicomViewerEnhanced** - `/viewer/enhanced/:studyId` → Accessed from Study Detail
28. ✅ **ReportEditor** - `/report/:studyId` → Accessed from Study Detail

### Special Pages
29. ✅ **Login** - `/login` → Public page (no menu needed)
30. ✅ **VerifySignature** - `/verify-signature` → Public page (QR code verification)
31. ✅ **NotFound** - `*` → 404 page (no menu needed)
32. ✅ **Unauthorized** - `/unauthorized` → Error page (no menu needed)

---

## ❌ Pages WITHOUT Menu Access (13)

### 🔴 CRITICAL - Production Features Missing Menu (5)

#### 1. **Modalities Management** ❌
- **File**: `src/pages/Modalities.jsx`
- **Route**: `/modalities` (exists in App.jsx)
- **Permission**: `modality.manage`, `modality.view`
- **Status**: COMMENTED OUT in Layout.jsx (line ~147)
- **Impact**: HIGH - Cannot manage CT, MR, CR, US, etc. modalities
- **Recommendation**: ADD to Master Data menu
- **Suggested Menu**: `Master Data > Modalities`

#### 2. **DICOM Nodes Management** ❌
- **File**: `src/pages/DicomNodes.jsx`
- **Route**: `/dicom-nodes` (exists in App.jsx)
- **Permission**: `node.manage`, `node.view`
- **Status**: COMMENTED OUT in Layout.jsx (line ~148)
- **Impact**: HIGH - Cannot manage DICOM connections (AE Title, IP, Port)
- **Recommendation**: ADD to Master Data menu OR Tools menu
- **Suggested Menu**: `Master Data > DICOM Nodes` OR `Tools > DICOM Nodes`

#### 3. **Order Workflow Documentation** ❌
- **File**: `src/pages/OrderWorkflow.jsx`
- **Route**: `/orders/workflow` (exists in App.jsx)
- **Permission**: `order.view`, `order.*`
- **Status**: NO MENU ENTRY
- **Impact**: MEDIUM - Workflow documentation not accessible
- **Recommendation**: ADD to Orders submenu or Help section
- **Suggested Menu**: `Orders > Workflow Guide` OR `Help > Order Workflow`

#### 4. **Report Settings** ❌
- **File**: `src/pages/settings/ReportSettings.jsx`
- **Route**: `/settings/reports` (exists in App.jsx)
- **Permission**: None (should be admin only)
- **Status**: NO MENU ENTRY (only accessible via direct URL)
- **Impact**: MEDIUM - Cannot configure report templates, fonts, etc.
- **Recommendation**: ADD to Settings submenu
- **Suggested Menu**: `Settings > Report Settings`

#### 5. **DICOM Upload Page** ❌
- **File**: `src/pages/DicomUploadPage.jsx`
- **Route**: `/upload` (exists in App.jsx)
- **Permission**: `studies.upload`
- **Status**: NO MENU ENTRY
- **Impact**: MEDIUM - DICOM file upload not easily accessible
- **Recommendation**: ADD to Studies menu or Tools menu
- **Suggested Menu**: `Studies > Upload DICOM` OR `Tools > Upload DICOM`

---

### 🟡 TEST/DEBUG Pages (4) - Should NOT be in production menu

#### 6. **SignatureTest** 🧪
- **File**: `src/pages/SignatureTest.jsx`
- **Route**: `/signature-test` (exists in App.jsx)
- **Status**: Test page for signature functionality
- **Recommendation**: KEEP without menu (dev/test only)

#### 7. **DebugStorage** 🧪
- **File**: `src/pages/DebugStorage.jsx`
- **Route**: `/debug-storage` (exists in App.jsx)
- **Status**: Debug page for DICOM storage
- **Recommendation**: KEEP without menu (dev/test only) OR add to Tools menu for admins

#### 8. **Studies (Legacy)** 🧪
- **File**: `src/pages/Studies.jsx`
- **Route**: `/studies/legacy` (exists in App.jsx)
- **Status**: Old version of Studies page
- **Recommendation**: REMOVE or keep as fallback without menu

#### 9. **SatusehatMonitor (Old)** 🧪
- **File**: `src/pages/SatusehatMonitor.jsx`
- **Route**: None (replaced by SatusehatMonitorClean.jsx)
- **Status**: Deprecated version
- **Recommendation**: DELETE file

---

### 🟠 DEPRECATED/BACKUP Files (4) - Should be cleaned up

#### 10. **OrderList** 📦
- **File**: `src/pages/OrderList.jsx`
- **Route**: None
- **Status**: Replaced by Orders.jsx
- **Recommendation**: DELETE file

#### 11. **Users (Old)** 📦
- **File**: `src/pages/Users.jsx`
- **Route**: Replaced by UserManagement.jsx
- **Status**: Deprecated
- **Recommendation**: DELETE file

#### 12. **Orders.jsx.bak** 📦
- **File**: `src/pages/Orders.jsx.bak`
- **Status**: Backup file
- **Recommendation**: DELETE file

#### 13. **Settings.jsx.backup_07112025** 📦
- **File**: `src/pages/Settings.jsx.backup_07112025`
- **Status**: Backup file
- **Recommendation**: DELETE file

---

## 🎯 Recommended Actions

### Priority 1: CRITICAL (Add to Menu Immediately)

1. **Add Modalities to Menu**
   ```javascript
   // In Layout.jsx, Master Data submenu:
   { to: '/modalities', label: 'Modalities', any: ['modality.manage','modality.view'] },
   ```

2. **Add DICOM Nodes to Menu**
   ```javascript
   // Option A: In Master Data submenu:
   { to: '/dicom-nodes', label: 'DICOM Nodes', any: ['node.manage','node.view'] },
   
   // Option B: In Tools submenu (recommended):
   { to: '/dicom-nodes', label: 'DICOM Nodes', any: ['node.manage','node.view'] },
   ```

3. **Add DICOM Upload to Menu**
   ```javascript
   // In Studies submenu (create if needed):
   {
     label: 'Studies',
     perm: 'study.view',
     children: [
       { to: '/studies', label: 'Study List' },
       { to: '/upload', label: 'Upload DICOM', perm: 'studies.upload' },
     ]
   }
   ```

### Priority 2: HIGH (Add to Menu Soon)

4. **Add Report Settings to Settings Submenu**
   ```javascript
   // Create Settings submenu:
   {
     label: 'Settings',
     children: [
       { to: '/settings', label: 'General Settings' },
       { to: '/settings/reports', label: 'Report Settings', any: ['setting:write', '*'] },
     ]
   }
   ```

5. **Add Order Workflow to Help or Orders**
   ```javascript
   // Option A: In Orders submenu:
   {
     label: 'Orders',
     perm: 'order.view',
     children: [
       { to: '/orders', label: 'Order List' },
       { to: '/orders/workflow', label: 'Workflow Guide' },
     ]
   }
   ```

### Priority 3: CLEANUP

6. **Delete Deprecated Files**
   ```bash
   # Remove these files:
   rm src/pages/OrderList.jsx
   rm src/pages/Users.jsx
   rm src/pages/SatusehatMonitor.jsx
   rm src/pages/Orders.jsx.bak
   rm src/pages/Settings.jsx.backup_07112025
   rm src/pages/Settings.jsx.import
   rm src/pages/UserManagement.jsx.backup
   ```

7. **Move Debug Pages to Admin Tools**
   ```javascript
   // In Tools submenu, add conditional section:
   if (canAccessTools()) {
     filteredNav.push({
       label: 'Tools',
       children: [
         // ... existing tools ...
         { to: '/debug-storage', label: 'Debug Storage (Dev)', any: ['*'] },
       ]
     });
   }
   ```

---

## 📋 Implementation Checklist

### Phase 1: Critical Menu Items (30 minutes)
- [ ] Uncomment Modalities in Layout.jsx
- [ ] Uncomment DICOM Nodes in Layout.jsx
- [ ] Add DICOM Upload to menu
- [ ] Test all new menu items
- [ ] Verify permissions work correctly

### Phase 2: Settings & Documentation (20 minutes)
- [ ] Create Settings submenu
- [ ] Add Report Settings to submenu
- [ ] Add Order Workflow to menu
- [ ] Test navigation

### Phase 3: Cleanup (15 minutes)
- [ ] Delete deprecated files
- [ ] Remove backup files
- [ ] Update documentation
- [ ] Test build

---

## 🔍 Menu Structure Recommendation

```
MWL / mini-PACS
├── Dashboard
├── Worklist (superadmin/developer only)
├── Orders
│   ├── Order List
│   └── Workflow Guide (NEW)
├── Reports (PDF) (superadmin/developer only)
├── Studies
│   ├── Study List
│   └── Upload DICOM (NEW)
├── Master Data
│   ├── Patients
│   ├── Doctors
│   ├── User Management
│   │   ├── Users
│   │   ├── Roles
│   │   └── Permissions
│   ├── Procedures
│   ├── Procedure Mappings
│   ├── External Systems (Docs)
│   ├── Modalities (NEW - CRITICAL)
│   └── DICOM Nodes (NEW - CRITICAL)
├── Auth Audit Logs
├── Settings
│   ├── General Settings
│   └── Report Settings (NEW)
└── Tools (superadmin/developer only)
    ├── SatuSehat Monitor
    ├── DICOM Viewer (Upload)
    ├── DICOM Viewer Demo
    ├── DICOM UID Generator
    └── Debug Storage (Dev only)
```

---

## 📊 Statistics

### Current State
- **Total Routes**: 45
- **Menu Items**: 19 (42%)
- **Hidden but Accessible**: 13 (29%)
- **Form Pages**: 6 (13%)
- **Special Pages**: 4 (9%)
- **Deprecated**: 4 (9%)

### After Implementation
- **Menu Items**: 24 (53%)
- **Hidden but Accessible**: 13 (29%)
- **Form Pages**: 6 (13%)
- **Special Pages**: 4 (9%)
- **Deprecated**: 0 (0%) - DELETED

---

## 🎯 Success Criteria

### Phase 1 Complete When:
- ✅ Modalities accessible from menu
- ✅ DICOM Nodes accessible from menu
- ✅ DICOM Upload accessible from menu
- ✅ All permissions working
- ✅ No broken links

### Phase 2 Complete When:
- ✅ Settings submenu created
- ✅ Report Settings accessible
- ✅ Order Workflow accessible
- ✅ Navigation tested

### Phase 3 Complete When:
- ✅ All deprecated files deleted
- ✅ Build successful
- ✅ Documentation updated
- ✅ Code clean

---

**Document Version**: 1.0  
**Created**: November 17, 2025  
**Status**: Analysis Complete - Ready for Implementation
