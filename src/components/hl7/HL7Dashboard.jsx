import React, { useState, useEffect } from 'react';
import { getHL7Status } from '../../services/hl7Service';

export default function HL7Dashboard() {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);

    const loadStats = async () => {
        setLoading(true);
        try {
            const data = await getHL7Status();
            setStats(data);
        } catch (error) {
            console.error('Failed to load HL7 stats:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadStats();
        const interval = setInterval(loadStats, 30000); // Refresh every 30s
        return () => clearInterval(interval);
    }, []);

    if (loading && !stats) return <div className="p-4 text-gray-500">Loading dashboard...</div>;
    if (!stats) return <div className="p-4 text-red-500">Failed to load dashboard</div>;

    const isUp = stats.status === 'UP';

    return (
        <div className="space-y-6">
            {/* Status Banner */}
            <div className={`p-4 rounded-lg border flex items-center justify-between ${isUp ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded-full ${isUp ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                    <div>
                        <h3 className={`font-bold ${isUp ? 'text-green-800' : 'text-red-800'}`}>
                            MLLP Listener is {stats.status}
                        </h3>
                        <p className={`text-sm ${isUp ? 'text-green-600' : 'text-red-600'}`}>
                            Uptime: {stats.uptime}
                        </p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-sm text-gray-500">Port</p>
                    <p className="font-mono font-bold text-gray-700">{stats.listenerPort || 2575}</p>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <KPICard
                    label="Messages Today"
                    value={stats.messagesToday}
                    icon="📨"
                    color="blue"
                />
                <KPICard
                    label="Errors / NACKs"
                    value={stats.errorsToday}
                    icon="⚠️"
                    color={stats.errorsToday > 0 ? 'red' : 'gray'}
                />
                <KPICard
                    label="Avg Processing Time"
                    value={`${stats.avgProcessingTimeMs} ms`}
                    icon="⚡"
                    color="purple"
                />
            </div>
        </div>
    );
}

function KPICard({ label, value, icon, color }) {
    const colors = {
        blue: 'bg-blue-50 text-blue-700 border-blue-100',
        red: 'bg-red-50 text-red-700 border-red-100',
        gray: 'bg-gray-50 text-gray-700 border-gray-100',
        purple: 'bg-purple-50 text-purple-700 border-purple-100',
        green: 'bg-green-50 text-green-700 border-green-100',
    };

    return (
        <div className={`p-4 rounded-lg border ${colors[color] || colors.gray}`}>
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-sm opacity-80">{label}</p>
                    <p className="text-2xl font-bold mt-1">{value}</p>
                </div>
                <div className="text-2xl">{icon}</div>
            </div>
        </div>
    );
}
