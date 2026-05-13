import Select2 from '../components/Select2'
import FileUploader from '../components/FileUploader'
import FileList, { FileListStats } from '../components/FileList'
import { api } from '../services/api'
import orderService from '../services/orderService'
import * as procedureService from '../services/procedureService'
import { getAccessionNumber } from '../services/accessionServiceClient'
import { uploadService } from '../services/uploadService'
import { getPatient } from '../services/patientService'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useToast } from '../components/ToastProvider'
import { getConfig } from '../services/config'
import { sanitizeInput, secureLog } from '../utils/security'
import Icon from '../components/common/Icon'
import {
  getOfflineOrders,
  setOfflineOrders,
  updateOfflineOrder as updateOfflineOrderStorage,
  isOfflineOrder
} from '../utils/secureStorage'

const OFFLINE_KEY = 'orders_offline'

// Helper function to escape special regex characters
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Helper function to clean ICD label by removing duplicate code prefix
function cleanIcdLabel(label, code) {
  if (!label || !code) return label
  // Remove code prefix if it exists at the start of the label
  const pattern = new RegExp(`^${escapeRegExp(String(code))}\\s*-\\s*`, 'i')
  return label.replace(pattern, '').trim()
}

// Field mappings from frontend to backend
const FIELD_MAPPINGS = {
  scheduled_start_at: 'scheduled_at',
  patient_id: 'mrn',
  referring_id: 'referring_doctor_id',
  nurse_id: 'attending_nurse_id'
}

// Valid fields that can be submitted to the backend
const VALID_FIELDS = [
  'patient_name',
  'mrn',
  'registration_number',
  'procedure_code',
  'procedure_name',
  'modality',
  'loinc_code',
  'loinc_name',
  'scheduled_at',
  'scheduled_start_at',
  'status',
  'priority',
  'reason',
  'icd10',
  'icd10_label',
  'tags',
  'referring_doctor_id',
  'referring_id',
  'referring_name',
  'referring_doctor',
  'ordering_physician_name',
  'attending_nurse_id',
  'nurse_id',
  'nurse_name',
  'attending_nurse',
  'station_ae_title',
  'ordering_station_aet',
  'accession_number',
  'procedures',
  'details',
  'metadata',
  'created_at',
  'updated_at'
]

// Protected fields that should not be modified directly
const PROTECTED_FIELDS = [
  'id',
  'created_by',
  'deleted_at'
]

// ... (existing helper functions remain same) ...

