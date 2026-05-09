# Auto Connection Test Fix

## Masalah
Saat halaman di-refresh, status connection menunjukkan "Unknown" karena connection test belum dijalankan secara otomatis.

## Solusi
Menambahkan auto-test connection effect yang:
1. Berjalan saat systems selesai di-load
2. Otomatis test semua sistem yang aktif
3. Hanya berjalan sekali saat pertama kali load (menggunakan `Object.keys(connectionStatuses).length === 0`)
4. Tidak menampilkan toast notification (silent test)
5. Update status connection untuk setiap sistem

## Implementasi

### Auto-Test Effect
```javascript
useEffect(() => {
  if (crud.systems.length > 0 && !loading && Object.keys(connectionStatuses).length === 0) {
    const testConnections = async () => {
      for (const system of crud.systems) {
        if (system.is_active) {
          try {
            let result;
            if (isMockMode) {
              result = await mockExternalSystemsService.testConnection(system.id);
            } else {
              result = await testRealConnection(system.id);
            }
            setConnectionStatuses(prev => ({
              ...prev,
              [system.id]: result.success ? 'connected' : 'disconnected',
            }));
          } catch (error) {
            setConnectionStatuses(prev => ({
              ...prev,
              [system.id]: 'disconnected',
            }));
          }
        }
      }
    };
    testConnections();
  }
}, [crud.systems.length, loading, isMockMode]);
```

### Kondisi Eksekusi
- `crud.systems.length > 0`: Ada data sistem yang sudah di-load
- `!loading`: Tidak sedang loading data
- `Object.keys(connectionStatuses).length === 0`: Belum ada status connection yang di-test (hanya berjalan sekali)

### Fitur
- ✅ Auto-test semua sistem aktif saat load
- ✅ Hanya berjalan sekali (tidak infinite loop)
- ✅ Silent test (tidak menampilkan toast)
- ✅ Respects mock mode
- ✅ Error handling untuk setiap sistem

## Testing

1. **Refresh halaman**
   - Verifikasi status connection berubah dari "Unknown" menjadi "Connected" atau "Disconnected"
   - Tidak ada toast notification yang muncul

2. **Klik tombol "Reload Data"**
   - Verifikasi status connection tetap sama (tidak di-reset)
   - Tidak ada auto-test yang berjalan lagi

3. **Klik tombol "Test" manual**
   - Verifikasi toast notification muncul
   - Status connection ter-update

## File yang Dimodifikasi
- `src/pages/ExternalSystems/ExternalSystemsList.jsx`
  - Tambah auto-test connection effect setelah handleTestConnection
  - Effect berjalan saat systems di-load
  - Silent test tanpa toast notification
