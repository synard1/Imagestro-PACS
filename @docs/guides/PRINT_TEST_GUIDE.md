# 🖨️ Print Report - Quick Test Guide

## ⚡ Quick Test (2 minutes)

### Step 1: Start Server
Server sudah running di: **http://localhost:5173**

### Step 2: Navigate to Report
1. Buka browser: http://localhost:5173/studies
2. Cari study "John Doe" (CT Brain)
3. Klik tombol **Report** (ikon dokumen)

### Step 3: Fill Report
Template "CT Brain Report" akan auto-selected. Isi sections:

**Clinical Information:**
```
Patient presents with persistent headache for 2 weeks.
Rule out intracranial pathology.
```

**Findings:**
```
Brain parenchyma: Normal gray-white matter differentiation.
No acute hemorrhage, mass effect, or midline shift.
Ventricles: Normal size and configuration.
Sulci: Normal prominence.
Basal cisterns: Patent.
No extra-axial collections.
Visualized paranasal sinuses: Clear.
```

**Impression:**
```
1. Normal CT brain study.
2. No acute intracranial abnormality.
```

### Step 4: Print
1. Klik tombol **Print** (ikon printer di header)
2. Print preview akan muncul

### ✅ Expected Result:
Print preview menampilkan:
- ✅ Header: "CT BRAIN REPORT"
- ✅ Patient info table (Name, ID, Date, etc.)
- ✅ Section "CLINICAL INFORMATION" dengan isi
- ✅ Section "FINDINGS" dengan isi
- ✅ Section "IMPRESSION" dengan isi
- ✅ Footer: Report date, Radiologist, Institution
- ✅ Professional black text on white background
- ✅ NO blank page!

### ❌ If Still Blank:
1. Check browser console (F12) for errors
2. Try different browser (Chrome/Edge/Firefox)
3. Clear browser cache (Ctrl+Shift+Delete)
4. Restart dev server

## 🎯 Visual Checklist

When print preview opens, you should see:

```
┌────────────────────────────────────────┐
│ CT BRAIN REPORT                        │ ← Title visible
│ ────────────────────────────────────── │
│ Patient Name:    John Doe              │ ← Info table
│ Patient ID:      P001                  │
│ Study Date:      2024-01-15            │
│ Modality:        CT                    │
│ ...                                    │
├────────────────────────────────────────┤
│ CLINICAL INFORMATION                   │ ← Section header
│   Patient presents with...             │ ← Your content
│                                        │
│ FINDINGS                               │ ← Section header
│   Brain parenchyma: Normal...          │ ← Your content
│                                        │
│ IMPRESSION                             │ ← Section header
│   1. Normal CT brain study.            │ ← Your content
│                                        │
├────────────────────────────────────────┤
│ Report Date: November 16, 2025 10:30   │ ← Footer
│ Radiologist: Dr. Admin                 │
│ Institution: General Hospital          │
└────────────────────────────────────────┘
```

## 🔍 Troubleshooting

### Issue: Still seeing blank page
**Solution 1**: Hard refresh
- Windows: `Ctrl + Shift + R`
- Mac: `Cmd + Shift + R`

**Solution 2**: Check print settings
- Ensure "Background graphics" is enabled
- Check page orientation (Portrait)
- Verify margins are set

**Solution 3**: Browser-specific
- Chrome: Try "Print using system dialog"
- Firefox: Check "Print backgrounds"
- Edge: Enable "Background graphics"

### Issue: Content cut off
**Solution**: Adjust print margins in print dialog

### Issue: Wrong font/styling
**Solution**: Clear browser cache and reload

## 📱 Test on Different Browsers

- [ ] Chrome/Edge (Chromium)
- [ ] Firefox
- [ ] Safari (if on Mac)
- [ ] Print to PDF

## 🎉 Success Indicators

You'll know it's working when:
1. ✅ Print preview opens immediately
2. ✅ Content is visible (not blank)
3. ✅ Layout looks professional
4. ✅ All sections are present
5. ✅ No web UI elements visible
6. ✅ Black text on white background
7. ✅ Proper spacing and margins

---

**Current Status**: Server running at http://localhost:5173  
**Ready to test**: YES ✅  
**Estimated test time**: 2 minutes
