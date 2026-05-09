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
                    <table className="table text-sm">
                        <thead>
                            <tr>
                                <th className="text-xs">#</th>
                                <th className="text-xs">Order Number</th>
                                <th className="text-xs">Patient Name</th>
                                <th className="text-xs">Procedure</th>
                                <th className="text-xs">Completed At</th>
                                <th className="text-xs">Status</th>
                                <th className="text-xs">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((r, index) => (
                                <tr key={r.id} className="text-xs">
                                    <td>{index + 1}</td>
                                    <td>{r.order_number || '—'}</td>
                                    <td>
                                        <div className="font-medium">{r.patient_name}</div>
                                        <div className="text-xs text-slate-500">{r.medical_record_number || r.patient_id}</div>
                                    </td>
                                    <td>
                                        <div className="flex items-center gap-2">
                                            <span>{r.requested_procedure || r.procedure_name || '—'}</span>
                                            {r.procedure_count > 1 && (
                                                <span className="badge badge-gray">
                                                    +{r.procedure_count - 1} more
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="text-sm">
                                        {r.completed_at ? new Date(r.completed_at).toLocaleString() : '—'}
                                    </td>
                                    <td><StatusBadge status={r.status} showIcon={true} /></td>
                                    <td className="text-center">
                                        <Link
                                            to={`/orders/${r.id}`}
                                            className="text-themed-primary hover:underline text-xs"
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
