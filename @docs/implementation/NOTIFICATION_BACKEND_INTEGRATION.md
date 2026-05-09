# Notification Config Backend Integration

## Ringkasan

Implementasi untuk menyimpan konfigurasi notification ke backend API, dengan fallback ke localStorage jika backend tidak tersedia.

## Tanggal Implementasi

2025-11-28

## File yang Dimodifikasi

### 1. `src/services/settingsService.js`

**Perubahan:**
- Menambahkan `DEFAULT_NOTIFICATION_CONFIG` constant
- Menambahkan fungsi `getNotificationConfig()` untuk load config dari backend
- Menambahkan fungsi `updateNotificationConfig()` untuk save config ke backend
- Export kedua fungsi baru di default export

**Fitur:**
- Backend-first approach dengan fallback ke localStorage
- Caching in-memory untuk mengurangi API calls
- Error handling yang robust
- Auto-sync ke localStorage sebagai backup

**Endpoint Backend:**
- GET `/settings/notification_config` - Load configuration
- PUT `/settings/notification_config` - Save configuration

**Payload Format:**
```json
{
  "key": "notification_config",
  "value": {
    "enabled": false,
    "telegramBotToken": "",
    "notifyOnNewOrder": true,
    "notifyOnStagnantOrder": false,
    "stagnantThresholdMinutes": 60,
    "lastCheckTime": null
  },
  "description": "Notification service configuration for order alerts"
}
```

### 2. `src/services/notificationLogicService.js`

**Perubahan:**
- Import `getNotificationConfig` dan `updateNotificationConfig` dari settingsService
- Mengubah `loadNotificationConfig()` menjadi async function
- Mengubah `saveNotificationConfig()` menjadi async function
- Mengubah `startNotificationService()` menjadi async function
- Menghapus dependency pada `getLocalSettings` dan `saveLocalSettings`

**Fitur:**
- Tetap maintain fallback ke localStorage jika backend gagal
- Service tetap dapat restart otomatis saat config berubah
- Backward compatible dengan localStorage yang sudah ada

### 3. `src/pages/Settings.jsx`

**Perubahan:**
- Update `useEffect` untuk load notification config menjadi async
- Update semua `onChange` handlers yang memanggil `saveNotificationConfig` menjadi async
- Update test telegram notification button handler menjadi async
- Update save settings button handler menjadi async
- Menambahkan Storage Indicator untuk menunjukkan data disimpan di server

**UI Improvements:**
- Added "Server Storage" indicator badge
- Better error handling dengan try-catch blocks
- User feedback yang lebih baik melalui alert messages

## Cara Kerja

### Load Configuration

1. **Primary:** Try load dari backend API (`/settings/notification_config`)
2. **Fallback:** Jika backend gagal, load dari localStorage (`notifications` key)
3. **Default:** Jika kedua gagal, gunakan `DEFAULT_NOTIFICATION_CONFIG`

### Save Configuration

1. **Primary:** Try save ke backend API (`PUT /settings/notification_config`)
2. **Backup:** Auto-save ke localStorage sebagai backup
3. **Fallback:** Jika backend gagal, save hanya ke localStorage

### Auto-restart Service

Service notification akan otomatis restart jika status `enabled` berubah:
- Jika `enabled: true` dan service belum berjalan → Start service
- Jika `enabled: false` dan service sedang berjalan → Stop service

## Testing

### Manual Testing Steps

1. **Test Save to Backend:**
   ```bash
   # Open browser console
   # Navigate to Settings > Notifications
   # Toggle "Enable Notifications"
   # Check network tab for PUT request to /settings/notification_config
   ```

2. **Test Load from Backend:**
   ```bash
   # Refresh page
   # Check network tab for GET request to /settings/notification_config
   # Verify settings are restored correctly
   ```

3. **Test Fallback to localStorage:**
   ```bash
   # Stop backend API
   # Toggle notification settings
   # Verify data saved to localStorage
   # Check browser console for fallback logs
   ```

4. **Test Storage Indicator:**
   ```bash
   # Navigate to Settings > Notifications
   # Verify "Server Storage" badge is visible
   ```

## Backend API Requirements

Backend harus support endpoints berikut:

### GET /settings/notification_config

**Response:**
```json
{
  "setting": {
    "key": "notification_config",
    "value": {
      "enabled": false,
      "telegramBotToken": "",
      "notifyOnNewOrder": true,
      "notifyOnStagnantOrder": false,
      "stagnantThresholdMinutes": 60,
      "lastCheckTime": null
    },
    "description": "Notification service configuration for order alerts",
    "updated_at": "2025-11-28T14:26:01Z"
  }
}
```

