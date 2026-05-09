import { apiClient } from './http'
import { loadRegistry } from './api-registry'
import { api } from './api'

const isBackendEnabled = () => {
  const registry = loadRegistry()
  const config = registry.procedures || { enabled: false }
  return config.enabled === true
}

const normalize = (p) => {
  if (!p) return null
  const duration = typeof p.duration_minutes === 'number' ? p.duration_minutes : (parseInt(p.duration_minutes, 10) || 0)
  return {
    ...p,
    code: p.code || p.id || '',
    name: p.name || p.display_name || p.display || '',
    description: p.description || '',
    category: p.category || '',
    duration_minutes: duration,
    special_requirements: p.prep_instructions || p.special_requirements || ''
  }
}

const normalizeList = (arr) => Array.isArray(arr) ? arr.map(normalize).filter(Boolean) : []

export const listProcedures = async (params = {}) => {
  if (!isBackendEnabled()) {
    const res = await api.listProcedures()
    return normalizeList(Array.isArray(res) ? res : (res.procedures || res.data || []))
  }
  const client = apiClient('procedures')
  const qp = new URLSearchParams()
  if (params.code) qp.append('code', params.code)
  if (params.name) qp.append('name', params.name)
  if (params.category) qp.append('category', params.category)
  if (params.modality) qp.append('modality', params.modality)
  if (params.body_part) qp.append('body_part', params.body_part)
  if (params.active) qp.append('active', params.active)
  const bases = ['/procedures', '/api/procedures']
  const endpoints = qp.toString() ? bases.map(b => `${b}?${qp}`) : bases
  let lastErr = null
  for (const ep of endpoints) {
    try {
      const r = await client.get(ep)
      if (r && r.status === 'success') {
        const items = r.procedures || r.data?.procedures || []
        return normalizeList(items)
      }
      if (Array.isArray(r)) return normalizeList(r)
      if (r && r.procedures) return normalizeList(r.procedures)
      return normalizeList(r?.data || [])
    } catch (e) {
      lastErr = e
      const msg = (e.message || '').toLowerCase()
      if (e.status === 404 || e.status === 405 || msg.includes('not found') || msg.includes('method not allowed')) continue
      break
    }
  }
  throw lastErr || new Error('Failed to list procedures')
}

export const getProcedure = async (idOrCode) => {
  if (!isBackendEnabled()) {
    const r = await api.getProcedure(idOrCode)
    const p = r?.procedure || r?.data?.procedure || r
    return normalize(p)
  }
  const client = apiClient('procedures')
  const candidates = [`/procedures/${idOrCode}`, `/api/procedures/${idOrCode}`]
  let lastErr = null
  for (const ep of candidates) {
    try {
      const r = await client.get(ep)
      if (r && r.status === 'success') {
        const p = r.procedure || r.data?.procedure || r.data
        return normalize(p)
      }
      return normalize(r)
    } catch (e) {
      lastErr = e
      const msg = (e.message || '').toLowerCase()
      if (e.status === 404 || e.status === 405 || msg.includes('not found') || msg.includes('method not allowed')) continue
      break
    }
  }
  throw lastErr || new Error('Failed to get procedure')
}

export const createProcedure = async (data) => {
  if (!isBackendEnabled()) {
    const payload = { ...data }
    return normalize(payload)
  }
  const client = apiClient('procedures')
  const candidates = ['/procedures', '/api/procedures']
  let lastErr = null
  for (const ep of candidates) {
    try {
      const r = await client.post(ep, data)
      if (r && r.status === 'success') {
        const id = r.id || r.data?.id || r.procedure?.id || r.data?.procedure?.id
        if (id) {
          try {
            const d = await client.get(`${ep}/${id}`)
            const p = d?.procedure || d?.data?.procedure || d
            return normalize(p)
          } catch (_) {
            return normalize({ id, ...data })
          }
        }
        const p = r.procedure || r.data?.procedure || r.data
        return normalize(p || data)
      }
      return normalize(r || data)
    } catch (e) {
      lastErr = e
      const msg = (e.message || '').toLowerCase()
      if (e.status === 405 || e.status === 404 || msg.includes('method not allowed') || msg.includes('not found')) continue
      break
    }
  }
  throw lastErr || new Error('Failed to create procedure')
}

export const updateProcedure = async (id, data) => {
  if (!isBackendEnabled()) {
    const payload = { id, ...data }
    return normalize(payload)
  }
  const client = apiClient('procedures')
  const candidates = [`/procedures/${id}`, `/api/procedures/${id}`]
  let lastErr = null
  for (const ep of candidates) {
    try {
      const r = await client.put(ep, data)
      if (r && r.status === 'success') {
        const p = r.procedure || r.data?.procedure || r.data
        return normalize(p)
      }
      return normalize(r)
    } catch (e) {
      lastErr = e
      const msg = (e.message || '').toLowerCase()
      if (e.status === 404 || e.status === 405 || msg.includes('not found') || msg.includes('method not allowed')) continue
      break
    }
  }
  throw lastErr || new Error('Failed to update procedure')
}

export const deleteProcedure = async (id) => {
  if (!isBackendEnabled()) {
    return { status: 'success' }
  }
  const client = apiClient('procedures')
  const candidates = [`/procedures/${id}`, `/api/procedures/${id}`]
  let lastErr = null
  for (const ep of candidates) {
    try {
      const r = await client.delete(ep)
      return r || { status: 'success' }
    } catch (e) {
      lastErr = e
      const msg = (e.message || '').toLowerCase()
      if (e.status === 404 || e.status === 405 || msg.includes('not found') || msg.includes('method not allowed')) continue
      break
    }
  }
  throw lastErr || new Error('Failed to delete procedure')
}

export const searchProcedures = async (params = {}) => {
  if (!isBackendEnabled()) {
    const q = params.q || params.query || ''
    const res = await api.searchProcedures(q)
    const items = Array.isArray(res) ? res : (res.procedures || res.data || [])
    return normalizeList(items)
  }
  const client = apiClient('procedures')
  const qp = new URLSearchParams()
  const q = params.q || params.query || ''
  if (q) qp.append('q', q)
  if (params.category) qp.append('category', params.category)
  if (params.modality) qp.append('modality', params.modality)
  const candidates = [`/procedures/search?${qp}`, `/api/procedures/search?${qp}`]
  let lastErr = null
  for (const ep of candidates) {
    try {
      const r = await client.get(ep)
      if (r && r.status === 'success') {
        const items = r.procedures || r.data?.procedures || []
        return normalizeList(items)
      }
      if (Array.isArray(r)) return normalizeList(r)
      return normalizeList(r?.data || [])
    } catch (e) {
      lastErr = e
      const msg = (e.message || '').toLowerCase()
      if (e.status === 404 || e.status === 405 || msg.includes('not found') || msg.includes('method not allowed')) continue
      break
    }
  }
  throw lastErr || new Error('Failed to search procedures')
}

export default {
  listProcedures,
  getProcedure,
  createProcedure,
  updateProcedure,
  deleteProcedure,
  searchProcedures,
}