export default function OrderForm() {
  const { id } = useParams()
  const nav = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const isEditMode = !!id

  const [modalities, setModalities] = useState([])
  const [files, setFiles] = useState([])  // Legacy file picker files
  const [orderFiles, setOrderFiles] = useState([])  // Uploaded attachments
  const [showRescheduleModal, setShowRescheduleModal] = useState(false)
  const [rescheduleData, setRescheduleData] = useState({
    newScheduledTime: '',
    reason: ''
  })
  // Track if this order has ever been marked as 'arrived'
  const [hasEverArrived, setHasEverArrived] = useState(false)
  // Configuration settings
  const [config, setConfig] = useState(null)
  // Reschedule history
  const [rescheduleHistory, setRescheduleHistory] = useState([])
  // Preserve existing backend/offline details to avoid accidental overwrite
  const [existingDetails, setExistingDetails] = useState({})
  // Track if scheduled time has passed without status progression
  const [isScheduleExpired, setIsScheduleExpired] = useState(false)
  // Track if order is stale (draft/created without progression)
  const [isOrderStale, setIsOrderStale] = useState(false)

  // Preview Mode State
  const [isPreview, setIsPreview] = useState(false)
  const [simrsSource, setSimrsSource] = useState(null)

  const [form, setForm] = useState({
    patient_id: '',
    patient_name: '',
    registration_number: '',
    requested_procedure: '',
    procedure_code: '',
    procedure_name: '',
    procedure_modality: '',
    procedure_loinc_code: '',
    procedure_loinc_display: '',
    station_ae_title: '',
    scheduled_start_at: new Date().toISOString().slice(0, 16),
    status: 'created',  // Default status for new orders
    priority: 'routine',
    reason: '',
    icd10: '',
    icd10_label: '',
    tags: '',
    referring_id: '',
    referring_name: '',
    nurse_id: '',
    nurse_name: '',
    created_at: new Date().toISOString()  // Add created_at field
  })

  // Multi-procedure support
  const [procedures, setProcedures] = useState([])
  const [editingProcedureId, setEditingProcedureId] = useState(null)
  const [editingProcedure, setEditingProcedure] = useState(null)

  // Initialize procedures from form data if editing
  useEffect(() => {
    if (isEditMode && form.requested_procedure && procedures.length === 0) {
      // If editing an existing order, populate the procedures list with the main procedure
      // This ensures backward compatibility
      setProcedures([{
        id: Date.now(),
        code: form.procedure_code || form.requested_procedure,
        name: form.procedure_name || form.requested_procedure,
        modality: form.procedure_modality || form.modality,
        accession_number: form.accession_number || form.accession_no, // Use existing accession
        scheduled_at: form.scheduled_start_at
      }])
    }
  }, [isEditMode, form.requested_procedure])

  // Handle Preview Mode Data from Navigation State
  useEffect(() => {
    if (location.state && location.state.previewData && location.state.isPreview) {
      const { previewData } = location.state

      setIsPreview(true)
      setSimrsSource(previewData.simrs_source) // e.g., 'khanza'

      // Map preview data to form
      setForm(prev => ({
        ...prev,
        patient_id: previewData.patient_id,
        patient_name: previewData.patient_name,
        registration_number: previewData.registration_number,
        scheduled_start_at: formatDateTimeForInput(previewData.scheduled_start_at),
        status: 'created',
        priority: previewData.priority || 'routine',
        reason: previewData.reason,
        icd10: previewData.icd10,
        tags: previewData.tags,
        referring_id: previewData.referring_id,
        referring_name: previewData.referring_name,
        // Populate hidden patient fields for completeness
        patient_national_id: previewData.patient_national_id,
        gender: previewData.gender,
        birth_date: previewData.birth_date,
        patient_address: previewData.patient_address,
        patient_phone: previewData.patient_phone,
        clinical_notes: previewData.clinical_notes,
      }))

      // Populate Procedures
      if (previewData.procedures && Array.isArray(previewData.procedures)) {
        setProcedures(previewData.procedures)
      }

      // Populate existing details with SIMRS metadata
      setExistingDetails(prev => ({
        ...prev,
        is_simrs_import: true,
        simrs_order_number: previewData.simrs_order_number,
        simrs_source: previewData.simrs_source
      }))

      // Clear location state to prevent reload on refresh (optional, but good practice)
      // window.history.replaceState({}, document.title)
    }
  }, [location.state])

  const handleAddProcedure = async () => {
    if (!form.requested_procedure) {
      toast.notify({ type: 'error', message: 'Please select a procedure first' })
      return
    }

    // Generate a unique accession number for this procedure
    let accession = ''
    try {
      // Use the modality of the selected procedure, or fallback to form modality
      const mod = form.procedure_modality || form.modality || 'OT'
      accession = await getAccessionNumber({ modality: mod, patientId: form.patient_id || '' })
    } catch (e) {
      accession = `ACC-${Date.now()}` // Fallback
    }

    const newProcedure = {
      id: Date.now(),
      code: form.procedure_code || form.requested_procedure,
      name: form.procedure_name || form.requested_procedure,
      modality: form.procedure_modality || form.modality,
      accession_number: accession,
      scheduled_at: form.scheduled_start_at
    }

    setProcedures(prev => [...prev, newProcedure])

    // Clear selection to allow adding another
    setForm(prev => ({
      ...prev,
      requested_procedure: '',
      procedure_code: '',
      procedure_name: '',
      procedure_modality: '',
      procedure_loinc_code: '',
      procedure_loinc_display: ''
    }))

    toast.notify({ type: 'success', message: 'Procedure added to order' })
  }

  const handleRemoveProcedure = (id) => {
    setProcedures(prev => prev.filter(p => p.id !== id))
  }


  const handleEditProcedure = (proc) => {
    setEditingProcedureId(proc.id)
    setEditingProcedure({ ...proc })
  }

  const handleCancelEdit = () => {
    setEditingProcedureId(null)
    setEditingProcedure(null)
  }

  const handleSaveEdit = () => {
    if (!editingProcedure) return

    // Sync from form if user changed procedure via main selector
    const updatedProcedure = {
      ...editingProcedure,
      // If form has different procedure selected, use that
      ...(form.requested_procedure && form.requested_procedure !== editingProcedure.code ? {
        code: form.procedure_code || form.requested_procedure,
        name: form.procedure_name || form.requested_procedure,
        modality: form.procedure_modality
      } : {})
    }

    setProcedures(prev => prev.map(p =>
      p.id === editingProcedureId ? updatedProcedure : p
    ))

    setEditingProcedureId(null)
    setEditingProcedure(null)

    // Clear form selection
    setForm(prev => ({
      ...prev,
      requested_procedure: '',
      procedure_code: '',
      procedure_name: '',
      procedure_modality: ''
    }))

    toast.notify({ type: 'success', message: 'Procedure updated' })
  }

  const handleEditFieldChange = (field, value) => {
    setEditingProcedure(prev => ({
      ...prev,
      [field]: value
    }))
  }

  // Load configuration on component mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const configData = await getConfig()
        setConfig(configData || {
          accessionRegenerationEnabled: false,
          accessionReadOnlyAfterCreate: true
        })
      } catch (error) {
        // Use defaults if config fails to load
        setConfig({
          accessionRegenerationEnabled: false,
          accessionReadOnlyAfterCreate: true
        })
      }
    }

    loadConfig()
  }, [])

  // Helper function to determine if order can be edited
  const canEditOrder = (status) => {
    // Orders can be edited in draft, created, enqueued, and scheduled status
    // For scheduled orders, only rescheduling is allowed, but we still need to allow access to the form
    const editableStatuses = ['draft', 'created', 'enqueued', 'scheduled', 'rescheduled']
    return editableStatuses.includes(status)
  }

  // Check if current order is editable for general editing (not rescheduling)
  const isOrderEditable = canEditOrder(form.status)

  // Check if current order is only editable for rescheduling
  const isOrderReschedulableOnly = ['scheduled', 'rescheduled'].includes(form.status)

  // Check if current order is in completed status (special case for file uploads only)
  const isOrderCompleted = form.status === 'completed'

  // Allow editing clinical fields in completed status if any are still empty
  const areClinicalFieldsEmpty = () => {
    const icdEmpty = !form.icd10 || String(form.icd10).trim() === ''
    const tagsEmpty = !form.tags || String(form.tags).trim() === ''
    const reasonEmpty = !form.reason || String(form.reason).trim() === ''
    return icdEmpty || tagsEmpty || reasonEmpty
  }
  const allowClinicalBackfill = isOrderCompleted && areClinicalFieldsEmpty()

  // Upload DICOM dipindahkan ke halaman /upload (dedicated page)
  // Gunakan tombol "Upload DICOM / Studies" di dropdown OrderActionButtons
  const canShowFileUpload = false

  // Helper function to check if clinical fields (referring doctor, nurse, reason, ICD, tags) can be edited
  // These fields can be edited as long as the order is not in completed or cancelled status
  const canEditClinicalFields = !['completed', 'cancelled'].includes(form.status) || allowClinicalBackfill

  // Helper function to check if procedures can be edited
  // Procedures CANNOT be edited once the order status is 'scheduled', 'rescheduled', 'arrived' or beyond
  // This prevents changing procedures after order has been scheduled or patient has arrived
  // Users can only reschedule or cancel at this stage
  const canEditProcedures = !['scheduled', 'rescheduled', 'arrived', 'in_progress', 'completed', 'cancelled'].includes(form.status)

  // Helper function to check if reschedule feature should be available
  // Reschedule is only relevant for scheduled/enqueued/rescheduled orders
  // Not applicable for: draft/created (not yet scheduled), completed/cancelled (already finalized)
  const canShowReschedule = !['draft', 'created', 'completed', 'cancelled', 'in_progress'].includes(form.status)

  // Helper function to convert datetime format for datetime-local input
  const formatDateTimeForInput = (dateTimeString) => {
    if (!dateTimeString) return ''
    // Convert various datetime formats to YYYY-MM-DDTHH:mm
    const date = new Date(dateTimeString)
    if (isNaN(date.getTime())) return ''
    return date.toISOString().slice(0, 16)
  }

  // Helper function to convert datetime-local input back to desired format
  const formatDateTimeFromInput = (inputValue) => {
    if (!inputValue) return ''
    return inputValue.replace('T', ' ')
  }

  // Helper function to format datetime for display
  const formatDateTimeForDisplay = (dateTimeString) => {
    if (!dateTimeString) return ''
    try {
      const date = new Date(dateTimeString)
      if (isNaN(date.getTime())) return dateTimeString
      return date.toLocaleString()
    } catch (e) {
      return dateTimeString
    }
  }

  // Helper function to calculate and format time difference
  const getTimeDifferenceText = (pastDate) => {
    try {
      const past = new Date(pastDate)
      const now = new Date()
      const diffMs = now.getTime() - past.getTime()

      if (diffMs <= 0) return 'recently'

      const diffMinutes = Math.floor(diffMs / (1000 * 60))
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

      if (diffMinutes < 60) {
        return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`
      } else if (diffHours < 24) {
        return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`
      } else {
        return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`
      }
    } catch (error) {
      return 'some time ago'
    }
  }

  // Helper function to get current user name from localStorage
  const getCurrentUser = () => {
    try {
      const appData = JSON.parse(localStorage.getItem('app.currentUser') || '{}');
      return appData.name || appData.username || appData.email || 'current_user';
    } catch (e) {
      return 'current_user';
    }
  }

  // Helper function to validate scheduled time is not earlier than creation time
  const validateScheduledTime = (scheduledTime, createdAt) => {
    if (!scheduledTime || !createdAt) return true; // Allow if either is missing

    try {
      const scheduled = new Date(scheduledTime);
      const created = new Date(createdAt);

      if (isNaN(scheduled.getTime()) || isNaN(created.getTime())) {
        return true; // Allow if dates are invalid
      }

      // Scheduled time should not be earlier than creation time
      return scheduled.getTime() >= created.getTime();
    } catch (error) {
      return true; // Allow on error
    }
  }

  // Helper function to show validation error for datetime
  const showDateTimeValidationError = (createdAt) => {
    const formattedCreatedAt = formatDateTimeForDisplay(createdAt);
    toast.notify({
      type: 'error',
      message: `Scheduled time cannot be earlier than order creation time (${formattedCreatedAt})`
    });
  }

  // Helper function to check if order is stale (draft/created without progression)
  const checkOrderStale = (orderData) => {
    try {
      // Only check for draft and created orders
      const draftCreatedStatuses = ['draft', 'created']

      if (!draftCreatedStatuses.includes(orderData.status)) {
        return false
      }

      // Check if there's been any status progression
      const statusHistory = orderData.status_history || orderData.metadata?.status_history || []
      const hasStatusProgression = statusHistory.some(s =>
        !draftCreatedStatuses.includes(s.status)
      )

      // Order is stale if it's still in draft/created and no progression
      // We don't check time for draft/created, just inform user to review
      return !hasStatusProgression
    } catch (error) {
      return false
    }
  }

  // Helper function to check if scheduled time has passed without status progression
  // Only applies to scheduled/enqueued/rescheduled orders (NOT draft/created)
  const checkScheduleExpiration = (orderData) => {
    try {
      // Only check for orders that are scheduled but haven't progressed
      const scheduledStatuses = ['scheduled', 'enqueued', 'rescheduled']

      // Don't check draft/created here - they have separate validation
      if (!scheduledStatuses.includes(orderData.status)) {
        return false
      }

      // Check if scheduled time has passed
      const scheduledTime = new Date(orderData.scheduled_start_at || orderData.scheduled_at)
      const now = new Date()

      if (isNaN(scheduledTime.getTime())) {
        return false // Invalid date, can't check
      }

      // Add a grace period of 30 minutes to avoid showing warning too early
      const gracePeriodMs = 30 * 60 * 1000 // 30 minutes
      const hasExpired = (now.getTime() - scheduledTime.getTime()) > gracePeriodMs

      // Check if there's been any status progression beyond scheduling
      const statusHistory = orderData.status_history || orderData.metadata?.status_history || []
      const progressedStatuses = ['arrived', 'in_progress', 'completed', 'cancelled']
      const hasStatusProgression = statusHistory.some(s =>
        progressedStatuses.includes(s.status)
      )

      // Schedule is expired if time has passed and there's no status progression
      return hasExpired && !hasStatusProgression
    } catch (error) {
      return false
    }
  }

  // Map frontend field names to backend canonical names
  const mapFieldName = (fieldName) => {
    return FIELD_MAPPINGS[fieldName] || fieldName
  }

  // Prepare order data for API submission based on actual DB schema
  const prepareOrderData = (formData) => {
    const data = {}

    // Handle specific field mappings based on DB schema
    // Map form fields to actual DB columns
    if (formData.patient_name) data.patient_name = formData.patient_name
    if (formData.registration_number) data.registration_number = formData.registration_number

    // Add procedures list if available (Multi-procedure support)
    if (procedures.length > 0) {
      data.procedures = procedures.map(p => ({
        code: p.code,
        name: p.name,
        modality: p.modality,
        accession_number: p.accession_number,
        scheduled_at: p.scheduled_at
      }))
    }

    // Map procedure fields - use separate code and name if available
    // For backward compatibility or single procedure fallback
    if (formData.procedure_code) data.procedure_code = formData.procedure_code
    if (formData.procedure_name) data.procedure_name = formData.procedure_name
    // Fallback to requested_procedure if separate fields not available
    if (!data.procedure_code && formData.requested_procedure) {
      data.procedure_code = formData.requested_procedure
    }
    if (!data.procedure_name && formData.requested_procedure) {
      data.procedure_name = formData.requested_procedure
    }

    // Add modality from procedure (REQUIRED field)
    if (formData.procedure_modality) {
      data.modality = formData.procedure_modality
    } else if (procedures.length > 0) {
      // Use modality from first procedure if not set in form
      data.modality = procedures[0].modality
    }

    // Add LOINC codes if available
    if (formData.procedure_loinc_code) {
      data.loinc_code = formData.procedure_loinc_code
    }
    if (formData.procedure_loinc_display) {
      data.loinc_name = formData.procedure_loinc_display
    }

    // Ensure both procedure_code and procedure_name are set
    if (!data.procedure_code && !data.procedure_name) {
      // Missing procedure info - allow submission with just one field
    }

    if (formData.station_ae_title) data.ordering_station_aet = formData.station_ae_title
    if (formData.scheduled_start_at) data.scheduled_at = formatDateTimeFromInput(formData.scheduled_start_at)
    if (formData.status) data.status = formData.status

    // Map referring doctor data - send both name and ID if available
    if (formData.referring_name) {
      data.referring_doctor = formData.referring_name
      // Also include referring_id if available (backend might need it)
      if (formData.referring_id) {
        data.ordering_physician_name = formData.referring_name
      }
    }

    // Map attending nurse data to the attending_nurse column
    if (formData.nurse_name) data.attending_nurse = formData.nurse_name

    // Handle tags, ICD-10, reason, status history, and reschedule history data in the details field
    const details = {}
    if (formData.icd10) {
      // Store ICD-10 as an object that includes code and a CLEAN label (without code prefix)
      details.icd10 = {
        code: formData.icd10,
        label: cleanIcdLabel(formData.icd10_label || '', formData.icd10) || ''
      }
    }
    if (formData.tags) {
      // Store tags as an array
      details.tags = typeof formData.tags === 'string'
        ? formData.tags.split(',').map(tag => tag.trim()).filter(Boolean)
        : formData.tags
    }
    if (formData.reason) details.reason = formData.reason

    // Handle status history if it exists
    if (formData.status_history) {
      details.status_history = formData.status_history
    }

    // Handle reschedule history if it exists
    if (formData.reschedule_history) {
      details.reschedule_history = formData.reschedule_history
    }

    // Only add details field if it has content; merge with existing to preserve
    if (Object.keys(details).length > 0) {
      data.details = { ...(existingDetails || {}), ...details }
    } else if (existingDetails && Object.keys(existingDetails).length > 0) {
      // If no new details provided, still preserve existing details
      data.details = existingDetails
    }

    return data
  }

  // Validate fields according to actual DB schema
  const validateFields = (orderData) => {
    const invalidFields = []
    const allowedFields = [...VALID_FIELDS]

    Object.keys(orderData).forEach(key => {
      // Check for protected fields
      if (PROTECTED_FIELDS.includes(key)) {
        invalidFields.push(key)
        return
      }

      // Check if field is valid based on actual DB schema
      if (!allowedFields.includes(key) && key !== 'metadata') {
        // Check if it's a valid alias
        const isAlias = Object.values(FIELD_MAPPINGS).includes(key) ||
          Object.keys(FIELD_MAPPINGS).some(alias => FIELD_MAPPINGS[alias] === key)

        if (!isAlias) {
          invalidFields.push(key)
        }
      }
    })

    return {
      isValid: invalidFields.length === 0,
      invalidFields,
      allowedFields
    }
  }

  useEffect(() => {
    // Load modalities data - disabled as the field is hidden
    /*
    api.listModalities().then(modalitiesData => {
      setModalities(modalitiesData)
      // Set default modality to the first enabled one
      if (modalitiesData && modalitiesData.length > 0) {
        const firstEnabled = modalitiesData.find(m => m.enabled !== false) || modalitiesData[0]
        setForm(prev => ({
          ...prev,
          modality: firstEnabled.modality,
          station_ae_title: firstEnabled.ae_title || ''
        }))
      }
    })
    */

    // Load existing order if in edit mode
    if (isEditMode) {
      loadOrder(id)
    } else {
      // For new orders, no need to generate accession number as the field is hidden
    }
  }, [id, isEditMode])

  // Load order files when in edit mode
  useEffect(() => {
    if (isEditMode && id) {

      loadOrderFiles(id)
    }
  }, [id, isEditMode])

  // Effect to update station AE title when modality changes
  useEffect(() => {
    // Modality effect disabled as the field is hidden
    /*
    if (form.modality && modalities.length > 0) {
      const selectedModality = modalities.find(m => m.modality === form.modality)
      if (selectedModality) {
        setForm(prev => ({
          ...prev,
          station_ae_title: selectedModality.ae_title || ''
        }));
        
        // Generate accession number when modality changes (only for new orders)
        // Only generate if config allows it and it's a new order
        if (!isEditMode && config?.accessionRegenerationEnabled) {
          (async () => {
            const acc = await generateAccessionAsync({ modality: selectedModality.modality })
            setForm(prev => ({ ...prev, accession_no: acc }))
          })()
        }
        // For existing orders or when regeneration is disabled, don't auto-generate
      }
    }
    */
  }, [form.modality, modalities, isEditMode, config])


  const loadOrder = async (orderId) => {
    try {
      // Try loading from offline storage first
      const raw = localStorage.getItem(OFFLINE_KEY)
      const offlineOrders = raw ? JSON.parse(raw) : []
      const offlineOrder = offlineOrders.find(o => o.id === orderId)

      if (offlineOrder) {
        // Load offline order
        setForm({
          patient_id: offlineOrder.patient_id || '',
          patient_name: offlineOrder.patient_name || '',
          registration_number: offlineOrder.registration_number || '',
          // Clear procedure form fields - procedures are shown in table
          requested_procedure: '',
          procedure_code: '',
          procedure_name: '',
          procedure_modality: '',
          procedure_loinc_code: '',
          procedure_loinc_display: '',
          station_ae_title: offlineOrder.station_ae_title || '',
          scheduled_start_at: formatDateTimeForInput(offlineOrder.scheduled_start_at) || '',
          status: offlineOrder.status || 'scheduled',
          priority: offlineOrder.metadata?.priority || 'routine',
          reason: offlineOrder.details?.reason || offlineOrder.metadata?.reason || '',
          // laterality: offlineOrder.metadata?.laterality || 'NA', // Disabled as not implemented in backend
          // body_part: offlineOrder.metadata?.body_part || '', // Disabled as not implemented in backend
          // contrast: offlineOrder.metadata?.contrast || 'none', // Disabled as not implemented in backend
          // contrast_allergy: offlineOrder.metadata?.contrast_allergy || false, // Disabled as not implemented in backend
          // pregnancy: offlineOrder.metadata?.pregnancy || 'unknown', // Disabled as not implemented in backend
          icd10: (
            typeof offlineOrder.details?.icd10 === 'object'
              ? offlineOrder.details.icd10.code
              : offlineOrder.details?.icd10
          ) || offlineOrder.metadata?.icd10 || offlineOrder.icd10 || '',
          icd10_label: (
            typeof offlineOrder.details?.icd10 === 'object'
              ? offlineOrder.details.icd10.label
              : ''
          ),
          tags: Array.isArray(offlineOrder.details?.tags)
            ? offlineOrder.details.tags.join(', ')
            : (offlineOrder.metadata?.tags?.join(', ') || ''),
          referring_id: offlineOrder.metadata?.referring?.id || '',
          referring_name: offlineOrder.metadata?.referring?.name || '',
          nurse_id: offlineOrder.metadata?.nurse?.id || '',
          nurse_name: offlineOrder.metadata?.nurse?.name || '',
          created_at: offlineOrder.created_at || offlineOrder.createdAt || new Date().toISOString()
        })

        // Load procedures (Multi-procedure support)
        if (offlineOrder.procedures && Array.isArray(offlineOrder.procedures) && offlineOrder.procedures.length > 0) {
          setProcedures(offlineOrder.procedures)
        } else if (offlineOrder.requested_procedure || offlineOrder.procedure_code) {
          // Backward compatibility for single procedure orders
          setProcedures([{
            id: Date.now(),
            code: offlineOrder.procedure_code || offlineOrder.requested_procedure,
            name: offlineOrder.procedure_name || offlineOrder.requested_procedure,
            modality: offlineOrder.modality || offlineOrder.procedure_modality,
            accession_number: offlineOrder.accession_number || offlineOrder.accession_no,
            scheduled_at: offlineOrder.scheduled_start_at
          }])
        } else {
          setProcedures([])
        }
        setFiles(offlineOrder.metadata?.attachments || [])
        // Preserve existing details from offline record
        setExistingDetails(offlineOrder.details || {})
        // Set reschedule history from details column and ensure rescheduled_by is set
        const loadedRescheduleHistory = offlineOrder.details?.reschedule_history || []
        // Get current user name
        const currentUser = getCurrentUser();
        const processedRescheduleHistory = loadedRescheduleHistory.map(history => ({
          ...history,
          rescheduled_by: history.rescheduled_by || currentUser
        }))
        setRescheduleHistory(processedRescheduleHistory)
        // Determine if order was ever arrived (offline record may keep status_history)
        try {
          const statusHistory = offlineOrder.status_history || offlineOrder.metadata?.status_history || []
          const arrivedEver = (offlineOrder.status === 'arrived') || statusHistory.some(s => s.status === 'arrived')
          setHasEverArrived(!!arrivedEver)
        } catch (err) {
          setHasEverArrived(false)
        }

        // Check if order is stale (draft/created without progression)
        const stale = checkOrderStale(offlineOrder)
        setIsOrderStale(stale)

        // Check if schedule has expired without status progression (scheduled/enqueued/rescheduled)
        const expired = checkScheduleExpiration(offlineOrder)
        setIsScheduleExpired(expired)

        return
      }

      // Try loading from backend API
      const order = await orderService.getOrder(orderId)
      setForm({
        patient_id: order.patient_id || order.satusehat_ihs_number || '',
        patient_name: order.patient_name || '',
        registration_number: order.registration_number || '',
        // Clear procedure form fields - procedures are shown in table
        requested_procedure: '',
        procedure_code: '',
        procedure_name: '',
        procedure_modality: '',
        procedure_loinc_code: '',
        procedure_loinc_display: '',
        station_ae_title: order.station_ae_title || '',
        scheduled_start_at: formatDateTimeForInput(order.scheduled_start_at) || '',
        status: order.status || 'scheduled',
        priority: order.metadata?.priority || order.priority || 'routine',
        reason: order.details?.reason || order.metadata?.reason || order.reason || '',
        // laterality: order.metadata?.laterality || order.laterality || 'NA', // Disabled as not implemented in backend
        // body_part: order.metadata?.body_part || order.body_part || '', // Disabled as not implemented in backend
        // contrast: order.metadata?.contrast || order.contrast || 'none', // Disabled as not implemented in backend
        // contrast_allergy: order.metadata?.contrast_allergy || order.contrast_allergy || false, // Disabled as not implemented in backend
        // pregnancy: order.metadata?.pregnancy || order.pregnancy || 'unknown', // Disabled as not implemented in backend
        icd10: (
          typeof order.details?.icd10 === 'object'
            ? order.details.icd10.code
            : order.details?.icd10
        ) || order.metadata?.icd10 || order.icd10 || '',
        icd10_label: (
          typeof order.details?.icd10 === 'object'
            ? order.details.icd10.label
            : ''
        ),
        tags: Array.isArray(order.details?.tags)
          ? order.details.tags.join(', ')
          : (order.metadata?.tags?.join(', ') || order.tags || ''),
        referring_id: order.metadata?.referring?.id || order.referring_id || '',
        referring_name: order.metadata?.referring?.name || order.referring_name || order.referring_doctor || '',
        nurse_id: order.metadata?.nurse?.id || order.nurse_id || '',
        nurse_name: order.metadata?.nurse?.name || order.nurse_name || '',
        created_at: order.created_at || order.createdAt || new Date().toISOString()
      })

      // Load procedures (Multi-procedure support)
      if (order.procedures && Array.isArray(order.procedures) && order.procedures.length > 0) {
        setProcedures(order.procedures)
      } else if (order.requested_procedure || order.procedure_code) {
        // Backward compatibility for single procedure orders
        setProcedures([{
          id: Date.now(),
          code: order.procedure_code || order.requested_procedure,
          name: order.procedure_name || order.requested_procedure,
          modality: order.modality || order.procedure_modality,
          accession_number: order.accession_number || order.accession_no,
          scheduled_at: order.scheduled_start_at
        }])
      } else {
        setProcedures([])
      }
      setFiles(order.metadata?.attachments || [])
      // Preserve existing details from backend record
      setExistingDetails(order.details || {})
      // Set reschedule history from details column and ensure rescheduled_by is set
      const loadedRescheduleHistory = order.details?.reschedule_history || []
      // Get current user name
      const currentUser = getCurrentUser();
      const processedRescheduleHistory = loadedRescheduleHistory.map(history => ({
        ...history,
        rescheduled_by: history.rescheduled_by || currentUser
      }))
      setRescheduleHistory(processedRescheduleHistory)
      // Determine if order was ever arrived (backend record may keep status_history)
      try {
        const statusHistory = order.status_history || order.metadata?.status_history || []
        const arrivedEver = (order.status === 'arrived') || statusHistory.some(s => s.status === 'arrived')
        setHasEverArrived(!!arrivedEver)
      } catch (err) {
        setHasEverArrived(false)
      }

      // Check if order is stale (draft/created without progression)
      const stale = checkOrderStale(order)
      setIsOrderStale(stale)

      // Check if schedule has expired without status progression (scheduled/enqueued/rescheduled)
      const expired = checkScheduleExpiration(order)
      setIsScheduleExpired(expired)

      // Note: Files will be loaded by separate useEffect
      // This avoids race conditions and ensures files are loaded after component mounts
    } catch (e) {
      toast.notify({ type: 'error', message: `Failed to load order: ${e.message}` })
      nav('/orders')
    }
  }

  /**
   * Load uploaded files for order
   */
  const loadOrderFiles = async (orderId) => {
    try {
      const files = await uploadService.getOrderFiles(orderId)
      setOrderFiles(files)
    } catch (error) {
      setOrderFiles([])
    }
  }

  const pickFiles = (e) => {
    const arr = Array.from(e.target.files || [])
    setFiles(prev => [...prev, ...arr.map(f => ({ name: f.name, size: f.size }))])
  }

  /**
   * Handle file upload complete
   */
  const handleUploadComplete = async ({ results, errors }) => {
    // Refresh file list regardless of success or failure to show current state
    if (isEditMode && id) {
      await loadOrderFiles(id)
    }

    // Show summary with details
    if (results.length > 0 && errors.length === 0) {
      toast.notify({
        type: 'success',
        message: `✅ Successfully uploaded ${results.length} file(s)`
      })
    }

    if (errors.length > 0) {
      // Show detailed error message
      const errorMessages = errors.map(e => {
        const details = e.details ? ` (Type: ${e.details.type || 'unknown'}, Size: ${e.details.size})` : ''
        return `${e.filename}: ${e.error}${details}`
      }).join('\n')

      toast.notify({
        type: 'error',
        message: errors.length === 1
          ? `❌ Upload failed: ${errorMessages}`
          : `❌ ${errors.length} file(s) failed:\n${errorMessages.substring(0, 200)}...`
      })

      // Return early to prevent further processing when there are errors
      return
    }

    // Only show success message if there were no errors
    if (results.length > 0) {
      toast.notify({
        type: 'success',
        message: `✅ Successfully uploaded ${results.length} file(s)`
      })
    }
  }

  /**
   * Handle file upload error
   */
  const handleUploadError = ({ errors }) => {
    toast.notify({
      type: 'error',
      message: `❌ Upload failed: ${errors.join(', ')}`
    })
  }

  function validate() {
    const errs = []
    if (!form.patient_id && !form.patient_name) errs.push('Patient MRN atau Patient Name wajib diisi')
    if (procedures.length === 0) errs.push('Minimal satu procedure harus ditambahkan')
    // Modality validation removed as the field is hidden
    // if (!form.modality) errs.push('Modality wajib dipilih')
    // Accession Number validation removed as the field is hidden
    // if (!form.accession_no) errs.push('Accession Number kosong')

    // Validation for completing order: ICD and referring doctor are required
    if (form.status === 'completed' || form.status === 'in_progress') {
      if (!form.icd10 || String(form.icd10).trim() === '') {
        errs.push(`ICD-10 wajib diisi untuk status ${form.status}`)
      }
    }

    if (form.status === 'completed') {
      if (!form.referring_name) errs.push('Referring Doctor wajib diisi untuk menyelesaikan order')
    }

    // Only validate form fields if order is editable for general editing
    if (isEditMode && !isOrderEditable && !canEditClinicalFields) {
      errs.push('Order cannot be edited after completed status')
    }
    return errs
  }

  function saveOfflineOrder() {
    const raw = localStorage.getItem(OFFLINE_KEY)
    const arr = raw ? JSON.parse(raw) : []

    // Get current user name
    const currentUser = getCurrentUser();

    // Prepare details object for offline storage
    const details = {}
    if (form.icd10) details.icd10 = form.icd10
    if (form.tags) {
      // Store tags as an array
      details.tags = typeof form.tags === 'string'
        ? form.tags.split(',').map(tag => tag.trim()).filter(Boolean)
        : form.tags
    }
    if (form.reason) details.reason = form.reason
    // Include reschedule history if it exists
    if (rescheduleHistory && rescheduleHistory.length > 0) {
      details.reschedule_history = rescheduleHistory.map(history => ({
        ...history,
        rescheduled_by: history.rescheduled_by || currentUser
      }))
    }

    const rec = {
      id: 'off-' + Math.random().toString(36).slice(2, 8),
      patient_id: form.patient_id || '',
      patient_name: form.patient_name || '',
      registration_number: form.registration_number || '',
      requested_procedure: form.requested_procedure,
      procedure_code: form.procedure_code || form.requested_procedure,
      procedure_name: form.procedure_name || form.requested_procedure,
      modality: form.procedure_modality || '',
      loinc_code: form.procedure_loinc_code || '',
      loinc_name: form.procedure_loinc_display || '',
      station_ae_title: form.station_ae_title,
      scheduled_start_at: formatDateTimeFromInput(form.scheduled_start_at),
      status: form.status,
      _offline: true,
      details: Object.keys(details).length > 0 ? details : undefined,
      metadata: {
        priority: form.priority,
        reason: form.reason,
        attachments: files,
        referring: { id: form.referring_id, name: form.referring_name },
        nurse: { id: form.nurse_id, name: form.nurse_name }
      },
      procedures: procedures.map(p => ({
        code: p.code,
        name: p.name,
        modality: p.modality,
        accession_number: p.accession_number,
        scheduled_at: p.scheduled_at
      }))
    }
    arr.unshift(rec)
    localStorage.setItem(OFFLINE_KEY, JSON.stringify(arr))
    return rec
  }

  function updateOfflineOrder(orderId) {
    const raw = localStorage.getItem(OFFLINE_KEY)
    const arr = raw ? JSON.parse(raw) : []
    const idx = arr.findIndex(o => o.id === orderId)

    if (idx === -1) throw new Error('Offline order not found')

    // Get current user name
    const currentUser = getCurrentUser();

    // Prepare details object for offline storage
    const details = {
      ...(arr[idx].details || {}),
      reschedule_history: rescheduleHistory.map(history => ({
        ...history,
        rescheduled_by: history.rescheduled_by || currentUser
      }))
    }

    if (form.icd10) details.icd10 = form.icd10
    if (form.tags) {
      // Store tags as an array
      details.tags = typeof form.tags === 'string'
        ? form.tags.split(',').map(tag => tag.trim()).filter(Boolean)
        : form.tags
    }
    if (form.reason) details.reason = form.reason

    const updated = {
      id: orderId,  // Keep original ID
      patient_id: form.patient_id || '',
      patient_name: form.patient_name || '',
      registration_number: form.registration_number || '',
      // accession_no: form.accession_no,  // Removed as the field is hidden
      requested_procedure: form.requested_procedure,
      procedure_code: form.procedure_code || form.requested_procedure,
      procedure_name: form.procedure_name || form.requested_procedure,
      modality: form.procedure_modality || '',
      loinc_code: form.procedure_loinc_code || '',
      loinc_name: form.procedure_loinc_display || '',
      station_ae_title: form.station_ae_title,
      scheduled_start_at: formatDateTimeFromInput(form.scheduled_start_at),
      status: form.status,
      _offline: true,  // Keep offline flag
      details: Object.keys(details).length > 0 ? details : undefined,
      metadata: {
        priority: form.priority,
        reason: form.reason,
        attachments: files,
        referring: { id: form.referring_id, name: form.referring_name },
        nurse: { id: form.nurse_id, name: form.nurse_name }
      },
      procedures: procedures.map(p => ({
        code: p.code,
        name: p.name,
        modality: p.modality,
        accession_number: p.accession_number,
        scheduled_at: p.scheduled_at
      }))
    }

    arr[idx] = updated
    localStorage.setItem(OFFLINE_KEY, JSON.stringify(arr))
    return updated
  }

  const handleReschedule = (e) => {
    e.preventDefault()
    e.stopPropagation()

    // Prevent rescheduling for draft/created orders
    if (['draft', 'created'].includes(form.status)) {
      toast.notify({
        type: 'error',
        message: 'Cannot reschedule: order must be in scheduled status first. Please update the order status from draft/created before rescheduling.'
      })
      return
    }

    if (hasEverArrived) {
      toast.notify({ type: 'error', message: 'Cannot reschedule: order has recorded arrival previously.' })
      return
    }

    // Open modal with current scheduled time
    setRescheduleData({
      newScheduledTime: form.scheduled_start_at,
      reason: ''
    })

    setShowRescheduleModal(true)
  }

  const submitReschedule = async () => {
    if (hasEverArrived) {
      toast.notify({ type: 'error', message: 'Cannot reschedule: order has recorded arrival previously.' })
      return
    }
    // Validate reschedule data
    if (!rescheduleData.newScheduledTime) {
      toast.notify({ type: 'error', message: 'New scheduled time is required' })
      return
    }
    if (!rescheduleData.reason) {
      toast.notify({ type: 'error', message: 'Reschedule reason is required' })
      return
    }

    // Validate that reschedule time is not earlier than order creation time
    const rescheduleDateTime = new Date(rescheduleData.newScheduledTime);
    const orderCreatedDateTime = new Date(form.created_at || new Date());

    if (rescheduleDateTime < orderCreatedDateTime) {
      const formattedOrderCreatedTime = orderCreatedDateTime.toLocaleString();
      toast.notify({
        type: 'error',
        message: `Reschedule time cannot be earlier than order creation time (${formattedOrderCreatedTime})`
      });
      return;
    }

    try {
      // Update form with new scheduled time and status
      const updatedForm = {
        ...form,
        scheduled_start_at: rescheduleData.newScheduledTime,
        status: 'rescheduled'
      }

      // Check if it's an offline order using secure storage
      const offlineOrders = getOfflineOrders()
      const isOffline = isOfflineOrder(id)

      if (isOffline) {
        // Update offline order with reschedule info
        const arr = [...offlineOrders]
        const idx = arr.findIndex(o => o.id === id)
        if (idx !== -1) {
          // Get current user name
          const currentUser = getCurrentUser();

          // Prepare details object with reschedule history
          const details = {
            ...(arr[idx].details || {}),
            reschedule_history: [
              ...((arr[idx].details?.reschedule_history || arr[idx].metadata?.reschedule_history) || []),
              {
                old_time: formatDateTimeFromInput(form.scheduled_start_at),
                new_time: formatDateTimeFromInput(rescheduleData.newScheduledTime),
                reason: rescheduleData.reason,
                rescheduled_at: new Date().toISOString(),
                rescheduled_by: currentUser
              }
            ]
          }

          arr[idx] = {
            ...arr[idx],
            scheduled_start_at: formatDateTimeFromInput(rescheduleData.newScheduledTime),
            status: 'rescheduled',
            details: details
          }
          setOfflineOrders(arr)
        }
      } else {
        // Update backend order
        const orderData = prepareOrderData({
          ...form,
          scheduled_start_at: rescheduleData.newScheduledTime,
          status: 'rescheduled'
        })

        // Merge existing details and append reschedule history
        orderData.details = { ...(existingDetails || {}), ...(orderData.details || {}) }

        // Get current user name
        const currentUser = getCurrentUser();

        orderData.details.reschedule_history = [
          ...(orderData.details.reschedule_history || []),
          {
            old_time: formatDateTimeFromInput(form.scheduled_start_at),
            new_time: formatDateTimeFromInput(rescheduleData.newScheduledTime),
            reason: rescheduleData.reason,
            rescheduled_at: new Date().toISOString(),
            rescheduled_by: currentUser
          }
        ]

        // Validate fields before submission
        const validation = validateFields(orderData)
        if (!validation.isValid) {
          const errorMessage = `Some fields are not allowed or not recognized for update: ${validation.invalidFields.join(', ')}`
          toast.notify({ type: 'error', message: errorMessage })
          return
        }

        try {
          await orderService.updateOrder(id, orderData)
        } catch (error) {
          // Handle API validation errors
          if (error.response && error.response.data) {
            const apiError = error.response.data
            if (apiError.status === 'error' && apiError.invalid_fields) {
              const errorMessage = `Invalid fields: ${apiError.invalid_fields.join(', ')}. Allowed fields: ${apiError.allowed_fields?.join(', ') || 'N/A'}`
              toast.notify({ type: 'error', message: errorMessage })
              return
            }
          }
          throw error // Re-throw if not a validation error
        }
      }

      toast.notify({
        type: 'success',
        message: `Order rescheduled successfully from ${formatDateTimeFromInput(form.scheduled_start_at)} to ${formatDateTimeFromInput(rescheduleData.newScheduledTime)}`
      })

      setShowRescheduleModal(false)
      nav('/orders')
    } catch (e) {
      toast.notify({ type: 'error', message: `Failed to reschedule order: ${e.message}` })
    }
  }

  const submit = async (e, statusOverride = null) => {
    if (e && e.preventDefault) e.preventDefault()

    // Prevent submission if order is not editable and clinical fields cannot be edited either
    if (isEditMode && !isOrderEditable && !canEditClinicalFields && !statusOverride) {
      toast.notify({
        type: 'error',
        message: 'Order is completed. All fields are locked. Only file uploads are allowed.'
      })
      return
    }

    // For completed orders, only allow file uploads, not form submission — except clinical backfill
    if (isEditMode && isOrderCompleted && !allowClinicalBackfill) {
      toast.notify({
        type: 'error',
        message: 'Order is completed. Only file uploads are allowed. Form submission is disabled.'
      })
      return
    }

    const errs = validate()
    if (errs.length) {
      toast.notify({ type: 'error', message: errs[0] });
      return
    }

    try {
      if (isEditMode) {
        // UPDATE MODE
        // Check if it's an offline order using secure storage
        const offlineOrders = getOfflineOrders()
        const isOffline = isOfflineOrder(id)

        if (isOffline) {
          // Update offline order
          const updated = updateOfflineOrder(id)
          // Use order_number for display (more user-friendly)
          const orderIdentifier = updated.order_number || updated.accession_number || updated.accession_no || 'Offline order'
          toast.notify({ type: 'success', message: `Offline order updated: ${orderIdentifier}` })
        } else {
          // Update backend order
          const formDataToSubmit = statusOverride ? { ...form, status: statusOverride } : form;
          let orderData = prepareOrderData(formDataToSubmit)

          // If clinical backfill is allowed, restrict update to details only
          if (allowClinicalBackfill) {
            orderData = { details: orderData.details || { ...(existingDetails || {}) } }
          }
          // Merge existing details to prevent accidental overwrite when updating
          orderData.details = { ...(existingDetails || {}), ...(orderData.details || {}) }

          // Debug: Log prepared order data (PHI redacted in production)
          secureLog('[OrderForm] Update - Form data:', form)
          secureLog('[OrderForm] Update - Prepared orderData:', orderData)
          secureLog('[OrderForm] Update - referring_doctor in payload:', orderData.referring_doctor)

          // Preserve reschedule history when updating other data
          if (rescheduleHistory && rescheduleHistory.length > 0) {
            orderData.details = { ...(orderData.details || {}), reschedule_history: rescheduleHistory }
          }

          // Validate fields before submission
          const validation = validateFields(orderData)
          if (!validation.isValid) {
            const errorMessage = `Some fields are not allowed or not recognized for update: ${validation.invalidFields.join(', ')}`
            toast.notify({ type: 'error', message: errorMessage })
            return
          }

          try {
            const response = await orderService.updateOrder(id, orderData)

            // Debug: Log backend response (PHI redacted in production)
            secureLog('[OrderForm] Update - Backend response:', response)
            secureLog('[OrderForm] Update - referring_doctor in response:', response?.order?.referring_doctor || response?.referring_doctor)

            // Use order_number for display (more user-friendly than UUID)
            const orderIdentifier = response?.order_number ||
              response?.order?.order_number ||
              response?.accession_number ||
              response?.data?.accession_number ||
              response?.data?.order_number ||
              'Order'
            toast.notify({ type: 'success', message: `Order updated: ${orderIdentifier}` })
          } catch (error) {
            // Handle API validation errors
            if (error.response && error.response.data) {
              const apiError = error.response.data
              if (apiError.status === 'error' && apiError.invalid_fields) {
                const errorMessage = `Invalid fields: ${apiError.invalid_fields.join(', ')}. Allowed fields: ${apiError.allowed_fields?.join(', ') || 'N/A'}`
                toast.notify({ type: 'error', message: errorMessage })
                return
              }
            }
            throw error // Re-throw if not a validation error
          }
        }
      } else {
        // CREATE MODE - Try to save to backend API first, fallback to offline
        // Prepare order data for API submission
        const formDataToSubmit = statusOverride ? { ...form, status: statusOverride } : form;
        let orderData = prepareOrderData(formDataToSubmit);

        secureLog('[OrderForm] Create - Form data:', form)
        secureLog('[OrderForm] Create - Initial orderData:', orderData)

        // Fetch patient details if patient_id is provided
        if (form.patient_id) {
          try {
            const patientDetails = await getPatient(form.patient_id);
            // Include required patient fields in the order data
            if (patientDetails) {
              secureLog('[OrderForm] Create - Patient details fetched:', patientDetails)
              // Add patient details to order data
              orderData = {
                ...orderData,
                patient_name: patientDetails.patient_name || patientDetails.name || form.patient_name,
                patient_national_id: patientDetails.patient_national_id || patientDetails.patient_id || form.patient_id,
                satusehat_ihs_number: patientDetails.ihs_number || patientDetails.satusehat_ihs_number || form.patient_id,
                gender: patientDetails.gender || patientDetails.sex,
                birth_date: patientDetails.birth_date || patientDetails.birthdate,
                medical_record_number: patientDetails.medical_record_number || patientDetails.mrn || form.patient_id,
                phone: patientDetails.phone || patientDetails.contact_phone,
                address: patientDetails.address,
                email: patientDetails.email
              };
            }
          } catch (patientError) {
            console.warn('[OrderForm] Create - Failed to fetch patient details:', patientError);
            // Continue with original order data if patient fetch fails
          }
        }

        // Validate fields before submission
        const validation = validateFields(orderData);
        if (!validation.isValid) {
          const errorMessage = `Some fields are not allowed or not recognized for create: ${validation.invalidFields.join(', ')}`;
          toast.notify({ type: 'error', message: errorMessage });
          return;
        }

        secureLog('[OrderForm] Create - Final orderData before API call:', orderData)

        // Try to create order in backend API
        try {
          const createdOrder = await orderService.createOrder(orderData);
          secureLog('[OrderForm] Create - Backend response:', createdOrder)
          // Use order_number for display (more user-friendly)
          const orderIdentifier = createdOrder.order_number || createdOrder.accession_number || createdOrder.accession_no || createdOrder.id || 'New order'
          toast.notify({ type: 'success', message: `✅ Order created successfully: ${orderIdentifier}` });
          nav('/orders')
        } catch (apiError) {
          // If backend API fails, save offline as fallback

          // Show detailed error to user
          const errorDetail = apiError.response?.data?.message || apiError.message || 'Unknown error'
          toast.notify({
            type: 'warning',
            message: `⚠️ Backend unavailable: ${errorDetail}. Saving offline...`
          });

          const rec = saveOfflineOrder();
          // Use order_number for display (more user-friendly)
          const orderIdentifier = rec.order_number || rec.accession_number || rec.accession_no || rec.id || 'Offline order'
          toast.notify({ type: 'info', message: `💾 Order saved offline: ${orderIdentifier}` });
          nav('/orders')
        }
      }
    } catch (e) {
      toast.notify({ type: 'error', message: `Failed to save order: ${e.message}` })
    }
  }

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold mb-4">
        {isEditMode ? 'Edit Order' : 'Create Order (Offline Capable)'}
      </h1>
      {!isEditMode && (
        <div className="mb-3 text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 p-2 rounded">
          Mode ini memungkinkan input langsung jika bridging SIMRS/Backend down. Data disimpan sementara di browser dan akan ikut tampil di Orders/Worklist.
        </div>
      )}
      {/* Warning message for non-editable orders */}
      {/* Warning for arrived/in_progress status - procedures locked */}
      {isEditMode && ['arrived', 'in_progress'].includes(form.status) && (
        <div className="mb-3 alert-info flex items-start gap-2 text-sm">
          <Icon name="information" className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>Order is in <strong>{form.status}</strong> status. Patient, procedure, and referring doctor information cannot be changed. Other clinical fields (nurse, reason, ICD, tags) can still be edited.</div>
        </div>
      )}
      {isEditMode && isOrderReschedulableOnly && (
        <div className="mb-3 text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 p-2 rounded flex items-start gap-2">
          <Icon name="alert" className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>Order is in {form.status} status. Patient and procedure information cannot be changed. Clinical fields (referring doctor, nurse, reason, ICD, tags) can still be edited.</div>
        </div>
      )}
      {isEditMode && !isOrderEditable && !isOrderReschedulableOnly && !isOrderCompleted && !['arrived', 'in_progress'].includes(form.status) && (
        <div className="mb-3 text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 p-2 rounded flex items-start gap-2">
          <Icon name="information" className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>Order is in {form.status} status. Patient and procedure information cannot be changed. Clinical fields (referring doctor, nurse, reason, ICD, tags) can still be edited.</div>
        </div>
      )}
      {isEditMode && isOrderCompleted && !allowClinicalBackfill && (
        <div className="mb-3 text-xs text-blue-700 bg-blue-50 border border-blue-200 p-2 rounded flex items-start gap-2">
          <Icon name="alert" className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>Order is completed. All fields are locked. Only file uploads are allowed for this order.</div>
        </div>
      )}
      {isEditMode && isOrderCompleted && allowClinicalBackfill && (
        <div className="mb-3 text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 p-2 rounded flex items-start gap-2">
          <Icon name="information" className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>Order is completed. ICD-10, tags, atau reason kosong — kamu boleh mengisi kolom tersebut. Field lainnya tetap terkunci.</div>
        </div>
      )}
      {isEditMode && form.status === 'cancelled' && (
        <div className="mb-3 text-xs text-red-700 bg-red-50 border border-red-200 p-2 rounded flex items-start gap-2">
          <Icon name="x" className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>Order has been cancelled. All fields are locked and cannot be modified.</div>
        </div>
      )}
      {isEditMode && hasEverArrived && (
        <div className="mb-3 text-xs text-red-700 bg-red-50 border border-red-200 p-2 rounded flex items-start gap-2">
          <Icon name="alert" className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>Order has recorded arrival previously — rescheduling is disabled for this order.</div>
        </div>
      )}

      {/* Warning for draft/created orders without progression - NO TIME CHECK */}
      {isEditMode && isOrderStale && !hasEverArrived && (
        <div className="mb-3 text-sm text-blue-800 bg-blue-50 border-2 border-blue-300 p-3 rounded-lg shadow-sm">
          <div className="flex items-start gap-2">
            <Icon name="pencil" className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold mb-1">Order Status: {form.status.toUpperCase()}</div>
              <div className="text-xs mb-2">
                This order is still in <strong>{form.status}</strong> status with no status progression recorded.
              </div>
              <div className="text-xs space-y-1">
                <div className="flex items-center gap-2">
                  <Icon name="alert" className="w-4 h-4" />
                  <strong>Please Review:</strong>
                </div>
                <ul className="list-disc list-inside ml-4 space-y-0.5">
                  <li>Update the order status if the examination workflow has progressed</li>
                  <li>Complete any missing information and move to the next status</li>
                  <li>Cancel the order if it is no longer valid or needed</li>
                </ul>
                <div className="mt-2 pt-2 border-t border-blue-200">
                  <div className="flex items-center gap-1 text-blue-700">
                    <Icon name="information" className="w-4 h-4" />
                    <span className="text-xs italic">
                      Note: Reschedule feature is not available for {form.status} status. Please set the order to "scheduled" status first.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Warning for scheduled/enqueued/rescheduled orders with expired time */}
      {/* Preview Mode Banner */}
      {isPreview && (
        <div className="mb-4 bg-themed-accent-light/10 border border-themed-accent p-4 rounded-lg">
          <div className="flex items-start gap-3">
            <Icon name="information" className="w-5 h-5 text-themed-primary flex-shrink-0" />
            <div>
              <h3 className="text-sm font-medium text-themed-primary">Preview Mode</h3>
              <div className="mt-1 text-sm">
                <p>
                  This order data was imported from <strong>SIMRS ({simrsSource?.toUpperCase() || 'EXTERNAL'})</strong>.
                </p>
                <p className="mt-1">
                  Please review the details below. You can modify any field if necessary.
                  Click <strong>"Create Order"</strong> at the bottom to finalize and save this order to PACS.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {isEditMode && isScheduleExpired && !hasEverArrived && !isOrderStale && (
        <div className="mb-3 text-sm bg-red-50 border border-red-200 p-3 rounded-lg">
          <div className="flex items-start gap-2">
            <Icon name="clock" className="w-5 h-5 text-red-600 flex-shrink-0" />
            <div className="flex-1">
              <div className="font-semibold mb-1 text-red-800">Scheduled Time Has Passed</div>
              <div className="text-xs mb-2 text-red-700">
                The scheduled time for this order was <strong>{formatDateTimeForDisplay(form.scheduled_start_at)}</strong> ({getTimeDifferenceText(form.scheduled_start_at)}) but there has been no status progression.
              </div>
              <div className="text-xs space-y-1 text-red-700">
                <div className="flex items-center gap-2">
                  <Icon name="alert" className="w-4 h-4" />
                  <strong>Recommended Actions:</strong>
                </div>
                <ul className="list-disc list-inside ml-4 space-y-0.5">
                  <li>Use the <strong>"Reschedule"</strong> button below to set a new time if the order is still valid</li>
                  <li>Cancel the order if it is no longer needed or the patient did not show up</li>
                  <li>Update the status manually if the examination has been completed</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={submit} className="card space-y-6">
        <section>
          <h2 className="font-semibold mb-3">Patient & Procedure</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Patient */}
            <div>
              <label className="block text-sm mb-1">Patient (search MRN/Name)</label>
              <Select2
                value={form.patient_id}
                onChange={(val) => setForm(prev => ({ ...prev, patient_id: val }))}
                onSelect={(opt) => setForm(prev => ({ ...prev, patient_id: opt?.meta?.mrn || '', patient_name: opt?.meta?.name || '' }))}
                fetchOptions={(q) => api.searchPatients(q)}
                fetchInitial={() => api.samplePatients()}
                minChars={3}
                placeholder="Search MRN/Name (min 3 chars)"
                initialLabel={isEditMode && form.patient_id ? `${form.patient_id} · ${form.patient_name}` : ''}
                disabled={isEditMode} // Make patient field read-only in edit mode
                clearable={false} // Disable clear button in edit mode
              />
              <div className="text-xs text-slate-500 mt-1">Atau isi manual bila pasien tidak ada di master:</div>
              <input
                className={`input-themed w-full mt-1 ${isEditMode ? 'bg-gray-100' : ''}`}
                placeholder="Patient Name (manual)"
                value={form.patient_name}
                onChange={e => setForm(prev => ({ ...prev, patient_name: sanitizeInput(e.target.value, 'text') }))}
                readOnly={isEditMode} // Make patient name read-only in edit mode
              />
              <div className="text-xs text-slate-500 mt-2">Registration Number (No. Kunjungan SIMRS):</div>
              <input
                className={`input-themed w-full mt-1 ${isEditMode ? 'bg-gray-100' : ''}`}
                placeholder="e.g. REG-2024-001234"
                value={form.registration_number}
                onChange={e => setForm(prev => ({ ...prev, registration_number: sanitizeInput(e.target.value, 'alphanumeric') }))}
                readOnly={isEditMode} // Make registration number read-only in edit mode
              />
              <div className="text-xs text-slate-400 mt-1">
                💡 Isi jika bridging SIMRS belum aktif (manual input)
              </div>
            </div>

            {/* Procedure */}
            <div className="col-span-1 md:col-span-2">
              <label className="block text-sm mb-1">Requested Procedures</label>

              {/* Procedure Selection */}
              <div className="flex gap-2 mb-3 items-end">
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">Procedure</label>
                  <Select2
                    value={form.requested_procedure}
                    onChange={(val) => setForm(prev => ({ ...prev, requested_procedure: val }))}
                    onSelect={(opt) => setForm(prev => ({
                      ...prev,
                      requested_procedure: opt?.meta?.code || opt?.value || '',
                      procedure_code: opt?.meta?.code || '',
                      procedure_name: opt?.meta?.name || '',
                      procedure_modality: opt?.meta?.modality || '',
                      procedure_loinc_code: opt?.meta?.loinc_code || '',
                      procedure_loinc_display: opt?.meta?.loinc_display || ''
                    }))}
                    fetchOptions={async (q) => {
                      const results = await procedureService.searchProcedures({ q })
                      return (results || []).slice(0, 10).map(p => ({
                        value: p.code || p.id,
                        label: `${p.code} - ${p.name}${p.loinc_code ? ` (LOINC: ${p.loinc_code})` : ''}`,
                        meta: {
                          code: p.code,
                          name: p.name,
                          loinc_code: p.loinc_code,
                          loinc_display: p.loinc_display,
                          category: p.category,
                          modality: p.modality
                        }
                      }))
                    }}
                    fetchInitial={async () => {
                      const results = await procedureService.listProcedures({ page_size: 5 })
                      return (results || []).slice(0, 5).map(p => ({
                        value: p.code || p.id,
                        label: `${p.code} - ${p.name}${p.loinc_code ? ` (LOINC: ${p.loinc_code})` : ''}`,
                        meta: {
                          code: p.code,
                          name: p.name,
                          loinc_code: p.loinc_code,
                          loinc_display: p.loinc_display,
                          category: p.category,
                          modality: p.modality
                        }
                      }))
                    }}
                    minChars={3}
                    placeholder="Search procedure code or name (min 3 chars)"
                    initialLabel={isEditMode && form.requested_procedure ? `${form.procedure_code || form.requested_procedure} - ${form.procedure_name || form.requested_procedure}` : ''}
                    disabled={isEditMode && !canEditProcedures}
                    clearable={true}
                  />
                </div>
                <div className="w-48">
                  <label className="block text-xs text-gray-500 mb-1">Scheduled Time</label>
                  <input
                    type="datetime-local"
                    className="input-themed w-full text-sm"
                    value={form.scheduled_start_at}
                    onChange={e => setForm(prev => ({ ...prev, scheduled_start_at: e.target.value }))}
                    disabled={isEditMode && !canEditProcedures}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddProcedure}
                  disabled={!form.requested_procedure || (isEditMode && !canEditProcedures) || editingProcedureId !== null}
                  className="btn-themed-secondary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  title={editingProcedureId ? "Finish editing current procedure first" : "Add procedure to order"}
                >
                  <Icon name="plus" className="w-4 h-4" />
                  Add
                </button>
              </div>

              {/* Edit mode helper text */}
              {editingProcedureId && (
                <div className="mb-2 alert-info flex items-start gap-2">
                  <Icon name="pencil" className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div><strong>Edit Mode:</strong> Select a new procedure above if needed, edit the scheduled time in the table, then click <strong className="text-themed-primary">Save</strong> button in the table row.</div>
                </div>
              )}

              {/* Procedures List */}
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left">Code</th>
                      <th className="px-4 py-2 text-left">Accession No</th>
                      <th className="px-4 py-2 text-left">Procedure Name</th>
                      <th className="px-4 py-2 text-left">Modality</th>
                      <th className="px-4 py-2 text-left">Scheduled At</th>
                      <th className="px-4 py-2 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {procedures.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="px-4 py-4 text-center text-gray-500 italic">
                          No procedures added yet. Search and add procedures above.
                        </td>
                      </tr>
                    ) : (
                      procedures.map((proc) => {
                        const isEditing = editingProcedureId === proc.id

                        return (
                          <tr key={proc.id} className={isEditing ? "bg-blue-50" : "hover:bg-gray-50"}>
                            <td className="px-4 py-2 font-mono text-xs">{isEditing ? editingProcedure?.code : proc.code}</td>
                            <td className="px-4 py-2">
                              {isEditing ? (
                                <input
                                  className="border rounded px-2 py-1 w-full text-xs font-mono"
                                  value={editingProcedure?.accession_number || ''}
                                  onChange={(e) => handleEditFieldChange('accession_number', e.target.value)}
                                  readOnly={config.accessionReadOnlyAfterCreate && isEditMode}
                                  placeholder="Auto-generated"
                                />
                              ) : (
                                <span className="font-mono text-xs text-slate-600">{proc.accession_number || '-'}</span>
                              )}
                            </td>
                            <td className="px-4 py-2">
                              {isEditing ? (
                                <div className="text-sm text-gray-700 bg-gray-50 px-2 py-1 rounded border border-gray-200">
                                  {editingProcedure?.name || '-'}
                                  <div className="text-xs text-gray-500 mt-1">
                                    💡 To change procedure: select from dropdown above, then click Save
                                  </div>
                                </div>
                              ) : (
                                proc.name
                              )}
                            </td>
                            <td className="px-4 py-2">{isEditing ? editingProcedure?.modality : proc.modality}</td>
                            <td className="px-4 py-2 text-xs">
                              {isEditing ? (
                                <input
                                  type="datetime-local"
                                  className="border rounded px-2 py-1 w-full text-xs"
                                  value={editingProcedure?.scheduled_at || ''}
                                  onChange={(e) => handleEditFieldChange('scheduled_at', e.target.value)}
                                />
                              ) : (
                                proc.scheduled_at ? formatDateTimeForDisplay(proc.scheduled_at) : '-'
                              )}
                            </td>
                            <td className="px-4 py-2 text-center">
                              {isEditing ? (
                                <div className="flex gap-1 justify-center">
                                  <button
                                    type="button"
                                    onClick={handleSaveEdit}
                                    className="btn-themed-sm"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleCancelEdit}
                                    className="btn-themed-secondary text-xs px-2 py-1"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <div className="flex gap-1 justify-center">
                                  <button
                                    type="button"
                                    onClick={() => handleEditProcedure(proc)}
                                    disabled={isEditMode && !canEditProcedures}
                                    className="text-themed-primary hover:underline disabled:text-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-themed-accent-light"
                                  >
                                    Edit
                                  </button>
                                  <span className="text-gray-300">|</span>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveProcedure(proc.id)}
                                    disabled={isEditMode && !canEditProcedures}
                                    className="text-red-600 hover:text-red-800 disabled:text-gray-400 text-sm"
                                  >
                                    Remove
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Global Schedule Input Removed - Now per procedure */}
            {/* 
            <div>
              <label className="block text-sm mb-1">Scheduled Start</label>
              <input
                type="datetime-local"
                className={`input-themed w-full ${isEditMode && (isOrderReschedulableOnly || !isOrderEditable) ? 'bg-gray-100' : ''}`}
                value={form.scheduled_start_at}
                onChange={e => setForm(prev => ({ ...prev, scheduled_start_at: e.target.value }))}
                disabled={isEditMode && (isOrderReschedulableOnly || !isOrderEditable)}
                min={form.created_at ? new Date(form.created_at).toISOString().slice(0, 16) : undefined}
              />
            </div>
            */}
          </div>
        </section >

        {/* Clinical details + People */}
        < section >
          <h2 className="font-semibold mb-3">Clinical & Staff</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Priority */}
            {/* 
            <div>
              <label className="block text-sm mb-1">Priority</label>
              <select className={`input-themed w-full ${isEditMode && (isOrderReschedulableOnly || !isOrderEditable) ? 'bg-gray-100' : ''}`}
                value={form.priority}
                onChange={e=>setForm(prev=>({...prev, priority:e.target.value}))}
                disabled={isEditMode && (isOrderReschedulableOnly || !isOrderEditable)}>
                <option value="routine">Routine</option>
                <option value="urgent">Urgent</option>
                <option value="stat">STAT</option>
              </select>
            </div>
            */}

            {/* Laterality */}
            {/* 
            <div>
              <label className="block text-sm mb-1">Laterality</label>
              <select className={`input-themed w-full ${isEditMode && (isOrderReschedulableOnly || !isOrderEditable) ? 'bg-gray-100' : ''}`}
                value={form.laterality}
                onChange={e=>setForm(prev=>({...prev, laterality:e.target.value}))}
                disabled={isEditMode && (isOrderReschedulableOnly || !isOrderEditable)}>
                <option value="NA">N/A</option>
                <option value="L">Left</option>
                <option value="R">Right</option>
                <option value="B">Both</option>
              </select>
            </div>
            */}

            {/* Body Part */}
            {/* 
            <div>
              <label className="block text-sm mb-1">Body Part</label>
              <input className={`input-themed w-full ${isEditMode && (isOrderReschedulableOnly || !isOrderEditable) ? 'bg-gray-100' : ''}`} placeholder="e.g. Abdomen"
                value={form.body_part} 
                onChange={e=>setForm(prev=>({...prev, body_part:e.target.value}))}
                readOnly={isEditMode && (isOrderReschedulableOnly || !isOrderEditable)}
              />
            </div>
            */}

            {/* Contrast */}
            {/* 
            <div>
              <label className="block text-sm mb-1">Contrast</label>
              <select className={`input-themed w-full ${isEditMode && (isOrderReschedulableOnly || !isOrderEditable) ? 'bg-gray-100' : ''}`}
                value={form.contrast}
                onChange={e=>setForm(prev=>({...prev, contrast:e.target.value}))}
                disabled={isEditMode && (isOrderReschedulableOnly || !isOrderEditable)}>
                <option value="none">None</option>
                <option value="with">With contrast</option>
                <option value="without">Without contrast</option>
                <option value="both">With & Without</option>
              </select>
            </div>
            */}

            {/* 
            <div className="flex items-center gap-2">
              <input id="algy" type="checkbox"
                checked={form.contrast_allergy}
                onChange={e=>setForm(prev=>({...prev, contrast_allergy:e.target.checked}))}
                disabled={isEditMode && (isOrderReschedulableOnly || !isOrderEditable)}
              />
              <label htmlFor="algy" className={`text-sm ${isEditMode && (isOrderReschedulableOnly || !isOrderEditable) ? 'text-gray-400' : ''}`}>Known contrast allergy</label>
            </div>
            */}

            {/* Referring Doctor (Select2) */}
            <div className="md:col-span-3">
              <label className="block text-sm mb-1">Referring Doctor {form.status === 'completed' && <span className="text-red-500">*</span>}</label>
              <Select2
                value={form.referring_id}
                onChange={(val) => setForm(prev => ({ ...prev, referring_id: val }))}
                onSelect={(opt) => setForm(prev => ({
                  ...prev,
                  // Use option.value so the Select2 input reflects the selection immediately
                  // (doctor options use ihs_number or id as value)
                  referring_id: opt?.value || opt?.meta?.id || '',
                  referring_name: opt?.meta?.name || opt?.label || ''
                }))}
                fetchOptions={(q) => api.searchDoctors(q)}
                fetchInitial={() => api.sampleDoctors()}
                minChars={3}
                placeholder="Search doctor (min 3 chars)"
                initialLabel={isEditMode && form.referring_name ? form.referring_name : ''}
                disabled={isEditMode && !canEditProcedures}
                clearable={isEditMode && canEditProcedures}
              />
              {form.referring_name && <div className="text-xs text-slate-500 mt-1">Selected: {form.referring_name}</div>}
            </div>

            {/* Nurse (Select2) */}
            <div className="md:col-span-3">
              <label className="block text-sm mb-1">Attending Nurse</label>
              <Select2
                value={form.nurse_id}
                onChange={(val) => setForm(prev => ({ ...prev, nurse_id: val }))}
                onSelect={(opt) => setForm(prev => ({ ...prev, nurse_id: opt?.meta?.id || '', nurse_name: opt?.meta?.name || '' }))}
                fetchOptions={(q) => api.searchNurses(q)}
                fetchInitial={() => api.sampleNurses()}
                minChars={3}
                placeholder="Search nurse (min 3 chars)"
                initialLabel={isEditMode && form.nurse_name ? form.nurse_name : ''}
                disabled={isEditMode && !canEditClinicalFields}
                clearable={isEditMode && canEditClinicalFields}
              />
              {form.nurse_name && <div className="text-xs text-slate-500 mt-1">Selected: {form.nurse_name}</div>}
            </div>

            {/* Reason */}
            <div className="md:col-span-3">
              <label className="block text-sm mb-1">Reason for exam</label>
              <textarea
                className={`input-themed w-full ${isEditMode && !canEditClinicalFields ? 'bg-gray-100' : ''}`}
                rows={3}
                value={form.reason}
                onChange={e => setForm(prev => ({ ...prev, reason: sanitizeInput(e.target.value, 'reason') }))}
                readOnly={isEditMode && !canEditClinicalFields}
              />
            </div>

            {/* ICD & Tags */}
            <div>
              <label className="block text-sm mb-1">ICD-10 {(form.status === 'completed' || form.status === 'in_progress') ? <span className="text-red-500">*</span> : '(optional)'}</label>
              <Select2
                value={form.icd10}
                onChange={(val) => setForm(prev => ({ ...prev, icd10: val }))}
                onSelect={(opt) => setForm(prev => ({
                  ...prev,
                  icd10: opt?.value || prev.icd10 || '',
                  icd10_label: opt?.label || prev.icd10_label || ''
                }))}
                fetchOptions={async (q) => {
                  // Mock ICD-10 codes for demonstration
                  // In a real implementation, this would fetch from an ICD-10 API or database
                  const mockICDCodes = [
                    { value: 'R10.9', label: 'R10.9 - Unspecified abdominal pain' },
                    { value: 'R51', label: 'R51 - Headache' },
                    { value: 'R07.4', label: 'R07.4 - Chest pain, unspecified' },
                    { value: 'R06.02', label: 'R06.02 - Shortness of breath' },
                    { value: 'R55', label: 'R55 - Syncope and collapse' },
                    { value: 'R50.9', label: 'R50.9 - Fever, unspecified' },
                    { value: 'R53.83', label: 'R53.83 - Other fatigue' },
                    { value: 'R56.9', label: 'R56.9 - Unspecified convulsions' },
                    { value: 'R57.9', label: 'R57.9 - Shock, unspecified' },
                    { value: 'R59.9', label: 'R59.9 - Enlarged lymph nodes, unspecified' }
                  ]
                  return mockICDCodes.filter(code =>
                    code.value.toLowerCase().includes(q.toLowerCase()) ||
                    code.label.toLowerCase().includes(q.toLowerCase())
                  )
                }}
                fetchInitial={async () => {
                  // Return some sample ICD-10 codes
                  return [
                    { value: 'R10.9', label: 'R10.9 - Unspecified abdominal pain' },
                    { value: 'R51', label: 'R51 - Headache' },
                    { value: 'R07.4', label: 'R07.4 - Chest pain, unspecified' },
                    { value: 'R06.02', label: 'R06.02 - Shortness of breath' },
                    { value: 'R55', label: 'R55 - Syncope and collapse' }
                  ]
                }}
                placeholder="Search ICD-10 code (e.g. R10.9)"
                minChars={1}
                initialLabel={isEditMode && (form.icd10_label || form.icd10) ? (() => {
                  if (form.icd10_label) {
                    // Jika label sudah berformat "code - label", tampilkan apa adanya
                    const pattern = new RegExp(`^${escapeRegExp(String(form.icd10))}\\s*-\\s*`, 'i')
                    if (pattern.test(String(form.icd10_label))) return String(form.icd10_label)
                    // Jika label murni (tanpa kode), komposisi jadi "code - label"
                    const cleanLabel = cleanIcdLabel(String(form.icd10_label), String(form.icd10))
                    return form.icd10 ? `${form.icd10} - ${cleanLabel || form.icd10_label}` : (cleanLabel || form.icd10_label)
                  }
                  // Fallback: cari dari daftar mock berdasarkan code
                  const mockICDCodes = [
                    { value: 'R10.9', label: 'R10.9 - Unspecified abdominal pain' },
                    { value: 'R51', label: 'R51 - Headache' },
                    { value: 'R07.4', label: 'R07.4 - Chest pain, unspecified' },
                    { value: 'R06.02', label: 'R06.02 - Shortness of breath' },
                    { value: 'R55', label: 'R55 - Syncope and collapse' },
                    { value: 'R50.9', label: 'R50.9 - Fever, unspecified' },
                    { value: 'R53.83', label: 'R53.83 - Other fatigue' },
                    { value: 'R56.9', label: 'R56.9 - Unspecified convulsions' },
                    { value: 'R57.9', label: 'R57.9 - Shock, unspecified' },
                    { value: 'R59.9', label: 'R59.9 - Enlarged lymph nodes, unspecified' }
                  ]
                  const selected = mockICDCodes.find(code => code.value === form.icd10)
                  return selected ? selected.label : (form.icd10 || '')
                })() : ''}
                disabled={isEditMode && (form.status === 'completed' || !canEditClinicalFields)}
                clearable={isEditMode && form.status !== 'completed' && canEditClinicalFields}
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Tags</label>
              <Select2
                value={form.tags}
                onChange={(val) => setForm(prev => ({ ...prev, tags: val }))}
                fetchOptions={async (q) => {
                  // Mock tags for demonstration
                  // In a real implementation, this would fetch from a tags API or database
                  const mockTags = [
                    { value: 'trauma', label: 'trauma' },
                    { value: 'follow-up', label: 'follow-up' },
                    { value: 'emergency', label: 'emergency' },
                    { value: 'routine', label: 'routine' },
                    { value: 'contrast', label: 'contrast' },
                    { value: 'pediatric', label: 'pediatric' },
                    { value: 'geriatric', label: 'geriatric' },
                    { value: 'pregnancy', label: 'pregnancy' },
                    { value: 'allergy', label: 'allergy' },
                    { value: 'surgical', label: 'surgical' }
                  ]
                  return mockTags.filter(tag =>
                    tag.value.toLowerCase().includes(q.toLowerCase()) ||
                    tag.label.toLowerCase().includes(q.toLowerCase())
                  )
                }}
                fetchInitial={async () => {
                  // Return some sample tags
                  return [
                    { value: 'trauma', label: 'trauma' },
                    { value: 'follow-up', label: 'follow-up' },
                    { value: 'emergency', label: 'emergency' },
                    { value: 'routine', label: 'routine' },
                    { value: 'contrast', label: 'contrast' }
                  ]
                }}
                placeholder="Add tags (press Enter to create new tag)"
                minChars={1}
                multi={true}
                taggable={true}
                disabled={isEditMode && !canEditClinicalFields}
                clearable={isEditMode && canEditClinicalFields}
              />
            </div>
          </div>
        </section >

        {/* Exam Results & Attachments */}
        {isEditMode && (
          <section className="card bg-gradient-to-br from-blue-50 to-slate-50 border-2 border-blue-200">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="font-semibold text-lg text-slate-800 flex items-center gap-2">
                  🔬 Exam Results &amp; Attachments
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  Upload exam results, DICOM images, reports, lab results, and other supporting documents
                </p>
              </div>

              {orderFiles.length > 0 && (
                <div className="text-right">
                  <FileListStats files={orderFiles} />
                </div>
              )}
            </div>

            {canShowFileUpload ? (
              <>
                <div className="mb-4">
                  <FileUploader
                    orderId={id}
                    category="exam_result"
                    accept={{
                      'image/*': ['.png', '.jpg', '.jpeg', '.gif'],
                      'application/pdf': ['.pdf'],
                      'application/dicom': ['.dcm'],
                      'text/plain': ['.txt']
                    }}
                    maxSize={50 * 1024 * 1024}
                    maxFiles={10}
                    onUploadComplete={handleUploadComplete}
                    onUploadError={handleUploadError}
                  />
                </div>

                <FileList
                  orderId={id}
                  files={orderFiles}
                  onRefresh={() => loadOrderFiles(id)}
                  readOnly={false}
                  showCategory={true}
                  showDescription={true}
                />
              </>
            ) : (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800 mb-4 flex items-start gap-2">
                <Icon name="alert" className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  File upload is only available for orders with <strong>Completed</strong> status.
                  Current status is <strong>{form.status}</strong>.
                </div>
              </div>
            )}

            <div className="mt-4 alert-info">
              <div className="text-xs space-y-1">
                <p className="font-medium flex items-center gap-2">
                  <Icon name="information" className="w-4 h-4" />
                  Supported File Types:
                </p>
                <ul className="list-disc list-inside ml-4 space-y-0.5">
                  <li><strong>Images:</strong> JPG, PNG, GIF (max 10MB)</li>
                  <li><strong>Documents:</strong> PDF (max 20MB)</li>
                  <li><strong>DICOM:</strong> DCM files (max 100MB)</li>
                </ul>
                <p className="mt-2 flex items-center gap-2">
                  <Icon name="lightbulb" className="w-4 h-4" />
                  <em>Tip: Files are stored securely and can be downloaded anytime</em>
                </p>
              </div>
            </div>
          </section>
        )}


        {/* Legacy file picker (for backward compatibility) */}
        {
          !isEditMode && files.length > 0 && (
            <section>
              <h2 className="font-semibold mb-3">Legacy Attachments</h2>
              <ul className="mt-2 text-sm list-disc pl-5">
                {files.map((f, i) => <li key={i}>{f.name} <span className="text-slate-500">({Math.round(f.size / 1024)} KB)</span></li>)}
              </ul>
            </section>
          )
        }

        {/* Reschedule History */}
        {
          isEditMode && form.status === 'rescheduled' && (
            <section className="card bg-gradient-to-br from-yellow-50 to-slate-50 border-2 border-yellow-200">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h2 className="font-semibold text-lg text-slate-800 flex items-center gap-2">
                    <Icon name="clock" className="w-5 h-5" />
                    Reschedule History
                  </h2>
                  <p className="text-sm text-slate-600 mt-1">
                    View reschedule history for this order
                  </p>
                </div>
              </div>
              <div className="bg-white border border-yellow-200 rounded-lg p-4">
                {rescheduleHistory && rescheduleHistory.length > 0 ? (
                  <div className="space-y-3">
                    {rescheduleHistory.map((history, index) => (
                      <div key={index} className="border-b border-yellow-100 pb-3 last:border-b-0 last:pb-0">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-medium text-yellow-800">
                              Rescheduled on {formatDateTimeForDisplay(history.rescheduled_at)}
                            </div>
                            <div className="text-sm text-slate-600 mt-1">
                              <span className="font-medium">Reason:</span> {history.reason}
                            </div>
                            {history.rescheduled_by && (
                              <div className="text-xs text-slate-500 mt-1">
                                Rescheduled by: {history.rescheduled_by}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-xs text-slate-500 mt-2">
                          Changed from <span className="font-mono">{formatDateTimeForDisplay(history.old_time)}</span> to <span className="font-mono">{formatDateTimeForDisplay(history.new_time)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-slate-600 italic">
                    No reschedule history available
                  </div>
                )}
              </div>
            </section>
          )
        }

        <div className="flex gap-2">
          <button
            type="submit"
            className="btn-themed-primary disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isEditMode && !canEditClinicalFields}
            title={isEditMode && form.status === 'cancelled' ? 'Cannot update cancelled order' : ''}
          >
            {isEditMode ? 'Update' : 'Save'}
          </button>

          {/* Schedule Button for Draft/Created Orders */}
          {isEditMode && ['draft', 'created'].includes(form.status) && (
            <button
              type="button"
              onClick={(e) => submit(e, 'scheduled')}
              className="btn-themed-primary flex items-center gap-2"
              title="Confirm schedule and update status to Scheduled"
            >
              <Icon name="calendar" className="w-4 h-4" /> Schedule Order
            </button>
          )}
          {isEditMode && canShowReschedule && (
            hasEverArrived ? (
              <button
                type="button"
                className="btn-themed-secondary cursor-not-allowed opacity-50"
                disabled
                title="Reschedule disabled for orders that have arrived"
              >
                <Icon name="calendar" className="w-4 h-4" />
                Reschedule
              </button>
            ) : (
              <button
                type="button"
                className={`btn-themed-secondary flex items-center gap-2 ${isScheduleExpired && !isOrderStale ? 'bg-red-50 border-red-200 text-red-700 hover:bg-red-50' : ''}`}
                onClick={handleReschedule}
                id="reschedule-btn"
                title={isScheduleExpired && !isOrderStale ? 'Scheduled time has passed - reschedule required' : 'Reschedule this order'}
              >
                <Icon name="calendar" className="w-4 h-4" />
                Reschedule{isScheduleExpired && !isOrderStale && ' (Expired)'}
              </button>
            )
          )}
          <button type="button" className="btn-themed-secondary" onClick={() => nav('/orders')}>Cancel</button>
        </div>

      </form >

      {/* Reschedule Modal */}
      {
        showRescheduleModal && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center"
            style={{ zIndex: 9999 }}
            onClick={() => setShowRescheduleModal(false)}
          >
            <div
              className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-800">Reschedule Order</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Current time: <span className="font-medium">{formatDateTimeFromInput(form.scheduled_start_at)}</span>
                </p>
              </div>

              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    New Scheduled Time <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    className="input-themed w-full focus:outline-none focus:ring-2 focus:ring-themed-accent-light focus:border-transparent"
                    value={rescheduleData.newScheduledTime}
                    onChange={(e) => {
                      // Validate that reschedule time is not earlier than order creation time
                      if (!validateScheduledTime(e.target.value, form.created_at)) {
                        showDateTimeValidationError(form.created_at);
                        return;
                      }
                      setRescheduleData(prev => ({ ...prev, newScheduledTime: e.target.value }));
                    }}
                    min={form.created_at ? new Date(form.created_at).toISOString().slice(0, 16) : undefined}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Reason for Reschedule <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    className="input-themed w-full focus:outline-none focus:ring-2 focus:ring-themed-accent-light focus:border-transparent"
                    rows={4}
                    placeholder="e.g., Patient request, equipment unavailable, emergency case priority..."
                    value={rescheduleData.reason}
                    onChange={(e) => setRescheduleData(prev => ({ ...prev, reason: sanitizeInput(e.target.value, 'reason') }))}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Please provide a clear reason for the reschedule
                  </p>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
                <button
                  type="button"
                  className="btn-themed-secondary"
                  onClick={() => setShowRescheduleModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-themed-primary"
                  onClick={submitReschedule}
                >
                  <Icon name="calendar" className="w-4 h-4" />
                  Confirm Reschedule
                </button>
              </div>
            </div>
          </div>
        )
      }
    </div >
  )
}
