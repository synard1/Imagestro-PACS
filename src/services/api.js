import { getConfig } from './config'
import { fetchJson } from './http'
import { notify } from './notifications'
import { listDoctors, getDoctor, createDoctor, updateDoctor, deleteDoctor } from './doctorService'
import { listAuditLogs as fetchAuditLogs } from './auditService'
import { loadRegistry } from './api-registry'

const mockDataLoaders = {
  patients: () => import('../data/patients.json'),
  doctors: () => import('../data/doctors.json'),
  nurses: () => import('../data/nurses.json'),
  orders: () => import('../data/orders.json'),
  procedures: () => import('../data/procedures.json'),
  modalities: () => import('../data/modalities.json'),
  dicomNodes: () => import('../data/dicomNodes.json'),
  users: () => import('../data/users.json'),
  auditLogs: () => import('../data/auditLogs.json'),
}

const mockDataCache = {}

async function loadMockData(key) {
  if (!mockDataLoaders[key]) {
    throw new Error(`Unknown mock data key: ${key}`)
  }
  if (!mockDataCache[key]) {
    mockDataCache[key] = mockDataLoaders[key]().then(mod => mod.default ?? mod)
  }
  return mockDataCache[key]
}

async function loadMockBatch(keys = []) {
  const entries = await Promise.all(
    keys.map(async (key) => [key, await loadMockData(key)])
  )
  return Object.fromEntries(entries)
}

const getPatientsMock = () => loadMockData('patients')
const getDoctorsMock = () => loadMockData('doctors')
const getNursesMock = () => loadMockData('nurses')
const getOrdersMock = () => loadMockData('orders')
const getProceduresMock = () => loadMockData('procedures')
const getModalitiesMock = () => loadMockData('modalities')
const getDicomNodesMock = () => loadMockData('dicomNodes')
const getUsersMock = () => loadMockData('users')
const getAuditLogsMock = () => loadMockData('auditLogs')

// Re-export onNotify for backward compatibility
export { onNotify } from './notifications'

const delay = (ms) => new Promise(res => setTimeout(res, ms))
const respond = async (data) => { await delay(150); return JSON.parse(JSON.stringify(data)) }

// Helper function for sampling arrays
function sample(arr, n=5){
  const a = Array.isArray(arr) ? [...arr] : []
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a.slice(0, n)
}

// ===== Mock builders (same as before) =====
function buildTrend(orders = []) {
  const days = []
  const now = new Date()
  for (let i=6; i>=0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate()-i)
    const key = d.toISOString().slice(0,10)
    days.push({ date: key, orders: 0, scheduled: 0, completed: 0 })
  }
  for (const o of orders) {
    const key = (o.scheduled_start_at || '').slice(0,10)
    const bucket = days.find(x => x.date === key)
    if (bucket) {
      bucket.orders += 1
      if (o.status === 'scheduled') bucket.scheduled += 1
      if (o.status === 'completed') bucket.completed += 1
    }
  }
  return days
}
function buildStatusBreakdown(orders = []) {
  const map = { scheduled: 0, in_progress: 0, completed: 0, cancelled: 0 }
  for (const o of orders) map[o.status] = (map[o.status] || 0) + 1
  return Object.entries(map).map(([name, value]) => ({ name, value }))
}
const recentWorklist = (orders = []) => orders
  .filter(o => ['scheduled','in_progress'].includes(o.status))
  .sort((a,b) => (a.scheduled_start_at > b.scheduled_start_at ? -1 : 1))
  .slice(0,5)

// ===== Backend-or-mock helpers =====
async function resolveFallback(fallback) {
  if (typeof fallback === 'function') return await fallback()
  return fallback
}

async function tryBackend(path, fallbackData) {
  const cfg = await getConfig()
  if (!cfg.backendEnabled) return respond(await resolveFallback(fallbackData))

  try {
    // Unified header merging: Registry + Session
    const registry = loadRegistry()
    
    // Find matching module config from registry to pick up module-specific headers
    const moduleMatch = Object.values(registry).find(m => 
      m.baseUrl && m.baseUrl !== "" && path.startsWith(m.baseUrl)
    )
    
    const options = { headers: {} }
    if (moduleMatch?.apiKey) {
      options.headers['X-API-Key'] = moduleMatch.apiKey
    } else if (moduleMatch?.api?.apiKey) {
      options.headers['X-API-Key'] = moduleMatch.api.apiKey
    }

    // fetchJson handles Authorization header from current session automatically
    const data = await fetchJson(path, options)
    return data
  } catch (e) {
    if (e.status === 404) {
      console.warn(`[API] Resource not found at ${path}, falling back to mock`);
    } else {
      const retry = async () => {
        try { await fetchJson(path); window.location.reload() } catch(err){}
      }
      notify({ type: 'error', message: `Backend unavailable: ${e.message}`, actionLabel: 'Retry', onAction: retry })
    }
    // Fallback to mock so UI stays usable
    return respond(await resolveFallback(fallbackData))
  }
}

