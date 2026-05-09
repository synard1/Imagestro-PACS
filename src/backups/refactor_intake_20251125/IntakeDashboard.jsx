// src/pages/pacs/intake/IntakeDashboard.jsx
// Order Intake & Scheduling Dashboard for Admin Radiologi

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../../components/ToastProvider';
import intakeService from '../../../services/intakeService';

export default function IntakeDashboard() {
    const navigate = useNavigate();
    const toast = useToast();

    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statistics, setStatistics] = useState({
        total_pending: 0,
        scheduled_today: 0,
        awaiting_checkin: 0,
        overdue: 0
    });
    const [filters, setFilters] = useState({
        status: 'created',
        date_from: '',
        date_to: '',
        modality: '',
        priority: '',
        patient_name: ''
    });

    useEffect(() => {
        loadOrders();
        loadStatistics();
    }, [filters]);

    const loadOrders = async () => {
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
    };

    const loadStatistics = async () => {
        try {
            const stats = await intakeService.getIntakeStatistics();
            setStatistics(stats);
        } catch (error) {
            console.error('Failed to load statistics:', error);
        }
    };

    const handleSchedule = (orderId) => {
        navigate(`/pacs/intake/schedule/${orderId}`);
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
        <div className="p-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Order Intake & Scheduling</h1>
                    <p className="text-gray-600 mt-1">Manage incoming orders and patient scheduling</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => {
                            loadOrders();
                            loadStatistics();
                            toast.notify({ type: 'info', message: 'Refreshing data...' });
                        }}
                        className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                        title="Refresh Data"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                    <button
                        onClick={() => navigate('/orders/new')}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span>Manual Order</span>
                    </button>
                </div>
            </div>

            {/* Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-white rounded-lg shadow p-6">
                    <div className="text-sm text-gray-500">Pending Orders</div>
                    <div className="text-3xl font-bold text-gray-900 mt-2">{statistics.total_pending}</div>
                </div>
                <div className="bg-white rounded-lg shadow p-6">
                    <div className="text-sm text-gray-500">Scheduled Today</div>
                    <div className="text-3xl font-bold text-blue-600 mt-2">{statistics.scheduled_today}</div>
                </div>
                <div className="bg-white rounded-lg shadow p-6">
                    <div className="text-sm text-gray-500">Awaiting Check-in</div>
                    <div className="text-3xl font-bold text-green-600 mt-2">{statistics.awaiting_checkin}</div>
                </div>
                <div className="bg-white rounded-lg shadow p-6">
                    <div className="text-sm text-gray-500">Overdue</div>
                    <div className="text-3xl font-bold text-red-600 mt-2">{statistics.overdue}</div>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-lg shadow p-4 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <input
                        type="text"
                        placeholder="Patient Name"
                        className="px-3 py-2 border rounded-lg"
                        value={filters.patient_name}
                        onChange={(e) => setFilters({ ...filters, patient_name: e.target.value })}
                    />
                    <select
                        className="px-3 py-2 border rounded-lg"
                        value={filters.status}
                        onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                    >
                        <option value="">All Statuses</option>
                        <option value="created">Created</option>
                        <option value="scheduled">Scheduled</option>
                        <option value="arrived">Arrived</option>
                    </select>
                    <select
                        className="px-3 py-2 border rounded-lg"
                        value={filters.modality}
                        onChange={(e) => setFilters({ ...filters, modality: e.target.value })}
                    >
                        <option value="">All Modalities</option>
                        <option value="CT">CT</option>
                        <option value="MRI">MRI</option>
                        <option value="CR">CR/X-Ray</option>
                        <option value="US">Ultrasound</option>
                    </select>
                    <select
                        className="px-3 py-2 border rounded-lg"
                        value={filters.priority}
                        onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
                    >
                        <option value="">All Priorities</option>
                        <option value="stat">STAT</option>
                        <option value="urgent">Urgent</option>
                        <option value="asap">ASAP</option>
                        <option value="routine">Routine</option>
                    </select>
                    <input
                        type="date"
                        className="px-3 py-2 border rounded-lg"
                        value={filters.date_from}
                        onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}
                    />
                    <button
                        onClick={() => setFilters({
                            status: '',
                            date_from: '',
                            date_to: '',
                            modality: '',
                            priority: '',
                            patient_name: ''
                        })}
                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                    >
                        Clear Filters
                    </button>
                </div>
            </div>

            {/* Orders List */}
            <div className="bg-white rounded-lg shadow">
                {loading ? (
                    <div className="p-8 text-center text-gray-500">Loading orders...</div>
                ) : orders.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">No orders found</div>
                ) : (
                    <div className="divide-y">
                        {orders.map((order) => (
                            <div key={order.id} className="p-6 hover:bg-gray-50">
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <h3 className="text-lg font-semibold text-gray-900">
                                                {order.patient_name}
                                            </h3>
                                            <span className={`px-2 py-1 rounded text-xs font-medium ${getPriorityBadgeColor(order.priority)}`}>
                                                {order.priority?.toUpperCase() || 'ROUTINE'}
                                            </span>
                                            <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusBadgeColor(order.status)}`}>
                                                {order.status?.toUpperCase()}
                                            </span>
                                        </div>
                                        <div className="text-sm text-gray-600 space-y-1">
                                            <div>Order #: {order.order_number}</div>
                                            <div>MRN: {order.medical_record_number || order.patient_id}</div>
                                            <div>Procedure: {order.procedure_name}</div>
                                            <div>Modality: {order.modality}</div>
                                            {order.scheduled_at && (
                                                <div>Scheduled: {new Date(order.scheduled_at).toLocaleString()}</div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        {order.status === 'created' && (
                                            <button
                                                onClick={() => handleSchedule(order.id)}
                                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                            >
                                                Schedule
                                            </button>
                                        )}
                                        {order.status === 'scheduled' && (
                                            <button
                                                onClick={() => handleCheckIn(order.id, order.procedure_id)}
                                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                                            >
                                                Check In
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
