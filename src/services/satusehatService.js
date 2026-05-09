import { apiClient } from './http'
import { loadRegistry } from './api-registry'
import { uploadService } from './uploadService'
import { onNotify } from './notifications'
import { api } from './api'
import { satusehatHealthCheck } from './satusehatHealthCheck'

// Helper: try to load an order from backend or local offline storage
async function loadOrderById(orderId) {
  try {
    return await api.getOrder(orderId)
  } catch (e) {
    // Fallback to offline localStorage
    try {
      const raw = localStorage.getItem('orders_offline')
      const arr = raw ? JSON.parse(raw) : []
      const o = arr.find(x => x.id === orderId)
      if (o) return o
    } catch (err) {
      console.warn('[SatuSehat] Failed to read offline orders:', err.message)
    }
    throw e
  }
}

/**
 * SatuSehat Service
 * Responsible for sending image/DICOM files to SatuSehat integration endpoint
 * This is a thin client that will call a backend proxy when available.
 */
export class SatuSehatService {
  constructor() {}

  // Lightweight wrapper so existing UI can query health via this service
  async checkHealth() {
    try {
      return await satusehatHealthCheck.checkHealth()
    } catch (e) {
      return { status: 'error', error: { message: e.message } }
    }
  }

  /**
   * Send a file (by file metadata) to SatuSehat
   * @param {string} orderId
   * @param {Object} file - file metadata object from uploadService.getOrderFiles
   * @returns {Promise<Object>} result { status: 'sent'|'failed', details }
   */
  async sendFile(orderId, file) {
    try {
      const registry = loadRegistry()
      const cfg = registry?.satusehat

      // Load order and validate required SatuSehat fields
      let order = null
      try {
        order = await loadOrderById(orderId)
      } catch (e) {
        // proceed without order but mark as failed
        const msg = `Order ${orderId} not found (cannot validate SatuSehat requirements)`
        console.error('[SatuSehat] ', msg)
        await uploadService.updateFileMetadata(orderId, file.file_id, {
          satusehat: { status: 'failed', updated_at: new Date().toISOString(), details: msg }
        })
        onNotify({ type: 'error', message: `Cannot send ${file.filename}: order not found` })
        return { status: 'failed', details: msg }
      }

      // Validate patient IHS number
      let patientIhs = null
      try {
        if (order.patient_id) {
          const patient = await api.getPatient(order.patient_id)
          patientIhs = patient?.ihs_number || patient?.patient_ihs || patient?.patient_id
        }
      } catch (e) {
        // ignore - patient may be offline or missing
        patientIhs = order.patient_ihs || order.patient_ihs_number || order.patient_id
      }

      if (!patientIhs) {
        const msg = 'Missing patient IHS number (required by SatuSehat)'
        await uploadService.updateFileMetadata(orderId, file.file_id, {
          satusehat: { status: 'failed', updated_at: new Date().toISOString(), details: msg }
        })
        onNotify({ type: 'error', message: `Cannot send ${file.filename}: patient IHS missing` })
        return { status: 'failed', details: msg }
      }

      // Validate service request / requested procedure
      const serviceRequest = order.requested_procedure || order.service_request || order.procedure
      if (!serviceRequest) {
        const msg = 'Missing requested procedure / service request (required by SatuSehat)'
        await uploadService.updateFileMetadata(orderId, file.file_id, {
          satusehat: { status: 'failed', updated_at: new Date().toISOString(), details: msg }
        })
        onNotify({ type: 'error', message: `Cannot send ${file.filename}: requested procedure missing` })
        return { status: 'failed', details: msg }
      }

      // Additional DICOM/router required fields (best-effort checks)
      const accession = order.accession_no || order.accession || order.accessionNo
      if (!accession) {
        const msg = 'Missing accession number (required by DICOM router / SatuSehat)'
        await uploadService.updateFileMetadata(orderId, file.file_id, {
          satusehat: { status: 'failed', updated_at: new Date().toISOString(), details: msg }
        })
        onNotify({ type: 'error', message: `Cannot send ${file.filename}: accession number missing` })
        return { status: 'failed', details: msg }
      }

      const modality = order.modality || order.exam_modality
      if (!modality) {
        const msg = 'Missing modality (required by DICOM router / SatuSehat)'
        await uploadService.updateFileMetadata(orderId, file.file_id, {
          satusehat: { status: 'failed', updated_at: new Date().toISOString(), details: msg }
        })
        onNotify({ type: 'error', message: `Cannot send ${file.filename}: modality missing` })
        return { status: 'failed', details: msg }
      }

      const aet = order.station_ae_title || order.station || order.ae_title
      if (!aet) {
        const msg = 'Missing station AE Title (required for DICOM routing)'
        await uploadService.updateFileMetadata(orderId, file.file_id, {
          satusehat: { status: 'failed', updated_at: new Date().toISOString(), details: msg }
        })
        onNotify({ type: 'error', message: `Cannot send ${file.filename}: station AE Title missing` })
        return { status: 'failed', details: msg }
      }

      // If SatuSehat is configured and enabled, send to backend (works for both local and remote files)
      if (cfg?.enabled && cfg?.restApiUrl) {
        const client = apiClient('satusehat')
        const resp = await client.post(`/DicomStudies`, {
          order_id: orderId,
          file_id: file.file_id,
          patient_ihs: patientIhs,
          accession_number: accession,
          modality: modality,
          station_ae: aet,
          service_request: serviceRequest
        })

        // Expect backend to return { status: 'sent' } or similar
        const status = resp?.status || 'sent'

        // Update file metadata to reflect sent status
        try {
          await uploadService.updateFileMetadata(orderId, file.file_id, {
            satusehat: {
              status: status,
              updated_at: new Date().toISOString(),
              details: resp
            }
          })
        } catch (err) {
          // Non-fatal
          console.warn('[SatuSehat] Failed to persist metadata:', err.message)
        }

        onNotify({ type: 'success', message: `Sent ${file.filename} to SatuSehat` })
        return { status: status, details: resp }
      }

      // If backend not configured but file is local, mark as pending
      if (file._local) {
        await uploadService.updateFileMetadata(orderId, file.file_id, {
          satusehat: {
            status: 'pending',
            updated_at: new Date().toISOString(),
            details: 'SatuSehat integration is not enabled. Please enable SatuSehat in Integration Settings and configure the REST API URL.'
          }
        })

        onNotify({ type: 'warning', message: `Cannot send ${file.filename}: SatuSehat integration not enabled. Please check Integration Settings.` })
        return { status: 'pending', details: 'Integration not enabled' }
      }

      // Default: cannot send because integration not configured
      const errorMsg = cfg?.enabled
        ? 'SatuSehat REST API URL not configured. Please configure it in Integration Settings.'
        : 'SatuSehat integration not enabled. Please enable it in Integration Settings.'

      throw new Error(errorMsg)

    } catch (error) {
      console.error('[SatuSehat] sendFile failed:', error)

      try {
        await uploadService.updateFileMetadata(orderId, file.file_id, {
          satusehat: {
            status: 'failed',
            updated_at: new Date().toISOString(),
            details: error.message
          }
        })
      } catch (err) {
        console.warn('[SatuSehat] Failed to persist failed metadata:', err.message)
      }

      onNotify({ type: 'error', message: `Failed sending ${file.filename} to SatuSehat: ${error.message}` })
      return { status: 'failed', details: error.message }
    }
  }

