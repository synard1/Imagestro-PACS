/**
 * Mock Data untuk Comprehensive Reports System
 * Data ini digunakan untuk development UI sebelum backend API ready
 */

// Helper untuk generate tanggal
const generateDates = (days) => {
  const dates = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    dates.push(date.toISOString().split('T')[0]);
  }
  return dates;
};

const dates7Days = generateDates(7);
const dates30Days = generateDates(30);

// ============================================================================
// REGISTRATION REPORT DATA
// ============================================================================
export const mockRegistrationData = {
  summary: {
    totalRegistrations: 1247,
    todayRegistrations: 45,
    weeklyChange: 12.5,
    averagePerDay: 42
  },
  bySource: [
    { source: 'SIMRS Khanza', count: 856, percentage: 68.6 },
    { source: 'API Integration', count: 245, percentage: 19.6 },
    { source: 'Manual Entry', count: 146, percentage: 11.7 }
  ],
  byPatientType: [
    { type: 'Rawat Jalan', count: 789, percentage: 63.3 },
    { type: 'Rawat Inap', count: 312, percentage: 25.0 },
    { type: 'IGD', count: 146, percentage: 11.7 }
  ],
  trend: dates7Days.map((date, i) => ({
    date,
    count: 35 + Math.floor(Math.random() * 20)
  })),
  details: [
    { orderNumber: 'ORD-2025120001', patientName: 'Ahmad Suryadi', patientId: 'P001234', source: 'SIMRS Khanza', patientType: 'Rawat Jalan', modality: 'CT', registeredAt: '2025-12-07 08:30:00', status: 'completed' },
    { orderNumber: 'ORD-2025120002', patientName: 'Siti Rahayu', patientId: 'P001235', source: 'API Integration', patientType: 'Rawat Inap', modality: 'MR', registeredAt: '2025-12-07 09:15:00', status: 'in_progress' },
    { orderNumber: 'ORD-2025120003', patientName: 'Budi Santoso', patientId: 'P001236', source: 'Manual Entry', patientType: 'IGD', modality: 'CR', registeredAt: '2025-12-07 10:00:00', status: 'scheduled' },
    { orderNumber: 'ORD-2025120004', patientName: 'Dewi Lestari', patientId: 'P001237', source: 'SIMRS Khanza', patientType: 'Rawat Jalan', modality: 'US', registeredAt: '2025-12-07 10:45:00', status: 'completed' },
    { orderNumber: 'ORD-2025120005', patientName: 'Eko Prasetyo', patientId: 'P001238', source: 'SIMRS Khanza', patientType: 'Rawat Jalan', modality: 'CT', registeredAt: '2025-12-07 11:30:00', status: 'scheduled' },
    { orderNumber: 'ORD-2025120006', patientName: 'Fitri Handayani', patientId: 'P001239', source: 'API Integration', patientType: 'Rawat Inap', modality: 'MR', registeredAt: '2025-12-07 13:00:00', status: 'in_progress' },
    { orderNumber: 'ORD-2025120007', patientName: 'Gunawan Wijaya', patientId: 'P001240', source: 'SIMRS Khanza', patientType: 'Rawat Jalan', modality: 'CR', registeredAt: '2025-12-07 14:15:00', status: 'completed' },
    { orderNumber: 'ORD-2025120008', patientName: 'Hesti Permata', patientId: 'P001241', source: 'Manual Entry', patientType: 'IGD', modality: 'CT', registeredAt: '2025-12-07 15:30:00', status: 'scheduled' },
  ]
};

// ============================================================================
// MODALITY REPORT DATA
// ============================================================================
export const mockModalityData = {
  summary: {
    totalExaminations: 1089,
    averageTurnaround: 45, // minutes
    utilizationRate: 78.5
  },
  byModality: [
    { modality: 'CT', count: 342, completed: 320, avgTurnaround: 35, utilizationRate: 85.2 },
    { modality: 'MR', count: 198, completed: 185, avgTurnaround: 55, utilizationRate: 72.4 },
    { modality: 'CR', count: 289, completed: 280, avgTurnaround: 15, utilizationRate: 92.1 },
    { modality: 'US', count: 156, completed: 150, avgTurnaround: 25, utilizationRate: 68.5 },
    { modality: 'DX', count: 104, completed: 98, avgTurnaround: 20, utilizationRate: 65.3 }
  ],
  byBodyPart: [
    { bodyPart: 'Thorax', count: 312 },
    { bodyPart: 'Abdomen', count: 245 },
    { bodyPart: 'Head', count: 198 },
    { bodyPart: 'Spine', count: 156 },
    { bodyPart: 'Extremities', count: 112 },
    { bodyPart: 'Pelvis', count: 66 }
  ],
  trend: dates7Days.map((date) => ({
    date,
    CT: 40 + Math.floor(Math.random() * 15),
    MR: 25 + Math.floor(Math.random() * 10),
    CR: 35 + Math.floor(Math.random() * 15),
    US: 20 + Math.floor(Math.random() * 8),
    DX: 12 + Math.floor(Math.random() * 6)
  }))
};

