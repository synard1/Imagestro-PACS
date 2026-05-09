# Reports Layout - Visual Mockup

## Desktop View (Expanded Sidebar)

```
┌─────────────────────────────────────────────────────────────────┐
│ MWL-PACS                                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┬──────────────────────────────────────────┐   │
│  │              │                                          │   │
│  │ LAPORAN      │  Dashboard Laporan                      │   │
│  │ ┌──────────┐ │  Ringkasan statistik sistem PACS        │   │
│  │ │ Dashboard│ │                                          │   │
│  │ └──────────┘ │  ┌─────────┬─────────┬─────────┬─────┐  │   │
│  │              │  │ Total   │ Orders  │Completed│Pend │  │   │
│  │ ┌──────────┐ │  │ Orders  │ Hari    │ Studies │ ing │  │   │
│  │ │ Laporan  │ │  │ 1,234   │ Ini    │ 567     │ 89  │  │   │
│  │ │Pendaftaran│ │  │ ↑ 12%   │ 45     │ ↑ 8%    │ ↑ 3%│  │   │
│  │ └──────────┘ │  │         │ ↑ 5%   │         │     │  │   │
│  │              │  └─────────┴─────────┴─────────┴─────┘  │   │
│  │ ┌──────────┐ │                                          │   │
│  │ │ Laporan  │ │  Laporan Tersedia                       │   │
│  │ │ Modality │ │  ┌──────────┐ ┌──────────┐ ┌────────┐  │   │
│  │ └──────────┘ │  │Pendaftaran│ │ Modality │ │Worklist│  │   │
│  │              │  └──────────┘ └──────────┘ └────────┘  │   │
│  │ ┌──────────┐ │  ┌──────────┐ ┌──────────┐ ┌────────┐  │   │
│  │ │ Laporan  │ │  │ Storage  │ │Produktiv │ │ Audit  │  │   │
│  │ │SATUSEHAT │ │  │          │ │ itas     │ │        │  │   │
│  │ └──────────┘ │  └──────────┘ └──────────┘ └────────┘  │   │
│  │              │                                          │   │
│  │ ┌──────────┐ │                                          │   │
│  │ │ Laporan  │ │                                          │   │
│  │ │ Worklist │ │                                          │   │
│  │ └──────────┘ │                                          │   │
│  │              │                                          │   │
│  │ ┌──────────┐ │                                          │   │
│  │ │ Laporan  │ │                                          │   │
│  │ │ Storage  │ │                                          │   │
│  │ └──────────┘ │                                          │   │
│  │              │                                          │   │
│  │ ┌──────────┐ │                                          │   │
│  │ │Produktiv │ │                                          │   │
│  │ │ itas     │ │                                          │   │
│  │ └──────────┘ │                                          │   │
│  │              │                                          │   │
│  │ ┌──────────┐ │                                          │   │
│  │ │ Laporan  │ │                                          │   │
│  │ │  Audit   │ │                                          │   │
│  │ └──────────┘ │                                          │   │
│  │              │                                          │   │
│  │ ┌──────────┐ │                                          │   │
│  │ │ Kembali  │ │                                          │   │
│  │ └──────────┘ │                                          │   │
│  │              │                                          │   │
│  └──────────────┴──────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Desktop View (Collapsed Sidebar)

```
┌─────────────────────────────────────────────────────────────────┐
│ MWL-PACS                                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──┬──────────────────────────────────────────────────────┐   │
│  │📊│  Dashboard Laporan                                   │   │
│  │  │  Ringkasan statistik sistem PACS                    │   │
│  ├──┤                                                      │   │
│  │📄│  ┌─────────┬─────────┬─────────┬─────┐             │   │
│  │  │  │ Total   │ Orders  │Completed│Pend │             │   │
│  ├──┤  │ Orders  │ Hari    │ Studies │ ing │             │   │
│  │💻│  │ 1,234   │ Ini    │ 567     │ 89  │             │   │
│  │  │  │ ↑ 12%   │ 45     │ ↑ 8%    │ ↑ 3%│             │   │
│  ├──┤  │         │ ↑ 5%   │         │     │             │   │
│  │☁️ │  └─────────┴─────────┴─────────┴─────┘             │   │
│  │  │                                                      │   │
│  ├──┤  Laporan Tersedia                                   │   │
│  │📋│  ┌──────────┐ ┌──────────┐ ┌────────┐             │   │
│  │  │  │Pendaftaran│ │ Modality │ │Worklist│             │   │
│  ├──┤  └──────────┘ └──────────┘ └────────┘             │   │
│  │💾│  ┌──────────┐ ┌──────────┐ ┌────────┐             │   │
│  │  │  │ Storage  │ │Produktiv │ │ Audit  │             │   │
│  ├──┤  │          │ │ itas     │ │        │             │   │
│  │👥│  └──────────┘ └──────────┘ └────────┘             │   │
│  │  │                                                      │   │
│  ├──┤                                                      │   │
│  │🔐│                                                      │   │
│  │  │                                                      │   │
│  ├──┤                                                      │   │
│  │⬅️ │                                                      │   │
│  │  │                                                      │   │
│  └──┴──────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Mobile View

