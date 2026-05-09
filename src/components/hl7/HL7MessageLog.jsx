import React, { useState, useEffect } from 'react';
import { getHL7Messages, retryMessage } from '../../services/hl7Service';

export default function HL7MessageLog() {
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedMsg, setSelectedMsg] = useState(null);
    const [filter, setFilter] = useState('ALL'); // ALL, ACK, NACK

    const loadMessages = async () => {
        setLoading(true);
        try {
            const result = await getHL7Messages({ status: filter === 'ALL' ? null : filter });
            setMessages(result.data || []);
        } catch (error) {
            console.error('Failed to load messages:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadMessages();
    }, [filter]);

    const handleRetry = async (id) => {
        await retryMessage(id);
        loadMessages();
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Message Log</h3>
                <div className="flex gap-2">
                    <select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="border border-gray-300 rounded-lg px-3 py-1 text-sm"
                    >
                        <option value="ALL">All Statuses</option>
                        <option value="ACK">Success (ACK)</option>
                        <option value="NACK">Failed (NACK)</option>
                    </select>
                    <button
                        onClick={loadMessages}
                        className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
                    >
                        Refresh
                    </button>
                </div>
            </div>

            <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Control ID</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sender</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {loading ? (
                            <tr><td colSpan="6" className="px-4 py-8 text-center text-gray-500">Loading messages...</td></tr>
                        ) : messages.length === 0 ? (
                            <tr><td colSpan="6" className="px-4 py-8 text-center text-gray-500">No messages found</td></tr>
                        ) : (
                            messages.map((msg) => (
                                <tr key={msg.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedMsg(msg)}>
                                    <td className="px-4 py-3 text-sm text-gray-900">
                                        {new Date(msg.timestamp).toLocaleTimeString()}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-900 font-mono">{msg.type}</td>
                                    <td className="px-4 py-3 text-sm text-gray-500 font-mono">{msg.controlId}</td>
                                    <td className="px-4 py-3 text-sm text-gray-900">{msg.sender}</td>
                                    <td className="px-4 py-3 text-sm">
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${msg.status === 'ACK' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                            }`}>
                                            {msg.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm">
                                        {msg.status === 'NACK' && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleRetry(msg.id); }}
                                                className="text-blue-600 hover:text-blue-800"
                                            >
                                                Retry
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Message Detail Modal */}
            {selectedMsg && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] flex flex-col">
                        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                            <h3 className="text-lg font-bold">Message Details</h3>
                            <button onClick={() => setSelectedMsg(null)} className="text-gray-500 hover:text-gray-700">✕</button>
                        </div>
                        <div className="p-4 overflow-y-auto flex-1 space-y-4">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div><span className="text-gray-500">ID:</span> {selectedMsg.id}</div>
                                <div><span className="text-gray-500">Time:</span> {new Date(selectedMsg.timestamp).toLocaleString()}</div>
                                <div><span className="text-gray-500">Type:</span> {selectedMsg.type}</div>
                                <div><span className="text-gray-500">Status:</span> {selectedMsg.status}</div>
                            </div>

                            {selectedMsg.errorMessage && (
                                <div className="p-3 bg-red-50 text-red-700 rounded border border-red-200 text-sm">
                                    <strong>Error:</strong> {selectedMsg.errorMessage}
                                </div>
                            )}

                            <div>
                                <h4 className="text-sm font-semibold mb-2">Raw Content</h4>
                                <pre className="bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto text-xs font-mono whitespace-pre-wrap">
                                    {selectedMsg.rawContent.replace(/\r/g, '\n')}
                                </pre>
                            </div>
                        </div>
                        <div className="p-4 border-t border-gray-200 text-right">
                            <button
                                onClick={() => setSelectedMsg(null)}
                                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
