import React, { useState, useEffect } from 'react';
import { subscriptionService } from '../services/subscriptionService';
import { useToast } from '../components/ToastProvider';
import { 
  CheckCircleIcon, 
  ClockIcon, 
  CreditCardIcon, 
  ServerStackIcon, 
  ArrowPathIcon,
  DocumentArrowDownIcon,
  SparklesIcon,
  ExclamationTriangleIcon,
  ShieldExclamationIcon,
  NoSymbolIcon
} from '@heroicons/react/24/outline';
import UsageProgress from '../components/Subscriptions/UsageProgress';
import { Link } from 'react-router-dom';

const MySubscription = () => {
  const [subscription, setSubscription] = useState(null);
  const [usage, setUsage] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [subRes, usageRes, invRes] = await Promise.all([
        subscriptionService.getMySubscription(),
        subscriptionService.getMyUsage(),
        subscriptionService.getMyInvoices()
      ]);
      setSubscription(subRes);
      setUsage(usageRes);
      setInvoices(invRes?.items || []);
      setLoading(false);
    } catch (err) {
      console.error('Failed to load subscription data:', err);
      toast.error('Failed to load subscription data');
      setLoading(false);
    }
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(val);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <ArrowPathIcon className="h-10 w-10 text-blue-600 animate-spin" />
          <p className="text-slate-500 font-medium text-lg">Loading your subscription details...</p>
        </div>
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center">
        <div className="bg-white rounded-3xl shadow-xl border border-slate-200 p-12">
          <SparklesIcon className="h-16 w-16 text-blue-500 mx-auto mb-6" />
          <h2 className="text-2xl font-bold text-slate-900 mb-2">No Active Subscription</h2>
          <p className="text-slate-600 mb-8 max-w-md mx-auto">
            Your organization doesn't have an active subscription plan yet. Contact your system administrator to choose a plan.
          </p>
          <button 
            onClick={() => window.location.href = 'mailto:sales@imagestro.com'}
            className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all"
          >
            Upgrade to Professional
          </button>
        </div>
      </div>
    );
  }

  const product = subscription.product || {};

  const getStatusConfig = (status) => {
    switch (status?.toLowerCase()) {
      case 'active': return { color: 'text-green-600', bg: 'bg-green-100', icon: CheckCircleIcon, label: 'Active' };
      case 'trial': return { color: 'text-blue-600', bg: 'bg-blue-100', icon: SparklesIcon, label: 'Trial Period' };
      case 'past_due': return { color: 'text-amber-600', bg: 'bg-amber-100', icon: ExclamationTriangleIcon, label: 'Past Due' };
      case 'suspended': return { color: 'text-rose-600', bg: 'bg-rose-100', icon: ShieldExclamationIcon, label: 'Suspended' };
      case 'expired': return { color: 'text-slate-600', bg: 'bg-slate-100', icon: NoSymbolIcon, label: 'Expired' };
      default: return { color: 'text-slate-600', bg: 'bg-slate-100', icon: ClockIcon, label: status };
    }
  };

  const statusCfg = getStatusConfig(subscription.status);
  const unpaidInvoices = invoices.filter(inv => inv.status?.toLowerCase() === 'unpaid' || inv.status?.toLowerCase() === 'overdue');

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">My Subscription</h1>
          <p className="text-slate-500 mt-1 flex items-center gap-2">
            Manage your plan, billing, and usage limits
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={loadData}
            className="p-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 shadow-sm"
            title="Refresh Data"
          >
            <ArrowPathIcon className="h-5 w-5" />
          </button>
          <button className="px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all">
            Upgrade Plan
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Plan Card */}
        <div className="lg:col-span-2 space-y-8">
          <section className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
            <div className="p-1 bg-gradient-to-r from-blue-600 to-indigo-600" />
            <div className="p-8">
              <div className="flex items-start justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center border border-blue-100">
                    <SparklesIcon className="h-8 w-8 text-blue-600" />
                  </div>
                  <div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 uppercase tracking-wider">
                      Current Plan
                    </span>
                    <h2 className="text-2xl font-bold text-slate-900 mt-0.5">{product.name || 'Professional Tier'}</h2>
                  </div>
                </div>
                <div className="text-right text-sm">
                  <div className="text-slate-400 font-medium">Status</div>
                  <div className="flex items-center gap-1.5 text-green-600 font-bold uppercase mt-0.5">
                    <CheckCircleIcon className="h-4 w-4" />
                    {subscription.status}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 p-6 bg-slate-50 rounded-2xl border border-slate-100">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pricing</p>
                  <p className="text-lg font-bold text-slate-900 mt-1">{formatCurrency(product.price)}</p>
                  <p className="text-xs text-slate-500 capitalize italic">/{product.billing_cycle}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Started On</p>
                  <p className="text-sm font-bold text-slate-900 mt-1">{formatDate(subscription.started_at)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Next Renewal</p>
                  <p className="text-sm font-bold text-slate-900 mt-1">{formatDate(subscription.expires_at)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Auto-Renew</p>
                  <p className="text-sm font-bold text-slate-900 mt-1 flex items-center gap-1.5">
                    {subscription.auto_renew ? (
                      <span className="text-blue-600">Enabled</span>
                    ) : (
                      <span className="text-amber-500">Disabled</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="mt-8">
                <h3 className="text-sm font-bold text-slate-800 mb-4">Included Features</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(product.features || []).map((f, i) => (
                    <div key={i} className="flex items-center gap-3 text-sm text-slate-600 bg-slate-50/50 p-3 rounded-xl border border-slate-50">
                      <CheckCircleIcon className="h-5 w-5 text-blue-500 flex-shrink-0" />
                      <span className="capitalize">{f.replace(/_/g, ' ')}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Usage Stats Section */}
          <section className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8">
            <div className="flex items-center gap-3 mb-8">
              <ServerStackIcon className="h-6 w-6 text-blue-600" />
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">Resource Usage</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <UsageProgress 
                label="Cloud Storage" 
                current={usage?.storage_bytes || 0} 
                max={(usage?.storage_limit_gb || 200) * 1024 * 1024 * 1024} 
                unit="GB" 
              />
              <UsageProgress 
                label="API Calls (Daily)" 
                current={usage?.api_calls_today || 0} 
                max={usage?.api_limit_per_day || 20000} 
                unit="req" 
              />
            </div>
          </section>
        </div>

        {/* Sidebar: Invoices & Quick Actions */}
        <div className="space-y-8">
          <section className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden flex flex-col h-full">
            <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
              <div className="flex items-center gap-2.5">
                <CreditCardIcon className="h-5 w-5 text-blue-600" />
                <h2 className="font-bold text-slate-900">Billing History</h2>
              </div>
              <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-md">{invoices.length}</span>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              {invoices.length === 0 ? (
                <div className="p-12 text-center flex flex-col items-center">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                    <ClockIcon className="h-8 w-8 text-slate-300" />
                  </div>
                  <p className="text-slate-400 text-sm font-medium">No invoices available</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {invoices.map((inv) => (
                    <div key={inv.id} className="p-6 hover:bg-slate-50 transition-colors group">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-0.5">{inv.invoice_number}</p>
                          <p className="text-sm font-bold text-slate-900">{formatCurrency(inv.amount)}</p>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          inv.status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {inv.status}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-slate-500 font-medium">{formatDate(inv.issued_at)}</p>
                        <button className="text-blue-600 hover:text-blue-800 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <DocumentArrowDownIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-6 bg-slate-50/50 border-t border-slate-100">
              <button className="w-full py-3 text-sm font-bold text-slate-600 hover:text-blue-600 flex items-center justify-center gap-2 transition-colors">
                View Detailed Billing Portal
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default MySubscription;
