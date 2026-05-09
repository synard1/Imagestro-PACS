import { useEffect, useMemo, useState } from 'react'
import useCountUp from '../hooks/useCountUp'
import useScrollAnimation from '../hooks/useScrollAnimation'
import { useTranslation } from 'react-i18next'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import LoadingScreen from '../components/LoadingScreen'
import { getDashboardSummary, downloadDashboardCsv } from '../services/dashboardService'
import { getConfigSync } from '../services/config'

export default function Dashboard() {
  const { t } = useTranslation()

  const STATUS_OPTIONS = [
    { value: 'scheduled', label: t('Scheduled') },
    { value: 'in_progress', label: t('In Progress') },
    { value: 'completed', label: t('Completed_status') },
    { value: 'cancelled', label: t('Cancelled') },
  ]

  const PRIORITY_OPTIONS = [
    { value: 'all', label: t('All Priorities') },
    { value: 'stat', label: t('STAT / Emergency') },
    { value: 'urgent', label: t('Urgent') },
    { value: 'routine', label: t('Routine') },
  ]

  const STATUS_COLORS = {
    scheduled: '#94a3b8',
    in_progress: '#3b82f6',
    completed: '#10b981',
    cancelled: '#ef4444',
    default: '#cbd5e1'
  }

  const PRIORITY_COLORS = {
    stat: 'bg-red-500',
    urgent: 'bg-amber-500',
    routine: 'bg-blue-500',
    all: 'bg-slate-400'
  }

  const ISSUE_COLORS = {
    critical: 'bg-red-50 border-red-100 text-red-700',
    warning: 'bg-amber-50 border-amber-100 text-amber-700',
    info: 'bg-blue-50 border-blue-100 text-blue-700'
  }

  const initialFilterState = () => ({
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    modality: 'all',
    priority: 'all',
    statuses: ['scheduled', 'in_progress', 'completed']
  })

  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modalities, setModalities] = useState(['all'])
  const [pendingFilters, setPendingFilters] = useState(initialFilterState())
  const [appliedFilters, setAppliedFilters] = useState(initialFilterState())
  const [filterError, setFilterError] = useState(null)

  const humanizeLabel = (str = '') => {
    if (!str) return ''
    return str.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  useEffect(() => {
    const cfg = getConfigSync()
    const list = cfg?.modalities?.length ? cfg.modalities : ['US', 'CT', 'MR', 'CR', 'XA']
    setModalities(['all', ...list])
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadReport() {
      setLoading(true)
      setError(null)
      try {
        const data = await getDashboardSummary(appliedFilters)
        if (!cancelled) {
          setReport(data)
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Unable to load dashboard data')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadReport()
    return () => { cancelled = true }
  }, [appliedFilters])

  const totals = report?.totals || {
    orders: 0,
    completed: 0,
    inProgress: 0,
    scheduled: 0,
    averageTurnaroundHours: 0,
    averageWaitHours: 0
  }

  const trendData = report?.trends || []
  const statusData = report?.statusBreakdown || []
  const modalityData = (report?.modalityPerformance || report?.modalityBreakdown || []).map(m => ({
    name: m.modality || m.name,
    count: m.orders || m.count,
    completed: m.completed
  }))

  const handleFieldChange = (field, value) => {
    setPendingFilters(prev => ({ ...prev, [field]: value }))
  }

  const toggleStatus = (value) => {
    setPendingFilters(prev => {
      const exists = prev.statuses.includes(value)
      return {
        ...prev,
        statuses: exists
          ? prev.statuses.filter(s => s !== value)
          : [...prev.statuses, value]
      }
    })
  }

  const applyFilters = () => {
    const start = new Date(pendingFilters.startDate)
    const end = new Date(pendingFilters.endDate)
    if (start > end) {
      setFilterError('Start date must be before end date')
      return
    }
    setFilterError(null)
    setAppliedFilters({ ...pendingFilters })
  }

  const resetFilters = () => {
    const fresh = initialFilterState()
    setPendingFilters(fresh)
    setAppliedFilters(fresh)
    setFilterError(null)
  }

  const appliedStatusBadges = useMemo(() => {
    if (!appliedFilters.statuses.length) {
      return 'All statuses'
    }
    return appliedFilters.statuses.map(humanizeLabel).join(', ')
  }, [appliedFilters.statuses])

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">{t('Operational Dashboard')}</h1>
          <p className="text-sm text-slate-600">
            {t('Range')}: {appliedFilters.startDate} &rarr; {appliedFilters.endDate} · {appliedStatusBadges === 'All statuses' ? t('All statuses') : appliedStatusBadges}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            onClick={() => setAppliedFilters({ ...appliedFilters })}
            disabled={loading}
            title={t('Refresh dashboard data')}
          >
            <span>{loading ? '⟳' : '↻'}</span>
            {loading ? t('Refreshing...') : t('Refresh')}
          </button>
          {report && (
            <button
              className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => downloadDashboardCsv(report)}
              disabled={loading}
            >
              {t('Export CSV')}
            </button>
          )}
        </div>
      </div>

      <div className="card space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <FilterField label={t('Start Date')}>
            <input
              type="date"
              value={pendingFilters.startDate}
              className="input"
              onChange={e => handleFieldChange('startDate', e.target.value)}
            />
          </FilterField>
          <FilterField label={t('End Date')}>
            <input
              type="date"
              value={pendingFilters.endDate}
              className="input"
              onChange={e => handleFieldChange('endDate', e.target.value)}
            />
          </FilterField>
          <FilterField label={t('Modality')}>
            <select
              className="input"
              value={pendingFilters.modality}
              onChange={e => handleFieldChange('modality', e.target.value)}
            >
              {modalities.map(mod => (
                <option key={mod} value={mod}>{mod === 'all' ? t('All Modalities') : mod}</option>
              ))}
            </select>
          </FilterField>
          <FilterField label={t('Priority')}>
            <select
              className="input"
              value={pendingFilters.priority}
              onChange={e => handleFieldChange('priority', e.target.value)}
            >
              {PRIORITY_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </FilterField>
        </div>
        <div>
          <div className="text-xs font-semibold text-slate-500 mb-2">{t('Statuses')}</div>
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map(opt => {
              const active = pendingFilters.statuses.includes(opt.value)
              return (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => toggleStatus(opt.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-colors duration-150 ${active ? 'bg-slate-800 text-white border-slate-800 hover:bg-slate-700' : 'border-slate-300 text-slate-600 hover:border-slate-400 hover:text-slate-800'}`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>
        {filterError && (
          <div className="text-sm text-red-500">{t(filterError)}</div>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50" onClick={resetFilters} disabled={loading}>
            {t('Reset')}
          </button>
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed" onClick={applyFilters} disabled={loading}>
            {t('Apply Filters')}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 border border-red-200 bg-red-50 text-sm text-red-600 rounded-lg">
          {t(error)}
        </div>
      )}

      {report && (
        <>
          <KpiSection totals={totals} satusehat={report.satusehat} loading={loading} t={t} />
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="card xl:col-span-2">
              <SectionHeader title={t('Orders & Completion Trend')} subtitle={t('Daily created vs completed vs synced')} />
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData}>
                    <defs>
                      <linearGradient id="trendCreated" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="trendCompleted" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="trendSynced" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                    <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                    <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Area dataKey="created" type="monotone" stroke="#2563eb" strokeWidth={2} fill="url(#trendCreated)" name={t('Created')} />
                    <Area dataKey="completed" type="monotone" stroke="#16a34a" strokeWidth={2} fill="url(#trendCompleted)" name={t('Completed')} />
                    <Area dataKey="synced" type="monotone" stroke="#4f46e5" strokeWidth={2} fill="url(#trendSynced)" name={t('Synced')} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="card">
              <SectionHeader title={t('Status Breakdown')} subtitle={t('Distribution by workflow state')} />
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statusData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="status" tickFormatter={(v) => t(humanizeLabel(v))} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                    <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                    <Tooltip formatter={(value) => [value, t('Orders')]} labelFormatter={(v) => t(humanizeLabel(v))} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {statusData.map((item, idx) => (
                        <Cell key={idx} fill={STATUS_COLORS[item.status] || STATUS_COLORS.default} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card">
              <SectionHeader title={t('Modality Performance')} subtitle={t('Orders vs completions')} />
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={modalityData} layout="vertical" margin={{ left: 32 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                    <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="count" name={t('Orders')} fill="#0ea5e9" />
                    <Bar dataKey="completed" name={t('Completed')} fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="card">
              <SectionHeader title={t('Priority Distribution')} subtitle={t('Operational urgency mix')} />
              <div className="space-y-3">
                {(report.priorityBreakdown || []).map(item => (
                  <div key={item.priority} className="flex items-center gap-3">
                    <div className="w-28 text-sm text-slate-600 capitalize">{t(humanizeLabel(item.priority))}</div>
                    <div className="flex-1 bg-slate-100 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.all}`}
                        style={{ width: `${Math.min(100, Math.round((item.count / Math.max(1, report.totals.orders)) * 100))}%` }}
                      />
                    </div>
                    <div className="w-12 text-right text-sm font-semibold">{item.count}</div>
                  </div>
                ))}
                {(!report.priorityBreakdown || report.priorityBreakdown.length === 0) && (
                  <div className="text-sm text-slate-500">{t('No priority data available.')}</div>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="card">
              <SectionHeader title={t('Doctor Performance')} subtitle={t('Top referring physicians')} />
              <div className="overflow-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('Doctor')}</th>
                      <th>{t('Orders')}</th>
                      <th>{t('Completed')}</th>
                      <th>{t('Completion Rate')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(report.doctorPerformance || []).map(doc => (
                      <tr key={doc.name}>
                        <td>{doc.name}</td>
                        <td>{doc.orders}</td>
                        <td>{doc.completed}</td>
                        <td>{doc.completionRate ?? 0}%</td>
                      </tr>
                    ))}
                    {(!report.doctorPerformance || report.doctorPerformance.length === 0) && (
                      <tr>
                        <td colSpan={4} className="text-center text-sm text-slate-500 py-6">
                          {t('No doctor performance data for this range.')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="card">
              <SectionHeader title={t('Operational Alerts')} subtitle={t('Bottlenecks to review')} />
              <div className="space-y-3">
                {(report.bottlenecks || []).map((issue, idx) => (
                  <div key={`${issue.label}-${idx}`} className={`px-3 py-2 rounded-lg text-sm flex items-center justify-between ${ISSUE_COLORS[issue.severity] || ISSUE_COLORS.info}`}>
                    <span>{t(issue.label)}</span>
                    <span className="font-semibold">{issue.count}</span>
                  </div>
                ))}
                {(!report.bottlenecks || report.bottlenecks.length === 0) && (
                  <div className="text-sm text-slate-500">{t('No bottlenecks detected for the selected range.')}</div>
                )}
              </div>
            </div>
          </div>

          <div className="card">
            <SectionHeader title={t('Longest Pending Orders')} subtitle={t('Monitor aging work items')} />
            <div className="overflow-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('Accession')}</th>
                    <th>{t('Patient')}</th>
                    <th>{t('Modality')}</th>
                    <th>{t('Status')}</th>
                    <th>{t('Scheduled')}</th>
                    <th>{t('Waiting (hrs)')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(report.longRunningOrders || []).map(item => (
                    <tr key={item.id}>
                      <td className="font-mono text-xs">{item.accession || '—'}</td>
                      <td>{item.patient}</td>
                      <td>{item.modality}</td>
                      <td className="capitalize">{t(humanizeLabel(item.status))}</td>
                      <td className="text-xs text-slate-500">{new Date(item.scheduledAt).toLocaleString()}</td>
                      <td className="font-semibold">{item.waitingHours}</td>
                    </tr>
                  ))}
                  {(!report.longRunningOrders || report.longRunningOrders.length === 0) && (
                    <tr>
                      <td colSpan={6} className="text-center text-sm text-slate-500 py-6">
                        {t('No pending orders exceeded the threshold for this range.')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function AnimatedKpiCard({ card, loading, delay }) {
  const ref = useScrollAnimation()
  const count = useCountUp(card.value, 1200)

  return (
    <div
      ref={ref}
      className="card reveal-on-scroll animate-fade-in-up stagger-item"
      style={{ '--stagger-delay': `${delay}ms` }}
    >
      <div className="text-sm text-slate-500">{card.label}</div>
      <div className="text-2xl font-semibold tabular-nums">
        {loading ? (
          <span className="inline-block w-16 h-6 shimmer-loading rounded" />
        ) : (
          count.toLocaleString()
        )}
      </div>
      <div className="text-xs text-slate-400 mt-1">{card.hint}</div>
    </div>
  )
}

function FilterField({ label, children }) {
  return (
    <label className="text-sm font-medium text-slate-600 flex flex-col gap-1">
      <span>{label}</span>
      {children}
    </label>
  )
}

function SectionHeader({ title, subtitle }) {
  return (
    <div className="mb-3">
      <div className="text-base font-semibold">{title}</div>
      {subtitle && <div className="text-xs text-slate-500">{subtitle}</div>}
    </div>
  )
}

function KpiSection({ totals, satusehat, loading, t }) {
  const cards = [
    { label: t('Total Orders'), value: totals.orders, hint: t('All records in range') },
    { label: t('Completed'), value: totals.completed, hint: t('Finished workflows') },
    { label: t('In Progress'), value: totals.inProgress, hint: t('Active queue') },
    { label: t('Scheduled'), value: totals.scheduled, hint: t('Upcoming exams') },
  ]
  const satTotal = Math.max(1,
    (satusehat?.synced ?? 0) +
    (satusehat?.pending ?? 0) +
    (satusehat?.failed ?? 0)
  )

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {cards.map((card, idx) => (
        <AnimatedKpiCard key={card.label} card={card} loading={loading} delay={idx * 90} />
      ))}
      <div className="card md:col-span-2 xl:col-span-1">
        <div className="text-sm text-slate-500 mb-2">{t('SatuSehat Sync')}</div>
        <div className="space-y-2">
          <SyncRow label={t('Synced')} value={satusehat?.synced ?? 0} total={satTotal} color="bg-emerald-500/80" t={t} />
          <SyncRow label={t('Pending')} value={satusehat?.pending ?? 0} total={satTotal} color="bg-amber-500/80" t={t} />
          <SyncRow label={t('Failed')} value={satusehat?.failed ?? 0} total={satTotal} color="bg-red-500/80" t={t} />
        </div>
      </div>
      <div className="card md:col-span-2 xl:col-span-1">
        <div className="text-sm text-slate-500">{t('Operational Metrics')}</div>
        <div className="text-xs text-slate-400 mb-2">{t('Turnaround vs Waiting time')}</div>
        <div className="space-y-2">
          <MetricRow label={t('Avg Turnaround')} value={`${totals.averageTurnaroundHours || 0} h`} />
          <MetricRow label={t('Avg Waiting')} value={`${totals.averageWaitHours || 0} h`} />
        </div>
      </div>
    </div>
  )
}

function SyncRow({ label, value, total, color, t }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-16 text-slate-500">{label}</span>
      <div className="flex-1 bg-slate-100 rounded-full h-2">
        <div
          className={`h-2 rounded-full ${color}`}
          style={{ width: `${Math.min(100, Math.round((value / total) * 100))}%` }}
        ></div>
      </div>
      <span className="w-10 text-right font-semibold">{value}</span>
    </div>
  )
}

function MetricRow({ label, value }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  )
}