  /**
   * Cancel an enqueued/pending SatuSehat send for a file
   * @param {string} orderId
   * @param {Object} file
   * @returns {Promise<Object>} result { status: 'cancelled'|'failed', details }
   */
  async cancelSend(orderId, file) {
    try {
      const registry = loadRegistry()
      const cfg = registry?.satusehat

      // Try SatuSehat cancel endpoint if configured
      if (cfg?.enabled && cfg?.restApiUrl) {
        const client = apiClient('satusehat')
        const resp = await client.post('/DicomStudies/cancel', { 
          order_id: orderId, 
          file_id: file.file_id 
        })

        // Persist cancellation in metadata
        try {
          await uploadService.updateFileMetadata(orderId, file.file_id, {
            satusehat: {
              status: 'cancelled',
              updated_at: new Date().toISOString(),
              details: resp
            }
          })
        } catch (err) {
          console.warn('[SatuSehat] Failed to persist cancel metadata:', err.message)
        }

        onNotify({ type: 'info', message: `Cancelled SatuSehat send for ${file.filename}` })
        return { status: 'cancelled', details: resp }
      }

      // If no backend but file was pending locally, mark cancelled locally
      if (file._local || file.satusehat?.status === 'pending') {
        await uploadService.updateFileMetadata(orderId, file.file_id, {
          satusehat: {
            status: 'cancelled',
            updated_at: new Date().toISOString(),
            details: 'Cancelled locally (no backend configured)'
          }
        })
        onNotify({ type: 'info', message: `Locally cancelled SatuSehat send for ${file.filename}` })
        return { status: 'cancelled', details: 'cancelled-locally' }
      }

      // Otherwise, cannot cancel (e.g., already sent)
      const msg = 'Cannot cancel: not pending or no backend to cancel'
      await uploadService.updateFileMetadata(orderId, file.file_id, {
        satusehat: { status: file.satusehat?.status || 'unknown', updated_at: new Date().toISOString(), details: msg }
      })
      onNotify({ type: 'warning', message: msg })
      return { status: 'failed', details: msg }
    } catch (error) {
      console.error('[SatuSehat] cancelSend failed:', error)
      try {
        await uploadService.updateFileMetadata(orderId, file.file_id, {
          satusehat: { status: 'failed', updated_at: new Date().toISOString(), details: error.message }
        })
      } catch (err) {
        console.warn('[SatuSehat] Failed to persist cancel error metadata:', err.message)
      }
      onNotify({ type: 'error', message: `Failed to cancel send: ${error.message}` })
      return { status: 'failed', details: error.message }
    }
  }
  /**
   * Send DICOM study/series/instance to SatuSehat DICOM Router
   * @param {Object} payload - { study_uid, series_uid, sop_instance_uid, ... }
   * @returns {Promise<Object>} result
   */
  async sendToRouter(payload) {
    try {
      // Refactored to use local PACS service (localhost:8003) instead of external monitor
      // 'studies' client points to http://localhost:8003
      const client = apiClient('studies')

      // Ensure payload has at least study_uid
      // User requested to remove client-side validation
      // if (!payload.study_uid && !payload.study_instance_uid) {
      //   throw new Error('study_uid is required')
      // }

      // Normalize payload keys if needed
      const data = {
        study_uid: payload.study_uid || payload.study_instance_uid,
        series_uid: payload.series_uid || payload.series_instance_uid,
        sop_instance_uid: payload.sop_instance_uid,
        ...payload
      }

      const resp = await client.post('/api/dicom/router/send', data)
      return resp
    } catch (error) {
      console.error('[SatuSehat] sendToRouter failed:', error)
      throw error
    }
  }
}

export const satusehatService = new SatuSehatService()

export default SatuSehatService
