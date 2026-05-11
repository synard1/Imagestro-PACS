import { apiClient } from './http'
import { loadRegistry } from './api-registry'
import { onNotify } from './notifications'
import { logger } from '../utils/logger'
import { getAuthHeader } from './auth-storage'
import { addCSRFHeader } from '../utils/csrf'

/**
 * Upload Service
 * Handles file uploads for exam results and attachments
 * Supports multiple storage backends (localStorage, server, external API)
 */
export class UploadService {
  constructor() {
    // Maximum file size (configurable via env, default: 50MB)
    this.maxFileSize = parseInt(import.meta.env.VITE_MAX_FILE_SIZE) || 50 * 1024 * 1024

    // Maximum files per upload session (configurable via env, default: 20)
    this.maxFilesPerUpload = parseInt(import.meta.env.VITE_MAX_FILES_PER_UPLOAD) || 20

    // Maximum total upload size per session (configurable via env, default: 500MB)
    this.maxTotalUploadSize = parseInt(import.meta.env.VITE_MAX_TOTAL_UPLOAD_SIZE) || 500 * 1024 * 1024

    // Maximum total files per order (configurable via env, default: 100)
    this.maxFilesPerOrder = parseInt(import.meta.env.VITE_MAX_FILES_PER_ORDER) || 100

    // Allowed file types per category
    this.allowedTypes = {
      'exam_result': [
        'image/jpeg',
        'image/png',
        'image/gif',
        'application/pdf',
        'application/dicom',
        'image/dicom+jpeg',
        'image/dicom+rle'
      ],
      'lab_result': [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'text/plain',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ],
      'report': [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain'
      ],
      'consent_form': [
        'application/pdf',
        'image/jpeg',
        'image/png'
      ],
      'other': ['*']
    }

    // File size limits per type (in bytes, configurable via env)
    this.typeLimits = {
      'application/pdf': parseInt(import.meta.env.VITE_MAX_PDF_SIZE) || 20 * 1024 * 1024, // Default: 20MB
      'application/dicom': parseInt(import.meta.env.VITE_MAX_DICOM_SIZE) || 100 * 1024 * 1024, // Default: 100MB
      'image/dicom+jpeg': parseInt(import.meta.env.VITE_MAX_DICOM_SIZE) || 100 * 1024 * 1024,
      'image/dicom+rle': parseInt(import.meta.env.VITE_MAX_DICOM_SIZE) || 100 * 1024 * 1024,
      'image/jpeg': parseInt(import.meta.env.VITE_MAX_IMAGE_SIZE) || 10 * 1024 * 1024, // Default: 10MB
      'image/png': parseInt(import.meta.env.VITE_MAX_IMAGE_SIZE) || 10 * 1024 * 1024,
      'image/gif': parseInt(import.meta.env.VITE_MAX_IMAGE_SIZE) || 10 * 1024 * 1024,
      'image/*': parseInt(import.meta.env.VITE_MAX_IMAGE_SIZE) || 10 * 1024 * 1024,
      'application/msword': parseInt(import.meta.env.VITE_MAX_DOCUMENT_SIZE) || 10 * 1024 * 1024, // Default: 10MB
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': parseInt(import.meta.env.VITE_MAX_DOCUMENT_SIZE) || 10 * 1024 * 1024,
      'application/vnd.ms-excel': parseInt(import.meta.env.VITE_MAX_DOCUMENT_SIZE) || 10 * 1024 * 1024,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': parseInt(import.meta.env.VITE_MAX_DOCUMENT_SIZE) || 10 * 1024 * 1024,
      'default': this.maxFileSize
    }
  }

