// src/pages/orders/CompletedOrdersView.jsx
// View for completed orders (status: completed, reported, finalized, delivered)

import { useEffect, useMemo, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import StatusBadge from '../../components/StatusBadge'
import orderService from '../../services/orderService'
import { useToast } from '../../components/ToastProvider'
import Icon from '../../components/common/Icon'

export default function CompletedOrdersView() {
    const [orders, setOrders] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')
    const [dateFilter, setDateFilter] = useState('')
    const toast = useToast()

    const loadOrders = useCallback(async () => {
        try {
            setLoading(true)
            const data = await orderService.listOrders()
            // Filter completed orders
            const completedOrders = data.filter(o =>
                ['completed', 'reported', 'finalized', 'delivered'].includes(o.status)
            )
            setOrders(completedOrders)
        } catch (error) {
            toast.notify({
                type: 'error',
                message: `Failed to load orders: ${error.message}`
            })
        } finally {
            setLoading(false)
        }
    }, [toast])

    // Load orders only on component mount
    useEffect(() => {
        loadOrders()
    }, [loadOrders])

    const filtered = useMemo(() => orders.filter(r =>
        (!searchQuery || (r.patient_name.toLowerCase().includes(searchQuery.toLowerCase()) || r.accession_no?.includes(searchQuery))) &&
        (!dateFilter || (r.completed_at && r.completed_at.startsWith(dateFilter)))
    ), [orders, searchQuery, dateFilter])

    return (
        <div className="space-y-4">
            {/* Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-lg shadow p-4">
                    <div className="text-sm text-gray-600">Total Completed</div>
                    <div className="text-2xl font-bold text-green-600">{orders.length}</div>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                    <div className="text-sm text-gray-600">Reported</div>
                    <div className="text-2xl font-bold text-blue-600">
                        {orders.filter(o => o.status === 'reported').length}
                    </div>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                    <div className="text-sm text-gray-600">Finalized</div>
                    <div className="text-2xl font-bold text-gray-600">
                        {orders.filter(o => o.status === 'finalized').length}
                    </div>
                </div>
                <div className="bg-white rounded-lg shadow p-4">
                    <div className="text-sm text-gray-600">Delivered</div>
                    <div className="text-2xl font-bold text-green-600">
                        {orders.filter(o => o.status === 'delivered').length}
                    </div>
                </div>
            </div>

            {/* Search & Filter Bar */}
            <div className="flex gap-2 items-center flex-wrap">
                <input
                    className="input-themed text-sm"
                    placeholder="Search patient..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                />
                <input
                    type="date"
                    className="input-themed text-sm"
                    value={dateFilter}
                    onChange={e => setDateFilter(e.target.value)}
                    placeholder="Filter by completion date"
                />
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

            {/* Orders Table */}
            <div className="card overflow-auto">
                {loading ? (
                    <div className="p-8 text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto" style={{ borderColor: 'var(--theme-primary)' }}></div>
                        <p className="mt-4 text-gray-600">Loading completed orders...</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        No completed orders found
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="table w-full">
                            <thead className="bg-slate-50 border-b-2 border-slate-200 sticky top-0 z-10">
                                <tr>
                                    <th className="text-sm font-semibold text-slate-700 px-4 py-3 text-center w-16">#</th>
                                    <th className="text-sm font-semibold text-slate-700 px-4 py-3 text-left">Order Number</th>
                                    <th className="text-sm font-semibold text-slate-700 px-4 py-3 text-left">Patient Name</th>
                                    <th className="text-sm font-semibold text-slate-700 px-4 py-3 text-left">Procedure</th>
                                    <th className="text-sm font-semibold text-slate-700 px-4 py-3 text-left">Completed At</th>
                                    <th className="text-sm font-semibold text-slate-700 px-4 py-3 text-center">Status</th>
                                    <th className="text-sm font-semibold text-slate-700 px-4 py-3 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((r, index) => (
                                    <tr key={r.id} className="text-sm border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 text-center text-slate-500">{index + 1}</td>
                                        <td className="px-4 py-3 font-medium">{r.order_number || '—'}</td>
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-slate-900">{r.patient_name}</div>
                                            <div className="text-[11px] text-slate-500 mt-0.5">{r.medical_record_number || r.patient_id}</div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2 max-w-md">
                                                <span className="truncate">{r.requested_procedure || r.procedure_name || '—'}</span>
                                                {r.procedure_count > 1 && (
                                                    <span className="badge badge-gray flex-shrink-0">
                                                        +{r.procedure_count - 1} more
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                                            {r.completed_at ? new Date(r.completed_at).toLocaleString() : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <StatusBadge status={r.status} showIcon={true} />
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <Link
                                                to={`/orders/${r.id}`}
                                                className="text-themed-primary hover:underline text-sm"
                                            >
                                                View Details
                                            </Link>
                                        </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    )
}
