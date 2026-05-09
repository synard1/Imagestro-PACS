import React, { useState, useEffect } from 'react';
import { getMWLConfig, updateMWLConfig, getDefaultMWLConfig } from '../../services/mwlConfigService';
import { notify } from '../../services/notifications';

export default function MWLConfiguration() {
    const [config, setConfig] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('service'); // service, query, behavior, aetitles

    useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = async () => {
        setLoading(true);
        try {
            const data = await getMWLConfig();
            setConfig(data);
        } catch (error) {
            console.error('Error loading MWL config:', error);
            notify({ type: 'error', message: 'Failed to load MWL configuration' });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await updateMWLConfig(config);
            notify({ type: 'success', message: 'MWL Configuration saved' });
        } catch (error) {
            console.error('Error saving MWL config:', error);
            notify({ type: 'error', message: 'Failed to save configuration' });
        } finally {
            setSaving(false);
        }
    };

    const handleReset = () => {
        if (window.confirm('Are you sure you want to reset to default settings?')) {
            setConfig(getDefaultMWLConfig());
        }
    };

    const updateField = (section, field, value) => {
        setConfig(prev => ({
            ...prev,
            [section]: {
                ...prev[section],
                [field]: value
            }
        }));
    };

    const updateRootField = (field, value) => {
        setConfig(prev => ({
            ...prev,
            [field]: value
        }));
    };

    // AE Title Management
    const addAETitle = () => {
        const newAE = { aeTitle: 'NEW_AE', description: 'New Node', ip: '0.0.0.0' };
        setConfig(prev => ({
            ...prev,
            allowedAETitles: [...prev.allowedAETitles, newAE]
        }));
    };

    const removeAETitle = (index) => {
        setConfig(prev => ({
            ...prev,
            allowedAETitles: prev.allowedAETitles.filter((_, i) => i !== index)
        }));
    };

    const updateAETitle = (index, field, value) => {
        const newAEs = [...config.allowedAETitles];
        newAEs[index] = { ...newAEs[index], [field]: value };
        setConfig(prev => ({
            ...prev,
            allowedAETitles: newAEs
        }));
    };

    if (loading) return <div className="p-8 text-center text-gray-500">Loading configuration...</div>;
    if (!config) return <div className="p-8 text-center text-red-500">Failed to load configuration</div>;

    return (
        <div className="bg-white rounded-lg shadow border border-gray-200">
            <div className="border-b border-gray-200 px-6 py-4 flex justify-between items-center">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">Modality Worklist (MWL) SCP</h2>
                    <p className="text-sm text-gray-500">Configure the DICOM Modality Worklist Provider service.</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleReset}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                        Reset Defaults
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                        {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>

            <div className="flex border-b border-gray-200">
                <TabButton id="service" label="Service Settings" icon="⚙️" active={activeTab} onClick={setActiveTab} />
                <TabButton id="query" label="Query Rules" icon="🔍" active={activeTab} onClick={setActiveTab} />
                <TabButton id="behavior" label="Worklist Behavior" icon="📋" active={activeTab} onClick={setActiveTab} />
                <TabButton id="aetitles" label="Allowed AE Titles" icon="🛡️" active={activeTab} onClick={setActiveTab} />
            </div>

            <div className="p-6">
                {activeTab === 'service' && (
                    <div className="space-y-6 max-w-2xl">
                        <div className="grid grid-cols-1 gap-6">
                            <InputField
                                label="Calling AE Title"
                                value={config.aeTitle}
                                onChange={v => updateRootField('aeTitle', v)}
                                help="The AE Title this SCP identifies as."
                            />
                            <InputField
                                label="Port"
                                type="number"
                                value={config.port}
                                onChange={v => updateRootField('port', parseInt(v))}
                                help="The TCP port to listen on (requires restart)."
                            />
                            <InputField
                                label="Max Associations"
                                type="number"
                                value={config.maxAssociations}
                                onChange={v => updateRootField('maxAssociations', parseInt(v))}
                                help="Maximum concurrent connections allowed."
                            />
                            <InputField
                                label="Connection Timeout (ms)"
                                type="number"
                                value={config.connectionTimeout}
                                onChange={v => updateRootField('connectionTimeout', parseInt(v))}
                                help="Time to wait before dropping idle connections."
                            />
                        </div>
                    </div>
                )}

                {activeTab === 'query' && (
                    <div className="space-y-6 max-w-2xl">
                        <div className="grid grid-cols-1 gap-6">
                            <InputField
                                label="Default Character Set"
                                value={config.querySettings.defaultCharacterSet}
                                onChange={v => updateField('querySettings', 'defaultCharacterSet', v)}
                                help="DICOM Character Set (e.g., ISO_IR 100)."
                            />
                            <ToggleField
                                label="Fuzzy Matching"
                                checked={config.querySettings.fuzzyMatching}
                                onChange={v => updateField('querySettings', 'fuzzyMatching', v)}
                                help="Enable fuzzy matching for patient names."
                            />
                            <ToggleField
                                label="Wildcard Matching"
                                checked={config.querySettings.wildcardMatching}
                                onChange={v => updateField('querySettings', 'wildcardMatching', v)}
                                help="Allow * and ? wildcards in queries."
                            />
                            <InputField
                                label="Max Query Results"
                                type="number"
                                value={config.querySettings.maxQueryResults}
                                onChange={v => updateField('querySettings', 'maxQueryResults', parseInt(v))}
                                help="Limit the number of responses to prevent overload."
                            />
                            <ToggleField
                                label="Truncate Results"
                                checked={config.querySettings.truncateResults}
                                onChange={v => updateField('querySettings', 'truncateResults', v)}
                                help="If true, returns partial results up to limit. If false, returns error on overflow."
                            />
                        </div>
                    </div>
                )}

                {activeTab === 'behavior' && (
                    <div className="space-y-6 max-w-2xl">
                        <div className="grid grid-cols-1 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Default Date Range</label>
                                <select
                                    value={config.worklistBehavior.defaultDateRange}
                                    onChange={e => updateField('worklistBehavior', 'defaultDateRange', e.target.value)}
                                    className="w-full border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                                >
                                    <option value="TODAY">Today</option>
                                    <option value="TOMORROW">Tomorrow</option>
                                    <option value="WEEK">This Week</option>
                                    <option value="ALL">All Time (Not Recommended)</option>
                                </select>
                                <p className="mt-1 text-xs text-gray-500">Default range if no date is specified in query.</p>
                            </div>

                            <ToggleField
                                label="Station AE Title Mapping"
                                checked={config.worklistBehavior.scheduledStationAETitleMapping}
                                onChange={v => updateField('worklistBehavior', 'scheduledStationAETitleMapping', v)}
                                help="Only return items scheduled for the querying AE Title."
                            />
                            <ToggleField
                                label="Modality Filtering"
                                checked={config.worklistBehavior.modalityFiltering}
                                onChange={v => updateField('worklistBehavior', 'modalityFiltering', v)}
                                help="Filter worklist based on modality type."
                            />
                            <ToggleField
                                label="Strict Patient ID Matching"
                                checked={config.worklistBehavior.strictPatientIdMatching}
                                onChange={v => updateField('worklistBehavior', 'strictPatientIdMatching', v)}
                                help="Require exact match for Patient ID."
                            />
                        </div>
                    </div>
                )}

                {activeTab === 'aetitles' && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center mb-4">
                            <p className="text-sm text-gray-500">Define which modalities are allowed to query this Worklist SCP.</p>
                            <button
                                onClick={addAETitle}
                                className="px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100"
                            >
                                + Add AE Title
                            </button>
                        </div>

                        <div className="overflow-hidden border border-gray-200 rounded-lg">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">AE Title</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">IP Address</th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {config.allowedAETitles.map((ae, idx) => (
                                        <tr key={idx}>
                                            <td className="px-4 py-2">
                                                <input
                                                    type="text"
                                                    value={ae.aeTitle}
                                                    onChange={e => updateAETitle(idx, 'aeTitle', e.target.value)}
                                                    className="w-full border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500"
                                                />
                                            </td>
                                            <td className="px-4 py-2">
                                                <input
                                                    type="text"
                                                    value={ae.description}
                                                    onChange={e => updateAETitle(idx, 'description', e.target.value)}
                                                    className="w-full border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500"
                                                />
                                            </td>
                                            <td className="px-4 py-2">
                                                <input
                                                    type="text"
                                                    value={ae.ip}
                                                    onChange={e => updateAETitle(idx, 'ip', e.target.value)}
                                                    className="w-full border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500"
                                                />
                                            </td>
                                            <td className="px-4 py-2 text-right">
                                                <button
                                                    onClick={() => removeAETitle(idx)}
                                                    className="text-red-600 hover:text-red-800 text-sm font-medium"
                                                >
                                                    Remove
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {config.allowedAETitles.length === 0 && (
                                        <tr>
                                            <td colSpan="4" className="px-4 py-8 text-center text-gray-500 text-sm">
                                                No AE Titles defined. Any AE Title might be rejected depending on security settings.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function TabButton({ id, label, icon, active, onClick }) {
    return (
        <button
            onClick={() => onClick(id)}
            className={`
        flex-1 px-4 py-3 text-sm font-medium text-center transition-colors border-b-2
        ${active === id
                    ? 'border-blue-600 text-blue-600 bg-blue-50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }
      `}
        >
            <span className="mr-2">{icon}</span>
            {label}
        </button>
    );
}

function InputField({ label, value, onChange, type = 'text', help }) {
    return (
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
            <input
                type={type}
                value={value}
                onChange={e => onChange(e.target.value)}
                className="w-full border-gray-300 rounded-lg shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
            {help && <p className="mt-1 text-xs text-gray-500">{help}</p>}
        </div>
    );
}

function ToggleField({ label, checked, onChange, help }) {
    return (
        <div className="flex items-start">
            <div className="flex items-center h-5">
                <input
                    type="checkbox"
                    checked={checked}
                    onChange={e => onChange(e.target.checked)}
                    className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
            </div>
            <div className="ml-3 text-sm">
                <label className="font-medium text-gray-700">{label}</label>
                {help && <p className="text-gray-500">{help}</p>}
            </div>
        </div>
    );
}
