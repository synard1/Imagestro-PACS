import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ordersApi } from '../services/api'
import { useToast } from '../components/ToastProvider'
import OrderActionButtons from '../components/OrderActionButtons'
import { getAllStatuses } from '../config/orderStatus'
import Icon from '../components/common/Icon'
import StatusBadge from '../components/StatusBadge'

const OFFLINE_KEY = 'orders_offline'

export default function OrderList(){
  const [items, setItems] = useState([])
  const [status, setStatus] = useState('')
  const [modality, setModality] = useState('')
  const toast = useToast()
  const nav = useNavigate()

  const load = async () => {
    try {
      // Load from backend
      const res = await ordersApi.list({ status, modality })
      let backendOrders = res.items || res || []

      // Load from offline storage
      const raw = localStorage.getItem(OFFLINE_KEY)
      const offlineOrders = raw ? JSON.parse(raw) : []

      // Merge: offline orders first (so they appear on top)
      let merged = [...offlineOrders, ...backendOrders]

      // Apply filters
      if (status) merged = merged.filter(o => o.status === status)
      if (modality) merged = merged.filter(o => o.modality === modality)

      setItems(merged)
    } catch {
      // If backend fails, try to load offline only
      const raw = localStorage.getItem(OFFLINE_KEY)
      let offlineOrders = raw ? JSON.parse(raw) : []

      if (status) offlineOrders = offlineOrders.filter(o => o.status === status)
      if (modality) offlineOrders = offlineOrders.filter(o => o.modality === modality)

      setItems(offlineOrders)
      toast.notify({ type:'error', message:'Failed to load orders from backend, showing offline orders only' })
    }
  }
  useEffect(()=>{ load() }, [])

  const removeOffline = (id) => {
    const raw = localStorage.getItem(OFFLINE_KEY)
    const arr = raw ? JSON.parse(raw) : []
    const next = arr.filter(x => x.id !== id)
    localStorage.setItem(OFFLINE_KEY, JSON.stringify(next))
  }

  const onDelete = async (order) => {
    if (!confirm(`Delete order ${order.accession || order.accession_no}?`)) return

    try {
      if (order._offline) {
        // Delete offline order
        removeOffline(order.id)
        toast.notify({ type:'success', message:'Offline order deleted' })
      } else {
        // Delete backend order
        await ordersApi.delete(order.id)
        toast.notify({ type:'success', message:'Order deleted' })
      }
      load()
    } catch (e) {
      toast.notify({ type:'error', message:`Delete failed: ${e.message}` })
    }
  }

  const onChangeStatus = async (order, newStatus, notes = '') => {
    try {
      // Merge existing history from possible locations (will be refined for backend)
      let existingHistory = (
        order.details?.status_history ||
        order.status_history ||
        order.metadata?.status_history ||
        []
      )

      // Helper to format duration
      const formatDuration = (ms) => {
        const totalSec = Math.max(0, Math.floor(ms / 1000))
        const days = Math.floor(totalSec / 86400)
        const hours = Math.floor((totalSec % 86400) / 3600)
        const minutes = Math.floor((totalSec % 3600) / 60)
        const seconds = totalSec % 60
        const parts = []
        if (days) parts.push(`${days}d`)
        if (hours) parts.push(`${hours}h`)
        if (minutes) parts.push(`${minutes}m`)
        if (seconds || parts.length === 0) parts.push(`${seconds}s`)
        return parts.join(' ')
      }

      // Build timestamps in local time (with offset) and UTC
      const now = new Date()
      const tzOffsetMin = now.getTimezoneOffset()
      const pad = (n) => String(n).padStart(2, '0')
      const offsetSign = tzOffsetMin <= 0 ? '+' : '-'
      const offsetAbs = Math.abs(tzOffsetMin)
      const offsetHH = pad(Math.floor(offsetAbs / 60))
      const offsetMM = pad(offsetAbs % 60)
      const localIso = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}${offsetSign}${offsetHH}:${offsetMM}`
      const utcIso = now.toISOString()

      let prevStatus = order.status || existingHistory?.[existingHistory.length - 1]?.status || 'unknown'
      let lastTsRaw = existingHistory?.[existingHistory.length - 1]?.timestamp_utc || existingHistory?.[existingHistory.length - 1]?.timestamp || order.updated_at || order.created_at || order.scheduled_start_at || order.scheduled_at

      // For backend orders, fetch latest order to ensure we append rather than overwrite
      let latest = null
      if (!order._offline) {
        try {
          latest = await ordersApi.getOrder(order.id)
          const latestOrder = latest?.data || latest || {}
          const latestHistory = (
            latestOrder.details?.status_history ||
            latestOrder.status_history ||
            latestOrder.metadata?.status_history ||
            []
          )
          if (Array.isArray(latestHistory)) {
            existingHistory = latestHistory
          }
          prevStatus = latestOrder.status || prevStatus
          lastTsRaw = latestHistory?.[latestHistory.length - 1]?.timestamp_utc || latestHistory?.[latestHistory.length - 1]?.timestamp || latestOrder.updated_at || latestOrder.created_at || latestOrder.scheduled_start_at || latestOrder.scheduled_at || lastTsRaw
        } catch (e) {
          console.warn('[OrderList] Failed to fetch latest order; using local state:', e?.message)
        }
      }

      const lastTs = lastTsRaw ? new Date(lastTsRaw).getTime() : Date.now()
      const deltaMs = Date.now() - lastTs
      const deltaHuman = formatDuration(deltaMs)

      const newEntry = {
        status: newStatus,
        timestamp: localIso, // local time with timezone offset
        timestamp_utc: utcIso,
        timezone_offset_minutes: -tzOffsetMin,
        user: 'current_user', // Replace with actual user integration
        notes: notes,
        prev_status: prevStatus,
        next_status: newStatus,
        delta_ms: deltaMs,
        delta_human: deltaHuman
      }

      const newHistory = [
        ...existingHistory,
        newEntry
      ]

      if (order._offline) {
        // Update offline order
        const raw = localStorage.getItem(OFFLINE_KEY)
        const arr = raw ? JSON.parse(raw) : []
        const idx = arr.findIndex(o => o.id === order.id)
        if (idx !== -1) {
          arr[idx].status = newStatus
          // Store history in both top-level and details for offline entries
          arr[idx].status_history = newHistory
          arr[idx].details = { ...(arr[idx].details || {}), status_history: newHistory }
          localStorage.setItem(OFFLINE_KEY, JSON.stringify(arr))
          load()
          toast.notify({ type:'success', message:`Status changed to ${newStatus}` })
        }
      } else {
        // Update backend order using refactored approach with details column
        const source = latest?.data || latest || order
        await ordersApi.update(order.id, {
          status: newStatus,
          details: {
            ...(source.details || order.details || {}),
            status_history: newHistory
          }
        })
        load()
        toast.notify({ type:'success', message:`Status changed to ${newStatus}` })
      }
    } catch (e) {
      toast.notify({ type:'error', message:`Failed to change status: ${e.message}` })
    }
  }

  const handlePublish = async (order) => {
    try {
      await ordersApi.publish(order.id)
      toast.notify({ type:'success', message:'Enqueued to MWL' })
      load()
    } catch (e) {
      toast.notify({ type:'error', message:'Publish failed' })
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-xl font-semibold">Orders</h1>
        <div className="flex gap-2">
          <Link to="/orders/new" className="btn-themed-primary flex items-center gap-2">
            <Icon name="plus" className="w-4 h-4" />
            New Order
          </Link>
          <Link to="/orders/workflow" className="btn-themed-secondary flex items-center gap-2" title="View workflow documentation">
            <Icon name="information" className="w-4 h-4" />
            Workflow
          </Link>
          <button className="btn-themed-secondary flex items-center gap-2" onClick={load}>
            <Icon name="refresh" className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="mb-3 p-3 bg-slate-50 border border-slate-200 rounded">
        <div className="text-xs font-semibold text-slate-700 mb-2">Legend:</div>
        <div className="flex flex-wrap gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-6 h-4 bg-amber-50 border border-amber-200 rounded"></div>
            <span className="text-slate-600">Offline Order (stored locally)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="px-2 py-0.5 rounded bg-amber-200 text-amber-800 font-mono text-xs">OFFLINE</div>
            <span className="text-slate-600">Not synced to backend</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-4 bg-white border border-slate-200 rounded"></div>
            <span className="text-slate-600">Backend Order (server data)</span>
          </div>
        </div>
      </div>

      <div className="flex gap-2 mb-3">
        <select className="select-themed" value={status} onChange={e=>setStatus(e.target.value)}>
          <option value="">All Status</option>
          {getAllStatuses(false).map(s=><option key={s.key} value={s.key}>{s.label}</option>)
        </select>
        <select className="select-themed" value={modality} onChange={e=>setModality(e.target.value)}>
          <option value="">All Modality</option>
          {['CT','MR','CR','US','MG'].map(m=><option key={m} value={m}>{m}</option>)}
        </select>
        <button className="btn-themed-secondary flex items-center gap-2" onClick={load}>
          <Icon name="refresh" className="w-4 h-4" />
          Filter
        </button>
      </div>

      <div className="card overflow-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2 pr-4">Accession</th>
              <th className="py-2 pr-4">Patient</th>
              <th className="py-2 pr-4">Mod</th>
              <th className="py-2 pr-4">Scheduled</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4 text-center w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map(o=>(
              <tr key={o.id || o.accession} className={`border-b last:border-0 ${o._offline ? 'bg-amber-50' : ''}`}>
                <td className="py-2 pr-4 font-mono">
                  {o.accession || o.accession_no}
                  {o._offline && <span className="ml-2 badge badge-yellow">OFFLINE</span>}
                </td>
                <td className="py-2 pr-4">{o.patient?.name || o.patient_name || '-'}</td>
                <td className="py-2 pr-4">{o.modality}</td>
                <td className="py-2 pr-4">{o.scheduled_start?.slice?.(0,16)?.replace('T',' ') || o.scheduled_start_at}</td>
                <td className="py-2 pr-4">
                  {o._offline ? (
                    <span className="badge badge-yellow">{o.status}</span>
                  ) : (
                    <StatusBadge status={o.status} />
                  )}
                </td>
                <td className="py-2 pr-4 text-center">
                  {o.id && (
                    <div className="inline-flex justify-center">
                      <OrderActionButtons
                        order={o}
                        onDelete={onDelete}
                        onChangeStatus={onChangeStatus}
                        onPublish={handlePublish}
                      />
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {items.length===0 && <tr><td className="py-3 text-slate-500">No data</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
