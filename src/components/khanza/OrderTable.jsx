import React from 'react';
import ImportStatusBadge from './ImportStatusBadge';

/**
 * OrderTable Component
 * 
 * Displays a list of Khanza orders in a table format.
 * 
 * @param {Object} props
 * @param {Array} props.orders - List of orders
 * @param {Object} props.importStatuses - Status of imports for each order
 * @param {Object} props.procedureMap - Map of procedure codes to names
 * @param {Set} props.unmappedCodes - Set of unmapped procedure codes
 * @param {Set} props.selectedOrders - Set of selected order numbers
 * @param {Function} props.onSelectOrder - Handler for row selection
 * @param {Function} props.onSelectAll - Handler for select all
 * @param {boolean} props.loading - Loading state
 */
export default function OrderTable({
    orders,
    importStatuses,
    procedureMap,
    unmappedCodes,
    selectedOrders,
    onSelectOrder,
    onSelectAll,
    loading
}) {
    if (loading) {
        return (
            <div className="p-8 text-center text-gray-500">
                <svg className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <p>Memuat data order...</p>
            </div>
        );
    }

    if (!orders || orders.length === 0) {
        return (
            <div className="p-12 text-center text-gray-500 bg-white rounded-lg border border-gray-200 m-4">
                <p className="text-lg font-medium">Tidak ada data order</p>
                <p className="text-sm">Silakan pilih rentang tanggal lain.</p>
            </div>
        );
    }

    const allSelected = orders.length > 0 && selectedOrders.size === orders.length;
    const indeterminate = selectedOrders.size > 0 && selectedOrders.size < orders.length;

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th scope="col" className="px-3 py-2 text-left">
                            <div className="flex items-center">
                                <input
                                    type="checkbox"
                                    checked={allSelected}
                                    ref={input => { if (input) input.indeterminate = indeterminate; }}
                                    onChange={onSelectAll}
                                    className="h-3.5 w-3.5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                />
                            </div>
                        </th>
                        <th scope="col" className="px-3 py-2 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                            Order Info
                        </th>
                        <th scope="col" className="px-3 py-2 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                            Pasien
                        </th>
                        <th scope="col" className="px-3 py-2 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                            Pemeriksaan
                        </th>
                        <th scope="col" className="px-3 py-2 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                            Dokter Pengirim
                        </th>
                        <th scope="col" className="px-3 py-2 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                            Status
                        </th>
                        <th scope="col" className="px-3 py-2 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                            Terakhir Import
                        </th>
                        <th scope="col" className="px-3 py-2 text-left text-[11px] font-medium text-gray-500 uppercase tracking-wider">
                            Keterangan
                        </th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {orders.map((order) => {
                        const noorder = order.order_number || order.noorder;
                        const isSelected = selectedOrders.has(noorder);
                        const statusObj = importStatuses[noorder];
                        const importStatus = statusObj ? { status: statusObj.status, label: statusObj.label } : null;

                        // Standardized accessors
                        const patientName = order.patient_name || order.nm_pasien;
                        const mrn = order.mrn || order.no_rkm_medis;
                        const doctorName = order.doctor_name || order.nm_dokter;
                        const visitNumber = order.visit_number || order.no_rawat;

                        // Standardized Procedure Accessor
                        const examinations = order.examinations || order.pemeriksaan || [];
                        const examList = Array.isArray(examinations) ? examinations : [examinations];

                        const renderedProcedures = examList.map((exam, idx) => {
                            const code = typeof exam === 'object' ? (exam.procedure_code || exam.kd_jenis_prw) : null;
                            const name = typeof exam === 'object' 
                                ? (exam.procedure_name || exam.nm_perawatan || exam.nm_tindakan || procedureMap[code]) 
                                : exam;
                            const accession = typeof exam === 'object' ? exam.accession_number : null;
                            
                            const isUnmapped = code && unmappedCodes?.has(code);
                            
                            return (
                                <div key={idx} className="mb-1 last:mb-0">
                                    <div className={`text-xs ${isUnmapped ? 'text-red-500 font-medium' : 'text-gray-900'}`}>
                                        {name || '-'} {isUnmapped && '⚠️'}
                                    </div>
                                    {accession && (
                                        <div className="text-[10px] text-gray-500 font-mono">{accession}</div>
                                    )}
                                </div>
                            );
                        });

                        // Format last import date
                        const lastImportDate = statusObj?.lastImport ? new Date(statusObj.lastImport) : null;
                        const lastImportStr = lastImportDate ? lastImportDate.toLocaleString('id-ID', {
                            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                        }) : '-';

                        const errorMessage = statusObj?.error || '-';

                        return (
                            <tr
                                key={noorder}
                                className={`hover:bg-gray-50 transition-colors ${isSelected ? 'bg-blue-50/50' : ''}`}
                                onClick={() => onSelectOrder(order)}
                            >
                                <td className="px-3 py-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => onSelectOrder(order)}
                                        className="h-3.5 w-3.5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                    />
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap">
                                    <div className="font-medium text-sm text-gray-900">{noorder}</div>
                                    <div className="text-[10px] text-gray-600 font-medium">Reg: {visitNumber}</div>
                                    <div className="text-[10px] text-gray-500">
                                        {formatDate(order.tgl_permintaan || order.request_date)}
                                        <span className="mx-1">•</span>
                                        {order.jam_permintaan || order.request_time}
                                    </div>
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap">
                                    <div className="font-medium text-sm text-gray-900">{patientName}</div>
                                    <div className="text-[10px] text-gray-500">{mrn}</div>
                                </td>
                                <td className="px-3 py-2">
                                    <div className="max-w-xs">
                                        {renderedProcedures.length > 0 ? renderedProcedures : '-'}
                                    </div>
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap">
                                    <div className="text-xs text-gray-900">{doctorName || '-'}</div>
                                    <div className="text-[10px] text-gray-500">{order.nm_poli || '-'}</div>
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap">
                                    <ImportStatusBadge importStatus={importStatus} />
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">
                                    {lastImportStr}
                                </td>
                                <td className="px-3 py-2 text-xs text-gray-500 max-w-[200px] truncate" title={errorMessage}>
                                    {statusObj?.status === 'failed' ? (
                                        <span className="text-red-500">{errorMessage}</span>
                                    ) : statusObj?.status === 'success' ? (
                                        <span className="text-green-600">Berhasil import</span>
                                    ) : '-'}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        return date.toLocaleDateString('id-ID', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    } catch {
        return dateStr;
    }
};
