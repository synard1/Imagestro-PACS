// src/components/intake/IntakeStatistics.jsx
// Enhanced statistics dashboard with charts

import { useMemo } from 'react';

export default function IntakeStatistics({ orders, statistics }) {
    // Calculate modality distribution
    const modalityStats = useMemo(() => {
        const counts = {};
        orders.forEach(order => {
            const modality = order.modality || 'Unknown';
            counts[modality] = (counts[modality] || 0) + 1;
        });
        return Object.entries(counts).map(([modality, count]) => ({
            modality,
            count,
            percentage: ((count / orders.length) * 100).toFixed(1)
        }));
    }, [orders]);

    // Calculate priority distribution
    const priorityStats = useMemo(() => {
        const counts = { stat: 0, urgent: 0, asap: 0, routine: 0 };
        orders.forEach(order => {
            const priority = order.priority || 'routine';
            counts[priority] = (counts[priority] || 0) + 1;
        });
        return counts;
    }, [orders]);

    // Calculate average wait time (mock for now)
    const avgWaitTime = useMemo(() => {
        // In real implementation, calculate from timestamps
        return '12 min';
    }, [orders]);

    const StatCard = ({ title, value, subtitle, icon, color, trend }) => (
        <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-start justify-between">
                <div className="flex-1">
                    <div className="text-sm text-gray-600 mb-1">{title}</div>
                    <div className={`text-3xl font-bold ${color}`}>{value}</div>
                    {subtitle && (
                        <div className="text-xs text-gray-500 mt-1">{subtitle}</div>
                    )}
                    {trend && (
                        <div className={`text-xs mt-2 flex items-center gap-1 ${trend > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            <span>{trend > 0 ? '↑' : '↓'}</span>
                            <span>{Math.abs(trend)}% from yesterday</span>
                        </div>
                    )}
                </div>
                <div className={`text-3xl ${color}`}>{icon}</div>
            </div>
        </div>
    );

    const ModalityBar = ({ modality, count, percentage, color }) => (
        <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-700">{modality}</span>
                <span className="text-sm text-gray-600">{count} ({percentage}%)</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                    className={`${color} h-2 rounded-full transition-all duration-500`}
                    style={{ width: `${percentage}%` }}
                />
            </div>
        </div>
    );

    const modalityColors = {
        CT: 'bg-blue-500',
        MRI: 'bg-purple-500',
        CR: 'bg-green-500',
        'X-Ray': 'bg-green-500',
        US: 'bg-yellow-500',
        Ultrasound: 'bg-yellow-500',
        Unknown: 'bg-gray-400'
    };

    return (
        <div className="space-y-6">
            {/* Main Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    title="Total Pending"
                    value={statistics.total_pending || 0}
                    subtitle="Awaiting action"
                    icon="📋"
                    color="text-blue-600"
                    trend={5}
                />
                <StatCard
                    title="Scheduled Today"
                    value={statistics.scheduled_today || 0}
                    subtitle="Appointments set"
                    icon="📅"
                    color="text-green-600"
                    trend={-2}
                />
                <StatCard
                    title="Awaiting Check-in"
                    value={statistics.awaiting_checkin || 0}
                    subtitle="Patients arrived"
                    icon="⏰"
                    color="text-orange-600"
                />
                <StatCard
                    title="Overdue"
                    value={statistics.overdue || 0}
                    subtitle="Needs attention"
                    icon="⚠️"
                    color="text-red-600"
                />
            </div>

            {/* Secondary Statistics */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Modality Distribution */}
                <div className="bg-white rounded-lg shadow p-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                        Modality Distribution
                    </h3>
                    {modalityStats.length > 0 ? (
                        <div>
                            {modalityStats.map(({ modality, count, percentage }) => (
                                <ModalityBar
                                    key={modality}
                                    modality={modality}
                                    count={count}
                                    percentage={percentage}
                                    color={modalityColors[modality] || modalityColors.Unknown}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="text-center text-gray-400 py-8">
                            No data available
                        </div>
                    )}
                </div>

                {/* Priority & Performance */}
                <div className="bg-white rounded-lg shadow p-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                        Priority & Performance
                    </h3>
                    <div className="space-y-4">
                        {/* Priority Breakdown */}
                        <div>
                            <div className="text-sm font-medium text-gray-700 mb-2">Priority Breakdown</div>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="bg-red-50 border border-red-200 rounded p-2">
                                    <div className="text-xs text-red-600 font-medium">STAT</div>
                                    <div className="text-xl font-bold text-red-700">{priorityStats.stat}</div>
                                </div>
                                <div className="bg-orange-50 border border-orange-200 rounded p-2">
                                    <div className="text-xs text-orange-600 font-medium">Urgent</div>
                                    <div className="text-xl font-bold text-orange-700">{priorityStats.urgent}</div>
                                </div>
                                <div className="bg-yellow-50 border border-yellow-200 rounded p-2">
                                    <div className="text-xs text-yellow-600 font-medium">ASAP</div>
                                    <div className="text-xl font-bold text-yellow-700">{priorityStats.asap}</div>
                                </div>
                                <div className="bg-gray-50 border border-gray-200 rounded p-2">
                                    <div className="text-xs text-gray-600 font-medium">Routine</div>
                                    <div className="text-xl font-bold text-gray-700">{priorityStats.routine}</div>
                                </div>
                            </div>
                        </div>

                        {/* Performance Metrics */}
                        <div>
                            <div className="text-sm font-medium text-gray-700 mb-2">Performance Metrics</div>
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-600">Avg Wait Time</span>
                                    <span className="text-sm font-semibold text-gray-900">{avgWaitTime}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-600">Throughput</span>
                                    <span className="text-sm font-semibold text-gray-900">
                                        {orders.length > 0 ? (orders.length / 8).toFixed(1) : '0'} patients/hour
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-600">Check-in Rate</span>
                                    <span className="text-sm font-semibold text-green-600">
                                        {statistics.scheduled_today > 0 
                                            ? ((statistics.awaiting_checkin / statistics.scheduled_today) * 100).toFixed(0)
                                            : '0'}%
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
