/**
 * Dummy Data Generator for Dashboard
 * Generates realistic random data to prevent API looping errors
 */

// Sample names for generating realistic data
const SAMPLE_NAMES = [
  'Dr. Ahmad Wijaya', 'Dr. Siti Nurhaliza', 'Dr. Budi Santoso', 'Dr. Maya Sari',
  'Dr. Rizki Pratama', 'Dr. Indira Putri', 'Dr. Eko Susanto', 'Dr. Dewi Lestari',
  'Dr. Fajar Ramadhan', 'Dr. Rina Maharani', 'Dr. Agus Setiawan', 'Dr. Lina Wati',
  'Dr. Doni Kurniawan', 'Dr. Sari Melati', 'Dr. Hendra Gunawan', 'Dr. Fitri Handayani'
]

const SAMPLE_ACTIONS = [
  'Login to system', 'View patient records', 'Create new order', 'Update worklist',
  'Download DICOM study', 'Generate report', 'Modify user permissions', 'Export data',
  'Schedule appointment', 'Review imaging results', 'Update patient info', 'Archive study',
  'Send notification', 'Backup database', 'Configure settings', 'Approve request'
]

const SAMPLE_SERVICES = [
  { name: 'Orthanc DICOM Server', status: 'healthy' },
  { name: 'PostgreSQL Database', status: 'healthy' },
  { name: 'Authentication Service', status: 'healthy' },
  { name: 'MWL Writer Service', status: 'warning' },
  { name: 'Order Management API', status: 'healthy' },
  { name: 'DICOM Router', status: 'healthy' },
  { name: 'Backup Service', status: 'error' },
  { name: 'Notification Service', status: 'healthy' }
]

const MODALITY_TYPES = ['CT', 'MRI', 'X-RAY', 'US', 'CR', 'DR', 'MG', 'NM']
const STUDY_DESCRIPTIONS = [
  'Chest CT Scan', 'Brain MRI', 'Abdominal CT', 'Knee X-Ray', 'Cardiac Echo',
  'Spine MRI', 'Mammography', 'Pelvic Ultrasound', 'Head CT', 'Shoulder MRI'
]

/**
 * Generate random number between min and max (inclusive)
 */
function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * Generate random date within last N days
 */
function randomDateWithinDays(days = 30) {
  const now = new Date()
  const pastDate = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000))
  const randomTime = pastDate.getTime() + Math.random() * (now.getTime() - pastDate.getTime())
  return new Date(randomTime)
}

/**
 * Pick random item from array
 */
function randomChoice(array) {
  return array[Math.floor(Math.random() * array.length)]
}

/**
 * Generate dashboard statistics
 */
export function generateDashboardStats() {
  const baseUsers = randomBetween(150, 500)
  const baseSessions = randomBetween(20, Math.floor(baseUsers * 0.3))
  const baseStudies = randomBetween(1000, 5000)
  const baseWorklist = randomBetween(50, 200)

  return {
    total_users: baseUsers,
    active_sessions: baseSessions,
    total_studies: baseStudies,
    worklist_items: baseWorklist,
    users_change: randomBetween(-5, 15),
    sessions_change: randomBetween(-10, 25),
    studies_change: randomBetween(0, 20),
    worklist_change: randomBetween(-8, 12),
    last_updated: new Date().toISOString()
  }
}

/**
 * Generate service health data
 */
export function generateServiceHealth() {
  return SAMPLE_SERVICES.map(service => ({
    ...service,
    status: Math.random() > 0.8 ? randomChoice(['warning', 'error']) : 'healthy',
    response_time: randomBetween(50, 500),
    last_check: new Date().toISOString()
  }))
}

/**
 * Generate recent activity data
 */
export function generateRecentActivity(limit = 10) {
  const activities = []
  
  for (let i = 0; i < limit; i++) {
    activities.push({
      id: `activity_${Date.now()}_${i}`,
      user_id: `user_${randomBetween(1, 50)}`,
      username: randomChoice(SAMPLE_NAMES),
      action: randomChoice(SAMPLE_ACTIONS),
      resource: randomChoice(['patients', 'studies', 'orders', 'users', 'settings']),
      timestamp: randomDateWithinDays(7).toISOString(),
      ip_address: `192.168.1.${randomBetween(1, 254)}`,
      success: Math.random() > 0.1 // 90% success rate
    })
  }
  
  return activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
}