// ============================================================================
// SATUSEHAT REPORT DATA
// ============================================================================
export const mockSatusehatData = {
  summary: {
    totalSynced: 1156,
    totalPending: 45,
    totalFailed: 23,
    successRate: 94.4,
    avgSyncTime: 2.3 // seconds
  },
  trend: dates7Days.map((date) => ({
    date,
    synced: 150 + Math.floor(Math.random() * 30),
    failed: Math.floor(Math.random() * 8)
  })),
  failedList: [
    { orderId: 'ORD-2025120015', patientName: 'Irwan Setiawan', errorCode: 'PATIENT_NOT_FOUND', errorMessage: 'Patient IHS number not found in SATUSEHAT', lastAttempt: '2025-12-07 10:30:00', retryCount: 3 },
    { orderId: 'ORD-2025120018', patientName: 'Joko Widodo', errorCode: 'INVALID_ENCOUNTER', errorMessage: 'Encounter reference is invalid', lastAttempt: '2025-12-07 11:15:00', retryCount: 2 },
    { orderId: 'ORD-2025120022', patientName: 'Kartini Sari', errorCode: 'TIMEOUT', errorMessage: 'Connection timeout to SATUSEHAT server', lastAttempt: '2025-12-07 12:00:00', retryCount: 1 },
    { orderId: 'ORD-2025120025', patientName: 'Lukman Hakim', errorCode: 'AUTH_FAILED', errorMessage: 'OAuth token expired', lastAttempt: '2025-12-07 13:45:00', retryCount: 2 },
    { orderId: 'ORD-2025120028', patientName: 'Maya Putri', errorCode: 'DUPLICATE', errorMessage: 'ServiceRequest already exists', lastAttempt: '2025-12-07 14:30:00', retryCount: 1 }
  ]
};

// ============================================================================
// WORKLIST REPORT DATA
// ============================================================================
export const mockWorklistData = {
  summary: {
    totalEntries: 1247,
    scheduled: 156,
    inProgress: 45,
    completed: 1012,
    cancelled: 34,
    avgWaitingTime: 18, // minutes
    avgExamTime: 25 // minutes
  },
  byStatus: [
    { status: 'completed', count: 1012, percentage: 81.2 },
    { status: 'scheduled', count: 156, percentage: 12.5 },
    { status: 'in_progress', count: 45, percentage: 3.6 },
    { status: 'cancelled', count: 34, percentage: 2.7 }
  ],
  byShift: [
    { shift: 'Pagi (07:00-14:00)', count: 523, avgWait: 15 },
    { shift: 'Siang (14:00-21:00)', count: 412, avgWait: 22 },
    { shift: 'Malam (21:00-07:00)', count: 312, avgWait: 12 }
  ],
  slaBreaches: [
    { accessionNumber: 'ACC-2025120045', patientName: 'Nadia Kusuma', modality: 'MR', scheduledAt: '2025-12-07 08:00:00', waitingMinutes: 65, status: 'in_progress' },
    { accessionNumber: 'ACC-2025120052', patientName: 'Oscar Pratama', modality: 'CT', scheduledAt: '2025-12-07 09:30:00', waitingMinutes: 48, status: 'scheduled' },
    { accessionNumber: 'ACC-2025120058', patientName: 'Putri Ayu', modality: 'MR', scheduledAt: '2025-12-07 10:15:00', waitingMinutes: 42, status: 'in_progress' }
  ],
  trend: dates7Days.map((date) => ({
    date,
    completed: 130 + Math.floor(Math.random() * 30),
    scheduled: 20 + Math.floor(Math.random() * 10)
  }))
};

// ============================================================================
// STORAGE REPORT DATA
// ============================================================================
export const mockStorageData = {
  summary: {
    totalBytes: 1099511627776, // 1 TB
    usedBytes: 768614400000, // ~715 GB
    availableBytes: 330897227776, // ~308 GB
    usagePercentage: 69.9,
    totalStudies: 15234,
    totalSeries: 45678,
    totalInstances: 892345
  },
  byModality: [
    { modality: 'CT', sizeBytes: 384307200000, studyCount: 4521, avgFileSize: 85000000 },
    { modality: 'MR', sizeBytes: 230584320000, studyCount: 3245, avgFileSize: 71000000 },
    { modality: 'CR', sizeBytes: 76861440000, studyCount: 4123, avgFileSize: 18600000 },
    { modality: 'US', sizeBytes: 46116864000, studyCount: 2156, avgFileSize: 21400000 },
    { modality: 'DX', sizeBytes: 30744576000, studyCount: 1189, avgFileSize: 25900000 }
  ],
  trend: dates30Days.map((date, i) => ({
    date,
    usedBytes: 700000000000 + (i * 2300000000),
    usagePercentage: 63.7 + (i * 0.21)
  }))
};

