/**
 * Mock Services Index
 * 
 * Exports all mock services for unified SIMRS integration.
 * Import from this file for cleaner imports.
 */

// Mock data constants
export * from './mockData';

// Mock services
export { default as mockExternalSystemsService } from './mockExternalSystemsService';
export { default as mockMappingService } from './mockMappingService';
export { default as mockImportService } from './mockImportService';
export { default as mockAuditLogService } from './mockAuditLogService';

// Named exports for individual functions
export {
  listExternalSystems,
  getExternalSystem,
  createExternalSystem,
  updateExternalSystem,
  deleteExternalSystem,
  testConnection,
  resetMockData as resetExternalSystemsMockData,
} from './mockExternalSystemsService';

export {
  listProcedureMappings,
  getProcedureMappingByCode,
  createProcedureMapping,
  updateProcedureMapping,
  deleteProcedureMapping,
  bulkImportProcedureMappings,
  exportProcedureMappings,
  listDoctorMappings,
  getDoctorMappingByCode,
  createDoctorMapping,
  updateDoctorMapping,
  deleteDoctorMapping,
  listOperatorMappings,
  getOperatorMappingByUserId,
  createOperatorMapping,
  updateOperatorMapping,
  deleteOperatorMapping,
  resetMockData as resetMappingMockData,
} from './mockMappingService';

export {
  listOrders,
  getOrder,
  isOrderImported,
  validateOrder,
  detectPatientDiff,
  importOrder,
  importOrders,
  getImportHistory,
  getImportHistoryEntry,
  retryImport,
  resetMockData as resetImportMockData,
} from './mockImportService';

export {
  listAuditLogs,
  getAuditLogEntry,
  getAuditLogUsers,
  createAuditLogEntry,
  getActionTypes,
  getEntityTypeDisplayName,
  getActionDisplay,
  resetMockData as resetAuditLogMockData,
} from './mockAuditLogService';
