# Quick Test Guide - Critical Menu Fix

**Date**: November 17, 2025  
**Purpose**: Test the 5 new critical menu items

---

## 🚀 Quick Start

### 1. Start the Application
```bash
npm run dev
```

### 2. Login
- Use your credentials (e.g., superadmin/developer role for full access)

---

## ✅ Test Checklist (5 minutes)

### Test 1: Modalities Menu ✨ NEW
**Steps**:
1. Click **Master Data** in sidebar
2. Look for **Modalities** menu item
3. Click **Modalities**

**Expected**:
- ✅ Page loads: `/modalities`
- ✅ Shows list of modalities (CT, MR, CR, US, etc.)
- ✅ Can view/edit modalities

**If fails**: Check console for errors

---

### Test 2: DICOM Nodes Menu ✨ NEW
**Steps**:
1. Click **Master Data** in sidebar
2. Look for **DICOM Nodes** menu item
3. Click **DICOM Nodes**

**Expected**:
- ✅ Page loads: `/dicom-nodes`
- ✅ Shows list of DICOM nodes
- ✅ Can view/edit nodes (AE Title, IP, Port)

**If fails**: Check console for errors

---

### Test 3: Upload DICOM Menu ✨ NEW
**Steps**:
1. Click **Studies** in sidebar (should show dropdown arrow ▼)
2. Menu expands showing:
   - Study List
   - Upload DICOM ✨
3. Click **Upload DICOM**

**Expected**:
- ✅ Page loads: `/upload`
- ✅ Shows DICOM upload interface
- ✅ Can select and upload DICOM files

**If fails**: Check if Studies menu has dropdown

---

### Test 4: Order Workflow Menu ✨ NEW
**Steps**:
1. Click **Orders** in sidebar (should show dropdown arrow ▼)
2. Menu expands showing:
   - Order List
   - Workflow Guide ✨
3. Click **Workflow Guide**

**Expected**:
- ✅ Page loads: `/orders/workflow`
- ✅ Shows workflow documentation
- ✅ Displays workflow diagram

**If fails**: Check if Orders menu has dropdown

---

### Test 5: Report Settings Menu ✨ NEW
**Steps**:
1. Click **Settings** in sidebar (should show dropdown arrow ▼)
2. Menu expands showing:
   - General Settings
   - Report Settings ✨
3. Click **Report Settings**

**Expected**:
- ✅ Page loads: `/settings/reports`
- ✅ Shows report configuration options
- ✅ Can modify report templates, fonts, etc.

**If fails**: Check if Settings menu has dropdown

---

## 🎯 Visual Verification

### Menu Structure Should Look Like:
```
MWL / mini-PACS
├── Dashboard
├── Worklist
├── Orders ▼                    ← Should have dropdown arrow
│   ├── Order List
│   └── Workflow Guide ✨       ← NEW
├── Reports (PDF)
├── Studies ▼                   ← Should have dropdown arrow
│   ├── Study List
│   └── Upload DICOM ✨         ← NEW
├── Master Data ▼
│   ├── Patients
│   ├── Doctors
│   ├── User Management ▼
│   ├── Procedures
│   ├── Procedure Mappings
│   ├── External Systems (Docs)
│   ├── Modalities ✨           ← NEW (uncommented)
│   └── DICOM Nodes ✨          ← NEW (uncommented)
├── Auth Audit Logs
├── Settings ▼                  ← Should have dropdown arrow
│   ├── General Settings
│   └── Report Settings ✨      ← NEW
└── Tools ▼
    └── ... (if superadmin/developer)
```

---

## 🐛 Troubleshooting

### Issue: Menu items not showing
**Solution**: 
- Check user role/permissions
- Modalities requires: `modality.manage` or `modality.view`
- DICOM Nodes requires: `node.manage` or `node.view`
- Upload DICOM requires: `studies.upload` or `study.*` or `*`

### Issue: Dropdown not expanding
**Solution**:
- Click the menu label (not the arrow)
- Check browser console for JavaScript errors
- Refresh page (Ctrl+R)

### Issue: Page not found (404)
**Solution**:
- Check if route exists in `src/App.jsx`
- Verify URL matches exactly
- Check browser console for routing errors

### Issue: Permission denied
**Solution**:
- Login with appropriate role
- Check permission configuration
- Contact admin to grant permissions

---

## 📊 Quick Verification Commands

### Check if files exist:
```bash
# Windows PowerShell
Test-Path src/pages/Modalities.jsx
Test-Path src/pages/DicomNodes.jsx
Test-Path src/pages/DicomUploadPage.jsx
Test-Path src/pages/OrderWorkflow.jsx
Test-Path src/pages/settings/ReportSettings.jsx
```

### Check for syntax errors:
```bash
npm run build
```

---

## ✅ Success Criteria

All tests pass when:
- [ ] All 5 new menu items visible
- [ ] All 5 pages load without errors
- [ ] Submenus expand/collapse correctly
- [ ] Permissions work as expected
- [ ] No console errors
- [ ] Navigation smooth and responsive

---

## 🎉 If All Tests Pass

**Congratulations!** 🎊

All critical menu items are now accessible. The system is ready for production use!

**Next steps**:
1. Test with different user roles
2. Verify on different browsers
3. Check mobile responsiveness
4. Update user documentation

---

## 📝 Report Issues

If you find any issues:
1. Note the exact steps to reproduce
2. Check browser console for errors
3. Take screenshots if helpful
4. Document expected vs actual behavior

---

**Document Version**: 1.0  
**Created**: November 17, 2025  
**Estimated Test Time**: 5 minutes
