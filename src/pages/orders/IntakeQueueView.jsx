// src/pages/orders/IntakeQueueView.jsx
// Extracted from IntakeDashboard.jsx for Orders tab integration

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../components/ToastProvider';
import intakeService from '../../services/intakeService';
import QueueBoard from '../../components/intake/QueueBoard';
import IntakeStatistics from '../../components/intake/IntakeStatistics';
import Icon from '../../components/common/Icon';
import StatusBadge from '../../components/StatusBadge';
import PermissionGate from '../../components/common/PermissionGate';

export default function IntakeQueueView() {
    const navigate = useNavigate();
    const toast = useToast();

    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedOrders, setSelectedOrders] = useState([]);
    const [viewMode, setViewMode] = useState('table'); // 'table' or 'board'
    const [statistics, setStatistics] = useState({
        total_pending: 0,
        scheduled_today: 0,
        awaiting_checkin: 0,
        overdue: 0
    });
    const [filters, setFilters] = useState({
        status: '',  // Empty = show all intake statuses (created, scheduled, arrived)
        date_from: '',
        date_to: '',
        modality: '',
        priority: '',
        patient_name: ''
    });

    const loadOrders = useCallback(async () => {
        try {
            setLoading(true);
            const data = await intakeService.getIncomingOrders(filters);
            setOrders(data);
        } catch (error) {
            toast.notify({
                type: 'error',
                message: `Failed to load orders: ${error.message}`
            });
        } finally {
            setLoading(false);
        }
    }, [filters, toast]);

    const loadStatistics = useCallback(async () => {
        try {
            const stats = await intakeService.getIntakeStatistics();
            setStatistics(stats);
        } catch (error) {
            console.error('Failed to load statistics:', error);
        }
    }, []);

    // Load orders only when filters change
    useEffect(() => {
        loadOrders();
    }, [loadOrders]);

    // Load statistics on component mount
    useEffect(() => {
        loadStatistics();
    }, [loadStatistics]);

    const handleRefresh = () => {
        loadOrders();
        loadStatistics();
    };

    const handleSchedule = (orderId) => {
        navigate(`/orders/${orderId}`);
    };

    const handleCheckIn = async (orderId, procedureId) => {
        try {
            await intakeService.checkInProcedure(procedureId);
            toast.notify({
                type: 'success',
                message: 'Patient checked in successfully'
            });
            loadOrders();
        } catch (error) {
            toast.notify({
                type: 'error',
                message: `Check-in failed: ${error.message}`
            });
        }
    };

    // Batch operations
    const handleSelectAll = (e) => {
        if (e.target.checked) {
            setSelectedOrders(orders.map(o => o.id));
        } else {
            setSelectedOrders([]);
        }
    };

    const handleSelectOrder = (orderId) => {
        setSelectedOrders(prev => {
            if (prev.includes(orderId)) {
                return prev.filter(id => id !== orderId);
            } else {
                return [...prev, orderId];
            }
        });
    };

    const handleBatchCheckIn = async () => {
        if (selectedOrders.length === 0) {
            toast.notify({ type: 'warning', message: 'Please select orders to check-in' });
            return;
        }

        if (!confirm(`Check-in ${selectedOrders.length} patient(s)?`)) return;

        try {
            const results = await Promise.allSettled(
                selectedOrders.map(orderId => {
                    const order = orders.find(o => o.id === orderId);
                    return intakeService.checkInProcedure(order.procedures?.[0]?.id);
                })
            );

            const succeeded = results.filter(r => r.status === 'fulfilled').length;
            const failed = results.filter(r => r.status === 'rejected').length;

            if (succeeded > 0) {
                toast.notify({
                    type: 'success',
                    message: `${succeeded} patient(s) checked in successfully${failed > 0 ? `, ${failed} failed` : ''}`
                });
            }

            setSelectedOrders([]);
            loadOrders();
        } catch (error) {
            toast.notify({ type: 'error', message: `Batch check-in failed: ${error.message}` });
        }
    };

    const handleBatchSchedule = () => {
        if (selectedOrders.length === 0) {
            toast.notify({ type: 'warning', message: 'Please select orders to schedule' });
            return;
        }
        // Navigate to batch scheduling page (to be implemented)
        navigate(`/orders/batch-schedule?ids=${selectedOrders.join(',')}`);
    };

    const handleOrderClick = (order) => {
        navigate(`/orders/${order.id}`);
    };

    const handleStatusChange = async (orderId, newStatus) => {
        try {
            await intakeService.updateOrderStatus(orderId, newStatus);
            toast.notify({
                type: 'success',
                message: `Order status updated to ${newStatus}`
            });
            loadOrders();
        } catch (error) {
            toast.notify({
                type: 'error',
                message: `Failed to update status: ${error.message}`
            });
        }
    };

    const getStatusBadgeColor = (status) => {
        const colors = {
            created: 'bg-gray-100 text-gray-800',
            scheduled: 'bg-blue-100 text-blue-800',
            arrived: 'bg-green-100 text-green-800',
            in_progress: 'bg-yellow-100 text-yellow-800',
            completed: 'bg-purple-100 text-purple-800'
        };
        return colors[status] || 'bg-gray-100 text-gray-800';
    };

    const getPriorityBadgeColor = (priority) => {
        const colors = {
            stat: 'bg-red-100 text-red-800',
            urgent: 'bg-orange-100 text-orange-800',
            asap: 'bg-yellow-100 text-yellow-800',
            routine: 'bg-gray-100 text-gray-800'
        };
        return colors[priority] || 'bg-gray-100 text-gray-800';
    };

    return (
        <div>
            {/* Enhanced Statistics */}
            <IntakeStatistics orders={orders} statistics={statistics} />

            {/* Batch Actions Bar */}
            {selectedOrders.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <span className="text-slate-700 font-medium">
                                {selectedOrders.length} order(s) selected
                            </span>
                            <button
                                onClick={() => setSelectedOrders([])}
                                className="text-themed-primary hover:underline text-sm"
                            >
                                Clear selection
                            </button>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={handleBatchSchedule}
                                className="btn-themed-primary flex items-center gap-2"
                            >
                                <Icon name="calendar" className="w-4 h-4" />
                                Batch Schedule
                            </button>
                            <button
                                onClick={handleBatchCheckIn}
                                className="btn-themed-primary flex items-center gap-2"
                            >
                                <Icon name="checkCircle" className="w-4 h-4" />
                                Batch Check-in
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Filters & View Toggle */}
            <div className="bg-white rounded-lg shadow p-4 mb-4 mt-6">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex gap-2">
                        <button
                            onClick={() => setViewMode('table')}
                            className={`btn-themed-secondary flex items-center gap-2 ${viewMode === 'table' ? 'bg-themed-accent-light text-themed-primary' : ''}`}
                        >
                            <Icon name="table" className="w-4 h-4" />
                            Table View
                        </button>
                        <button
                            onClick={() => setViewMode('board')}
                            className={`btn-themed-secondary flex items-center gap-2 ${viewMode === 'board' ? 'bg-themed-accent-light text-themed-primary' : ''}`}
                        >
                            <Icon name="grid" className="w-4 h-4" />
                            Queue Board
                        </button>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleRefresh}
                            disabled={loading}
                            className="btn-themed-secondary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Icon name="refresh" className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                          {loading ? 'Refreshing...' : 'Refresh'}
                        </button>
                        <PermissionGate perm="order.create">
                          <button
                              onClick={() => navigate('/orders/new')}
                              className="btn-themed-primary flex items-center gap-2"
                          >
                            <Icon name="plus" className="w-4 h-4" />
                            New Order
                          </button>
                        </PermissionGate>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <input
                        type="text"
                        placeholder="Search patient name..."
                        className="input-themed"
                        value={filters.patient_name}
                        onChange={(e) => setFilters({ ...filters, patient_name: e.target.value })}
                    />
                    <select
                        className="select-themed"
                        value={filters.status}
                        onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                    >
                        <option value="">All Status</option>
                        <option value="created">Created</option>
                        <option value="scheduled">Scheduled</option>
                        <option value="arrived">Arrived</option>
                    </select>
                    <select
                        className="select-themed"
                        value={filters.priority}
                        onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
                    >
                        <option value="">All Priority</option>
                        <option value="stat">STAT</option>
                        <option value="urgent">Urgent</option>
                        <option value="routine">Routine</option>
                    </select>
                </div>
            </div>

            {/* Orders View - Table or Board */}
            {loading ? (
                <div className="bg-white rounded-lg shadow p-8 text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading orders...</p>
                </div>
            ) : orders.length === 0 ? (
                <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
                    No orders found in intake queue
                </div>
            ) : viewMode === 'board' ? (
                <QueueBoard
                    orders={orders}
                    onOrderClick={handleOrderClick}
                    onStatusChange={handleStatusChange}
                />
            ) : (
                <div className="bg-white rounded-lg shadow overflow-hidden">
                    {selectedOrders.length === 0 && (
                        <div className="p-4 bg-slate-50 border-b text-sm text-slate-600 flex items-center gap-2">
                            <Icon name="lightbulb" className="w-4 h-4 text-amber-500" />
                            Tip: Select multiple orders to use batch operations
                        </div>
                    )}
                    <div>
                    <div className="overflow-x-auto">
                        <table className="table w-full">
                            <thead className="bg-slate-50 border-b-2 border-slate-200 sticky top-0 z-10">
                                <tr>
                                    <th className="px-4 py-3 w-12 text-center">
                                        <input
                                            type="checkbox"
                                            checked={selectedOrders.length === orders.length && orders.length > 0}
                                            onChange={handleSelectAll}
                                            className="rounded border-gray-300"
                                        />
                                    </th>
                                    <th className="text-sm font-semibold text-slate-700 px-4 py-3 text-left">Order #</th>
                                    <th className="text-sm font-semibold text-slate-700 px-4 py-3 text-left">Patient</th>
                                    <th className="text-sm font-semibold text-slate-700 px-4 py-3 text-left">Procedure</th>
                                    <th className="text-sm font-semibold text-slate-700 px-4 py-3 text-left">Scheduled</th>
                                    <th className="text-sm font-semibold text-slate-700 px-4 py-3 text-center">Priority</th>
                                    <th className="text-sm font-semibold text-slate-700 px-4 py-3 text-center">Status</th>
                                    <th className="text-sm font-semibold text-slate-700 px-4 py-3 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {orders.map((order) => (
                                    <tr key={order.id} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${order._offline ? 'bg-amber-50 border-l-4 border-amber-400' : ''}`}>
                                        <td className="px-4 py-3 text-center">
                                        <input
                                            type="checkbox"
                                            checked={selectedOrders.includes(order.id)}
                                            onChange={() => handleSelectOrder(order.id)}
                                            className="rounded border-gray-300"
                                        />
                                    </td>
                                    <td className="px-4 py-3 font-medium">
                                        {order.order_number}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="font-medium text-slate-900">{order.patient_name}</div>
                                        <div className="text-[11px] text-slate-500 mt-0.5">{order.medical_record_number}</div>
                                    </td>
                                    <td className="px-4 py-3">
                                        {order.procedure_name || order.requested_procedure}
                                        {order.procedure_count > 1 && (
                                            <span className="ml-2 badge badge-gray flex-shrink-0">
                                                +{order.procedure_count - 1} more
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                                        {order.scheduled_at ? new Date(order.scheduled_at).toLocaleString() : '-'}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={`badge ${order.priority === 'stat' || order.priority === 'urgent' ? 'badge-red' : order.priority === 'asap' ? 'badge-yellow' : 'badge-gray'}`}>
                                            {order.priority?.toUpperCase() || 'ROUTINE'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <StatusBadge status={order.status} />
                                    </td>
                                    <td className="px-4 py-3 text-center font-medium space-x-2">
                                        {order.status === 'created' && (
                                            <button
                                                onClick={() => handleSchedule(order.id)}
                                                className="text-themed-primary hover:underline"
                                            >
                                                Schedule
                                            </button>
                                        )}
                                        {order.status === 'scheduled' && (
                                            <button
                                                onClick={() => handleCheckIn(order.id, order.procedures?.[0]?.id)}
                                                className="text-green-600 hover:text-green-700"
                                            >
                                                Check-in
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    </div>
                </div>
            )}
        </div>
    )
}
