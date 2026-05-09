// src/components/intake/QueueBoard.jsx
// Visual queue board with drag-and-drop support

import { useState } from 'react';

export default function QueueBoard({ orders, onOrderClick, onStatusChange }) {
    const [draggedOrder, setDraggedOrder] = useState(null);

    // Group orders by status
    const groupedOrders = {
        waiting: orders.filter(o => o.status === 'created'),
        scheduled: orders.filter(o => o.status === 'scheduled'),
        arrived: orders.filter(o => o.status === 'arrived'),
        in_progress: orders.filter(o => o.status === 'in_progress')
    };

    const handleDragStart = (e, order) => {
        setDraggedOrder(order);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (e, newStatus) => {
        e.preventDefault();
        if (draggedOrder && draggedOrder.status !== newStatus) {
            onStatusChange(draggedOrder.id, newStatus);
        }
        setDraggedOrder(null);
    };

    const getPriorityColor = (priority) => {
        const colors = {
            stat: 'border-l-4 border-red-500 bg-red-50',
            urgent: 'border-l-4 border-orange-500 bg-orange-50',
            asap: 'border-l-4 border-yellow-500 bg-yellow-50',
            routine: 'border-l-4 border-gray-300 bg-white'
        };
        return colors[priority] || colors.routine;
    };

    const QueueColumn = ({ title, status, orders, icon, color }) => (
        <div className="flex-1 min-w-[280px]">
            <div className={`${color} rounded-t-lg p-3 font-semibold text-white flex items-center justify-between`}>
                <div className="flex items-center gap-2">
                    <span>{icon}</span>
                    <span>{title}</span>
                </div>
                <span className="bg-white bg-opacity-30 px-2 py-1 rounded-full text-sm">
                    {orders.length}
                </span>
            </div>
            <div
                className="bg-gray-50 rounded-b-lg p-3 min-h-[400px] space-y-2"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, status)}
            >
                {orders.length === 0 ? (
                    <div className="text-center text-gray-400 py-8">
                        No patients
                    </div>
                ) : (
                    orders.map((order) => (
                        <div
                            key={order.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, order)}
                            onClick={() => onOrderClick(order)}
                            className={`${getPriorityColor(order.priority)} p-3 rounded-lg shadow-sm cursor-move hover:shadow-md transition-shadow`}
                        >
                            <div className="flex items-start justify-between mb-2">
                                <div className="font-semibold text-gray-900">
                                    {order.patient_name}
                                </div>
                                {order.priority === 'stat' && (
                                    <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                                        STAT
                                    </span>
                                )}
                                {order.priority === 'urgent' && (
                                    <span className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                                        URGENT
                                    </span>
                                )}
                            </div>
                            <div className="text-sm text-gray-600 space-y-1">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium">{order.modality}</span>
                                    <span>•</span>
                                    <span>{order.procedure_name}</span>
                                </div>
                                <div className="text-xs text-gray-500">
                                    MRN: {order.medical_record_number || order.mrn}
                                </div>
                                {order.scheduled_at && (
                                    <div className="text-xs text-blue-600 flex items-center gap-1">
                                        <span>🕐</span>
                                        <span>{new Date(order.scheduled_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );

    return (
        <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Queue Board</h2>
                <div className="text-sm text-gray-500">
                    Drag cards to change status
                </div>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-4">
                <QueueColumn
                    title="Waiting"
                    status="created"
                    orders={groupedOrders.waiting}
                    icon="⏳"
                    color="bg-gray-600"
                />
                <QueueColumn
                    title="Scheduled"
                    status="scheduled"
                    orders={groupedOrders.scheduled}
                    icon="📅"
                    color="bg-blue-600"
                />
                <QueueColumn
                    title="Arrived"
                    status="arrived"
                    orders={groupedOrders.arrived}
                    icon="✅"
                    color="bg-green-600"
                />
                <QueueColumn
                    title="In Progress"
                    status="in_progress"
                    orders={groupedOrders.in_progress}
                    icon="🔄"
                    color="bg-yellow-600"
                />
            </div>
        </div>
    );
}
