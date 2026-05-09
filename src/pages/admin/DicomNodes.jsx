import React, { useState, useEffect, useCallback } from 'react';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  Activity, 
  RefreshCw, 
  Building2,
  Play,
  Square
} from 'lucide-react';
import { dicomNodeService } from '../../services/dicomNodeService';
import { tenantService } from '../../services/tenantService';
import { useConfirm } from '../../components/ConfirmDialog';
import { useToast } from '../../components/ToastProvider';
import DataTable from '../../components/common/DataTable';

const DicomNodes = () => {
  const toast = useToast();
  const { confirmDanger } = useConfirm();

  const [tenants, setTenants] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingNode, setEditingNode] = useState(null);
  const [testingNode, setTestingNode] = useState(null);
  const [deployingNode, setDeployingNode] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const [formData, setFormData] = useState({
    name: '',
    ae_title: '',
    host: '',
    port: 11112,
    node_type: 'PACS',
    modality: '',
    hospital_id: '',
    description: '',
    max_pdu_length: 16384,
    timeout: 30,
    supports_c_store: true,
    supports_c_find: true,
    supports_c_move: true,
    supports_c_echo: true,
    is_active: true
  });

  useEffect(() => {
    loadTenants();
  }, []);

  const loadTenants = async () => {
    try {
      const data = await tenantService.listTenants();
      setTenants(data.items || data || []);
    } catch (err) {
      console.error('Failed to load tenants:', err);
    }
  };

  const fetchData = async ({ search }) => {
    const data = await dicomNodeService.listNodes();
    let result = Array.isArray(data) ? data : [];
    
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(n => 
        n.name?.toLowerCase().includes(q) ||
        n.ae_title?.toLowerCase().includes(q) ||
        n.host?.toLowerCase().includes(q) ||
        n.hospital_name?.toLowerCase().includes(q)
      );
    }
    
    return { items: result, total: result.length };
  };

  const handleRefresh = () => setRefreshTrigger(prev => prev + 1);

  const testConnection = async (node) => {
    setTestingNode(node.id);
    try {
      const result = await dicomNodeService.testNodeConnection(node.id);
      if (result.success) {
        toast.success(`Connection to ${node.ae_title} successful`, { 
          detail: `Response time: ${result.response_time_ms?.toFixed(2)}ms` 
        });
      } else {
        toast.error(`Connection to ${node.ae_title} failed`, { detail: result.message });
      }
      handleRefresh();
    } catch (error) {
      toast.error('Connection test failed', { detail: error.message });
    } finally {
      setTestingNode(null);
    }
  };

  const handleDeploy = async (node) => {
    setDeployingNode(node.id);
    try {
      await dicomNodeService.deployNode(node.id);
      toast.success(`Deployment for ${node.ae_title} initiated`);
      handleRefresh();
    } catch (error) {
      toast.error('Deployment failed', { detail: error.message });
    } finally {
      setDeployingNode(null);
    }
  };

  const handleDestroy = async (node) => {
    if (!await confirmDanger(`Destroy container for ${node.ae_title}?`)) return;
    setDeployingNode(node.id);
    try {
      await dicomNodeService.destroyNode(node.id);
      toast.success(`Container for ${node.ae_title} destroyed`);
      handleRefresh();
    } catch (error) {
      toast.error('Failed to destroy container', { detail: error.message });
    } finally {
      setDeployingNode(null);
    }
  };

  const handleDelete = async (node) => {
    if (!await confirmDanger(`Delete node ${node.ae_title}?`)) return;
    try {
      await dicomNodeService.deleteNode(node.id);
      toast.success('Node deleted successfully');
      handleRefresh();
    } catch (error) {
      toast.error('Failed to delete node', { detail: error.message });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingNode) {
        await dicomNodeService.updateNode(editingNode.id, formData);
        toast.success('Node updated successfully');
      } else {
        await dicomNodeService.createNode(formData);
        toast.success('Node created successfully');
      }
      setShowForm(false);
      handleRefresh();
    } catch (error) {
      toast.error('Failed to save node', { detail: error.message });
    }
  };

  const columns = [
    { 
      key: 'name', 
      label: 'Node', 
      sortable: true,
      render: (val, row) => (
        <div>
          <div className="font-medium text-gray-900">{val}</div>
          <div className="text-xs text-gray-500 font-mono">{row.ae_title}</div>
        </div>
      )
    },
    { 
      key: 'node_type', 
      label: 'Type',
      render: (val, row) => (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
          val === 'tenant' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
        }`}>
          {val} {row.modality && `(${row.modality})`}
        </span>
      )
    },
    { 
      key: 'host', 
      label: 'Address',
      render: (val, row) => <span className="font-mono text-xs">{val}:{row.port}</span>
    },
    {
      key: 'hospital_name',
      label: 'Tenant',
      render: (val) => val || <span className="text-gray-400 italic">Unassigned</span>
    },
    {
      key: 'stats',
      label: 'Statistics',
      render: (_, row) => (
        <div className="text-xs space-y-0.5">
          <div className="flex justify-between gap-4">
            <span className="text-gray-500">Success:</span>
            <span className="font-mono text-emerald-600 font-bold">{row.total_success || 0}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-gray-500">Failed:</span>
            <span className="font-mono text-rose-600 font-bold">{row.total_failed || 0}</span>
          </div>
        </div>
      )
    },
    {
      key: 'is_online',
      label: 'Status',
      render: (val) => (
        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
          val ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-800'
        }`}>
          <div className={`w-1.5 h-1.5 rounded-full ${val ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
          {val ? 'ONLINE' : 'OFFLINE'}
        </span>
      )
    }
  ];

  const tableActions = (node) => (
    <div className="flex items-center justify-end gap-1">
      {node.node_type === 'tenant' && (
        <button
          onClick={(e) => { e.stopPropagation(); node.is_online ? handleDestroy(node) : handleDeploy(node); }}
          disabled={deployingNode === node.id}
          className={`p-1.5 rounded-lg transition-colors ${
            node.is_online ? 'text-amber-600 hover:bg-amber-50' : 'text-emerald-600 hover:bg-emerald-50'
          }`}
          title={node.is_online ? 'Stop Container' : 'Start Container'}
        >
          {deployingNode === node.id ? <RefreshCw size={16} className="animate-spin" /> : (node.is_online ? <Square size={16} /> : <Play size={16} />)}
        </button>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); testConnection(node); }}
        disabled={testingNode === node.id}
        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"
        title="Test C-ECHO"
      >
        <Activity size={16} className={testingNode === node.id ? 'animate-pulse' : ''} />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); setEditingNode(node); setFormData({...node}); setShowForm(true); }}
        className="p-1.5 text-slate-600 hover:bg-slate-50 rounded-lg"
        title="Edit"
      >
        <Edit2 size={16} />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); handleDelete(node); }}
        className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg"
        title="Delete"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">DICOM Nodes</h1>
        <p className="text-sm text-gray-500">Manage DICOM entities and tenant-specific routers</p>
      </div>

      <DataTable
        key={refreshTrigger}
        columns={columns}
        fetchData={fetchData}
        actions={tableActions}
        searchPlaceholder="Search by name, AET, host..."
        extraActions={
          <button
            onClick={() => { setEditingNode(null); setShowForm(true); }}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm transition-all text-sm font-medium ml-2"
          >
            <Plus size={18} className="mr-2" />
            Add Node
          </button>
        }
      />

      {showForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
              <h2 className="text-lg font-bold">{editingNode ? 'Edit DICOM Node' : 'Add New DICOM Node'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                <Plus size={24} className="rotate-45" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">AE Title</label>
                  <input
                    type="text"
                    required
                    value={formData.ae_title}
                    onChange={e => setFormData({...formData, ae_title: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Node Type</label>
                  <select
                    value={formData.node_type}
                    onChange={e => setFormData({...formData, node_type: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="PACS">PACS</option>
                    <option value="MODALITY">Modality</option>
                    <option value="WORKSTATION">Workstation</option>
                    <option value="tenant">Tenant (Auto-Deployed)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Host / IP</label>
                  <input
                    type="text"
                    required
                    value={formData.host}
                    onChange={e => setFormData({...formData, host: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
                  <input
                    type="number"
                    required
                    value={formData.port}
                    onChange={e => setFormData({...formData, port: parseInt(e.target.value)})}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Assign Tenant</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Building2 className="h-4 w-4 text-gray-400" />
                    </div>
                    <select
                      value={formData.hospital_id || ''}
                      onChange={e => setFormData({...formData, hospital_id: e.target.value})}
                      className="w-full pl-10 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="">No Tenant Assigned</option>
                      {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm transition-all"
                >
                  {editingNode ? 'Update Node' : 'Create Node'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DicomNodes;
