import React from 'react';
import { api } from '../services/api';
import DataTable from '../components/common/DataTable';
import { format } from 'date-fns';

export default function AuditLogs() {
  const columns = [
    { 
      key: 'time', 
      label: 'Time', 
      sortable: true,
      render: (val) => val ? format(new Date(val), 'yyyy-MM-dd HH:mm:ss') : "-"
    },
    { key: 'user', label: 'User', sortable: true },
    { key: 'action', label: 'Action', sortable: true },
    { key: 'entity', label: 'Entity', sortable: true },
    { 
      key: 'entity_id', 
      label: 'Entity ID', 
      sortable: false,
      render: (val) => <span className="font-mono text-xs">{val}</span>
    }
  ];

  const fetchAuditLogs = async ({ page, limit, search, filters, sort }) => {
    // Note: Adjust API call based on what listAuditLogs supports
    // For now using the existing implementation and filtering locally if needed
    // Ideally the backend should support these params
    const allLogs = await api.listAuditLogs();
    
    // Simple client-side search/filter/sort for now until backend catch up
    let result = Array.isArray(allLogs) ? allLogs : [];
    
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(log => 
        log.user?.toLowerCase().includes(q) ||
        log.action?.toLowerCase().includes(q) ||
        log.entity?.toLowerCase().includes(q) ||
        log.entity_id?.toLowerCase().includes(q)
      );
    }

    if (sort.key) {
      result.sort((a, b) => {
        const aVal = a[sort.key] || "";
        const bVal = b[sort.key] || "";
        return sort.direction === 'asc' 
          ? (aVal > bVal ? 1 : -1)
          : (aVal < bVal ? 1 : -1);
      });
    }

    const total = result.length;
    const items = result.slice((page - 1) * limit, page * limit);

    return { items, total };
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
      </div>

      <DataTable
        columns={columns}
        fetchData={fetchAuditLogs}
        searchPlaceholder="Search logs..."
        defaultPageSize={20}
      />
    </div>
  );
}
