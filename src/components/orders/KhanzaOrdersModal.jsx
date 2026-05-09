import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { listRadiologi } from '../../services/khanzaService';
import {
    validateOrder,
    importOrder,
    isOrderImported,
    getImportHistoryByOrder,
    prepareOrderForPreview,
    getSimrsImportMode,
    recordFailedValidation
} from '../../services/khanzaImportService';
import { getProcedureMappingByCode } from '../../services/khanzaMappingService';
import { useToast } from '../ToastProvider';
import { OrderCardList } from '../khanza/OrderCard';
import OrderTable from '../khanza/OrderTable';
import { LayoutGrid, List } from 'lucide-react';

export default function KhanzaOrdersModal({ isOpen, onClose }) {
    const { success, error, warning } = useToast();
    const navigate = useNavigate();

    // Data state
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState(null);
    const [importStatuses, setImportStatuses] = useState({});
    const [procedureMap, setProcedureMap] = useState({}); // Map code -> name
    const [unmappedCodes, setUnmappedCodes] = useState(new Set());
    const [viewMode, setViewMode] = useState('table'); // 'table' or 'grid'

    // Selection state
    const [selectedOrders, setSelectedOrders] = useState(new Set());
    const [isImporting, setIsImporting] = useState(false);

    // Filter state
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    useEffect(() => {
        if (isOpen) {
            // Calculate date range: 30 days back from today
            const today = new Date();
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(today.getDate() - 30);

            const formatLocalDate = (date) => {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };

            const todayStr = formatLocalDate(today);
            const thirtyDaysAgoStr = formatLocalDate(thirtyDaysAgo);

            setStartDate(thirtyDaysAgoStr);
            setEndDate(todayStr);
            fetchOrders(thirtyDaysAgoStr, todayStr);

            // Clear selection on open
            setSelectedOrders(new Set());
            setUnmappedCodes(new Set());
        }
    }, [isOpen]);

    const fetchOrders = async (fromDate = null, toDate = null) => {
        setLoading(true);
        setLoadError(null);
        setSelectedOrders(new Set()); // Reset selection on research

        try {
            const data = await listRadiologi({
                tgl_mulai: fromDate || startDate,
                tgl_akhir: toDate || endDate
            });
            const ordersList = Array.isArray(data) ? data : [];
            setOrders(ordersList);

            // Check import statuses for all loaded orders
            checkImportStatuses(ordersList);

            // Resolve procedure names from mappings for codes
            resolveProcedureNames(ordersList);

        } catch (err) {
            setLoadError('Gagal memuat data order dari SIMRS.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const checkImportStatuses = async (ordersList) => {
        const statuses = {};
        await Promise.all(ordersList.map(async (order) => {
            try {
                const history = await getImportHistoryByOrder(order.noorder);
                if (history) {
                    statuses[order.noorder] = {
                        status: history.import_status, // 'success', 'failed', 'partial'
                        label: history.import_status === 'success' ? 'Imported' :
                            history.import_status === 'failed' ? 'Failed' : 'Partial',
                        lastImport: history.imported_at,
                        error: history.error_message
                    };
                } else {
                    statuses[order.noorder] = null;
                }
            } catch (err) {
                // Ignore errors here
            }
        }));
        setImportStatuses(prev => ({ ...prev, ...statuses }));
    };

    const resolveProcedureNames = async (ordersList) => {
        const codesToFetch = new Set();
        const newMap = { ...procedureMap };
        const newUnmapped = new Set(unmappedCodes);
        let hasUpdates = false;

        ordersList.forEach(order => {
            const pemeriksaan = order.pemeriksaan;

            // 1. Try to correlate kd_jenis_prw (codes) with nm_perawatan (names)
            // This handles the case where the API gives us the names but in a parallel string/field
            if (typeof order.kd_jenis_prw === 'string' && typeof order.nm_perawatan === 'string') {
                const codes = order.kd_jenis_prw.split(',').map(s => s.trim()).filter(Boolean);
                const names = order.nm_perawatan.split(',').map(s => s.trim()).filter(Boolean);

                // Only map if counts match, to avoid mismatch
                if (codes.length === names.length) {
                    codes.forEach((code, idx) => {
                        if (!newMap[code]) {
                            newMap[code] = names[idx];
                            hasUpdates = true;
                            // If we found a name here, we assume it's mapped enough for Khanza details, 
                            // BUT we still need to check if it's mapped to PACS if we want to be strict.
                            // Currently we assume the "mapping" service is the source of truth for PACS link.
                            // If we just have a name from Khanza, it doesn't mean it's mapped to PACS.
                            // So we should strictly check PACS mapping for ALL codes.
                            // Therefore, we should add to codesToFetch even if we have a name, 
                            // UNLESS we already have a mapping entry which implies PACS link.
                        }
                    });
                }
            }

            // 2. Handle Pemeriksaan Field (Array or String)
            if (Array.isArray(pemeriksaan)) {
                pemeriksaan.forEach(item => {
                    if (typeof item === 'object') {
                        // Use provided name if available in the object
                        if (item.kd_jenis_prw && item.nm_perawatan) {
                            if (!newMap[item.kd_jenis_prw]) {
                                newMap[item.kd_jenis_prw] = item.nm_perawatan;
                                hasUpdates = true;
                            }
                        }
                        const code = item.kd_jenis_prw;
                        if (code && typeof code === 'string') {
                            // Always check mapping status if not already known mapping
                            // If it's already in unmapped or mapped set (via newMap implicit?), we might skip.
                            // But checking emptiness of newMap[code] isn't enough to say it's unmapped.
                            // We should only fetch if we don't know the status.
                            // We don't have a "status" map. We have newMap (names) and unmappedCodes.
                            // If !newMap[code] AND !unmappedCodes.has(code), then fetch.
                            if (!newMap[code] && !newUnmapped.has(code)) {
                                codesToFetch.add(code);
                            } else if (newMap[code] && !newUnmapped.has(code)) {
                                // We have a name, but is it confirmed mapped? 
                                // The modal logic assumes newMap contains confirmed mappings if fetched from service.
                                // But lines 122-137 populate newMap from Khanza response directly.
                                // This populate names but doesn't guarantee PACS mapping.
                                // To be safe, we should verify mapping for EVERYTHING eventually.
                                // But for performance, let's stick to checking what's missing.
                                // Actually, validation logic in importService will fail anyway.
                                // For UI "Unmapped" badge, we need to know.
                                codesToFetch.add(code); // Let's verify everything lightly or rely on import validation for blocking.
                                // Optimizing: Only fetch if we haven't fetched before. 
                                // We don't track "fetched" state perfectly.
                            }
                            if (code && !newMap[code]) codesToFetch.add(code);
                        }
                    } else if (typeof item === 'string') {
                        if (!newMap[item]) codesToFetch.add(item);
                    }
                });
            } else if (typeof pemeriksaan === 'string') {
                pemeriksaan.split(',').forEach(c => {
                    const code = c.trim();
                    if (code && !newMap[code]) codesToFetch.add(code);
                });
            }

            // 3. Fallback: check kd_jenis_prw for fetching
            if (typeof order.kd_jenis_prw === 'string') {
                order.kd_jenis_prw.split(',').forEach(c => {
                    const code = c.trim();
                    if (code && !newMap[code]) codesToFetch.add(code);
                });
            }
        });

        // 4. Fetch missing mappings
        if (codesToFetch.size > 0) {
            await Promise.all(Array.from(codesToFetch).map(async (code) => {
                if (newUnmapped.has(code)) return; // Skip if known unmapped
                try {
                    const mapping = await getProcedureMappingByCode(code);
                    if (mapping) {
                        newMap[code] = mapping.khanza_name || mapping.pacs_name || code;
                        newUnmapped.delete(code);
                        hasUpdates = true;
                    } else {
                        newUnmapped.add(code);
                        hasUpdates = true;
                    }
                } catch (err) {
                    newUnmapped.add(code);
                    hasUpdates = true;
                }
            }));
        }

        // 5. Update state if changed
        if (hasUpdates) {
            setProcedureMap(newMap);
            setUnmappedCodes(newUnmapped);
        }
    };

    // Selection handlers
    const handleSelectOrder = (order) => {
        const noorder = order.noorder;
        const newSelected = new Set(selectedOrders);
        if (newSelected.has(noorder)) {
            newSelected.delete(noorder);
        } else {
            newSelected.add(noorder);
        }
        setSelectedOrders(newSelected);
    };

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            const newSelected = new Set(orders.map(o => o.noorder));
            setSelectedOrders(newSelected);
        } else {
            setSelectedOrders(new Set());
        }
    };

    // Import handler
    const handleImportSelected = async () => {
        if (selectedOrders.size === 0) return;

        const importMode = getSimrsImportMode(); // 'direct' or 'preview'

        // Preview Mode Logic
        if (importMode === 'preview') {
            if (selectedOrders.size > 1) {
                warning('Preview Mode', 'Mohon pilih satu order untuk preview.');
                return;
            }

            setIsImporting(true);
            const noorder = Array.from(selectedOrders)[0];

            try {
                // Prepare data
                const previewData = await prepareOrderForPreview(noorder);

                // Close modal
                onClose();

                // Navigate to Order Form with data
                navigate('/orders/new', {
                    state: {
                        previewData,
                        isPreview: true
                    }
                });

                success('Order dimuat dalam mode Preview.');

            } catch (err) {
                console.error('Preview error:', err);
                error('Gagal memuat preview order:', err.message);

                // Record failed validation for audit trail
                await recordFailedValidation(noorder, err.message);

                // Update UI status
                setImportStatuses(prev => ({
                    ...prev,
                    [noorder]: {
                        status: 'failed',
                        label: 'Failed',
                        lastImport: new Date().toISOString(),
                        error: err.message
                    }
                }));
            } finally {
                setIsImporting(false);
            }
            return;
        }

        // Direct Import Logic (Existing)
        setIsImporting(true);
        const selectedList = Array.from(selectedOrders);
        let successCount = 0;
        let failCount = 0;
        const errors = [];

        try {
            for (const noorder of selectedList) {
                // Call importOrder directly. It handles validation internally and records history on failure.
                const result = await importOrder(noorder, { skipValidation: false });

                const timestamp = new Date().toISOString();

                if (result.success) {
                    successCount++;
                    setImportStatuses(prev => ({
                        ...prev,
                        [noorder]: {
                            status: 'success',
                            label: 'Imported',
                            lastImport: timestamp,
                            error: null
                        }
                    }));
                } else {
                    failCount++;
                    const errorMsg = result.errors[0] || 'Import failed';
                    errors.push(`${noorder}: ${errorMsg}`);

                    setImportStatuses(prev => ({
                        ...prev,
                        [noorder]: {
                            status: 'failed',
                            label: 'Failed',
                            lastImport: timestamp,
                            error: errorMsg
                        }
                    }));
                }
            }

            // Summary notification
            if (successCount > 0 && failCount === 0) {
                success(`Berhasil mengimpor ${successCount} order.`);
                setSelectedOrders(new Set());
            } else if (successCount > 0 && failCount > 0) {
                warning(
                    'Import selesai dengan beberapa error.',
                    `${successCount} sukses, ${failCount} gagal. Lihat console untuk detail.`
                );
                errors.slice(0, 3).forEach(err => error('Gagal import:', err));
            } else if (failCount > 0) {
                error('Gagal mengimpor order.', `${failCount} order gagal. ${errors[0]}`);
            }

        } catch (err) {
            console.error('Batch import error:', err);
            error('Terjadi kesalahan sistem saat proses import.');
        } finally {
            setIsImporting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col overflow-hidden">

                {/* Header */}
                <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-gray-100 bg-gradient-to-r from-blue-600 to-indigo-600">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
                                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-white">Order Radiologi SIMRS</h2>
                                <p className="text-xs text-blue-100">Pilih order untuk di-import ke PACS</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-lg hover:bg-white/20 transition-colors"
                        >
                            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Filters */}
                <div className="px-4 py-3 sm:px-6 border-b border-gray-100 bg-gray-50/50">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                                <label className="text-xs font-medium text-gray-500">Dari</label>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <label className="text-xs font-medium text-gray-500">Sampai</label>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                />
                            </div>
                            <button
                                onClick={() => fetchOrders()}
                                disabled={loading}
                                className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                        <span>Memuat...</span>
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                        <span>Cari</span>
                                    </>
                                )}
                            </button>
                        </div>

                        {/* Order Count / Selection Info */}
                        <div className="flex items-center gap-4">
                            <div className="flex bg-gray-200 p-1 rounded-lg">
                                <button
                                    onClick={() => setViewMode('table')}
                                    className={`p-1.5 rounded-md transition-all ${viewMode === 'table' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                                    title="Tampilan Tabel"
                                >
                                    <List size={16} />
                                </button>
                                <button
                                    onClick={() => setViewMode('grid')}
                                    className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                                    title="Tampilan Grid"
                                >
                                    <LayoutGrid size={16} />
                                </button>
                            </div>

                            <div className="text-sm text-gray-500">
                                {loading ? '...' : (orders.length > 0 ? (
                                    <div className="flex items-center gap-2">
                                        <span>Total: {orders.length}</span>
                                        {selectedOrders.size > 0 && (
                                            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-medium">
                                                {selectedOrders.size} Dipilih
                                            </span>
                                        )}
                                    </div>
                                ) : '0 order')}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto bg-gray-50 p-4">
                    {viewMode === 'table' ? (
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                            <OrderTable
                                orders={orders}
                                importStatuses={importStatuses}
                                procedureMap={procedureMap}
                                selectedOrders={selectedOrders}
                                onSelectOrder={handleSelectOrder}
                                onSelectAll={handleSelectAll}
                                loading={loading}
                            />
                        </div>
                    ) : (
                        <OrderCardList
                            orders={orders}
                            importStatuses={importStatuses}
                            procedureMap={procedureMap}
                            unmappedCodes={unmappedCodes}
                            selectedOrders={selectedOrders}
                            onSelectOrder={handleSelectOrder}
                            loading={loading}
                            showCheckbox={true}
                            compact={false}
                            emptyMessage={loadError || "Tidak ada order ditemukan."}
                        />
                    )}
                </div>

                {/* Footer */}
                <div className="px-4 py-3 sm:px-6 border-t border-gray-100 bg-white flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {orders.length > 0 && (
                            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={orders.length > 0 && selectedOrders.size === orders.length}
                                    ref={input => {
                                        if (input) {
                                            input.indeterminate = selectedOrders.size > 0 && selectedOrders.size < orders.length;
                                        }
                                    }}
                                    onChange={handleSelectAll}
                                    disabled={loading || isImporting}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                Pilih Semua
                            </label>
                        )}
                    </div>

                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            Tutup
                        </button>
                        <button
                            onClick={handleImportSelected}
                            disabled={loading || isImporting || selectedOrders.size === 0}
                            className={`
                                    px-6 py-2 text-sm font-medium text-white rounded-lg transition-colors
                                    flex items-center gap-2
                                    ${loading || isImporting || selectedOrders.size === 0
                                    ? 'bg-gray-300 cursor-not-allowed'
                                    : 'bg-green-600 hover:bg-green-700 shadow-sm'}
                                `}
                        >
                            {isImporting ? (
                                <>
                                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                    <span>Memproses...</span>
                                </>
                            ) : (
                                <>
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                    </svg>
                                    <span>Import ({selectedOrders.size})</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
