import React, { useState, useEffect } from 'react';
import { 
  DocumentTextIcon, 
  ArrowDownTrayIcon, 
  CreditCardIcon, 
  CheckCircleIcon, 
  ClockIcon,
  ExclamationCircleIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';
import { billingService } from '../../services/billingService';
import { useToast } from '../../components/ToastProvider';

const BillingDashboard = () => {
  const toast = useToast();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    unpaidCount: 0,
    totalDue: 0,
    lastPayment: null
  });

  useEffect(() => {
    loadInvoices();
  }, []);

  const loadInvoices = async () => {
    try {
      setLoading(true);
      const res = await billingService.listInvoices({ limit: 100 });
      const items = res?.items || res || [];
      setInvoices(items);
      
      // Calculate basic stats
      const unpaid = items.filter(inv => inv.status === 'unpaid' || inv.status === 'overdue');
      const totalDue = unpaid.reduce((sum, inv) => sum + (inv.grand_total || 0), 0);
      const paid = items.filter(inv => inv.status === 'paid').sort((a, b) => new Date(b.paid_at) - new Date(a.paid_at));
      
      setStats({
        unpaidCount: unpaid.length,
        totalDue,
        lastPayment: paid.length > 0 ? paid[0] : null
      });
      
      setLoading(false);
    } catch (err) {
      console.error('Failed to load invoices:', err);
      toast.error('Failed to load billing information');
      setLoading(false);
    }
  };

  const formatCurrency = (amount, currency = 'IDR') => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount || 0);
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case 'paid': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'unpaid': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'overdue': return 'bg-rose-100 text-rose-700 border-rose-200';
      default: return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Billing & Invoices</h1>
          <p className="text-slate-600 mt-1">Manage your subscriptions, view history, and download invoices</p>
        </div>
        <button 
          onClick={loadInvoices}
          className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all border border-slate-200 bg-white"
        >
          <ArrowPathIcon className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600">
              <ClockIcon className="h-7 w-7" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Outstanding Balance</p>
              <p className="text-2xl font-bold text-slate-900">{formatCurrency(stats.totalDue)}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
              <CheckCircleIcon className="h-7 w-7" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Last Payment</p>
              <p className="text-lg font-bold text-slate-900">
                {stats.lastPayment ? formatCurrency(stats.lastPayment.grand_total) : 'No payments yet'}
              </p>
              {stats.lastPayment && (
                <p className="text-xs text-slate-400">
                  {new Date(stats.lastPayment.paid_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
              <CreditCardIcon className="h-7 w-7" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Active Invoices</p>
              <p className="text-2xl font-bold text-slate-900">{stats.unpaidCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Invoice Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
          <h2 className="font-bold text-slate-900">Invoice History</h2>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left">
                <th className="px-6 py-3.5 text-xs font-semibold text-slate-600 uppercase">Invoice #</th>
                <th className="px-6 py-3.5 text-xs font-semibold text-slate-600 uppercase">Date</th>
                <th className="px-6 py-3.5 text-xs font-semibold text-slate-600 uppercase">Due Date</th>
                <th className="px-6 py-3.5 text-xs font-semibold text-slate-600 uppercase">Amount</th>
                <th className="px-6 py-3.5 text-xs font-semibold text-slate-600 uppercase">Status</th>
                <th className="px-6 py-3.5 text-right text-xs font-semibold text-slate-600 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <p className="text-slate-500 mt-2">Loading history...</p>
                    </div>
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-slate-400">
                    No invoice history found.
                  </td>
                </tr>
              ) : (
                invoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-mono text-sm font-medium text-slate-900">
                      {invoice.invoice_number}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {new Date(invoice.issue_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {new Date(invoice.due_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-slate-900">
                      {formatCurrency(invoice.grand_total, invoice.currency)}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase ${getStatusStyle(invoice.status)}`}>
                        {invoice.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => window.open(billingService.getInvoicePdfUrl(invoice.id), '_blank')}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1.5 ml-auto text-xs font-bold"
                        title="Download PDF"
                      >
                        <ArrowDownTrayIcon className="h-4 w-4" />
                        PDF
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Help Section */}
      <div className="mt-8 bg-slate-900 rounded-3xl p-8 text-white relative overflow-hidden">
        <div className="relative z-10">
          <h3 className="text-xl font-bold mb-2">Need help with your bill?</h3>
          <p className="text-slate-400 max-w-lg mb-6">
            If you have any questions regarding your invoices, taxes, or want to change your payment method, please contact our support team.
          </p>
          <button className="px-6 py-3 bg-white text-slate-900 rounded-xl font-bold hover:bg-slate-100 transition-colors">
            Contact Support
          </button>
        </div>
        <div className="absolute right-0 bottom-0 opacity-10 translate-x-1/4 translate-y-1/4">
          <DocumentTextIcon className="w-64 h-64 text-white" />
        </div>
      </div>
    </div>
  );
};

export default BillingDashboard;