/**
 * Generate DICOM studies data
 */
export function generateDicomStudies(limit = 20) {
  const studies = []
  
  for (let i = 0; i < limit; i++) {
    const studyDate = randomDateWithinDays(90)
    studies.push({
      study_instance_uid: `1.2.826.0.1.3680043.8.498.${Date.now()}.${i}`,
      patient_id: `PAT${String(randomBetween(1000, 9999)).padStart(4, '0')}`,
      patient_name: randomChoice(SAMPLE_NAMES).replace('Dr. ', ''),
      study_date: studyDate.toISOString().split('T')[0],
      study_time: studyDate.toTimeString().split(' ')[0],
      study_description: randomChoice(STUDY_DESCRIPTIONS),
      modality: randomChoice(MODALITY_TYPES),
      number_of_series: randomBetween(1, 8),
      number_of_instances: randomBetween(10, 500),
      accession_number: `ACC${randomBetween(100000, 999999)}`,
      referring_physician: randomChoice(SAMPLE_NAMES),
      study_status: randomChoice(['COMPLETED', 'IN_PROGRESS', 'SCHEDULED', 'CANCELLED'])
    })
  }
  
  return studies.sort((a, b) => new Date(b.study_date) - new Date(a.study_date))
}

/**
 * Generate worklist items
 */
export function generateWorklistItems(limit = 15) {
  const worklistItems = []
  
  for (let i = 0; i < limit; i++) {
    const scheduledDate = new Date()
    scheduledDate.setDate(scheduledDate.getDate() + randomBetween(-7, 30))
    
    worklistItems.push({
      id: `wl_${Date.now()}_${i}`,
      accession_number: `ACC${randomBetween(100000, 999999)}`,
      patient_id: `PAT${String(randomBetween(1000, 9999)).padStart(4, '0')}`,
      patient_name: randomChoice(SAMPLE_NAMES).replace('Dr. ', ''),
      patient_birth_date: new Date(Date.now() - randomBetween(18, 80) * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      patient_sex: randomChoice(['M', 'F']),
      study_description: randomChoice(STUDY_DESCRIPTIONS),
      modality: randomChoice(MODALITY_TYPES),
      scheduled_date: scheduledDate.toISOString().split('T')[0],
      scheduled_time: `${String(randomBetween(8, 17)).padStart(2, '0')}:${randomChoice(['00', '15', '30', '45'])}`,
      requesting_physician: randomChoice(SAMPLE_NAMES),
      study_instance_uid: `1.2.826.0.1.3680043.8.498.${Date.now()}.${i}`,
      status: randomChoice(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
      priority: randomChoice(['ROUTINE', 'URGENT', 'STAT']),
      created_at: randomDateWithinDays(30).toISOString(),
      updated_at: new Date().toISOString()
    })
  }
  
  return worklistItems.sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date))
}

/**
 * Generate user data
 */
