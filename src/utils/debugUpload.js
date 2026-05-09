/**
 * Debug Upload Utility
 * Helper functions untuk debug masalah file upload
 */

/**
 * Inspect all uploaded files in localStorage
 */
export function inspectAllUploadedFiles() {
  console.log('=== UPLOAD FILES DEBUG ===')

  const results = {}
  let totalFiles = 0

  // Scan all localStorage keys for order_files_*
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)

    if (key && key.startsWith('order_files_')) {
      const orderId = key.replace('order_files_', '')
      const filesStr = localStorage.getItem(key)

      try {
        const files = JSON.parse(filesStr || '[]')
        results[orderId] = {
          count: files.length,
          files: files.map(f => ({
            file_id: f.file_id,
            filename: f.filename,
            size: f.file_size,
            category: f.category,
            uploaded_at: f.uploaded_at,
            hasData: !!f.data
          }))
        }
        totalFiles += files.length
      } catch (e) {
        console.error('Failed to parse files for order:', orderId, e)
        results[orderId] = { error: e.message }
      }
    }
  }

  console.log('Total orders with files:', Object.keys(results).length)
  console.log('Total files:', totalFiles)
  console.log('Details:', results)

  return results
}

/**
 * Inspect files for specific order
 */
export function inspectOrderFiles(orderId) {
  console.log('=== FILES FOR ORDER:', orderId, '===')

  const key = `order_files_${orderId}`
  const filesStr = localStorage.getItem(key)

  if (!filesStr) {
    console.log('❌ No files found in localStorage for this order')
    console.log('Storage key:', key)
    return null
  }

  try {
    const files = JSON.parse(filesStr)
    console.log('✅ Found', files.length, 'file(s)')

    files.forEach((file, index) => {
      console.log(`\nFile ${index + 1}:`, {
        file_id: file.file_id,
        filename: file.filename,
        type: file.file_type,
        size: formatFileSize(file.file_size),
        category: file.category,
        description: file.description,
        uploaded_at: file.uploaded_at,
        hasData: !!file.data,
        dataSize: file.data ? file.data.length : 0,
        _local: file._local
      })
    })

    return files
  } catch (e) {
    console.error('❌ Failed to parse files:', e)
    console.log('Raw data:', filesStr.substring(0, 200) + '...')
    return null
  }
}

/**
 * Clear files for specific order
 */
export function clearOrderFiles(orderId) {
  const key = `order_files_${orderId}`
  const before = localStorage.getItem(key)

  if (!before) {
    console.log('❌ No files to clear for order:', orderId)
    return false
  }

  localStorage.removeItem(key)
  console.log('✅ Cleared files for order:', orderId)

  const files = JSON.parse(before)
  console.log('Removed', files.length, 'file(s)')

  return true
}

/**
 * Clear all uploaded files
 */
export function clearAllUploadedFiles() {
  console.log('=== CLEARING ALL UPLOADED FILES ===')

  let cleared = 0
  const keys = []

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith('order_files_')) {
      keys.push(key)
    }
  }

  keys.forEach(key => {
    localStorage.removeItem(key)
    cleared++
  })

  console.log('✅ Cleared', cleared, 'order file storage(s)')
  return cleared
}

/**
 * Get storage info
 */
export function getStorageInfo() {
  let totalSize = 0
  let fileKeys = 0

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith('order_files_')) {
      const value = localStorage.getItem(key)
      totalSize += value ? value.length : 0
      fileKeys++
    }
  }

  const info = {
    totalKeys: fileKeys,
    totalSize: totalSize,
    totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
    localStorageLimit: '5-10 MB (browser dependent)'
  }

  console.log('=== STORAGE INFO ===')
  console.log(info)

  return info
}

/**
 * Format file size
 */
function formatFileSize(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

/**
 * Export all debug functions to window for console access
 */
export function enableDebugMode() {
  if (typeof window !== 'undefined') {
    window.debugUpload = {
      inspectAll: inspectAllUploadedFiles,
      inspectOrder: inspectOrderFiles,
      clearOrder: clearOrderFiles,
      clearAll: clearAllUploadedFiles,
      storageInfo: getStorageInfo
    }

    console.log('✅ Upload debug mode enabled!')
    console.log('Available commands:')
    console.log('  debugUpload.inspectAll()           - Show all uploaded files')
    console.log('  debugUpload.inspectOrder(orderId)  - Show files for specific order')
    console.log('  debugUpload.clearOrder(orderId)    - Clear files for specific order')
    console.log('  debugUpload.clearAll()             - Clear all uploaded files')
    console.log('  debugUpload.storageInfo()          - Show storage usage')
  }
}

// Auto-enable in development
if (import.meta.env.DEV) {
  enableDebugMode()
}