  /**
   * Validate file before upload
   * @param {File} file - File object to validate
   * @param {string} category - File category (exam_result, lab_result, etc.)
   * @returns {Object} { valid: boolean, errors: string[] }
   */
  validateFile(file, category = 'other') {
    const errors = []

    // Check if file exists
    if (!file) {
      errors.push('No file provided')
      return { valid: false, errors }
    }

    // Check file size
    const sizeLimit = this.getFileSizeLimit(file.type)
    if (file.size > sizeLimit) {
      errors.push(`File size (${this.formatFileSize(file.size)}) exceeds maximum of ${this.formatFileSize(sizeLimit)}`)
    }

    // Check if file is empty
    if (file.size === 0) {
      errors.push('File is empty')
    }

    // Check filename
    if (!file.name || file.name.trim() === '') {
      errors.push('Invalid filename')
    }

    // Check for potentially dangerous extensions
    const dangerousExtensions = ['.exe', '.bat', '.cmd', '.sh', '.js', '.msi', '.app', '.deb', '.rpm']
    const ext = this.getFileExtension(file.name).toLowerCase()
    if (dangerousExtensions.includes(ext)) {
      errors.push(`File extension "${ext}" is not allowed for security reasons`)
    }

    // Check file type with extension fallback
    const allowedTypes = this.allowedTypes[category] || this.allowedTypes['other']
    const isTypeValid = this.isTypeAllowed(file.type, allowedTypes)
    const isExtensionValid = this.isExtensionAllowedForCategory(ext, category)

    // For DICOM files, be more lenient - check extension if MIME type fails
    if (!isTypeValid && !isExtensionValid) {
      logger.warn('[Upload] File validation failed:', {
        filename: file.name,
        mimeType: file.type,
        extension: ext,
        category: category,
        size: file.size
      })
      errors.push(`File type "${file.type || 'unknown'}" with extension "${ext}" is not allowed for category "${category}"`)
    } else if (!isTypeValid && isExtensionValid) {
      // Extension is valid but MIME type is not - this is OK for DICOM files
      logger.info('[Upload] File accepted by extension despite MIME type:', {
        filename: file.name,
        mimeType: file.type,
        extension: ext,
        category: category
      })
    }

    return { valid: errors.length === 0, errors }
  }

  /**
   * Check if file extension is allowed for category
   */
  isExtensionAllowedForCategory(extension, category) {
    const extensionMap = {
      'exam_result': ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.dcm', '.dicom'],
      'lab_result': ['.pdf', '.xls', '.xlsx', '.jpg', '.jpeg', '.png', '.txt'],
      'report': ['.pdf', '.doc', '.docx', '.txt'],
      'consent_form': ['.pdf', '.jpg', '.jpeg', '.png'],
      'other': ['*']
    }

    const allowedExtensions = extensionMap[category] || extensionMap['other']

    // Allow all extensions for 'other' category
    if (allowedExtensions.includes('*')) {
      return true
    }

    return allowedExtensions.includes(extension.toLowerCase())
  }

  /**
   * Get file size limit for specific type
   */
  getFileSizeLimit(mimeType) {
    // Check exact match
    if (this.typeLimits[mimeType]) {
      return this.typeLimits[mimeType]
    }

    // Check wildcard match (e.g., image/*)
    const baseType = mimeType.split('/')[0]
    if (this.typeLimits[`${baseType}/*`]) {
      return this.typeLimits[`${baseType}/*`]
    }

    return this.typeLimits.default
  }

  /**
   * Check if file type is allowed
   */
  isTypeAllowed(mimeType, allowedTypes) {
    // Allow all types
    if (allowedTypes.includes('*')) {
      return true
    }

    // Check exact match
    if (allowedTypes.includes(mimeType)) {
      return true
    }

    // Check wildcard match (e.g., image/*)
    const baseType = mimeType.split('/')[0]
    if (allowedTypes.includes(`${baseType}/*`)) {
      return true
    }

    // Special case: DICOM files often have application/octet-stream as MIME type
    // Also accept if MIME type is empty or generic
    if (allowedTypes.includes('application/dicom') ||
        allowedTypes.includes('image/dicom+jpeg') ||
        allowedTypes.includes('image/dicom+rle')) {
      // Accept octet-stream and empty MIME types for DICOM category
      if (mimeType === 'application/octet-stream' ||
          mimeType === '' ||
          !mimeType) {
        return true
      }
    }

    return false
  }

