import React, { useState, useEffect, useMemo } from 'react';
import { subscriptionService } from '../services/subscriptionService';
import { useToast } from '../components/ToastProvider';
import { 
  PlusIcon, 
  PencilSquareIcon, 
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
  CurrencyDollarIcon,
  UserGroupIcon,
  ServerStackIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';

import FeatureComparison from '../components/Products/FeatureComparison';

export const createDefaultProductFormData = () => ({
  name: '',
  code: '',
  description: '',
  tier: 'free',
  price: 0,
  currency: 'IDR',
  billing_cycle: 'monthly',
  max_users: 5,
  max_storage_gb: 10,
  max_api_calls_per_day: 1000,
  overage_storage_price: 0,
  overage_api_price: 0,
  features: [],
  spec: {},
  color: '#6b7280',
  is_featured: false,
});

const Products = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const toast = useToast();

  const comparisonFeatures = [
    { key: 'max_users', name: 'Max Users', description: 'Number of user accounts allowed' },
    { key: 'max_storage_gb', name: 'Storage (GB)', description: 'Cloud storage capacity for studies' },
    { key: 'max_api_calls_per_day', name: 'Daily API Limit', description: 'Total API requests allowed per 24h' },
    { key: 'dicom_viewer', name: 'Web DICOM Viewer', description: 'Access to integrated study viewer' },
    { key: 'mobile_app', name: 'Mobile App', description: 'Native app for iOS and Android' },
    { key: 'ai_analysis', name: 'AI Insights', description: 'Automated study analysis tools' },
  ];

  const [formData, setFormData] = useState(createDefaultProductFormData);

  const [featureInput, setFeatureInput] = useState('');
  const [specInput, setSpecInput] = useState({ key: '', value: '' });

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const response = await subscriptionService.listProducts(true);
      setProducts(response?.items || []);
      setLoading(false);
    } catch (err) {
      console.error('Failed to load products:', err);
      toast.error('Failed to load products');
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (modalMode === 'create') {
        await subscriptionService.createProduct(formData);
        toast.success('Product created successfully');
      } else {
        await subscriptionService.updateProduct(selectedProduct.id, formData);
        toast.success('Product updated successfully');
      }
      setShowModal(false);
      loadProducts();
    } catch (err) {
      toast.error(err.message || 'Failed to save product');
    }
  };

  const handleDeactivate = async (id) => {
    if (!confirm('Are you sure you want to deactivate this product? It will no longer be available for new subscriptions.')) return;
    try {
      await subscriptionService.deleteProduct(id);
      toast.success('Product deactivated successfully');
      loadProducts();
    } catch (err) {
      console.error('Failed to deactivate product:', err);
      toast.error(err.response?.data?.detail || 'Failed to deactivate product. Check if it is still linked to subscriptions.');
    }
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(val);
  };

  const stats = useMemo(() => {
    const all = products;
    const active = all.filter(p => p.is_active).length;
    const featured = all.filter(p => p.is_featured).length;
    const totalRevenue = all.filter(p => p.is_active).reduce((sum, p) => sum + (p.price || 0), 0);
    return { total: all.length, active, featured, totalRevenue };
  }, [products]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Product Management</h1>
            <p className="text-slate-600 mt-1">Define and manage your SaaS subscription tiers</p>
          </div>
          <button
            onClick={() => {
              setModalMode('create');
              setFormData(createDefaultProductFormData());
              setShowModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all"
          >
            <PlusIcon className="h-5 w-5" />
            Add New Product
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Total Products</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{stats.total}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <SparklesIcon className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Active</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{stats.active}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <CheckCircleIcon className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Featured</p>
              <p className="text-2xl font-bold text-purple-600 mt-1">{stats.featured}</p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
              <SparklesIcon className="h-6 w-6 text-purple-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Monthly Revenue</p>
              <p className="text-2xl font-bold text-teal-600 mt-1">{formatCurrency(stats.totalRevenue)}</p>
            </div>
            <div className="w-12 h-12 bg-teal-100 rounded-xl flex items-center justify-center">
              <CurrencyDollarIcon className="h-6 w-6 text-teal-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-6 py-4 text-sm font-semibold text-slate-700 uppercase tracking-wider">Product</th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-700 uppercase tracking-wider">Tier/Code</th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-700 uppercase tracking-wider">Pricing</th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-700 uppercase tracking-wider">Limits</th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-700 uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-sm font-semibold text-slate-700 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    <p className="text-slate-500 mt-2">Loading products...</p>
                  </div>
                </td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center">
                  <div className="flex flex-col items-center">
                    <SparklesIcon className="h-12 w-12 text-slate-300" />
                    <p className="text-slate-500 mt-3 font-medium">No products found</p>
                    <p className="text-slate-400 text-sm">Create your first subscription tier to get started</p>
                    <button
                      onClick={() => {
                        setModalMode('create');
                        setFormData(createDefaultProductFormData());
                        setShowModal(true);
                      }}
                      className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Create Product
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              products.map((product) => (
                <tr key={product.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: product.color }} />
                      <div>
                        <div className="font-bold text-slate-900">{product.name}</div>
                        <div className="text-xs text-slate-500 truncate max-w-xs">{product.description}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-slate-700 uppercase">{product.tier}</span>
                      <span className="text-xs text-slate-400 font-mono">{product.code}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-bold text-slate-900">{formatCurrency(product.price)}</div>
                    <div className="text-xs text-slate-500 capitalize">{product.billing_cycle}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-xs space-y-0.5 text-slate-600">
                      <div>Users: {product.max_users || '∞'}</div>
                      <div>Storage: {product.max_storage_gb || '∞'} GB</div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {product.is_active ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                        Inactive
                      </span>
                    )}
                    {product.is_featured && (
                      <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                        Featured
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button 
                        onClick={() => {
                          setSelectedProduct(product);
                          setModalMode('edit');
                          setFormData({ ...product });
                          setShowModal(true);
                        }}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                      >
                        <PencilSquareIcon className="h-5 w-5" />
                      </button>
                      <button 
                        onClick={() => handleDeactivate(product.id)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Feature Comparison Matrix */}
      <div className="mt-12">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-slate-900">Feature Comparison Matrix</h2>
          <p className="text-sm text-slate-500 mt-1">Detailed breakdown of features across all active subscription tiers</p>
        </div>
        <FeatureComparison 
          products={products.filter(p => p.is_active)} 
          features={comparisonFeatures} 
        />
      </div>
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 bg-slate-50 border-b flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-800">
                {modalMode === 'create' ? 'Create New Product' : `Edit: ${selectedProduct?.name}`}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <XCircleIcon className="h-7 w-7" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Product Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Internal Code</label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toLowerCase() })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                    required
                    disabled={modalMode === 'edit'}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-20"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Tier</label>
                  <select
                    value={formData.tier}
                    onChange={(e) => setFormData({ ...formData, tier: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="free">Free</option>
                    <option value="basic">Basic</option>
                    <option value="professional">Professional</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Price (IDR)</label>
                  <input
                    type="number"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Billing Cycle</label>
                  <select
                    value={formData.billing_cycle}
                    onChange={(e) => setFormData({ ...formData, billing_cycle: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                    <option value="one-time">One-time</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Max Users</label>
                  <input
                    type="number"
                    value={formData.max_users || ''}
                    onChange={(e) => setFormData({ ...formData, max_users: e.target.value ? parseInt(e.target.value) : null })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="Unlimited"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Max Storage (GB)</label>
                  <input
                    type="number"
                    value={formData.max_storage_gb || ''}
                    onChange={(e) => setFormData({ ...formData, max_storage_gb: e.target.value ? parseInt(e.target.value) : null })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="Unlimited"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">API Limit / Day</label>
                  <input
                    type="number"
                    value={formData.max_api_calls_per_day || ''}
                    onChange={(e) => setFormData({ ...formData, max_api_calls_per_day: e.target.value ? parseInt(e.target.value) : null })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="Unlimited"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 p-4 bg-amber-50 rounded-lg border border-amber-100">
                <div>
                  <label className="block text-xs font-bold text-amber-600 uppercase mb-1">Overage Storage Price (per GB)</label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-amber-700">Rp</span>
                    <input
                      type="number"
                      value={formData.overage_storage_price || 0}
                      onChange={(e) => setFormData({ ...formData, overage_storage_price: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-amber-600 uppercase mb-1">Overage API Price (per 1k calls)</label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-amber-700">Rp</span>
                    <input
                      type="number"
                      value={formData.overage_api_price || 0}
                      onChange={(e) => setFormData({ ...formData, overage_api_price: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Specifications</label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      placeholder="Key"
                      value={specInput.key}
                      onChange={(e) => setSpecInput({ ...specInput, key: e.target.value })}
                      className="flex-1 px-3 py-1.5 border rounded-lg text-sm"
                    />
                    <input
                      type="text"
                      placeholder="Value"
                      value={specInput.value}
                      onChange={(e) => setSpecInput({ ...specInput, value: e.target.value })}
                      className="flex-1 px-3 py-1.5 border rounded-lg text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (specInput.key && specInput.value) {
                          setFormData({ ...formData, spec: { ...formData.spec, [specInput.key]: specInput.value } });
                          setSpecInput({ key: '', value: '' });
                        }
                      }}
                      className="px-3 py-1.5 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors"
                    >
                      Add
                    </button>
                  </div>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {Object.entries(formData.spec || {}).map(([key, value]) => (
                      <div key={key} className="flex justify-between items-center bg-slate-50 px-2 py-1 rounded border text-xs">
                        <span><span className="font-bold">{key}:</span> {String(value)}</span>
                        <button type="button" onClick={() => {
                          const n = { ...formData.spec }; delete n[key]; setFormData({ ...formData, spec: n });
                        }} className="text-red-500 hover:font-bold">×</button>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Features List</label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      placeholder="Feature name..."
                      value={featureInput}
                      onChange={(e) => setFeatureInput(e.target.value)}
                      className="flex-1 px-3 py-1.5 border rounded-lg text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (featureInput.trim()) {
                          setFormData({ ...formData, features: [...formData.features, featureInput.trim()] });
                          setFeatureInput('');
                        }
                      }}
                      className="px-3 py-1.5 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors"
                    >
                      Add
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                    {formData.features.map((f, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-100 rounded text-[10px]">
                        {f}
                        <button type="button" onClick={() => setFormData({ ...formData, features: formData.features.filter((_, idx) => idx !== i) })}>×</button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-6 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-lg shadow-blue-200"
                >
                  {modalMode === 'create' ? 'Create Product' : 'Update Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Products;