### PUT /settings/notification_config

**Request Body:**
```json
{
  "value": {
    "enabled": true,
    "telegramBotToken": "YOUR_BOT_TOKEN",
    "notifyOnNewOrder": true,
    "notifyOnStagnantOrder": false,
    "stagnantThresholdMinutes": 60,
    "lastCheckTime": null
  },
  "description": "Notification service configuration for order alerts"
}
```

**Response:**
```json
{
  "setting": {
    "key": "notification_config",
    "value": {
      "enabled": true,
      "telegramBotToken": "YOUR_BOT_TOKEN",
      "notifyOnNewOrder": true,
      "notifyOnStagnantOrder": false,
      "stagnantThresholdMinutes": 60,
      "lastCheckTime": null
    },
    "description": "Notification service configuration for order alerts",
    "updated_at": "2025-11-28T14:26:01Z"
  }
}
```

## Error Handling

### Backend Errors

- **404 Not Found:** Setting belum ada, akan dibuat saat save
- **409 Conflict:** Setting sudah ada (handled by PUT endpoint)
- **500 Server Error:** Fallback ke localStorage
- **Network Error:** Fallback ke localStorage

### localStorage Errors

- **QuotaExceededError:** Log error, notify user
- **SecurityError:** Log error, notify user
- **Parse Error:** Use default config

## Migration Notes

### Migrasi dari localStorage ke Backend

Data yang sudah ada di localStorage akan:
1. Tetap digunakan sebagai fallback
2. Auto-sync ke backend saat pertama kali save
3. Tidak dihapus dari localStorage (sebagai backup)

### Backward Compatibility

- Support old data format di localStorage
- No breaking changes untuk existing users
- Graceful degradation jika backend tidak tersedia

## Security Considerations

1. **Telegram Bot Token:**
   - Disimpan di backend dengan encryption (recommended)
   - Tidak di-expose di client-side logs
   - Hanya visible untuk user yang login

2. **Authentication:**
   - Semua API calls menggunakan Bearer token
   - Token dari auth service (`/login`)
   - Auto-refresh token jika expired

3. **Authorization:**
   - Only authenticated users dapat save/load notification config
   - RBAC permission: `setting:read`, `setting:write`

## Performance Optimization

1. **Caching:**
   - In-memory cache untuk mengurangi API calls
   - Cache invalidation saat config berubah
   - Cache TTL: unlimited (manual invalidation only)

2. **Network:**
   - Debounce save operations (handled by user action)
   - Batch updates (future enhancement)
   - Compression (handled by HTTP layer)

## Future Enhancements

1. **Real-time Sync:**
   - WebSocket untuk sync config antar devices
   - Conflict resolution untuk concurrent edits

2. **Versioning:**
   - Config version tracking
   - Rollback ke previous versions
   - Audit trail untuk config changes

3. **Multi-tenant:**
   - Per-user notification preferences
   - Organization-level defaults
   - Role-based default configs

## Backup & Recovery

### Backup Location

Backup dibuat di: `backups/notification-backend-integration-20251128-213934/`

**Files backed up:**
- `notificationLogicService.js`
- `settingsService.js`
- `Settings.jsx`

### Recovery Steps

Jika perlu rollback:
```bash
# Copy backup files back
cp backups/notification-backend-integration-20251128-213934/notificationLogicService.js src/services/
cp backups/notification-backend-integration-20251128-213934/settingsService.js src/services/
cp backups/notification-backend-integration-20251128-213934/Settings.jsx src/pages/
```

## Support & Troubleshooting

### Common Issues

1. **"Failed to save notification config"**
   - Check backend API is running
   - Verify authentication token is valid
   - Check network connectivity

2. **Settings tidak persist setelah refresh**
   - Check browser console for errors
   - Verify backend API response
   - Check localStorage quota

3. **Storage indicator tidak muncul**
   - Clear browser cache
   - Hard reload (Ctrl+Shift+R)
   - Check React component rendering

### Debug Mode

Enable debug logging:
```javascript
// In browser console
localStorage.setItem('debug', 'settingsService,notificationLogicService');
```

## Contact

Untuk pertanyaan atau issues, silakan buat ticket di project repository.

---

**Author:** Claude AI Assistant
**Date:** 2025-11-28
**Version:** 1.0.0