  /**
   * Check if order can accept more files
   * @param {string} orderId - Order ID
   * @param {number} filesToAdd - Number of files to add
   * @returns {Promise<Object>} { canUpload: boolean, existingCount: number, message: string }
   */
  async checkOrderFileLimit(orderId, filesToAdd = 1) {
    try {
      const existingFiles = await this.getOrderFiles(orderId)
      const existingCount = existingFiles.length
      const totalAfterUpload = existingCount + filesToAdd

      if (totalAfterUpload > this.maxFilesPerOrder) {
        return {
          canUpload: false,
          existingCount,
          message: `Cannot upload ${filesToAdd} file(s). Order already has ${existingCount} file(s). Maximum allowed per order is ${this.maxFilesPerOrder} files.`
        }
      }

      return {
        canUpload: true,
        existingCount,
        message: `OK: Order has ${existingCount} files, can add ${filesToAdd} more (limit: ${this.maxFilesPerOrder})`
      }
    } catch (error) {
      logger.warn('[UploadService] Could not check file limit:', error.message)
      // Return true to allow upload if we can't check
      return {
        canUpload: true,
        existingCount: 0,
        message: 'Could not verify file limit'
      }
    }
  }

  /**
   * Upload single file to order
   * @param {string} orderId - Order ID
   * @param {File} file - File to upload
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} Uploaded file metadata
   */
  async uploadToOrder(orderId, file, metadata = {}) {
    try {
      logger.info('[UploadService] Uploading file:', file.name, 'to order:', orderId)

      // Validate file
      const validation = this.validateFile(file, metadata.category)
      if (!validation.valid) {
        const errorMsg = validation.errors.join(', ')
        logger.error('[UploadService] Validation failed:', errorMsg)
        throw new Error(errorMsg)
      }

      // Check order file limit (only if not called from uploadMultiple)
      if (!metadata._skipLimitCheck) {
        const limitCheck = await this.checkOrderFileLimit(orderId, 1)
        if (!limitCheck.canUpload) {
          logger.error('[UploadService]', limitCheck.message)
          throw new Error(limitCheck.message)
        }
        logger.info('[UploadService]', limitCheck.message)
      }

      // Check if orders module has backend enabled
      const registry = loadRegistry()
      const ordersConfig = registry.orders

      if (ordersConfig?.enabled) {
        // Upload to backend API
        return await this.uploadToBackend(orderId, file, metadata, ordersConfig)
      } else {
        // Fallback: Save to localStorage
        return await this.uploadToLocalStorage(orderId, file, metadata)
      }
    } catch (error) {
      logger.error('[UploadService] Upload failed:', error)
      onNotify({ type: 'error', message: `Upload failed: ${error.message}` })
      throw error // Re-throw the error so it can be handled by the caller
    }
  }