import { isSuperAdmin } from './rbac'

// Check if doctor data is protected (SATUSEHAT test data)
export const isDoctorProtected = (doctor) => {
  // Allow SUPERADMIN to bypass protection
  if (isSuperAdmin()) return false;

  // Check if this is one of our SATUSEHAT test doctors by looking for the protected metadata
  // or by checking if it's in our known list of test NIKs
  const satusehatNiks = [
    "7209061211900001",
    "3322071302900002",
    "3171071609900003",
    "3207192310600004",
    "6408130207800005",
    "3217040109800006",
    "3519111703800007",
    "5271002009700008",
    "3313096403900009",
    "3578083008700010"
  ];
  
  return satusehatNiks.includes(doctor.national_id);
}

export const api = {
  // Dashboard
  getDashboard: async () => {
    // Expected backend route suggestion: /api/dashboard
    const cfg = await getConfig();
    const mockFactory = async () => {
      const { patients, orders, modalities, doctors } = await loadMockBatch(['patients', 'orders', 'modalities', 'doctors'])
      return {
        totals: {
          patients: patients.length,
          orders: orders.length,
          doctors: doctors.length,
          modalities: modalities.length
        },
        modStats: cfg.modalities.map(m => ({
          modality: m,
          count: orders.filter(o=>o.modality===m).length
        })),
        trend: buildTrend(orders),
        status: buildStatusBreakdown(orders),
        recent: orders
          .sort((a,b) => (a.scheduled_start_at > b.scheduled_start_at ? -1 : 1))
          .slice(0,5)
      }
    }
    return tryBackend('/api/dashboard', mockFactory)
  },

  // Patients
  listPatients: async () => tryBackend('/patients', async () => (await loadMockData('patients'))),

  getPatient: async (id) => {
    const cfg = await getConfig()
    if (cfg.backendEnabled) {
      try {
        return await fetchJson(`/patients/${id}`)
      } catch (e) {
        notify({ type: 'error', message: `Failed to fetch patient: ${e.message}` })
        throw e
      }
    }
    // In mock mode, find patient by id or medical_record_number
    // Filter out metadata objects first
    const patientsData = await loadMockData('patients')
    const patientData = patientsData.filter(p => p && p.id && !p._meta)
    const patient = patientData.find(p => p.id === id || p.medical_record_number === id)
    if (!patient) throw new Error('Patient not found')
    
    // Normalize patient before returning
    const { normalizePatient } = await import('./patientService')
    return respond(normalizePatient(patient))
  },

  // Check if patient is protected (SATUSEHAT test data)
  isPatientProtected: (patient) => {
    // Official SATUSEHAT Onboarding Test Data (Sandbox)
    // See: https://satusehat.kemkes.go.id/platform/docs/id/api-catalogue/onboardings/apis/patient/
    const satusehatTestIdentifiers = [
      // NIKs
      "9271060312000001", "9204014804000002", "9104224509000003", 
      "9104223107000004", "9104224606000005", "9104025209000006", 
      "9201076001000007", "9201394901000008", "9201076407000009", 
      "9210060207000010",
      // IHS Numbers (Patient IDs)
      "P02478375538", "P03647103112", "P00805884304", "P00912894463",
      "P01654557057", "P02280547535", "P01836748436", "P00883356749",
      "P01058967035", "P02428473601"
    ];
    
    if (!patient) return false;

    // Check all possible identifier fields (Backend uses snake_case, Frontend might use camelCase or normalized names)
    const patientId = patient.patient_national_id || patient.patientNationalId || patient.national_id || patient.nationalId || patient.patient_id || patient.patientId || patient.id;
    const ihsNumber = patient.ihs_number || patient.ihsNumber || patient.patient_ihs || patient.patientIhs || patient.patient_ihs_number;
    const name = patient.patient_name || patient.patientName || patient.name || "";
    const mrn = patient.medical_record_number || patient.medicalRecordNumber || patient.mrn || "";
    
    return (
      satusehatTestIdentifiers.includes(patientId) || 
      satusehatTestIdentifiers.includes(ihsNumber) ||
      (mrn && String(mrn).startsWith('MRN-official-')) ||
      (name && (name.includes('Ardianto Putra') || name.includes('Sonia Herdianti') || name.includes('Ghina Assyifa')))
    );
  },

  createPatient: async (data) => {
    const cfg = await getConfig()
    if (cfg.backendEnabled) {
      try {
        return await fetchJson('/patients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        })
      } catch (e) {
        notify({ type: 'error', message: `Failed to create patient: ${e.message}` })
        throw e
      }
    }
    // Mock mode: just return the data with an ID
    const newPatient = { ...data, id: 'pat-' + Date.now(), mrn: data.mrn || 'MRN-' + Date.now() }
    const patientsData = await loadMockData('patients')
    patientsData.push(newPatient)
    return respond(newPatient)
  },

  updatePatient: async (id, data) => {
    const cfg = await getConfig()
    if (cfg.backendEnabled) {
      try {
        return await fetchJson(`/patients/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        })
      } catch (e) {
        notify({ type: 'error', message: `Failed to update patient: ${e.message}` })
        throw e
      }
    }
    // Mock mode: find and update
    // Filter out metadata objects first
    const patientsData = await loadMockData('patients')
    const patientData = patientsData.filter(p => p && p.id && !p._meta)
    const idx = patientData.findIndex(p => p.id === id || p.mrn === id)
    if (idx === -1) throw new Error('Patient not found')
    
    // Check if patient is protected
    if (api.isPatientProtected(patientData[idx])) {
      throw new Error('This patient data is protected for SATUSEHAT testing and cannot be modified.')
    }
    
    patientsData[idx] = { ...patientsData[idx], ...data }
    return respond(patientsData[idx])
  },

  deletePatient: async (id) => {
    const cfg = await getConfig()
    if (cfg.backendEnabled) {
      try {
        return await fetchJson(`/patients/${id}`, { method: 'DELETE' })
      } catch (e) {
        notify({ type: 'error', message: `Failed to delete patient: ${e.message}` })
        throw e
      }
    }
    // Mock mode: filter out
    // Filter out metadata objects first
    const patientsData = await loadMockData('patients')
    const patientData = patientsData.filter(p => p && p.id && !p._meta)
    const idx = patientData.findIndex(p => p.id === id || p.mrn === id)
    if (idx === -1) throw new Error('Patient not found')
    
    // Check if patient is protected
    if (api.isPatientProtected(patientData[idx])) {
      throw new Error('This patient data is protected for SATUSEHAT testing and cannot be deleted.')
    }
    
    patientsData.splice(idx, 1)
    return respond({ success: true })
  },

  // Orders
  listOrders: async () => tryBackend('/api/orders', async () => (await getOrdersMock())),

  // Worklist - combines orders (scheduled/in_progress) with offline orders
  listWorklist: async () => {
    const cfg = await getConfig()
    let worklistOrders = []
    
    const loadMockWorklist = async () => {
      try {
        // Try to load from worklist.json first
        const worklistModule = await import('../data/worklist.json')
        const worklistData = worklistModule.default || []
        // Filter for active worklist items (not completed/cancelled)
        return worklistData.filter(o => !['completed', 'cancelled', 'delivered'].includes(o.status))
      } catch (error) {
        console.warn('[API] worklist.json not found, falling back to orders.json')
        // Fallback to orders.json
        const ordersData = await getOrdersMock()
        return ordersData.filter(o => ['scheduled', 'in_progress'].includes(o.status))
      }
    }

    // Get orders from backend or mock
    if (cfg.backendEnabled) {
      try {
        const data = await fetchJson('/api/worklist')
        worklistOrders = data
      } catch (e) {
        console.error('Failed to fetch worklist from backend:', e)
        // Fallback to mock
        worklistOrders = await loadMockWorklist()
      }
    } else {
      // Mock mode: load from worklist.json
      worklistOrders = await loadMockWorklist()
    }

    // Merge with offline orders from localStorage
    try {
      const offlineKey = 'orders_offline'
      const raw = localStorage.getItem(offlineKey)
      if (raw) {
        const offlineOrders = JSON.parse(raw)
        // Add offline flag and prepend to worklist
        const offlineWithFlag = offlineOrders.map(o => ({ ...o, _offline: true }))
        worklistOrders = [...offlineWithFlag, ...worklistOrders]
      }
    } catch (e) {
      console.error('Failed to load offline orders:', e)
    }

    return respond(worklistOrders)
  },

  getOrder: async (id) => {
    const cfg = await getConfig()
    if (cfg.backendEnabled) {
      try {
        return await fetchJson(`/api/orders/${id}`)
      } catch (e) {
        notify({ type: 'error', message: `Failed to fetch order: ${e.message}` })
        throw e
      }
    }
    const ordersData = await getOrdersMock()
    const order = ordersData.find(o => o.id === id)
    if (!order) throw new Error('Order not found')
    return respond(order)
  },

  createOrder: async (data) => {
    const cfg = await getConfig()
    if (cfg.backendEnabled) {
      try {
        return await fetchJson('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        })
      } catch (e) {
        notify({ type: 'error', message: `Failed to create order: ${e.message}` })
        throw e
      }
    }
    // Mock mode: just return the data with an ID
    const newOrder = { ...data, id: 'ord-' + Date.now() }
    const ordersData = await getOrdersMock()
    ordersData.push(newOrder)
    return respond(newOrder)
  },

  updateOrder: async (id, data) => {
    const cfg = await getConfig()
    if (cfg.backendEnabled) {
      try {
        return await fetchJson(`/api/orders/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        })
      } catch (e) {
        notify({ type: 'error', message: `Failed to update order: ${e.message}` })
        throw e
      }
    }
    // Mock mode: find and update
    const ordersData = await getOrdersMock()
    const idx = ordersData.findIndex(o => o.id === id)
    if (idx === -1) throw new Error('Order not found')
    ordersData[idx] = { ...ordersData[idx], ...data }
    return respond(ordersData[idx])
  },

  deleteOrder: async (id) => {
    const cfg = await getConfig()
    if (cfg.backendEnabled) {
      try {
        return await fetchJson(`/api/orders/${id}`, { method: 'DELETE' })
      } catch (e) {
        notify({ type: 'error', message: `Failed to delete order: ${e.message}` })
        throw e
      }
    }
    // Mock mode: filter out
    const ordersData = await getOrdersMock()
    const idx = ordersData.findIndex(o => o.id === id)
    if (idx === -1) throw new Error('Order not found')
    ordersData.splice(idx, 1)
    return respond({ success: true })
  },

  // Doctors
  listDoctors: async () => {
    // Use module-specific backend check instead of global config
    const registry = loadRegistry();
    const doctorsConfig = registry.doctors || { enabled: false };
    const backendEnabled = doctorsConfig.enabled === true;
    
    if (backendEnabled) {
      try {
        return await listDoctors()
      } catch (e) {
        notify({ type: 'error', message: `Failed to fetch doctors: ${e.message}` })
        throw e
      }
    }
    
    // In mock mode, filter out metadata objects
    const doctorsData = await getDoctorsMock()
    const doctorData = doctorsData.filter(d => d && d.id && !d._meta)
    return respond(doctorData)
  },

  getDoctor: async (id) => {
    // Use module-specific backend check instead of global config
    const registry = loadRegistry();
    const doctorsConfig = registry.doctors || { enabled: false };
    const backendEnabled = doctorsConfig.enabled === true;
    
    if (backendEnabled) {
      try {
        return await getDoctor(id)
      } catch (e) {
        notify({ type: 'error', message: `Failed to fetch doctor: ${e.message}` })
        throw e
      }
    }
    // Filter out metadata objects first
    const doctorsData = await getDoctorsMock()
    const doctorData = doctorsData.filter(d => d && d.id && !d._meta)
    const doctor = doctorData.find(d => d.id === id || d.ihs_number === id)
    if (!doctor) throw new Error('Doctor not found')
    return respond(doctor)
  },

  isDoctorProtected: isDoctorProtected,

  createDoctor: async (data) => {
    // Use module-specific backend check instead of global config
    const registry = loadRegistry();
    const doctorsConfig = registry.doctors || { enabled: false };
    const backendEnabled = doctorsConfig.enabled === true;
    
    if (backendEnabled) {
      try {
        return await createDoctor(data)
      } catch (e) {
        // Normalize backend error messages
        if (e.message && e.message.includes('invalid input syntax for type date')) {
          notify({ type: 'error', message: 'Failed to create doctor: Invalid date format. Please enter a valid birth date.' })
        } else {
          notify({ type: 'error', message: `Failed to create doctor: ${e.message}` })
        }
        throw e
      }
    }
    // Mock mode: just return the data with an ID
    const newDoctor = { ...data, id: 'doc-' + Date.now() }
    const doctorsData = await getDoctorsMock()
    doctorsData.push(newDoctor)
    return respond(newDoctor)
  },

  updateDoctor: async (id, data) => {
    // Use module-specific backend check instead of global config
    const registry = loadRegistry();
    const doctorsConfig = registry.doctors || { enabled: false };
    const backendEnabled = doctorsConfig.enabled === true;
    
    if (backendEnabled) {
      try {
        return await updateDoctor(id, data)
      } catch (e) {
        // Normalize backend error messages
        if (e.message && e.message.includes('invalid input syntax for type date')) {
          notify({ type: 'error', message: 'Failed to update doctor: Invalid date format. Please enter a valid birth date.' })
        } else {
          notify({ type: 'error', message: `Failed to update doctor: ${e.message}` })
        }
        throw e
      }
    }
    // Mock mode: find and update
    // Filter out metadata objects first
    const doctorsData = await getDoctorsMock()
    const doctorData = doctorsData.filter(d => d && d.id && !d._meta)
    const idx = doctorData.findIndex(d => d.id === id || d.ihs_number === id)
    if (idx === -1) throw new Error('Doctor not found')
    
    // Check if doctor is protected
    if (isDoctorProtected(doctorData[idx])) {
      throw new Error('This doctor data is protected for SATUSEHAT testing and cannot be modified.')
    }
    
    doctorsData[idx] = { ...doctorsData[idx], ...data }
    return respond(doctorsData[idx])
  },

  deleteDoctor: async (id) => {
    // Use module-specific backend check instead of global config
    const registry = loadRegistry();
    const doctorsConfig = registry.doctors || { enabled: false };
    const backendEnabled = doctorsConfig.enabled === true;
    
    if (backendEnabled) {
      try {
        return await deleteDoctor(id)
      } catch (e) {
        notify({ type: 'error', message: `Failed to delete doctor: ${e.message}` })
        throw e
      }
    }
    // Mock mode: filter out
    // Filter out metadata objects first
    const doctorsData = await getDoctorsMock()
    const doctorData = doctorsData.filter(d => d && d.id && !d._meta)
    const idx = doctorData.findIndex(d => d.id === id || d.ihs_number === id)
    if (idx === -1) throw new Error('Doctor not found')
    
    // Check if doctor is protected
    if (isDoctorProtected(doctorData[idx])) {
      throw new Error('This doctor data is protected for SATUSEHAT testing and cannot be deleted.')
    }
    
    doctorsData.splice(idx, 1)
    return respond({ success: true })
  },

  // Nurses
  listNurses: async () => tryBackend('/api/nurses', async () => (await getNursesMock())),
  getNurse: async (id) => {
    const cfg = await getConfig()
    if (cfg.backendEnabled) {
      try {
        return await fetchJson(`/api/nurses/${id}`)
      } catch (e) {
        notify({ type: 'error', message: `Failed to fetch nurse: ${e.message}` })
        throw e
      }
    }
    const nursesData = await getNursesMock()
    const nurse = nursesData.find(n => n.id === id)
    if (!nurse) throw new Error('Nurse not found')
    return respond(nurse)
  },

  // Procedures
  listProcedures: async () => tryBackend('/api/procedures', async () => (await getProceduresMock())),
  getProcedure: async (id) => {
    const cfg = await getConfig()
    if (cfg.backendEnabled) {
      try {
        return await fetchJson(`/api/procedures/${id}`)
      } catch (e) {
        notify({ type: 'error', message: `Failed to fetch procedure: ${e.message}` })
        throw e
      }
    }
    const proceduresData = await getProceduresMock()
    const procedure = proceduresData.find(p => p.id === id)
    if (!procedure) throw new Error('Procedure not found')
    return respond(procedure)
  },

  // Modalities - using DICOM Nodes API with node_type=MODALITY
  listModalities: async () => tryBackend('/api/dicom/nodes?node_type=MODALITY', async () => (await getModalitiesMock())),
  getModality: async (id) => {
    const cfg = await getConfig()
    if (cfg.backendEnabled) {
      try {
        return await fetchJson(`/api/dicom/nodes/${id}`)
      } catch (e) {
        notify({ type: 'error', message: `Failed to fetch modality: ${e.message}` })
        throw e
      }
    }
    const modalitiesData = await getModalitiesMock()
    const modality = modalitiesData.find(m => m.id === id)
    if (!modality) throw new Error('Modality not found')
    return respond(modality)
  },
  createModality: async (data) => {
    const cfg = await getConfig()
    // Ensure node_type is MODALITY
    const payload = { ...data, node_type: 'MODALITY' }
    if (cfg.backendEnabled) {
      try {
        return await fetchJson('/api/dicom/nodes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
      } catch (e) {
        notify({ type: 'error', message: `Failed to create modality: ${e.message}` })
        throw e
      }
    }
    // Mock mode: add id and timestamps
    const newModality = {
      ...payload,
      id: 'm-' + Date.now(),
      is_active: payload.is_active !== false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
    const modalitiesData = await getModalitiesMock()
    modalitiesData.push(newModality)
    return respond(newModality)
  },
  updateModality: async (id, data) => {
    const cfg = await getConfig()
    if (cfg.backendEnabled) {
      try {
        return await fetchJson(`/api/dicom/nodes/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        })
      } catch (e) {
        notify({ type: 'error', message: `Failed to update modality: ${e.message}` })
        throw e
      }
    }
    // Mock mode: find and update
    const modalitiesData = await getModalitiesMock()
    const idx = modalitiesData.findIndex(m => m.id === id)
    if (idx === -1) throw new Error('Modality not found')
    modalitiesData[idx] = { ...modalitiesData[idx], ...data, updated_at: new Date().toISOString() }
    return respond(modalitiesData[idx])
  },
  deleteModality: async (id) => {
    const cfg = await getConfig()
    if (cfg.backendEnabled) {
      try {
        await fetchJson(`/api/dicom/nodes/${id}`, { method: 'DELETE' })
        return respond({ success: true })
      } catch (e) {
        notify({ type: 'error', message: `Failed to delete modality: ${e.message}` })
        throw e
      }
    }
    // Mock mode: remove from array
    const modalitiesData = await getModalitiesMock()
    const idx = modalitiesData.findIndex(m => m.id === id)
    if (idx === -1) throw new Error('Modality not found')
    modalitiesData.splice(idx, 1)
    return respond({ success: true })
  },
  testModalityConnection: async (id) => {
    const cfg = await getConfig()
    if (cfg.backendEnabled) {
      try {
        return await fetchJson(`/api/dicom/nodes/${id}/test`, { method: 'POST' })
      } catch (e) {
        notify({ type: 'error', message: `Connection test failed: ${e.message}` })
        throw e
      }
    }
    // Mock mode: simulate success with random response time
    const delay = (ms) => new Promise(res => setTimeout(res, ms))
    const responseTime = Math.floor(Math.random() * 200) + 50 // 50-250ms
    await delay(responseTime)
    // Simulate 80% success rate
    const success = Math.random() < 0.8
    if (success) {
      return respond({
        success: true,
        status: 'success',
        message: 'Connection successful',
        response_time_ms: responseTime
      })
    } else {
      throw new Error('Connection failed: Unable to reach modality')
    }
  },

  // DICOM Nodes
  listDicomNodes: async () => tryBackend('/api/dicom-nodes', async () => (await getDicomNodesMock())),
  getDicomNode: async (id) => {
    const cfg = await getConfig()
    if (cfg.backendEnabled) {
      try {
        return await fetchJson(`/api/dicom-nodes/${id}`)
      } catch (e) {
        notify({ type: 'error', message: `Failed to fetch DICOM node: ${e.message}` })
        throw e
      }
    }
    const dicomNodesData = await getDicomNodesMock()
    const node = dicomNodesData.find(n => n.id === id)
    if (!node) throw new Error('DICOM node not found')
    return respond(node)
  },

  // Users
  listUsers: async () => tryBackend('/api/users', async () => (await getUsersMock())),
  getUser: async (id) => {
    const cfg = await getConfig()
    if (cfg.backendEnabled) {
      try {
        return await fetchJson(`/api/users/${id}`)
      } catch (e) {
        notify({ type: 'error', message: `Failed to fetch user: ${e.message}` })
        throw e
      }
    }
    const usersData = await getUsersMock()
    const user = usersData.find(u => u.id === id)
    if (!user) throw new Error('User not found')
    return respond(user)
  },

  // Audit Logs
  listAuditLogs: async () => {
    const registry = loadRegistry();
    const auditConfig = registry.audit || { enabled: false };
    const backendEnabled = auditConfig.enabled === true;

    if (backendEnabled) {
      try {
        return await fetchAuditLogs()
      } catch (e) {
        notify({ type: 'error', message: `Failed to fetch audit logs: ${e.message}` })
        throw e
      }
    }

    // Fallback to mock data
    return respond(await getAuditLogsMock())
  },

  // Settings
  getSettings: async () => {
    // Use the new settings service which prioritizes backend with local fallback
    const { getSettings } = await import('./settingsService');
    return await getSettings();
  },
  updateSettings: async (data) => {
    // Use the new settings service which updates backend with local fallback
    const { updateSettings } = await import('./settingsService');
    return await updateSettings(data);
  },

  // ===== Search & Sample Functions for Select2 Components =====

  // Patients
  searchPatients: async (query) => {
    console.log('[api.searchPatients] Searching for:', query)

    try {
      // Use patientService which handles backend/mock properly
      const { listPatients } = await import('./patientService')
      let allPatients = await listPatients({ search: query, limit: 10 })

      console.log('[api.searchPatients] Got patients from service:', allPatients?.length || 0)

      // If no search filtering happened (backend disabled), do it manually
      if (query && query.trim()) {
        const searchLower = query.toLowerCase().trim()
        allPatients = allPatients.filter(p =>
          p.name?.toLowerCase().includes(searchLower) ||
          p.mrn?.toLowerCase().includes(searchLower) ||
          p.patient_id?.toLowerCase().includes(searchLower) ||
          p.ihs_number?.toLowerCase().includes(searchLower)
        )
      }

      // Filter out metadata objects and format for Select2
      const patientData = allPatients.filter(p => p && (p.id || p.mrn) && !p._meta)

      const result = patientData.slice(0, 10).map(p => ({
        value: p.mrn || p.id,
        label: `${p.mrn || p.id} - ${p.name}`,
        meta: { 
          mrn: p.mrn, 
          name: p.name, 
          id: p.id,
          national_id: p.patient_national_id || p.national_id,
          ihs_number: p.ihs_number
        }
      }))

      console.log('[api.searchPatients] Returning results:', result.length)
      return result
    } catch (e) {
      console.error('[api.searchPatients] Error:', e)
      // Fallback to mock with manual search
      const patientsData = await getPatientsMock()
      const patientData = patientsData.filter(p => p && p.id && !p._meta)
      const filtered = patientData.filter(p =>
        p.name?.toLowerCase().includes(query.toLowerCase()) ||
        p.mrn?.toLowerCase().includes(query.toLowerCase()) ||
        p.patient_id?.toLowerCase().includes(query.toLowerCase())
      )
      return filtered.slice(0, 10).map(p => ({
        value: p.mrn,
        label: `${p.mrn} - ${p.name}`,
        meta: { 
          mrn: p.mrn, 
          name: p.name, 
          id: p.id,
          national_id: p.patient_national_id || p.national_id,
          ihs_number: p.ihs_number
        }
      }))
    }
  },

  samplePatients: async () => {
    console.log('[api.samplePatients] Loading sample patients...')

    try {
      // Use patientService which handles backend/mock properly
      const { listPatients } = await import('./patientService')
      const allPatients = await listPatients({ limit: 5 })

      if (allPatients && allPatients.length > 0) {
        console.log('[api.samplePatients] Got patients from service:', allPatients.length)

        // Filter out metadata objects and format for Select2
        const patientData = allPatients.filter(p => p && (p.id || p.mrn) && !p._meta)

        // Return sample (first 5)
        return patientData.slice(0, 5).map(p => ({
          value: p.mrn || p.id,
          label: `${p.mrn || p.id} - ${p.name}`,
          meta: { 
            mrn: p.mrn, 
            name: p.name, 
            id: p.id,
            national_id: p.patient_national_id || p.national_id,
            ihs_number: p.ihs_number
          }
        }))
      } else {
        console.warn('[api.samplePatients] No patients returned from backend, falling back to mock')
      }
    } catch (e) {
      if (e.status === 404) {
        console.warn('[api.samplePatients] Backend endpoint 404, falling back to mock')
      } else {
        console.warn('[api.samplePatients] Backend error, falling back to mock:', e.message)
      }
    }

    // Fallback to mock
    const patientsData = await getPatientsMock()
    const patientData = patientsData.filter(p => p && p.id && !p._meta)
    const sampleData = sample(patientData)
    return sampleData.map(p => ({
      value: p.mrn,
      label: `${p.mrn} - ${p.name}`,
      meta: { 
        mrn: p.mrn, 
        name: p.name, 
        id: p.id,
        national_id: p.patient_national_id || p.national_id,
        ihs_number: p.ihs_number
      }
    }))
  },

  // Procedures
  searchProcedures: async (query) => {
    const cfg = await getConfig()
    if (cfg.backendEnabled) {
      try {
        return await fetchJson(`/api/procedures/search?q=${encodeURIComponent(query)}`)
      } catch (e) {
        console.error('Search procedures failed:', e)
        // Fallback to mock
      }
    }
    // Mock mode: filter procedures by display or code
    const proceduresData = await getProceduresMock()
    const filtered = proceduresData.filter(proc =>
      proc.display?.toLowerCase().includes(query.toLowerCase()) ||
      proc.code?.toLowerCase().includes(query.toLowerCase())
    )
    return respond(filtered.slice(0, 10).map(proc => ({
      value: proc.display,
      label: `${proc.code || ''} - ${proc.display}`,
      meta: { code: proc.code, name: proc.display, id: proc.id }
    })))
  },

  sampleProcedures: async () => {
    const cfg = await getConfig()
    if (cfg.backendEnabled) {
      try {
        // Robust endpoint candidates for procedures
        const candidates = ['/api/procedures/sample', '/api/procedures', '/procedures'];
        let lastErr = null;
        
        for (const ep of candidates) {
          try {
            const data = await fetchJson(ep);
            const list = Array.isArray(data) ? data : (data.data || data.procedures || []);
            
            if (list && list.length > 0) {
              return respond(sample(list).map(proc => ({
                value: proc.display || proc.name || proc.procedure_name,
                label: `${proc.code || ''} - ${proc.display || proc.name || proc.procedure_name}`,
                meta: { code: proc.code, name: proc.display || proc.name || proc.procedure_name, id: proc.id }
              })));
            }
          } catch (e) {
            lastErr = e;
            if (e.status === 404) continue;
            break;
          }
        }
        if (lastErr) console.warn('[api.sampleProcedures] Backend failed, falling back to mock:', lastErr.message)
      } catch (e) {
        console.warn('[api.sampleProcedures] Backend error, falling back to mock:', e.message)
      }
    }
    // Mock mode: return sample of procedures
    const proceduresData = await getProceduresMock()
    return respond(sample(proceduresData).map(proc => ({
      value: proc.display,
      label: `${proc.code || ''} - ${proc.display}`,
      meta: { code: proc.code, name: proc.display, id: proc.id }
    })))
  },

  // Doctors
  searchDoctors: async (query) => {
    // Use module-specific backend check
    const registry = loadRegistry()
    const doctorsConfig = registry.doctors || { enabled: false }
    const backendEnabled = doctorsConfig.enabled === true

    if (backendEnabled) {
      try {
        const results = await listDoctors({ search: query })
        return results.map(d => ({
          value: d.ihs_number || d.id,
          label: `${d.name} - ${d.specialty || 'N/A'}`,
          meta: { id: d.id, name: d.name, ihs_number: d.ihs_number, specialty: d.specialty }
        }))
      } catch (e) {
        console.error('Search doctors failed:', e)
        // Fallback to mock
      }
    }
    // Mock mode: filter doctors by name or license
    const doctorsData = await getDoctorsMock()
    const doctorData = doctorsData.filter(d => d && d.id && !d._meta)
    const filtered = doctorData.filter(d =>
      d.name?.toLowerCase().includes(query.toLowerCase()) ||
      d.license?.toLowerCase().includes(query.toLowerCase()) ||
      d.ihs_number?.toLowerCase().includes(query.toLowerCase())
    )
    return respond(filtered.slice(0, 10).map(d => ({
      value: d.ihs_number || d.id,
      label: `${d.name} - ${d.specialty || 'N/A'}`,
      meta: { id: d.id, name: d.name, ihs_number: d.ihs_number, specialty: d.specialty }
    })))
  },

  sampleDoctors: async () => {
    // Use module-specific backend check
    const registry = loadRegistry()
    const doctorsConfig = registry.doctors || { enabled: false }
    const backendEnabled = doctorsConfig.enabled === true

    if (backendEnabled) {
      try {
        const results = await listDoctors({ limit: 5 })
        if (results && results.length > 0) {
          return results.map(d => ({
            value: d.ihs_number || d.id,
            label: `${d.name} - ${d.specialty || 'N/A'}`,
            meta: { id: d.id, name: d.name, ihs_number: d.ihs_number, specialty: d.specialty }
          }))
        } else {
          console.warn('[api.sampleDoctors] No doctors returned from backend, falling back to mock')
        }
      } catch (e) {
        if (e.status === 404) {
          console.warn('[api.sampleDoctors] Backend endpoint 404, falling back to mock')
        } else {
          console.warn('[api.sampleDoctors] Backend error, falling back to mock:', e.message)
        }
      }
    }
    // Mock mode: return sample of doctors
    const doctorsData = await getDoctorsMock()
    const doctorData = doctorsData.filter(d => d && d.id && !d._meta)
    return respond(sample(doctorData).map(d => ({
      value: d.ihs_number || d.id,
      label: `${d.name} - ${d.specialty || 'N/A'}`,
      meta: { id: d.id, name: d.name, ihs_number: d.ihs_number, specialty: d.specialty }
    })))
  },

  // Nurses
  searchNurses: async (query) => {
    const cfg = await getConfig()
    if (cfg.backendEnabled) {
      try {
        return await fetchJson(`/api/nurses/search?q=${encodeURIComponent(query)}`)
      } catch (e) {
        console.error('Search nurses failed:', e)
        // Fallback to mock
      }
    }
    // Mock mode: filter nurses by name
    const nursesData = await getNursesMock()
    const filtered = nursesData.filter(n =>
      n.name?.toLowerCase().includes(query.toLowerCase()) ||
      n.license?.toLowerCase().includes(query.toLowerCase())
    )
    return respond(filtered.slice(0, 10).map(n => ({
      value: n.id,
      label: `${n.name} - ${n.department || 'N/A'}`,
      meta: { id: n.id, name: n.name, license: n.license, department: n.department }
    })))
  },

  sampleNurses: async () => {
    const cfg = await getConfig()
    if (cfg.backendEnabled) {
      try {
        return await fetchJson('/api/nurses/sample')
      } catch (e) {
        console.error('Sample nurses failed:', e)
        // Fallback to mock
      }
    }
    const nursesData = await getNursesMock()
    return respond(sample(nursesData).map(n => ({
      value: n.id,
      label: `${n.name} - ${n.department || 'N/A'}`,
      meta: { id: n.id, name: n.name, license: n.license, department: n.department }
    })))
  },

  // Modalities
  searchModalities: async (query) => {
    const cfg = await getConfig()
    if (cfg.backendEnabled) {
      try {
        // Backend search endpoint for modalities
        const results = await fetchJson(`/api/dicom/nodes/search?node_type=MODALITY&q=${encodeURIComponent(query)}`)
        return results.map(m => ({
          value: m.modality || m.name,
          label: `${m.modality || m.name} (${m.ae_title})`,
          meta: { id: m.id, name: m.name, modality: m.modality, ae_title: m.ae_title }
        }))
      } catch (e) {
        console.error('Search modalities failed:', e)
        // Fallback to mock
      }
    }
    // Mock mode: filter modalities by name or AE title
    const modalitiesData = await getModalitiesMock()
    const filtered = modalitiesData.filter(m =>
      (m.modality || m.name)?.toLowerCase().includes(query.toLowerCase()) ||
      m.ae_title?.toLowerCase().includes(query.toLowerCase())
    )
    return respond(filtered.slice(0, 10).map(m => ({
      value: m.modality || m.name,
      label: `${m.modality || m.name} (${m.ae_title})`,
      meta: { id: m.id, name: m.name, modality: m.modality, ae_title: m.ae_title }
    })))
  },

  sampleModalities: async () => {
    const cfg = await getConfig()
    if (cfg.backendEnabled) {
      try {
        // Backend sample endpoint for modalities
        const results = await fetchJson('/api/dicom/nodes/sample?node_type=MODALITY')
        return results.map(m => ({
          value: m.modality || m.name,
          label: `${m.modality || m.name} (${m.ae_title})`,
          meta: { id: m.id, name: m.name, modality: m.modality, ae_title: m.ae_title }
        }))
      } catch (e) {
        console.error('Sample modalities failed:', e)
        // Fallback to mock
      }
    }
    // Mock mode: return sample of modalities
    const modalitiesData = await getModalitiesMock()
    return respond(sample(modalitiesData).map(m => ({
      value: m.modality || m.name,
      label: `${m.modality || m.name} (${m.ae_title})`,
      meta: { id: m.id, name: m.name, modality: m.modality, ae_title: m.ae_title }
    })))
  }
}
