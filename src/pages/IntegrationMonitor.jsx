import React from 'react';
import HL7Dashboard from '../components/hl7/HL7Dashboard';
import HL7MessageLog from '../components/hl7/HL7MessageLog';

export default function IntegrationMonitor() {
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-900">Integration Monitor</h1>
                <div className="flex gap-2">
                    <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">HL7 v2.x</span>
                    <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">MLLP</span>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold mb-4">System Status</h2>
                <HL7Dashboard />
            </div>

            <div className="bg-white rounded-lg shadow p-6">
                <HL7MessageLog />
            </div>
        </div>
    );
}