  /**
   * Upload file to backend API
   */
  async uploadToBackend(orderId, file, metadata, config) {
    try {
      // Use multipart/form-data as specified in order-files.md
      const formData = new FormData()
      formData.append('file', file)
      
      // Add metadata fields
      if (metadata.category) {
        formData.append('category', metadata.category)
      }
      
      // Add metadata as JSON string
      const metadataObj = {
        description: metadata.description || '',
        uploaded_by: metadata.uploaded_by || 'current_user'
      }
      formData.append('metadata', JSON.stringify(metadataObj))

      // Upload using direct fetch with proper authentication + CSRF
      const authHeaders = getAuthHeader()
      const csrfHeaders = await addCSRFHeader(authHeaders)

      const url = `${config.baseUrl}/orders/${orderId}/files`
      logger.info('[UploadService] Uploading to:', url)

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          ...csrfHeaders  // includes auth + CSRF (no Content-Type — let browser set for FormData)
        },
        body: formData,
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('[UploadService] Backend returned error:', response.status, errorText)
        throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`)
      }

      const result = await response.json()
      logger.info('[UploadService] File uploaded to backend:', result)
      
      // Check if the result contains the expected file data
      if (!result || (!result.file && !result.id)) {
        throw new Error('Invalid response from server: missing file data')
      }
      
      onNotify({ type: 'success', message: `File "${file.name}" uploaded successfully` })

      // Return the file metadata in the format expected by the backend API
      const fileData = result.file || result
      return {
        file_id: fileData.id,
        filename: fileData.filename,
        file_type: fileData.file_type,
        file_size: fileData.size_bytes,
        category: fileData.category,
        uploaded_at: fileData.created_at,
        uploaded_by: fileData.created_by
      }
    } catch (error) {
      logger.error('[UploadService] Backend upload failed:', error)
      
      // Provide more specific error messages
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error(`Failed to connect to server. Please check your network connection and ensure the backend server is running at ${config.baseUrl}. (${error.message})`)
      }
      
      if (error.name === 'AbortError') {
        throw new Error('Upload timed out. Please check your network connection and try again.')
      }
      
      throw error // Re-throw the error instead of falling back to localStorage
    }
  }

  /**
   * Upload file to localStorage (offline mode)
   */
  async uploadToLocalStorage(orderId, file, metadata) {
    try {
      // Read file as base64 for storage
      const base64Data = await this.readFileAsBase64(file)

      // Create file metadata
      const fileData = {
        file_id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        filename: file.name,
        file_type: file.type,
        file_size: file.size,
        category: metadata.category || 'other',
        description: metadata.description || '',
        uploaded_at: new Date().toISOString(),
        uploaded_by: metadata.uploaded_by || 'current_user',
        data: base64Data, // Store base64 data
        _local: true // Flag for local file
      }

      // Get existing files for this order
      const storageKey = `order_files_${orderId}`
      const existingFiles = JSON.parse(localStorage.getItem(storageKey) || '[]')

      // Add new file
      existingFiles.push(fileData)

      // Save to localStorage
      localStorage.setItem(storageKey, JSON.stringify(existingFiles))

      logger.info('[UploadService] File saved to localStorage:', {
        fileId: fileData.file_id,
        orderId: orderId,
        storageKey: storageKey,
        totalFiles: existingFiles.length,
        filename: file.name
      })

      // Verify save was successful
      const verifyFiles = JSON.parse(localStorage.getItem(storageKey) || '[]')
      logger.info('[UploadService] Verification - Total files in storage:', verifyFiles.length)

      onNotify({
        type: 'info',
        message: `File "${file.name}" saved locally (offline mode)`
      })

      return fileData
    } catch (error) {
      logger.error('[UploadService] localStorage upload failed:', error)
      throw new Error(`Failed to save file locally: ${error.message}`)
    }
  }

  /**
   * Read file as base64 string
   */
  readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()

      reader.onload = () => {
        resolve(reader.result)
      }

      reader.onerror = () => {
        reject(new Error('Failed to read file'))
      }

      reader.readAsDataURL(file)
    })
  }

  /**
   * Upload multiple files
   * @param {string} orderId - Order ID
   * @param {File[]} files - Array of files to upload
   * @param {Object} metadata - Shared metadata for all files
   * @returns {Promise<Object>} { results: Array, errors: Array }
   */
  async uploadMultiple(orderId, files, metadata = {}) {
    const results = []
    const errors = []

    logger.info('[UploadService] Uploading', files.length, 'files to order:', orderId)

    // Validate number of files in this upload
    if (files.length > this.maxFilesPerUpload) {
      const errorMsg = `Cannot upload ${files.length} files. Maximum allowed is ${this.maxFilesPerUpload} files per upload.`
      logger.error('[UploadService]', errorMsg)
      throw new Error(errorMsg)
    }

    // Validate total upload size
    const totalSize = files.reduce((sum, file) => sum + file.size, 0)
    if (totalSize > this.maxTotalUploadSize) {
      const errorMsg = `Total upload size (${this.formatFileSize(totalSize)}) exceeds maximum allowed (${this.formatFileSize(this.maxTotalUploadSize)})`
      logger.error('[UploadService]', errorMsg)
      throw new Error(errorMsg)
    }

    // Check total files in order (existing + new)
    try {
      const existingFiles = await this.getOrderFiles(orderId)
      const existingCount = existingFiles.length
      const totalFilesAfterUpload = existingCount + files.length

      if (totalFilesAfterUpload > this.maxFilesPerOrder) {
        const errorMsg = `Cannot upload ${files.length} file(s). Order already has ${existingCount} file(s). Maximum allowed per order is ${this.maxFilesPerOrder} files.`
        logger.error('[UploadService]', errorMsg)
        throw new Error(errorMsg)
      }

      logger.info('[UploadService] Order has', existingCount, 'existing files. After upload:', totalFilesAfterUpload)
    } catch (error) {
      // If we can't check existing files, log warning but continue
      if (error.message.includes('Maximum allowed per order')) {
        // Re-throw limit errors
        throw error
      }
      logger.warn('[UploadService] Could not check existing files count:', error.message)
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i]

      try {
        // Add flag to skip limit check (already checked above)
        const result = await this.uploadToOrder(orderId, file, { ...metadata, _skipLimitCheck: true })
        results.push(result)
        logger.info('[UploadService] Successfully uploaded:', file.name)
      } catch (error) {
        logger.error('[UploadService] Failed to upload file:', file.name, error)
        errors.push({
          filename: file.name,
          error: error.message,
          details: {
            size: file.size,
            type: file.type,
            extension: this.getFileExtension(file.name)
          }
        })
      }
    }

    // Show summary notification with details
    if (errors.length > 0) {
      logger.warn('[UploadService] Upload summary:', {
        success: results.length,
        failed: errors.length,
        errors: errors
      })

      // Show detailed error for first failed file
      const firstError = errors[0]
      const errorDetail = `${firstError.filename}: ${firstError.error}`

      onNotify({
        type: 'error',
        message: errors.length === 1
          ? `Upload failed: ${errorDetail}`
          : `${errors.length} file(s) failed. First error: ${errorDetail}`
      })
    } else if (results.length > 0) {
      onNotify({
        type: 'success',
        message: `Successfully uploaded ${results.length} file(s)`
      })
    }

    return { results, errors }
  }

  /**
   * Get files attached to an order
   * @param {string} orderId - Order ID
   * @returns {Promise<Array>} Array of file metadata
   */
  async getOrderFiles(orderId) {
    try {
      const registry = loadRegistry()
      const ordersConfig = registry.orders

      logger.info('[UploadService] getOrderFiles called for orderId:', orderId)
      logger.info('[UploadService] Registry orders config:', ordersConfig)

      if (ordersConfig?.enabled) {
        try {
          // Get from backend API with proper authentication
          const authHeaders = getAuthHeader()
          const url = `${ordersConfig.baseUrl}/orders/${orderId}/files`
          logger.info('[UploadService] Fetching from backend API:', url)
          
          // Add timeout to fetch request
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout
          
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              ...authHeaders,
              'Content-Type': 'application/json'
            },
            signal: controller.signal
          })
          
          clearTimeout(timeoutId)

          if (!response.ok) {
            const errorText = await response.text()
            logger.error('[UploadService] Backend API error response:', response.status, errorText)
            throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`)
          }

          const result = await response.json()
          logger.info('[UploadService] Backend API returned files:', result)

          // Extract files from the response (could be in result.files or directly in result)
          const files = result.files || (Array.isArray(result) ? result : [])
          
          logger.info('[UploadService] Fetched', files.length, 'files from backend')
          
          // Normalize file metadata to match the expected format
          return files.map(file => ({
            file_id: file.id,
            filename: file.filename,
            file_type: file.file_type,
            file_size: file.size_bytes,
            category: file.category,
            uploaded_at: file.created_at,
            uploaded_by: file.created_by,
            // Include any additional metadata
            ...file
          }))
        } catch (error) {
          logger.error('[UploadService] Failed to fetch from backend:', error)
          
          // Provide more specific error messages
          if (error instanceof TypeError && error.message.includes('fetch')) {
            throw new Error(`Failed to connect to server. Please check your network connection and ensure the backend server is running at ${ordersConfig.baseUrl}. (${error.message})`)
          }
          
          if (error.name === 'AbortError') {
            throw new Error('Request timed out. Please check your network connection and try again.')
          }
          
          throw error
        }
      }

      // Get from localStorage
      const storageKey = `order_files_${orderId}`
      const filesStr = localStorage.getItem(storageKey)
      const files = JSON.parse(filesStr || '[]')

      logger.info('[UploadService] Fetched from localStorage:', {
        orderId: orderId,
        storageKey: storageKey,
        filesCount: files.length,
        rawDataLength: filesStr ? filesStr.length : 0,
        files: files.map(f => ({ id: f.file_id, name: f.filename, size: f.file_size }))
      })

      return files

    } catch (error) {
      logger.error('[UploadService] Failed to get files:', error)
      
      // Provide more specific error messages
      if (error instanceof TypeError && error.message.includes('fetch')) {
        const registry = loadRegistry()
        const ordersConfig = registry.orders
        throw new Error(`Failed to connect to server. Please check your network connection and ensure the backend server is running at ${ordersConfig?.baseUrl || 'unknown'}. (${error.message})`)
      }
      
      if (error.name === 'AbortError') {
        throw new Error('Request timed out. Please check your network connection and try again.')
      }
      
      return []
    }
  }

  /**
   * Download file
   * @param {string} orderId - Order ID
   * @param {string} fileId - File ID
   * @param {string} filename - Original filename
   */
  async downloadFile(orderId, fileId, filename) {
    try {
      logger.info('[UploadService] Downloading file:', fileId)

      const registry = loadRegistry()
      const ordersConfig = registry.orders

      if (ordersConfig?.enabled) {
        try {
          // Download from backend with proper authentication
          const authHeaders = getAuthHeader()
          
          // Use the correct endpoint according to order-files.md documentation:
          // GET /orders/{identifier}/files/{file_id}/content
          const url = `${ordersConfig.baseUrl}/orders/${orderId}/files/${fileId}/content`
          
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              ...authHeaders,
              'Content-Type': 'application/json'
            }
          })

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
          }

          const blob = await response.blob()
          this.downloadBlob(blob, filename)

          onNotify({ type: 'success', message: 'File downloaded' })
          return
        } catch (error) {
          logger.warn('[UploadService] Backend download failed, trying localStorage:', error)
        }
      }

      // Download from localStorage
      const allFiles = this.getAllLocalFiles()
      const file = allFiles.find(f => f.file_id === fileId)

      if (!file || !file.data) {
        throw new Error('File not found in local storage')
      }

      // Convert base64 to blob
      const blob = this.base64ToBlob(file.data)
      this.downloadBlob(blob, filename)

      onNotify({ type: 'success', message: 'File downloaded from local storage' })

    } catch (error) {
      logger.error('[UploadService] Download failed:', error)
      onNotify({ type: 'error', message: `Download failed: ${error.message}` })
    }
  }

  /**
   * Download blob as file
   */
  downloadBlob(blob, filename) {
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
  }

  /**
   * Convert base64 to blob
   */
  base64ToBlob(base64) {
    const parts = base64.split(',')
    const contentType = parts[0].match(/:(.*?);/)[1]
    const raw = window.atob(parts[1])
    const rawLength = raw.length
    const uInt8Array = new Uint8Array(rawLength)

    for (let i = 0; i < rawLength; i++) {
      uInt8Array[i] = raw.charCodeAt(i)
    }

    return new Blob([uInt8Array], { type: contentType })
  }

  /**
   * Get all files from localStorage (across all orders)
   */
  getAllLocalFiles() {
    const allFiles = []

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)

      if (key.startsWith('order_files_')) {
        const files = JSON.parse(localStorage.getItem(key) || '[]')
        allFiles.push(...files)
      }
    }

    return allFiles
  }

  /**
   * Delete file
   * @param {string} orderId - Order ID
   * @param {string} fileId - File ID
   */
  async deleteFile(orderId, fileId) {
    try {
      logger.info('[UploadService] Deleting file:', fileId, 'from order:', orderId)

      const registry = loadRegistry()
      const ordersConfig = registry.orders

      if (ordersConfig?.enabled) {
        try {
          // Delete from backend with authentication + CSRF protection
          const authHeaders = getAuthHeader()
          const csrfHeaders = await addCSRFHeader(authHeaders)

          const url = `${ordersConfig.baseUrl}/orders/${orderId}/files/${fileId}`

          const response = await fetch(url, {
            method: 'DELETE',
            headers: {
              ...csrfHeaders,
              'Content-Type': 'application/json'
            }
          })

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
          }

          onNotify({ type: 'success', message: 'File deleted' })
          return
        } catch (error) {
          logger.warn('[UploadService] Backend delete failed, trying localStorage:', error)
        }
      }

      // Delete from localStorage
      const storageKey = `order_files_${orderId}`
      const files = JSON.parse(localStorage.getItem(storageKey) || '[]')
      const updated = files.filter(f => f.file_id !== fileId)

      localStorage.setItem(storageKey, JSON.stringify(updated))

      logger.info('[UploadService] File deleted from localStorage')
      onNotify({ type: 'success', message: 'File deleted from local storage' })

    } catch (error) {
      logger.error('[UploadService] Delete failed:', error)
      onNotify({ type: 'error', message: `Delete failed: ${error.message}` })
      throw error
    }
  }

  /**
   * Update file metadata
   * @param {string} orderId - Order ID
   * @param {string} fileId - File ID
   * @param {Object} metadata - Updated metadata
   */
  async updateFileMetadata(orderId, fileId, metadata) {
    try {
      logger.info('[UploadService] Updating file metadata:', fileId)

      const registry = loadRegistry()
      const ordersConfig = registry.orders

      if (ordersConfig?.enabled) {
        try {
          // Update on backend with proper authentication
          const authHeaders = getAuthHeader()
          
          // Use the correct endpoint according to order-files.md documentation:
          // There doesn't seem to be a specific endpoint for updating file metadata
          // We'll need to check with the backend API documentation
          // For now, we'll just alert the user that this feature is not implemented
          alert('File metadata update is not yet implemented for server files. This feature is coming soon.')
          return
        } catch (error) {
          logger.warn('[UploadService] Backend update failed:', error)
          throw error
        }
      }

      // Update in localStorage
      const storageKey = `order_files_${orderId}`
      const files = JSON.parse(localStorage.getItem(storageKey) || '[]')
      const fileIndex = files.findIndex(f => f.file_id === fileId)

      if (fileIndex === -1) {
        throw new Error('File not found in local storage')
      }

      // Update file metadata
      files[fileIndex] = { ...files[fileIndex], ...metadata }
      localStorage.setItem(storageKey, JSON.stringify(files))

      logger.info('[UploadService] File metadata updated in localStorage')
      onNotify({ type: 'success', message: 'File metadata updated in local storage' })

    } catch (error) {
      logger.error('[UploadService] Update metadata failed:', error)
      onNotify({ type: 'error', message: `Update failed: ${error.message}` })
      throw error
    }
  }

  /**
   * Fetch file content as blob for preview
   * @param {string} orderId - Order ID
   * @param {string} fileId - File ID
   * @returns {Promise<Blob>} File content as blob
   */
  async fetchFileContent(orderId, fileId) {
    try {
      logger.info('[UploadService] Fetching file content:', fileId)

      const registry = loadRegistry()
      const ordersConfig = registry.orders

      if (ordersConfig?.enabled) {
        try {
          // Fetch file content from backend with proper authentication
          const authHeaders = getAuthHeader()
          
          // Use the correct endpoint according to order-files.md documentation:
          // GET /orders/{identifier}/files/{file_id}/content
          const url = `${ordersConfig.baseUrl}/orders/${orderId}/files/${fileId}/content`
          
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              ...authHeaders,
              'Content-Type': 'application/json'
            }
          })

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
          }

          const blob = await response.blob()
          return blob
        } catch (error) {
          logger.warn('[UploadService] Backend fetch failed:', error)
          throw error
        }
      }

      // For localStorage files, we need to get the base64 data
      const allFiles = this.getAllLocalFiles()
      const file = allFiles.find(f => f.file_id === fileId)

      if (!file || !file.data) {
        throw new Error('File not found in local storage')
      }

      // Convert base64 to blob
      const blob = this.base64ToBlob(file.data)
      return blob

    } catch (error) {
      logger.error('[UploadService] Fetch file content failed:', error)
      throw error
    }
  }

  /**
   * Get file extension from filename
   */
  getFileExtension(filename) {
    const parts = filename.split('.')
    return parts.length > 1 ? `.${parts[parts.length - 1]}` : ''
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B'
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
  }

  /**
   * Get file category from MIME type
   */
  getCategoryFromMimeType(mimeType) {
    if (mimeType.startsWith('image/') || mimeType.includes('dicom')) {
      return 'exam_result'
    }
    if (mimeType === 'application/pdf') {
      return 'report'
    }
    return 'other'
  }

  /**
   * Get storage statistics
   */
  getStorageStats() {
    const allFiles = this.getAllLocalFiles()
    const totalSize = allFiles.reduce((sum, file) => sum + file.file_size, 0)
    const byCategory = {}

    allFiles.forEach(file => {
      const cat = file.category || 'other'
      if (!byCategory[cat]) {
        byCategory[cat] = { count: 0, size: 0 }
      }
      byCategory[cat].count++
      byCategory[cat].size += file.file_size
    })

    return {
      totalFiles: allFiles.length,
      totalSize,
      byCategory
    }
  }

  /**
   * Get authentication header
   */
  getAuthHeader() {
    // Use the imported function which properly handles auth
    const headers = getAuthHeader()
    return headers.Authorization || ''
  }
}

// Export singleton instance
export const uploadService = new UploadService()

// Export class for testing
export default UploadService