```
┌──────────────────────────┐
│ MWL-PACS                 │
├──────────────────────────┤
│ ☰                        │
├──────────────────────────┤
│                          │
│ Dashboard Laporan        │
│ Ringkasan statistik      │
│                          │
│ ┌────────────────────┐   │
│ │ Total Orders       │   │
│ │ 1,234              │   │
│ │ ↑ 12% dari kemarin │   │
│ └────────────────────┘   │
│                          │
│ ┌────────────────────┐   │
│ │ Orders Hari Ini    │   │
│ │ 45                 │   │
│ │ ↑ 5% dari kemarin  │   │
│ └────────────────────┘   │
│                          │
│ ┌────────────────────┐   │
│ │ Completed Studies  │   │
│ │ 567                │   │
│ │ ↑ 8% dari kemarin  │   │
│ └────────────────────┘   │
│                          │
│ ┌────────────────────┐   │
│ │ Pending Orders     │   │
│ │ 89                 │   │
│ │ ↑ 3% dari kemarin  │   │
│ └────────────────────┘   │
│                          │
│ Laporan Tersedia         │
│                          │
│ ┌────────────────────┐   │
│ │ Laporan Pendaftaran│   │
│ │ Statistik          │   │
│ │ pendaftaran order  │   │
│ └────────────────────┘   │
│                          │
│ ┌────────────────────┐   │
│ │ Laporan Modality   │   │
│ │ Utilisasi modalitas│   │
│ └────────────────────┘   │
│                          │
│ [More items...]          │
│                          │
└──────────────────────────┘
```

## Mobile Sidebar (Expanded)

```
┌──────────────────────────┐
│ Laporan              ✕   │
├──────────────────────────┤
│ 📊 Dashboard             │
│    Ringkasan semua       │
│                          │
│ 📄 Laporan Pendaftaran   │
│    Statistik pendaftaran │
│                          │
│ 💻 Laporan Modality      │
│    Utilisasi modalitas   │
│                          │
│ ☁️  Laporan SATUSEHAT    │
│    Status sinkronisasi   │
│                          │
│ 📋 Laporan Worklist      │
│    Statistik workflow    │
│                          │
│ 💾 Laporan Storage       │
│    Penggunaan storage    │
│                          │
│ 👥 Laporan Produktivitas │
│    Performa dokter       │
│                          │
│ 🔐 Laporan Audit         │
│    Aktivitas sistem      │
│                          │
├──────────────────────────┤
│ ⬅️  Kembali              │
└──────────────────────────┘
```

## Menu Item States

### Active State
```
┌─────────────────────────┐
│ 📊 Dashboard            │
│    Ringkasan semua      │
│    laporan              │
└─────────────────────────┘
  ↑ Blue background, blue text, left border
```

### Inactive State
```
┌─────────────────────────┐
│ 📄 Laporan Pendaftaran  │
│    Statistik pendaftaran│
│    order                │
└─────────────────────────┘
  ↑ Gray text, hover effect
```

## Stat Card

```
┌──────────────────────────┐
│ Total Orders        📊   │
│ 1,234                    │
│ ↑ 12% dari kemarin       │
└──────────────────────────┘
  Blue background, blue text
```

## Quick Link Card

```
┌──────────────────────────┐
│ 📄                       │
│ Laporan Pendaftaran      │
│ Statistik pendaftaran    │
│ order                    │
└──────────────────────────┘
  Hover: Blue border, blue background
```

## Loading State

```
┌──────────────────────────┐
│                          │
│      ⟳ (spinning)        │
│                          │
│    Memuat data...        │
│                          │
└──────────────────────────┘
```

## Error State

```
┌──────────────────────────┐
│ ⚠️  Error                │
│ Gagal memuat statistik   │
│ dashboard                │
│                          │
│ [Retry Button]           │
└──────────────────────────┘
  Red background, red text
```

## Color Reference

- **Active Blue**: #3B82F6
- **Active Background**: #EFF6FF
- **Text Primary**: #111827
- **Text Secondary**: #4B5563
- **Border**: #E5E7EB
- **Background**: #FFFFFF
- **Error Red**: #DC2626
- **Success Green**: #16A34A

## Responsive Breakpoints

- **Mobile**: < 768px (full width sidebar)
- **Tablet**: 768px - 1024px (collapsible)
- **Desktop**: > 1024px (full sidebar)

## Animation Timings

- **Sidebar Toggle**: 300ms
- **Hover Effects**: 150ms
- **Loading Spinner**: 1s rotation
- **Transitions**: ease-in-out

---

**Note**: This is a visual representation. Actual implementation uses Tailwind CSS and React components.
