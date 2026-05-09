import { apiClient } from './http'
import { loadRegistry } from './api-registry'

const isBackendEnabled = () => {
  const registry = loadRegistry()
  const config = registry.mappings || { enabled: false }
  return config.enabled === true
}

const normalizeSystem = (s) => ({
  id: s.id || s.system_id || s.code || s.system_code,
  system_code: s.system_code || s.code,
  system_name: s.system_name || s.name,
  is_active: s.is_active !== false
})

const normalizeMapping = (m) => ({
  id: m.id,
  external_system_id: m.external_system_id,
  external_code: m.external_code,
  external_name: m.external_name,
  pacs_procedure_id: m.pacs_procedure_id,
  mapping_type: m.mapping_type || 'exact',
  confidence_level: typeof m.confidence_level === 'number' ? m.confidence_level : (parseInt(m.confidence_level, 10) || 0),
  is_active: m.is_active !== false,
  notes: m.notes || '',
  pacs_code: m.pacs_code || m.code,
  pacs_name: m.pacs_name || m.name
})

const normalizeSystems = (arr) => Array.isArray(arr) ? arr.map(normalizeSystem).filter(Boolean) : []
const normalizeMappings = (arr) => Array.isArray(arr) ? arr.map(normalizeMapping).filter(Boolean) : []

export const listExternalSystems = async () => {
  if (!isBackendEnabled()) return []
  const client = apiClient('mappings')
  const candidates = ['/external-systems']
  for (const ep of candidates) {
    try {
      const r = await client.get(ep)
      if (r && r.status === 'success') return normalizeSystems(r.systems || r.data?.systems || [])
      return normalizeSystems(Array.isArray(r) ? r : (r.data || []))
    } catch (e) {
      const msg = (e.message || '').toLowerCase()
      if (e.status === 404 || e.status === 405 || msg.includes('not found') || msg.includes('method not allowed')) continue
      throw e
    }
  }
  return []
}

export const listMappings = async (params = {}) => {
  if (!isBackendEnabled()) return []
  const client = apiClient('mappings')
  const qp = new URLSearchParams()
  if (params.external_system_id) qp.append('external_system_id', params.external_system_id)
  if (params.external_code) qp.append('external_code', params.external_code)
  if (params.pacs_procedure_id) qp.append('pacs_procedure_id', params.pacs_procedure_id)
  if (params.mapping_type) qp.append('mapping_type', params.mapping_type)
  if (typeof params.is_active !== 'undefined') qp.append('is_active', params.is_active)
  const candidates = ['/procedure-mappings']
  const endpoints = qp.toString() ? candidates.map(b => `${b}?${qp}`) : candidates
  for (const ep of endpoints) {
    try {
      const r = await client.get(ep)
      if (r && r.status === 'success') return normalizeMappings(r.mappings || r.data?.mappings || [])
      return normalizeMappings(Array.isArray(r) ? r : (r.data || []))
    } catch (e) {
      const msg = (e.message || '').toLowerCase()
      if (e.status === 404 || e.status === 405 || msg.includes('not found') || msg.includes('method not allowed')) continue
      throw e
    }
  }
  return []
}

export const getMapping = async (id) => {
  if (!isBackendEnabled()) return null
  const client = apiClient('mappings')
  const candidates = [`/procedure-mappings/${id}`, `/api/procedure-mappings/${id}`]
  for (const ep of candidates) {
    try {
      const r = await client.get(ep)
      if (r && r.status === 'success') return normalizeMapping(r.mapping || r.data?.mapping || r.data)
      return normalizeMapping(r)
    } catch (e) {
      const msg = (e.message || '').toLowerCase()
      if (e.status === 404 || e.status === 405 || msg.includes('not found') || msg.includes('method not allowed')) continue
      throw e
    }
  }
  return null
}

export const createMapping = async (data) => {
  if (!isBackendEnabled()) return { status: 'success' }
  const client = apiClient('mappings')
  const candidates = ['/procedure-mappings']
  for (const ep of candidates) {
    try {
      const r = await client.post(ep, data)
      if (r && r.status === 'success') return r
      return r
    } catch (e) {
      const msg = (e.message || '').toLowerCase()
      if (e.status === 405 || e.status === 404 || msg.includes('method not allowed') || msg.includes('not found')) continue
      throw e
    }
  }
  return { status: 'error' }
}

export const updateMapping = async (id, data) => {
  if (!isBackendEnabled()) return { status: 'success' }
  const client = apiClient('mappings')
  const candidates = [`/procedure-mappings/${id}`, `/api/procedure-mappings/${id}`]
  for (const ep of candidates) {
    try {
      const r = await client.put(ep, data)
      if (r && r.status === 'success') return r
      return r
    } catch (e) {
      const msg = (e.message || '').toLowerCase()
      if (e.status === 404 || e.status === 405 || msg.includes('not found') || msg.includes('method not allowed')) continue
      throw e
    }
  }
  return { status: 'error' }
}

export const deleteMapping = async (id) => {
  if (!isBackendEnabled()) return { status: 'success' }
  const client = apiClient('mappings')
  const candidates = [`/procedure-mappings/${id}`, `/api/procedure-mappings/${id}`]
  for (const ep of candidates) {
    try {
      const r = await client.delete(ep)
      return r || { status: 'success' }
    } catch (e) {
      const msg = (e.message || '').toLowerCase()
      if (e.status === 404 || e.status === 405 || msg.includes('not found') || msg.includes('method not allowed')) continue
      throw e
    }
  }
  return { status: 'error' }
}

export const bulkImport = async (mappings) => {
  if (!isBackendEnabled()) return { status: 'success', inserted: mappings.length }
  const client = apiClient('mappings')
  const candidates = ['/procedure-mappings/bulk', '/api/procedure-mappings/bulk']
  for (const ep of candidates) {
    try {
      const r = await client.post(ep, { mappings })
      return r
    } catch (e) {
      const msg = (e.message || '').toLowerCase()
      if (e.status === 404 || e.status === 405 || msg.includes('not found') || msg.includes('method not allowed')) continue
      throw e
    }
  }
  return { status: 'error' }
}

export const exportMappings = async (params = {}) => {
  const items = await listMappings(params)
  return items
}

export default {
  listExternalSystems,
  listMappings,
  getMapping,
  createMapping,
  updateMapping,
  deleteMapping,
  bulkImport,
  exportMappings,
}