export function generateUsers(limit = 25) {
  const users = []
  const roles = ['admin', 'doctor', 'technician', 'nurse', 'radiologist']
  
  for (let i = 0; i < limit; i++) {
    const name = randomChoice(SAMPLE_NAMES)
    const username = name.toLowerCase().replace(/dr\.\s/, '').replace(/\s/g, '.')
    const createdDate = randomDateWithinDays(365)
    
    users.push({
      id: i + 1,
      username: username,
      email: `${username}@hospital.com`,
      full_name: name,
      role: randomChoice(roles),
      is_active: Math.random() > 0.1, // 90% active
      last_login: Math.random() > 0.3 ? randomDateWithinDays(7).toISOString() : null,
      created_at: createdDate.toISOString(),
      updated_at: randomDateWithinDays(30).toISOString(),
      permissions: generateUserPermissions(randomChoice(roles))
    })
  }
  
  return users.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

/**
 * Generate user permissions based on role
 */
function generateUserPermissions(role) {
  const allPermissions = [
    'users.read', 'users.create', 'users.update', 'users.delete',
    'patients.read', 'patients.create', 'patients.update', 'patients.delete',
    'studies.read', 'studies.create', 'studies.update', 'studies.delete',
    'orders.read', 'orders.create', 'orders.update', 'orders.delete',
    'mwl.read', 'mwl.create', 'mwl.update', 'mwl.delete',
    'orthanc.read', 'orthanc.create', 'orthanc.update', 'orthanc.delete',
    'audit.read', 'system.read', 'system.update'
  ]
  
  switch (role) {
    case 'admin':
      return allPermissions
    case 'doctor':
      return ['patients.read', 'patients.update', 'studies.read', 'orders.read', 'orders.create', 'mwl.read']
    case 'radiologist':
      return ['patients.read', 'studies.read', 'studies.update', 'orders.read', 'mwl.read', 'orthanc.read']
    case 'technician':
      return ['patients.read', 'studies.read', 'mwl.read', 'mwl.update', 'orthanc.read']
    case 'nurse':
      return ['patients.read', 'patients.update', 'orders.read', 'mwl.read']
    default:
      return ['patients.read', 'studies.read']
  }
}

/**
 * Generate orders data
 */
export function generateOrders(limit = 20) {
  const orders = []
  const priorities = ['ROUTINE', 'URGENT', 'STAT']
  const statuses = ['PENDING', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']
  
  for (let i = 0; i < limit; i++) {
    const orderDate = randomDateWithinDays(60)
    
    orders.push({
      id: `ORD${String(randomBetween(10000, 99999)).padStart(5, '0')}`,
      patient_id: `PAT${String(randomBetween(1000, 9999)).padStart(4, '0')}`,
      patient_name: randomChoice(SAMPLE_NAMES).replace('Dr. ', ''),
      study_description: randomChoice(STUDY_DESCRIPTIONS),
      modality: randomChoice(MODALITY_TYPES),
      priority: randomChoice(priorities),
      status: randomChoice(statuses),
      ordering_physician: randomChoice(SAMPLE_NAMES),
      clinical_indication: `Clinical evaluation for ${randomChoice(['chest pain', 'headache', 'abdominal pain', 'joint pain', 'follow-up'])}`,
      order_date: orderDate.toISOString(),
      scheduled_date: new Date(orderDate.getTime() + randomBetween(1, 14) * 24 * 60 * 60 * 1000).toISOString(),
      created_by: randomChoice(SAMPLE_NAMES),
      updated_at: new Date().toISOString()
    })
  }
  
  return orders.sort((a, b) => new Date(b.order_date) - new Date(a.order_date))
}

/**
 * Generate system performance metrics
 */
export function generateSystemMetrics() {
  return {
    cpu_usage: randomBetween(20, 80),
    memory_usage: randomBetween(40, 85),
    disk_usage: randomBetween(30, 70),
    network_in: randomBetween(100, 1000), // KB/s
    network_out: randomBetween(50, 500), // KB/s
    active_connections: randomBetween(10, 100),
    database_connections: randomBetween(5, 50),
    response_time: randomBetween(50, 300), // ms
    uptime: randomBetween(1, 30) * 24 * 60 * 60, // seconds
    last_updated: new Date().toISOString()
  }
}

/**
 * Main function to generate all dummy data
 */
export function generateAllDummyData() {
  return {
    statistics: generateDashboardStats(),
    services: generateServiceHealth(),
    recentActivity: generateRecentActivity(10),
    dicomStudies: generateDicomStudies(20),
    worklistItems: generateWorklistItems(15),
    users: generateUsers(25),
    orders: generateOrders(20),
    systemMetrics: generateSystemMetrics()
  }
}

/**
 * Utility to simulate API delay
 */
export function simulateApiDelay(min = 200, max = 800) {
  const delay = randomBetween(min, max)
  return new Promise(resolve => setTimeout(resolve, delay))
}

export default {
  generateDashboardStats,
  generateServiceHealth,
  generateRecentActivity,
  generateDicomStudies,
  generateWorklistItems,
  generateUsers,
  generateOrders,
  generateSystemMetrics,
  generateAllDummyData,
  simulateApiDelay
}