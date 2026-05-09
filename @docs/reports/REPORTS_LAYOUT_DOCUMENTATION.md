# Reports Layout Documentation

## Overview

Sistem laporan telah diperbarui dengan layout yang lebih terorganisir dan user-friendly. Struktur baru mencakup sidebar navigasi khusus untuk reports dengan menu yang dapat dikembangkan/dikecilkan.

## Struktur File

### Components
- **`src/components/layout/ReportsLayout.jsx`** - Layout utama untuk halaman reports dengan sidebar navigasi
- **`src/components/layout/NavigationMenu.jsx`** - Komponen menu navigasi utama dengan submenu untuk reports

### Pages
- **`src/pages/Reports/ReportsWrapper.jsx`** - Wrapper untuk nested routes reports
- **`src/pages/Reports/Dashboard.jsx`** - Dashboard utama reports (placeholder)
- **`src/pages/reports/ReportsDashboard.jsx`** - Dashboard laporan dengan statistik
- **`src/pages/reports/RegistrationReport.jsx`** - Laporan pendaftaran order
- **`src/pages/reports/ModalityReport.jsx`** - Laporan utilisasi modalitas
- **`src/pages/reports/SatusehatReport.jsx`** - Laporan status sinkronisasi SATUSEHAT
- **`src/pages/reports/WorklistReport.jsx`** - Laporan statistik workflow
- **`src/pages/reports/StorageReport.jsx`** - Laporan penggunaan storage
- **`src/pages/reports/ProductivityReport.jsx`** - Laporan performa dokter & operator
- **`src/pages/reports/AuditReport.jsx`** - Laporan aktivitas sistem

## Routing Structure

```
/reports (ReportsWrapper)
├── /reports/dashboard (ReportsDashboard)
├── /reports/registration (RegistrationReport)
├── /reports/modality (ModalityReport)
├── /reports/satusehat (SatusehatReport)
├── /reports/worklist (WorklistReport)
├── /reports/storage (StorageReport)
├── /reports/productivity (ProductivityReport)
└── /reports/audit (AuditReport)
```

## Features

### ReportsLayout Component

**Props:**
- `children` - Konten halaman yang akan ditampilkan

**Features:**
- Sidebar yang dapat dikembangkan/dikecilkan
- Menu navigasi dengan deskripsi untuk setiap laporan
- Indikator halaman aktif
- Tombol kembali ke dashboard
- Responsive design

**Menu Items:**
1. Dashboard - Ringkasan semua laporan
2. Laporan Pendaftaran - Statistik pendaftaran order
3. Laporan Modality - Utilisasi modalitas
4. Laporan SATUSEHAT - Status sinkronisasi
5. Laporan Worklist - Statistik workflow
6. Laporan Storage - Penggunaan storage
7. Laporan Produktivitas - Performa dokter & operator
8. Laporan Audit - Aktivitas sistem

### ReportsDashboard Component

**Features:**
- Statistik ringkasan (Total Orders, Orders Hari Ini, Completed Studies, Pending Orders)
- Trend indicator untuk setiap statistik
- Quick links ke semua laporan tersedia
- Loading state dan error handling

## Permission System

Semua halaman reports dilindungi dengan permission check:
- `report.view` - Izin untuk melihat laporan
- `storage.view` - Izin tambahan untuk laporan storage
- `audit.view` - Izin tambahan untuk laporan audit
- `*` - Superadmin dapat mengakses semua

## Styling

Layout menggunakan Tailwind CSS dengan color scheme:
- **Primary**: Blue (active states)
- **Background**: White/Gray
- **Text**: Gray-900 (primary), Gray-600 (secondary)
- **Borders**: Gray-200

### Responsive Breakpoints
- Mobile: Full width
- Tablet (md): Sidebar 64px (collapsed) atau 256px (expanded)
- Desktop (lg): Same as tablet

## Usage

### Mengakses Reports
1. Dari main navigation menu, klik "Reports"
2. Atau navigasi langsung ke `/reports`
3. Sidebar akan menampilkan semua laporan tersedia

### Navigasi Antar Laporan
- Klik menu item di sidebar untuk berpindah ke laporan lain
- Klik tombol "Kembali" untuk kembali ke dashboard utama
- Sidebar dapat dikecilkan untuk lebih banyak ruang konten

## Integration Points

### Main Navigation Menu
File `src/components/layout/NavigationMenu.jsx` sudah terintegrasi dengan struktur reports:
- Section "Reports & Analytics" dengan submenu
- Setiap submenu item mengarah ke halaman reports yang sesuai

### App Routing
File `src/App.jsx` sudah dikonfigurasi dengan:
- ReportsWrapper sebagai parent route
- Nested routes untuk setiap halaman reports
- Permission checks untuk setiap route

## Future Enhancements

1. **Export Functionality** - Export laporan ke PDF/Excel
2. **Scheduling** - Jadwalkan laporan untuk dikirim via email
3. **Custom Reports** - Builder untuk membuat laporan custom
4. **Report Filters** - Filter laporan berdasarkan date range, department, dll
5. **Report Caching** - Cache hasil laporan untuk performa lebih baik
6. **Real-time Updates** - WebSocket untuk update real-time

## Troubleshooting

### Sidebar tidak muncul
- Pastikan `usePermissions` hook tersedia
- Cek permission user di database

### Menu items tidak muncul
- Verifikasi permission user
- Cek console untuk error messages

### Styling tidak benar
- Pastikan Tailwind CSS sudah dikonfigurasi
- Clear browser cache

## Related Files

- `.kiro/specs/comprehensive-reports/` - Spec documentation
- `src/services/reportService.js` - Report data service
- `src/hooks/usePermissions.js` - Permission checking hook
