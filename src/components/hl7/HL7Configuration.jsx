import React, { useState, useEffect } from 'react';
import { getHL7Config, updateHL7Config } from '../../services/hl7Service';
import { notify } from '../../services/notifications';

export default function HL7Configuration() {
    const [config, setConfig] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = async () => {
        setLoading(true);
        try {
            const data = await getHL7Config();
            setConfig(data);
        } catch (error) {
            console.error('Failed to load HL7 config:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await updateHL7Config(config);
            notify({ type: 'success', message: 'HL7 Configuration saved' });
        } catch (error) {
            console.error('Failed to save HL7 config:', error);
        } finally {
            setSaving(false);
        }
    };

    const updateField = (field, value) => {
        setConfig(prev => ({ ...prev, [field]: value }));
    };

    if (loading) return <div>Loading...</div>;
    if (!config) return <div>Error loading config</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center border-b pb-4">
                <h2 className="text-lg font-semibold">HL7 MLLP Configuration</h2>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                    {saving ? 'Saving...' : 'Save Changes'}
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                    <h3 className="font-medium text-gray-900">Listener Settings</h3>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Enable Listener</label>
                        <div className="mt-1">
                            <label className="inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={config.enabled}
                                    onChange={e => updateField('enabled', e.target.checked)}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Port</label>
                        <input
                            type="number"
                            value={config.mllpPort}
                            onChange={e => updateField('mllpPort', parseInt(e.target.value))}
                            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        />
                        <p className="mt-1 text-xs text-gray-500">Standard HL7 port is 2575.</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Encoding</label>
                        <select
                            value={config.encoding}
                            onChange={e => updateField('encoding', e.target.value)}
                            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        >
                            <option value="UTF-8">UTF-8</option>
                            <option value="ASCII">ASCII</option>
                            <option value="ISO-8859-1">ISO-8859-1 (Latin-1)</option>
                        </select>
                    </div>

                    <div>
                        <label className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={config.autoAck}
                                onChange={e => updateField('autoAck', e.target.checked)}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm font-medium text-gray-700">Auto-Acknowledge (AA)</span>
                        </label>
                        <p className="mt-1 text-xs text-gray-500 ml-6">Automatically send ACK upon receipt.</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <h3 className="font-medium text-gray-900">Remote Destinations (ORU)</h3>
                    <p className="text-sm text-gray-500">Configure where to send Observation Results (ORU).</p>

                    <div className="border rounded-lg overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">IP:Port</th>
                                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {config.remoteDestinations.map((dest, idx) => (
                                    <tr key={idx}>
                                        <td className="px-3 py-2 text-sm">{dest.name}</td>
                                        <td className="px-3 py-2 text-sm font-mono">{dest.ip}:{dest.port}</td>
                                        <td className="px-3 py-2 text-right text-sm">
                                            <button className="text-red-600 hover:text-red-800">Remove</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="p-2 bg-gray-50 border-t">
                            <button className="text-sm text-blue-600 font-medium">+ Add Destination</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
