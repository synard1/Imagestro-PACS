// src/pages/pacs/intake/IntakeSchedule.jsx
// Schedule page for Order Intake module

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../../../components/ToastProvider';
import orderService from '../../../services/orderService';
import intakeService from '../../../services/intakeService';

export default function IntakeSchedule() {
    const { id } = useParams();
    const navigate = useNavigate();
    const toast = useToast();

    const [order, setOrder] = useState(null);
    const [procedures, setProcedures] = useState([]);
    const [loading, setLoading] = useState(true);
    const [scheduleData, setScheduleData] = useState({});

    useEffect(() => {
        loadOrder();
    }, [id]);

    // Helper function to convert ISO datetime to datetime-local format
    const formatDateTimeForInput = (dateTimeString) => {
        if (!dateTimeString) return '';
        try {
            const date = new Date(dateTimeString);
            if (isNaN(date.getTime())) return '';
            // Format: YYYY-MM-DDTHH:mm (required for datetime-local input)
            return date.toISOString().slice(0, 16);
        } catch (e) {
            console.error('Error formatting datetime:', e);
            return '';
        }
    };

    const loadOrder = async () => {
        try {
            setLoading(true);
            const orderData = await orderService.getOrder(id);
            console.log('[IntakeSchedule] Loaded order:', orderData);
            setOrder(orderData);

            // Load procedures for this order
            const proceduresData = orderData.procedures || [];
            console.log('[IntakeSchedule] Procedures:', proceduresData);
            setProcedures(proceduresData);

            // Initialize schedule data for each procedure
            const initialSchedule = {};
            proceduresData.forEach(proc => {
                const formattedDateTime = formatDateTimeForInput(proc.scheduled_at);
                console.log(`[IntakeSchedule] Procedure ${proc.id}: scheduled_at=${proc.scheduled_at} -> formatted=${formattedDateTime}`);
                initialSchedule[proc.id || proc.code] = {
                    scheduled_at: formattedDateTime,
                    modality: proc.modality || ''
                };
            });
            console.log('[IntakeSchedule] Initial schedule data:', initialSchedule);
            setScheduleData(initialSchedule);
        } catch (error) {
            console.error('[IntakeSchedule] Failed to load order:', error);
            toast.notify({
                type: 'error',
                message: `Failed to load order: ${error.message}`
            });
            navigate('/orders?tab=intake');
        } finally {
            setLoading(false);
        }
    };

    const handleScheduleChange = (procedureId, field, value) => {
        setScheduleData(prev => ({
            ...prev,
            [procedureId]: {
                ...prev[procedureId],
                [field]: value
            }
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        try {
            // Schedule each procedure
            for (const proc of procedures) {
                const procId = proc.id || proc.code;
                const schedule = scheduleData[procId];

                if (schedule && schedule.scheduled_at) {
                    await intakeService.scheduleProcedure(procId, schedule);
                }
            }

            toast.notify({
                type: 'success',
                message: 'Order scheduled successfully'
            });
            navigate('/orders?tab=intake');
        } catch (error) {
            toast.notify({
                type: 'error',
                message: `Failed to schedule order: ${error.message}`
            });
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Loading order...</p>
                </div>
            </div>
        );
    }

    if (!order) {
        return (
            <div className="p-6">
                <div className="bg-red-50 border border-red-200 rounded p-4">
                    <p className="text-red-800">Order not found</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6">
            <div className="mb-6">
                <h1 className="text-2xl font-bold">Schedule Order</h1>
                <p className="text-gray-600 mt-1">Order #{order.order_number}</p>
            </div>

            <div className="bg-white rounded-lg shadow p-6 mb-6">
                <h2 className="text-lg font-semibold mb-4">Patient Information</h2>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-sm text-gray-600">Patient Name</label>
                        <p className="font-medium">{order.patient_name}</p>
                    </div>
                    <div>
                        <label className="text-sm text-gray-600">MRN</label>
                        <p className="font-medium">{order.medical_record_number || order.patient_id || '-'}</p>
                    </div>
                </div>
            </div>

            <form onSubmit={handleSubmit}>
                <div className="bg-white rounded-lg shadow p-6 mb-6">
                    <h2 className="text-lg font-semibold mb-4">Schedule Procedures</h2>

                    {procedures.length === 0 ? (
                        <p className="text-gray-500">No procedures found for this order</p>
                    ) : (
                        <div className="space-y-4">
                            {procedures.map((proc, index) => {
                                const procId = proc.id || proc.code;
                                return (
                                    <div key={procId} className="border rounded p-4">
                                        <h3 className="font-medium mb-3">
                                            {index + 1}. {proc.name || proc.procedure_name}
                                        </h3>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Scheduled Date & Time *
                                                </label>
                                                <input
                                                    type="datetime-local"
                                                    className="w-full border rounded px-3 py-2"
                                                    value={scheduleData[procId]?.scheduled_at || ''}
                                                    onChange={(e) => handleScheduleChange(procId, 'scheduled_at', e.target.value)}
                                                    required
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Modality
                                                </label>
                                                <input
                                                    type="text"
                                                    className="w-full border rounded px-3 py-2 bg-gray-50"
                                                    value={proc.modality}
                                                    readOnly
                                                />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="flex gap-3">
                    <button
                        type="submit"
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                        disabled={procedures.length === 0}
                    >
                        Schedule Order
                    </button>
                    <button
                        type="button"
                        onClick={() => navigate('/orders?tab=intake')}
                        className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                    >
                        Cancel
                    </button>
                </div>
            </form>
        </div>
    );
}