// ============================================================================
// PRODUCTIVITY REPORT DATA
// ============================================================================
export const mockProductivityData = {
  byDoctor: [
    { doctorName: 'dr. Andi Wijaya, Sp.Rad', doctorId: 'DOC001', totalOrders: 245, completedOrders: 238, completionRate: 97.1, avgTurnaround: 32 },
    { doctorName: 'dr. Budi Hartono, Sp.Rad', doctorId: 'DOC002', totalOrders: 198, completedOrders: 189, completionRate: 95.5, avgTurnaround: 38 },
    { doctorName: 'dr. Citra Dewi, Sp.Rad', doctorId: 'DOC003', totalOrders: 176, completedOrders: 172, completionRate: 97.7, avgTurnaround: 28 },
    { doctorName: 'dr. Dian Permata, Sp.Rad', doctorId: 'DOC004', totalOrders: 156, completedOrders: 148, completionRate: 94.9, avgTurnaround: 42 },
    { doctorName: 'dr. Eko Susanto, Sp.Rad', doctorId: 'DOC005', totalOrders: 134, completedOrders: 130, completionRate: 97.0, avgTurnaround: 35 }
  ],
  byOperator: [
    { operatorName: 'Fajar Nugroho', operatorId: 'OPR001', totalExams: 312, avgExamTime: 22, completionRate: 98.4 },
    { operatorName: 'Gita Puspita', operatorId: 'OPR002', totalExams: 287, avgExamTime: 25, completionRate: 97.2 },
    { operatorName: 'Hendra Kusuma', operatorId: 'OPR003', totalExams: 265, avgExamTime: 28, completionRate: 96.8 },
    { operatorName: 'Indah Sari', operatorId: 'OPR004', totalExams: 243, avgExamTime: 24, completionRate: 98.1 },
    { operatorName: 'Jaya Pratama', operatorId: 'OPR005', totalExams: 221, avgExamTime: 26, completionRate: 97.5 }
  ]
};

// ============================================================================
// AUDIT REPORT DATA
// ============================================================================
export const mockAuditData = {
  summary: {
    totalActions: 8945,
    uniqueUsers: 45,
    failedLogins: 12
  },
  byAction: [
    { action: 'VIEW', count: 4523 },
    { action: 'CREATE', count: 1876 },
    { action: 'UPDATE', count: 1432 },
    { action: 'DELETE', count: 234 },
    { action: 'LOGIN', count: 567 },
    { action: 'LOGOUT', count: 313 }
  ],
  byUser: [
    { userName: 'admin', actionCount: 1245, lastActivity: '2025-12-07 15:30:00' },
    { userName: 'dr.andi', actionCount: 876, lastActivity: '2025-12-07 14:45:00' },
    { userName: 'operator1', actionCount: 654, lastActivity: '2025-12-07 15:15:00' },
    { userName: 'dr.budi', actionCount: 543, lastActivity: '2025-12-07 13:30:00' },
    { userName: 'operator2', actionCount: 432, lastActivity: '2025-12-07 15:00:00' }
  ],
  timeline: [
    { timestamp: '2025-12-07 15:30:00', user: 'admin', action: 'UPDATE', module: 'Settings', details: 'Updated system configuration' },
    { timestamp: '2025-12-07 15:15:00', user: 'operator1', action: 'CREATE', module: 'Orders', details: 'Created new order ORD-2025120089' },
    { timestamp: '2025-12-07 15:00:00', user: 'dr.andi', action: 'VIEW', module: 'Studies', details: 'Viewed study 1.2.3.4.5.6.7.8.9' },
    { timestamp: '2025-12-07 14:45:00', user: 'operator2', action: 'UPDATE', module: 'Worklist', details: 'Updated worklist status' },
    { timestamp: '2025-12-07 14:30:00', user: 'dr.budi', action: 'CREATE', module: 'Reports', details: 'Created radiology report' }
  ],
  trend: dates7Days.map((date) => ({
    date,
    actions: 1100 + Math.floor(Math.random() * 300)
  }))
};

// ============================================================================
// DASHBOARD SUMMARY DATA
// ============================================================================
export const mockDashboardData = {
  kpis: {
    totalOrders: { value: 1247, change: 12.5, changeType: 'increase' },
    completionRate: { value: 94.2, change: 2.1, changeType: 'increase' },
    avgTurnaround: { value: 38, change: -5.3, changeType: 'decrease' }, // decrease is good here
    satusehatSync: { value: 96.8, change: 1.2, changeType: 'increase' },
    storageUsage: { value: 69.9, change: 3.2, changeType: 'increase' },
    activeWorklist: { value: 201, change: -8.5, changeType: 'decrease' }
  },
  quickStats: {
    todayOrders: 45,
    pendingWorklist: 156,
    failedSync: 23,
    storageWarning: false
  },
  miniTrends: {
    orders: dates7Days.map((date) => ({ date, value: 35 + Math.floor(Math.random() * 20) })),
    completion: dates7Days.map((date) => ({ date, value: 90 + Math.floor(Math.random() * 8) }))
  }
};
