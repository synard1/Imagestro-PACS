// src/pages/orders/AllOrdersView.jsx
// Original Orders.jsx content moved here for tab structure

import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import StatusBadge from '../../components/StatusBadge'
import OrderActionButtons from '../../components/OrderActionButtons'
import orderService from '../../services/orderService'
import { useToast } from '../../components/ToastProvider'
import Icon from '../../components/common/Icon'
import PermissionGate from '../../components/common/PermissionGate'

const OFFLINE_KEY = 'orders_offline'

export default function AllOrdersView({ syncingOrders: externalSyncingOrders }) {
    const [orders, setOrders] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState('')
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')
    const [syncingOrders, setSyncingOrders] = useState(externalSyncingOrders || [])
    const toast = useToast()
    const isMountedRef = useRef(false)
    const loadingRef = useRef(false)

    const loadOrders = useCallback(async () => {
        // Prevent duplicate calls
        if (loadingRef.current) {
            // console.log('[AllOrdersView] Skipping duplicate loadOrders call')
            return
        }

        try {
            loadingRef.current = true
            setLoading(true)
            // console.log('[AllOrdersView] Loading orders...')
            const data = await orderService.listOrders()

            // Only update state if component is still mounted
            if (isMountedRef.current) {
                setOrders(data)
                // console.log('[AllOrdersView] Orders loaded:', data.length)
            }
        } catch (error) {
            if (isMountedRef.current) {
                toast.notify({
                    type: 'error',
                    message: `Failed to load orders: ${error.message}`
                })
            }
        } finally {
            loadingRef.current = false
            if (isMountedRef.current) {
                setLoading(false)
            }
        }
    }, [toast])

    // Load orders only on component mount with proper cleanup
    useEffect(() => {
        isMountedRef.current = true
        // console.log('[AllOrdersView] Component mounted, loading orders...')
        loadOrders()

        return () => {
            // console.log('[AllOrdersView] Component unmounting, cleanup...')
            isMountedRef.current = false
        }
    }, [loadOrders])

    // Handle status change - refresh data instead of page reload
    const handleChangeStatus = useCallback(async (order, newStatus, notes = '') => {
        // console.log('[AllOrdersView] handleChangeStatus called', { orderId: order.id, currentStatus: order.status, newStatus });
        try {
            await orderService.updateOrderStatus(order.id, newStatus, notes)
            // console.log('[AllOrdersView] Status update success');
            toast.notify({ type: 'success', message: `Order status updated to ${newStatus}` })
            // Refresh data instead of full page reload
            await loadOrders()
        } catch (error) {
            console.error('[AllOrdersView] Status update failed', error);
            toast.notify({ type: 'error', message: `Failed to update status: ${error.message}` })
        }
    }, [toast, loadOrders])

    // Handle delete - refresh data instead of page reload
    const handleDelete = useCallback(async (order) => {
        if (!confirm(`Are you sure you want to delete order for ${order.patient_name}?`)) return

        try {
            if (order._offline) {
                // Delete from offline storage
                const raw = localStorage.getItem(OFFLINE_KEY)
                const offlineOrders = raw ? JSON.parse(raw) : []
                const updated = offlineOrders.filter(o => o.id !== order.id)
                localStorage.setItem(OFFLINE_KEY, JSON.stringify(updated))
            } else {
                // Delete from backend
                await orderService.deleteOrder(order.id)
            }

            toast.notify({ type: 'success', message: 'Order deleted successfully' })
            // Refresh data instead of full page reload
            await loadOrders()
        } catch (error) {
            toast.notify({ type: 'error', message: `Failed to delete order: ${error.message}` })
        }
    }, [toast, loadOrders])

    // Handle publish - refresh data instead of page reload
    const handlePublish = useCallback(async (order) => {
        try {
            // Implement publish logic here
            toast.notify({ type: 'success', message: 'Order published to worklist' })
            // Refresh data instead of full page reload
            await loadOrders()
        } catch (error) {
            toast.notify({ type: 'error', message: `Failed to publish: ${error.message}` })
        }
    }, [toast, loadOrders])

    // Handle sync - refresh data instead of page reload
    const handleSync = useCallback(async (order) => {
        if (!order._offline) {
            toast.notify({ type: 'warning', message: 'Order is already synced' })
            return
        }

        try {
            setSyncingOrders(prev => [...prev, order.id])

            // Sync to backend
            await orderService.createOrder(order)

            // Remove from offline storage
            const raw = localStorage.getItem(OFFLINE_KEY)
            const offlineOrders = raw ? JSON.parse(raw) : []
            const updated = offlineOrders.filter(o => o.id !== order.id)
            localStorage.setItem(OFFLINE_KEY, JSON.stringify(updated))

            toast.notify({ type: 'success', message: 'Order synced successfully' })
            // Refresh data instead of full page reload
            await loadOrders()
        } catch (error) {
            toast.notify({ type: 'error', message: `Failed to sync order: ${error.message}` })
        } finally {
            setSyncingOrders(prev => prev.filter(id => id !== order.id))
        }
    }, [toast, loadOrders])

    const filtered = useMemo(() => {
        return orders.filter(r => {
            // Search filter - patient name, accession, or order number
            const matchesSearch = !searchQuery ||
                r.patient_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                r.accession_no?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                r.order_number?.toLowerCase().includes(searchQuery.toLowerCase())

            // Status filter
            const matchesStatus = !statusFilter || r.status === statusFilter

            // Date range filter
            let matchesDate = true
            if (dateFrom || dateTo) {
                const orderDate = r.scheduled_at ? new Date(r.scheduled_at) : (r.created_at ? new Date(r.created_at) : null)
                if (orderDate) {
                    if (dateFrom) {
                        const fromDate = new Date(dateFrom)
                        fromDate.setHours(0, 0, 0, 0)
                        matchesDate = matchesDate && orderDate >= fromDate
                    }
                    if (dateTo) {
                        const toDate = new Date(dateTo)
                        toDate.setHours(23, 59, 59, 999)
                        matchesDate = matchesDate && orderDate <= toDate
                    }
                } else {
                    // If no date available, exclude from date filter
                    matchesDate = false
                }
            }

            return matchesSearch && matchesStatus && matchesDate
        })
    }, [orders, searchQuery, statusFilter, dateFrom, dateTo])

    const handleClearFilters = () => {
        setSearchQuery('')
        setStatusFilter('')
        setDateFrom('')
        setDateTo('')
    }

    return (
        <div className="space-y-4">
            {/* Search & Filter Bar */}
            <div className="flex gap-2 items-center flex-wrap">
                <input
                    className="input-themed text-sm flex-1 min-w-[200px]"
                    placeholder="Search patient / accession / order number"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                />
                <select
                    className="select-themed text-sm"
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                >
                    <option value="">All Status</option>
                    <option value="created">Created</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="arrived">Arrived</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                </select>

                {/* Date Range Filter */}
                <div className="flex items-center gap-2">
                    <input
                        type="date"
                        className="input-themed text-sm"
                        placeholder="From Date"
                        value={dateFrom}
                        onChange={e => setDateFrom(e.target.value)}
                        title="Filter from date"
                    />
                    <span className="text-slate-500 text-sm">to</span>
                    <input
                        type="date"
                        className="input-themed text-sm"
                        placeholder="To Date"
                        value={dateTo}
                        onChange={e => setDateTo(e.target.value)}
                        title="Filter to date"
                    />
                </div>

                {/* Clear Filters Button */}
                {(searchQuery || statusFilter || dateFrom || dateTo) && (
                    <button
                        type="button"
                        onClick={handleClearFilters}
                        className="btn-themed-sm flex items-center gap-1"
                        title="Clear all filters"
                    >
                        <Icon name="x" className="w-4 h-4" />
                        Clear
                    </button>
                )}

                <PermissionGate perm="order.create">
                  <Link to="/orders/new" className="btn-themed-primary flex items-center gap-2">
                    <Icon name="plus" className="w-4 h-4" />
                    Create
                  </Link>
                </PermissionGate>
                <button
                    type="button"
                    onClick={loadOrders}
                    disabled={loading}
                    className="btn-themed-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Icon name="refresh" className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  {loading ? 'Refreshing...' : 'Refresh'}
                </button>
            </div>

            {/* Filter Summary */}
            {filtered.length !== orders.length && (
                <div className="alert-info">
                    Showing {filtered.length} of {orders.length} orders
                    {(searchQuery || statusFilter || dateFrom || dateTo) && (
                        <span className="ml-2">
                            (filtered by:
                            {searchQuery && ` search="${searchQuery}"`}
                            {statusFilter && ` status="${statusFilter}"`}
                            {dateFrom && ` from="${dateFrom}"`}
                            {dateTo && ` to="${dateTo}"`}
                            )
                        </span>
                    )}
                </div>
            )}

            {/* Orders Table */}
            <div className="card overflow-auto">
                {loading ? (
                    <div className="p-8 text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto" style={{ borderColor: 'var(--theme-primary)' }}></div>
                        <p className="mt-4 text-gray-600">Loading orders...</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="table text-sm w-full">
                            <thead className="bg-slate-50 border-b-2 border-slate-200 sticky top-0 z-10">
                                <tr>
                                    <th className="text-sm font-semibold text-slate-700 px-4 py-3 text-center w-16">#</th>
                                    <th className="text-sm font-semibold text-slate-700 px-4 py-3 text-left">Order Number</th>
                                    <th className="text-sm font-semibold text-slate-700 px-4 py-3 text-left">Patient Name</th>
                                    <th className="text-sm font-semibold text-slate-700 px-4 py-3 text-left">Requested Procedure</th>
                                    <th className="text-sm font-semibold text-slate-700 px-4 py-3 text-left">Scheduled</th>
                                    <th className="text-sm font-semibold text-slate-700 px-4 py-3 text-center">Status</th>
                                    <th className="text-sm font-semibold text-slate-700 px-4 py-3 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((r, index) => (
                                    <tr key={r.id} className={`text-sm border-b border-slate-100 hover:bg-slate-50 transition-colors ${r._offline ? 'bg-amber-50 border-l-4 border-amber-400' : ''}`}>
                                        <td className="px-4 py-3 text-center text-slate-500">{index + 1}</td>
                                        <td className="px-4 py-3 font-medium">{r.order_number || '—'}</td>
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-slate-900">{r.patient_name}</div>
                                            <div className="text-[11px] text-slate-500 mt-0.5">
                                                {r.patient_id ? `${r.patient_id.substring(0, 3)}****${r.patient_id.substring(r.patient_id.length - 3)}` : ''}
                                            </div>
                                        </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2 max-w-md">
                                            <span className="truncate">{r.requested_procedure || r.procedure_name || r.procedureName || r.procedure_description || r.service_request || '—'}</span>
                                            {r.procedure_count > 1 && (
                                                <span
                                                    className="badge badge-gray flex-shrink-0"
                                                    title={`This order contains ${r.procedure_count} procedures`}
                                                >
                                                    +{r.procedure_count - 1} more
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                                        {r.scheduled_at ? new Date(r.scheduled_at).toLocaleString() : '—'}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <StatusBadge status={r.status} showIcon={true} />
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <div className="inline-flex justify-center">
                                            <OrderActionButtons
                                                order={r}
                                                onDelete={handleDelete}
                                                onChangeStatus={handleChangeStatus}
                                                onPublish={handlePublish}
                                                onSync={handleSync}
                                                syncingOrders={syncingOrders}
                                            />
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    </div>
                )}
            </div>
        </div>
    )
}
